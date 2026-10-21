#!/usr/bin/env node
// 사람이 읽는 문서 페이지(HOW_IT_WORKS.html)를 저장소의 .md 네 개에서 생성한다.
//
// .md 넷(README·CLAUDE·DESIGN·STRUCTURE)은 독자가 제각각이라 흩어져 있다. 사람은 그 넷을 한 페이지에서
// 훑고 싶어 한다 — 그래서 원본은 .md에 한 벌만 두고, 이 스크립트가
// 그것을 렌더해 HTML 한 장을 만든다. STRUCTURE.md와 같은 생성물이라 손으로 고칠 여지를 남기지
// 않는다: 문장을 고치려면 원본 .md를 고치고 다시 생성한다.
//
// 렌더는 marked(devDependency)에 맡기고, 여기서 얹는 것은 사람용 껍데기뿐이다 —
//   · 문서 간 링크(`[STRUCTURE.md](STRUCTURE.md)`)를 페이지 안 앵커로 바꾼다
//   · 제목마다 id를 붙여 목차를 만든다
//   · API 라우트 표의 메서드·인증 칸을 배지로, 향미 계열 표의 OKLCH 값을 색 견본으로 보여준다
//
// 실행: npm run gen:html            HOW_IT_WORKS.html 갱신
//       npm run gen:html -- --check 재생성 결과가 커밋된 것과 같은지만 검사

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { marked } from "marked";

const OUT = "HOW_IT_WORKS.html";

// 페이지에 싣는 문서와 순서. 사람에게 보이는 설명은 여기서만 손으로 유지한다.
const DOCS = [
  {
    file: "README.md",
    id: "readme",
    audience: "사람",
    blurb: "서비스가 무엇이고 어떻게 쓰고 어떻게 운영하는지.",
  },
  {
    file: "CLAUDE.md",
    id: "claude",
    audience: "AI",
    blurb: "작업 원칙과 절대 바꾸면 안 되는 것, 걸려 넘어지기 쉬운 함정. 에이전트가 매 세션 읽는다.",
  },
  {
    file: "DESIGN.md",
    id: "design",
    audience: "AI",
    blurb: "디자인 시스템 — 색·타이포·컴포넌트 규칙과 그 근거. 값의 단일 소스는 theme.css.",
  },
  {
    file: "STRUCTURE.md",
    id: "structure",
    audience: "AI · 사람 · 생성물",
    blurb: "파일 배치·API 라우트·D1 테이블. 저장소에서 생성되며 설명은 각 파일의 머리 주석에서 온다.",
  },
];

const ANCHOR_OF = new Map(DOCS.map((d) => [d.file, `#${d.id}`]));
ANCHOR_OF.set(OUT, "#top");

function slug(text) {
  return (
    text
      .toLowerCase()
      .replace(/<[^>]+>/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "") || "section"
  );
}

// 문서 하나를 렌더하면서 목차(h2·h3)를 함께 모은다.
function render(doc) {
  const md = readFileSync(doc.file, "utf8");
  const toc = [];
  const seen = new Set();
  const renderer = new marked.Renderer();
  const base = Object.getPrototypeOf(renderer);

  renderer.heading = function ({ tokens, depth }) {
    const inner = this.parser.parseInline(tokens);
    if (depth === 1) return ""; // 문서 제목은 페이지 껍데기가 대신 단다
    let id = `${doc.id}-${slug(inner)}`;
    for (let n = 2; seen.has(id); n++) id = `${doc.id}-${slug(inner)}-${n}`;
    seen.add(id);
    if (depth <= 3) toc.push({ depth, id, text: inner.replace(/<[^>]+>/g, "") });
    return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true">#</a>${inner}</h${depth}>\n`;
  };

  renderer.link = function (token) {
    const target = ANCHOR_OF.get(token.href);
    return base.link.call(this, target ? { ...token, href: target } : token);
  };

  // 표 한 칸의 평문 — 배지·견본 판정용
  const plain = (cell) =>
    cell.tokens
      .map((t) => t.raw)
      .join("")
      .trim();

  renderer.tablecell = function (cell) {
    const text = plain(cell);
    if (!cell.header) {
      if (/^(GET|POST|PUT|PATCH|DELETE)$/.test(text)) {
        return `<td><span class="method ${text.toLowerCase()}">${text}</span></td>\n`;
      }
      if (text === "필요") return `<td><span class="auth need">🔒 필요</span></td>\n`;
      if (text === "공개") return `<td><span class="auth open">공개</span></td>\n`;
    }
    return base.tablecell.call(this, cell);
  };

  // 향미 계열 표(hue·C·L 열)는 값을 그대로 색으로 보여준다 — 숫자 셋을 머릿속에서 합성하지 않아도 되게.
  renderer.table = function (token) {
    const heads = token.header.map(plain);
    const hue = heads.indexOf("hue");
    const c = heads.indexOf("C");
    const l = heads.indexOf("L");
    if (hue < 0 || c < 0 || l < 0) return `<div class="table-wrap">${base.table.call(this, token)}</div>`;

    let head = "";
    for (const cell of token.header) head += this.tablecell(cell);
    let body = "";
    for (const row of token.rows) {
      let cells = "";
      row.forEach((cell, i) => {
        let html = this.tablecell(cell);
        if (i === 0) {
          const color = `oklch(${plain(row[l])} ${plain(row[c])} ${plain(row[hue])})`;
          html = html.replace(/^<td>/, `<td><span class="swatch" style="background:${color}"></span>`);
        }
        cells += html;
      });
      body += this.tablerow({ text: cells });
    }
    return `<div class="table-wrap"><table>\n<thead>\n${this.tablerow({ text: head })}</thead>\n<tbody>${body}</tbody></table>\n</div>`;
  };

  const html = marked.parse(md, { renderer, gfm: true });
  return { html, toc };
}

