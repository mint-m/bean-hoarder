// API 통합 테스트 — 기존 [[path]].js 라우터의 계약(경로·상태 코드·메시지·응답 형태)을
// Hono 이식본이 그대로 지키는지 실제 workerd + D1에서 검증한다.
// 이 테스트가 곧 API 계약 문서다: 여기 담긴 상태 코드·메시지를 바꾸는 변경은 계약 파괴다.
import { env } from "cloudflare:test";
import { expect, test } from "vitest";
import app from "../src/app";
import { sha256hex } from "../src/lib/crypto";

const INVITE = "TEST-INVITE";

async function api(path: string, init?: RequestInit): Promise<Response> {
  return app.fetch(new Request(`https://bnhd.pages.dev/api${path}`, init), env);
}

function jsonBody(obj: unknown): RequestInit {
  return { method: "POST", body: JSON.stringify(obj) };
}

interface SignupResult {
  usercode: string;
  recovery: string;
  auth: { Authorization: string };
}

async function signupUser(pin = "1234"): Promise<SignupResult> {
  const res = await api("/signup", jsonBody({ invite: INVITE, password: pin }));
  const data = (await res.json()) as { ok: boolean; usercode: string; recovery_key: string };
  expect(data.ok).toBe(true);
  return {
    usercode: data.usercode,
    recovery: data.recovery_key,
    auth: { Authorization: `Bearer ${data.usercode}:${pin}` },
  };
}

const YY = String(new Date().getUTCFullYear() % 100).padStart(2, "0");

const BEAN = {
  ROASTERY: "DANCHE",
  ORIGIN: "ETHIOPIA",
  VARIETY: "74158",
  PROCESS: "Washed",
  ROAST_DATE: "26.06.28",
  PACKAGE_DATE: "26.07.03",
  TASTING_NOTE: "Jasmine, bergamot",
};

async function addBean(auth: SignupResult["auth"], overrides: Record<string, string> = {}) {
  const res = await api("/beans", { ...jsonBody({ ...BEAN, ...overrides }), headers: auth });
  return { res, data: (await res.json()) as { ok: boolean; key: string; error?: string } };
}

// ── 가입/복구 ─────────────────────────────────────────────────

test("signup: 초대코드 불일치 403, 암호 형식 오류 400, 성공 시 유저코드+복구키", async () => {
  const bad = await api("/signup", jsonBody({ invite: "WRONG", password: "1234" }));
  expect(bad.status).toBe(403);
  expect(((await bad.json()) as { error: string }).error).toBe("초대코드가 올바르지 않습니다.");

  const badPin = await api("/signup", jsonBody({ invite: INVITE, password: "12" }));
  expect(badPin.status).toBe(400);
  expect(((await badPin.json()) as { error: string }).error).toBe("암호는 숫자 4자리여야 합니다.");

  const user = await signupUser();
  expect(user.usercode).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
  expect(user.recovery).toMatch(/^[0-9A-F]{4}(-[0-9A-F]{4}){4}$/);
});

test("recover: 형식 오류 400, 미일치 404, 성공 시 복구키 회전 + 새 암호 로그인", async () => {
  const user = await signupUser("1234");

  const short = await api("/recover", jsonBody({ recovery_key: "ABCD", password: "5678" }));
  expect(short.status).toBe(400);

  const wrong = await api(
    "/recover",
    jsonBody({ recovery_key: "0000-0000-0000-0000-0000", password: "5678" }),
  );
  expect(wrong.status).toBe(404);

  const ok = await api("/recover", jsonBody({ recovery_key: user.recovery, password: "5678" }));
  const data = (await ok.json()) as { ok: boolean; usercode: string; recovery_key: string };
  expect(data.ok).toBe(true);
  expect(data.usercode).toBe(user.usercode);
  expect(data.recovery_key).not.toBe(user.recovery);

  // 새 암호로 인증 성공, 옛 복구키는 무효(회전됨)
  const list = await api("/beans", { headers: { Authorization: `Bearer ${user.usercode}:5678` } });
  expect(list.status).toBe(200);
  const reuse = await api("/recover", jsonBody({ recovery_key: user.recovery, password: "9999" }));
  expect(reuse.status).toBe(404);
});

