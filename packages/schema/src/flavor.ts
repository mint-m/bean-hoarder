// 향미 노트 어휘 — 등록 폼이 고르게 하고, 조회 카드의 색이 이 목록 위에서 정해진다.
//
// 왜 목록이 필요한가: 예전에는 콤마로 구분한 자유 텍스트라 같은 향미가 카드마다 다르게 적혔다
// (Honey Peach / honey peach / 황도). 표기가 갈리면 사람 눈에도 어수선하고, 향미 그라데이션
// (apps/web/src/lib/coffee-color.ts)의 계열 정규식도 놓친다.
//
// **저장·표시의 기준은 영문(`en`)이다.** 한글은 검색을 돕는 보조어일 뿐 저장되지 않는다 —
// 이 값이 인쇄 라벨(@bnhd/label의 fitNoteLine)에 그대로 찍히고, 기존에 등록된 영문 노트와
// 표기가 섞이면 안 되기 때문이다. 목록에 없는 향미는 사용자가 친 그대로 들어간다(막지 않는다).
//
// zod가 딸려오지 않도록 index.ts와 분리된 서브패스(@bnhd/schema/flavor)다 — headline·roast와 같은 이유.

export interface FlavorNote {
  /** 저장·표시되는 값 */
  readonly en: string;
  /** 검색어 겸 후보 목록의 보조 표시 — 저장되지 않는다 */
  readonly ko: string;
  /** 추가 검색어 — "황도"를 "복숭아"로도 찾게 한다 */
  readonly alias?: readonly string[];
}

/**
 * SCA 플레이버 휠을 계열별로 추린 목록. 순서가 곧 후보 목록의 기본 순서다.
 *
 * ⚠️ 여기 항목을 더할 때는 `coffee-color.ts`의 계열 정규식 중 하나에 걸리는지 확인한다 —
 * 안 걸리면 그 노트만 카드 색이 중립으로 죽는다. `flavor-coverage.test.ts`가 전수로 막는다.
 */
