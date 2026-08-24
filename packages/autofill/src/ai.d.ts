// ai.js의 타입 선언 — 브라우저(랩)와 서버(api)가 같은 모듈을 쓰므로 선언도 패키지 안에 둔다
// (각 앱이 따로 손으로 선언하면 갈라진다).
export declare const AI_MODEL: string;
export declare const AI_ENDPOINT: string;
export declare const AI_MAX_CHARS: number;
export declare const AI_FIELD_KEYS: string[];
export declare const AI_PROMPT: string;
export declare function aiRequestBody(text: string): {
  contents: { parts: { text: string }[] }[];
  generationConfig: { responseMimeType: string; temperature: number };
};
export declare function parseAiResponse(body: unknown): Record<string, string>;
