// 세션 저장·이행 공용 모듈 (deck.html과 랩이 공유 — 일반 스크립트, window.bhSession 노출).
// Phase 2 인증: 브라우저는 PIN을 저장하지 않고 세션 토큰(bhs_…)만 보관한다.
// 구버전이 저장해 둔 bh_pin이 남아 있으면 1회 로그인으로 세션과 교환하고 PIN을 지운다.
(function () {
  function load() {
    return {
      usercode: localStorage.getItem("bh_usercode") || "",
      token: localStorage.getItem("bh_session") || "",
    };
  }

  function save(usercode, token) {
    localStorage.setItem("bh_usercode", usercode);
    localStorage.setItem("bh_session", token);
    localStorage.removeItem("bh_pin"); // 구버전 잔재 제거
  }

  function clear() {
    localStorage.removeItem("bh_usercode");
    localStorage.removeItem("bh_session");
    localStorage.removeItem("bh_pin");
  }

  function authHeader() {
    return { "Authorization": `Bearer ${load().token}` };
  }

  // 구버전(bh_pin 저장)에서 넘어온 브라우저: 저장된 자격으로 세션을 발급받는다.
  // 자격이 확실히 거부된 경우(4xx)에만 PIN을 제거 — 일시 오류(429/5xx/네트워크)면
  // 유지해서 다음 방문에 재시도한다 (일시 장애로 강제 로그아웃되지 않도록).
  async function migrateLegacyPin() {
    const usercode = localStorage.getItem("bh_usercode") || "";
    const pin = localStorage.getItem("bh_pin") || "";
    if (localStorage.getItem("bh_session") || !usercode || !pin) return load();
    try {
      const res = await fetch("/api/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usercode, password: pin }),
      });
      const body = await res.json().catch(() => null);
      if (body && body.ok && body.token) {
        save(body.usercode, body.token);
        return load();
      }
      if (res.status === 429 || res.status >= 500) return load();
    } catch (e) { /* 네트워크 오류 — 다음 방문에서 재시도 (PIN 유지) */
      return load();
    }
    localStorage.removeItem("bh_pin");
    return load();
  }

  window.bhSession = { load, save, clear, authHeader, migrateLegacyPin };
})();