test("구형 SHA-256 해시는 로그인 성공 시 PBKDF2로 무중단 업그레이드", async () => {
  const legacyHash = await sha256hex("LEGA:1234");
  await env.DB.prepare("INSERT INTO users (usercode, pass_hash, recovery_hash) VALUES ('LEGA', ?, 'x')")
    .bind(legacyHash)
    .run();

  const res = await api("/beans", { headers: { Authorization: "Bearer LEGA:1234" } });
  expect(res.status).toBe(200);

  const row = await env.DB.prepare("SELECT pass_hash FROM users WHERE usercode = 'LEGA'").first<{
    pass_hash: string;
  }>();
  expect(row?.pass_hash.startsWith("pbkdf2$")).toBe(true);

  // 업그레이드 후에도 같은 암호로 로그인
  const again = await api("/beans", { headers: { Authorization: "Bearer LEGA:1234" } });
  expect(again.status).toBe(200);
});

// ── 인증 경계 ─────────────────────────────────────────────────

test("쓰기 계열은 인증 필수(401), 응답은 no-store", async () => {
  for (const [method, path] of [
    ["GET", "/beans"],
    ["POST", "/beans"],
    ["GET", "/export.csv"],
    ["POST", "/import"],
    ["GET", "/logos"],
    ["POST", "/fetch"],
  ] as const) {
    const res = await api(path, { method });
    expect(res.status, `${method} ${path}`).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe("인증 실패 — 유저코드와 암호를 확인하세요.");
  }
  const res = await api("/beans", { method: "GET" });
  expect(res.headers.get("Cache-Control")).toBe("no-store");
});

test("알 수 없는 경로는 404 not found", async () => {
  const res = await api("/nope");
  expect(res.status).toBe(404);
  expect((await res.json()) as object).toEqual({ ok: false, error: "not found" });
});

// ── 원두 CRUD ─────────────────────────────────────────────────

test("등록: 필수 항목 누락 400 (메시지에 누락 라벨), 성공 시 서버 채번 KEY", async () => {
  const user = await signupUser();

  const missing = await api("/beans", {
    ...jsonBody({
      ROASTERY: "R",
      ORIGIN: "",
      VARIETY: "",
      PROCESS: "P",
      ROAST_DATE: "",
      PACKAGE_DATE: "26.07.01",
    }),
    headers: user.auth,
  });
  expect(missing.status).toBe(400);
  expect(((await missing.json()) as { error: string }).error).toBe(
    "필수 항목 누락: 국가(산지), 품종, 로스팅일",
  );

  const first = await addBean(user.auth);
  expect(first.data.key).toBe(`${user.usercode}${YY}-001`);
  const second = await addBean(user.auth, { ORIGIN: "COLOMBIA" });
  expect(second.data.key).toBe(`${user.usercode}${YY}-002`);
});

