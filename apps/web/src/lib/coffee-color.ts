// 커피 컬러 엔진 — 산지 시그니처 모노컬러 + 향미 무드 그라데이션 (DESIGN.md §3의 구현).
// 화면 전용이다 — 라벨 인쇄(흑백/2도)와 무관하며, 색이 없어도 정보는 성립해야 한다.
// 산지: DB에 색을 저장하지 않는 결정론(구 origin-color.ts) 계승. 자주 쓰는 산지는 큐레이션 hue,
// 그 외는 문자열 해시 폴백. HSL 대신 OKLCH — 어느 hue든 지각적 밝기·채도가 고르게 나온다.
// 향미: 그라데이션은 노트 도표가 아니라 **한 모금의 인상(톤)을 미리 겪게 하는 것**이다 — 노트마다 정확한
// 색을 쫓기보다 주된 톤과 포인트가 읽히게 한다. 노트 색 표(NOTE_COLORS)는 그 톤을 조합하는 팔레트이고,
// 어휘 밖 자유입력은 계열 키워드로 판정한 계열 색(FAMILIES)을 받는다. 본문 대비를 해치지 않는
// "무드"까지만 (#32 가시성 회귀 금지).

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
/** 무드색 하나 — OKLCH. l은 라이트 모드 명도(다크는 +0.12). */
export interface Mood {
  hue: number;
  c: number;
  l: number;
}

export interface FlavorFamily extends Mood {
  name: string;
  re: RegExp;
}

