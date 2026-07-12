// 라벨 미리보기 카드 — 사이즈 빠른 전환 · SVG 미리보기 · QR 검증 배지 · 등록/복사/다운로드
// + 모바일 미리보기 시트(FAB).
import { type LabelDesign, renderPngBlob, SIZE_SPECS } from "@bnhd/label";
import { useState } from "react";
import { designForSize } from "../lib/design";
import { copyQrImage, copyText, download } from "../lib/format";
import type { FormState, StatusLine } from "../types";

interface Props {
  label: { svg: string; content: string };
  verify: { text: string; cls: string };
  design: LabelDesign;
  setDesign: (updater: (d: LabelDesign) => LabelDesign) => void;
  mode: "new" | "edit";
  confirmedKey: string | null;
  currentKey: string;
  site: string;
  status: StatusLine;
  setStatus: (s: StatusLine) => void;
  onSave: () => void;
  onNew: () => void;
  form: FormState;
  pruneSelections: (form: FormState) => void;
}

export default function PreviewCard(p: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const enabled = !!p.confirmedKey;

  function selectSize(key: string) {
    p.setDesign((d) => designForSize(d, key));
    p.pruneSelections(p.form); // 사이즈 변경으로 기본 표시 항목이 바뀌면 값 없는 선택 정리
  }

  async function copyUrl() {
    const ok = await copyText(`${p.site}/${p.confirmedKey}`);
    p.setStatus({
      msg: ok ? `상세 URL 복사됨 — ${p.site}/${p.confirmedKey}` : "복사 실패 — 브라우저 권한을 확인하세요.",
      cls: ok ? "ok" : "error",
    });
  }

  async function copyQr() {
    if (!p.confirmedKey) return;
    const r = await copyQrImage(p.confirmedKey);
    if (r.ok) {
      p.setStatus({ msg: "QR 이미지가 클립보드에 복사되었습니다.", cls: "ok" });
    } else if (r.blob) {
      download(`${p.confirmedKey}_qr.png`, r.blob);
      p.setStatus({
        msg: "이 브라우저는 이미지 클립보드를 지원하지 않아 PNG로 다운로드했습니다.",
        cls: "ok",
      });
    }
  }

  return (
    <>
      <div className="card sticky-col">
        <h2>
          라벨 미리보기{" "}
          <span style={{ textTransform: "none", letterSpacing: 0 }}>
            {p.confirmedKey ? `— 확정 KEY ${p.confirmedKey}` : `— 예상 KEY ${p.currentKey}`}
          </span>
        </h2>
        <div className="toggles" style={{ margin: "-2px 0 12px" }}>
          {Object.entries(SIZE_SPECS).map(([key, S]) => (
            <label key={key}>
              <input
                type="radio"
                name="lbl-size-quick"
                value={key}
                checked={p.design.size === key}
                onChange={() => selectSize(key)}
              />{" "}
              {S.label}
            </label>
          ))}
        </div>
        <div className="preview-wrap">
          {/* biome-ignore lint/security/noDangerouslySetInnerHtml: 라벨 SVG는 우리 렌더러(@bnhd/label)가 escape를 책임지는 신뢰 출력 */}
          <div dangerouslySetInnerHTML={{ __html: p.label.svg }} />
        </div>
        <div className="qr-info">QR: {p.label.content}</div>
        <div className={`verify ${p.verify.cls}`}>{p.verify.text}</div>

        <div className="btnrow">
          <button type="button" className="primary" onClick={p.onSave}>
            {p.mode === "edit" ? `수정 저장 (${p.confirmedKey})` : "등록 — KEY 발급받기"}
          </button>
          <button type="button" onClick={p.onNew}>
            새 원두 입력
          </button>
        </div>
        <div className={`status-line ${p.status.cls}`}>{p.status.msg}</div>
        <div className="btnrow">
          <button type="button" disabled={!enabled} onClick={copyUrl}>
            상세 URL 복사
          </button>
          <button type="button" disabled={!enabled} onClick={copyQr}>
            QR 이미지 복사
          </button>
          <button
            type="button"
            disabled={!enabled}
            onClick={() => window.open(`/${p.confirmedKey}`, "_blank")}
          >
            상세 페이지 열기 ↗
          </button>
        </div>
        <p className="hint" style={{ marginTop: 12 }}>
          라벨 이미지 다운
        </p>
        <div className="btnrow" style={{ marginTop: 4 }}>
          <button
            type="button"
            onClick={async () =>
              download(`${p.currentKey}_${p.design.size}_203dpi.png`, await renderPngBlob(p.label.svg, 203))
            }
          >
            PNG 203dpi
          </button>
          <button
            type="button"
            onClick={async () =>
              download(`${p.currentKey}_${p.design.size}_320dpi.png`, await renderPngBlob(p.label.svg, 320))
            }
          >
            PNG 320dpi
          </button>
          <button
            type="button"
            onClick={() =>
              download(
                `${p.currentKey}_${p.design.size}.svg`,
                new Blob([p.label.svg], { type: "image/svg+xml" }),
              )
            }
          >
            SVG
          </button>
        </div>
        <p className="hint">
          등록 전 KEY는 예상값입니다. 등록 후 확정 KEY로 URL·QR 복사와 인쇄를 진행하세요.
        </p>
      </div>

      <button id="fab-preview" type="button" onClick={() => setSheetOpen(true)}>
        라벨 미리보기
      </button>
      {sheetOpen && (
        // biome-ignore lint/a11y/noStaticElementInteractions: 배경 클릭 닫기는 보조 동선 — 키보드 사용자는 닫기 버튼 사용
        // biome-ignore lint/a11y/useKeyWithClickEvents: 위와 동일
        <div
          id="sheet"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSheetOpen(false);
          }}
        >
          <div className="sheet-card">
            <div className="sheet-head">
              <h2>라벨 미리보기</h2>
              <button type="button" onClick={() => setSheetOpen(false)}>
                닫기
              </button>
            </div>
            <div className="preview-wrap">
              {/* biome-ignore lint/security/noDangerouslySetInnerHtml: 위와 동일한 신뢰 SVG */}
              <div dangerouslySetInnerHTML={{ __html: p.label.svg }} />
            </div>
            <div className={`verify ${p.verify.cls}`}>{p.verify.text}</div>
          </div>
        </div>
      )}
    </>
  );
}
