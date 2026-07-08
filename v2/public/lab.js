// Bean-Hoarder LAB(스튜디오) 애플리케이션 로직.
// 렌더링은 label.js, 텍스트 인식은 autofill.js가 담당하고, 이 파일은
// 계정·폼·목록·백업/복원·로고 재사용·AI 인식 등 화면 동작을 묶는다.

import { buildLabelSVG, renderPngBlob, verifyQr, DEFAULT_DESIGN, SIZE_SPECS, SPEC_POOL, SUB_POOL, BASE_URL }
  from "./label.js";
import { parseBeanText, FIELD_LABELS_KO } from "./autofill.js";

const SITE = "https://bnhd.pages.dev";
const LOGO_MAX_LEN = 140_000;   // 서버와 동일한 상한 (base64 문자 수 ≈ 원본 100KB)

const $ = id => document.getElementById(id);
const yy = String(new Date().getFullYear() % 100).padStart(2, "0");

const account = {
  usercode: localStorage.getItem("bh_usercode") || "",
  pin: localStorage.getItem("bh_pin") || "",
};

// ── 라벨 디자인 설정: localStorage에 영속화 (새로고침해도 유지) ──
function loadDesign() {
  const d = structuredClone(DEFAULT_DESIGN);
  try {
    const saved = JSON.parse(localStorage.getItem("bh_design") || "{}");
    if (SIZE_SPECS[saved.size]) d.size = saved.size;
    const S = SIZE_SPECS[d.size];
    if (typeof saved.headlineSize === "number") d.headlineSize = Math.min(S.headline.max, Math.max(S.headline.min, saved.headlineSize));
    else d.headlineSize = S.headline.def;
    if (typeof saved.specValueSize === "number") d.specValueSize = Math.min(S.specVal.max, Math.max(S.specVal.min, saved.specValueSize));
    else d.specValueSize = S.specVal.def;
    const subKeys = SUB_POOL.map(([k]) => k), specKeys = SPEC_POOL.map(([k]) => k);
    if (Array.isArray(saved.subFields)) d.subFields = saved.subFields.filter(k => subKeys.includes(k));
    if (Array.isArray(saved.specFields)) d.specFields = saved.specFields.filter(k => specKeys.includes(k)).slice(0, 4);
    if (typeof saved.showLogo === "boolean") d.showLogo = saved.showLogo;
  } catch (e) { /* 손상된 저장값은 기본값으로 */ }
  return d;
}
const design = loadDesign();
function saveDesign() {
  localStorage.setItem("bh_design", JSON.stringify(design));
}

let logoDataUrl = null;
let logoSource = null;       // "server"(저장된 로고 자동 적용) | "manual"(방금 올린 로고)
let logosMap = {};           // 로스터리(대문자) -> dataUrl
let mode = "new";            // "new" | "edit"
let confirmedKey = null;     // 서버에 존재하는 KEY (등록 완료 or 수정 대상)
let previewSeq = 1;
const subToggleInputs = {};  // key -> checkbox element (서브라인 자동 체크용)
const specToggleInputs = {};

const FORM_IDS = ["f-roastery","f-origin","f-region","f-producer","f-lot","f-washingstation","f-variety","f-process",
  "f-altitude","f-harvest","f-roastdate","f-packagedate","f-netweight","f-agtron","f-note","f-memo","f-source"];
const SUB_FIELD_INPUT_IDS = { REGION: "f-region", PROCESS: "f-process", VARIETY: "f-variety", ALTITUDE: "f-altitude" };
const AUTOFILL_INPUT_IDS = {
  ROASTERY: "f-roastery", ORIGIN: "f-origin", REGION: "f-region", PRODUCER: "f-producer",
  LOT: "f-lot", WASHING_STATION: "f-washingstation", VARIETY: "f-variety", PROCESS: "f-process", ALTITUDE: "f-altitude",
  HARVEST: "f-harvest", NET_WEIGHT: "f-netweight", TASTING_NOTE: "f-note",
  SOURCE_URL: "f-source", MEMO: "f-memo",
};

