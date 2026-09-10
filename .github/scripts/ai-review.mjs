#!/usr/bin/env node
// GitHub Actions에서 PR 생성·수정 시 Gemini API를 호출해 자동 코드 리뷰를 남기는 스크립트.
//
// 동작 원리:
// 1. GitHub API를 통해 PR 메타데이터와 diff를 가져온다. PR 트리를 함께 fetch해 **diff 밖의 호출부**를
//    긁어 온다 — diff 훅만 보면 "이 함수를 우회하는 다른 경로가 있나"를 확인할 길이 없어, 확인 못 한
//    모델은 지적 대신 칭찬으로 수렴한다.
// 2. CLAUDE.md 원문을 규칙으로 주입한 프롬프트로 Gemini API를 호출한다(모델 동적 선택 · flash 우선).
//    출력은 responseSchema로 강제한 구조화 JSON(판정·요약·강점·채점표·findings)을 받는다.
// 3. findings가 있으면 **검증 패스**를 한 번 더 돈다 — 지적이 가리킨 파일의 전문을 실어 "실제로
//    성립하는가"를 되묻고, 무너진 지적은 버린다. 정밀도를 여기서 확보하는 대신 1차 패스는 기준을
//    낮춰 잡게 한다(재현율↑). 정밀도와 재현율을 한 번의 호출로 동시에 얻으려는 것이 무리였다.
// 4. findings를 **파일·줄에 붙는 인라인 코멘트**로, 요약을 리뷰 본문으로 올린다(PR 리뷰 API).
//    이미 올린 지적은 지문(fingerprint)으로 걸러 다시 올리지 않는다 — 매번 같은 말을 반복하면
//    조치한 지적과 새 지적이 뒤섞여 읽을 수 없게 된다.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const BOT_SIGNATURE = "<!-- ai-pr-review-bot -->";
/** 지적 하나의 지문 — 이미 올린 것을 다시 올리지 않으려고 코멘트 본문에 숨겨 둔다 */
const FINDING_TAG = (sig) => `<!-- ai-finding:${sig} -->`;
const FINDING_TAG_RE = /<!-- ai-finding:([0-9a-f]{12}) -->/g;

/**
 * 지적의 동일성 판단 기준 — 파일·줄·분류.
 *
 * 설명 문구는 넣지 않는다. 같은 문제라도 실행할 때마다 표현이 조금씩 달라지는데, 문구까지 지문에
 * 넣으면 같은 지적이 매번 새것으로 잡혀 걸러지지 않는다. 줄이 바뀌면 다시 올라오는데, 그건 코드가
 * 실제로 움직였다는 뜻이라 다시 보는 편이 맞다.
 */
function fingerprint(f) {
  return createHash("sha1")
    .update(`${f.file || ""}|${f.line ?? ""}|${f.category || ""}`)
    .digest("hex")
    .slice(0, 12);
}

/**
 * diff에서 **오른쪽(변경 후) 파일의 몇 번째 줄이 코멘트를 받을 수 있는지** 뽑는다.
 *
 * 인라인 코멘트는 그 커밋의 diff에 실제로 등장하는 줄에만 달 수 있다. 모델이 짐작한 줄 번호를
 * 그대로 보내면 422가 나는데, 리뷰 API는 **코멘트 하나가 틀리면 리뷰 전체를 거절한다.** 그래서
 * 보내기 전에 여기서 거른다. 추가된 줄(+)만 담는다 — 문맥 줄에도 달 수는 있지만, 이 PR이 바꾸지
 * 않은 자리에 지적을 붙이면 무엇을 고치라는 말인지 흐려진다.
 */
function diffLineMap(diff) {
  const map = new Map();
  let path = null;
  let newLine = 0;
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("diff --git ")) {
      path = (raw.match(/ b\/(.+)$/) || [])[1] || null;
      continue;
    }
    const plus = raw.match(/^\+\+\+ b\/(.+)$/);
    if (plus) {
      path = plus[1];
      continue;
    }
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }
    if (!path) continue;
    if (raw.startsWith("+")) {
      if (!map.has(path)) map.set(path, new Set());
      map.get(path).add(newLine);
      newLine += 1;
    } else if (raw.startsWith(" ")) {
      newLine += 1;
    }
  }
  return map;
}

/**
 * PR 트리를 로컬에 확보한다 — 체크아웃하지 않고 `git grep <tree>`로 읽을 수 있으면 충분하다.
 *
 * 코멘트 트리거(`/gemini review`)일 때 워크플로가 체크아웃하는 것은 PR이 아니라 기본 브랜치다.
 * 그 상태로 호출부를 긁으면 **바뀌기 전 코드**의 호출부가 나와, 미묘하게 틀린 근거를 모델에게
 * 쥐여 주게 된다. 그래서 트리거와 무관하게 PR 트리를 따로 fetch해 그쪽만 본다. 규칙(CLAUDE.md)은
 * 반대로 체크아웃된 기본 브랜치 것을 쓴다 — 심사받는 PR이 자신을 심사할 규칙까지 바꿔 오면 안 된다.
 */
function fetchPrTree(prNumber) {
  // merge 우선 — 병합 후 모습이 곧 리뷰 대상이다. 충돌 중인 PR은 merge ref가 없어 head로 떨어진다.
  for (const ref of [`refs/pull/${prNumber}/merge`, `refs/pull/${prNumber}/head`]) {
    try {
      execFileSync("git", ["fetch", "--depth=1", "--no-tags", "origin", ref], {
        stdio: ["ignore", "ignore", "pipe"],
      });
      return "FETCH_HEAD";
    } catch (_e) {
      // 다음 ref로 — 리뷰는 보조 기능이라 여기서 멈추지 않는다
    }
  }
  console.warn("⚠️ PR 트리를 가져오지 못해 호출부·전문 없이 진행합니다.");
  return null;
}

/** PR 트리에서 파일 하나를 읽는다. 없으면 빈 문자열 — 삭제된 파일을 가리키는 지적도 있다. */
function readFromTree(tree, path) {
  if (!tree) return "";
  try {
    return execFileSync("git", ["show", `${tree}:${path}`], { encoding: "utf8", maxBuffer: 8 << 20 });
  } catch (_e) {
    return "";
  }
}

/**
 * 선언 한 줄에서 심볼 이름을 뽑는 패턴 — **export된 것만.**
 *
 * 모듈 안에서만 쓰이는 이름까지 세어 봤더니 `cur`·`first` 같은 지역 변수가 딸려 나왔고, 그 이름을
 * 저장소 전체에서 찾으니 아무 상관 없는 파일의 같은 이름이 "호출부"로 실렸다. 어차피 외부에서
 * 부를 수 있는 것은 export된 이름뿐이고, 같은 파일 안의 호출부는 아래에서 어차피 걸러 낸다.
 */
