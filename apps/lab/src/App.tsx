import { useEffect, useState } from "react";
import AuthView from "./AuthView";
import { type Account, clearSession, migrateLegacyPin } from "./lib/session";
import Workspace from "./Workspace";

export default function App() {
  const [account, setAccount] = useState<Account | null>(null); // null = 세션 부트 중
  const signedIn = !!account?.usercode && !!account?.token;

  useEffect(() => {
    // 구버전이 저장한 PIN이 있으면 세션 토큰으로 교환 (실패 시 로그인 화면)
    migrateLegacyPin().then(setAccount);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("signed-in", signedIn);
  }, [signedIn]);

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
  }

  if (account === null) return null; // 세션 부트 중 — 깜빡임 방지

  return (
    <>
      <header className="topbar">
        <a className="wordmark" href="/">
          Bean-Hoarder<span>LAB</span>
        </a>
        {signedIn && (
          <div className="acct-chip">
            <code>{account.usercode}</code>
            <button type="button" onClick={signOut}>
              로그아웃
            </button>
          </div>
        )}
      </header>
      {signedIn ? <Workspace account={account} /> : <AuthView onSignedIn={setAccount} />}
    </>
  );
}
