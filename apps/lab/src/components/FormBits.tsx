// 폼 공용 부품 — 필드 래퍼와 추천 칩, 날짜 스테퍼.
// 검증 스텝(ReviewStepper)이 필드마다 같은 결(라벨·필수·AI 채움 표시·추천 칩)을 반복하므로
// 그 반복을 여기 한 곳에 두고, 스텝 쪽은 "무엇을 묻는가"만 적게 한다.
import { type ReactNode, useEffect, useRef, useState } from "react";
import { isoOffset, shiftIso } from "../lib/format";

export function Field({
  label,
  required,
  aux,
  fromAi,
  invalid,
  children,
}: {
  label: string;
  required?: boolean;
  aux?: string;
  /** AI가 채운 값 — 사용자가 눈으로 확인해야 하는 자리라는 표시 */
  fromAi?: boolean;
  /** 확인을 시도했는데 비어 있는 필수 칸 — 어디를 채워야 하는지 가리킨다 */
  invalid?: boolean;
  children: ReactNode;
}) {
  return (
    // 입력을 label로 감싼다(암묵적 연결) — 라벨 클릭이 곧 포커스가 되고 id를 짜낼 필요가 없다.
    <label className={`field${invalid ? " invalid" : ""}`}>
      <span className="field-head">
        <span className="field-name">
          {label}
          {required && <span className="req">*</span>}
        </span>
        {fromAi && <span className="ai-tag">AI 채움 — 확인</span>}
        {aux && <span className="label-aux">{aux}</span>}
      </span>
      {children}
    </label>
  );
}

/**
 * 복사 버튼 — 결과를 버튼 자신이 말한다.
 *
 * 복사 결과를 멀리 떨어진 상태줄에만 띄우면 성공했는지 알기 어려워 사용자가 같은 버튼을 여러 번
 * 누르게 된다. 그래서 누른 자리에서 라벨이 바뀌고(1.5초) 원래대로 돌아온다.
 */
export function CopyButton({
  label,
  onCopy,
  className,
  disabled,
}: {
  label: string;
  /** 복사 수행 — true면 성공. 폴백(다운로드 등) 안내는 호출부의 상태줄이 맡는다 */
  onCopy: () => Promise<boolean>;
  className?: string;
  disabled?: boolean;
}) {
  const [feedback, setFeedback] = useState<"ok" | "fail" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 사라진 컴포넌트에 setState 하지 않도록 — 연타 중 언마운트되면 타이머가 남는다
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function run() {
    const ok = await onCopy();
    setFeedback(ok ? "ok" : "fail");
    if (timer.current) clearTimeout(timer.current); // 연타 시 이전 타이머를 버리고 다시 1.5초
    timer.current = setTimeout(() => setFeedback(null), 1500);
  }

  return (
    <button
      type="button"
      className={`copy-btn${feedback ? ` copied ${feedback}` : ""}${className ? ` ${className}` : ""}`}
      disabled={disabled}
      onClick={run}
    >
      {/* 시각 변화만으로 끝내지 않는다 — 스크린리더에도 결과를 알린다 */}
      <span aria-live="polite">
        {feedback === "ok" ? "✓ 복사완료" : feedback === "fail" ? "복사 실패" : label}
      </span>
    </button>
  );
}

/**
 * 추천 칩 — 한 번 눌러 값을 넣는다. 자유 입력을 막지 않는 보조 수단이라
 * 같은 필드에 datalist를 함께 달아 두는 것을 전제로 한다.
 */
