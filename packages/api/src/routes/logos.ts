// 로스터리 로고 (기기 간 재사용).
// 로스터리명은 대문자로 정규화해 저장 — 라벨 인쇄 표기와 동일, 대소문자 변형 중복 방지.
import { LOGO_DATAURL_RE, LOGO_MAX_LEN, logoDeleteBodySchema, logoPutBodySchema } from "@bnhd/schema";
import { and, eq, sql } from "drizzle-orm";
import type { Context } from "hono";
import { createDb, schema } from "../db";
import type { AppEnv } from "../env";
import { json } from "../lib/http";

export async function listLogos(c: Context<AppEnv>): Promise<Response> {
  const user = c.get("user");
  const db = createDb(c.env.DB);
  const rows = await db
    .select({ roastery: schema.logos.roastery, data_url: schema.logos.data_url })
    .from(schema.logos)
    .where(eq(schema.logos.usercode, user.usercode))
    .orderBy(schema.logos.roastery)
    .all();
  return json({ ok: true, logos: rows });
}

export async function putLogo(c: Context<AppEnv>): Promise<Response> {
  const user = c.get("user");
  const body = logoPutBodySchema.parse(await c.req.json().catch(() => ({})));
  if (!body.roastery) return json({ ok: false, error: "로스터리명이 필요합니다." }, 400);
  if (!LOGO_DATAURL_RE.test(body.data_url)) {
    return json({ ok: false, error: "로고는 PNG/JPEG/WebP/SVG data URL이어야 합니다." }, 400);
  }
  if (body.data_url.length > LOGO_MAX_LEN) {
    return json({ ok: false, error: "로고 이미지가 너무 큽니다 (100KB 제한)." }, 413);
  }
  const db = createDb(c.env.DB);
  await db
    .insert(schema.logos)
    .values({
      usercode: user.usercode,
      roastery: body.roastery,
      data_url: body.data_url,
      updated_at: sql`datetime('now')`,
    })
    .onConflictDoUpdate({
      target: [schema.logos.usercode, schema.logos.roastery],
      set: { data_url: sql.raw("excluded.data_url"), updated_at: sql.raw("excluded.updated_at") },
    })
    .run();
  return json({ ok: true, roastery: body.roastery });
}

export async function deleteLogo(c: Context<AppEnv>): Promise<Response> {
  const user = c.get("user");
  const body = logoDeleteBodySchema.parse(await c.req.json().catch(() => ({})));
  if (!body.roastery) return json({ ok: false, error: "로스터리명이 필요합니다." }, 400);
  const db = createDb(c.env.DB);
  await db
    .delete(schema.logos)
    .where(and(eq(schema.logos.usercode, user.usercode), eq(schema.logos.roastery, body.roastery)))
    .run();
  return json({ ok: true, roastery: body.roastery });
}
