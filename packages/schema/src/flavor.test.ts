// 향미 어휘 검색·직렬화 — 등록 폼의 노트 피커가 이 함수들 위에 서 있다.
// 저장 형식(콤마 목록)은 AI 자동 채우기·CSV 복원·조회 카드 칩이 함께 쓰는 계약이라 함께 못 박는다.
import assert from "node:assert/strict";
import { test } from "vitest";
import {
  canonicalizeNotes,
  canonicalNote,
  FLAVOR_NOTES,
  parseNotes,
  searchNotes,
  serializeNotes,
} from "./flavor";

const ens = (q: string) => searchNotes(q, 20).map((n) => n.en);

test("영문으로 검색한다", () => {
  const r = ens("peach");
  assert.ok(r.includes("Peach"));
  assert.ok(r.includes("Yellow Peach"));
  assert.ok(r.includes("White Peach"));
});

// 사용자가 요구한 핵심 — 한글로 쳐도 같은 것이 나와야 한다. 저장되는 값은 어디까지나 영문이다.
test("한글로도 같은 것이 나온다 — 별칭 포함", () => {
  assert.deepEqual(ens("황도"), ["Yellow Peach"]);
  const bok = ens("복숭아");
  assert.ok(bok.includes("Peach"));
  assert.ok(bok.includes("Yellow Peach")); // 별칭으로 잡힌다
  assert.ok(bok.includes("White Peach"));
  assert.deepEqual(ens("계피"), ["Cinnamon"]);
});

test("완전 일치가 접두보다, 접두가 부분보다 앞선다", () => {
  assert.equal(ens("rose")[0], "Rose");
  assert.equal(searchNotes("cherry", 20)[0]?.en, "Cherry");
});

test("대소문자와 공백은 무시한다", () => {
  assert.deepEqual(ens("BLACKTEA"), ens("black tea"));
  assert.ok(ens("  Yellow  Peach ").includes("Yellow Peach"));
});

test("빈 검색어는 앞에서부터 준다 — 포커스만 해도 고를 것이 보이게", () => {
  const r = searchNotes("", 5);
  assert.equal(r.length, 5);
  assert.equal(r[0]?.en, FLAVOR_NOTES[0]?.en);
});

test("찾는 것이 없으면 빈 목록 — 그때는 친 값이 그대로 노트가 된다", () => {
  assert.deepEqual(ens("zzzzz"), []);
});

test("콤마 목록 왕복 — 공백을 다듬고 중복을 지운다", () => {
  assert.deepEqual(parseNotes(" Peach ,  Berry ,peach "), ["Peach", "Berry"]);
  assert.equal(serializeNotes(["Peach", "Berry"]), "Peach, Berry");
  assert.deepEqual(parseNotes(""), []);
  // AI 자동 채우기·CSV 복원이 넣는 문자열이 그대로 토큰이 되어야 한다
  assert.deepEqual(parseNotes("Floral, Lychee, Honey Peach, White Grape"), [
    "Floral",
    "Lychee",
    "Honey Peach",
    "White Grape",
  ]);
});

// ── 표기 정규화 ────────────────────────────────────────────────
// AI가 "Pineapple" 대신 "파인애플"을 주는 일이 실제로 있었다. 그대로 저장되면 인쇄 라벨에 한글이
// 찍히고, 같은 향미가 카드마다 다르게 적히고, 카드 색을 정하는 계열 정규식이 못 알아본다.

test("한글로 들어온 노트를 영문 표기로 되돌린다", () => {
  assert.equal(canonicalNote("파인애플"), "Pineapple");
  assert.equal(canonicalNote("자스민"), "Jasmine");
  assert.equal(canonicalNote("황도"), "Yellow Peach");
  assert.equal(canonicalNote("다크초콜릿"), "Dark Chocolate");
});

test("별칭으로 들어와도 되돌린다", () => {
  assert.equal(canonicalNote("재스민"), "Jasmine"); // Jasmine의 별칭
  assert.equal(canonicalNote("카라멜"), "Caramel");
});

test("영문 표기는 대소문자·공백만 다듬는다", () => {
  assert.equal(canonicalNote("pineapple"), "Pineapple");
  assert.equal(canonicalNote("  DARK  CHOCOLATE "), "Dark Chocolate");
});

// 부분 일치를 허용하면 "Honey Peach"가 "Honey"나 "Peach"로 뭉개진다.
test("완전 일치만 본다 — 어휘 밖의 말은 그대로 둔다", () => {
  assert.equal(canonicalNote("Honey Peach"), "Honey Peach");
  assert.equal(canonicalNote("복숭아 사탕"), "복숭아 사탕");
  assert.equal(canonicalNote(""), "");
});

// 같은 말이 여러 항목에 걸리면 ko가 alias를 이긴다 — "복숭아"는 Peach의 이름이자
// Yellow/White Peach의 별칭이고, "카시스"는 Cassis의 이름이자 Black Currant의 별칭이다.
test("이름이 별칭을 이긴다", () => {
  assert.equal(canonicalNote("복숭아"), "Peach");
  assert.equal(canonicalNote("카시스"), "Cassis");
});

test("콤마 목록 전체를 되돌리고 중복을 지운다", () => {
  assert.equal(
    canonicalizeNotes("파인애플, 자스민, Pineapple, 알수없는향"),
    "Pineapple, Jasmine, 알수없는향",
  );
  assert.equal(canonicalizeNotes(""), "");
});
