// Bean-Hoarder v2 API — Cloudflare Pages Functions + D1
// 인증: Authorization: Bearer {유저코드}:{4자리 암호}  (편의용 암호 — 쓰기에만 필요, 조회는 공개)
// 라우트:
//   POST   /api/signup        초대코드 + 암호 → 유저코드 자동 발급 + 복구키(1회 표시)
//   POST   /api/recover       복구키 + 새 암호 → 유저코드 재확인, 복구키 회전
//   POST   /api/beans         원두 등록 (KEY 서버 채번)
//   GET    /api/beans         내 원두 목록
//   GET    /api/bean/{KEY}    공개 조회
//   PUT    /api/bean/{KEY}    수정 (소유자만)
//   DELETE /api/bean/{KEY}    삭제 (소유자만)
//   GET    /api/export.csv    내 데이터 CSV 백업

const KEY_RE = /^[A-Z0-9]{4}\d{2}-\d{3}$/;
const PIN_RE = /^\d{4}$/;
const CODE_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const FIELDS = ["origin","region","variety","process","altitude","harvest",
  "roast_date","package_date","net_weight","agtron","tasting_note","memo","source_url"];
const REQUIRED_LABELS = {
  origin: "국가(산지)", roast_date: "로스팅일", package_date: "패키징일", net_weight: "용량",
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json;charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function sha256hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function randomUsercode() {
  const a = new Uint32Array(4);
  crypto.getRandomValues(a);
  let s = "";
  for (let i = 0; i < 4; i++) s += CODE_CHARS[a[i] % CODE_CHARS.length];
  return s;
}

// 오프라인 백업용 고엔트로피 복구키: 20자 hex, 4자리씩 하이픈으로 묶어 표시 (예: F89E-5079-5A48-3F33-62B0)
function randomRecoveryKey() {
  const a = new Uint8Array(10);
  crypto.getRandomValues(a);
  const hex = [...a].map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  return hex.match(/.{1,4}/g).join("-");
}
function normalizeRecoveryKey(k) {
  return String(k || "").replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
}

async function auth(env, request) {
  const h = request.headers.get("Authorization") || "";
  const m = /^Bearer\s+([A-Z0-9]{4}):(\d{4})$/i.exec(h);
  if (!m) return null;
  const usercode = m[1].toUpperCase();
  const hash = await sha256hex(`${usercode}:${m[2]}`);
  const row = await env.DB.prepare("SELECT usercode FROM users WHERE usercode = ? AND pass_hash = ?")
    .bind(usercode, hash).first();
  return row ? { usercode } : null;
}

function beanToPublic(row) {
  return {
    KEY: row.key, ROASTERY: row.roastery, ORIGIN: row.origin, REGION: row.region,
    VARIETY: row.variety, PROCESS: row.process, ALTITUDE: row.altitude,
    HARVEST: row.harvest, ROAST_DATE: row.roast_date, PACKAGE_DATE: row.package_date,
    NET_WEIGHT: row.net_weight, AGTRON: row.agtron, TASTING_NOTE: row.tasting_note,
    MEMO: row.memo, SOURCE_URL: row.source_url,
  };
}

function pickFields(body) {
  const vals = {};
  FIELDS.forEach(f => vals[f] = String(body[f.toUpperCase()] || "").trim());
  return vals;
}

function missingRequired(roastery, vals) {
  const missing = [];
  if (!roastery) missing.push("로스터리");
  for (const [field, label] of Object.entries(REQUIRED_LABELS)) {
    if (!vals[field]) missing.push(label);
  }
  return missing;
}

async function signup(env, request) {
  const body = await request.json().catch(() => ({}));
  if (!env.INVITE_CODE || body.invite !== env.INVITE_CODE) {
    return json({ ok: false, error: "초대코드가 올바르지 않습니다." }, 403);
  }
  const pin = String(body.password || "").trim();
  if (!PIN_RE.test(pin)) return json({ ok: false, error: "암호는 숫자 4자리여야 합니다." }, 400);

  const recoveryKey = randomRecoveryKey();
  const recoveryHash = await sha256hex(normalizeRecoveryKey(recoveryKey));
  for (let attempt = 0; attempt < 5; attempt++) {
    const usercode = randomUsercode();
    const hash = await sha256hex(`${usercode}:${pin}`);
    try {
      await env.DB.prepare("INSERT INTO users (usercode, pass_hash, recovery_hash) VALUES (?, ?, ?)")
        .bind(usercode, hash, recoveryHash).run();
      return json({ ok: true, usercode, recovery_key: recoveryKey });
    } catch (e) { /* usercode 충돌 시 재시도 */ }
  }
  return json({ ok: false, error: "유저코드 발급 실패 (재시도 요망)" }, 500);
}

async function recoverAccount(env, request) {
  const body = await request.json().catch(() => ({}));
  const normalized = normalizeRecoveryKey(body.recovery_key);
  if (normalized.length !== 20) return json({ ok: false, error: "복구키 형식이 올바르지 않습니다." }, 400);
  const pin = String(body.password || "").trim();
  if (!PIN_RE.test(pin)) return json({ ok: false, error: "새 암호는 숫자 4자리여야 합니다." }, 400);

  const recoveryHash = await sha256hex(normalized);
  const row = await env.DB.prepare("SELECT usercode FROM users WHERE recovery_hash = ?")
    .bind(recoveryHash).first();
  if (!row) return json({ ok: false, error: "복구키가 일치하지 않습니다." }, 404);

  const usercode = row.usercode;
  const newHash = await sha256hex(`${usercode}:${pin}`);
  const newRecoveryKey = randomRecoveryKey();
  const newRecoveryHash = await sha256hex(normalizeRecoveryKey(newRecoveryKey));
  await env.DB.prepare("UPDATE users SET pass_hash = ?, recovery_hash = ? WHERE usercode = ?")
    .bind(newHash, newRecoveryHash, usercode).run();
  return json({ ok: true, usercode, recovery_key: newRecoveryKey });
}

async function addBean(env, request, user) {
  const body = await request.json().catch(() => ({}));
  const roastery = String(body.ROASTERY || "").trim();
  const vals = pickFields(body);
  const missing = missingRequired(roastery, vals);
  if (missing.length) return json({ ok: false, error: `필수 항목 누락: ${missing.join(", ")}` }, 400);

  let year = String(body.YEAR || "").trim();
  if (!/^\d{2}$/.test(year)) year = String(new Date().getUTCFullYear() % 100).padStart(2, "0");

  for (let attempt = 0; attempt < 3; attempt++) {
    const { next } = await env.DB.prepare(
      "SELECT COALESCE(MAX(CAST(substr(key, 8, 3) AS INTEGER)), 0) + 1 AS next " +
      "FROM beans WHERE usercode = ? AND substr(key, 5, 2) = ?"
    ).bind(user.usercode, year).first();
    if (next > 999) return json({ ok: false, error: "연도 내 순번(999) 초과" }, 400);
    const key = `${user.usercode}${year}-${String(next).padStart(3, "0")}`;
    try {
      await env.DB.prepare(
        "INSERT INTO beans (key, usercode, roastery, " + FIELDS.join(", ") + ") " +
        "VALUES (?, ?, ?" + ", ?".repeat(FIELDS.length) + ")"
      ).bind(key, user.usercode, roastery, ...FIELDS.map(f => vals[f])).run();
      return json({ ok: true, key });
    } catch (e) { /* 동시 등록 충돌 시 재채번 */ }
  }
  return json({ ok: false, error: "채번 충돌 반복 (재시도 요망)" }, 500);
}

async function ownedBean(env, user, key) {
  if (!KEY_RE.test(key) || !key.startsWith(user.usercode)) return null;
  return env.DB.prepare("SELECT * FROM beans WHERE key = ? AND usercode = ?")
    .bind(key, user.usercode).first();
}

async function updateBean(env, request, user, key) {
  const existing = await ownedBean(env, user, key);
  if (!existing) return json({ ok: false, error: "내 소유의 등록된 KEY가 아닙니다." }, 404);
  const body = await request.json().catch(() => ({}));
  const roastery = String(body.ROASTERY || "").trim();
  const vals = pickFields(body);
  const missing = missingRequired(roastery, vals);
  if (missing.length) return json({ ok: false, error: `필수 항목 누락: ${missing.join(", ")}` }, 400);
  await env.DB.prepare(
    "UPDATE beans SET roastery = ?, " + FIELDS.map(f => `${f} = ?`).join(", ") +
    " WHERE key = ? AND usercode = ?"
  ).bind(roastery, ...FIELDS.map(f => vals[f]), key, user.usercode).run();
  return json({ ok: true, key });
}

async function deleteBean(env, user, key) {
  const existing = await ownedBean(env, user, key);
  if (!existing) return json({ ok: false, error: "내 소유의 등록된 KEY가 아닙니다." }, 404);
  await env.DB.prepare("DELETE FROM beans WHERE key = ? AND usercode = ?")
    .bind(key, user.usercode).run();
  return json({ ok: true, key });
}

async function listBeans(env, user) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM beans WHERE usercode = ? ORDER BY key"
  ).bind(user.usercode).all();
  return json({ ok: true, beans: results.map(beanToPublic) });
}

