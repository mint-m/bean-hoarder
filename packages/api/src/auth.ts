// 인증: Authorization: Bearer {유저코드}:{4자리 암호} (편의용 암호 — 쓰기에만 필요, 조회는 공개)
import { and, eq } from "drizzle-orm";
import { createDb, schema } from "./db";
import type { AuthedUser, Env } from "./env";
import { hashPassword, verifyPassword } from "./lib/crypto";

const BEARER_RE = /^Bearer\s+([A-Z0-9]{4}):(\d{4})$/i;

export async function authenticate(env: Env, request: Request): Promise<AuthedUser | null> {
  const m = BEARER_RE.exec(request.headers.get("Authorization") || "");
  if (!m?.[1] || !m[2]) return null;
  const usercode = m[1].toUpperCase();
  const pin = m[2];

  const db = createDb(env.DB);
  const row = await db
    .select({ usercode: schema.users.usercode, pass_hash: schema.users.pass_hash })
    .from(schema.users)
    .where(eq(schema.users.usercode, usercode))
    .get();
  if (!row) return null;

  const v = await verifyPassword(row.pass_hash, usercode, pin);
  if (!v.ok) return null;

  // 구형(단일 SHA-256) 해시는 로그인 성공 시점에 PBKDF2로 무중단 업그레이드
  if (v.legacy) {
    const upgraded = await hashPassword(usercode, pin);
    await db
      .update(schema.users)
      .set({ pass_hash: upgraded })
      .where(and(eq(schema.users.usercode, usercode), eq(schema.users.pass_hash, row.pass_hash)))
      .run();
  }
  return { usercode };
}
