// 순차 검증 — AI가 채운 초안을 우선순위대로 하나씩 확인한다.
//
// 17칸을 한 화면에 늘어놓으면 "무엇부터"가 사라진다. 그래서 등록에 필요한 순서(필수 → 표현 → 상세)로
// 스텝을 쪼개고 한 번에 하나만 연다. 각 스텝은 건너뛸 수 있고(완결성보다 흐름이 우선), 최종 필수 검사는
// 등록 시점의 Workspace.save()가 그대로 맡는다 — 여기서 막지 않는다.

import { parseRoastLevel } from "@bnhd/schema/roast";
import { useEffect, useRef, useState } from "react";
import { isoToDot } from "../lib/format";
import {
  appendNote,
  BLEND_VALUE,
  blendCascade,
  CHIP_LIMIT,
  type ChipOption,
  HARVEST_OPTIONS,
  NOTE_OPTIONS,
  ORIGIN_OPTIONS,
  optionLabel,
  optionValue,
  PROCESS_OPTIONS,
  packageDateChips,
  ROASTPOINT_OPTIONS,
  VARIETY_OPTIONS,
  WEIGHT_OPTIONS,
} from "../lib/suggest";
import type { FormKey, FormState } from "../types";
import FlavorPicker from "./FlavorPicker";
import { DateStepper, Field, SuggestChips } from "./FormBits";

type StepId = "identity" | "spec" | "dates" | "flavor" | "pack" | "detail";

interface StepDef {
  id: StepId;
  title: string;
  /** 이 스텝이 다루는 필드 — 접힌 요약과 완료 판정에 쓴다 */
  keys: FormKey[];
  /** 등록에 반드시 필요한 필드 (Workspace.save()의 검사와 일치시킨다) */
  required: FormKey[];
}

const STEPS: StepDef[] = [
  {
    id: "identity",
    title: "로스터리 · 산지",
    keys: ["ROASTERY", "ORIGIN", "REGION"],
    required: ["ROASTERY", "ORIGIN"],
  },
  { id: "spec", title: "가공 · 품종", keys: ["PROCESS", "VARIETY"], required: ["PROCESS", "VARIETY"] },
  {
    id: "dates",
    title: "로스팅일 · 소분일",
    keys: ["ROAST_DATE", "PACKAGE_DATE"],
    required: ["ROAST_DATE", "PACKAGE_DATE"],
  },
  { id: "flavor", title: "플레이버 · 커피 이름", keys: ["TASTING_NOTE", "COFFEE_NAME"], required: [] },
  { id: "pack", title: "용량 · 로스팅 레벨", keys: ["NET_WEIGHT", "AGTRON"], required: [] },
  {
    id: "detail",
    title: "상세 (선택)",
    keys: ["ALTITUDE", "HARVEST", "PRODUCER", "LOT", "WASHING_STATION", "SOURCE_URL", "MEMO"],
    required: [],
  },
];

interface Props {
  form: FormState;
  updateField: (key: FormKey, value: string) => void;
  /** AI가 채운 필드 — "확인이 필요한 자리"로 표시하고, 사용자가 손대면 호출부가 지운다 */
  aiFilled: Set<FormKey>;
  roasteryOptions: string[];
  withLogo: Set<string>;
  onRoasteryBlur: () => void;
  /** 편집 진입처럼 이미 값이 다 있는 경우 — 전 스텝을 완료로 열어두고 필요한 것만 펴게 한다 */
  allDone?: boolean;
  /**
   * 등록이 필수 항목 때문에 막혔을 때 호출부가 보내는 신호 — 그 필드가 있는 스텝을 열고 데려간다.
   * `seq`는 같은 필드로 두 번 막혀도 다시 반응하게 하는 일련번호다(값이 같으면 effect가 안 돈다).
   */
  focusField?: { key: FormKey; seq: number };
}