function csvField(v) {
  v = (v ?? "").toString();
  return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

async function exportCsv(env, user) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM beans WHERE usercode = ? ORDER BY key"
  ).bind(user.usercode).all();
  const HEADERS = ["KEY","ROASTERY","ORIGIN","REGION","VARIETY","PROCESS","ALTITUDE",
    "HARVEST","ROAST_DATE","PACKAGE_DATE","NET_WEIGHT","AGTRON","TASTING_NOTE","MEMO","SOURCE_URL"];
  const lines = [HEADERS.join(",")];
  results.forEach(r => {
    const p = beanToPublic(r);
    lines.push(HEADERS.map(h => csvField(p[h])).join(","));
  });
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv;charset=utf-8",
      "Content-Disposition": `attachment; filename="bean_sheet_${user.usercode}.csv"`,
    },
  });
}

export async function onRequest({ request, env, params }) {
  const seg = params.path || [];
  const method = request.method;
  try {
    if (seg[0] === "bean" && seg[1]) {
      const key = decodeURIComponent(seg[1]).trim().toUpperCase();
      if (method === "GET") {
        if (!KEY_RE.test(key)) return json({ ok: false, error: "KEY 형식 오류" }, 400);
        const row = await env.DB.prepare("SELECT * FROM beans WHERE key = ?").bind(key).first();
        if (!row) return json({ ok: false, error: "미등록 KEY" }, 404);
        return json({ ok: true, bean: beanToPublic(row) });
      }
      if (method === "PUT" || method === "DELETE") {
        const user = await auth(env, request);
        if (!user) return json({ ok: false, error: "인증 실패 — 유저코드와 암호를 확인하세요." }, 401);
        return method === "PUT" ? updateBean(env, request, user, key) : deleteBean(env, user, key);
      }
    }
    if (method === "POST" && seg[0] === "signup") return signup(env, request);
    if (method === "POST" && seg[0] === "recover") return recoverAccount(env, request);
    if (seg[0] === "beans" || seg[0] === "export.csv") {
      const user = await auth(env, request);
      if (!user) return json({ ok: false, error: "인증 실패 — 유저코드와 암호를 확인하세요." }, 401);
      if (seg[0] === "beans" && method === "POST") return addBean(env, request, user);
      if (seg[0] === "beans" && method === "GET") return listBeans(env, user);
      if (seg[0] === "export.csv" && method === "GET") return exportCsv(env, user);
    }
    return json({ ok: false, error: "not found" }, 404);
  } catch (e) {
    return json({ ok: false, error: "서버 오류: " + String(e) }, 500);
  }
}
