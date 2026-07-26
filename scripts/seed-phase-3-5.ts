import { and, desc, eq } from "drizzle-orm";
import { db, sqlClient } from "../src/db";
import {
  campaigns,
  countries,
  countryRelations,
  diplomaticOrientations,
  eventOptions,
  events,
  submissions,
  submissionVersions,
  turns,
  users,
} from "../src/db/schema";

async function seedPhaseThreeToFive() {
  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.slug, "arcadia-2087"),
  });
  if (!campaign) throw new Error("기본 시드를 먼저 실행해 주세요.");
  const [countryRows, currentTurn, player] = await Promise.all([
    db.query.countries.findMany({ where: eq(countries.campaignId, campaign.id) }),
    db.query.turns.findFirst({
      where: eq(turns.campaignId, campaign.id),
      orderBy: [desc(turns.sequence)],
    }),
    db.query.users.findFirst({ where: eq(users.email, "player1@virtual.local") }),
  ]);
  if (!currentTurn || !player) throw new Error("턴 또는 플레이어 시드가 없습니다.");

  for (const from of countryRows) {
    await db
      .insert(diplomaticOrientations)
      .values({
        countryId: from.id,
        publicPrinciples: `${from.name}은 상호 주권과 실용 협력을 외교 원칙으로 삼는다.`,
        interests: ["안정적 교역", "기술 협력"],
        taboos: ["강제 영토 변경", "비공개 내정 개입"],
        riskTolerance: from.isAi ? 58 : 46,
        goals: ["지역 안정", "공급망 다변화"],
        privateContext: from.isAi ? { negotiationStyle: "조건부 실용주의" } : {},
      })
      .onConflictDoNothing({ target: diplomaticOrientations.countryId });
    for (const to of countryRows) {
      if (from.id === to.id) continue;
      const score = from.code.charCodeAt(0) - to.code.charCodeAt(0);
      await db
        .insert(countryRelations)
        .values({
          campaignId: campaign.id,
          fromCountryId: from.id,
          toCountryId: to.id,
          score: Math.max(-20, Math.min(35, score)),
          tags: [from.isAi === to.isAi ? "실무 협력" : "관계 탐색"],
          lastInteraction: "재건 회의에서 상호 연락 채널을 열었다.",
        })
        .onConflictDoNothing({
          target: [
            countryRelations.campaignId,
            countryRelations.fromCountryId,
            countryRelations.toCountryId,
          ],
        });
    }
  }

  const playerCountry = countryRows.find((country) => country.code === "AST")!;
  const seededSubmission = await db.query.submissions.findFirst({
    where: and(
      eq(submissions.countryId, playerCountry.id),
      eq(submissions.title, "청색 항로 현대화 계획"),
    ),
  });
  if (!seededSubmission) {
    const body =
      "해양 물류의 병목 구간을 정비하고 항만 전력망을 단계적으로 교체한다. 1차 사업은 루멘항 자동 하역 설비와 철도 연결선을 대상으로 하며, 공개 입찰과 분기별 감사를 병행한다. 지역 고용이 급감하지 않도록 재교육 예산을 함께 편성한다.";
    const [submission] = await db
      .insert(submissions)
      .values({
        campaignId: campaign.id,
        countryId: playerCountry.id,
        userId: player.id,
        turnId: currentTurn.id,
        title: "청색 항로 현대화 계획",
        category: "ECONOMY",
        body,
        goal: "항만 처리량과 산업 생산성을 높이면서 지역 고용 충격을 줄인다.",
        expectedDurationTurns: 2,
        budget: "42000",
        status: "SUBMITTED",
        characterCount: body.length,
        estimatedTokens: Math.ceil(body.length / 3),
        submittedAt: new Date(),
      })
      .returning();
    await db.insert(submissionVersions).values({
      submissionId: submission.id,
      version: 1,
      title: submission.title,
      body,
      metadata: {
        category: "ECONOMY",
        goal: submission.goal,
        expectedDurationTurns: 2,
        budget: "42000",
      },
      createdBy: player.id,
    });
  }

  const eventSourceId = `${campaign.id}:harbor-labor-dialogue`;
  const seededEvent = await db.query.events.findFirst({
    where: and(eq(events.sourceType, "ADMIN_SEED"), eq(events.sourceId, eventSourceId)),
  });
  if (!seededEvent) {
    const [event] = await db
      .insert(events)
      .values({
        campaignId: campaign.id,
        countryId: playerCountry.id,
        title: "부두 노동협약 갱신",
        subtitle: "현장의 신뢰가 시험대에 올랐다",
        body: "항만 자동화 일정이 앞당겨지면서 노동조합이 고용 보장과 재교육 기금의 명문화 여부를 묻고 있다.",
        backgroundImageKey: "harbor-dawn",
        portraitImageKey: "union-delegate",
        visibility: "COUNTRY",
        status: "PUBLISHED",
        startTurnId: currentTurn.id,
        sourceType: "ADMIN_SEED",
        sourceId: eventSourceId,
        required: true,
        choiceMutable: true,
        publishedAt: new Date(),
      })
      .returning();
    await db.insert(eventOptions).values([
      {
        eventId: event.id,
        order: 1,
        label: "재교육·고용 협약 체결",
        description: "자동화 이익의 일부를 전환 교육과 고용 안전망에 배정합니다.",
        expectedEffect: "지지도 상승, 생산성 개선 속도 완화",
        effects: [
          {
            targetType: "COUNTRY",
            targetId: playerCountry.id,
            metric: "governmentApproval",
            operation: "ADD",
            value: "3",
            durationTurns: 2,
            reason: "사회적 합의 형성",
          },
        ],
      },
      {
        eventId: event.id,
        order: 2,
        label: "현 일정대로 자동화 추진",
        description: "도입 속도를 유지하고 사후 보완책을 마련합니다.",
        expectedEffect: "생산성 상승, 단기 사회 불안",
        effects: [
          {
            targetType: "COUNTRY",
            targetId: playerCountry.id,
            metric: "unrest",
            operation: "ADD",
            value: "3",
            durationTurns: 1,
            reason: "고용 불확실성 확대",
          },
        ],
      },
    ]);
  }
  console.log("Phase 3-5 demo data ready.");
}

seedPhaseThreeToFive().finally(() => sqlClient.end());