// 색상환을 **열 계열이 서로 밀어내도록** 벌려 둔다. 예전에는 citrus와 nutty가 같은 hue 70이었고
// chocolate·tropical·spice까지 55~125의 좁은 노란 구간에 몰려 있어, 카드가 다 비슷한 누런 띠로
// 보였다("어느 원두가 어떤 결인지 띠만 봐선 모르겠다"). 초록~보라 구간이 통째로 비어 있었으므로
// 차·허브 계열은 청록으로, 꽃 계열은 라일락으로 옮겨 그 빈자리를 쓴다.
//
// 그래도 따뜻한 구간(40~115)에 다섯이 몰리는 것은 피할 수 없다 — 커피 향미가 실제로 거기 몰려
// 있다. 그래서 그 줄은 **채도와 명도로 한 번 더 가른다**: chocolate은 낮은 채도·낮은 명도,
// nutty는 낮은 채도·중간 명도, stonefruit·tropical·citrus는 높은 채도에 명도가 층으로 오른다.
//
// 규칙의 단일 소스는 DESIGN.md §3 — 이 표를 고치면 그 문서의 계열표도 같은 커밋에서 고친다.
const FAMILIES: readonly FlavorFamily[] = [
  {
    name: "berry",
    hue: 15,
    c: 0.17,
    l: 0.56,
    // `포도`가 여기 있어 "청포도"도 이쪽으로 온다 — 저장값 "White Grape"가 `grape`로 여기 걸리므로,
    // 한글로 쳤을 때만 초록이 되면 같은 노트가 표기에 따라 다른 색을 받는다.
    re: /berr|strawberr|cherr|grape(?!fruit)|cassis|plum|prune|currant|베리|딸기|체리|포도|자두/i,
  },
  {
    name: "chocolate",
    hue: 40,
    c: 0.08,
    l: 0.34,
    re: /chocolat|cocoa|cacao|초콜|카카오|코코아/i,
  },
  {
    // 복숭아·살구는 주황 과일이다. 예전에는 사과·배·멜론과 한 계열(stonegreen)로 묶여 hue 148
    // 순초록을 받았고, 그래서 "Yellow Peach"를 고른 카드가 초록 워시를 받았다.
    name: "stonefruit",
    hue: 58,
    c: 0.16,
    l: 0.74,
    re: /peach|apricot|nectarine|복숭아|살구|천도/i,
  },
  {
    // `nut`은 Nutmeg(육두구)의 앞 세 글자이기도 하다 — 계열 판정이 등장 위치로 정렬되므로 둘 다
    // 0에서 걸리면 배열 순서가 앞선 이쪽이 이겨 향신료가 견과류 색을 쓴다. 그래서 여기서 뺀다.
    name: "nutty",
    hue: 70,
    c: 0.09,
    l: 0.56,
    re: /nut(?!meg)|almond|hazel|peanut|pecan|macadamia|caramel|toffee|brown sugar|molasses|vanilla|honey|maple|butterscotch|넛|아몬드|헤이즐|땅콩|피칸|마카다미아|캐러멜|카라멜|흑설탕|당밀|바닐라|꿀|메이플/i,
  },
  {
    name: "tropical",
    hue: 90,
    c: 0.17,
    l: 0.72,
    re: /tropical|mango|pineapple|passion|papaya|lychee|banana|coconut|guava|망고|파인애플|패션|파파야|리치|바나나|코코넛|열대/i,
  },
  {
    name: "citrus",
    hue: 115,
    c: 0.17,
    l: 0.84,
    // "Orange Blossom"은 시트러스가 아니라 꽃이다. 판정이 등장 위치로 정렬되는 탓에 `orange`(0)가
    // floral의 `blossom`(7)을 이겨 꽃인데 시트러스 색을 받았다 — 여기서 비켜 준다.
    re: /citrus|lemon|orange(?!\s*blossom)|lime|bergamot|grapefruit|tangerine|mandarin|yuzu|시트러스|레몬|오렌지(?!\s*꽃)|라임|자몽|귤|유자/i,
  },
  {
    // 사과·배·멜론 — 초록 과일만 남긴다(복숭아·살구는 stonefruit로 갈라져 나갔다).
    // `배`는 "담배"에도 들어 있지만 spice가 `담배`를 0에서 잡아 이긴다.
    name: "green",
    hue: 145,
    c: 0.14,
    l: 0.68,
    re: /apple|pear|melon|사과|배(?![럴리])|멜론|수박/i,
  },
  {
    // 허브·차·시더·담뱃잎이 모인 줄이라 따뜻한 갈색보다 청록이 결에 맞고, 비어 있던 구간이라
    // 견과·초콜릿과 확실히 갈린다.
    name: "spice",
    hue: 190,
    c: 0.09,
    l: 0.52,
    re: /spice|cinnamon|clove|cardamom|nutmeg|ginger|pepper|herb|black tea|green tea|white tea|earl grey|tobacco|cedar|스파이스|시나몬|계피|정향|카다멈|육두구|생강|후추|허브|홍차|녹차|백차|얼그레이|담배|시더/i,
  },
  {
    name: "floral",
    hue: 305,
    c: 0.14,
    l: 0.74,
    re: /floral|jasmine|rose|lavender|hibiscus|chamomile|blossom|flower|magnolia|osmanthus|acacia|플로럴|자스민|재스민|장미|라벤더|히비스커스|캐모마일|목련|금목서|계화|아카시아|꽃/i,
  },
  {
    name: "winey",
    hue: 340,
    c: 0.15,
    l: 0.4,
    re: /wine|winey|boozy|rum|whisk|ferment|brandy|와인|와이니|럼|위스키|발효|브랜디/i,
  },
];

const NEUTRAL: Mood = { hue: 60, c: 0.05, l: 0.55 };

