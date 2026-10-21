// 어휘와 색의 계약 — 등록 폼이 고를 수 있는 모든 향미 노트는 카드 색을 가져야 한다.
//
// 두 파일이 멀리 떨어져 있어 조용히 어긋난다: 어휘(@bnhd/schema/flavor)에 노트를 하나 더하는 일과
// 계열 정규식(coffee-color.ts)을 손보는 일이 서로를 부르지 않는다. 그러면 그 노트를 고른 카드만
// 밴드 색이 중립 웜브라운으로 죽는데, 화면을 안 열어 보면 아무도 모른다. 여기서 전수로 막는다.
//
// 예외 목록을 두지 않는 것이 요점이다 — 노트를 더하려면 색도 함께 가르쳐야 한다.
import { FLAVOR_NOTES } from "@bnhd/schema/flavor";
import { expect, test, vi } from "vitest";
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
import {
  boostedMood,
  FLAVOR_NOTE_COLORS,
  flavorGradient,
  flavorStops,
  oklabDistance,
  stopArea,
  stopPositions,
} from "./coffee-color";

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

test("같은 색이 여럿이면 한 stop으로 모여 개수가 오른다", () => {
  const stops = flavorStops("Jasmine, Rose, Lavender, Chocolate");
  // 네 토큰이 네 색 — 꽃끼리도 이제 다른 색이라 합쳐지지 않는다
  expect(stops.map((s) => s.count)).toEqual([1, 1, 1, 1]);
  // 같은 hue 이웃은 하나로 — Yuzu(96)·Pineapple(계열 앰버 90)·Banana(98)는 한 노란빛이다
  const yellow = flavorStops("Yuzu, Pineapple, Banana, Chocolate");
  expect(yellow.map((s) => [s.note, s.count])).toEqual([
    ["Yuzu", 3],
    ["Chocolate", 1],
  ]);
  // 흰빛은 hue가 달라도 한 색 — Jasmine(95)과 Magnolia(345)
  expect(flavorStops("Jasmine, Magnolia").map((s) => s.count)).toEqual([2]);
});

// ── 톤 모델 — 톤은 개수, 순서는 면적 ─────────────────────────────
// flavorGradient는 테마를 읽으므로 Node 환경에는 document를 가짜로 심는다(wallet-card.test.ts와 같은 이유).
vi.stubGlobal("document", { documentElement: { dataset: {} } });
// 그라데이션은 노트 도표가 아니라 한 모금의 인상을 미리 겪게 하는 것이다. 비슷한 색의 노트가 많은 쪽이
// 톤(메인)이고, 첫 노트는 톤이 아니어도 면적으로 포인트가 된다. 아래 표는 설계 시뮬레이션을 그대로 못박는다.
const pct = (stops: readonly { area: number; role: "main" | "accent" }[]) => {
  const areas = stops.map((s) => stopArea(s as Parameters<typeof stopArea>[0]));
  const total = areas.reduce((a, b) => a + b, 0);
  return areas.map((a) => Math.round((a / total) * 100));
};
const applied = (s: ReturnType<typeof flavorStops>[number]) => boostedMood(s.mood, s.role, s.groupCount).c;

test("톤은 개수로 정해진다 — 첫 노트가 오렌지여도 갈색이 메인이고, 오렌지는 면적으로 포인트가 된다", () => {
  const orangeFirst = flavorStops("Orange, Dark Chocolate, Brown Sugar");
  expect(orangeFirst.map((s) => [s.note, s.role])).toEqual([
    ["Orange", "accent"],
    ["Dark Chocolate", "main"],
    ["Brown Sugar", "main"],
  ]);
  expect(pct(orangeFirst)).toEqual([33, 33, 33]); // 오렌지 1.5 · 갈색 1×1.5 둘
  // 같은 노트, 순서만 뒤로 — 톤은 그대로, 포인트만 작아진다
  const orangeLast = flavorStops("Dark Chocolate, Brown Sugar, Orange");
  expect(orangeLast.map((s) => s.role)).toEqual(["main", "main", "accent"]);
  expect(pct(orangeLast)).toEqual([47, 32, 21]);
  // 악센트는 제 채도 그대로, 메인은 검출량 2 → ×1.15
  const orange = orangeFirst[0];
  const dc = orangeFirst[1];
  if (!orange || !dc) throw new Error("stops missing");
  expect(applied(orange)).toBe(orange.mood.c);
  expect(applied(dc)).toBeCloseTo(dc.mood.c * 1.15, 3);
});

