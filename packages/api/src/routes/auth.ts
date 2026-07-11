// 가입·계정 복구.
import { PIN_RE, recoverBodySchema, signupBodySchema } from "@bnhd/schema";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
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

export async function signup(c: Context<AppEnv>): Promise<Response> {
  const body = signupBodySchema.parse(await c.req.json().catch(() => ({})));
  if (!c.env.INVITE_CODE || body.invite !== c.env.INVITE_CODE) {
    return json({ ok: false, error: "초대코드가 올바르지 않습니다." }, 403);
  }
  const pin = body.password;
  if (!PIN_RE.test(pin)) return json({ ok: false, error: "암호는 숫자 4자리여야 합니다." }, 400);

  const db = createDb(c.env.DB);
  const recoveryKey = randomRecoveryKey();
  const recoveryHash = await sha256hex(normalizeRecoveryKey(recoveryKey));
  for (let attempt = 0; attempt < 5; attempt++) {
    const usercode = randomUsercode();
    const hash = await hashPassword(usercode, pin);
    try {
      await db.insert(schema.users).values({ usercode, pass_hash: hash, recovery_hash: recoveryHash }).run();
      return json({ ok: true, usercode, recovery_key: recoveryKey });
    } catch (_e) {
      /* usercode 충돌 시 재시도 */
    }
  }
  return json({ ok: false, error: "유저코드 발급 실패 (재시도 요망)" }, 500);
}

export async function recoverAccount(c: Context<AppEnv>): Promise<Response> {
  const body = recoverBodySchema.parse(await c.req.json().catch(() => ({})));
  const normalized = normalizeRecoveryKey(body.recovery_key);
  if (normalized.length !== 20) return json({ ok: false, error: "복구키 형식이 올바르지 않습니다." }, 400);
  const pin = body.password;
  if (!PIN_RE.test(pin)) return json({ ok: false, error: "새 암호는 숫자 4자리여야 합니다." }, 400);

  const db = createDb(c.env.DB);
  const recoveryHash = await sha256hex(normalized);
  const row = await db
    .select({ usercode: schema.users.usercode })
    .from(schema.users)
    .where(eq(schema.users.recovery_hash, recoveryHash))
    .get();
  if (!row) return json({ ok: false, error: "복구키가 일치하지 않습니다." }, 404);

  const usercode = row.usercode;
  const newHash = await hashPassword(usercode, pin);
  const newRecoveryKey = randomRecoveryKey();
  const newRecoveryHash = await sha256hex(normalizeRecoveryKey(newRecoveryKey));
  await db
    .update(schema.users)
    .set({ pass_hash: newHash, recovery_hash: newRecoveryHash })
    .where(eq(schema.users.usercode, usercode))
    .run();
  return json({ ok: true, usercode, recovery_key: newRecoveryKey });
}
