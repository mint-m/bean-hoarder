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

const FAMILIES: readonly FlavorFamily[] = [
  {
    name: "berry",
    hue: 10,
    c: 0.15,
    l: 0.6,
    re: /berr|strawberr|cherr|grape(?!fruit)|cassis|plum|currant|베리|딸기|체리|포도|자두/i,
  },
  {
    name: "citrus",
    hue: 70,
    c: 0.15,
    l: 0.68,
    re: /citrus|lemon|orange|lime|bergamot|grapefruit|tangerine|mandarin|yuzu|시트러스|레몬|오렌지|라임|자몽|귤|유자/i,
  },
  {
    name: "tropical",
    hue: 90,
    c: 0.14,
    l: 0.7,
    re: /tropical|mango|pineapple|passion|papaya|lychee|banana|coconut|guava|망고|파인애플|패션|파파야|리치|바나나|코코넛|열대/i,
  },
  {
    name: "floral",
    hue: 330,
    c: 0.12,
    l: 0.68,
    re: /floral|jasmine|rose|lavender|hibiscus|chamomile|blossom|flower|플로럴|자스민|재스민|장미|라벤더|히비스커스|캐모마일|꽃/i,
  },
  { name: "chocolate", hue: 55, c: 0.07, l: 0.45, re: /chocolat|cocoa|cacao|초콜|카카오|코코아/i },
  {
    name: "nutty",
    hue: 70,
    c: 0.09,
    l: 0.58,
    re: /nut|almond|hazel|peanut|caramel|toffee|brown sugar|honey|maple|butterscotch|넛|아몬드|헤이즐|땅콩|캐러멜|카라멜|흑설탕|꿀|메이플/i,
  },
  {
    name: "spice",
    hue: 110,
    c: 0.08,
    l: 0.52,
    re: /spice|cinnamon|clove|herb|black tea|earl grey|tobacco|cedar|스파이스|시나몬|계피|정향|허브|홍차|얼그레이|시더/i,
  },
  {
    name: "stonegreen",
    hue: 125,
    c: 0.13,
    l: 0.68,
    re: /apple|peach|apricot|melon|pear|nectarine|사과|복숭아|살구|멜론|배(?![럴리])|청포도/i,
  },
  {
    name: "winey",
    hue: 350,
    c: 0.13,
    l: 0.46,
    re: /wine|winey|boozy|rum|whisk|ferment|brandy|와인|와이니|럼|위스키|발효|브랜디/i,
  },
];

const NEUTRAL: Omit<FlavorFamily, "name" | "re"> = { hue: 60, c: 0.05, l: 0.55 };

function moodColor(f: Omit<FlavorFamily, "name" | "re">, alpha: number, dark: boolean): string {
  const l = Math.min(f.l + (dark ? 0.12 : 0), 0.85);
  return `oklch(${l} ${f.c} ${f.hue} / ${alpha})`;
}

/**
 * 테이스팅 노트 → 무드 그라데이션 CSS (linear-gradient 문자열).
 * 검출된 계열을 노트 등장 순서대로 최대 3색. 매칭 없으면 중립 웜브라운, 노트가 비면 null.
 * 저알파라 어떤 배경 위에서도 텍스트 대비를 깨지 않는다.
 */
export function flavorGradient(notes: string): string | null {
  const raw = (notes || "").trim();
  if (!raw) return null;
  const dark = isDark();
  const alpha = dark ? 0.2 : 0.14;

  const hits = FAMILIES.map((f) => ({ f, at: raw.search(f.re) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .slice(0, 3)
    .map((x) => x.f);

  const single = hits.length === 1 ? hits[0] : hits.length === 0 ? NEUTRAL : null;
  const stops = single
    ? // 단일 계열(또는 무매칭 → 중립 웜브라운) — 같은 hue의 명도 두 단계
      [moodColor(single, alpha, dark), moodColor({ ...single, l: single.l + 0.14 }, alpha * 0.7, dark)]
    : hits.map((f, i) => moodColor(f, alpha * (1 - i * 0.18), dark));
  return `linear-gradient(135deg, ${stops.join(", ")})`;
}
