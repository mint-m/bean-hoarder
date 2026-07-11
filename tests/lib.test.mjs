// 서버 순수 헬퍼(_lib.js) 단위 테스트 — vitest (Node 20+, Web Crypto 내장)

import assert from "node:assert/strict";
import { test } from "vitest";
import {
  csvField,
  guardCsvCell,
  hashPassword,
  hostBlocked,
  IMPORT_REQUIRED_LABELS,
  isPrivateIp,
  MAX_FIELD_LEN,
  missingRequired,
  normalizeRecoveryKey,
  parseCsv,
  pickFields,
  randomRecoveryKey,
  randomUsercode,
  sha256hex,
  unguardCsvCell,
  verifyPassword,
} from "../v2/functions/api/_lib.js";

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
  assert.equal(rows[2][1], "line1\nline2");
});

test("parseCsv: 빈 행 제거, 이스케이프된 따옴표", () => {
  const rows = parseCsv('a,"b""c"\n\n,\nx,y');
  assert.deepEqual(rows[0], ["a", 'b"c']);
  assert.deepEqual(rows[rows.length - 1], ["x", "y"]);
});

test("isPrivateIp: IPv4/IPv6 사설 대역", () => {
  for (const ip of [
    "10.0.0.1",
    "127.0.0.1",
    "192.168.1.1",
    "172.16.0.1",
    "172.31.255.255",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "fc00::1",
    "fd12::1",
    "fe80::1",
    "::ffff:10.0.0.1",
  ]) {
    assert.equal(isPrivateIp(ip), true, ip);
  }
  for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "100.128.0.1", "2606:4700::1111", "::ffff:8.8.8.8"]) {
    assert.equal(isPrivateIp(ip), false, ip);
  }
});

test("hostBlocked: 내부 호스트명·IP 리터럴 차단", () => {
  for (const h of [
    "localhost",
    "foo.localhost",
    "db.internal",
    "printer.local",
    "metadata.google.internal",
    "10.1.2.3",
    "[::1]",
  ]) {
    assert.equal(hostBlocked(h), true, h);
  }
  for (const h of ["example.com", "roastery.co.kr", "8.8.8.8".replace("8.8.8.8", "shop.example")]) {
    assert.equal(hostBlocked(h), false, h);
  }
});

test("hashPassword/verifyPassword: PBKDF2 왕복 + 오답 거부", async () => {
  const h = await hashPassword("ABCD", "1234");
  assert.match(h, /^pbkdf2\$\d+\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
  assert.equal((await verifyPassword(h, "ABCD", "1234")).ok, true);
  assert.equal((await verifyPassword(h, "ABCD", "1234")).legacy, false);
  assert.equal((await verifyPassword(h, "ABCD", "4321")).ok, false);
  assert.equal((await verifyPassword(h, "DCBA", "1234")).ok, false);
});

test("verifyPassword: 구형 SHA-256 해시 인식 → legacy 플래그", async () => {
  const legacy = await sha256hex("ABCD:1234");
  const v = await verifyPassword(legacy, "ABCD", "1234");
  assert.equal(v.ok, true);
  assert.equal(v.legacy, true);
  assert.equal((await verifyPassword(legacy, "ABCD", "0000")).ok, false);
});

test("유저코드·복구키 형식", () => {
  assert.match(randomUsercode(), /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
  const rk = randomRecoveryKey();
  assert.match(rk, /^[0-9A-F]{4}(-[0-9A-F]{4}){4}$/);
  assert.equal(normalizeRecoveryKey(rk).length, 20);
  assert.equal(normalizeRecoveryKey(rk.toLowerCase().replace(/-/g, " ")), normalizeRecoveryKey(rk));
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
  const missingVals = pickFields({ VARIETY: "", PROCESS: "" });
  const missing = missingRequired("ROASTERY", missingVals);
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
  const missing = missingRequired("ROASTERY", vals, IMPORT_REQUIRED_LABELS);
  assert.deepEqual(missing, []);

  const missingOrigin = missingRequired(
    "ROASTERY",
    pickFields({ VARIETY: "", PROCESS: "" }),
    IMPORT_REQUIRED_LABELS,
  );
  assert.ok(missingOrigin.includes("국가(산지)"), "품종·가공방식과 무관한 필수 항목은 여전히 검사됨");
});
