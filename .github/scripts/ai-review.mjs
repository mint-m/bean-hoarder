#!/usr/bin/env node
// GitHub Actions에서 PR 생성·수정 시 Gemini API를 호출해 자동 코드 리뷰를 남기는 스크립트.
//
// 동작 원리:
// 1. GitHub API를 통해 PR 메타데이터와 diff를 가져온다.
// 2. 프로젝트 특화 규칙(SSOT, Cloudflare Pages 폴백, XSS/SQLi 보안)을 주입한 프롬프트로 Gemini 2.5 Flash를 호출한다.
// 3. 생성된 리뷰를 PR 코멘트로 등록하거나 기존 리뷰 코멘트를 갱신한다.

import { execFileSync } from "node:child_process";

const BOT_SIGNATURE = "<!-- ai-pr-review-bot -->";
const GEMINI_MODEL = "gemini-2.5-flash";

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

  // 너무 거대한 diff는 적정선(60KB)으로 자르고 요약 안내 첨부
  if (diff.length > 60000) {
    diff = diff.slice(0, 60000) + "\n\n...(diff가 너무 길어 뒷부분이 생략되었습니다)...";
  }

  // 2. Gemini API 호출
  console.log("🤖 Gemini API에 코드 리뷰 요청 중...");
  const prompt = `당신은 Bean-Hoarder 프로젝트의 시니어 풀스택 코드 리뷰어입니다.
제출된 Pull Request의 제목, 설명, git diff를 분석하고 건설적이고 명확한 한국어 코드 리뷰를 작성해 주세요.

## 프로젝트 맥락
- 프로젝트명: Bean-Hoarder (원두 소분 라벨 아카이브)
- 기술 스택: TypeScript, Cloudflare Pages + D1 (SQLite) + R2, Hono (API), Vite MPA (apps/web - viewer, deck), React SPA (apps/lab), SVG 라벨 엔진 (@bnhd/label), Playwright E2E & Vitest
- **절대 규칙**:
  1. Cloudflare Pages의 암묵적 SPA 폴백(매치 없는 경로 -> index.html)을 유지해야 함 (404.html 생성 금지 — 인쇄된 라벨의 QR 코드가 죽음).
  2. 도메인 규칙(헤드라인 생성, 세션 저장 등)은 반드시 packages/의 단일 소스(SSOT)를 사용해야 함.
  3. XSS 방어: innerHTML 사용 시 escapeHtml 철저 검증.
  4. 웹 번들 크기 최적화: 불필요한 서드파티 라이브러리 유입 방지 및 무거운 모듈(jsQR 등) 지연 로딩 준수.

## PR 정보
- PR 번호: #${prNumber}
- PR 제목: ${prData.title}
- PR 작성자: @${prData.user.login}
- PR 설명:
${prData.body || "(설명 없음)"}

## Git Diff
\`\`\`diff
${diff}
\`\`\`

## 리뷰 출력 형식 가이드
마크다운 형식으로 아래 섹션을 포함하여 작성해 주세요:
1. **요약**: PR이 해결하고자 하는 문제와 변경 핵심 (1~3줄)
2. **잘된 점 (Strengths)**: 구조적 개선, 성능 최적화, 테스트 보강 등 긍정적 측면
3. **개선 제안 및 주의사항 (Suggestions & Risks)**: 잠재적 버그, 보안 취약점, 프로젝트 규칙 위반, 엣지 케이스 등 (없다면 "특이사항 없음" 명시)
4. **종합 의견**: LGTM / Approval 권고 또는 보완 요청

리뷰는 친절하고 전문적인 톤으로 작성해 주세요.`;

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const aiRes = await fetch(geminiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
      },
    }),
  });

  if (!aiRes.ok) {
    throw new Error(`Gemini API 호출 실패: ${aiRes.status} ${await aiRes.text()}`);
  }

  const aiData = await aiRes.json();
  const reviewText = aiData?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!reviewText) {
    throw new Error("Gemini로부터 응답 텍스트를 받지 못했습니다.");
  }

  const commentBody = `${BOT_SIGNATURE}
### 🤖 Gemini AI Automated PR Review

${reviewText}

---
*이 리뷰는 GitHub Actions 워크플로를 통해 \`${GEMINI_MODEL}\` 모델로 자동 생성되었습니다.*`;

  // 3. 기존 코멘트 검색 후 갱신(Update) 또는 신규 등록(Create)
  console.log("💬 PR 코멘트 등록/갱신 중...");
  const commentsRes = await fetch(`https://api.github.com/repos/${repo}/issues/${prNumber}/comments`, {
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "bean-hoarder-ai-reviewer",
    },
  });

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
  console.error("❌ AI PR Review 실행 중 오류 발생:", err);
  process.exit(1);
});
