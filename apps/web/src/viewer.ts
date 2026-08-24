// 원두 조회 페이지(/) 진입점 — QR 스캔이 도착하는 곳. 구 public/index.html 인라인 스크립트의 이식.
//
// 이 페이지는 파일이 아닌 경로(/{KEY})로도 열린다 — Pages가 매치 없는 경로에 index.html을 주고,
// 여기서 location.pathname을 읽어 KEY를 뽑는다. 그 계약은 e2e/routing.spec.ts가 지킨다.
import { buildHeadline, type HeadlineRow, headlineUsedFields } from "@bnhd/schema/headline";
import { flavorGradient, originSignature } from "./lib/coffee-color";
import { daysSince, el, escapeHtml } from "./lib/dom";

// jsQR 디코더(~130KB)는 타입만 정적으로 참조하고 런타임 코드는 스캔을 처음 열 때 지연 로드한다
// (setupScanner의 open 참조). type-only import라 번들에는 들어가지 않는다 — 조회 진입(QR로
// 도착하는 대부분의 트래픽)의 초기 번들에서 디코더를 뺀다.
type JsQR = typeof import("jsqr").default;

const KEY_RE = /^[A-Z0-9]{4}\d{2}-\d{3}$/;
// 티켓 정보 행(날짜·용량·로스팅포인트)에 못 들어간 부가 스펙 — 한 줄 텍스트(specline)로 표시
const SPEC_FIELDS: readonly (readonly [string, string])[] = [
  ["PROCESS", "PROCESS"],
  ["VARIETY", "VARIETY"],
  ["ALTITUDE", "ALTITUDE"],
  ["HARVEST", "HARVEST"],
  ["LOT", "LOT"],
  ["WASHING_STATION", "WASH STN"],
];

