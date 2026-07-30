// 스모크 e2e — 서비스의 핵심 동선이 실제 브라우저에서 끝까지 동작하는지 확인한다.
// DB는 e2e 전용 persist 디렉터리(.wrangler-e2e)라 라이브·로컬 개발 데이터와 격리된다.
import { expect, test } from "@playwright/test";

test("공개 조회: QR 상세 카드가 렌더링된다", async ({ page }) => {
  await page.goto("/DEMO26-001");
  await expect(page.locator("body")).toContainText("ETHIOPIA");
  await expect(page.locator("body")).toContainText("DANCHE");
});

test("랩: 로그인 → 라벨 QR 검증 → 등록 → 덱에서 카드 확인", async ({ page }) => {
  await page.goto("/admin/");

  // 데모 계정 로그인 (시드는 구형 해시 — 로그인 시 세션 발급 + 무중단 업그레이드 경로까지 커버)
  await page.getByPlaceholder("ABCD").fill("DEMO");
  await page.getByPlaceholder("0000").fill("0000");
  await page.getByRole("button", { name: "이 브라우저에 로그인" }).click();
  await expect(page.getByRole("button", { name: "로그아웃" })).toBeVisible();

  // 라벨 미리보기가 203dpi 실디코드 검증을 통과해야 한다
  await expect(page.locator(".verify")).toContainText("QR 검증 OK", { timeout: 20_000 });

  // 필수 항목 입력 → 등록(KEY 서버 채번)
  await page.getByPlaceholder("SEY", { exact: true }).fill("E2E ROASTERY");
  await page.getByPlaceholder("ETHIOPIA", { exact: true }).fill("KENYA");
  await page.getByPlaceholder("SL9", { exact: true }).fill("SL28");
  await page.getByPlaceholder("Washed", { exact: true }).fill("Washed");
  await page.getByRole("button", { name: /등록 — KEY 발급받기/ }).click();
  await expect(page.locator(".sticky-col .status-line")).toContainText("등록 완료", { timeout: 15_000 });

  // 같은 오리진 세션으로 덱에서 카드가 보인다
  await page.goto("/deck");
  await expect(page.locator(".wcard").first()).toBeVisible();
});
