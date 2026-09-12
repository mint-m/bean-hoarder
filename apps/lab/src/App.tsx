import { type Account, clearSession, migrateLegacyPin } from "@bnhd/session";
import { useCallback, useEffect, useState } from "react";
import AdminView from "./AdminView";
import AuthView from "./AuthView";
import SettingsMenu, { type AiQuota } from "./components/SettingsMenu";
import { api } from "./lib/api";
import Workspace from "./Workspace";

const EXPIRED_NOTICE = "로그인이 만료되었습니다. 다시 로그인해 주세요.";

export default function App() {
  const [account, setAccount] = useState<Account | null>(null); // null = 세션 부트 중
  const [expired, setExpired] = useState(false);
  // 설정 서랍은 보통 톱바 버튼으로 열지만, 인식이 부실했을 때 그 자리에서도 열 수 있어야 한다
  // (실패를 해결할 UI를 실패 안내 옆에 두는 규칙 — DESIGN.md §1).
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 로그인 직후 /api/me 한 번 — 관리자면 진입점을 보이고, AI 한도는 설정 문구가 쓴다(#72).
  // 실패해도 등록 동선은 멀쩡하다 — 둘 다 "있으면 보여 주는" 정보다.
  const [me, setMe] = useState<{ is_admin: boolean; ai_quota: AiQuota } | null>(null);
  const [view, setView] = useState<"work" | "admin">("work");
  const signedIn = !!account?.usercode && !!account?.token;

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
      setView("work");
      return;
    }
    let alive = true;
    api<{ is_admin: boolean; ai_quota: AiQuota }>("/api/me", account.token).then((res) => {
      if (alive && res.body?.ok) setMe({ is_admin: res.body.is_admin, ai_quota: res.body.ai_quota });
    });
    return () => {
      alive = false;
    };
  }, [signedIn, account]);

  // 서버가 세션을 거부했다(만료 90일 경과, 또는 다른 기기에서 로그아웃해 폐기됨).
  // 토큰이 남아 있어도 아무것도 저장할 수 없으므로 지우고 로그인 화면으로 돌린다 —
  // 예전엔 이 경로가 없어서 목록이 빈 화면이 되고 저장할 때마다 "인증 실패 — 유저코드와
  // 암호를 확인하세요"만 떴다(방금 아무것도 입력하지 않았는데도).
  // ⚠️ useCallback으로 신원을 고정할 것 — 매 렌더 새 함수가 되면 Workspace의 call →
  // refreshList/refreshLogos → useEffect가 끝없이 재실행된다.
  const handleSessionExpired = useCallback(() => {
    clearSession();
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
              {me?.is_admin && (
                <button type="button" onClick={() => setView(view === "admin" ? "work" : "admin")}>
                  {view === "admin" ? "등록" : "관리"}
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
        <AdminView account={account} onBack={() => setView("work")} onSessionExpired={handleSessionExpired} />
      ) : signedIn ? (
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
