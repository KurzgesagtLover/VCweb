import { and, desc, eq, or, sql } from "drizzle-orm";
import { db, sqlClient } from "../src/db";
import {
  campaignMaps,
  campaigns,
  countries,
  companyClassFinancials,
  companyScaleStatistics,
  countryDevelopmentTracks,
  countryFiscalPolicies,
  countryFlags,
  countryOffices,
  countryPoliticalResources,
  countryProfileRevisions,
  countryResearch,
  countrySymbols,
  countryUnitsAndCodes,
  demographicSnapshots,
  economicSectors,
  economicSnapshotInputs,
  economicSnapshots,
  financialInstitutions,
  governmentOfficeDefinitions,
  governmentOfficeHolders,
  mapRasterColorAssignments,
  majorCompanies,
  parties,
  partySnapshots,
  politicalSnapshots,
  researchAllocations,
  techNodes,
  turns,
  users,
} from "../src/db/schema";
import { CHINA_2042_SCENARIO } from "../src/domain/development/china-2042";

async function findChinaCountry(campaignId: string) {
  const named = await db.query.countries.findFirst({
    where: and(
      eq(countries.campaignId, campaignId),
      or(
        eq(countries.code, CHINA_2042_SCENARIO.country.code),
        eq(countries.name, CHINA_2042_SCENARIO.country.name),
      ),
    ),
  });
  if (named) return named;

  const [mapped] = await db
    .select({ country: countries })
    .from(mapRasterColorAssignments)
    .innerJoin(campaignMaps, eq(campaignMaps.id, mapRasterColorAssignments.mapId))
    .innerJoin(countries, eq(countries.id, mapRasterColorAssignments.countryId))
    .where(
      and(
        eq(campaignMaps.campaignId, campaignId),
        eq(campaignMaps.position, 1),
        eq(mapRasterColorAssignments.colorHex, CHINA_2042_SCENARIO.country.mapColor),
      ),
    )
    .limit(1);
  return mapped?.country;
}

