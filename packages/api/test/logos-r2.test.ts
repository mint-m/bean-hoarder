// Phase 3 로고 R2 이전 통합 테스트 — 응답 계약(data URL)은 유지하면서 저장소만 R2로 이동.
import { env } from "cloudflare:test";
import { expect, test } from "vitest";
import app from "../src/app";

const INVITE = "TEST-INVITE";

async function api(path: string, init?: RequestInit): Promise<Response> {
  return app.fetch(new Request(`https://bnhd.pages.dev/api${path}`, init), env);
}

async function signupUser() {
  const res = await api("/signup", {
    method: "POST",
    body: JSON.stringify({ invite: INVITE, password: "1234" }),
  });
  const data = (await res.json()) as { ok: boolean; usercode: string; token: string };
  expect(data.ok).toBe(true);
  return { usercode: data.usercode, auth: { Authorization: `Bearer ${data.token}` } };
}

// 1x1 투명 PNG
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const PNG_DATAURL = `data:image/png;base64,${PNG_B64}`;

test("로고 저장은 R2에 바이트로, D1엔 메타만 — 목록 응답은 종전과 같은 data URL", async () => {
  const user = await signupUser();

  const put = await api("/logos", {
    method: "PUT",
    body: JSON.stringify({ roastery: "danche", data_url: PNG_DATAURL }),
    headers: user.auth,
  });
  expect((await put.json()) as object).toEqual({ ok: true, roastery: "DANCHE" });

  // R2에 원본 바이트가 저장됨
  const obj = await env.LOGOS.get(`${user.usercode}/DANCHE`);
  expect(obj).not.toBeNull();
  expect(obj?.httpMetadata?.contentType).toBe("image/png");

  // D1 행은 인라인 data_url 없이 메타만
  const row = await env.DB.prepare("SELECT data_url, content_type FROM logos WHERE usercode = ?")
    .bind(user.usercode)
    .first<{ data_url: string; content_type: string }>();
  expect(row?.data_url).toBe("");
  expect(row?.content_type).toBe("image/png");

  // 목록 응답 계약은 종전과 동일 — R2 바이트를 data URL로 재조립해 반환
  const list = (await (await api("/logos", { headers: user.auth })).json()) as {
    logos: { roastery: string; data_url: string }[];
  };
  expect(list.logos).toEqual([{ roastery: "DANCHE", data_url: PNG_DATAURL }]);

  // 삭제 시 R2 오브젝트도 제거
  await api("/logos", {
    method: "DELETE",
    body: JSON.stringify({ roastery: "DANCHE" }),
    headers: user.auth,
  });
  expect(await env.LOGOS.get(`${user.usercode}/DANCHE`)).toBeNull();
});

test("레거시 인라인(data_url) 행은 그대로 서빙된다 — R2 이전 전 데이터 호환", async () => {
  const user = await signupUser();
  await env.DB.prepare(
    "INSERT INTO logos (usercode, roastery, data_url, updated_at) VALUES (?, 'OLDIE', ?, datetime('now'))",
  )
    .bind(user.usercode, PNG_DATAURL)
    .run();

  const list = (await (await api("/logos", { headers: user.auth })).json()) as {
    logos: { roastery: string; data_url: string }[];
  };
  expect(list.logos).toEqual([{ roastery: "OLDIE", data_url: PNG_DATAURL }]);

  // 재저장하면 R2로 이전되고 인라인은 비워진다 (lazy migration)
  await api("/logos", {
    method: "PUT",
    body: JSON.stringify({ roastery: "OLDIE", data_url: PNG_DATAURL }),
    headers: user.auth,
  });
  const row = await env.DB.prepare("SELECT data_url FROM logos WHERE usercode = ? AND roastery = 'OLDIE'")
    .bind(user.usercode)
    .first<{ data_url: string }>();
  expect(row?.data_url).toBe("");
  expect(await env.LOGOS.get(`${user.usercode}/OLDIE`)).not.toBeNull();
});