/**
 * 로스팅 후 며칠 지났는지 — 조회 카드가 보여주는 경과일을 입력 시점에 미리 알려준다.
 *
 * 날짜 스테퍼(DateStepper)의 상태 표시를 겸한다. 버튼은 "얼마씩 움직일지"만 말하므로 **지금 어디인지는
 * 이 한 줄이 혼자 말해야 한다** — 그래서 D+N 대신 사람이 쓰는 말과 실제 날짜를 함께 보여준다.
 */
function roastAgeLabel(iso: string): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return undefined;
  const then = new Date(`${iso}T00:00:00`);
  const now = new Date();
  const days = Math.floor((now.setHours(0, 0, 0, 0) - then.getTime()) / 86_400_000);
  if (days < 0) return "아직 오지 않은 날짜";
  const when = days === 0 ? "오늘 로스팅" : `로스팅 ${days}일 전`;
  return `${when} · ${isoToDot(iso)}`;
}

/** 접힌 스텝의 한 줄 요약 — 값이 있는 것만, 날짜는 라벨과 같은 표기(26.08.19)로 */
function summarize(step: StepDef, form: FormState): string {
  const vals = step.keys
    .map((k) => {
      const v = (form[k] || "").trim();
      if (!v) return "";
      return k.endsWith("_DATE") ? isoToDot(v) : v;
    })
    .filter(Boolean);
  if (!vals.length) return "";
  return vals.length > 3 ? `${vals.slice(0, 3).join(" · ")} 외 ${vals.length - 3}` : vals.join(" · ");
}

