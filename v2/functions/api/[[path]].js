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
//   POST   /api/import        CSV 백업 복원 (내 유저코드 KEY만, 같은 KEY는 덮어쓰기)
//   GET    /api/logos         내 로스터리 로고 목록
//   PUT    /api/logos         로스터리 로고 저장/교체 (이미지 100KB 제한)
//   DELETE /api/logos         로스터리 로고 삭제
//   POST   /api/fetch         상품 페이지 텍스트/로고 이미지 프록시 (로그인 사용자 전용)
// 환경변수: INVITE_CODE는 Cloudflare secret으로 관리 (wrangler pages secret put INVITE_CODE)

import {
  KEY_RE, PIN_RE, FIELDS, CSV_HEADERS, json,
  sha256hex, hashPassword, verifyPassword,
  randomUsercode, randomRecoveryKey, normalizeRecoveryKey,
  beanToPublic, pickFields, missingRequired,
  csvField, unguardCsvCell, parseCsv,
  hostBlocked, isPrivateIp, htmlToText,
  LOGO_DATAURL_RE, LOGO_MAX_LEN,
} from "./_lib.js";

async function auth(env, request) {
  const h = request.headers.get("Authorization") || "";
  const m = /^Bearer\s+([A-Z0-9]{4}):(\d{4})$/i.exec(h);
  if (!m) return null;
  const usercode = m[1].toUpperCase();
  const row = await env.DB.prepare("SELECT usercode, pass_hash FROM users WHERE usercode = ?")
    .bind(usercode).first();
  if (!row) return null;
  const v = await verifyPassword(row.pass_hash, usercode, m[2]);
  if (!v.ok) return null;
  // 구형(단일 SHA-256) 해시는 로그인 성공 시점에 PBKDF2로 무중단 업그레이드
  if (v.legacy) {
    const upgraded = await hashPassword(usercode, m[2]);
    await env.DB.prepare("UPDATE users SET pass_hash = ? WHERE usercode = ? AND pass_hash = ?")
      .bind(upgraded, usercode, row.pass_hash).run();
  }
  return { usercode };
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
    const hash = await hashPassword(usercode, pin);
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
  const newHash = await hashPassword(usercode, pin);
  const newRecoveryKey = randomRecoveryKey();
  const newRecoveryHash = await sha256hex(normalizeRecoveryKey(newRecoveryKey));
  await env.DB.prepare("UPDATE users SET pass_hash = ?, recovery_hash = ? WHERE usercode = ?")
    .bind(newHash, newRecoveryHash, usercode).run();
  return json({ ok: true, usercode, recovery_key: newRecoveryKey });
}

async function addBean(env, request, user) {
  const body = await request.json().catch(() => ({}));
  const roastery = String(body.ROASTERY || "").trim().slice(0, 200);
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
  const roastery = String(body.ROASTERY || "").trim().slice(0, 200);
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

// ── CSV 백업 / 복원 ──────────────────────────────────────────

async function exportCsv(env, user) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM beans WHERE usercode = ? ORDER BY key"
  ).bind(user.usercode).all();
  const lines = [CSV_HEADERS.join(",")];
  results.forEach(r => {
    const p = beanToPublic(r);
    lines.push(CSV_HEADERS.map(h => csvField(p[h])).join(","));
  });
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv;charset=utf-8",
      "Content-Disposition": `attachment; filename="bean_sheet_${user.usercode}.csv"`,
    },
  });
}

