// 블렌드 연쇄 검증 — 산지가 블렌드가 되면 가공·품종이 따라가고, 되돌리면 함께 풀린다.
// 이 함수의 요점은 "채운다"가 아니라 **사용자가 적은 값은 절대 건드리지 않는다**는 쪽이라,
// 덮어쓰지 않는 경우들을 더 촘촘히 못 박는다.
import { expect, test } from "vitest";
import { appendNote, BLEND_VALUE, blendCascade, isBlend } from "./suggest";

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
