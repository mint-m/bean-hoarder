// 세션 저장·이행 — 구 public/session.js의 TS 이식. 덱이 쓴다.
// Phase 2 인증: 브라우저는 PIN을 저장하지 않고 세션 토큰(bhs_…)만 보관한다.
// 구버전이 저장해 둔 bh_pin이 남아 있으면 1회 로그인으로 세션과 교환하고 PIN을 지운다.
//
// ⚠️ apps/lab/src/lib/session.ts와 같은 localStorage 키를 쓰는 손 복제본이다 (#56).
// 통합은 #55 2단계 — 그때까지 한쪽만 고치지 않는다.
export interface Account {
  usercode: string;
  token: string;
}

export function load(): Account {
  return {
    usercode: localStorage.getItem("bh_usercode") || "",
    token: localStorage.getItem("bh_session") || "",
  };
}

export function save(usercode: string, token: string): void {
  localStorage.setItem("bh_usercode", usercode);
  localStorage.setItem("bh_session", token);
  localStorage.removeItem("bh_pin"); // 구버전 잔재 제거
}

export function clear(): void {
  localStorage.removeItem("bh_usercode");
  localStorage.removeItem("bh_session");
  localStorage.removeItem("bh_pin");
}

export function authHeader(): Record<string, string> {
  return { Authorization: `Bearer ${load().token}` };
}

// 구버전(bh_pin 저장)에서 넘어온 브라우저: 저장된 자격으로 세션을 발급받는다.
// 자격이 확실히 거부된 경우(4xx)에만 PIN을 제거 — 일시 오류(429/5xx/네트워크)면
// 유지해서 다음 방문에 재시도한다 (일시 장애로 강제 로그아웃되지 않도록).
export async function migrateLegacyPin(): Promise<Account> {
  const usercode = localStorage.getItem("bh_usercode") || "";
  const pin = localStorage.getItem("bh_pin") || "";
  if (localStorage.getItem("bh_session") || !usercode || !pin) return load();
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
    if (body?.ok && body.token) {
      save(body.usercode as string, body.token);
      return load();
    }
    if (res.status === 429 || res.status >= 500) return load();
  } catch (_e) {
    return load(); // 네트워크 오류 — 다음 방문에서 재시도 (PIN 유지)
  }
  localStorage.removeItem("bh_pin");
  return load();
}