// ── 노트 단위 색 ──
// 계열 한 색으로는 꽃 열 개가 전부 라일락이었다(#89) — Rose는 레드, Lavender는 퍼플, Orange Blossom은
// 크림인데 띠만 봐선 구별이 안 됐다. 어휘(@bnhd/schema/flavor)의 저장값(en)마다 실제 인상에 가까운
// 색을 준다. **계열은 폴백이다** — 여기 없는 노트(계열 일반어 `Floral`·`Citrus`·`Berry`… 와 어휘 밖
// 자유입력)만 계열 색을 받는다. 계열 기본색과 거의 같은 노트(Lemon≈citrus, Peach≈stonefruit)는 적지
// 않는다 — 표는 "다르게 보여야 하는 것"만 든다.
//
// 흰 꽃·코코넛·바닐라는 "흰색"인데 저알파 워시로 흰색은 배경과 같다. 아주 밝은 크림(L .86~.88,
// C .05~.08)으로 두어 아이보리 한 겹으로 읽히게 한다 — 더 밝히면 무매칭 중립(웜브라운)보다 덜 칠해진
// 카드가 되고, 다크에서는 반대로 가장 밝은 회색으로 뜬다. 두 테마를 스크린샷으로 맞춘 값이다.
//
// 키는 어휘의 `en` 그대로 — `flavor-coverage.test.ts`가 모든 키가 어휘에 실존하는지 검사한다(어휘에서
// 노트를 지우면 여기도 따라 죽어야 한다). 규칙의 단일 소스는 DESIGN.md §3 — 표를 고치면 그쪽도 고친다.
const NOTE_COLORS: Readonly<Record<string, Mood>> = {
  // 꽃 — 계열 기본은 라일락(305)
  Jasmine: { hue: 95, c: 0.06, l: 0.87 }, // 화이트 — 라이트에서는 아이보리 한 겹
  Rose: { hue: 5, c: 0.15, l: 0.68 }, // 핑크레드
  Magnolia: { hue: 345, c: 0.06, l: 0.87 }, // 연한 핑크 화이트
  Osmanthus: { hue: 75, c: 0.13, l: 0.8 }, // 금빛 살구
  Lavender: { hue: 280, c: 0.13, l: 0.64 }, // 퍼플블루 — 계열 라일락(305)과 눈으로 갈릴 만큼 블루 쪽
  Hibiscus: { hue: 352, c: 0.17, l: 0.5 }, // 딥 핑크레드 — Rose(L .68)와는 명도로 갈린다
  Chamomile: { hue: 98, c: 0.11, l: 0.88 }, // 연한 옐로
  Elderflower: { hue: 120, c: 0.06, l: 0.87 }, // 흰빛 그린
  "Orange Blossom": { hue: 68, c: 0.09, l: 0.88 }, // 크림 오렌지
  Acacia: { hue: 95, c: 0.07, l: 0.88 }, // 아이보리 — Jasmine과 한 색으로 합쳐진다
  // 시트러스 — 계열 기본은 옐로(115)
  Lime: { hue: 135, c: 0.15, l: 0.78 },
  Orange: { hue: 60, c: 0.17, l: 0.74 },
  "Orange Peel": { hue: 58, c: 0.16, l: 0.7 },
  Mandarin: { hue: 55, c: 0.17, l: 0.74 },
  Tangerine: { hue: 52, c: 0.18, l: 0.72 },
  Grapefruit: { hue: 30, c: 0.14, l: 0.74 }, // 핑크오렌지
  Bergamot: { hue: 128, c: 0.13, l: 0.8 }, // 옐로그린 — 껍질의 색, 레몬 옐로와 갈린다
  Yuzu: { hue: 96, c: 0.16, l: 0.84 },
  Lemongrass: { hue: 130, c: 0.1, l: 0.82 },
  // 베리 — 계열 기본은 레드(15). 붉은 베리(Strawberry·Cherry·Cranberry…)는 그 기본색이 곧 제 색이다.
  Blueberry: { hue: 275, c: 0.12, l: 0.48 }, // 블루바이올렛
  Blackberry: { hue: 320, c: 0.1, l: 0.36 }, // 딥 퍼플
  "Black Currant": { hue: 315, c: 0.11, l: 0.38 },
  Cassis: { hue: 315, c: 0.11, l: 0.38 },
  Plum: { hue: 325, c: 0.12, l: 0.48 },
  Prune: { hue: 340, c: 0.07, l: 0.36 },
  Grape: { hue: 300, c: 0.11, l: 0.52 },
  "White Grape": { hue: 125, c: 0.1, l: 0.84 }, // 청포도 — 계열은 베리지만 색은 연두
  "Concord Grape": { hue: 295, c: 0.13, l: 0.42 },
  // 핵과·과수 — 핵과 기본은 살구빛 주황(58), 초록 과일 기본은 연두(145). 황도·살구·풋사과는 기본색 그대로.
  "White Peach": { hue: 350, c: 0.08, l: 0.86 }, // 연한 핑크 화이트
  "Red Apple": { hue: 22, c: 0.17, l: 0.62 },
  Pear: { hue: 110, c: 0.1, l: 0.84 },
  Melon: { hue: 130, c: 0.09, l: 0.86 },
  Watermelon: { hue: 15, c: 0.16, l: 0.66 },
  // 열대 — 계열 기본은 앰버(90)
  Mango: { hue: 65, c: 0.18, l: 0.76 },
  "Passion Fruit": { hue: 78, c: 0.17, l: 0.74 },
  Papaya: { hue: 45, c: 0.16, l: 0.72 }, // 코랄 오렌지
  Guava: { hue: 10, c: 0.13, l: 0.74 }, // 핑크
  Lychee: { hue: 355, c: 0.07, l: 0.86 },
  Banana: { hue: 98, c: 0.15, l: 0.88 },
  Coconut: { hue: 85, c: 0.05, l: 0.88 }, // 화이트
  // 초콜릿 — 계열 기본은 딥 브라운(40, L .34)이라 다크는 그대로, 밀크만 밝힌다
  "Milk Chocolate": { hue: 50, c: 0.09, l: 0.5 }, // 기본(다크)보다 한 단계 밝다
  // 견과·단맛 — 계열 기본은 탠(70, L .56)
  Almond: { hue: 75, c: 0.07, l: 0.72 },
  Walnut: { hue: 55, c: 0.06, l: 0.46 },
  Pecan: { hue: 50, c: 0.09, l: 0.44 },
  Toffee: { hue: 58, c: 0.12, l: 0.52 },
  Butterscotch: { hue: 75, c: 0.14, l: 0.72 },
  "Brown Sugar": { hue: 55, c: 0.09, l: 0.42 },
  Molasses: { hue: 45, c: 0.06, l: 0.3 },
  Honey: { hue: 82, c: 0.15, l: 0.76 }, // 골든
  Vanilla: { hue: 88, c: 0.07, l: 0.88 }, // 크림
  // 향신료·차 — 계열 기본은 틸(190). 실제 향신료는 대부분 갈색이라 계열색과 가장 멀다.
  Cinnamon: { hue: 40, c: 0.12, l: 0.5 }, // 레드브라운
  Clove: { hue: 45, c: 0.07, l: 0.36 },
  Cardamom: { hue: 150, c: 0.06, l: 0.62 }, // 회녹색
  Nutmeg: { hue: 60, c: 0.08, l: 0.5 },
  Ginger: { hue: 85, c: 0.1, l: 0.76 },
  "Black Pepper": { hue: 60, c: 0.02, l: 0.36 }, // 차콜
  Herbal: { hue: 150, c: 0.1, l: 0.58 }, // 그린
  "Black Tea": { hue: 40, c: 0.1, l: 0.44 },
  "Green Tea": { hue: 145, c: 0.1, l: 0.66 },
  "White Tea": { hue: 100, c: 0.05, l: 0.86 }, // 연한 볏짚색
  "Earl Grey": { hue: 50, c: 0.08, l: 0.5 },
  Tobacco: { hue: 55, c: 0.07, l: 0.34 },
  Cedar: { hue: 45, c: 0.09, l: 0.48 },
  // 발효·주류 — 계열 기본은 딥 퍼플레드(340, L .40)
  "Red Wine": { hue: 15, c: 0.15, l: 0.38 },
  "White Wine": { hue: 100, c: 0.08, l: 0.86 },
  Rum: { hue: 60, c: 0.12, l: 0.48 },
  Whiskey: { hue: 70, c: 0.14, l: 0.56 },
  Brandy: { hue: 55, c: 0.13, l: 0.5 },
};

