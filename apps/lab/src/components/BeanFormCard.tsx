// 원두 정보 입력 카드 — AI 자동 채우기 · 필드 · 데이터리스트 (구 admin.html 폼 이식).
import { useState } from "react";
import type { ApiResult } from "../lib/api";
import { capitalizeNoteSegments } from "../lib/format";
import type { BeanPublicRow, FormKey, FormState, StatusLine } from "../types";

const YY = String(new Date().getFullYear() % 100).padStart(2, "0");
const HARVEST_OPTIONS = [`${Number(YY) - 1}/${YY}`, YY, String(Number(YY) - 1)];

const ORIGIN_OPTIONS = [
  "ETHIOPIA",
  "COLOMBIA",
  "BRAZIL",
  "KENYA",
  "GUATEMALA",
  "HONDURAS",
  "COSTA RICA",
  "PANAMA",
  "PERU",
  "INDONESIA",
  "YEMEN",
  "RWANDA",
  "BURUNDI",
  "TANZANIA",
  "EL SALVADOR",
  "NICARAGUA",
  "MEXICO",
  "INDIA",
  "VIETNAM",
  "블렌드 (여러 원산지 혼합)",
];
const PROCESS_OPTIONS = [
  "Washed",
  "Natural",
  "Honey",
  "Anaerobic",
  "Wet-Hulled",
  "Carbonic Maceration",
  "Semi-Washed",
  "블렌드 (여러 가공방식 혼합)",
];
const VARIETY_OPTIONS = [
  "Bourbon",
  "Typica",
  "Caturra",
  "Catuai",
  "SL28",
  "SL34",
  "Gesha",
  "Pacamara",
  "Castillo",
  "Heirloom",
  "블렌드 (여러 품종 혼합)",
];
const ROASTPOINT_OPTIONS = [
  "#120 (울트라라이트)",
  "#95 (라이트)",
  "#75 (미디움라이트)",
  "#65 (미디움)",
  "#55 (미디움다크)",
  "#45 (다크)",
];

interface Props {
  form: FormState;
  mode: "new" | "edit";
  confirmedKey: string | null;
  logosMap: Record<string, string>;
  beans: BeanPublicRow[] | null;
  updateField: (key: FormKey, value: string) => void;
  autofillText: string;
  setAutofillText: (v: string) => void;
  autofillStatus: StatusLine;
  setAutofillStatus: (s: StatusLine) => void;
  call: <T = Record<string, unknown>>(path: string, opts?: RequestInit) => Promise<ApiResult<T>>;
  recognizeText: (raw: string) => Promise<boolean>;
  runAiRecognition: (raw: string) => Promise<boolean>;
  onRoasteryBlur: () => void;
}

