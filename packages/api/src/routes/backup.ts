// CSV 백업(내보내기) / 복원(가져오기).
import {
  type BeanColumn,
  type BeanRow,
  beanToPublic,
  CSV_HEADERS,
  FIELDS,
  IMPORT_REQUIRED_LABELS,
  KEY_RE,
  missingRequired,
  parseArchivedCell,
  pickFields,
  ROASTERY_MAX_LEN,
} from "@bnhd/schema";
import { eq, sql } from "drizzle-orm";
import type { Context } from "hono";
import { createDb, schema } from "../db";
import type { AppEnv } from "../env";
import { csvField, parseCsv, unguardCsvCell } from "../lib/csv";
import { json } from "../lib/http";

export async function exportCsv(c: Context<AppEnv>): Promise<Response> {
  const user = c.get("user");
  const db = createDb(c.env.DB);
  const rows = await db
    .select()
    .from(schema.beans)
    .where(eq(schema.beans.usercode, user.usercode))
    .orderBy(schema.beans.key)
    .all();
  const lines = [CSV_HEADERS.join(",")];
  for (const r of rows) {
    const p = beanToPublic(r as BeanRow) as unknown as Record<string, unknown>;
    // ARCHIVED만 boolean이라 그대로 넘기면 "true"/"false"로 나간다 — 엑셀을 거치면 표기가
    // 또 달라지므로 0/1로 고정한다 (복원 쪽 parseArchivedCell은 양쪽을 다 받는다).
    lines.push(CSV_HEADERS.map((h) => csvField(h === "ARCHIVED" ? (p.ARCHIVED ? 1 : 0) : p[h])).join(","));
  }
  // BOM(\uFEFF) 접두 — 엑셀에서 한글이 깨지지 않도록 UTF-8 명시
  return new Response(`\uFEFF${lines.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv;charset=utf-8",
      "Content-Disposition": `attachment; filename="bean_sheet_${user.usercode}.csv"`,
    },
  });
}

// CSV 백업 복원: 내 유저코드 KEY만 허용, 이미 있는 KEY는 백업 내용으로 덮어쓴다
// (악의적 수정·삭제를 백업 시점으로 되돌리는 것이 목적 — 인쇄된 라벨의 KEY가 그대로 살아남는다).
export async function importCsv(c: Context<AppEnv>): Promise<Response> {
  const user = c.get("user");
  const text = await c.req.text();
  if (text.length > 1_000_000) return json({ ok: false, error: "파일이 너무 큽니다 (1MB 제한)." }, 413);
  const rows = parseCsv(text);
  if (rows.length < 2) return json({ ok: false, error: "CSV에 데이터 행이 없습니다." }, 400);

  const header = (rows[0] as string[]).map((h) => h.trim().toUpperCase());
  const keyIdx = header.indexOf("KEY");
  if (keyIdx < 0 || !header.includes("ROASTERY")) {
    return json(
      { ok: false, error: "CSV 헤더에 KEY, ROASTERY 열이 필요합니다 (백업 파일을 그대로 사용하세요)." },
      400,
    );
  }
  const dataRows = rows.slice(1);
  if (dataRows.length > 2000) return json({ ok: false, error: "행이 너무 많습니다 (2,000행 제한)." }, 400);

  const db = createDb(c.env.DB);
  const existingRows = await db
    .select({ key: schema.beans.key })
    .from(schema.beans)
    .where(eq(schema.beans.usercode, user.usercode))
    .all();
  const existing = new Set(existingRows.map((r) => r.key));

  const col = (row: string[], name: string): string => {
    const i = header.indexOf(name);
    return i >= 0 ? unguardCsvCell((row[i] || "").trim()) : "";
  };

  // upsert 시 excluded.* 참조 — 필드 목록은 스키마에서 파생
  const excludedSet: Record<string, unknown> = { roastery: sql.raw("excluded.roastery") };
  for (const f of FIELDS) excludedSet[f] = sql.raw(`excluded.${f}`);
  // ARCHIVED 열이 생기기 전(라이브 v1.2.0까지)에 받아둔 백업도 복원할 수 있어야 한다. 그 파일은 보관
  // 상태를 "활성"이라고 말하는 게 아니라 아예 모르는 것이므로, upsert 대상에서 빼 기존 값을
  // 보존한다 — 넣으면 접어둔 원두가 옛 백업 한 번에 전부 되살아난다.
  const hasArchived = header.includes("ARCHIVED");
  if (hasArchived) excludedSet.archived = sql.raw("excluded.archived");

  let added = 0;
  let updated = 0;
  const skipped: { key: string; reason: string }[] = [];
  const stmts = [];

  for (const row of dataRows) {
    const key = col(row, "KEY").toUpperCase();
    if (!KEY_RE.test(key)) {
      skipped.push({ key: key || "(빈 KEY)", reason: "KEY 형식 오류" });
      continue;
    }
    if (!key.startsWith(user.usercode)) {
      skipped.push({ key, reason: "내 유저코드의 KEY가 아님" });
      continue;
    }
    const roastery = col(row, "ROASTERY").slice(0, ROASTERY_MAX_LEN);
    const body: Record<string, unknown> = {};
    for (const h of CSV_HEADERS) body[h] = col(row, h);
    const vals = pickFields(body) as Record<BeanColumn, string>;
    // 품종·가공방식이 필수가 되기 전에 만든 백업도 복원할 수 있어야 하므로 완화된 집합으로 검사
    const missing = missingRequired(roastery, vals, IMPORT_REQUIRED_LABELS);
    if (missing.length) {
      skipped.push({ key, reason: `필수 항목 누락: ${missing.join(", ")}` });
      continue;
    }
    // 열이 없으면 0 — 신규 행에 한해서다(스키마 기본값과 같다). 기존 행은 위 excludedSet에서
    // archived를 빼뒀으므로 이 값이 쓰이지 않고 원래 보관 상태가 남는다.
    const archived = hasArchived && parseArchivedCell(col(row, "ARCHIVED")) ? 1 : 0;
    stmts.push(
      db
        .insert(schema.beans)
        .values({ key, usercode: user.usercode, roastery, ...vals, archived })
        .onConflictDoUpdate({ target: schema.beans.key, set: excludedSet }),
    );
    if (existing.has(key)) updated++;
    else added++;
  }

  // D1 batch는 배치 크기 제한 때문에 50개 단위 청크로 나눠 실행한다 — 각 청크는 트랜잭션이지만
  // 전체 복원이 원자적이진 않다. 행 단위 upsert(멱등)라 중간 실패 시 같은 파일 재실행으로 이어받으면 된다.
  for (let i = 0; i < stmts.length; i += 50) {
    const chunk = stmts.slice(i, i + 50);
    if (chunk.length) await db.batch(chunk as [(typeof chunk)[number], ...typeof chunk]);
  }
  return json({ ok: true, added, updated, skipped: skipped.slice(0, 20), skippedTotal: skipped.length });
}
