#!/usr/bin/env node
// GitHub Actions에서 PR 생성·수정 시 Gemini API를 호출해 자동 코드 리뷰를 남기는 스크립트.
//
// 동작 원리:
// 1. GitHub API를 통해 PR 메타데이터와 diff를 가져온다.
// 2. CLAUDE.md 원문을 규칙으로 주입한 프롬프트로 Gemini API를 호출한다(모델 동적 선택 · flash 우선).
//    출력은 responseSchema로 강제한 구조화 JSON(판정·요약·강점·findings)을 받는다.
// 3. 구조화 결과를 마크다운으로 렌더해 PR 코멘트로 등록하거나 기존 코멘트를 갱신한다(파싱 실패 시 원문 폴백).

import { readFileSync } from "node:fs";

const BOT_SIGNATURE = "<!-- ai-pr-review-bot -->";

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

// Gemini 구조화 출력 스키마 (OpenAPI 서브셋). 자유 텍스트 대신 이 모양을 강제해 심각도·위치를 얻는다.
const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    verdict: { type: "string", enum: ["APPROVE", "COMMENT", "REQUEST_CHANGES"] },
    strengths: { type: "array", items: { type: "string" } },
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
  required: ["summary", "verdict", "findings"],
  // ⚠️ 순서가 곧 생성 순서다. verdict를 findings보다 먼저 두면 모델이 **문제를 열거하기 전에**
  // 판정을 확정하고, 그다음 findings가 이미 써 버린 APPROVE에 맞춰 눌린다. findings를 앞에 둬야
  // "무엇을 찾았는가 → 그래서 어떤 판정인가" 순으로 쓴다.
  propertyOrdering: ["summary", "findings", "strengths", "verdict"],
};

/** 구조화 리뷰 객체 → PR 코멘트 마크다운. 심각도순 정렬 + 집계 한 줄. */
function renderReview(review) {
  const findings = Array.isArray(review.findings) ? review.findings : [];
  const tally = SEV_ORDER.map((s) => {
    const n = findings.filter((f) => f.severity === s).length;
    return n ? `${SEV_LABEL[s]} ${n}` : null;
  }).filter(Boolean);

  const out = [`**판정: ${VERDICT_LABEL[review.verdict] || review.verdict || "—"}**`];
  if (tally.length) out.push(tally.join(" · "));
  if (review.summary) out.push(`\n> ${review.summary}`);

  if (Array.isArray(review.strengths) && review.strengths.length) {
    out.push("\n#### 잘된 점");
    out.push(review.strengths.map((s) => `- ${s}`).join("\n"));
  }

  out.push("\n#### 개선 제안 및 주의사항");
  if (!findings.length) {
    out.push("특이사항 없음.");
  } else {
    const sorted = [...findings].sort(
      (a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity),
    );
    for (const f of sorted) {
      const loc = f.line != null ? `\`${f.file}:${f.line}\`` : `\`${f.file || "?"}\``;
      const cat = f.category ? ` · _${f.category}_` : "";
      out.push(`\n**${SEV_LABEL[f.severity] || f.severity || ""}** ${loc}${cat}\n${f.description || ""}`);
      if (f.suggestion) out.push(`> 제안: ${f.suggestion}`);
    }
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

  // 1. PR 메타데이터 및 diff 수집
  const prRes = await fetch(`https://api.github.com/repos/${repo}/pulls/${prNumber}`, {
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "bean-hoarder-ai-reviewer",
    },
  });
  if (!prRes.ok) {
    throw new Error(`PR 메타데이터 조회 실패: ${prRes.status} ${await prRes.text()}`);
  }
  const prData = await prRes.json();

  const diffRes = await fetch(`https://api.github.com/repos/${repo}/pulls/${prNumber}`, {
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: "application/vnd.github.v3.diff",
      "User-Agent": "bean-hoarder-ai-reviewer",
    },
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

  // 2. 사용할 Gemini 모델 결정 (ListModels API로 지원 모델 동적 탐색)
  console.log("🤖 사용할 Gemini 모델 확인 중...");
  let targetModel = process.env.GEMINI_MODEL;

  if (!targetModel) {
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

        console.log(`📋 사용 가능한 모델 목록: ${available.join(", ")}`);
        // 모델 탐색 우선순위 — **flash가 먼저다.**
        // 예전에는 품질을 노리고 pro를 앞에 뒀는데, 이 키로는 pro 계열이 매번 429(쿼터)라 실제로는
        // 한 번도 쓰이지 못하면서 왕복만 두 번 버렸다(2026-09-03 실측: 3.1-pro-preview 429 →
        // pro-latest 429 → 2.5-pro 404 → …). pro는 티어가 바뀌면 쓸 수 있으므로 맨 뒤에 남겨 둔다.
        const preferredModels = [
          "gemini-3.8-flash",
          "gemini-3.7-flash",
          "gemini-3.6-flash",
          "gemini-flash-latest",
          "gemini-3.5-flash",
          "gemini-3.1-pro-preview",
          "gemini-pro-latest",
          "gemini-flash-lite-latest",
        ];
        targetModel = preferredModels.find((m) => available.includes(m));
        if (!targetModel) {
          // 목록에 없으면 flash > pro 순으로, 이미지·비전 전용 모델은 제외하고 고른다.
          const usable = (m) => !m.includes("image") && !m.includes("vision") && !m.includes("lite");
          targetModel =
            available.find((m) => m.includes("flash") && usable(m)) ||
            available.find((m) => m.includes("pro") && usable(m));
        }
        targetModel = targetModel || available[0];
      }
    } catch (e) {
      console.warn("⚠️ 모델 목록 조회 실패, 기본 fallback 사용:", e);
    }
  }

  targetModel = targetModel || "gemini-3.7-flash";
  console.log(`🎯 선택된 모델: ${targetModel}`);

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

