// 해시·키 생성 단위 테스트 (tests/lib.test.mjs에서 이식)
import assert from "node:assert/strict";
import { test } from "vitest";
import {
  hashPassword,
  normalizeRecoveryKey,
  randomRecoveryKey,
  randomUsercode,
  sha256hex,
  verifyPassword,
} from "./crypto";

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
