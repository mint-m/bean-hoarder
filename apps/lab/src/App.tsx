import { type Account, clearSession, migrateLegacyPin } from "@bnhd/session";
import { useCallback, useEffect, useState } from "react";
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
  // /api/me의 상태 하나 — 로그아웃하면 loading으로 돌아가 다음 로그인이 이전 세션의 실패를 물려받지 않는다
  const [meStatus, setMeStatus] = useState<"loading" | "ok" | "error">("loading");
  const [meAttempt, setMeAttempt] = useState(0); // 실패 뒤 다시 묻는 계기
  // 오늘 남은 AI 대행 횟수 — /api/me와 /api/extract 두 곳에서 오고, 도착 순서가 보장되지 않는다(#103).
  // 그래서 값에 "언제 물어본 값인가"(at)를 붙여 더 새 쪽만 남긴다. me 안에 두면 me가 아직 없을 때 온 갱신이
  // 버려지고, 뒤늦게 도착한 /api/me의 옛 값이 새 값을 덮는다 — CI에서 실제로 그렇게 깨졌다.
  const [aiRemaining, setAiRemaining] = useState<{ value: number; at: number } | null>(null);
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: meAttempt는 값이 아니라 "다시 물어라"는 계기다
  useEffect(() => {
    if (!signedIn || !account) {
      setMe(null);
      setMeStatus("loading");
      setAiRemaining(null);
      return;
    }
    let alive = true;
    setMeStatus("loading");
    const askedAt = performance.now(); // 이 응답은 "이 시각 이후의 서버 상태"다
    api<{ is_admin: boolean; ai_quota: AiQuota }>("/api/me", account.token).then((res) => {
      if (!alive) return;
      if (res.body?.ok) {
        const { is_admin, ai_quota } = res.body;
        setMe({ is_admin, ai_quota });
        // 묻는 사이에 AI 대행 응답이 먼저 왔다면 그쪽이 더 새 값이다
        setAiRemaining((prev) =>
          prev && prev.at > askedAt ? prev : { value: ai_quota.remaining, at: askedAt },
        );
        setMeStatus("ok");
      } else setMeStatus("error");
    });
    return () => {
      alive = false;
    };
  }, [signedIn, account, meAttempt]);

  // 한 번 실패하면 관리 진입점이 새로고침 전까지 안 보였다 — 실패해 있는 동안만, 탭으로 돌아올 때 다시 묻는다
  useEffect(() => {
    if (meStatus !== "error") return;
    const retry = () => {
      if (document.visibilityState === "visible") setMeAttempt((n) => n + 1);
    };
    document.addEventListener("visibilitychange", retry);
    return () => document.removeEventListener("visibilitychange", retry);
  }, [meStatus]);

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

  // AI 대행을 쓸 때마다 서버가 남은 횟수를 준다 — 지금 막 받은 값이라 언제나 가장 새 값이다(#103).
  const handleAiRemaining = useCallback((remaining: number) => {
    setAiRemaining({ value: remaining, at: performance.now() });
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
          <SettingsMenu
            open={settingsOpen}
            setOpen={setSettingsOpen}
            aiQuota={me ? { ...me.ai_quota, remaining: aiRemaining?.value ?? me.ai_quota.remaining } : null}
          />
        </div>
      </header>
      {signedIn && view === "admin" ? (
        <AdminView account={account} onBack={closeAdmin} onSessionExpired={handleSessionExpired} />
      ) : signedIn && adminRoute && meStatus === "loading" ? null : signedIn ? (
        <Workspace
          account={account}
          onSessionExpired={handleSessionExpired}
          onOpenSettings={() => setSettingsOpen(true)}
          onAiRemaining={handleAiRemaining}
        />
      ) : (
        <AuthView onSignedIn={handleSignedIn} notice={expired ? EXPIRED_NOTICE : ""} />
      )}
    </>
  );
}