const DECL_PATTERNS = [
  /^[+-]\s*export\s+(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/,
  /^[+-]\s*export\s+(?:abstract\s+)?(?:const|let|var|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/,
];
/** `export {` 가 열리는 줄 — 닫는 `}`가 같은 줄에 없으면 다음 줄로 이어진다 */
const EXPORT_OPEN_RE = /^[+-]\s*export\s*\{(.*)$/;

/**
 * 이 PR이 건드린 심볼이 **diff 밖 어디서 쓰이는지** 모은다.
 *
 * 리뷰가 얕아지는 가장 큰 이유가 이것이었다 — 모델이 받는 것은 앞뒤 세 줄이 붙은 훅뿐이라, 바뀐
 * 함수의 다른 호출부가 그 변경을 견디는지 확인할 방법이 아예 없다. 확인할 수 없는 것은 지적으로
 * 쓸 수 없으니 "테스트가 잘 보강되었습니다" 쪽으로 수렴한다. 호출부 목록은 diff에 비해 아주
 * 싸면서(수천 자) 그 사각을 정확히 메운다.
 *
 * **diff에 이미 실린 파일은 뺀다** — 모델이 못 보는 곳만 알려 주는 것이 목적이고, 그래야 목록이
 * 짧게 유지된다.
 */
function callSiteContext(tree, diff, changedFiles) {
  if (!tree) return "";

  const symbols = new Set();
  /** `a, b as c }` 같은 조각에서 이름을 거둔다 — `}` 뒤는 목록이 아니다 */
  const addNames = (segment) => {
    for (const part of segment.split("}")[0].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name && /^[A-Za-z_$][\w$]*$/.test(name)) symbols.add(name);
    }
  };

  // 재수출 목록은 여러 줄로 쓸 수 있어(`export {\n  foo,\n  bar\n}`) 줄 하나만 봐서는 못 잡는다.
  // 열림 상태를 들고 다음 줄로 이어 읽되, **헌크가 바뀌면 상태를 버린다** — 헌크 사이는 이어진
  // 코드가 아니라서, 들고 넘어가면 엉뚱한 줄을 목록의 일부로 읽는다.
  let openList = false;
  for (const line of diff.split("\n")) {
    if (line.startsWith("@@")) {
      openList = false;
      continue;
    }
    if (!/^[+-]/.test(line) || /^(\+\+\+|---)/.test(line)) continue;

    if (openList) {
      addNames(line.slice(1));
      if (line.includes("}")) openList = false;
      continue;
    }
    const open = line.match(EXPORT_OPEN_RE);
    if (open) {
      addNames(open[1]);
      openList = !open[1].includes("}");
      continue;
    }
    for (const re of DECL_PATTERNS) {
      const m = line.match(re);
      if (m) {
        symbols.add(m[1]);
        break;
      }
    }
  }

  const PER_SYMBOL = 8; // 심볼 하나가 목록을 독차지하지 않게
  const TOO_COMMON = 40; // 이보다 많이 걸리면 이 PR의 심볼이 아니라 그냥 흔한 이름이다
  const MAX_CHARS = 12_000;
  const blocks = [];
  let used = 0;
  let truncated = false;

  for (const sym of [...symbols].sort()) {
    if (sym.length < 3) continue; // id·fn 같은 이름은 노이즈만 만든다
    let hits;
    try {
      hits = execFileSync(
        "git",
        ["grep", "-n", "-w", "-F", "--no-color", sym, tree, "--",
         "*.ts", "*.tsx", "*.js", "*.mjs", "*.jsx", "*.css", "*.html", "*.json", "*.sql", "*.md"],
        { encoding: "utf8", maxBuffer: 8 << 20 },
      )
        .split("\n")
        .filter(Boolean);
    } catch (_e) {
      continue; // git grep은 찾은 게 없으면 종료 코드 1로 끝난다 — 실패가 아니다
    }
    if (hits.length > TOO_COMMON) continue;

    const outside = hits
      .map((h) => h.slice(tree.length + 1))
      .filter((h) => !changedFiles.has(h.slice(0, h.indexOf(":"))));
    if (!outside.length) continue;

    // 호출부처럼 보이는 줄을 앞에 둔다. 이 저장소는 주석에 심볼 이름을 자주 적는다(설명을 코드
    // 옆에 두는 문서 원칙 때문이다) — 그대로 자르면 여덟 줄이 전부 주석으로 차고 정작 진짜 호출부가
    // 잘려 나간다. normalizeRoastery로 실제로 그랬다(12곳 중 앞 8곳이 죄다 "…를 따른다" 주석).
    const escaped = sym.replace(/\$/g, "\\$");
    const USE_RE = new RegExp(`\\b${escaped}\\s*[(,;.)\\]]|\\b${escaped}\\s*=[^=]|^import\\b|\\bfrom\\s`);
    const rank = (h) => {
      const body = h.slice(h.indexOf(":", h.indexOf(":") + 1) + 1).trim();
      // .md·.css는 그 심볼을 부를 수 없다 — 걸렸다면 전부 산문이거나 우연이다
      if (/\.(md|css):/.test(h)) return 2;
      if (/^(\*|\/\/|\/\*|#|<!--)/.test(body)) return 2; // 주석
      return USE_RE.test(body) ? 0 : 1;
    };
    const shown = outside
      .map((h, i) => [rank(h), i, h]) // i를 함께 들어 동점일 때 원래 순서를 지킨다
      .sort((a, b) => a[0] - b[0] || a[1] - b[1])
      .slice(0, PER_SYMBOL)
      .map(([, , h]) => h);
    const more = outside.length > shown.length ? ` (외부 참조 ${outside.length}곳 중 ${shown.length}곳)` : "";
    const block = `#### ${sym}${more}\n${shown.join("\n")}`;
    if (used + block.length > MAX_CHARS) {
      truncated = true;
      break;
    }
    blocks.push(block);
    used += block.length;
  }

  if (!blocks.length) return "";
  return `${blocks.join("\n\n")}${truncated ? "\n\n(이하 생략)" : ""}`;
}

/**
 * ListModels가 준 이름들을 **좋은 순서로** 세운다.
 *
 * 예전에는 선호 모델을 배열에 손으로 적어 뒀는데, 손으로 적은 목록은 곧 상한이 된다 —
 * gemini-3.9-flash가 나와도 목록이 모르니 3.8을 계속 고르고, 고르는 쪽도 부르는 쪽도 아무 문제가
 * 없어 보여서 아무도 눈치채지 못한다. 이름에서 세대 번호를 뽑아 정렬하면 새 모델이 나오는 대로
 * 저절로 따라간다.
 *
 * 계열 순서는 flash → pro → flash-lite다. pro가 더 좋지만 이 키로는 매번 429라 앞에 두면 왕복만
 * 버리고(2026-09-03 실측: 3.1-pro-preview 429 → pro-latest 429 → …), flash-lite는 리뷰 품질이
 * 눈에 띄게 떨어져 맨 뒤에 둔다. 티어가 바뀌면 이 순서만 손대면 된다.
 */
function rankModels(available) {
  // 코드 리뷰에 쓸 수 없는 계열 — 이미지·음성·리서치·로봇·컴퓨터 사용 등.
  // gemini- 접두가 아닌 것(gemma, lyria, nano-banana, antigravity, deep-research)은 아래에서 함께 걸린다.
  const NOT_FOR_REVIEW =
    /image|vision|tts|transcribe|omni|robotics|computer-use|embedding|customtools|native-audio|live/;
  const TIERS = [
    (n) => n.includes("flash") && !n.includes("flash-lite"),
    (n) => n.includes("pro"),
    (n) => n.includes("flash-lite"),
  ];

  return available
    .filter((n) => n.startsWith("gemini-") && !NOT_FOR_REVIEW.test(n))
    .map((n) => {
      const tier = TIERS.findIndex((t) => t(n));
      const gen = n.match(/^gemini-(\d+(?:\.\d+)?)-/);
      return {
        name: n,
        tier: tier < 0 ? TIERS.length : tier,
        // 번호가 없는 것은 별칭(gemini-flash-latest)이다. 계열 안에서 맨 뒤에 둔다 — 이름 규칙이
        // 바뀌어 번호를 못 읽는 날에도 리뷰가 돌게 하는 안전망이지, 평소에 고를 것은 아니다.
        gen: gen ? Number(gen[1]) : -1,
        preview: n.includes("preview") ? 1 : 0,
      };
    })
    .sort((a, b) => a.tier - b.tier || b.gen - a.gen || a.preview - b.preview)
    .map((m) => m.name);
}

/**
 * ListModels를 부르지 못했을 때만 쓰는 목록.
 *
 * 여기 이름들은 **낡는다** — 그래서 정상 경로에서는 쓰이지 않는다. 목록 조회가 실패한 날에도
 * 리뷰가 돌게 하려는 것뿐이다.
 */
const FALLBACK_MODELS = ["gemini-flash-latest", "gemini-3.8-flash", "gemini-flash-lite-latest"];

/**
 * 프로젝트 규칙 — CLAUDE.md를 그대로 싣는다.
 *
 * 예전에는 규칙 네 줄을 프롬프트에 손으로 적어 뒀는데, 그 사이 CLAUDE.md가 자라면서 어긋났다
 * (마이그레이션 파일이 경보라는 것, app.test.ts가 계약 문서라는 것, wallet-card.ts와 deck.css가
 * 한 벌이라는 것이 전부 빠져 있었다). 원본을 실으면 규칙이 바뀔 때 자동으로 따라온다.
 * 읽지 못하면 리뷰를 멈추지 않고 최소 규칙으로 계속한다 — 리뷰는 보조 기능이다.
 */
function projectRules() {
  try {
    return readFileSync("CLAUDE.md", "utf8");
  } catch (_e) {
    console.warn("⚠️ CLAUDE.md를 읽지 못해 최소 규칙으로 진행합니다.");
    return [
      "- Cloudflare Pages의 암묵적 SPA 폴백을 유지해야 함 (404.html 생성 금지 — 인쇄된 QR이 죽음).",
      "- 도메인 규칙은 packages/의 단일 소스(SSOT)를 사용해야 함.",
      "- innerHTML 사용 시 escapeHtml 철저 검증.",
      "- 웹 번들에 불필요한 서드파티 유입 금지, 무거운 모듈은 지연 로딩.",
    ].join("\n");
  }
}

// 심각도는 코드랩(Antigravity)의 구조화 findings에서 따온 축 — 렌더 정렬·집계에 쓴다.
const SEV_ORDER = ["critical", "high", "medium", "low", "nit"];
const SEV_LABEL = {
  critical: "🔴 CRITICAL",
  high: "🟠 HIGH",
  medium: "🟡 MEDIUM",
  low: "🔵 LOW",
  nit: "⚪ NIT",
};
const VERDICT_LABEL = {
  APPROVE: "✅ 승인 권고",
  COMMENT: "💬 참고 의견",
  REQUEST_CHANGES: "🛑 보완 요청",
};

/**
 * 항목별로 판정을 강제하는 채점표 — 이 저장소가 **실제로 깨졌던 방식**만 적는다.
 *
 * "잠재 버그·규칙 위반을 찾아라"처럼 열린 주문은 열린 답을 부른다. 모델은 확신이 서는 것만 적고,
 * 훅만 봐서는 확신이 잘 안 서니 빈손으로 돌아온다. 항목을 세어 답하게 하면 **"확인해 봤더니
 * 해당 없음"과 "안 봤음"이 갈라진다** — UNKNOWN이 남으면 그건 그것대로 읽을 가치가 있는 신호다.
 *
 * 규칙 원문은 CLAUDE.md가 통째로 실리므로 여기엔 근거를 다시 적지 않고 확인할 것만 적는다.
 */
const CHECKLIST = [
  "404.html을 만들거나 Pages의 index.html 폴백을 무력화하지 않았는가",
  "KEY 체계({유저코드4}{연도2}-{순번3})와 bnhd.pages.dev 도메인을 건드리지 않았는가",
  "기존 API의 요청/응답 형태·상태 코드·메시지를 바꾸지 않았는가 (app.test.ts가 계약 문서)",
  "@bnhd/schema를 조회·덱 경로에서 인덱스로 import해 zod를 번들에 끌어들이지 않았는가",
  "setState(updater) 안에서 값을 채우고 호출 직후 그 값을 읽는 패턴이 없는가",
  "innerHTML·insertAdjacentHTML에 들어가는 값이 전부 escapeHtml을 지나는가",
  "D1 스키마를 바꿨다면 새 migrate_*.sql과 db/schema.sql에 함께 반영했는가",
  "데모(/demo·DEMO 접두 KEY)가 demo-beans.json 밖으로 나가 D1을 타지 않는가",
  "덱 카드를 고쳤다면 wallet-card.ts(마크업)와 deck.css(스타일)가 함께 맞는가",
  "필드를 추가했다면 packages/schema의 BEAN_FIELDS 단일 소스를 지났는가",
  "헤드라인 대문자화를 건드렸다면 덱 CSS·조회 CSS·라벨 SVG 세 곳이 함께 맞는가",
  "diff 밖 호출부(아래 목록)가 이 변경을 견디는가 — 시그니처·반환형·정규화 시점 변화",
];

const CHECK_STATUS = ["PASS", "FAIL", "NA", "UNKNOWN"];
const CHECK_LABEL = { FAIL: "❌ 위반", UNKNOWN: "❓ 확인 불가", PASS: "✅", NA: "—" };

// Gemini 구조화 출력 스키마 (OpenAPI 서브셋). 자유 텍스트 대신 이 모양을 강제해 심각도·위치를 얻는다.
const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    verdict: { type: "string", enum: ["APPROVE", "COMMENT", "REQUEST_CHANGES"] },
    strengths: { type: "array", items: { type: "string" } },
    checklist: {
      type: "array",
      items: {
        type: "object",
        properties: {
          item: { type: "string" },
          status: { type: "string", enum: CHECK_STATUS },
          note: { type: "string", nullable: true },
        },
        required: ["item", "status"],
        propertyOrdering: ["item", "status", "note"],
      },
    },
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          file: { type: "string" },
          line: { type: "integer", nullable: true },
          severity: { type: "string", enum: SEV_ORDER },
          category: { type: "string" },
          description: { type: "string" },
          suggestion: { type: "string", nullable: true },
        },
        required: ["file", "severity", "category", "description"],
        propertyOrdering: ["file", "line", "severity", "category", "description", "suggestion"],
      },
    },
  },
  required: ["summary", "checklist", "verdict", "findings"],
  // ⚠️ 순서가 곧 생성 순서다. verdict를 findings보다 먼저 두면 모델이 **문제를 열거하기 전에**
  // 판정을 확정하고, 그다음 findings가 이미 써 버린 APPROVE에 맞춰 눌린다. findings를 앞에 둬야
  // "무엇을 찾았는가 → 그래서 어떤 판정인가" 순으로 쓴다. 채점표는 그보다도 앞이다 — 항목을
  // 하나씩 짚고 나면 findings에 쓸 거리가 이미 손에 잡혀 있다.
  propertyOrdering: ["summary", "checklist", "findings", "strengths", "verdict"],
};

