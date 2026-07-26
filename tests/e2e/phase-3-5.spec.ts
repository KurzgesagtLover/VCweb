import { expect, test, type Page } from "@playwright/test";

const password = "Demo-password-2087";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(
    email === "admin@virtual.local" ? /\/admin/ : /\/(dashboard|apply|world-intro)/,
  );
  if (page.url().endsWith("/world-intro")) {
    await page.getByRole("button", { name: "입장" }).click();
    await expect(page).toHaveURL(/\/(dashboard|apply)/);
  }
}

async function logout(page: Page) {
  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(page).toHaveURL(/\/login/);
}

async function chooseOpenEvents(page: Page, email: string) {
  await login(page, email);
  await page.goto("/events");
  const forms = page.locator("form.event-options");
  const count = await forms.count();
  for (let index = 0; index < count; index += 1) {
    const form = forms.nth(index);
    const submit = form.getByRole("button", { name: "선택 확정", exact: true });
    if ((await submit.count()) !== 1) continue;
    await form.getByRole("radio").first().check();
    await submit.click();
  }
  await logout(page);
}

test.describe.serial("Phase 3~5 핵심 흐름", () => {
  test.setTimeout(120_000);
  const submissionTitle = `지역 전력망 안정화 ${Date.now()}`;

  test("플레이어가 연재를 작성하고 제출 상태를 확인한다", async ({ page }) => {
    await login(page, "player1@virtual.local");
    await page.goto("/submissions");
    await page.getByRole("button", { name: "+ 연재 작성", exact: true }).click();
    await page.getByLabel("제목").fill(submissionTitle);
    await page.getByLabel("분야").selectOption("ECONOMY");
    await page.getByLabel("연재 지속 기간").fill("2");
    await page
      .getByLabel("실행 목표", { exact: true })
      .fill("지역 전력망의 정전을 줄이고 산업단지 전력 공급을 안정화한다.");
    await page.getByRole("checkbox", { name: "실질 GDP 성장률" }).check();
    await page.getByRole("checkbox", { name: "생산성 지수" }).check();
    await page.getByLabel("연재 예산").fill("18000");
    await page
      .getByLabel("세부 실행사항")
      .fill(
        "산업통상부와 국영 전력공사가 공동 집행기관을 구성해 노후 변전소를 위험도 순서에 따라 단계적으로 교체한다. 첫해 추가경정예산 1만 8천 단위를 편성하고, 산업단지와 정전 취약 지역에 분산형 저장장치를 우선 설치한다. 조달 계약은 공개 경쟁입찰로 진행하며 낙찰 가격과 공정률을 매월 공개한다. 지방정부에는 기술 인력 재교육 비용의 절반을 지원하고, 발전사에는 예비 부품 공동 조달 참여를 조건으로 저리 융자를 제공한다. 감사원은 분기마다 집행률과 정전 시간을 점검하고 목표 미달 지역의 지원 방식을 다음 분기에 조정한다.",
      );
    await page.getByRole("button", { name: "초안 저장" }).click();

    const card = page.locator("article.submission-card").filter({ hasText: submissionTitle });
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "AI 판정 대기열에 제출" }).click();
    await expect(card.getByText("SUBMITTED", { exact: true })).toBeVisible();
  });

  test("지도에서 타국을 선택해 외교 제안을 보낸다", async ({ page }) => {
    await login(page, "player1@virtual.local");
    await page.goto("/diplomacy");
    await page.getByRole("button", { name: "벨라리스 임시정부" }).click();
    await expect(page.getByRole("heading", { name: "벨라리스 임시정부" })).toBeVisible();
    await page.getByLabel("제안 유형").selectOption("TRADE");
    await page.getByLabel("제목").fill("전력 장비 공동 조달 협정");
    await page
      .getByLabel("내용")
      .fill(
        "양국 공공기관이 변압기와 저장장치를 공동 조달하고 납기 정보를 상호 공개할 것을 제안합니다.",
      );
    await page.getByRole("button", { name: "외교 제안 보내기" }).click();
    await expect(page.getByRole("heading", { name: "전력 장비 공동 조달 협정" })).toBeVisible();
    await expect(page.getByText("SENT", { exact: true })).toBeVisible();
  });

  test("관리자가 AI 판정 diff를 수정해 승인한다", async ({ page }) => {
    await login(page, "admin@virtual.local");
    await page.goto("/admin/submissions");
    let card = page.locator("article.panel").filter({ hasText: "청색 항로 현대화 계획" });
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "새 실행으로 재생성" }).click();

    card = page.locator("article.panel").filter({ hasText: "청색 항로 현대화 계획" });
    await expect(card.getByLabel("플레이어 공개 요약")).toBeVisible();
    await card
      .getByLabel("플레이어 공개 요약")
      .fill("항만 현대화 사업을 수정 조건으로 승인했습니다.");
    await card.getByLabel("값").fill("3");
    await card.getByRole("button", { name: "수정값으로 승인" }).click();
    await expect(card.getByText("APPROVED", { exact: true })).toBeVisible();
  });

  test("관리자가 턴을 공개하면 새 사건과 반영 지표가 표시된다", async ({ page }) => {
    await login(page, "player1@virtual.local");
    await page.goto("/dashboard");
    const approvalCard = page.locator("article.metric-card").filter({ hasText: "정부 지지도" });
    const approvalBefore = await approvalCard.locator("strong").innerText();
    await logout(page);

    await chooseOpenEvents(page, "player1@virtual.local");
    await chooseOpenEvents(page, "player2@virtual.local");
    await login(page, "admin@virtual.local");
    await page.goto("/admin");

    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "1. 턴 잠금" }).click();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "2. 계산 작업 생성" }).click();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "3. 대기 작업 실행" }).click();
    await expect(page.getByText("REVIEW", { exact: true })).toBeVisible();

    await page.goto("/admin/submissions");
    while ((await page.getByRole("button", { name: "수정값으로 승인" }).count()) > 0) {
      await page.getByRole("button", { name: "수정값으로 승인" }).first().click();
    }

    await page.goto("/admin/events");
    while ((await page.getByRole("button", { name: "공개 승인" }).count()) > 0) {
      await page.getByRole("button", { name: "공개 승인" }).first().click();
    }
    while ((await page.getByRole("button", { name: "사건으로 승인" }).count()) > 0) {
      await page.getByRole("button", { name: "사건으로 승인" }).first().click();
    }

    await page.goto("/admin");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "4. 턴 최종 공개" }).click();
    await expect(page.getByText("DRAFT", { exact: true })).toBeVisible();
    await logout(page);

    await login(page, "player1@virtual.local");
    await page.goto("/events");
    await expect(page.getByRole("heading", { name: "항만 물류망의 병목 신호" })).toBeVisible();
    await page.goto("/dashboard");
    const approvalAfter = await page
      .locator("article.metric-card")
      .filter({ hasText: "정부 지지도" })
      .locator("strong")
      .innerText();
    expect(approvalAfter).not.toBe(approvalBefore);
  });
});