// 날짜: <input type=date>(ISO) ↔ 저장 포맷(yy.mm.dd) 상호 변환
function isoToDot(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${m[1].slice(2)}.${m[2]}.${m[3]}` : "";
}
function dotToIso(dot) {
  const m = /^(\d{2})\.(\d{2})\.(\d{2})$/.exec(dot || "");
  return m ? `20${m[1]}-${m[2]}-${m[3]}` : "";
}
function isoOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function setDateDefaults() {
  $("f-roastdate").value = isoOffset(-10);
  $("f-packagedate").value = isoOffset(0);
}
setDateDefaults();

// 수확시기 제안: 25/26(크롭이어), 26, 25
(function fillHarvestOptions() {
  const y = parseInt(yy, 10);
  const opts = [`${y - 1}/${y}`, `${y}`, `${y - 1}`];
  $("dl-harvest").innerHTML = opts.map(o => `<option value="${o}">`).join("");
})();

// 용량·고도: 숫자만 입력하면 저장 시 단위(g/m) 자동 부착
function withUnit(v, unit) {
  const s = v.trim();
  if (!s) return "";
  return /^[\d\s.~\-–]+$/.test(s) && /\d/.test(s) ? s.replace(/\s+/g, "") + unit : s;
}

function setStatus(msg, ok) {
  const el = $("action-status");
  el.textContent = msg;
  el.className = "status-line " + (ok ? "ok" : "error");
}
function setAcctStatus(msg, ok) {
  const el = $("acct-status");
  el.textContent = msg;
  el.className = "status-line " + (ok ? "ok" : "error");
}
function setVerify(text, cls) {
  ["verify-badge", "sheet-verify"].forEach(id => {
    $(id).textContent = text;
    $(id).className = "verify " + (cls || "");
  });
}
function setAutofillStatus(msg, cls) {
  const el = $("autofill-status");
  el.textContent = msg;
  el.className = "status-line " + (cls || "");
}

function authHeader() {
  return { "Authorization": `Bearer ${account.usercode}:${account.pin}` };
}
function signedIn() { return !!account.usercode && !!account.pin; }

function saveAccount() {
  localStorage.setItem("bh_usercode", account.usercode);
  localStorage.setItem("bh_pin", account.pin);
}

function renderAccount() {
  const on = signedIn();
  $("acct-signed-out").classList.toggle("hidden", on);
  $("acct-signed-in").classList.toggle("hidden", !on);
  $("app-view").classList.toggle("hidden", !on);
  document.body.classList.toggle("signed-in", on);
  if (on) $("acct-usercode").textContent = account.usercode;
}

function currentKey() {
  if (confirmedKey) return confirmedKey;
  const uc = account.usercode || "????";
  return `${uc}${yy}-${String(previewSeq).padStart(3, "0")}`;
}

function getRow() {
  return {
    KEY: currentKey(),
    ROASTERY: $("f-roastery").value.trim(),
    ORIGIN: $("f-origin").value.trim(),
    REGION: $("f-region").value.trim(),
    PRODUCER: $("f-producer").value.trim(),
    LOT: $("f-lot").value.trim(),
    WASHING_STATION: $("f-washingstation").value.trim(),
    VARIETY: $("f-variety").value.trim(),
    PROCESS: $("f-process").value.trim(),
    ALTITUDE: withUnit($("f-altitude").value, "m"),
    HARVEST: $("f-harvest").value.trim(),
    ROAST_DATE: isoToDot($("f-roastdate").value),
    PACKAGE_DATE: isoToDot($("f-packagedate").value),
    NET_WEIGHT: withUnit($("f-netweight").value, "g"),
    AGTRON: $("f-agtron").value.trim(),
    TASTING_NOTE: $("f-note").value.trim(),
    MEMO: $("f-memo").value.trim(),
    SOURCE_URL: $("f-source").value.trim(),
  };
}

function setMode(newMode, key) {
  mode = newMode;
  confirmedKey = key || null;
  $("btn-save").textContent = mode === "edit" ? `수정 저장 (${confirmedKey})` : "등록 — KEY 발급받기";
  $("btn-new").classList.toggle("hidden", mode !== "edit");
  const enabled = !!confirmedKey;
  ["btn-copy-url", "btn-copy-qr", "btn-open-live"].forEach(id => $(id).disabled = !enabled);
  $("form-hint").innerHTML = mode === "edit"
    ? `<b>${confirmedKey}</b> 수정 중 — 붉은 별표(<span class="req">*</span>)는 필수 입력 항목입니다.`
    : `붉은 별표(<span class="req">*</span>)는 필수 입력 항목입니다. 저장하면 번호(KEY)가 자동으로 부여됩니다.`;
}

let verifySeq = 0;
async function renderAll() {
  if (!signedIn()) return;
  $("lbl-headline").textContent = design.headlineSize.toFixed(1) + "mm";
  $("lbl-specval").textContent = design.specValueSize.toFixed(2) + "mm";
  $("preview-key-label").textContent = confirmedKey
    ? `— 확정 KEY ${confirmedKey}` : `— 예상 KEY ${currentKey()}`;

  const { svg, content } = buildLabelSVG(getRow(), design, logoDataUrl);
  $("svg-holder").innerHTML = svg;
  if (!$("sheet").classList.contains("hidden")) $("sheet-svg").innerHTML = svg;
  $("qr-target").textContent = "QR: " + content;
  window.__svg = svg;

  setVerify("QR 검증 중…", "");
  const mySeq = ++verifySeq;
  const v = await verifyQr(svg, content, 203);
  if (mySeq !== verifySeq) return;
  setVerify(v.ok ? "QR 검증 OK — 203dpi 실디코드 통과" : "QR 검증 실패 — QR 크기를 키워보세요",
    v.ok ? "ok" : "bad");
}

// 서브라인 필드(지역/가공/품종/고도)에 값이 있으면 해당 표시 체크박스를 자동으로 켠다.
// 사용자가 직접 끈 체크는 건드리지 않음(값이 있어도 강제로 다시 켜지 않음) — 단, 값이 막 채워진 시점엔 켠다.
// 이미 스펙 칸에 표시 중인 항목은 중복 표시가 되므로 자동으로 켜지 않는다.
function autoCheckSubline() {
  Object.entries(SUB_FIELD_INPUT_IDS).forEach(([key, inputId]) => {
    const inputEl = $(inputId);
    const checkbox = subToggleInputs[key];
    if (!inputEl || !checkbox) return;
    if (inputEl.value.trim() && !checkbox.checked && !design.specFields.includes(key)) {
      checkbox.checked = true;
      if (!design.subFields.includes(key)) design.subFields.push(key);
      saveDesign();
    }
  });
}

async function api(path, opts = {}) {
  opts.headers = Object.assign({}, opts.headers, signedIn() ? authHeader() : {});
  const res = await fetch(path, opts);
  let body = null;
  try { body = await res.json(); } catch (e) {}
  return { status: res.status, body, raw: res };
}

// ── 로스터리 datalist + 서버 저장 로고 ──────────────────────

function refreshRoasteryOptions(beans) {
  const names = new Set(Object.keys(logosMap));
  (beans || []).forEach(b => { const r = (b.ROASTERY || "").trim(); if (r) names.add(r.toUpperCase()); });
  $("dl-roastery").innerHTML = [...names].sort().map(n => `<option value="${escapeHtml(n)}">`).join("");
}

async function refreshLogos() {
  if (!signedIn()) return;
  const { body } = await api("/api/logos");
  if (body && body.ok) {
    logosMap = {};
    body.logos.forEach(l => logosMap[l.roastery] = l.data_url);
    refreshRoasteryOptions();
    applySavedLogo();
    renderAll();
  }
}

// 로스터리 입력값에 저장된 로고가 있으면 자동 적용. 방금 수동으로 올린 로고는 유지.
function applySavedLogo() {
  if (logoSource === "manual") return;
  const rst = $("f-roastery").value.trim().toUpperCase();
  const saved = rst && logosMap[rst];
  if (saved) { logoDataUrl = saved; logoSource = "server"; }
  else if (logoSource === "server") { logoDataUrl = null; logoSource = null; }
}

// 로고 원본을 라벨 해상도에 맞게 축소(긴 변 256px, PNG)해 저장 용량을 통제한다.
// SVG는 벡터 그대로 유지 (크기 상한만 검사).
function downscaleLogo(dataUrl) {
  return new Promise((resolve, reject) => {
    if (dataUrl.startsWith("data:image/svg")) { resolve(dataUrl); return; }
    const img = new Image();
    img.onload = () => {
      const max = 256;
      let w = img.naturalWidth, h = img.naturalHeight;
      if (Math.max(w, h) > max) {
        const k = max / Math.max(w, h);
        w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k));
      }
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

async function setManualLogo(rawDataUrl) {
  let dataUrl;
  try { dataUrl = await downscaleLogo(rawDataUrl); }
  catch (e) { setStatus("로고 이미지를 읽지 못했습니다.", false); return; }
  if (dataUrl.length > LOGO_MAX_LEN) { setStatus("로고 이미지가 너무 큽니다 (100KB 제한).", false); return; }
  logoDataUrl = dataUrl;
  logoSource = "manual";
  $("f-show-logo").checked = true;
  design.showLogo = true;
  saveDesign();
  renderAll();
  await saveLogoForRoastery();
}

async function saveLogoForRoastery() {
  const rst = $("f-roastery").value.trim().toUpperCase();
  if (!rst) { setStatus("로고를 불러왔습니다. 로스터리 이름을 입력하면 저장되어 다음부터 자동 적용됩니다.", true); return; }
  if (!signedIn() || !logoDataUrl) return;
  const { body } = await api("/api/logos", {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roastery: rst, data_url: logoDataUrl }),
  });
  if (body && body.ok) {
    logosMap[rst] = logoDataUrl;
    logoSource = "server";
    refreshRoasteryOptions();
    setStatus(`${rst} 로고 저장됨 — 다음부터 이름만 입력해도 자동 적용됩니다.`, true);
  } else {
    setStatus((body && body.error) || "로고 저장 실패", false);
  }
}

async function deleteSavedLogo() {
  const rst = $("f-roastery").value.trim().toUpperCase();
  if (!rst) { setStatus("삭제할 로스터리 이름을 먼저 입력하세요.", false); return; }
  if (!logosMap[rst]) { setStatus(`${rst} 에 저장된 로고가 없습니다.`, false); return; }
  const { body } = await api("/api/logos", {
    method: "DELETE", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roastery: rst }),
  });
  if (body && body.ok) {
    delete logosMap[rst];
    if (logoSource === "server") { logoDataUrl = null; logoSource = null; }
    refreshRoasteryOptions();
    renderAll();
    setStatus(`${rst} 저장 로고 삭제됨`, true);
  } else {
    setStatus((body && body.error) || "로고 삭제 실패", false);
  }
}

// ── 원두 목록 ────────────────────────────────────────────────

async function refreshList() {
  const holder = $("bean-list");
  if (!signedIn()) return;
  const { body } = await api("/api/beans");
  if (!body || !body.ok) { holder.innerHTML = '<p class="hint error">목록을 불러오지 못했습니다.</p>'; return; }
  const beans = body.beans;
  refreshRoasteryOptions(beans);
  const re = new RegExp(`^${account.usercode}${yy}-(\\d{3})$`);
  let max = 0;
  beans.forEach(b => { const m = re.exec(b.KEY); if (m) max = Math.max(max, parseInt(m[1], 10)); });
  previewSeq = max + 1;
  if (mode === "new") renderAll();

  if (!beans.length) { holder.innerHTML = '<p class="hint">아직 등록된 원두가 없습니다. 첫 원두를 등록해 보세요.</p>'; return; }
  const rows = beans.map(b => `
    <div class="bean-row" data-key="${b.KEY}">
      <div class="bean-row-main">
        <span class="bkey">${b.KEY}</span><span class="borigin">${escapeHtml(b.ORIGIN || "")}</span>
        <span class="bmeta">${escapeHtml(b.ROASTERY || "")}${b.ROAST_DATE ? " · 로스팅 " + escapeHtml(b.ROAST_DATE) : ""}</span>
      </div>
      <div class="rowbtns">
        <button data-act="edit">수정</button>
        <button data-act="url">URL</button>
        <button data-act="del" class="danger">삭제</button>
      </div>
    </div>`).join("");
  holder.innerHTML = `<div class="bean-rows">${rows}</div>`;
  holder.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.closest(".bean-row").dataset.key;
      const act = btn.dataset.act;
      if (act === "url") { copyText(`${SITE}/${key}`); setStatus(`${key} 상세 URL 복사됨`, true); }
      if (act === "edit") loadBeanForEdit(key, beans);
      if (act === "del") deleteBean(key);
    });
  });
}

function loadBeanForEdit(key, beans) {
  const b = beans.find(x => x.KEY === key);
  if (!b) return;
  $("f-roastery").value = b.ROASTERY || "";
  $("f-origin").value = b.ORIGIN || "";
  $("f-region").value = b.REGION || "";
  $("f-producer").value = b.PRODUCER || "";
  $("f-lot").value = b.LOT || "";
  $("f-washingstation").value = b.WASHING_STATION || "";
  $("f-variety").value = b.VARIETY || "";
  $("f-process").value = b.PROCESS || "";
  $("f-altitude").value = (b.ALTITUDE || "").replace(/m$/, "");
  $("f-harvest").value = b.HARVEST || "";
  $("f-roastdate").value = dotToIso(b.ROAST_DATE);
  $("f-packagedate").value = dotToIso(b.PACKAGE_DATE);
  $("f-netweight").value = (b.NET_WEIGHT || "").replace(/g$/, "");
  $("f-agtron").value = b.AGTRON || "";
  $("f-note").value = b.TASTING_NOTE || "";
  $("f-memo").value = b.MEMO || "";
  $("f-source").value = b.SOURCE_URL || "";
  logoSource = logoSource === "manual" ? null : logoSource;  // 편집 로드 시 저장된 로고 우선
  applySavedLogo();
  setMode("edit", key);
  setStatus(`${key} 를 수정 중입니다.`, true);
  autoCheckSubline();
  renderAll();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteBean(key) {
  if (!confirm(`${key} 를 삭제할까요? 인쇄된 라벨의 QR은 더 이상 조회되지 않습니다.`)) return;
  const { body } = await api(`/api/bean/${key}`, { method: "DELETE" });
  if (body && body.ok) {
    setStatus(`${key} 삭제됨`, true);
    if (confirmedKey === key) { setMode("new", null); }
    refreshList();
  } else {
    setStatus((body && body.error) || "삭제 실패", false);
  }
}

function missingRequiredFields(row) {
  const missing = [];
  if (!row.ROASTERY) missing.push("로스터리");
  if (!row.ORIGIN) missing.push("국가(산지)");
  if (!row.ROAST_DATE) missing.push("로스팅일");
  if (!row.PACKAGE_DATE) missing.push("패키징일");
  return missing;
}

async function save() {
  if (!signedIn()) { setStatus("가입 또는 로그인이 필요합니다.", false); return; }
  const row = getRow();
  const missing = missingRequiredFields(row);
  if (missing.length) { setStatus(`필수 항목을 입력하세요: ${missing.join(", ")}`, false); return; }
  const payload = Object.assign({}, row, { YEAR: yy });
  delete payload.KEY;
  const wasEdit = mode === "edit";
  setStatus(wasEdit ? "수정 저장 중…" : "등록 중…", true);
  const { body } = wasEdit
    ? await api(`/api/bean/${confirmedKey}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
    : await api("/api/beans", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  if (body && body.ok) {
    setMode("edit", body.key);
    setStatus(wasEdit
      ? `수정 저장 완료 — ${body.key}`
      : `등록 완료 — KEY ${body.key} 확정. URL·QR 복사와 인쇄를 진행하세요.`, true);
    renderAll();
    refreshList();
  } else {
    setStatus((body && body.error) || "저장 실패", false);
  }
}

// ── CSV 백업 복원 ────────────────────────────────────────────

async function importCsvFile(file) {
  const text = await file.text();
  if (!confirm("백업 CSV의 내용으로 복원합니다.\n같은 KEY가 이미 있으면 백업 내용으로 덮어씁니다. 계속할까요?")) return;
  setStatus("복원 중…", true);
  const { body } = await api("/api/import", {
    method: "POST", headers: { "Content-Type": "text/csv;charset=utf-8" }, body: text,
  });
  if (body && body.ok) {
    let msg = `복원 완료 — 추가 ${body.added} · 덮어쓰기 ${body.updated}`;
    if (body.skippedTotal) {
      msg += ` · 건너뜀 ${body.skippedTotal}`;
      const reasons = (body.skipped || []).slice(0, 3).map(s => `${s.key}: ${s.reason}`).join(" / ");
      if (reasons) msg += ` (${reasons}${body.skippedTotal > 3 ? " …" : ""})`;
    }
    setStatus(msg, true);
    refreshList();
  } else {
    setStatus((body && body.error) || "복원 실패", false);
  }
}

// ── 계정 (가입 / 로그인 / 복구) ──────────────────────────────

async function showRecoveryBox(usercode, recoveryKey) {
  const box = $("recovery-box");
  box.classList.remove("hidden");
  box.classList.add("modal-overlay");
  box.innerHTML = `
    <div class="recovery-card">
      <p><b>오프라인 복구키</b> — 지금 이 순간만 표시됩니다. 유저코드나 암호를 잊어도 이 키만 있으면 계정을 되찾을 수 있습니다. 클립보드에 자동으로 복사해두었어요.</p>
      <div class="recovery-key">${recoveryKey}</div>
      <div class="btnrow">
        <button id="btn-copy-recovery">다시 복사</button>
        <button id="btn-dl-recovery">텍스트 파일로 저장</button>
      </div>
      <label class="recovery-ack">
        <input type="checkbox" id="recovery-ack">
        복구키를 안전한 곳에 저장했습니다 (이 창은 다시 표시되지 않습니다)
      </label>
      <div class="btnrow">
        <button class="primary" id="btn-dismiss-recovery" disabled>계속하기</button>
      </div>
    </div>`;
  $("btn-copy-recovery").addEventListener("click", async () => {
    const ok = await copyText(recoveryKey);
    setAcctStatus(ok ? "복구키가 복사되었습니다." : "복사 실패 — 직접 선택해 복사하세요.", ok);
  });
  $("btn-dl-recovery").addEventListener("click", () => {
    const text = `Bean-Hoarder 복구 정보\n유저코드: ${usercode}\n복구키: ${recoveryKey}\n\n`
      + `이 파일은 안전한 곳에 오프라인으로(인쇄물, USB 등) 보관하세요.\n분실 시 계정을 복구할 수 없습니다.\n`;
    download(`beanhoarder_recovery_${usercode}.txt`, new Blob([text], { type: "text/plain;charset=utf-8" }));
  });
  $("recovery-ack").addEventListener("change", (e) => {
    $("btn-dismiss-recovery").disabled = !e.target.checked;
  });
  $("btn-dismiss-recovery").addEventListener("click", () => {
    box.classList.add("hidden");
    box.classList.remove("modal-overlay");
    box.innerHTML = "";
  });
  // 가입/복구 시점에 바로 클립보드로 저장을 유도 (실패해도 조용히 무시 — 버튼으로 재시도 가능)
  await copyText(recoveryKey);
}

async function signup() {
  const invite = $("a-invite").value.trim();
  const pin = $("a-pin").value.trim();
  if (!invite) { setAcctStatus("초대코드를 입력하세요.", false); return; }
  if (!/^\d{4}$/.test(pin)) { setAcctStatus("암호는 숫자 4자리여야 합니다.", false); return; }
  const res = await fetch("/api/signup", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invite, password: pin }),
  });
  const body = await res.json().catch(() => null);
  if (body && body.ok) {
    account.usercode = body.usercode;
    account.pin = pin;
    saveAccount();
    renderAccount();
    showRecoveryBox(body.usercode, body.recovery_key);
    refreshLogos();
    refreshList();
    renderAll();
  } else {
    setAcctStatus((body && body.error) || "가입 실패", false);
  }
}

