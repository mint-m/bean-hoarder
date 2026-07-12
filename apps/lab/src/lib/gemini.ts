// Gemini 호출: 사용자 본인의 API 키로 브라우저에서 Google API에 직접 요청한다.
// 서비스 서버를 거치지 않으므로 서버 비용·키 보관 부담이 없다. (lab.js에서 이식)
const AI_FIELD_KEYS = [
  "ROASTERY",
  "ORIGIN",
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

const AI_PROMPT = `다음 텍스트는 커피 원두 상품 페이지에서 추출한 것이다. 원두 정보를 JSON 객체로 추출하라.
규칙:
- 값을 찾지 못한 키는 생략한다. 절대 추측하지 않는다.
- ORIGIN: 생산 국가명, 영문 대문자 (예: "ETHIOPIA"). 블렌드면 "블렌드".
- REGION: 국가 아래 세부 지역 계층을 콤마로 이어 한 줄로 (예: "Yirgacheffe, Gedeb").
- VARIETY: 품종명만 짧게 (예: "Chiroso", "Gesha"). 재배·선별 과정 설명은 넣지 않는다.
- PROCESS: 가공방식 핵심 명칭만 짧게 (예: "Washed", "Natural", "Honey"). 페이지에 "PROCESSING"
  같은 제목으로 별도의 상세 공정 설명 문단(예: "Hand-picked... Fermented... Dried...")이 있어도
  그 문단 전체를 넣지 말 것 — 핵심 명칭만 PROCESS에, 상세 설명은 MEMO로 돌린다.
- ALTITUDE: 미터 숫자 또는 범위만, 단위 없이 (예: "1900-2100").
- NET_WEIGHT: 그램 숫자만 (예: "200").
- HARVEST: 수확시기 (예: "25/26", "25.12-26.01").
- AGTRON: 로스팅 포인트. 라이트~다크 표현(Light/Medium/City/Full City/Vienna/French roast 등)이나 숫자
  (Agtron/아그트론 값)가 있으면 다음 6단계 중 가장 가까운 것으로 "#숫자 (한글표현)" 형식으로 변환한다:
  #120(울트라라이트), #95(라이트), #75(미디움라이트), #65(미디움), #55(미디움다크), #45(다크).
  아무 단서도 없으면 생략한다.
- TASTING_NOTE: 콤마로 구분한 짧은 노트.
- MEMO: 산지·농장의 배경 스토리, 또는 PROCESS·VARIETY 등 다른 필드에 넣기엔 너무 긴 상세 설명
  (발효 시간, 건조 방식, 컵핑 히스토리 등 문단형 서술)이 있으면 2~3문장으로 한국어 요약, 없으면 생략.
- ROAST_DATE, PACKAGE_DATE는 추출하지 않는다.
허용 키: ${AI_FIELD_KEYS.join(", ")}
JSON 객체만 출력하라.`;

const GEMINI_MODEL = "gemini-2.5-flash-lite";

export async function geminiExtract(apiKey: string, text: string): Promise<Record<string, string>> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${AI_PROMPT}\n\n---\n${text.slice(0, 30000)}` }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0 },
      }),
    },
  );
  const body = (await res.json().catch(() => null)) as {
    error?: { message?: string };
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  } | null;
  if (!res.ok) {
    throw new Error(body?.error?.message || `HTTP ${res.status}`);
  }
  const raw = body?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!raw) {
    // 안전 필터 차단·빈 입력 등으로 candidates가 비는 경우 — JSON.parse("")로 죽지 않게 명시적 안내
    throw new Error("AI가 결과를 반환하지 않았습니다 (안전 필터 또는 빈 응답)");
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch (_e) {
    throw new Error("AI 응답을 해석하지 못했습니다 — 다시 시도해 주세요");
  }
  const out: Record<string, string> = {};
  for (const k of AI_FIELD_KEYS) {
    const v = parsed[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}
