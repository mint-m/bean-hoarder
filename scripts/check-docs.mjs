#!/usr/bin/env node
// 문서가 가리키는 저장소 경로와 npm 스크립트가 실제로 존재하는지 검증한다.
//
// 내용의 정확성은 판단하지 않는다 — "가리키는 대상이 실재하는가"만 본다.
// 파일을 지우거나 옮겼는데 문서를 안 고친 경우(문서가 조용히 낡는 가장 흔한 유형)를 잡는 게 목적.
//
// 검사 대상은 저장소 루트의 모든 `*.md`다 — 목록을 손으로 유지하다가 DESIGN.md가 빠져
// 낡은 라우트 목록을 오래 방치한 전례가 있어 자동 수집으로 바꿨다. 생성물인 STRUCTURE.md도
// 포함한다: 생성기가 소스 주석을 그대로 실어 나르므로, 주석이 지워진 파일을 가리키면 여기서 잡힌다.
//
// 실행: npm run check:docs

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const IGNORE_START = "<!-- check-docs:ignore-start -->";
const IGNORE_END = "<!-- check-docs:ignore-end -->";

// 저장소에 없지만 문서가 정당하게 가리키는 이름 (빌드 산출물·실행 중 생기는 것)
const GENERATED = new Set([
  "public/admin", // 랩 빌드 산출물 — CI가 배포 직전 생성
  ".wrangler-e2e", // e2e 전용 로컬 D1/R2 persist
]);
const EXTERNAL_FILES = new Set([
  "bnhd-v2-backup.sql", // backup.yml이 만드는 Actions artifact
]);

// 확장자가 붙은 이름은 단독으로도 경로 후보로 본다.
// .csv 등 데이터 확장자는 API 라우트(export.csv)와 구분되지 않아 제외.
const FILE_EXT = /\.(?:js|mjs|cjs|ts|tsx|jsx|sql|css|html|json|ya?ml|md|toml)$/;

// 경로에 등장할 수 없는 문자에서 토큰을 자른다. 한글도 구분자다 —
// 저장소 경로에는 한글이 없으므로 "apps/lab의" 같은 조사 결합을 여기서 떼어낸다.
// `*`는 자르지 않는다 — 글로브(`migrate_*.sql`)를 통째로 잡아 검증 대상에서 빼기 위해.
const SPLIT = /[\s`(),"'|·→←—–…?!;=ㄱ-ㆎ가-힣]+/;

const MD_LINK = /\[([^\]]*)\]\(([^)]*)\)/g;
const NPM_RUN = /\bnpm run ([A-Za-z0-9:_-]+)(?:\s+(?:-w|--workspace)[=\s]([^\s`]+))?/g;

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).split("\n").filter(Boolean);
}

// 커밋될 내용만 본다 — 워킹트리의 임시 파일이 검증 결과를 흔들지 않게.
function repoIndex() {
  const files = new Set(git(["ls-files", "--cached"]));
  const dirs = new Set(GENERATED);
  for (const f of files) {
    const parts = f.split("/");
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
  }
  const topLevel = new Set();
  for (const p of [...files, ...dirs]) topLevel.add(p.split("/")[0]);

  // 파일명만 적힌 참조를 풀기 위한 역인덱스. 후보가 둘 이상이면 모호한 것으로 본다.
  const byBasename = new Map();
  for (const f of files) {
    const base = f.slice(f.lastIndexOf("/") + 1);
    if (!byBasename.has(base)) byBasename.set(base, []);
    byBasename.get(base).push(f);
  }
  return { files, dirs, topLevel, byBasename };
}

function docs() {
  return git(["ls-files", "--cached", "*.md"])
    .filter((f) => !f.includes("/"))
    .sort();
}

function workspaceScripts() {
  const root = JSON.parse(readFileSync("package.json", "utf8"));
  const byName = new Map([[null, new Set(Object.keys(root.scripts ?? {}))]]);
  for (const glob of root.workspaces ?? []) {
    const base = glob.replace(/\/\*$/, "");
    for (const p of git(["ls-files", `${base}/*/package.json`])) {
      const pkg = JSON.parse(readFileSync(p, "utf8"));
      if (pkg.name) byName.set(pkg.name, new Set(Object.keys(pkg.scripts ?? {})));
    }
  }
  return byName;
}