async function login() {
  const uc = $("a-usercode").value.trim().toUpperCase();
  const pin = $("a-pin2").value.trim();
  if (!/^[A-Z0-9]{4}$/.test(uc) || !/^\d{4}$/.test(pin)) {
    setAcctStatus("유저코드 4자리와 숫자 암호 4자리를 입력하세요.", false); return;
  }
  const res = await fetch("/api/beans", { headers: { "Authorization": `Bearer ${uc}:${pin}` } });
  if (res.ok) {
    account.usercode = uc; account.pin = pin;
    saveAccount(); renderAccount();
    refreshLogos(); refreshList(); renderAll();
  } else {
    setAcctStatus("유저코드 또는 암호가 올바르지 않습니다.", false);
  }
}

async function recover() {
  const key = $("a-recovery").value.trim();
  const pin = $("a-pin3").value.trim();
  if (!key) { setAcctStatus("복구키를 입력하세요.", false); return; }
  if (!/^\d{4}$/.test(pin)) { setAcctStatus("새 암호는 숫자 4자리여야 합니다.", false); return; }
  const res = await fetch("/api/recover", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recovery_key: key, password: pin }),
  });
  const body = await res.json().catch(() => null);
  if (body && body.ok) {
    account.usercode = body.usercode; account.pin = pin;
    saveAccount(); renderAccount();
    showRecoveryBox(body.usercode, body.recovery_key);
    refreshLogos(); refreshList(); renderAll();
  } else {
    setAcctStatus((body && body.error) || "복구 실패", false);
  }
}

