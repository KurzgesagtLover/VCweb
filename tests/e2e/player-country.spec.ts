import { expect, test, type Page } from "@playwright/test";

const password = "Demo-password-2087";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(password);
  await page.getByRole("button", { name: "접속" }).click();
  await page.waitForURL(/\/(diplomacy|dashboard|apply|world-intro)/);
  if (page.url().includes("/world-intro")) {
    const enter = page.getByRole("button", { name: "입장" });
    if (await enter.count()) await enter.click();
  }
  await page.waitForURL(/\/(diplomacy|dashboard|apply)/);
}

test("player sees the consolidated briefing window and expandable economy evidence", async ({
  page,
}) => {
  await login(page, "player2@virtual.local");
  await expect(page).toHaveURL(/\/diplomacy/);

  await page.goto("/country/overview");
  await expect(page).toHaveURL(/\/dashboard\?tab=profile/);
  await expect(page.getByRole("heading", { name: "국가 브리핑" })).toBeVisible();
  await expect(page.locator(".tno-headline")).toHaveCount(4);
  await expect(page.getByRole("heading", { name: "국가 상징" })).toBeVisible();
  await page.getByRole("link", { name: "브리핑", exact: true }).click();
  await expect(page.getByRole("heading", { name: "정치 계기판" })).toBeVisible();

  await page.goto("/country/economy");
  await page.getByRole("button", { name: "재정" }).click();
  await expect(page.getByRole("heading", { name: "계산 근거" })).toBeVisible();
  await page.locator(".tno-basis-list summary").first().click();
  await expect(page.locator(".tno-basis-list details[open] li").first()).toBeVisible();
});

test("unassigned user cannot access country pages", async ({ page }) => {
  await login(page, "user@virtual.local");
  await expect(page).toHaveURL(/\/apply/);
  await page.goto("/country/overview");
  await expect(page).toHaveURL(/\/apply/);
});
