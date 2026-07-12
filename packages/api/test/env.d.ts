// cloudflare:test의 env 타입 — vitest.config.ts의 miniflare bindings와 일치해야 한다.
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    LOGOS: R2Bucket;
    INVITE_CODE: string;
    TEST_SCHEMA_SQL: string;
  }
}