// ── 공용 유틸 ────────────────────────────────────────────────

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (e) { /* 권한 차단 시 레거시 방식 폴백 */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:absolute;left:-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch (e) { return false; }
}

// QR 단독 이미지(콰이엇존 4모듈 포함, 512px급)를 클립보드에 복사
async function copyQrImage(key) {
  const qr = qrcode(0, "M");
  qr.addData(`${BASE_URL}/${key}`, "Alphanumeric");
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 4, scale = 16;
  const size = (n + quiet * 2) * scale;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#000";
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
  const blob = await new Promise(res => canvas.toBlob(res, "image/png"));
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return { ok: true };
  } catch (e) {
    return { ok: false, blob };
  }
}

function download(filename, blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── 자동 채우기 (휴리스틱 파서 / Gemini) ─────────────────────

// 인식 결과를 폼에 반영. 이미 값이 있는 항목은 덮어쓰지 않는다 (파서·AI 공용).
function fillParsed(parsed, sourceLabel) {
  const filled = [];
  for (const [field, inputId] of Object.entries(AUTOFILL_INPUT_IDS)) {
    const v = parsed[field];
    const el = $(inputId);
    if (!v || !el || el.value.trim()) continue;
    el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    filled.push(FIELD_LABELS_KO[field] || field);
  }
  if (filled.length) {
    setAutofillStatus(`${sourceLabel} 채움: ${filled.join(", ")} — 검토 후 저장하세요.`, "ok");
    $("autofill-box").open = false;
  } else {
    setAutofillStatus("인식된 새 항목이 없습니다. 이미 채워진 필드는 덮어쓰지 않습니다.", "error");
  }
}

// Gemini 호출: 사용자 본인의 API 키로 브라우저에서 Google API에 직접 요청한다.
// 서비스 서버를 거치지 않으므로 서버 비용·키 보관 부담이 없다.
const AI_FIELD_KEYS = ["ROASTERY","ORIGIN","REGION","PRODUCER","LOT","WASHING_STATION","VARIETY","PROCESS",
  "ALTITUDE","HARVEST","NET_WEIGHT","TASTING_NOTE","MEMO","SOURCE_URL"];
const AI_PROMPT = `다음 텍스트는 커피 원두 상품 페이지에서 추출한 것이다. 원두 정보를 JSON 객체로 추출하라.
규칙:
- 값을 찾지 못한 키는 생략한다. 절대 추측하지 않는다.
- ORIGIN: 생산 국가명, 영문 대문자 (예: "ETHIOPIA"). 블렌드면 "블렌드".
- REGION: 국가 아래 세부 지역 계층을 콤마로 이어 한 줄로 (예: "Yirgacheffe, Gedeb").
- ALTITUDE: 미터 숫자 또는 범위만, 단위 없이 (예: "1900-2100").
- NET_WEIGHT: 그램 숫자만 (예: "200").
- HARVEST: 수확시기 (예: "25/26", "25.12-26.01").
- TASTING_NOTE: 콤마로 구분한 짧은 노트.
- MEMO: 산지·농장·가공의 배경 스토리가 있으면 2~3문장으로 한국어 요약, 없으면 생략.
- ROAST_DATE, PACKAGE_DATE는 추출하지 않는다.
허용 키: ${AI_FIELD_KEYS.join(", ")}
JSON 객체만 출력하라.`;

async function geminiExtract(apiKey, model, text) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: AI_PROMPT + "\n\n---\n" + text.slice(0, 30000) }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0 },
    }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((body && body.error && body.error.message) || `HTTP ${res.status}`);
  }
  const raw = body?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const parsed = JSON.parse(raw);
  const out = {};
  AI_FIELD_KEYS.forEach(k => {
    const v = parsed[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  });
  return out;
}

