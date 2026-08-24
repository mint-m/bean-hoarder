// 세션 토큰 발급·검증·폐기. 토큰 원문은 클라이언트만 보유하고 서버엔 SHA-256 해시만 저장한다.
import { and, eq, gt, lte, sql } from "drizzle-orm";
import type { Db } from "../db";
import { schema } from "../db";
import { randomSessionToken, sha256hex } from "./crypto";

export const SESSION_TOKEN_RE = /^bhs_[0-9a-f]{32}$/;

/** 세션 수명(일) — 고정 만료, 만료 시 재로그인 */
export const SESSION_TTL_DAYS = 90;

/**
 * 관리자 세션 수명(일) — 일반 세션보다 짧게 간다.
 * 데모 쓰기를 여는 세션이라 브라우저에 오래 남을수록 손해가 크고, 관리자는 필요할 때만
 * 잠깐 쓰는 경로라 재로그인 비용이 거의 없다.
 */
export const ADMIN_SESSION_TTL_DAYS = 7;

export interface IssuedSession {
  token: string;
  expires_at: string;
}

export async function createSession(db: Db, usercode: string, admin = false): Promise<IssuedSession> {
  const token = randomSessionToken();
  const tokenHash = await sha256hex(token);
  const ttl = admin ? ADMIN_SESSION_TTL_DAYS : SESSION_TTL_DAYS;
  // 만료 세션 기회적 청소 (로그인 시점, 비용 미미)
  await db.delete(schema.sessions).where(lte(schema.sessions.expires_at, sql`datetime('now')`)).run();
  const row = await db
    .insert(schema.sessions)
    .values({
      token_hash: tokenHash,
      usercode,
      admin: admin ? 1 : 0,
      expires_at: sql`datetime('now', '+${sql.raw(String(ttl))} days')`,
    })
    .returning({ expires_at: schema.sessions.expires_at })
    .get();
  return { token, expires_at: row.expires_at };
}

/** 유효(미만료) 세션이면 usercode와 관리자 여부 반환 */
export async function lookupSession(
  db: Db,
  token: string,
): Promise<{ usercode: string; tokenHash: string; admin: boolean } | null> {
  if (!SESSION_TOKEN_RE.test(token)) return null;
  const tokenHash = await sha256hex(token);
  const row = await db
    .select({ usercode: schema.sessions.usercode, admin: schema.sessions.admin })
    .from(schema.sessions)
    .where(
      and(eq(schema.sessions.token_hash, tokenHash), gt(schema.sessions.expires_at, sql`datetime('now')`)),
    )
    .get();
  return row ? { usercode: row.usercode, tokenHash, admin: row.admin === 1 } : null;
}

export async function revokeSession(db: Db, tokenHash: string): Promise<void> {
  await db.delete(schema.sessions).where(eq(schema.sessions.token_hash, tokenHash)).run();
}
