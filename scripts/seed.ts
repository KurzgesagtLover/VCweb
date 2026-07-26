import { eq } from "drizzle-orm";
import Decimal from "decimal.js";
import { auth } from "../src/auth/auth";
import { db, sqlClient } from "../src/db";
import {
  campaignMemberships,
  campaignMaps,
  campaigns,
  countries,
  countryAssignments,
  countryOffices,
  countryProfileRevisions,
  countryResearch,
  countrySetupSubmissions,
  demographicSnapshots,
  economicSectors,
  economicSnapshots,
  financialInstitutions,
  governmentOfficeDefinitions,
  governmentOfficeHolders,
  majorCompanies,
  parties,
  partySnapshots,
  politicalSnapshots,
  simulationRules,
  techNodes,
  techPrerequisites,
  turns,
  users,
} from "../src/db/schema";
import { DEFAULT_ECONOMY_RULES } from "../src/domain/economy/calculator";
import { assertValidTechGraph } from "../src/domain/research/graph";
import { nextTurnDeadline } from "../src/domain/turn/schedule";

const password = "Demo-password-2087";

async function ensureUser(input: {
  name: string;
  email: string;
  role: "USER" | "PLAYER" | "MODERATOR" | "ADMIN";
}) {
  const existing = await db.query.users.findFirst({ where: eq(users.email, input.email) });
  let userId = existing?.id;
  if (!userId) {
    const result = await auth.api.signUpEmail({
      body: { name: input.name, email: input.email, password },
    });
    userId = result.user.id;
  }
  const [updated] = await db
    .update(users)
    .set({ role: input.role, status: "ACTIVE", updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  if (!updated) throw new Error(`${input.email} 계정을 만들지 못했습니다.`);
  return updated;
}

const countrySeeds = [
  {
    code: "AST",
    name: "아스테라 해양공화국",
    color: "#55b5c5",
    isAi: false,
    flag: "✦",
    capital: "루멘항",
    form: "의회 공화국",
    leader: "한세린 의장",
    currency: "AST",
    industries: ["해운", "정밀기계", "해양에너지"],
    population: "28400000",
    area: "212400",
    gdp: "1260000",
    growth: "0.034",
    inflation: "0.027",
    unemployment: "0.046",
    stability: 72,
    approval: 64,
  },
  {
    code: "VEL",
    name: "벨라리스 임시정부",
    color: "#ca9361",
    isAi: false,
    flag: "◬",
    capital: "세라",
    form: "과도 정부",
    leader: "민정위원회",
    currency: "VEL",
    industries: ["농업", "건설", "희토류"],
    population: "17200000",
    area: "330000",
    gdp: "460000",
    growth: "0.012",
    inflation: "0.061",
    unemployment: "0.089",
    stability: 44,
    approval: 41,
  },
  {
    code: "NOR",
    name: "노린 기술연방",
    color: "#987bd1",
    isAi: true,
    flag: "⬡",
    capital: "카이론",
    form: "기술관료 연방",
    leader: "연방조정관 이레나",
    currency: "NOR",
    industries: ["반도체", "로보틱스", "양자통신"],
    population: "41800000",
    area: "481000",
    gdp: "2380000",
    growth: "0.047",
    inflation: "0.021",
    unemployment: "0.038",
    stability: 78,
    approval: 69,
  },
  {
    code: "ORV",
    name: "오르베 공동체",
    color: "#7fbd79",
    isAi: true,
    flag: "❖",
    capital: "나무르",
    form: "평의회 공동체",
    leader: "수석조정자 레오",
    currency: "ORV",
    industries: ["산림", "수력", "생명공학"],
    population: "12600000",
    area: "542000",
    gdp: "510000",
    growth: "0.026",
    inflation: "0.019",
    unemployment: "0.051",
    stability: 67,
    approval: 61,
  },
] as const;

const techSeed = [
  ["ENERGY_GRID", "고효율 전력망", "에너지", 1, "분산 전력 손실을 줄이는 기반망", "40"],
  ["SMART_GRID", "지능형 전력망", "에너지", 2, "수요 예측과 저장장치를 통합", "70"],
  ["FUSION_MATERIAL", "핵융합 재료", "에너지", 3, "고열속 내벽 소재 상용화", "120"],
  ["FUSION_GRID", "핵융합 계통", "에너지", 4, "핵융합 전력을 국가망에 연결", "180"],
  ["BASIC_AUTOMATION", "산업 자동화", "산업", 1, "반복 공정의 자동화 표준", "45"],
  ["ROBOTICS", "협업 로보틱스", "산업", 2, "사람과 함께 일하는 생산 로봇", "75"],
  ["AUTONOMOUS_FACTORY", "자율 공장", "산업", 3, "생산 계획부터 품질 관리까지 자동화", "125"],
  ["MOLECULAR_ASSEMBLY", "분자 조립", "산업", 4, "나노 단위 정밀 생산 기반", "190"],
  ["DIGITAL_ADMIN", "디지털 행정", "사회", 1, "통합 행정 기록과 공개 절차", "35"],
  ["CIVIC_MODEL", "시민 참여 모델", "사회", 2, "정책 숙의와 피드백 체계", "65"],
  ["WELFARE_PREDICTION", "복지 수요 예측", "사회", 3, "지역별 복지 수요 조기 탐지", "105"],
  ["POST_SCARCITY_POLICY", "풍요사회 제도", "사회", 4, "자동화 배당과 공공재 배분 연구", "170"],
  ["CROP_SENSORS", "정밀 농업", "생명", 1, "토양과 작황 센서망", "40"],
  ["GENE_CROP", "기후 적응 작물", "생명", 2, "고온·염분 환경의 안정 생산", "75"],
  ["SYNTH_BIO", "합성 생물학", "생명", 3, "표준화된 생물 생산 공정", "130"],
  ["LONGEVITY", "건강수명 공학", "생명", 4, "만성 질환과 노화 지연", "185"],
  ["FIBER_BACKBONE", "광통신 간선", "정보", 1, "도시 간 고신뢰 통신망", "35"],
  ["QUANTUM_CRYPTO", "양자 암호", "정보", 2, "핵심 행정망의 내성 강화", "80"],
  ["QUANTUM_NETWORK", "양자 중계망", "정보", 3, "장거리 양자 상태 전송", "135"],
  ["PLANETARY_COMPUTE", "행성 연산망", "정보", 4, "분산 연산 자원의 공공 통합", "200"],
  ["RAIL_STANDARD", "광역 철도 표준", "인프라", 1, "궤간과 신호 체계 통합", "45"],
  ["MAGLEV", "자기부상 간선", "인프라", 2, "대도시권 초고속 연결", "85"],
  ["ORBITAL_LOGISTICS", "궤도 물류", "인프라", 3, "저궤도 화물 운송 체계", "145"],
  ["SPACE_ELEVATOR", "궤도 승강기", "인프라", 4, "대규모 지상-궤도 물류", "220"],
] as const;

const techEdges = [
  ["SMART_GRID", "ENERGY_GRID"],
  ["FUSION_MATERIAL", "SMART_GRID"],
  ["FUSION_GRID", "FUSION_MATERIAL"],
  ["ROBOTICS", "BASIC_AUTOMATION"],
  ["AUTONOMOUS_FACTORY", "ROBOTICS"],
  ["MOLECULAR_ASSEMBLY", "AUTONOMOUS_FACTORY"],
  ["CIVIC_MODEL", "DIGITAL_ADMIN"],
  ["WELFARE_PREDICTION", "CIVIC_MODEL"],
  ["POST_SCARCITY_POLICY", "WELFARE_PREDICTION"],
  ["GENE_CROP", "CROP_SENSORS"],
  ["SYNTH_BIO", "GENE_CROP"],
  ["LONGEVITY", "SYNTH_BIO"],
  ["QUANTUM_CRYPTO", "FIBER_BACKBONE"],
  ["QUANTUM_NETWORK", "QUANTUM_CRYPTO"],
  ["PLANETARY_COMPUTE", "QUANTUM_NETWORK"],
  ["MAGLEV", "RAIL_STANDARD"],
  ["ORBITAL_LOGISTICS", "MAGLEV"],
  ["SPACE_ELEVATOR", "ORBITAL_LOGISTICS"],
] as const;

async function seed() {
  const existing = await db.query.campaigns.findFirst({
    where: eq(campaigns.slug, "arcadia-2087"),
  });
  if (existing) {
    console.log("Seed already exists; nothing changed.");
    return;
  }

  const [admin, moderator, playerOne, playerTwo, unassigned] = await Promise.all([
    ensureUser({ name: "총괄 관리자", email: "admin@virtual.local", role: "ADMIN" }),
    ensureUser({ name: "운영 조정관", email: "moderator@virtual.local", role: "MODERATOR" }),
    ensureUser({ name: "아스테라 대표", email: "player1@virtual.local", role: "PLAYER" }),
    ensureUser({ name: "벨라리스 대표", email: "player2@virtual.local", role: "PLAYER" }),
    ensureUser({ name: "배정 대기자", email: "user@virtual.local", role: "USER" }),
  ]);

  await db.transaction(async (tx) => {
    const [campaign] = await tx
      .insert(campaigns)
      .values({
        name: "아르카디아 재건 체제",
        slug: "arcadia-2087",
        lore: "통신 대붕괴 이후 네 국가가 새로운 국제 질서를 만드는 캠페인",
        isActive: true,
        startGameDate: "2080-01-01",
        monthsPerTurn: 12,
        rulesVersion: "v1",
      })
      .returning();

    await tx.insert(campaignMaps).values({
      campaignId: campaign.id,
      position: 1,
      name: "지도 1",
    });

    await tx.insert(campaignMemberships).values([
      { campaignId: campaign.id, userId: admin.id, role: "ADMIN" },
      { campaignId: campaign.id, userId: moderator.id, role: "MODERATOR" },
      { campaignId: campaign.id, userId: playerOne.id, role: "PLAYER" },
      { campaignId: campaign.id, userId: playerTwo.id, role: "PLAYER" },
      { campaignId: campaign.id, userId: unassigned.id, role: "USER" },
    ]);

    const turnRows = await tx
      .insert(turns)
      .values(
        Array.from({ length: 8 }, (_, index) => ({
          campaignId: campaign.id,
          sequence: index + 1,
          gameDateStart: `${2080 + index}-01-01`,
          gameDateEnd: `${2080 + index}-12-31`,
          status: index === 7 ? ("DRAFT" as const) : ("PUBLISHED" as const),
          deadlineAt: index === 7 ? nextTurnDeadline() : null,
          stepCompletedAt:
            index === 7
              ? ({} as Record<string, string>)
              : { PUBLISHED: `${2081 + index}-01-01T00:00:00.000Z` },
        })),
      )
      .returning();

    await tx.insert(simulationRules).values({
      campaignId: campaign.id,
      version: DEFAULT_ECONOMY_RULES.version,
      coefficients: DEFAULT_ECONOMY_RULES.coefficients,
      ranges: {
        growth: { min: DEFAULT_ECONOMY_RULES.growthMin, max: DEFAULT_ECONOMY_RULES.growthMax },
      },
      isActive: true,
    });

    const countryRows = await tx
      .insert(countries)
      .values(
        countrySeeds.map((country, index) => ({
          campaignId: campaign.id,
          name: country.name,
          code: country.code,
          color: country.color,
          isAi: country.isAi,
          setupStatus: index === 1 ? ("SUBMITTED" as const) : ("APPROVED" as const),
        })),
      )
      .returning();
    const countryByCode = new Map(countryRows.map((country) => [country.code, country]));

    await tx.insert(countryAssignments).values([
      {
        campaignId: campaign.id,
        countryId: countryByCode.get("AST")!.id,
        userId: playerOne.id,
        startTurnId: turnRows[0].id,
      },
      {
        campaignId: campaign.id,
        countryId: countryByCode.get("VEL")!.id,
        userId: playerTwo.id,
        startTurnId: turnRows[0].id,
      },
    ]);

    for (const seedCountry of countrySeeds.filter((country) => country.code !== "VEL")) {
      const country = countryByCode.get(seedCountry.code)!;
      const [profile] = await tx
        .insert(countryProfileRevisions)
        .values({
          countryId: country.id,
          revision: 1,
          status: "APPROVED",
          flag: seedCountry.flag,
          motto:
            seedCountry.code === "AST"
              ? "바다가 길을 연다"
              : seedCountry.code === "NOR"
                ? "지식은 공동의 기반"
                : "살아 있는 땅, 함께 사는 사람",
          nationalAnthem: `${seedCountry.name}의 새벽`,
          nationalTree: "은빛삼나무",
          nationalFlower: "푸른별꽃",
          nationalBird: "장거리제비",
          nationalAnimal: "설원여우",
          history: `${seedCountry.name}은 통신 대붕괴 이후 지역 행정과 기반 시설을 재편하며 현재의 체제를 수립했다.`,
          timeline: [
            { year: "2084", event: "통신 대붕괴 대응 비상체제 선포" },
            { year: "2086", event: "현행 기본협약 채택" },
          ],
          planet: "아르카디아",
          capital: seedCountry.capital,
          largestCity: `${seedCountry.capital} 광역권`,
          totalAreaKm2: seedCountry.area,
          inlandWaterRatio: "0.04",
          officialLanguages: ["공용 아르카어"],
          officialScripts: ["표준 음절문자"],
          governmentForm: seedCountry.form,
          officialCurrency: seedCountry.currency,
          currencyCode: seedCountry.currency,
          majorIndustries: [...seedCountry.industries],
          approvedBy: admin.id,
          approvedAt: new Date(),
        })
        .returning();
      await tx
        .update(countries)
        .set({ currentProfileRevisionId: profile.id })
        .where(eq(countries.id, country.id));
      await tx.insert(countryOffices).values({
        countryId: country.id,
        officeType: "HEAD_OF_STATE",
        holderName: seedCountry.leader,
        startTurnId: turnRows[0].id,
      });

      for (const [index, turn] of turnRows.entries()) {
        const step = new Decimal(index).minus(7);
        const population = new Decimal(seedCountry.population).mul(
          new Decimal(1).plus(step.mul("0.004")),
        );
        const realGdp = new Decimal(seedCountry.gdp).mul(
          new Decimal(1).plus(step.mul(seedCountry.growth)),
        );
        const inflation = Decimal.max(
          "-0.02",
          new Decimal(seedCountry.inflation).plus(step.mul("0.0012")),
        );
        const growth = new Decimal(seedCountry.growth).plus(step.mul("0.001"));
        const nominal = realGdp.mul(new Decimal(1).plus(inflation));
        const spending = nominal.mul("0.23");
        const revenue = nominal.mul("0.215");
        const debt = nominal.mul(new Decimal("0.46").minus(step.mul("0.003")));
        await tx.insert(demographicSnapshots).values({
          countryId: country.id,
          turnId: turn.id,
          population: population.toFixed(0),
          citizensAbroad: population.mul("0.012").toFixed(0),
          foreignResidents: population.mul("0.018").toFixed(0),
          diaspora: population.mul("0.03").toFixed(0),
          fertilityRate: "1.72",
          populationGrowthRate: "0.004",
          lifeExpectancy: "81.4",
          medianAge: new Decimal("40.2").plus(index * 0.2).toString(),
          populationDensity: population.div(seedCountry.area).toString(),
        });
        await tx.insert(economicSnapshots).values({
          countryId: country.id,
          turnId: turn.id,
          realGdp: realGdp.toFixed(4),
          nominalGdp: nominal.toFixed(4),
          realGdpGrowth: growth.toString(),
          gdpDeflator: new Decimal(1).plus(inflation).toString(),
          realGni: realGdp.mul("1.012").toFixed(4),
          realGnp: realGdp.mul("1.008").toFixed(4),
          wealth: realGdp.mul("4.4").toFixed(4),
          foreignReserves: realGdp.mul("0.19").toFixed(4),
          currencyCode: seedCountry.currency,
          currencyValue: new Decimal("1.0").plus(step.mul("0.002")).toString(),
          creditRating: index > 4 ? "A" : "BBB+",
          creditScore: 72 + Math.min(index, 5),
          incomeGini: new Decimal("0.34").minus(index * 0.001).toString(),
          wealthGini: new Decimal("0.59").minus(index * 0.0005).toString(),
          inflationRate: inflation.toString(),
          landPriceGrowth: inflation.plus("0.012").toString(),
          unemploymentRate: new Decimal(seedCountry.unemployment)
            .minus(step.mul("0.001"))
            .toString(),
          governmentRevenue: revenue.toFixed(4),
          governmentSpending: spending.toFixed(4),
          governmentSpendingGrowth: "0.026",
          fiscalBalance: revenue.minus(spending).toFixed(4),
          nationalDebt: debt.toFixed(4),
          debtToGdp: debt.div(nominal).toString(),
          policyRate: inflation.plus("0.008").toString(),
          currentAccountToGdp: "0.018",
          productivityIndex: new Decimal(100).plus(index * 1.8).toString(),
          referenceYear: 2080,
          priceBasis: "constant",
          rulesVersion: "v1",
          contributions: {
            growth: [
              { source: "productivityIndex", value: "0.014", explanation: "생산성 향상" },
              {
                source: "sectorShareWeightedGrowth",
                value: "0.009",
                explanation: "주요 산업 기여",
              },
            ],
            inflation: [
              { source: "inflationRate", value: inflation.toString(), explanation: "물가 관성" },
            ],
          },
        });
        await tx.insert(politicalSnapshots).values({
          countryId: country.id,
          turnId: turn.id,
          governmentForm: seedCountry.form,
          headOfState: seedCountry.leader,
          headOfGovernment: "내각 조정관",
          assemblySpeaker: "의회 의장",
          chiefJustice: "최고재판관",
          rulingParty: "재건연합",
          oppositionParty: "미래개혁당",
          stability: Math.max(0, seedCountry.stability + index - 7),
          legitimacy: 68 + Math.floor(index / 2),
          governmentApproval: Math.max(0, seedCountry.approval + index - 7),
          unrest: Math.max(0, 33 - index),
          stateCapacity: 66 + Math.floor(index / 2),
          corruption: 31 - Math.floor(index / 3),
          democracy: 72,
        });
        await tx.insert(economicSectors).values(
          seedCountry.industries.map((industry, sectorIndex) => ({
            countryId: country.id,
            turnId: turn.id,
            code: `${seedCountry.code}-${sectorIndex + 1}`,
            name: industry,
            share: sectorIndex === 0 ? "0.42" : sectorIndex === 1 ? "0.33" : "0.25",
            productionIndex: new Decimal(100).plus(index * 2 + sectorIndex).toString(),
            productivity: new Decimal(100).plus(index * 1.4).toString(),
            growthRate: growth.plus(sectorIndex * 0.002).toString(),
          })),
        );
      }

      await tx.insert(financialInstitutions).values([
        {
          countryId: country.id,
          name: `${seedCountry.capital} 중앙은행`,
          systemicImportance: 95,
          health: 78,
          industryTags: ["중앙은행", "통화정책"],
        },
        {
          countryId: country.id,
          name: `${seedCountry.name} 산업은행`,
          systemicImportance: 72,
          health: 69,
          industryTags: ["상업은행", "기업금융"],
        },
      ]);
      await tx.insert(majorCompanies).values(
        seedCountry.industries.map((industry, index) => ({
          countryId: country.id,
          name: `${seedCountry.code} ${industry}공사`,
          industry,
          sizeIndex: 82 - index * 7,
          stateOwned: index === 0,
          systemicImportance: 88 - index * 9,
          health: 74 - index * 4,
          industryTags: [industry, index === 0 ? "기간산업" : "수출산업"],
        })),
      );

      const officeRows = await tx
        .insert(governmentOfficeDefinitions)
        .values([
          {
            countryId: country.id,
            branch: "EXECUTIVE",
            title: "국가원수",
            seatCount: 1,
            displayOrder: 10,
          },
          {
            countryId: country.id,
            branch: "EXECUTIVE",
            title: "행정부 수반",
            seatCount: 1,
            displayOrder: 20,
          },
          {
            countryId: country.id,
            branch: "JUDICIAL",
            title: "최고재판관",
            seatCount: 1,
            displayOrder: 10,
          },
          {
            countryId: country.id,
            branch: "LEGISLATIVE",
            title: "의회 의장",
            seatCount: 1,
            displayOrder: 10,
          },
        ])
        .returning();
      const holderByTitle: Record<string, string> = {
        국가원수: seedCountry.leader,
        "행정부 수반": "내각 조정관",
        최고재판관: "최고재판관",
        "의회 의장": "의회 의장",
      };
      await tx.insert(governmentOfficeHolders).values(
        officeRows.map((office) => ({
          officeId: office.id,
          slotNumber: 1,
          holderName: holderByTitle[office.title],
          startTurnId: turnRows[0].id,
        })),
      );

      const partyRows = await tx
        .insert(parties)
        .values([
          {
            countryId: country.id,
            code: "REBUILD",
            name: "재건연합",
            color: "#d4a85f",
            economicAxis: 10,
            socialAxis: 5,
          },
          {
            countryId: country.id,
            code: "FUTURE",
            name: "미래개혁당",
            color: "#58a9c0",
            economicAxis: -20,
            socialAxis: -35,
          },
          {
            countryId: country.id,
            code: "COMMON",
            name: "공동체녹색당",
            color: "#6dab72",
            economicAxis: -45,
            socialAxis: -15,
          },
        ])
        .returning();
      for (const [index, turn] of turnRows.entries()) {
        await tx.insert(partySnapshots).values(
          partyRows.map((party, partyIndex) => ({
            partyId: party.id,
            turnId: turn.id,
            support:
              partyIndex === 0
                ? new Decimal("0.47").plus(index * 0.002).toString()
                : partyIndex === 1
                  ? new Decimal("0.34").minus(index * 0.001).toString()
                  : new Decimal("0.19").minus(index * 0.001).toString(),
            seats: partyIndex === 0 ? 112 : partyIndex === 1 ? 78 : 45,
            organization: 62 - partyIndex * 4 + index,
            isGovernment: partyIndex === 0,
          })),
        );
      }
    }

    const vel = countryByCode.get("VEL")!;
    await tx.insert(countrySetupSubmissions).values({
      countryId: vel.id,
      submittedBy: playerTwo.id,
      status: "SUBMITTED",
      quickSetup: {
        countryName: "벨라리스 연방공화국",
        flag: "◬",
        capital: "세라",
        governmentForm: "연방 공화국",
        headOfState: "아린 벨 의장",
        population: "17200000",
        totalAreaKm2: "330000",
        realGdp: "460000",
        currencyCode: "VEL",
        currencyValue: "0.82",
        majorIndustries: "농업, 건설, 희토류",
      },
    });
    await tx.insert(countrySetupSubmissions).values({
      countryId: countryByCode.get("AST")!.id,
      submittedBy: playerOne.id,
      status: "APPROVED",
      quickSetup: {
        countryName: "아스테라 해양공화국",
        flag: "✦",
        capital: "루멘항",
        governmentForm: "의회 공화국",
        headOfState: "한세린 의장",
        population: "28400000",
        totalAreaKm2: "212400",
        realGdp: "1260000",
        currencyCode: "AST",
        currencyValue: "1",
        majorIndustries: "해운, 정밀기계, 해양에너지",
      },
      reviewedBy: admin.id,
      reviewedAt: new Date(),
    });

    assertValidTechGraph(
      techSeed.map(([code]) => code),
      techEdges.map(([tech, prerequisite]) => ({ tech, prerequisite })),
    );
    const nodeRows = await tx
      .insert(techNodes)
      .values(
        techSeed.map(([code, name, field, era, description, cost]) => ({
          campaignId: campaign.id,
          code,
          name,
          field,
          era,
          description,
          cost,
          effects: [
            { metric: "productivityIndex", operation: "ADD" as const, value: String(era * 1.5) },
          ],
        })),
      )
      .returning();
    const nodeByCode = new Map(nodeRows.map((node) => [node.code, node]));
    await tx.insert(techPrerequisites).values(
      techEdges.map(([tech, prerequisite]) => ({
        techNodeId: nodeByCode.get(tech)!.id,
        prerequisiteId: nodeByCode.get(prerequisite)!.id,
      })),
    );
    for (const country of countryRows) {
      await tx.insert(countryResearch).values(
        nodeRows
          .filter((node) => node.era === 1)
          .map((node, index) => ({
            countryId: country.id,
            techNodeId: node.id,
            status: index < 2 ? ("COMPLETED" as const) : ("AVAILABLE" as const),
            progressPoints: index < 2 ? node.cost : "0",
            startedTurnId: turnRows[0].id,
            completedTurnId: index < 2 ? turnRows[2].id : null,
          })),
      );
    }
  });

  console.log("Seed complete.");
  console.log("Development password for every demo account:", password);
  console.log("Admin: admin@virtual.local / Player: player1@virtual.local");
}

seed().finally(() => sqlClient.end());
