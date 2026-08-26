// 데모 원두 데이터 검증 — demo-beans.json은 손으로 쓰는 콘텐츠라 여기가 안전망이다.
//
// 이 파일이 데모 콘텐츠가 존재하는 유일한 곳이다. 예전에는 로컬 D1의 DEMO 계정에서 떠 오는
// 저작 경로를 뒀는데, 그러면 같은 내용이 두 곳에 살면서 JSON이 어떤 때는 원본이고 어떤 때는
// 사본이 됐다 — 게다가 CI는 남의 로컬 D1을 볼 수 없어 어긋남을 검사할 수도 없었다.
// 저장소 한 곳으로 좁힌 대신, 폼이 대신 봐 주던 검증을 이 테스트가 맡는다.
import { BEAN_FIELDS, KEY_RE, missingRequired, pickFields, REQUIRED_LABELS } from "@bnhd/schema";
import { assert, expect, test } from "vitest";
import demoBeans from "./demo-beans.json";

/** 조회 페이지가 정적 분기를 태우는 접두 — apps/web/src/viewer.ts의 DEMO_PREFIX와 같은 값 */
const DEMO_PREFIX = "DEMO";

/** 카드가 읽는 키 전체 — KEY·ROASTERY 고정 선두 + BEAN_FIELDS 파생 */
const ALLOWED = new Set(["KEY", "ROASTERY", ...BEAN_FIELDS.map((f) => f.csv)]);

const beans = demoBeans as Record<string, string>[];

test("데모 덱에 실을 원두가 하나 이상 있다", () => {
  expect(beans.length).toBeGreaterThan(0);
});

// 접두가 어긋나면 그 카드만 조회 페이지에서 D1을 타고, D1에는 데모가 없으므로 "등록되지 않은
// 코드"가 뜬다 — 덱에서는 멀쩡히 보이다가 눌러야 깨지는 종류라 여기서 막는다.
test("KEY는 형식이 맞고 DEMO 접두를 쓰며 서로 겹치지 않는다", () => {
  const seen = new Set<string>();
  for (const b of beans) {
    const key = b.KEY ?? "";
    expect(KEY_RE.test(key), `KEY 형식이 아니다: ${key}`).toBe(true);
    expect(key.startsWith(DEMO_PREFIX), `DEMO 접두가 아니다: ${key}`).toBe(true);
    expect(seen.has(key), `KEY가 중복이다: ${key}`).toBe(false);
    seen.add(key);
  }
});

// 오타 난 필드명은 조용히 무시돼 화면에서만 빈칸으로 나타난다 — 값이 사라진 걸 눈으로
// 알아채기 어려우므로 알 수 없는 키 자체를 실패로 본다.
test("알 수 없는 필드명이 없다", () => {
  for (const b of beans) {
    for (const k of Object.keys(b)) {
      assert(ALLOWED.has(k), `${b.KEY}: 알 수 없는 필드 ${k}`);
    }
  }
});

// 랩에서 등록할 때 폼이 막아 주던 것 — 손으로 쓰면 그 검사가 사라지므로 같은 규칙을 건다.
test("등록 폼과 같은 필수 항목 규칙을 지킨다", () => {
  for (const b of beans) {
    // 등록 API가 쓰는 변환을 그대로 태운다 — 검사 규칙이 갈라지지 않게
    const missing = missingRequired(b.ROASTERY ?? "", pickFields(b), REQUIRED_LABELS);
    expect(missing, `${b.KEY}: 필수 항목 누락`).toEqual([]);
  }
});