// ── 라벨 디자인 컨트롤 (사이즈 / 토글 / 슬라이더) ────────────

function syncSliders() {
  const S = SIZE_SPECS[design.size];
  const h = $("f-headline-size");
  h.min = S.headline.min; h.max = S.headline.max; h.value = design.headlineSize;
  const v = $("f-specval-size");
  v.min = S.specVal.min; v.max = S.specVal.max; v.value = design.specValueSize;
}

function buildSizeRadios() {
  const el = $("size-radios");
  Object.entries(SIZE_SPECS).forEach(([key, S]) => {
    const wrap = document.createElement("label");
    wrap.innerHTML = `<input type="radio" name="lbl-size" value="${key}" ${design.size === key ? "checked" : ""}> ${S.label}`;
    el.appendChild(wrap);
    wrap.querySelector("input").addEventListener("change", () => {
      design.size = key;
      design.headlineSize = S.headline.def;
      design.specValueSize = S.specVal.def;
      syncSliders();
      saveDesign();
      renderAll();
    });
  });
}

function buildToggles(containerId, pool, selected, max, refStore) {
  const el = $(containerId);
  pool.forEach(entry => {
    const key = entry[0];
    const label = entry[entry.length - 1];
    const wrap = document.createElement("label");
    wrap.innerHTML = `<input type="checkbox" ${selected.includes(key) ? "checked" : ""}> ${label}`;
    el.appendChild(wrap);
    const input = wrap.querySelector("input");
    if (refStore) refStore[key] = input;
    input.addEventListener("change", (e) => {
      if (e.target.checked) {
        if (max && selected.length >= max) { e.target.checked = false; return; }
        if (!selected.includes(key)) selected.push(key);
      } else {
        const i = selected.indexOf(key);
        if (i >= 0) selected.splice(i, 1);
      }
      saveDesign();
      renderAll();
    });
  });
}
buildSizeRadios();
syncSliders();
buildToggles("toggle-sub", SUB_POOL, design.subFields, null, subToggleInputs);
buildToggles("toggle-spec", SPEC_POOL, design.specFields, 4, specToggleInputs);