// CSV 백업 복원: 내 유저코드 KEY만 허용, 이미 있는 KEY는 백업 내용으로 덮어쓴다
// (악의적 수정·삭제를 백업 시점으로 되돌리는 것이 목적 — 인쇄된 라벨의 KEY가 그대로 살아남는다).
async function importCsv(env, request, user) {
  const text = await request.text();
  if (text.length > 1_000_000) return json({ ok: false, error: "파일이 너무 큽니다 (1MB 제한)." }, 413);
  const rows = parseCsv(text);
  if (rows.length < 2) return json({ ok: false, error: "CSV에 데이터 행이 없습니다." }, 400);

  const header = rows[0].map(h => h.trim().toUpperCase());
  const keyIdx = header.indexOf("KEY");
  if (keyIdx < 0 || !header.includes("ROASTERY")) {
    return json({ ok: false, error: "CSV 헤더에 KEY, ROASTERY 열이 필요합니다 (백업 파일을 그대로 사용하세요)." }, 400);
  }
  const dataRows = rows.slice(1);
  if (dataRows.length > 2000) return json({ ok: false, error: "행이 너무 많습니다 (2,000행 제한)." }, 400);

  const { results } = await env.DB.prepare("SELECT key FROM beans WHERE usercode = ?")
    .bind(user.usercode).all();
  const existing = new Set(results.map(r => r.key));

  const col = (row, name) => {
    const i = header.indexOf(name);
    return i >= 0 ? unguardCsvCell((row[i] || "").trim()) : "";
  };

  let added = 0, updated = 0;
  const skipped = [];
  const stmts = [];
  const upsert = env.DB.prepare(
    "INSERT INTO beans (key, usercode, roastery, " + FIELDS.join(", ") + ") " +
    "VALUES (?, ?, ?" + ", ?".repeat(FIELDS.length) + ") " +
    "ON CONFLICT(key) DO UPDATE SET roastery = excluded.roastery, " +
    FIELDS.map(f => `${f} = excluded.${f}`).join(", ")
  );

  for (const row of dataRows) {
    const key = col(row, "KEY").toUpperCase();
    if (!KEY_RE.test(key)) { skipped.push({ key: key || "(빈 KEY)", reason: "KEY 형식 오류" }); continue; }
    if (!key.startsWith(user.usercode)) { skipped.push({ key, reason: "내 유저코드의 KEY가 아님" }); continue; }
    const roastery = col(row, "ROASTERY").slice(0, 200);
    const body = {};
    CSV_HEADERS.forEach(h => body[h] = col(row, h));
    const vals = pickFields(body);
    const missing = missingRequired(roastery, vals);
    if (missing.length) { skipped.push({ key, reason: `필수 항목 누락: ${missing.join(", ")}` }); continue; }
    stmts.push(upsert.bind(key, user.usercode, roastery, ...FIELDS.map(f => vals[f])));
    if (existing.has(key)) updated++; else added++;
  }

  // D1 batch는 단일 트랜잭션 — 부분 성공 없이 전체 반영 또는 전체 실패
  for (let i = 0; i < stmts.length; i += 50) {
    await env.DB.batch(stmts.slice(i, i + 50));
  }
  return json({ ok: true, added, updated, skipped: skipped.slice(0, 20), skippedTotal: skipped.length });
}

// ── 로스터리 로고 (기기 간 재사용) ────────────────────────────
// 로스터리명은 대문자로 정규화해 저장 — 라벨 인쇄 표기와 동일, 대소문자 변형 중복 방지.

async function listLogos(env, user) {
  const { results } = await env.DB.prepare(
    "SELECT roastery, data_url FROM logos WHERE usercode = ? ORDER BY roastery"
  ).bind(user.usercode).all();
  return json({ ok: true, logos: results });
}

async function putLogo(env, request, user) {
  const body = await request.json().catch(() => ({}));
  const roastery = String(body.roastery || "").trim().toUpperCase().slice(0, 80);
  const dataUrl = String(body.data_url || "");
  if (!roastery) return json({ ok: false, error: "로스터리명이 필요합니다." }, 400);
  if (!LOGO_DATAURL_RE.test(dataUrl)) {
    return json({ ok: false, error: "로고는 PNG/JPEG/WebP/SVG data URL이어야 합니다." }, 400);
  }
  if (dataUrl.length > LOGO_MAX_LEN) {
    return json({ ok: false, error: "로고 이미지가 너무 큽니다 (100KB 제한)." }, 413);
  }
  await env.DB.prepare(
    "INSERT INTO logos (usercode, roastery, data_url, updated_at) VALUES (?, ?, ?, datetime('now')) " +
    "ON CONFLICT(usercode, roastery) DO UPDATE SET data_url = excluded.data_url, updated_at = excluded.updated_at"
  ).bind(user.usercode, roastery, dataUrl).run();
  return json({ ok: true, roastery });
}

async function deleteLogo(env, request, user) {
  const body = await request.json().catch(() => ({}));
  const roastery = String(body.roastery || "").trim().toUpperCase();
  if (!roastery) return json({ ok: false, error: "로스터리명이 필요합니다." }, 400);
  await env.DB.prepare("DELETE FROM logos WHERE usercode = ? AND roastery = ?")
    .bind(user.usercode, roastery).run();
  return json({ ok: true, roastery });
}

// ── 링크 가져오기 프록시 (로그인 사용자 전용) ──
// 브라우저 CORS를 우회해 상품 페이지 텍스트/로고 이미지를 대신 가져온다.
// SSRF 가드: http(s)만, 내부망·메타데이터 호스트 차단(문자열 + DoH 리졸브 검사),
// 리다이렉트는 수동으로 따라가며 매 홉 재검사, 크기 2MB·8초 제한.

