// D1 기반 고정 윈도우 rate limit — 인증 시도(로그인·초대코드·복구키·관리 잠금)와 열린 가입에 쓴다.
// 판정과 기록은 언제나 **한 문장**(reserveAttempt의 UPSERT … RETURNING)이다. "읽어서 검사 → 검증 →
// 실패면 기록"으로 나누면 동시에 보낸 요청이 전부 검사를 통과해 한도가 없는 것과 같아진다 — 그래서
// 검사만 하는 함수를 두지 않는다. 맞힌 시도는 releaseAttempt로 돌려준다.
// Workers Rate Limiting binding은 Pages Functions에서 지원되지 않아 D1 카운터로 구현.
// 정확한 슬라이딩 윈도우가 아니어도 무차별 대입(4자리 PIN 전수 시도) 차단 목적엔 충분하다.
import { sql } from "drizzle-orm";
import type { Db } from "../db";

export const AUTH_WINDOW_SEC = 600; // 10분
export const PW_BUCKET_LIMIT = 10; // 유저코드당 실패 10회/10분
export const IP_BUCKET_LIMIT = 30; // IP당 실패 30회/10분
/**
 * "누구나" 가입 모드의 IP당 **성공** 가입 한도(10분). 초대코드 모드에선 코드가 문턱이었지만 열린 모드엔
 * 그 문턱이 없다 — 이게 없으면 스크립트 하나로 계정을 무제한 만들어 D1·PBKDF2 CPU·AI 전역 한도를 소진한다.
 */
export const OPEN_SIGNUP_LIMIT = 3;

export function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") || "unknown";
}

/** 버킷 +1을 원자적으로 하고 확정된 값을 돌려받는다 — 윈도우가 지났으면 1로 리셋하며 시작. */
async function bump(db: Db, bucket: string): Promise<number> {
  const windowExpr = sql.raw(`datetime('now', '+${AUTH_WINDOW_SEC} seconds')`);
  // 그 전에 만료된 버킷을 기회적으로 지운다(#41). 버킷 키는 IP에서 파생돼 카디널리티가 무제한이라,
  // 지우는 곳이 없으면 한 번 실패하고 다시 오지 않는 IP의 행이 영원히 남는다. 세션이 로그인 때마다
  // 만료분을 지우는 것과 같은 장치. 이제 시도마다 돈다(정상 로그인 포함) — reset_at 인덱스가 있어 만료된
  // 행만 찾아가므로 테이블 크기에 비례하지 않는다.
  await db.run(sql`DELETE FROM auth_attempts WHERE reset_at <= datetime('now')`);
  const row = await db.get<{ count: number }>(sql`
    INSERT INTO auth_attempts (bucket, count, reset_at) VALUES (${bucket}, 1, ${windowExpr})
    ON CONFLICT(bucket) DO UPDATE SET
      count = CASE WHEN reset_at <= datetime('now') THEN 1 ELSE count + 1 END,
      reset_at = CASE WHEN reset_at <= datetime('now') THEN ${windowExpr} ELSE reset_at END
    RETURNING count
  `);
  return row?.count ?? Number.MAX_SAFE_INTEGER; // 값을 못 받으면 보수적으로 "초과"로 본다
}

/**
 * 시도 1회를 **먼저 예약**한다 — 한도 안이면 true. "검사 → 검증 → 기록"으로 나누면 동시 요청이 전부
 * 검사를 통과한 뒤에야 기록돼 한도가 무력해진다(200건 병렬에 429가 0건). 판정과 기록을 UPSERT … RETURNING
 * 하나로 묶어(ai-quota.ts의 reserveAiCall과 같은 방식) 몇 개가 동시에 와도 limit개만 통과한다.
 * 성공을 세지 않을 경로는 성공 뒤 releaseAttempt로 되돌린다.
 */
export async function reserveAttempt(db: Db, bucket: string, limit: number): Promise<boolean> {
  return (await bump(db, bucket)) <= limit;
}

/** 예약을 1회 되돌린다 — 성공한 시도는 실패 한도를 깎지 않게. */
export async function releaseAttempt(db: Db, bucket: string): Promise<void> {
  await db.run(sql`UPDATE auth_attempts SET count = MAX(count - 1, 0) WHERE bucket = ${bucket}`);
}

export const RATE_LIMIT_ERROR = "시도가 너무 많습니다. 잠시 후 다시 시도하세요.";
