// 관리 화면으로 가는 길 — 랜딩이 로그인을 알아보고, 관리 화면은 주소(/lab/#admin)를 가진다.
//
// 관리 화면은 랩 안의 상태일 뿐 주소가 없어서 새로고침하면 등록 화면으로 돌아가고, 뒤로 가기는 랩 밖으로
// 나갔으며, 랜딩은 로그인을 몰라 관리로 가는 길이 아예 없었다. 경로(/lab/admin)가 아니라 해시인 이유는
// 경로는 QR 폴백(조회 페이지)이 가져가기 때문이다. e2e 서버는 시드의 TEST를 관리자로 띄운다(package.json).
import { expect, type Page, test } from "@playwright/test";

async function loginAsTest(page: Page, path = "/lab/"): Promise<void> {
  await page.goto(path);
  await page.getByPlaceholder("ABCD").fill("TEST");
  await page.getByPlaceholder("0000").fill("0000");
  await page.getByRole("button", { name: "이 브라우저에 로그인" }).click();
  await expect(page.getByRole("button", { name: "로그아웃" })).toBeVisible();
}

/** 관리자가 아닌 새 계정의 세션을 이 브라우저에 심는다 — 랩·랜딩이 같은 localStorage 키를 읽는다 */
async function signInAsNewUser(page: Page): Promise<string> {
  const res = await page.request.post("/api/signup", { data: { invite: "e2e-invite", password: "1234" } });
  const body = (await res.json()) as { usercode: string; token: string };
  await page.goto("/demo"); // 같은 오리진의 아무 페이지 — localStorage를 쓰려면 오리진이 필요하다
  await page.evaluate(({ usercode, token }) => {
    localStorage.setItem("bh_usercode", usercode);
    localStorage.setItem("bh_session", token);
  }, body);
  return body.usercode;
}

test("랜딩: 세션이 없으면 /api/me를 부르지 않고 로그인 표시도 관리 링크도 없다", async ({ page }) => {
  const meCalls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/me")) meCalls.push(r.url());
  });
  await page.goto("/");
  await expect(page.locator("#landing")).toBeVisible();
  await expect(page.locator("#landing-session")).toBeHidden();
  await expect(page.getByRole("link", { name: "관리" })).toBeHidden();
  expect(meCalls).toEqual([]);
});

test("랜딩: 관리자는 로그인 표시와 관리 링크를 보고, 링크는 관리 화면(잠금)으로 바로 간다", async ({
  page,
}) => {
  await loginAsTest(page);
  await page.goto("/");
  await expect(page.locator("#landing-session")).toHaveText("TEST로 로그인됨");
  await page.getByRole("link", { name: "관리" }).click();
  await expect(page).toHaveURL(/\/lab\/#admin$/);
  await expect(page.getByRole("heading", { name: /관리 잠금/ })).toBeVisible();
});

test("랜딩: 일반 계정은 로그인 표시만 — 관리 링크는 없다", async ({ page }) => {
  const usercode = await signInAsNewUser(page);
  await page.goto("/");
  await expect(page.locator("#landing-session")).toHaveText(`${usercode}로 로그인됨`);
  await expect(page.getByRole("link", { name: "관리" })).toBeHidden();
});

test("랩 #admin: 새로고침해도 관리 화면에 머물고, 잠금을 푼 상태도 그대로다", async ({ page }) => {
  await loginAsTest(page, "/lab/#admin");
  // 로그인 전에 #admin으로 왔다면 로그인 뒤 바로 관리 화면이다
  await expect(page.getByRole("heading", { name: /관리 잠금/ })).toBeVisible();
  await page.locator('input[type="password"]').fill("e2e-admin-key");
  await page.getByRole("button", { name: "잠금 풀기" }).click();
  await expect(page.getByRole("heading", { name: /향미 승격 후보/ })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: /향미 승격 후보/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "관리" })).toHaveAttribute("aria-current", "page");
});

test("랩 #admin: 관리로 들어갔다가 뒤로 가기·'← 등록으로' 모두 등록 화면으로 돌아온다", async ({ page }) => {
  await loginAsTest(page);
  const work = page.getByRole("button", { name: /직접 입력으로 시작하기/ });
  const lock = page.getByRole("heading", { name: /관리 잠금/ });

  await page.getByRole("button", { name: "관리" }).click();
  await expect(lock).toBeVisible();
  await expect(page).toHaveURL(/#admin$/);
  await page.goBack(); // 랩 밖으로 나가지 않는다
  await expect(work).toBeVisible();
  await expect(page).toHaveURL(/\/lab\/$/);

  await page.goForward();
  await expect(lock).toBeVisible();
  await page.getByRole("button", { name: "← 등록으로" }).click();
  await expect(work).toBeVisible();
  await expect(page).toHaveURL(/\/lab\/$/);
});

test("랩 #admin: 관리자가 아니면 주소를 지우고 등록 화면을 연다", async ({ page }) => {
  await signInAsNewUser(page);
  await page.goto("/lab/#admin");
  await expect(page.getByRole("button", { name: /직접 입력으로 시작하기/ })).toBeVisible();
  await expect(page).toHaveURL(/\/lab\/$/);
  await expect(page.getByRole("button", { name: "관리" })).toHaveCount(0);
});
