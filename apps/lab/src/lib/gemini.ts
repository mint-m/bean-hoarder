// Gemini 호출 (사용자 본인 키) — 브라우저에서 Google API에 직접 요청한다.
// 서비스 서버를 거치지 않으므로 서버 비용도, 할당량 소모도 없다.
//
// 프롬프트·응답 해석은 서버 대행 경로(packages/api/src/routes/extract.ts)와 같은 규칙을 써야 한다 —
// 그래서 @bnhd/autofill/ai 한 곳에서 가져온다. 여기는 "본인 키로 부른다"는 부분만 담당한다.
import { AI_ENDPOINT, AI_MODEL, aiRequestBody, parseAiResponse } from "@bnhd/autofill/ai";

export async function geminiExtract(apiKey: string, text: string): Promise<Record<string, string>> {
  const res = await fetch(`${AI_ENDPOINT}/${AI_MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(aiRequestBody(text)),
  });
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (!res.ok) throw new Error(body?.error?.message || `HTTP ${res.status}`);
  return parseAiResponse(body);
}
