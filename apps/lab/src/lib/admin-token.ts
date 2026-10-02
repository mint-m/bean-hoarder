// 관리 토큰 보관 — 관리 화면(AdminView)이 쓰고, 로그아웃·세션 만료(App)가 지운다.
//
// sessionStorage에만 둔다(탭을 닫으면 사라진다). 서버에서도 토큰은 발급한 세션에 묶여 로그아웃하면 함께
// 죽지만, 브라우저에 남은 문자열까지 같이 치워야 "나갔다"가 완전해진다 — 그래서 읽기·쓰기·지우기를
// 한곳에 모아 App과 AdminView가 같은 키를 쓰게 한다.
const ADMIN_TOKEN_KEY = "bh_admin_token";

export function readAdminToken(): string {
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY) || "";
  } catch (_e) {
    return "";
  }
}

export function writeAdminToken(t: string): void {
  try {
    if (t) sessionStorage.setItem(ADMIN_TOKEN_KEY, t);
    else sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch (_e) {
    /* 사생활 보호 모드 — 이 탭에서만 기억한다 */
  }
}

export function clearAdminToken(): void {
  writeAdminToken("");
}
