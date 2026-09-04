// 날짜 상대 이동 검증 — 로스팅일 계산기(DateStepper)가 이 함수 위에 서 있다.
// 특히 달 이동은 조용히 틀리기 쉬운 자리라 여기서 못 박는다.
import { expect, test } from "vitest";
import { shiftIso } from "./format";

test("일수는 그대로 빼고 더한다", () => {
  expect(shiftIso("2026-08-20", { days: -3 })).toBe("2026-08-17");
  expect(shiftIso("2026-08-20", { days: -7 })).toBe("2026-08-13");
  expect(shiftIso("2026-08-01", { days: -1 })).toBe("2026-07-31");
});

test("빼기를 겹쳐 부르면 누적된다 — 계산기처럼 쓰는 것이 요점이다", () => {
  const a = shiftIso("2026-08-20", { days: -7 });
  const b = shiftIso(a, { days: -3 });
  expect(b).toBe("2026-08-10");
});

// 3/31에서 한 달을 빼면 2/31은 없다. 브라우저 기본 동작은 3/3으로 **앞으로** 넘어가는데,
// "한 달 전"을 눌렀는데 날짜가 미래로 가면 계산기로 쓸 수 없다.
test("달 이동은 옮긴 달의 말일을 넘지 않는다", () => {
  expect(shiftIso("2026-03-31", { months: -1 })).toBe("2026-02-28");
  expect(shiftIso("2026-05-31", { months: -1 })).toBe("2026-04-30");
  expect(shiftIso("2026-08-15", { months: -1 })).toBe("2026-07-15");
});

test("해를 넘겨도 맞는다", () => {
  expect(shiftIso("2026-01-15", { months: -1 })).toBe("2025-12-15");
  expect(shiftIso("2026-01-01", { days: -1 })).toBe("2025-12-31");
});

test("값이 비었거나 형식이 아니면 오늘을 기준으로 센다", () => {
  const today = new Date();
  today.setDate(today.getDate() - 3);
  const p2 = (n: number) => String(n).padStart(2, "0");
  const expected = `${today.getFullYear()}-${p2(today.getMonth() + 1)}-${p2(today.getDate())}`;
  expect(shiftIso("", { days: -3 })).toBe(expected);
  expect(shiftIso("26.08.20", { days: -3 })).toBe(expected);
});
