// 인테이크 — 등록 동선의 출발점. 붙여넣기 한 번으로 초안을 만들고 검증(ReviewStepper)으로 넘긴다.
//
// 입력 칸은 **하나**다. 링크를 넣으면 그 페이지를 대신 가져와 읽고, 페이지 내용을 그대로 붙여넣으면
// 그 텍스트를 읽는다 — 사용자 입장에서 둘 다 "원두 정보가 있는 것을 붙여넣는" 같은 행동이라
// 칸을 나눌 이유가 없다. (예전엔 링크 칸과 텍스트 칸이 따로 있었고, 텍스트 칸은 링크가 막혔을 때만
// 쓰는 우회로라 평소엔 무엇에 쓰는 물건인지 알기 어려웠다.)
import { useState } from "react";
import type { ApiResult } from "../lib/api";
import type { StatusLine } from "../types";

interface Props {
  autofillText: string;
  setAutofillText: (v: string) => void;
  status: StatusLine;
  setStatus: (s: StatusLine) => void;
  call: <T = Record<string, unknown>>(path: string, opts?: RequestInit) => Promise<ApiResult<T>>;
  recognizeText: (raw: string) => Promise<boolean>;
  sourceUrl: string;
  setSourceUrl: (v: string) => void;
  /** 같은 상품 페이지로 이미 등록된 원두의 KEY — 가져오기 전에 확인해 헛일을 막는다 */
  findByUrl: (url: string) => string | null;
  /** 검증 단계로 넘어갔는지 — true면 이 카드는 접힌 요약으로 물러난다 */
  started: boolean;
  onStart: () => void;
  /** 접힌 요약에서 다시 인테이크로 돌아간다 */
  onReopen: () => void;
  /** AI가 채운 항목 수 — 접힌 요약에 쓴다 */
  filledCount: number;
  /** 규칙 기반 인식이 부실했다 — 지금이 AI 키를 권할 유일하게 적절한 순간 */
  aiNudge: boolean;
  /** 서비스 키로 남은 AI 인식 횟수 (얼마 안 남았을 때만 값이 온다. 0 = 소진) */
  aiQuotaLeft: number | null;
  /** AI 대행이 응답하지 못했다 — 한도 소진과는 다른 이유이므로 다른 문구를 쓴다 */
  aiServiceDown: boolean;
  onOpenSettings: () => void;
}

/** 한 줄짜리 http(s) 주소면 링크로 본다. 여러 줄이면 붙여넣은 본문이다. */
function asUrl(raw: string): string | null {
  const s = raw.trim();
  if (/\s/.test(s)) return null;
  return /^https?:\/\/\S+$/i.test(s) ? s : null;
}

