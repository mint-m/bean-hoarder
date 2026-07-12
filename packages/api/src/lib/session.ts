// 세션 토큰 발급·검증·폐기. 토큰 원문은 클라이언트만 보유하고 서버엔 SHA-256 해시만 저장한다.
import { and, eq, gt, lte, sql } from "drizzle-orm";
import type { Db } from "../db";
import { schema } from "../db";
import { randomSessionToken, sha256hex } from "./crypto";

export const SESSION_TOKEN_RE = /^bhs_[0-9a-f]{32}$/;

/** 세션 수명(일) — 고정 만료, 만료 시 재로그인 */
export const SESSION_TTL_DAYS = 90;

export interface IssuedSession {
  token: string;
  expires_at: string;
}

export async function createSession(db: Db, usercode: string): Promise<IssuedSession> {
  const token = randomSessionToken();
  const tokenHash = await sha256hex(token);
  // 만료 세션 기회적 청소 (로그인 시점, 비용 미미)
  await db.delete(schema.sessions).where(lte(schema.sessions.expires_at, sql`datetime('now')`)).run();
  const row = await db
    .insert(schema.sessions)
    .values({
      token_hash: tokenHash,
      usercode,
      expires_at: sql`datetime('now', '+${sql.raw(String(SESSION_TTL_DAYS))} days')`,
    })
    .returning({ expires_at: schema.sessions.expires_at })
    .get();
  return { token, expires_at: row.expires_at };
}

/** 유효(미만료) 세션이면 usercode 반환 */
export async function lookupSession(
  db: Db,
  token: string,
): Promise<{ usercode: string; tokenHash: string } | null> {
  if (!SESSION_TOKEN_RE.test(token)) return null;
  const tokenHash = await sha256hex(token);
  const row = await db
    .select({ usercode: schema.sessions.usercode })
    .from(schema.sessions)
    .where(
      and(eq(schema.sessions.token_hash, tokenHash), gt(schema.sessions.expires_at, sql`datetime('now')`)),
    )
    .get();
  return row ? { usercode: row.usercode, tokenHash } : null;
}

export async function revokeSession(db: Db, tokenHash: string): Promise<void> {
  await db.delete(schema.sessions).where(eq(schema.sessions.token_hash, tokenHash)).run();
}
