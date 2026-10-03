import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/src/db";
import {
  adminChangeProposals,
  administrativeDivisions,
  companyClassFinancials,
  countries,
  companyScaleStatistics,
  countryDevelopmentTracks,
  countryOffices,
  countryProfileRevisions,
  countryResearch,
  countryFiscalPolicies,
  demographicSnapshots,
  economicSnapshotInputs,
  economicSectors,
  economicSnapshots,
  financialInstitutions,
  majorCompanies,
  modifiers,
  parties,
  partySnapshots,
  politicalSnapshots,
  policyGoals,
  researchAllocations,
  techNodes,
  techPrerequisites,
  turns,
} from "@/src/db/schema";
import {
  mergeDevelopmentTracks,
  mergeSocialInstitutionTracks,
} from "@/src/domain/development/tracks";

function applyApprovedChanges<T extends Record<string, unknown>>(
  record: T | undefined,
  changes: Array<{ metric: string; afterValue: unknown }>,
) {
  if (!record) return record;
  const copy = { ...record };
  for (const change of changes) {
    if (change.metric in copy) {
      (copy as Record<string, unknown>)[change.metric] = change.afterValue;
    }
  }
  return copy;
}

export async function getCountryLedger(countryId: string) {
  const country = await db.query.countries.findFirst({ where: eq(countries.id, countryId) });
  if (!country) return null;

  const profile = country.currentProfileRevisionId
    ? await db.query.countryProfileRevisions.findFirst({
        where: eq(countryProfileRevisions.id, country.currentProfileRevisionId),
      })
    : undefined;

  const [demographic, economicRows, politicalRows, divisions, offices, fiscalPolicy, development] =
    await Promise.all([
      db
        .select({ snapshot: demographicSnapshots, turnSequence: turns.sequence })
        .from(demographicSnapshots)
        .innerJoin(turns, eq(demographicSnapshots.turnId, turns.id))
        .where(eq(demographicSnapshots.countryId, countryId))
        .orderBy(desc(turns.sequence))
        .limit(1),
      db
        .select({
          snapshot: economicSnapshots,
          demographic: demographicSnapshots,
          turnSequence: turns.sequence,
          gameDate: turns.gameDateEnd,
        })
        .from(economicSnapshots)
        .innerJoin(turns, eq(economicSnapshots.turnId, turns.id))
        .leftJoin(
          demographicSnapshots,
          and(
            eq(demographicSnapshots.countryId, countryId),
            eq(demographicSnapshots.turnId, economicSnapshots.turnId),
          ),
        )
        .where(eq(economicSnapshots.countryId, countryId))
        .orderBy(desc(turns.sequence))
        .limit(12),
      db
        .select({
          snapshot: politicalSnapshots,
          turnSequence: turns.sequence,
          gameDate: turns.gameDateEnd,
        })
        .from(politicalSnapshots)
        .innerJoin(turns, eq(politicalSnapshots.turnId, turns.id))
        .where(eq(politicalSnapshots.countryId, countryId))
        .orderBy(desc(turns.sequence))
        .limit(8),
      db.query.administrativeDivisions.findMany({
        where: eq(administrativeDivisions.countryId, countryId),
        orderBy: [asc(administrativeDivisions.level), asc(administrativeDivisions.name)],
      }),
      db.query.countryOffices.findMany({
        where: and(eq(countryOffices.countryId, countryId), eq(countryOffices.isCurrent, true)),
      }),
      db.query.countryFiscalPolicies.findFirst({
        where: eq(countryFiscalPolicies.countryId, countryId),
      }),
      db.query.countryDevelopmentTracks.findMany({
        where: eq(countryDevelopmentTracks.countryId, countryId),
      }),
    ]);

  const currentEconomic = economicRows[0]?.snapshot;
  const currentPolitical = politicalRows[0]?.snapshot;
  const [economicModifiers, activePolicyGoals] = await Promise.all([
    db
      .select({ modifier: modifiers, startTurnSequence: turns.sequence })
      .from(modifiers)
      .innerJoin(turns, eq(modifiers.startTurnId, turns.id))
      .where(and(eq(modifiers.countryId, countryId), eq(modifiers.targetType, "COUNTRY")))
      .orderBy(asc(turns.sequence), asc(modifiers.createdAt)),
    db.query.policyGoals.findMany({
      where: and(eq(policyGoals.countryId, countryId), eq(policyGoals.status, "ACTIVE")),
      orderBy: [asc(policyGoals.targetGameDate), asc(policyGoals.createdAt)],
    }),
  ]);
  const changes =
    currentEconomic || currentPolitical
      ? await db.query.adminChangeProposals.findMany({
          where: and(
            eq(adminChangeProposals.countryId, countryId),
            eq(adminChangeProposals.status, "APPROVED"),
            inArray(
              adminChangeProposals.turnId,
              [currentEconomic?.turnId, currentPolitical?.turnId].filter(Boolean) as string[],
            ),
          ),
          orderBy: [asc(adminChangeProposals.createdAt)],
        })
      : [];

  const economicChanges = changes
    .filter((change) => change.domain === "ECONOMY")
    .map((change) => ({ metric: change.metric, afterValue: change.afterValue }));
  const politicalChanges = changes
    .filter((change) => change.domain === "POLITICS")
    .map((change) => ({ metric: change.metric, afterValue: change.afterValue }));

  const partyRows = currentPolitical
    ? await db
        .select({ party: parties, snapshot: partySnapshots })
        .from(parties)
        .leftJoin(
          partySnapshots,
          and(
            eq(partySnapshots.partyId, parties.id),
            eq(partySnapshots.turnId, currentPolitical.turnId),
          ),
        )
        .where(eq(parties.countryId, countryId))
        .orderBy(desc(partySnapshots.support))
    : [];

  const [sectors, institutions, companies, economicInputs, companyScale, companyFinancials] =
    currentEconomic
      ? await Promise.all([
          db.query.economicSectors.findMany({
            where: and(
              eq(economicSectors.countryId, countryId),
              eq(economicSectors.turnId, currentEconomic.turnId),
            ),
            orderBy: [desc(economicSectors.share), asc(economicSectors.name)],
          }),
          db.query.financialInstitutions.findMany({
            where: eq(financialInstitutions.countryId, countryId),
            orderBy: [
              desc(financialInstitutions.systemicImportance),
              asc(financialInstitutions.name),
            ],
          }),
          db.query.majorCompanies.findMany({
            where: eq(majorCompanies.countryId, countryId),
            orderBy: [desc(majorCompanies.systemicImportance), asc(majorCompanies.name)],
          }),
          db.query.economicSnapshotInputs.findMany({
            where: eq(economicSnapshotInputs.snapshotId, currentEconomic.id),
            orderBy: [asc(economicSnapshotInputs.metric)],
          }),
          db.query.companyScaleStatistics.findFirst({
            where: eq(companyScaleStatistics.countryId, countryId),
          }),
          db.query.companyClassFinancials.findMany({
            where: eq(companyClassFinancials.countryId, countryId),
            orderBy: [asc(companyClassFinancials.companyClass)],
          }),
        ])
      : [[], [], [], [], null, []];

  return {
    country,
    profile: profile ?? null,
    demographic: demographic[0]?.snapshot ?? null,
    economic: applyApprovedChanges(currentEconomic, economicChanges) ?? null,
    political: applyApprovedChanges(currentPolitical, politicalChanges) ?? null,
    economicTrend: economicRows
      .map((row) =>
        row.snapshot.id === currentEconomic?.id
          ? { ...row, snapshot: applyApprovedChanges(row.snapshot, economicChanges)! }
          : row,
      )
      .reverse(),
    politicalTrend: politicalRows.reverse(),
    divisions,
    offices,
    parties: partyRows,
    sectors,
    institutions,
    companies,
    companyScale,
    companyFinancials,
    economicInputs,
    fiscalPolicy: fiscalPolicy ?? null,
    developmentTracks: mergeDevelopmentTracks(development),
    socialInstitutions: mergeSocialInstitutionTracks(development),
    economicModifiers,
    activePolicyGoals,
    approvedChanges: changes,
  };
}

