// 배포 산출물의 라우팅 계약 — 인쇄된 라벨의 QR이 향하는 경로가 살아 있는지 검증한다.
//
// 이 저장소에는 _redirects·_routes.json·404.html이 하나도 없다. 인쇄된 모든 QR이 작동하는 이유는
// "매치되는 파일이 없는 경로엔 index.html을 준다"는 Cloudflare Pages의 암묵적 폴백 하나뿐이고,
// 그 사실이 저장소 어디에도 적혀 있지 않았다. 배포 디렉터리 구조를 바꾸는 변경(#55 MPA 전환)이
// 이걸 조용히 깨면 인쇄된 라벨이 전부 죽는다 — 코드와 달리 회수할 수 없다.
//
// 그래서 여기서 계약을 명시적으로 못 박는다. 사용자 동선(smoke.spec.ts)이 아니라 "서버가 무엇을
// 돌려주는가"를 보므로 브라우저 대신 request 픽스처를 쓴다.
import { expect, test } from "@playwright/test";

/** 조회 페이지(index.html)와 덱(deck.html)을 구분하는 안정적 표식 */
const VIEWER = "<title>BEAN-HOARDER — 원두 조회</title>";
const DECK = "<title>BEAN-HOARDER — 내 원두 덱</title>";
const DEMO = "<title>BEAN-HOARDER — 데모 덱</title>";

test("QR 계약: 등록된 KEY 경로가 조회 페이지로 떨어진다", async ({ request }) => {
  const res = await request.get("/DEMO26-001");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toMatch(/text\/html/);
  expect(await res.text()).toContain(VIEWER);
});

// 미등록 KEY도 조회 페이지가 받아 "등록되지 않은 코드입니다" 안내를 띄운다.
// 서버가 404를 돌려주면 그 안내를 보여줄 기회조차 없다.
test("QR 계약: 미등록 KEY도 404가 아니라 조회 페이지가 응답한다", async ({ request }) => {
  const res = await request.get("/ZZZZ99-999");
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain(VIEWER);
});

// 라벨의 KEY에는 슬래시가 없지만, 폴백이 경로 깊이와 무관하다는 사실 자체가 계약의 일부다.
// 이게 깨졌다는 건 폴백 규칙이 통째로 달라졌다는 신호다.
test("QR 계약: 깊은 경로도 조회 페이지로 폴백된다", async ({ request }) => {
  const res = await request.get("/aaa/bbb");
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain(VIEWER);
});

// 확장자 없는 pretty URL — 덱은 /deck 으로 안내되고 README·랩 링크가 이 형태를 쓴다.
test("라우팅 계약: /deck 이 확장자 없이 덱 페이지로 해석된다", async ({ request }) => {
  const res = await request.get("/deck");
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain(DECK);
});

// 데모 덱은 로그인도 D1도 없이 떠야 한다 — 첫 방문자가 서비스를 확인하는 유일한 창구다.
// 카드가 링크하는 KEY는 실제 조회 페이지로 이어져야 하므로 그 경로까지 함께 확인한다.
test("라우팅 계약: /demo 가 정적 데모 덱으로 해석되고 카드 링크가 살아 있다", async ({ request }) => {
  const res = await request.get("/demo");
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain(DEMO);

  // 정적 페이지라 KEY는 번들 안에 있다 — 스크립트를 받아 첫 KEY를 뽑아 조회 페이지를 확인한다
  const html = await (await request.get("/demo")).text();
  const src = html.match(/<script[^>]+src="([^"]+demo[^"]*)"/)?.[1];
  expect(src, "데모 페이지가 자기 번들을 참조하지 않는다").toBeTruthy();
  const bundle = await (await request.get(src as string)).text();
  const key = bundle.match(/[A-Z0-9]{4}\d{2}-\d{3}/)?.[0];
  expect(key, "데모 번들에 원두 KEY가 들어 있지 않다").toBeTruthy();

  const card = await request.get(`/${key}`);
  expect(card.status()).toBe(200);
  expect(await card.text()).toContain(VIEWER);
});

// 조회 페이지가 실제로 동작하려면 함께 딸려오는 자산도 서빙돼야 한다.
//
// ⚠️ 여기서 상태 코드만 보면 안 된다. 없는 경로는 폴백으로 index.html이 200으로 나가므로,
// 번들 경로가 틀려도 "200"이라 통과해 버린다(실제로 MPA 전환 때 이 함정에 걸렸다).
// 그래서 content-type까지 확인하고, 번들 경로는 하드코딩하지 않고 HTML에서 뽑아 쓴다.
test("라우팅 계약: 조회 페이지가 참조하는 자산이 실제로 서빙된다", async ({ request }) => {
  const css = await request.get("/theme.css");
  expect(css.status()).toBe(200);
  expect(css.headers()["content-type"]).toMatch(/text\/css/);

  const html = await (await request.get("/")).text();
  const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1] as string);
  expect(srcs.length, "조회 페이지가 스크립트를 하나도 참조하지 않는다").toBeGreaterThan(0);
  for (const src of srcs) {
    const res = await request.get(src);
    expect(res.status(), src).toBe(200);
    expect(res.headers()["content-type"], src).toMatch(/javascript/);
  }
});

test("API는 폴백에 삼켜지지 않는다 — 미등록 KEY는 JSON 404", async ({ request }) => {
  const res = await request.get("/api/bean/ZZZZ99-999");
  expect(res.status()).toBe(404);
  expect(await res.json()).toEqual({ ok: false, error: "미등록 KEY" });
});
