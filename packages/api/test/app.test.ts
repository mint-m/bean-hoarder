// API 통합 테스트 — 기존 [[path]].js 라우터의 계약(경로·상태 코드·메시지·응답 형태)을
// Hono 이식본이 그대로 지키는지 실제 workerd + D1에서 검증한다.
// 이 테스트가 곧 API 계약 문서다: 여기 담긴 상태 코드·메시지를 바꾸는 변경은 계약 파괴다.
import { env } from "cloudflare:test";
import { expect, test, vi } from "vitest";
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

  // 라벨은 스키마(BEAN_FIELDS)에서 파생되므로 오류 문구가 곧 계약이다. PACKAGE_DATE의 표시 이름을
  // "패키징일"에서 "소분일"로 바꾼 것은 의도된 변경이라(로스터가 포장한 날이 아니라 내가 나눠 담은
  // 날), 그 사실을 여기 남긴다 — 저장 키는 PACKAGE_DATE 그대로다.
  const noPack = await api("/beans", {
    ...jsonBody({ ROASTERY: "R", ORIGIN: "KENYA", VARIETY: "SL28", PROCESS: "P", ROAST_DATE: "26.07.01" }),
    headers: user.auth,
  });
  expect(noPack.status).toBe(400);
  expect(((await noPack.json()) as { error: string }).error).toBe("필수 항목 누락: 소분일");

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

// 백업의 목적은 "실수 삭제·악의적 변조를 백업 시점으로 되돌림"이다. 그런데 ARCHIVED가 CSV에
// 아예 없어서 보관 상태만 그 규칙 밖에 있었다 — 빈 DB에 복원하면 접어둔 원두가 전부 되살아났다.
test("export/import: 보관(archived) 상태가 백업을 통과한다", async () => {
  const user = await signupUser();
  const { data } = await addBean(user.auth);
  const setArchived = (archived: boolean) =>
    api(`/bean/${data.key}/archive`, {
      method: "PATCH",
      body: JSON.stringify({ archived }),
      headers: user.auth,
    });

  await setArchived(true);
  const backup = await (await api("/export.csv", { headers: user.auth })).text();
  expect(backup).toContain("COFFEE_NAME,ARCHIVED"); // 고정 후미 열
  expect(backup).toContain(`${data.key},`);
  expect(backup.trimEnd().endsWith(",1")).toBe(true); // boolean이 아니라 0/1 (엑셀 왕복 대비)

  // 보관을 해제해 두고 백업으로 복원 → 백업 시점(보관됨)으로 돌아와야 한다
  await setArchived(false);
  const res = await api("/import", { method: "POST", body: backup, headers: user.auth });
  expect(((await res.json()) as { updated: number }).updated).toBe(1);

  const bean = (await (await api(`/bean/${data.key}`)).json()) as { bean: { ARCHIVED: boolean } };
  expect(bean.bean.ARCHIVED).toBe(true);
});

