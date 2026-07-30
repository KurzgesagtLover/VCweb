import { expect, test } from "@playwright/test";

const password = "Demo-password-2087";

async function login(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(password);
  await page.getByRole("button", { name: "접속" }).click();
}

test("관리자는 국가 신청 대신 운영 화면으로 이동한다", async ({ page }) => {
  await login(page, "admin@virtual.local");
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/apply");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "캠페인 운영 현황" })).toBeVisible();
});

test("플레이어가 캠페인 채널에 메시지를 보내고 답글을 남긴다", async ({ page }) => {
  await login(page, "player1@virtual.local");
  await page.goto("/chat");
  await page.getByRole("link", { name: /세계 광장/ }).click();
  const message = `실시간 채팅 검증 ${Date.now()}`;
  await page.getByLabel("메시지").fill(message);
  await page.getByRole("button", { name: "보내기" }).click();
  await expect(page.getByText(message)).toBeVisible();
  const card = page.locator("article.chat-message").filter({ hasText: message });
  await card.getByRole("link", { name: "답글" }).click();
  await page.getByLabel("답글").fill("확인했습니다.");
  await page.getByRole("button", { name: "보내기" }).click();
  await expect(page.getByText("확인했습니다.")).toBeVisible();
});

test("운영자가 메시지를 삭제하고 플레이어에게 타임아웃을 적용한다", async ({ page }) => {
  await login(page, "moderator@virtual.local");
  await expect(page).toHaveURL(/\/admin\/moderation/);
  const playerRow = page.getByRole("row").filter({ hasText: "player1@virtual.local" });
  await playerRow.getByLabel("타임아웃 시간").selectOption("10");
  await playerRow.getByLabel("조치 사유").fill("자동화된 운영 검증");
  await playerRow.getByRole("button", { name: "타임아웃", exact: true }).click();
  await expect(playerRow.getByRole("button", { name: "타임아웃 해제" })).toBeVisible();
  await playerRow.getByLabel("조치 사유").fill("자동화 검증 종료");
  await playerRow.getByRole("button", { name: "타임아웃 해제" }).click();
});
