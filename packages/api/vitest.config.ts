// 통합 테스트 — 실제 workerd 런타임 + 실제 D1(miniflare)로 API 전 경로를 검증한다.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const schemaSql = readFileSync(fileURLToPath(new URL("../../v2/schema.sql", import.meta.url)), "utf8");

export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        compatibilityDate: "2026-05-03",
        compatibilityFlags: ["nodejs_compat"],
        d1Databases: ["DB"],
        r2Buckets: ["LOGOS"],
        bindings: {
          INVITE_CODE: "TEST-INVITE",
          TEST_SCHEMA_SQL: schemaSql,
        },
      },
    }),
  ],
  test: {
    name: "workers",
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
  },
});
