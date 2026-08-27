// 월렛 카드 마크업 검증 — 덱(/deck)과 정적 데모(/demo)가 함께 쓰는 한 벌이다.
//
// 카드가 그리는 값은 전부 escapeHtml을 지나야 한다. KEY만 예외였는데, 서버 채번과
// demo-beans.test.ts의 KEY_RE라는 "바깥 보장"에 기대는 유일한 자리였다 — 그 보장이
// 흔들려도 마크업이 깨지지 않게 규칙을 카드 안으로 들여왔고, 여기가 그 고정선이다.
import { expect, test, vi } from "vitest";
import { sortBeans, walletCardHTML } from "./wallet-card";

// 카드 색(coffee-color)이 테마를 읽으므로 Node 환경에서는 document를 가짜로 심는다
// (session 패키지 테스트가 localStorage를 심는 것과 같은 이유 — 브라우저 모듈의 순수 출력만 본다).
vi.stubGlobal("document", { documentElement: { dataset: {} } });

const card = (over: Record<string, unknown>) =>
  walletCardHTML({ KEY: "TEST26-001", ROASTERY: "R", ORIGIN: "ETHIOPIA", ...over }, { notes: true });

test("KEY에 따옴표가 있어도 data-key 속성을 벗어나지 못한다", () => {
  const html = card({ KEY: '"><img src=x onerror=alert(1)>' });
  expect(html).not.toContain("<img");
  expect(html).toContain("&quot;&gt;&lt;img");
});

test("KEY의 꺾쇠는 마크업이 되지 않는다", () => {
  expect(card({ KEY: "<b>x</b>" })).not.toContain("<b>x</b>");
});

test("보관 카드는 최하단으로, 나머지는 최신 KEY 먼저", () => {
  const rows = [{ KEY: "AAAA26-001" }, { KEY: "AAAA26-003", ARCHIVED: true }, { KEY: "AAAA26-002" }];
  expect(sortBeans(rows).map((b) => b.KEY)).toEqual(["AAAA26-002", "AAAA26-001", "AAAA26-003"]);
});
