// Bean-Hoarder v2 — 순수 헬퍼 모듈 (라우팅 제외: 파일명 '_' 접두)
// [[path]].js(라우터)와 tests/에서 함께 사용한다. env/request에 의존하는 코드는 두지 않는다.

export const KEY_RE = /^[A-Z0-9]{4}\d{2}-\d{3}$/;
export const PIN_RE = /^\d{4}$/;
export const CODE_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const FIELDS = ["origin","region","producer","lot","washing_station","variety","process","altitude","harvest",
  "roast_date","package_date","net_weight","agtron","tasting_note","memo","source_url"];
export const REQUIRED_LABELS = {
  origin: "국가(산지)", variety: "품종", process: "가공방식",
  roast_date: "로스팅일", package_date: "패키징일",
};
// CSV 복원(import) 전용: 품종·가공방식이 필수가 되기 전에 만든 백업도 되살릴 수 있어야 하므로,
// 그 이전부터 항상 필수였던 최소 집합만 검사한다(등록·수정 폼은 REQUIRED_LABELS 그대로 적용).
export const IMPORT_REQUIRED_LABELS = {
  origin: "국가(산지)", roast_date: "로스팅일", package_date: "패키징일",
};
export const CSV_HEADERS = ["KEY","ROASTERY","ORIGIN","REGION","PRODUCER","LOT","WASHING_STATION","VARIETY","PROCESS","ALTITUDE",
  "HARVEST","ROAST_DATE","PACKAGE_DATE","NET_WEIGHT","AGTRON","TASTING_NOTE","MEMO","SOURCE_URL"];

// 필드별 저장 길이 상한 — 라벨·조회 페이지 표시에 충분한 수준으로 자른다
export const MAX_FIELD_LEN = 1000;

export function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json;charset=utf-8", "Cache-Control": "no-store" },
  });
}

// ── 해시/키 생성 ──────────────────────────────────────────────

function bufToHex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function hexToBytes(hex) {
  return new Uint8Array(hex.match(/.{2}/g).map(h => parseInt(h, 16)));
}

export async function sha256hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return bufToHex(buf);
}

// 암호 해시: PBKDF2-SHA256. 4자리 PIN이라 오프라인 크래킹을 완전히 막을 수는 없지만
// (위협 모델상 수용), 단일 SHA-256 대비 무차별 대입 비용을 반복 횟수만큼 올린다.
// 반복 횟수는 Workers 무료 CPU 한도(10ms) 안에서 여유 있게 동작하는 값으로 선택.
const PBKDF2_ITER = 25000;

async function pbkdf2hex(password, saltBytes, iterations) {
  const keyMat = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations }, keyMat, 256);
  return bufToHex(bits);
}

export async function hashPassword(usercode, pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const h = await pbkdf2hex(`${usercode}:${pin}`, salt, PBKDF2_ITER);
  return `pbkdf2$${PBKDF2_ITER}$${bufToHex(salt.buffer)}$${h}`;
}

// 저장된 해시 검증. 구형(단일 SHA-256 hex 64자) 해시도 인식해 legacy=true로 알려주면
// 호출부가 로그인 성공 시점에 PBKDF2로 무중단 재해시한다.
export async function verifyPassword(stored, usercode, pin) {
  if ((stored || "").startsWith("pbkdf2$")) {
    const [, iterS, saltHex, hash] = stored.split("$");
    const h = await pbkdf2hex(`${usercode}:${pin}`, hexToBytes(saltHex), parseInt(iterS, 10));
    return { ok: h === hash, legacy: false };
  }
  const h = await sha256hex(`${usercode}:${pin}`);
  return { ok: h === stored, legacy: true };
}

export function randomUsercode() {
  const a = new Uint32Array(4);
  crypto.getRandomValues(a);
  let s = "";
  for (let i = 0; i < 4; i++) s += CODE_CHARS[a[i] % CODE_CHARS.length];
  return s;
}

// 오프라인 백업용 고엔트로피 복구키: 20자 hex, 4자리씩 하이픈으로 묶어 표시 (예: F89E-5079-5A48-3F33-62B0)
export function randomRecoveryKey() {
  const a = new Uint8Array(10);
  crypto.getRandomValues(a);
  const hex = [...a].map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  return hex.match(/.{1,4}/g).join("-");
}
export function normalizeRecoveryKey(k) {
  return String(k || "").replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
}

