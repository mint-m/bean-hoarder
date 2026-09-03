// 어휘와 색의 계약 — 등록 폼이 고를 수 있는 모든 향미 노트는 카드 색을 가져야 한다.
//
// 두 파일이 멀리 떨어져 있어 조용히 어긋난다: 어휘(@bnhd/schema/flavor)에 노트를 하나 더하는 일과
// 계열 정규식(coffee-color.ts)을 손보는 일이 서로를 부르지 않는다. 그러면 그 노트를 고른 카드만
// 밴드 색이 중립 웜브라운으로 죽는데, 화면을 안 열어 보면 아무도 모른다. 여기서 전수로 막는다.
//
// 예외 목록을 두지 않는 것이 요점이다 — 노트를 더하려면 색도 함께 가르쳐야 한다.
import { FLAVOR_NOTES } from "@bnhd/schema/flavor";
import { expect, test } from "vitest";
import { matchFlavorFamilies } from "./coffee-color";

test("어휘의 모든 노트가 향미 계열 하나에는 걸린다", () => {
  const dead = FLAVOR_NOTES.filter((n) => matchFlavorFamilies(n.en).length === 0).map(
    (n) => `${n.en} (${n.ko})`,
  );
  expect(dead).toEqual([]);
});

test("어휘에 중복된 저장값이 없다", () => {
  const seen = FLAVOR_NOTES.map((n) => n.en.toLowerCase());
  expect(seen.length).toBe(new Set(seen).size);
});
