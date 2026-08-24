// 세션 이행(migrateLegacyPin) 계약 — 응답 모양별로 PIN을 지울지/세션을 저장할지가 갈린다.
//
// #56: 예전엔 조회·덱과 랩이 이 로직을 각자 복제해 usercode 검사가 서로 달랐다. 이제 구현은
// 하나뿐이므로, 이 테스트는 그 단일 구현의 판정을 응답 모양마다 못 박아 재분기(再分岐)를 막는다.
//
// 브라우저 모듈이라 Node 유닛 환경에서는 localStorage·fetch를 가짜로 심어 평가한다.
import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import { clearSession, loadSession, migrateLegacyPin, saveSession } from "./index";

function fakeStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

/** fetch 스텁: 주어진 status·JSON 바디로 응답, 또는 던지기(네트워크 오류) */
function stubFetch(opts: { status?: number; body?: unknown; throws?: boolean }): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      if (opts.throws) throw new TypeError("network down");
      return {
        status: opts.status ?? 200,
        json: async () => opts.body,
      } as Response;
    }),
  );
}

beforeEach(() => {
  // 각 케이스는 자체 localStorage를 심는다 (기본: usercode+pin 있고 session 없음 = 이행 대상)
  vi.stubGlobal("localStorage", fakeStorage({ bh_usercode: "MKPK", bh_pin: "0000" }));
});
afterEach(() => vi.unstubAllGlobals());

test("정상 응답(ok·token·usercode) — 세션 저장, PIN 제거", async () => {
  stubFetch({ body: { ok: true, token: "bhs_abc", usercode: "MKPK" } });
  const acc = await migrateLegacyPin();
  assert.equal(acc.token, "bhs_abc");
  assert.equal(acc.usercode, "MKPK");
  assert.equal(localStorage.getItem("bh_session"), "bhs_abc");
  assert.equal(localStorage.getItem("bh_pin"), null, "성공 시 PIN 제거");
});

test("usercode 누락(ok·token만) — 저장하지 않고 PIN을 지운다 (확정 거부)", async () => {
  // 예전 조회·덱 사본은 여기서 usercode=undefined를 저장해 "undefined" 문자열 버그를 냈다(#56).
  stubFetch({ body: { ok: true, token: "bhs_abc" } });
  const acc = await migrateLegacyPin();
  assert.equal(acc.token, "", "세션 미저장");
  assert.equal(localStorage.getItem("bh_session"), null);
  assert.notEqual(localStorage.getItem("bh_usercode"), "undefined", '"undefined" 문자열이 저장되지 않음');
  assert.equal(localStorage.getItem("bh_pin"), null, "확정 거부라 PIN 제거");
});

test("자격 거부(ok=false, 4xx) — PIN 제거, 세션 없음", async () => {
  stubFetch({ status: 401, body: { ok: false, error: "잘못된 자격" } });
  const acc = await migrateLegacyPin();
  assert.equal(acc.token, "");
  assert.equal(localStorage.getItem("bh_pin"), null, "4xx 확정 거부라 PIN 제거");
});

test("레이트리밋(429) — PIN 유지, 다음 방문에 재시도", async () => {
  stubFetch({ status: 429, body: { ok: false } });
  await migrateLegacyPin();
  assert.equal(localStorage.getItem("bh_pin"), "0000", "일시 오류라 PIN 유지");
});

test("서버 오류(5xx) — PIN 유지", async () => {
  stubFetch({ status: 503, body: { ok: false } });
  await migrateLegacyPin();
  assert.equal(localStorage.getItem("bh_pin"), "0000", "일시 오류라 PIN 유지");
});

test("네트워크 예외 — PIN 유지", async () => {
  stubFetch({ throws: true });
  await migrateLegacyPin();
  assert.equal(localStorage.getItem("bh_pin"), "0000", "네트워크 오류라 PIN 유지");
});

test("이미 세션이 있으면 이행을 건너뛴다 (로그인 호출 없음)", async () => {
  vi.stubGlobal("localStorage", fakeStorage({ bh_usercode: "MKPK", bh_pin: "0000", bh_session: "bhs_x" }));
  const fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  const acc = await migrateLegacyPin();
  assert.equal(acc.token, "bhs_x");
  assert.equal(fetchSpy.mock.calls.length, 0, "이미 세션 있으면 /api/login 미호출");
});

// 데모 관리자 플래그 — 관리자로 들어왔다 다른 계정으로 갈아탈 때 남으면 그 계정의 화면 판정이
// 흐려진다. saveSession이 관리자가 아닐 때 확실히 지우는지가 요점.
test("saveSession: admin 플래그는 켤 때만 남고 다음 로그인에서 지워진다", () => {
  globalThis.localStorage = fakeStorage();

  saveSession("DEMO", "bhs_1", true);
  assert.equal(loadSession().admin, true);

  saveSession("ABCD", "bhs_2"); // 평범한 계정으로 갈아타기
  assert.equal(loadSession().admin, false);
  assert.equal(loadSession().usercode, "ABCD");

  saveSession("DEMO", "bhs_3", true);
  clearSession();
  assert.equal(loadSession().admin, false);
});
