// 관리자 판정 — 두 열쇠(#88).
//
// 1) **누가** 관리자인가: secret ADMIN_USERCODES(콤마 구분 유저코드)와 대조한다. DB에 role 컬럼을 두지
//    않은 이유는 서비스에 특별 취급되는 계정이 없다는 원칙(CLAUDE.md)과, 첫 관리자를 누가 지정하느냐는
//    부트스트랩 문제를 secret 하나로 끝내기 위해서다.
// 2) **지금 열려 있는가**: 계정 인증은 접근성을 위해 일부러 얕다(4자리 PIN, 90일 세션). 그 계정 하나가
//    새면 관리까지 넘어가면 안 되므로, 관리 요청에는 secret ADMIN_KEY로 잠금을 푼 **1시간짜리 관리 토큰**을
//    따로 요구한다.
//
// 키와 서명을 **가른다**. ADMIN_KEY는 운영자가 기억할 중간 길이라 엔트로피가 아니라 **시도 횟수**로 막는다
// (유저코드당 5회/10분). 그런데 그 키로 토큰을 서명하면, 토큰 하나가 새는 순간 rate limit을 거치지 않는
// 오프라인 사전 공격의 재료가 된다 — 그래서 서명은 무작위 고엔트로피 secret ADMIN_TOKEN_SECRET으로 하고,
// ADMIN_KEY는 잠금 해제 때 비교만 한다. 토큰은 그 세션(세션 토큰 해시)에 묶여 로그아웃하면 함께 죽고,
// 만료는 발급 시점 + TTL을 넘을 수 없다(먼 미래 exp를 적은 토큰은 위조로 본다).
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { createDb } from "../db";
import type { AppEnv, Env } from "../env";
import { sha256hex } from "./crypto";
import { json } from "./http";
import { clientIp, IP_BUCKET_LIMIT, isRateLimited, RATE_LIMIT_ERROR, recordFailure } from "./ratelimit";

export const ADMIN_TOKEN_TTL_SEC = 60 * 60;
/** 관리 키 실패 한도 — PIN(10회)보다 빡빡하다. 키가 짧아도 되는 근거가 이 숫자다. */
export const ADMIN_KEY_BUCKET_LIMIT = 5;
export const ADMIN_LOCKED_ERROR = "관리 키로 잠금을 풀어야 합니다.";
export const ADMIN_KEY_ERROR = "관리 키가 올바르지 않습니다.";
export const ADMIN_KEY_UNSET_ERROR = "ADMIN_KEY secret이 설정되지 않아 관리 기능이 잠겨 있습니다.";
export const ADMIN_SECRET_UNSET_ERROR =
  "ADMIN_TOKEN_SECRET secret이 없거나 너무 짧아(32자 미만) 관리 기능이 잠겨 있습니다.";
export const ADMIN_SESSION_REQUIRED_ERROR = "관리 잠금은 세션 로그인으로만 풀 수 있습니다.";
/** 서명 secret의 최소 길이 — 기억할 만한 값을 넣어 키 분리의 의미가 사라지는 것을 막는다 */
export const ADMIN_TOKEN_SECRET_MIN = 32;
/** 서버 간 시계 차이 허용 — 발급한 isolate와 검증하는 isolate가 다를 수 있다 */
const CLOCK_SKEW_SEC = 60;

/** 쓸 수 있는 서명 secret — 없거나 짧으면 null(관리 기능 전체가 잠긴다). */
function tokenSecret(env: Env): string | null {
  const s = env.ADMIN_TOKEN_SECRET ?? "";
  return s.length >= ADMIN_TOKEN_SECRET_MIN ? s : null;
}

