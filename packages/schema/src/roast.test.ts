// 로스팅 레벨 파싱 — 폼 칩·조회 카드 스와치·라벨이 모두 이 함수 하나로 값을 읽는다.
// 저장 형식("#120 (Ultra Light)")과 옛 한국어 표기의 해석을 함께 못 박는다.
import assert from "node:assert/strict";
import { test } from "vitest";
import {
  canonicalRoast,
  parseRoastLevel,
  ROAST_LEVELS,
  roastLevelsForPrompt,
  roastLevelValue,
} from "./roast";

test("저장 형식은 '#숫자 (영문)'이다", () => {
  assert.equal(ROAST_LEVELS.map(roastLevelValue).at(0), "#120 (Ultra Light)");
  assert.equal(ROAST_LEVELS.map(roastLevelValue).at(-1), "#45 (Dark)");
});

test("스와치는 밝은 쪽에서 어두운 쪽으로 선다", () => {
  const l = ROAST_LEVELS.map((r) => Number(/oklch\(([\d.]+)/.exec(r.swatch)?.[1]));
  assert.deepEqual(
    [...l].sort((a, b) => b - a),
    l,
  );
  assert.deepEqual(
    ROAST_LEVELS.map((r) => r.agtron),
    [...ROAST_LEVELS.map((r) => r.agtron)].sort((a, b) => b - a),
  );
});

test("저장값을 그대로 되읽는다", () => {
  for (const l of ROAST_LEVELS) {
    assert.equal(parseRoastLevel(roastLevelValue(l))?.agtron, l.agtron);
  }
});

// 6단계 밖의 값도 직접 칠 수 있다. 그때 스와치가 사라지면 "색이 안 나오는 값"이 생겨 버린다.
test("6단계 밖의 숫자는 가장 가까운 단계로 붙인다", () => {
  assert.equal(parseRoastLevel("#88")?.agtron, 95);
  assert.equal(parseRoastLevel("70")?.agtron, 75);
  assert.equal(parseRoastLevel("#40")?.agtron, 45);
});

// "라이트"는 "울트라라이트"·"미디움라이트"의 부분 문자열이다 — 짧은 것부터 훑으면 셋이 다 붙는다.
test("한글 이름은 긴 것부터 본다", () => {
  assert.equal(parseRoastLevel("울트라라이트")?.agtron, 120);
  assert.equal(parseRoastLevel("미디움라이트")?.agtron, 75);
  assert.equal(parseRoastLevel("라이트")?.agtron, 95);
  assert.equal(parseRoastLevel("미디움다크")?.agtron, 55);
});

test("영문 로스팅 표현도 받는다", () => {
  assert.equal(parseRoastLevel("Extra Light")?.agtron, 120);
  assert.equal(parseRoastLevel("Medium Dark")?.agtron, 55);
  assert.equal(parseRoastLevel("Full City")?.agtron, 45);
  assert.equal(parseRoastLevel("City")?.agtron, 65);
});

test("단서가 없으면 null", () => {
  assert.equal(parseRoastLevel(""), null);
  assert.equal(parseRoastLevel("   "), null);
  assert.equal(parseRoastLevel("맛있음"), null);
});

test("AI 프롬프트 나열은 저장 형식과 같은 6단계를 말한다", () => {
  assert.equal(
    roastLevelsForPrompt(),
    "#120(Ultra Light), #95(Light), #75(Medium Light), #65(Medium), #55(Medium Dark), #45(Dark)",
  );
});

// ── 표기 정규화 ────────────────────────────────────────────────
// 괄호 안이 한국어에서 영문으로 바뀌었다. 옛 행은 편집으로 열 때 여기서 맞춰진다.

test("옛 한국어 표기를 영문으로 되돌린다", () => {
  assert.equal(canonicalRoast("#120 (울트라라이트)"), "#120 (Ultra Light)");
  assert.equal(canonicalRoast("#55 (미디움다크)"), "#55 (Medium Dark)");
  assert.equal(canonicalRoast("울트라라이트"), "#120 (Ultra Light)");
  assert.equal(canonicalRoast("Medium Dark"), "#55 (Medium Dark)");
});

test("이미 영문이면 그대로다", () => {
  for (const l of ROAST_LEVELS) {
    assert.equal(canonicalRoast(roastLevelValue(l)), roastLevelValue(l));
  }
});

// parseRoastLevel은 #88을 #95로 붙여 주지만 그건 스와치를 고르기 위한 근사다.
// 저장값까지 옮기면 사용자가 적어 넣은 수치가 소리 없이 달라진다.
test("6단계 밖의 숫자는 손대지 않는다", () => {
  assert.equal(canonicalRoast("#88"), "#88");
  assert.equal(canonicalRoast("70"), "70");
  assert.equal(canonicalRoast(""), "");
  assert.equal(canonicalRoast("맛있음"), "맛있음");
});
