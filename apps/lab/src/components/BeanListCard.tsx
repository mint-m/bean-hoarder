// 내 원두 목록 카드 — 수정/URL 복사/삭제 + CSV 백업·복원 + 덱 링크.
import { useRef } from "react";
import { copyText } from "../lib/format";
import type { BeanPublicRow } from "../types";
import { CopyButton } from "./FormBits";

interface Props {
  beans: BeanPublicRow[] | null;
  site: string;
  onEdit: (key: string) => void;
  onDelete: (key: string) => void;
  onRefresh: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onBack: () => void;
  /** 데모 계정 — 서버가 쓰기를 막으므로 수정·삭제·복원 버튼을 아예 내보내지 않는다 */
  readOnly?: boolean;
}

export default function BeanListCard(p: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="card">
      <div className="stage-head">
        <button type="button" className="stage-back" onClick={p.onBack}>
          ← 등록으로
        </button>
      </div>
      <h2>내 원두 목록</h2>
      <div id="bean-list">
        {p.beans === null ? (
          <p className="hint error">목록을 불러오지 못했습니다.</p>
        ) : p.beans.length === 0 ? (
          <p className="hint">아직 등록된 원두가 없습니다. 첫 원두를 등록해 보세요.</p>
        ) : (
          <div className="bean-rows">
            {p.beans.map((b) => (
              <div className="bean-row" key={b.KEY}>
                <div className="bean-row-main">
                  <span className="bkey">{b.KEY}</span>
                  <span className="borigin">{b.ORIGIN || ""}</span>
                  <span className="bmeta">
                    {b.ROASTERY || ""}
                    {b.ROAST_DATE ? ` · 로스팅 ${b.ROAST_DATE}` : ""}
                  </span>
                </div>
                <div className="rowbtns">
                  {!p.readOnly && (
                    <button type="button" onClick={() => p.onEdit(b.KEY)}>
                      수정
                    </button>
                  )}
                  <CopyButton label="URL 복사" onCopy={() => copyText(`${p.site}/${b.KEY}`)} />
                  {!p.readOnly && (
                    <button type="button" className="danger" onClick={() => p.onDelete(b.KEY)}>
                      삭제
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="btnrow">
        <button type="button" onClick={p.onRefresh}>
          새로고침
        </button>
        <button type="button" onClick={p.onExport}>
          CSV 백업 다운로드
        </button>
        {!p.readOnly && (
          <button type="button" onClick={() => fileRef.current?.click()}>
            CSV 백업 복원
          </button>
        )}
        <button type="button" onClick={() => window.open("/deck", "_blank")}>
          덱으로 보기 ↗
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) p.onImport(file);
        }}
      />
      <p className="hint" style={{ marginTop: 8 }}>
        복원은 내 KEY만 반영되고, 같은 KEY는 덮어씁니다.
      </p>
    </div>
  );
}