export default function BeanFormCard(p: Props) {
  const [autofillUrl, setAutofillUrl] = useState("");
  const [autofillOpen, setAutofillOpen] = useState(true);
  const [aiOpen, setAiOpen] = useState(!localStorage.getItem("bh_gemini_key"));
  const [geminiKey, setGeminiKey] = useState(localStorage.getItem("bh_gemini_key") || "");

  // 로고 보유 로스터리를 먼저(★ 표시), 나머지는 등록 이력에서 — 가나다/ABC 순
  const beanRoasteries = (p.beans || []).map((b) => (b.ROASTERY || "").trim().toUpperCase()).filter(Boolean);
  const withLogo = new Set(Object.keys(p.logosMap));
  const sorted = [...new Set([...withLogo, ...beanRoasteries])].sort();
  const roasteryOptions = [
    ...sorted.filter((n) => withLogo.has(n)),
    ...sorted.filter((n) => !withLogo.has(n)),
  ];

  const bind = (key: FormKey) => ({
    value: p.form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      p.updateField(key, e.target.value),
  });

  async function fetchFromUrl() {
    const url = autofillUrl.trim();
    if (!url) {
      p.setAutofillStatus({ msg: "상품 페이지 URL을 입력하세요.", cls: "error" });
      return;
    }
    p.setAutofillStatus({ msg: "페이지를 가져오는 중…", cls: "" });
    const { body } = await p.call<{ kind: string; text: string }>("/api/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!body?.ok || body.kind !== "text") {
      p.setAutofillStatus({
        msg:
          body?.error ||
          "가져오기 실패 — 봇 차단·스크립트 렌더링 사이트일 수 있습니다. 텍스트를 직접 붙여넣어 보세요.",
        cls: "error",
      });
      return;
    }
    p.setAutofillText(body.text);
    if (!p.form.SOURCE_URL.trim()) p.updateField("SOURCE_URL", url);
    const filled = await p.recognizeText(body.text);
    if (filled) setAutofillOpen(false);
    if (!(localStorage.getItem("bh_gemini_key") || "").trim()) setAiOpen(true); // 키 설정 유도
  }

  function runAi() {
    const raw = p.autofillText.trim();
    if (!raw) {
      p.setAutofillStatus({ msg: "붙여넣을 텍스트가 없습니다.", cls: "error" });
      return;
    }
    if (!(localStorage.getItem("bh_gemini_key") || "").trim()) {
      setAiOpen(true);
      p.setAutofillStatus({
        msg: "Gemini API 키를 먼저 설정하세요 (aistudio.google.com에서 무료 발급).",
        cls: "error",
      });
      return;
    }
    p.runAiRecognition(raw).then((filled) => {
      if (filled) setAutofillOpen(false);
    });
  }

  return (
    <div className="card">
      <h2>원두 정보</h2>
      <p className="hint" style={{ margin: "-6px 0 14px" }}>
        {p.mode === "edit" ? (
          <>
            <b>{p.confirmedKey}</b> 수정 중 — 붉은 별표(<span className="req">*</span>)는 필수 입력
            항목입니다.
          </>
        ) : (
          <>
            붉은 별표(<span className="req">*</span>)는 필수 입력 항목입니다. 저장하면 번호(KEY)가 자동으로
            부여됩니다.
          </>
        )}
      </p>

      <details className="adv" open={autofillOpen} onToggle={(e) => setAutofillOpen(e.currentTarget.open)}>
        <summary>✨ AI 자동 채우기 — 상품 페이지 링크만 넣으면 AI가 빈 칸을 채워줍니다</summary>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            type="url"
            placeholder="상품 페이지 URL — https://..."
            value={autofillUrl}
            onChange={(e) => setAutofillUrl(e.target.value)}
          />
          <button
            type="button"
            className="primary"
            style={{ whiteSpace: "nowrap", flexShrink: 0 }}
            onClick={fetchFromUrl}
          >
            링크에서 가져와 AI로 채우기
          </button>
        </div>
        <textarea
          style={{ minHeight: 76 }}
          placeholder={
            "또는 페이지 텍스트를 직접 붙여넣고 아래 버튼으로 인식\n예) Process: Washed (36 hours wet fermentation + 21 days drying on raised beds)\nAltitude: 1900-2250m"
          }
          value={p.autofillText}
          onChange={(e) => p.setAutofillText(e.target.value)}
        />
        <div className="btnrow">
          <button type="button" onClick={runAi}>
            AI로 다시 인식
          </button>
          <span className={`status-line ${p.autofillStatus.cls}`} style={{ margin: 0 }}>
            {p.autofillStatus.msg}
          </span>
        </div>
        <p className="hint">AI 인식 결과는 이미 입력된 값도 덮어씁니다 — 저장 전 꼭 검토하세요.</p>
        <details className="adv" open={aiOpen} onToggle={(e) => setAiOpen(e.currentTarget.open)}>
          <summary>AI 인식 설정 — 본인 Google AI API 키 사용 (무료 등급으로 충분)</summary>
          <div className="field">
            <label>Gemini API 키</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="password"
                placeholder="AIza..."
                autoComplete="off"
                value={geminiKey}
                onChange={(e) => {
                  setGeminiKey(e.target.value);
                  localStorage.setItem("bh_gemini_key", e.target.value.trim());
                }}
              />
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener"
                style={{ whiteSpace: "nowrap" }}
              >
                무료로 발급받기 ↗
              </a>
            </div>
          </div>
          <p className="hint">
            키는 이 브라우저에만 저장되며, <b>내 키로 Google API에 직접 전송</b>됩니다(서버 경유 없음). 키가
            없으면 정확도가 낮은 휴리스틱 인식으로 대신 채워집니다.
          </p>
        </details>
      </details>
      <hr className="divider" />

      <div className="field">
        <label>
          로스터리<span className="req">*</span>
        </label>
        <input
          type="text"
          list="dl-roastery"
          placeholder="SEY"
          {...bind("ROASTERY")}
          onBlur={p.onRoasteryBlur}
        />
      </div>
      <div className="row2">
        <div className="field">
          <label>
            국가(산지)<span className="req">*</span>
          </label>
          <input type="text" list="dl-origin" placeholder="ETHIOPIA" {...bind("ORIGIN")} />
        </div>
        <div className="field">
          <label>세부 지역</label>
          <input type="text" placeholder="Yirgacheffe, Gedeb" {...bind("REGION")} />
        </div>
      </div>
      <div className="row2">
        <div className="field">
          <label>
            품종<span className="req">*</span>
          </label>
          <input type="text" list="dl-variety" placeholder="SL9" {...bind("VARIETY")} />
        </div>
        <div className="field">
          <label>
            가공방식<span className="req">*</span>
          </label>
          <input type="text" list="dl-process" placeholder="Washed" {...bind("PROCESS")} />
        </div>
      </div>
      <p className="hint" style={{ margin: "-6px 0 12px" }}>
        품종·가공방식을 특정하기 어려운 블렌드 원두는 각 목록의 "블렌드" 옵션을 선택하세요.
      </p>

      <details className="adv">
        <summary>추가 정보 펼치기 (고도 · 수확시기 · 생산자 · 랏 · 워싱스테이션)</summary>
        <div className="row2">
          <div className="field">
            <label>고도</label>
            <div className="unit-wrap">
              <input type="text" inputMode="numeric" placeholder="1900-2100" {...bind("ALTITUDE")} />
              <span className="unit">m</span>
            </div>
          </div>
          <div className="field">
            <label>수확시기</label>
            <input type="text" list="dl-harvest" placeholder="25/26" {...bind("HARVEST")} />
          </div>
        </div>
        <div className="row2">
          <div className="field">
            <label>생산자 / 농장</label>
            <input type="text" placeholder="Daniel Caro Lopez" {...bind("PRODUCER")} />
          </div>
          <div className="field">
            <label>랏 (로트명)</label>
            <input type="text" placeholder="Sewda Premium" {...bind("LOT")} />
          </div>
        </div>
        <div className="row2">
          <div className="field">
            <label>워싱스테이션</label>
            <input type="text" placeholder="Sewda" {...bind("WASHING_STATION")} />
          </div>
        </div>
      </details>

      <div className="row2" style={{ marginTop: 12 }}>
        <div className="field">
          <label>
            로스팅일<span className="req">*</span>
          </label>
          <input type="date" {...bind("ROAST_DATE")} />
        </div>
        <div className="field">
          <label>
            패키징일<span className="req">*</span>
          </label>
          <input type="date" {...bind("PACKAGE_DATE")} />
        </div>
      </div>
      <div className="row2">
        <div className="field">
          <label>용량</label>
          <div className="unit-wrap">
            <input type="text" inputMode="decimal" placeholder="20" {...bind("NET_WEIGHT")} />
            <span className="unit">g</span>
          </div>
        </div>
        <div className="field">
          <label>로스팅 포인트</label>
          <input
            type="text"
            list="dl-roastpoint"
            placeholder="#95 (라이트) — 숫자만 치면 #이 붙어요"
            {...bind("AGTRON")}
          />
        </div>
      </div>
      <div className="field">
        <label>
          플레이버 노트<span className="rec">권장</span>
        </label>
        <textarea
          placeholder="Magnolia, Honey Peach, Bergamot"
          value={p.form.TASTING_NOTE}
          onChange={(e) => p.updateField("TASTING_NOTE", e.target.value)}
          onBlur={(e) => {
            const v = capitalizeNoteSegments(e.target.value);
            if (v !== e.target.value) p.updateField("TASTING_NOTE", v);
          }}
        />
      </div>
      <div className="field">
        <label>
          기타 정보{" "}
          <span style={{ color: "var(--sub)", fontWeight: 400 }}>
            — 산지·로스터리·생산자 스토리. QR 조회 페이지에 공개 표시됩니다
          </span>
        </label>
        <textarea
          style={{ minHeight: 96 }}
          placeholder="예) 게뎁 지역 소농들의 체리를 워카 사카로 워싱스테이션에서 함께 가공한 커뮤니티 랏입니다."
          value={p.form.MEMO}
          onChange={(e) => p.updateField("MEMO", e.target.value)}
        />
      </div>
      <div className="field">
        <label>원본 페이지 URL</label>
        <input type="url" placeholder="https://..." {...bind("SOURCE_URL")} />
      </div>

      <datalist id="dl-roastery">
        {roasteryOptions.map((n) => (
          <option key={n} value={n}>
            {withLogo.has(n) ? "★ 저장된 로고" : ""}
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
