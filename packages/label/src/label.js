// Bean-Hoarder — 라벨 렌더러 단일 모듈 (@bnhd/label)
// 미리보기, PNG/SVG 다운로드, QR 검증이 모두 이 코드를 사용한다 (렌더러 이중화 제거).
// 헤드라인 조합 규칙은 조회·덱과 공유하는 단일 소스(@bnhd/schema/headline)에서 가져온다 —
// 라벨은 SVG라 대소문자 CSS가 없으므로 렌더 시점에 직접 .toUpperCase()를 건다.
import { buildHeadline, headlineUsedFields, stripParen } from "@bnhd/schema/headline";
import jsQR from "jsqr";
import qrcode from "qrcode-generator";
//
// 사이즈 3종을 지원한다. 40×20·50×30은 가로형 보딩패스, 50×60은 세로 카드형 레이아웃.
// QR은 3사이즈 모두 동일한 물리 크기(약 9.4mm, 도트 격자 스냅)로 고정한다 — 스캔에
// 필요한 크기는 라벨이 커진다고 늘어나지 않으므로, 커진 여백은 QR 확대가 아니라
// 정보 표시량 차이(부제목·스펙 항목 수)로 반영한다. 사용자 조절 대상이 아니다.

export const BASE_URL = "HTTPS://BNHD.PAGES.DEV";

const SANS = "Arial, Helvetica, sans-serif";
const MONO = "Consolas, 'Courier New', monospace";
const _QUIET = 1.3;

// 감열 라벨 프린터(203dpi) 도트 피치 ≈ 0.12512mm. 렌더 캔버스가 mm→px 반올림되므로
// 0.125mm(8px/mm) 격자로 스냅하면 검증·다운로드 PNG에서 QR 모듈 경계가 픽셀에 정확히 떨어진다.
// (실제 도트와 0.1% 차이 — 물리 인쇄에는 무의미)
const DOT = 0.125;

// 2도 감열 인쇄(블랙+레드)용 레드 채널. QR·본문은 블랙만 사용.
const RED = "#e8341c";

// [필드키, 라벨 인쇄 약어, 관리자 화면 표시명]
// 로스팅일·패키징일은 필수 입력 정보라 이 풀에 넣지 않고 항상 고정 위치(최하단/QR 옆)에 인쇄한다 — buildLabelSVG 참고.
// 배열 순서 = 기본 표시 우선순위(공간이 부족할 때 뒤쪽부터 자동으로 숨겨짐) — lab.js에서 사용자가 직접 재정렬 가능.
// 우선순위 체계(#27): 가공·품종은 2순위(향미·정체성), 고도·수확시기는 3순위(전문 디테일)이므로
// 2순위를 앞에 둔다. 용량(NET)은 유통 필수라 1위 유지, 로스팅 포인트는 품종 다음.
export const SPEC_POOL = [
  ["NET_WEIGHT", "NET", "용량"],
  ["PROCESS", "PROC", "가공"],
  ["VARIETY", "VAR", "품종"],
  ["AGTRON", "RSTP", "로스팅 포인트"],
  ["ALTITUDE", "ALT", "고도"],
  ["HARVEST", "CROP", "수확시기"],
];
// 부제목 줄(헤드라인 바로 아래 한 줄) — 지역·랏·워싱스테이션·생산자 중 최대 3개 선택.
export const SUB_POOL = [
  ["REGION", "지역"],
  ["LOT", "랏"],
  ["WASHING_STATION", "워싱스테이션"],
  ["PRODUCER", "생산자"],
];

