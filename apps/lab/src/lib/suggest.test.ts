// 블렌드 연쇄 검증 — 산지가 블렌드가 되면 가공·품종이 따라가고, 되돌리면 함께 풀린다.
// 이 함수의 요점은 "채운다"가 아니라 **사용자가 적은 값은 절대 건드리지 않는다**는 쪽이라,
// 덮어쓰지 않는 경우들을 더 촘촘히 못 박는다.
import { expect, test } from "vitest";
import { appendNote, BLEND_VALUE, blendCascade, isBlend, optionValue, visibleChips } from "./suggest";

const form = (PROCESS = "", VARIETY = "") => ({ PROCESS, VARIETY });

test("산지를 블렌드로 바꾸면 빈 가공·품종이 함께 채워진다", () => {
  expect(blendCascade("ETHIOPIA", BLEND_VALUE, form())).toEqual({
    PROCESS: BLEND_VALUE,
    VARIETY: BLEND_VALUE,
  });
});

test("이미 적힌 값은 덮지 않는다 — 빈 칸만 채운다", () => {
  expect(blendCascade("ETHIOPIA", BLEND_VALUE, form("Washed", ""))).toEqual({
    VARIETY: BLEND_VALUE,
  });
  expect(blendCascade("ETHIOPIA", BLEND_VALUE, form("Washed", "Gesha"))).toEqual({});
});

test("블렌드에서 벗어나면 아직 블렌드 그대로인 칸만 비운다", () => {
  expect(blendCascade(BLEND_VALUE, "KENYA", form(BLEND_VALUE, BLEND_VALUE))).toEqual({
    PROCESS: "",
    VARIETY: "",
  });
  // 블렌드를 고른 뒤 품종을 직접 고쳤다면 그건 사용자의 값이다 — 지우지 않는다.
  expect(blendCascade(BLEND_VALUE, "KENYA", form(BLEND_VALUE, "SL28"))).toEqual({
    PROCESS: "",
  });
});

test("블렌드 여부가 그대로면 아무것도 건드리지 않는다", () => {
  expect(blendCascade("ETHIOPIA", "KENYA", form("Washed", "SL28"))).toEqual({});
  expect(blendCascade(BLEND_VALUE, BLEND_VALUE, form())).toEqual({});
});

// 저장값이 짧아지기 전에 등록된 행은 괄호까지 들고 있다. 그 행을 편집할 때도 연쇄가 돌아야 한다.
test("괄호까지 저장된 옛 값도 블렌드로 인식한다", () => {
  expect(isBlend("블렌드 (여러 원산지 혼합)")).toBe(true);
  expect(isBlend("블렌드")).toBe(true);
  expect(isBlend("ETHIOPIA")).toBe(false);
  expect(isBlend("")).toBe(false);
  expect(blendCascade("블렌드 (여러 원산지 혼합)", "KENYA", form("블렌드 (여러 가공방식 혼합)", ""))).toEqual(
    {
      PROCESS: "",
    },
  );
});

test("노트 덧붙이기는 대소문자를 무시하고 중복을 막는다", () => {
  expect(appendNote("", "Peach")).toBe("Peach");
  expect(appendNote("Peach", "Bergamot")).toBe("Peach, Bergamot");
  expect(appendNote("Peach, Bergamot", "peach")).toBe("Peach, Bergamot");
});

// ── 칩 줄 접기·정렬 ───────────────────────────────────────────
// 375px에서 칩이 두세 줄로 흘러넘쳐 스텝이 칩 벽으로 보이던 자리. 예산 배분과 일치도 정렬을 함께 본다.

const OPTS = ["ETHIOPIA", "COLOMBIA", "KENYA", "BRAZIL", "GUATEMALA", "COSTA RICA", BLEND_VALUE];
const shownOf = (r: ReturnType<typeof visibleChips>) => r.shown.map(optionValue);

test("접으면 limit개까지만 보이고 나머지 수를 센다", () => {
  const r = visibleChips(OPTS, { limit: 4 });
  expect(shownOf(r)).toEqual(["ETHIOPIA", "COLOMBIA", "KENYA", "BRAZIL"]);
  expect(r.hiddenCount).toBe(3);
});

// pin을 예산 밖의 덤으로 두면 줄 수가 늘어 limit를 내린 의미가 없어진다.
test("고정 노출(pin)은 limit 안에서 자리를 먼저 가져간다", () => {
  const r = visibleChips(OPTS, { limit: 4, pin: BLEND_VALUE });
  expect(shownOf(r)).toEqual(["ETHIOPIA", "COLOMBIA", "KENYA", BLEND_VALUE]);
  expect(r.shown.length).toBe(4);
  expect(r.hiddenCount).toBe(3);
});

test("현재 값도 뒤쪽 칩이면 함께 끌어올린다", () => {
  const r = visibleChips(OPTS, { limit: 4, value: "GUATEMALA" });
  expect(shownOf(r).includes("GUATEMALA")).toBe(true);
  expect(r.shown.length).toBe(4);
});

test("칸에 친 글자와 맞는 칩이 앞으로 올라온다", () => {
  expect(shownOf(visibleChips(OPTS, { limit: 4, value: "co" })).slice(0, 2)).toEqual([
    "COLOMBIA",
    "COSTA RICA",
  ]);
  // 완전 일치가 접두보다 앞선다
  expect(shownOf(visibleChips(OPTS, { limit: 4, value: "KENYA" }))[0]).toBe("KENYA");
  // 같은 점수끼리는 원래 순서를 지킨다
  expect(shownOf(visibleChips(OPTS, { limit: 3, value: "zzz" }))).toEqual(["ETHIOPIA", "COLOMBIA", "KENYA"]);
});

// 펼친 뒤 감춘 개수를 다시 세면 0이 되어 버튼이 사라지고, 되돌아갈 길이 없어진다.
test("감춘 개수는 펼친 뒤에도 접힌 상태 기준으로 남는다", () => {
  const r = visibleChips(OPTS, { limit: 4, expanded: true });
  expect(r.shown.length).toBe(OPTS.length);
  expect(r.hiddenCount).toBe(3);
});

test("limit이 없으면 전부 보인다", () => {
  const r = visibleChips(OPTS, {});
  expect(r.shown.length).toBe(OPTS.length);
  expect(r.hiddenCount).toBe(0);
});
