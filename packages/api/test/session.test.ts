// Phase 2 인증 통합 테스트 — 세션 토큰 발급·사용·폐기·만료 + 인증 실패 rate limit.
import { env } from "cloudflare:test";
import { expect, test } from "vitest";
import app from "../src/app";
import { sha256hex } from "../src/lib/crypto";
import { PW_BUCKET_LIMIT } from "../src/lib/ratelimit";

const INVITE = "TEST-INVITE";

async function api(path: string, init?: RequestInit): Promise<Response> {
  return app.fetch(new Request(`https://bnhd.pages.dev/api${path}`, init), env);
}

function jsonBody(obj: unknown): RequestInit {
  return { method: "POST", body: JSON.stringify(obj) };
}

interface AuthPayload {
  ok: boolean;
  usercode: string;
  token: string;
  expires_at: string;
  recovery_key?: string;
  error?: string;
}

async function signupUser(pin = "1234"): Promise<AuthPayload> {
  const res = await api("/signup", jsonBody({ invite: INVITE, password: pin }));
  const data = (await res.json()) as AuthPayload;
  expect(data.ok).toBe(true);
  return data;
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

test("signup: 세션 토큰이 함께 발급되고 즉시 쓰기 인증에 사용 가능", async () => {
  const user = await signupUser();
  expect(user.token).toMatch(/^bhs_[0-9a-f]{32}$/);
  expect(user.expires_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

  const list = await api("/beans", { headers: bearer(user.token) });
  expect(list.status).toBe(200);
});

test("login: 유저코드+암호 → 새 세션 토큰, 오답은 401", async () => {
  const user = await signupUser("1234");

  const ok = await api("/login", jsonBody({ usercode: user.usercode, password: "1234" }));
  expect(ok.status).toBe(200);
  const data = (await ok.json()) as AuthPayload;
  expect(data.token).toMatch(/^bhs_/);
  expect(data.token).not.toBe(user.token); // 로그인마다 새 토큰
  expect((await api("/beans", { headers: bearer(data.token) })).status).toBe(200);

  const bad = await api("/login", jsonBody({ usercode: user.usercode, password: "0000" }));
  expect(bad.status).toBe(401);
  expect(((await bad.json()) as AuthPayload).error).toBe("유저코드 또는 암호가 올바르지 않습니다.");

  const badFormat = await api("/login", jsonBody({ usercode: "toolong5", password: "1234" }));
  expect(badFormat.status).toBe(401);
});

test("recover: 성공 시 세션 토큰 발급", async () => {
  const user = await signupUser("1234");
  const res = await api("/recover", jsonBody({ recovery_key: user.recovery_key, password: "5678" }));
  const data = (await res.json()) as AuthPayload;
  expect(data.ok).toBe(true);
  expect(data.token).toMatch(/^bhs_/);
  expect((await api("/beans", { headers: bearer(data.token) })).status).toBe(200);
});

test("logout: DELETE /session 후 그 토큰은 즉시 무효, 다른 세션은 유지", async () => {
  const user = await signupUser("1234");
  const second = (await (
    await api("/login", jsonBody({ usercode: user.usercode, password: "1234" }))
  ).json()) as AuthPayload;

  const out = await api("/session", { method: "DELETE", headers: bearer(user.token) });
  expect(out.status).toBe(200);

  expect((await api("/beans", { headers: bearer(user.token) })).status).toBe(401);
  expect((await api("/beans", { headers: bearer(second.token) })).status).toBe(200);
});

test("만료된 세션은 거부된다", async () => {
  const user = await signupUser();
  const hash = await sha256hex(user.token);
  await env.DB.prepare("UPDATE sessions SET expires_at = datetime('now', '-1 day') WHERE token_hash = ?")
    .bind(hash)
    .run();
  expect((await api("/beans", { headers: bearer(user.token) })).status).toBe(401);
});

test("레거시 Bearer {유저코드}:{암호} 인증은 이행기 동안 계속 동작", async () => {
  const user = await signupUser("1234");
  const res = await api("/beans", { headers: { Authorization: `Bearer ${user.usercode}:1234` } });
  expect(res.status).toBe(200);
});

test("rate limit: 같은 유저코드로 실패가 한도를 넘으면 429 (정답이라도 차단)", async () => {
  const user = await signupUser("1234");
  for (let i = 0; i < PW_BUCKET_LIMIT; i++) {
    const res = await api("/login", jsonBody({ usercode: user.usercode, password: "0000" }));
    expect(res.status).toBe(401);
  }
  const blocked = await api("/login", jsonBody({ usercode: user.usercode, password: "0000" }));
  expect(blocked.status).toBe(429);
  expect(((await blocked.json()) as AuthPayload).error).toBe(
    "시도가 너무 많습니다. 잠시 후 다시 시도하세요.",
  );

  // 한도 초과 후에는 올바른 암호도 윈도우가 끝날 때까지 차단 (전수 대입 무력화)
  const evenCorrect = await api("/login", jsonBody({ usercode: user.usercode, password: "1234" }));
  expect(evenCorrect.status).toBe(429);

  // 레거시 Bearer 경로도 같은 카운터를 공유한다
  const legacy = await api("/beans", { headers: { Authorization: `Bearer ${user.usercode}:1234` } });
  expect(legacy.status).toBe(429);

  // 세션 토큰 인증은 rate limit과 무관하게 동작
  const session = await api("/beans", { headers: bearer(user.token) });
  expect(session.status).toBe(200);
});

test("rate limit: 잘못된 초대코드 반복 시 signup도 429", async () => {
  for (let i = 0; i < 30; i++) {
    const res = await api("/signup", jsonBody({ invite: "WRONG", password: "1234" }));
    expect(res.status).toBe(403);
  }
  const blocked = await api("/signup", jsonBody({ invite: "WRONG", password: "1234" }));
  expect(blocked.status).toBe(429);
});
