// Bean-Hoarder v2 — 라벨 렌더러 단일 모듈
// 미리보기, PNG/SVG 다운로드, QR 검증이 모두 이 코드를 사용한다 (렌더러 이중화 제거).
// 전역 의존: qrcode-generator(qrcode), jsQR — admin.html에서 <script>로 선로드.

export const BASE_URL = "HTTPS://BNHD.PAGES.DEV";

export const W = 40, H = 20;
const MARGIN = 1.8, QUIET = 1.3;
const LOGO_BOX = [32.7, 1.3, 6.0, 5.0];
const SANS = "Arial, Helvetica, sans-serif";
const MONO = "Consolas, 'Courier New', monospace";

// [필드키, 라벨 인쇄 약어, 관리자 화면 표시명]
export const SPEC_POOL = [
  ["ROAST_DATE", "RSTD", "로스팅일"],
  ["PACKAGE_DATE", "PKGD", "패키징일"],
  ["NET_WEIGHT", "NET", "용량"],
  ["AGTRON", "RSTP", "로스팅 포인트"],
  ["ALTITUDE", "ALT", "고도"],
];
export const SUB_POOL = [["REGION", "지역"], ["PROCESS", "가공"], ["VARIETY", "품종"], ["ALTITUDE", "고도"]];

export const DEFAULT_DESIGN = {
  headlineSize: 2.8,
  specValueSize: 1.7,
  qrSize: 9.0,
  subFields: ["REGION", "PROCESS"],
  specFields: ["ROAST_DATE", "PACKAGE_DATE", "NET_WEIGHT"],
  showLogo: true,
};

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// 한글 등 전각 문자는 라틴 대비 약 1.8배 폭으로 계산
function textUnits(text) {
  let u = 0;
  for (const ch of text) u += /[ᄀ-ᇿ　-鿿가-힯＀-￯]/.test(ch) ? 1.8 : 1;
  return u;
}

// 폭 초과 시 글자를 눌러 찌그러뜨리는 대신 말줄임(…)으로 잘라낸다.
function fitText(text, size, factor, maxW) {
  const unitW = size * factor;
  if (textUnits(text) * unitW <= maxW) return text;
  const budget = maxW / unitW - 1;   // "…" 자리 확보
  let u = 0, out = "";
  for (const ch of text) {
    u += /[ᄀ-ᇿ　-鿿가-힯＀-￯]/.test(ch) ? 1.8 : 1;
    if (u > budget) break;
    out += ch;
  }
  return out.trimEnd() + "…";
}

// 폭 예산에 맞춰 최대 2줄로 나누고, 2줄째도 넘치면 말줄임.
function wrapTwo(text, size, factor, maxW) {
  const unitW = size * factor;
  if (textUnits(text) * unitW <= maxW) return [text];
  const budget = maxW / unitW;
  let u = 0, cut = 0, lastSpace = -1;
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    u += /[ᄀ-ᇿ　-鿿가-힯＀-￯]/.test(chars[i]) ? 1.8 : 1;
    if (chars[i] === " ") lastSpace = i;
    if (u > budget) { cut = i; break; }
  }
  if (lastSpace > cut * 0.55) cut = lastSpace;
  const l1 = chars.slice(0, cut).join("").trim();
  const l2 = chars.slice(cut).join("").trim();
  return [l1, fitText(l2, size, factor, maxW)];
}

function textEl(x, y, text, size, opts) {
  if (!text) return "";
  const { factor, maxW, font = SANS, weight, style, spacing, anchor } = opts;
  const fitted = fitText(text, size, factor, maxW);
  const w = Math.min(textUnits(fitted) * size * factor, maxW);
  let attrs = `x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-family="${font}" font-size="${size}" textLength="${w.toFixed(2)}" lengthAdjust="spacingAndGlyphs"`;
  if (weight) attrs += ` font-weight="${weight}"`;
  if (style) attrs += ` font-style="${style}"`;
  if (spacing != null) attrs += ` letter-spacing="${spacing}"`;
  if (anchor) attrs += ` text-anchor="${anchor}"`;
  return `<text ${attrs}>${esc(fitted)}</text>`;
}

function specCell(x, y, label, value, valueMax, size) {
  return textEl(x, y, label, 1.1, { factor: .55, maxW: 3.1, font: MONO })
       + textEl(x + 3.5, y, value, size, { factor: .55, maxW: valueMax, font: MONO, weight: "bold" });
}

