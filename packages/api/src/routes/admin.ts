// 관리자 페이지(#88)의 읽기·쓰기 — 전부 authRequired + adminRequired 뒤에 선다.
//   GET /api/admin/stats              계정·원두·가입 추이·로고/R2·AI 사용량 (읽기 전용)
//   GET /api/admin/flavor-candidates  어휘 밖 향미 노트를 건수·사용자 수와 함께 (#78 — 승격은 PR로)
//   GET /api/admin/settings           { signup_mode }
//   PUT /api/admin/settings           { signup_mode: invite | open | closed }
//
// 향미 후보에 새 테이블은 없다 — 원본은 어차피 beans라 그때그때 센다. 승격 버튼도 없다: 어휘는 코드
// (@bnhd/schema/flavor)이고 커버리지 테스트가 색 없는 승격을 막으므로, 화면은 후보를 보여 주는 데서 멈춘다.
import { isKnownNote, parseNotes } from "@bnhd/schema/flavor";
import { sql } from "drizzle-orm";
import type { Context } from "hono";
import { createDb } from "../db";
import type { AppEnv } from "../env";
import { json } from "../lib/http";
import { getSignupMode, isSignupMode, SIGNUP_MODES, setSignupMode } from "../lib/settings";

export async function getStats(c: Context<AppEnv>): Promise<Response> {
  const db = createDb(c.env.DB);
  const one = <T>(q: ReturnType<typeof sql>) => db.get<T>(q);
  const users = await one<{ n: number }>(sql`SELECT count(*) AS n FROM users`);
  const beans = await one<{ total: number; archived: number }>(
    sql`SELECT count(*) AS total, coalesce(sum(archived), 0) AS archived FROM beans`,
  );
  const signups = await db.all<{ month: string; n: number }>(
    sql`SELECT substr(created_at, 1, 7) AS month, count(*) AS n FROM users GROUP BY month ORDER BY month DESC LIMIT 12`,
  );
  const accounts = await db.all<{
    usercode: string;
    created_at: string;
    beans: number;
    last_bean: string | null;
  }>(
    sql`SELECT u.usercode, u.created_at, count(b.key) AS beans, max(b.created_at) AS last_bean
        FROM users u LEFT JOIN beans b ON b.usercode = u.usercode
        GROUP BY u.usercode ORDER BY last_bean DESC NULLS LAST, u.created_at DESC`,
  );
  const logos = await one<{ n: number }>(sql`SELECT count(*) AS n FROM logos`);
  const r2 = await one<{ month: string; write_count: number }>(
    sql`SELECT month, write_count FROM r2_usage WHERE id = 'global'`,
  );
  // 오늘 AI 대행 사용량 — reset_at이 아직 안 지난 행만 산 값이다(ai-quota.ts와 같은 기준)
  const ai = await one<{ global: number; accounts: number }>(
    sql`SELECT coalesce(sum(CASE WHEN bucket = 'global' THEN count END), 0) AS global,
               count(CASE WHEN bucket LIKE 'acct:%' AND count > 0 THEN 1 END) AS accounts
        FROM ai_usage WHERE reset_at > datetime('now')`,
  );
  return json({
    ok: true,
    users: users?.n ?? 0,
    beans: { total: beans?.total ?? 0, archived: beans?.archived ?? 0 },
    signups_by_month: signups,
    accounts,
    logos: logos?.n ?? 0,
    r2: r2 ?? null,
    ai_today: { global: ai?.global ?? 0, accounts: ai?.accounts ?? 0 },
  });
}

/** 어휘 밖 노트 집계 — 표기 변형(대소문자·공백)은 하나로 모으고, 처음 본 표기를 대표로 쓴다. */
export async function getFlavorCandidates(c: Context<AppEnv>): Promise<Response> {
  const db = createDb(c.env.DB);
  const rows = await db.all<{ usercode: string; tasting_note: string }>(
    sql`SELECT usercode, tasting_note FROM beans WHERE tasting_note != ''`,
  );
  const acc = new Map<string, { note: string; count: number; users: Set<string> }>();
  for (const r of rows) {
    for (const token of parseNotes(r.tasting_note)) {
      if (isKnownNote(token)) continue;
      const key = token.toLowerCase().replace(/\s+/g, "");
      const hit = acc.get(key) ?? { note: token, count: 0, users: new Set<string>() };
      hit.count += 1;
      hit.users.add(r.usercode);
      acc.set(key, hit);
    }
  }
  const candidates = [...acc.values()]
    .map((v) => ({ note: v.note, count: v.count, users: v.users.size }))
    .sort((a, b) => b.count - a.count || b.users - a.users || a.note.localeCompare(b.note));
  return json({ ok: true, candidates });
}

export async function getSettings(c: Context<AppEnv>): Promise<Response> {
  return json({ ok: true, signup_mode: await getSignupMode(createDb(c.env.DB)), modes: SIGNUP_MODES });
}

export async function putSettings(c: Context<AppEnv>): Promise<Response> {
  const body = (await c.req.json().catch(() => ({}))) as { signup_mode?: unknown };
  if (!isSignupMode(body.signup_mode)) {
    return json({ ok: false, error: `signup_mode는 ${SIGNUP_MODES.join(" | ")} 중 하나여야 합니다.` }, 400);
  }
  await setSignupMode(createDb(c.env.DB), body.signup_mode);
  return json({ ok: true, signup_mode: body.signup_mode });
}
