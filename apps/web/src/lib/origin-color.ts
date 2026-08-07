// 산지(ORIGIN)별 카드 색상 코딩 — 구 public/origin-color.js의 TS 이식.
// DB에 색상을 저장하지 않고 산지 문자열을 해시해 매번 같은 색이 나오도록 결정론적으로 생성한다 —
// 새 산지가 추가돼도 별도 매핑표 관리가 필요 없다.
function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** 라이트/다크 테마 모두에서 대비가 나오도록 채도·명도를 테마별로 다르게 고정. */
export function originColor(origin: string): string | null {
  const key = (origin || "").trim().toUpperCase();
  if (!key) return null;
  const dark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const hue = hashHue(key);
  const sat = 68;
  const light = dark ? 64 : 45;
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}
