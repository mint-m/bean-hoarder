// 관리자 페이지(#88)의 읽기·쓰기 — 전부 authRequired + adminRequired 뒤에 선다.
//   GET /api/admin/stats              결정에 쓰이는 숫자 — 가입 문 / 규모 / 무료 한도까지의 거리 (읽기 전용)
//   GET /api/admin/flavor-candidates  어휘 밖 향미 노트를 사용자 수·건수·비슷한 어휘와 함께 (#78 — 승격은 PR로)
//   GET /api/admin/settings           { signup_mode }
//   PUT /api/admin/settings           { signup_mode: invite | open | closed }
//
// 대시보드는 **운영자가 내릴 결정에 쓰이는 숫자**만 낸다 — 가입 문을 열고 닫을지(최근 가입·인증 실패·한도 여유),
// 무료 한도를 넘기 전에 손을 쓸지(AI·R2), 어휘를 늘릴지(후보). 산지·로스터리 분포나 월별 추이처럼 보면 재미있지만
// 어떤 결정도 바꾸지 않는 숫자는 두지 않는다. 향미 후보에 새 테이블은 없다 — 원본은 어차피 beans라 그때그때 센다.
// 승격 버튼도 없다: 어휘는 코드(@bnhd/schema/flavor)이고 커버리지 테스트가 색 없는 승격을 막으므로, 화면은
// 후보를 보여 주는 데서 멈춘다.
import { sql } from "drizzle-orm";
import type { Context } from "hono";
import { createDb } from "../db";
import type { AppEnv } from "../env";
import { AI_QUOTA } from "../lib/ai-quota";
import { MAX_R2_LOGO_OBJECTS, MONTHLY_WRITE_BUDGET } from "../lib/budget";
import { json } from "../lib/http";
import { getSignupMode, isSignupMode, SIGNUP_MODES, setSignupMode } from "../lib/settings";
import { flavorCandidates } from "../lib/stats";

const RECENT_DAYS = 30;

export async function getStats(c: Context<AppEnv>): Promise<Response> {
  const db = createDb(c.env.DB);
  const recent = sql.raw(`datetime('now', '-${RECENT_DAYS} days')`);

  // 서로 의존하지 않는 쿼리라 한꺼번에 보낸다 — D1 호출 하나가 네트워크 왕복이다(#100)
  const [signupMode, users, active, beans, limited, logos, r2, ai] = await Promise.all([
    getSignupMode(db),
    db.get<{ total: number; new_recent: number }>(sql`
      SELECT count(*) AS total,
             count(CASE WHEN created_at >= ${recent} THEN 1 END) AS new_recent
      FROM users`),
    db.get<{ n: number }>(sql`SELECT count(DISTINCT usercode) AS n FROM beans WHERE created_at >= ${recent}`),
    db.get<{ total: number; new_recent: number }>(sql`
      SELECT count(*) AS total,
             count(CASE WHEN created_at >= ${recent} THEN 1 END) AS new_recent
      FROM beans`),
    db.get<{ n: number }>(sql`SELECT count(*) AS n FROM auth_attempts WHERE reset_at > datetime('now')`),
    db.get<{ r2: number }>(sql`SELECT count(CASE WHEN data_url = '' THEN 1 END) AS r2 FROM logos`),
    db.get<{ month: string; write_count: number }>(
      sql`SELECT month, write_count FROM r2_usage WHERE id = 'global'`,
    ),
    // 오늘 AI 대행 — reset_at이 아직 안 지난 행만 산 값이다(ai-quota.ts와 같은 기준)
    db.get<{ global: number; accounts: number }>(sql`
      SELECT coalesce(sum(CASE WHEN bucket = 'global' THEN count END), 0) AS global,
             count(CASE WHEN bucket LIKE 'acct:%' AND count > 0 THEN 1 END) AS accounts
      FROM ai_usage WHERE reset_at > datetime('now')`),
  ]);

  return json({
    ok: true,
    signup_mode: signupMode,
    recent_days: RECENT_DAYS,
    users: { total: users?.total ?? 0, new_recent: users?.new_recent ?? 0, active_recent: active?.n ?? 0 },
    beans: { total: beans?.total ?? 0, new_recent: beans?.new_recent ?? 0 },
    auth: { live_buckets: limited?.n ?? 0 },
    logos: { r2_objects: logos?.r2 ?? 0, r2_objects_cap: MAX_R2_LOGO_OBJECTS },
    r2: { month: r2?.month ?? null, writes: r2?.write_count ?? 0, writes_cap: MONTHLY_WRITE_BUDGET },
    ai: {
      today_global: ai?.global ?? 0,
      global_cap: AI_QUOTA.global,
      accounts_today: ai?.accounts ?? 0,
      per_account_cap: AI_QUOTA.perAccount,
    },
  });
}

export async function getFlavorCandidates(c: Context<AppEnv>): Promise<Response> {
  const db = createDb(c.env.DB);
  const rows = await db.all<{ usercode: string; tasting_note: string }>(
    sql`SELECT usercode, tasting_note FROM beans WHERE archived = 0 AND tasting_note != ''`,
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