// ── 원두 행 변환 ──────────────────────────────────────────────

export function beanToPublic(row) {
  return {
    KEY: row.key, ROASTERY: row.roastery, ORIGIN: row.origin, REGION: row.region,
    PRODUCER: row.producer, LOT: row.lot, WASHING_STATION: row.washing_station,
    VARIETY: row.variety, PROCESS: row.process, ALTITUDE: row.altitude,
    HARVEST: row.harvest, ROAST_DATE: row.roast_date, PACKAGE_DATE: row.package_date,
    NET_WEIGHT: row.net_weight, AGTRON: row.agtron, TASTING_NOTE: row.tasting_note,
    MEMO: row.memo, SOURCE_URL: row.source_url, ARCHIVED: !!row.archived,
  };
}

export function pickFields(body) {
  const vals = {};
  FIELDS.forEach(f => vals[f] = String(body[f.toUpperCase()] || "").trim().slice(0, MAX_FIELD_LEN));
  return vals;
}

export function missingRequired(roastery, vals, labels = REQUIRED_LABELS) {
  const missing = [];
  if (!roastery) missing.push("로스터리");
  for (const [field, label] of Object.entries(labels)) {
    if (!vals[field]) missing.push(label);
  }
  return missing;
}

// ── CSV ──────────────────────────────────────────────────────
// 내보내기: 스프레드시트 수식 인젝션 방지 — 셀이 수식 트리거 문자로 시작하면 ' 접두.
// 가져오기: 같은 규칙으로 붙은 ' 접두를 되돌려 라운드트립을 보존한다.

const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

export function guardCsvCell(v) {
  return FORMULA_TRIGGER.test(v) ? "'" + v : v;
}
export function unguardCsvCell(v) {
  if (typeof v !== "string") return v;
  return v.startsWith("'") && FORMULA_TRIGGER.test(v.slice(1)) ? v.slice(1) : v;
}

export function csvField(v) {
  v = guardCsvCell((v ?? "").toString());
  return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

// RFC 4180 파서 (따옴표·개행 포함 셀 지원). BOM 제거 후 행 배열의 배열을 반환.
export function parseCsv(text) {
  const s = text.replace(/^﻿/, "");
  const rows = [];
  let row = [], cell = "", inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell); cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      rows.push(row); row = [];
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  // 완전히 빈 행 제거
  return rows.filter(r => r.some(c => c.trim() !== ""));
}

// ── 링크 가져오기 프록시 가드 ─────────────────────────────────

export function isPrivateIp(ip) {
  // IPv6 (v4-mapped 포함)
  if (ip.includes(":")) {
    const low = ip.toLowerCase();
    if (low === "::1" || low === "::") return true;
    if (/^f[cd]/.test(low)) return true;              // fc00::/7 (ULA)
    if (/^fe[89ab]/.test(low)) return true;           // fe80::/10 (link-local)
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(low);
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip);
  if (!m) return false;
  const [a, b] = [+m[1], +m[2]];
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;            // link-local / 클라우드 메타데이터
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;  // CGNAT
  return false;
}

export function hostBlocked(host) {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (/\.(local|internal)$/.test(h)) return true;
  if (h === "metadata.google.internal") return true;
  if (/^[\d.]+$/.test(h) || h.includes(":")) return isPrivateIp(h);
  return false;
}

export function htmlToText(html) {
  const s = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    // 표/정의목록의 키-값 셀을 "라벨: 값" 줄로 변환해 autofill 파서가 읽을 수 있게 한다
    .replace(/<\/(th|dt|td)>/gi, ": ")
    .replace(/<\/(tr|p|div|li|h[1-6]|dd|section|article|header|footer)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#0?39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
  return s.split("\n")
    .map(l => l.replace(/[ \t]+/g, " ").trim().replace(/[:：]$/, ""))
    .filter(Boolean).join("\n");
}

// 로고 dataURL 검증: 허용 포맷 + 크기 상한(base64 문자열 약 140KB ≈ 원본 100KB)
export const LOGO_DATAURL_RE = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
export const LOGO_MAX_LEN = 140_000;