export function buildLabelSVG(row, design = DEFAULT_DESIGN, logoDataUrl = null) {
  const g = k => (row[k] || "").trim();
  const QR_SIZE = design.qrSize;
  const QR_X = W - 1.3 - QR_SIZE;
  const QR_Y = 8.4;
  const LEFT_MAX = QR_X - QUIET - MARGIN;
  const FULL_MAX = W - MARGIN * 2;
  const hasLogo = design.showLogo && logoDataUrl;
  const headMax = hasLogo ? LOGO_BOX[0] - 0.8 - MARGIN : FULL_MAX;

  const els = [];
  if (hasLogo) {
    const [lx, ly, lw, lh] = LOGO_BOX;
    els.push(`<image x="${lx}" y="${ly}" width="${lw}" height="${lh}" preserveAspectRatio="xMaxYMin meet" href="${logoDataUrl}"/>`);
  }

  // 1행 로스터리(소형 볼드) / 2행 국가 헤드라인
  els.push(textEl(MARGIN, 2.6, g("ROASTERY").toUpperCase(), 1.5, { factor: .70, maxW: headMax, weight: "bold", spacing: 0.12 }));
  els.push(textEl(MARGIN, 5.5, g("ORIGIN").toUpperCase(), design.headlineSize, { factor: .68, maxW: headMax, weight: "bold" }));

  // 3~4행: 지역은 길어질 수 있어 전용 줄, 나머지(가공·품종·고도)는 한 줄로 합침
  const infoLines = [];
  if (design.subFields.includes("REGION") && g("REGION")) infoLines.push(g("REGION"));
  const restLine = design.subFields.filter(f => f !== "REGION").map(f => g(f)).filter(Boolean).join(" · ");
  if (restLine) infoLines.push(restLine);
  const infoY = [7.35, 8.95];
  infoLines.slice(0, 2).forEach((line, i) => {
    els.push(textEl(MARGIN, infoY[i], line, 1.4, { factor: .52, maxW: LEFT_MAX }));
  });

  els.push(`<line x1="${MARGIN}" y1="9.9" x2="${(QR_X - QUIET).toFixed(2)}" y2="9.9" stroke="#000" stroke-width="0.12"/>`);

  // 스펙 그리드 2×2 — 로스팅 포인트는 "#95 (라이트)" 중 "#95"만 인쇄
  const colX = [MARGIN, MARGIN + 13.2];
  const labelOf = k => (SPEC_POOL.find(([key]) => key === k) || [k, k])[1];
  design.specFields.slice(0, 4).forEach((f, i) => {
    let val = g(f);
    if (!val) return;
    if (f === "AGTRON") val = val.split(/\s+/)[0];
    els.push(specCell(colX[i % 2], 12.3 + Math.floor(i / 2) * 2.5, labelOf(f), val, 9.6, design.specValueSize));
  });

  // 테이스팅 노트: 최대 2줄, 넘치면 말줄임
  const noteLines = g("TASTING_NOTE") ? wrapTwo(g("TASTING_NOTE"), 1.35, .50, LEFT_MAX) : [];
  const noteY = [16.6, 18.35];
  noteLines.slice(0, 2).forEach((line, i) => {
    els.push(textEl(MARGIN, noteY[i], line, 1.35, { factor: .50, maxW: LEFT_MAX, style: "italic" }));
  });

  const key = g("KEY").toUpperCase();
  const content = `${BASE_URL}/${key}`;
  const qr = qrcode(0, "M");
  qr.addData(content, "Alphanumeric");
  qr.make();
  const n = qr.getModuleCount();
  const module = QR_SIZE / n;
  let rects = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) {
        rects += `<rect x="${(QR_X + c * module).toFixed(3)}" y="${(QR_Y + r * module).toFixed(3)}" width="${(module + 0.01).toFixed(3)}" height="${(module + 0.01).toFixed(3)}" fill="#000"/>`;
      }
    }
  }
  els.push(rects);
  els.push(textEl(QR_X + QR_SIZE / 2, QR_Y + QR_SIZE + 1.7, key, 1.2, { factor: .55, maxW: QR_SIZE + 1.0, font: MONO, anchor: "middle" }));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">\n<rect width="${W}" height="${H}" fill="#fff"/>\n${els.filter(Boolean).join("\n")}\n</svg>`;
  return { svg, content, moduleCount: n };
}

function b64EncodeUnicode(str) {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode("0x" + p1)));
}

export function renderCanvas(svg, dpi) {
  return new Promise((resolve, reject) => {
    const pxW = Math.round(W / 25.4 * dpi);
    const pxH = Math.round(H / 25.4 * dpi);
    const canvas = document.createElement("canvas");
    canvas.width = pxW; canvas.height = pxH;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, pxW, pxH);
      ctx.drawImage(img, 0, 0, pxW, pxH);
      resolve({ canvas, ctx, pxW, pxH });
    };
    img.onerror = reject;
    img.src = "data:image/svg+xml;base64," + b64EncodeUnicode(svg);
  });
}

export async function renderPngBlob(svg, dpi) {
  const { canvas } = await renderCanvas(svg, dpi);
  return new Promise(resolve => canvas.toBlob(resolve, "image/png"));
}

// 203dpi(님봇 인쇄 해상도)로 래스터화한 뒤 jsQR로 실제 디코드 — 인쇄 전 자동 검증.
export async function verifyQr(svg, expectedContent, dpi = 203) {
  const { ctx, pxW, pxH } = await renderCanvas(svg, dpi);
  const imageData = ctx.getImageData(0, 0, pxW, pxH);
  const result = jsQR(imageData.data, pxW, pxH);
  return { ok: !!result && result.data === expectedContent, decoded: result ? result.data : null };
}
