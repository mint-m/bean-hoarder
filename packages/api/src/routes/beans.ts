// 원두 CRUD — KEY 서버 채번, 소유권 검증, 숨기기(보관) 토글.
import {
  archiveBodySchema,
  type BeanRow,
  beanToPublic,
  FIELDS,
  KEY_RE,
  missingRequired,
  pickFields,
  ROASTERY_MAX_LEN,
} from "@bnhd/schema";
import { and, eq, sql } from "drizzle-orm";
import type { Context } from "hono";
import { createDb, type Db, schema } from "../db";
import type { AppEnv, AuthedUser } from "../env";
import { json } from "../lib/http";

type BeanBody = Record<string, unknown>;

function readBeanPayload(body: BeanBody) {
  const roastery = String(body.ROASTERY || "")
    .trim()
    .slice(0, ROASTERY_MAX_LEN);
  const vals = pickFields(body);
  return { roastery, vals };
}

async function ownedBean(db: Db, user: AuthedUser, key: string) {
  if (!KEY_RE.test(key) || !key.startsWith(user.usercode)) return null;
  return db
    .select()
    .from(schema.beans)
    .where(and(eq(schema.beans.key, key), eq(schema.beans.usercode, user.usercode)))
    .get();
}

export async function getBeanPublic(c: Context<AppEnv>): Promise<Response> {
  const key = (c.req.param("key") || "").trim().toUpperCase();
  if (!KEY_RE.test(key)) return json({ ok: false, error: "KEY 형식 오류" }, 400);
  const db = createDb(c.env.DB);
  const row = await db.select().from(schema.beans).where(eq(schema.beans.key, key)).get();
  if (!row) return json({ ok: false, error: "미등록 KEY" }, 404);
  return json({ ok: true, bean: beanToPublic(row as BeanRow) });
}

export async function listBeans(c: Context<AppEnv>): Promise<Response> {
  const user = c.get("user");
  const db = createDb(c.env.DB);
  const rows = await db
    .select()
    .from(schema.beans)
    .where(eq(schema.beans.usercode, user.usercode))
    .orderBy(schema.beans.key)
    .all();
  return json({ ok: true, beans: rows.map((r) => beanToPublic(r as BeanRow)) });
}

export async function addBean(c: Context<AppEnv>): Promise<Response> {
  const user = c.get("user");
  const body = (await c.req.json().catch(() => ({}))) as BeanBody;
  const { roastery, vals } = readBeanPayload(body);
  const missing = missingRequired(roastery, vals);
  if (missing.length) return json({ ok: false, error: `필수 항목 누락: ${missing.join(", ")}` }, 400);

  let year = String(body.YEAR || "").trim();
  if (!/^\d{2}$/.test(year)) year = String(new Date().getUTCFullYear() % 100).padStart(2, "0");

  const db = createDb(c.env.DB);
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await db.get<{ next: number }>(sql`
      SELECT COALESCE(MAX(CAST(substr(key, 8, 3) AS INTEGER)), 0) + 1 AS next
      FROM beans WHERE usercode = ${user.usercode} AND substr(key, 5, 2) = ${year}`);
    const next = row?.next ?? 1;
    if (next > 999) return json({ ok: false, error: "연도 내 순번(999) 초과" }, 400);
    const key = `${user.usercode}${year}-${String(next).padStart(3, "0")}`;
    try {
      await db
        .insert(schema.beans)
        .values({ key, usercode: user.usercode, roastery, ...vals })
        .run();
      return json({ ok: true, key });
    } catch (_e) {
      /* 동시 등록 충돌 시 재채번 */
    }
  }
  return json({ ok: false, error: "채번 충돌 반복 (재시도 요망)" }, 500);
}

export async function updateBean(c: Context<AppEnv>): Promise<Response> {
  const user = c.get("user");
  const key = (c.req.param("key") || "").trim().toUpperCase();
  const db = createDb(c.env.DB);
  const existing = await ownedBean(db, user, key);
  if (!existing) return json({ ok: false, error: "내 소유의 등록된 KEY가 아닙니다." }, 404);

  const body = (await c.req.json().catch(() => ({}))) as BeanBody;
  const { roastery, vals } = readBeanPayload(body);
  const missing = missingRequired(roastery, vals);
  if (missing.length) return json({ ok: false, error: `필수 항목 누락: ${missing.join(", ")}` }, 400);

  await db
    .update(schema.beans)
    .set({ roastery, ...vals })
    .where(and(eq(schema.beans.key, key), eq(schema.beans.usercode, user.usercode)))
    .run();
  return json({ ok: true, key });
}

// 숨기기(보관) 토글 — 원두 소비가 끝나 기록만 남기고 싶을 때, 삭제 대신 목록 최하단에
// 채도를 낮춰 접어두는 용도. 전체 필드 재전송 없이 archived 플래그만 갱신한다.
export async function setArchived(c: Context<AppEnv>): Promise<Response> {
  const user = c.get("user");
  const key = (c.req.param("key") || "").trim().toUpperCase();
  const db = createDb(c.env.DB);
  const existing = await ownedBean(db, user, key);
  if (!existing) return json({ ok: false, error: "내 소유의 등록된 KEY가 아닙니다." }, 404);

  const body = archiveBodySchema.parse(await c.req.json().catch(() => ({})));
  const archived = body.archived ? 1 : 0;
  await db
    .update(schema.beans)
    .set({ archived })
    .where(and(eq(schema.beans.key, key), eq(schema.beans.usercode, user.usercode)))
    .run();
  return json({ ok: true, key, archived: !!archived });
}

export async function deleteBean(c: Context<AppEnv>): Promise<Response> {
  const user = c.get("user");
  const key = (c.req.param("key") || "").trim().toUpperCase();
  const db = createDb(c.env.DB);
  const existing = await ownedBean(db, user, key);
  if (!existing) return json({ ok: false, error: "내 소유의 등록된 KEY가 아닙니다." }, 404);

  await db
    .delete(schema.beans)
    .where(and(eq(schema.beans.key, key), eq(schema.beans.usercode, user.usercode)))
    .run();
  return json({ ok: true, key });
}

/** CSV 복원(import)이 재사용하는 필드 컬럼 목록 — excluded 참조 upsert용 */
export const BEAN_FIELD_COLUMNS = FIELDS;
