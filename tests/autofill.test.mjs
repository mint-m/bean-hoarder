// 자동 채우기 휴리스틱 파서 단위 테스트 — node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBeanText } from "../v2/public/autofill.js";

test("라벨: 값 형식 스펙시트 인식", () => {
  const out = parseBeanText([
    "Origin: Ethiopia",
    "Region: Yirgacheffe",
    "Area: Gedeb",
    "Variety: 74158",
    "Process: Washed",
    "Altitude: 1900-2250m",
    "Harvest: 2025/2026",
    "Net Weight: 200g",
    "Tasting Notes: Jasmine, bergamot, white peach",
  ].join("\n"));
  assert.equal(out.ORIGIN, "ETHIOPIA");                 // 알려진 국가는 대문자 표준화
  assert.equal(out.REGION, "Yirgacheffe, Gedeb");       // REGION 계열은 콤마 병합
  assert.equal(out.VARIETY, "74158");
  assert.equal(out.PROCESS, "Washed");
  assert.equal(out.ALTITUDE, "1900-2250");              // 단위 제거 (폼이 자동 부착)
  assert.equal(out.HARVEST, "25/26");
  assert.equal(out.NET_WEIGHT, "200");
  assert.equal(out.TASTING_NOTE, "Jasmine, bergamot, white peach");
});

test("자유 텍스트: 국가·가공(가장 긴 매치)·JARC 품종·kg 환산", () => {
  const out = parseBeanText(
    "This washed coffee from Colombia. Washed (36 hours wet fermentation, 21 days drying) lot. " +
    "Variety 74110 grown at 2100 masl. 1kg bag. https://shop.example/bean"
  );
  assert.equal(out.ORIGIN, "COLOMBIA");
  assert.ok(out.PROCESS.startsWith("Washed (36 hours"));  // 짧은 매치 대신 괄호 포함 긴 매치
  assert.equal(out.VARIETY, "74110");
  assert.equal(out.ALTITUDE, "2100");
  assert.equal(out.NET_WEIGHT, "1000");
  assert.equal(out.SOURCE_URL, "https://shop.example/bean");
});

test("수확시기: 월 범위 → 점 표기 정규화", () => {
  const out = parseBeanText("Harvest: December 2025 – January 2026");
  assert.equal(out.HARVEST, "25.12-26.01");
});

test("5kg 초과 무게는 오탐으로 무시", () => {
  const out = parseBeanText("Our roastery processes 600kg per day.");
  assert.equal(out.NET_WEIGHT, undefined);
});

test("빈 텍스트는 빈 결과", () => {
  assert.deepEqual(parseBeanText("   \n  "), {});
});

test("라벨 한 줄 + 다음 줄 값 (콜론 없이 블록으로만 분리되는 사이트 구조)", () => {
  // <div>Region</div><div>Villa Rica, Junín</div> 류가 htmlToText를 거치면 이런 모양이 된다
  const out = parseBeanText([
    "Region", "Villa Rica, Junín",
    "Producer", "Gilber Sedano",
    "Variety", "Catimor",
    "Process", "Washed",
  ].join("\n"));
  assert.equal(out.REGION, "Villa Rica, Junín");
  assert.equal(out.PRODUCER, "Gilber Sedano");
  assert.equal(out.VARIETY, "Catimor");
  assert.equal(out.PROCESS, "Washed");
});

test("MEMO: About/Description 표제 다음 여러 줄 문단을 이어붙이고 다음 라벨 줄에서 멈춤", () => {
  const out = parseBeanText([
    "About this coffee",
    "This lot was grown by smallholder farmers on the slopes above the village.",
    "It was selected during our 2026 cupping trip for its floral sweetness.",
    "Region",
    "Yirgacheffe",
  ].join("\n"));
  assert.equal(out.MEMO, "This lot was grown by smallholder farmers on the slopes above the village. "
    + "It was selected during our 2026 cupping trip for its floral sweetness.");
  assert.equal(out.REGION, "Yirgacheffe");
});

test("라벨 한 줄 패턴도 이미 채워진 필드는 덮어쓰지 않는다", () => {
  const out = parseBeanText(["Region: Gedeb", "Region", "Yirgacheffe"].join("\n"));
  assert.equal(out.REGION, "Gedeb, Yirgacheffe");   // REGION은 계층 병합이 의도된 예외
});

test("PROCESS가 이미 짧게 채워진 뒤 별도 'PROCESSING' 상세 문단이 나오면 메모로 돌린다", () => {
  const out = parseBeanText([
    "Variety", "Chiroso",
    "Process", "CHIROSO - WASHED",
    "PROCESSING",
    "Hand-picked at peak ripeness. Floated. De-pulped on the day of harvest. "
      + "Fermented underwater for 6 days. Dried on raised beds until moisture content reaches ~10%.",
  ].join("\n"));
  assert.equal(out.PROCESS, "CHIROSO - WASHED");
  assert.equal(out.MEMO, "Hand-picked at peak ripeness. Floated. De-pulped on the day of harvest. "
    + "Fermented underwater for 6 days. Dried on raised beds until moisture content reaches ~10%.");
});

test("같은 줄(label: value) 패턴에서도 짧은 필드에 뒤늦게 붙는 상세 문단은 메모로 돌린다", () => {
  const out = parseBeanText([
    "Process: Washed",
    "Processing: Hand-picked at peak ripeness. Floated and fermented underwater for six days before drying.",
  ].join("\n"));
  assert.equal(out.PROCESS, "Washed");
  assert.equal(out.MEMO, "Hand-picked at peak ripeness. Floated and fermented underwater for six days before drying.");
});
