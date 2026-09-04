// 로스팅 레벨 — 애그트론 6단계의 단일 소스(등록 폼·조회 카드·인쇄 라벨·AI 프롬프트가 함께 쓴다).
//
// 저장값은 예전 그대로 "#120 (울트라라이트)" 문자열이고 D1 컬럼도 `agtron`이다. 바뀐 것은 부르는
// 이름과 화면 표현뿐 — 숫자(애그트론)는 로스터의 계측값이고 소비자가 읽는 맥락은 "얼마나 볶았나"라
// 레벨이 앞에 선다. 인쇄된 라벨·기존 행·CSV 백업이 전부 그대로 살아 있어야 하므로 형식은 손대지 않는다.
//
// 같은 6단계가 폼 추천 칩·AI 프롬프트·라벨 세 곳에 흩어져 있던 것을 여기로 모은다.
// zod가 딸려오지 않도록 index.ts와 분리된 서브패스(@bnhd/schema/roast)다 — headline과 같은 이유로,
// 조회·덱 번들이 이 파일만 가져가게 한다.

export interface RoastLevel {
  /** 애그트론 값 — 클수록 밝다 */
  readonly agtron: number;
  /** 저장·표시되는 표기. 향미 노트와 같은 규칙이다 — 값은 영문으로 하나만 둔다. */
  readonly en: string;
  /** 검색·옛 데이터 해석용 한국어 표기. 저장되지 않는다. */
  readonly ko: string;
  /**
   * 화면 표시용 스와치 (인쇄와 무관 — DESIGN.md §3 커피 컬러와 같은 결로 oklch).
   * 실제 분쇄 원두 색에 가깝게, 밝기는 애그트론 순서를 그대로 따른다.
   */
  readonly swatch: string;
}

/** 밝은 쪽 → 어두운 쪽. 이 순서가 곧 칩이 서는 순서다. */
export const ROAST_LEVELS: readonly RoastLevel[] = [
  { agtron: 120, en: "Ultra Light", ko: "울트라라이트", swatch: "oklch(0.74 0.055 68)" },
  { agtron: 95, en: "Light", ko: "라이트", swatch: "oklch(0.63 0.072 58)" },
  { agtron: 75, en: "Medium Light", ko: "미디움라이트", swatch: "oklch(0.53 0.078 48)" },
  { agtron: 65, en: "Medium", ko: "미디움", swatch: "oklch(0.44 0.070 42)" },
  { agtron: 55, en: "Medium Dark", ko: "미디움다크", swatch: "oklch(0.35 0.052 38)" },
  { agtron: 45, en: "Dark", ko: "다크", swatch: "oklch(0.26 0.033 35)" },
];

/**
 * 저장 형식 — 폼·AI가 모두 이 형태를 만든다.
 *
 * 괄호 안이 한국어에서 영문으로 바뀌었다(향미 노트와 같은 규칙 — 값은 영문으로 하나만 둔다).
 * 옛 행("#120 (울트라라이트)")도 그대로 읽힌다: parseRoastLevel이 숫자를 먼저 보고, 인쇄 라벨은
 * 애초에 숫자만 찍는다(label.js의 specVal). 편집으로 열 때 canonicalRoast가 조용히 맞춰 준다.
 */
export function roastLevelValue(l: RoastLevel): string {
  return `#${l.agtron} (${l.en})`;
}

/**
 * 저장된 값을 지금의 표기로 되돌린다 — 옛 한국어 표기를 영문으로.
 *
 * **6단계에 정확히 해당할 때만** 손댄다. parseRoastLevel은 #88을 #95로 붙여 주지만 그건 스와치를
 * 고르기 위한 근사이고, 저장값까지 옮기면 사용자가 적어 넣은 수치가 소리 없이 달라진다.
 */
export function canonicalRoast(v: string): string {
  const s = String(v ?? "").trim();
  if (!s) return s;
  const num = /(\d{2,3})/.exec(s);
  if (num) {
    const exact = ROAST_LEVELS.find((l) => l.agtron === Number(num[1]));
    return exact ? roastLevelValue(exact) : s;
  }
  const lv = parseRoastLevel(s);
  return lv ? roastLevelValue(lv) : s;
}

// 이름 매칭은 **긴 것부터** 본다 — "라이트"는 "울트라라이트"·"미디움라이트"의 부분 문자열이라
// 짧은 것부터 훑으면 셋이 전부 "라이트"로 붙는다.
const BY_NAME_LEN: readonly RoastLevel[] = [...ROAST_LEVELS].sort((a, b) => b.ko.length - a.ko.length);
// 좁은 표현이 먼저다 — "Medium Dark"가 dark보다 앞서지 않으면 다크로 붙고,
// "Full City"가 city보다 앞서지 않으면 미디움이 된다.
const EN_HINTS: readonly (readonly [RegExp, number])[] = [
  [/ultra\s*light|extra\s*light|초\s*라이트/i, 120],
  [/medium\s*dark|city\s*\+/i, 55],
  [/medium\s*light/i, 75],
  [/full\s*city|vienna|french|italian|dark/i, 45],
  [/medium|city/i, 65],
  [/light|cinnamon/i, 95],
];

/**
 * 저장값 → 레벨. "#120 (울트라라이트)"·"#88"·"라이트"·"Medium Dark"를 모두 받는다.
 *
 * 숫자는 **가장 가까운 단계로 붙인다**(#88 → #95). 사용자는 6단계 밖의 값도 직접 칠 수 있는데,
 * 그때 스와치가 사라지면 "색이 안 나오는 값"이라는 새 규칙이 생겨 버린다. 알아볼 단서가 하나도
 * 없을 때만 null이다.
 */
export function parseRoastLevel(v: string): RoastLevel | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const num = /(\d{2,3})/.exec(s);
  if (num) {
    const n = Number(num[1]);
    return ROAST_LEVELS.reduce((best, l) => (Math.abs(l.agtron - n) < Math.abs(best.agtron - n) ? l : best));
  }
  for (const l of BY_NAME_LEN) {
    if (s.includes(l.ko)) return l;
  }
  for (const [re, agtron] of EN_HINTS) {
    if (re.test(s)) return ROAST_LEVELS.find((l) => l.agtron === agtron) ?? null;
  }
  return null;
}

/** AI 프롬프트가 쓰는 6단계 나열 — "#120(Ultra Light), #95(Light), …" */
export function roastLevelsForPrompt(): string {
  return ROAST_LEVELS.map((l) => `#${l.agtron}(${l.en})`).join(", ");
}
