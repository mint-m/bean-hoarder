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
  subFields: ["REGION", "PROCESS"],
  specFields: ["ROAST_DATE", "PACKAGE_DATE", "NET_WEIGHT"],
  showLogo: true,
};

// 님봇 도트 피치 ≈ 0.12512mm(203dpi). 렌더 캔버스가 40mm→320px로 반올림되므로
// 0.125mm(8px/mm) 격자로 스냅하면 검증·다운로드 PNG에서 모듈 경계가 픽셀에 정확히 떨어진다.
// (실제 도트와 0.1% 차이 — 물리 인쇄에는 무의미)
const DOT = 0.125;
const QR_MODULE_DOTS = 3;   // 모듈 = 3도트 = 0.375mm → 버전2(25모듈) QR = 9.375mm

// 2도 써멀 인쇄(블랙+레드)용 레드 채널. QR·본문은 블랙만 사용.
const RED = "#e8341c";

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// 한글 등 전각 문자는 라틴 대비 약 1.8배 폭으로 계산
function unitsOf(ch) {
  return /[ᄀ-ᇿ　-鿿가-힯＀-￯]/.test(ch) ? 1.8 : 1;
}
function textUnits(text) {
  let u = 0;
  for (const ch of text) u += unitsOf(ch);
  return u;
}

// 폭 초과 시 글자를 눌러 찌그러뜨리는 대신 말줄임(…)으로 잘라낸다.
function fitText(text, size, factor, maxW) {
  const unitW = size * factor;
  if (textUnits(text) * unitW <= maxW) return text;
  const budget = maxW / unitW - 1;   // "…" 자리 확보
  let u = 0, out = "";
  for (const ch of text) {
    u += unitsOf(ch);
    if (u > budget) break;
    out += ch;
  }
  return out.trimEnd() + "…";
}

// 폭 예산에 맞춰 최대 maxLines줄로 나누고, 마지막 줄이 넘치면 말줄임.
function wrapN(text, size, factor, maxW, maxLines) {
  const unitW = size * factor;
  const lines = [];
  let rest = text.trim();
  while (rest && lines.length < maxLines) {
    if (textUnits(rest) * unitW <= maxW || lines.length === maxLines - 1) {
      lines.push(fitText(rest, size, factor, maxW));
      return lines;
    }
    const budget = maxW / unitW;
    let u = 0, cut = 0, lastSpace = -1;
    const chars = [...rest];
    for (let i = 0; i < chars.length; i++) {
      u += unitsOf(chars[i]);
      if (chars[i] === " ") lastSpace = i;
      if (u > budget) { cut = i; break; }
    }
    if (lastSpace > cut * 0.55) cut = lastSpace;
    if (cut <= 0) cut = 1;
    lines.push(chars.slice(0, cut).join("").trim());
    rest = chars.slice(cut).join("").trim();
  }
  return lines;
}

function textEl(x, y, text, size, opts) {
  if (!text) return "";
  const { factor, maxW, font = SANS, weight, style, spacing, anchor, fill } = opts;
  const fitted = fitText(text, size, factor, maxW);
  const w = Math.min(textUnits(fitted) * size * factor, maxW);
  let attrs = `x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-family="${font}" font-size="${size}" textLength="${w.toFixed(2)}" lengthAdjust="spacingAndGlyphs"`;
  if (weight) attrs += ` font-weight="${weight}"`;
  if (style) attrs += ` font-style="${style}"`;
  if (spacing != null) attrs += ` letter-spacing="${spacing}"`;
  if (anchor) attrs += ` text-anchor="${anchor}"`;
  if (fill) attrs += ` fill="${fill}"`;
  return `<text ${attrs}>${esc(fitted)}</text>`;
}

function specCell(x, y, label, value, valueMax, size, labelFill) {
  return textEl(x, y, label, 1.1, { factor: .55, maxW: 3.1, font: MONO, fill: labelFill })
       + textEl(x + 3.5, y, value, size, { factor: .55, maxW: valueMax, font: MONO, weight: "bold" });
}

