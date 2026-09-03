// 입력 추천값 — 타이핑을 줄이기 위한 칩·datalist 공용 옵션 풀.
// 폼 컴포넌트가 아니라 여기 모아두는 이유: 같은 풀을 칩(한 번 눌러 채우기)과 datalist(자유 입력
// 자동완성)가 함께 쓰고, 스텝 구성이 바뀌어도 값 자체는 그대로 유지되기 때문이다.
import { ROAST_LEVELS, roastLevelValue } from "@bnhd/schema/roast";
import { isoOffset } from "./format";

const YY = String(new Date().getFullYear() % 100).padStart(2, "0");
const PREV_YY = String(Number(YY) - 1).padStart(2, "0");

/** 칩으로 먼저 보여줄 개수 — 나머지는 타이핑하면 datalist가 잡는다. */
export const CHIP_LIMIT = 6;

/** 문자열이면 값=표시, 객체면 표시와 값을 따로 (칩·datalist가 같은 풀을 쓴다) */
export type ChipOption = string | { label: string; value: string };
export const optionValue = (o: ChipOption): string => (typeof o === "string" ? o : o.value);
export const optionLabel = (o: ChipOption): string => (typeof o === "string" ? o : o.label);

/**
 * 블렌드의 **저장값** — 화면에 보이는 "(여러 원산지 혼합)" 설명은 칩 라벨에만 남는다.
 *
 * 예전에는 괄호까지 통째로 저장해서, 조회 카드 한 장에 "블렌드 (여러 원산지 혼합)"·"(여러 가공방식
 * 혼합)"·"(여러 품종 혼합)"이 셋 떴다. 헤드라인만 stripParen을 타고 서브라인·스펙 줄은 날값을 쓰기
 * 때문이다. 저장을 짧게 하면 그 누수가 애초에 생기지 않는다.
 */
export const BLEND_VALUE = "블렌드";

/** 이미 등록된 행은 괄호까지 저장돼 있어 접두로 본다. */
export function isBlend(v: string): boolean {
  return v.trim().startsWith(BLEND_VALUE);
}

/**
 * 국가를 블렌드로 바꾸면 가공·품종도 함께 블렌드가 되고, 되돌리면 함께 풀린다.
 *
 * 블렌드에는 단일 가공방식도 품종도 없는데 둘 다 등록 필수라, 산지만 고르면 다음 스텝에서 반드시
 * 막힌다. 다만 **사용자가 직접 적은 값은 절대 덮지 않는다** — 채우는 건 빈 칸에만, 지우는 건 아직
 * 블렌드 값 그대로일 때만. 그래서 이 함수는 바뀔 칸만 담은 조각을 돌려주고, 호출부가 그대로 넘긴다.
 */
export function blendCascade(
  prevOrigin: string,
  nextOrigin: string,
  form: { PROCESS: string; VARIETY: string },
): { PROCESS?: string; VARIETY?: string } {
  const now = isBlend(nextOrigin);
  if (isBlend(prevOrigin) === now) return {};
  const out: { PROCESS?: string; VARIETY?: string } = {};
  for (const k of ["PROCESS", "VARIETY"] as const) {
    const cur = form[k].trim();
    if (now) {
      if (!cur) out[k] = BLEND_VALUE;
    } else if (isBlend(cur)) {
      out[k] = "";
    }
  }
  return out;
}

export const ORIGIN_OPTIONS: readonly ChipOption[] = [
  "ETHIOPIA",
  "COLOMBIA",
  "KENYA",
  "BRAZIL",
  "GUATEMALA",
  "COSTA RICA",
  "PANAMA",
  "HONDURAS",
  "PERU",
  "INDONESIA",
  "RWANDA",
  "BURUNDI",
  "TANZANIA",
  "EL SALVADOR",
  "NICARAGUA",
  "MEXICO",
  "YEMEN",
  "INDIA",
  "VIETNAM",
  { label: "블렌드 (여러 원산지 혼합)", value: BLEND_VALUE },
];

export const PROCESS_OPTIONS: readonly ChipOption[] = [
  "Washed",
  "Natural",
  "Honey",
  "Anaerobic",
  "Carbonic Maceration",
  "Wet-Hulled",
  "Semi-Washed",
  { label: "블렌드 (여러 가공방식 혼합)", value: BLEND_VALUE },
];

export const VARIETY_OPTIONS: readonly ChipOption[] = [
  "Heirloom",
  "Bourbon",
  "Caturra",
  "Castillo",
  "Gesha",
  "Typica",
  "Catuai",
  "SL28",
  "SL34",
  "Pacamara",
  { label: "블렌드 (여러 품종 혼합)", value: BLEND_VALUE },
];

/**
 * 로스팅 레벨 추천 — 칩에는 레벨 이름만 보이고, 들어가는 값은 예전 그대로 "#120 (울트라라이트)"다.
 * 6단계의 단일 소스는 @bnhd/schema/roast (프롬프트·라벨·조회 카드가 함께 쓴다).
 */
export const ROASTPOINT_OPTIONS: readonly ChipOption[] = ROAST_LEVELS.map((l) => ({
  label: l.ko,
  value: roastLevelValue(l),
}));

export const HARVEST_OPTIONS = [`${PREV_YY}/${YY}`, YY, PREV_YY];

/** 소분 보관이 목적이라 소용량이 앞에 온다 (단위 g은 폼이 붙인다). */
export const WEIGHT_OPTIONS = ["20", "50", "100", "200", "250", "500", "1000"];

/** 자주 쓰는 플레이버 — 누르면 콤마 목록에 덧붙는다(교체가 아니라 누적). */
export const NOTE_OPTIONS = [
  "Jasmine",
  "Bergamot",
  "Peach",
  "Berry",
  "Citrus",
  "Floral",
  "Black Tea",
  "Chocolate",
  "Caramel",
  "Nutty",
  "Tropical",
  "Winey",
];

/**
 * 소분일 추천 — 달력을 열지 않고 흔한 값을 한 번에 넣는다.
 *
 * 소분일은 "내가 원두를 받아 나눠 담은 날"이라 거의 오늘이거나 며칠 안쪽이다. 그래서 절대 날짜
 * 칩이 스테퍼보다 빠르고, 셋이면 충분하다. 로스팅일은 성격이 달라(몇 주~몇 달 전) 누적 스테퍼가
 * 맡는다 — 이 목록을 거기에 쓰지 않는다.
 */
export function packageDateChips(): { label: string; value: string }[] {
  return [
    { label: "오늘", value: isoOffset(0) },
    { label: "어제", value: isoOffset(-1) },
    { label: "3일 전", value: isoOffset(-3) },
  ];
}

/** 콤마 목록에 항목을 덧붙인다 — 이미 있으면 그대로 둔다(중복 방지). */
export function appendNote(current: string, note: string): string {
  const segs = current
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (segs.some((s) => s.toLowerCase() === note.toLowerCase())) return current;
  return [...segs, note].join(", ");
}
