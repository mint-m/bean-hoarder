// 링크 스킴 가드 검증 — 조회 페이지가 사용자가 적은 URL을 그대로 href에 넣지 않게 한다.
//
// SOURCE_URL은 사용자가 적는 값인 데다, 조회 페이지의 ?preview= 경로는 인증 없이 임의 JSON을
// 받으므로 링크 하나로 이 오리진에서 스크립트를 돌릴 수 있었다(그 오리진 localStorage에는
// 덱의 세션 토큰이 있다). 그 구멍을 막은 규칙이라 여기서 고정한다.
import { expect, test } from "vitest";
import { escapeHtml, safeHttpUrl } from "./dom";

test("http(s) URL은 그대로 통과한다", () => {
  expect(safeHttpUrl("https://example.com/a?b=1#c")).toBe("https://example.com/a?b=1#c");
  expect(safeHttpUrl("http://example.com")).toBe("http://example.com");
  expect(safeHttpUrl("HTTPS://EXAMPLE.COM")).toBe("HTTPS://EXAMPLE.COM");
  expect(safeHttpUrl("  https://example.com  ")).toBe("https://example.com");
});

test("스크립트가 될 수 있는 스킴은 빈 문자열이 된다", () => {
  for (const bad of [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "  javascript:alert(1)",
    "java\tscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "blob:https://example.com/x",
  ]) {
    expect(safeHttpUrl(bad), `막지 못했다: ${bad}`).toBe("");
  }
});

// 스킴이 없는 값도 막는다 — 링크가 안 걸릴 뿐이라 사용자 손해가 없고,
// 통과시키면 "//evil.example"(프로토콜 상대 URL) 같은 것까지 따라 들어온다.
test("스킴이 없거나 빈 값은 링크가 되지 않는다", () => {
  for (const v of ["", "   ", "example.com", "/beans/1", "//evil.example"]) {
    expect(safeHttpUrl(v)).toBe("");
  }
});

test("escapeHtml은 속성 이탈에 쓰이는 문자를 모두 바꾼다", () => {
  expect(escapeHtml('<a href="x">&')).toBe("&lt;a href=&quot;x&quot;&gt;&amp;");
});
