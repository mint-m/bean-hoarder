// 덱 카드 펼침 — 터치 기기에서 호버를 대신하는 트리거.
//
// 카드 펼침은 원래 :hover 하나로만 열렸다. 그런데 폰에는 호버가 없어서, 스택 특성상 가려지지
// 않는 맨 아래 카드만 본문이 보였다 — 나머지는 눌러서 상세로 떠나는 것 말고는 볼 방법이 없었다.
// 그래서 터치에서는 덱만 스크롤 영역으로 두고(deck.css), 기준선에 온 카드를 펼친다.
//
// 기준선은 덱 상단에서 카드 반 장 아래다. 처음엔 화면 한가운데로 잡았는데, 그러면 첫 카드를
// 그 선까지 내리려고 위쪽에 카드 반 장만큼 빈 공간이 필요해 안내문과 첫 카드 사이가 떠 보였다.
// 선을 위로 올리면 맨 위에서 첫 카드가 곧바로 선 위에 서므로 그 여백이 사라진다.
//
// 내 원두 덱(/deck)과 정적 데모 덱(/demo)이 같은 카드(lib/wallet-card.ts)와 같은 스타일
// (public/deck.css)을 쓰므로 인터랙션도 여기 한 벌만 둔다 — 한쪽만 고치면 데모가 실제와 달라진다.

/** 덱의 기본 위 여백 (deck.css의 `.deck { padding-top }`) — 기준선이 이만큼 내려간다. */
const TOP_GAP = 4;

/**
 * 펼침을 옮기기 전에 요구하는 최소 우위(px).
 *
 * 경계에서는 두 카드가 거의 같은 거리에 있어, 관성 스크롤 끝의 미세한 떨림만으로 펼침이
 * 오갈 수 있다. 한 번 오갈 때마다 0.18초 전환이 다시 시작되므로 화면이 떠는 것처럼 보인다.
 * 카드 간격이 66px(--w-card-h − --w-peek)이라 이 정도 여유는 조작감을 무디게 하지 않는다.
 */
const SWITCH_MARGIN = 8;

/** 기준선에 가장 가까운 카드의 인덱스. 카드가 없으면 -1, 동률이면 앞선 것. */
export function nearestToLine(centers: number[], line: number): number {
  let best = -1;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < centers.length; i++) {
    const d = Math.abs((centers[i] as number) - line);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/** 덱 기준 레이아웃 위치 — 펼침 transform이 걸려 있어도 흔들리지 않는다(화면 좌표는 흔들린다). */
function offsetTopWithin(node: HTMLElement, deck: HTMLElement): number {
  let y = 0;
  let n: HTMLElement | null = node;
  while (n && n !== deck) {
    y += n.offsetTop;
    n = n.offsetParent as HTMLElement | null;
  }
  return y;
}

/**
 * 기준선에 온 카드에 `.active`를 붙인다 (deck.css가 호버와 같은 모습으로 그린다).
 *
 * @returns 구독 해제 — 덱은 필터·삭제로 다시 렌더되므로 호출부가 렌더마다 이걸 부르고 다시 건다.
 */
export function enableCardFocus(deck: HTMLElement): () => void {
  const noop = () => {};
  // 호버가 있는 기기는 :hover가 이미 같은 일을 한다 — 두 트리거가 겹치면 서로 싸운다.
  if (!window.matchMedia("(hover: none)").matches) return noop;
  const cards = Array.from(deck.querySelectorAll<HTMLElement>(".wcard"));
  if (!cards.length) return noop;

  let line = 0;
  let centers: number[] = [];
  let active = -1;

  /**
   * 레이아웃에서 오는 값은 여기서만 읽는다. 스크롤 중에 재면 매 프레임 강제 리플로우가 걸리고,
   * 여백까지 다시 쓰면 브라우저가 스크롤 위치를 보정하면서 화면이 눈에 띄게 튄다.
   * 카드 높이는 CSS(--w-card-h)가 정하므로 실측한다 — 여기 숫자를 또 적으면 둘이 갈라진다.
   */
  const measure = (): void => {
    const cardH = (cards[0] as HTMLElement).offsetHeight;
    line = TOP_GAP + cardH / 2;
    // 마지막 카드도 기준선까지 올라올 수 있는 스크롤 여유 (이 여백이 곧 스크롤 범위다)
    const pad = Math.max(0, Math.round(deck.clientHeight - line - cardH / 2));
    deck.style.setProperty("--deck-pad-bottom", `${pad}px`);
    centers = cards.map((c) => offsetTopWithin(c, deck) + c.offsetHeight / 2);
  };

  /** 스크롤 경로에서 만지는 것은 scrollTop 하나뿐 — 바뀔 때만 클래스를 건드린다. */
  const paint = (): void => {
    const pos = deck.scrollTop + line;
    const i = nearestToLine(centers, pos);
    if (i === active) return;
    if (active >= 0) {
      const gain = Math.abs((centers[active] as number) - pos) - Math.abs((centers[i] as number) - pos);
      if (gain < SWITCH_MARGIN) return; // 아직 바꿀 만큼 앞서지 않았다
      (cards[active] as HTMLElement).classList.remove("active");
    }
    if (i >= 0) (cards[i] as HTMLElement).classList.add("active");
    active = i;
  };

  let raf = 0;
  const onScroll = (): void => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      paint();
    });
  };
  const onResize = (): void => {
    measure();
    paint();
  };

  measure();
  paint();
  deck.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize);

  return () => {
    deck.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onResize);
    if (raf) cancelAnimationFrame(raf);
    deck.style.removeProperty("--deck-pad-bottom");
    for (const c of cards) c.classList.remove("active");
  };
}
