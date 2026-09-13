// cloudflare:test의 env 타입 — vitest.config.ts의 miniflare bindings와 일치해야 한다.
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    LOGOS: R2Bucket;
    INVITE_CODE: string;
    /** 테스트는 바인딩에 두지 않고 요청마다 덮어써 넣는다(api()의 envOverride) */
    ADMIN_USERCODES?: string;
    TEST_SCHEMA_SQL: string;
  }
}
