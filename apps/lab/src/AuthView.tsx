// 인증 화면 — 로그인 / 가입 / 계정 복구 + 복구키 1회 표시 모달.
import { useState } from "react";
import { copyText, download } from "./lib/format";
import { type Account, saveSession } from "./lib/session";

type Tab = "login" | "signup" | "recover";

interface AuthResponse {
  ok?: boolean;
  error?: string;
  usercode?: string;
  token?: string;
  recovery_key?: string;
}

async function postJson(path: string, body: unknown): Promise<AuthResponse | null> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await res.json().catch(() => null)) as AuthResponse | null;
  } catch (_e) {
    return { ok: false, error: "네트워크 연결 오류가 발생했습니다. 인터넷 연결을 확인해 주세요." };
  }
}

function RecoveryModal({
  usercode,
  recoveryKey,
  onDone,
}: {
  usercode: string;
  recoveryKey: string;
  onDone: () => void;
}) {
  const [acked, setAcked] = useState(false);
  const [copyMsg, setCopyMsg] = useState("");
  return (
    <div className="modal-overlay" id="recovery-box">
      <div className="recovery-card">
        <p>
          <b>오프라인 복구키</b> — 지금 이 순간만 표시됩니다. 유저코드나 암호를 잊어도 이 키만 있으면 계정을
          되찾을 수 있습니다. 클립보드에 자동으로 복사해두었어요.
        </p>
        <div className="recovery-key">{recoveryKey}</div>
        <div className="btnrow">
          <button
            type="button"
            onClick={async () => {
              const ok = await copyText(recoveryKey);
              setCopyMsg(ok ? "복구키가 복사되었습니다." : "복사 실패 — 직접 선택해 복사하세요.");
            }}
          >
            다시 복사
          </button>
          <button
            type="button"
            onClick={() => {
              const text =
                `Bean-Hoarder 복구 정보\n유저코드: ${usercode}\n복구키: ${recoveryKey}\n\n` +
                "이 파일은 안전한 곳에 오프라인으로(인쇄물, USB 등) 보관하세요.\n분실 시 계정을 복구할 수 없습니다.\n";
              download(
                `beanhoarder_recovery_${usercode}.txt`,
                new Blob([text], { type: "text/plain;charset=utf-8" }),
              );
            }}
          >
            텍스트 파일로 저장
          </button>
        </div>
        {copyMsg && <p className="hint">{copyMsg}</p>}
        <label className="recovery-ack">
          <input type="checkbox" checked={acked} onChange={(e) => setAcked(e.target.checked)} />
          복구키를 안전한 곳에 저장했습니다 (이 창은 다시 표시되지 않습니다)
        </label>
        <div className="btnrow">
          <button type="button" className="primary" disabled={!acked} onClick={onDone}>
            계속하기
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AuthView({ onSignedIn }: { onSignedIn: (account: Account) => void }) {
  const [tab, setTab] = useState<Tab>("login");
  const [status, setStatus] = useState<{ msg: string; ok: boolean }>({ msg: "", ok: true });
  const [fields, setFields] = useState({ usercode: "", pin: "", invite: "", recovery: "" });
  const [pending, setPending] = useState<{ account: Account; recoveryKey: string } | null>(null);

  const set = (k: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields((f) => ({ ...f, [k]: e.target.value }));

  function finish(body: AuthResponse, withRecovery: boolean) {
    if (!body.usercode || !body.token) return;
    const account = { usercode: body.usercode, token: body.token };
    saveSession(account.usercode, account.token);
    if (withRecovery && body.recovery_key) {
      copyText(body.recovery_key); // 가입/복구 시점에 클립보드 저장 유도 (실패해도 무시)
      setPending({ account, recoveryKey: body.recovery_key });
    } else {
      onSignedIn(account);
    }
  }

  async function login() {
    const uc = fields.usercode.trim().toUpperCase();
    const pin = fields.pin.trim();
    if (!/^[A-Z0-9]{4}$/.test(uc) || !/^\d{4}$/.test(pin)) {
      setStatus({ msg: "유저코드 4자리와 숫자 암호 4자리를 입력하세요.", ok: false });
      return;
    }
    const body = await postJson("/api/login", { usercode: uc, password: pin });
    if (body?.ok && body.token) finish(body, false);
    else setStatus({ msg: body?.error || "유저코드 또는 암호가 올바르지 않습니다.", ok: false });
  }

  async function signup() {
    const invite = fields.invite.trim();
    const pin = fields.pin.trim();
    if (!invite) {
      setStatus({ msg: "초대코드를 입력하세요.", ok: false });
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      setStatus({ msg: "암호는 숫자 4자리여야 합니다.", ok: false });
      return;
    }
    const body = await postJson("/api/signup", { invite, password: pin });
    if (body?.ok) finish(body, true);
    else setStatus({ msg: body?.error || "가입 실패", ok: false });
  }

  async function recover() {
    const key = fields.recovery.trim();
    const pin = fields.pin.trim();
    if (!key) {
      setStatus({ msg: "복구키를 입력하세요.", ok: false });
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      setStatus({ msg: "새 암호는 숫자 4자리여야 합니다.", ok: false });
      return;
    }
    const body = await postJson("/api/recover", { recovery_key: key, password: pin });
    if (body?.ok) finish(body, true);
    else setStatus({ msg: body?.error || "복구 실패", ok: false });
  }

  if (pending) {
    return (
      <RecoveryModal
        usercode={pending.account.usercode}
        recoveryKey={pending.recoveryKey}
        onDone={() => onSignedIn(pending.account)}
      />
    );
  }

  return (
    <div>
      <div className="auth-hero">
        <svg className="beanmark" viewBox="0 0 48 48" aria-hidden="true">
          <ellipse
            cx="24"
            cy="24"
            rx="14"
            ry="19"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            transform="rotate(20 24 24)"
          />
          <path
            d="M18 8C28 18 20 30 30 40"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            transform="rotate(20 24 24)"
          />
        </svg>
        <h1>랩 (LAB)</h1>
        <p>
          원두를 등록하고 QR 라벨을 만드는 공간입니다.
          <br />
          QR 스캔 조회는 로그인 없이 누구나 가능합니다.
        </p>
      </div>
      <div className="card">
        <div className="tabs" id="auth-tabs">
          {(
            [
              ["login", "로그인"],
              ["signup", "가입"],
              ["recover", "계정 복구"],
            ] as [Tab, string][]
          ).map(([t, label]) => (
            <button
              key={t}
              type="button"
              className={tab === t ? "active" : ""}
              onClick={() => {
                setTab(t);
                setStatus({ msg: "", ok: true });
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "login" && (
          <div>
            <div className="row2">
              <div className="field">
                <label>유저코드</label>
                <input
                  type="text"
                  maxLength={4}
                  placeholder="ABCD"
                  autoComplete="off"
                  value={fields.usercode}
                  onChange={set("usercode")}
                />
              </div>
              <div className="field">
                <label>암호 (숫자 4자리)</label>
                <input
                  type="password"
                  maxLength={4}
                  inputMode="numeric"
                  placeholder="0000"
                  value={fields.pin}
                  onChange={set("pin")}
                />
              </div>
            </div>
            <div className="btnrow">
              <button type="button" className="primary" onClick={login}>
                이 브라우저에 로그인
              </button>
            </div>
          </div>
        )}

        {tab === "signup" && (
          <div>
            <div className="row2">
              <div className="field">
                <label>초대코드</label>
                <input
                  type="password"
                  placeholder="운영자에게 받은 코드"
                  value={fields.invite}
                  onChange={set("invite")}
                />
              </div>
              <div className="field">
                <label>사용할 암호 (숫자 4자리)</label>
                <input
                  type="password"
                  maxLength={4}
                  inputMode="numeric"
                  placeholder="0000"
                  value={fields.pin}
                  onChange={set("pin")}
                />
              </div>
            </div>
            <div className="btnrow">
              <button type="button" className="primary" onClick={signup}>
                가입 — 유저코드 발급
              </button>
            </div>
            <p className="hint">
              가입 직후 표시되는 <b>복구키가 계정을 되찾을 수 있는 유일한 수단</b>이니 오프라인에 꼭
              보관하세요.
            </p>
          </div>
        )}

        {tab === "recover" && (
          <div>
            <p className="hint" style={{ margin: "0 0 10px" }}>
              가입 시 저장해둔 복구키로 새 암호를 설정하세요. 성공하면 복구키가 새로 발급됩니다.
            </p>
            <div className="row2">
              <div className="field">
                <label>복구키</label>
                <input
                  type="text"
                  placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
                  autoComplete="off"
                  value={fields.recovery}
                  onChange={set("recovery")}
                />
              </div>
              <div className="field">
                <label>새 암호 (숫자 4자리)</label>
                <input
                  type="password"
                  maxLength={4}
                  inputMode="numeric"
                  placeholder="0000"
                  value={fields.pin}
                  onChange={set("pin")}
                />
              </div>
            </div>
            <div className="btnrow">
              <button type="button" className="primary" onClick={recover}>
                복구키로 재설정
              </button>
            </div>
          </div>
        )}

        <div className={`status-line ${status.ok ? "ok" : "error"}`}>{status.msg}</div>
      </div>
    </div>
  );
}