// DoH(cloudflare-dns.com)로 A/AAAA를 조회해 사설 대역으로 리졸브되는 호스트를 차단.
// DoH 실패 시에는 통과시킨다(fail-open) — Workers의 외부 fetch는 어차피 사설망에
// 닿지 않아 이 검사는 심층 방어이며, DoH 장애로 기능 전체가 죽는 것을 피한다.
async function resolvesToPrivate(host) {
  if (/^[\d.]+$/.test(host) || host.includes(":")) return isPrivateIp(host.replace(/^\[|\]$/g, ""));
  for (const type of ["A", "AAAA"]) {
    try {
      const r = await fetch(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`,
        { headers: { "Accept": "application/dns-json" }, signal: AbortSignal.timeout(4000) });
      if (!r.ok) continue;
      const d = await r.json();
      for (const a of d.Answer || []) {
        if ((a.type === 1 || a.type === 28) && isPrivateIp(String(a.data))) return true;
      }
    } catch (e) { /* fail-open */ }
  }
  return false;
}

async function checkTargetUrl(url) {
  if (!/^https?:$/.test(url.protocol)) return "http/https URL만 지원합니다.";
  if (hostBlocked(url.hostname)) return "허용되지 않는 주소입니다.";
  if (await resolvesToPrivate(url.hostname)) return "허용되지 않는 주소입니다.";
  return null;
}

async function fetchExternal(request) {
  const body = await request.json().catch(() => ({}));
  let url;
  try { url = new URL(String(body.url || "")); } catch (e) {
    return json({ ok: false, error: "URL 형식이 올바르지 않습니다." }, 400);
  }

  let res = null;
  for (let hop = 0; hop < 5; hop++) {
    const blocked = await checkTargetUrl(url);
    if (blocked) return json({ ok: false, error: blocked }, 400);
    try {
      res = await fetch(url.toString(), {
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (compatible; BeanHoarder/1.0)",
          "Accept": "text/html,application/xhtml+xml,image/*;q=0.9,*/*;q=0.8",
          "Accept-Language": "ko,en;q=0.8",
        },
      });
    } catch (e) {
      return json({ ok: false, error: "대상 페이지를 가져오지 못했습니다 (차단 또는 시간 초과)." }, 502);
    }
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get("location");
      if (!loc) break;
      try { url = new URL(loc, url); } catch (e) {
        return json({ ok: false, error: "리다이렉트 주소가 올바르지 않습니다." }, 502);
      }
      res = null;
      continue;
    }
    break;
  }
  if (!res) return json({ ok: false, error: "리다이렉트가 너무 많습니다." }, 502);
  if (!res.ok) return json({ ok: false, error: `대상 응답 오류 (HTTP ${res.status})` }, 502);

  const buf = await res.arrayBuffer();
  if (buf.byteLength > 2_000_000) return json({ ok: false, error: "응답이 너무 큽니다 (2MB 제한)." }, 413);
  const ct = (res.headers.get("content-type") || "").toLowerCase();

  if (ct.startsWith("image/")) {
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return json({ ok: true, kind: "image", dataUrl: `data:${ct.split(";")[0]};base64,${btoa(bin)}` });
  }

  const text = htmlToText(new TextDecoder("utf-8").decode(buf));
  if (!text.trim()) return json({ ok: false, error: "텍스트를 추출하지 못했습니다." }, 422);
  return json({ ok: true, kind: "text", text: text.slice(0, 20000) });
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
    if (["beans", "export.csv", "import", "fetch", "logos"].includes(seg[0])) {
      const user = await auth(env, request);
      if (!user) return json({ ok: false, error: "인증 실패 — 유저코드와 암호를 확인하세요." }, 401);
      if (seg[0] === "beans" && method === "POST") return addBean(env, request, user);
      if (seg[0] === "beans" && method === "GET") return listBeans(env, user);
      if (seg[0] === "export.csv" && method === "GET") return exportCsv(env, user);
      if (seg[0] === "import" && method === "POST") return importCsv(env, request, user);
      if (seg[0] === "logos" && method === "GET") return listLogos(env, user);
      if (seg[0] === "logos" && method === "PUT") return putLogo(env, request, user);
      if (seg[0] === "logos" && method === "DELETE") return deleteLogo(env, request, user);
      if (seg[0] === "fetch" && method === "POST") return fetchExternal(request);
    }
    return json({ ok: false, error: "not found" }, 404);
  } catch (e) {
    return json({ ok: false, error: "서버 오류: " + String(e) }, 500);
  }
}
