// 테스트 D1에 프로덕션 스키마(db/schema.sql)를 그대로 적용한다.
// 같은 파일 안의 테스트들은 D1 상태를 공유한다(앞 테스트의 쓰기가 남는다) — 카운트·행 수는 고유 키/IP로
// 격리하거나 전후 차이로 단언할 것. 절대값 단언은 테스트 순서에 따라 깨진다.
import { env } from "cloudflare:test";

const stmts = env.TEST_SCHEMA_SQL.replace(/--[^\n]*/g, "")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);
for (const stmt of stmts) await env.DB.prepare(stmt).run();
