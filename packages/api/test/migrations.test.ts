// 원격 미적용 마이그레이션(db/migrate_*.sql) 검증 — 지금 스키마 위에서 깨지지 않고 적용되는지, 그리고
// 데이터를 바꾸는 마이그레이션은 의도한 대로 바꾸는지. 파일을 지우면(원격 적용 완료) 해당 테스트는 건너뛴다.
import { env } from "cloudflare:test";
import { normalizeRoastery } from "@bnhd/schema";
import { expect, test } from "vitest";

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

const ROASTERY_MIGRATION = MIGRATIONS["migrate_roastery_upper.sql"];

test.skipIf(!ROASTERY_MIGRATION)(
  "migrate_roastery_upper: 옛 원문 표기 로스터리를 저장 규칙(normalizeRoastery)과 같은 대문자로 올린다",
  async () => {
    await env.DB.prepare(
      "INSERT INTO users (usercode, pass_hash, recovery_hash) VALUES ('MIGR', 'x', 'y')",
    ).run();
    const rows = [
      ["MIGR26-001", "BigSur Coffee"], // 승격 전에 원문으로 저장된 행
      ["MIGR26-002", "SEY"], // 이미 대문자 — 그대로
      ["MIGR26-003", "커피 리브레"], // 한글은 대소문자가 없다 — 그대로
      ["MIGR26-004", "Leaves coffee 2"],
    ] as const;
    for (const [key, roastery] of rows) {
      await env.DB.prepare("INSERT INTO beans (key, usercode, roastery) VALUES (?, 'MIGR', ?)")
        .bind(key, roastery)
        .run();
    }

    await applySql(ROASTERY_MIGRATION as string);

    const after = await env.DB.prepare(
      "SELECT key, roastery FROM beans WHERE usercode = 'MIGR' ORDER BY key",
    ).all<{
      key: string;
      roastery: string;
    }>();
    // 새로 저장되는 행과 같은 표기여야 한다 — 그래야 조회·덱이 CSS 없이 저장값을 그대로 보여도 맞는다
    expect(after.results.map((r) => r.roastery)).toEqual(rows.map(([, r]) => normalizeRoastery(r)));

    // 두 번 넣어도 바뀌는 게 없다(재적용 안전)
    await applySql(ROASTERY_MIGRATION as string);
    const again = await env.DB.prepare(
      "SELECT roastery FROM beans WHERE usercode = 'MIGR' ORDER BY key",
    ).all<{
      roastery: string;
    }>();
    expect(again.results.map((r) => r.roastery)).toEqual(after.results.map((r) => r.roastery));
  },
);
