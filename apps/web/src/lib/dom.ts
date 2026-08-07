// DOM 조회 헬퍼 — 페이지 HTML에 반드시 존재하는 요소를 non-null로 다룬다.
// 인라인 스크립트였을 때는 타입 검사가 없어 그냥 썼지만, 모듈이 되면서 매번 null 분기를
// 쓰는 대신 "없으면 그건 HTML이 깨진 것"이라는 전제를 한 곳에 모은다.
export function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`필수 요소를 찾지 못했습니다: #${id}`);
  return node as T;
}

/** HTML 문자열 삽입 시 사용자 입력을 이스케이프 */
export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
  );
}

/** "26.07.03" → Date. 형식이 아니면 null. */
export function parseDot(d: string): Date | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{2})$/.exec(d || "");
  return m ? new Date(2000 + +(m[1] as string), +(m[2] as string) - 1, +(m[3] as string)) : null;
}

/** 로스팅일로부터 경과 일수 (미래거나 형식 오류면 null) */
export function daysSince(dot: string): number | null {
  const d = parseDot(dot);
  if (!d) return null;
  const n = Math.floor((Date.now() - d.getTime()) / 864e5);
  return n >= 0 ? n : null;
}
