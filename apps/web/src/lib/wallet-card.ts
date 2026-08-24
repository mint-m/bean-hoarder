// 월렛 카드 마크업 — 내 원두 덱(/deck)과 정적 데모 덱(/demo)이 함께 쓴다.
//
// 두 페이지는 데이터 출처만 다르다(로그인 세션의 D1 목록 / 저장소에 고정된 데모 데이터).
// 보이는 카드는 같아야 하므로 마크업은 여기 한 곳에서만 만든다 — 짝이 되는 스타일은
// public/deck.css에 있고, 클래스 이름이 그 파일과의 계약이다.
import { buildHeadline, type HeadlineRow, headlineUsedFields } from "@bnhd/schema/headline";
import { flavorGradient, originSignature } from "./coffee-color";
import { daysSince, escapeHtml } from "./dom";

/** 카드 본문에 테이스팅 노트를 보일지 — 덱은 사용자 설정, 데모는 항상 켠다 */
export interface WalletCardOptions {
  notes: boolean;
}

export function walletCardHTML(b: HeadlineRow, { notes: notesEnabled }: WalletCardOptions): string {
  const g = (k: string) => String(b[k] ?? "").trim();
  const n = daysSince(g("ROAST_DATE"));
  const dday = n != null ? `<span class="dday">D+${n}</span>` : "";
  // 헤드라인이 이미 쓴 필드(세부지역 등)는 메타에서 제외 — 라벨과 동일하게 중복 방지
  const usedInHead = headlineUsedFields(b);
  const meta = ["REGION", "VARIETY", "PROCESS"]
    .filter((k) => !usedInHead.includes(k))
    .map(g)
    .filter(Boolean)
    .join(" · ");
  const foot = [
    g("ROAST_DATE") && `RSTD ${g("ROAST_DATE")}`,
    g("NET_WEIGHT") && `NET ${g("NET_WEIGHT")}`,
    g("AGTRON").split(/\s+/)[0],
  ]
    .filter(Boolean)
    .join(" · ");
  const note = notesEnabled && g("TASTING_NOTE");

  const headline = buildHeadline(b) || g("KEY");
  // 커피 컬러(화면 전용 — DESIGN.md §3): 피크 밴드에 향미 그라데이션, 헤드라인 옆에 산지 시그니처 닷.
  // 스택 상태에서 보이는 유일한 영역이 밴드이므로, 여기가 카드의 "색 띠" 정체성을 전부 짊어진다.
  const color = originSignature(g("ORIGIN"));
  const dot = color ? `<span class="w-origin-dot" style="background:${color}"></span>` : "";
  const grad = flavorGradient(g("TASTING_NOTE"));
  const bandStyle = grad ? ` style="background-image:${grad}"` : "";
  const archivedClass = b.ARCHIVED ? " archived" : "";
  return `<div class="wcard${archivedClass}" tabindex="0" role="link"
      aria-label="${escapeHtml(headline)} 상세보기" data-key="${g("KEY")}">
    <button type="button" class="wcard-menu" aria-label="메뉴 열기">⋯</button>
    <div class="w-band"${bandStyle}>
      <div class="w-band-top"><span class="w-origin-label">${dot}<span class="w-origin-text">${escapeHtml(headline)}</span></span>${dday}</div>
      <div class="w-band-sub"><span class="w-roastery">${escapeHtml(g("ROASTERY"))}</span><span class="w-key">${g("KEY")}</span></div>
    </div>
    <div class="w-body">
      ${meta ? `<div class="w-meta">${escapeHtml(meta)}</div>` : ""}
      ${note ? `<p class="w-note">${escapeHtml(note)}</p>` : ""}
      ${foot ? `<div class="w-foot">${escapeHtml(foot)}</div>` : ""}
    </div>
  </div>`;
}

/** 보관(archived) 카드는 덱 최하단으로, 나머지는 최신 KEY 먼저 */
export function sortBeans(beans: HeadlineRow[]): HeadlineRow[] {
  return beans.slice().sort((a, b) => {
    if (!!a.ARCHIVED !== !!b.ARCHIVED) return a.ARCHIVED ? 1 : -1;
    return String(b.KEY ?? "").localeCompare(String(a.KEY ?? ""));
  });
}