const CSS = `
:root {
  --bg: #fafaf8; --surface: #fff; --surface-2: #f3f2ee; --ink: #16130f; --sub: #6b655c; --line: #e3e0d9;
  --accent: #e8641c; --accent-soft: color-mix(in oklab, var(--accent) 12%, transparent);
  --code-bg: #f1efea; --radius: 10px; --radius-sm: 7px;
  --sans: "Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Segoe UI", Roboto, "Malgun Gothic", sans-serif;
  --mono: "SF Mono", SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #121110; --surface: #1b1917; --surface-2: #232019; --ink: #ece8e1; --sub: #a39c91; --line: #2e2b26;
    --accent: #f0803f; --code-bg: #26231f;
  }
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; scroll-padding-top: 24px; }
body {
  margin: 0; background: var(--bg); color: var(--ink); font-family: var(--sans); font-size: 15px; line-height: 1.65;
  word-break: keep-all; overflow-wrap: break-word;
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
code, pre, kbd { font-family: var(--mono); }
code { background: var(--code-bg); border-radius: 4px; padding: .1em .35em; font-size: .88em; }
pre { background: var(--code-bg); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 12px 14px; overflow-x: auto; font-size: 13px; line-height: 1.55; }
pre code { background: none; padding: 0; font-size: inherit; }
blockquote { margin: 16px 0; padding: 10px 16px; border-left: 3px solid var(--accent); background: var(--surface-2); border-radius: 0 var(--radius-sm) var(--radius-sm) 0; color: var(--ink); }
blockquote p { margin: .4em 0; }
hr { border: 0; border-top: 1px solid var(--line); margin: 32px 0; }
img { max-width: 100%; }

.page { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 0 40px; max-width: 1240px; margin: 0 auto; padding: 0 24px 80px; }
.top { grid-column: 1 / -1; padding: 40px 0 28px; border-bottom: 1px solid var(--line); margin-bottom: 32px; }
.wordmark { font-family: var(--mono); font-size: 12px; letter-spacing: .14em; text-transform: uppercase; color: var(--sub); }
.top h1 { font-size: 30px; margin: 6px 0 8px; letter-spacing: -.01em; }
.top p { margin: 0; color: var(--sub); max-width: 720px; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-top: 22px; }
.card { display: block; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 14px 16px; color: inherit; transition: border-color .15s ease; }
.card:hover { border-color: var(--accent); text-decoration: none; }
.card .name { font-family: var(--mono); font-weight: 700; font-size: 14px; }
.card .blurb { font-size: 13px; color: var(--sub); margin-top: 6px; line-height: 1.5; }
.badge { display: inline-block; font-family: var(--mono); font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; border: 1px solid var(--line); border-radius: 999px; padding: 2px 8px; color: var(--sub); margin-left: 8px; vertical-align: 2px; }

nav.side { position: sticky; top: 0; align-self: start; max-height: 100vh; overflow-y: auto; padding: 8px 0 40px; font-size: 13px; }
nav.side .group { margin-bottom: 18px; }
nav.side .group > a { display: block; font-family: var(--mono); font-weight: 700; font-size: 12.5px; color: var(--ink); padding: 4px 0; letter-spacing: .04em; }
nav.side ul { list-style: none; margin: 2px 0 0; padding: 0 0 0 10px; border-left: 1px solid var(--line); }
nav.side li a { display: block; padding: 3px 0 3px 8px; color: var(--sub); line-height: 1.4; }
nav.side li.d3 a { padding-left: 20px; font-size: 12px; }
nav.side li a:hover { color: var(--accent); text-decoration: none; }

main { min-width: 0; }
article { margin-bottom: 72px; }
.doc-head { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px 12px; padding: 0 0 12px; border-bottom: 2px solid var(--ink); margin-bottom: 20px; }
.doc-head h1 { font-family: var(--mono); font-size: 22px; margin: 0; }
.doc-head .source { margin-left: auto; font-size: 12.5px; color: var(--sub); }
.doc-head .blurb { flex-basis: 100%; margin: 0; color: var(--sub); font-size: 13.5px; }
article h2 { font-size: 21px; margin: 44px 0 12px; padding-top: 8px; letter-spacing: -.01em; }
article h3 { font-size: 16.5px; margin: 28px 0 8px; }
article h4 { font-size: 14.5px; margin: 20px 0 6px; }
article h2 .anchor, article h3 .anchor, article h4 .anchor { color: var(--line); margin-right: 8px; font-weight: 400; }
article h2:hover .anchor, article h3:hover .anchor, article h4:hover .anchor { color: var(--accent); }
article p, article li { max-width: 78ch; }
article li { margin: .25em 0; }
article ul, article ol { padding-left: 1.4em; }

.table-wrap { overflow-x: auto; margin: 14px 0; border: 1px solid var(--line); border-radius: var(--radius-sm); }
table { border-collapse: collapse; width: 100%; font-size: 13.5px; }
th, td { text-align: left; vertical-align: top; padding: 8px 12px; border-bottom: 1px solid var(--line); }
th { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--sub); font-weight: 600; background: var(--surface-2); white-space: nowrap; }
tr:last-child td { border-bottom: 0; }
td code { white-space: nowrap; }
.method { font-family: var(--mono); font-size: 11px; font-weight: 700; letter-spacing: .04em; border-radius: 4px; padding: 2px 7px; color: #fff; background: var(--sub); }
.method.get { background: #2f7d5a; }
.method.post { background: #2a6db5; }
.method.put, .method.patch { background: #b07a12; }
.method.delete { background: #b43a2f; }
.auth { font-size: 12.5px; white-space: nowrap; }
.auth.need { font-weight: 600; }
.auth.open { color: var(--sub); }
.swatch { display: inline-block; width: 14px; height: 14px; border-radius: 999px; border: 1px solid color-mix(in oklab, var(--ink) 25%, transparent); vertical-align: -2px; margin-right: 8px; }

@media (max-width: 860px) {
  .page { grid-template-columns: 1fr; gap: 0; padding: 0 16px 60px; }
  nav.side { position: static; max-height: none; display: flex; flex-wrap: wrap; gap: 6px 14px; padding: 0 0 24px; }
  nav.side ul { display: none; }
  nav.side .group { margin: 0; }
  .top { padding-top: 28px; }
}
`;

