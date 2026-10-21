// AI 인식 대행 — 사용자가 본인 키를 넣지 않아도 하루 몇 번은 AI로 채워 준다.
//
// 키는 Cloudflare secret(GEMINI_API_KEY)으로만 존재하며 브라우저로 절대 내려가지 않는다.
// 본인 키를 넣은 사용자는 이 경로를 쓰지 않는다 — 브라우저에서 Google로 직접 가고 제한도 없다.
// 프롬프트·응답 해석은 두 경로가 @bnhd/autofill/ai 한 곳을 공유한다(결과가 갈리면 안 되므로).
import {
  AI_ENDPOINT,
  AI_MODELS,
  aiRequestBody,
  parseAiResponse,
  shouldTryNextModel,
} from "@bnhd/autofill/ai";
import type { Context } from "hono";
import { createDb } from "../db";
import type { AppEnv } from "../env";
import { AI_QUOTA_ERROR, releaseAiCall, reserveAiCall } from "../lib/ai-quota";
import { json } from "../lib/http";

/** 요청 본문 상한 — /api/fetch가 20,000자로 자르므로 그보다 넉넉히 잡고 그 위는 자른다. */
const MAX_TEXT = 30_000;

/** 상위 호출 전체의 마감 시한 — 후보를 몇 개 시도하든 이 안에서 끝낸다. */
const DEADLINE_MS = 20_000;

/**
 * 구조화 로그 — app.ts의 5xx 로깅과 같은 모양이라 `wrangler pages deployment tail`에서 함께 읽힌다.
 *
 * 이 경로의 실패는 응답으로 돌려줄 뿐 던지지 않아 onError를 타지 않고, 클라이언트는 설계상 조용히
 * 규칙 기반으로 내려간다. 그래서 여기서 남기지 않으면 기능이 통째로 죽어도 **아무 흔적이 없다** —
 * 실제로 그 상태로 한 릴리스를 보냈다. 로그가 이 기능의 유일한 계기판이다.
 */
function logAi(msg: string, extra: Record<string, unknown> = {}): void {
  console.error(JSON.stringify({ level: "error", msg, path: "/api/extract", ...extra }));
}

export async function extractWithAi(c: Context<AppEnv>): Promise<Response> {
  const apiKey = (c.env.GEMINI_API_KEY || "").trim();
  // 키를 안 넣은 배포에서도 서비스는 정상 동작해야 한다 — 클라이언트가 규칙 기반으로 폴백한다.
  // 다만 "키를 넣었다고 생각하는데 안 넣힌" 경우와 구분되지 않으므로 로그에는 남긴다.
  if (!apiKey) {
    logAi("GEMINI_API_KEY가 바인딩되지 않았다 — AI 대행이 꺼진 채로 동작 중");
    return json({ ok: false, error: "AI 인식이 설정되지 않았습니다.", fallback: true }, 503);
  }

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

  // 후보 모델을 순서대로 시도한다 — 같은 키라도 모델마다 404·429·503이 갈리므로(AI_MODELS 주석),
  // 하나만 부르면 그 모델이 막히는 날 기능 전체가 죽는다. 마감 시한은 후보 전체에 하나만 두어
  // 재시도가 Pages Functions 실행 시간을 밀어내지 않게 한다.
  const deadline = AbortSignal.timeout(DEADLINE_MS);
  let lastError = "알 수 없는 오류";
  for (const model of AI_MODELS) {
    try {
      const res = await fetch(`${AI_ENDPOINT}/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(aiRequestBody(text)),
        signal: deadline,
      });
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string };
        candidates?: unknown;
      } | null;
      if (res.ok) return json({ ok: true, fields: parseAiResponse(body), remaining });
      lastError = body?.error?.message || `HTTP ${res.status}`;
      logAi("상위 모델 호출 실패", { model, status: res.status, error: lastError });
      if (!shouldTryNextModel(res.status)) break;
    } catch (e) {
      // 네트워크 끊김·마감 시한 초과·응답 해석 실패 — 후보를 바꿔도 같을 가능성이 높아 여기서 멈춘다
      lastError = (e as Error).message;
      logAi("상위 모델 호출 중 예외", { model, error: lastError });
      break;
    }
  }
  // 우리 쪽 사정으로 실패했으면 사용자 몫을 깎지 않는다
  await releaseAiCall(db, user.usercode);
  return json({ ok: false, error: `AI 인식 실패 — ${lastError}`, fallback: true }, 502);
}
