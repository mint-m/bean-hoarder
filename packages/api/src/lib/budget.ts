// R2 비용 백스톱 — 서비스 전역 물리적 상한.
// Cloudflare R2는 자동 지출 상한을 제공하지 않는다(대시보드 예산은 "알림"일 뿐 서비스를 멈추지
// 않음). 따라서 요금 폭탄을 실제로 막는 유일한 방법은 여기서 R2 쓰기를 거부하는 것이다.
// 두 축으로 막는다:
//   1) 월간 쓰기(Class A) 예산 — r2_usage.write_count. 무료 티어(100만/월) 훨씬 아래에서 차단.
//   2) 스토리지 상한 — R2 백드 로고 오브젝트 총 개수 × 최대 100KB(LOGO_MAX_LEN). 무료 10GB 아래로 유지.
// 값은 초대제 소규모 실사용 대비 넉넉한 추정치 — 정상 사용은 이 근처에도 오지 않는다.
// 계정 단위 제한은 두지 않는다(설계 결정: 전역 백스톱만). DELETE는 R2에서 무과금이며 스토리지를
// 되돌리므로 예산에 세지 않고 막지도 않는다 — 한도에 걸려도 사용자는 삭제로 공간을 비울 수 있다.
import { eq, sql } from "drizzle-orm";
import type { Db } from "../db";
import { schema } from "../db";

/** R2 put/월 상한 (무료 100만의 1% — 정상 사용의 100배+ 여유). 초과 시 로고 쓰기 차단. */
export const MONTHLY_WRITE_BUDGET = 10_000;
/** R2 저장 로고 총 개수 상한 (×100KB ≈ 500MB, 무료 10GB의 5%). 신규 오브젝트 생성만 막음. */
export const MAX_R2_LOGO_OBJECTS = 5_000;

export const R2_BUDGET_ERROR =
  "로고 저장이 일시 중단되었습니다 — 서비스 사용량 한도에 도달했습니다. 잠시 후 다시 시도하세요.";

/** 집계 월 키 'YYYY-MM' (UTC). */
function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/** 이번 달 R2 쓰기 예산을 이미 초과했는지 (월이 바뀌었으면 리셋되므로 미초과). */
export async function overWriteBudget(db: Db): Promise<boolean> {
  const row = await db
    .select({ month: schema.r2Usage.month, write_count: schema.r2Usage.write_count })
    .from(schema.r2Usage)
    .where(eq(schema.r2Usage.id, "global"))
    .get();
  if (!row || row.month !== currentMonth()) return false;
  return row.write_count >= MONTHLY_WRITE_BUDGET;
}

/**
 * 이 저장이 R2 오브젝트 총 개수 상한을 넘기는지.
 * 이미 R2에 있는 키를 덮어쓰는 경우는 순증이 없으므로 통과시킨다(사용자가 로고를 갱신할 수 있어야 함).
 * 신규 R2 오브젝트(새 로스터리 또는 레거시 인라인 행의 lazy 이전)만 전역 개수 상한으로 막는다.
 */
export async function overStorageCap(db: Db, usercode: string, roastery: string): Promise<boolean> {
  const existing = await db
    .select({ content_type: schema.logos.content_type })
    .from(schema.logos)
    .where(sql`${schema.logos.usercode} = ${usercode} AND ${schema.logos.roastery} = ${roastery}`)
    .get();
  if (existing && existing.content_type !== "") return false; // 기존 R2 키 덮어쓰기 → 순증 없음
  const row = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.logos)
    .where(sql`${schema.logos.content_type} != ''`)
    .get();
  return (row?.n ?? 0) >= MAX_R2_LOGO_OBJECTS;
}

/** R2 쓰기 1회 기록 — 월이 지났으면 카운터를 리셋하며 시작(원자적 upsert). */
export async function recordWrite(db: Db): Promise<void> {
  const month = currentMonth();
  await db.run(sql`
    INSERT INTO r2_usage (id, month, write_count) VALUES ('global', ${month}, 1)
    ON CONFLICT(id) DO UPDATE SET
      write_count = CASE WHEN month = ${month} THEN write_count + 1 ELSE 1 END,
      month = ${month}
  `);
}