## 출력 (JSON 스키마로 강제됨 — 자유 텍스트가 아니라 지정된 필드를 채운다)
- summary: PR이 해결하는 문제와 변경 핵심 (1~3문장)
- verdict: APPROVE(문제 없음) / COMMENT(참고 의견) / REQUEST_CHANGES(보완 필요) 중 하나
- strengths: 구조 개선·성능·테스트 보강 등 긍정적 측면 (문자열 배열, 없으면 빈 배열)
- findings: 잠재 버그·보안 취약점·프로젝트 규칙 위반·엣지 케이스. 없으면 빈 배열. 각 항목:
    - file: 파일 경로 (diff에 나온 경로 그대로)
    - line: 관련 라인 번호 (모르면 null)
    - severity: critical / high / medium / low / nit
    - category: 예) correctness, security, ssot, bundle-size, xss, routing, test
    - description: 무엇이 왜 문제인지 한국어로
    - suggestion: 구체적 수정 제안 (없으면 null)

## 리뷰 태도
- **diff에 실제로 있는 코드만 근거로 삼는다.** PR 설명은 작성자의 주장일 뿐이므로, 설명이 그렇다고
  해서 그렇게 되었다고 적지 않는다. 위에 "제외된 파일" 목록이 있으면 그 파일은 검토하지 못했다고 밝힌다.
- **strengths는 diff에서 확인한 것만 적는다.** 확인할 수 없으면 비운다 — 근거 없는 칭찬은 리뷰를
  못 믿게 만든다.
- findings를 먼저 채우고, 그 결과를 보고 verdict를 정한다. 문제가 없으면 빈 배열이어도 좋지만,
  **찾지 못한 것과 없는 것은 다르다** — summary에 무엇을 확인했는지 한 문장으로 남긴다.
- 특히 위 규칙 문서의 "절대 바꾸지 말 것"·"걸려 넘어지기 쉬운 것"에 걸리는 변경이 있는지 본다.

