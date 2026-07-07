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
  REGION: ["region", "area", "zone", "woreda", "지역", "세부지역"],
  PRODUCER: ["producer", "farmer", "grower", "생산자", "농장"],
  LOT: ["lot", "washing station", "wet mill", "랏", "워싱스테이션"],
  VARIETY: ["variety", "varietal", "cultivar", "품종"],
  PROCESS: ["process", "processing", "가공방식", "가공"],
  ALTITUDE: ["altitude", "elevation", "고도"],
  HARVEST: ["harvest", "crop year", "수확시기", "수확"],
  NET_WEIGHT: ["net weight", "weight", "용량", "중량"],
  TASTING_NOTE: ["tasting notes", "tasting note", "notes", "flavor", "cup", "테이스팅 노트", "노트"],
  MEMO: ["memo", "비고", "메모"],
};

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
  for (const line of lines) {
    const m = /^([\w \/·]{2,24})\s*[:：\-–]\s*(.+)$/.exec(line);
    if (!m) continue;
    const field = findFieldForLabel(m[1]);
    if (field && !out[field]) out[field] = m[2].trim();
  }

  // 라벨 인식으로 채운 산지는 원문 대소문자가 제각각이므로, 알려진 국가명이면 표준 표기(대문자)로 맞춘다.
  if (out.ORIGIN) {
    const canon = ORIGIN_LIST.find(c => c.toLowerCase() === out.ORIGIN.trim().toLowerCase());
    out.ORIGIN = canon || out.ORIGIN.trim();
  }

  // 라벨 인식으로 채운 수확시기("2024/2025", "2024-25" 등)를 폼의 관례인 "yy/yy" 표기로 정규화.
  if (out.HARVEST) {
    let m = /(20\d{2})\s*[\/\-]\s*(?:20)?(\d{2})/.exec(out.HARVEST);
    if (m) out.HARVEST = `${m[1].slice(2)}/${m[2]}`;
    else if ((m = /^(20\d{2})$/.exec(out.HARVEST.trim()))) out.HARVEST = m[1].slice(2);
  }

  // 라벨 인식으로 이미 채운 고도·용량은 표기가 제각각이므로("1900-2250m", "150g" 등)
  // 폼의 단위 자동 부착(withUnit)과 겹치지 않도록 숫자만 남긴다.
  if (out.ALTITUDE) {
    const m = /(\d{3,4}\s*[-~–]\s*\d{3,4}|\d{3,4})/.exec(out.ALTITUDE);
    out.ALTITUDE = m ? m[1].replace(/\s+/g, "") : "";
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
    if (m) out.ALTITUDE = m[1].replace(/\s+/g, "");
  }

  // 6) 용량: "150g" / "1kg" 등 — 숫자만 반환(그램 환산), 5kg 초과는 오탐으로 보고 무시
  if (!out.NET_WEIGHT) {
    const m = /\b([1-9]\d{0,3}(?:\.\d+)?)\s*(kg|g)\b/i.exec(whole);
    if (m) {
      const grams = m[2].toLowerCase() === "kg" ? Math.round(parseFloat(m[1]) * 1000) : parseInt(m[1], 10);
      if (grams > 0 && grams <= 5000) out.NET_WEIGHT = String(grams);
    }
  }

  // 7) 수확시기: "2025/2026", "2025-26", "25-26", "25/26", 단일 "2025" 순으로 시도
  if (!out.HARVEST) {
    let m = /\b(20\d{2})\s*[\/\-]\s*(?:20)?(\d{2})\b/.exec(whole);
    if (m) {
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
  LOT: "랏", VARIETY: "품종", PROCESS: "가공방식", ALTITUDE: "고도", HARVEST: "수확시기",
  NET_WEIGHT: "용량", TASTING_NOTE: "테이스팅 노트", SOURCE_URL: "원본 URL", MEMO: "메모",
};