/** 노트 색 표 자체 — 키가 어휘에 실존하는지 검사하는 테스트가 읽는다. */
export const FLAVOR_NOTE_COLORS: Readonly<Record<string, Mood>> = NOTE_COLORS;

// 저장값은 어휘의 en으로 정규화돼 들어오지만(canonicalizeNotes) 대소문자·공백 차이까지 색이 갈리면
// 안 된다 — 어휘 검색(@bnhd/schema/flavor의 norm)과 같은 규칙으로 키를 맞춘다.
const normKey = (s: string): string => s.toLowerCase().replace(/\s+/g, "");
const NOTE_BY_KEY: ReadonlyMap<string, Mood> = new Map(
  Object.entries(NOTE_COLORS).map(([en, mood]) => [normKey(en), mood]),
);

function moodColor(f: Mood, alpha: number, dark: boolean): string {
  // 다크는 어두운 표면 위에서 살리려 밝히되 .85에서 멈춘다. 라이트는 흰 꽃(L .9대)이 그대로 나가야
  // 크림으로 읽힌다 — 단일 계열의 두 번째 단계(+0.14)만 .95에서 자른다.
  const l = dark ? Math.min(f.l + 0.12, 0.85) : Math.min(f.l, 0.95);
  return `oklch(${l} ${f.c} ${f.hue} / ${alpha})`;
}