export async function getCountryResearch(countryId: string, campaignId: string, turnId?: string) {
  const [nodes, edges, states, allocations] = await Promise.all([
    db.query.techNodes.findMany({
      where: and(eq(techNodes.campaignId, campaignId), eq(techNodes.isPublic, true)),
      orderBy: [asc(techNodes.era), asc(techNodes.field), asc(techNodes.name)],
    }),
    db
      .select({
        techNodeId: techPrerequisites.techNodeId,
        prerequisiteId: techPrerequisites.prerequisiteId,
      })
      .from(techPrerequisites)
      .innerJoin(techNodes, eq(techPrerequisites.techNodeId, techNodes.id))
      .where(eq(techNodes.campaignId, campaignId)),
    db.query.countryResearch.findMany({ where: eq(countryResearch.countryId, countryId) }),
    turnId
      ? db.query.researchAllocations.findMany({
          where: and(
            eq(researchAllocations.countryId, countryId),
            eq(researchAllocations.turnId, turnId),
          ),
        })
      : Promise.resolve([]),
  ]);
  return { nodes, edges, states, allocations };
}

export async function getAdminCountryTable(campaignId: string) {
  const rows = await db
    .select({
      country: countries,
      economy: economicSnapshots,
      demographic: demographicSnapshots,
      politics: politicalSnapshots,
      turn: turns,
    })
    .from(countries)
    .leftJoin(economicSnapshots, eq(economicSnapshots.countryId, countries.id))
    .leftJoin(turns, eq(economicSnapshots.turnId, turns.id))
    .leftJoin(
      demographicSnapshots,
      and(
        eq(demographicSnapshots.countryId, countries.id),
        eq(demographicSnapshots.turnId, turns.id),
      ),
    )
    .leftJoin(
      politicalSnapshots,
      and(eq(politicalSnapshots.countryId, countries.id), eq(politicalSnapshots.turnId, turns.id)),
    )
    .where(eq(countries.campaignId, campaignId))
    .orderBy(asc(countries.name), desc(turns.sequence));

  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.country.id)) return false;
    seen.add(row.country.id);
    return true;
  });
}
