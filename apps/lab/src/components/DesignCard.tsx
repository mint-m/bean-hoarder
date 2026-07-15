// 라벨 디자인 카드 — 인쇄 색상 · 부제목/스펙 토글(우선순위 ↑↓) · 글자 크기 · 로고 관리.
import { type LabelDesign, SPEC_POOL, SUB_POOL } from "@bnhd/label";
import type { ApiResult } from "../lib/api";
import { insertByPriority } from "../lib/design";
import { downscaleLogo } from "../lib/format";
import type { FormKey, FormState, StatusLine } from "../types";
import type { LogoState } from "../Workspace";

interface Props {
  design: LabelDesign;
  setDesign: (updater: (d: LabelDesign) => LabelDesign) => void;
  form: FormState;
  logo: LogoState;
  setLogo: (l: LogoState) => void;
  logosMap: Record<string, string>;
  setLogosMap: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  logoStatus: StatusLine;
  setLogoStatus: (s: StatusLine) => void;
  saveLogoForRoastery: (dataUrl: string) => Promise<void>;
  call: <T = Record<string, unknown>>(path: string, opts?: RequestInit) => Promise<ApiResult<T>>;
  logoMaxLen: number;
}

export default function DesignCard(p: Props) {
  const { design, setDesign } = p;
  const roasteryUpper = p.form.ROASTERY.trim().toUpperCase();

  const hasVal = (key: string) => !!(p.form[key as FormKey] || "").trim();

  // 스펙 토글: 선택된 항목(우선순위 순) 먼저, 미선택 항목 뒤에
  const specOrder = [
    ...design.specFields,
    ...SPEC_POOL.map(([k]) => k).filter((k) => !design.specFields.includes(k)),
  ];

  function moveSpecPriority(key: string, dir: -1 | 1) {
    setDesign((d) => {
      const arr = [...d.specFields];
      const i = arr.indexOf(key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= arr.length) return d;
      [arr[i], arr[j]] = [arr[j] as string, arr[i] as string];
      return { ...d, specFields: arr };
    });
  }

  // ── 로고 저장/삭제 (서버 저장은 Workspace.saveLogoForRoastery — 로스터리 blur 자동 저장과 공유) ──
  async function setManualLogo(rawDataUrl: string) {
    let dataUrl: string;
    try {
      dataUrl = await downscaleLogo(rawDataUrl);
    } catch (_e) {
      p.setLogoStatus({ msg: "로고 이미지를 읽지 못했습니다.", cls: "error" });
      return;
    }
    if (dataUrl.length > p.logoMaxLen) {
      p.setLogoStatus({ msg: "로고 이미지가 너무 큽니다 (100KB 제한).", cls: "error" });
      return;
    }
    p.setLogo({ dataUrl, source: "manual" });
    setDesign((d) => ({ ...d, showLogo: true }));
    await p.saveLogoForRoastery(dataUrl);
  }

  async function loadLogoFromUrl(url: string) {
    if (!url) {
      p.setLogoStatus({ msg: "로고 이미지 URL을 입력하세요.", cls: "error" });
      return;
    }
    p.setLogoStatus({ msg: "이미지를 가져오는 중…", cls: "loading" });
    const { body } = await p.call<{ kind: string; dataUrl: string }>("/api/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (body?.ok && body.kind === "image") {
      await setManualLogo(body.dataUrl);
    } else if (body?.ok) {
      p.setLogoStatus({
        msg: "이 URL은 이미지가 아닙니다 — 이미지 파일(.png/.jpg/.svg 등) 주소인지 확인하세요.",
        cls: "error",
      });
    } else {
      p.setLogoStatus({ msg: body?.error || "이미지를 가져오지 못했습니다.", cls: "error" });
    }
  }

  async function deleteSavedLogo() {
    if (!roasteryUpper) {
      p.setLogoStatus({ msg: "삭제할 로스터리 이름을 먼저 입력하세요.", cls: "error" });
      return;
    }
    if (!p.logosMap[roasteryUpper]) {
      p.setLogoStatus({ msg: `${roasteryUpper}에 저장된 로고가 없습니다.`, cls: "error" });
      return;
    }
    if (!confirm(`${roasteryUpper}에 저장된 로고를 삭제할까요?`)) return;
    const { body } = await p.call("/api/logos", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roastery: roasteryUpper }),
    });
    if (body?.ok) {
      p.setLogosMap((m) => {
        const next = { ...m };
        delete next[roasteryUpper];
        return next;
      });
      if (p.logo.source === "server") p.setLogo({ dataUrl: null, source: null });
      p.setLogoStatus({ msg: `${roasteryUpper} 저장 로고 삭제됨`, cls: "ok" });
    } else {
      p.setLogoStatus({ msg: body?.error || "로고 삭제 실패", cls: "error" });
    }
  }

  // 로고 상태 배지 (구 renderLogoUi)
  let logoStateText: string;
  let logoStateCls: string;
  if (p.logo.dataUrl) {
    if (p.logo.source === "server") {
      logoStateText = `저장된 로고 적용됨${roasteryUpper ? ` — ${roasteryUpper}` : ""}`;
      logoStateCls = "saved";
    } else {
      logoStateText = roasteryUpper
        ? `새 로고 (${roasteryUpper}에 저장됨)`
        : "새 로고 — 로스터리 이름 입력 시 저장";
      logoStateCls = "unsaved";
    }
  } else {
    logoStateText =
      roasteryUpper && p.logosMap[roasteryUpper]
        ? `${roasteryUpper}에 저장된 로고 있음 — 표시하려면 로고 표시 체크`
        : "로고 없음";
    logoStateCls = "none";
  }

  return (
    <div className="card">
      <h2>라벨 디자인</h2>
      <p className="hint" style={{ margin: "-6px 0 10px" }}>
        인쇄 색상
      </p>
      <div className="toggles">
        {(
          [
            ["color", "컬러 (레드+블랙)"],
            ["mono", "흑백"],
          ] as ["color" | "mono", string][]
        ).map(([v, label]) => (
          <label key={v}>
            <input
              type="radio"
              name="color-mode"
              value={v}
              checked={design.colorMode === v}
              onChange={() => setDesign((d) => ({ ...d, colorMode: v }))}
            />{" "}
            {label}
          </label>
        ))}
      </div>

      <p className="hint" style={{ margin: "14px 0 10px" }}>
        부제목 줄에 함께 표시할 정보 — 값이 없으면 선택할 수 없습니다
      </p>
      <div className="toggles">
        {SUB_POOL.map(([key, label]) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={design.subFields.includes(key)}
              disabled={!hasVal(key)}
              onChange={(e) => {
                setDesign((d) => {
                  if (e.target.checked) {
                    if (d.subFields.length >= 3 || d.subFields.includes(key)) return d;
                    return { ...d, subFields: [...d.subFields, key] };
                  }
                  return { ...d, subFields: d.subFields.filter((k) => k !== key) };
                });
              }}
            />{" "}
            {label}
          </label>
        ))}
      </div>

      <p className="hint" style={{ margin: "14px 0 10px" }}>
        하단 스펙 칸에 표시할 정보 — ↑↓로 우선순위 변경, 공간이 부족하면 낮은 순위부터 자동 숨김.
        로스팅일·패키징일은 항상 별도 고정 표시(카드형은 QR 옆)됩니다.
      </p>
      <div className="toggles">
        {specOrder.map((key) => {
          const pool = SPEC_POOL.find(([k]) => k === key);
          if (!pool) return null;
          const label = pool[2];
          const checked = design.specFields.includes(key);
          const idx = design.specFields.indexOf(key);
          return (
            <div className="spec-row" key={key}>
              <label>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!hasVal(key)}
                  onChange={(e) => {
                    setDesign((d) =>
                      e.target.checked
                        ? { ...d, specFields: insertByPriority(d.specFields, key) }
                        : { ...d, specFields: d.specFields.filter((k) => k !== key) },
                    );
                  }}
                />{" "}
                {label}
              </label>
              <span className={`reorder-btns${checked ? "" : " hidden"}`}>
                <button
                  type="button"
                  aria-label="우선순위 올리기"
                  disabled={idx <= 0}
                  onClick={() => moveSpecPriority(key, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label="우선순위 내리기"
                  disabled={idx < 0 || idx >= design.specFields.length - 1}
                  onClick={() => moveSpecPriority(key, 1)}
                >
                  ↓
                </button>
              </span>
            </div>
          );
        })}
      </div>

      <details className="adv">
        <summary>글자 크기 조정</summary>
        <SliderField
          label="헤드라인 크기"
          value={design.headlineSize}
          display={`${design.headlineSize.toFixed(1)}mm`}
          size={design.size}
          kind="headline"
          onChange={(v) => setDesign((d) => ({ ...d, headlineSize: v }))}
        />
        <SliderField
          label="스펙 값 크기"
          value={design.specValueSize}
          display={`${design.specValueSize.toFixed(2)}mm`}
          size={design.size}
          kind="specVal"
          onChange={(v) => setDesign((d) => ({ ...d, specValueSize: v }))}
        />
      </details>

      <div className="field" style={{ margin: "12px 0 0" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ink)" }}>
          <input
            type="checkbox"
            checked={design.showLogo}
            onChange={(e) => setDesign((d) => ({ ...d, showLogo: e.target.checked }))}
          />{" "}
          로고 표시 (라벨 우상단)
        </label>
        <p className="hint" style={{ margin: "4px 0 8px" }}>
          로스터리 이름 입력 후 로고를 올리면 저장되어, 다음부터 이름만 입력해도 자동 적용됩니다.
        </p>
        <div className="logo-row">
          <div className="logo-thumb">
            {p.logo.dataUrl ? (
              <img src={p.logo.dataUrl} alt="로고 미리보기" />
            ) : (
              <span className="logo-thumb-empty">
                로고
                <br />
                없음
              </span>
            )}
          </div>
          <div className="logo-controls">
            <div className={`logo-state ${logoStateCls}`}>{logoStateText}</div>
            <input
              type="file"
              accept="image/png,image/svg+xml,image/jpeg,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => setManualLogo(reader.result as string);
                reader.readAsDataURL(file);
              }}
            />
            <LogoUrlLoader onLoad={loadLogoFromUrl} />
            <div className={`status-line logo-status ${p.logoStatus.cls}`} style={{ marginTop: 6 }}>
              {p.logoStatus.msg}
            </div>
          </div>
        </div>
        <div className="btnrow" style={{ marginTop: 8 }}>
          <button
            type="button"
            onClick={() => {
              p.setLogo({ dataUrl: null, source: null });
              p.setLogoStatus({ msg: "현재 로고를 지웠습니다 (저장된 로고는 그대로).", cls: "" });
            }}
          >
            현재 로고 지우기
          </button>
          <button type="button" className="danger" onClick={deleteSavedLogo}>
            저장된 로고 삭제
          </button>
        </div>
      </div>
    </div>
  );
}

import { SIZE_SPECS } from "@bnhd/label";
import { useState } from "react";

function SliderField({
  label,
  value,
  display,
  size,
  kind,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  size: string;
  kind: "headline" | "specVal";
  onChange: (v: number) => void;
}) {
  const S = SIZE_SPECS[size];
  const range = S ? S[kind] : { min: 1, max: 4 };
  return (
    <div className="slider-field">
      <label>
        <span>{label}</span>
        <span>{display}</span>
      </label>
      <input
        type="range"
        min={range.min}
        max={range.max}
        step={kind === "headline" ? 0.1 : 0.05}
        value={value}
        onChange={(e) => onChange(Number.parseFloat(e.target.value))}
      />
    </div>
  );
}

function LogoUrlLoader({ onLoad }: { onLoad: (url: string) => Promise<void> }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
      <input
        type="url"
        placeholder="이미지 URL — https://.../logo.png"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <button
        type="button"
        style={{ whiteSpace: "nowrap", flexShrink: 0 }}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onLoad(url.trim());
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "불러오는 중…" : "불러오기"}
      </button>
    </div>
  );
}
