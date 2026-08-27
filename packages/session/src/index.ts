// 세션 저장·이행 — 조회·덱(@bnhd/web)과 랩(@bnhd/lab)이 공유하는 단일 소스.
//
// Phase 2 인증: 브라우저는 PIN을 저장하지 않고 세션 토큰(bhs_…)만 보관한다. 구버전이 저장해 둔
// bh_pin이 남아 있으면 1회 로그인으로 세션과 교환하고 PIN을 지운다.
//
// 예전에는 조회·덱과 랩이 이 로직을 각자 손으로 복제해, migrateLegacyPin의 성공 판정이 서로
// 달랐다(#56 — 한쪽만 usercode를 검사). 두 앱이 같은 localStorage 키를 조작하므로 판정이
// 어긋나면 한쪽이 만든 상태를 다른 쪽이 잘못 해석한다. 통합하며 방어가 강한 쪽(usercode까지 검사)로
// 통일했다.
export interface Account {
  usercode: string;
  token: string;
}

export function loadSession(): Account {
  return {
    usercode: localStorage.getItem("bh_usercode") || "",
    token: localStorage.getItem("bh_session") || "",
  };
}

export function saveSession(usercode: string, token: string): void {
  localStorage.setItem("bh_usercode", usercode);
  localStorage.setItem("bh_session", token);
  localStorage.removeItem("bh_pin"); // 구버전 잔재 제거
}

export function clearSession(): void {
  localStorage.removeItem("bh_usercode");
  localStorage.removeItem("bh_session");
  localStorage.removeItem("bh_pin");
}

// 구버전(bh_pin 저장)에서 넘어온 브라우저: 저장된 자격으로 세션을 발급받는다.
// 자격이 확실히 거부된 경우(4xx)에만 PIN을 제거 — 일시 오류(429/5xx/네트워크)면 유지해서
// 다음 방문에 재시도한다 (일시 장애로 강제 로그아웃되지 않도록).
export async function migrateLegacyPin(): Promise<Account> {
  const usercode = localStorage.getItem("bh_usercode") || "";
  const pin = localStorage.getItem("bh_pin") || "";
  if (localStorage.getItem("bh_session") || !usercode || !pin) return loadSession();
  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usercode, password: pin }),
    });
    const body = (await res.json().catch(() => null)) as {
      ok?: boolean;
      usercode?: string;
      token?: string;
    } | null;
    // usercode까지 있어야 성공으로 본다 — 없으면 "undefined" 문자열이 저장돼 KEY 소유권 판정이
    // 전부 틀어지므로(#56), 서버가 세 경로 모두 usercode를 함께 주는 지금도 심층 방어로 검사한다.
    if (body?.ok && body.token && body.usercode) {
      saveSession(body.usercode, body.token);
      return loadSession();
    }
    if (res.status === 429 || res.status >= 500) return loadSession();
  } catch (_e) {
    return loadSession(); // 네트워크 오류 — 다음 방문에서 재시도 (PIN 유지)
  }
  localStorage.removeItem("bh_pin");
  return loadSession();
}
