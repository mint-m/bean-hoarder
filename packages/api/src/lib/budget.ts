// R2 비용 백스톱 — 서비스 전역 물리적 상한.
// Cloudflare R2는 자동 지출 상한을 제공하지 않는다(대시보드 예산은 "알림"일 뿐 서비스를 멈추지
// 않음). 따라서 요금 폭탄을 실제로 막는 유일한 방법은 여기서 R2 쓰기를 거부하는 것이다.
// 두 축으로 막는다:
//   1) 월간 쓰기(Class A) 예산 — r2_usage.write_count. 무료 티어(100만/월) 아래에서 차단.
//   2) 스토리지 상한 — R2 백드 로고 오브젝트 총 개수 × 최대 100KB(LOGO_MAX_LEN). 무료 10GB 아래로 유지.
// 상한에 걸려도 과금은 전혀 없다(무료 티어 자체가 그 지점까지 $0) — 값은 "청구가 시작되기 한참
// 전에 조기 경보를 울리는" 지점으로 잡았다. 정상적인 개인/소규모 사용 트래픽으로는 도달할 일이
// 없는, 명백한 이상 신호(버그·오남용) 수준의 여유를 둔다.
// 계정 단위 제한은 두지 않는다(설계 결정: 전역 백스톱만). DELETE는 R2에서 무과금이며 스토리지를
// 되돌리므로 예산에 세지 않고 막지도 않는다 — 한도에 걸려도 사용자는 삭제로 공간을 비울 수 있다.
//
// 쓰기 예산은 reserveWrite()가 "판정 = 기록"을 하나의 원자적 UPSERT(RETURNING)로 묶는다 —
// 동시 요청이 몰려도 상한을 정확히 지킨다(체크-후-기록 사이 TOCTOU 레이스 없음). R2.put이
// 예약 후 실패하면 releaseWrite로 되돌린다.
// 스토리지 상한(overStorageCap)은 전역 집계(count(*))라 완전한 원자화를 하려면 D1 기록을
// R2.put보다 앞으로 당겨야 하는데, 그러면 R2.put이 실패했을 때 "D1엔 있는데 R2엔 없는" 깨진
// 참조가 남는다(지금의 "R2 성공 후에만 D1 기록" 불변식이 깨짐) — 그래서 best-effort 체크로
// 남겨둔다. 스토리지 카운트는 실시간 count(*)라 로고 삭제 시 즉시 자연 치유되고, 레이스로 한도를
// 살짝 넘겨도 오브젝트당 최대 100KB라 스토리지비 영향은 무시할 수준이라 감수 가능한 트레이드오프다.
import { and, count, eq, ne, sql } from "drizzle-orm";
import type { Db } from "../db";
import { schema } from "../db";

/** R2 put/월 상한 (무료 100만의 10% — 청구가 시작되는 지점까지 10배 여유). 초과 시 로고 쓰기 차단. */
export let MONTHLY_WRITE_BUDGET = 100_000;
/** R2 저장 로고 총 개수 상한 (×100KB ≈ 2GB, 무료 10GB의 20%). 신규 오브젝트 생성만 막음. */
export let MAX_R2_LOGO_OBJECTS = 20_000;

/** 테스트 전용 — 상한값을 일시적으로 낮춰 경계 케이스를 대량 데이터 없이 검증한다. */
export function setLimitsForTesting(limits: {
  monthlyWriteBudget?: number;
  maxR2LogoObjects?: number;
}): void {
  if (limits.monthlyWriteBudget !== undefined) MONTHLY_WRITE_BUDGET = limits.monthlyWriteBudget;
  if (limits.maxR2LogoObjects !== undefined) MAX_R2_LOGO_OBJECTS = limits.maxR2LogoObjects;
}

export const R2_BUDGET_ERROR =
  "로고 저장이 일시 중단되었습니다 — 서비스 사용량 한도에 도달했습니다. 잠시 후 다시 시도하세요.";

/** 집계 월 키 'YYYY-MM' (UTC). */
function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/**
 * R2 쓰기 1회를 원자적으로 예약한다 — 월이 지났으면 카운터를 리셋하며 시작.
 * 증가와 상한 판정을 하나의 UPSERT(RETURNING)로 묶어, 동시 요청이 몰려도 정확히
 * MONTHLY_WRITE_BUDGET 건까지만 통과시킨다(별도 SELECT 후 별도 UPDATE로 나뉘어 있던
 * 기존 구조는 두 요청이 같은 값을 읽고 둘 다 통과하는 TOCTOU 레이스가 있었다).
 * 예산을 초과시켰다면 이 호출이 늘린 만큼 즉시 되돌리고 false를 반환한다 — 호출자는
 * false를 받으면 R2에 쓰면 안 된다.
 */
export async function reserveWrite(db: Db): Promise<boolean> {
  const month = currentMonth();
  const row = await db.get<{ write_count: number }>(sql`
    INSERT INTO r2_usage (id, month, write_count) VALUES ('global', ${month}, 1)
    ON CONFLICT(id) DO UPDATE SET
      write_count = CASE WHEN month = ${month} THEN write_count + 1 ELSE 1 END,
      month = ${month}
    RETURNING write_count
  `);
  if ((row?.write_count ?? 1) > MONTHLY_WRITE_BUDGET) {
    await releaseWrite(db);
    return false;
  }
  return true;
}

/** reserveWrite로 예약한 쓰기 1건을 취소한다 — 예산 초과 판정 시, 또는 예약 후 R2 저장 자체가 실패했을 때. */
export async function releaseWrite(db: Db): Promise<void> {
  await db.run(sql`
    UPDATE r2_usage SET write_count = write_count - 1
    WHERE id = 'global' AND month = ${currentMonth()} AND write_count > 0
  `);
}

/**
 * 이 저장이 R2 오브젝트 총 개수 상한을 넘기는지 (best-effort — 파일 상단 설명 참고).
 * 이미 R2에 있는 키를 덮어쓰는 경우는 순증이 없으므로 통과시킨다(사용자가 로고를 갱신할 수 있어야 함).
 * 신규 R2 오브젝트(새 로스터리 또는 레거시 인라인 행의 lazy 이전)만 전역 개수 상한으로 막는다.
 */
export async function overStorageCap(db: Db, usercode: string, roastery: string): Promise<boolean> {
  const existing = await db
    .select({ content_type: schema.logos.content_type })
    .from(schema.logos)
    .where(and(eq(schema.logos.usercode, usercode), eq(schema.logos.roastery, roastery)))
    .get();
  if (existing && existing.content_type !== "") return false; // 기존 R2 키 덮어쓰기 → 순증 없음
  const row = await db
    .select({ n: count() })
    .from(schema.logos)
    .where(ne(schema.logos.content_type, ""))
    .get();
  return (row?.n ?? 0) >= MAX_R2_LOGO_OBJECTS;
}
