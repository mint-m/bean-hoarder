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
import {
  clientIp,
  IP_BUCKET_LIMIT,
  OPEN_SIGNUP_BUCKET_PREFIX,
  OPEN_SIGNUP_LIMIT,
  RATE_LIMIT_ERROR,
  releaseAttempt,
  reserveAttempt,
} from "../lib/ratelimit";
import { createSession, revokeSession } from "../lib/session";
import { getSignupMode } from "../lib/settings";

export const SIGNUP_CLOSED_ERROR = "지금은 가입을 받지 않습니다.";

export async function signup(c: Context<AppEnv>): Promise<Response> {
  const body = signupBodySchema.parse(await c.req.json().catch(() => ({})));
  const db = createDb(c.env.DB);
  const signupBucket = `signup:${clientIp(c.req.raw)}`;
  // 가입 모드(관리자 설정, lib/settings.ts): closed면 문을 닫고, open이면 초대코드를 묻지 않는다.
  // invite(기본)는 종전 그대로 — 아래 403과 메시지가 계약이다(app.test.ts).
  const mode = await getSignupMode(db);
  // 닫힌 문을 두드리는 것도 센다 — 가입을 닫는 방법이 INVITE_CODE를 비우는 것이던 때는 오답 한도를 그대로
  // 탔으므로, 모드가 생겼다고 한도 없는 엔드포인트가 되면 회귀다(#102). 버킷은 초대코드 오답과 **따로** 둔다 —
  // 같이 쓰면 닫혀 있는 동안 두드린 IP가 다시 열린 뒤에도 맞는 초대코드로 429를 받는다. 메시지는 그대로 403.
  if (mode === "closed") {
    if (!(await reserveAttempt(db, `signup-closed:${clientIp(c.req.raw)}`, IP_BUCKET_LIMIT))) {
      return json({ ok: false, error: RATE_LIMIT_ERROR }, 429);
    }
    return json({ ok: false, error: SIGNUP_CLOSED_ERROR }, 403);
  }
  if (mode === "invite") {
    // 초대코드를 비교하기 **전에** 예약한다 — 한도 판정이 코드의 맞고 틀림보다 먼저다. 한도에 걸리면 맞는
    // 코드도 429여야 응답이 맞고 틀림을 알려 주지 않는다.
    if (!(await reserveAttempt(db, signupBucket, IP_BUCKET_LIMIT))) {
      return json({ ok: false, error: RATE_LIMIT_ERROR }, 429);
    }
    if (!c.env.INVITE_CODE || body.invite !== c.env.INVITE_CODE) {
      return json({ ok: false, error: "초대코드가 올바르지 않습니다." }, 403); // 예약이 곧 실패 기록이다
    }
    await releaseAttempt(db, signupBucket); // 맞혔다 — 오답 한도를 깎지 않는다
  }
  const pin = body.password;
  if (!PIN_RE.test(pin)) return json({ ok: false, error: "암호는 숫자 4자리여야 합니다." }, 400);
  // 열린 모드에서는 가입을 센다 — 초대코드라는 문턱이 없는 대신 IP당 속도로 막는다(ratelimit.ts). 계정을 만들기
  // **전에** 예약해야 병렬 요청이 한도를 넘지 못한다. 만들지 못하고 끝나면(아래 500) 예약을 돌려준다.
  const openBucket = mode === "open" ? `${OPEN_SIGNUP_BUCKET_PREFIX}${clientIp(c.req.raw)}` : null;
  if (openBucket && !(await reserveAttempt(db, openBucket, OPEN_SIGNUP_LIMIT))) {
    return json({ ok: false, error: RATE_LIMIT_ERROR }, 429);
  }

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
  if (openBucket) await releaseAttempt(db, openBucket);
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
  // 복구키를 찾기 **전에** 예약한다(로그인과 같은 이유 — 동시 요청이 한도를 넘지 못하게). 맞히면 돌려준다.
  if (!(await reserveAttempt(db, recoverBucket, IP_BUCKET_LIMIT))) {
    return json({ ok: false, error: RATE_LIMIT_ERROR }, 429);
  }
  const recoveryHash = await sha256hex(normalized);
  const row = await db
    .select({ usercode: schema.users.usercode })
    .from(schema.users)
    .where(eq(schema.users.recovery_hash, recoveryHash))
    .get();
  if (!row) return json({ ok: false, error: "복구키가 일치하지 않습니다." }, 404); // 예약이 곧 실패 기록이다
  await releaseAttempt(db, recoverBucket);

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
