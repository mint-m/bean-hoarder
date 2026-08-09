// 헤드라인 조합 규칙 단위 테스트 — 조회·덱·라벨이 공유하는 단일 소스(@bnhd/schema/headline)의 계약.
//
// 대문자 처리는 이 함수 밖(라벨의 .toUpperCase(), 화면의 CSS)에 있으므로 여기선 자연 대소문자를
// 검증한다. 라벨 SVG에 대문자로 찍히는지는 @bnhd/label의 buildLabelSVG 테스트가 지킨다.
import assert from "node:assert/strict";
import { test } from "vitest";
import { buildHeadline, HEADLINE_PLACE_ORDER, headlineUsedFields, stripParen } from "./headline";

test("헤드라인: 국가 + 가장 세부 장소, 앵커 우선순위 워싱스테이션 > 생산자 > 지역", () => {
  assert.equal(buildHeadline({ ORIGIN: "ETHIOPIA", REGION: "Yirgacheffe" }), "ETHIOPIA Yirgacheffe");
  // 더 구체적인 앵커(워싱스테이션)가 지역을 이긴다
  assert.equal(
    buildHeadline({ ORIGIN: "ETHIOPIA", REGION: "Sidama", WASHING_STATION: "Gara Agena" }),
    "ETHIOPIA Gara Agena",
  );
  // 생산자는 지역보다 우선, 워싱스테이션보다 후순위
  assert.equal(
    buildHeadline({ ORIGIN: "COLOMBIA", REGION: "Nariño", PRODUCER: "El Paraiso" }),
    "COLOMBIA El Paraiso",
  );
});

test("헤드라인: LOT은 단독 앵커가 아니라 장소 뒤 보조로 덧붙는다", () => {
  assert.equal(
    buildHeadline({ ORIGIN: "COLOMBIA", PRODUCER: "El Paraiso", LOT: "Lot 12" }),
    "COLOMBIA El Paraiso · Lot 12",
  );
  // 장소가 없으면 국가 뒤에 바로 LOT
  assert.equal(buildHeadline({ ORIGIN: "KENYA", LOT: "AA" }), "KENYA · AA");
});

test("헤드라인: COFFEE_NAME(시그니쳐/블렌드명)이 있으면 그대로 대체 — 대문자화 없음", () => {
  assert.equal(
    buildHeadline({ ORIGIN: "블렌드", COFFEE_NAME: "푸루티 봉봉", REGION: "무시됨" }),
    "푸루티 봉봉",
  );
});

test("헤드라인: 국가·장소는 stripParen으로 괄호 축약", () => {
  assert.equal(buildHeadline({ ORIGIN: "블렌드 (여러 원산지 혼합)" }), "블렌드");
  assert.equal(stripParen("Washed (36 hours)"), "Washed");
});

test("headlineUsedFields: 헤드라인이 소비한 필드 목록 (부제목 중복 방지)", () => {
  assert.deepEqual(headlineUsedFields({ ORIGIN: "ETHIOPIA", WASHING_STATION: "Gara Agena", LOT: "Lot 1" }), [
    "WASHING_STATION",
    "LOT",
  ]);
  // COFFEE_NAME 오버라이드 시 장소·랏을 헤드라인이 쓰지 않으므로 빈 배열
  assert.deepEqual(headlineUsedFields({ ORIGIN: "ETHIOPIA", COFFEE_NAME: "봉봉", REGION: "X" }), []);
});

test("HEADLINE_PLACE_ORDER는 구체적 → 광역 순서 (라벨·화면이 같은 규칙을 쓰는지 고정)", () => {
  assert.deepEqual(HEADLINE_PLACE_ORDER, ["WASHING_STATION", "PRODUCER", "REGION"]);
});
