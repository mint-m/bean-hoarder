// 도메인 스키마 단위 테스트 — 파생 상수 검증 + 기존 _lib.js 동작 이식
import assert from "node:assert/strict";
import { test } from "vitest";
import {
  CSV_HEADERS,
  FIELDS,
  IMPORT_REQUIRED_LABELS,
  KEY_RE,
  MAX_FIELD_LEN,
  missingRequired,
  pickFields,
  REQUIRED_LABELS,
} from "./index";

test("파생 상수: 기존 _lib.js와 동일한 순서·구성 (계약 고정)", () => {
  assert.deepEqual(FIELDS, [
    "origin",
    "region",
    "producer",
    "lot",
    "washing_station",
    "variety",
    "process",
    "altitude",
    "harvest",
    "roast_date",
    "package_date",
    "net_weight",
    "agtron",
    "tasting_note",
    "memo",
    "source_url",
  ]);
  assert.deepEqual(CSV_HEADERS, [
    "KEY",
    "ROASTERY",
    "ORIGIN",
    "REGION",
    "PRODUCER",
    "LOT",
    "WASHING_STATION",
    "VARIETY",
    "PROCESS",
    "ALTITUDE",
    "HARVEST",
    "ROAST_DATE",
    "PACKAGE_DATE",
    "NET_WEIGHT",
    "AGTRON",
    "TASTING_NOTE",
    "MEMO",
    "SOURCE_URL",
  ]);
  assert.deepEqual(REQUIRED_LABELS, {
    origin: "국가(산지)",
    variety: "품종",
    process: "가공방식",
    roast_date: "로스팅일",
    package_date: "패키징일",
  });
  assert.deepEqual(IMPORT_REQUIRED_LABELS, {
    origin: "국가(산지)",
    roast_date: "로스팅일",
    package_date: "패키징일",
  });
});

test("KEY_RE: 유저코드4 + 연도2 + 순번3", () => {
  assert.ok(KEY_RE.test("BXNQ26-001"));
  assert.ok(!KEY_RE.test("BXNQ26-1"));
  assert.ok(!KEY_RE.test("bxnq26-001"));
});

test("pickFields: 대문자 키 매핑 + 길이 상한", () => {
  const vals = pickFields({ ORIGIN: " ETHIOPIA ", MEMO: "x".repeat(MAX_FIELD_LEN + 500) });
  assert.equal(vals.origin, "ETHIOPIA");
  assert.equal(vals.memo.length, MAX_FIELD_LEN);
});

test("missingRequired: 로스터리·산지·날짜 필수", () => {
  const vals = pickFields({ ORIGIN: "", ROAST_DATE: "26.07.01", PACKAGE_DATE: "" });
  const missing = missingRequired("", vals);
  assert.ok(missing.includes("로스터리"));
  assert.ok(missing.includes("국가(산지)"));
  assert.ok(missing.includes("패키징일"));
  assert.ok(!missing.includes("로스팅일"));
});

test("missingRequired: 품종·가공방식도 필수 — 블렌드 선택 시엔 값이 채워진 것으로 통과", () => {
  const missing = missingRequired("ROASTERY", pickFields({ VARIETY: "", PROCESS: "" }));
  assert.ok(missing.includes("품종"));
  assert.ok(missing.includes("가공방식"));

  const blendVals = pickFields({
    VARIETY: "블렌드 (여러 품종 혼합)",
    PROCESS: "블렌드 (여러 가공방식 혼합)",
  });
  const blendMissing = missingRequired("ROASTERY", blendVals);
  assert.ok(!blendMissing.includes("품종"));
  assert.ok(!blendMissing.includes("가공방식"));
});

test("missingRequired: CSV 복원(IMPORT_REQUIRED_LABELS)은 품종·가공방식이 비어 있어도 통과 — 필수화 이전 백업 호환", () => {
  const vals = pickFields({
    ORIGIN: "ETHIOPIA",
    VARIETY: "",
    PROCESS: "",
    ROAST_DATE: "26.07.01",
    PACKAGE_DATE: "26.07.05",
  });
  assert.deepEqual(missingRequired("ROASTERY", vals, IMPORT_REQUIRED_LABELS), []);

  const missingOrigin = missingRequired(
    "ROASTERY",
    pickFields({ VARIETY: "", PROCESS: "" }),
    IMPORT_REQUIRED_LABELS,
  );
  assert.ok(missingOrigin.includes("국가(산지)"), "품종·가공방식과 무관한 필수 항목은 여전히 검사됨");
});