/** 계열 표 자체 — 색끼리 충분히 떨어졌는지 검사하는 테스트가 읽는다. */
export const FLAVOR_FAMILIES: readonly FlavorFamily[] = FAMILIES;

/**
 * 노트 문자열에서 향미 계열을 찾는다 — 등장 순서대로 최대 3개.
 *
 * 그라데이션 생성과 나눠 둔 이유: 어휘(@bnhd/schema/flavor)의 모든 노트가 계열 하나에는 걸리는지를
 * 테스트가 전수로 확인해야 하는데, 그라데이션 쪽은 테마를 읽느라 DOM이 필요하다.
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

/** 그라데이션의 색 하나. 같은 색으로 판정된 토큰들이 한 stop으로 모인다. */
export interface FlavorStop {
  mood: Mood;
  /** 이 색으로 모인 토큰 수 — **톤**(메인/악센트·채도)을 정하는 데 쓴다. 순서는 안 본다 */
  count: number;
  /** 순서 가중치의 합(첫 토큰 ×ORDER_LEAD) — **면적**을 정하는 데 쓴다 */
  area: number;
  /** 톤 그룹 안에서 메인인가 — 메인은 면적·채도가 오르고, 악센트는 제 색 그대로 포인트로 남는다 */
  role: "main" | "accent";
  /** 이 stop이 속한 톤 그룹의 토큰 수 — 채도 부스트의 단계 */
  groupCount: number;
  /** 첫 토큰 원문 — 테스트·디버깅용 */
  note: string;
}

// 두 색을 하나로 합칠 기준. 계열 간 거리 검사(flavor-coverage.test.ts)의 "hue 12도"와 같은 눈금이다 —
// 그보다 가까우면 저알파 워시에서는 한 색이라, 따로 두면 `Lemon, Yuzu, Lime`가 노란 줄무늬 셋이 된다.
// 흰빛(C가 아주 낮은 색)은 hue가 의미가 없으므로 명도만 본다 — Jasmine(95)·Magnolia(345)는 둘 다 흰 꽃이다.
const MERGE_HUE = 12;
const MERGE_L = 0.15;
const ACHROMATIC_C = 0.08;

// ── 톤 모델의 손잡이 ──
// 톤은 **개수**, 순서는 **면적** — 둘을 섞지 않는다. 순서 가산이 톤 계산에도 들어가면
// `Orange, Dark Chocolate, Brown Sugar`에서 오렌지 1.5 vs 갈색 2가 아래 2/3 규칙에 걸려 공동 메인이 된다.
// 사용자가 원한 것은 "톤은 갈색, 오렌지는 묻히지 않는 포인트"다.
/** 색이 이보다 가까우면 같은 톤 그룹(OKLab ΔE). Chocolate↔Hazelnut .23은 한 톤, Chocolate↔Orange .41은 아니다 */
const KIN_DE = 0.25;
/** 첫 토큰의 면적 가산 — 첫 노트는 악센트여도 포인트로 남을 만큼 자리를 받는다 */
const ORDER_LEAD = 1.5;
/** 메인 그룹 stop의 면적 가산 — 톤이 몸통이 되게 */
const MAIN_AREA = 1.5;
/** 메인 그룹의 채도 부스트: 1 + BOOST_STEP × (검출량 − 1), 최대 BOOST_MAX. 같은 결이 많을수록 그 톤이 짙어진다 */
const BOOST_STEP = 0.15;
const BOOST_MAX = 1.45;
/** 채도 절대 상한 — 톤 밸런스 가드. 계열 최대 .17 × 1.45 = .246을 여기서 자른다 */
const C_MAX = 0.2;