설명은 친절하고 전문적인 한국어로 작성한다.`;

  // targetModel 먼저, 이후 flash > pro 순 폴백 — 하나가 5xx/429여도 다음으로 넘어간다.
  const candidateModels = [
    targetModel,
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-flash-latest",
    "gemini-3.5-flash",
    "gemini-3.1-pro-preview",
    "gemini-pro-latest",
    "gemini-flash-lite-latest",
  ];
  const modelsToTry = [...new Set(candidateModels.filter(Boolean))];

  let aiRes = null;
  let usedModel = null;
  let lastError = null;

  for (const model of modelsToTry) {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    // 5xx는 일시적 과부하라 한 번은 다시 묻는다 — 2026-09-03에 gemini-3.7-flash가 503 하나로 밀려
    // 한 단계 아래 모델이 리뷰를 썼다. 429(쿼터)·404(없는 모델)는 곧바로 다시 물어도 같은 답이라
    // 재시도하지 않고 다음 후보로 넘어간다.
    for (let attempt = 1; attempt <= 2; attempt++) {
      console.log(`🤖 Gemini API (${model}) 호출 시도 중...${attempt > 1 ? ` (재시도 ${attempt})` : ""}`);
      const res = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
            responseSchema: REVIEW_SCHEMA,
          },
        }),
      });

      if (res.ok) {
        aiRes = res;
        usedModel = model;
        console.log(`✅ ${model} 모델로 성공적인 응답을 받았습니다.`);
        break;
      }
      const errText = await res.text();
      console.warn(`⚠️ 모델 ${model} 실패 (${res.status}): ${errText}`);
      lastError = `${res.status} ${errText}`;
      if (res.status < 500 || attempt === 2) break;
      await new Promise((r) => setTimeout(r, 3000));
    }
    if (aiRes) break;
  }

  if (!aiRes || !usedModel) {
    throw new Error(`모든 Gemini 모델 호출 실패. 마지막 오류: ${lastError}`);
  }

  targetModel = usedModel;

  const aiData = await aiRes.json();
  const reviewText = aiData?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!reviewText) {
    throw new Error("Gemini로부터 응답 텍스트를 받지 못했습니다.");
  }

  // responseSchema로 강제한 JSON을 파싱해 렌더한다. 스키마가 깨진 응답(구형 모델 등)은 원문 그대로 싣는다.
  let reviewMarkdown = reviewText;
  try {
    reviewMarkdown = renderReview(JSON.parse(reviewText));
  } catch (_e) {
    console.warn("⚠️ 구조화 응답 파싱 실패 — 원문을 그대로 싣습니다.");
  }

  const commentBody = `${BOT_SIGNATURE}
### 🤖 Gemini AI Automated PR Review

${reviewMarkdown}

---
*이 리뷰는 GitHub Actions 워크플로를 통해 \`${targetModel}\` 모델로 자동 생성되었습니다.*`;

  // 3. 기존 코멘트 검색 후 갱신(Update) 또는 신규 등록(Create)
  console.log("💬 PR 코멘트 등록/갱신 중...");
  // per_page=100: 봇의 기존 코멘트가 첫 페이지(기본 30개) 밖으로 밀려 중복 생성되는 것을 줄인다.
  const commentsRes = await fetch(
    `https://api.github.com/repos/${repo}/issues/${prNumber}/comments?per_page=100`,
    {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "bean-hoarder-ai-reviewer",
      },
    },
  );

  let existingCommentId = null;
  if (commentsRes.ok) {
    const comments = await commentsRes.json();
    const botComment = comments.find((c) => c.body?.includes(BOT_SIGNATURE));
    if (botComment) existingCommentId = botComment.id;
  }

  if (existingCommentId) {
    const updateRes = await fetch(`https://api.github.com/repos/${repo}/issues/comments/${existingCommentId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "bean-hoarder-ai-reviewer",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body: commentBody }),
    });
    if (!updateRes.ok) {
      throw new Error(`코멘트 수정 실패: ${updateRes.status} ${await updateRes.text()}`);
    }
    console.log(`✅ 기존 리뷰 코멘트(#${existingCommentId})가 성공적으로 갱신되었습니다.`);
  } else {
    const createRes = await fetch(`https://api.github.com/repos/${repo}/issues/${prNumber}/comments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "bean-hoarder-ai-reviewer",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body: commentBody }),
    });
    if (!createRes.ok) {
      throw new Error(`코멘트 생성 실패: ${createRes.status} ${await createRes.text()}`);
    }
    console.log("✅ 새로운 리뷰 코멘트가 성공적으로 등록되었습니다.");
  }
}

main().catch((err) => {
  const msg = (err?.message || String(err)).replace(/\r?\n/g, " ");
  // 리뷰는 보조 기능이라 CI를 깨뜨리진 않되, 침묵하지 않도록 Actions 요약에 경고를 남긴다.
  // (전면 실패가 exit 0으로 조용히 묻히면 리뷰가 멈춘 것을 아무도 모른다.)
  console.log(`::warning title=AI PR Review 실패::${msg} — 키 권한/쿼터/모델명을 확인하세요.`);
  process.exit(0);
});
