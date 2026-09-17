// 내 계정 정보 — 랩이 로그인 직후 한 번 불러 (1) 관리자면 관리 진입점을 보이고 (2) AI 인식 한도를
// 화면 문구로 쓴다(#72 — "하루 N번"을 손으로 적지 않고 서버가 주는 값으로).
import type { Context } from "hono";
import { createDb } from "../db";
import type { AppEnv } from "../env";
import { isAdmin } from "../lib/admin";
import { AI_QUOTA, remainingAiCalls } from "../lib/ai-quota";
import { json } from "../lib/http";

export async function getMe(c: Context<AppEnv>): Promise<Response> {
  const user = c.get("user");
  const remaining = await remainingAiCalls(createDb(c.env.DB), user.usercode);
  return json({
    ok: true,
    usercode: user.usercode,
    is_admin: isAdmin(c.env, user.usercode),
    ai_quota: { limit: AI_QUOTA.perAccount, remaining },
  });
}
