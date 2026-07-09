// Bean-Hoarder v2 — 라벨 렌더러 단일 모듈
// 미리보기, PNG/SVG 다운로드, QR 검증이 모두 이 코드를 사용한다 (렌더러 이중화 제거).
// 전역 의존: qrcode-generator(qrcode), jsQR — admin.html에서 <script>로 선로드.
//
// 사이즈 3종을 지원한다. 40×20·50×30은 가로형 보딩패스, 50×60은 세로 카드형 레이아웃.
// QR은 3사이즈 모두 동일한 물리 크기(약 9.4mm, 도트 격자 스냅)로 고정한다 — 스캔에
// 필요한 크기는 라벨이 커진다고 늘어나지 않으므로, 커진 여백은 QR 확대가 아니라
// 정보 표시량 차이(부제목·스펙 항목 수)로 반영한다. 사용자 조절 대상이 아니다.

export const BASE_URL = "HTTPS://BNHD.PAGES.DEV";

const SANS = "Arial, Helvetica, sans-serif";
const MONO = "Consolas, 'Courier New', monospace";
const QUIET = 1.3;

// 감열 라벨 프린터(203dpi) 도트 피치 ≈ 0.12512mm. 렌더 캔버스가 mm→px 반올림되므로
// 0.125mm(8px/mm) 격자로 스냅하면 검증·다운로드 PNG에서 QR 모듈 경계가 픽셀에 정확히 떨어진다.
// (실제 도트와 0.1% 차이 — 물리 인쇄에는 무의미)
const DOT = 0.125;

// 2도 감열 인쇄(블랙+레드)용 레드 채널. QR·본문은 블랙만 사용.
const RED = "#e8341c";

// [필드키, 라벨 인쇄 약어, 관리자 화면 표시명]
export const SPEC_POOL = [
  ["ROAST_DATE", "RSTD", "로스팅일"],
  ["PACKAGE_DATE", "PKGD", "패키징일"],
  ["NET_WEIGHT", "NET", "용량"],
  ["AGTRON", "RSTP", "로스팅 포인트"],
  ["ALTITUDE", "ALT", "고도"],
];
export const SUB_POOL = [["REGION", "지역"], ["PROCESS", "가공"], ["VARIETY", "품종"], ["ALTITUDE", "고도"]];

// ── 사이즈별 지오메트리 (mm) ─────────────────────────────────
// headline/specVal의 def는 기본값, min/max는 스튜디오 슬라이더 범위.
export const SIZE_SPECS = {
  "40x20": {
    W: 40, H: 20, orient: "landscape", label: "40×20 (기본)",
    margin: 1.8, strip: 0.6, quiet: 1.3,
    qrDots: 3, qrRightGap: 1.3, qrY: 8.4, keySize: 1.2, keyGap: 1.7,
    headline: { def: 2.8, min: 2.4, max: 3.4 }, specVal: { def: 1.7, min: 1.4, max: 2.0 },
    roasterySize: 1.5, roasteryY: 2.9, dotR: 0.38, dotCy: 2.42, headY: 5.7,
    infoStart: 7.5, infoLH: 1.6, infoSize: 1.35, maxInfoLines: 4,
    divOffset: 0.55, divMin: 6.8, specTopOff: 1.95, specLH: 2.4,
    specLabelSize: 1.1, specLabelW: 3.1, specGapX: 3.5, specValueMax: 9.6, col2: 13.2,
    noteSize: 1.3, noteLH: 1.7, noteGapSpec: 1.9, noteGapDiv: 1.7, maxNoteLines: 2, bottom: 19.4,
    logoBox: [32.7, 1.3, 6.0, 5.0],
  },
  "50x30": {
    W: 50, H: 30, orient: "landscape", label: "50×30 (여유형)",
    margin: 2.0, strip: 0.8, quiet: 2.0,
    qrDots: 3, qrRightGap: 1.6, qrY: 18.0, keySize: 1.5, keyGap: 2.0,
    headline: { def: 3.6, min: 2.8, max: 4.6 }, specVal: { def: 2.1, min: 1.7, max: 2.6 },
    roasterySize: 1.9, roasteryY: 3.6, dotR: 0.48, dotCy: 3.0, headY: 7.2,
    infoStart: 9.6, infoLH: 2.05, infoSize: 1.7, maxInfoLines: 5,
    divOffset: 0.7, divMin: 8.8, specTopOff: 2.5, specLH: 3.0,
    specLabelSize: 1.35, specLabelW: 4.2, specGapX: 4.6, specValueMax: 12.0, col2: 16.5,
    noteSize: 1.65, noteLH: 2.15, noteGapSpec: 2.3, noteGapDiv: 2.1, maxNoteLines: 3, bottom: 29.0,
    logoBox: [40.5, 1.8, 7.5, 6.0],
  },
  "50x60": {
    W: 50, H: 60, orient: "portrait", label: "50×60 (카드형)",
    margin: 2.4, strip: 1.0, quiet: 1.8,
    qrDots: 3, qrY: 46.75, keySize: 1.8, keyGap: 2.2,
    headline: { def: 4.4, min: 3.4, max: 5.4 }, specVal: { def: 2.3, min: 1.8, max: 3.0 },
    roasterySize: 2.3, roasteryY: 5.0, dotR: 0.58, dotCy: 4.25, headY: 9.4, headMaxLines: 2,
    infoLH: 2.6, infoSize: 2.0, maxInfoLines: 4,
    divOffset: 0.8, specTopOff: 3.0, specLH: 3.8,
    specLabelSize: 1.5, specLabelW: 5.0, specGapX: 5.6, specValueMax: 15.5,
    noteSize: 2.0, noteLH: 2.6, noteGapSpec: 2.8, noteGapDiv: 2.4, maxNoteLines: 4,
    logoBox: [39.6, 2.0, 8.0, 6.5],
  },
};

