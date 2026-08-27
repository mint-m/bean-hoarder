// 카드/조회/라벨 헤드라인(메인 식별자) 조합 — 원두 필드로 이름을 만드는 도메인 규칙의 단일 소스.
//
// 규칙: 국가만으로는 변별이 어려워 국가 + 가장 세부 장소 1개를 조합한다.
// 장소 앵커 우선순위(가장 구체적 순): 워싱스테이션 > 생산자 > 지역. 랏(LOT)은 번호만으론 단독
// 식별이 어려워 앵커 뒤에 보조로만 덧붙인다. 시그니쳐/블렌드명(COFFEE_NAME)이 있으면 그대로 대체.
//
// 대문자 처리는 여기서 하지 않는다 — 조회·덱은 CSS text-transform로, 라벨(@bnhd/label)은 SVG라
// 자체적으로 .toUpperCase()를 건다. 규칙(무엇을 조합하는가)만 여기 두고 표현(대소문자)은 호출부에.
//
// zod가 딸려오지 않도록 index.ts와 분리된 서브패스(@bnhd/schema/headline)로 격리한다 — 조회·덱
// 번들이 이 파일만 가져가고 스키마 검증 코드는 가져가지 않는다.
export const HEADLINE_PLACE_ORDER = ["WASHING_STATION", "PRODUCER", "REGION"] as const;

/** 헤드라인 입력: CSV 키(UPPER_SNAKE) 기준의 느슨한 원두 레코드. 부분 행·미지 키를 허용한다. */
export type HeadlineRow = Record<string, string | boolean | undefined>;

/** 괄호 속 상세 설명 축약 — "블렌드 (여러 원산지 혼합)" → "블렌드" */
export function stripParen(s: string): string {
  return String(s || "")
    .replace(/\s*[(（][^)）]*[)）]?/g, "")
    .trim();
}

const g = (row: HeadlineRow, k: string): string => stripParen(String(row[k] ?? "").trim());

function placeKey(row: HeadlineRow): string | null {
  for (const k of HEADLINE_PLACE_ORDER) {
    if (g(row, k)) return k;
  }
  return null;
}

export function buildHeadline(row: HeadlineRow): string {
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
export function headlineUsedFields(row: HeadlineRow): string[] {
  if (String(row.COFFEE_NAME ?? "").trim()) return [];
  const used: string[] = [];
  const pk = placeKey(row);
  if (pk) used.push(pk);
  if (g(row, "LOT")) used.push("LOT");
  return used;
}
