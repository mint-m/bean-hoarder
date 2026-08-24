// 라벨 도안 화면 — 선택 부가물.
//
// 라벨 레이아웃은 사람마다 원하는 바가 다르고 프린터 호환도 제각각이다. 그래서 서비스의 산출물은
// QR이고, 라벨 도안은 "원하는 사람만" 들어오는 별도 화면으로 둔다. 기능은 그대로다 —
// 사이즈 전환 · 미리보기 · PNG/SVG 다운로드, 세부 옵션은 children(DesignCard).
import { type LabelDesign, renderPngBlob, SIZE_SPECS } from "@bnhd/label";
import type { ReactNode } from "react";
import { designForSize } from "../lib/design";
import { download } from "../lib/format";
import type { FormState } from "../types";

interface Props {
  label: { svg: string; content: string };
  design: LabelDesign;
  setDesign: (updater: (d: LabelDesign) => LabelDesign) => void;
  form: FormState;
  pruneSelections: (form: FormState) => void;
  currentKey: string;
  onBack: () => void;
  /** 라벨 옵션(DesignCard) */
  children?: ReactNode;
}

export default function LabelPanel(p: Props) {
  function selectSize(key: string) {
    p.setDesign((d) => designForSize(d, key));
    p.pruneSelections(p.form); // 사이즈가 바뀌면 기본 표시 항목이 달라진다 — 값 없는 선택 정리
  }

  return (
    <div className="card label-stage">
      <div className="stage-head">
        <button type="button" className="stage-back" onClick={p.onBack}>
          ← QR로
        </button>
      </div>

      <h2>
        라벨 도안 <span className="h2-aux">선택 — 쓰던 양식이 있으면 QR만 써도 됩니다</span>
      </h2>

      <div className="toggles">
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

      <div className="btnrow">
        <button
          type="button"
          onClick={async () =>
            download(`${p.currentKey}_${p.design.size}.png`, await renderPngBlob(p.label.svg, 203))
          }
        >
          PNG 내려받기
        </button>
        <button
          type="button"
          onClick={async () =>
            download(`${p.currentKey}_${p.design.size}_고해상도.png`, await renderPngBlob(p.label.svg, 320))
          }
        >
          PNG (고해상도)
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

      {p.children}
    </div>
  );
}
