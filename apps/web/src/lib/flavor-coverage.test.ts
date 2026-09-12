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

// ── 노트 단위 색 (#89) ─────────────────────────────────────────
// 계열 한 색으로는 꽃 열 개가 전부 라일락이었다. 이 아래는 "노트마다 제 색"이 지켜지는지와,
// 그 표가 어휘와 함께 움직이는지를 본다.
import { FLAVOR_NOTE_COLORS, flavorStops, stopPositions } from "./coffee-color";

const enSet = new Set(FLAVOR_NOTES.map((n) => n.en));

test("노트 색 표의 모든 키가 어휘에 실존한다", () => {
  // 어휘에서 노트를 지우면 색 표도 따라 죽어야 한다 — 죽은 키는 아무 카드도 쓰지 않는 색이다.
  const dead = Object.keys(FLAVOR_NOTE_COLORS).filter((k) => !enSet.has(k));
  expect(dead).toEqual([]);
});

test("계열 일반어는 표에 없다 — 계열 기본색이 곧 그 말의 색이다", () => {
  for (const generic of [
    "Floral",
    "Citrus",
    "Berry",
    "Nutty",
    "Spice",
    "Tropical Fruit",
    "Chocolate",
    "Winey",
  ]) {
    expect(FLAVOR_NOTE_COLORS[generic]).toBeUndefined();
  }
});

test("표의 모든 항목은 제 계열 기본색과 눈에 띄게 다르다 — 표는 다르게 보여야 하는 것만 든다", () => {
  // 붉은 베리를 베리 레드로, 황도를 핵과 주황으로 적는 것은 표를 늘리기만 한다 — 그런 노트는 계열
  // 기본색이 곧 제 색이다. 합치기 기준(hue 12·L .15)보다 가까우면 어차피 한 색으로 보인다.
  const near: string[] = [];
  for (const [en, m] of Object.entries(FLAVOR_NOTE_COLORS)) {
    const f = matchFlavorFamilies(en)[0];
    if (!f) throw new Error(`${en}: 계열 폴백이 없다`);
    if (hueGap(m.hue, f.hue) < MIN_HUE_GAP && Math.abs(m.l - f.l) < MIN_L_GAP) near.push(`${en} ≈ ${f.name}`);
  }
  expect(near).toEqual([]);
});

const moodOf = (note: string) => flavorStops(note)[0]?.mood;
const hueDist = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

test("이슈의 계기 — 꽃 노트들이 서로 다른 색이고, 라일락 한 색이 아니다", () => {
  const lilac = FLAVOR_FAMILIES.find((f) => f.name === "floral");
  if (!lilac) throw new Error("floral family missing");
  const flowers = ["Rose", "Lavender", "Orange Blossom", "Jasmine", "Hibiscus"];
  const moods = flowers.map((n) => {
    const m = moodOf(n);
    if (!m) throw new Error(`${n} has no color`);
    return m;
  });
  // 라일락(계열 기본)과 같은 색인 것이 없다
  for (const [i, m] of moods.entries()) {
    expect(hueDist(m.hue, lilac.hue) >= 12 || Math.abs(m.l - lilac.l) >= 0.15, flowers[i]).toBe(true);
  }
  // 서로도 다르다 — 가까운 hue면 명도로 갈려야 한다
  for (let i = 0; i < moods.length; i++) {
    for (let j = i + 1; j < moods.length; j++) {
      const a = moods[i];
      const b = moods[j];
      if (!a || !b) continue;
      const distinct = hueDist(a.hue, b.hue) >= 12 || Math.abs(a.l - b.l) >= 0.15;
      expect(distinct, `${flowers[i]} ↔ ${flowers[j]}`).toBe(true);
    }
  }
  // 이슈가 짚은 방향: Rose는 레드 쪽, Orange Blossom은 크림·옐로 쪽, Lavender는 퍼플 쪽
  expect(hueDist(moods[0]?.hue ?? 0, 15)).toBeLessThan(25);
  expect(hueDist(moods[2]?.hue ?? 0, 75)).toBeLessThan(25);
  expect(hueDist(moods[1]?.hue ?? 0, 290)).toBeLessThan(25);
  // 일반어 Floral은 여전히 계열 기본색
  expect(moodOf("Floral")).toMatchObject({ hue: lilac.hue });
});

test("표에 없는 노트와 어휘 밖 자유입력은 계열 색으로 폴백한다", () => {
  const citrus = FLAVOR_FAMILIES.find((f) => f.name === "citrus");
  expect(moodOf("Lemon")).toMatchObject({ hue: citrus?.hue }); // 표에 없다 — 레몬은 곧 옐로
  expect(moodOf("Sicilian lemon peel")).toMatchObject({ hue: citrus?.hue }); // 자유입력
  expect(flavorStops("Umami")).toEqual([]); // 어디에도 안 걸리면 빈 배열 — 호출부가 중립을 깐다
  expect(flavorStops("")).toEqual([]);
});

test("표기 차이로 색이 갈리지 않는다", () => {
  expect(moodOf("orange blossom")).toEqual(moodOf("Orange Blossom"));
  expect(moodOf("ORANGE  BLOSSOM")).toEqual(moodOf("Orange Blossom"));
});

test("같은 색이 여럿이면 하나로 모여 가중치가 오른다", () => {
  const stops = flavorStops("Jasmine, Rose, Lavender, Chocolate");
  // 네 토큰이 네 색 — 꽃끼리도 이제 다른 색이라 합쳐지지 않는다
  expect(stops.map((s) => s.weight)).toEqual([1, 1, 1, 1]);
  // 같은 hue 이웃은 하나로 — Yuzu(96)·Pineapple(계열 앰버 90)·Banana(98)는 한 노란빛이다
  const yellow = flavorStops("Yuzu, Pineapple, Banana, Chocolate");
  expect(yellow.map((s) => [s.note, s.weight])).toEqual([
    ["Yuzu", 3],
    ["Chocolate", 1],
  ]);
  // 흰빛은 hue가 달라도 한 색 — Jasmine(95)과 Magnolia(345)
  expect(flavorStops("Jasmine, Magnolia").map((s) => s.weight)).toEqual([2]);
});

test("stop 상한을 넘으면 가벼운 것부터 빠지고, 순서는 등장순을 지킨다", () => {
  // 5색 → 4색. 무게가 다 1이면 뒤에 나온 것이 빠진다 — Blueberry는 둘이라 앞의 Lime이 먼저 빠진다
  const stops = flavorStops("Rose, Cinnamon, Lavender, Blueberry, Lime, Blueberry");
  expect(stops.map((s) => [s.note, s.weight])).toEqual([
    ["Rose", 1],
    ["Cinnamon", 1],
    ["Lavender", 1],
    ["Blueberry", 2],
  ]);
  // 무게가 다르면 가벼운 쪽이 앞에 있어도 빠진다 — Lavender·Blueberry(1)가 빠지고 Rose는 가장 앞이라 남는다
  const heavy = flavorStops("Rose, Cinnamon, Cinnamon, Lavender, Blueberry, Lime, Lime", 3);
  expect(heavy.map((s) => [s.note, s.weight])).toEqual([
    ["Rose", 1],
    ["Cinnamon", 2],
    ["Lime", 2],
  ]);
});

test("stop 위치는 가중치에 비례해 제 구간 가운데에 놓인다", () => {
  expect(stopPositions([1, 1])).toEqual([25, 75]);
  expect(stopPositions([3, 1])).toEqual([37.5, 87.5]);
  expect(stopPositions([1, 1, 1])).toEqual([16.7, 50, 83.3]);
  expect(stopPositions([1])).toEqual([50]);
});