// ARCHIVED 열이 생기기 전에 받아둔 백업 파일은 보관 상태를 "활성"이라 말하는 게 아니라
// 모르는 것이다 — 없는 정보로 덮어쓰면 접어둔 원두가 옛 파일 한 번에 전부 되살아난다.
test("import: ARCHIVED 열이 없는 옛 백업은 보관 상태를 덮어쓰지 않는다", async () => {
  const user = await signupUser();
  const { data } = await addBean(user.auth);
  await api(`/bean/${data.key}/archive`, {
    method: "PATCH",
    body: JSON.stringify({ archived: true }),
    headers: user.auth,
  });

  // 열 매핑은 위치가 아니라 이름 기준이라, 옛 형식은 부분 열로 재현할 수 있다
  const legacy = `KEY,ROASTERY,ORIGIN,ROAST_DATE,PACKAGE_DATE\r\n${data.key},NEW ROASTERY,KENYA,26.06.28,26.07.03`;
  const res = await api("/import", { method: "POST", body: legacy, headers: user.auth });
  expect(((await res.json()) as { updated: number }).updated).toBe(1);

  const bean = (await (await api(`/bean/${data.key}`)).json()) as {
    bean: { ARCHIVED: boolean; ROASTERY: string };
  };
  expect(bean.bean.ROASTERY).toBe("NEW ROASTERY"); // 복원 자체는 확실히 일어났고
  expect(bean.bean.ARCHIVED).toBe(true); // 보관 상태만 건드리지 않았다
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

// AI 인식 대행 — 서비스 키로 대신 불러 주는 몫에만 한도가 걸린다.
// 키가 없는 배포에서도 서비스는 살아 있어야 하므로 503 + fallback으로 알려 클라이언트가 규칙 기반으로 내려간다.
test("AI 대행: 서비스 키가 없으면 503 + fallback (클라이언트가 규칙 기반으로 내려갈 수 있게)", async () => {
  const user = await signupUser();
  const res = await api("/extract", {
    method: "POST",
    headers: user.auth,
    body: JSON.stringify({ text: "Ethiopia Washed" }),
  });
  expect(res.status).toBe(503);
  const body = (await res.json()) as { fallback?: boolean };
  expect(body.fallback).toBe(true);
});

// ── 모델 폴백 — 같은 키라도 모델마다 404·429·503이 갈린다(AI_MODELS 주석 참고).
// 하나만 부르던 시절 그 모델이 막히자 기능 전체가 조용히 죽었고, 클라이언트는 설계상 규칙 기반으로
// 내려가므로 아무도 알아채지 못했다. 그래서 "다음 후보로 넘어간다"를 계약으로 못 박는다.
async function extractWithKey(auth: { Authorization: string }): Promise<Response> {
  return app.fetch(
    new Request("https://bnhd.pages.dev/api/extract", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Ethiopia Gedeb Washed" }),
    }),
    { ...env, GEMINI_API_KEY: "test-key" } as typeof env,
  );
}

/** Gemini generateContent 성공 응답 모양 — parseAiResponse가 읽는 경로만 채운다 */
function aiOk(fields: Record<string, string>): Response {
  return Response.json({
    candidates: [{ content: { parts: [{ text: JSON.stringify(fields) }] } }],
  });
}

test("AI 대행: 앞 후보가 429면 다음 모델로 넘어가 성공한다", async () => {
  const { AI_MODELS } = await import("@bnhd/autofill/ai");
  const user = await signupUser();
  const calls: string[] = [];
  vi.stubGlobal("fetch", (input: RequestInfo | URL) => {
    calls.push(String(input));
    // 첫 후보만 막고(무료 등급 할당 0으로 실제 겪은 상황) 두 번째는 정상 응답
    return Promise.resolve(
      calls.length === 1
        ? Response.json({ error: { message: "quota limit 0" } }, { status: 429 })
        : aiOk({ ORIGIN: "ETHIOPIA" }),
    );
  });
  try {
    const res = await extractWithKey(user.auth);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; fields: Record<string, string> };
    expect(body.ok).toBe(true);
    expect(body.fields.ORIGIN).toBe("ETHIOPIA");
    expect(calls.length).toBe(2);
    expect(calls[0]).toContain(AI_MODELS[0] as string);
    expect(calls[1]).toContain(AI_MODELS[1] as string);
  } finally {
    vi.unstubAllGlobals();
  }
});

test("AI 대행: 후보가 전부 실패하면 502 + fallback이고 예약한 몫을 되돌린다", async () => {
  const { AI_MODELS } = await import("@bnhd/autofill/ai");
  const { remainingAiCalls } = await import("../src/lib/ai-quota");
  const { createDb } = await import("../src/db");
  const user = await signupUser();
  const db = createDb(env.DB);
  const before = await remainingAiCalls(db, user.usercode);
  let calls = 0;
  vi.stubGlobal("fetch", () => {
    calls++;
    return Promise.resolve(Response.json({ error: { message: "overloaded" } }, { status: 503 }));
  });
  try {
    const res = await extractWithKey(user.auth);
    expect(res.status).toBe(502);
    expect((await res.json()) as { fallback?: boolean }).toMatchObject({ fallback: true });
    expect(calls).toBe(AI_MODELS.length);
    // 우리 쪽 사정으로 못 불러 준 것이므로 사용자 하루 몫은 그대로여야 한다
    expect(await remainingAiCalls(db, user.usercode)).toBe(before);
  } finally {
    vi.unstubAllGlobals();
  }
});

