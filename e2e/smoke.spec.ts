// 스모크 e2e — 서비스의 핵심 동선이 실제 브라우저에서 끝까지 동작하는지 확인한다.
// DB는 e2e 전용 persist 디렉터리(.wrangler-e2e)라 라이브·로컬 개발 데이터와 격리된다.
import { expect, test } from "@playwright/test";

test("공개 조회: QR 상세 카드가 렌더링된다", async ({ page }) => {
  await page.goto("/TEST26-001");
  await expect(page.locator("body")).toContainText("ETHIOPIA");
  await expect(page.locator("body")).toContainText("E2E FIXTURE");
});

// 경로(/{KEY}) 외에 쿼리(?c={KEY})로도 조회할 수 있다 — 랩의 링크·수동 입력이 쓰는 진입.
// viewer.getCode()의 별도 분기라 경로 진입 테스트로는 덮이지 않는다.
test("공개 조회: ?c= 쿼리 진입도 같은 카드를 연다", async ({ page }) => {
  await page.goto("/?c=TEST26-001");
  await expect(page.locator("body")).toContainText("ETHIOPIA");
  await expect(page.locator("body")).toContainText("E2E FIXTURE");
});

// 퍼센트 인코딩이 깨진 경로 — 잘려서 스캔된 QR이나 손으로 친 주소가 여기로 온다.
// Pages 폴백이 매치 없는 모든 경로에 조회 페이지를 주므로, getCode()의 decodeURIComponent가
// 던지면 안내조차 못 띄우고 "불러오는 중…"에서 멈춘다(안내는 KEY_RE 검사 뒤에 있다).
test("공개 조회: 깨진 퍼센트 인코딩 경로에서도 안내가 뜬다", async ({ page }) => {
  await page.goto("/%E0%A4");
  await expect(page.locator("body")).toContainText("올바른 코드 형식이 아닙니다");
});

// 데모는 "정적"이 요점이다 — D1도 API도 타지 않아야 라이브와 어긋날 여지가 없다.
// 화면이 그려지는 것만 봐서는 그 요점이 지켜졌는지 알 수 없으므로(예전 구현도 그림은 그렸다)
// /api/** 를 통째로 끊어 놓고 덱과 카드가 멀쩡한지 확인한다.
test("데모: API를 전부 끊어도 덱과 카드가 그대로 뜬다", async ({ page }) => {
  await page.route("**/api/**", (route) => route.abort());

  await page.goto("/demo");
  const cards = page.locator(".wcard");
  await expect(cards.first()).toBeVisible();

  const key = await cards.last().getAttribute("data-key");
  expect(key, "데모 카드에 KEY가 없다").toBeTruthy();
  expect(key as string, "데모 KEY는 예약 접두 DEMO로 시작해야 한다").toMatch(/^DEMO/);

  await page.goto(`/${key}`);
  await expect(page.locator("#bean")).toBeVisible();
  await expect(page.locator("body")).toContainText(key as string);
});

test("랩: 로그인 → 순차 검증 입력 → 등록 → QR 발급 → 덱에서 카드 확인", async ({ page }) => {
  // 같은 원두를 다시 등록하면 확인 창이 뜬다(식별 필드가 전부 일치). e2e DB는 실행 간 유지되므로
  // 두 번째 실행부터 실제로 걸린다 — 계속 진행을 선택해 원래 동선을 그대로 검증한다.
  page.on("dialog", (d) => d.accept());
  await page.goto("/lab/");

  // 시드의 TEST 계정으로 로그인. 시드는 구형 해시라 세션 발급 + 무중단 업그레이드 경로까지 커버된다.
  await page.getByPlaceholder("ABCD").fill("TEST");
  await page.getByPlaceholder("0000").fill("0000");
  await page.getByRole("button", { name: "이 브라우저에 로그인" }).click();
  await expect(page.getByRole("button", { name: "로그아웃" })).toBeVisible();

  // 등록 동선은 인테이크(링크 붙여넣기)에서 시작한다 — 링크 없이 직접 입력으로 들어간다
  await page.getByRole("button", { name: /직접 입력으로 시작하기/ }).click();

  // 스텝 1(로스터리·산지)은 열린 채로 시작
  await page.getByPlaceholder("SEY", { exact: true }).fill("E2E ROASTERY");
  await page.getByPlaceholder("ETHIOPIA", { exact: true }).fill("KENYA");
  await page.getByRole("button", { name: /확인하고 다음/ }).click();

  // 스텝 2(가공·품종)로 자동 이동
  await page.getByPlaceholder("Washed", { exact: true }).fill("Washed");
  await page.getByPlaceholder("SL9", { exact: true }).fill("SL28");

  // 스텝 3(날짜) — 로스팅일은 빼기 버튼을 겹쳐 누르는 계산기다. 누적되지 않으면 "한 달 전에서
  // 며칠 더" 같은 실제 사용이 성립하지 않으므로, 두 번 눌러 합이 맞는지 확인한다.
  await page.getByRole("button", { name: /확인하고 다음/ }).click();
  const roast = page.locator('input[type="date"]').first();
  const before = await roast.inputValue();
  await page.getByRole("button", { name: "일주일 전" }).click();
  await page.getByRole("button", { name: "1일 전" }).click();
  const after = await roast.inputValue();
  expect((Date.parse(before) - Date.parse(after)) / 86_400_000).toBe(8);

  // 되돌리기는 직전 한 번만 취소한다 — 연타 중 오탭의 대가가 "처음부터 다시"가 되지 않게 하는 장치다
  await page.getByRole("button", { name: "직전 선택 되돌리기" }).click();
  expect((Date.parse(before) - Date.parse(await roast.inputValue())) / 86_400_000).toBe(7);

  // 등록(KEY 서버 채번) — 날짜는 기본값이 채워져 있어 그대로 통과한다.
  // 성공하면 화면이 'QR 발급'으로 넘어간다(한 화면에 한 맥락).
  await page.getByRole("button", { name: /등록 — KEY 발급받기/ }).click();
  await expect(page.locator(".qr-card")).toContainText("확정 KEY", { timeout: 15_000 });

  // 확정 KEY로 만든 인쇄용 QR이 203dpi 실디코드 검증을 통과해야 한다 (서비스의 산출물)
  await expect(page.locator(".verify")).toContainText("인쇄해도 스캔됩니다", { timeout: 20_000 });

  // 같은 오리진 세션으로 덱에서 카드가 보인다
  await page.goto("/deck");
  await expect(page.locator(".wcard").first()).toBeVisible();
});