function page(rendered) {
  const cards = DOCS.map(
    (d) =>
      `<a class="card" href="#${d.id}"><span class="name">${d.file}</span><span class="badge">${d.audience}</span><div class="blurb">${d.blurb}</div></a>`,
  ).join("\n");

  const nav = DOCS.map((d, i) => {
    const items = rendered[i].toc
      .map((t) => `<li class="d${t.depth}"><a href="#${t.id}">${t.text}</a></li>`)
      .join("\n");
    return `<div class="group"><a href="#${d.id}">${d.file}</a>${items ? `<ul>\n${items}\n</ul>` : ""}</div>`;
  }).join("\n");

  const articles = DOCS.map(
    (d, i) => `<article id="${d.id}">
<div class="doc-head"><h1>${d.file}</h1><span class="badge">${d.audience}</span><a class="source" href="${d.file}">원본 ${d.file} ↗</a><p class="blurb">${d.blurb}</p></div>
${rendered[i].html}</article>`,
  ).join("\n\n");

  return `<!DOCTYPE html>
<!-- 생성물 — 손으로 고치지 말 것. scripts/gen-how-it-works.mjs가 README.md·CLAUDE.md·DESIGN.md·STRUCTURE.md를 렌더해 만든다 (npm run gen:html). -->
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bean-Hoarder — 문서</title>
<style>${CSS}</style>
</head>
<body>
<div class="page" id="top">
<header class="top">
  <div class="wordmark">Bean-Hoarder</div>
  <h1>문서 한 장</h1>
  <p>저장소의 문서 네 개를 한 페이지로 렌더한 것이다. README는 사람이, 나머지 .md는 주로 에이전트가 읽는다 —
  이 페이지는 그 넷을 사람이 한눈에 훑기 위한 생성물이라 손으로 고치지 않는다.
  문장을 바꾸려면 원본 .md를 고치고 <code>npm run gen:html</code>로 다시 만든다.</p>
  <div class="cards">
${cards}
  </div>
</header>

<nav class="side" aria-label="목차">
${nav}
</nav>

<main>
${articles}
</main>
</div>
</body>
</html>
`;
}

const check = process.argv.includes("--check");
const rendered = DOCS.map(render);
const next = page(rendered);

if (check) {
  if (!existsSync(OUT) || readFileSync(OUT, "utf8") !== next) {
    console.error(`생성 문서가 저장소와 어긋난다: ${OUT}`);
    console.error("`npm run gen:html`을 실행해 갱신하고 함께 커밋할 것.");
    process.exit(1);
  }
  console.log(`gen:html — ${OUT}이 저장소와 일치함`);
} else {
  writeFileSync(OUT, next);
  const headings = rendered.reduce((n, r) => n + r.toc.length, 0);
  console.log(`gen:html — ${OUT} 갱신 (문서 ${DOCS.length}개 · 목차 ${headings}항목)`);
}
