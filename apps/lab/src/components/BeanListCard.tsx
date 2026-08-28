// 내 원두 목록 카드 — 수정/조회 페이지 열기/삭제 + CSV 백업·복원 + 덱 링크.
import { useRef } from "react";
import type { BeanPublicRow } from "../types";

interface Props {
  beans: BeanPublicRow[] | null;
  onEdit: (key: string) => void;
  onDelete: (key: string) => void;
  onRefresh: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onBack: () => void;
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
                  <button type="button" onClick={() => p.onEdit(b.KEY)}>
                    수정
                  </button>
                  {/* 주소를 복사해 어딘가에 붙여넣는 것보다, 그 화면을 바로 열어 보는 것이 이 자리에서
                      실제로 하려던 일이다. 경로만 쓴다 — 절대 주소를 쓰면 프리뷰에서 눌러도
                      프로덕션이 열려 방금 고친 화면을 확인할 수 없다. */}
                  <button type="button" onClick={() => window.open(`/${b.KEY}`, "_blank", "noopener")}>
                    열기 ↗
                  </button>
                  <button type="button" className="danger" onClick={() => p.onDelete(b.KEY)}>
                    삭제
                  </button>
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
        <button type="button" onClick={() => fileRef.current?.click()}>
          CSV 백업 복원
        </button>
        {/* 덱은 이 앱을 떠나 "보러 가는" 곳이라 같은 탭에서 이동한다 — 새 창으로 띄우면 탭이
            쌓이고, 돌아오는 길이 브라우저 뒤로가기뿐이라 오히려 헤맨다. */}
        <button
          type="button"
          onClick={() => {
            location.href = "/deck";
          }}
        >
          덱으로 보기 →
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
