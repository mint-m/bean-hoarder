// 어휘와 색의 계약 — 등록 폼이 고를 수 있는 모든 향미 노트는 카드 색을 가져야 한다.
//
// 두 파일이 멀리 떨어져 있어 조용히 어긋난다: 어휘(@bnhd/schema/flavor)에 노트를 하나 더하는 일과
// 계열 정규식(coffee-color.ts)을 손보는 일이 서로를 부르지 않는다. 그러면 그 노트를 고른 카드만
// 밴드 색이 중립 웜브라운으로 죽는데, 화면을 안 열어 보면 아무도 모른다. 여기서 전수로 막는다.
//
// 예외 목록을 두지 않는 것이 요점이다 — 노트를 더하려면 색도 함께 가르쳐야 한다.
import { FLAVOR_NOTES } from "@bnhd/schema/flavor";
import { expect, test } from "vitest";
import { FLAVOR_FAMILIES, matchFlavorFamilies } from "./coffee-color";

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
  expect(first("Pineapple")).toBe("tropical"); // `apple`(초록 과일)을 뒤에 품는다
  expect(first("Orange Blossom")).toBe("floral"); // `orange`(시트러스)를 앞에 품는다
  expect(first("오렌지꽃")).toBe("floral");
  expect(first("담배")).toBe("spice"); // `배`(초록 과일)를 뒤에 품는다
});

// 복숭아·살구는 주황 과일인데 사과·배·멜론과 한 계열로 묶여 hue 148 순초록을 받았다 —
// "Yellow Peach"를 고른 카드가 초록 워시를 받은 것이 이 분리의 계기다.
test("핵과와 초록 과일이 서로 다른 계열로 간다", () => {
  const first = (note: string) => matchFlavorFamilies(note)[0]?.name;
  for (const n of ["Yellow Peach", "White Peach", "Apricot", "Nectarine", "천도복숭아"]) {
    expect(first(n)).toBe("stonefruit");
  }
  for (const n of ["Green Apple", "Pear", "Melon", "Watermelon", "수박"]) {
    expect(first(n)).toBe("green");
  }
  // 청포도는 초록이지만 베리다 — 저장값 "White Grape"가 `grape`로 그쪽에 걸리므로,
  // 한글로 쳤을 때만 초록이 되면 같은 노트가 표기에 따라 색이 갈린다.
  expect(first("White Grape")).toBe("berry");
  expect(first("청포도")).toBe("berry");
});

// citrus와 nutty가 **같은** hue 70을 쓰던 시절이 있었다. 그때의 검사는 "완전히 같은 hue 금지"였는데,
// 20도 떨어진 이웃도 저알파 워시로 깔리면 눈에는 한 색이라 그 검사는 통과하면서 문제는 남았다.
//
// 그래서 두 조항으로 못박는다. 따뜻한 구간(40~115)에 다섯이 몰리는 것은 커피 향미가 실제로 거기
// 몰려 있어 피할 수 없고, 그 줄은 chocolate·nutty가 예전부터 쓰던 방식대로 **명도로** 갈린다.
const MIN_HUE_GAP = 12;
const CLOSE_HUE = 25; // 이보다 가까우면 hue만으로는 못 가른다고 본다
const MIN_L_GAP = 0.15;

const hueGap = (a: number, b: number) => {
  const raw = Math.abs(a - b);
  return Math.min(raw, 360 - raw); // 색상환이라 340과 15는 35도 차이다
};

test("계열끼리 색이 충분히 떨어져 있다", () => {
  const tooClose: string[] = [];
  for (let i = 0; i < FLAVOR_FAMILIES.length; i++) {
    for (let j = i + 1; j < FLAVOR_FAMILIES.length; j++) {
      const a = FLAVOR_FAMILIES[i];
      const b = FLAVOR_FAMILIES[j];
      if (!a || !b) continue;
      const dh = hueGap(a.hue, b.hue);
      const dl = Math.abs(a.l - b.l);
      if (dh < MIN_HUE_GAP) {
        tooClose.push(`${a.name} ↔ ${b.name}: hue ${dh}도차 (최소 ${MIN_HUE_GAP})`);
      } else if (dh < CLOSE_HUE && dl < MIN_L_GAP) {
        tooClose.push(
          `${a.name} ↔ ${b.name}: hue ${dh}도차라 명도로 갈려야 하는데 L ${dl.toFixed(2)}차 (최소 ${MIN_L_GAP})`,
        );
      }
    }
  }
  expect(tooClose).toEqual([]);
});

test("어휘가 실제로 쓰는 계열에 이름이 겹치는 hue가 없다", () => {
  const used = new Map<number, Set<string>>();
  for (const n of FLAVOR_NOTES) {
    const f = matchFlavorFamilies(n.en)[0];
    if (!f) continue;
    const set = used.get(f.hue) ?? new Set<string>();
    set.add(f.name);
    used.set(f.hue, set);
  }
  expect([...used.entries()].filter(([, names]) => names.size > 1)).toEqual([]);
});