// 같은 정보(예: 고도)가 서브라인과 스펙 칸에 동시에 표시되지 않도록 상호 배타 처리:
// 한쪽에서 체크하면 다른 쪽에 켜져 있던 같은 항목은 자동으로 꺼진다.
function uncheckIn(inputs, arr, key) {
  const other = inputs[key];
  if (other && other.checked) {
    other.checked = false;
    const i = arr.indexOf(key);
    if (i >= 0) arr.splice(i, 1);
    saveDesign();
    renderAll();
  }
}
Object.entries(subToggleInputs).forEach(([key, input]) => {
  input.addEventListener("change", () => { if (input.checked) uncheckIn(specToggleInputs, design.specFields, key); });
});
Object.entries(specToggleInputs).forEach(([key, input]) => {
  input.addEventListener("change", () => { if (input.checked) uncheckIn(subToggleInputs, design.subFields, key); });
});

// ── 이벤트 배선 ──────────────────────────────────────────────

// 인증 탭 전환
document.querySelectorAll("#auth-tabs button").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#auth-tabs button").forEach(b => b.classList.toggle("active", b === btn));
    ["login", "signup", "recover"].forEach(t =>
      $(`pane-${t}`).classList.toggle("hidden", t !== btn.dataset.tab));
    setAcctStatus("", true);
  });
});

