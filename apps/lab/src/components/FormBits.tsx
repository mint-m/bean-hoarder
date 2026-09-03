// 폼 공용 부품 — 필드 래퍼와 추천 칩, 날짜 스테퍼.
// 검증 스텝(ReviewStepper)이 필드마다 같은 결(라벨·필수·AI 채움 표시·추천 칩)을 반복하므로
// 그 반복을 여기 한 곳에 두고, 스텝 쪽은 "무엇을 묻는가"만 적게 한다.
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { isoOffset, shiftIso } from "../lib/format";
import { type ChipOption, fitChipCount, optionLabel, optionValue, visibleChips } from "../lib/suggest";

export function Field({
  label,
  required,
  aux,
  fromAi,
  invalid,
  plain,
  children,
}: {
  label: string;
  required?: boolean;
  aux?: string;
  /** AI가 채운 값 — 사용자가 눈으로 확인해야 하는 자리라는 표시 */
  fromAi?: boolean;
  /** 확인을 시도했는데 비어 있는 필수 칸 — 어디를 채워야 하는지 가리킨다 */
  invalid?: boolean;
  /**
   * label 래핑을 끈다 — 입력 칸 하나가 아니라 **여러 컨트롤이 든 위젯**을 감쌀 때.
   *
   * 암묵적 label은 클릭을 "첫 번째 labelable 자손"으로 넘기는데, 그 목록에는 button도 들어간다.
   * 향미 피커에서 실제로 이걸로 깨졌다 — 고른 노트의 × 버튼이 입력 칸보다 앞에 있어서, 필드 라벨
   * 글씨든 빈 자리든 아무 데나 누르면 첫 번째 노트가 지워졌다. 그럴 때는 div로 감싸고 위젯이
   * 자기 aria-label을 들게 한다.
   */
  plain?: boolean;
  children: ReactNode;
}) {
  // 입력을 label로 감싼다(암묵적 연결) — 라벨 클릭이 곧 포커스가 되고 id를 짜낼 필요가 없다.
  const Tag = plain ? "div" : "label";
  return (
    <Tag className={`field${invalid ? " invalid" : ""}`}>
      <span className="field-head">
        <span className="field-name">
          {label}
          {required && <span className="req">*</span>}
        </span>
        {fromAi && <span className="ai-tag">AI 채움 — 확인</span>}
        {aux && <span className="label-aux">{aux}</span>}
      </span>
      {children}
    </Tag>
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
  pin,
  renderChip,
}: {
  options: readonly ChipOption[];
  /** 현재 값 — 일치하는 칩을 선택 상태로 보인다 */
  value?: string;
  onPick: (value: string) => void;
  ariaLabel: string;
  /** 접었을 때 보일 칩의 **총량**. 없으면 전부 보인다 */
  limit?: number;
  /**
   * 순서상 뒤에 있어도 항상 보여야 하는 값 — limit 안에서 자리를 먼저 가져간다.
   *
   * 블렌드가 세 목록 모두 맨 끝이라 펼치기를 눌러야 나왔는데, 그건 자주 쓰는 값을 앞에 두려는
   * `limit`의 취지와는 다른 문제다 — 블렌드는 드물어서 뒤에 있는 게 아니라 **국가와 종류가
   * 다른 갈림길**이라 뒤에 있다. 순서는 그대로 두고 노출만 고정한다.
   */
  pin?: string;
  /** 칩 내용 커스터마이즈 (로스팅 레벨의 색 스와치처럼) — 없으면 라벨 텍스트만 */
  renderChip?: (o: ChipOption) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const rowRef = useRef<HTMLFieldSetElement>(null);

  /**
   * 칩 폭 캐시 — 값 → px.
   *
   * 폭은 **검색어와 무관**하다. 타이핑이 바꾸는 것은 순서와 부분집합뿐이라, 한 번 재 두면 그다음은
   * 계산만으로 끝난다. 이게 중요한 이유: 재려면 후보를 전부 그려야 하는데(display:none인 칩은 폭이
   * 0이다) 산지 줄은 그 순간 29px에서 236px로 부푼다. 글자를 칠 때마다 그러면 문서 높이가 출렁여,
   * 브라우저가 포커스된 칸을 따라다니며 스크롤을 다시 잡는다. 그래서 재는 것은 마운트 때 한 번이다.
   */
  const widths = useRef(new Map<string, number>());
  const layout = useRef({ gap: 0, moreWidth: 0, rowWidth: 0 });
  const [learned, setLearned] = useState(0); // 새로 안 폭이 생기면 올려서 다시 계산하게 한다

  const known = !!layout.current.rowWidth && options.every((o) => widths.current.has(optionValue(o)));
  // 아직 못 잰 폭이 있으면 후보를 전부 그린다 — 그림만 감추고 자리는 그대로 둔다.
  const measuring = !!limit && !expanded && !known;
  const fit = measuring
    ? undefined
    : fitChipCount(options, (o) => widths.current.get(optionValue(o)) ?? 0, layout.current, {
        limit,
        pin,
        value,
      });
  const { shown, hiddenCount } = visibleChips(options, {
    limit: measuring ? undefined : (fit ?? limit),
    pin,
    value,
    expanded,
  });

  // 그려진 칩의 폭을 캐시에 담는다. 페인트 전에 끝내야 부푼 줄이 보이지 않으므로 useLayoutEffect다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: 렌더마다 DOM을 읽어야 해 의존성이 없다
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    let changed = false;
    for (const el of row.querySelectorAll<HTMLElement>("[data-chip]")) {
      const w = el.offsetWidth;
      const key = el.dataset.chip as string;
      if (w && widths.current.get(key) !== w) {
        widths.current.set(key, w);
        changed = true;
      }
    }
    const l = layout.current;
    const more = row.querySelector<HTMLElement>(".chip-more");
    const next = {
      gap: Number.parseFloat(getComputedStyle(row).columnGap) || 0,
      moreWidth: more?.offsetWidth || l.moreWidth,
      rowWidth: row.clientWidth,
    };
    if (next.gap !== l.gap || next.moreWidth !== l.moreWidth || next.rowWidth !== l.rowWidth) {
      layout.current = next;
      changed = true;
    }
    if (changed) setLearned((n) => n + 1);
  });

  // 회전·창 크기로 줄 폭이 바뀌면 들어가는 개수도 달라진다. **폭만 본다** — 높이에도 반응하면
  // 다 재고 칩이 줄어든 것 자체가 다시 "재라"는 신호가 되어 재기와 접기를 번갈아 반복한다.
  useEffect(() => {
    const row = rowRef.current;
    if (!row || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (row.clientWidth === layout.current.rowWidth) return;
      layout.current = { ...layout.current, rowWidth: row.clientWidth };
      setLearned((n) => n + 1);
    });
    ro.observe(row);
    return () => ro.disconnect();
  }, []);
  void learned; // 다시 계산시키기 위한 상태 — 값 자체는 쓰지 않는다

  return (
    // 관련 컨트롤 묶음이라 fieldset — role="group"을 흉내내는 대신 시맨틱 요소를 쓴다
    <fieldset
      ref={rowRef}
      className="chips-row"
      aria-label={ariaLabel}
      // 재는 동안 후보가 전부 보이면 한 줄이 잠깐 부풀어 보인다 — 자리는 지키고 그림만 감춘다
      style={measuring ? { visibility: "hidden" } : undefined}
    >
      {shown.map((o) => {
        const val = optionValue(o);
        return (
          <button
            key={optionLabel(o)}
            type="button"
            data-chip={val}
            className={`chip${value?.trim() === val ? " on" : ""}`}
            onClick={() => onPick(val)}
          >
            {renderChip ? renderChip(o) : optionLabel(o)}
          </button>
        );
      })}
      {(hiddenCount > 0 || measuring) && (
        <button
          type="button"
          className="chip chip-more"
          aria-expanded={expanded}
          // 화면에는 "+16"만 — 이 줄에서 가장 아까운 것이 폭이고, 기호만으로도 뜻이 통한다.
          // 뜻은 aria-label이 온전히 진다.
          aria-label={expanded ? "선택지 접기" : `선택지 ${hiddenCount}개 더 보기`}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "접기" : `+${hiddenCount}`}
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