// ── 사이즈별 지오메트리 (mm) ─────────────────────────────────
// headline/specVal의 def는 기본값, min/max는 스튜디오 슬라이더 범위.
export const SIZE_SPECS = {
  "40x20": {
    W: 40,
    H: 20,
    orient: "landscape",
    label: "40×20 (기본)",
    margin: 1.8,
    strip: 0.6,
    quiet: 1.3,
    qrDots: 3,
    qrRightGap: 1.3,
    qrY: 8.4,
    keySize: 1.2,
    keyGap: 1.7,
    // 40×20은 물리적으로 가장 작아 감열(203dpi) 인쇄 시 가독성이 관건 — 표시 정보량을 줄이더라도
    // 글자를 키운다. 자세한 정보는 QR로 확인하고, 라벨엔 핵심(산지·부제목·날짜)만 크게 싣는다.
    headline: { def: 3.1, min: 2.6, max: 3.8 },
    specVal: { def: 1.8, min: 1.5, max: 2.2 },
    roasterySize: 1.6,
    roasteryY: 3.0,
    dotR: 0.4,
    dotCy: 2.5,
    headY: 6.0,
    infoStart: 8.4,
    infoLH: 1.9,
    infoSize: 1.55,
    divOffset: 0.55,
    divMin: 7.4,
    specTopOff: 1.95,
    specLH: 2.4,
    specLabelSize: 1.3,
    specLabelW: 3.4,
    specGapX: 3.8,
    specValueMax: 9.0,
    col2: 12.8,
    noteSize: 1.45,
    noteGapSpec: 1.9,
    noteGapDiv: 1.7,
    bottom: 19.4,
    logoBox: [32.7, 1.3, 6.0, 5.0],
  },
  "50x30": {
    W: 50,
    H: 30,
    orient: "landscape",
    label: "50×30 (여유형)",
    margin: 2.0,
    strip: 0.8,
    quiet: 2.0,
    qrDots: 3,
    qrRightGap: 1.6,
    qrY: 18.0,
    keySize: 1.5,
    keyGap: 2.0,
    headline: { def: 3.6, min: 2.8, max: 4.6 },
    specVal: { def: 2.1, min: 1.7, max: 2.6 },
    roasterySize: 1.9,
    roasteryY: 3.6,
    dotR: 0.48,
    dotCy: 3.0,
    headY: 7.2,
    infoStart: 9.6,
    infoLH: 2.05,
    infoSize: 1.7,
    divOffset: 0.7,
    divMin: 8.8,
    specTopOff: 2.5,
    specLH: 3.0,
    specLabelSize: 1.35,
    specLabelW: 4.2,
    specGapX: 4.6,
    specValueMax: 12.0,
    col2: 16.5,
    noteSize: 1.65,
    noteGapSpec: 2.3,
    noteGapDiv: 2.1,
    bottom: 29.0,
    logoBox: [40.5, 1.8, 7.5, 6.0],
  },
  "50x60": {
    W: 50,
    H: 60,
    orient: "portrait",
    label: "50×60 (카드형)",
    margin: 2.4,
    strip: 1.0,
    quiet: 1.8,
    qrDots: 3,
    qrY: 46.75,
    keySize: 1.8,
    keyGap: 2.2,
    headline: { def: 4.4, min: 3.4, max: 5.4 },
    specVal: { def: 2.3, min: 1.8, max: 3.0 },
    roasterySize: 2.3,
    roasteryY: 5.0,
    dotR: 0.58,
    dotCy: 4.25,
    headY: 9.4,
    headMaxLines: 2,
    infoLH: 2.6,
    infoSize: 2.0,
    divOffset: 0.8,
    specTopOff: 3.0,
    specLH: 3.8,
    specLabelSize: 1.5,
    specLabelW: 5.0,
    specGapX: 5.6,
    specValueMax: 15.5,
    noteSize: 2.0,
    noteGapSpec: 2.8,
    noteGapDiv: 2.4,
    logoBox: [39.6, 2.0, 8.0, 6.5],
  },
};

