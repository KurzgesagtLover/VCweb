import { expect, test } from "@playwright/test";

test("player sees the ten overview cards and expandable economy evidence", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("이메일").fill("player1@virtual.local");
  await page.getByLabel("비밀번호").fill("Demo-password-2087");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto("/country/overview");
  await expect(page.getByRole("heading", { name: "국가 개요" })).toBeVisible();
  await expect(page.locator(".metric-card")).toHaveCount(10);
  await page.getByText("세부 정보 보기").click();
  await expect(page.getByText("국가(國歌)")).toBeVisible();

  await page.goto("/country/economy");
  await page.getByText("계산 근거 보기").click();
  await expect(page.getByText("생산성 향상")).toBeVisible();
});

test("unassigned user cannot access country pages", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("이메일").fill("user@virtual.local");
  await page.getByLabel("비밀번호").fill("Demo-password-2087");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/apply/);
  await page.goto("/country/overview");
  await expect(page).toHaveURL(/\/apply/);
});
