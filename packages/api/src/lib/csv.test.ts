// CSV 직렬화·파싱 단위 테스트 (tests/lib.test.mjs에서 이식)
import assert from "node:assert/strict";
import { test } from "vitest";
import { csvField, guardCsvCell, parseCsv, unguardCsvCell } from "./csv";

test("CSV 수식 인젝션 가드: 위험 셀에 ' 접두, 라운드트립 보존", () => {
  assert.equal(guardCsvCell("=SUM(A1)"), "'=SUM(A1)");
  assert.equal(guardCsvCell("+123"), "'+123");
  assert.equal(guardCsvCell("-1900-2100"), "'-1900-2100");
  assert.equal(guardCsvCell("@cmd"), "'@cmd");
  assert.equal(guardCsvCell("ETHIOPIA"), "ETHIOPIA");
  // 복원 시 원문으로
  for (const v of ["=SUM(A1)", "+123", "@x", "normal", "'quoted"]) {
    assert.equal(unguardCsvCell(guardCsvCell(v)), v);
  }
});

test("csvField: 콤마/따옴표/개행 셀은 인용 처리", () => {
  assert.equal(csvField("a,b"), '"a,b"');
  assert.equal(csvField('say "hi"'), '"say ""hi"""');
  assert.equal(csvField("plain"), "plain");
  assert.equal(csvField(null), "");
});

test("parseCsv: RFC4180 (따옴표 속 콤마·개행, CRLF, BOM)", () => {
  const csv = '﻿KEY,NOTE\r\nA26-001,"jasmine, peach"\r\nB26-002,"line1\nline2"\r\n';
  const rows = parseCsv(csv);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], ["KEY", "NOTE"]);
  assert.deepEqual(rows[1], ["A26-001", "jasmine, peach"]);
  assert.equal((rows[2] as string[])[1], "line1\nline2");
});

test("parseCsv: 빈 행 제거, 이스케이프된 따옴표", () => {
  const rows = parseCsv('a,"b""c"\n\n,\nx,y');
  assert.deepEqual(rows[0], ["a", 'b"c']);
  assert.deepEqual(rows[rows.length - 1], ["x", "y"]);
});
