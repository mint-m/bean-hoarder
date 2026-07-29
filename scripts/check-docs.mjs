#!/usr/bin/env node
// 문서가 가리키는 저장소 경로와 npm 스크립트가 실제로 존재하는지 검증한다.
//
// 내용의 정확성은 판단하지 않는다 — "가리키는 대상이 실재하는가"만 본다.
// 파일을 지우거나 옮겼는데 문서를 안 고친 경우(문서가 조용히 낡는 가장 흔한 유형)를 잡는 게 목적.
// 일부러 지워진 파일을 언급해야 하는 구간(이력 기록 등)은 아래 IGNORE 마커로 감싼다.
//
// 실행: npm run check:docs

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const DOCS = ["CLAUDE.md", "README.md"];

const IGNORE_START = "<!-- check-docs:ignore-start -->";
const IGNORE_END = "<!-- check-docs:ignore-end -->";

// 저장소에 없지만 문서가 정당하게 가리키는 이름 (빌드 산출물·실행 중 생기는 것)
const GENERATED_DIRS = [
  "v2/public/admin", // 랩 빌드 산출물 — CI가 배포 직전 생성
  "v2/.wrangler-e2e", // e2e 전용 로컬 D1/R2 persist
];
const EXTERNAL_FILES = new Set([
  "bnhd-v2-backup.sql", // backup.yml이 만드는 Actions artifact
]);

// 확장자가 붙은 이름은 단독으로도 경로 후보로 본다 — README "구조" 트리가 이 형식이다.
// .csv 등 데이터 확장자는 API 라우트(export.csv)와 구분되지 않아 제외.
const FILE_EXT = /\.(?:js|mjs|cjs|ts|tsx|jsx|sql|css|html|json|ya?ml|md|toml)$/;

// 경로에 등장할 수 없는 문자에서 토큰을 자른다. 한글도 구분자다 —
// 저장소 경로에는 한글이 없으므로 "apps/lab의" 같은 조사 결합을 여기서 떼어낸다.
// `*`는 자르지 않는다 — 글로브(`migrate_*.sql`)를 통째로 잡아 검증 대상에서 빼기 위해.
const SPLIT = /[\s`(),"'|·→←—–…?!;=ㄱ-ㆎ가-힣]+/;

const MD_LINK = /\[([^\]]*)\]\(([^)]*)\)/g;
const NPM_RUN = /\bnpm run ([A-Za-z0-9:_-]+)(?:\s+(?:-w|--workspace)[=\s]([^\s`]+))?/g;

function repoIndex() {
  // --others --exclude-standard: 아직 커밋 안 된 새 파일도 포함하고 gitignore 대상은 뺀다.
  const out = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    encoding: "utf8",
  });
  const files = new Set(out.split("\n").filter(Boolean));
  const dirs = new Set(GENERATED_DIRS);
  for (const f of files) {
    const parts = f.split("/");
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
  }
  const topLevel = new Set();
  for (const p of [...files, ...dirs]) topLevel.add(p.split("/")[0]);
  return { files, dirs, topLevel };
}

function workspaceScripts() {
  const root = JSON.parse(readFileSync("package.json", "utf8"));
  const byName = new Map([[null, new Set(Object.keys(root.scripts ?? {}))]]);
  for (const glob of root.workspaces ?? []) {
    const base = glob.replace(/\/\*$/, "");
    const found = execFileSync("git", ["ls-files", `${base}/*/package.json`], { encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
    for (const p of found) {
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

function resolves(candidate, { files, dirs }) {
  const c = candidate.replace(/\/+$/, "");
  if (EXTERNAL_FILES.has(c)) return true;
  if (files.has(c) || dirs.has(c)) return true;
  // migrate_logos.sql(= v2/ 기준)처럼 상대 참조도 흔하다 — 경로 접미사 일치를 허용한다.
  const suffix = `/${c}`;
  for (const f of files) if (f.endsWith(suffix)) return true;
  for (const d of dirs) if (d.endsWith(suffix)) return true;
  return false;
}

function checkDoc(doc, index, scripts) {
  const problems = [];
  const lines = readFileSync(doc, "utf8").split("\n");
  let ignoring = false;

  lines.forEach((raw, i) => {
    const trimmed = raw.trim();
    if (trimmed === IGNORE_START) {
      ignoring = true;
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
      if (!resolves(cleaned, index)) problems.push({ line: i + 1, kind: "경로", ref: cleaned });
    }

    for (const m of line.matchAll(NPM_RUN)) {
      const [, name, workspace] = m;
      const known = scripts.get(workspace ?? null);
      if (!known) {
        problems.push({ line: i + 1, kind: "워크스페이스", ref: workspace });
      } else if (!known.has(name)) {
        const where = workspace ? ` (${workspace})` : "";
        problems.push({ line: i + 1, kind: "npm 스크립트", ref: `npm run ${name}${where}` });
      }
    }
  });

  return problems;
}

const index = repoIndex();
const scripts = workspaceScripts();
let failed = 0;

for (const doc of DOCS) {
  const problems = checkDoc(doc, index, scripts);
  if (problems.length === 0) continue;
  failed += problems.length;
  console.error(`\n${doc} — 실재하지 않는 참조 ${problems.length}건`);
  for (const p of problems) console.error(`  ${doc}:${p.line}  ${p.kind}  ${p.ref}`);
}

if (failed > 0) {
  console.error(
    `\n총 ${failed}건. 대상이 지워졌거나 옮겨졌다면 문서를 고치고,` +
      ` 이력처럼 일부러 언급하는 것이라면 ${IGNORE_START} … ${IGNORE_END}로 감쌀 것.`,
  );
  process.exit(1);
}

console.log(`check:docs — ${DOCS.join(", ")}의 경로·npm 스크립트 참조 이상 없음`);
