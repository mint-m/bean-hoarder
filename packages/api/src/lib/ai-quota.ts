// AI 인식 할당량 — 서비스 키로 대신 호출해 주는 몫에만 건다.
//
// 왜 서비스 키를 두는가: 대부분의 사용자는 Google AI 키를 발급받지 않는다. 그러면 규칙 기반
// 파서만 돌아 인식률이 낮고, "AI 자동 채우기"라는 이 서비스의 핵심 편의가 사실상 없는 것이 된다.
// 그래서 키가 없어도 하루 몇 번은 AI로 채워 주고, 더 쓰려면 본인 키를 넣게 한다.
//
// 두 축으로 막는다 (budget.ts의 R2 백스톱과 같은 사고방식):
//   1) 계정별 하루 — 한 사람의 정상 사용 범위
//   2) 전역 하루   — 한 계정이 서비스 하루치를 독식하지 못하게. 운영자 키는 무료 등급이라
//      한도를 넘겨도 과금이 아니라 Google이 거절할 뿐이지만, 그러면 그날 모두가 못 쓰게 된다.
//      상한에 먼저 걸리게 해 "누가 다 썼는지 모르게 조용히 죽는" 상황을 피한다.
//
// 본인 키를 넣은 사용자는 브라우저에서 Google로 직접 나가므로 이 카운터를 지나가지 않는다 —
// 제한도 없고, 서비스 할당량을 축내지도 않는다.
import { and, eq, gt, sql } from "drizzle-orm";
import type { Db } from "../db";
import { schema } from "../db";

/** 계정별 하루 한도 (서비스 키로 대신 호출해 주는 횟수). */
export let DAILY_PER_ACCOUNT = 10;
/** 서비스 전역 하루 한도. */
export let DAILY_GLOBAL = 100;

/** 테스트 전용 — 경계 케이스를 100번 호출하지 않고 검증하기 위한 조정 창구. */
export function setAiQuotaForTest(perAccount: number, global: number): () => void {
  const prev = [DAILY_PER_ACCOUNT, DAILY_GLOBAL] as const;
  DAILY_PER_ACCOUNT = perAccount;
  DAILY_GLOBAL = global;
  return () => {
    DAILY_PER_ACCOUNT = prev[0];
    DAILY_GLOBAL = prev[1];
  };
}

export const AI_QUOTA_ERROR =
  "오늘 쓸 수 있는 AI 인식을 다 썼습니다. 설정에서 본인 키를 넣으면 제한 없이 쓸 수 있어요.";

/**
 * 1회 사용을 예약한다 — "판정 = 기록"을 원자적 UPSERT로 묶어 동시 요청에서도 한도를 지킨다
 * (체크 후 기록 사이의 TOCTOU 레이스 없음. ratelimit.ts와 같은 방식).
 * 날짜가 바뀌면 카운터가 스스로 리셋된다.
 *
 * @returns 허용되면 남은 횟수, 한도를 넘었으면 null
 */
export async function reserveAiCall(db: Db, usercode: string): Promise<number | null> {
  // 하루 경계는 D1의 시계(UTC)를 따른다 — datetime('now')와 같은 기준이어야 리셋이 어긋나지 않는다.
  const nextReset = sql.raw("datetime('now', '+1 day', 'start of day')");

  async function bump(bucket: string): Promise<number> {
    // reset_at이 지났으면 1로 시작, 아니면 +1. RETURNING으로 확정된 값을 그대로 돌려받는다.
    const row = await db.get<{ count: number }>(sql`
      INSERT INTO ai_usage (bucket, count, reset_at) VALUES (${bucket}, 1, ${nextReset})
      ON CONFLICT(bucket) DO UPDATE SET
        count = CASE WHEN reset_at <= datetime('now') THEN 1 ELSE count + 1 END,
        reset_at = CASE WHEN reset_at <= datetime('now') THEN ${nextReset} ELSE reset_at END
      RETURNING count
    `);
    return row?.count ?? Number.MAX_SAFE_INTEGER; // 값을 못 받으면 보수적으로 "초과"로 본다
  }

  const acctCount = await bump(accountBucket(usercode));
  if (acctCount > DAILY_PER_ACCOUNT) return null;

  const globalCount = await bump(globalBucket());
  if (globalCount > DAILY_GLOBAL) return null;

  return DAILY_PER_ACCOUNT - acctCount;
}

/** UTC 날짜 — D1의 date('now')와 같은 기준으로 버킷 키를 만든다 */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}
const accountBucket = (usercode: string) => `acct:${usercode}:${today()}`;
const globalBucket = () => `global:${today()}`;

/** 호출이 실패했을 때 예약을 되돌린다 — 우리 잘못으로 사용자 몫을 깎지 않는다. */
export async function releaseAiCall(db: Db, usercode: string): Promise<void> {
  await db.run(sql`
    UPDATE ai_usage SET count = MAX(count - 1, 0)
    WHERE bucket IN (${globalBucket()}, ${accountBucket(usercode)})
  `);
}

/** 남은 횟수 조회 (표시용) — 없으면 한도 전체가 남은 것. */
export async function remainingAiCalls(db: Db, usercode: string): Promise<number> {
  const row = await db
    .select({ count: schema.aiUsage.count })
    .from(schema.aiUsage)
    .where(
      and(
        eq(schema.aiUsage.bucket, accountBucket(usercode)),
        gt(schema.aiUsage.reset_at, sql`datetime('now')`),
      ),
    )
    .get();
  return Math.max(DAILY_PER_ACCOUNT - (row?.count ?? 0), 0);
}
