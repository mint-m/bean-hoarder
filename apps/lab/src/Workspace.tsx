// 랩 본 화면 — 폼·라벨 디자인·로고·목록·백업의 상태 허브 (구 lab.js의 React 이식).
import { FIELD_LABELS_KO, parseBeanText } from "@bnhd/autofill";
import { buildLabelSVG, type LabelDesign, SPEC_POOL, SUB_POOL, verifyQr } from "@bnhd/label";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BeanFormCard from "./components/BeanFormCard";
import BeanListCard from "./components/BeanListCard";
import DesignCard from "./components/DesignCard";
import PreviewCard from "./components/PreviewCard";
import { api } from "./lib/api";
import { insertByPriority, loadDesign, saveDesign } from "./lib/design";
import { capitalizeNoteSegments, dotToIso, download, isoToDot, withUnit } from "./lib/format";
import { geminiExtract } from "./lib/gemini";
import type { Account } from "./lib/session";
import { type BeanPublicRow, emptyForm, type FormKey, type FormState, type StatusLine } from "./types";

const SITE = "https://bnhd.pages.dev";
const LOGO_MAX_LEN = 140_000; // 서버와 동일한 상한 (base64 문자 수 ≈ 원본 100KB)
const YY = String(new Date().getFullYear() % 100).padStart(2, "0");

const SUB_KEYS = SUB_POOL.map(([k]) => k) as FormKey[];
const SPEC_KEYS = SPEC_POOL.map(([k]) => k) as FormKey[];

// 품종·가공방식처럼 원래 짧아야 하는 필드에 문장형 문단이 들어오면 메모 후보로 돌린다
const SHORT_FIELDS = ["PROCESS", "VARIETY", "WASHING_STATION", "LOT"];
const isParagraphLike = (v: string) => v.length > 50 || /[.!?]\s+[A-Z]/.test(v) || v.includes("\n");

export interface LogoState {
  dataUrl: string | null;
  source: "server" | "manual" | null;
}