// 표시 전용 축약 — 라벨의 "RSTD26.06.29" 표기와 결을 맞춘다 (데이터·API는 그대로)
function shortDate(v: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v.slice(2, 4)}.${v.slice(5, 7)}.${v.slice(8)}` : v;
}

function getCode(): string | null {
  const q = new URLSearchParams(location.search).get("c");
  if (q) return q.trim().toUpperCase();
  const path = decodeURIComponent(location.pathname).replace(/^\/+|\/+$/g, "");
  return path && path !== "index.html" ? path.toUpperCase() : null;
}

function hideAll(): void {
  for (const id of ["status", "landing", "bean"]) el(id).classList.add("hidden");
}

function show(msg: string): void {
  hideAll();
  const node = el("status");
  node.innerHTML = msg;
  node.classList.remove("hidden");
}

function showLanding(): void {
  hideAll();
  el("landing").classList.remove("hidden");
  el("top-brand").classList.add("hidden");
  el("code-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = el<HTMLInputElement>("code-input").value.trim().toUpperCase();
    if (v) {
      location.href = `/${encodeURIComponent(v)}`;
    } else {
      // 입력이 비어있을 때 데모 원두 페이지로 이동
      location.href = `/DEMO26-001`;
    }
  });
  setupScanner();
}

// ── 카메라 QR 스캔 ──
// 스캔된 QR은 라벨 URL(HTTPS://BNHD.PAGES.DEV/{KEY})이므로 KEY만 뽑아 이동한다.
function keyFromScan(data: string): string | null {
  if (!data) return null;
  let s = data.trim();
  try {
    const u = new URL(s);
    s = new URLSearchParams(u.search).get("c") || u.pathname;
  } catch (_e) {
    /* URL 아니면 원문 */
  }
  s = s.replace(/^\/+|\/+$/g, "").toUpperCase();
  return KEY_RE.test(s) ? s : null;
}

function setupScanner(): void {
  const btn = el<HTMLButtonElement>("scan-btn");
  // 카메라를 쓸 수 있고(안전 컨텍스트), **손에 들고 스캔할 수 있는 기기**일 때만 노출한다.
  // getUserMedia만 보면 웹캠 달린 데스크톱에도 뜨는데, 모니터를 라벨에 갖다 댈 수는 없다.
  if (!navigator.mediaDevices?.getUserMedia) return;
  if (!window.matchMedia?.("(pointer: coarse)").matches) return;
  btn.classList.remove("hidden");

  const scanner = el("scanner");
  const video = el<HTMLVideoElement>("scan-video");
  const canvas = el<HTMLCanvasElement>("scan-canvas");
  const hint = el("scan-hint");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  let stream: MediaStream | null = null;
  let raf = 0;
  let jsQR: JsQR | null = null; // 최초 스캔 시 1회 지연 로드 후 캐시 (open 참조)

  async function open(): Promise<void> {
    scanner.classList.remove("hidden");
    hint.textContent = "카메라를 준비하는 중…";
    // 디코더는 스캔을 처음 열 때만 받는다 — 카메라 권한을 얻기 전에 확보해 tick 루프가 바로 쓴다
    if (!jsQR) {
      try {
        jsQR = (await import("jsqr")).default;
      } catch (_e) {
        hint.textContent = "QR 인식기를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
        return;
      }
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
    } catch (_e) {
      hint.textContent = "카메라를 열 수 없습니다. 권한을 허용했는지 확인해 주세요.";
      return;
    }
    video.srcObject = stream;
    await video.play().catch(() => {});
    hint.textContent = "라벨의 QR을 사각형 안에 맞춰 주세요";
    raf = requestAnimationFrame(tick);
  }

  function close(): void {
    cancelAnimationFrame(raf);
    if (stream) for (const t of stream.getTracks()) t.stop();
    stream = null;
    scanner.classList.add("hidden");
  }

  function tick(): void {
    // jsQR은 open()이 로드를 마친 뒤에만 tick을 스케줄하므로 여기선 항상 준비돼 있다(가드는 타입용).
    if (ctx && jsQR && video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const result = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
      const key = result && keyFromScan(result.data);
      if (key) {
        hint.textContent = `${key} 조회 중…`;
        close();
        location.href = `/${encodeURIComponent(key)}`;
        return;
      }
      if (result) hint.textContent = "이 QR은 Bean-Hoarder 라벨이 아닙니다.";
    }
    raf = requestAnimationFrame(tick);
  }

  btn.addEventListener("click", open);
  el("scan-close").addEventListener("click", close);
}

function render(row: HeadlineRow, isPreview: boolean): void {
  const g = (k: string) => String(row[k] ?? "").trim();
  hideAll();
  el("bean").classList.remove("hidden");
  el("top-brand").classList.add("hidden"); // 패스 헤더에 브랜드가 있으므로 중복 제거

  const badge = el("f-preview-badge");
  badge.classList.toggle("hidden", !isPreview);
  if (isPreview) badge.textContent = "초안 미리보기 · 아직 등록되지 않음";

  el("f-key").textContent = g("KEY");
  el("f-roastery").textContent = g("ROASTERY");
  // 메인 식별자: 국가+세부지역 조합(또는 시그니쳐/블렌드명). 라벨·카드와 동일 규칙.
  const usedInHead = headlineUsedFields(row);
  const headline = buildHeadline(row) || g("KEY");
  // 표시용으로만 구분자 앞을 비분리 공백으로 — "·"가 줄 첫머리에 홀로 떨어지는 걸 막는다.
  // 헤드라인 조합 규칙(@bnhd/schema/headline)은 라벨과 공유하므로 건드리지 않는다.
  el("f-origin").textContent = headline.replace(/ · /g, " · ");

  // 커피 컬러(화면 전용, 라벨 인쇄와 무관 — DESIGN.md §3): 산지 시그니처는 스와치로,
  // 향미 무드는 아이덴티티 밴드의 저알파 그라데이션으로.
  const swatchColor = originSignature(g("ORIGIN"));
  const swatch = el("f-origin-swatch");
  swatch.classList.toggle("hidden", !swatchColor);
  if (swatchColor) {
    swatch.style.background = swatchColor;
    swatch.title = g("ORIGIN");
  }
  el("f-band").style.backgroundImage = flavorGradient(g("TASTING_NOTE")) || "";

  // 시그니쳐명일 땐 국가를 서브라인에 보존, 헤드라인이 이미 쓴 지역·생산자는 제외(중복 방지)
  const subParts: string[] = [];
  if (g("COFFEE_NAME") && g("ORIGIN")) subParts.push(g("ORIGIN"));
  for (const k of ["REGION", "PRODUCER"]) {
    if (!usedInHead.includes(k) && g(k)) subParts.push(g(k));
  }
  const sub = el("f-subline");
  sub.classList.toggle("hidden", !subParts.length);
  sub.innerHTML = subParts.map((v) => `<span>${escapeHtml(v)}</span>`).join('<span class="sep">·</span>');

  // 테이스팅 노트: 짧은 항목들이면 칩으로, 긴 문장이면 이탤릭 문단으로
  const chips = el("f-chips");
  const note = el("f-note");
  chips.classList.add("hidden");
  note.classList.add("hidden");
  const noteRaw = g("TASTING_NOTE");
  if (noteRaw) {
    const segs = noteRaw
      .split(/[,·]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (segs.length && segs.every((s) => s.length <= 28)) {
      chips.innerHTML = segs.map((s) => `<li>${escapeHtml(s)}</li>`).join("");
      chips.classList.remove("hidden");
    } else {
      note.textContent = noteRaw;
      note.classList.remove("hidden");
    }
  }

  // 티켓 정보 행: RSTD / PKGD / NET / ROAST PT — 항공권의 게이트·좌석 자리
  const setTicket = (boxId: string, valId: string, v: string) => {
    el(boxId).classList.toggle("hidden", !v);
    if (v) el(valId).textContent = v;
  };
  const rd = g("ROAST_DATE");
  setTicket("f-roasted-box", "f-roasted", shortDate(rd));
  setTicket("f-packed-box", "f-packed", shortDate(g("PACKAGE_DATE")));
  setTicket("f-net-box", "f-net", g("NET_WEIGHT"));
  // 로스팅포인트는 "#75 (미디움라이트)"처럼 길 수 있어 티켓 행에는 수치만 (전체는 라벨·폼에)
  setTicket("f-roastpt-box", "f-roastpt", g("AGTRON").replace(/\s*\(.*\)\s*$/, ""));

  // 부가 스펙 한 줄 — 헤드라인이 이미 쓴 필드(워싱스테이션·랏)는 제외
  const specParts: string[] = [];
  for (const [col, label] of SPEC_FIELDS) {
    if (usedInHead.includes(col)) continue;
    const v = g(col);
    // 라벨과 값은 한 덩어리다 — 묶지 않으면 "ALTITUDE"와 "2100m"이 서로 다른 줄로 갈린다
    if (v) specParts.push(`<span class="spec-pair"><b>${label}</b> ${escapeHtml(v)}</span>`);
  }
  const specline = el("f-specline");
  specline.classList.toggle("hidden", !specParts.length);
  specline.innerHTML = specParts.join('<span class="sep">·</span>');

  // 스텁: KEY(티켓 번호) · D+N · 원본 링크
  const dday = el("f-dday");
  const n = daysSince(rd);
  const showDday = n != null && !isPreview;
  dday.classList.toggle("hidden", !showDday);
  if (showDday) dday.textContent = `D+${n}`;

  const memo = el("f-memo");
  memo.classList.toggle("hidden", !g("MEMO"));
  if (g("MEMO")) el("f-memo-body").textContent = g("MEMO");

  const src = el<HTMLAnchorElement>("f-source");
  src.classList.toggle("hidden", !g("SOURCE_URL"));
  if (g("SOURCE_URL")) src.href = g("SOURCE_URL");

  document.title = `${headline} — BEAN-HOARDER${isPreview ? " (미리보기)" : ""}`;
}

function b64DecodeUnicode(str: string): string {
  return decodeURIComponent(
    atob(str)
      .split("")
      .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`)
      .join(""),
  );
}