// 사이즈가 커질수록 물리적 여유가 생기므로 기본으로 표시하는 항목 수도 늘린다.
// (사용자가 직접 토글을 바꾼 뒤에는 사이즈를 바꿔도 이 기본값으로 되돌리지 않는다 — lab.js 참고)
export const SIZE_DEFAULT_FIELDS = {
  "40x20": { subFields: ["REGION", "PROCESS"], specFields: ["ROAST_DATE", "PACKAGE_DATE", "NET_WEIGHT"] },
  "50x30": { subFields: ["REGION", "PROCESS", "VARIETY"], specFields: ["ROAST_DATE", "PACKAGE_DATE", "NET_WEIGHT", "AGTRON"] },
  "50x60": { subFields: ["REGION", "PROCESS", "VARIETY", "ALTITUDE"], specFields: ["ROAST_DATE", "PACKAGE_DATE", "NET_WEIGHT", "AGTRON"] },
};

export const DEFAULT_DESIGN = {
  size: "40x20",
  headlineSize: SIZE_SPECS["40x20"].headline.def,
  specValueSize: SIZE_SPECS["40x20"].specVal.def,
  subFields: SIZE_DEFAULT_FIELDS["40x20"].subFields.slice(),
  specFields: SIZE_DEFAULT_FIELDS["40x20"].specFields.slice(),
  showLogo: true,
};

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

function specCell(S, x, y, label, value, size) {
  return textEl(x, y, label, S.specLabelSize, { factor: .55, maxW: S.specLabelW, font: MONO, fill: RED })
       + textEl(x + S.specGapX, y, value, size, { factor: .55, maxW: S.specValueMax, font: MONO, weight: "bold" });
}

// 라벨 인쇄용 축약: 괄호 속 상세 설명("Washed (36 hours ...)" 등)은
// QR로 열리는 상세 페이지에서 전부 보여주므로 라벨엔 핵심 단어만 남긴다.
const stripParen = s => s.replace(/\s*[(（][^)）]*[)）]?/g, "").trim();

// 정보 블록에 허용되는 최대 줄 수: 절취선·스펙·노트 최소 1줄이 바닥 안에 들어가는 최댓값
function computeMaxInfoLines(S, infoStart, specRows, hasNote, bottom) {
  for (let n = S.maxInfoLines; n >= 1; n--) {
    const lastInfo = infoStart + (n - 1) * S.infoLH;
    const dY = lastInfo + S.divOffset;
    const specLast = specRows ? dY + S.specTopOff + (specRows - 1) * S.specLH : dY;
    const needed = hasNote ? specLast + S.noteGapSpec : specLast;
    if (needed <= bottom) return n;
  }
  return 1;
}

