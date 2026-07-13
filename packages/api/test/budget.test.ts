// R2 비용 백스톱 통합 테스트 — 전역 월간 쓰기 예산 / 스토리지 개수 상한이 로고 저장을 막는지.
import { env } from "cloudflare:test";
import { beforeEach, expect, test } from "vitest";
import app from "../src/app";
import { MAX_R2_LOGO_OBJECTS, MONTHLY_WRITE_BUDGET, R2_BUDGET_ERROR } from "../src/lib/budget";

// r2_usage는 고정 PK('global') 싱글톤이고 logos 개수는 전역 집계라, 이 풀은 테스트별 스토리지
// 롤백에 의존하지 않는다(다른 테스트는 랜덤 유저코드로 충돌을 피함). 백스톱 상태를 결정적으로
// 검증하려면 매 테스트 전에 두 테이블을 비운다.
beforeEach(async () => {
  await env.DB.prepare("DELETE FROM r2_usage").run();
  await env.DB.prepare("DELETE FROM logos").run();
});

const INVITE = "TEST-INVITE";
const PNG_DATAURL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

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

const thisMonth = () => new Date().toISOString().slice(0, 7);

async function putLogo(user: { auth: Record<string, string> }, roastery: string) {
  return api("/logos", {
    method: "PUT",
    body: JSON.stringify({ roastery, data_url: PNG_DATAURL }),
    headers: user.auth,
  });
}

test("월간 쓰기 예산을 이미 소진했으면 로고 저장을 503으로 거부하고 R2에 쓰지 않는다", async () => {
  const user = await signupUser();
  await env.DB.prepare("INSERT INTO r2_usage (id, month, write_count) VALUES ('global', ?, ?)")
    .bind(thisMonth(), MONTHLY_WRITE_BUDGET)
    .run();

  const res = await putLogo(user, "over");
  expect(res.status).toBe(503);
  expect((await res.json()) as { error: string }).toEqual({ ok: false, error: R2_BUDGET_ERROR });
  // R2·D1 어느 쪽에도 흔적이 없어야 함
  expect(await env.LOGOS.get(`${user.usercode}/OVER`)).toBeNull();
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM logos WHERE usercode = ?")
    .bind(user.usercode)
    .first<{ n: number }>();
  expect(row?.n).toBe(0);
});

test("정상 저장은 전역 월간 쓰기 카운터를 증가시킨다", async () => {
  const user = await signupUser();
  expect((await putLogo(user, "danche")).status).toBe(200);

  const row = await env.DB.prepare("SELECT month, write_count FROM r2_usage WHERE id = 'global'").first<{
    month: string;
    write_count: number;
  }>();
  expect(row?.month).toBe(thisMonth());
  expect(row?.write_count).toBe(1);
});

test("월이 바뀌면 카운터가 리셋되어 저장이 다시 허용된다", async () => {
  const user = await signupUser();
  // 지난달 카운터가 예산을 꽉 채운 상태 — 이번 달 요청은 리셋되어 통과해야 함
  await env.DB.prepare("INSERT INTO r2_usage (id, month, write_count) VALUES ('global', '2000-01', ?)")
    .bind(MONTHLY_WRITE_BUDGET)
    .run();

  expect((await putLogo(user, "fresh")).status).toBe(200);
  const row = await env.DB.prepare("SELECT month, write_count FROM r2_usage WHERE id = 'global'").first<{
    month: string;
    write_count: number;
  }>();
  expect(row?.month).toBe(thisMonth());
  expect(row?.write_count).toBe(1); // 새 달 첫 쓰기
});

test("스토리지 개수 상한 도달 시 신규 로고는 거부하되 기존 로고 덮어쓰기는 허용한다", async () => {
  const user = await signupUser();
  // R2 백드 로고 행을 상한만큼 채운다 (개수 판정만 필요 — 실제 R2 오브젝트는 불필요).
  // MAX_R2_LOGO_OBJECTS는 우리 코드의 숫자 상수라 문자열 보간이 안전하다.
  await env.DB.prepare(
    `WITH RECURSIVE c(value) AS (SELECT 1 UNION ALL SELECT value + 1 FROM c WHERE value < ${MAX_R2_LOGO_OBJECTS})
     INSERT INTO logos (usercode, roastery, data_url, content_type, updated_at)
     SELECT ?, 'CAP' || value, '', 'image/png', datetime('now') FROM c`,
  )
    .bind(user.usercode)
    .run();

  // 신규 로스터리 → R2 오브젝트 순증이므로 거부
  const neu = await putLogo(user, "brandnew");
  expect(neu.status).toBe(503);
  expect(await env.LOGOS.get(`${user.usercode}/BRANDNEW`)).toBeNull();

  // 이미 R2 백드인 키 덮어쓰기 → 순증 없음, 허용 (한도에 걸려도 갱신은 가능해야 함)
  const over = await putLogo(user, "cap1");
  expect(over.status).toBe(200);
  expect(await env.LOGOS.get(`${user.usercode}/CAP1`)).not.toBeNull();
});
