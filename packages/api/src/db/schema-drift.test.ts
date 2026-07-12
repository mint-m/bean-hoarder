// 스키마 드리프트 가드 — Drizzle 테이블(db/schema.ts)과 도메인 필드 단일 소스(@bnhd/schema
// BEAN_FIELDS)가 어긋나면 실패한다. 필드 추가 시 두 곳(+ D1 마이그레이션 SQL)을 함께 고쳐야 함을
// 기계적으로 강제한다.
import assert from "node:assert/strict";
import { FIELDS } from "@bnhd/schema";
import { getTableColumns } from "drizzle-orm";
import { test } from "vitest";
import { beans } from "./schema";

test("beans 테이블 컬럼 = 고정 컬럼 + BEAN_FIELDS 파생 컬럼", () => {
  const cols = Object.keys(getTableColumns(beans));
  const expected = ["key", "usercode", "roastery", ...FIELDS, "archived", "created_at"];
  assert.deepEqual(cols.sort(), [...expected].sort());
});
