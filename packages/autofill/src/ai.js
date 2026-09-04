// AI 인식의 공유 부분 — 프롬프트와 응답 해석.
//
// 호출 경로가 둘이라 여기 한 곳에 둔다:
//   · 브라우저 — 사용자 본인 키로 Google에 직접 (apps/lab/src/lib/gemini.ts)
//   · 서버     — 서비스 키로 대신 호출 (packages/api/src/routes/extract.ts)
// 둘이 다른 프롬프트를 쓰면 "키를 넣었더니 결과가 달라진다"가 되므로 규칙은 반드시 하나여야 한다.
// HTTP 호출 자체는 각자 담당한다 — 브라우저는 fetch + 사용자 키, 서버는 fetch + secret.

import { roastLevelsForPrompt } from "@bnhd/schema/roast";

/**
 * 모델 후보 — 앞에서부터 시도한다. 두 경로가 **같은 목록**을 써야 결과가 일관된다.
 *
 * 왜 하나가 아니라 목록인가: 같은 키라도 모델마다 되고 안 되고가 갈린다. 실제로 이 저장소의
 * AI 리뷰 워크플로 로그에 404(그 키에 미제공)·429(무료 등급 할당이 0)·503(과부하)이 모델별로
 * 다르게 찍혔다. 하나만 못 박아 두면 그 모델이 막히는 날 기능 전체가 조용히 죽는다.
 */
export const AI_MODELS = ["gemini-3.5-flash-lite", "gemini-flash-lite-latest", "gemini-3.6-flash"];

/**
 * 이 상위 응답이 "다음 후보로 넘어가면 될 일"인지.
 * 모델에 매인 실패만 넘긴다 — 400(우리가 잘못 보냄)·401·403(키 문제)은 후보를 바꿔도 그대로다.
 */
export function shouldTryNextModel(status) {
  return status === 404 || status === 429 || status >= 500;
}

export const AI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/** 한 번에 보낼 최대 글자 수. /api/fetch가 이미 20,000자로 자르므로 사실상의 상한이다. */
export const AI_MAX_CHARS = 30000;

/** AI가 채울 수 있는 필드 — 로스팅일·소분일은 페이지에 없는 정보라 제외한다. */
export const AI_FIELD_KEYS = [
  "ROASTERY",
  "ORIGIN",
  "COFFEE_NAME",
  "REGION",
  "PRODUCER",
  "LOT",
  "WASHING_STATION",
  "VARIETY",
  "PROCESS",
  "ALTITUDE",
  "HARVEST",
  "NET_WEIGHT",
  "AGTRON",
  "TASTING_NOTE",
  "MEMO",
  "SOURCE_URL",
];

export const AI_PROMPT = `다음 텍스트는 커피 원두 상품 페이지에서 추출한 것이다. 원두 정보를 JSON 객체로 추출하라.
규칙:
- 값을 찾지 못한 키는 생략한다. 절대 추측하지 않는다.
- ORIGIN: 생산 국가명, 영문 대문자 (예: "ETHIOPIA"). 블렌드면 "블렌드".
- COFFEE_NAME: 로스터가 붙인 고유 제품명·시그니쳐/블렌드 네이밍이 있을 때만 (예: "푸루티 봉봉").
  단순히 국가+지역을 나열한 이름은 넣지 않는다. 없으면 생략.
- REGION: 국가 아래 세부 지역 계층을 콤마로 이어 한 줄로 (예: "Yirgacheffe, Gedeb").
- VARIETY: 품종명만 짧게 (예: "Chiroso", "Gesha"). 재배·선별 과정 설명은 넣지 않는다.
- PROCESS: 가공방식 핵심 명칭만 짧게 (예: "Washed", "Natural", "Honey"). 페이지에 "PROCESSING"
  같은 제목으로 별도의 상세 공정 설명 문단(예: "Hand-picked... Fermented... Dried...")이 있어도
  그 문단 전체를 넣지 말 것 — 핵심 명칭만 PROCESS에, 상세 설명은 MEMO로 돌린다.
- ALTITUDE: 미터 숫자 또는 범위만, 단위 없이 (예: "1900-2100").
- NET_WEIGHT: 그램 숫자만 (예: "200").
- HARVEST: 수확시기 (예: "25/26", "25.12-26.01").
- AGTRON: 로스팅 포인트. 라이트~다크 표현(Light/Medium/City/Full City/Vienna/French roast 등)이나 숫자
  (Agtron/아그트론 값)가 있으면 다음 6단계 중 가장 가까운 것으로 **아래 표기 그대로** 옮긴다
  (원문이 한국어여도 영문 표기로):
  ${roastLevelsForPrompt()}.
  아무 단서도 없으면 생략한다.
- TASTING_NOTE: 콤마로 구분한 짧은 노트. **반드시 영문 표기**로 쓴다 — 원문이 한국어여도
  영문으로 옮긴다 (파인애플 → "Pineapple", 자스민 → "Jasmine", 다크 초콜릿 → "Dark Chocolate").
  라벨 인쇄와 기존 데이터가 영문 표기를 전제한다.
- MEMO: 산지·농장의 배경 스토리, 또는 PROCESS·VARIETY 등 다른 필드에 넣기엔 너무 긴 상세 설명
  (발효 시간, 건조 방식, 컵핑 히스토리 등 문단형 서술)이 있으면 2~3문장으로 한국어 요약, 없으면 생략.
- ROAST_DATE, PACKAGE_DATE는 추출하지 않는다.
허용 키: ${AI_FIELD_KEYS.join(", ")}
JSON 객체만 출력하라.`;

/** Gemini generateContent 요청 본문 — 두 경로가 같은 파라미터로 부른다. */
export function aiRequestBody(text) {
  return {
    contents: [{ parts: [{ text: `${AI_PROMPT}\n\n---\n${String(text).slice(0, AI_MAX_CHARS)}` }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0 },
  };
}

/**
 * 응답 본문 → 필드 객체. 허용 키의 문자열 값만 남긴다(모델이 헛것을 넣어도 폼에 새 키가 생기지 않게).
 * @throws 모델이 아무것도 돌려주지 않았거나 JSON이 아닐 때 — 호출부가 사용자에게 안내한다.
 */
export function parseAiResponse(body) {
  const raw = body?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!raw) throw new Error("AI가 결과를 반환하지 않았습니다 (안전 필터 또는 빈 응답)");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_e) {
    throw new Error("AI 응답을 해석하지 못했습니다 — 다시 시도해 주세요");
  }
  const out = {};
  for (const k of AI_FIELD_KEYS) {
    const v = parsed?.[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}