export default function ReviewStepper(p: Props) {
  // 첫 스텝부터 연다 (편집 진입은 전부 완료 상태라 닫은 채로 시작)
  const [openId, setOpenId] = useState<StepId | null>(p.allDone ? null : (STEPS[0] as StepDef).id);
  const [done, setDone] = useState<Set<StepId>>(() => new Set(p.allDone ? STEPS.map((s) => s.id) : []));
  const [skipped, setSkipped] = useState<Set<StepId>>(new Set());
  // 확인을 시도한 스텝 — 여기서만 빈 필수 칸을 붉게 표시한다. 아직 손대지 않은 스텝까지 빨갛게
  // 물들이면 "훑어보는 중"인 화면이 처음부터 오류 화면처럼 보인다.
  const [attempted, setAttempted] = useState<Set<StepId>>(new Set());
  // 막힘 안내를 다시 흔들기 위한 일련번호 — 문단을 이 값으로 키잉해 다시 마운트한다.
  // (클래스만 다시 붙이면 CSS 애니메이션은 재생되지 않는다)
  const [blockedSeq, setBlockedSeq] = useState(0);
  const sections = useRef(new Map<StepId, HTMLElement | null>());

  // 등록이 막히면 호출부가 첫 미충족 필드를 보낸다 — 그 스텝을 열고 화면까지 데려간다.
  // 지금까지는 "필수 항목을 입력하세요: 품종, 소분일" 문구만 뜨고 그 칸을 사용자가 직접 찾아야 했다.
  const focusSeq = p.focusField?.seq;
  const focusKey = p.focusField?.key;
  useEffect(() => {
    if (!focusSeq || !focusKey) return;
    const step = STEPS.find((s) => s.keys.includes(focusKey));
    if (!step) return;
    setOpenId(step.id);
    setAttempted((a) => new Set(a).add(step.id));
    sections.current.get(step.id)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusSeq, focusKey]);

  const bind = (key: FormKey) => ({
    value: p.form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      p.updateField(key, e.target.value),
  });
  const ai = (key: FormKey) => p.aiFilled.has(key);
  const pick = (key: FormKey) => (v: string) => p.updateField(key, v);

  /**
   * 국가는 혼자 바뀌지 않는다 — 블렌드가 되고 풀리는 것을 가공·품종이 따라간다(blendCascade).
   * 칩과 직접 입력·datalist 선택이 모두 이 길을 타야 한다. datalist에서 고른 값도 onChange로 오므로
   * 값을 기준으로 판단하는 이 한 곳이 세 경로를 다 덮는다.
   */
  function setOrigin(next: string) {
    const patch = blendCascade(p.form.ORIGIN, next, p.form);
    p.updateField("ORIGIN", next);
    for (const [k, v] of Object.entries(patch)) p.updateField(k as FormKey, v);
  }

  /** 칩 풀을 그대로 datalist로 — 값과 표시가 다른 항목(블렌드)은 설명을 label로 붙인다 */
  const dlOptions = (opts: readonly ChipOption[]) =>
    opts.map((o) => {
      const v = optionValue(o);
      const l = optionLabel(o);
      return <option key={v} value={v} label={l === v ? undefined : l} />;
    });

  /** 다음으로 열 스텝 = 아직 확인하지 않은 가장 가까운 뒤 스텝. 없으면 모두 접는다. */
  function advance(from: StepId) {
    const i = STEPS.findIndex((s) => s.id === from);
    const next = STEPS.slice(i + 1).find((s) => !done.has(s.id));
    setOpenId(next ? next.id : null);
  }

  /** 이 스텝에서 아직 비어 있는 필수 칸 */
  function missingOf(step: StepDef): FormKey[] {
    return step.required.filter((k) => !(p.form[k] || "").trim());
  }

  function confirm(id: StepId) {
    const step = STEPS.find((s) => s.id === id) as StepDef;
    // "확인하고 다음"은 이 스텝을 봤다는 선언이므로, 필수가 빈 채로 완료가 되면 그 선언이 거짓이 된다.
    // 대신 헤더로 다른 스텝을 여는 길은 막지 않는다 — 뒤를 보고 앞을 정하는 것이 이 화면의 일이다.
    if (missingOf(step).length) {
      setAttempted((a) => new Set(a).add(id));
      setBlockedSeq((n) => n + 1);
      return;
    }
    setAttempted((a) => {
      const n = new Set(a);
      n.delete(id);
      return n;
    });
    setDone((d) => new Set(d).add(id));
    setSkipped((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
    advance(id);
  }

  function skip(id: StepId) {
    setSkipped((s) => new Set(s).add(id));
    setDone((d) => {
      const n = new Set(d);
      n.delete(id);
      return n;
    });
    advance(id);
  }

  function body(step: StepDef) {
    // 확인을 시도했는데 비어 있는 필수 칸만 붉게 — 값이 들어오는 순간 저절로 풀린다(파생 상태).
    const iv = (k: FormKey) =>
      attempted.has(step.id) && step.required.includes(k) && !(p.form[k] || "").trim();
    switch (step.id) {
      case "identity":
        return (
          <>
            <Field label="로스터리" required invalid={iv("ROASTERY")} fromAi={ai("ROASTERY")}>
              <input
                type="text"
                list="dl-roastery"
                placeholder="SEY"
                {...bind("ROASTERY")}
                onBlur={p.onRoasteryBlur}
              />
            </Field>
            {p.roasteryOptions.length > 0 && (
              <SuggestChips
                ariaLabel="로스터리 추천"
                options={p.roasteryOptions}
                limit={CHIP_LIMIT}
                value={p.form.ROASTERY}
                onPick={pick("ROASTERY")}
              />
            )}
            <Field
              label="국가(산지)"
              required
              aux="블렌드를 고르면 가공·품종도 함께 채워집니다"
              invalid={iv("ORIGIN")}
              fromAi={ai("ORIGIN")}
            >
              <input
                type="text"
                list="dl-origin"
                placeholder="ETHIOPIA"
                value={p.form.ORIGIN}
                onChange={(e) => setOrigin(e.target.value)}
              />
            </Field>
            <SuggestChips
              ariaLabel="산지 추천"
              options={ORIGIN_OPTIONS}
              limit={CHIP_LIMIT}
              pin={BLEND_VALUE}
              value={p.form.ORIGIN}
              onPick={setOrigin}
            />
            <Field label="세부 지역" fromAi={ai("REGION")}>
              <input type="text" placeholder="Yirgacheffe, Gedeb" {...bind("REGION")} />
            </Field>
          </>
        );

      case "spec":
        return (
          <>
            <Field label="가공방식" required invalid={iv("PROCESS")} fromAi={ai("PROCESS")}>
              <input type="text" list="dl-process" placeholder="Washed" {...bind("PROCESS")} />
            </Field>
            <SuggestChips
              ariaLabel="가공방식 추천"
              options={PROCESS_OPTIONS}
              limit={CHIP_LIMIT}
              pin={BLEND_VALUE}
              value={p.form.PROCESS}
              onPick={pick("PROCESS")}
            />
            <Field label="품종" required invalid={iv("VARIETY")} fromAi={ai("VARIETY")}>
              <input type="text" list="dl-variety" placeholder="SL9" {...bind("VARIETY")} />
            </Field>
            <SuggestChips
              ariaLabel="품종 추천"
              options={VARIETY_OPTIONS}
              limit={CHIP_LIMIT}
              pin={BLEND_VALUE}
              value={p.form.VARIETY}
              onPick={pick("VARIETY")}
            />
          </>
        );

      case "dates":
        return (
          <>
            <Field
              label="로스팅일"
              required
              invalid={iv("ROAST_DATE")}
              aux={roastAgeLabel(p.form.ROAST_DATE)}
              fromAi={ai("ROAST_DATE")}
            >
              <input type="date" {...bind("ROAST_DATE")} />
            </Field>
            {/* 로스팅일은 절대 날짜보다 "며칠 전"으로 떠올리는 값이라 빼기 버튼을 겹쳐 누르게 한다.
                위의 aux 라벨(D+N)이 누를 때마다 갱신돼 지금 어디까지 왔는지 보여준다. */}
            <DateStepper ariaLabel="로스팅일 계산" value={p.form.ROAST_DATE} onChange={pick("ROAST_DATE")} />
            <Field label="소분일" required invalid={iv("PACKAGE_DATE")} fromAi={ai("PACKAGE_DATE")}>
              <input type="date" {...bind("PACKAGE_DATE")} />
            </Field>
            {/* 이 필드는 "로스터가 포장한 날"로 오해하기 쉽다(실제로 그렇게 읽은 적이 있다).
                저장 키는 PACKAGE_DATE 그대로이고 바뀐 것은 부르는 이름뿐이라, 뜻을 여기서 못 박는다. */}
            <p className="hint">원두를 받아 소분해 담은 날 — 로스터가 포장한 날이 아닙니다.</p>
            <SuggestChips
              ariaLabel="소분일 추천"
              options={packageDateChips()}
              value={p.form.PACKAGE_DATE}
              onPick={pick("PACKAGE_DATE")}
            />
          </>
        );

      case "flavor":
        return (
          <>
            {/* 문자열을 치는 대신 노트를 고른다 — 고른 것은 지울 수 있는 블록이 되고 콤마는
                저장 형식으로만 남는다. 검색은 영문·한글 양쪽으로 되고 저장값은 영문이다. */}
            <Field label="플레이버 노트" plain fromAi={ai("TASTING_NOTE")}>
              <FlavorPicker value={p.form.TASTING_NOTE} onChange={(v) => p.updateField("TASTING_NOTE", v)} />
            </Field>
            {/* 검색은 포커스해야 보인다 — 무엇을 고를 수 있는지 한눈에 알리는 자리는 여기다.
                누르면 교체가 아니라 누적(appendNote). */}
            <SuggestChips
              ariaLabel="자주 쓰는 플레이버 (누르면 추가)"
              options={NOTE_OPTIONS}
              limit={CHIP_LIMIT}
              onPick={(v) => p.updateField("TASTING_NOTE", appendNote(p.form.TASTING_NOTE, v))}
            />
            <Field
              label="커피 이름"
              aux="시그니쳐·블렌드명 — 넣으면 라벨·카드 제목이 됩니다"
              fromAi={ai("COFFEE_NAME")}
            >
              <input type="text" placeholder="비우면 국가+세부지역으로 자동 표시" {...bind("COFFEE_NAME")} />
            </Field>
          </>
        );

      case "pack":
        return (
          <>
            <Field label="용량" fromAi={ai("NET_WEIGHT")}>
              <span className="unit-wrap">
                <input type="text" inputMode="decimal" placeholder="20" {...bind("NET_WEIGHT")} />
                <span className="unit">g</span>
              </span>
            </Field>
            <SuggestChips
              ariaLabel="용량 추천"
              limit={CHIP_LIMIT}
              options={WEIGHT_OPTIONS}
              value={p.form.NET_WEIGHT}
              onPick={pick("NET_WEIGHT")}
            />
            {/* 부르는 이름은 "로스팅 레벨" — 애그트론 숫자는 로스터의 계측값이고 읽는 맥락은
                "얼마나 볶았나"다. 저장값(#120 (울트라라이트))과 컬럼은 그대로다. */}
            <Field label="로스팅 레벨" fromAi={ai("AGTRON")}>
              <input
                type="text"
                list="dl-roastpoint"
                placeholder="#95 (라이트) — 숫자만 치면 #이 붙어요"
                {...bind("AGTRON")}
              />
            </Field>
            {/* 숫자 목록을 훑는 대신 실제 원두 색으로 고른다 (이슈 #25) */}
            {/* 이 줄은 목록이 아니라 밝음에서 어두움으로 가는 한 벌의 척도라 통째로 보이는 편이
                낫지만, 다른 줄과 어긋나게 두지 않는다 — 접어도 펼치기가 한 번이고, 줄이 들쭉날쭉한
                쪽이 고르는 일을 더 방해한다. */}
            <SuggestChips
              ariaLabel="로스팅 레벨 추천"
              limit={CHIP_LIMIT}
              options={ROASTPOINT_OPTIONS}
              value={p.form.AGTRON}
              onPick={pick("AGTRON")}
              renderChip={(o) => {
                const lv = parseRoastLevel(optionValue(o));
                return (
                  <>
                    {lv && <span className="chip-swatch" style={{ background: lv.swatch }} />}
                    {optionLabel(o)}
                  </>
                );
              }}
            />
          </>
        );

      case "detail":
        return (
          <>
            <div className="row2">
              <Field label="고도" fromAi={ai("ALTITUDE")}>
                <span className="unit-wrap">
                  <input type="text" placeholder="1900-2100" {...bind("ALTITUDE")} />
                  <span className="unit">m</span>
                </span>
              </Field>
              <Field label="수확시기" fromAi={ai("HARVEST")}>
                <input type="text" list="dl-harvest" placeholder="25/26" {...bind("HARVEST")} />
              </Field>
            </div>
            <SuggestChips
              ariaLabel="수확시기 추천"
              options={HARVEST_OPTIONS}
              value={p.form.HARVEST}
              onPick={pick("HARVEST")}
            />
            <div className="row2">
              <Field label="생산자 / 농장" fromAi={ai("PRODUCER")}>
                <input type="text" placeholder="Daniel Caro Lopez" {...bind("PRODUCER")} />
              </Field>
              <Field label="랏 (로트명)" fromAi={ai("LOT")}>
                <input type="text" placeholder="Sewda Premium" {...bind("LOT")} />
              </Field>
            </div>
            <div className="row2">
              <Field label="워싱스테이션" fromAi={ai("WASHING_STATION")}>
                <input type="text" placeholder="Sewda" {...bind("WASHING_STATION")} />
              </Field>
              <Field label="원본 페이지 URL" fromAi={ai("SOURCE_URL")}>
                <input type="url" placeholder="https://..." {...bind("SOURCE_URL")} />
              </Field>
            </div>
            <Field
              label="기타 정보"
              aux="산지·로스터리 스토리 — QR 조회 페이지에 공개 표시"
              fromAi={ai("MEMO")}
            >
              <textarea
                className="memo-input"
                placeholder="예) 게뎁 지역 소농들의 체리를 워카 사카로 워싱스테이션에서 함께 가공한 커뮤니티 랏입니다."
                value={p.form.MEMO}
                onChange={(e) => p.updateField("MEMO", e.target.value)}
              />
            </Field>
          </>
        );
    }
  }

  return (
    <div className="card steps">
      <div className="steps-progress">
        <div className="steps-bar">
          <span className="steps-fill" style={{ width: `${(done.size / STEPS.length) * 100}%` }} />
        </div>
        <span className="steps-count">
          확인 {done.size} / {STEPS.length}
        </span>
      </div>

      {STEPS.map((step, idx) => {
        const open = openId === step.id;
        const isDone = done.has(step.id);
        const isSkipped = skipped.has(step.id);
        const missing = missingOf(step);
        const summary = summarize(step, p.form);
        const last = idx === STEPS.length - 1;
        // 값은 차 있는데 아직 확인하지 않은 스텝 — AI가 채운 초안이 그대로 놓인 상태다.
        // 확인한 스텝과 똑같이 보이면 이 화면이 하는 일(사람이 승인했는가)이 화면에서 사라진다.
        const isPending = !isDone && !isSkipped && !missing.length && !!summary;
        return (
          <section
            key={step.id}
            ref={(el) => {
              sections.current.set(step.id, el);
            }}
            className={`step${open ? " open" : ""}${isDone ? " done" : ""}${isSkipped ? " skipped" : ""}${isPending ? " pending" : ""}`}
          >
            <button
              type="button"
              className="step-head"
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : step.id)}
            >
              <span className="step-mark">{isDone ? "✓" : idx + 1}</span>
              <span className="step-title">{step.title}</span>
              <span className="step-summary">
                {missing.length > 0 ? (
                  <span className="step-missing">필수 {missing.length}칸 비어 있음</span>
                ) : (
                  <>
                    {summary || (isSkipped ? "건너뜀" : "")}
                    {isPending && <span className="step-pending">확인 전</span>}
                  </>
                )}
              </span>
            </button>
            {open && (
              <div className="step-body">
                {body(step)}
                {/* 막힌 이유를 그 자리에서 말한다. 반복해서 눌러도 다시 흔들리도록 일련번호로 키잉한다 —
                    클래스만 다시 붙이면 CSS 애니메이션이 재생되지 않아 "눌러도 아무 일이 없다"가 된다. */}
                {attempted.has(step.id) && missing.length > 0 && (
                  <p key={blockedSeq} className="step-blocked">
                    필수 {missing.length}칸을 채워야 확인할 수 있습니다.
                  </p>
                )}
                <div className="step-foot">
                  <button type="button" className="step-skip" onClick={() => skip(step.id)}>
                    건너뛰기
                  </button>
                  <button type="button" className="primary" onClick={() => confirm(step.id)}>
                    {last ? "확인하고 마치기" : "확인하고 다음 →"}
                  </button>
                </div>
              </div>
            )}
          </section>
        );
      })}

      {/* 자유 입력 자동완성 — 칩이 보여주는 건 앞쪽 몇 개뿐이라 전체 목록은 여기가 맡는다 */}
      <datalist id="dl-roastery">
        {p.roasteryOptions.map((n) => (
          <option key={n} value={n}>
            {p.withLogo.has(n) ? "★ 저장된 로고" : ""}
          </option>
        ))}
      </datalist>
      <datalist id="dl-origin">{dlOptions(ORIGIN_OPTIONS)}</datalist>
      <datalist id="dl-process">{dlOptions(PROCESS_OPTIONS)}</datalist>
      <datalist id="dl-variety">{dlOptions(VARIETY_OPTIONS)}</datalist>
      <datalist id="dl-roastpoint">{dlOptions(ROASTPOINT_OPTIONS)}</datalist>
      <datalist id="dl-harvest">
        {HARVEST_OPTIONS.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
    </div>
  );
}
