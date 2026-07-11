// 인증 — 두 방식 지원:
//   Bearer bhs_{토큰}          세션 토큰 (기본 — 프론트는 로그인 후 이것만 사용)
//   Bearer {유저코드}:{암호}    레거시 (이행기 호환 — PIN을 저장해 둔 구버전 클라이언트)
// 레거시 경로는 실패 시 rate limit 카운터에 기록된다 (4자리 PIN 전수 대입 차단).
import { and, eq } from "drizzle-orm";
import { createDb, schema } from "./db";
import type { AuthedUser, Env } from "./env";
import { hashPassword, verifyPassword } from "./lib/crypto";
import { clientIp, IP_BUCKET_LIMIT, isRateLimited, PW_BUCKET_LIMIT, recordFailure } from "./lib/ratelimit";
import { lookupSession, SESSION_TOKEN_RE } from "./lib/session";

const LEGACY_RE = /^Bearer\s+([A-Z0-9]{4}):(\d{4})$/i;
const SESSION_RE = /^Bearer\s+(bhs_[0-9a-f]{32})$/i;

export type AuthResult = { kind: "ok"; user: AuthedUser } | { kind: "limited" } | { kind: "fail" };

/**
 * 유저코드+암호 검증 (rate limit 포함) — authenticate의 레거시 경로와 POST /api/login이 공유.
 * 성공 시 구형 SHA-256 해시를 PBKDF2로 무중단 업그레이드한다.
 */
export async function verifyCredentials(
  env: Env,
  request: Request,
  usercode: string,
  pin: string,
): Promise<AuthResult> {
  const db = createDb(env.DB);
  const ip = clientIp(request);
  const pwBucket = `pw:${usercode}`;
  const ipBucket = `ip:${ip}`;
  if (
    (await isRateLimited(db, pwBucket, PW_BUCKET_LIMIT)) ||
    (await isRateLimited(db, ipBucket, IP_BUCKET_LIMIT))
  ) {
    return { kind: "limited" };
  }

  const row = await db
    .select({ usercode: schema.users.usercode, pass_hash: schema.users.pass_hash })
    .from(schema.users)
    .where(eq(schema.users.usercode, usercode))
    .get();
  const v = row ? await verifyPassword(row.pass_hash, usercode, pin) : { ok: false, legacy: false };
  if (!row || !v.ok) {
    await recordFailure(db, pwBucket);
    await recordFailure(db, ipBucket);
    return { kind: "fail" };
  }

  // 구형(단일 SHA-256) 해시는 로그인 성공 시점에 PBKDF2로 무중단 업그레이드
  if (v.legacy) {
    const upgraded = await hashPassword(usercode, pin);
    await db
      .update(schema.users)
      .set({ pass_hash: upgraded })
      .where(and(eq(schema.users.usercode, usercode), eq(schema.users.pass_hash, row.pass_hash)))
      .run();
  }
  return { kind: "ok", user: { usercode } };
}

export async function authenticate(env: Env, request: Request): Promise<AuthResult> {
  const header = request.headers.get("Authorization") || "";

  const s = SESSION_RE.exec(header);
  if (s?.[1] && SESSION_TOKEN_RE.test(s[1])) {
    const db = createDb(env.DB);
    const found = await lookupSession(db, s[1]);
    return found
      ? { kind: "ok", user: { usercode: found.usercode, sessionTokenHash: found.tokenHash } }
      : { kind: "fail" };
  }

  const m = LEGACY_RE.exec(header);
  if (!m?.[1] || !m[2]) return { kind: "fail" };
  return verifyCredentials(env, request, m[1].toUpperCase(), m[2]);
}
