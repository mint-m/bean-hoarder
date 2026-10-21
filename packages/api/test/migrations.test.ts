// 원격 미적용 마이그레이션(db/migrate_*.sql) 검증 — 지금 스키마 위에서 깨지지 않고 적용되는지, 그리고
// 데이터를 바꾸는 마이그레이션은 의도한 대로 바꾸는지. 그런 검사는 마이그레이션 파일과 함께 넣고, 원격 적용이
// 끝나 파일을 지울 때 함께 지운다(마지막 예: migrate_roastery_upper — #132·git 이력).
import { env } from "cloudflare:test";
import { test } from "vitest";

const MIGRATIONS = JSON.parse(env.TEST_MIGRATIONS) as Record<string, string>;

/** setup.ts와 같은 방식으로 문장을 갈라 차례로 실행한다 — wrangler d1 execute --file과 같은 순서다 */
async function applySql(sql: string): Promise<void> {
  const stmts = sql
    .replace(/--[^\n]*/g, "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of stmts) await env.DB.prepare(stmt).run();
}

test("남아 있는 마이그레이션은 전부 지금 스키마 위에 순서대로 적용된다", async () => {
  for (const sql of Object.values(MIGRATIONS)) await applySql(sql);
});
