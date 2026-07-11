// JSON 응답 헬퍼 — 기존 _lib.js json()과 동일한 헤더(no-store)를 유지한다.
export function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json;charset=utf-8", "Cache-Control": "no-store" },
  });
}
