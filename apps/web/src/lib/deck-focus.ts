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
  // 호버가 있는 기기는 :hover가 이미 같은 일을 한다 — 두 트리거가 겹치면 서로 싸운다.
  // 다만 **로드 시점의 값으로 한 번만 판단하면 안 된다.** 판정이 뒤집혀도(개발자도구의 기기 모드,
  // 마우스를 뺀 투인원) 붙지 않은 채로 남아 스크롤 활주로가 0이 되고 덱이 통째로 안 움직인다.
  // 미디어 질의를 계속 듣고 붙였다 뗀다.
  const mq = window.matchMedia("(hover: none)");
  let detach: (() => void) | null = null;
  const sync = (): void => {
    if (mq.matches && !detach) detach = attach(deck);
    else if (!mq.matches && detach) {
      detach();
      detach = null;
    }
  };
  mq.addEventListener("change", sync);
  sync();
  return () => {
    mq.removeEventListener("change", sync);
    detach?.();
  };
}

/** 실제 구독 — 터치 기기일 때만 붙는다. */
function attach(deck: HTMLElement): () => void {
  const noop = () => {};
  const cards = Array.from(deck.querySelectorAll<HTMLElement>(".wcard"));
  if (!cards.length) return noop;

  let line = 0;
  let centers: number[] = [];
  let active = -1;

  /**
   * 레이아웃에서 오는 값은 여기서만 읽는다. 스크롤 중에 재면 매 프레임 강제 리플로우가 걸리고,
   * 여백까지 다시 쓰면 브라우저가 스크롤 위치를 보정하면서 화면이 눈에 띄게 튄다.
   *
   * 카드 높이(--w-card-h)도 첫 카드 위 여백(padding-top)도 CSS가 정한다 — 여기 숫자를 다시
   * 적으면 둘이 갈라지므로 실측해서 쓴다. 기준선은 "그 여백만큼 내려온 자리에 선 첫 카드의 중심"이다.
   */
  const measure = (): void => {
    const cardH = (cards[0] as HTMLElement).offsetHeight;
    const room = Number.parseFloat(getComputedStyle(deck).paddingTop) || 0;
    line = room + cardH / 2;
    // 마지막 카드도 기준선까지 올라오게 하는 활주로 — 이 높이가 곧 스크롤 범위다
    const runway = Math.max(0, Math.round(deck.clientHeight - room - cardH));
    deck.style.setProperty("--deck-runway", `${runway}px`);
    centers = cards.map((c) => offsetTopWithin(c, deck) + c.offsetHeight / 2);
    // 순번은 CSS가 시차(transition-delay)를 계산하는 데 쓴다 — deck.css의 --w-stagger 참고
    for (let n = 0; n < cards.length; n++) {
      (cards[n] as HTMLElement).style.setProperty("--i", String(n));
    }
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
    deck.style.setProperty("--active-i", String(i));
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
  measure();
  paint();
  deck.addEventListener("scroll", onScroll, { passive: true });
  // 창 리사이즈보다 넓게 잡는다 — 모바일에서 주소창이 접히며 100dvh가 변하는 것도, 덱이 뒤늦게
  // 보이게 되는 것도 여기서 잡힌다(그때 잰 높이가 0이면 활주로가 0이 되어 스크롤이 막힌다).
  const observer = new ResizeObserver(() => {
    measure();
    paint();
  });
  observer.observe(deck);

  return () => {
    deck.removeEventListener("scroll", onScroll);
    observer.disconnect();
    if (raf) cancelAnimationFrame(raf);
    deck.style.removeProperty("--deck-runway");
    deck.style.removeProperty("--active-i");
    for (const c of cards) {
      c.classList.remove("active");
      c.style.removeProperty("--i");
    }
  };
}
