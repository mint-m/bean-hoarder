// AI 인식 대행 — 사용자가 본인 키를 넣지 않아도 하루 몇 번은 AI로 채워 준다.
//
// 키는 Cloudflare secret(GEMINI_API_KEY)으로만 존재하며 브라우저로 절대 내려가지 않는다.
// 본인 키를 넣은 사용자는 이 경로를 쓰지 않는다 — 브라우저에서 Google로 직접 가고 제한도 없다.
// 프롬프트·응답 해석은 두 경로가 @bnhd/autofill/ai 한 곳을 공유한다(결과가 갈리면 안 되므로).
import { AI_ENDPOINT, AI_MODEL, aiRequestBody, parseAiResponse } from "@bnhd/autofill/ai";
import type { Context } from "hono";
import { createDb } from "../db";
import type { AppEnv } from "../env";
import { AI_QUOTA_ERROR, releaseAiCall, reserveAiCall } from "../lib/ai-quota";
import { json } from "../lib/http";

/** 요청 본문 상한 — /api/fetch가 20,000자로 자르므로 그보다 넉넉히 잡고 그 위는 자른다. */
const MAX_TEXT = 30_000;

export async function extractWithAi(c: Context<AppEnv>): Promise<Response> {
  const apiKey = (c.env.GEMINI_API_KEY || "").trim();
  // 키를 안 넣은 배포에서도 서비스는 정상 동작해야 한다 — 클라이언트가 규칙 기반으로 폴백한다.
  if (!apiKey) return json({ ok: false, error: "AI 인식이 설정되지 않았습니다.", fallback: true }, 503);

  let text = "";
  try {
    const body = (await c.req.json()) as { text?: unknown };
    text = String(body?.text || "").slice(0, MAX_TEXT);
  } catch (_e) {
    return json({ ok: false, error: "잘못된 요청입니다." }, 400);
  }
  if (!text.trim()) return json({ ok: false, error: "인식할 내용이 없습니다." }, 400);

  const user = c.get("user");
  const db = createDb(c.env.DB);

  // 먼저 자리를 예약한다 — 동시 요청이 몰려도 한도를 넘기지 않게 (판정 = 기록)
  const remaining = await reserveAiCall(db, user.usercode);
  if (remaining === null) return json({ ok: false, error: AI_QUOTA_ERROR, fallback: true }, 429);

  try {
    const res = await fetch(`${AI_ENDPOINT}/${AI_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(aiRequestBody(text)),
      // Google이 늦게 답하면 Pages Functions 자체가 끊기기 전에 우리가 먼저 정리한다
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await res.json().catch(() => null)) as {
      error?: { message?: string };
      candidates?: unknown;
    } | null;
    if (!res.ok) throw new Error(body?.error?.message || `HTTP ${res.status}`);
    return json({ ok: true, fields: parseAiResponse(body), remaining });
  } catch (e) {
    // 우리 쪽 사정으로 실패했으면 사용자 몫을 깎지 않는다
    await releaseAiCall(db, user.usercode);
    return json({ ok: false, error: `AI 인식 실패 — ${(e as Error).message}`, fallback: true }, 502);
  }
}