/**
 * 검증 패스 스키마 — 1차 findings를 하나씩 다시 판정한다.
 *
 * 인덱스로 되받는 이유는 모델이 지적 본문을 다시 쓰게 하지 않기 위해서다. 다시 쓰게 하면 문구가
 * 흔들려 지문이 달라지고, 이미 올린 지적을 걸러 내는 장치가 통째로 헛돈다.
 */
const VERIFY_SCHEMA = {
  type: "object",
  properties: {
    checks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          verdict: { type: "string", enum: ["CONFIRMED", "PLAUSIBLE", "REFUTED"] },
          reason: { type: "string" },
          line: { type: "integer", nullable: true },
          severity: { type: "string", enum: SEV_ORDER, nullable: true },
        },
        required: ["index", "verdict", "reason"],
        propertyOrdering: ["index", "reason", "verdict", "line", "severity"],
      },
    },
  },
  required: ["checks"],
};

// 검증 패스가 매긴 등급. REFUTED는 여기 없다 — 아예 버려서 코멘트가 되지 않는다.
const VERIFY_LABEL = { CONFIRMED: "🔎 확인됨", PLAUSIBLE: "🤔 가능성" };

/** 인라인 코멘트 본문 — 심각도 배지 + 설명 + 제안. 끝에 지문을 숨겨 다음 실행이 알아본다. */
function renderFinding(f) {
  const badge = VERIFY_LABEL[f.verifiedAs];
  const out = [
    `**${SEV_LABEL[f.severity] || f.severity || ""}** · _${f.category || "review"}_${badge ? ` · ${badge}` : ""}`,
  ];
  out.push(f.description || "");
  if (f.suggestion) out.push(`\n> 제안: ${f.suggestion}`);
  // 검증 근거는 읽는 사람이 판단을 뒤집을 수 있게 남긴다 — 봇의 판정을 믿으라는 게 아니다.
  if (f.verifiedWhy) out.push(`\n> 검증: ${f.verifiedWhy}`);
  out.push(`\n${FINDING_TAG(fingerprint(f))}`);
  return out.join("\n");
}

