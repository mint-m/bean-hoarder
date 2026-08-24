// 가입·로그인·로그아웃·계정 복구.
// 가입/로그인/복구 성공 시 세션 토큰을 발급한다 — 클라이언트는 PIN을 저장하지 않고
// 세션 토큰(bhs_…)만 보관한다. 기존 응답 필드는 유지하고 token/expires_at만 추가(호환).
import { loginBodySchema, PIN_RE, recoverBodySchema, signupBodySchema, USERCODE_RE } from "@bnhd/schema";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { verifyCredentials } from "../auth";
import { createDb, schema } from "../db";
import type { AppEnv } from "../env";
import {
  hashPassword,
  normalizeRecoveryKey,
  randomRecoveryKey,
  randomUsercode,
  sha256hex,
} from "../lib/crypto";
import { json } from "../lib/http";
import { clientIp, IP_BUCKET_LIMIT, isRateLimited, RATE_LIMIT_ERROR, recordFailure } from "../lib/ratelimit";
import { createSession, revokeSession } from "../lib/session";

export async function signup(c: Context<AppEnv>): Promise<Response> {
  const body = signupBodySchema.parse(await c.req.json().catch(() => ({})));
  const db = createDb(c.env.DB);
  const signupBucket = `signup:${clientIp(c.req.raw)}`;
  if (!c.env.INVITE_CODE || body.invite !== c.env.INVITE_CODE) {
    if (await isRateLimited(db, signupBucket, IP_BUCKET_LIMIT)) {
      return json({ ok: false, error: RATE_LIMIT_ERROR }, 429);
    }
    await recordFailure(db, signupBucket);
    return json({ ok: false, error: "초대코드가 올바르지 않습니다." }, 403);
  }
  const pin = body.password;
  if (!PIN_RE.test(pin)) return json({ ok: false, error: "암호는 숫자 4자리여야 합니다." }, 400);

  const recoveryKey = randomRecoveryKey();
  const recoveryHash = await sha256hex(normalizeRecoveryKey(recoveryKey));
  for (let attempt = 0; attempt < 5; attempt++) {
    const usercode = randomUsercode();
    // PBKDF2(25k회)는 CPU가 비싸다 — 해시 전에 가벼운 조회로 충돌을 걸러 CPU 한도 낭비를 막는다
    // (조회~삽입 사이 레이스는 아래 try/catch의 UNIQUE 제약이 계속 방어).
    const taken = await db
      .select({ usercode: schema.users.usercode })
      .from(schema.users)
      .where(eq(schema.users.usercode, usercode))
      .get();
    if (taken) continue;
    const hash = await hashPassword(usercode, pin);
    try {
      await db.insert(schema.users).values({ usercode, pass_hash: hash, recovery_hash: recoveryHash }).run();
      const session = await createSession(db, usercode);
      return json({
        ok: true,
        usercode,
        recovery_key: recoveryKey,
        token: session.token,
        expires_at: session.expires_at,
      });
    } catch (_e) {
      /* usercode 충돌 시 재시도 */
    }
  }
  return json({ ok: false, error: "유저코드 발급 실패 (재시도 요망)" }, 500);
}

export async function login(c: Context<AppEnv>): Promise<Response> {
  const body = loginBodySchema.parse(await c.req.json().catch(() => ({})));
  const usercode = body.usercode.toUpperCase();
  if (!USERCODE_RE.test(usercode) || !PIN_RE.test(body.password)) {
    return json({ ok: false, error: "유저코드 또는 암호가 올바르지 않습니다." }, 401);
  }
  const result = await verifyCredentials(c.env, c.req.raw, usercode, body.password);
  if (result.kind === "limited") return json({ ok: false, error: RATE_LIMIT_ERROR }, 429);
  if (result.kind === "fail") {
    return json({ ok: false, error: "유저코드 또는 암호가 올바르지 않습니다." }, 401);
  }
  const db = createDb(c.env.DB);
  const session = await createSession(db, usercode);
  return json({ ok: true, usercode, token: session.token, expires_at: session.expires_at });
}

/** 현재 세션 폐기 — 레거시(usercode:pin) 인증으로 호출되면 폐기할 세션이 없으므로 그냥 성공 */
export async function logout(c: Context<AppEnv>): Promise<Response> {
  const user = c.get("user");
  if (user.sessionTokenHash) {
    await revokeSession(createDb(c.env.DB), user.sessionTokenHash);
  }
  return json({ ok: true });
}

export async function recoverAccount(c: Context<AppEnv>): Promise<Response> {
  const body = recoverBodySchema.parse(await c.req.json().catch(() => ({})));
  const normalized = normalizeRecoveryKey(body.recovery_key);
  if (normalized.length !== 20) return json({ ok: false, error: "복구키 형식이 올바르지 않습니다." }, 400);
  const pin = body.password;
  if (!PIN_RE.test(pin)) return json({ ok: false, error: "새 암호는 숫자 4자리여야 합니다." }, 400);

  const db = createDb(c.env.DB);
  const recoverBucket = `recover:${clientIp(c.req.raw)}`;
  if (await isRateLimited(db, recoverBucket, IP_BUCKET_LIMIT)) {
    return json({ ok: false, error: RATE_LIMIT_ERROR }, 429);
  }
  const recoveryHash = await sha256hex(normalized);
  const row = await db
    .select({ usercode: schema.users.usercode })
    .from(schema.users)
    .where(eq(schema.users.recovery_hash, recoveryHash))
    .get();
  if (!row) {
    await recordFailure(db, recoverBucket);
    return json({ ok: false, error: "복구키가 일치하지 않습니다." }, 404);
  }

  const usercode = row.usercode;
  const newHash = await hashPassword(usercode, pin);
  const newRecoveryKey = randomRecoveryKey();
  const newRecoveryHash = await sha256hex(normalizeRecoveryKey(newRecoveryKey));
  await db
    .update(schema.users)
    .set({ pass_hash: newHash, recovery_hash: newRecoveryHash })
    .where(eq(schema.users.usercode, usercode))
    .run();
  const session = await createSession(db, usercode);
  return json({
    ok: true,
    usercode,
    recovery_key: newRecoveryKey,
    token: session.token,
    expires_at: session.expires_at,
  });
}
