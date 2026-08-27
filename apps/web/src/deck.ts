// 내 원두 덱(/deck) 진입점 — 구 public/deck.html 인라인 스크립트의 이식.
// 로그인한 사용자의 원두를 월렛 카드처럼 쌓아 보여주고, 카드 메뉴로 보관·삭제를 처리한다.
import { buildHeadline, type HeadlineRow } from "@bnhd/schema/headline";
import { type Account, loadSession, migrateLegacyPin } from "@bnhd/session";
import { el, escapeHtml } from "./lib/dom";
import { sortBeans, walletCardHTML } from "./lib/wallet-card";

let account: Account = loadSession();
let allBeans: HeadlineRow[] = [];
// 카드에 테이스팅 노트 미리보기를 표시할지 — 기본 켜짐, 사용자가 끄면 기억
let notesEnabled = localStorage.getItem("bh_deck_notes") !== "0";

function showStatus(html: string): void {
  const node = el("deck-status");
  node.innerHTML = html;
  node.classList.remove("hidden");
}

function renderDeck(beans: HeadlineRow[]): void {
  const deck = el("deck");
  if (!beans.length) {
    deck.innerHTML = "";
    showStatus(
      allBeans.length
        ? "검색 결과가 없습니다."
        : '아직 등록된 원두가 없습니다.<br><br><a href="/lab">랩에서 첫 원두 등록하기 →</a>',
    );
    return;
  }
  el("deck-status").classList.add("hidden");
  deck.innerHTML = sortBeans(beans)
    .map((b) => walletCardHTML(b, { notes: notesEnabled, menu: true }))
    .join("");
  // 카드 본문 클릭·엔터 = 바로 상세 이동. 메뉴 버튼(⋯)만 상세 이동을 막고 액션시트를 연다.
  for (const node of deck.querySelectorAll<HTMLElement>(".wcard")) {
    const key = node.dataset.key as string;
    node.addEventListener("click", () => {
      location.href = `/${key}`;
    });
    node.addEventListener("keydown", (e) => {
      if (e.target !== node) return; // 메뉴 버튼에 포커스 중이면 카드 자체의 엔터 동작을 건너뜀
      if (e.key === "Enter") {
        e.preventDefault();
        location.href = `/${key}`;
      }
    });
    node.querySelector(".wcard-menu")?.addEventListener("click", (e) => {
      e.stopPropagation();
      openSheet(key);
    });
  }
}

// ── 카드 탭 시 뜨는 메뉴: 상세보기 · 숨기기(보관) · 삭제 ──
const sheetBackdrop = el("sheet-backdrop");
const sheetTitle = el("sheet-title");
let sheetKey: string | null = null;

function openSheet(key: string): void {
  const bean = allBeans.find((b) => b.KEY === key);
  if (!bean) return;
  sheetKey = key;
  sheetTitle.innerHTML = `<b>${escapeHtml(buildHeadline(bean) || key)}</b> · ${escapeHtml(key)}`;
  const archiveBtn = sheetBackdrop.querySelector('[data-act="archive"]');
  if (archiveBtn) archiveBtn.textContent = bean.ARCHIVED ? "숨기기 해제" : "숨기기";
  sheetBackdrop.classList.add("open");
}

function closeSheet(): void {
  sheetBackdrop.classList.remove("open");
  sheetKey = null;
}

interface ApiResult {
  res: { status: number };
  body: { ok?: boolean; error?: string; beans?: HeadlineRow[] } | null;
}