// 산문의 슬래시("컬러/흑백")와 실제 경로를 가르는 기준:
// 확장자가 있거나, 첫 구간이 저장소 최상위에 실재하는 이름이어야 한다.
function isPathCandidate(token, topLevel) {
  if (!token) return false;
  if (token.startsWith("/") || token.startsWith("#")) return false; // 라우트·앵커
  if (token.startsWith("-") || token.startsWith("@")) return false; // CLI 플래그·npm 패키지명
  if (token.includes("://")) return false; // URL
  if (/\.(?:dev|com|io|org|net)\b/.test(token)) return false; // 도메인
  if (/[{}<>]/.test(token)) return false; // 플레이스홀더·HTML
  if (token.includes("*")) return false; // 글로브 — 실존을 따질 대상이 아니다
  if (/^\.[A-Za-z0-9]+$/.test(token)) return false; // 확장자 조각 (`.md`, `.sql`)
  if (FILE_EXT.test(token)) return true;
  return token.includes("/") && topLevel.has(token.split("/")[0]);
}

// 디렉터리를 포함해 적었으면 위치를 주장한 것이므로 정확히 일치해야 한다.
// 파일명만 적은 건 산문의 축약이므로, 저장소에서 유일하게 풀릴 때만 통과시킨다.
function resolve(candidate, index) {
  const c = candidate.replace(/\/+$/, "");
  if (EXTERNAL_FILES.has(c) || index.files.has(c) || index.dirs.has(c)) return { ok: true };
  if (c.includes("/")) return { ok: false, why: "그런 경로가 없다" };

  const hits = index.byBasename.get(c) ?? [];
  if (hits.length === 1) return { ok: true };
  if (hits.length > 1) return { ok: false, why: `이름이 겹친다 (${hits.join(", ")}) — 전체 경로로 적을 것` };
  return { ok: false, why: "그런 파일이 없다" };
}

function checkDoc(doc, index, scripts) {
  const problems = [];
  const lines = readFileSync(doc, "utf8").split("\n");
  let ignoring = false;
  let ignoreOpenedAt = 0;

  lines.forEach((raw, i) => {
    const trimmed = raw.trim();
    if (trimmed === IGNORE_START) {
      ignoring = true;
      ignoreOpenedAt = i + 1;
      return;
    }
    if (trimmed === IGNORE_END) {
      ignoring = false;
      return;
    }
    if (ignoring) return;

    const line = raw.replace(MD_LINK, "$1 $2");

    for (const token of line.split(SPLIT)) {
      const cleaned = token.replace(/[.,:;]+$/, "");
      if (!isPathCandidate(cleaned, index.topLevel)) continue;
      const r = resolve(cleaned, index);
      if (!r.ok) problems.push({ line: i + 1, kind: "경로", ref: cleaned, why: r.why });
    }

    for (const m of line.matchAll(NPM_RUN)) {
      const [, name, workspace] = m;
      const known = scripts.get(workspace ?? null);
      if (!known) {
        problems.push({ line: i + 1, kind: "워크스페이스", ref: workspace, why: "그런 워크스페이스가 없다" });
      } else if (!known.has(name)) {
        const where = workspace ? ` (${workspace})` : "";
        problems.push({
          line: i + 1,
          kind: "npm 스크립트",
          ref: `npm run ${name}${where}`,
          why: "package.json에 없다",
        });
      }
    }
  });

  // 여는 마커만 있으면 그 아래 전부가 조용히 검사에서 빠진다 — 침묵 대신 실패로 알린다.
  if (ignoring) {
    problems.push({
      line: ignoreOpenedAt,
      kind: "마커",
      ref: IGNORE_START,
      why: `닫는 ${IGNORE_END}가 없어 이 아래 전부가 검사에서 빠졌다`,
    });
  }

  return problems;
}

const index = repoIndex();
const scripts = workspaceScripts();
const targets = docs();
let failed = 0;

for (const doc of targets) {
  const problems = checkDoc(doc, index, scripts);
  if (problems.length === 0) continue;
  failed += problems.length;
  console.error(`\n${doc} — 문제 ${problems.length}건`);
  for (const p of problems) console.error(`  ${doc}:${p.line}  ${p.kind}  ${p.ref} — ${p.why}`);
}

if (failed > 0) {
  console.error(
    `\n총 ${failed}건. 대상이 지워졌거나 옮겨졌다면 문서를 고치고,` +
      ` 이력처럼 일부러 언급하는 것이라면 ${IGNORE_START} … ${IGNORE_END}로 감쌀 것.`,
  );
  process.exit(1);
}

console.log(`check:docs — ${targets.join(", ")}의 경로·npm 스크립트 참조 이상 없음`);
