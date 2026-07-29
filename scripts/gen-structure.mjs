#!/usr/bin/env node
// 저장소 구조 문서를 코드에서 파생해 생성한다.
//
// 손으로 적은 구조 설명은 반드시 낡는다 — 파일을 옮기거나 지울 때 문서를 같이 고치는 걸
// 사람이 놓치기 때문이다. 그래서 여기서는 "무엇이 있는가"를 저장소에서 직접 읽어낸다.
//   · 파일 목록      → git ls-files
//   · 각 파일의 역할 → 파일 머리 주석 (없으면 HTML <title>)
//   · 워크스페이스   → package.json workspaces + 각 package.json name
//   · API 라우트     → packages/api/src/app.ts 의 app.<method>(...) 호출
//   · D1 테이블      → v2/schema.sql 의 CREATE TABLE
//
// 손으로 유지하는 건 아래 GROUPS(무엇을 보여줄지에 대한 정책)뿐이다. 정책은 잘 안 변하고,
// 사실은 자주 변한다 — 자주 변하는 쪽을 기계가 맡는다.
//
// 산출물은 STRUCTURE.md 하나다 — 파일 전체가 생성물이라 손댈 여지를 남기지 않는다.
// README는 사람이 읽는 문서로 두고 여기를 링크만 한다.
//
// 실행: npm run gen:structure            STRUCTURE.md 갱신
//       npm run gen:structure -- --check 재생성 결과가 커밋된 것과 같은지만 검사

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const OUT = "STRUCTURE.md";

const APP_TS = "packages/api/src/app.ts";
const SCHEMA_SQL = "v2/schema.sql";

// 목록에 넣어도 읽는 사람에게 정보가 없는 파일
const EXCLUDE = [/(^|\/)tsconfig\.json$/, /(^|\/)package\.json$/];

// 스스로를 설명할 수 없는 파일만 여기 적는다 — 손대면 안 되는 서드파티 코드가 그렇다.
const OVERRIDES = {
  "v2/public/vendor/jsQR.js": "카메라 QR 디코딩 라이브러리 (서드파티 — CDN 대신 저장소에 포함).",
};

