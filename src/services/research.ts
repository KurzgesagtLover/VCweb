import Decimal from "decimal.js";
import { and, desc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "@/src/db";
import {
  campaignCities,
  cityBuildings,
  countries,
  countryDevelopmentTracks,
  countryRelations,
  countryResearch,
  countryResearchCapacity,
  diplomaticBlocMembers,
  diplomaticBlocs,
  economicSectors,
  majorCompanies,
  researchAllocations,
  techNodes,
  techPrerequisites,
  turns,
  type DomainEffect,
} from "@/src/db/schema";
import { ageGroups, normalizeAgeStructure } from "@/src/domain/demography/age-structure";
import { economicScaleMultiplier, gdpPerCapita } from "@/src/domain/economy/administration";
import type { BudgetTierKey } from "@/src/domain/economy/budget-coverage";
import {
  advanceEducation,
  FIELD_SECTORS,
  fieldFactor,
  researchCapacity,
} from "@/src/domain/research/capacity";
import type { DiplomaticRelationStatus } from "@/src/domain/diplomacy/status";
import {
  diffusionPartnerWeight,
  researchStep,
  type ResearchState,
  type ResearchTech,
} from "@/src/domain/research/progress";

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Reader = Pick<typeof db, "select">;

const RESEARCH_BUILDINGS = {
  university: "university",
  institute: "national_research_institute",
} as const;

/** 국가가 소유한 도시의 시설 단계 합(종류별). 피해 단계는 뺀다. */
export async function countryFacilityLevels(reader: Reader, campaignId: string, countryId: string) {
  const rows = await reader
    .select({
      type: cityBuildings.buildingType,
      level: cityBuildings.level,
      damaged: cityBuildings.damagedLevels,
    })
    .from(cityBuildings)
    .innerJoin(campaignCities, eq(cityBuildings.campaignCityId, campaignCities.id))
    .where(
      and(eq(campaignCities.campaignId, campaignId), eq(campaignCities.ownerCountryId, countryId)),
    );
  const levels: Record<string, number> = {};
  for (const row of rows) {
    const effective = Math.max(0, row.level - row.damaged);
    if (effective > 0) levels[row.type] = (levels[row.type] ?? 0) + effective;
  }
  return levels;
}

async function trackStages(reader: Reader, countryId: string) {
  const rows = await reader
    .select({ metric: countryDevelopmentTracks.metric, stage: countryDevelopmentTracks.stage })
    .from(countryDevelopmentTracks)
    .where(eq(countryDevelopmentTracks.countryId, countryId));
  return new Map(rows.map((row) => [row.metric, row.stage]));
}

/**
 * 계산 단계: 교육 파이프라인과 연구 역량을 계산한다. 결과는 계산 근거에 남기고 턴 공개 때 저장한다.
 */
export async function computeResearchCapacity(input: {
  country: { id: string; campaignId: string };
  years: number;
  economic: { realGdp: string; nominalGdp: string; scale: string; turnId?: string | null };
  demographic: { population: string; ageStructure: unknown };
  educationTier: BudgetTierKey | null;
  researchInvestmentRate: string | number;
}) {
  const [previous, stages, facilities, companies, sectors] = await Promise.all([
    db.query.countryResearchCapacity.findFirst({
      where: eq(countryResearchCapacity.countryId, input.country.id),
    }),
    trackStages(db, input.country.id),
    countryFacilityLevels(db, input.country.campaignId, input.country.id),
    db
      .select({ rd: majorCompanies.researchAndDevelopmentExpense })
      .from(majorCompanies)
      .where(eq(majorCompanies.countryId, input.country.id)),
    input.economic.turnId
      ? db
          .select({ code: economicSectors.code, share: economicSectors.share })
          .from(economicSectors)
          .where(
            and(
              eq(economicSectors.countryId, input.country.id),
              eq(economicSectors.turnId, input.economic.turnId),
            ),
          )
      : [],
  ]);
  const structure = normalizeAgeStructure(input.demographic.ageStructure);
  const population = Number(input.demographic.population);
  const groups = structure
    ? ageGroups(structure)
    : { universityAge: population * 0.09, working: population * 0.65 };
  const perCapita = gdpPerCapita({
    realGdp: input.economic.realGdp,
    population: input.demographic.population,
    scale: input.economic.scale,
  });
  const academicStage = stages.get("academicFoundation") ?? 3;
  const education = advanceEducation({
    universityAge: groups.universityAge,
    workingAge: groups.working,
    previous: previous
      ? {
          tertiaryWorkers: Number(previous.tertiaryWorkers),
          enrollmentRate: Number(previous.enrollmentRate),
        }
      : null,
    gdpPerCapita: perCapita ? perCapita.toNumber() : null,
    academicStage,
    literacyStage: stages.get("literacy") ?? 3,
    universityLevels: facilities[RESEARCH_BUILDINGS.university] ?? 0,
    educationTier: input.educationTier,
    years: input.years,
  });
  const gdpMillions = new Decimal(input.economic.nominalGdp)
    .mul(economicScaleMultiplier(input.economic.scale))
    .div(1_000_000)
    .toNumber();
  const capacity = researchCapacity({
    tertiaryWorkers: education.tertiaryWorkers,
    academicStage,
    gdpMillions,
    researchInvestmentRate: Number(input.researchInvestmentRate),
    educationTier: input.educationTier,
    corporateRdMillions: companies.reduce((sum, row) => sum + Math.max(0, Number(row.rd ?? 0)), 0),
    instituteLevels: facilities[RESEARCH_BUILDINGS.institute] ?? 0,
    researchFacilityStage: stages.get("researchFacilities") ?? 3,
  });
  const sectorShares = Object.fromEntries(sectors.map((row) => [row.code, Number(row.share)]));
  const fieldFactors = Object.fromEntries(
    Object.keys(FIELD_SECTORS).map((field) => [
      field,
      fieldFactor(field, sectorShares, facilities),
    ]),
  );
  return {
    education: {
      initialized: education.initialized,
      enrollmentTarget: round(education.enrollmentTarget, 6),
      enrollmentRate: round(education.enrollmentRate, 6),
      graduatesPerYear: round(education.graduatesPerYear, 2),
      tertiaryWorkers: round(education.tertiaryWorkers, 2),
      tertiaryShare: round(education.tertiaryShare, 6),
    },
    capacity,
    fieldFactors,
    facilities: Object.keys(facilities).sort(),
    inputs: {
      academicStage,
      educationTier: input.educationTier,
      gdpMillions: round(gdpMillions, 2),
      universityLevels: facilities[RESEARCH_BUILDINGS.university] ?? 0,
      instituteLevels: facilities[RESEARCH_BUILDINGS.institute] ?? 0,
    },
  };
}

export type ResearchCapacityEvidence = Awaited<ReturnType<typeof computeResearchCapacity>>;

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** 턴 공개 때 계산 근거의 연구 역량을 저장한다. */
export async function persistResearchCapacity(
  tx: DatabaseTransaction,
  input: { countryId: string; turnId: string; evidence: unknown; now: Date },
) {
  const research = (input.evidence as { research?: ResearchCapacityEvidence } | null)?.research;
  if (!research?.capacity || !research.education) return;
  const values = {
    enrollmentRate: String(research.education.enrollmentRate),
    graduatesPerYear: String(research.education.graduatesPerYear),
    tertiaryWorkers: String(research.education.tertiaryWorkers),
    researchers: String(research.capacity.researchers),
    rdSpendingMillions: String(research.capacity.rdSpendingMillions),
    pointsPerYear: String(research.capacity.pointsPerYear),
    fieldFactors: research.fieldFactors,
    facilities: research.facilities,
    detail: { inputs: research.inputs, capacity: research.capacity, education: research.education },
    updatedTurnId: input.turnId,
    updatedAt: input.now,
  };
  await tx
    .insert(countryResearchCapacity)
    .values({ countryId: input.countryId, ...values })
    .onConflictDoUpdate({ target: countryResearchCapacity.countryId, set: values });
}

/**
 * 완성 뒤 아직 반영하지 않은 기술 효과를 꺼내고 반영 표시를 한다.
 * 턴 공개 트랜잭션에서 스냅샷에 적용한다.
 */
export async function takeCompletedTechEffects(
  tx: DatabaseTransaction,
  input: { countryId: string; turnId: string; now: Date },
) {
  const rows = await tx
    .select({ state: countryResearch, node: techNodes })
    .from(countryResearch)
    .innerJoin(techNodes, eq(countryResearch.techNodeId, techNodes.id))
    .where(
      and(
        eq(countryResearch.countryId, input.countryId),
        eq(countryResearch.status, "COMPLETED"),
        isNull(countryResearch.effectsAppliedAt),
      ),
    );
  if (!rows.length) return [];
  await tx
    .update(countryResearch)
    .set({ effectsAppliedAt: input.now, updatedAt: input.now })
    .where(
      inArray(
        countryResearch.id,
        rows.map(({ state }) => state.id),
      ),
    );
  for (const { state } of rows) {
    if (state.completedTurnId) continue;
    await tx
      .update(countryResearch)
      .set({ completedTurnId: input.turnId })
      .where(eq(countryResearch.id, state.id));
  }
  return rows.flatMap(({ node }) =>
    node.effects.map(
      (effect): DomainEffect => ({
        targetType: "COUNTRY",
        targetId: input.countryId,
        metric: effect.metric,
        operation: effect.operation,
        value: String(effect.value),
        durationTurns: null,
        reason: `기술 완성: ${node.name}`,
      }),
    ),
  );
}

async function campaignTechGraph(reader: Reader, campaignId: string) {
  const [nodes, edges] = await Promise.all([
    reader.select().from(techNodes).where(eq(techNodes.campaignId, campaignId)),
    reader
      .select({
        techNodeId: techPrerequisites.techNodeId,
        prerequisiteId: techPrerequisites.prerequisiteId,
      })
      .from(techPrerequisites)
      .innerJoin(techNodes, eq(techPrerequisites.techNodeId, techNodes.id))
      .where(eq(techNodes.campaignId, campaignId)),
  ]);
  const prerequisites = new Map<string, string[]>();
  for (const edge of edges) {
    prerequisites.set(edge.techNodeId, [
      ...(prerequisites.get(edge.techNodeId) ?? []),
      edge.prerequisiteId,
    ]);
  }
  return new Map<string, ResearchTech>(
    nodes.map((node) => [
      node.id,
      {
        id: node.id,
        code: node.code,
        name: node.name,
        field: node.field,
        cost: Number(node.cost),
        requiredFacilities: node.requiredFacilities ?? [],
        prerequisiteIds: prerequisites.get(node.id) ?? [],
        exclusiveGroup: node.exclusiveGroup,
      },
    ]),
  );
}

/** 국가의 현재 연구 배분. 가장 최근에 배분을 저장한 턴의 값을 그대로 쓴다. */
export async function effectiveAllocations(
  reader: Reader,
  countryId: string,
  upToSequence: number,
) {
  const [latest] = await reader
    .select({ turnId: researchAllocations.turnId, sequence: turns.sequence })
    .from(researchAllocations)
    .innerJoin(turns, eq(researchAllocations.turnId, turns.id))
    .where(and(eq(researchAllocations.countryId, countryId), lte(turns.sequence, upToSequence)))
    .orderBy(desc(turns.sequence))
    .limit(1);
  if (!latest)
    return {
      turnId: null as string | null,
      rows: [] as Array<{ techNodeId: string; points: string }>,
    };
  const rows = await reader
    .select({ techNodeId: researchAllocations.techNodeId, points: researchAllocations.points })
    .from(researchAllocations)
    .where(
      and(
        eq(researchAllocations.countryId, countryId),
        eq(researchAllocations.turnId, latest.turnId),
      ),
    );
  return { turnId: latest.turnId, rows };
}

/** 이 나라와 기술 전파 관계에 있는 나라별 가중치. 지금은 동맹 관계만 세고, 가중치 0은 뺀다. */
async function diffusionPartners(reader: Reader, campaignId: string, countryId: string) {
  const [relations, ownBloc] = await Promise.all([
    reader
      .select({
        fromCountryId: countryRelations.fromCountryId,
        toCountryId: countryRelations.toCountryId,
        status: countryRelations.status,
      })
      .from(countryRelations)
      .where(
        and(
          eq(countryRelations.campaignId, campaignId),
          or(
            eq(countryRelations.fromCountryId, countryId),
            eq(countryRelations.toCountryId, countryId),
          ),
          inArray(countryRelations.status, ["MUTUAL_DEFENSE", "INDEPENDENCE_GUARANTEE"]),
        ),
      ),
    reader
      .select({ blocId: diplomaticBlocMembers.blocId })
      .from(diplomaticBlocMembers)
      .innerJoin(diplomaticBlocs, eq(diplomaticBlocMembers.blocId, diplomaticBlocs.id))
      .where(
        and(
          eq(diplomaticBlocMembers.countryId, countryId),
          eq(diplomaticBlocs.campaignId, campaignId),
          eq(diplomaticBlocs.status, "ACTIVE"),
        ),
      )
      .limit(1),
  ]);
  const blocMembers = ownBloc[0]
    ? await reader
        .select({ countryId: diplomaticBlocMembers.countryId })
        .from(diplomaticBlocMembers)
        .where(eq(diplomaticBlocMembers.blocId, ownBloc[0].blocId))
    : [];
  const statuses = new Map<string, DiplomaticRelationStatus[]>();
  for (const relation of relations) {
    const other =
      relation.fromCountryId === countryId ? relation.toCountryId : relation.fromCountryId;
    statuses.set(other, [...(statuses.get(other) ?? []), relation.status]);
  }
  const sameBloc = new Set(blocMembers.map((row) => row.countryId));
  const weights = new Map<string, number>();
  for (const other of new Set([...statuses.keys(), ...sameBloc])) {
    if (other === countryId) continue;
    const weight = diffusionPartnerWeight({
      sameBloc: sameBloc.has(other),
      statuses: statuses.get(other) ?? [],
    });
    if (weight > 0) weights.set(other, weight);
  }
  return weights;
}

/** 기술별 전파 가중치 합과 그 기술을 아는 전파 상대 수. 기밀로 묶은 기술은 세지 않는다. */
async function diffusionMap(reader: Reader, campaignId: string, countryId: string) {
  const partners = await diffusionPartners(reader, campaignId, countryId);
  const result = new Map<string, { weight: number; partners: number }>();
  if (!partners.size) return result;
  const rows = await reader
    .select({ techNodeId: countryResearch.techNodeId, countryId: countryResearch.countryId })
    .from(countryResearch)
    .where(
      and(
        inArray(countryResearch.countryId, [...partners.keys()]),
        eq(countryResearch.status, "COMPLETED"),
        eq(countryResearch.classified, false),
      ),
    );
  for (const row of rows) {
    const current = result.get(row.techNodeId) ?? { weight: 0, partners: 0 };
    result.set(row.techNodeId, {
      weight: current.weight + (partners.get(row.countryId) ?? 0),
      partners: current.partners + 1,
    });
  }
  return result;
}

/**
 * 실시간 연구 진행: 한 판정 구간 동안 모든 국가의 연구를 진행한다.
 */
export async function advanceCampaignResearch(
  tx: DatabaseTransaction,
  input: { campaignId: string; turnSequence: number; gameDays: number; now: Date },
) {
  if (!(input.gameDays > 0)) return { countries: 0, completed: [] as string[] };
  const techs = await campaignTechGraph(tx, input.campaignId);
  if (!techs.size) return { countries: 0, completed: [] as string[] };
  const countryRows = await tx
    .select({ id: countries.id })
    .from(countries)
    .where(and(eq(countries.campaignId, input.campaignId), eq(countries.setupStatus, "APPROVED")));
  const capacities = await tx
    .select()
    .from(countryResearchCapacity)
    .where(
      inArray(
        countryResearchCapacity.countryId,
        countryRows.map((row) => row.id),
      ),
    );
  const capacityByCountry = new Map(capacities.map((row) => [row.countryId, row]));
  const completed: string[] = [];
  let processed = 0;
  for (const country of countryRows) {
    const capacity = capacityByCountry.get(country.id);
    if (!capacity || !(Number(capacity.pointsPerYear) > 0)) continue;
    const [allocations, stateRows, diffusion] = await Promise.all([
      effectiveAllocations(tx, country.id, input.turnSequence),
      tx.select().from(countryResearch).where(eq(countryResearch.countryId, country.id)),
      diffusionMap(tx, input.campaignId, country.id),
    ]);
    if (!allocations.rows.length) continue;
    const states = new Map<string, ResearchState>(
      stateRows.map((row) => [
        row.techNodeId,
        { status: row.status, progressPoints: Number(row.progressPoints) },
      ]),
    );
    const step = researchStep({
      pointsPerYear: Number(capacity.pointsPerYear),
      gameDays: input.gameDays,
      allocations: allocations.rows.map((row) => ({
        techId: row.techNodeId,
        percent: Number(row.points),
      })),
      techs,
      states,
      diffusionWeights: new Map([...diffusion].map(([techId, item]) => [techId, item.weight])),
      fieldFactors: capacity.fieldFactors ?? {},
      facilities: new Set(capacity.facilities ?? []),
    });
    processed += 1;
    for (const update of step.updates) {
      if (update.blocked || !(update.gained > 0)) continue;
      const status = update.completed ? "COMPLETED" : "IN_PROGRESS";
      await tx
        .insert(countryResearch)
        .values({
          countryId: country.id,
          techNodeId: update.techId,
          status,
          progressPoints: String(update.after),
          completedAt: update.completed ? input.now : null,
        })
        .onConflictDoUpdate({
          target: [countryResearch.countryId, countryResearch.techNodeId],
          set: {
            status,
            progressPoints: String(update.after),
            completedAt: update.completed ? input.now : null,
            updatedAt: input.now,
          },
        });
      if (update.completed)
        completed.push(`${country.id}:${techs.get(update.techId)?.code ?? update.techId}`);
    }
  }
  return { countries: processed, completed };
}

/** 연구 화면 데이터 */
export async function getResearchBoard(input: {
  campaignId: string;
  countryId: string;
  turnSequence: number | null;
}) {
  const [techs, capacity, stateRows, allocations, diffusion] = await Promise.all([
    campaignTechGraph(db, input.campaignId),
    db.query.countryResearchCapacity.findFirst({
      where: eq(countryResearchCapacity.countryId, input.countryId),
    }),
    db.select().from(countryResearch).where(eq(countryResearch.countryId, input.countryId)),
    input.turnSequence === null
      ? { turnId: null, rows: [] }
      : effectiveAllocations(db, input.countryId, input.turnSequence),
    diffusionMap(db, input.campaignId, input.countryId),
  ]);
  return { techs, capacity: capacity ?? null, stateRows, allocations, diffusion };
}
