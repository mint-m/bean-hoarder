// Bean-Hoarder — 붙여넣은 텍스트에서 원두 정보를 추출하는 휴리스틱 파서.
// OCR/NLP가 아니라 "로스터리 상품 페이지에서 흔히 보이는 패턴"만 인식한다.
// 결과는 항상 폼에 채워진 뒤 사용자가 검토·수정하고 저장하므로 완벽할 필요는 없다 — 타이핑량만 줄이면 충분.

const ORIGIN_LIST = ["ETHIOPIA", "COLOMBIA", "BRAZIL", "KENYA", "GUATEMALA", "HONDURAS",
  "COSTA RICA", "PANAMA", "PERU", "INDONESIA", "YEMEN", "RWANDA", "BURUNDI", "TANZANIA",
  "EL SALVADOR", "NICARAGUA", "MEXICO", "INDIA", "VIETNAM"];
const PROCESS_LIST = ["Washed", "Natural", "Honey", "Anaerobic", "Wet-Hulled",
  "Carbonic Maceration", "Semi-Washed"];
const VARIETY_HINTS = ["Bourbon", "Typica", "Caturra", "Catuai", "Gesha", "Geisha",
  "Pacamara", "Maragogype", "Castillo", "Wush Wush", "Heirloom", "Landrace",
  "SL28", "SL34", "SL9"];

// 라벨(한/영) → 내부 필드키 동의어. "Label: value" / "Label - value" 줄을 최우선으로 인식.
const LABEL_SYNONYMS = {
  ROASTERY: ["roastery", "roaster", "로스터리", "로스터"],
  ORIGIN: ["origin", "country", "산지", "원산지", "국가"],
  REGION: ["region", "area", "zone", "woreda", "village", "지역", "세부지역", "마을"],
  PRODUCER: ["producer", "farmer", "grower", "생산자", "농장"],
  LOT: ["lot name", "lot", "로트명", "랏"],
  WASHING_STATION: ["washing station", "wet mill", "워싱스테이션", "수세소"],
  VARIETY: ["variety", "varietal", "cultivar", "품종"],
  PROCESS: ["process", "processing", "가공방식", "가공"],
  ALTITUDE: ["altitude", "elevation", "고도"],
  HARVEST: ["harvest", "crop year", "수확시기", "수확"],
  NET_WEIGHT: ["net weight", "weight", "용량", "중량"],
  TASTING_NOTE: ["tasting notes", "tasting note", "notes", "flavor", "cup", "테이스팅 노트", "노트"],
  MEMO: ["memo", "비고", "메모", "about", "about beans", "about this coffee", "about the coffee",
    "our story", "the story", "story", "description", "배경", "소개"],
};

// 값이 라벨과 같은 줄이 아니라 "라벨" 한 줄 + 다음 줄(들)에 값이 오는 사이트 구조용
// (예: <div>Region</div><div>Villa Rica</div> 처럼 콜론 없이 블록만 나뉘는 경우).
// 오탐을 줄이기 위해 이 줄 전체가 라벨 동의어와 "정확히" 일치할 때만 매칭한다.
function findFieldForLabelExact(raw) {
  const n = normLabel(raw.replace(/^[-•*]\s*/, "").replace(/[:：]\s*$/, ""));
  for (const [field, syns] of Object.entries(LABEL_SYNONYMS)) {
    if (syns.some(s => n === s)) return field;
  }
  return null;
}

// 품종·가공방식처럼 원래 짧아야 하는 필드에 두 번째로 매칭되는 값이 문장형 문단이면
// (예: "PROCESS: Washed" 뒤에 별도로 "PROCESSING" 섹션의 상세 공정 설명이 또 있는 경우)
// 그 필드를 덮어쓰는 대신 메모 후보로 돌린다 — 라벨 렌더링은 짧은 값을 전제로 한다.
const SHORT_FIELDS = ["PROCESS", "VARIETY", "WASHING_STATION", "LOT"];
const isLongText = v => v.length > 50 || /[.!?]\s+[A-Z]/.test(v) || v.includes("\n");

