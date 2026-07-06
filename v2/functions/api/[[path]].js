// Bean-Hoarder v2 API — Cloudflare Pages Functions + D1
// 라우트: POST /api/signup, POST|GET /api/beans, GET /api/bean/{KEY}, GET /api/export.csv

const KEY_RE = /^[A-Z0-9]{4}\d{2}-\d{3}$/;
const CODE_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const FIELDS = ["origin","region","variety","process","altitude","harvest",
  "roast_date","package_date","net_weight","agtron","tasting_note","source_url"];

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

function randomToken() {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, "0")).join("");
}

function randomUsercode() {
  const a = new Uint32Array(4);
  crypto.getRandomValues(a);
  let s = "";
  for (let i = 0; i < 4; i++) s += CODE_CHARS[a[i] % CODE_CHARS.length];
  return s;
}

async function auth(env, request) {
  const h = request.headers.get("Authorization") || "";
  const m = /^Bearer\s+([0-9a-f]{64})$/i.exec(h);
  if (!m) return null;
  const hash = await sha256hex(m[1]);
  return env.DB.prepare("SELECT usercode, roastery FROM users WHERE token_hash = ?")
    .bind(hash).first();
}

function beanToPublic(row) {
  return {
    KEY: row.key, ROASTERY: row.roastery, ORIGIN: row.origin, REGION: row.region,
    VARIETY: row.variety, PROCESS: row.process, ALTITUDE: row.altitude,
    HARVEST: row.harvest, ROAST_DATE: row.roast_date, PACKAGE_DATE: row.package_date,
    NET_WEIGHT: row.net_weight, AGTRON: row.agtron, TASTING_NOTE: row.tasting_note,
    SOURCE_URL: row.source_url,
  };
}

async function signup(env, request) {
  const body = await request.json().catch(() => ({}));
  if (!env.INVITE_CODE || body.invite !== env.INVITE_CODE) {
    return json({ ok: false, error: "초대코드가 올바르지 않습니다." }, 403);
  }
  const roastery = String(body.roastery || "").trim();
  if (!roastery) return json({ ok: false, error: "로스터리명은 필수입니다." }, 400);

  const token = randomToken();
  const hash = await sha256hex(token);
  for (let attempt = 0; attempt < 5; attempt++) {
    const usercode = randomUsercode();
    try {
      await env.DB.prepare("INSERT INTO users (usercode, roastery, token_hash) VALUES (?, ?, ?)")
        .bind(usercode, roastery, hash).run();
      return json({ ok: true, usercode, token, roastery });
    } catch (e) { /* usercode 충돌 시 재시도 */ }
  }
  return json({ ok: false, error: "유저코드 발급 실패 (재시도 요망)" }, 500);
}

async function addBean(env, request, user) {
  const body = await request.json().catch(() => ({}));
  const roastery = String(body.ROASTERY || user.roastery || "").trim();
  if (!roastery) return json({ ok: false, error: "ROASTERY는 필수" }, 400);

  let year = String(body.YEAR || "").trim();
  if (!/^\d{2}$/.test(year)) year = String(new Date().getUTCFullYear() % 100).padStart(2, "0");

  const vals = {};
  FIELDS.forEach(f => vals[f] = String(body[f.toUpperCase()] || "").trim());

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
    "HARVEST","ROAST_DATE","PACKAGE_DATE","NET_WEIGHT","AGTRON","TASTING_NOTE","SOURCE_URL"];
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
    if (method === "GET" && seg[0] === "bean" && seg[1]) {
      const key = decodeURIComponent(seg[1]).trim().toUpperCase();
      if (!KEY_RE.test(key)) return json({ ok: false, error: "KEY 형식 오류" }, 400);
      const row = await env.DB.prepare("SELECT * FROM beans WHERE key = ?").bind(key).first();
      if (!row) return json({ ok: false, error: "미등록 KEY" }, 404);
      return json({ ok: true, bean: beanToPublic(row) });
    }
    if (method === "POST" && seg[0] === "signup") return signup(env, request);
    if (seg[0] === "beans" || seg[0] === "export.csv") {
      const user = await auth(env, request);
      if (!user) return json({ ok: false, error: "인증 실패 — 토큰을 확인하세요." }, 401);
      if (seg[0] === "beans" && method === "POST") return addBean(env, request, user);
      if (seg[0] === "beans" && method === "GET") return listBeans(env, user);
      if (seg[0] === "export.csv" && method === "GET") return exportCsv(env, user);
    }
    return json({ ok: false, error: "not found" }, 404);
  } catch (e) {
    return json({ ok: false, error: "서버 오류: " + String(e) }, 500);
  }
}
