// 설정 — 당장 쓰지 않지만 어딘가엔 있어야 하는 것들을 치워 두는 곳.
//
// AI 키와 테마는 등록 동선에 필요 없다. 그런데 입력 화면에 늘 펼쳐 두면 시각적 소음이 되고
// "지금 뭘 해야 하는지"를 흐린다. 그래서 우측 상단의 작은 버튼 뒤로 숨긴다 — 필요한 사람만 연다.
import { useEffect, useRef, useState } from "react";

const THEME_KEY = "bh_theme";
const GEMINI_KEY = "bh_gemini_key";

/** 저장된 테마를 문서에 적용 (첫 페인트는 각 HTML의 인라인 스크립트가 이미 처리했다) */
function applyTheme(dark: boolean) {
  const root = document.documentElement;
  if (dark) root.dataset.theme = "dark";
  else delete root.dataset.theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#0a0a0b" : "#f4f4f5");
  try {
    if (dark) localStorage.setItem(THEME_KEY, "dark");
    else localStorage.removeItem(THEME_KEY);
  } catch (_e) {
    /* 사생활 보호 모드 등 — 이번 세션만 적용되고 끝난다 */
  }
}

export default function SettingsMenu({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === "dark");
  const [key, setKey] = useState(() => localStorage.getItem(GEMINI_KEY) || "");
  const wrapRef = useRef<HTMLDivElement>(null);
  const keyRef = useRef<HTMLInputElement>(null);

  // 열자마자 키 칸에 커서를 둔다 — 이 서랍을 여는 이유는 대개 키를 넣기 위해서다
  useEffect(() => {
    if (open) keyRef.current?.focus();
  }, [open]);

  // 바깥을 누르거나 Esc를 누르면 닫힌다 — 팝오버의 기본 기대치
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
    // setOpen은 App의 useState setter라 신원이 고정돼 있다 — 의존성에 넣어도 재등록되지 않는다
  }, [open, setOpen]);

  return (
    <div className="settings" ref={wrapRef}>
      <button
        type="button"
        className="settings-btn"
        aria-label="설정"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {open && (
        <div className="settings-pop" role="dialog" aria-label="설정">
          <div className="settings-row">
            <span className="settings-label">테마</span>
            <div className="seg">
              <button
                type="button"
                className={!dark ? "on" : ""}
                onClick={() => {
                  setDark(false);
                  applyTheme(false);
                }}
              >
                라이트
              </button>
              <button
                type="button"
                className={dark ? "on" : ""}
                onClick={() => {
                  setDark(true);
                  applyTheme(true);
                }}
              >
                다크
              </button>
            </div>
          </div>

          <div className="settings-block">
            <label className="field">
              <span className="field-head">
                <span className="field-name">AI 인식 키 (Google AI)</span>
              </span>
              <input
                ref={keyRef}
                type="password"
                placeholder="AIza…"
                autoComplete="off"
                value={key}
                onChange={(e) => {
                  setKey(e.target.value);
                  localStorage.setItem(GEMINI_KEY, e.target.value.trim());
                }}
              />
            </label>
            <p className="hint">
              키가 없어도 <b>하루 10번</b>은 AI로 채워 드립니다. 키를 넣으면 <b>제한 없이</b> 쓸 수 있고, 키는
              이 브라우저에만 저장돼 <b>내 키로 Google에 직접</b> 전송됩니다.{" "}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">
                무료 발급 ↗
              </a>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