// 모바일 미리보기 시트
$("fab-preview").addEventListener("click", () => {
  $("sheet").classList.remove("hidden");
  $("sheet-svg").innerHTML = window.__svg || "";
  $("sheet-verify").textContent = $("verify-badge").textContent;
  $("sheet-verify").className = $("verify-badge").className;
});
$("sheet-close").addEventListener("click", () => $("sheet").classList.add("hidden"));
$("sheet").addEventListener("click", (e) => { if (e.target === $("sheet")) $("sheet").classList.add("hidden"); });

$("btn-signup").addEventListener("click", signup);
$("btn-login").addEventListener("click", login);
$("btn-recover").addEventListener("click", recover);
$("btn-signout").addEventListener("click", () => {
  localStorage.removeItem("bh_usercode");
  localStorage.removeItem("bh_pin");
  location.reload();
});

FORM_IDS.forEach(id => $(id).addEventListener("input", () => { autoCheckSubline(); renderAll(); }));
// 로스터리 입력 시 저장된 로고 자동 적용
$("f-roastery").addEventListener("input", () => { applySavedLogo(); renderAll(); });
// 로스팅 포인트: 숫자로 시작하면 # 자동 부착
$("f-agtron").addEventListener("input", (e) => {
  const v = e.target.value;
  if (/^\d/.test(v)) e.target.value = "#" + v;
});
$("f-headline-size").addEventListener("input", e => { design.headlineSize = parseFloat(e.target.value); saveDesign(); renderAll(); });
$("f-specval-size").addEventListener("input", e => { design.specValueSize = parseFloat(e.target.value); saveDesign(); renderAll(); });
$("f-show-logo").addEventListener("change", e => { design.showLogo = e.target.checked; saveDesign(); renderAll(); });
$("f-logo-file").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => setManualLogo(reader.result);
  reader.readAsDataURL(file);
});
$("btn-logo-del").addEventListener("click", deleteSavedLogo);

// 상품 페이지 URL → 서버 프록시가 텍스트를 추출해 붙여넣기 상자에 채우고, 곧바로 인식 실행
$("btn-autofill-url").addEventListener("click", async () => {
  const url = $("f-autofill-url").value.trim();
  if (!url) { setAutofillStatus("상품 페이지 URL을 입력하세요.", "error"); return; }
  if (!signedIn()) { setAutofillStatus("로그인이 필요합니다.", "error"); return; }
  setAutofillStatus("페이지를 가져오는 중…", "");
  const { body } = await api("/api/fetch", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }),
  });
  if (!body || !body.ok || body.kind !== "text") {
    setAutofillStatus((body && body.error) || "가져오기 실패 — 텍스트를 직접 붙여넣어 보세요.", "error");
    return;
  }
  $("f-autofill-text").value = body.text;
  if (!$("f-source").value.trim()) {
    $("f-source").value = url;
    $("f-source").dispatchEvent(new Event("input", { bubbles: true }));
  }
  $("btn-autofill").click();
});

