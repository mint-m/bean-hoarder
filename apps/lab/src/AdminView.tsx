// 관리자 화면(#88) — 가입 모드 · 대시보드 · 향미 승격 후보. 관리자(ADMIN_USERCODES)에게만 열린다.
//
// 들어오면 먼저 **관리 키**로 잠금을 푼다 — 계정 인증은 접근성을 위해 얕으므로(4자리 PIN) 그 위에 두 번째
// 열쇠를 둔다. 받은 1시간 토큰은 sessionStorage에만 둔다(탭을 닫으면 사라진다). 서버가 `locked`로 답하면
// 만료된 것이니 잠금 화면으로 돌아간다.
//
// 대시보드는 **멀리서 전체를 보는 숫자**다 — 규모, 최근 30일 움직임, 한도까지의 거리, 12개월 추이, 분포.
// 계정별 표 같은 세부는 두지 않는다(운영자가 알아야 하는 것은 누가 무엇을 올렸는가가 아니다).
// 크롬은 랩의 것을 그대로 쓰고, 차트는 라이브러리 없이 CSS 막대다 — 숫자 열두 개에 라이브러리는 과하다.
// 향미 후보에는 "승격" 버튼이 없다: 어휘는 코드(@bnhd/schema/flavor)이고 색 커버리지 테스트가 색 없는
// 승격을 막으므로, 후보를 보여 주고 PR에 붙여 넣을 목록을 복사하게 하는 데서 멈춘다(#78).
import type { Account } from "@bnhd/session";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { CopyButton } from "./components/FormBits";
import { api } from "./lib/api";

const ADMIN_TOKEN_KEY = "bh_admin_token";
const readAdminToken = (): string => {
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY) || "";
  } catch (_e) {
    return "";
  }
};
const writeAdminToken = (t: string) => {
  try {
    if (t) sessionStorage.setItem(ADMIN_TOKEN_KEY, t);
    else sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch (_e) {
    /* 사생활 보호 모드 — 이 탭에서만 기억한다 */
  }
};

type SignupMode = "invite" | "open" | "closed";
const MODE_LABEL: Record<SignupMode, string> = { invite: "초대코드", open: "누구나", closed: "받지 않음" };
const MODE_HINT: Record<SignupMode, string> = {
  invite: "초대코드(INVITE_CODE secret)가 맞아야 가입된다 — 기본.",
  open: "초대코드 없이 누구나 가입된다. 잠깐 문을 열 때만.",
  closed: "가입을 받지 않는다. 기존 계정은 그대로 쓴다.",
};

interface Named {
  name: string;
  n: number;
}
interface Stats {
  recent_days: number;
  users: { total: number; new_recent: number; active_recent: number };
  beans: { total: number; archived: number; new_recent: number };
  sessions: { active: number };
  auth: { live_buckets: number };
  logos: { count: number; r2_objects: number; r2_objects_cap: number };
  r2: { month: string | null; writes: number; writes_cap: number };
  ai: { today_global: number; global_cap: number; accounts_today: number; per_account_cap: number };
  monthly: { month: string; signups: number; beans: number }[];
  origins: Named[];
  roasteries: Named[];
  roast_levels: { level: string; n: number }[];
  top_notes: { note: string; n: number }[];
  beans_per_account: { bucket: string; n: number }[];
}
interface Candidate {
  note: string;
  count: number;
  users: number;
}

const fmt = (n: number) => n.toLocaleString("ko-KR");
const pct = (n: number, cap: number) => (cap > 0 ? Math.min(100, Math.round((n / cap) * 100)) : 0);

/** 큰 숫자 하나 + 맥락 한 줄. 한도가 있으면 사용률 막대를 아래에 — 숫자보다 "얼마나 남았나"가 먼저 읽히게. */
function Tile({ label, value, sub, cap }: { label: string; value: number; sub?: string; cap?: number }) {
  const used = cap ? pct(value, cap) : null;
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className="tile-n">
        {fmt(value)}
        {cap ? <small> / {fmt(cap)}</small> : null}
      </div>
      {sub && <div className="tile-sub">{sub}</div>}
      {used !== null && (
        <div className="meter" title={`${used}% 사용`}>
          <span style={{ width: `${used}%` }} className={used >= 80 ? "hot" : ""} />
        </div>
      )}
    </div>
  );
}

/** 이름·개수 목록을 비율 막대로 — 제일 큰 것을 100%로 두어 "무엇이 주류인가"만 보이게. */
function Dist({ title, rows, empty = "—" }: { title: string; rows: Named[]; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div className="dist">
      <div className="dist-title">{title}</div>
      {rows.length ? (
        rows.map((r) => (
          <div className="dist-row" key={r.name}>
            <span className="dist-name">{r.name}</span>
            <span className="dist-bar">
              <span style={{ width: `${(r.n / max) * 100}%` }} />
            </span>
            <span className="dist-n">{fmt(r.n)}</span>
          </div>
        ))
      ) : (
        <p className="hint">{empty}</p>
      )}
    </div>
  );
}