// 사이즈가 커질수록 물리적 여유가 생기므로 기본으로 표시하는 항목 수도 늘린다.
// (사용자가 직접 토글을 바꾼 뒤에는 사이즈를 바꿔도 이 기본값으로 되돌리지 않는다 — lab.js 참고)
// 2순위(가공·품종)를 기본 노출하고, 사이즈가 커질수록 3순위(고도)까지 더한다.
// 테이스팅 노트는 별도 토글 없이 값이 있으면 항상 표시된다(buildLabelSVG의 노트 예약 로직).
export const SIZE_DEFAULT_FIELDS = {
  "40x20": { subFields: ["REGION"], specFields: ["NET_WEIGHT", "PROCESS"] },
  "50x30": { subFields: ["REGION"], specFields: ["NET_WEIGHT", "PROCESS", "VARIETY"] },
  "50x60": { subFields: ["REGION"], specFields: ["NET_WEIGHT", "PROCESS", "VARIETY", "ALTITUDE"] },
};

export const DEFAULT_DESIGN = {
  size: "40x20",
  colorMode: "mono", // "color"(레드+블랙 2도 인쇄) | "mono"(블랙만) — 흑백만 지원하는 감열 프린터가 많아 기본값으로 둔다
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
  const budget = maxW / unitW - 1; // "…" 자리 확보
  let u = 0,
    out = "";
  for (const ch of text) {
    u += unitsOf(ch);
    if (u > budget) break;
    out += ch;
  }
  return `${out.trimEnd()}…`;
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
    let u = 0,
      cut = 0,
      lastSpace = -1;
    const chars = [...rest];
    for (let i = 0; i < chars.length; i++) {
      u += unitsOf(chars[i]);
      if (chars[i] === " ") lastSpace = i;
      if (u > budget) {
        cut = i;
        break;
      }
    }
    if (lastSpace > cut * 0.55) cut = lastSpace;
    if (cut <= 0) cut = 1;
    lines.push(chars.slice(0, cut).join("").trim());
    rest = chars.slice(cut).join("").trim();
  }
  return lines;
}

// 토큰을 구분자로 이어붙이며 폭 예산 안에서 최대한 채운다 — 넘치는 토큰은 통째로 생략(말줄임 없이).
function fitJoin(tokens, sep, size, factor, maxW) {
  let out = "";
  for (const t of tokens) {
    const candidate = out ? `${out}${sep}${t}` : t;
    if (textUnits(candidate) * size * factor <= maxW) out = candidate;
    else break;
  }
  return out;
}

// 테이스팅 노트는 한 줄만 인쇄한다. 콤마로 구분된 항목(예: "Grape, Cherry Cordial, Tropical Citrus")을
// 통째로 넣어보고 안 들어가면 다 들어가는 항목까지만 남긴다 — 말줄임(…)으로 단어 중간을 자르는 대신
// "NET 250g ALT 1850-1910m Grape, Cherry Cordial"처럼 완전한 항목만 보여준다.
function fitNoteLine(text, size, factor, maxW) {
  const segments = text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!segments.length) return "";
  const out = fitJoin(segments, ", ", size, factor, maxW);
  if (out) return out;
  // 첫 항목조차 안 들어가면 단어 경계까지만(말줄임 없이) 줄인다.
  return fitJoin(segments[0].split(/\s+/), " ", size, factor, maxW);
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

function specCell(S, x, y, label, value, size, ink) {
  return (
    textEl(x, y, label, S.specLabelSize, { factor: 0.55, maxW: S.specLabelW, font: MONO, fill: ink }) +
    textEl(x + S.specGapX, y, value, size, { factor: 0.55, maxW: S.specValueMax, font: MONO, weight: "bold" })
  );
}

