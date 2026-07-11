// SSRF 가드 단위 테스트 (tests/lib.test.mjs에서 이식)
import assert from "node:assert/strict";
import { test } from "vitest";
import { hostBlocked, isPrivateIp } from "./net";

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
  for (const h of ["example.com", "roastery.co.kr", "shop.example"]) {
    assert.equal(hostBlocked(h), false, h);
  }
});