function hueGap(a: number, b: number): number {
  const raw = Math.abs(a - b);
  return Math.min(raw, 360 - raw);
}

function sameMood(a: Mood, b: Mood): boolean {
  if (Math.abs(a.l - b.l) >= MERGE_L) return false;
  if (a.c < ACHROMATIC_C && b.c < ACHROMATIC_C) return true;
  return hueGap(a.hue, b.hue) < MERGE_HUE;
}

/**
 * OKLab 거리 — 톤 그룹 판정. 계열(regex)은 친족을 가르기에 너무 거칠다(floral에 Rose 레드와 Jasmine 화이트가
 * 같이 있다). "향미는 컬러감을 갖고 비슷한 컬러감은 같은 분위기"라면 친족은 곧 색이 가까운 것이고,
 * 무드 그룹표를 손으로 두지 않아도 노트 색 표에서 파생된다.
 */
export function oklabDistance(a: Mood, b: Mood): number {
  const rad = Math.PI / 180;
  const da = a.c * Math.cos(a.hue * rad) - b.c * Math.cos(b.hue * rad);
  const db = a.c * Math.sin(a.hue * rad) - b.c * Math.sin(b.hue * rad);
  return Math.hypot(a.l - b.l, da, db);
}

/** 토큰 하나의 색 — 어휘 노트면 제 색, 아니면 계열 폴백, 어디에도 안 걸리면 null. */
function tokenMood(token: string): Mood | null {
  const own = NOTE_BY_KEY.get(normKey(token));
  if (own) return own;
  const fam = matchFlavorFamilies(token)[0];
  return fam ? { hue: fam.hue, c: fam.c, l: fam.l } : null;
}

/** 조회 카드가 칩을 쪼개는 것과 같은 구분자 — 색이 칩 단위로 매겨져야 둘이 맞는다. */
const splitNotes = (raw: string): string[] =>
  raw
    .split(/[,·]/)
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * 테이스팅 노트 → 그라데이션 색 목록. 순수 함수 — 테마를 읽지 않아 Node 테스트가 직접 검사한다.
 *
 * 1. 토큰마다 색을 매기고(tokenMood) 눈으로 한 색인 것은 한 stop으로 모은다(sameMood) — count·area 누적.
 * 2. stop을 색 거리로 톤 그룹에 묶는다(oklabDistance < KIN_DE, 등장순 greedy, 그룹 첫 색 기준).
 * 3. 검출량(토큰 수)이 가장 큰 그룹과 그 2/3 이상인 그룹이 메인 — 비중이 비슷하면 함께 전개한다.
 *    나머지는 악센트. 첫 노트여도 개수에서 밀리면 악센트다 — 대신 면적(ORDER_LEAD)으로 포인트가 된다.
 * 4. `max`를 넘으면 악센트를 면적 작은 것부터, 그래도 넘으면 메인 안에서 면적 작은 것부터 뺀다.
 * 반환은 **등장순** — 노트 순서와 띠가 일치한다. 색을 하나도 못 매기면 빈 배열(호출부가 중립을 깐다).
 */
