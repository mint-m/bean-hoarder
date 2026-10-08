// 향미 승격 후보 집계의 순수 함수 검사 — D1 없이 어휘 밖 걸러내기·합치기·정렬·오타 힌트를 본다.
import { expect, test } from "vitest";
import { flavorCandidates, nearestKnown } from "./stats";

test("flavorCandidates: 어휘 밖만, 표기 변형은 하나로, 건수·사용자 수와 함께", () => {
  const out = flavorCandidates([
    { usercode: "AAAA", tasting_note: "Jasmine, Bergamott, Yakult" },
    { usercode: "BBBB", tasting_note: "bergamott, 자스민, Yakult" },
    { usercode: "BBBB", tasting_note: "Bergamott" },
  ]);
  expect(out.map(({ note, count, users }) => ({ note, count, users }))).toEqual([
    { note: "Bergamott", count: 3, users: 2 },
    { note: "Yakult", count: 2, users: 2 },
  ]);
});

test("flavorCandidates: 사용자 수가 건수보다 먼저 — 한 사람이 여러 번 쓴 말이 앞서면 안 된다", () => {
  const out = flavorCandidates([
    ...Array.from({ length: 5 }, () => ({ usercode: "AAAA", tasting_note: "Yakult" })),
    { usercode: "BBBB", tasting_note: "Lychee Soda" },
    { usercode: "CCCC", tasting_note: "lychee soda" },
    { usercode: "DDDD", tasting_note: "Lychee  Soda" },
  ]);
  expect(out.map((c) => [c.note, c.users, c.count])).toEqual([
    ["Lychee Soda", 3, 3],
    ["Yakult", 1, 5],
  ]);
});

test("nearestKnown: 어휘와 한두 글자 다른 말은 가장 가까운 표기를, 먼 말은 null", () => {
  expect(nearestKnown("Bergamott")).toBe("Bergamot");
  expect(nearestKnown("Yakult")).toBe(null);
  expect(nearestKnown("zz")).toBe(null); // 두 글자 이하는 한 글자 차이가 곧 다른 말이다
});

test("flavorCandidates: 오타 후보는 similar에 어휘 표기를 달고, 아닌 말은 null", () => {
  const out = flavorCandidates([{ usercode: "AAAA", tasting_note: "Bergamott, Yakult" }]);
  expect(out.find((c) => c.note === "Bergamott")?.similar).toBe("Bergamot");
  expect(out.find((c) => c.note === "Yakult")?.similar).toBeNull();
});