/** 12개월 막대 두 줄 — 가입과 등록. 달 축은 서버가 빈 달까지 채워 준다. */
function Monthly({ rows }: { rows: Stats["monthly"] }) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.signups, r.beans)));
  return (
    <div className="months">
      {rows.map((r) => (
        <div className="month" key={r.month} title={`${r.month} — 가입 ${r.signups} · 등록 ${r.beans}`}>
          <div className="month-bars">
            <span className="b-signup" style={{ height: `${(r.signups / max) * 100}%` }} />
            <span className="b-bean" style={{ height: `${(r.beans / max) * 100}%` }} />
          </div>
          <div className="month-label">{r.month.slice(5)}</div>
        </div>
      ))}
    </div>
  );
}

export default function AdminView({
  account,
  onBack,
  onSessionExpired,
}: {
  account: Account;
  onBack: () => void;
  onSessionExpired: () => void;
}) {
  const [mode, setMode] = useState<SignupMode | null>(null); // 서버에 저장된 값
  const [draft, setDraft] = useState<SignupMode | null>(null); // 드롭다운에서 고른 값 — 적용을 눌러야 저장된다
  const [modeMsg, setModeMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [error, setError] = useState("");
  const [adminToken, setAdminToken] = useState(readAdminToken);
  const [keyInput, setKeyInput] = useState("");
  const [unlockMsg, setUnlockMsg] = useState("");
  const [unlocking, setUnlocking] = useState(false);

  const call = useCallback(
    async <T = Record<string, unknown>>(path: string, opts: RequestInit = {}) => {
      const res = await api<T>(path, account.token, {
        ...opts,
        headers: {
          ...(opts.headers as Record<string, string>),
          ...(adminToken ? { "X-Admin-Token": adminToken } : {}),
        },
      });
      if (res.status === 401) onSessionExpired();
      // 관리 토큰이 없거나 만료됐다 — 잠금 화면으로. 세션은 멀쩡하므로 로그아웃시키지 않는다
      if (res.status === 403 && (res.body as { locked?: boolean } | null)?.locked) {
        writeAdminToken("");
        setAdminToken("");
      }
      return res;
    },
    [account.token, adminToken, onSessionExpired],
  );

  async function unlock(e: FormEvent) {
    e.preventDefault();
    if (!keyInput || unlocking) return;
    setUnlocking(true);
    setUnlockMsg("");
    const res = await api<{ token: string }>("/api/admin/unlock", account.token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: keyInput }),
    });
    setUnlocking(false);
    setKeyInput("");
    if (res.status === 401) return onSessionExpired();
    if (res.body?.ok && res.body.token) {
      writeAdminToken(res.body.token);
      setAdminToken(res.body.token);
    } else setUnlockMsg(res.body?.error || "잠금을 풀지 못했습니다.");
  }

  useEffect(() => {
    if (!adminToken) return;
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
      setDraft(m.body.signup_mode);
      setCandidates(c.body.candidates);
    })();
    return () => {
      alive = false;
    };
  }, [call, adminToken]);

  // 가입 문을 여닫는 일은 클릭 한 번으로 일어나면 안 된다 — 드롭다운으로 고르고 "적용"을 따로 누른다.
  async function applyMode() {
    if (!draft || draft === mode || saving) return;
    setSaving(true);
    setModeMsg("저장 중…");
    const res = await call<{ signup_mode: SignupMode }>("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signup_mode: draft }),
    });
    setSaving(false);
    if (res.body?.ok) {
      setMode(res.body.signup_mode);
      setModeMsg(`적용됨 — 가입 모드: ${MODE_LABEL[res.body.signup_mode]}`);
    } else setModeMsg(res.body?.error || "저장하지 못했습니다.");
  }
  const dirty = draft !== null && draft !== mode;

  const candidateText = (candidates ?? []).map((c) => `${c.note}\t${c.count}건\t${c.users}명`).join("\n");
  const days = stats?.recent_days ?? 30;

  if (!adminToken) {
    return (
      <main className="flow admin">
        <div className="stage-head">
          <button type="button" className="stage-back" onClick={onBack}>
            ← 등록으로
          </button>
        </div>
        <form className="card" onSubmit={unlock}>
          <h2>
            관리 잠금 <span className="h2-aux">계정과 별개의 두 번째 열쇠</span>
          </h2>
          <label className="field">
            <span className="field-head">
              <span className="field-name">관리 키 (ADMIN_KEY)</span>
            </span>
            <input
              type="password"
              autoComplete="off"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              disabled={unlocking}
            />
          </label>
          <div className="btnrow">
            <button type="submit" className="primary" disabled={!keyInput || unlocking}>
              {unlocking ? "확인 중…" : "잠금 풀기"}
            </button>
          </div>
          {unlockMsg && <p className="error">{unlockMsg}</p>}
          <p className="hint">
            한 시간 뒤, 또는 이 탭을 닫으면 다시 잠긴다. 틀리면 10분에 5번까지만 시도할 수 있다.
          </p>
        </form>
      </main>
    );
  }

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
        <div className="mode-row">
          <label className="field mode-field">
            <span className="field-head">
              <span className="field-name">가입 모드{mode ? ` — 지금: ${MODE_LABEL[mode]}` : ""}</span>
            </span>
            <select
              value={draft ?? ""}
              disabled={mode === null || saving}
              onChange={(e) => {
                setDraft(e.target.value as SignupMode);
                setModeMsg("");
              }}
            >
              {(Object.keys(MODE_LABEL) as SignupMode[]).map((m) => (
                <option key={m} value={m}>
                  {MODE_LABEL[m]}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="primary" disabled={!dirty || saving} onClick={applyMode}>
            적용
          </button>
        </div>
        <p className="hint">{draft ? MODE_HINT[draft] : "불러오는 중…"}</p>
        {dirty && !modeMsg && (
          <p className="hint">
            아직 저장되지 않았다 — <b>적용</b>을 눌러야 바뀐다.
          </p>
        )}
        {modeMsg && <p className="hint">{modeMsg}</p>}
      </section>

      <section className="card">
        <h2>
          지금 <span className="h2-aux">규모와 최근 {days}일</span>
        </h2>
        {stats ? (
          <div className="tiles">
            <Tile
              label="계정"
              value={stats.users.total}
              sub={`최근 ${days}일 · 신규 ${fmt(stats.users.new_recent)} · 등록한 계정 ${fmt(stats.users.active_recent)}`}
            />
            <Tile
              label="원두"
              value={stats.beans.total}
              sub={`최근 ${days}일 등록 ${fmt(stats.beans.new_recent)} · 보관 ${fmt(stats.beans.archived)}`}
            />
            <Tile label="로그인된 기기" value={stats.sessions.active} sub="만료되지 않은 세션" />
            <Tile
              label="인증 실패 감시"
              value={stats.auth.live_buckets}
              sub={stats.auth.live_buckets ? "10분 창 안에 실패가 있는 IP·계정" : "조용하다"}
            />
          </div>
        ) : (
          !error && <p className="hint">불러오는 중…</p>
        )}
      </section>

      {stats && (
        <section className="card">
          <h2>
            한도 <span className="h2-aux">무료 등급을 넘기기 전에 코드가 막는 지점까지</span>
          </h2>
          <div className="tiles">
            <Tile
              label="오늘 AI 대행"
              value={stats.ai.today_global}
              cap={stats.ai.global_cap}
              sub={`${fmt(stats.ai.accounts_today)}계정 사용 · 계정당 ${stats.ai.per_account_cap}회`}
            />
            <Tile
              label={`R2 쓰기${stats.r2.month ? ` (${stats.r2.month})` : ""}`}
              value={stats.r2.writes}
              cap={stats.r2.writes_cap}
              sub="로고 저장·교체 횟수 — 이달"
            />
            <Tile
              label="R2 로고"
              value={stats.logos.r2_objects}
              cap={stats.logos.r2_objects_cap}
              sub={`로고 전체 ${fmt(stats.logos.count)} (레거시 인라인 포함)`}
            />
          </div>
        </section>
      )}

      {stats && (
        <section className="card">
          <h2>
            추이 <span className="h2-aux">12개월 — 가입(진하게) · 원두 등록(연하게)</span>
          </h2>
          <Monthly rows={stats.monthly} />
        </section>
      )}

      {stats && (
        <section className="card">
          <h2>
            무엇이 등록되나 <span className="h2-aux">보관 제외</span>
          </h2>
          <div className="dists">
            <Dist title="산지" rows={stats.origins} empty="아직 없다" />
            <Dist title="로스터리" rows={stats.roasteries} empty="아직 없다" />
            <Dist title="로스팅 레벨" rows={stats.roast_levels.map((r) => ({ name: r.level, n: r.n }))} />
            <Dist
              title="향미 노트"
              rows={stats.top_notes.map((r) => ({ name: r.note, n: r.n }))}
              empty="아직 없다"
            />
            <Dist
              title="계정당 원두"
              rows={stats.beans_per_account.map((r) => ({ name: `${r.bucket}개`, n: r.n }))}
            />
          </div>
        </section>
      )}

      <section className="card">
        <h2>
          향미 승격 후보 <span className="h2-aux">어휘에 없는데 등록된 노트 — 승격은 PR로</span>
        </h2>
        {candidates ? (
          candidates.length ? (
            <>
              <ul className="tags">
                {candidates.map((c) => (
                  <li key={c.note} title={`${c.count}건 · ${c.users}명`}>
                    {c.note}
                    <b>{c.count}</b>
                  </li>
                ))}
              </ul>
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
                숫자는 건수. 오타 후보(Bergamott)는 승격이 아니라 입력 시점 교정으로 볼 것. 승격하려면{" "}
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
