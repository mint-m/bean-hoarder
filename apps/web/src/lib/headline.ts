// 카드/조회 헤드라인(메인 식별자) 조합 — 구 public/headline.js의 TS 이식.
//
// 규칙: 국가만으로는 변별이 어려워 국가 + 가장 세부 장소 1개를 조합한다.
// 장소 앵커 우선순위(가장 구체적 순): 워싱스테이션 > 생산자 > 지역. 랏(LOT)은 번호만으론 단독
// 식별이 어려워 앵커 뒤에 보조로만 덧붙인다. 시그니쳐/블렌드명(COFFEE_NAME)이 있으면 그대로 대체.
//
// ⚠️ 아직 @bnhd/label의 buildHeadline과 같은 규칙을 손으로 유지해야 한다 — 대문자 처리만 다르다
// (라벨은 .toUpperCase(), 화면은 CSS text-transform). 이 중복은 #55 2단계에서 없앤다.
export const HEADLINE_PLACE_ORDER = ["WASHING_STATION", "PRODUCER", "REGION"] as const;

export type BeanRow = Record<string, string | boolean | undefined>;

/** 괄호 속 상세 설명 축약 — "블렌드 (여러 원산지 혼합)" → "블렌드" */
export function stripParen(s: string): string {
  return String(s || "")
    .replace(/\s*[(（][^)）]*[)）]?/g, "")
    .trim();
}

const g = (row: BeanRow, k: string): string => stripParen(String(row[k] ?? "").trim());

function placeKey(row: BeanRow): string | null {
  for (const k of HEADLINE_PLACE_ORDER) {
    if (g(row, k)) return k;
  }
  return null;
}

export function buildHeadline(row: BeanRow): string {
  const name = String(row.COFFEE_NAME ?? "").trim();
  if (name) return name;
  const pk = placeKey(row);
  const parts = [g(row, "ORIGIN"), pk ? g(row, pk) : ""].filter(Boolean);
  let head = parts.join(" ");
  const lot = g(row, "LOT");
  if (lot) head = head ? `${head} · ${lot}` : lot;
  return head;
}

/** 헤드라인이 소비한 부제목 후보 필드 — 중복 표시 방지용. COFFEE_NAME 오버라이드 시 빈 배열. */
export function headlineUsedFields(row: BeanRow): string[] {
  if (String(row.COFFEE_NAME ?? "").trim()) return [];
  const used: string[] = [];
  const pk = placeKey(row);
  if (pk) used.push(pk);
  if (g(row, "LOT")) used.push("LOT");
  return used;
}
