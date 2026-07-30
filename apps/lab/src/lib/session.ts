// 세션 저장·이행 (public/session.js의 TS 이식 — localStorage 키 동일해 구 admin과 상호 호환).
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
// 자격이 확실히 거부된 경우(4xx)에만 PIN을 제거 — 일시 오류(429/5xx/네트워크)면 유지.
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
    if (body?.ok && body.token && body.usercode) {
      saveSession(body.usercode, body.token);
      return loadSession();
    }
    if (res.status === 429 || res.status >= 500) return loadSession();
  } catch (_e) {
    return loadSession();
  }
  localStorage.removeItem("bh_pin");
  return loadSession();
}
