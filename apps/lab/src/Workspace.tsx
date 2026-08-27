// 랩 본 화면 — 입력·QR·유지관리의 상태 허브.
//
// 화면은 3막이다: ① 입력(IntakeCard → ReviewStepper) ② QR 발급(QrCard, 라벨은 LabelPanel로 강등)
// ③ 유지관리(BeanListCard). 서비스가 책임지는 산출물이 "라벨 도안"이 아니라 "인쇄되는 QR과 그 QR이
// 도착하는 상세 페이지"라서 이 순서다.
import { FIELD_LABELS_KO, parseBeanText } from "@bnhd/autofill";
import { buildLabelSVG, buildQrSVG, type LabelDesign, SPEC_POOL, SUB_POOL, verifyQr } from "@bnhd/label";
import type { Account } from "@bnhd/session";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BeanListCard from "./components/BeanListCard";
import DesignCard from "./components/DesignCard";
import IntakeCard from "./components/IntakeCard";
import LabelPanel from "./components/LabelPanel";
import QrCard from "./components/QrCard";
import ReviewStepper from "./components/ReviewStepper";
import { api } from "./lib/api";
import { insertByPriority, loadDesign, saveDesign } from "./lib/design";
import { capitalizeNoteSegments, dotToIso, download, isoToDot, withUnit } from "./lib/format";
import { geminiExtract } from "./lib/gemini";
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

// 한 번에 한 맥락만 보여준다 — 입력하다가 QR·라벨·목록이 같이 눈에 들어오면 무엇을 하던 중인지 흐려진다.
type Stage = "input" | "qr" | "label" | "list";

