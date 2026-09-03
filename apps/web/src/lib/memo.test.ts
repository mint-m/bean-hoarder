// 메모 정돈 검증 — 조회 렌더 경로의 첫 유닛 테스트다.
//
// 실제로 문제가 된 두 덩어리를 그대로 재현 케이스로 쓴다: MKPK26-008(문장마다 빈 줄)과
// AI 요약(줄바꿈 전무). 가장 중요한 계약은 **내용 무손실**이라 마지막에 따로 못 박는다.
import { expect, test } from "vitest";
import { normalizeMemo } from "./memo";

test("빈 줄이 몇 개든 문단 경계 하나로 접는다", () => {
  expect(normalizeMemo("첫째 줄\n\n\n\n둘째 줄")).toEqual(["첫째 줄", "둘째 줄"]);
});

test("옮겨 붙일 때 딸려 온 들여쓰기와 꼬리 공백을 턴다", () => {
  expect(normalizeMemo("   앞줄   \n\n\t  뒷줄  ")).toEqual(["앞줄", "뒷줄"]);
});

test("한 문단 안의 단일 줄바꿈은 살린다 — 줄 자체가 의미인 경우가 있다", () => {
  const ratio =
    "Ethiopia West Arsi Nensebo Refisa Natural 50%\nEthiopia Karamo Sidama Shantawene Natural 50%";
  expect(normalizeMemo(ratio)).toEqual([ratio]);
});

test("줄바꿈이 아예 없는 긴 덩어리는 문장 경계로 쪼갠다", () => {
  const wall =
    "미디움 다크로 로스팅되어 초콜릿의 달콤함과 은은한 과일향이 느껴집니다. " +
    "과일이 박힌 초콜릿처럼 느껴지게 설계되었습니다. " +
    "에티오피아 스페셜티를 사용하여 컵 전반에 과일향과 초콜릿의 달콤함이 가득합니다. " +
    "데일리로 즐기기 적합하며 필터커피와 에스프레소 모두 잘 어울립니다.";
  const out = normalizeMemo(wall);
  expect(out.length).toBeGreaterThan(1);
  expect(out.every((p) => p.length <= 140)).toBe(true);
});

test("마침표 뒤에 공백이 있을 때만 끊는다 — 날짜·버전은 갈라지지 않는다", () => {
  const wall = `${"가".repeat(60)} 수확은 2026.09.01 이고 로스팅은 v1.2.0 기준입니다. ${"나".repeat(60)} 끝입니다.`;
  for (const p of normalizeMemo(wall)) {
    if (p.includes("2026")) expect(p).toContain("2026.09.01");
    if (p.includes("v1")) expect(p).toContain("v1.2.0");
  }
});

test("마침표를 안 쓴 글은 임의로 자르지 않는다", () => {
  const noPeriod = "가".repeat(200);
  expect(normalizeMemo(noPeriod)).toEqual([noPeriod]);
});

test("문장으로 끝나는 짧은 문단끼리만 되붙인다", () => {
  // 제목·항목·구성 목록은 구두점으로 끝나지 않는다 — 붙이면 안 되는 것들이다
  expect(normalizeMemo("Fruity Bark Blend\n\n과일박힌 바크 초콜릿의 풍미")).toEqual([
    "Fruity Bark Blend",
    "과일박힌 바크 초콜릿의 풍미",
  ]);
  expect(normalizeMemo("달콤함에 초점을 맞춘 블렌드입니다.\n\n설계되었습니다.")).toEqual([
    "달콤함에 초점을 맞춘 블렌드입니다. 설계되었습니다.",
  ]);
});

test("되붙여도 문단 상한을 넘지 않는다", () => {
  const a = `${"가".repeat(100)}.`;
  const b = `${"나".repeat(100)}.`;
  expect(normalizeMemo(`${a}\n\n${b}`)).toEqual([a, b]);
});

test("빈 값은 빈 배열", () => {
  expect(normalizeMemo("")).toEqual([]);
  expect(normalizeMemo("   \n\n  \n ")).toEqual([]);
});

// 정돈은 보기 좋게 나누는 일이지 줄이는 일이 아니다. 어떤 규칙이 걸리든 글자는 그대로여야 한다.
test("내용은 한 글자도 버리지 않는다", () => {
  const messy =
    "Fruity Bark Blend\n\n\n   | 과일박힌 바크 초콜릿의 풍미   \n\n" +
    "'달콤함' 에 초점을 맞춘 블렌드입니다.\n\n미디움 다크로 로스팅되어 달콤합니다.\n\n" +
    "Medium Dark [2차 크랙 초반-절정], 디개싱 5 - 7일 이상 권장\n\nORIGIN - 2026.09.01\n\n" +
    "Ethiopia West Arsi Nensebo Refisa Natural 50%\nEthiopia Karamo Sidama Shantawene Natural 50%";
  const squash = (s: string) => s.replace(/\s+/g, "");
  expect(squash(normalizeMemo(messy).join(""))).toBe(squash(messy));
});
