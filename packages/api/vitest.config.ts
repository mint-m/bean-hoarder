// 통합 테스트 — 실제 workerd 런타임 + 실제 D1(miniflare)로 API 전 경로를 검증한다.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const dbDir = fileURLToPath(new URL("../../db/", import.meta.url));
const schemaSql = readFileSync(`${dbDir}schema.sql`, "utf8");
// 원격에 아직 안 넣은 마이그레이션(db/에 남아 있는 migrate_*.sql) — 파일명 → SQL. 적용이 끝나 파일을
// 지우면 여기서도 빠진다 — 그 파일을 겨냥한 검사도 함께 지운다(test/migrations.test.ts).
const pendingMigrations = Object.fromEntries(
  readdirSync(dbDir)
    .filter((f) => /^migrate_.*\.sql$/.test(f))
    .sort()
    .map((f) => [f, readFileSync(`${dbDir}${f}`, "utf8")]),
);

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
          TEST_MIGRATIONS: JSON.stringify(pendingMigrations),
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