test("전개 예시 — 초콜릿·레드베리·플로럴 중심 커피가 한 톤으로 묶인다", () => {
  // 초콜릿 중심: 다크초콜릿·마카다미아·흑설탕은 한 톤, 오렌지는 포인트
  const choc = flavorStops("Dark Chocolate, Macadamia, Brown Sugar, Orange");
  expect(choc.map((s) => s.role)).toEqual(["main", "main", "main", "accent"]);
  expect(choc.map((s) => s.groupCount)).toEqual([3, 3, 3, 1]);
  expect(pct(choc)).toEqual([36, 24, 24, 16]);
  // 레드베리 중심: 라즈베리·크랜베리(한 stop)·와인·포도가 한 톤 — 검출량 4 → ×1.45, 상한 .20
  const berry = flavorStops("Raspberry, Cranberry, Wine, Grape");
  expect(berry.map((s) => [s.note, s.count, s.role])).toEqual([
    ["Raspberry", 2, "main"],
    ["Wine", 1, "main"],
    ["Grape", 1, "main"],
  ]);
  expect(berry.map(applied)).toEqual([0.2, 0.2, 0.16]);
  // 플로럴 중심: 자스민·화이트티·아카시아는 아이보리 한 stop, 베르가못이 같은 톤으로 전개
  const floral = flavorStops("Jasmine, Bergamot, White Tea, Acacia");
  expect(floral.map((s) => [s.note, s.count, s.role])).toEqual([
    ["Jasmine", 3, "main"],
    ["Bergamot", 1, "main"],
  ]);
  expect(pct(floral)).toEqual([78, 22]);
  // 부정: 초콜릿은 플로럴 톤에 들어오지 않는다
  const dc = flavorStops("Dark Chocolate")[0];
  const jas = flavorStops("Jasmine")[0];
  if (!dc || !jas) throw new Error("stops missing");
  expect(oklabDistance(jas.mood, dc.mood)).toBeGreaterThan(0.25);
});

test("비중이 비슷하면 모두 메인으로 함께 전개한다 — 2/3 규칙", () => {
  expect(flavorStops("Chocolate, Orange").map((s) => s.role)).toEqual(["main", "main"]); // 1:1
  expect(flavorStops("Chocolate, Hazelnut, Orange, Lemon").map((s) => s.role)).toEqual([
    "main",
    "main",
    "main",
    "main",
  ]); // 2:2
  expect(flavorStops("Lemon, Chocolate, Hazelnut").map((s) => s.role)).toEqual(["accent", "main", "main"]); // 1:2
  // 3:2는 경계 — 2×3 ≥ 3×2 라 공동 메인
  expect(flavorStops("Chocolate, Hazelnut, Brown Sugar, Orange, Lemon", 5).map((s) => s.role)).toEqual([
    "main",
    "main",
    "main",
    "main",
    "main",
  ]);
  // 1:1일 때 채도 부스트는 없다 — 검출량 1
  expect(flavorStops("Chocolate, Orange").map(applied)).toEqual([0.08, 0.17]);
});

test("채도 부스트는 검출량 단계로 오르고 .20에서 멈춘다", () => {
  const c = (notes: string) => flavorStops(notes).map(applied);
  expect(c("Chocolate")).toEqual([0.08]); // 1 → 원값
  expect(c("Chocolate, Cocoa")).toEqual([0.092]); // 2 → ×1.15
  expect(c("Chocolate, Cocoa, Cacao Nib")).toEqual([0.104]); // 3 → ×1.30
  expect(c("Chocolate, Cocoa, Cacao Nib, Dark Chocolate")).toEqual([0.116]); // 4 → ×1.45
  expect(c("Chocolate, Cocoa, Cacao Nib, Dark Chocolate, Milk Chocolate")).toEqual([0.116, 0.131]); // 5 → 여전히 ×1.45
  expect(c("Berry, Strawberry, Cherry")).toEqual([0.2]); // .17 × 1.30 = .221 → 캡
});

test("톤 밸런스 가드 — 어휘 전체를 4번 반복해도 채도 .20을 넘지 않고, 알파는 한 값이다", () => {
  for (const n of FLAVOR_NOTES) {
    const notes = Array(4).fill(n.en).join(", ");
    for (const s of flavorStops(notes)) expect(applied(s), n.en).toBeLessThanOrEqual(0.2);
  }
  const alphas = new Set(
    (flavorGradient("Dark Chocolate, Brown Sugar, Orange") ?? "").match(/\/ ([\d.]+)\)/g),
  );
  expect([...alphas]).toEqual(["/ 0.19)"]);
});