// 스펙 그리드를 줄 단위로 배치: 값이 칸 절반 폭에 들어가면 2열 한 줄, 넘치면 그 항목만
// 전체 폭으로 단독 줄(최대 2줄 랩)을 차지한다 — 말줄임(…)으로 잘리는 대신 줄바꿈으로 전문을 보존한다.
function layoutSpecRows(list, specValueSize, S, fullMaxW) {
  const fitsHalf = (v) => textUnits(v) * specValueSize * 0.55 <= S.specValueMax;
  const rows = [];
  let pending = null;
  for (const item of list) {
    if (fitsHalf(item[1])) {
      if (pending) {
        rows.push({ items: [pending, item] });
        pending = null;
      } else pending = item;
    } else {
      if (pending) {
        rows.push({ items: [pending] });
        pending = null;
      }
      rows.push({ items: [item], lines: wrapN(item[1], specValueSize, 0.55, fullMaxW, 2) });
    }
  }
  if (pending) rows.push({ items: [pending] });
  const totalLines = rows.reduce((n, r) => n + (r.lines ? r.lines.length : 1), 0);
  return { rows, totalLines };
}

export function buildLabelSVG(row, design = DEFAULT_DESIGN, logoDataUrl = null) {
  const S = SIZE_SPECS[design.size] || SIZE_SPECS["40x20"];
  const { W, H } = S;
  const headlineSize = design.headlineSize || S.headline.def;
  const specValueSize = design.specValueSize || S.specVal.def;
  const g = (k) => (row[k] || "").trim();

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
  // 세로형(카드형)은 QR을 우측에 붙이고, 로스팅일·패키징일을 좌측에 두 줄로 쌓아 배치한다
  // (보딩패스 스텁의 바코드 옆 항공편 정보 컨셉 — buildLabelSVG 하단 참고).
  const QR_X = portrait
    ? Math.round((W - S.margin - QR_SIZE) / DOT) * DOT
    : Math.round((W - S.qrRightGap - QR_SIZE) / DOT) * DOT;
  const QR_Y = Math.round(S.qrY / DOT) * DOT;
  const FULL_MAX = W - S.margin * 2;
  // 가로형은 우측 QR 옆 폭, 세로형은 하단 QR 위까지 전폭
  const TEXT_MAX = portrait ? FULL_MAX : QR_X - S.quiet - S.margin;
  const BOTTOM = portrait ? QR_Y - S.quiet : S.bottom;
  const hasLogo = design.showLogo && logoDataUrl;
  const headMax = hasLogo ? S.logoBox[0] - 0.8 - S.margin : portrait ? FULL_MAX : FULL_MAX;
  // 흑백 프린터용 옵션: 레드 채널을 전부 블랙으로 대체한다 (2도 인쇄가 불가능한 감열 프린터가 많음).
  const INK = design.colorMode === "mono" ? "#000" : RED;

  const els = [];
  if (hasLogo) {
    const [lx, ly, lw, lh] = S.logoBox;
    els.push(
      `<image x="${lx}" y="${ly}" width="${lw}" height="${lh}" preserveAspectRatio="xMaxYMin meet" href="${logoDataUrl}"/>`,
    );
  }

  // ── 보딩패스 컨셉 (블랙 + 레드 2도 인쇄, 흑백 옵션 시 전부 블랙) ──
  // 상단 스트립 / 도트 + 로스터리 / 오리진 헤드라인(블랙) /
  // 정보 블록 / 점선 절취선 / 스펙 그리드(라벨+값) / 노트 / QR
  els.push(`<rect x="0" y="0" width="${W}" height="${S.strip}" fill="${INK}"/>`);
  const rst = g("ROASTERY").toUpperCase();
  if (rst) {
    els.push(`<circle cx="${(S.margin + S.dotR).toFixed(2)}" cy="${S.dotCy}" r="${S.dotR}" fill="${INK}"/>`);
    els.push(
      textEl(S.margin + S.dotR * 2 + 0.5, S.roasteryY, rst, S.roasterySize, {
        factor: 0.7,
        maxW: headMax - (S.dotR * 2 + 0.5),
        weight: "bold",
        spacing: 0.12,
        fill: INK,
      }),
    );
  }

  // 헤드라인: 가로형은 1줄 고정, 세로형(50×60)은 최대 2줄 랩
  // 국가 단독이 아니라 국가+세부장소[+랏] 조합(또는 시그니쳐/블렌드명)으로 변별력을 높인다.
  let yCur;
  // 헤드라인은 대문자로 강제하지 않는다 — 대문자는 같은 이름을 7% 넓게 만들어 잘림을 앞당기고,
  // Yirgacheffe·La Cabaña 같은 고유명사의 결을 뭉갠다. 로스터리·KEY는 마이크로 캡스라 그대로 둔다.
  const origin = buildHeadline(row);
  if (portrait) {
    const headLines = wrapN(origin, headlineSize, 0.68, headMax, S.headMaxLines || 2);
    let hy = S.headY;
    for (const line of headLines) {
      els.push(textEl(S.margin, hy, line, headlineSize, { factor: 0.68, maxW: headMax, weight: "bold" }));
      hy += headlineSize * 1.15;
    }
    yCur = hy - headlineSize * 1.15 + S.infoLH + 0.9;
  } else {
    els.push(
      textEl(S.margin, S.headY, origin, headlineSize, { factor: 0.68, maxW: headMax, weight: "bold" }),
    );
    yCur = S.infoStart;
  }

  const labelVal = (f) => {
    const v = g(f);
    return f === "REGION" ? stripParen(v) : v;
  };

  // ── 플로우 레이아웃: 내용량에 따라 y를 흘려 배치 ──
  // 헤드라인이 이미 쓴 장소·랏은 부제목에서 제외해 중복 인쇄를 막는다.
  const usedInHead = headlineUsedFields(row);
  const subOrder = SUB_POOL.map(([k]) => k).filter(
    (k) => design.subFields.includes(k) && !usedInHead.includes(k),
  );
  const infoText = subOrder.map(labelVal).filter(Boolean).join(" · ");

  // 로스팅일·패키징일은 필수 정보라 사용자가 끄거나 순서를 바꿀 수 없는 고정 푸터로 인쇄한다.
  // 가로형은 라벨 최하단에 한 줄(2열)로, 세로형(카드형)은 QR 좌측에 두 줄로 타이트하게 고정한다 —
  // 가로형만 그 한 줄만큼 아래 flow 레이아웃의 바닥 예산을 당긴다(세로형은 QR 옆 여백을 쓰므로 본문 예산을 그대로 쓴다).
  const CONTENT_BOTTOM = portrait ? BOTTOM : BOTTOM - S.specLH;

  // 스펙 후보 확정 (서브라인에 이미 표시되는 필드는 중복 인쇄 방지) — 최대 8개, 선택 순서가 우선순위
  const labelOf = (k) => (SPEC_POOL.find(([key]) => key === k) || [k, k])[1];
  const specVal = (f) => {
    if (f === "AGTRON") return g(f).split(/\s+/)[0];
    if (f === "PROCESS" || f === "VARIETY") return stripParen(g(f));
    return g(f);
  };
  const allSpecs = design.specFields
    .slice(0, 8)
    .filter((f) => !design.subFields.includes(f))
    .map((f) => [f, specVal(f)])
    .filter(([, v]) => v);
  const specFullMaxW = TEXT_MAX - S.specGapX;
  const hasNote = !!g("TASTING_NOTE");
  const infoStart = yCur;

  // 부제목(지역·가공·품종)은 절대 잘리면 안 되는 핵심 정보 — 본문 세로 예산 안에서 필요한 만큼
  // 줄바꿈해 전문을 모두 싣는다(현실적으로 1~2줄). 남는 공간에만 스펙·노트를 채운다.
  const maxSubLines = Math.max(1, Math.floor((CONTENT_BOTTOM - infoStart) / S.infoLH) + 1);
  if (infoText) {
    for (const line of wrapN(infoText, S.infoSize, 0.52, TEXT_MAX, maxSubLines)) {
      els.push(textEl(S.margin, yCur, line, S.infoSize, { factor: 0.52, maxW: TEXT_MAX }));
      yCur += S.infoLH;
    }
  }

  // 절취선: 보딩패스의 퍼포레이션 — 부제목 바로 아래
  const divMin = portrait ? infoStart - S.infoLH + S.divOffset : S.divMin;
  const divY = Math.max(divMin, yCur - S.infoLH + S.divOffset);
  const divX2 = portrait ? W - S.margin : QR_X - S.quiet;
  els.push(
    `<line x1="${S.margin}" y1="${divY.toFixed(2)}" x2="${divX2.toFixed(2)}" y2="${divY.toFixed(2)}" stroke="${INK}" stroke-width="0.14" stroke-dasharray="0.55 0.4"/>`,
  );

  // 스펙 그리드: 절취선 아래 남는 공간에 채우되, 넘치면 우선순위 낮은(나중 선택) 항목부터 드롭한다.
  // 값이 칸 절반 폭을 넘으면 그 항목만 전체 폭 단독 줄(최대 2줄 랩) — 로스팅 포인트는 "#95 (라이트)" 중 "#95"만.
  // 테이스팅 노트(2순위)는 값이 있으면 반드시 표시하므로, 노트 한 줄을 스펙 채움 예산에서 미리 뺀다 —
  // 공간이 부족하면 스펙(3순위 항목 포함)이 먼저 드롭되고 노트가 살아남는다.
  const noteReserve = hasNote ? S.noteGapSpec + S.noteSize : 0;
  const specBottom = CONTENT_BOTTOM - noteReserve;
  const specTop = divY + S.specTopOff;
  const specFits = (lines) => specTop + (Math.max(lines, 1) - 1) * S.specLH <= specBottom;
  const specList = allSpecs.slice();
  let specLayout = layoutSpecRows(specList, specValueSize, S, specFullMaxW);
  while (specList.length > 0 && !specFits(specLayout.totalLines)) {
    specList.pop();
    specLayout = layoutSpecRows(specList, specValueSize, S, specFullMaxW);
  }

  const colX = portrait ? [S.margin, W / 2 + 0.6] : [S.margin, S.margin + S.col2];
  let rowY = specTop;
  specLayout.rows.forEach((row) => {
    if (row.items.length === 2) {
      row.items.forEach(([f, val], i) => {
        els.push(specCell(S, colX[i], rowY, labelOf(f), val, specValueSize, INK));
      });
      rowY += S.specLH;
    } else if (row.lines) {
      const [f] = row.items[0];
      row.lines.forEach((line, i) => {
        if (i === 0)
          els.push(
            textEl(colX[0], rowY, labelOf(f), S.specLabelSize, {
              factor: 0.55,
              maxW: S.specLabelW,
              font: MONO,
              fill: INK,
            }),
          );
        els.push(
          textEl(colX[0] + S.specGapX, rowY + i * S.specLH, line, specValueSize, {
            factor: 0.55,
            maxW: specFullMaxW,
            font: MONO,
            weight: "bold",
          }),
        );
      });
      rowY += row.lines.length * S.specLH;
    } else {
      const [f, val] = row.items[0];
      els.push(specCell(S, colX[0], rowY, labelOf(f), val, specValueSize, INK));
      rowY += S.specLH;
    }
  });
  // 테이스팅 노트: 항상 한 줄만, 본문 최하단(고정 푸터 바로 위)에 고정 — 스펙이 짧게 끝나도 붕 뜨지
  // 않고 날짜 바로 위에 자리잡는다. 위에서 노트 한 줄을 예약해 뒀으므로 스펙과 겹치지 않는다(항상 표시).
  if (hasNote) {
    const line = fitNoteLine(g("TASTING_NOTE"), S.noteSize, 0.5, TEXT_MAX);
    if (line)
      els.push(
        textEl(S.margin, CONTENT_BOTTOM, line, S.noteSize, { factor: 0.5, maxW: TEXT_MAX, style: "italic" }),
      );
  }

  // 세로형: QR 스텁 구획을 절취선으로 표시 (보딩패스의 티켓 스텁)
  if (portrait) {
    els.push(
      `<line x1="${S.margin}" y1="${(QR_Y - 1.2).toFixed(2)}" x2="${(W - S.margin).toFixed(2)}" y2="${(QR_Y - 1.2).toFixed(2)}" stroke="${INK}" stroke-width="0.14" stroke-dasharray="0.55 0.4"/>`,
    );
  }

  // 고정 푸터: 로스팅일·패키징일 — 필수 정보이므로 토글 여부와 무관하게 항상 인쇄
  if (portrait) {
    // 카드형: QR 왼쪽 옆에 "RSTD26.06.29 PKGD26.07.09" 한 줄로 촘촘하게 배치, QR 하단에 맞춰 정렬.
    // 라벨·값 사이 간격을 specGapX보다 훨씬 좁게 둬 좁은 QR 옆 공간에 한 줄로 들어가게 한다.
    const dateY = QR_Y + QR_SIZE;
    const tightGap = 0.3,
      pairGap = 2.2;
    let dx = S.margin;
    [
      ["RSTD", g("ROAST_DATE")],
      ["PKGD", g("PACKAGE_DATE")],
    ].forEach(([label, value], i) => {
      if (i > 0) dx += pairGap;
      els.push(textEl(dx, dateY, label, S.specLabelSize, { factor: 0.55, maxW: 12, font: MONO, fill: INK }));
      dx += textUnits(label) * S.specLabelSize * 0.55 + tightGap;
      els.push(
        textEl(dx, dateY, value, specValueSize, { factor: 0.55, maxW: 14, font: MONO, weight: "bold" }),
      );
      dx += textUnits(value) * specValueSize * 0.55;
    });
  } else {
    // 가로형: 라벨 최하단에 한 줄(2열)로 — 기존 레이아웃
    els.push(specCell(S, colX[0], BOTTOM, "RSTD", g("ROAST_DATE"), specValueSize, INK));
    els.push(specCell(S, colX[1], BOTTOM, "PKGD", g("PACKAGE_DATE"), specValueSize, INK));
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
  els.push(
    textEl(QR_X + QR_SIZE / 2, QR_Y + QR_SIZE + S.keyGap, key, S.keySize, {
      factor: 0.55,
      maxW: QR_SIZE + 1.0,
      font: MONO,
      anchor: "middle",
    }),
  );

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">\n<rect width="${W}" height="${H}" fill="#fff"/>\n${els.filter(Boolean).join("\n")}\n</svg>`;
  return { svg, content, moduleCount: n, W, H };
}

// ── QR 단독 (라벨 없이 QR만) ──────────────────────────────────
// 라벨 레이아웃은 쓰는 사람마다 다르고 프린터 호환도 보장할 수 없다. 그래서 서비스가 책임지는 산출물은
// "어떤 라벨 소프트웨어에 얹어도 스캔되는 QR"이고, 그 인쇄 기하를 여기서 라벨과 같은 근거로 만든다.
// (랩에 복제하지 않는 이유 — BASE_URL·DOT·인코딩 모드가 갈라지면 인쇄된 라벨과 어긋난다.)

/** 모듈당 도트 수 선택지 — DOT의 정수배라야 203dpi에서 모듈 경계가 픽셀에 정확히 떨어진다. */
export const QR_DOT_OPTIONS = [3, 4, 5];

/**
 * 콰이엇존(여백) 모듈 수.
 *
 * QR 규격(ISO/IEC 18004)은 4모듈을 요구하지만, 이 이미지는 **라벨 위에 얹는 부품**이다 —
 * 라벨의 흰 바탕이 나머지 여백을 대신해 주므로 이미지 자체는 2모듈만 갖는다. 4모듈로 내보내면
 * 배치할 때 눈에 보이는 여백이 과해 라벨 레이아웃이 불편해진다.
 * **전제**: QR 주변은 흰색이어야 한다. 어두운 배경·테두리에 바로 붙이면 스캔이 깨질 수 있다.
 */
const QR_QUIET_MODULES = 2;

/**
 * 인쇄되는 QR 이미지 한 변의 mm — **콰이엇존 포함 전체**다.
 *
 * buildQrSVG가 쓰는 바로 그 식이라, 이 값을 화면에 적어 두면 파일과 어긋날 수 없다.
 * 랩이 크기를 표시하려고 DOT을 손으로 다시 적던 것을 대신한다 — 203dpi 도트 피치나
 * 콰이엇존을 바꾸면 SVG와 표시가 함께 움직여야 하고, 그러려면 식이 한 곳에 있어야 한다.
 *
 * @param {number} dots 모듈당 도트 수 (QR_DOT_OPTIONS)
 * @param {number} moduleCount QR 한 변의 모듈 수 (buildQrSVG가 돌려주는 moduleCount)
 */
export function qrSizeMM(dots, moduleCount) {
  return dots * DOT * (moduleCount + 2 * QR_QUIET_MODULES);
}

/**
 * 인쇄용 QR 단독 SVG.
 * @param {string} key 라벨 KEY (`{유저코드4}{연도2}-{순번3}`)
 * @param {number} dots 모듈당 도트 수 (QR_DOT_OPTIONS)
 * @returns {{svg:string, content:string, moduleCount:number, codeSize:number, size:number}}
 *   codeSize = QR 자체 한 변(mm), size = 콰이엇존 포함 전체(mm)
 */
export function buildQrSVG(key, dots = 3) {
  const k = String(key || "").toUpperCase();
  const content = `${BASE_URL}/${k}`;
  const qr = qrcode(0, "M");
  qr.addData(content, "Alphanumeric");
  qr.make();
  const n = qr.getModuleCount();
  const module = dots * DOT;
  const quiet = QR_QUIET_MODULES * module;
  const codeSize = module * n;
  const size = qrSizeMM(dots, n);

  let rects = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) {
        rects += `<rect x="${(quiet + c * module).toFixed(4)}" y="${(quiet + r * module).toFixed(4)}" width="${module.toFixed(4)}" height="${module.toFixed(4)}" fill="#000"/>`;
      }
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}mm" height="${size}mm" viewBox="0 0 ${size} ${size}">\n<rect width="${size}" height="${size}" fill="#fff"/>\n${rects}\n</svg>`;
  return { svg, content, moduleCount: n, codeSize, size };
}