// 로고를 이미지 링크로 불러오기 (서버 프록시로 CORS 우회 → dataURL로 변환해 캔버스 오염 방지)
$("btn-logo-url").addEventListener("click", async () => {
  const url = $("f-logo-url").value.trim();
  if (!url) { setStatus("로고 이미지 URL을 입력하세요.", false); return; }
  if (!signedIn()) { setStatus("로그인이 필요합니다.", false); return; }
  setStatus("로고 이미지를 가져오는 중…", true);
  const { body } = await api("/api/fetch", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }),
  });
  if (body && body.ok && body.kind === "image") {
    setManualLogo(body.dataUrl);
  } else {
    setStatus((body && body.error) || "이미지를 가져오지 못했습니다 — 이미지 파일 URL인지 확인하세요.", false);
  }
});

$("btn-open-deck").addEventListener("click", () => window.open("/deck", "_blank"));

$("btn-autofill").addEventListener("click", () => {
  const raw = $("f-autofill-text").value.trim();
  if (!raw) { setAutofillStatus("붙여넣을 텍스트가 없습니다.", "error"); return; }
  fillParsed(parseBeanText(raw), "");
});

// Gemini 설정: 브라우저에만 저장
$("f-gemini-key").value = localStorage.getItem("bh_gemini_key") || "";
$("f-gemini-model").value = localStorage.getItem("bh_gemini_model") || "gemini-2.5-flash-lite";
$("f-gemini-key").addEventListener("input", e => localStorage.setItem("bh_gemini_key", e.target.value.trim()));
$("f-gemini-model").addEventListener("input", e => localStorage.setItem("bh_gemini_model", e.target.value.trim()));

$("btn-autofill-ai").addEventListener("click", async () => {
  const raw = $("f-autofill-text").value.trim();
  if (!raw) { setAutofillStatus("붙여넣을 텍스트가 없습니다.", "error"); return; }
  const apiKey = $("f-gemini-key").value.trim();
  const model = $("f-gemini-model").value.trim() || "gemini-2.5-flash-lite";
  if (!apiKey) {
    $("ai-settings").open = true;
    setAutofillStatus("Gemini API 키를 먼저 설정하세요 (aistudio.google.com에서 무료 발급).", "error");
    return;
  }
  setAutofillStatus("AI 인식 중…", "");
  try {
    const parsed = await geminiExtract(apiKey, model, raw);
    fillParsed(parsed, "AI ");
  } catch (e) {
    setAutofillStatus(`AI 인식 실패 — ${e.message}. 키·모델명을 확인하거나 휴리스틱 인식을 사용하세요.`, "error");
  }
});

$("btn-save").addEventListener("click", save);
$("btn-new").addEventListener("click", () => {
  FORM_IDS.forEach(id => $(id).value = "");
  $("f-autofill-text").value = "";
  setAutofillStatus("", "");
  $("autofill-box").open = true;
  setDateDefaults();
  logoDataUrl = null;
  logoSource = null;
  setMode("new", null);
  setStatus("", true);
  refreshList();
  renderAll();
});
$("btn-copy-url").addEventListener("click", async () => {
  const ok = await copyText(`${SITE}/${confirmedKey}`);
  setStatus(ok ? `상세 URL 복사됨 — ${SITE}/${confirmedKey}` : "복사 실패 — 브라우저 권한을 확인하세요.", ok);
});
$("btn-copy-qr").addEventListener("click", async () => {
  const r = await copyQrImage(confirmedKey);
  if (r.ok) {
    setStatus("QR 이미지가 클립보드에 복사되었습니다.", true);
  } else {
    download(`${confirmedKey}_qr.png`, r.blob);
    setStatus("이 브라우저는 이미지 클립보드를 지원하지 않아 PNG로 다운로드했습니다.", true);
  }
});
$("btn-open-live").addEventListener("click", () => window.open(`/${confirmedKey}`, "_blank"));
$("btn-refresh-list").addEventListener("click", refreshList);
$("btn-export").addEventListener("click", async () => {
  if (!signedIn()) { setStatus("로그인이 필요합니다.", false); return; }
  const res = await fetch("/api/export.csv", { headers: authHeader() });
  if (!res.ok) { setStatus("내보내기 실패", false); return; }
  download(`bean_sheet_${account.usercode}.csv`, await res.blob());
  setStatus("CSV 백업 저장 완료", true);
});
$("btn-import").addEventListener("click", () => {
  if (!signedIn()) { setStatus("로그인이 필요합니다.", false); return; }
  $("f-import").click();
});
$("f-import").addEventListener("change", (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (file) importCsvFile(file);
});
$("btn-dl-svg").addEventListener("click", () => {
  download(`${currentKey()}_${design.size}.svg`, new Blob([window.__svg], { type: "image/svg+xml" }));
});
$("btn-dl-png203").addEventListener("click", async () => {
  download(`${currentKey()}_${design.size}_203dpi.png`, await renderPngBlob(window.__svg, 203));
});
$("btn-dl-png320").addEventListener("click", async () => {
  download(`${currentKey()}_${design.size}_320dpi.png`, await renderPngBlob(window.__svg, 320));
});

setMode("new", null);
renderAccount();
renderAll();
refreshLogos();
refreshList();