/**
 * 리뷰 본문 — 요약·판정·집계, 그리고 줄에 붙이지 못한 지적.
 *
 * 지적 대부분은 인라인으로 가므로 본문은 짧다. 여기 남는 것은 (1) 파일 전체에 걸린 이야기나
 * 모델이 이 PR의 diff에 없는 줄을 짚어 인라인으로 달 수 없던 것, (2) 이번에 새로 나온 게 없다는 사실.
 */
function renderBody(review, { inlineCount, unanchored, dupCount, refutedCount, skippedFiles }) {
  const findings = Array.isArray(review.findings) ? review.findings : [];
  const tally = SEV_ORDER.map((sev) => {
    const n = findings.filter((f) => f.severity === sev).length;
    return n ? `${SEV_LABEL[sev]} ${n}` : null;
  }).filter(Boolean);

  const out = [`**판정: ${VERDICT_LABEL[review.verdict] || review.verdict || "—"}**`];
  if (tally.length) out.push(tally.join(" · "));
  if (review.summary) out.push(`\n> ${review.summary}`);

  // 채점표는 걸린 것만 싣는다. 통과 항목까지 다 적으면 매 리뷰에 같은 열두 줄이 붙어, 정작 걸린
  // 한 줄이 그 속에 묻힌다. 대신 **몇 항목을 봤는지는 세어 남긴다** — 안 본 것과 통과한 것은 다르다.
  const checks = Array.isArray(review.checklist) ? review.checklist : [];
  const flagged = checks.filter((c) => c.status === "FAIL" || c.status === "UNKNOWN");
  if (checks.length) {
    const passed = checks.filter((c) => c.status === "PASS").length;
    const na = checks.filter((c) => c.status === "NA").length;
    out.push(`\n#### 규칙 점검 — ${checks.length}항목 (통과 ${passed} · 해당없음 ${na} · 걸림 ${flagged.length})`);
    if (flagged.length) {
      for (const c of flagged) {
        out.push(`- ${CHECK_LABEL[c.status] || c.status} ${c.item}${c.note ? `\n  ${c.note}` : ""}`);
      }
    } else {
      out.push("걸린 항목 없음.");
    }
  }

  if (Array.isArray(review.strengths) && review.strengths.length) {
    out.push("\n#### 잘된 점");
    out.push(review.strengths.map((x) => `- ${x}`).join("\n"));
  }

  out.push("\n#### 개선 제안 및 주의사항");
  const bits = [];
  if (inlineCount) bits.push(`새 지적 **${inlineCount}건**을 해당 줄에 코멘트로 달았습니다`);
  // 이미 올린 것을 다시 올리지 않는다는 사실은 밝혀 둔다 — 안 그러면 "왜 아까 그 지적이 없지?"가 된다
  if (dupCount) bits.push(`이미 올린 ${dupCount}건은 생략했습니다`);
  // 검증에서 무너진 지적도 세어 둔다. 1차 패스가 기준을 낮춰 잡는 대신 여기서 걸러 낸다는 사실이
  // 보여야, 지적이 적게 올라온 것이 "안 봤다"가 아니라 "걸러졌다"로 읽힌다.
  if (refutedCount) bits.push(`검증에서 성립하지 않은 ${refutedCount}건은 버렸습니다`);
  if (bits.length) out.push(`${bits.join(" · ")}.`);
  else if (!unanchored.length) out.push("이번 실행에서 새로 발견한 것은 없습니다.");

  if (unanchored.length) {
    out.push("\n줄에 붙이지 못한 지적 (이 PR의 diff 밖이거나 파일 전체에 걸린 것):");
    for (const f of unanchored) {
      const loc = f.line != null ? `\`${f.file}:${f.line}\`` : `\`${f.file || "?"}\``;
      const badge = VERIFY_LABEL[f.verifiedAs];
      out.push(
        `\n**${SEV_LABEL[f.severity] || f.severity || ""}** ${loc} · _${f.category || "review"}_${badge ? ` · ${badge}` : ""}\n${f.description || ""}`,
      );
      if (f.suggestion) out.push(`> 제안: ${f.suggestion}`);
      if (f.verifiedWhy) out.push(`> 검증: ${f.verifiedWhy}`);
      out.push(FINDING_TAG(fingerprint(f)));
    }
  }

  if (skippedFiles.length) {
    out.push(`\n> ⚠️ 토큰 한도로 **검토하지 못한 파일**: ${skippedFiles.join(", ")}`);
  }
  return out.join("\n");
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log("ℹ️ GEMINI_API_KEY가 설정되지 않아 자동 리뷰를 건너뜁니다.");
    return;
  }

  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    console.error("❌ GITHUB_TOKEN이 필요합니다.");
    process.exit(1);
  }

  const repo = process.env.GITHUB_REPOSITORY; // "owner/repo"
  const prNumber = process.env.PR_NUMBER;
  if (!repo || !prNumber) {
    console.error("❌ GITHUB_REPOSITORY와 PR_NUMBER 환경 변수가 필요합니다.");
    process.exit(1);
  }

  console.log(`🔍 PR #${prNumber} (${repo}) 리뷰 준비 중...`);

  /** GitHub API 호출 — 헤더가 매번 같아 한 곳에 모은다. */
  const gh = (url, init = {}) =>
    fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "bean-hoarder-ai-reviewer",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers || {}),
      },
    });

  // 부른 코멘트에 👀를 달아 "접수됨"을 먼저 알린다. 리뷰 자체는 몇 분 걸리는데 그동안 아무 신호가
  // 없으면 명령이 먹었는지 알 수 없다. 실패해도 리뷰는 계속한다 — 어디까지나 신호일 뿐이다.
  const triggerCommentId = process.env.TRIGGER_COMMENT_ID;
  if (triggerCommentId) {
    const r = await gh(`https://api.github.com/repos/${repo}/issues/comments/${triggerCommentId}/reactions`, {
      method: "POST",
      body: JSON.stringify({ content: "eyes" }),
    });
    console.log(r.ok ? "👀 호출 코멘트에 반응을 남겼습니다." : `⚠️ 반응 남기기 실패(${r.status}) — 리뷰는 계속합니다.`);
  }

  // 1. PR 메타데이터 및 diff 수집
  const prRes = await gh(`https://api.github.com/repos/${repo}/pulls/${prNumber}`);
  if (!prRes.ok) {
    throw new Error(`PR 메타데이터 조회 실패: ${prRes.status} ${await prRes.text()}`);
  }
  const prData = await prRes.json();
  // 인라인 코멘트는 특정 커밋의 diff에 붙는다 — 리뷰를 올리는 시점의 head를 기준으로 삼는다.
  const headSha = prData.head?.sha || "";

  const diffRes = await gh(`https://api.github.com/repos/${repo}/pulls/${prNumber}`, {
    headers: { Accept: "application/vnd.github.v3.diff" },
  });
  if (!diffRes.ok) {
    throw new Error(`PR diff 조회 실패: ${diffRes.status} ${await diffRes.text()}`);
  }
  let diff = await diffRes.text();

  // lockfile, 거대 삭제 청크 등 불필요한 diff 제외 (무료 티어 토큰 한도 보호)
  const chunks = diff
    .split(/^diff --git /m)
    .filter((chunk) => {
      if (!chunk) return false;
      const header = chunk.split("\n")[0] || "";
      return (
        !header.includes("package-lock.json") &&
        !header.includes("pnpm-lock.yaml") &&
        !header.includes("yarn.lock") &&
        !header.includes("vendor/")
      );
    })
    // split이 떼어낸 "diff --git " 접두를 각 청크에 도로 붙인다 — 첫 파일도 접두를 잃지 않도록.
    .map((chunk) => `diff --git ${chunk}`);

  // 파일 단위로 담는다. 예전에는 이어 붙인 문자열을 25,000자에서 통째로 잘랐는데, 그 값이 이
  // 저장소의 큰 PR(45파일·diff 210KB)에서 **전체의 11%**만 남겼다. 모델은 앞쪽 파일 다섯 개만 보고도
  // PR 설명을 근거로 나머지를 아는 듯이 평했다 — 얕은 리뷰의 원인은 프롬프트가 아니라 입력이었다.
  // 250,000자면 이 저장소의 역대 최대 PR도 통째로 들어간다(≈7만 토큰).
  const MAX_DIFF_CHARS = 250_000;
  const fileOf = (chunk) => (chunk.match(/^diff --git a\/(\S+)/) || [])[1] || "?";
  let cleanDiff = "";
  const skipped = [];
  for (const chunk of chunks) {
    // 중간에서 끊지 않는다 — 반쪽짜리 파일은 오히려 잘못된 판단을 부른다
    if (cleanDiff.length + chunk.length > MAX_DIFF_CHARS) skipped.push(fileOf(chunk));
    else cleanDiff += chunk;
  }
  // 빠진 것이 있으면 모델에게 알린다. 안 알리면 "안 본 파일"을 본 것처럼 평하게 된다.
  if (skipped.length) {
    cleanDiff += `\n\n...(토큰 한도로 diff에서 제외된 파일 — 아래 파일은 검토하지 못했다고 밝힐 것: ${skipped.join(", ")})...`;
  }
  console.log(`📏 diff ${cleanDiff.length}자 전달${skipped.length ? ` (제외 ${skipped.length}개 파일)` : " (전량)"}`);

  // 1-b. diff 밖 호출부 — 모델이 못 보는 곳만 모은다
  const changedFiles = new Set([...diff.matchAll(/^\+\+\+ b\/(.+)$/gm)].map((m) => m[1]));
  const prTree = fetchPrTree(prNumber);
  const callSites = callSiteContext(prTree, diff, changedFiles);
  console.log(
    callSites ? `🔗 diff 밖 호출부 ${callSites.length}자 첨부` : "🔗 diff 밖 호출부: 없음",
  );

  // 2. 사용할 Gemini 모델 결정 (ListModels API로 지원 모델 동적 탐색)
  console.log("🤖 사용할 Gemini 모델 확인 중...");
  let ranked = [];
  try {
    // 키는 URL 쿼리(?key=) 대신 헤더로 보낸다 — URL이 에러 텍스트·프록시 로그로 새지 않도록.
    const listRes = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
      headers: { "x-goog-api-key": apiKey, "User-Agent": "bean-hoarder-ai-reviewer" },
    });
    if (listRes.ok) {
      const listData = await listRes.json();
      const available = (listData.models || [])
        .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m) => m.name.replace(/^models\//, ""));
      ranked = rankModels(available);
      // 원본 목록은 마흔 줄이라 로그에서 읽히지 않는다. 실제로 쓸 순서만 남긴다.
      console.log(`📋 후보 ${available.length}개 중 리뷰용 ${ranked.length}개: ${ranked.join(" > ")}`);
    } else {
      console.warn(`⚠️ 모델 목록 조회 실패(${listRes.status}) — 고정 목록으로 진행합니다.`);
    }
  } catch (e) {
    console.warn("⚠️ 모델 목록 조회 실패, 고정 목록으로 진행합니다:", e);
  }
  if (!ranked.length) ranked = FALLBACK_MODELS;

  // GEMINI_MODEL이 있으면 그것을 먼저 쓴다 — 특정 모델을 못박아 재현해야 할 때의 손잡이다.
  const pinned = process.env.GEMINI_MODEL;
  // 사슬을 여섯으로 자른다. 키가 말라 429가 이어질 때 끝까지 내려가 봐야 답은 같고,
  // 그 왕복이 리뷰 등록만 늦춘다(검증 패스에서 실측 8회 낭비).
  const modelsToTry = [...new Set([pinned, ...ranked].filter(Boolean))].slice(0, 6);
  let targetModel = modelsToTry[0];
  console.log(`🎯 선택된 모델: ${targetModel}${pinned ? " (GEMINI_MODEL 고정)" : ""}`);

  console.log("🤖 Gemini API에 코드 리뷰 요청 중...");
  const prompt = `당신은 Bean-Hoarder 프로젝트의 시니어 풀스택 코드 리뷰어입니다.
제출된 Pull Request의 제목, 설명, git diff를 분석하고 건설적이고 명확한 한국어 코드 리뷰를 작성해 주세요.

## 프로젝트 규칙 (CLAUDE.md 원문 — 이 저장소의 금지 사항과 함정이 전부 여기 있다)
${projectRules()}

## PR 정보
- PR 번호: #${prNumber}
- PR 제목: ${prData.title}
- PR 작성자: @${prData.user.login}
- PR 설명:
${prData.body || "(설명 없음)"}

## Git Diff
\`\`\`diff
${cleanDiff}
\`\`\`
${
  callSites
    ? `
