// 스키마 드리프트 가드 — 원두 필드가 사는 세 곳이 어긋나면 실패한다.
//   ① @bnhd/schema BEAN_FIELDS (도메인 단일 소스)
//   ② Drizzle 테이블 (db/schema.ts — 쿼리 타입 안전성)
//   ③ db/schema.sql (실제 DDL — 새 환경을 만드는 파일이자 STRUCTURE.md의 출처)
// 필드 추가 시 세 곳(+ 마이그레이션 SQL)을 함께 고쳐야 함을 기계적으로 강제한다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FIELDS } from "@bnhd/schema";
import { getTableColumns } from "drizzle-orm";
import { test } from "vitest";
import { beans } from "./schema";

const EXPECTED = ["key", "usercode", "roastery", ...FIELDS, "archived", "created_at"];

test("Drizzle beans 테이블 = 고정 컬럼 + BEAN_FIELDS 파생 컬럼", () => {
  const cols = Object.keys(getTableColumns(beans));
  assert.deepEqual(cols.sort(), [...EXPECTED].sort());
});

test("db/schema.sql의 beans 테이블도 같은 컬럼을 갖는다", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const sql = readFileSync(join(here, "..", "..", "..", "..", "db", "schema.sql"), "utf8");

  const block = sql.match(/CREATE TABLE(?: IF NOT EXISTS)? beans\s*\(([\s\S]*?)\n\)/);
  const body = block?.[1];
  if (!body) throw new Error("db/schema.sql에서 beans 테이블 정의를 찾지 못했다");

  const cols: string[] = [];
  for (const line of body.split("\n")) {
    const m = line.trim().match(/^(\w+)\s+(?:TEXT|INTEGER|REAL|BLOB|NUMERIC)/i);
    if (m?.[1]) cols.push(m[1]);
  }
  assert.deepEqual(cols.sort(), [...EXPECTED].sort());
});