test("공개 조회: 인증 없이 GET, KEY 형식 오류 400, 미등록 404, 빈 필드 포함 전체 형태", async () => {
  const user = await signupUser();
  const { data } = await addBean(user.auth);

  const res = await api(`/bean/${data.key}`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { ok: boolean; bean: Record<string, unknown> };
  expect(body.bean.KEY).toBe(data.key);
  expect(body.bean.ORIGIN).toBe("ETHIOPIA");
  expect(body.bean.REGION).toBe("");
  expect(body.bean.ARCHIVED).toBe(false);

  expect((await api("/bean/bad-key")).status).toBe(400);
  expect((await api(`/bean/ZZZZ${YY}-999`)).status).toBe(404);
});

test("수정: 소유자만 가능, 타인 KEY는 404", async () => {
  const alice = await signupUser();
  const bob = await signupUser();
  const { data } = await addBean(alice.auth);

  const ok = await api(`/bean/${data.key}`, {
    method: "PUT",
    body: JSON.stringify({ ...BEAN, ORIGIN: "KENYA" }),
    headers: alice.auth,
  });
  expect(ok.status).toBe(200);
  const after = (await (await api(`/bean/${data.key}`)).json()) as { bean: { ORIGIN: string } };
  expect(after.bean.ORIGIN).toBe("KENYA");

  const foreign = await api(`/bean/${data.key}`, {
    method: "PUT",
    body: JSON.stringify(BEAN),
    headers: bob.auth,
  });
  expect(foreign.status).toBe(404);
  expect(((await foreign.json()) as { error: string }).error).toBe("내 소유의 등록된 KEY가 아닙니다.");
});

test("숨기기(보관) 토글: PATCH /bean/{KEY}/archive", async () => {
  const user = await signupUser();
  const { data } = await addBean(user.auth);

  const on = await api(`/bean/${data.key}/archive`, {
    method: "PATCH",
    body: JSON.stringify({ archived: true }),
    headers: user.auth,
  });
  expect((await on.json()) as object).toEqual({ ok: true, key: data.key, archived: true });

  const shown = (await (await api(`/bean/${data.key}`)).json()) as { bean: { ARCHIVED: boolean } };
  expect(shown.bean.ARCHIVED).toBe(true);

  const off = await api(`/bean/${data.key}/archive`, {
    method: "PATCH",
    body: JSON.stringify({ archived: false }),
    headers: user.auth,
  });
  expect((await off.json()) as object).toEqual({ ok: true, key: data.key, archived: false });
});

test("삭제 후 재등록하면 번호 재사용 (연도 내 MAX+1 채번)", async () => {
  const user = await signupUser();
  const { data } = await addBean(user.auth);
  expect(data.key.endsWith("-001")).toBe(true);

  const del = await api(`/bean/${data.key}`, { method: "DELETE", headers: user.auth });
  expect(del.status).toBe(200);
  expect((await api(`/bean/${data.key}`)).status).toBe(404);

  const again = await addBean(user.auth);
  expect(again.data.key).toBe(data.key);
});

test("목록: 내 원두만 KEY 순으로", async () => {
  const user = await signupUser();
  const other = await signupUser();
  await addBean(user.auth);
  await addBean(user.auth, { ORIGIN: "COLOMBIA" });
  await addBean(other.auth);

  const res = await api("/beans", { headers: user.auth });
  const body = (await res.json()) as { beans: { KEY: string }[] };
  expect(body.beans.map((b) => b.KEY)).toEqual([`${user.usercode}${YY}-001`, `${user.usercode}${YY}-002`]);
});

// ── CSV 백업/복원 ─────────────────────────────────────────────

test("export.csv: BOM + 헤더 + 수식 인젝션 가드 + Content-Disposition", async () => {
  const user = await signupUser();
  await addBean(user.auth, { TASTING_NOTE: "=SUM(A1)" });

  const res = await api("/export.csv", { headers: user.auth });
  expect(res.headers.get("Content-Type")).toBe("text/csv;charset=utf-8");
  expect(res.headers.get("Content-Disposition")).toBe(
    `attachment; filename="bean_sheet_${user.usercode}.csv"`,
  );
  const bytes = new Uint8Array(await res.arrayBuffer());
  expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM (엑셀 한글 호환)
  const text = new TextDecoder("utf-8").decode(bytes);
  expect(text).toContain("KEY,ROASTERY,ORIGIN");
  expect(text).toContain("'=SUM(A1)"); // 수식 트리거 셀은 ' 접두
});

test("import: 내 KEY 복원(덮어쓰기), 타인 KEY·형식 오류는 skipped", async () => {
  const user = await signupUser();
  const { data } = await addBean(user.auth, { TASTING_NOTE: "=SUM(A1)" });

  const backup = await (await api("/export.csv", { headers: user.auth })).text();

  // 원본 훼손을 가정: 삭제 후 백업으로 복원
  await api(`/bean/${data.key}`, { method: "DELETE", headers: user.auth });

  const foreignRow = `\r\nZZZZ${YY}-001,R,ETHIOPIA,,,,,V,P,,,26.06.28,26.07.03,,,,,`;
  const badRow = "\r\nnot-a-key,R,ETHIOPIA,,,,,V,P,,,26.06.28,26.07.03,,,,,";
  const res = await api("/import", {
    method: "POST",
    body: backup + foreignRow + badRow,
    headers: user.auth,
  });
  const result = (await res.json()) as {
    ok: boolean;
    added: number;
    updated: number;
    skipped: { key: string; reason: string }[];
    skippedTotal: number;
  };
  expect(result.ok).toBe(true);
  expect(result.added).toBe(1);
  expect(result.updated).toBe(0);
  expect(result.skippedTotal).toBe(2);
  expect(result.skipped.map((s) => s.reason).sort()).toEqual(["KEY 형식 오류", "내 유저코드의 KEY가 아님"]);

  // 복원 후 수식 가드가 원문으로 되돌아왔는지 (라운드트립)
  const bean = (await (await api(`/bean/${data.key}`)).json()) as { bean: { TASTING_NOTE: string } };
  expect(bean.bean.TASTING_NOTE).toBe("=SUM(A1)");

  // 같은 백업 재복원 → updated로 집계
  const again = await api("/import", { method: "POST", body: backup, headers: user.auth });
  const againResult = (await again.json()) as { added: number; updated: number };
  expect(againResult.added).toBe(0);
  expect(againResult.updated).toBe(1);
});

test("import: 크기·행수·헤더 검증", async () => {
  const user = await signupUser();

  const noData = await api("/import", { method: "POST", body: "KEY,ROASTERY", headers: user.auth });
  expect(noData.status).toBe(400);

  const noKeyCol = await api("/import", { method: "POST", body: "A,B\r\n1,2", headers: user.auth });
  expect(noKeyCol.status).toBe(400);

  const tooBig = await api("/import", { method: "POST", body: "x".repeat(1_000_001), headers: user.auth });
  expect(tooBig.status).toBe(413);
});

// ── 로고 ─────────────────────────────────────────────────────

const PNG_DATAURL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";

test("logos: 저장 → 목록 → 삭제, 검증(이름 필수·포맷·크기)", async () => {
  const user = await signupUser();

  const noName = await api("/logos", {
    method: "PUT",
    body: JSON.stringify({ data_url: PNG_DATAURL }),
    headers: user.auth,
  });
  expect(noName.status).toBe(400);

  const badFormat = await api("/logos", {
    method: "PUT",
    body: JSON.stringify({ roastery: "danche", data_url: "data:text/html;base64,PGI+" }),
    headers: user.auth,
  });
  expect(badFormat.status).toBe(400);

  const tooBig = await api("/logos", {
    method: "PUT",
    body: JSON.stringify({ roastery: "danche", data_url: `data:image/png;base64,${"A".repeat(140_001)}` }),
    headers: user.auth,
  });
  expect(tooBig.status).toBe(413);

  const put = await api("/logos", {
    method: "PUT",
    body: JSON.stringify({ roastery: "danche", data_url: PNG_DATAURL }),
    headers: user.auth,
  });
  expect((await put.json()) as object).toEqual({ ok: true, roastery: "DANCHE" }); // 대문자 정규화

  const list = (await (await api("/logos", { headers: user.auth })).json()) as {
    logos: { roastery: string; data_url: string }[];
  };
  expect(list.logos).toEqual([{ roastery: "DANCHE", data_url: PNG_DATAURL }]);

  const del = await api("/logos", {
    method: "DELETE",
    body: JSON.stringify({ roastery: "DANCHE" }),
    headers: user.auth,
  });
  expect(del.status).toBe(200);
  const after = (await (await api("/logos", { headers: user.auth })).json()) as { logos: unknown[] };
  expect(after.logos).toEqual([]);
});

// ── 링크 가져오기 프록시 (SSRF 가드) ──────────────────────────

test("fetch: URL 형식 오류·비HTTP 프로토콜·내부망 주소는 400", async () => {
  const user = await signupUser();
  const cases: [string, string][] = [
    ["not a url", "URL 형식이 올바르지 않습니다."],
    ["ftp://example.com/x", "http/https URL만 지원합니다."],
    ["http://localhost/x", "허용되지 않는 주소입니다."],
    ["http://10.0.0.1/x", "허용되지 않는 주소입니다."],
    ["http://169.254.169.254/latest/meta-data", "허용되지 않는 주소입니다."],
    ["http://metadata.google.internal/x", "허용되지 않는 주소입니다."],
  ];
  for (const [url, error] of cases) {
    const res = await api("/fetch", { ...jsonBody({ url }), headers: user.auth });
    expect(res.status, url).toBe(400);
    expect(((await res.json()) as { error: string }).error, url).toBe(error);
  }
});