export default function Workspace({ account }: { account: Account }) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [design, setDesignRaw] = useState<LabelDesign>(loadDesign);
  const [mode, setMode] = useState<"new" | "edit">("new");
  const [confirmedKey, setConfirmedKey] = useState<string | null>(null);
  const [previewSeq, setPreviewSeq] = useState(1);
  const [beans, setBeans] = useState<BeanPublicRow[] | null>(null);
  const [logosMap, setLogosMap] = useState<Record<string, string>>({});
  const [logo, setLogo] = useState<LogoState>({ dataUrl: null, source: null });
  const [status, setStatus] = useState<StatusLine>({ msg: "", cls: "" });
  const [logoStatus, setLogoStatus] = useState<StatusLine>({ msg: "", cls: "" });
  const [autofillStatus, setAutofillStatus] = useState<StatusLine>({ msg: "", cls: "" });
  const [autofillText, setAutofillText] = useState("");
  const [verify, setVerify] = useState<{ text: string; cls: string }>({ text: "", cls: "" });

  const call = useCallback(
    <T = Record<string, unknown>>(path: string, opts: RequestInit = {}) => api<T>(path, account.token, opts),
    [account.token],
  );

  const setDesign = useCallback((updater: (d: LabelDesign) => LabelDesign) => {
    setDesignRaw((d) => {
      const next = updater(d);
      if (next !== d) saveDesign(next);
      return next;
    });
  }, []);

  // ── 라벨 미리보기 렌더 + QR 실디코드 검증 ──────────────────
  const currentKey =
    confirmedKey ?? `${account.usercode || "????"}${YY}-${String(previewSeq).padStart(3, "0")}`;

  const row = useMemo(
    () => ({
      KEY: currentKey,
      ROASTERY: form.ROASTERY.trim(),
      ORIGIN: form.ORIGIN.trim(),
      COFFEE_NAME: form.COFFEE_NAME.trim(),
      REGION: form.REGION.trim(),
      PRODUCER: form.PRODUCER.trim(),
      LOT: form.LOT.trim(),
      WASHING_STATION: form.WASHING_STATION.trim(),
      VARIETY: form.VARIETY.trim(),
      PROCESS: form.PROCESS.trim(),
      ALTITUDE: withUnit(form.ALTITUDE, "m"),
      HARVEST: form.HARVEST.trim(),
      ROAST_DATE: isoToDot(form.ROAST_DATE),
      PACKAGE_DATE: isoToDot(form.PACKAGE_DATE),
      NET_WEIGHT: withUnit(form.NET_WEIGHT, "g"),
      AGTRON: form.AGTRON.trim(),
      TASTING_NOTE: form.TASTING_NOTE.trim(),
      MEMO: form.MEMO.trim(),
      SOURCE_URL: form.SOURCE_URL.trim(),
    }),
    [form, currentKey],
  );

  const label = useMemo(() => buildLabelSVG(row, design, logo.dataUrl), [row, design, logo.dataUrl]);

  const verifySeqRef = useRef(0);
  useEffect(() => {
    setVerify({ text: "QR 검증 중…", cls: "" });
    const mySeq = ++verifySeqRef.current;
    verifyQr(label.svg, label.content, 203).then((v) => {
      if (mySeq !== verifySeqRef.current) return;
      setVerify(
        v.ok
          ? { text: "QR 검증 OK — 203dpi 실디코드 통과", cls: "ok" }
          : { text: "QR 검증 실패 — QR 크기를 키워보세요", cls: "bad" },
      );
    });
  }, [label]);

  // ── 표시 토글 자동 체크: 값이 방금 채워지면 켜고, 비워지면 끈다 ──
  const updateField = useCallback(
    (key: FormKey, value: string) => {
      if (key === "AGTRON" && /^\d/.test(value)) value = `#${value}`; // 숫자로 시작하면 # 자동 부착
      setForm((prev) => {
        const had = !!prev[key].trim();
        const nowHas = !!value.trim();
        if (had !== nowHas || !nowHas) {
          if ((SUB_KEYS as string[]).includes(key)) {
            setDesign((d) => {
              if (!nowHas) return { ...d, subFields: d.subFields.filter((k) => k !== key) };
              if (!had && !d.subFields.includes(key) && d.subFields.length < 3)
                return { ...d, subFields: [...d.subFields, key] };
              return d;
            });
          }
          if ((SPEC_KEYS as string[]).includes(key)) {
            setDesign((d) => {
              if (!nowHas) return { ...d, specFields: d.specFields.filter((k) => k !== key) };
              if (!had && !d.specFields.includes(key))
                return { ...d, specFields: insertByPriority(d.specFields, key) };
              return d;
            });
          }
        }
        return { ...prev, [key]: value };
      });
    },
    [setDesign],
  );

  /** 여러 필드가 한번에 바뀌는 시점(편집 진입·초기화·사이즈 변경): 값이 없어진 선택만 정리 */
  const pruneSelections = useCallback(
    (nextForm: FormState) => {
      setDesign((d) => ({
        ...d,
        subFields: d.subFields.filter((k) => !!(nextForm[k as FormKey] || "").trim()),
        specFields: d.specFields.filter((k) => !!(nextForm[k as FormKey] || "").trim()),
      }));
    },
    [setDesign],
  );

  // ── 로고: 로스터리 입력값에 저장된 로고 자동 적용 ───────────
  const roasteryUpper = form.ROASTERY.trim().toUpperCase();
  useEffect(() => {
    setLogo((cur) => {
      if (cur.source === "manual") return cur;
      const saved = roasteryUpper ? logosMap[roasteryUpper] : undefined;
      if (saved) return cur.dataUrl === saved ? cur : { dataUrl: saved, source: "server" };
      if (cur.source === "server") return { dataUrl: null, source: null };
      return cur;
    });
  }, [roasteryUpper, logosMap]);

  /** 현재 로고를 로스터리 이름으로 서버에 저장 — DesignCard(업로드 직후)와 로스터리 blur(뒤늦은 이름 입력)가 공유 */
  async function saveLogoForRoastery(dataUrl: string) {
    if (!roasteryUpper) {
      setLogoStatus({
        msg: "로고를 불러왔습니다. 로스터리 이름을 입력하면 저장되어 다음부터 자동 적용됩니다.",
        cls: "ok",
      });
      return;
    }
    setLogoStatus({ msg: `${roasteryUpper} 로고 저장 중…`, cls: "loading" });
    const { body } = await call("/api/logos", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roastery: roasteryUpper, data_url: dataUrl }),
    });
    if (body?.ok) {
      setLogosMap((m) => ({ ...m, [roasteryUpper]: dataUrl }));
      setLogo({ dataUrl, source: "server" });
      setLogoStatus({
        msg: `✓ ${roasteryUpper} 로고 저장됨 — 다음부터 이름만 입력해도 자동 적용됩니다.`,
        cls: "ok",
      });
    } else {
      setLogoStatus({ msg: body?.error || "로고 저장 실패", cls: "error" });
    }
  }

  /** 로고를 먼저 올리고 나중에 로스터리 이름을 입력한 경우 — 이름 입력을 마친(blur) 시점에 약속대로 저장 */
  function handleRoasteryBlur() {
    if (
      logo.source === "manual" &&
      logo.dataUrl &&
      roasteryUpper &&
      logosMap[roasteryUpper] !== logo.dataUrl
    ) {
      saveLogoForRoastery(logo.dataUrl);
    }
  }

  const refreshLogos = useCallback(async () => {
    const { body } = await call<{ logos: { roastery: string; data_url: string }[] }>("/api/logos");
    if (body?.ok && body.logos) {
      const map: Record<string, string> = {};
      for (const l of body.logos) map[l.roastery] = l.data_url;
      setLogosMap(map);
    }
  }, [call]);

  // ── 원두 목록 ───────────────────────────────────────────────
  const refreshList = useCallback(async () => {
    const { body } = await call<{ beans: BeanPublicRow[] }>("/api/beans");
    if (!body?.ok || !body.beans) {
      setBeans(null);
      return;
    }
    setBeans(body.beans);
    const re = new RegExp(`^${account.usercode}${YY}-(\\d{3})$`);
    let max = 0;
    for (const b of body.beans) {
      const m = re.exec(b.KEY);
      if (m) max = Math.max(max, Number.parseInt(m[1] as string, 10));
    }
    setPreviewSeq(max + 1);
  }, [call, account.usercode]);

  useEffect(() => {
    refreshLogos();
    refreshList();
  }, [refreshLogos, refreshList]);

  // ── 저장 / 초기화 / 편집 / 삭제 ─────────────────────────────
  async function save() {
    const missing: string[] = [];
    if (!row.ROASTERY) missing.push("로스터리");
    if (!row.ORIGIN) missing.push("국가(산지)");
    if (!row.VARIETY) missing.push("품종");
    if (!row.PROCESS) missing.push("가공방식");
    if (!row.ROAST_DATE) missing.push("로스팅일");
    if (!row.PACKAGE_DATE) missing.push("패키징일");
    if (missing.length) {
      setStatus({ msg: `필수 항목을 입력하세요: ${missing.join(", ")}`, cls: "error" });
      return;
    }
    const payload: Record<string, string> = { ...row, YEAR: YY };
    delete payload.KEY;
    const wasEdit = mode === "edit";
    setStatus({ msg: wasEdit ? "수정 저장 중…" : "등록 중…", cls: "ok" });
    const { body } = wasEdit
      ? await call<{ key: string }>(`/api/bean/${confirmedKey}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await call<{ key: string }>("/api/beans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
    if (body?.ok && body.key) {
      setMode("edit");
      setConfirmedKey(body.key);
      setStatus({
        msg: wasEdit
          ? `수정 저장 완료 — ${body.key}`
          : `등록 완료 — KEY ${body.key} 확정. URL·QR 복사와 인쇄를 진행하세요.`,
        cls: "ok",
      });
      refreshList();
    } else {
      setStatus({ msg: body?.error || "저장 실패", cls: "error" });
    }
  }

  function startNew() {
    const next = emptyForm();
    setForm(next);
    setAutofillText("");
    setAutofillStatus({ msg: "", cls: "" });
    setLogo({ dataUrl: null, source: null });
    setLogoStatus({ msg: "", cls: "" });
    setMode("new");
    setConfirmedKey(null);
    setStatus({ msg: "", cls: "" });
    pruneSelections(next);
    refreshList();
  }

  function loadBeanForEdit(key: string) {
    const b = beans?.find((x) => x.KEY === key);
    if (!b) return;
    const g = (k: string) => String(b[k] || "");
    const next: FormState = {
      ROASTERY: g("ROASTERY"),
      ORIGIN: g("ORIGIN"),
      COFFEE_NAME: g("COFFEE_NAME"),
      REGION: g("REGION"),
      PRODUCER: g("PRODUCER"),
      LOT: g("LOT"),
      WASHING_STATION: g("WASHING_STATION"),
      VARIETY: g("VARIETY"),
      PROCESS: g("PROCESS"),
      ALTITUDE: g("ALTITUDE").replace(/m$/, ""),
      HARVEST: g("HARVEST"),
      ROAST_DATE: dotToIso(g("ROAST_DATE")),
      PACKAGE_DATE: dotToIso(g("PACKAGE_DATE")),
      NET_WEIGHT: g("NET_WEIGHT").replace(/g$/, ""),
      AGTRON: g("AGTRON"),
      TASTING_NOTE: g("TASTING_NOTE"),
      MEMO: g("MEMO"),
      SOURCE_URL: g("SOURCE_URL"),
    };
    setForm(next);
    setLogo((cur) => (cur.source === "manual" ? { dataUrl: null, source: null } : cur)); // 저장된 로고 우선
    setMode("edit");
    setConfirmedKey(key);
    setStatus({ msg: `${key} 를 수정 중입니다.`, cls: "ok" });
    pruneSelections(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteBean(key: string) {
    if (!confirm(`${key} 를 삭제할까요? 인쇄된 라벨의 QR은 더 이상 조회되지 않습니다.`)) return;
    const { body } = await call(`/api/bean/${key}`, { method: "DELETE" });
    if (body?.ok) {
      setStatus({ msg: `${key} 삭제됨`, cls: "ok" });
      if (confirmedKey === key) {
        setMode("new");
        setConfirmedKey(null);
      }
      refreshList();
    } else {
      setStatus({ msg: body?.error || "삭제 실패", cls: "error" });
    }
  }

  // ── CSV 백업/복원 ───────────────────────────────────────────
  async function exportCsv() {
    const res = await fetch("/api/export.csv", { headers: { Authorization: `Bearer ${account.token}` } });
    if (!res.ok) {
      setStatus({ msg: "내보내기 실패", cls: "error" });
      return;
    }
    download(`bean_sheet_${account.usercode}.csv`, await res.blob());
    setStatus({ msg: "CSV 백업 저장 완료", cls: "ok" });
  }

  async function importCsvFile(file: File) {
    const text = await file.text();
    if (
      !confirm(
        "백업 CSV의 내용으로 복원합니다.\n같은 KEY가 이미 있으면 백업 내용으로 덮어씁니다. 계속할까요?",
      )
    )
      return;
    setStatus({ msg: "복원 중…", cls: "ok" });
    const { body } = await call<{
      added: number;
      updated: number;
      skipped: { key: string; reason: string }[];
      skippedTotal: number;
    }>("/api/import", {
      method: "POST",
      headers: { "Content-Type": "text/csv;charset=utf-8" },
      body: text,
    });
    if (body?.ok) {
      let msg = `복원 완료 — 추가 ${body.added} · 덮어쓰기 ${body.updated}`;
      if (body.skippedTotal) {
        msg += ` · 건너뜀 ${body.skippedTotal}`;
        const reasons = (body.skipped || [])
          .slice(0, 3)
          .map((s) => `${s.key}: ${s.reason}`)
          .join(" / ");
        if (reasons) msg += ` (${reasons}${body.skippedTotal > 3 ? " …" : ""})`;
      }
      setStatus({ msg, cls: "ok" });
      refreshList();
    } else {
      setStatus({ msg: body?.error || "복원 실패", cls: "error" });
    }
  }

  // ── 자동 채우기 ─────────────────────────────────────────────
  function fillParsed(parsed: Record<string, string>, sourceLabel: string, overwrite: boolean): boolean {
    const filled: string[] = [];
    let memoOverflow: string | null = null;
    setForm((prev) => {
      const next = { ...prev };
      for (const [field, v] of Object.entries(parsed)) {
        if (!(field in next) || !v) continue;
        const key = field as FormKey;
        if (!overwrite && next[key].trim()) continue;
        if (SHORT_FIELDS.includes(field) && isParagraphLike(v)) {
          if (!memoOverflow) memoOverflow = v;
          continue;
        }
        // 파서는 단위 없는 값을 주므로 원문 그대로 폼에 (ALTITUDE·NET_WEIGHT 포함)
        next[key] = field === "TASTING_NOTE" ? capitalizeNoteSegments(v) : v;
        filled.push(FIELD_LABELS_KO[field] || field);
      }
      if (memoOverflow && (overwrite || !next.MEMO.trim())) {
        next.MEMO = memoOverflow;
        if (!filled.includes(FIELD_LABELS_KO.MEMO as string)) filled.push(FIELD_LABELS_KO.MEMO || "MEMO");
      }
      pruneSelectionsAndAutoCheck(prev, next);
      return next;
    });
    if (filled.length) {
      setAutofillStatus({
        msg: `${sourceLabel} 채움: ${filled.join(", ")} — 검토 후 저장하세요.`,
        cls: "ok",
      });
      return true;
    }
    setAutofillStatus({
      msg: overwrite
        ? "인식된 항목이 없습니다."
        : "인식된 새 항목이 없습니다. 이미 채워진 필드는 덮어쓰지 않습니다.",
      cls: "error",
    });
    return false;
  }

  /** 자동 채우기로 여러 필드가 한번에 변한 경우의 토글 갱신 — 새로 채워진 필드는 자동 체크 */
  function pruneSelectionsAndAutoCheck(prev: FormState, next: FormState) {
    setDesign((d) => {
      let subFields = d.subFields.filter((k) => !!(next[k as FormKey] || "").trim());
      let specFields = d.specFields.filter((k) => !!(next[k as FormKey] || "").trim());
      for (const key of SUB_KEYS) {
        if (!prev[key].trim() && next[key].trim() && !subFields.includes(key) && subFields.length < 3)
          subFields = [...subFields, key];
      }
      for (const key of SPEC_KEYS) {
        if (!prev[key].trim() && next[key].trim() && !specFields.includes(key))
          specFields = insertByPriority(specFields, key);
      }
      return { ...d, subFields, specFields };
    });
  }

  async function runAiRecognition(raw: string) {
    const apiKey = (localStorage.getItem("bh_gemini_key") || "").trim();
    setAutofillStatus({ msg: "AI 인식 중…", cls: "" });
    try {
      const parsed = await geminiExtract(apiKey, raw);
      return fillParsed(parsed, "AI ", true);
    } catch (e) {
      setAutofillStatus({
        msg: `AI 인식 실패 — ${(e as Error).message}. 키를 확인하거나 잠시 후 다시 시도하세요.`,
        cls: "error",
      });
      return false;
    }
  }

  /** 링크에서 텍스트를 가져온 직후: 키가 있으면 AI, 없으면 휴리스틱 폴백. 반환값 = 항목 채움 여부 */
  async function recognizeText(raw: string): Promise<boolean> {
    const apiKey = (localStorage.getItem("bh_gemini_key") || "").trim();
    if (!apiKey) return fillParsed(parseBeanText(raw), "", false);
    return runAiRecognition(raw);
  }

  return (
    <div className="layout" id="app-view">
      <div>
        <BeanFormCard
          form={form}
          mode={mode}
          confirmedKey={confirmedKey}
          logosMap={logosMap}
          beans={beans}
          updateField={updateField}
          autofillText={autofillText}
          setAutofillText={setAutofillText}
          autofillStatus={autofillStatus}
          setAutofillStatus={setAutofillStatus}
          onRoasteryBlur={handleRoasteryBlur}
          call={call}
          recognizeText={recognizeText}
          runAiRecognition={runAiRecognition}
        />
        <DesignCard
          design={design}
          setDesign={setDesign}
          form={form}
          logo={logo}
          setLogo={setLogo}
          logosMap={logosMap}
          setLogosMap={setLogosMap}
          logoStatus={logoStatus}
          setLogoStatus={setLogoStatus}
          saveLogoForRoastery={saveLogoForRoastery}
          call={call}
          logoMaxLen={LOGO_MAX_LEN}
        />
        <BeanListCard
          beans={beans}
          site={SITE}
          onEdit={loadBeanForEdit}
          onDelete={deleteBean}
          onRefresh={refreshList}
          onExport={exportCsv}
          onImport={importCsvFile}
        />
      </div>
      <div>
        <PreviewCard
          label={label}
          verify={verify}
          design={design}
          setDesign={setDesign}
          mode={mode}
          confirmedKey={confirmedKey}
          currentKey={currentKey}
          site={SITE}
          status={status}
          setStatus={setStatus}
          onSave={save}
          onNew={startNew}
          form={form}
          pruneSelections={pruneSelections}
        />
      </div>
    </div>
  );
}
