// D1 기반 고정 윈도우 rate limit — 인증 실패 시도에만 사용한다.
// Workers Rate Limiting binding은 Pages Functions에서 지원되지 않아 D1 카운터로 구현.
// 정확한 슬라이딩 윈도우가 아니어도 무차별 대입(4자리 PIN 전수 시도) 차단 목적엔 충분하다.
import { and, eq, gt, sql } from "drizzle-orm";
import type { Db } from "../db";
import { schema } from "../db";

export const AUTH_WINDOW_SEC = 600; // 10분
export const PW_BUCKET_LIMIT = 10; // 유저코드당 실패 10회/10분
export const IP_BUCKET_LIMIT = 30; // IP당 실패 30회/10분

export function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") || "unknown";
}

/** 윈도우 내 실패 횟수가 한도를 넘었는지 (읽기 전용, 단일 쿼리 — 만료 판정은 SQL에서) */
export async function isRateLimited(db: Db, bucket: string, limit: number): Promise<boolean> {
  const row = await db
    .select({ count: schema.authAttempts.count })
    .from(schema.authAttempts)
    .where(
      and(eq(schema.authAttempts.bucket, bucket), gt(schema.authAttempts.reset_at, sql`datetime('now')`)),
    )
    .get();
  return !!row && row.count >= limit;
}

/** 실패 1회 기록 — 윈도우가 지났으면 카운터를 리셋하며 시작 */
export async function recordFailure(db: Db, bucket: string): Promise<void> {
  const windowExpr = sql.raw(`datetime('now', '+${AUTH_WINDOW_SEC} seconds')`);
  await db.run(sql`
    INSERT INTO auth_attempts (bucket, count, reset_at) VALUES (${bucket}, 1, ${windowExpr})
    ON CONFLICT(bucket) DO UPDATE SET
      count = CASE WHEN reset_at <= datetime('now') THEN 1 ELSE count + 1 END,
      reset_at = CASE WHEN reset_at <= datetime('now') THEN ${windowExpr} ELSE reset_at END
  `);
}

export const RATE_LIMIT_ERROR = "시도가 너무 많습니다. 잠시 후 다시 시도하세요.";