test("stop 상한을 넘으면 악센트가 면적 작은 것부터 빠지고, 남은 것은 등장순을 지킨다", () => {
  // Rose·Cinnamon·Lavender가 한 톤(3), Blueberry 2 → 공동 메인, Lime 1 → 악센트. 5 stop → Lime이 빠진다
  const stops = flavorStops("Rose, Cinnamon, Lavender, Blueberry, Lime, Blueberry");
  expect(stops.map((s) => [s.note, s.role])).toEqual([
    ["Rose", "main"],
    ["Cinnamon", "main"],
    ["Lavender", "main"],
    ["Blueberry", "main"],
  ]);
  // 악센트를 다 빼도 넘으면 메인 안에서 면적 작은 것부터 — 첫 노트 Rose(1.5)는 남고 Cinnamon·Lavender(1) 중 뒤의 Lavender가 빠진다
  const tight = flavorStops("Rose, Cinnamon, Lavender, Blueberry, Lime, Blueberry", 3);
  expect(tight.map((s) => s.note)).toEqual(["Rose", "Cinnamon", "Blueberry"]);
});

test("stop 위치는 가중치에 비례해 제 구간 가운데에 놓인다", () => {
  expect(stopPositions([1, 1])).toEqual([25, 75]);
  expect(stopPositions([3, 1])).toEqual([37.5, 87.5]);
  expect(stopPositions([1, 1, 1])).toEqual([16.7, 50, 83.3]);
  expect(stopPositions([1])).toEqual([50]);
});

// ── 로스팅 레벨 — 미디움부터 다크로 갈수록 띠가 어둡고 차분해진다 ────────
import { parseRoastLevel } from "@bnhd/schema/roast";
import { roastShade, shadeMood } from "./coffee-color";

const firstL = (css: string | null) => Number(/oklch\(([\d.]+) /.exec(css ?? "")?.[1]);
const firstC = (css: string | null) => Number(/oklch\([\d.]+ ([\d.]+) /.exec(css ?? "")?.[1]);

test("로스팅 그늘은 미디움부터 걸리고 다크로 갈수록 깊어진다", () => {
  const shade = (v: string) => roastShade(parseRoastLevel(v));
  expect(shade("#120 (Ultra Light)")).toEqual({ dl: 0, cx: 1 });
  expect(shade("#95 (Light)")).toEqual({ dl: 0, cx: 1 });
  expect(shade("#75 (Medium Light)")).toEqual({ dl: 0, cx: 1 });
  expect(shade("#65 (Medium)")).toEqual({ dl: 0.04, cx: 0.95 });
  expect(shade("#55 (Medium Dark)")).toEqual({ dl: 0.09, cx: 0.85 });
  expect(shade("#45 (Dark)")).toEqual({ dl: 0.14, cx: 0.75 });
  expect(shade("")).toEqual({ dl: 0, cx: 1 }); // 값이 없으면 손대지 않는다
  expect(shade("Full City")).toEqual({ dl: 0.14, cx: 0.75 }); // 표기가 달라도 parseRoastLevel이 붙여 준다
});

test("같은 노트도 로스팅이 어두우면 띠가 어둡고 채도가 낮다 — 라이트는 그대로", () => {
  const notes = "Dark Chocolate, Brown Sugar, Orange";
  const base = flavorGradient(notes);
  expect(flavorGradient(notes, "#95 (Light)")).toBe(base);
  const dark = flavorGradient(notes, "#45 (Dark)");
  expect(firstL(dark)).toBeCloseTo(firstL(base) - 0.14, 3);
  expect(firstC(dark)).toBeLessThan(firstC(base));
  // 알파는 그대로 — 어둡게 하는 것은 명도·채도지 워시의 두께가 아니다
  expect(dark).toContain("/ 0.19)");
  // 무매칭 중립도 같이 눌린다
  expect(firstL(flavorGradient("Umami", "#45 (Dark)"))).toBeCloseTo(0.55 - 0.14, 3);
});

test("그늘을 얹어도 명도는 바닥(.15) 아래로 내려가지 않는다", () => {
  expect(shadeMood({ hue: 45, c: 0.06, l: 0.3 }, roastShade(parseRoastLevel("#45"))).l).toBe(0.16);
  expect(shadeMood({ hue: 45, c: 0.06, l: 0.2 }, roastShade(parseRoastLevel("#45"))).l).toBe(0.15);
});
