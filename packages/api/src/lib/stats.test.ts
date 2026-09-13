// 대시보드 집계의 순수 함수 검사 — D1 없이 달 채우기·구간·로스팅·향미 세기를 본다.
import { expect, test } from "vitest";
import {
  beansPerAccount,
  flavorCandidates,
  lastMonths,
  monthlySeries,
  roastDistribution,
  topNotes,
} from "./stats";

test("lastMonths: 끝 달을 포함해 뒤로 n개, 해가 바뀌어도 이어진다", () => {
  expect(lastMonths(3, new Date(Date.UTC(2026, 0, 15)))).toEqual(["2025-11", "2025-12", "2026-01"]);
  expect(lastMonths(1, new Date(Date.UTC(2026, 8, 13)))).toEqual(["2026-09"]);
});

test("monthlySeries: 빈 달은 0으로 채운다 — 건너뛰면 추이가 거짓말을 한다", () => {
  const months = ["2026-07", "2026-08", "2026-09"];
  const out = monthlySeries(months, [{ month: "2026-07", n: 2 }], [{ month: "2026-09", n: 5 }]);
  expect(out).toEqual([
    { month: "2026-07", signups: 2, beans: 0 },
    { month: "2026-08", signups: 0, beans: 0 },
    { month: "2026-09", signups: 0, beans: 5 },
  ]);
});

test("beansPerAccount: 네 구간의 경계", () => {
  expect(beansPerAccount([0, 1, 5, 6, 20, 21, 100])).toEqual([
    { bucket: "0", n: 1 },
    { bucket: "1–5", n: 2 },
    { bucket: "6–20", n: 2 },
    { bucket: "21+", n: 2 },
  ]);
});

test("roastDistribution: 저장 표기가 달라도 6단계로 붙고, 못 읽는 값과 빈 값은 따로 센다", () => {
  const out = roastDistribution([
    { agtron: "#95 (Light)", n: 3 },
    { agtron: "#88", n: 1 }, // 가장 가까운 #95
    { agtron: "다크", n: 2 },
    { agtron: "Full City", n: 1 }, // → Dark
    { agtron: "roasty", n: 1 },
    { agtron: "", n: 4 },
  ]);
  const at = (level: string) => out.find((r) => r.level === level)?.n;
  expect(at("Light")).toBe(4);
  expect(at("Dark")).toBe(3);
  expect(at("Ultra Light")).toBe(0); // 0인 단계도 자리를 지킨다 — 축이 고정돼야 비교가 된다
  expect(at("미상")).toBe(1);
  expect(at("미입력")).toBe(4);
});

test("topNotes: 어휘 표기로 정규화해 세고, 어휘 밖은 뺀다", () => {
  const out = topNotes([
    { tasting_note: "Jasmine, bergamot, Yakult" },
    { tasting_note: "자스민, Bergamot" },
    { tasting_note: "JASMINE" },
  ]);
  expect(out).toEqual([
    { note: "Jasmine", n: 3 },
    { note: "Bergamot", n: 2 },
  ]);
});

test("flavorCandidates: 어휘 밖만, 표기 변형은 하나로, 건수·사용자 수 순", () => {
  const out = flavorCandidates([
    { usercode: "AAAA", tasting_note: "Jasmine, Bergamott, Yakult" },
    { usercode: "BBBB", tasting_note: "bergamott, 자스민, Yakult" },
    { usercode: "BBBB", tasting_note: "Bergamott" },
  ]);
  expect(out).toEqual([
    { note: "Bergamott", count: 3, users: 2 },
    { note: "Yakult", count: 2, users: 2 },
  ]);
});
