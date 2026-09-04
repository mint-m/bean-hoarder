// Gemini 호출 (사용자 본인 키) — 브라우저에서 Google API에 직접 요청한다.
// 서비스 서버를 거치지 않으므로 서버 비용도, 할당량 소모도 없다.
//
// 프롬프트·응답 해석은 서버 대행 경로(packages/api/src/routes/extract.ts)와 같은 규칙을 써야 한다 —
// 그래서 @bnhd/autofill/ai 한 곳에서 가져온다. 여기는 "본인 키로 부른다"는 부분만 담당한다.
// 모델 후보를 훑는 순서도 그 공유 목록을 따른다 — 본인 키라고 다른 모델을 쓰면 "키를 넣었더니
// 결과가 달라진다"가 된다.
import {
  AI_ENDPOINT,
  AI_MODELS,
  aiRequestBody,
  parseAiResponse,
  shouldTryNextModel,
} from "@bnhd/autofill/ai";

export async function geminiExtract(apiKey: string, text: string): Promise<Record<string, string>> {
  let lastError = "알 수 없는 오류";
  for (const model of AI_MODELS) {
    const res = await fetch(`${AI_ENDPOINT}/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(aiRequestBody(text)),
    });
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    if (res.ok) return parseAiResponse(body);
    lastError = body?.error?.message || `HTTP ${res.status}`;
    // 키가 잘못됐거나(401·403) 우리가 잘못 보낸(400) 경우는 후보를 바꿔도 그대로다
    if (!shouldTryNextModel(res.status)) break;
  }
  throw new Error(lastError);
}
