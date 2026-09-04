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

// 위 전수 검사는 "계열이 하나라도 걸리는가"만 본다. 그래서 Nutmeg이 `nut`에 걸려 견과류 색을
// 쓰는 동안에도 통과했다. 다른 계열의 키워드를 부분 문자열로 품은 노트만 여기서 못박는다 —
// 어휘 전체의 정답표를 손으로 유지하는 대신, 실제로 걸려 넘어진 자리만 남긴다.
test("다른 계열의 키워드를 품은 노트가 제 계열로 간다", () => {
  const first = (note: string) => matchFlavorFamilies(note)[0]?.name;
  expect(first("Nutmeg")).toBe("spice"); // `nut`(견과류)을 앞에 품는다
  expect(first("육두구")).toBe("spice");
  expect(first("Grapefruit")).toBe("citrus"); // `grape`(베리)를 앞에 품는다
  expect(first("Hazelnut")).toBe("nutty"); // 반대로 여기서는 `nut`이 제 계열이어야 한다
  expect(first("Peanut")).toBe("nutty");
});

test("계열마다 색이 다르다 — 같은 hue를 쓰는 계열이 없다", () => {
  // citrus와 nutty가 같은 hue 70을 쓰던 시절이 있었다. 그러면 카드 띠만 봐선 두 결이 구분되지 않는다.
  const hues = FLAVOR_NOTES.map((n) => matchFlavorFamilies(n.en)[0])
    .filter((f) => f !== undefined)
    .map((f) => `${f.name}:${f.hue}`);
  const byHue = new Map<number, Set<string>>();
  for (const entry of new Set(hues)) {
    const [name, hue] = entry.split(":") as [string, string];
    const set = byHue.get(Number(hue)) ?? new Set<string>();
    set.add(name);
    byHue.set(Number(hue), set);
  }
  const collisions = [...byHue.entries()].filter(([, names]) => names.size > 1);
  expect(collisions).toEqual([]);
});
