// 커피 컬러 엔진 — 산지 시그니처 모노컬러 + 향미 무드 그라데이션 (DESIGN.md §3의 구현).
// 화면 전용이다 — 라벨 인쇄(흑백/2도)와 무관하며, 색이 없어도 정보는 성립해야 한다.
// 산지: DB에 색을 저장하지 않는 결정론(구 origin-color.ts) 계승. 자주 쓰는 산지는 큐레이션 hue,
// 그 외는 문자열 해시 폴백. HSL 대신 OKLCH — 어느 hue든 지각적 밝기·채도가 고르게 나온다.
// 향미: 테이스팅 노트를 계열 키워드로 판정해 저알파 그라데이션 CSS를 만든다 — 본문 대비를
// 해치지 않는 "무드"까지만 (#32 가시성 회귀 금지).

// 기본은 라이트이고 다크는 사용자가 설정에서 켰을 때만이다 — OS 설정이 아니라 적용된 테마를 본다
// (theme.css의 :root[data-theme="dark"]와 같은 기준이어야 색이 배경과 어긋나지 않는다).
function isDark(): boolean {
  return document.documentElement.dataset.theme === "dark";
}

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

// ── 산지 시그니처 ──
// hue만 산지마다 다르고 L·C는 테마 공통 — 팔레트가 "한 세트"로 묶이게 하는 장치.
const SIGNATURE_HUES: Record<string, number> = {
  ETHIOPIA: 60, // 앰버 — 플로럴·시트러스의 밝은 인상
  KENYA: 15, // 베리 레드
  COLOMBIA: 155, // 그린
  BRAZIL: 85, // 옐로 — 너티·스위트
  GUATEMALA: 230, // 블루
  "COSTA RICA": 185, // 틸
  PANAMA: 330, // 마젠타 — 게이샤 플로럴
  INDONESIA: 45, // 어시 브라운오렌지
  RWANDA: 355, // 크림슨
  BURUNDI: 340,
  HONDURAS: 120,
  PERU: 265, // 바이올렛
  YEMEN: 75, // 골드브라운
  TANZANIA: 200,
  "EL SALVADOR": 135,
  NICARAGUA: 110,
  MEXICO: 25,
  INDIA: 95,
  VIETNAM: 130,
};

/** 산지 → 시그니처 단색 (oklch 문자열). 같은 산지는 늘 같은 색. */
export function originSignature(origin: string): string | null {
  const key = (origin || "").trim().toUpperCase();
  if (!key) return null;
  const hue = SIGNATURE_HUES[key] ?? hashHue(key);
  // 라이트: 배경 대비가 나오는 중간 명도 / 다크: 어두운 표면 위에서 살아나게 밝게
  return isDark() ? `oklch(0.72 0.12 ${hue})` : `oklch(0.55 0.14 ${hue})`;
}

// ── 향미 무드 그라데이션 ──
// 계열 판정은 "노트 문자열 어딘가에 키워드가 있는가"로 충분하다 — 자유입력이라 정확 분류보다
// 무드의 방향이 맞는 게 중요하고, 오판정해도 저알파라 해가 없다.
interface FlavorFamily {
  name: string;
  hue: number;
  c: number;
  l: number; // 라이트 모드 명도 (다크는 +0.12)
  re: RegExp;
}

