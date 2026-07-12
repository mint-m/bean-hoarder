// 로스터리 로고 (기기 간 재사용).
// 로스터리명은 대문자로 정규화해 저장 — 라벨 인쇄 표기와 동일, 대소문자 변형 중복 방지.
// 저장소: 신규/교체 로고는 R2(키 {usercode}/{roastery})에 바이트로 저장하고 D1엔 content_type
// 메타만 남긴다. 레거시 행(data_url 인라인)은 그대로 서빙 — 응답 형태는 종전과 동일하게
// data URL로 조립해 돌려주므로 클라이언트(라벨 SVG 임베드)는 변경이 없다.
import { LOGO_DATAURL_RE, LOGO_MAX_LEN, logoDeleteBodySchema, logoPutBodySchema } from "@bnhd/schema";
import { and, eq, sql } from "drizzle-orm";
import type { Context } from "hono";
import { createDb, schema } from "../db";
import type { AppEnv } from "../env";
import { bytesToDataUrl, parseDataUrl } from "../lib/dataurl";
import { json } from "../lib/http";

const r2Key = (usercode: string, roastery: string) => `${usercode}/${roastery}`;

export async function listLogos(c: Context<AppEnv>): Promise<Response> {
  const user = c.get("user");
  const db = createDb(c.env.DB);
  const rows = await db
    .select({
      roastery: schema.logos.roastery,
      data_url: schema.logos.data_url,
      content_type: schema.logos.content_type,
    })
    .from(schema.logos)
    .where(eq(schema.logos.usercode, user.usercode))
    .orderBy(schema.logos.roastery)
    .all();

  const logos: { roastery: string; data_url: string }[] = [];
  for (const row of rows) {
    if (row.data_url) {
      // 레거시 인라인 행
      logos.push({ roastery: row.roastery, data_url: row.data_url });
      continue;
    }
    const obj = await c.env.LOGOS.get(r2Key(user.usercode, row.roastery));
    if (!obj) continue; // R2 오브젝트 유실 — 행만 남은 경우 목록에서 제외
    logos.push({
      roastery: row.roastery,
      data_url: bytesToDataUrl(row.content_type || "image/png", await obj.arrayBuffer()),
    });
  }
  return json({ ok: true, logos });
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
  const parsed = parseDataUrl(body.data_url);
  if (!parsed) return json({ ok: false, error: "로고는 PNG/JPEG/WebP/SVG data URL이어야 합니다." }, 400);

  await c.env.LOGOS.put(r2Key(user.usercode, body.roastery), parsed.bytes, {
    httpMetadata: { contentType: parsed.contentType },
  });
  const db = createDb(c.env.DB);
  await db
    .insert(schema.logos)
    .values({
      usercode: user.usercode,
      roastery: body.roastery,
      data_url: "",
      content_type: parsed.contentType,
      updated_at: sql`datetime('now')`,
    })
    .onConflictDoUpdate({
      target: [schema.logos.usercode, schema.logos.roastery],
      set: {
        data_url: sql.raw("excluded.data_url"),
        content_type: sql.raw("excluded.content_type"),
        updated_at: sql.raw("excluded.updated_at"),
      },
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
  await c.env.LOGOS.delete(r2Key(user.usercode, body.roastery));
  return json({ ok: true, roastery: body.roastery });
}