// 필수 항목의 강제 지점은 두 곳이다. "확인하고 다음"은 이 스텝을 봤다는 선언이라 빈 채로 통과하면
// 그 선언이 거짓이 되고, 등록은 서버가 어차피 막으므로 사용자를 그 칸까지 데려다주는 것이 일이다.
// 반면 헤더로 다른 스텝을 여는 길은 계속 열려 있어야 한다 — 뒤를 보고 앞을 정하는 것이 이 화면의 일이다.
test("랩: 필수 칸이 비면 확인이 막히고, 등록은 그 스텝으로 데려간다", async ({ page }) => {
  await page.goto("/lab/");
  await page.getByPlaceholder("ABCD").fill("TEST");
  await page.getByPlaceholder("0000").fill("0000");
  await page.getByRole("button", { name: "이 브라우저에 로그인" }).click();
  await page.getByRole("button", { name: /직접 입력으로 시작하기/ }).click();

  // 산지를 비운 채 확인 → 막히고 이유가 그 자리에 뜬다
  await page.getByPlaceholder("SEY", { exact: true }).fill("BLOCK TEST");
  await page.getByPlaceholder("ETHIOPIA", { exact: true }).fill("");
  await page.getByRole("button", { name: /확인하고 다음/ }).click();
  await expect(page.getByText(/필수 1칸을 채워야 확인할 수 있습니다/)).toBeVisible();
  // 다음 스텝으로 넘어가지 않았다 — 스텝 1이 그대로 열려 있다
  await expect(page.getByPlaceholder("ETHIOPIA", { exact: true })).toBeVisible();

  // 채우면 통과하고 다음 스텝이 열린다
  await page.getByPlaceholder("ETHIOPIA", { exact: true }).fill("KENYA");
  await page.getByRole("button", { name: /확인하고 다음/ }).click();
  await expect(page.getByPlaceholder("Washed", { exact: true })).toBeVisible();

  // 품종을 비운 채 다른 스텝(상세)으로 옮겨 간다 — 헤더 점프는 막지 않는다
  await page.getByPlaceholder("Washed", { exact: true }).fill("Washed");
  await page.getByRole("button", { name: /상세 \(선택\)/ }).click();
  await expect(page.getByPlaceholder("SL9", { exact: true })).toBeHidden();

  // 등록 → 문구만 띄우는 게 아니라 비어 있는 칸이 있는 스텝을 열어 준다
  await page.getByRole("button", { name: /등록 — KEY 발급받기/ }).click();
  await expect(page.getByPlaceholder("SL9", { exact: true })).toBeVisible();
});

// 세션 토큰은 90일 고정 만료라, 실서비스 전환 시점에 로그인한 세션들이 한꺼번에 만료된다.
// 예전엔 랩에 401 처리 경로가 없어 목록이 조용히 비고 저장 때마다 "인증 실패 — 유저코드와
// 암호를 확인하세요"만 떴다(덱은 처리하는데 랩만 빠져 있었다).
test("랩: 세션이 만료되면 안내와 함께 로그인 화면으로 돌아간다", async ({ page }) => {
  await page.goto("/lab/");
  await page.getByPlaceholder("ABCD").fill("TEST");
  await page.getByPlaceholder("0000").fill("0000");
  await page.getByRole("button", { name: "이 브라우저에 로그인" }).click();
  await expect(page.getByRole("button", { name: "로그아웃" })).toBeVisible();

  // 형식은 맞지만 서버가 모르는 토큰 — 만료됐거나 다른 기기에서 로그아웃해 폐기된 상태와 같다
  await page.evaluate(() => localStorage.setItem("bh_session", `bhs_${"0".repeat(32)}`));
  await page.reload();

  await expect(page.locator(".auth-notice")).toContainText("로그인이 만료되었습니다");
  await expect(page.getByRole("button", { name: "이 브라우저에 로그인" })).toBeVisible();
  // 죽은 토큰이 남아 있으면 다음 방문에도 같은 일이 반복된다
  expect(await page.evaluate(() => localStorage.getItem("bh_session"))).toBeNull();
});