const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
function monthDot(name, year) {
  const m = MONTHS[name.toLowerCase().replace(/\.$/, "")];
  return m ? `${String(year).slice(2)}.${String(m).padStart(2, "0")}` : null;
}
// "Month YYYY – Month YYYY" 또는 "Month YYYY" 형태를 로스팅/패키징일과 같은 점(dot) 표기(yy.mm)로 정규화.
// 매칭 실패 시 원문 그대로 반환.
function normalizeHarvestMonths(s) {
  let m = /([A-Za-z]{3,9})\.?\s+(20\d{2})\s*(?:[-–~]|to|and)\s*([A-Za-z]{3,9})\.?\s+(20\d{2})/i.exec(s);
  if (m) {
    const d1 = monthDot(m[1], m[2]), d2 = monthDot(m[3], m[4]);
    if (d1 && d2) return `${d1}-${d2}`;
  }
  m = /([A-Za-z]{3,9})\.?\s+(20\d{2})/.exec(s);
  if (m) {
    const d = monthDot(m[1], m[2]);
    if (d) return d;
  }
  return s;
}

function normLabel(s) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function findFieldForLabel(raw) {
  const n = normLabel(raw);
  for (const [field, syns] of Object.entries(LABEL_SYNONYMS)) {
    if (syns.some(s => n === s || n.includes(s))) return field;
  }
  return null;
}

