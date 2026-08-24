// 정적 데모 덱(/demo) 진입점 — 로그인 없이 서비스가 어떻게 보이는지 구경하는 자리.
//
// 데이터는 API가 아니라 저장소에 고정된 demo-beans.json에서 온다. 예전에는 공개 계정
// (DEMO/0000)으로 로그인해 둘러보게 했는데, 자격증명이 공개된 계정은 쓰기를 막아 두어야 하고
// 그러면 그 계정을 관리할 방법이 함께 사라진다. 구경거리를 정적 페이지로 떼어내면 DEMO는
// 평범한 개인 계정으로 돌아가고, 이 페이지는 D1도 세션도 필요로 하지 않는다.
//
// 카드를 누르면 실제 조회 화면(/{KEY})으로 간다 — QR을 찍었을 때와 같은 화면을 보여주는 것이
// 데모의 목적이라, 상세는 따로 만들지 않고 공개 조회를 그대로 쓴다. 그래서 여기 KEY들은
// 라이브 D1에 실제로 있어야 한다(로컬·e2e는 db/seed.sql이 심는다 — 둘 다 이 JSON에서 파생).
import type { HeadlineRow } from "@bnhd/schema/headline";
import demoBeans from "./demo-beans.json";
import { el } from "./lib/dom";
import { sortBeans, walletCardHTML } from "./lib/wallet-card";

const deck = el("deck");
deck.innerHTML = sortBeans(demoBeans as HeadlineRow[])
  .map((b) => walletCardHTML(b, { notes: true }))
  .join("");

// 덱과 달리 카드 메뉴(보관·삭제)가 없다 — 남의 기록을 구경하는 페이지라 열 수 있는 동작이
// 상세보기뿐이다. 메뉴 버튼은 지우고 카드 전체를 링크처럼 쓴다.
for (const node of deck.querySelectorAll<HTMLElement>(".wcard")) {
  node.querySelector(".wcard-menu")?.remove();
  const key = node.dataset.key as string;
  const open = () => {
    location.href = `/${key}`;
  };
  node.addEventListener("click", open);
  node.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      open();
    }
  });
}