export const FLAVOR_NOTES: readonly FlavorNote[] = [
  // ── 꽃 ──
  { en: "Floral", ko: "플로럴" },
  { en: "Jasmine", ko: "자스민", alias: ["재스민"] },
  { en: "Rose", ko: "장미" },
  { en: "Magnolia", ko: "목련" },
  { en: "Osmanthus", ko: "금목서", alias: ["계화"] },
  { en: "Lavender", ko: "라벤더" },
  { en: "Hibiscus", ko: "히비스커스" },
  { en: "Chamomile", ko: "캐모마일" },
  { en: "Elderflower", ko: "엘더플라워" },
  { en: "Orange Blossom", ko: "오렌지꽃" },
  // ── 시트러스 ──
  { en: "Citrus", ko: "시트러스" },
  { en: "Lemon", ko: "레몬" },
  { en: "Lemon Zest", ko: "레몬제스트", alias: ["레몬 껍질"] },
  { en: "Lime", ko: "라임" },
  { en: "Orange", ko: "오렌지" },
  { en: "Orange Peel", ko: "오렌지필", alias: ["오렌지 껍질"] },
  { en: "Mandarin", ko: "만다린" },
  { en: "Tangerine", ko: "귤" },
  { en: "Grapefruit", ko: "자몽" },
  { en: "Bergamot", ko: "베르가못" },
  { en: "Yuzu", ko: "유자" },
  { en: "Lemongrass", ko: "레몬그라스" },
  // ── 베리 ──
  { en: "Berry", ko: "베리" },
  { en: "Strawberry", ko: "딸기" },
  { en: "Raspberry", ko: "라즈베리", alias: ["산딸기"] },
  { en: "Blueberry", ko: "블루베리" },
  { en: "Blackberry", ko: "블랙베리" },
  { en: "Cranberry", ko: "크랜베리" },
  { en: "Red Currant", ko: "레드커런트" },
  { en: "Black Currant", ko: "블랙커런트", alias: ["카시스"] },
  { en: "Cassis", ko: "카시스" },
  { en: "Cherry", ko: "체리" },
  { en: "Red Cherry", ko: "붉은 체리" },
  { en: "Plum", ko: "자두" },
  { en: "Prune", ko: "건자두" },
  { en: "Grape", ko: "포도" },
  { en: "White Grape", ko: "청포도" },
  { en: "Concord Grape", ko: "머루포도" },
  // ── 핵과·과수 ──
  { en: "Peach", ko: "복숭아" },
  { en: "Yellow Peach", ko: "황도", alias: ["복숭아"] },
  { en: "White Peach", ko: "백도", alias: ["복숭아"] },
  { en: "Nectarine", ko: "천도복숭아", alias: ["복숭아"] },
  { en: "Apricot", ko: "살구" },
  { en: "Apple", ko: "사과" },
  { en: "Green Apple", ko: "풋사과", alias: ["사과"] },
  { en: "Red Apple", ko: "홍사과", alias: ["사과"] },
  { en: "Pear", ko: "배" },
  { en: "Melon", ko: "멜론" },
  { en: "Watermelon", ko: "수박" },
  // ── 열대 ──
  { en: "Tropical Fruit", ko: "열대과일" },
  { en: "Mango", ko: "망고" },
  { en: "Pineapple", ko: "파인애플" },
  { en: "Passion Fruit", ko: "패션프루트", alias: ["백향과"] },
  { en: "Papaya", ko: "파파야" },
  { en: "Guava", ko: "구아바" },
  { en: "Lychee", ko: "리치", alias: ["여지"] },
  { en: "Banana", ko: "바나나" },
  { en: "Coconut", ko: "코코넛" },
  // ── 초콜릿 ──
  { en: "Chocolate", ko: "초콜릿" },
  { en: "Dark Chocolate", ko: "다크초콜릿" },
  { en: "Milk Chocolate", ko: "밀크초콜릿" },
  { en: "Cocoa", ko: "코코아" },
  { en: "Cacao Nib", ko: "카카오닙" },
  // ── 견과·단맛 ──
  { en: "Nutty", ko: "고소함", alias: ["너티"] },
  { en: "Almond", ko: "아몬드" },
  { en: "Hazelnut", ko: "헤이즐넛" },
  { en: "Peanut", ko: "땅콩" },
  { en: "Walnut", ko: "호두" },
  { en: "Pecan", ko: "피칸" },
  { en: "Caramel", ko: "캐러멜", alias: ["카라멜"] },
  { en: "Toffee", ko: "토피" },
  { en: "Butterscotch", ko: "버터스카치" },
  { en: "Brown Sugar", ko: "흑설탕" },
  { en: "Molasses", ko: "당밀" },
  { en: "Maple Syrup", ko: "메이플시럽" },
  { en: "Honey", ko: "꿀" },
  { en: "Vanilla", ko: "바닐라" },
  // ── 향신료·차 ──
  { en: "Spice", ko: "스파이스", alias: ["향신료"] },
  { en: "Cinnamon", ko: "시나몬", alias: ["계피"] },
  { en: "Clove", ko: "정향" },
  { en: "Cardamom", ko: "카다멈" },
  { en: "Nutmeg", ko: "육두구" },
  { en: "Ginger", ko: "생강" },
  { en: "Black Pepper", ko: "후추" },
  { en: "Herbal", ko: "허브" },
  { en: "Black Tea", ko: "홍차" },
  { en: "Green Tea", ko: "녹차" },
  { en: "Earl Grey", ko: "얼그레이" },
  { en: "Tobacco", ko: "담배" },
  { en: "Cedar", ko: "삼나무" },
  // ── 발효·주류 ──
  { en: "Winey", ko: "와이니" },
  { en: "Red Wine", ko: "레드와인" },
  { en: "White Wine", ko: "화이트와인" },
  { en: "Fermented", ko: "발효" },
  { en: "Boozy", ko: "부지", alias: ["술 향"] },
  { en: "Rum", ko: "럼" },
  { en: "Whiskey", ko: "위스키" },
  { en: "Brandy", ko: "브랜디" },
];

/**
 * 검색용 정규화 — 대소문자와 공백만 지운다(한글은 그대로).
 *
 * 폼의 향미 고르개도 같은 규칙으로 걸러야 한다(내 노트 검색). 규칙이 갈라지면 어휘는 걸리는데
 * 내 노트는 안 걸리는 식으로 한 목록 안에서 기준이 둘이 되므로 여기서 내보낸다.
 */