// 색상환을 **아홉 계열이 서로 밀어내도록** 벌려 둔다. 예전에는 citrus와 nutty가 같은 hue 70이었고
// chocolate·tropical·spice·stonegreen까지 55~125의 좁은 노란 구간에 몰려 있어, 카드가 다 비슷한
// 누런 띠로 보였다("어느 원두가 어떤 결인지 띠만 봐선 모르겠다"). 초록~보라 구간이 통째로 비어
// 있었으므로 차·허브 계열은 청록으로, 꽃 계열은 라일락으로 옮겨 그 빈자리를 쓴다.
//
// 이웃한 hue가 남는 곳(따뜻한 과일·견과 구간)은 채도와 명도로 한 번 더 가른다 — chocolate은
// 낮은 채도·낮은 명도, nutty는 낮은 채도·높은 명도라 같은 갈색 계열이어도 겹쳐 보이지 않는다.
const FAMILIES: readonly FlavorFamily[] = [
  {
    name: "berry",
    hue: 18,
    c: 0.17,
    l: 0.58,
    re: /berr|strawberr|cherr|grape(?!fruit)|cassis|plum|prune|currant|베리|딸기|체리|포도|자두/i,
  },
  {
    name: "chocolate",
    hue: 42,
    c: 0.09,
    l: 0.36,
    re: /chocolat|cocoa|cacao|초콜|카카오|코코아/i,
  },
  {
    // `nut`은 Nutmeg(육두구)의 앞 세 글자이기도 하다 — 계열 판정이 등장 위치로 정렬되므로 둘 다
    // 0에서 걸리면 배열 순서가 앞선 이쪽이 이겨 향신료가 견과류 색을 쓴다. 그래서 여기서 뺀다.
    name: "nutty",
    hue: 65,
    c: 0.11,
    l: 0.64,
    re: /nut(?!meg)|almond|hazel|peanut|pecan|caramel|toffee|brown sugar|molasses|vanilla|honey|maple|butterscotch|넛|아몬드|헤이즐|땅콩|피칸|캐러멜|카라멜|흑설탕|당밀|바닐라|꿀|메이플/i,
  },
  {
    name: "tropical",
    hue: 85,
    c: 0.17,
    l: 0.72,
    re: /tropical|mango|pineapple|passion|papaya|lychee|banana|coconut|guava|망고|파인애플|패션|파파야|리치|바나나|코코넛|열대/i,
  },
  {
    name: "citrus",
    hue: 105,
    c: 0.17,
    l: 0.78,
    re: /citrus|lemon|orange|lime|bergamot|grapefruit|tangerine|mandarin|yuzu|시트러스|레몬|오렌지|라임|자몽|귤|유자/i,
  },
  {
    name: "stonegreen",
    hue: 148,
    c: 0.14,
    l: 0.68,
    re: /apple|peach|apricot|melon|pear|nectarine|사과|복숭아|살구|멜론|배(?![럴리])|청포도/i,
  },
  {
    // 허브·차·시더·담뱃잎이 모인 줄이라 따뜻한 갈색보다 청록이 결에 맞고, 비어 있던 구간이라
    // 견과·초콜릿과 확실히 갈린다.
    name: "spice",
    hue: 190,
    c: 0.09,
    l: 0.52,
    re: /spice|cinnamon|clove|cardamom|nutmeg|ginger|pepper|herb|black tea|green tea|earl grey|tobacco|cedar|스파이스|시나몬|계피|정향|카다멈|육두구|생강|후추|허브|홍차|녹차|얼그레이|시더/i,
  },
  {
    name: "floral",
    hue: 305,
    c: 0.14,
    l: 0.72,
    re: /floral|jasmine|rose|lavender|hibiscus|chamomile|blossom|flower|magnolia|osmanthus|플로럴|자스민|재스민|장미|라벤더|히비스커스|캐모마일|목련|금목서|계화|꽃/i,
  },
  {
    name: "winey",
    hue: 345,
    c: 0.15,
    l: 0.42,
    re: /wine|winey|boozy|rum|whisk|ferment|brandy|와인|와이니|럼|위스키|발효|브랜디/i,
  },
];

const NEUTRAL: Omit<FlavorFamily, "name" | "re"> = { hue: 60, c: 0.05, l: 0.55 };

function moodColor(f: Omit<FlavorFamily, "name" | "re">, alpha: number, dark: boolean): string {
  const l = Math.min(f.l + (dark ? 0.12 : 0), 0.85);
  return `oklch(${l} ${f.c} ${f.hue} / ${alpha})`;
}

/**
 * 노트 문자열에서 향미 계열을 찾는다 — 등장 순서대로 최대 3개.
 *
 * 그라데이션 생성과 나눠 둔 이유: 어휘(@bnhd/schema/flavor)의 모든 노트가 계열 하나에는 걸리는지를
 * 테스트가 전수로 확인해야 하는데, 그라데이션 쪽은 테마를 읽느라 DOM이 필요하다.
 */
/**
 * 테이스팅 노트 → 무드 그라데이션 CSS (linear-gradient 문자열).
 * 검출된 계열을 노트 등장 순서대로 최대 3색. 매칭 없으면 중립 웜브라운, 노트가 비면 null.
 * 저알파라 어떤 배경 위에서도 텍스트 대비를 깨지 않는다.
 */
export function matchFlavorFamilies(notes: string): FlavorFamily[] {
  const raw = (notes || "").trim();
  if (!raw) return [];
  return FAMILIES.map((f) => ({ f, at: raw.search(f.re) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .slice(0, 3)
    .map((x) => x.f);
}

export function flavorGradient(notes: string): string | null {
  const raw = (notes || "").trim();
  if (!raw) return null;
  const dark = isDark();
  // 벌려 놓은 hue도 알파가 너무 낮으면 회색빛 한 겹으로 뭉개진다 — 계열이 읽히는 선까지만 올린다.
  // 밴드 위에 헤드라인·로스터리가 얹히므로 더 올리지는 않는다(텍스트 대비가 먼저다).
  const alpha = dark ? 0.26 : 0.19;

  const hits = matchFlavorFamilies(raw);

  const single = hits.length === 1 ? hits[0] : hits.length === 0 ? NEUTRAL : null;
  const stops = single
    ? // 단일 계열(또는 무매칭 → 중립 웜브라운) — 같은 hue의 명도 두 단계
      [moodColor(single, alpha, dark), moodColor({ ...single, l: single.l + 0.14 }, alpha * 0.7, dark)]
    : // 뒤 계열을 너무 죽이면 두 계열짜리 노트가 단일 계열처럼 보인다 — 순서만 드러날 만큼만 뺀다
      hits.map((f, i) => moodColor(f, alpha * (1 - i * 0.12), dark));
  return `linear-gradient(135deg, ${stops.join(", ")})`;
}
