// 입력 추천값 — 타이핑을 줄이기 위한 칩·datalist 공용 옵션 풀.
// 폼 컴포넌트가 아니라 여기 모아두는 이유: 같은 풀을 칩(한 번 눌러 채우기)과 datalist(자유 입력
// 자동완성)가 함께 쓰고, 스텝 구성이 바뀌어도 값 자체는 그대로 유지되기 때문이다.
import { isoOffset } from "./format";

const YY = String(new Date().getFullYear() % 100).padStart(2, "0");
const PREV_YY = String(Number(YY) - 1).padStart(2, "0");

/** 칩으로 먼저 보여줄 개수 — 나머지는 타이핑하면 datalist가 잡는다. */
export const CHIP_LIMIT = 6;

export const ORIGIN_OPTIONS = [
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
  "블렌드 (여러 원산지 혼합)",
];

export const PROCESS_OPTIONS = [
  "Washed",
  "Natural",
  "Honey",
  "Anaerobic",
  "Carbonic Maceration",
  "Wet-Hulled",
  "Semi-Washed",
  "블렌드 (여러 가공방식 혼합)",
];

export const VARIETY_OPTIONS = [
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
  "블렌드 (여러 품종 혼합)",
];

export const ROASTPOINT_OPTIONS = [
  "#120 (울트라라이트)",
  "#95 (라이트)",
  "#75 (미디움라이트)",
  "#65 (미디움)",
  "#55 (미디움다크)",
  "#45 (다크)",
];

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