export const norm = (s: string): string =>
  String(s ?? "")
    .toLowerCase()
    .replace(/\s+/g, "");

/**
 * 어휘 검색 — 영문·한글·별칭을 모두 훑는다. "peach"로 황도·백도가, "복숭아"로도 같은 것이 나온다.
 *
 * 정렬은 완전 일치 → 접두 일치 → 부분 일치 순이고, 같은 등급 안에서는 목록 순서를 지킨다.
 * 빈 검색어에는 앞에서부터 limit개를 준다 — 포커스만 해도 뭘 고를 수 있는지 보이게 하려는 것이다.
 */
export function searchNotes(query: string, limit = 8): FlavorNote[] {
  const q = norm(query);
  if (!q) return FLAVOR_NOTES.slice(0, limit);
  const scored: { note: FlavorNote; score: number; i: number }[] = [];
  FLAVOR_NOTES.forEach((note, i) => {
    const primary = [note.en, note.ko].map(norm);
    const all = [...primary, ...(note.alias ?? []).map(norm)];
    let score = Number.POSITIVE_INFINITY;
    for (const t of primary) {
      if (t === q) score = Math.min(score, 0);
      else if (t.startsWith(q)) score = Math.min(score, 1);
      else if (t.includes(q)) score = Math.min(score, 2);
    }
    for (const t of all) {
      if (t.includes(q)) score = Math.min(score, 3);
    }
    if (Number.isFinite(score)) scored.push({ note, score, i });
  });
  return scored
    .sort((a, b) => a.score - b.score || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.note);
}

/**
 * 저장 문자열 ⇄ 토큰 배열.
 *
 * AI 자동 채우기와 CSV 복원이 넣는 것도, 조회 카드가 칩으로 쪼개는 것도 같은 콤마 목록이다.
 * 폼이 블록 칩으로 다루더라도 저장 형식은 바뀌지 않아야 그 셋이 계속 맞물린다.
 */
export function parseNotes(s: string): string[] {
  const out: string[] = [];
  for (const raw of String(s ?? "").split(",")) {
    const t = raw.trim();
    if (t && !out.some((v) => v.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out;
}

export function serializeNotes(tokens: readonly string[]): string {
  return parseNotes(tokens.join(",")).join(", ");
}

// ── 표기 정규화 ────────────────────────────────────────────────
// 한글 표기가 저장되면 세 곳이 함께 어긋난다: 인쇄 라벨에 한글이 찍히고, 같은 향미가 카드마다
// 다르게 적히고, 조회 카드의 색을 정하는 계열 정규식이 어휘 밖의 말을 못 알아본다.
// AI가 "Pineapple" 대신 "파인애플"을 주는 일이 실제로 있었다 — 프롬프트로 부탁하는 것만으로는
// 막을 수 없으므로, 폼에 들어오기 전에 되돌린다.

/** 어휘 조회표: 정규화한 표기 → 저장할 영문. en > ko > alias 순으로 우선한다. */
const BY_TEXT: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  // 뒤에서 덮어쓰지 않도록 우선순위가 낮은 것부터 넣는다
  for (const n of FLAVOR_NOTES) for (const a of n.alias ?? []) m.set(norm(a), n.en);
  for (const n of FLAVOR_NOTES) m.set(norm(n.ko), n.en);
  for (const n of FLAVOR_NOTES) m.set(norm(n.en), n.en);
  return m;
})();

/**
 * 노트 하나를 어휘의 영문 표기로 되돌린다 — 목록에 없으면 그대로 둔다.
 *
 * **완전 일치만** 본다. 부분 일치를 허용하면 "Honey Peach"가 "Honey"나 "Peach"로 뭉개진다.
 */
export function canonicalNote(note: string): string {
  const t = String(note ?? "").trim();
  return BY_TEXT.get(norm(t)) ?? t;
}

/** 콤마 목록 전체를 되돌린다 — 자동 채우기·붙여넣기가 들어오는 길목에서 쓴다. */
export function canonicalizeNotes(value: string): string {
  return serializeNotes(parseNotes(value).map(canonicalNote));
}
