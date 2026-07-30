// Bean-Hoarder — 카드/조회 헤드라인(메인 식별자) 조합. 덱(deck.html)과 조회 상세(index.html)가 공유한다.
// packages/label/src/label.js 의 buildHeadline·headlineUsedFields 와 동일 규칙을 유지해야 한다
// (라벨과 카드/조회 페이지가 같은 제목을 보여주도록) — 한쪽을 바꾸면 다른 쪽도 함께 고칠 것.
//
// 규칙: 국가만으로는 변별이 어려워 국가 + 가장 세부 장소 1개를 조합한다.
// 장소 앵커 우선순위(가장 구체적 순): 워싱스테이션 > 생산자 > 지역. 랏(LOT)은 번호만으론 단독
// 식별이 어려워 앵커 뒤에 보조로만 덧붙인다. 시그니쳐/블렌드명(COFFEE_NAME)이 있으면 그대로 대체.
(function (global) {
  var PLACE_ORDER = ["WASHING_STATION", "PRODUCER", "REGION"];

  // 괄호 속 상세 설명 축약 — "블렌드 (여러 원산지 혼합)" → "블렌드"
  function stripParen(s) {
    return String(s || "")
      .replace(/\s*[(（][^)）]*[)）]?/g, "")
      .trim();
  }
  function get(bean, k) {
    return stripParen((bean[k] || "").trim());
  }
  function placeKey(bean) {
    for (var i = 0; i < PLACE_ORDER.length; i++) {
      if (get(bean, PLACE_ORDER[i])) return PLACE_ORDER[i];
    }
    return null;
  }

  function bhHeadline(bean) {
    var name = (bean.COFFEE_NAME || "").trim();
    if (name) return name;
    var pk = placeKey(bean);
    var parts = [get(bean, "ORIGIN"), pk ? get(bean, pk) : ""].filter(Boolean);
    var head = parts.join(" ");
    var lot = get(bean, "LOT");
    if (lot) head = head ? head + " · " + lot : lot;
    return head;
  }

  // 헤드라인이 소비한 부제목 후보 필드 — 중복 표시 방지용. COFFEE_NAME 오버라이드 시 빈 배열.
  function bhHeadlineUsedFields(bean) {
    if ((bean.COFFEE_NAME || "").trim()) return [];
    var used = [];
    var pk = placeKey(bean);
    if (pk) used.push(pk);
    if (get(bean, "LOT")) used.push("LOT");
    return used;
  }

  global.bhHeadline = bhHeadline;
  global.bhHeadlineUsedFields = bhHeadlineUsedFields;
})(typeof window !== "undefined" ? window : this);
