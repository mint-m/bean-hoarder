import { useCallback, useEffect, useState } from "react";
import AuthView from "./AuthView";
import { type Account, clearSession, migrateLegacyPin } from "./lib/session";
import Workspace from "./Workspace";

const EXPIRED_NOTICE = "로그인이 만료되었습니다. 다시 로그인해 주세요.";

export default function App() {
  const [account, setAccount] = useState<Account | null>(null); // null = 세션 부트 중
  const [expired, setExpired] = useState(false);
  const signedIn = !!account?.usercode && !!account?.token;

  useEffect(() => {
    // 구버전이 저장한 PIN이 있으면 세션 토큰으로 교환 (실패 시 로그인 화면)
    migrateLegacyPin().then(setAccount);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("signed-in", signedIn);
  }, [signedIn]);

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
        {signedIn && (
          <div className="acct-chip">
            <code>{account.usercode}</code>
            <button type="button" onClick={signOut}>
              로그아웃
            </button>
          </div>
        )}
      </header>
      {signedIn ? (
        <Workspace account={account} onSessionExpired={handleSessionExpired} />
      ) : (
        <AuthView onSignedIn={handleSignedIn} notice={expired ? EXPIRED_NOTICE : ""} />
      )}
    </>
  );
}