export default function Workspace({
  account,
  onSessionExpired,
  onOpenSettings,
}: {
  account: Account;
  onSessionExpired: () => void;
  onOpenSettings: () => void;
}) {
  const [form, setForm] = useState<FormState>(emptyForm);
  // 이벤트 핸들러에서 "지금의 폼"을 읽기 위한 최신값 참조 — 자동 채우기가 다음 상태를
  // setForm 바깥에서 순수하게 계산하는 데 쓴다 (fillParsed의 주석 참고).
  const formRef = useRef(form);
  formRef.current = form;
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
  // 인쇄용 QR 모듈 크기(도트 수) — 라벨과 같은 도트 격자를 쓴다
  const [qrDots, setQrDots] = useState(3);
  // AI가 채운 필드 — 검증 스텝에서 "확인이 필요한 자리"로 표시하고, 사용자가 손대면 지운다
  const [aiFilled, setAiFilled] = useState<Set<FormKey>>(new Set());
  // 인테이크(링크 붙여넣기)를 지나 검증 단계에 들어섰는지
  const [started, setStarted] = useState(false);
  // 폼이 통째로 갈아끼워지는 시점(새 입력·편집 진입)에 검증 스텝 상태를 초기화하기 위한 키
  const [formSeq, setFormSeq] = useState(0);
  // 규칙 기반 인식이 부실했을 때만 켜지는 AI 키 권유 (키가 있으면 절대 켜지지 않는다)
  const [aiNudge, setAiNudge] = useState(false);
  // 서비스 키로 남은 AI 인식 횟수 — 3회 이하로 떨어졌을 때만 알린다 (0이면 소진)
  const [aiQuotaLeft, setAiQuotaLeft] = useState<number | null>(null);
  // 서비스 키 대행이 응답하지 못했다 — 사용자에겐 규칙 기반 결과만 보이므로 이유를 한 줄 남긴다
  const [aiServiceDown, setAiServiceDown] = useState(false);
  const [stage, setStage] = useState<Stage>("input");

  // 화면 이동을 히스토리에 쌓아 브라우저 뒤로가기가 "이전 단계"로 동작하게 한다 —
  // 주소는 그대로 둔다(직접 링크로 들어와도 유효한 단계가 아닐 수 있어 상태로만 관리).
  const goStage = useCallback((next: Stage) => {
    setStage(next);
    history.pushState({ bhStage: next }, "");
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    history.replaceState({ bhStage: "input" }, "");
    const onPop = (e: PopStateEvent) => {
      setStage(((e.state as { bhStage?: Stage } | null)?.bhStage ?? "input") as Stage);
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // 인증 호출의 단일 통로 — 자식 카드(IntakeCard·DesignCard)에도 prop으로 내려가므로
  // 세션 만료 감지를 여기 한 곳에 둔다. 401은 "토큰이 더 이상 유효하지 않다"는 뜻만 가진다:
  // rate limit은 429, 네트워크 끊김은 api()가 status 0으로 돌려주므로 여기 걸리지 않는다.
  const call = useCallback(
    async <T = Record<string, unknown>>(path: string, opts: RequestInit = {}) => {
      const res = await api<T>(path, account.token, opts);
      if (res.status === 401) onSessionExpired();
      return res;
    },
    [account.token, onSessionExpired],
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

  // 인쇄용 QR 단독 — 라벨과 같은 내용(BASE_URL/KEY)·같은 도트 격자를 쓴다.
  const qr = useMemo(() => buildQrSVG(currentKey, qrDots), [currentKey, qrDots]);

  // 실제로 인쇄되는 산출물(QR)을 203dpi로 래스터화해 디코드까지 확인한다.
  // 라벨 SVG가 아니라 QR을 보므로 KEY·크기가 바뀔 때만 돌면 된다 — 타이핑마다 재검증하지 않는다.
  const verifySeqRef = useRef(0);
  useEffect(() => {
    setVerify({ text: "확인 중…", cls: "" });
    const mySeq = ++verifySeqRef.current;
    // 실제로 인쇄될 해상도(203dpi)로 래스터화해 디코드까지 해본다. 표시는 결과만 —
    // 사용자가 알아야 할 것은 "인쇄해도 읽히는가"이지 dpi나 디코더 이름이 아니다.
    verifyQr(qr.svg, qr.content, 203).then((v) => {
      if (mySeq !== verifySeqRef.current) return;
      setVerify(
        v.ok
          ? { text: "✓ 인쇄해도 스캔됩니다", cls: "ok" }
          : { text: "스캔이 어려울 수 있어요 — 크기를 키워보세요", cls: "bad" },
      );
    });
  }, [qr]);

  // ── 표시 토글 자동 체크: 값이 방금 채워지면 켜고, 비워지면 끈다 ──
  const updateField = useCallback(
    (key: FormKey, value: string) => {
      if (key === "AGTRON" && /^\d/.test(value)) value = `#${value}`; // 숫자로 시작하면 # 자동 부착
      // 사용자가 직접 손댄 순간 그 칸은 더 이상 "AI가 채운 미확인 값"이 아니다
      setAiFilled((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
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

  // 덱에서 "정보 수정"으로 넘어온 경우(`?edit=KEY`) — 목록이 도착하면 그 원두를 편집 상태로 연다.
  // 목록이 있어야 값을 채울 수 있으므로 beans를 기다렸다가 한 번만 실행한다.
  const editParamRef = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: beans 도착 시 1회만 실행 (loadBeanForEdit은 렌더마다 새로 만들어져 의존성에 넣으면 반복 실행된다)
  useEffect(() => {
    if (editParamRef.current || !beans) return;
    editParamRef.current = true;
    const key = new URLSearchParams(location.search).get("edit");
    if (!key) return;
    // 주소를 정리해 새로고침·뒤로가기에서 편집이 되살아나지 않게
    history.replaceState({ bhStage: "input" }, "", location.pathname);
    if (beans.some((b) => b.KEY === key)) loadBeanForEdit(key);
    else setStatus({ msg: `${key} 를 찾을 수 없습니다 — 이미 삭제됐을 수 있어요.`, cls: "error" });
  }, [beans]);

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
    // 같은 로스터리·산지·로스팅일이면 사실상 같은 봉지일 가능성이 높다. 소분해서 라벨을 더 만드는
    // 정상 동작을 막지는 않고 한 번 확인만 받는다 — 실수로 두 번 등록하는 쪽이 훨씬 흔하다.
    if (mode === "new") {
      const dup = (beans || []).find(
        (b) =>
          (b.ROASTERY || "").trim().toUpperCase() === row.ROASTERY.toUpperCase() &&
          (b.ORIGIN || "").trim().toUpperCase() === row.ORIGIN.toUpperCase() &&
          (b.ROAST_DATE || "") === row.ROAST_DATE,
      );
      if (
        dup &&
        !confirm(
          `이미 같은 원두가 등록돼 있습니다 — ${dup.KEY}\n` +
            `로스터리·산지·로스팅일이 모두 같습니다.\n\n` +
            `소분해서 라벨을 더 만드는 경우라면 그대로 진행하세요. 새로 등록할까요?`,
        )
      ) {
        setStatus({ msg: `등록을 취소했습니다 — 기존 ${dup.KEY}를 목록에서 확인해 보세요.`, cls: "" });
        return;
      }
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
        msg: wasEdit ? `수정 저장 완료 — ${body.key}` : `등록 완료 — KEY ${body.key} 확정`,
        cls: "ok",
      });
      refreshList();
      goStage("qr"); // 등록의 결과물은 QR이다 — 바로 그 화면으로 넘긴다
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
    setAiFilled(new Set());
    setAiNudge(false);
    setAiQuotaLeft(null);
    setAiServiceDown(false);
    setStarted(false); // 인테이크(링크 붙여넣기)부터 다시
    setFormSeq((s) => s + 1); // 검증 스텝의 완료·건너뜀 상태 초기화
    pruneSelections(next);
    refreshList();
    goStage("input");
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
    setAiFilled(new Set()); // 저장된 값이므로 "AI가 채운 미확인 값"이 아니다
    setStarted(true); // 이미 값이 다 있으니 인테이크는 건너뛴다
    setFormSeq((s) => s + 1); // 전 스텝을 완료 상태로 다시 구성
    pruneSelections(next);
    goStage("input");
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
    // CSV는 JSON이 아니라 파일이라 call() 래퍼를 쓰지 않는 유일한 인증 호출 — 401을 직접 본다
    const res = await fetch("/api/export.csv", { headers: { Authorization: `Bearer ${account.token}` } });
    if (res.status === 401) {
      onSessionExpired();
      return;
    }
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
  //
  // ⚠️ 다음 폼을 **setForm 바깥에서 순수하게** 계산한다. 예전엔 updater 안에서 filled 배열을 채우고
  // 곧바로 filled.length로 성공을 판정했는데, React는 대기 중인 업데이트가 없을 때만 updater를 즉시
  // 실행한다(eager state). 그래서 직전에 다른 상태 변경이 있었으면 updater가 미뤄져 filled가 빈 채로
  // 읽혔고, 인식에 성공하고도 "이미 다 입력돼 있습니다"가 뜨며 다음 단계로 넘어가지 않았다.
  // 되다 안 되다 하는 증상의 정체가 이것이었다.
  function fillParsed(parsed: Record<string, string>, sourceLabel: string, overwrite: boolean): boolean {
    // 실패했을 때 "왜 실패했는지"를 정확히 말하려면 두 경우를 갈라야 한다:
    // 아무것도 못 알아본 것과, 알아봤지만 이미 다 채워져 있는 것은 사용자가 할 일이 다르다.
    const recognized = Object.entries(parsed).filter(([f, v]) => f in emptyForm() && !!v).length;
    const filled: string[] = [];
    const filledKeys = new Set<FormKey>();
    let memoOverflow: string | null = null;

    const prev = formRef.current;
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
      filledKeys.add(key);
    }
    if (memoOverflow && (overwrite || !next.MEMO.trim())) {
      next.MEMO = memoOverflow;
      filledKeys.add("MEMO");
      if (!filled.includes(FIELD_LABELS_KO.MEMO as string)) filled.push(FIELD_LABELS_KO.MEMO || "MEMO");
    }

    formRef.current = next; // 렌더 전에 연속 호출돼도 최신 값을 보게
    setForm(next);
    pruneSelectionsAndAutoCheck(prev, next);

    const hasAiKey = !!(localStorage.getItem("bh_gemini_key") || "").trim();

    if (filled.length) {
      setAiFilled(filledKeys);
      setAutofillStatus({
        msg: `${sourceLabel} 채움: ${filled.join(", ")} — 아래에서 순서대로 확인하세요.`,
        cls: "ok",
      });
      // 규칙 기반이 몇 칸밖에 못 건졌다면 AI가 확실히 더 낫다 — 그 사실이 드러난 지금만 권한다.
      // (잘 채워졌으면 권하지 않는다. 매번 띄우면 그냥 소음이다.)
      if (!hasAiKey && filled.length <= 3) setAiNudge(true);
      return true;
    }

    if (!hasAiKey) setAiNudge(true);
    setAutofillStatus({
      msg:
        recognized === 0
          ? hasAiKey
            ? "원두 정보를 찾지 못했습니다. 정보가 적힌 부분만 붙여넣어 보세요."
            : "원두 정보를 찾지 못했습니다."
          : "새로 채울 항목이 없습니다 — 기존 값은 그대로 뒀습니다.",
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

  /**
   * 인식 사다리 — 좋은 것부터 시도하고, 안 되면 조용히 한 단계씩 내려간다.
   *   ① 본인 키    → 브라우저에서 Google 직접 (무제한, 서비스 할당량 무관)
   *   ② 서비스 키  → POST /api/extract (계정별·전역 하루 한도)
   *   ③ 규칙 기반  → parseBeanText (항상 동작, 네트워크 없음)
   * 어느 단계에서 멈추든 사용자는 "채워졌다/못 채웠다"만 보면 되므로 실패는 다음 단계로 흘린다.
   */
  async function recognizeText(raw: string): Promise<boolean> {
    if ((localStorage.getItem("bh_gemini_key") || "").trim()) return runAiRecognition(raw);

    setAutofillStatus({ msg: "AI 인식 중…", cls: "" });
    const { status, body } = await call<{ fields: Record<string, string>; remaining: number }>(
      "/api/extract",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: raw }),
      },
    );
    if (body?.ok && body.fields) {
      setAiServiceDown(false);
      const ok = fillParsed(body.fields, "AI ", true);
      // 남은 횟수가 얼마 없으면 미리 알린다 — 갑자기 품질이 떨어진 것처럼 느끼지 않게
      if (ok && typeof body.remaining === "number" && body.remaining <= 3) {
        setAiQuotaLeft(body.remaining);
      }
      return ok;
    }
    // 한도 소진·키 미설정·호출 실패 — 규칙 기반으로 내려간다 (fallback 플래그는 서버가 준다).
    // 소진 판정은 상태 코드로 한다: 서버가 429를 내는 경우는 이것뿐이고, 문구(AI_QUOTA_ERROR)는
    // 사용자에게 보이는 말이라 다듬는 순간 조건이 빗나가도 테스트는 전부 통과한다.
    // fallback 플래그로는 못 가른다 — 키 미설정(503)·호출 실패(502)도 같은 플래그를 준다.
    if (status === 429) setAiQuotaLeft(0);
    // 키 미설정(503)·상위 호출 실패(502)는 우리 쪽 사정이다. 조용히 내려가면 사용자는 "AI가 원래
    // 이 정도"라고 오해하고, 우리는 기능이 죽은 줄도 모른다 — 서버 로그와 짝이 되는 화면 신호다.
    if (status === 502 || status === 503) setAiServiceDown(true);
    return fillParsed(parseBeanText(raw), "", false);
  }

  /**
   * 같은 상품 페이지로 이미 등록한 원두 찾기 — 인테이크가 **가져오기 전에** 부른다.
   * 목록은 이미 메모리에 있으므로 추가 요청이 없고, 걸리면 페이지 fetch와 AI 호출을 통째로 아낀다
   * (등록 시점의 로스터리·산지·로스팅일 중복 확인은 그대로 남아 두 번째 그물이 된다).
   */
  const findByUrl = useCallback(
    (url: string): string | null => {
      const norm = (s: string) =>
        s
          .trim()
          .replace(/[?#].*$/, "")
          .replace(/\/+$/, "")
          .toLowerCase();
      const target = norm(url);
      if (!target) return null;
      return (beans || []).find((b) => norm(String(b.SOURCE_URL || "")) === target)?.KEY ?? null;
    },
    [beans],
  );

  // 로고를 가진 로스터리를 앞에(★), 나머지는 등록 이력에서 — 검증 스텝의 추천 칩·datalist가 쓴다
  const withLogo = useMemo(() => new Set(Object.keys(logosMap)), [logosMap]);
  const roasteryOptions = useMemo(() => {
    const fromBeans = (beans || []).map((b) => (b.ROASTERY || "").trim().toUpperCase()).filter(Boolean);
    const sorted = [...new Set([...withLogo, ...fromBeans])].sort();
    return [...sorted.filter((n) => withLogo.has(n)), ...sorted.filter((n) => !withLogo.has(n))];
  }, [beans, withLogo]);

  // KEY가 없으면 QR·라벨 화면은 성립하지 않는다 (뒤로가기로 흘러들어온 경우 입력으로 되돌린다)
  const view: Stage = (stage === "qr" || stage === "label") && !confirmedKey ? "input" : stage;

  // 한 화면에 한 맥락 (DESIGN.md §7): 입력 → QR 발급 → (선택) 라벨 도안, 목록은 별도 화면.
  return (
    <div className="flow" id="app-view">
      {view === "input" && (
        <>
          <IntakeCard
            autofillText={autofillText}
            setAutofillText={setAutofillText}
            status={autofillStatus}
            setStatus={setAutofillStatus}
            call={call}
            recognizeText={recognizeText}
            sourceUrl={form.SOURCE_URL}
            setSourceUrl={(v) => updateField("SOURCE_URL", v)}
            findByUrl={findByUrl}
            started={started}
            onStart={() => setStarted(true)}
            // "다시 가져오기"는 새 출처로 처음부터 채운다는 뜻 — 플래그만 되돌리고 폼을 남기면
            // 다음 채우기가 "이미 다 입력돼 있습니다"에 걸려 멈춘다 (실제로 겪은 버그).
            onReopen={startNew}
            filledCount={aiFilled.size}
            aiNudge={aiNudge}
            aiQuotaLeft={aiQuotaLeft}
            aiServiceDown={aiServiceDown}
            onOpenSettings={() => {
              setAiNudge(false); // 한 번 안내했으면 충분하다
              onOpenSettings();
            }}
          />

          {started && (
            <>
              <ReviewStepper
                key={formSeq}
                form={form}
                updateField={updateField}
                aiFilled={aiFilled}
                roasteryOptions={roasteryOptions}
                withLogo={withLogo}
                onRoasteryBlur={handleRoasteryBlur}
                allDone={mode === "edit"}
              />

              {/* 입력 화면의 결론 — 등록해야 KEY가 나오고, KEY가 나와야 QR을 만들 수 있다 */}
              <div className="card register-bar">
                <div className="btnrow">
                  <button type="button" className="primary" onClick={save}>
                    {mode === "edit" ? `수정 저장 (${confirmedKey})` : "등록 — KEY 발급받기"}
                  </button>
                  {mode === "edit" && confirmedKey && (
                    <button type="button" onClick={() => goStage("qr")}>
                      QR 보기 →
                    </button>
                  )}
                  <button type="button" onClick={startNew}>
                    처음부터
                  </button>
                </div>
                <div className={`status-line register-status ${status.cls}`}>{status.msg}</div>
              </div>
            </>
          )}

          <button type="button" className="stage-link" onClick={() => goStage("list")}>
            내 원두 목록 →
          </button>
        </>
      )}

      {view === "qr" && confirmedKey && (
        <QrCard
          qr={qr}
          qrDots={qrDots}
          setQrDots={setQrDots}
          verify={verify}
          confirmedKey={confirmedKey}
          site={SITE}
          status={status}
          setStatus={setStatus}
          onBackToInput={() => goStage("input")}
          onLabel={() => goStage("label")}
          onNew={startNew}
        />
      )}

      {view === "label" && (
        <LabelPanel
          label={label}
          design={design}
          setDesign={setDesign}
          form={form}
          pruneSelections={pruneSelections}
          currentKey={currentKey}
          onBack={() => goStage("qr")}
        >
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
        </LabelPanel>
      )}

      {view === "list" && (
        <BeanListCard
          beans={beans}
          onEdit={loadBeanForEdit}
          onDelete={deleteBean}
          onRefresh={refreshList}
          onExport={exportCsv}
          onImport={importCsvFile}
          onBack={() => goStage("input")}
        />
      )}
    </div>
  );
}