export function flavorStops(notes: string, max = 4): FlavorStop[] {
  const stops: FlavorStop[] = [];
  let first = true;
  for (const token of splitNotes(notes || "")) {
    const mood = tokenMood(token);
    if (!mood) continue;
    const lead = first ? ORDER_LEAD : 1;
    first = false;
    const near = stops.find((s) => sameMood(s.mood, mood));
    if (near) {
      near.count += 1;
      near.area += lead;
    } else {
      stops.push({ mood, count: 1, area: lead, role: "accent", groupCount: 1, note: token });
    }
  }
  if (stops.length === 0) return stops;

  // 톤 그룹 — 그룹의 첫 색(seed)과 비교한다. 결정적이고 단순하다.
  const groups: { seed: Mood; members: FlavorStop[]; count: number }[] = [];
  for (const s of stops) {
    const g = groups.find((g) => oklabDistance(g.seed, s.mood) < KIN_DE);
    if (g) {
      g.members.push(s);
      g.count += s.count;
    } else groups.push({ seed: s.mood, members: [s], count: s.count });
  }
  const top = Math.max(...groups.map((g) => g.count));
  for (const g of groups) {
    const main = g.count * 3 >= top * 2;
    for (const s of g.members) {
      s.role = main ? "main" : "accent";
      s.groupCount = g.count;
    }
  }

  if (stops.length <= max) return stops;
  // 악센트를 면적 작은 것부터(같으면 뒤에 나온 것) 뺀다. 그래도 넘으면 메인 안에서 같은 규칙으로.
  const rank = (s: FlavorStop) => (s.role === "main" ? 1 : 0);
  const keep = new Set(
    stops
      .map((s, i) => ({ s, i }))
      .sort((a, b) => rank(b.s) - rank(a.s) || b.s.area - a.s.area || a.i - b.i)
      .slice(0, max)
      .map((x) => x.s),
  );
  return stops.filter((s) => keep.has(s));
}

/** 톤 모델을 색에 적용 — 메인은 검출량만큼 채도가 오르고(C_MAX에서 멈춘다), 악센트는 제 채도 그대로. */
export function boostedMood(mood: Mood, role: FlavorStop["role"], groupCount: number): Mood {
  if (role !== "main") return mood;
  const boost = Math.min(1 + BOOST_STEP * (groupCount - 1), BOOST_MAX);
  return { ...mood, c: Math.min(Math.round(mood.c * boost * 1000) / 1000, C_MAX) };
}

/** stop의 면적 가중치 — 순서 가중 면적에, 메인이면 MAIN_AREA를 곱한다. */
export function stopArea(s: FlavorStop): number {
  return s.area * (s.role === "main" ? MAIN_AREA : 1);
}

/**
 * 가중치 → 각 색의 stop 위치(%). 색을 제 구간의 **가운데**에 놓는다 — 3:1이면 37.5%와 87.5%.
 * 양 끝(0·100)에 놓으면 색이 둘일 때 가중치가 사라진다. 소수 첫째 자리까지.
 */
export function stopPositions(weights: readonly number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  return weights.map((w) => {
    const mid = ((acc + w / 2) / total) * 100;
    acc += w;
    return Math.round(mid * 10) / 10;
  });
}

/**
 * 테이스팅 노트 → 무드 그라데이션 CSS (linear-gradient 문자열).
 * 색은 노트 단위(flavorStops)이고, 톤은 개수·순서는 면적으로 드러난다(boostedMood·stopArea). 색이 하나면
 * 같은 hue의 명도 두 단계, 매칭이 없으면 중립 웜브라운, 노트가 비면 null.
 * 저알파라 어떤 배경 위에서도 텍스트 대비를 깨지 않는다.
 */
export function flavorGradient(notes: string): string | null {
  const raw = (notes || "").trim();
  if (!raw) return null;
  const dark = isDark();
  // 벌려 놓은 hue도 알파가 너무 낮으면 회색빛 한 겹으로 뭉개진다 — 계열이 읽히는 선까지만 올린다.
  // 밴드 위에 헤드라인·로스터리가 얹히므로 더 올리지는 않는다(텍스트 대비가 먼저다). 톤도 알파가 아니라
  // 면적·채도로 드러낸다 — 같은 이유다. 모든 stop이 같은 알파라 악센트가 물리지 않는다.
  const alpha = dark ? 0.26 : 0.19;

  const stops = flavorStops(raw);
  const moods = stops.map((s) => boostedMood(s.mood, s.role, s.groupCount));

  const single = moods.length === 1 ? moods[0] : moods.length === 0 ? NEUTRAL : null;
  const css = single
    ? // 단일 색(또는 무매칭 → 중립 웜브라운) — 같은 hue의 명도 두 단계
      [moodColor(single, alpha, dark), moodColor({ ...single, l: single.l + 0.14 }, alpha * 0.7, dark)]
    : stopPositions(stops.map(stopArea)).map(
        (pos, i) => `${moodColor(moods[i] ?? NEUTRAL, alpha, dark)} ${pos}%`,
      );
  return `linear-gradient(135deg, ${css.join(", ")})`;
}
