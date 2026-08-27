// 중앙 판정만 따로 검증한다 — 나머지(스크롤 구독·클래스 토글)는 실제 브라우저가 필요하지만,
// "어느 카드가 중앙인가"는 순수 계산이라 여기서 경계를 고정할 수 있다.
import { expect, test } from "vitest";
import { nearestToCenter } from "./deck-center";

test("가장 가까운 카드의 인덱스를 고른다", () => {
  expect(nearestToCenter([0, 100, 200], 90)).toBe(1);
  expect(nearestToCenter([0, 100, 200], 199)).toBe(2);
  expect(nearestToCenter([0, 100, 200], -50)).toBe(0);
});

// 동률에서 갈팡질팡하면 스크롤 도중 두 카드가 번갈아 펼쳐진다 — 앞선 카드로 못 박는다.
test("정확히 가운데면 앞선 카드를 고른다", () => {
  expect(nearestToCenter([0, 100], 50)).toBe(0);
});

test("카드가 없으면 -1", () => {
  expect(nearestToCenter([], 10)).toBe(-1);
});