function b64EncodeUnicode(str) {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(`0x${p1}`)));
}

// SVG 문자열의 viewBox에서 라벨 실치수(mm)를 읽는다 — 사이즈별 렌더 크기 대응
function svgDims(svg) {
  const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  return m ? { W: parseFloat(m[1]), H: parseFloat(m[2]) } : { W: 40, H: 20 };
}

export function renderCanvas(svg, dpi) {
  return new Promise((resolve, reject) => {
    const { W, H } = svgDims(svg);
    const pxW = Math.round((W / 25.4) * dpi);
    const pxH = Math.round((H / 25.4) * dpi);
    const canvas = document.createElement("canvas");
    canvas.width = pxW;
    canvas.height = pxH;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, pxW, pxH);
      ctx.drawImage(img, 0, 0, pxW, pxH);
      resolve({ canvas, ctx, pxW, pxH });
    };
    img.onerror = reject;
    img.src = `data:image/svg+xml;base64,${b64EncodeUnicode(svg)}`;
  });
}

export async function renderPngBlob(svg, dpi) {
  const { canvas } = await renderCanvas(svg, dpi);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

// 203dpi(감열 프린터 인쇄 해상도)로 래스터화한 뒤 jsQR로 실제 디코드 — 인쇄 전 자동 검증.
export async function verifyQr(svg, expectedContent, dpi = 203) {
  const { ctx, pxW, pxH } = await renderCanvas(svg, dpi);
  const imageData = ctx.getImageData(0, 0, pxW, pxH);
  const result = jsQR(imageData.data, pxW, pxH);
  return { ok: !!result && result.data === expectedContent, decoded: result ? result.data : null };
}
