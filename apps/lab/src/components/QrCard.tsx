// QR 발급 화면 — 이 서비스가 책임지는 산출물.
//
// 라벨 레이아웃은 쓰는 사람마다 다르고 프린터 호환도 보장할 수 없다. 그래서 끝까지 책임지는 것은
// "어떤 라벨 소프트웨어에 얹어도 스캔되는 QR"과 그 QR이 도착하는 상세 페이지다.
//
// 등록(KEY 확정)은 입력 화면이 맡고, 여기는 확정된 KEY로 만든 결과물만 보여준다 — 한 화면에 한 맥락.
import { QR_DOT_OPTIONS, qrSizeMM, renderPngBlob } from "@bnhd/label";
import { copyImage, copyText, download } from "../lib/format";
import type { StatusLine } from "../types";
import { CopyButton } from "./FormBits";

interface Props {
  qr: { svg: string; content: string; moduleCount: number; codeSize: number; size: number };
  qrDots: number;
  setQrDots: (dots: number) => void;
  verify: { text: string; cls: string };
  confirmedKey: string;
  site: string;
  status: StatusLine;
  setStatus: (s: StatusLine) => void;
  onBackToInput: () => void;
  onLabel: () => void;
  onNew: () => void;
}

export default function QrCard(p: Props) {
  const detailUrl = `${p.site}/${p.confirmedKey}`;

  async function copyQrPng() {
    // 클립보드용은 화면 붙여넣기가 목적이라 넉넉한 해상도로
    const blob = await renderPngBlob(p.qr.svg, 600);
    const r = await copyImage(blob);
    if (!r.ok) {
      download(`${p.confirmedKey}_qr.png`, r.blob);
      p.setStatus({ msg: "이 브라우저는 이미지 클립보드를 지원하지 않아 PNG로 내려받았습니다.", cls: "ok" });
    }
    return r.ok;
  }

  return (
    <div className="card qr-card">
      <div className="stage-head">
        <button type="button" className="stage-back" onClick={p.onBackToInput}>
          ← 입력으로
        </button>
      </div>

      <h2>
        QR 발급 <span className="h2-aux">확정 KEY {p.confirmedKey}</span>
      </h2>

      <div className="qr-out">
        <div className="qr-visual">
          {/* biome-ignore lint/security/noDangerouslySetInnerHtml: QR SVG는 우리 렌더러(@bnhd/label)가 만든 신뢰 출력 */}
          <div className="qr-img" dangerouslySetInnerHTML={{ __html: p.qr.svg }} />
          <div className={`verify ${p.verify.cls}`}>{p.verify.text}</div>
        </div>

        <div className="qr-meta">
          {/* ① 도착지 — 주소와 그 주소로 가는 일은 한 묶음이다 (주소 자체가 링크라 별도 버튼이 필요 없다) */}
          <div className="qr-field">
            <span className="qr-label">스캔하면 열리는 주소</span>
            <a className="qr-url" href={`/${p.confirmedKey}`} target="_blank" rel="noopener">
              {detailUrl}
            </a>
            <div className="btnrow">
              <CopyButton label="URL 복사" onCopy={() => copyText(detailUrl)} />
            </div>
          </div>

          {/* ② 인쇄물 — 크기를 고르고 그 크기의 이미지를 가져가는 일이 한 묶음 */}
          <div className="qr-field">
            <span className="qr-label">인쇄 크기</span>
            <div className="toggles">
              {QR_DOT_OPTIONS.map((d) => (
                <label key={d}>
                  <input
                    type="radio"
                    name="qr-dots"
                    checked={p.qrDots === d}
                    onChange={() => p.setQrDots(d)}
                  />{" "}
                  {qrSizeMM(d, p.qr.moduleCount).toFixed(1)}mm
                </label>
              ))}
            </div>
            <div className="btnrow">
              <CopyButton label="QR 이미지 복사" onCopy={copyQrPng} />
              <button
                type="button"
                onClick={async () => download(`${p.confirmedKey}_qr.png`, await renderPngBlob(p.qr.svg, 203))}
              >
                PNG 내려받기
              </button>
              <button
                type="button"
                onClick={() =>
                  download(`${p.confirmedKey}_qr.svg`, new Blob([p.qr.svg], { type: "image/svg+xml" }))
                }
              >
                SVG (크기 자유)
              </button>
            </div>
          </div>

          <div className={`status-line ${p.status.cls}`}>{p.status.msg}</div>

          <p className="hint">
            여백은 최소로만 넣었습니다 — <b>주변은 흰 바탕</b>이어야 스캔됩니다.
          </p>
        </div>
      </div>

      <div className="stage-foot">
        <button type="button" onClick={p.onLabel}>
          라벨 도안까지 만들기 →
        </button>
        <button type="button" className="primary" onClick={p.onNew}>
          새 원두 등록
        </button>
      </div>
    </div>
  );
}
