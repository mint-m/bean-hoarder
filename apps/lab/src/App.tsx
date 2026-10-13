import { type Account, clearSession, migrateLegacyPin } from "@bnhd/session";
import { useCallback, useEffect, useRef, useState } from "react";
import AdminView from "./AdminView";
import AuthView from "./AuthView";
import SettingsMenu, { type AiQuota } from "./components/SettingsMenu";
import { clearAdminToken } from "./lib/admin-token";
import { api } from "./lib/api";
import Workspace from "./Workspace";

const EXPIRED_NOTICE = "로그인이 만료되었습니다. 다시 로그인해 주세요.";

// 관리 화면의 주소는 해시(/lab/#admin)다. 경로(/lab/admin)로 두면 Pages가 매치 없는 경로를 조회 페이지에
// 주는 폴백(인쇄된 QR이 사는 길)이 가져가 버린다 — 해시는 서버를 거치지 않고 랩 안에서만 읽힌다.
// 주소가 있어야 새로고침해도 관리 화면에 머물고, 뒤로 가기가 등록 화면으로 돌아오고, 랜딩이 링크를 걸 수 있다.
const ADMIN_HASH = "#admin";
const wantsAdmin = () => location.hash === ADMIN_HASH;

export default function App() {
  const [account, setAccount] = useState<Account | null>(null); // null = 세션 부트 중
  const [expired, setExpired] = useState(false);
  // 설정 서랍은 보통 톱바 버튼으로 열지만, 인식이 부실했을 때 그 자리에서도 열 수 있어야 한다
  // (실패를 해결할 UI를 실패 안내 옆에 두는 규칙 — DESIGN.md §1).
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 로그인 직후 /api/me 한 번 — 관리자면 진입점을 보이고, AI 한도는 설정 문구가 쓴다(#72).
  // 실패해도 등록 동선은 멀쩡하다 — 둘 다 "있으면 보여 주는" 정보다.
  const [me, setMe] = useState<{ is_admin: boolean; ai_quota: AiQuota } | null>(null);
  const [meFailed, setMeFailed] = useState(false);
  const meFailedRef = useRef(false); // 재시도 판단용 — 이벤트 핸들러가 최신 값을 읽게
  const [adminRoute, setAdminRoute] = useState(wantsAdmin);
  const signedIn = !!account?.usercode && !!account?.token;
  // 관리 화면은 주소가 #admin이고 서버가 관리자라고 답했을 때만이다. 비관리자에겐 #admin이 아무 뜻도 없다.
  const view: "work" | "admin" = adminRoute && me?.is_admin ? "admin" : "work";

  // 뒤로·앞으로 가기와 주소창 편집을 따라간다
  useEffect(() => {
    const sync = () => setAdminRoute(wantsAdmin());
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  const openAdmin = useCallback(() => {
    if (wantsAdmin()) return;
    // 이 기록에 "등록에서 왔다"를 남긴다 — 돌아갈 때 새 기록을 쌓지 않고 뒤로 가게
    history.pushState({ fromWork: true }, "", ADMIN_HASH);
    setAdminRoute(true);
  }, []);

  const closeAdmin = useCallback(() => {
    if ((history.state as { fromWork?: boolean } | null)?.fromWork) return history.back(); // popstate가 상태를 맞춘다
    // 북마크·랜딩 링크로 바로 들어왔다 — 뒤가 랩이 아니므로 기록을 바꾸지 않고 해시만 지운다
    history.replaceState(null, "", location.pathname + location.search);
    setAdminRoute(false);
  }, []);

  useEffect(() => {
    // 구버전이 저장한 PIN이 있으면 세션 토큰으로 교환 (실패 시 로그인 화면)
    migrateLegacyPin().then(setAccount);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("signed-in", signedIn);
  }, [signedIn]);

  useEffect(() => {
    if (!signedIn || !account) {
      setMe(null);
      return;
    }
    let alive = true;
    const load = () =>
      api<{ is_admin: boolean; ai_quota: AiQuota }>("/api/me", account.token).then((res) => {
        if (!alive) return;
        const ok = !!res.body?.ok;
        if (ok && res.body) setMe({ is_admin: res.body.is_admin, ai_quota: res.body.ai_quota });
        meFailedRef.current = !ok;
        setMeFailed(!ok);
      });
    load();
    // 한 번 실패하면 관리 진입점이 새로고침 전까지 안 보였다 — 탭으로 돌아올 때 다시 묻는다
    const retry = () => {
      if (document.visibilityState === "visible" && meFailedRef.current) load();
    };
    document.addEventListener("visibilitychange", retry);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", retry);
    };
  }, [signedIn, account]);

  // 비관리자가 #admin으로 왔다 — 뜻 없는 주소를 남겨 두지 않는다(서버가 답한 뒤에만 판단한다)
  useEffect(() => {
    if (adminRoute && me && !me.is_admin) {
      history.replaceState(null, "", location.pathname + location.search);
      setAdminRoute(false);
    }
  }, [adminRoute, me]);

  // 서버가 세션을 거부했다(만료 90일 경과, 또는 다른 기기에서 로그아웃해 폐기됨).
  // 토큰이 남아 있어도 아무것도 저장할 수 없으므로 지우고 로그인 화면으로 돌린다 —
  // 예전엔 이 경로가 없어서 목록이 빈 화면이 되고 저장할 때마다 "인증 실패 — 유저코드와
  // 암호를 확인하세요"만 떴다(방금 아무것도 입력하지 않았는데도).
  // ⚠️ useCallback으로 신원을 고정할 것 — 매 렌더 새 함수가 되면 Workspace의 call →
  // refreshList/refreshLogos → useEffect가 끝없이 재실행된다.
  const handleSessionExpired = useCallback(() => {
    clearSession();
    clearAdminToken(); // 관리 토큰도 함께 — 같은 탭에서 다시 로그인했을 때 키 없이 열리지 않게
    setAccount({ usercode: "", token: "" });
    setExpired(true);
  }, []);

  const handleSignedIn = useCallback((next: Account) => {
    setExpired(false);
    setAccount(next);
  }, []);

  async function signOut() {
    // 서버 세션 폐기는 최선 노력 — 실패해도 로컬 세션은 지운다
    try {
      await fetch("/api/session", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${account?.token}` },
      });
    } catch (_e) {
      /* 무시 */
    }
    clearSession();
    clearAdminToken(); // 관리 토큰도 함께 — 같은 탭에서 다시 로그인했을 때 키 없이 열리지 않게
    setAccount({ usercode: "", token: "" });
    setExpired(false); // 스스로 나간 것이지 만료가 아니다
  }

  if (account === null) return null; // 세션 부트 중 — 깜빡임 방지

  return (
    <>
      <header className="topbar">
        <a className="wordmark" href="/">
          Bean-Hoarder<span>LAB</span>
        </a>
        <div className="topbar-right">
          {signedIn && (
            <div className="acct-chip">
              <code>{account.usercode}</code>
              {/* 관리 화면에서는 "지금 여기"로만 표시한다 — 돌아가는 길은 본문의 "← 등록으로" 하나다 */}
              {me?.is_admin && (
                <button
                  type="button"
                  aria-current={view === "admin" ? "page" : undefined}
                  onClick={openAdmin}
                >
                  관리
                </button>
              )}
              <button type="button" onClick={signOut}>
                로그아웃
              </button>
            </div>
          )}
          <SettingsMenu open={settingsOpen} setOpen={setSettingsOpen} aiQuota={me?.ai_quota ?? null} />
        </div>
      </header>
      {signedIn && view === "admin" ? (
        <AdminView account={account} onBack={closeAdmin} onSessionExpired={handleSessionExpired} />
      ) : signedIn && adminRoute && !me && !meFailed ? null : signedIn ? (
        <Workspace
          account={account}
          onSessionExpired={handleSessionExpired}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      ) : (
        <AuthView onSignedIn={handleSignedIn} notice={expired ? EXPIRED_NOTICE : ""} />
      )}
    </>
  );
}