async function apiCall(path: string, opts: RequestInit = {}): Promise<ApiResult> {
  try {
    const res = await fetch(path, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${account.token}`,
        ...((opts.headers as Record<string, string>) || {}),
      },
    });
    const body = await res.json().catch(() => null);
    return { res, body };
  } catch (_e) {
    // 오프라인·DNS 실패 등 fetch 자체가 던지는 예외 — 호출부는 res.status/body.ok로만 결과를
    // 확인하므로 같은 모양으로 돌려준다.
    return {
      res: { status: 0 },
      body: { ok: false, error: "네트워크 연결 오류가 발생했습니다. 인터넷 연결을 확인해 주세요." },
    };
  }
}

async function toggleArchive(key: string): Promise<void> {
  const bean = allBeans.find((b) => b.KEY === key);
  if (!bean) return;
  const nextArchived = !bean.ARCHIVED;
  const { body } = await apiCall(`/api/bean/${key}/archive`, {
    method: "PATCH",
    body: JSON.stringify({ archived: nextArchived }),
  });
  if (body?.ok) {
    bean.ARCHIVED = nextArchived;
    applyFilter();
  } else {
    alert(body?.error || "처리하지 못했습니다.");
  }
}

async function deleteBeanFromDeck(key: string): Promise<void> {
  if (!confirm(`${key} 를 삭제할까요? 인쇄된 라벨의 QR은 더 이상 조회되지 않습니다.`)) return;
  const { body } = await apiCall(`/api/bean/${key}`, { method: "DELETE" });
  if (body?.ok) {
    allBeans = allBeans.filter((b) => b.KEY !== key);
    hideFilterIfAlone();
    applyFilter();
  } else {
    alert(body?.error || "삭제하지 못했습니다.");
  }
}

sheetBackdrop.addEventListener("click", (e) => {
  if (e.target === sheetBackdrop) closeSheet();
});
for (const btn of sheetBackdrop.querySelectorAll<HTMLButtonElement>(".sheet-btn")) {
  btn.addEventListener("click", () => {
    const key = sheetKey;
    const act = btn.dataset.act;
    closeSheet();
    if (!key) return;
    if (act === "detail") location.href = `/${key}`;
    // 덱에서 바로 고칠 수 있게 랩을 편집 상태로 연다 — 예전엔 랩의 목록을 열어 찾아 들어가는 길뿐이었다
    if (act === "edit") location.href = `/lab/?edit=${encodeURIComponent(key)}`;
    if (act === "archive") toggleArchive(key);
    if (act === "delete") deleteBeanFromDeck(key);
  });
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeSheet();
});

const SEARCH_FIELDS = [
  "KEY",
  "ROASTERY",
  "ORIGIN",
  "COFFEE_NAME",
  "REGION",
  "PROCESS",
  "VARIETY",
  "TASTING_NOTE",
  "PRODUCER",
  "LOT",
  "WASHING_STATION",
  "MEMO",
];

/**
 * 원두가 1개 이하면 필터 입력을 감춘다 — 값도 함께 비운다.
 *
 * 값을 남기면 바로 뒤따르는 applyFilter()가 그 질의를 다시 읽어, 남은 원두가 질의에 안 맞을 때
 * "검색 결과가 없습니다"만 뜨고 질의를 지울 컨트롤은 방금 숨겨진 상태가 된다(새로고침 말고는
 * 되돌릴 길이 없다). 필터로 좁힌 뒤 그 카드를 삭제하면 바로 이 상태가 됐다.
 */
function hideFilterIfAlone(): void {
  const filter = el<HTMLInputElement>("filter");
  if (allBeans.length < 2) filter.value = "";
  filter.classList.toggle("hidden", allBeans.length < 2);
}

function applyFilter(): void {
  const q = el<HTMLInputElement>("filter").value.trim().toLowerCase();
  if (!q) {
    renderDeck(allBeans);
    return;
  }
  renderDeck(
    allBeans.filter((b) =>
      SEARCH_FIELDS.some((k) =>
        String(b[k] ?? "")
          .toLowerCase()
          .includes(q),
      ),
    ),
  );
}

async function main(): Promise<void> {
  // 구버전이 저장한 PIN이 남아 있으면 세션 토큰으로 교환
  account = await migrateLegacyPin();
  if (!account.usercode || !account.token) {
    showStatus('내 원두 덱은 로그인 후 볼 수 있습니다.<br><br><a href="/lab">랩에서 로그인 →</a>');
    return;
  }
  const { res, body } = await apiCall("/api/beans");
  if (res.status === 401) {
    showStatus('로그인이 만료되었습니다.<br><br><a href="/lab">랩에서 다시 로그인 →</a>');
    return;
  }
  if (!body?.ok || !body.beans) {
    showStatus(body?.error || "목록을 불러오지 못했습니다.");
    return;
  }
  allBeans = body.beans; // 정렬은 renderDeck의 sortBeans가 맡는다 (보관 최하단 + 최신 KEY 먼저)
  hideFilterIfAlone();
  el("filter").addEventListener("input", applyFilter);
  el("note-toggle-row").classList.toggle("hidden", allBeans.length === 0);
  const noteToggle = el<HTMLInputElement>("note-toggle");
  noteToggle.checked = notesEnabled;
  noteToggle.addEventListener("change", () => {
    notesEnabled = noteToggle.checked;
    localStorage.setItem("bh_deck_notes", notesEnabled ? "1" : "0");
    applyFilter();
  });
  renderDeck(allBeans);
}

main();