export default function IntakeCard(p: Props) {
  const [busy, setBusy] = useState(false);

  async function run() {
    const raw = p.autofillText.trim();
    if (!raw) {
      p.setStatus({ msg: "상품 페이지 링크나 페이지 내용을 붙여넣어 주세요.", cls: "error" });
      return;
    }
    const url = asUrl(raw);

    if (url) {
      // 같은 페이지로 이미 등록했는지 **가져오기 전에** 본다 — 중복이면 페이지 fetch도 AI 호출도 헛일이다
      const dupKey = p.findByUrl(url);
      if (
        dupKey &&
        !confirm(
          `이 상품 페이지로 이미 등록한 원두가 있습니다 — ${dupKey}\n\n` +
            `다른 로스팅 배치를 새로 등록하는 경우라면 그대로 진행하세요. 계속할까요?`,
        )
      ) {
        p.setStatus({ msg: `가져오기를 멈췄습니다 — 기존 ${dupKey}를 목록에서 확인해 보세요.`, cls: "" });
        return;
      }

      setBusy(true);
      p.setStatus({ msg: "페이지를 가져오는 중…", cls: "" });
      const { body } = await p.call<{ kind: string; text: string }>("/api/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!body?.ok || body.kind !== "text") {
        setBusy(false);
        p.setStatus({
          msg: `${body?.error || "이 사이트는 내용을 가져올 수 없습니다."} 페이지 내용을 붙여넣어 보세요.`,
          cls: "error",
        });
        return;
      }
      p.setAutofillText(body.text); // 가져온 본문을 칸에 남겨 둔다 — 실패 시 사용자가 직접 다듬을 수 있게
      if (!p.sourceUrl.trim()) p.setSourceUrl(url);
      const filled = await p.recognizeText(body.text);
      setBusy(false);
      if (filled) p.onStart();
      return;
    }

    // 링크가 아니면 붙여넣은 본문 그대로 읽는다
    setBusy(true);
    const filled = await p.recognizeText(raw);
    setBusy(false);
    if (filled) p.onStart();
  }

  // AI 키 권유 — 규칙 기반이 부실했던 그 순간에만, 한 번의 클릭으로 끝나게.
  // 평소에 띄우면 소음이고, 여기서 안 띄우면 사용자는 AI가 있는 줄도 모른다.
  //  · 할당량이 바닥나 갈 때: 곧 규칙 기반으로 내려간다는 예고
  //  · 규칙 기반이 부실했을 때: 본인 키를 넣으면 제한 없이 AI를 쓸 수 있다는 안내
  const quotaMsg =
    p.aiQuotaLeft === null
      ? null
      : p.aiQuotaLeft === 0
        ? "오늘 무료 AI 인식을 다 썼습니다 — 지금은 간단한 규칙으로 채웁니다."
        : `무료 AI 인식이 오늘 ${p.aiQuotaLeft}번 남았습니다.`;
  // 우선순위: 한도(내 몫을 다 씀) > 대행 장애(우리 쪽 사정) > 키 권유(규칙 기반이 부실했음).
  // 앞의 둘은 "왜 AI가 안 붙었는지"에 대한 답이라, 뒤의 일반 권유보다 먼저 말해야 한다.
  const msg =
    quotaMsg ??
    (p.aiServiceDown
      ? "AI 인식이 지금 응답하지 않아 간단한 규칙으로 채웠습니다."
      : p.aiNudge
        ? "본인 Google AI 키(무료 발급)를 넣으면 훨씬 많이 채워집니다."
        : null);
  const nudge = msg ? (
    <p className="ai-nudge">
      <span className="ai-nudge-msg">{msg}</span>
      <button type="button" onClick={p.onOpenSettings}>
        내 키 넣기 →
      </button>
    </p>
  ) : null;

  // ── 검증 단계로 넘어간 뒤: 접힌 한 줄로 물러난다 ──
  if (p.started) {
    return (
      <>
        <div className="intake-done">
          <span className="intake-done-msg">
            {p.filledCount > 0
              ? `${p.filledCount}개 항목을 채웠습니다 — 아래에서 순서대로 확인하세요`
              : "직접 입력 중 — 아래에서 순서대로 채워 주세요"}
          </span>
          <button type="button" onClick={p.onReopen} className="intake-reopen">
            다시 가져오기
          </button>
        </div>
        {nudge}
      </>
    );
  }

  return (
    <div className="card intake">
      <h1 className="intake-title">원두 등록</h1>
      <p className="intake-lede">붙여넣으면 채워 드립니다. 그다음은 순서대로 확인만 하면 됩니다.</p>

      <textarea
        className="intake-input"
        placeholder={"https://roastery.com/products/…  또는 원두 정보 전체"}
        value={p.autofillText}
        onChange={(e) => p.setAutofillText(e.target.value)}
        onKeyDown={(e) => {
          // 링크 한 줄만 넣는 흔한 경우를 위해 Enter로 바로 실행 (줄바꿈이 필요하면 Shift+Enter)
          if (e.key === "Enter" && !e.shiftKey && asUrl(p.autofillText)) {
            e.preventDefault();
            run();
          }
        }}
      />

      <div className="intake-act">
        <button type="button" className="primary" onClick={run} disabled={busy}>
          {busy ? "읽는 중…" : "채우기"}
        </button>
        <button type="button" className="intake-manual" onClick={p.onStart}>
          직접 입력으로 시작하기 →
        </button>
      </div>
      <div className={`status-line intake-status ${p.status.cls}`}>{p.status.msg}</div>
      {nudge}
    </div>
  );
}
