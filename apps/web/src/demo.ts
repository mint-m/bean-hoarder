// 정적 데모 덱(/demo) 진입점 — 로그인 없이 서비스가 어떻게 보이는지 구경하는 자리.
//
// 데이터는 API가 아니라 저장소에 고정된 demo-beans.json에서 온다. 카드를 누르면 가는 상세
// (/{KEY})도 같은 파일로 그려지므로(viewer.ts의 DEMO 접두 분기) **데모는 D1을 전혀 타지 않는다.**
//
// 이 격리가 요점이다. 예전에는 공개 계정으로 로그인해 둘러보게 했고, 그다음엔 카드만 실제
// 조회에 맡겼는데 — 둘 다 "라이브와 저장소 중 어느 쪽이 진짜냐"를 만들어 동기화 문제를 낳았다.
// 데모를 통째로 콘텐츠로 취급하면 그 질문이 사라진다. 바뀌는 시점은 배포뿐이다.
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
