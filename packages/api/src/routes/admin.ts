// 관리자 페이지(#88)의 읽기·쓰기 — 전부 authRequired + adminRequired 뒤에 선다.
//   GET /api/admin/stats              대시보드 — 규모·최근 30일 활동·한도 사용률·12개월 추이·분포 (읽기 전용)
//   GET /api/admin/flavor-candidates  어휘 밖 향미 노트를 건수·사용자 수와 함께 (#78 — 승격은 PR로)
//   GET /api/admin/settings           { signup_mode }
//   PUT /api/admin/settings           { signup_mode: invite | open | closed }
//
// 통계는 **멀리서 보는 숫자**만이다 — 계정별 표 같은 세부는 두지 않는다. 운영자가 알아야 하는 것은
// "얼마나 크고, 얼마나 움직이고, 한도에 얼마나 가까운가"다. 집계 로직은 lib/stats.ts(순수 함수).
// 향미 후보에 새 테이블은 없다 — 원본은 어차피 beans라 그때그때 센다. 승격 버튼도 없다: 어휘는 코드
// (@bnhd/schema/flavor)이고 커버리지 테스트가 색 없는 승격을 막으므로, 화면은 후보를 보여 주는 데서 멈춘다.
import { sql } from "drizzle-orm";
import type { Context } from "hono";
import { createDb } from "../db";
import type { AppEnv } from "../env";
import { AI_QUOTA } from "../lib/ai-quota";
import { MAX_R2_LOGO_OBJECTS, MONTHLY_WRITE_BUDGET } from "../lib/budget";
import { json } from "../lib/http";
import { getSignupMode, isSignupMode, SIGNUP_MODES, setSignupMode } from "../lib/settings";
import {
  beansPerAccount,
  flavorCandidates,
  lastMonths,
  monthlySeries,
  roastDistribution,
  topNotes,
} from "../lib/stats";

const MONTHS = 12;
const RECENT_DAYS = 30;

export async function getStats(c: Context<AppEnv>): Promise<Response> {
  const db = createDb(c.env.DB);
  const recent = sql.raw(`datetime('now', '-${RECENT_DAYS} days')`);

  const users = await db.get<{ total: number; new_recent: number }>(sql`
    SELECT count(*) AS total,
           count(CASE WHEN created_at >= ${recent} THEN 1 END) AS new_recent
    FROM users`);
  const active = await db.get<{ n: number }>(
    sql`SELECT count(DISTINCT usercode) AS n FROM beans WHERE created_at >= ${recent}`,
  );
  const beans = await db.get<{ total: number; archived: number; new_recent: number }>(sql`
    SELECT count(*) AS total,
           coalesce(sum(archived), 0) AS archived,
           count(CASE WHEN created_at >= ${recent} THEN 1 END) AS new_recent
    FROM beans`);
  const sessions = await db.get<{ n: number }>(
    sql`SELECT count(*) AS n FROM sessions WHERE expires_at > datetime('now')`,
  );
  const limited = await db.get<{ n: number }>(
    sql`SELECT count(*) AS n FROM auth_attempts WHERE reset_at > datetime('now')`,
  );
  const logos = await db.get<{ n: number; r2: number }>(
    sql`SELECT count(*) AS n, count(CASE WHEN data_url = '' THEN 1 END) AS r2 FROM logos`,
  );
  const r2 = await db.get<{ month: string; write_count: number }>(
    sql`SELECT month, write_count FROM r2_usage WHERE id = 'global'`,
  );
  // 오늘 AI 대행 — reset_at이 아직 안 지난 행만 산 값이다(ai-quota.ts와 같은 기준)
  const ai = await db.get<{ global: number; accounts: number }>(sql`
    SELECT coalesce(sum(CASE WHEN bucket = 'global' THEN count END), 0) AS global,
           count(CASE WHEN bucket LIKE 'acct:%' AND count > 0 THEN 1 END) AS accounts
    FROM ai_usage WHERE reset_at > datetime('now')`);

  const months = lastMonths(MONTHS);
  const since = months[0] ?? "";
  const signupsByMonth = await db.all<{ month: string; n: number }>(sql`
    SELECT substr(created_at, 1, 7) AS month, count(*) AS n FROM users
    WHERE substr(created_at, 1, 7) >= ${since} GROUP BY month`);
  const beansByMonth = await db.all<{ month: string; n: number }>(sql`
    SELECT substr(created_at, 1, 7) AS month, count(*) AS n FROM beans
    WHERE substr(created_at, 1, 7) >= ${since} GROUP BY month`);

  const origins = await db.all<{ name: string; n: number }>(sql`
    SELECT upper(trim(origin)) AS name, count(*) AS n FROM beans
    WHERE archived = 0 AND trim(origin) != '' GROUP BY name ORDER BY n DESC, name LIMIT 6`);
  const roasteries = await db.all<{ name: string; n: number }>(sql`
    SELECT roastery AS name, count(*) AS n FROM beans
    WHERE archived = 0 GROUP BY name ORDER BY n DESC, name LIMIT 6`);
  const roasts = await db.all<{ agtron: string; n: number }>(
    sql`SELECT agtron, count(*) AS n FROM beans WHERE archived = 0 GROUP BY agtron`,
  );
  const notes = await db.all<{ tasting_note: string }>(
    sql`SELECT tasting_note FROM beans WHERE archived = 0 AND tasting_note != ''`,
  );
  const perAccount = await db.all<{ c: number }>(sql`
    SELECT count(b.key) AS c FROM users u LEFT JOIN beans b ON b.usercode = u.usercode GROUP BY u.usercode`);

  return json({
    ok: true,
    signup_mode: await getSignupMode(db),
    recent_days: RECENT_DAYS,
    users: { total: users?.total ?? 0, new_recent: users?.new_recent ?? 0, active_recent: active?.n ?? 0 },
    beans: {
      total: beans?.total ?? 0,
      archived: beans?.archived ?? 0,
      new_recent: beans?.new_recent ?? 0,
    },
    sessions: { active: sessions?.n ?? 0 },
    auth: { live_buckets: limited?.n ?? 0 },
    logos: { count: logos?.n ?? 0, r2_objects: logos?.r2 ?? 0, r2_objects_cap: MAX_R2_LOGO_OBJECTS },
    r2: { month: r2?.month ?? null, writes: r2?.write_count ?? 0, writes_cap: MONTHLY_WRITE_BUDGET },
    ai: {
      today_global: ai?.global ?? 0,
      global_cap: AI_QUOTA.global,
      accounts_today: ai?.accounts ?? 0,
      per_account_cap: AI_QUOTA.perAccount,
    },
    monthly: monthlySeries(months, signupsByMonth, beansByMonth),
    origins,
    roasteries,
    roast_levels: roastDistribution(roasts),
    top_notes: topNotes(notes),
    beans_per_account: beansPerAccount(perAccount.map((r) => r.c)),
  });
}

export async function getFlavorCandidates(c: Context<AppEnv>): Promise<Response> {
  const db = createDb(c.env.DB);
  const rows = await db.all<{ usercode: string; tasting_note: string }>(
    sql`SELECT usercode, tasting_note FROM beans WHERE tasting_note != ''`,
  );
  return json({ ok: true, candidates: flavorCandidates(rows) });
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
