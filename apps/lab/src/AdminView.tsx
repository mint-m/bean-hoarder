// 관리자 화면(#88) — 가입 모드 · 서비스 통계 · 향미 승격 후보. 관리자(ADMIN_USERCODES)에게만 열린다.
//
// 세 섹션이 전부고 크롬은 랩의 것을 그대로 쓴다 — 관리 화면이라고 다른 모양을 만들지 않는다.
// 향미 후보에는 "승격" 버튼이 없다: 어휘는 코드(@bnhd/schema/flavor)이고 색 커버리지 테스트가 색 없는
// 승격을 막으므로, 여기서는 후보를 보여 주고 PR에 붙여 넣을 목록을 복사하게 하는 데서 멈춘다(#78).
import type { Account } from "@bnhd/session";
import { useCallback, useEffect, useState } from "react";
import { CopyButton } from "./components/FormBits";
import { api } from "./lib/api";

type SignupMode = "invite" | "open" | "closed";
const MODE_LABEL: Record<SignupMode, string> = { invite: "초대코드", open: "누구나", closed: "받지 않음" };
const MODE_HINT: Record<SignupMode, string> = {
  invite: "초대코드(INVITE_CODE secret)가 맞아야 가입된다 — 기본.",
  open: "초대코드 없이 누구나 가입된다. 잠깐 문을 열 때만.",
  closed: "가입을 받지 않는다. 기존 계정은 그대로 쓴다.",
};

interface Stats {
  users: number;
  beans: { total: number; archived: number };
  signups_by_month: { month: string; n: number }[];
  accounts: { usercode: string; created_at: string; beans: number; last_bean: string | null }[];
  logos: number;
  r2: { month: string; write_count: number } | null;
  ai_today: { global: number; accounts: number };
}
interface Candidate {
  note: string;
  count: number;
  users: number;
}

const day = (s: string | null | undefined) => (s ? s.slice(0, 10) : "—");

export default function AdminView({
  account,
  onBack,
  onSessionExpired,
}: {
  account: Account;
  onBack: () => void;
  onSessionExpired: () => void;
}) {
  const [mode, setMode] = useState<SignupMode | null>(null);
  const [modeMsg, setModeMsg] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [error, setError] = useState("");

  const call = useCallback(
    async <T = Record<string, unknown>>(path: string, opts: RequestInit = {}) => {
      const res = await api<T>(path, account.token, opts);
      if (res.status === 401) onSessionExpired();
      return res;
    },
    [account.token, onSessionExpired],
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      const [s, m, c] = await Promise.all([
        call<Stats>("/api/admin/stats"),
        call<{ signup_mode: SignupMode }>("/api/admin/settings"),
        call<{ candidates: Candidate[] }>("/api/admin/flavor-candidates"),
      ]);
      if (!alive) return;
      if (!s.body?.ok || !m.body?.ok || !c.body?.ok) {
        setError(s.body?.error || m.body?.error || c.body?.error || "관리 정보를 불러오지 못했습니다.");
        return;
      }
      setStats(s.body);
      setMode(m.body.signup_mode);
      setCandidates(c.body.candidates);
    })();
    return () => {
      alive = false;
    };
  }, [call]);

  async function changeMode(next: SignupMode) {
    if (next === mode) return;
    setModeMsg("저장 중…");
    const res = await call<{ signup_mode: SignupMode }>("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signup_mode: next }),
    });
    if (res.body?.ok) {
      setMode(res.body.signup_mode);
      setModeMsg(`가입 모드: ${MODE_LABEL[res.body.signup_mode]}`);
    } else setModeMsg(res.body?.error || "저장하지 못했습니다.");
  }

  const candidateText = (candidates ?? []).map((c) => `${c.note}\t${c.count}건\t${c.users}명`).join("\n");

  return (
    <main className="flow admin">
      <div className="stage-head">
        <button type="button" className="stage-back" onClick={onBack}>
          ← 등록으로
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      <section className="card">
        <h2>
          가입 <span className="h2-aux">초대코드 값은 secret에 있다 — 여기서는 문만 여닫는다</span>
        </h2>
        <div className="seg">
          {(Object.keys(MODE_LABEL) as SignupMode[]).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              className={mode === m ? "on" : ""}
              disabled={mode === null}
              onClick={() => changeMode(m)}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
        <p className="hint">{mode ? MODE_HINT[mode] : "불러오는 중…"}</p>
        {modeMsg && <p className="hint">{modeMsg}</p>}
      </section>

      <section className="card">
        <h2>
          통계 <span className="h2-aux">읽기 전용</span>
        </h2>
        {stats ? (
          <>
            <dl className="stat-grid">
              <div>
                <dt>계정</dt>
                <dd>{stats.users}</dd>
              </div>
              <div>
                <dt>원두</dt>
                <dd>
                  {stats.beans.total}
                  <small> · 보관 {stats.beans.archived}</small>
                </dd>
              </div>
              <div>
                <dt>로고</dt>
                <dd>
                  {stats.logos}
                  <small> · R2 쓰기 {stats.r2 ? `${stats.r2.write_count} (${stats.r2.month})` : "0"}</small>
                </dd>
              </div>
              <div>
                <dt>오늘 AI 대행</dt>
                <dd>
                  {stats.ai_today.global}
                  <small> · {stats.ai_today.accounts}계정</small>
                </dd>
              </div>
            </dl>
            <p className="hint">
              월별 가입:{" "}
              {stats.signups_by_month.length
                ? stats.signups_by_month.map((s) => `${s.month} ${s.n}`).join(" · ")
                : "—"}
            </p>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>계정</th>
                  <th>가입</th>
                  <th className="num">원두</th>
                  <th>마지막 등록</th>
                </tr>
              </thead>
              <tbody>
                {stats.accounts.map((a) => (
                  <tr key={a.usercode}>
                    <td>
                      <code>{a.usercode}</code>
                    </td>
                    <td>{day(a.created_at)}</td>
                    <td className="num">{a.beans}</td>
                    <td>{day(a.last_bean)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          !error && <p className="hint">불러오는 중…</p>
        )}
      </section>

      <section className="card">
        <h2>
          향미 승격 후보 <span className="h2-aux">어휘에 없는데 등록된 노트 — 승격은 PR로</span>
        </h2>
        {candidates ? (
          candidates.length ? (
            <>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>노트</th>
                    <th className="num">건수</th>
                    <th className="num">사용자</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr key={c.note}>
                      <td>{c.note}</td>
                      <td className="num">{c.count}</td>
                      <td className="num">{c.users}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="btnrow">
                <CopyButton
                  label="목록 복사"
                  onCopy={async () => {
                    try {
                      await navigator.clipboard.writeText(candidateText);
                      return true;
                    } catch (_e) {
                      return false;
                    }
                  }}
                />
              </div>
              <p className="hint">
                오타 후보(Bergamott)는 승격이 아니라 입력 시점 교정으로 볼 것. 승격하려면{" "}
                <code>packages/schema/src/flavor.ts</code>에 한 줄 + 노트 색 — 커버리지 테스트가 색 없는
                승격을 막는다.
              </p>
            </>
          ) : (
            <p className="hint">어휘 밖 노트가 없다.</p>
          )
        ) : (
          !error && <p className="hint">불러오는 중…</p>
        )}
      </section>
    </main>
  );
}