export function parseBeanText(text) {
  const out = {};
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // 1) "라벨: 값" / "라벨 - 값" 형태의 줄을 우선 인식 (스펙시트 스타일 상품 페이지에 흔함)
  //    REGION만 예외: Region/Area/Village처럼 여러 줄이 같은 필드로 매핑될 수 있어 콤마로 이어붙인다
  //    (지역 계층을 별도 필드로 쪼개지 않고 한 줄 자유 텍스트로 유지하기로 한 결정에 따름).
  for (const line of lines) {
    const m = /^([\w \/·]{2,24})\s*[:：\-–]\s*(.+)$/.exec(line);
    if (!m) continue;
    const field = findFieldForLabel(m[1]);
    if (!field) continue;
    const value = m[2].trim();
    if (field === "REGION") {
      out.REGION = out.REGION ? `${out.REGION}, ${value}` : value;
    } else if (!out[field]) {
      out[field] = value;
    } else if (SHORT_FIELDS.includes(field) && isLongText(value) && !out.MEMO) {
      out.MEMO = value;
    }
  }

  // 1b) "라벨"만 있는 줄 다음에 값이 오는 구조 (콜론 없이 블록 요소로만 라벨/값이 분리되는
  //     사이트에서 흔함 — 위 1)의 "같은 줄" 패턴으로는 못 잡는다).
  //     MEMO는 서술형 문단일 수 있어 다음 라벨 줄이 나오기 전까지 여러 줄을 이어붙인다.
  for (let i = 0; i < lines.length; i++) {
    const field = findFieldForLabelExact(lines[i]);
    if (!field) continue;
    if (out[field] && field !== "REGION" && field !== "MEMO") {
      // 이미 채운 짧은 필드에 또 매칭됐고 그 값이 문단이면(상세 설명 섹션), 메모로 돌린다.
      const next = lines[i + 1];
      if (SHORT_FIELDS.includes(field) && next && !findFieldForLabelExact(next) && isLongText(next) && !out.MEMO) {
        out.MEMO = next;
        i++;
      }
      continue;
    }
    if (field === "MEMO") {
      const parts = [];
      let chars = 0;
      let j = i + 1;
      for (; j < lines.length && chars < 600; j++) {
        if (findFieldForLabelExact(lines[j])) break;
        parts.push(lines[j]);
        chars += lines[j].length;
      }
      if (parts.length) {
        out.MEMO = (out.MEMO ? out.MEMO + " " : "") + parts.join(" ").trim();
        i = j - 1;   // 소비한 줄들을 다시 라벨 후보로 재검사하지 않도록 건너뛴다
      }
    } else {
      const next = lines[i + 1];
      if (next && !findFieldForLabelExact(next)) {
        if (field === "REGION") out.REGION = out.REGION ? `${out.REGION}, ${next}` : next;
        else out[field] = next;
        i++;
      }
    }
  }

  // 라벨 인식으로 채운 산지는 원문 대소문자가 제각각이므로, 알려진 국가명이면 표준 표기(대문자)로 맞춘다.
  if (out.ORIGIN) {
    const canon = ORIGIN_LIST.find(c => c.toLowerCase() === out.ORIGIN.trim().toLowerCase());
    out.ORIGIN = canon || out.ORIGIN.trim();
  }

  // 라벨 인식으로 채운 수확시기를 정규화: "2024/2025"→"24/25", 단일 "2024"→"24",
  // "December 2025 – January 2026"→"25.12-26.01"(로스팅/패키징일과 같은 점 표기).
  if (out.HARVEST) {
    let m = /(20\d{2})\s*[\/\-]\s*(?:20)?(\d{2})/.exec(out.HARVEST);
    if (m) out.HARVEST = `${m[1].slice(2)}/${m[2]}`;
    else if ((m = /^(20\d{2})$/.exec(out.HARVEST.trim()))) out.HARVEST = m[1].slice(2);
    else out.HARVEST = normalizeHarvestMonths(out.HARVEST);
  }

  // 라벨 인식으로 이미 채운 고도·용량은 표기가 제각각이므로("1900-2250m", "150g" 등)
  // 폼의 단위 자동 부착(withUnit)과 겹치지 않도록 숫자만 남긴다.
  if (out.ALTITUDE) {
    const m = /(\d{3,4}\s*[-~–]\s*\d{3,4}|\d{3,4})/.exec(out.ALTITUDE);
    out.ALTITUDE = m ? m[1].replace(/\s+/g, "").replace(/[~–]/g, "-") : "";
    if (!out.ALTITUDE) delete out.ALTITUDE;
  }
  if (out.NET_WEIGHT) {
    const m = /(\d+(?:\.\d+)?)\s*(kg|g)?/i.exec(out.NET_WEIGHT);
    if (m) {
      const grams = (m[2] || "").toLowerCase() === "kg" ? Math.round(parseFloat(m[1]) * 1000) : parseInt(m[1], 10);
      out.NET_WEIGHT = grams > 0 ? String(grams) : "";
    } else {
      out.NET_WEIGHT = "";
    }
    if (!out.NET_WEIGHT) delete out.NET_WEIGHT;
  }

  const whole = text.replace(/\s+/g, " ");

  // 2) 산지: 알려진 국가명이 텍스트 어딘가에 있으면 채택 (라벨로 못 찾았을 때만)
  if (!out.ORIGIN) {
    const hit = ORIGIN_LIST.find(c => new RegExp(`\\b${c}\\b`, "i").test(whole));
    if (hit) out.ORIGIN = hit;
  }

  // 3) 가공방식: 모든 등장을 스캔해 괄호 상세 설명까지 포함한 가장 긴 매치를 채택
  //    (예: 짧은 "Washed" 언급과 긴 "Washed (36 hours wet fermentation...)" 문장이 둘 다 있으면 후자를 선택)
  if (!out.PROCESS) {
    let best = null;
    for (const p of PROCESS_LIST) {
      const re = new RegExp(`\\b${p.replace(/[- ]/g, "[- ]")}\\b(\\s*\\([^)]*\\))?`, "gi");
      let m;
      while ((m = re.exec(whole))) {
        if (!best || m[0].length > best.length) best = m[0];
      }
    }
    if (best) out.PROCESS = best.trim();
  }

  // 4) 품종: 알려진 품종 키워드 또는 에티오피아 JARC 5자리 코드(74xxx)
  if (!out.VARIETY) {
    const jarc = whole.match(/\b74\d{3}\b/);
    if (jarc) out.VARIETY = jarc[0];
    else {
      const hit = VARIETY_HINTS.find(v => new RegExp(`\\b${v}\\b`, "i").test(whole));
      if (hit) out.VARIETY = hit;
    }
  }

  // 5) 고도: "1900-2100m" / "2100 masl" 등 — 단위는 떼고 숫자만 반환(폼의 자동 단위 부착과 동일하게)
  if (!out.ALTITUDE) {
    const m = /\b(\d{3,4}\s*[-~–]\s*\d{3,4}|\d{3,4})\s*(m\b|masl\b|미터)/i.exec(whole);
    if (m) out.ALTITUDE = m[1].replace(/\s+/g, "").replace(/[~–]/g, "-");
  }

  // 6) 용량: "150g" / "1kg" 등 — 숫자만 반환(그램 환산), 5kg 초과는 오탐으로 보고 무시
  if (!out.NET_WEIGHT) {
    const m = /\b([1-9]\d{0,3}(?:\.\d+)?)\s*(kg|g)\b/i.exec(whole);
    if (m) {
      const grams = m[2].toLowerCase() === "kg" ? Math.round(parseFloat(m[1]) * 1000) : parseInt(m[1], 10);
      if (grams > 0 && grams <= 5000) out.NET_WEIGHT = String(grams);
    }
  }

  // 7) 수확시기: "December 2025 – January 2026"(월 단위) → "2025/2026" → "25-26"/"25/26" → 단일 "2025" 순으로 시도
  if (!out.HARVEST) {
    let m = /\b(20\d{2})\s*[\/\-]\s*(?:20)?(\d{2})\b/.exec(whole);
    const monthRange = normalizeHarvestMonths(whole);
    if (monthRange !== whole && /^\d{2}\.\d{2}(-\d{2}\.\d{2})?$/.test(monthRange)) {
      out.HARVEST = monthRange;
    } else if (m) {
      out.HARVEST = `${m[1].slice(2)}/${m[2]}`;
    } else {
      m = /\b(\d{2})[\/\-](\d{2})\b/.exec(whole);
      if (m && +m[2] === (+m[1] + 1) % 100) {
        out.HARVEST = `${m[1]}/${m[2]}`;
      } else {
        m = /\b(20\d{2})\b/.exec(whole);
        if (m) out.HARVEST = m[1].slice(2);
      }
    }
  }

  // 8) 테이스팅 노트: "flavor notes of ..." 류의 서술형 표현에서 뒤따르는 어구를 캡처(라벨 매칭 실패 시 보조)
  if (!out.TASTING_NOTE) {
    const m = /(?:tasting notes?|flavou?r(?:s)?(?:\s*notes?)?|cup(?:ping)? notes?)\s*[:\-–]?\s*(?:of\s+)?([A-Za-z][A-Za-z ,&'’]{6,80})/i.exec(text);
    if (m) out.TASTING_NOTE = m[1].replace(/\.$/, "").trim();
  }

  // 9) 원본 URL: 텍스트에 링크가 포함되어 있으면 채택
  if (!out.SOURCE_URL) {
    const m = /https?:\/\/[^\s)]+/i.exec(text);
    if (m) out.SOURCE_URL = m[0];
  }

  return out;
}

export const FIELD_LABELS_KO = {
  ROASTERY: "로스터리", ORIGIN: "국가(산지)", REGION: "세부 지역", PRODUCER: "생산자",
  LOT: "랏", WASHING_STATION: "워싱스테이션", VARIETY: "품종", PROCESS: "가공방식", ALTITUDE: "고도", HARVEST: "수확시기",
  NET_WEIGHT: "용량", TASTING_NOTE: "테이스팅 노트", SOURCE_URL: "원본 URL", MEMO: "메모",
};