// 400은 모델이 아니라 우리가 잘못 보낸 것이다 — 후보를 바꿔도 같으므로 더 시도하지 않는다
// (한 요청이 후보 수만큼 상위 호출을 곱해 마감 시한을 잡아먹지 않게).
test("AI 대행: 400은 다음 후보로 넘어가지 않는다", async () => {
  const user = await signupUser();
  let calls = 0;
  vi.stubGlobal("fetch", () => {
    calls++;
    return Promise.resolve(Response.json({ error: { message: "bad request" } }, { status: 400 }));
  });
  try {
    const res = await extractWithKey(user.auth);
    expect(res.status).toBe(502);
    expect(calls).toBe(1);
  } finally {
    vi.unstubAllGlobals();
  }
});

test("AI 대행 할당량: 계정별 하루 한도를 넘기면 429 + fallback, 남은 횟수는 정확히 센다", async () => {
  const { reserveAiCall, remainingAiCalls, setAiQuotaForTest } = await import("../src/lib/ai-quota");
  const { createDb } = await import("../src/db");
  const restore = setAiQuotaForTest(2, 100); // 계정 2회로 낮춰 경계를 바로 검증
  try {
    const db = createDb(env.DB);
    const uc = `Q${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    expect(await remainingAiCalls(db, uc)).toBe(2);

    expect(await reserveAiCall(db, uc)).toBe(1); // 1회차 → 1회 남음
    expect(await reserveAiCall(db, uc)).toBe(0); // 2회차 → 0회 남음
    expect(await reserveAiCall(db, uc)).toBeNull(); // 3회차 → 한도 초과
    expect(await remainingAiCalls(db, uc)).toBe(0);
  } finally {
    restore();
  }
});

test("AI 대행 할당량: 전역 한도는 계정이 달라도 함께 소진된다 (한 사람이 하루치를 독식하지 못하게)", async () => {
  const { reserveAiCall, remainingAiCalls, setAiQuotaForTest } = await import("../src/lib/ai-quota");
  const { createDb } = await import("../src/db");
  const restore = setAiQuotaForTest(50, 2); // 전역 2회
  try {
    const db = createDb(env.DB);
    // 전역 버킷은 날짜 단위 공유라 앞 테스트의 사용분이 남아 있을 수 있다 — 0으로 맞추고 시작
    await env.DB.prepare("DELETE FROM ai_usage WHERE bucket LIKE 'global:%'").run();
    const a = `G${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    const b = `H${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    expect(await reserveAiCall(db, a)).not.toBeNull();
    expect(await reserveAiCall(db, b)).not.toBeNull();
    expect(await reserveAiCall(db, b)).toBeNull(); // 전역 소진 — 계정 한도는 아직 남았는데도 막힌다

    // 전역에 막힌 요청은 그 사용자의 하루 몫을 깎지 않는다. 계정 버킷을 먼저 올린 뒤 전역을
    // 검사하는 구조라, 되돌리지 않으면 AI를 한 번도 못 쓴 사람이 재시도만으로 자기 한도를
    // 소진하고 전역이 풀린 뒤에도 막힌다.
    const c = `I${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    const before = await remainingAiCalls(db, c);
    expect(await reserveAiCall(db, c)).toBeNull();
    expect(await reserveAiCall(db, c)).toBeNull();
    expect(await remainingAiCalls(db, c)).toBe(before);
  } finally {
    restore();
  }
});

test("AI 대행 할당량: 호출이 실패하면 예약을 되돌린다 (우리 잘못으로 사용자 몫을 깎지 않는다)", async () => {
  const { reserveAiCall, releaseAiCall, remainingAiCalls, setAiQuotaForTest } = await import(
    "../src/lib/ai-quota"
  );
  const { createDb } = await import("../src/db");
  const restore = setAiQuotaForTest(3, 100);
  try {
    const db = createDb(env.DB);
    const uc = `R${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    await reserveAiCall(db, uc);
    expect(await remainingAiCalls(db, uc)).toBe(2);
    await releaseAiCall(db, uc);
    expect(await remainingAiCalls(db, uc)).toBe(3);
  } finally {
    restore();
  }
});