export function buildLabelSVG(row, design = DEFAULT_DESIGN, logoDataUrl = null) {
  const g = k => (row[k] || "").trim();

  // QR을 먼저 만들어 도트 격자에 스냅된 실제 크기·위치를 확정한다.
  const key = g("KEY").toUpperCase();
  const content = `${BASE_URL}/${key}`;
  const qr = qrcode(0, "M");
  qr.addData(content, "Alphanumeric");
  qr.make();
  const n = qr.getModuleCount();
  const module = QR_MODULE_DOTS * DOT;
  const QR_SIZE = module * n;
  const QR_X = Math.round((W - 1.3 - QR_SIZE) / DOT) * DOT;
  const QR_Y = Math.round(8.4 / DOT) * DOT;
  const LEFT_MAX = QR_X - QUIET - MARGIN;
  const FULL_MAX = W - MARGIN * 2;
  const hasLogo = design.showLogo && logoDataUrl;
  const headMax = hasLogo ? LOGO_BOX[0] - 0.8 - MARGIN : FULL_MAX;

  const els = [];
  if (hasLogo) {
    const [lx, ly, lw, lh] = LOGO_BOX;
    els.push(`<image x="${lx}" y="${ly}" width="${lw}" height="${lh}" preserveAspectRatio="xMaxYMin meet" href="${logoDataUrl}"/>`);
  }

  // ── 보딩패스 컨셉 (블랙 + 레드 2도 인쇄) ──
  // 상단 레드 스트립 / 레드 도트 + 로스터리(레드) / 오리진 헤드라인(블랙) /
  // 정보 블록 / 레드 점선 절취선 / 스펙 그리드(레드 라벨 + 블랙 값) / 노트
  els.push(`<rect x="0" y="0" width="${W}" height="0.6" fill="${RED}"/>`);
  const rst = g("ROASTERY").toUpperCase();
  if (rst) {
    els.push(`<circle cx="${(MARGIN + 0.38).toFixed(2)}" cy="2.42" r="0.38" fill="${RED}"/>`);
    els.push(textEl(MARGIN + 1.25, 2.9, rst, 1.5, { factor: .70, maxW: headMax - 1.25, weight: "bold", spacing: 0.12, fill: RED }));
  }
  els.push(textEl(MARGIN, 5.7, g("ORIGIN").toUpperCase(), design.headlineSize, { factor: .68, maxW: headMax, weight: "bold" }));

  // 라벨 인쇄용 축약: 괄호 속 상세 설명("Washed (36 hours ...)" 등)은
  // QR로 열리는 상세 페이지에서 전부 보여주므로 라벨엔 핵심 단어만 남긴다.
  const stripParen = s => s.replace(/\s*[(（][^)）]*[)）]?/g, "").trim();
  const labelVal = f => {
    const v = g(f);
    return (f === "REGION" || f === "PROCESS" || f === "VARIETY") ? stripParen(v) : v;
  };

  // ── 좌측 컬럼 플로우 레이아웃: 내용량에 따라 y를 흘려 배치 ──
  const INFO_LH = 1.6, SPEC_LH = 2.4, NOTE_LH = 1.7, BOTTOM = 19.4;
  const INFO_START = 7.5;
  const subOrder = SUB_POOL.map(([k]) => k).filter(k => design.subFields.includes(k));
  const infoText = subOrder.map(labelVal).filter(Boolean).join(" · ");

  // 스펙 후보를 먼저 확정 (서브라인에 이미 표시되는 필드는 중복 인쇄 방지)
  const labelOf = k => (SPEC_POOL.find(([key]) => key === k) || [k, k])[1];
  const specs = design.specFields.slice(0, 4)
    .filter(f => !design.subFields.includes(f))
    .map(f => [f, f === "AGTRON" ? g(f).split(/\s+/)[0] : g(f)])
    .filter(([, v]) => v);
  const specRows = Math.ceil(specs.length / 2);
  const hasNote = !!g("TASTING_NOTE");

  // 정보 블록에 허용되는 최대 줄 수(1~4): 절취선·스펙·노트 최소 1줄이 바닥 안에 들어가는 최댓값
  let maxInfo = 1;
  for (let n = 4; n >= 1; n--) {
    const lastInfo = INFO_START + (n - 1) * INFO_LH;
    const dY = lastInfo + 0.55;
    const specLast = specRows ? dY + 1.95 + (specRows - 1) * SPEC_LH : dY;
    const needed = hasNote ? specLast + 1.9 : specLast;
    if (needed <= BOTTOM) { maxInfo = n; break; }
  }

  let yCur = INFO_START;
  if (infoText) {
    for (const line of wrapN(infoText, 1.35, .52, LEFT_MAX, maxInfo)) {
      els.push(textEl(MARGIN, yCur, line, 1.35, { factor: .52, maxW: LEFT_MAX }));
      yCur += INFO_LH;
    }
  }

  // 절취선: 보딩패스의 퍼포레이션을 레드 점선으로
  const divY = Math.max(6.8, yCur - INFO_LH + 0.55);
  els.push(`<line x1="${MARGIN}" y1="${divY.toFixed(2)}" x2="${(QR_X - QUIET).toFixed(2)}" y2="${divY.toFixed(2)}" stroke="${RED}" stroke-width="0.14" stroke-dasharray="0.55 0.4"/>`);

  // 스펙 그리드: 레드 라벨 + 블랙 볼드 값 — 로스팅 포인트는 "#95 (라이트)" 중 "#95"만 인쇄
  const colX = [MARGIN, MARGIN + 13.2];
  specs.forEach(([f, val], i) => {
    els.push(specCell(colX[i % 2], divY + 1.95 + Math.floor(i / 2) * SPEC_LH, labelOf(f), val, 9.6, design.specValueSize, RED));
  });
  let noteY = specRows > 0 ? divY + 1.95 + (specRows - 1) * SPEC_LH + 1.9 : divY + 1.7;

  // 테이스팅 노트: 스펙 그리드 아래 남는 공간만큼 (최대 2줄)
  if (hasNote && noteY <= BOTTOM) {
    const allowed = Math.min(2, Math.floor((BOTTOM - noteY) / NOTE_LH) + 1);
    for (const line of wrapN(g("TASTING_NOTE"), 1.3, .50, LEFT_MAX, allowed)) {
      els.push(textEl(MARGIN, noteY, line, 1.3, { factor: .50, maxW: LEFT_MAX, style: "italic" }));
      noteY += NOTE_LH;
    }
  }

  // QR 렌더: 도트 격자 스냅 좌표 (소수 4자리 유지로 누적 오차 방지)
  let rects = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) {
        rects += `<rect x="${(QR_X + c * module).toFixed(4)}" y="${(QR_Y + r * module).toFixed(4)}" width="${module.toFixed(4)}" height="${module.toFixed(4)}" fill="#000"/>`;
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