export function buildLabelSVG(row, design = DEFAULT_DESIGN, logoDataUrl = null) {
  const S = SIZE_SPECS[design.size] || SIZE_SPECS["40x20"];
  const { W, H } = S;
  const headlineSize = design.headlineSize || S.headline.def;
  const specValueSize = design.specValueSize || S.specVal.def;
  const g = k => (row[k] || "").trim();

  // QR을 먼저 만들어 도트 격자에 스냅된 실제 크기·위치를 확정한다.
  const key = g("KEY").toUpperCase();
  const content = `${BASE_URL}/${key}`;
  const qr = qrcode(0, "M");
  qr.addData(content, "Alphanumeric");
  qr.make();
  const n = qr.getModuleCount();
  const module = S.qrDots * DOT;
  const QR_SIZE = module * n;
  const portrait = S.orient === "portrait";
  const QR_X = portrait
    ? Math.round((W - QR_SIZE) / 2 / DOT) * DOT
    : Math.round((W - S.qrRightGap - QR_SIZE) / DOT) * DOT;
  const QR_Y = Math.round(S.qrY / DOT) * DOT;
  const FULL_MAX = W - S.margin * 2;
  // 가로형은 우측 QR 옆 폭, 세로형은 하단 QR 위까지 전폭
  const TEXT_MAX = portrait ? FULL_MAX : QR_X - S.quiet - S.margin;
  const BOTTOM = portrait ? QR_Y - S.quiet : S.bottom;
  const hasLogo = design.showLogo && logoDataUrl;
  const headMax = hasLogo ? S.logoBox[0] - 0.8 - S.margin : (portrait ? FULL_MAX : FULL_MAX);

  const els = [];
  if (hasLogo) {
    const [lx, ly, lw, lh] = S.logoBox;
    els.push(`<image x="${lx}" y="${ly}" width="${lw}" height="${lh}" preserveAspectRatio="xMaxYMin meet" href="${logoDataUrl}"/>`);
  }

  // ── 보딩패스 컨셉 (블랙 + 레드 2도 인쇄) ──
  // 상단 레드 스트립 / 레드 도트 + 로스터리(레드) / 오리진 헤드라인(블랙) /
  // 정보 블록 / 레드 점선 절취선 / 스펙 그리드(레드 라벨 + 블랙 값) / 노트 / QR
  els.push(`<rect x="0" y="0" width="${W}" height="${S.strip}" fill="${RED}"/>`);
  const rst = g("ROASTERY").toUpperCase();
  if (rst) {
    els.push(`<circle cx="${(S.margin + S.dotR).toFixed(2)}" cy="${S.dotCy}" r="${S.dotR}" fill="${RED}"/>`);
    els.push(textEl(S.margin + S.dotR * 2 + 0.5, S.roasteryY, rst, S.roasterySize,
      { factor: .70, maxW: headMax - (S.dotR * 2 + 0.5), weight: "bold", spacing: 0.12, fill: RED }));
  }

  // 헤드라인: 가로형은 1줄 고정, 세로형(50×60)은 최대 2줄 랩
  let yCur;
  const origin = g("ORIGIN").toUpperCase();
  if (portrait) {
    const headLines = wrapN(origin, headlineSize, .68, headMax, S.headMaxLines || 2);
    let hy = S.headY;
    for (const line of headLines) {
      els.push(textEl(S.margin, hy, line, headlineSize, { factor: .68, maxW: headMax, weight: "bold" }));
      hy += headlineSize * 1.15;
    }
    yCur = hy - headlineSize * 1.15 + S.infoLH + 0.9;
  } else {
    els.push(textEl(S.margin, S.headY, origin, headlineSize, { factor: .68, maxW: headMax, weight: "bold" }));
    yCur = S.infoStart;
  }

  const labelVal = f => {
    const v = g(f);
    return (f === "REGION" || f === "PROCESS" || f === "VARIETY") ? stripParen(v) : v;
  };

  // ── 플로우 레이아웃: 내용량에 따라 y를 흘려 배치 ──
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

  const infoStart = yCur;
  const maxInfo = computeMaxInfoLines(S, infoStart, specRows, hasNote, BOTTOM);

  if (infoText) {
    for (const line of wrapN(infoText, S.infoSize, .52, TEXT_MAX, maxInfo)) {
      els.push(textEl(S.margin, yCur, line, S.infoSize, { factor: .52, maxW: TEXT_MAX }));
      yCur += S.infoLH;
    }
  }

  // 절취선: 보딩패스의 퍼포레이션을 레드 점선으로
  const divMin = portrait ? infoStart - S.infoLH + S.divOffset : S.divMin;
  const divY = Math.max(divMin, yCur - S.infoLH + S.divOffset);
  const divX2 = portrait ? W - S.margin : QR_X - S.quiet;
  els.push(`<line x1="${S.margin}" y1="${divY.toFixed(2)}" x2="${divX2.toFixed(2)}" y2="${divY.toFixed(2)}" stroke="${RED}" stroke-width="0.14" stroke-dasharray="0.55 0.4"/>`);

  // 스펙 그리드: 레드 라벨 + 블랙 볼드 값 — 로스팅 포인트는 "#95 (라이트)" 중 "#95"만 인쇄
  const colX = portrait ? [S.margin, W / 2 + 0.6] : [S.margin, S.margin + S.col2];
  specs.forEach(([f, val], i) => {
    els.push(specCell(S, colX[i % 2], divY + S.specTopOff + Math.floor(i / 2) * S.specLH, labelOf(f), val, specValueSize));
  });
  let noteY = specRows > 0 ? divY + S.specTopOff + (specRows - 1) * S.specLH + S.noteGapSpec : divY + S.noteGapDiv;

  // 테이스팅 노트: 스펙 그리드 아래 남는 공간만큼
  if (hasNote && noteY <= BOTTOM) {
    const allowed = Math.min(S.maxNoteLines, Math.floor((BOTTOM - noteY) / S.noteLH) + 1);
    for (const line of wrapN(g("TASTING_NOTE"), S.noteSize, .50, TEXT_MAX, allowed)) {
      els.push(textEl(S.margin, noteY, line, S.noteSize, { factor: .50, maxW: TEXT_MAX, style: "italic" }));
      noteY += S.noteLH;
    }
  }

  // 세로형: QR 스텁 구획을 절취선으로 표시 (보딩패스의 티켓 스텁)
  if (portrait) {
    els.push(`<line x1="${S.margin}" y1="${(QR_Y - 1.2).toFixed(2)}" x2="${(W - S.margin).toFixed(2)}" y2="${(QR_Y - 1.2).toFixed(2)}" stroke="${RED}" stroke-width="0.14" stroke-dasharray="0.55 0.4"/>`);
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
  els.push(textEl(QR_X + QR_SIZE / 2, QR_Y + QR_SIZE + S.keyGap, key, S.keySize,
    { factor: .55, maxW: QR_SIZE + 1.0, font: MONO, anchor: "middle" }));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">\n<rect width="${W}" height="${H}" fill="#fff"/>\n${els.filter(Boolean).join("\n")}\n</svg>`;
  return { svg, content, moduleCount: n, W, H };
}

function b64EncodeUnicode(str) {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode("0x" + p1)));
}

// SVG 문자열의 viewBox에서 라벨 실치수(mm)를 읽는다 — 사이즈별 렌더 크기 대응
function svgDims(svg) {
  const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  return m ? { W: parseFloat(m[1]), H: parseFloat(m[2]) } : { W: 40, H: 20 };
}

export function renderCanvas(svg, dpi) {
  return new Promise((resolve, reject) => {
    const { W, H } = svgDims(svg);
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

// 203dpi(감열 프린터 인쇄 해상도)로 래스터화한 뒤 jsQR로 실제 디코드 — 인쇄 전 자동 검증.
export async function verifyQr(svg, expectedContent, dpi = 203) {
  const { ctx, pxW, pxH } = await renderCanvas(svg, dpi);
  const imageData = ctx.getImageData(0, 0, pxW, pxH);
  const result = jsQR(imageData.data, pxW, pxH);
  return { ok: !!result && result.data === expectedContent, decoded: result ? result.data : null };
}