async function main(): Promise<void> {
  const previewParam = new URLSearchParams(location.search).get("preview");
  if (previewParam) {
    try {
      render(JSON.parse(b64DecodeUnicode(previewParam)) as HeadlineRow, true);
    } catch (_e) {
      show("미리보기 데이터를 해석하지 못했습니다.");
    }
    return;
  }
  const code = getCode();
  if (!code) {
    showLanding();
    return;
  }
  if (!KEY_RE.test(code)) {
    show(
      `올바른 코드 형식이 아닙니다.<br><span class="code">${escapeHtml(code)}</span><br><br><a href="/">처음으로 ←</a>`,
    );
    return;
  }
  let res: Response;
  try {
    res = await fetch(`/api/bean/${encodeURIComponent(code)}`, { cache: "no-store" });
  } catch (_e) {
    show("데이터를 불러오지 못했습니다.<br>잠시 후 다시 시도해 주세요.");
    return;
  }
  if (res.status === 404) {
    show(
      `등록되지 않은 코드입니다.<br><span class="code">${escapeHtml(code)}</span><br><br><a href="/">처음으로 ←</a>`,
    );
    return;
  }
  if (!res.ok) {
    show("데이터를 불러오지 못했습니다.<br>잠시 후 다시 시도해 주세요.");
    return;
  }
  const { bean } = (await res.json()) as { bean: HeadlineRow };
  render(bean, false);
}

main();