async function seedChina2042() {
  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.isActive, true),
  });
  if (!campaign) throw new Error("활성 캠페인이 없습니다.");

  const country = await findChinaCountry(campaign.id);
  if (!country) throw new Error("현재 지도에서 중국 국가 레코드를 찾지 못했습니다.");
  const [latestTurn, admin] = await Promise.all([
    db.query.turns.findFirst({
      where: eq(turns.campaignId, campaign.id),
      orderBy: desc(turns.sequence),
    }),
    db.query.users.findFirst({ where: eq(users.role, "ADMIN") }),
  ]);
  if (!latestTurn) throw new Error("중국 스냅샷을 연결할 턴이 없습니다.");
  if (!admin) throw new Error("중국 재정 데이터를 기록할 관리자 계정이 없습니다.");

  await db.transaction(async (tx) => {
    const codeOwner = await tx.query.countries.findFirst({
      where: and(
        eq(countries.campaignId, campaign.id),
        eq(countries.code, CHINA_2042_SCENARIO.country.code),
      ),
    });
    if (codeOwner && codeOwner.id !== country.id) {
      throw new Error("현재 캠페인에서 CHN 코드를 다른 국가가 사용 중입니다.");
    }

    const currentProfile = country.currentProfileRevisionId
      ? await tx.query.countryProfileRevisions.findFirst({
          where: eq(countryProfileRevisions.id, country.currentProfileRevisionId),
        })
      : await tx.query.countryProfileRevisions.findFirst({
          where: eq(countryProfileRevisions.countryId, country.id),
          orderBy: desc(countryProfileRevisions.revision),
        });

    const profileData = CHINA_2042_SCENARIO.profile;
    const profileValues = {
      status: "APPROVED" as const,
      flag: CHINA_2042_SCENARIO.country.flag,
      motto: profileData.motto,
      nationalAnthem: profileData.nationalAnthem,
      nationalTree: profileData.nationalTree,
      nationalFlower: profileData.nationalFlower,
      nationalBird: profileData.nationalBird,
      nationalAnimal: profileData.nationalAnimal,
      history: profileData.history,
      timeline: profileData.timeline.map((item) => ({ ...item })),
      planet: profileData.planet,
      capital: profileData.capital,
      largestCity: profileData.largestCity,
      totalAreaKm2: profileData.totalAreaKm2,
      inlandWaterRatio: profileData.inlandWaterRatio,
      officialLanguages: [...profileData.officialLanguages],
      officialScripts: [...profileData.officialScripts],
      stateReligion: profileData.stateReligion,
      militaryDescription: profileData.militaryDescription,
      governmentForm: profileData.governmentForm,
      officialCurrency: profileData.officialCurrency,
      currencyCode: profileData.currencyCode,
      majorIndustries: [...profileData.majorIndustries],
      approvedBy: admin.id,
      approvedAt: new Date(),
      updatedAt: new Date(),
    };

    let profileId = currentProfile?.id;
    if (currentProfile) {
      await tx
        .update(countryProfileRevisions)
        .set(profileValues)
        .where(eq(countryProfileRevisions.id, currentProfile.id));
    } else {
      const [profile] = await tx
        .insert(countryProfileRevisions)
        .values({
          countryId: country.id,
          revision: 1,
          ...profileValues,
        })
        .returning({ id: countryProfileRevisions.id });
      profileId = profile.id;
    }
    if (!profileId) throw new Error("중국 프로필을 만들지 못했습니다.");

    await tx
      .update(countries)
      .set({
        name: CHINA_2042_SCENARIO.country.name,
        code: CHINA_2042_SCENARIO.country.code,
        isoAlpha3: CHINA_2042_SCENARIO.country.isoAlpha3,
        economicSystem: "PLANNED",
        setupStatus: "APPROVED",
        currentProfileRevisionId: profileId,
        updatedAt: new Date(),
      })
      .where(eq(countries.id, country.id));

    await tx
      .insert(countryDevelopmentTracks)
      .values(
        Object.entries(CHINA_2042_SCENARIO.tracks).map(([metric, state]) => ({
          countryId: country.id,
          metric,
          stage: state.stage,
          progress: state.progress,
        })),
      )
      .onConflictDoUpdate({
        target: [countryDevelopmentTracks.countryId, countryDevelopmentTracks.metric],
        set: {
          stage: sql`excluded.stage`,
          progress: sql`excluded.progress`,
          updatedAt: new Date(),
        },
      });

    await tx
      .insert(countryUnitsAndCodes)
      .values({
        profileRevisionId: profileId,
        legalEra: "서력기원",
        timeZone: "UTC+8",
        measurementSystem: "미터법",
        ccTld: ".cn",
        countryCode: "CN / CHN",
        trafficDirection: "우측통행",
      })
      .onConflictDoUpdate({
        target: countryUnitsAndCodes.profileRevisionId,
        set: {
          legalEra: "서력기원",
          timeZone: "UTC+8",
          measurementSystem: "미터법",
          ccTld: ".cn",
          countryCode: "CN / CHN",
          trafficDirection: "우측통행",
          updatedAt: new Date(),
        },
      });

    const symbol = await tx.query.countrySymbols.findFirst({
      where: eq(countrySymbols.profileRevisionId, profileId),
    });
    if (symbol) {
      await tx
        .update(countrySymbols)
        .set({
          mediaKey: CHINA_2042_SCENARIO.country.flag,
          attribution: "중화인민공화국 국기 · 공공 영역",
          updatedAt: new Date(),
        })
        .where(eq(countrySymbols.id, symbol.id));
    } else {
      await tx.insert(countrySymbols).values({
        profileRevisionId: profileId,
        mediaKey: CHINA_2042_SCENARIO.country.flag,
        attribution: "중화인민공화국 국기 · 공공 영역",
      });
    }

    await tx
      .insert(countryFlags)
      .values([
        { countryId: country.id, key: "scenario.referenceYear", value: "2042" },
        { countryId: country.id, key: "scenario.kind", value: "BASELINE_FORECAST" },
      ])
      .onConflictDoUpdate({
        target: [countryFlags.countryId, countryFlags.key],
        set: { value: sql`excluded.value`, updatedAt: new Date() },
      });

    const demographic = CHINA_2042_SCENARIO.demographic;
    const demographicValues = {
      ...demographic,
      estimatedFields: [...demographic.estimatedFields],
    };
    await tx
      .insert(demographicSnapshots)
      .values({ countryId: country.id, turnId: latestTurn.id, ...demographicValues })
      .onConflictDoUpdate({
        target: [demographicSnapshots.countryId, demographicSnapshots.turnId],
        set: { ...demographicValues, updatedAt: new Date() },
      });

    const economic = CHINA_2042_SCENARIO.economic;
    const contributions = Object.fromEntries(
      Object.entries(economic.contributions).map(([group, items]) => [
        group,
        items.map((item) => ({ ...item })),
      ]),
    );
    const [economicSnapshot] = await tx
      .insert(economicSnapshots)
      .values({
        countryId: country.id,
        turnId: latestTurn.id,
        ...economic,
        contributions,
      })
      .onConflictDoUpdate({
        target: [economicSnapshots.countryId, economicSnapshots.turnId],
        set: { ...economic, contributions, updatedAt: new Date() },
      })
      .returning({ id: economicSnapshots.id });

    for (const input of CHINA_2042_SCENARIO.economicInputs) {
      const existing = await tx.query.economicSnapshotInputs.findFirst({
        where: and(
          eq(economicSnapshotInputs.snapshotId, economicSnapshot.id),
          eq(economicSnapshotInputs.metric, input.metric),
        ),
      });
      const values = {
        value: input.value,
        unit: input.unit,
        referenceYear: CHINA_2042_SCENARIO.referenceYear,
        source: "중국 2042 기준 전망 시나리오",
        isEstimated: true,
        isOverride: true,
        overrideReason: "테스트케이스 단일 전망치",
        updatedAt: new Date(),
      };
      if (existing) {
        await tx
          .update(economicSnapshotInputs)
          .set(values)
          .where(eq(economicSnapshotInputs.id, existing.id));
      } else {
        await tx.insert(economicSnapshotInputs).values({
          snapshotId: economicSnapshot.id,
          metric: input.metric,
          ...values,
        });
      }
    }

    for (const sector of CHINA_2042_SCENARIO.sectors) {
      await tx
        .insert(economicSectors)
        .values({ countryId: country.id, turnId: latestTurn.id, ...sector })
        .onConflictDoUpdate({
          target: [economicSectors.countryId, economicSectors.turnId, economicSectors.code],
          set: { ...sector, updatedAt: new Date() },
        });
    }

    for (const institution of CHINA_2042_SCENARIO.institutions) {
      const existing = await tx.query.financialInstitutions.findFirst({
        where: and(
          eq(financialInstitutions.countryId, country.id),
          eq(financialInstitutions.name, institution.name),
        ),
      });
      const values = { ...institution, industryTags: [...institution.industryTags] };
      if (existing) {
        await tx
          .update(financialInstitutions)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(financialInstitutions.id, existing.id));
      } else {
        await tx.insert(financialInstitutions).values({ countryId: country.id, ...values });
      }
    }

    for (const company of CHINA_2042_SCENARIO.companies) {
      const existing = await tx.query.majorCompanies.findFirst({
        where: and(eq(majorCompanies.countryId, country.id), eq(majorCompanies.name, company.name)),
      });
      const values = { ...company, industryTags: [...company.industryTags] };
      if (existing) {
        await tx
          .update(majorCompanies)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(majorCompanies.id, existing.id));
      } else {
        await tx.insert(majorCompanies).values({ countryId: country.id, ...values });
      }
    }

    await tx
      .insert(companyScaleStatistics)
      .values({ countryId: country.id, ...CHINA_2042_SCENARIO.companyScale })
      .onConflictDoUpdate({
        target: companyScaleStatistics.countryId,
        set: { ...CHINA_2042_SCENARIO.companyScale, updatedAt: new Date() },
      });
    for (const financials of CHINA_2042_SCENARIO.companyFinancials) {
      await tx
        .insert(companyClassFinancials)
        .values({ countryId: country.id, ...financials })
        .onConflictDoUpdate({
          target: [companyClassFinancials.countryId, companyClassFinancials.companyClass],
          set: { ...financials, updatedAt: new Date() },
        });
    }

    const fiscalPolicy = CHINA_2042_SCENARIO.fiscalPolicy;
    await tx
      .insert(countryFiscalPolicies)
      .values({ countryId: country.id, updatedBy: admin.id, ...fiscalPolicy })
      .onConflictDoUpdate({
        target: countryFiscalPolicies.countryId,
        set: { ...fiscalPolicy, updatedBy: admin.id, updatedAt: new Date() },
      });

    const politics = CHINA_2042_SCENARIO.politics;
    await tx
      .insert(politicalSnapshots)
      .values({ countryId: country.id, turnId: latestTurn.id, ...politics })
      .onConflictDoUpdate({
        target: [politicalSnapshots.countryId, politicalSnapshots.turnId],
        set: { ...politics, updatedAt: new Date() },
      });
    await tx
      .insert(countryPoliticalResources)
      .values({ countryId: country.id, balance: "620", incomePerGameDay: "0.12" })
      .onConflictDoUpdate({
        target: countryPoliticalResources.countryId,
        set: { balance: "620", incomePerGameDay: "0.12", lastAccruedAt: new Date() },
      });

    for (const party of CHINA_2042_SCENARIO.parties) {
      const { support, seats, organization, funds, isGovernment, isFixed, minimumSupport, ...row } =
        party;
      const [savedParty] = await tx
        .insert(parties)
        .values({ countryId: country.id, ...row, notablePeople: [...row.notablePeople] })
        .onConflictDoUpdate({
          target: [parties.countryId, parties.code],
          set: { ...row, notablePeople: [...row.notablePeople], updatedAt: new Date() },
        })
        .returning({ id: parties.id });
      await tx
        .insert(partySnapshots)
        .values({
          partyId: savedParty.id,
          turnId: latestTurn.id,
          support,
          seats,
          organization,
          funds,
          isGovernment,
          isFixed,
          minimumSupport,
        })
        .onConflictDoUpdate({
          target: [partySnapshots.partyId, partySnapshots.turnId],
          set: {
            support,
            seats,
            organization,
            funds,
            isGovernment,
            isFixed,
            minimumSupport,
            updatedAt: new Date(),
          },
        });
    }

    const legacyOffices = [
      ["HEAD_OF_STATE", politics.headOfState],
      ["HEAD_OF_GOVERNMENT", politics.headOfGovernment],
      ["ASSEMBLY_SPEAKER", politics.assemblySpeaker],
      ["CHIEF_JUSTICE", politics.chiefJustice],
    ] as const;
    for (const [officeType, holderName] of legacyOffices) {
      const existing = await tx.query.countryOffices.findFirst({
        where: and(
          eq(countryOffices.countryId, country.id),
          eq(countryOffices.officeType, officeType),
          eq(countryOffices.isCurrent, true),
        ),
      });
      if (existing) {
        await tx
          .update(countryOffices)
          .set({ holderName, updatedAt: new Date() })
          .where(eq(countryOffices.id, existing.id));
      } else {
        await tx.insert(countryOffices).values({
          countryId: country.id,
          officeType,
          holderName,
          startTurnId: latestTurn.id,
        });
      }
    }

    for (const office of CHINA_2042_SCENARIO.offices) {
      const [savedOffice] = await tx
        .insert(governmentOfficeDefinitions)
        .values({
          countryId: country.id,
          branch: office.branch,
          title: office.title,
          seatCount: 1,
          displayOrder: office.displayOrder,
        })
        .onConflictDoUpdate({
          target: [
            governmentOfficeDefinitions.countryId,
            governmentOfficeDefinitions.branch,
            governmentOfficeDefinitions.title,
          ],
          set: { isActive: true, displayOrder: office.displayOrder, updatedAt: new Date() },
        })
        .returning({ id: governmentOfficeDefinitions.id });
      await tx
        .insert(governmentOfficeHolders)
        .values({
          officeId: savedOffice.id,
          slotNumber: 1,
          holderName: office.holderName,
          startTurnId: latestTurn.id,
        })
        .onConflictDoUpdate({
          target: [governmentOfficeHolders.officeId, governmentOfficeHolders.slotNumber],
          set: {
            holderName: office.holderName,
            startTurnId: latestTurn.id,
            updatedAt: new Date(),
          },
        });
    }

    const nodes = await tx.query.techNodes.findMany({
      where: eq(techNodes.campaignId, campaign.id),
    });
    const pointsByCode: Record<string, string> = {
      FUSION_GRID: "80",
      MOLECULAR_ASSEMBLY: "70",
      POST_SCARCITY_POLICY: "45",
      PLANETARY_COMPUTE: "95",
      SPACE_ELEVATOR: "35",
    };
    for (const node of nodes) {
      const completed = node.era <= 3;
      await tx
        .insert(countryResearch)
        .values({
          countryId: country.id,
          techNodeId: node.id,
          status: completed ? "COMPLETED" : "AVAILABLE",
          progressPoints: completed ? node.cost : "0",
          startedTurnId: completed ? latestTurn.id : null,
          completedTurnId: completed ? latestTurn.id : null,
          completedAt: completed ? new Date() : null,
          effectsAppliedAt: completed ? new Date() : null,
        })
        .onConflictDoUpdate({
          target: [countryResearch.countryId, countryResearch.techNodeId],
          set: {
            status: completed ? "COMPLETED" : "AVAILABLE",
            progressPoints: completed ? node.cost : "0",
            startedTurnId: completed ? latestTurn.id : null,
            completedTurnId: completed ? latestTurn.id : null,
            completedAt: completed ? new Date() : null,
            effectsAppliedAt: completed ? new Date() : null,
            updatedAt: new Date(),
          },
        });
      const points = pointsByCode[node.code];
      if (points) {
        await tx
          .insert(researchAllocations)
          .values({
            countryId: country.id,
            turnId: latestTurn.id,
            techNodeId: node.id,
            points,
          })
          .onConflictDoUpdate({
            target: [
              researchAllocations.countryId,
              researchAllocations.turnId,
              researchAllocations.techNodeId,
            ],
            set: { points, updatedAt: new Date() },
          });
      }
    }
  });

  console.log(
    `중국 국기와 ${CHINA_2042_SCENARIO.referenceYear}년 기준 국가 데이터 전체를 ${CHINA_2042_SCENARIO.country.name}에 적용했습니다.`,
  );
  console.log(`Country ID: ${country.id}`);
}

seedChina2042().finally(() => sqlClient.end());
