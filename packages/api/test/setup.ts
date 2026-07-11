// 테스트 D1에 프로덕션 스키마(v2/schema.sql)를 그대로 적용한다.
// isolatedStorage 덕분에 각 테스트의 쓰기는 테스트 종료 시 롤백된다.
import { env } from "cloudflare:test";

const stmts = env.TEST_SCHEMA_SQL.replace(/--[^\n]*/g, "")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);
for (const stmt of stmts) await env.DB.prepare(stmt).run();