export function SuggestChips({
  options,
  value,
  onPick,
  ariaLabel,
  limit,
}: {
  /** 문자열이면 값=표시, 객체면 표시와 값을 따로 (날짜처럼 "오늘 → 2026-08-17") */
  options: readonly (string | { label: string; value: string })[];
  /** 현재 값 — 일치하는 칩을 선택 상태로 보인다 */
  value?: string;
  onPick: (value: string) => void;
  ariaLabel: string;
  /** 처음에 보여줄 개수 — 나머지는 "+" 버튼으로 편다. 없으면 전부 보인다 */
  limit?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  // 자주 쓰는 것만 먼저 보인다 — 선택지를 다 펼쳐 두면 고르는 일 자체가 일이 된다.
  // 단, 현재 값이 뒤쪽 칩이면 접힌 채로도 선택 상태가 보이도록 함께 끌어올린다.
  const shown =
    limit && !expanded
      ? options.filter((o, i) => {
          if (i < limit) return true;
          const val = typeof o === "string" ? o : o.value;
          return value?.trim() === val;
        })
      : options;
  const hidden = options.length - shown.length;

  return (
    // 관련 컨트롤 묶음이라 fieldset — role="group"을 흉내내는 대신 시맨틱 요소를 쓴다
    <fieldset className="chips-row" aria-label={ariaLabel}>
      {shown.map((o) => {
        const label = typeof o === "string" ? o : o.label;
        const val = typeof o === "string" ? o : o.value;
        return (
          <button
            key={label}
            type="button"
            className={`chip${value?.trim() === val ? " on" : ""}`}
            onClick={() => onPick(val)}
          >
            {label}
          </button>
        );
      })}
      {hidden > 0 && (
        <button type="button" className="chip chip-more" onClick={() => setExpanded(true)}>
          + {hidden}개 더
        </button>
      )}
    </fieldset>
  );
}

/**
 * 날짜를 "며칠 전"으로 세는 입력 — 누를 때마다 그만큼 더 거슬러 올라간다(계산기처럼 누적).
 *
 * 로스팅일은 봉지를 보고 "한 달쯤 됐고 거기서 며칠 더"처럼 떠올리는 값이라, 절대 날짜 칩
 * (오늘·3일 전…)으로는 한 번에 못 맞히고 결국 달력을 연다. 빼기를 겹쳐 누르면 달력 없이 닿는다.
 *
 * 버튼 라벨은 **얼마씩 움직일지**만 말한다. 눌린 횟수를 라벨에 담으면(1일 전 → 2일 전 …) 상태가
 * 버튼 셋에 흩어져, `1일 전 ×7`과 `일주일 전 ×1`이 같은 날짜인데 다르게 보인다. 게다가 AI가
 * 채웠을 때·날짜 칸을 직접 고쳤을 때 그 표시가 실제와 어긋난다. 상태는 날짜 하나뿐이므로
 * 지금 어디인지는 필드 옆 라벨(로스팅 34일 전 · 07.26)이 혼자 말한다.
 *
 * 되돌리기는 직전 한 번을 취소한다 — 연타 중 잘못 눌렀을 때 대가가 "처음부터 다시"가 되지 않게.
 */
export function DateStepper({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (iso: string) => void;
  ariaLabel: string;
}) {
  // 직전 값 하나만 기억한다. 여러 단계 실행취소는 이 자리에 과한 장치다 — 지나쳤으면 "오늘"로
  // 초기화하고 다시 세는 길이 이미 있다.
  const [prev, setPrev] = useState<string | null>(null);
  const step = (next: string) => {
    setPrev(value);
    onChange(next);
  };
  const back = (opts: { days?: number; months?: number }) => () => step(shiftIso(value, opts));
  return (
    <fieldset className="chips-row" aria-label={ariaLabel}>
      <button type="button" className="chip" onClick={() => step(isoOffset(0))}>
        오늘
      </button>
      <button type="button" className="chip" onClick={back({ days: -1 })}>
        1일 전
      </button>
      <button type="button" className="chip" onClick={back({ days: -7 })}>
        일주일 전
      </button>
      <button type="button" className="chip" onClick={back({ months: -1 })}>
        한 달 전
      </button>
      <button
        type="button"
        className="chip chip-undo"
        aria-label="직전 선택 되돌리기"
        disabled={prev === null}
        onClick={() => {
          if (prev === null) return;
          onChange(prev);
          setPrev(null);
        }}
      >
        ↺
      </button>
    </fieldset>
  );
}