export function isAdmin(env: Env, usercode: string): boolean {
  const list = (env.ADMIN_USERCODES ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  return list.includes(usercode.toUpperCase());
}

/**
 * 관리자 전용 — authRequired 뒤에 건다. 관리자가 아니면 **404**(403이 아니라): 관리 엔드포인트의 존재
 * 자체를 일반 사용자에게 알리지 않는다. 응답은 app.notFound와 같은 형태다.
 */
export const adminRequired = createMiddleware<AppEnv>(async (c, next) => {
  if (!isAdmin(c.env, c.get("user").usercode)) return json({ ok: false, error: "not found" }, 404);
  await next();
});

// ── 관리 토큰 ──
// 형식 bha_{만료 epoch초}.{유저코드}.{hmac hex}. 서명 대상에는 세션 토큰 해시도 들어가지만 토큰에는
// 싣지 않는다 — 서버가 인증 단계에서 이미 알고 있고, 클라이언트가 바꿔 끼울 수 없어야 한다.
const TOKEN_RE = /^bha_(\d+)\.([A-Z0-9]{4})\.([0-9a-f]{64})$/;

async function hmacHex(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 같은 길이의 hex를 상수 시간으로 비교 — 문자열 ===는 앞에서 다르면 일찍 끝난다. */
function equalHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signAdminToken(
  secret: string,
  usercode: string,
  sessionHash: string,
  expSec: number,
): Promise<string> {
  const uc = usercode.toUpperCase();
  return `bha_${expSec}.${uc}.${await hmacHex(secret, `${expSec}.${uc}.${sessionHash}`)}`;
}

/** 토큰이 이 secret·이 계정·이 세션의 것이고, 살아 있으며, 발급 가능한 범위의 만료를 갖는가. */
export async function verifyAdminToken(
  secret: string,
  usercode: string,
  sessionHash: string,
  token: string,
  nowMs = Date.now(),
): Promise<boolean> {
  const m = TOKEN_RE.exec(token);
  if (!m?.[1] || !m[2] || !m[3]) return false;
  const exp = Number(m[1]);
  const nowSec = Math.floor(nowMs / 1000);
  if (!Number.isFinite(exp) || exp <= nowSec) return false;
  if (exp > nowSec + ADMIN_TOKEN_TTL_SEC + CLOCK_SKEW_SEC) return false; // 서버가 내줄 수 없는 만료
  if (m[2] !== usercode.toUpperCase()) return false;
  return equalHex(m[3], await hmacHex(secret, `${exp}.${m[2]}.${sessionHash}`));
}

/**
 * 잠금이 풀렸는가 — adminRequired 뒤에 건다. 토큰이 없거나 만료면 **403 + locked** — 401을 쓰면 랩이
 * 세션 만료로 오해해 로그아웃시킨다. 비관리자는 앞 단계에서 이미 404라 여기서 존재가 새지 않는다.
 */
export const adminUnlocked = createMiddleware<AppEnv>(async (c, next) => {
  const secret = tokenSecret(c.env);
  const user = c.get("user");
  const token = c.req.header("X-Admin-Token") ?? "";
  // 레거시 인증(유저코드:PIN)에는 세션이 없다 — 묶을 데가 없으니 관리로는 들어올 수 없다
  if (
    !c.env.ADMIN_KEY ||
    !secret ||
    !user.sessionTokenHash ||
    !token ||
    !(await verifyAdminToken(secret, user.usercode, user.sessionTokenHash, token))
  ) {
    return json({ ok: false, error: ADMIN_LOCKED_ERROR, locked: true }, 403);
  }
  await next();
});

/**
 * POST /api/admin/unlock { key } → { token, expires_at }. 실패는 유저코드·IP 버킷에 기록한다.
 * ADMIN_KEY는 여기서 비교만 하고 서명에는 쓰지 않는다(머리 주석).
 */
export async function unlockAdmin(c: Context<AppEnv>): Promise<Response> {
  const { usercode, sessionTokenHash } = c.get("user");
  const key = c.env.ADMIN_KEY;
  if (!key) return json({ ok: false, error: ADMIN_KEY_UNSET_ERROR }, 403);
  const secret = tokenSecret(c.env);
  if (!secret) return json({ ok: false, error: ADMIN_SECRET_UNSET_ERROR }, 403);
  if (!sessionTokenHash) return json({ ok: false, error: ADMIN_SESSION_REQUIRED_ERROR }, 403);
  const db = createDb(c.env.DB);
  const ucBucket = `admin:${usercode}`;
  // signup/recover(routes/auth.ts)와 같은 규칙 — 네임스페이스를 접두어로 분리한다. `ip:${ip}`를
  // 그대로 썼다면 로그인 실패 버킷(auth.ts)과 같은 키를 공유해, 같은 IP의 로그인 실패가 관리
  // 잠금 시도를 막거나 그 반대가 되는 교차 오염이 생긴다(#92 리뷰).
  const ipBucket = `admin-ip:${clientIp(c.req.raw)}`;
  if (
    (await isRateLimited(db, ucBucket, ADMIN_KEY_BUCKET_LIMIT)) ||
    (await isRateLimited(db, ipBucket, IP_BUCKET_LIMIT))
  ) {
    return json({ ok: false, error: RATE_LIMIT_ERROR }, 429);
  }
  const body = (await c.req.json().catch(() => ({}))) as { key?: unknown };
  const given = typeof body.key === "string" ? body.key : "";
  // 길이가 달라도 같은 비용을 치르게 해시를 비교한다 — 키 길이가 새지 않게
  const ok = given !== "" && equalHex(await sha256hex(given), await sha256hex(key));
  if (!ok) {
    await recordFailure(db, ucBucket);
    await recordFailure(db, ipBucket);
    return json({ ok: false, error: ADMIN_KEY_ERROR }, 403);
  }
  const exp = Math.floor(Date.now() / 1000) + ADMIN_TOKEN_TTL_SEC;
  return json({
    ok: true,
    token: await signAdminToken(secret, usercode, sessionTokenHash, exp),
    expires_at: new Date(exp * 1000).toISOString(),
  });
}