## diff 밖에서 이 PR의 심볼을 참조하는 곳
아래는 이 PR이 선언을 건드린 심볼들을 **변경되지 않은 파일에서** 검색한 결과다(파일:줄:내용).
diff에는 안 나오지만 이 변경의 영향을 받는 자리이므로, 시그니처·반환형·정규화 시점이 바뀐 심볼은
여기 나온 호출부가 그 변화를 견디는지 반드시 따져 본다. 목록에 없다고 호출부가 없는 것은 아니다
(검색은 이름 기준이라 재수출·동적 접근은 놓친다).

${callSites}
`
    : ""
}
## 출력 (JSON 스키마로 강제됨 — 자유 텍스트가 아니라 지정된 필드를 채운다)
- summary: PR이 해결하는 문제와 변경 핵심 (1~3문장)
- checklist: **아래 항목을 하나도 빼지 말고 순서대로** 판정한다. item은 항목 문구를 그대로 옮기고,
  status는 PASS(확인했고 문제없음) / FAIL(위반) / NA(이 PR과 무관) / UNKNOWN(주어진 정보로는 확인 불가),
  note는 FAIL·UNKNOWN일 때 그 이유를 한 줄로. **NA와 UNKNOWN을 구별한다** — 무관한 것과 못 본 것은 다르다.
${CHECKLIST.map((c, i) => `    ${i + 1}. ${c}`).join("\n")}
- findings: 잠재 버그·보안 취약점·프로젝트 규칙 위반·엣지 케이스. 없으면 빈 배열. 각 항목:
    - file: 파일 경로 (diff에 나온 경로 그대로)
    - line: 관련 라인 번호 (모르면 null)
    - severity: critical / high / medium / low / nit
    - category: 예) correctness, security, ssot, bundle-size, xss, routing, test
    - description: 무엇이 왜 문제인지 한국어로. **어떤 입력·상태에서 무엇이 잘못되는지**를 적는다
      ("~할 수 있습니다" 같은 막연한 우려가 아니라 재현 경로를 짚는다)
    - suggestion: 구체적 수정 제안 (없으면 null)
- strengths: 최대 3개. 구조 개선·성능·테스트 보강 등 (없으면 빈 배열)
- verdict: APPROVE(문제 없음) / COMMENT(참고 의견) / REQUEST_CHANGES(보완 필요) 중 하나

## 리뷰 태도
- **의심스러우면 적는다.** 이 리뷰에는 뒤이어 별도의 검증 단계가 붙어, 여기서 적은 지적을 파일 전문과
  대조해 성립하지 않는 것을 버린다. 그러니 "확신이 서지 않아서 안 적는" 선택을 하지 않는다 —
  걸러 내는 일은 다음 단계가 한다. 다만 근거 없이 지어내지는 않는다(적을 때 재현 경로를 함께 적으면
  지어낸 것은 스스로 걸러진다).
- **diff에 실제로 있는 코드만 근거로 삼는다.** PR 설명은 작성자의 주장일 뿐이므로, 설명이 그렇다고
  해서 그렇게 되었다고 적지 않는다. 위에 "제외된 파일" 목록이 있으면 그 파일은 검토하지 못했다고 밝힌다.
- **strengths는 diff에서 확인한 것만 적는다.** 확인할 수 없으면 비운다 — 근거 없는 칭찬은 리뷰를
  못 믿게 만든다. 칭찬을 채우는 것은 이 리뷰의 목적이 아니다.
- checklist와 findings를 먼저 채우고, 그 결과를 보고 verdict를 정한다. **checklist에 FAIL이나
  UNKNOWN이 하나라도 있으면 APPROVE를 쓰지 않는다** — 못 본 것을 통과로 적는 순간 이 리뷰는 무의미해진다.
- 특히 위 규칙 문서의 "절대 바꾸지 말 것"·"걸려 넘어지기 쉬운 것"에 걸리는 변경이 있는지 본다.
- 테스트 파일도 코드다. 새 테스트가 **실제로 그 불변식을 잡는지**, 통과만 하는 형태는 아닌지 본다.

## 출력 언어
분석과 추론은 영어로 해도 좋다 — 코드를 따지는 일은 그쪽이 편하면 그렇게 한다. 다만 **출력 JSON에
담기는 모든 문자열(summary·strengths·description·suggestion)은 한국어로 쓴다.** 그 값이 그대로 PR
코멘트가 되어 사람이 읽는다. 코드 식별자·파일 경로·API 이름·원문 에러 메시지는 번역하지 않고 그대로 둔다.
문체는 친절하고 전문적으로.`;

  // 사고 예산 — 모델에게 "더 오래 생각하라"고 말할 수 있는 유일한 손잡이다. 필드 이름이 세대마다
  // 달라(3.x는 thinkingLevel, 2.5 계열은 thinkingConfig.thinkingBudget) 어느 쪽이 먹는지 미리 알 수
  // 없는데, 모르는 필드를 보내면 400으로 거절당한다. 그래서 **떠보고 거절당하면 한 단계 내린다.**
  // 한 번 정해지면 그 실행 내내 그 형태를 쓴다 — 호출마다 왕복을 버리지 않도록.
  const THINKING_VARIANTS = [
    // 2026-09-09 실측: 이 키의 gemini-3.8-flash는 thinkingLevel을 400으로 거절하고 thinkingConfig를
    // 받았다. 먹는 쪽을 앞에 둔다 — 안 그러면 매 실행이 거절 왕복 하나를 그냥 버린다.
    { thinkingConfig: { thinkingBudget: 8192 } },
    { thinkingLevel: "high" },
    {}, // 사고 예산을 받지 않는 모델
  ];
  let thinkingIdx = 0;

  /**
   * Gemini 호출 한 번 — 모델 폴백·5xx 재시도·사고 예산 하향을 한곳에 모은다.
   *
   * 실패해도 던지지 않고 null을 돌려준다. 검증 패스는 실패해도 1차 리뷰를 그대로 올려야 하므로,
   * "부르지 못했다"를 예외가 아니라 값으로 다뤄야 부르는 쪽이 판단할 수 있다.
   */
  async function askGemini(text, schema, { label, models }) {
    let lastError = null;
    for (const model of models) {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      // 5xx는 일시적 과부하라 한 번은 다시 묻는다 — 2026-09-03에 gemini-3.7-flash가 503 하나로 밀려
      // 한 단계 아래 모델이 리뷰를 썼다. 429(쿼터)·404(없는 모델)는 곧바로 다시 물어도 같은 답이라
      // 재시도하지 않고 다음 후보로 넘어간다.
      let retried5xx = false;
      for (;;) {
        console.log(`🤖 ${label} — ${model} 호출 중...`);
        const res = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            contents: [{ parts: [{ text }] }],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: "application/json",
              responseSchema: schema,
              ...THINKING_VARIANTS[thinkingIdx],
            },
          }),
        });

        if (res.ok) {
          console.log(`✅ ${model} 응답을 받았습니다 (${label}).`);
          return { res, model };
        }
        const errText = await res.text();
        lastError = `${res.status} ${errText}`;
        // 400이면서 아직 내려갈 형식이 남았다면 사고 예산 필드부터 의심한다 — 같은 모델로 다시.
        if (res.status === 400 && thinkingIdx < THINKING_VARIANTS.length - 1) {
          thinkingIdx += 1;
          console.warn(`⚠️ 사고 예산 형식이 거절돼(400) 낮춥니다: ${JSON.stringify(THINKING_VARIANTS[thinkingIdx])}`);
          continue;
        }
        console.warn(`⚠️ 모델 ${model} 실패 (${res.status}): ${errText}`);
        if (res.status >= 500 && !retried5xx) {
          retried5xx = true;
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        break; // 다음 모델로
      }
    }
    return { res: null, model: null, error: lastError };
  }

  /** 구조화 응답 본문을 꺼낸다 — 스키마가 깨진 응답(구형 모델 등)은 null. */
  const textOf = (data) => data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

  const first = await askGemini(prompt, REVIEW_SCHEMA, { label: "1차 리뷰", models: modelsToTry });
  if (!first.res) {
    throw new Error(`모든 Gemini 모델 호출 실패. 마지막 오류: ${first.error}`);
  }
  targetModel = first.model;

  const reviewText = textOf(await first.res.json());
  if (!reviewText) {
    throw new Error("Gemini로부터 응답 텍스트를 받지 못했습니다.");
  }

  // responseSchema로 강제한 JSON을 파싱한다. 스키마가 깨진 응답(구형 모델 등)은 원문 그대로 싣는다.
  let review = null;
  try {
    review = JSON.parse(reviewText);
  } catch (_e) {
    console.warn("⚠️ 구조화 응답 파싱 실패 — 원문을 그대로 싣습니다.");
  }

  // ── 2-b. 검증 패스 ─────────────────────────────────────────────
  // 1차 패스에게 "의심스러우면 적어라"고 시킨 대가를 여기서 치른다. 지적이 가리킨 파일의 **전문**을
  // 실어 하나씩 되묻고, 성립하지 않는 것을 버린다. 훅만 보고는 확신할 수 없던 것도 파일 전체를 놓고
  // 보면 대개 결판난다 — 재현율은 1차에서, 정밀도는 여기서 얻는다. 한 번의 호출로 둘 다 얻으려던
  // 것이 무리였다(모델이 확신 없는 것을 안 적으니 늘 빈손이었다).
  //
  // 부르지 못하면 1차 결과를 그대로 쓴다. 검증은 리뷰를 좋게 만드는 장치이지 리뷰의 전제가 아니다.
  // 중복 제거보다 **앞에** 둔다 — 검증이 줄 번호를 고칠 수 있고, 지문은 줄 번호로 만들어진다.
  const rawFindings = Array.isArray(review?.findings) ? review.findings : [];
  let refutedCount = 0;
  if (rawFindings.length && prTree) {
    const VERIFY_MAX_CHARS = 120_000;
    const cited = [...new Set(rawFindings.map((f) => f.file).filter(Boolean))];
    const bodies = [];
    let used = 0;
    for (const path of cited) {
      const text = readFromTree(prTree, path);
      if (!text) continue;
      // 줄 번호를 매겨 싣는다 — 검증이 line을 고쳐 줄 수 있어야 인라인 코멘트가 제자리에 붙는다.
      const numbered = text
        .split("\n")
        .map((l, i) => `${i + 1}\t${l}`)
        .join("\n");
      const block = `### ${path}\n\`\`\`\n${numbered}\n\`\`\``;
      if (used + block.length > VERIFY_MAX_CHARS) break;
      bodies.push(block);
      used += block.length;
    }

    if (!bodies.length) {
      console.log("🔬 검증 패스 건너뜀 — 지적이 가리킨 파일을 읽지 못했습니다.");
    } else {
      const verifyPrompt = `당신은 코드 리뷰의 **검증자**입니다. 아래 지적들이 실제로 성립하는지 파일 전문과 대조해 판정하세요.

## 프로젝트 규칙 (CLAUDE.md 원문)
${projectRules()}

## 검증할 지적
${rawFindings
  .map(
    (f, i) =>
      `[${i}] ${f.file}:${f.line ?? "?"} (${f.severity || "?"}/${f.category || "?"})\n${f.description || ""}`,
  )
  .join("\n\n")}

## 지적이 가리킨 파일의 현재 전문 (줄 번호 포함)
${bodies.join("\n\n")}

## 판정 방법
- 각 지적을 index로 되받아 판정한다. **지적 본문을 다시 쓰지 않는다** — 문구가 흔들리면 이미 올린
  지적을 걸러 내는 장치가 헛돈다.
  - CONFIRMED: 파일 전문에서 그 문제가 실제로 성립함을 확인했다
  - PLAUSIBLE: 성립할 수 있으나 이 파일만으로는 단정할 수 없다
  - REFUTED: 성립하지 않는다 (이미 처리하는 코드가 있다 / 그런 코드가 아예 없다 / 전제가 틀렸다)
- reason: 왜 그렇게 판정했는지 한 줄. **파일의 어느 줄이 근거인지** 짚는다.
- line: 지적이 가리켜야 할 정확한 줄 번호를 알면 적는다(1차 판단이 틀렸을 수 있다). 그대로면 null.
- severity: 전문을 보고 심각도를 조정해야 하면 적는다. 그대로면 null.
- **판정을 아끼지 않는다.** 근거 없이 CONFIRMED를 주면 사람이 헛수고를 하고, 겁내서 전부 REFUTED로
  버리면 리뷰가 다시 빈손이 된다. 파일이 말해 주는 대로 적는다.
- 위 index를 하나도 빠뜨리지 않는다.

## 출력 언어
reason은 한국어로 쓴다. 코드 식별자·파일 경로·원문 에러 메시지는 그대로 둔다.`;

      const verify = await askGemini(verifyPrompt, VERIFY_SCHEMA, {
        label: "검증 패스",
        // 1차를 통과한 모델을 먼저 — 방금 응답한 모델이 지금도 응답할 가능성이 가장 높다.
        // **후보를 둘로 자른다.** 방금 답한 모델이 429를 준다면 그건 쿼터가 말랐다는 뜻이라 아래로
        // 여덟 개를 더 내려가 봐야 같은 답이고, 그 왕복이 1차 리뷰 등록만 늦춘다(실측 8회 낭비).
        models: [first.model, ...modelsToTry.filter((m) => m !== first.model)].slice(0, 2),
      });

      let checks = [];
      if (verify.res) {
        try {
          checks = JSON.parse(textOf(await verify.res.json()))?.checks || [];
        } catch (_e) {
          console.warn("⚠️ 검증 응답 파싱 실패 — 1차 결과를 그대로 씁니다.");
        }
      }

      if (checks.length) {
        const byIndex = new Map(checks.map((c) => [Number(c.index), c]));
        const kept = [];
        for (const [i, f] of rawFindings.entries()) {
          const c = byIndex.get(i);
          // 판정을 빠뜨린 지적은 버리지 않는다 — 침묵은 반박이 아니다.
          if (!c) {
            kept.push(f);
            continue;
          }
          if (c.verdict === "REFUTED") {
            refutedCount += 1;
            continue;
          }
          kept.push({
            ...f,
            line: c.line != null ? c.line : f.line,
            severity: c.severity || f.severity,
            verifiedAs: c.verdict,
            verifiedWhy: c.reason,
          });
        }
        review.findings = kept;
        console.log(`🔬 검증 ${checks.length}건 — 유지 ${kept.length} · 폐기 ${refutedCount}`);
      } else {
        console.log("🔬 검증 결과가 없어 1차 지적을 그대로 씁니다.");
      }
    }
  }

  // ── 3. 이미 올린 지적을 걷어낸다 ───────────────────────────────
  // 예전에는 봇 코멘트 하나를 계속 덮어썼다. 그러면 (1) 이미 조치한 지적 위에 새 내용이 덮여
  // 무엇이 처리됐는지 알 수 없고, (2) 수정된 코멘트는 스레드 아래로 오지 않아 부른 사람 눈에
  // 아무 일도 안 일어난 것처럼 보인다. 이제는 매번 새 리뷰를 올리되 **중복만 걸러낸다.**
  const seen = new Set();
  for (const url of [
    `https://api.github.com/repos/${repo}/pulls/${prNumber}/comments?per_page=100`,
    `https://api.github.com/repos/${repo}/pulls/${prNumber}/reviews?per_page=100`,
  ]) {
    const res = await gh(url);
    if (!res.ok) continue;
    for (const item of await res.json()) {
      for (const m of String(item.body || "").matchAll(FINDING_TAG_RE)) seen.add(m[1]);
    }
  }

  const allFindings = Array.isArray(review?.findings) ? review.findings : [];
  const fresh = allFindings.filter((f) => !seen.has(fingerprint(f)));
  const dupCount = allFindings.length - fresh.length;

  // 인라인으로 달 수 있는 것만 고른다 — 코멘트 하나가 틀리면 리뷰 전체가 422로 거절된다.
  const lineMap = diffLineMap(diff);
  const inline = [];
  const unanchored = [];
  for (const f of fresh) {
    if (f.line != null && lineMap.get(f.file)?.has(Number(f.line))) {
      inline.push({ path: f.file, line: Number(f.line), side: "RIGHT", body: renderFinding(f) });
    } else {
      unanchored.push(f);
    }
  }
  console.log(`🧾 지적 ${allFindings.length}건 — 새것 ${fresh.length} (인라인 ${inline.length} · 본문 ${unanchored.length}) · 중복 ${dupCount}`);

  const body = `${BOT_SIGNATURE}
### 🤖 Gemini AI Automated PR Review

${review ? renderBody(review, { inlineCount: inline.length, unanchored, dupCount, refutedCount, skippedFiles: skipped }) : reviewText}

---
*\`${targetModel}\` · ${new Date().toISOString().replace("T", " ").slice(0, 16)} UTC · 대상 커밋 \`${headSha.slice(0, 7)}\`*`;

  // ── 4. 리뷰 등록 ───────────────────────────────────────────────
  // event는 언제나 COMMENT다. 봇이 APPROVE를 남기면 사람 리뷰를 대신해 버리고,
  // REQUEST_CHANGES는 병합을 막는다 — 판정은 코멘트로 말하고 결정은 사람이 한다.
  console.log("💬 PR 리뷰 등록 중...");
  let postRes = await gh(`https://api.github.com/repos/${repo}/pulls/${prNumber}/reviews`, {
    method: "POST",
    body: JSON.stringify({ commit_id: headSha, event: "COMMENT", body, comments: inline }),
  });

  // 줄 위치가 틀려 거절되면 인라인을 포기하고 본문만이라도 남긴다 — 리뷰를 통째로 잃지 않는다.
  if (!postRes.ok && inline.length) {
    console.warn(`⚠️ 인라인 코멘트가 거절돼(${postRes.status}) 본문만 등록합니다: ${await postRes.text()}`);
    const merged = renderBody(review, {
      inlineCount: 0,
      unanchored: fresh,
      dupCount,
      refutedCount,
      skippedFiles: skipped,
    });
    postRes = await gh(`https://api.github.com/repos/${repo}/pulls/${prNumber}/reviews`, {
      method: "POST",
      body: JSON.stringify({
        commit_id: headSha,
        event: "COMMENT",
        body: body.replace(/(?<=Review\n\n)[\s\S]*(?=\n\n---)/, merged),
      }),
    });
  }
  if (!postRes.ok) throw new Error(`리뷰 등록 실패: ${postRes.status} ${await postRes.text()}`);
  console.log("✅ 리뷰를 등록했습니다.");
}

main().catch((err) => {
  const msg = (err?.message || String(err)).replace(/\r?\n/g, " ");
  // 리뷰는 보조 기능이라 CI를 깨뜨리진 않되, 침묵하지 않도록 Actions 요약에 경고를 남긴다.
  // (전면 실패가 exit 0으로 조용히 묻히면 리뷰가 멈춘 것을 아무도 모른다.)
  console.log(`::warning title=AI PR Review 실패::${msg} — 키 권한/쿼터/모델명을 확인하세요.`);
  process.exit(0);
});
