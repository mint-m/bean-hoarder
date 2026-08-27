// 덱의 "중앙 카드 펼침" — 터치 기기에서 호버를 대신하는 트리거.
//
// 카드 펼침은 원래 :hover 하나로만 열렸다. 그런데 폰에는 호버가 없어서, 스택 특성상 가려지지
// 않는 맨 아래 카드만 본문이 보였다 — 나머지는 눌러서 상세로 떠나는 것 말고는 볼 방법이 없었다.
// 그래서 터치에서는 화면을 고정하고, 스크롤에 따라 **중앙에 온 카드**를 펼친다.
//
// 내 원두 덱(/deck)과 정적 데모 덱(/demo)이 같은 카드(lib/wallet-card.ts)와 같은 스타일
// (public/deck.css)을 쓰므로 인터랙션도 여기 한 벌만 둔다 — 한쪽만 고치면 데모가 실제와 달라진다.

/** 가장 가까운 값의 인덱스. 후보가 없으면 -1, 동률이면 앞선 것. */
export function nearestToCenter(centers: number[], target: number): number {
  let best = -1;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < centers.length; i++) {
    const d = Math.abs((centers[i] as number) - target);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/** 스크롤 컨테이너 기준 레이아웃 위치 — transform이 걸려 있어도 흔들리지 않는다. */
function offsetTopWithin(node: HTMLElement, scroller: HTMLElement): number {
  let y = 0;
  let n: HTMLElement | null = node;
  while (n && n !== scroller) {
    y += n.offsetTop;
    n = n.offsetParent as HTMLElement | null;
  }
  return y;
}

/**
 * 중앙 카드에 `.active`를 붙인다 (deck.css가 호버와 같은 모습으로 그린다).
 *
 * @param deck 카드들의 부모(`.deck`)
 * @returns 구독 해제 — 덱은 필터·삭제로 다시 렌더되므로 호출부가 렌더마다 이걸 부르고 다시 건다.
 */
export function enableCenterFocus(deck: HTMLElement): () => void {
  const noop = () => {};
  // 호버가 있는 기기는 :hover가 이미 같은 일을 한다 — 두 트리거가 겹치면 서로 싸운다.
  if (!window.matchMedia("(hover: none)").matches) return noop;
  // 스크롤러는 페이지의 <main> — 덱만 따로 스크롤시키면 데모의 안내문(.lede)이 화면을 잡아먹어
  // 정작 카드가 설 자리가 없다. 틀(톱바·푸터)은 고정되고 본문만 움직인다.
  const scroller = deck.closest("main");
  if (!scroller) return noop;
  const cards = Array.from(deck.querySelectorAll<HTMLElement>(".wcard"));
  if (!cards.length) return noop;

  let raf = 0;
  const update = (): void => {
    raf = 0;
    const mid = scroller.clientHeight / 2;
    const first = cards[0] as HTMLElement;

    // 위아래로 스크롤 여유를 만든다 — 없으면 양 끝 카드가 중앙에 설 수 없다.
    //  · 아래: 마지막 카드가 중앙까지 올라올 만큼. (이 여유가 곧 스크롤 범위 자체이기도 하다)
    //  · 위: 첫 카드가 중앙까지 **내려올** 만큼. 맨 위에서 이미 중앙을 지나쳐 있으면 첫 카드는
    //    영원히 펼쳐지지 않는다 — 실제로 그 상태였다(카드 중심 289 < 화면 중심 331).
    // 카드 높이는 CSS(--w-card-h)가 정하므로 실측한다 — 여기 숫자를 또 적으면 둘이 갈라진다.
    scroller.style.setProperty("--deck-pad", `${Math.max(0, Math.round(mid - first.offsetHeight / 2))}px`);
    // 지금 걸려 있는 위 여백에 "중앙까지 모자란 만큼"을 더한다. 차이만 넣으면 리사이즈 때
    // 이미 들어간 여백을 잊고 값이 무너진다.
    const padTop = parseFloat(getComputedStyle(deck).paddingTop) || 0;
    const firstCenter = offsetTopWithin(first, scroller) + first.offsetHeight / 2;
    deck.style.setProperty("--deck-pad-top", `${Math.max(0, Math.round(padTop + mid - firstCenter))}px`);

    // 여백을 적용한 **뒤에** 다시 재서 고른다 — 여백이 카드 위치를 옮기므로 적용 전 좌표로
    // 판정하면 첫 화면에서 엉뚱한 카드가 펼쳐진 채로 시작한다(스크롤해야 제자리를 찾는다).
    const centers = cards.map((c) => offsetTopWithin(c, scroller) + c.offsetHeight / 2);
    const i = nearestToCenter(centers, scroller.scrollTop + mid);
    for (let n = 0; n < cards.length; n++) {
      (cards[n] as HTMLElement).classList.toggle("active", n === i);
    }
  };
  const schedule = (): void => {
    if (!raf) raf = requestAnimationFrame(update);
  };

  scroller.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  update();

  return () => {
    scroller.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);
    if (raf) cancelAnimationFrame(raf);
    scroller.style.removeProperty("--deck-pad");
    deck.style.removeProperty("--deck-pad-top");
    for (const c of cards) c.classList.remove("active");
  };
}