// 주석 문법은 파일 타입마다 다르다. 한 규칙으로 뭉뚱그리면 CSS 커스텀 속성(--bg)을
// SQL 주석(--)으로 잘못 읽는 식의 사고가 난다.
const SYNTAX = {
  js: { line: /^\/\/+\s?(.*)$/, block: /\/\*+([\s\S]*?)\*\// },
  css: { block: /\/\*+([\s\S]*?)\*\// },
  sql: { line: /^--\s+(.*)$/ },
  hash: { line: /^#\s+(.*)$/ },
  html: { block: /<!--([\s\S]*?)-->/ },
};

const BY_EXT = {
  ".js": "js",
  ".mjs": "js",
  ".cjs": "js",
  ".ts": "js",
  ".tsx": "js",
  ".jsx": "js",
  ".css": "css",
  ".sql": "sql",
  ".yml": "hash",
  ".yaml": "hash",
  ".sh": "hash",
  ".html": "html",
};

// 무엇을 보여줄지에 대한 정책 — 여기만 손으로 유지한다.
const GROUPS = [
  {
    title: "정적 페이지",
    hint: "빌드 없이 브라우저가 그대로 받는 파일. Cloudflare Pages가 서빙한다.",
    prefix: "v2/public/",
    extra: [
      {
        path: "v2/public/admin/",
        desc: "랩(등록·관리 화면) — apps/lab 빌드 산출물. gitignore이며 CI가 배포 직전에 만든다.",
      },
    ],
  },
  {
    title: "서버",
    hint: "Pages Functions 진입점. 실제 라우팅은 @bnhd/api가 맡는다.",
    prefix: "v2/functions/",
  },
  {
    title: "워크스페이스",
    hint: "npm workspaces. 로직의 단일 소스는 전부 여기에 있다.",
    kind: "workspaces",
  },
  {
    title: "테스트",
    hint: "단위 테스트는 각 패키지 안에 두고, 사용자 동선은 e2e가 실제 서버를 띄워 검증한다.",
    prefix: "e2e/",
  },
  {
    title: "저장소 유지보수",
    hint: "문서를 코드에서 파생시키고, 어긋나면 잡아내는 스크립트.",
    prefix: "scripts/",
  },
];

function sh(cmd, args) {
  return execFileSync(cmd, args, { encoding: "utf8" });
}

function tracked() {
  return sh("git", ["ls-files", "--cached", "--others", "--exclude-standard"]).split("\n").filter(Boolean);
}

// 파일 머리의 첫 주석 블록을 설명으로 쓴다 — 설명이 코드 옆에 있으면 같이 낡지 않는다.
function describe(path) {
  if (OVERRIDES[path]) return OVERRIDES[path];
  if (!existsSync(path)) return "";

  const ext = path.slice(path.lastIndexOf("."));
  const syntax = SYNTAX[BY_EXT[ext]];
  if (!syntax) return "";

  const text = readFileSync(path, "utf8");
  let out = "";

  if (syntax.line) {
    const buf = [];
    for (const raw of text.split("\n").slice(0, 25)) {
      const l = raw.trim();
      if (!buf.length && l.startsWith("#!")) continue; // shebang은 설명이 아니다
      const m = l.match(syntax.line);
      if (m) {
        buf.push(m[1].trim());
        continue;
      }
      if (buf.length) break;
    }
    out = buf.join(" ").trim();
  }

  if (!out && syntax.block) {
    const b = text.match(syntax.block);
    if (b) {
      out = b[1]
        .split("\n")
        .map((l) => l.replace(/^\s*\*?\s?/, "").trim())
        .filter(Boolean)
        .join(" ");
    }
  }

  if (!out && ext === ".html") {
    const t = text.match(/<title>([^<]+)<\/title>/i);
    if (t) out = t[1].trim();
  }

  return firstSentence(out.replace(/^Bean-Hoarder\s*[—–-]\s*/i, ""));
}

function firstSentence(text) {
  const cut = text.search(/\.(?:\s|$)/);
  const out = cut > 0 ? text.slice(0, cut + 1) : text;
  return out.length > 140 ? `${out.slice(0, 137)}…` : out;
}

function workspaces() {
  const root = JSON.parse(readFileSync("package.json", "utf8"));
  const out = [];
  for (const glob of root.workspaces ?? []) {
    const base = glob.replace(/\/\*$/, "");
    for (const p of sh("git", ["ls-files", `${base}/*/package.json`])
      .split("\n")
      .filter(Boolean)) {
      const dir = p.replace(/\/package\.json$/, "");
      const pkg = JSON.parse(readFileSync(p, "utf8"));
      const entry = typeof pkg.exports?.["."] === "string" ? pkg.exports["."] : pkg.main;
      const resolved = entry
        ? `${dir}/${entry.replace(/^\.\//, "")}`
        : ["src/main.tsx", "src/index.ts", "src/index.js"].map((c) => `${dir}/${c}`).find(existsSync);
      out.push({ path: `${dir}/`, name: pkg.name, desc: resolved ? describe(resolved) : "" });
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

function routes() {
  if (!existsSync(APP_TS)) return [];
  const src = readFileSync(APP_TS, "utf8");
  const out = [];
  for (const m of src.matchAll(/app\.(get|post|put|patch|delete)\(\s*"([^"]+)"([^\n]*)/g)) {
    const [, method, path, rest] = m;
    const comment = rest.match(/\/\/\s*(.+)$/);
    out.push({
      method: method.toUpperCase(),
      path,
      auth: rest.includes("authRequired"),
      note: comment ? comment[1].trim() : "",
    });
  }
  return out;
}

function tables() {
  if (!existsSync(SCHEMA_SQL)) return [];
  const src = readFileSync(SCHEMA_SQL, "utf8");
  const out = [];
  for (const m of src.matchAll(/CREATE TABLE(?: IF NOT EXISTS)? (\w+)\s*\(([\s\S]*?)\n\)/g)) {
    const [, name, body] = m;
    const cols = [];
    for (const line of body.split("\n")) {
      const c = line.trim().match(/^(\w+)\s+(?:TEXT|INTEGER|REAL|BLOB|NUMERIC)/i);
      if (c) cols.push(c[1]);
    }
    out.push({ name, cols });
  }
  return out;
}

function buildModel() {
  const files = tracked();
  const groups = GROUPS.map((g) => {
    if (g.kind === "workspaces") {
      return { title: g.title, hint: g.hint, rows: workspaces() };
    }
    const rows = files
      .filter((f) => f.startsWith(g.prefix) && !EXCLUDE.some((re) => re.test(f)))
      .map((f) => ({ path: f, desc: describe(f) }))
      .concat(g.extra ?? []);
    rows.sort((a, b) => a.path.localeCompare(b.path));
    return { title: g.title, hint: g.hint, rows };
  });
  return { groups, routes: routes(), tables: tables() };
}

const HEADER = [
  "# Bean-Hoarder 저장소 구조",
  "",
  "> **이 파일은 생성된다 — 손으로 고치지 말 것.** `npm run gen:structure`가 저장소에서 직접",
  "> 읽어 만든다. 파일 목록은 `git ls-files`, 각 항목의 설명은 그 파일의 머리 주석, API 라우트는",
  "> `packages/api/src/app.ts`, D1 테이블은 `v2/schema.sql`에서 온다. 설명을 바꾸려면 해당",
  "> 파일의 머리 주석을 고치고 다시 생성한다.",
  ">",
  "> 원칙·함정은 [CLAUDE.md](CLAUDE.md), 사용법·운영 절차는 [README.md](README.md).",
  "",
];

function renderMarkdown(model) {
  const out = [...HEADER];
  for (const g of model.groups) {
    out.push(`**${g.title}** — ${g.hint}`, "");
    out.push("| 경로 | 역할 |", "|---|---|");
    for (const r of g.rows) {
      const label = r.name ? `\`${r.path}\`<br>\`${r.name}\`` : `\`${r.path}\``;
      out.push(`| ${label} | ${r.desc || "—"} |`);
    }
    out.push("");
  }

  out.push("**API 라우트** — 모두 `/api` 접두. 표시가 없으면 인증 없이 열려 있다.", "");
  out.push("| 메서드 | 경로 | 인증 |", "|---|---|---|");
  for (const r of model.routes) out.push(`| ${r.method} | \`${r.path}\` | ${r.auth ? "필요" : "공개"} |`);
  out.push("");

  out.push("**D1 테이블** (`bnhd-v2`)", "");
  out.push("| 테이블 | 컬럼 |", "|---|---|");
  for (const t of model.tables) out.push(`| \`${t.name}\` | ${t.cols.map((c) => `\`${c}\``).join(", ")} |`);
  out.push("");
  return out.join("\n");
}

const check = process.argv.includes("--check");
const model = buildModel();
const next = renderMarkdown(model);

if (check) {
  if (!existsSync(OUT) || readFileSync(OUT, "utf8") !== next) {
    console.error(`생성 문서가 저장소와 어긋난다: ${OUT}`);
    console.error("`npm run gen:structure`를 실행해 갱신하고 함께 커밋할 것.");
    process.exit(1);
  }
  console.log(`gen:structure — ${OUT}가 저장소와 일치함`);
} else {
  writeFileSync(OUT, next);
  const rows = model.groups.reduce((n, g) => n + g.rows.length, 0);
  console.log(
    `gen:structure — ${OUT} 갱신 (항목 ${rows}개 · 라우트 ${model.routes.length}개 · 테이블 ${model.tables.length}개)`,
  );
}
