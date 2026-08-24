// 순차 검증 — AI가 채운 초안을 우선순위대로 하나씩 확인한다.
//
// 17칸을 한 화면에 늘어놓으면 "무엇부터"가 사라진다. 그래서 등록에 필요한 순서(필수 → 표현 → 상세)로
// 스텝을 쪼개고 한 번에 하나만 연다. 각 스텝은 건너뛸 수 있고(완결성보다 흐름이 우선), 최종 필수 검사는
// 등록 시점의 Workspace.save()가 그대로 맡는다 — 여기서 막지 않는다.
import { useState } from "react";
import { capitalizeNoteSegments, isoToDot } from "../lib/format";
import {
  appendNote,
  CHIP_LIMIT,
  dateChips,
  HARVEST_OPTIONS,
  NOTE_OPTIONS,
  ORIGIN_OPTIONS,
  PROCESS_OPTIONS,
  ROASTPOINT_OPTIONS,
  VARIETY_OPTIONS,
  WEIGHT_OPTIONS,
} from "../lib/suggest";
import type { FormKey, FormState } from "../types";
import { Field, SuggestChips } from "./FormBits";

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
    title: "로스팅일 · 패키징일",
    keys: ["ROAST_DATE", "PACKAGE_DATE"],
    required: ["ROAST_DATE", "PACKAGE_DATE"],
  },
  { id: "flavor", title: "플레이버 · 커피 이름", keys: ["TASTING_NOTE", "COFFEE_NAME"], required: [] },
  { id: "pack", title: "용량 · 로스팅 포인트", keys: ["NET_WEIGHT", "AGTRON"], required: [] },
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
}

/** 로스팅 후 며칠 지났는지 — 조회 카드가 보여주는 D+N을 입력 시점에 미리 알려준다 */
function roastAgeLabel(iso: string): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return undefined;
  const then = new Date(`${iso}T00:00:00`);
  const now = new Date();
  const days = Math.floor((now.setHours(0, 0, 0, 0) - then.getTime()) / 86_400_000);
  if (days < 0) return "아직 오지 않은 날짜";
  return days === 0 ? "오늘 로스팅" : `오늘 기준 D+${days}`;
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

  const bind = (key: FormKey) => ({
    value: p.form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      p.updateField(key, e.target.value),
  });
  const ai = (key: FormKey) => p.aiFilled.has(key);
  const pick = (key: FormKey) => (v: string) => p.updateField(key, v);

  /** 다음으로 열 스텝 = 아직 확인하지 않은 가장 가까운 뒤 스텝. 없으면 모두 접는다. */
  function advance(from: StepId) {
    const i = STEPS.findIndex((s) => s.id === from);
    const next = STEPS.slice(i + 1).find((s) => !done.has(s.id));
    setOpenId(next ? next.id : null);
  }

  function confirm(id: StepId) {
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
    switch (step.id) {
      case "identity":
        return (
          <>
            <Field label="로스터리" required fromAi={ai("ROASTERY")}>
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
            <Field label="국가(산지)" required fromAi={ai("ORIGIN")}>
              <input type="text" list="dl-origin" placeholder="ETHIOPIA" {...bind("ORIGIN")} />
            </Field>
            <SuggestChips
              ariaLabel="산지 추천"
              options={ORIGIN_OPTIONS}
              limit={CHIP_LIMIT}
              value={p.form.ORIGIN}
              onPick={pick("ORIGIN")}
            />
            <Field label="세부 지역" fromAi={ai("REGION")}>
              <input type="text" placeholder="Yirgacheffe, Gedeb" {...bind("REGION")} />
            </Field>
          </>
        );

      case "spec":
        return (
          <>
            <Field label="가공방식" required fromAi={ai("PROCESS")}>
              <input type="text" list="dl-process" placeholder="Washed" {...bind("PROCESS")} />
            </Field>
            <SuggestChips
              ariaLabel="가공방식 추천"
              options={PROCESS_OPTIONS}
              limit={CHIP_LIMIT}
              value={p.form.PROCESS}
              onPick={pick("PROCESS")}
            />
            <Field label="품종" required fromAi={ai("VARIETY")}>
              <input type="text" list="dl-variety" placeholder="SL9" {...bind("VARIETY")} />
            </Field>
            <SuggestChips
              ariaLabel="품종 추천"
              options={VARIETY_OPTIONS}
              limit={CHIP_LIMIT}
              value={p.form.VARIETY}
              onPick={pick("VARIETY")}
            />
          </>
        );

      case "dates":
        return (
          <>
            <Field label="로스팅일" required aux={roastAgeLabel(p.form.ROAST_DATE)} fromAi={ai("ROAST_DATE")}>
              <input type="date" {...bind("ROAST_DATE")} />
            </Field>
            <SuggestChips
              ariaLabel="로스팅일 추천"
              options={dateChips()}
              value={p.form.ROAST_DATE}
              onPick={pick("ROAST_DATE")}
            />
            <Field label="패키징일" required fromAi={ai("PACKAGE_DATE")}>
              <input type="date" {...bind("PACKAGE_DATE")} />
            </Field>
            <SuggestChips
              ariaLabel="패키징일 추천"
              options={dateChips()}
              value={p.form.PACKAGE_DATE}
              onPick={pick("PACKAGE_DATE")}
            />
          </>
        );

      case "flavor":
        return (
          <>
            <Field label="플레이버 노트" fromAi={ai("TASTING_NOTE")}>
              <textarea
                placeholder="Magnolia, Honey Peach, Bergamot"
                value={p.form.TASTING_NOTE}
                onChange={(e) => p.updateField("TASTING_NOTE", e.target.value)}
                onBlur={(e) => {
                  const v = capitalizeNoteSegments(e.target.value);
                  if (v !== e.target.value) p.updateField("TASTING_NOTE", v);
                }}
              />
            </Field>
            {/* 노트는 교체가 아니라 누적 — 누를 때마다 콤마 목록에 덧붙는다 */}
            <SuggestChips
              ariaLabel="플레이버 추천 (누르면 추가)"
              options={NOTE_OPTIONS}
              limit={6}
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
              options={WEIGHT_OPTIONS}
              value={p.form.NET_WEIGHT}
              onPick={pick("NET_WEIGHT")}
            />
            <Field label="로스팅 포인트" fromAi={ai("AGTRON")}>
              <input
                type="text"
                list="dl-roastpoint"
                placeholder="#95 (라이트) — 숫자만 치면 #이 붙어요"
                {...bind("AGTRON")}
              />
            </Field>
            <SuggestChips
              ariaLabel="로스팅 포인트 추천"
              options={ROASTPOINT_OPTIONS}
              value={p.form.AGTRON}
              onPick={pick("AGTRON")}
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
        const missing = step.required.filter((k) => !(p.form[k] || "").trim());
        const summary = summarize(step, p.form);
        const last = idx === STEPS.length - 1;
        return (
          <section
            key={step.id}
            className={`step${open ? " open" : ""}${isDone ? " done" : ""}${isSkipped ? " skipped" : ""}`}
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
                  summary || (isSkipped ? "건너뜀" : "")
                )}
              </span>
            </button>
            {open && (
              <div className="step-body">
                {body(step)}
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
      <datalist id="dl-origin">
        {ORIGIN_OPTIONS.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
      <datalist id="dl-process">
        {PROCESS_OPTIONS.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
      <datalist id="dl-variety">
        {VARIETY_OPTIONS.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
      <datalist id="dl-roastpoint">
        {ROASTPOINT_OPTIONS.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
      <datalist id="dl-harvest">
        {HARVEST_OPTIONS.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
    </div>
  );
}
