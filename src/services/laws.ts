import Decimal from "decimal.js";
import { and, desc, eq, inArray, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/src/db";
import {
  auditLogs,
  campaigns,
  countries,
  countryDevelopmentTracks,
  countryFiscalPolicies,
  countryLawChanges,
  countryLaws,
  countryPoliticalResources,
  countryRelations,
  demographicSnapshots,
  economicSnapshots,
  modifiers,
  politicalPowerLedger,
  politicalSnapshots,
  turns,
  type DomainEffect,
} from "@/src/db/schema";
import { advanceDevelopmentTrack } from "@/src/domain/development/tracks";
import { evaluateAdministrationBudget, gdpPerCapita } from "@/src/domain/economy/administration";
import {
  addDrifts,
  applyMonthlyDrifts,
  monthsInTurn,
  type DriftChange,
  type MonthlyDrift,
} from "@/src/domain/politics/drift";
import {
  calculatePoliticalPowerIncome,
  culturalCommitmentDrift,
  deficitDrift,
  economicSystemForEconomyLaw,
  evaluateLawChange,
  fixedLawUpkeepItems,
  isValidLawStage,
  LAW_DEFINITIONS,
  lawDefinition,
  lawStructuralEffects,
  netIncomePerGameDay,
  requireLawDefinition,
  resolveLawStages,
  settleCulturalCommitments,
  turnLengthInYears,
  adaptiveUpkeep,
  type LawDefinition,
  type LawStages,
  type UpkeepItem,
} from "@/src/domain/politics/laws";
import { clampPoliticalPower, POLITICAL_POWER_MAX } from "@/src/domain/politics/political-power";
import { getPoliticalPowerState, lockAndAccruePoliticalPower } from "./political-power";

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Reader = Pick<typeof db, "select">;
type Campaign = typeof campaigns.$inferSelect;
type Turn = typeof turns.$inferSelect;
type Country = typeof countries.$inferSelect;

export async function getCountryLawStages(
  reader: Reader,
  country: { id: string; economicSystem: string | null },
): Promise<LawStages> {
  const [trackRows, lawRows] = await Promise.all([
    reader
      .select({ key: countryDevelopmentTracks.metric, stage: countryDevelopmentTracks.stage })
      .from(countryDevelopmentTracks)
      .where(eq(countryDevelopmentTracks.countryId, country.id)),
    reader
      .select({ key: countryLaws.lawKey, stage: countryLaws.stage })
      .from(countryLaws)
      .where(eq(countryLaws.countryId, country.id)),
  ]);
  return resolveLawStages([...trackRows, ...lawRows], country.economicSystem);
}

export async function isCountryAtWar(reader: Reader, campaignId: string, countryId: string) {
  const rows = await reader
    .select({ id: countryRelations.id })
    .from(countryRelations)
    .where(
      and(
        eq(countryRelations.campaignId, campaignId),
        or(
          eq(countryRelations.fromCountryId, countryId),
          eq(countryRelations.toCountryId, countryId),
        ),
        inArray(countryRelations.status, ["WAR", "CIVIL_WAR"]),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

async function latestPolitical(reader: Reader, countryId: string) {
  const [row] = await reader
    .select({ snapshot: politicalSnapshots })
    .from(politicalSnapshots)
    .innerJoin(turns, eq(politicalSnapshots.turnId, turns.id))
    .where(eq(politicalSnapshots.countryId, countryId))
    .orderBy(desc(turns.sequence))
    .limit(1);
  return row?.snapshot ?? null;
}

/** 법별로 마지막으로 시행된 턴 순번 */
async function lastAppliedSequences(reader: Reader, countryId: string) {
  const rows = await reader
    .select({
      lawKey: countryLawChanges.lawKey,
      sequence: sql<number>`max(${turns.sequence})`,
    })
    .from(countryLawChanges)
    .innerJoin(turns, eq(countryLawChanges.appliedTurnId, turns.id))
    .where(
      and(
        eq(countryLawChanges.countryId, countryId),
        notInArray(countryLawChanges.status, ["PENDING", "CANCELLED"]),
      ),
    )
    .groupBy(countryLawChanges.lawKey);
  return new Map(rows.map((row) => [row.lawKey, Number(row.sequence)]));
}

async function setLawStage(
  tx: DatabaseTransaction,
  input: {
    countryId: string;
    definition: LawDefinition;
    stage: number;
    turnId: string | null;
    now: Date;
  },
) {
  if (input.definition.storage === "TRACK") {
    await tx
      .insert(countryDevelopmentTracks)
      .values({
        countryId: input.countryId,
        metric: input.definition.key,
        stage: input.stage,
        progress: "0",
      })
      .onConflictDoUpdate({
        target: [countryDevelopmentTracks.countryId, countryDevelopmentTracks.metric],
        set: { stage: input.stage, progress: "0", updatedAt: input.now },
      });
  } else {
    await tx
      .insert(countryLaws)
      .values({
        countryId: input.countryId,
        lawKey: input.definition.key,
        stage: input.stage,
        changedTurnId: input.turnId,
      })
      .onConflictDoUpdate({
        target: [countryLaws.countryId, countryLaws.lawKey],
        set: { stage: input.stage, changedTurnId: input.turnId, updatedAt: input.now },
      });
  }
  if (input.definition.key === "economyLaw") {
    await tx
      .update(countries)
      .set({ economicSystem: economicSystemForEconomyLaw(input.stage), updatedAt: input.now })
      .where(eq(countries.id, input.countryId));
  }
}

async function shiftTrackProgress(
  tx: DatabaseTransaction,
  input: { countryId: string; definition: LawDefinition; delta: string; now: Date },
) {
  const [row] = await tx
    .select({ stage: countryDevelopmentTracks.stage, progress: countryDevelopmentTracks.progress })
    .from(countryDevelopmentTracks)
    .where(
      and(
        eq(countryDevelopmentTracks.countryId, input.countryId),
        eq(countryDevelopmentTracks.metric, input.definition.key),
      ),
    )
    .limit(1);
  const before = {
    stage: row?.stage ?? input.definition.defaultStage,
    progress: row?.progress ?? "0",
  };
  const after = advanceDevelopmentTrack(before, input.delta, input.definition.stages.length);
  await tx
    .insert(countryDevelopmentTracks)
    .values({
      countryId: input.countryId,
      metric: input.definition.key,
      stage: after.stage,
      progress: after.progress,
    })
    .onConflictDoUpdate({
      target: [countryDevelopmentTracks.countryId, countryDevelopmentTracks.metric],
      set: { stage: after.stage, progress: after.progress, updatedAt: input.now },
    });
  return { before, after };
}

async function activeIncomeModifierTotal(reader: Reader, countryId: string, turnSequence: number) {
  const rows = await reader
    .select({
      value: modifiers.value,
      durationTurns: modifiers.durationTurns,
      startSequence: turns.sequence,
    })
    .from(modifiers)
    .innerJoin(turns, eq(modifiers.startTurnId, turns.id))
    .where(and(eq(modifiers.countryId, countryId), eq(modifiers.metric, "politicalPowerIncome")));
  return rows.reduce((sum, row) => {
    const elapsed = turnSequence - row.startSequence;
    if (elapsed < 0) return sum;
    if (row.durationTurns !== null && elapsed >= row.durationTurns) return sum;
    return sum.plus(row.value);
  }, new Decimal(0));
}

/** 최근 공개 스냅샷과 현재 예산으로 행정·치안 예산 상태를 계산한다. */
export async function evaluateCountryAdministration(reader: Reader, countryId: string) {
  const [economic, demographic, political, fiscal] = await Promise.all([
    reader
      .select({ snapshot: economicSnapshots })
      .from(economicSnapshots)
      .innerJoin(turns, eq(economicSnapshots.turnId, turns.id))
      .where(eq(economicSnapshots.countryId, countryId))
      .orderBy(desc(turns.sequence))
      .limit(1),
    reader
      .select({ snapshot: demographicSnapshots })
      .from(demographicSnapshots)
      .innerJoin(turns, eq(demographicSnapshots.turnId, turns.id))
      .where(eq(demographicSnapshots.countryId, countryId))
      .orderBy(desc(turns.sequence))
      .limit(1),
    latestPolitical(reader, countryId),
    reader
      .select()
      .from(countryFiscalPolicies)
      .where(eq(countryFiscalPolicies.countryId, countryId))
      .limit(1),
  ]);
  return administrationFromSnapshots({
    economic: economic[0]?.snapshot ?? null,
    demographic: demographic[0]?.snapshot ?? null,
    unrest: political?.unrest ?? 0,
    budgetAdministration: fiscal[0]?.budgetAdministration ?? null,
  });
}

export function administrationFromSnapshots(input: {
  economic: {
    realGdp: string;
    nominalGdp: string;
    governmentSpending: string;
    scale: string;
  } | null;
  demographic: { population: string; populationDensity: string | null } | null;
  unrest: number;
  budgetAdministration: number | null;
}) {
  if (!input.economic || !input.demographic) return null;
  const nominalGdp = new Decimal(input.economic.nominalGdp);
  const spendingToGdp = nominalGdp.gt(0)
    ? new Decimal(input.economic.governmentSpending).div(nominalGdp)
    : new Decimal(0);
  const evaluation = evaluateAdministrationBudget({
    population: input.demographic.population,
    populationDensity: input.demographic.populationDensity,
    gdpPerCapita: gdpPerCapita({
      realGdp: input.economic.realGdp,
      population: input.demographic.population,
      scale: input.economic.scale,
    }),
    unrest: input.unrest,
    spendingToGdp,
    budgetAdministrationPercent: input.budgetAdministration ?? 15,
  });
  return {
    ...evaluation,
    spendingToGdp: spendingToGdp.toString(),
    budgetAdministration: input.budgetAdministration ?? 15,
  };
}

export type AdministrationEvaluation = NonNullable<ReturnType<typeof administrationFromSnapshots>>;

/** 경제 계산 단계에서 쓸 법·제도와 예산 상태 */
export async function loadCalculationSystems(input: {
  country: { id: string; economicSystem: string | null };
  turn: { gameDateStart: string; gameDateEnd: string };
  economic: Parameters<typeof administrationFromSnapshots>[0]["economic"];
  demographic: Parameters<typeof administrationFromSnapshots>[0]["demographic"];
  unrest: number;
  budgetAdministration: number | null;
}) {
  const [stages, commitments] = await Promise.all([
    getCountryLawStages(db, input.country),
    db
      .select()
      .from(countryLawChanges)
      .where(
        and(
          eq(countryLawChanges.countryId, input.country.id),
          eq(countryLawChanges.status, "ACTIVE"),
          eq(countryLawChanges.upkeepMode, "ADAPTIVE"),
        ),
      ),
  ]);
  const lawEffects = lawStructuralEffects(stages);
  const culturalDrift = addDrifts(
    ...commitments.map((commitment) => culturalCommitmentDrift(commitment)),
  );
  const administration = administrationFromSnapshots(input);
  const tier = administration?.tier ?? null;
  const drift = addDrifts(lawEffects.drift, tier?.drift ?? {}, culturalDrift);
  return {
    stages,
    lawEffects,
    culturalDrift,
    administration,
    drift,
    months: monthsInTurn(input.turn.gameDateStart, input.turn.gameDateEnd),
    structural: {
      potentialGrowth: new Decimal(lawEffects.potentialGrowth)
        .plus(tier?.potentialGrowth ?? 0)
        .toString(),
      naturalUnemployment: lawEffects.naturalUnemployment,
      inflationPressure: lawEffects.inflationPressure,
      revenueEfficiency: tier?.revenueEfficiency ?? "0",
    },
  };
}

export function calculationSystemsEvidence(
  systems: Awaited<ReturnType<typeof loadCalculationSystems>>,
  driftChanges: DriftChange[],
) {
  return {
    lawStages: systems.stages,
    lawSources: systems.lawEffects.sources,
    structural: systems.structural,
    drift: systems.drift,
    culturalDrift: systems.culturalDrift,
    months: systems.months,
    driftChanges,
    administration: systems.administration
      ? {
          coverage: systems.administration.coverage,
          requiredGdpShare: systems.administration.requirement.gdpShare,
          requiredBudgetShare: systems.administration.requirement.budgetShare,
          allocatedGdpShare: systems.administration.allocatedGdpShare,
          budgetAdministration: systems.administration.budgetAdministration,
          tier: systems.administration.tier.key,
          tierLabel: systems.administration.tier.label,
          politicalPowerIncome: systems.administration.tier.politicalPowerIncome,
        }
      : null,
  };
}

function administrationIncomeFromEvidence(evidence: unknown) {
  const systems = (evidence as { politicalSystems?: { administration?: unknown } } | null)
    ?.politicalSystems;
  const administration = systems?.administration as
    | { politicalPowerIncome?: number; tierLabel?: string }
    | null
    | undefined;
  return {
    income: Number(administration?.politicalPowerIncome ?? 0) || 0,
    label: administration?.tierLabel ?? null,
  };
}

/**
 * 턴 공개 트랜잭션 안에서 한 국가의 정치력 수지를 정산한다.
 * 정치 스냅샷 객체(political)를 직접 고쳐 정치력 잔고와 적자 손실을 반영한다.
 */
export async function settleCountryPoliticalPower(
  tx: DatabaseTransaction,
  input: {
    campaign: Campaign;
    turn: Turn;
    countryId: string;
    political: Record<string, unknown>;
    snapshotEffects: DomainEffect[];
    evidence: unknown;
    now: Date;
  },
) {
  const { campaign, turn, countryId, political, now } = input;
  const [ledger] = await tx
    .insert(politicalPowerLedger)
    .values({
      campaignId: campaign.id,
      countryId,
      turnId: turn.id,
      balanceBefore: "0",
      balanceAfter: "0",
      grossIncome: "0",
      upkeep: "0",
      net: "0",
      state: "NORMAL",
    })
    .onConflictDoNothing({ target: [politicalPowerLedger.countryId, politicalPowerLedger.turnId] })
    .returning();
  if (!ledger) {
    const [existing] = await tx
      .select({ balanceAfter: politicalPowerLedger.balanceAfter })
      .from(politicalPowerLedger)
      .where(
        and(
          eq(politicalPowerLedger.countryId, countryId),
          eq(politicalPowerLedger.turnId, turn.id),
        ),
      )
      .limit(1);
    political.politicalPower = existing?.balanceAfter ?? political.politicalPower ?? "100";
    return null;
  }

  const country = await tx.query.countries.findFirst({ where: eq(countries.id, countryId) });
  if (!country) throw new Error("정산할 국가를 찾을 수 없습니다.");

  const resource = await lockAndAccruePoliticalPower(tx, countryId, campaign, now);
  const balanceBefore = new Decimal(resource.balance);
  let balance = balanceBefore;

  const oneTimePower = input.snapshotEffects
    .filter(
      (effect) =>
        effect.targetType === "COUNTRY" &&
        effect.targetId === countryId &&
        effect.metric === "politicalPower",
    )
    .reduce((sum, effect) => sum.plus(effect.value), new Decimal(0));
  balance = clampPoliticalPower(balance.plus(oneTimePower));

  const stages = await getCountryLawStages(tx, country);
  const pending = await tx
    .select()
    .from(countryLawChanges)
    .where(
      and(eq(countryLawChanges.countryId, countryId), eq(countryLawChanges.status, "PENDING")),
    );
  const appliedOrders: Array<{ lawKey: string; fromStage: number; toStage: number }> = [];
  const cancelledOrders: Array<{ lawKey: string; refund: string }> = [];
  for (const order of pending) {
    const definition = lawDefinition(order.lawKey);
    if (!definition || stages[order.lawKey] !== order.fromStage) {
      balance = clampPoliticalPower(balance.plus(order.cost));
      cancelledOrders.push({ lawKey: order.lawKey, refund: order.cost });
      await tx
        .update(countryLawChanges)
        .set({ status: "CANCELLED", closedTurnId: turn.id, updatedAt: now })
        .where(eq(countryLawChanges.id, order.id));
      continue;
    }
    await tx
      .update(countryLawChanges)
      .set({ status: "SUPERSEDED", closedTurnId: turn.id, updatedAt: now })
      .where(
        and(
          eq(countryLawChanges.countryId, countryId),
          eq(countryLawChanges.lawKey, order.lawKey),
          eq(countryLawChanges.status, "ACTIVE"),
        ),
      );
    await setLawStage(tx, { countryId, definition, stage: order.toStage, turnId: turn.id, now });
    await tx
      .update(countryLawChanges)
      .set({
        status: definition.upkeepMode === "ADAPTIVE" ? "ACTIVE" : "APPLIED",
        appliedTurnId: turn.id,
        updatedAt: now,
      })
      .where(eq(countryLawChanges.id, order.id));
    stages[order.lawKey] = order.toStage;
    appliedOrders.push({
      lawKey: order.lawKey,
      fromStage: order.fromStage,
      toStage: order.toStage,
    });
  }

  const commitments = await tx
    .select()
    .from(countryLawChanges)
    .where(
      and(
        eq(countryLawChanges.countryId, countryId),
        eq(countryLawChanges.status, "ACTIVE"),
        eq(countryLawChanges.upkeepMode, "ADAPTIVE"),
      ),
    );
  const years = turnLengthInYears(turn.gameDateStart, turn.gameDateEnd);
  const cultural = settleCulturalCommitments({
    balance,
    years,
    commitments: commitments.map((commitment) => ({
      id: commitment.id,
      lawKey: commitment.lawKey,
      fromStage: commitment.fromStage,
      toStage: commitment.toStage,
      upkeepMax: commitment.upkeepMax,
      halfLifeYears: commitment.halfLifeYears,
      adaptation: commitment.adaptation,
      erosion: commitment.erosion,
      currentStage: stages[commitment.lawKey] ?? commitment.toStage,
      isNew: commitment.appliedTurnId === turn.id,
    })),
  });
  const adaptiveItems: UpkeepItem[] = [];
  const culturalReport: Array<Record<string, unknown>> = [];
  for (const outcome of cultural.outcomes) {
    const commitment = commitments.find((row) => row.id === outcome.id)!;
    const definition = requireLawDefinition(outcome.lawKey);
    let status = outcome.status;
    if (status === "REVERTED") {
      await setLawStage(tx, {
        countryId,
        definition,
        stage: commitment.fromStage,
        turnId: turn.id,
        now,
      });
      stages[outcome.lawKey] = commitment.fromStage;
    } else if (status === "ACTIVE" && !new Decimal(outcome.progressDelta).isZero()) {
      const shifted = await shiftTrackProgress(tx, {
        countryId,
        definition,
        delta: outcome.progressDelta,
        now,
      });
      if (shifted.after.stage !== commitment.toStage) {
        status = shifted.after.stage === commitment.fromStage ? "REVERTED" : "SUPERSEDED";
        stages[outcome.lawKey] = shifted.after.stage;
      }
    }
    const closed = status !== "ACTIVE";
    await tx
      .update(countryLawChanges)
      .set({
        status,
        adaptation: new Decimal(outcome.adaptation).toDecimalPlaces(8).toString(),
        erosion: new Decimal(outcome.erosion).toDecimalPlaces(4).toString(),
        closedTurnId: closed ? turn.id : null,
        updatedAt: now,
      })
      .where(eq(countryLawChanges.id, outcome.id));
    culturalReport.push({
      lawKey: outcome.lawKey,
      action: outcome.action,
      status,
      adaptation: outcome.adaptation,
      erosion: outcome.erosion,
      upkeep: closed ? "0" : outcome.upkeep,
    });
    if (!closed) {
      adaptiveItems.push({
        key: `adaptive:${outcome.id}`,
        lawKey: outcome.lawKey,
        label: definition.label,
        detail: `${definition.stages[commitment.toStage - 1]?.label ?? ""} 적응 중`,
        mode: "ADAPTIVE",
        upkeep: outcome.upkeep,
      });
    }
  }

  const months = monthsInTurn(turn.gameDateStart, turn.gameDateEnd);
  let deficitChanges: DriftChange[] = [];
  let deficitApplied: MonthlyDrift = {};
  if (cultural.state === "DEFICIT" && cultural.erodibleCount === 0) {
    deficitApplied = deficitDrift(balance);
    deficitChanges = applyMonthlyDrifts(political, deficitApplied, months);
  }

  const fixedItems = fixedLawUpkeepItems(stages);
  const upkeepItems = [...fixedItems, ...adaptiveItems];
  const upkeep = upkeepItems.reduce((sum, item) => sum.plus(item.upkeep), new Decimal(0));
  const [incomeModifierTotal, administration] = await Promise.all([
    activeIncomeModifierTotal(tx, countryId, turn.sequence),
    Promise.resolve(administrationIncomeFromEvidence(input.evidence)),
  ]);
  const income = calculatePoliticalPowerIncome({
    legitimacy: Number(political.legitimacy ?? 50),
    stability: Number(political.stability ?? 50),
    governmentApproval: Number(political.governmentApproval ?? 50),
    stateCapacity: Number(political.stateCapacity ?? 50),
    corruption: Number(political.corruption ?? 0),
    modifiers: incomeModifierTotal.plus(administration.income),
  });
  const net = income.total.minus(upkeep);
  const finalBalance = balance.toDecimalPlaces(4);

  await tx
    .update(countryPoliticalResources)
    .set({
      balance: finalBalance.toString(),
      incomePerGameDay: netIncomePerGameDay(net).toString(),
      lastAccruedAt: now,
      updatedAt: now,
    })
    .where(eq(countryPoliticalResources.id, resource.id));
  political.politicalPower = finalBalance.toString();

  await tx
    .update(politicalPowerLedger)
    .set({
      balanceBefore: balanceBefore.toDecimalPlaces(4).toString(),
      balanceAfter: finalBalance.toString(),
      grossIncome: income.total.toDecimalPlaces(4).toString(),
      upkeep: upkeep.toDecimalPlaces(4).toString(),
      net: net.toDecimalPlaces(4).toString(),
      state: cultural.state,
      breakdown: {
        income: income.components,
        incomeModifiers: incomeModifierTotal.toString(),
        administration,
        upkeep: upkeepItems,
        oneTimePower: oneTimePower.toString(),
        appliedOrders,
        cancelledOrders,
        cultural: culturalReport,
        deficitDrift: deficitApplied,
        deficitChanges,
        months,
      },
    })
    .where(eq(politicalPowerLedger.id, ledger.id));

  return { balance: finalBalance.toString(), net: net.toString(), state: cultural.state };
}

export async function orderLawChange(input: {
  userId: string;
  campaign: Campaign;
  country: Country;
  turn: Turn;
  lawKey: string;
  targetStage: number;
}) {
  const definition = requireLawDefinition(input.lawKey);
  const now = new Date();
  return db.transaction(async (tx) => {
    const resource = await lockAndAccruePoliticalPower(tx, input.country.id, input.campaign, now);
    const [currentCountry] = await tx
      .select()
      .from(countries)
      .where(eq(countries.id, input.country.id))
      .limit(1);
    if (!currentCountry) throw new Error("국가를 찾을 수 없습니다.");
    const [stages, pendingRows, lastSequences, political, atWar] = await Promise.all([
      getCountryLawStages(tx, currentCountry),
      tx
        .select({ id: countryLawChanges.id })
        .from(countryLawChanges)
        .where(
          and(
            eq(countryLawChanges.countryId, input.country.id),
            eq(countryLawChanges.lawKey, definition.key),
            eq(countryLawChanges.status, "PENDING"),
          ),
        )
        .limit(1),
      lastAppliedSequences(tx, input.country.id),
      latestPolitical(tx, input.country.id),
      isCountryAtWar(tx, input.campaign.id, input.country.id),
    ]);
    const currentStage = stages[definition.key];
    const lastSequence = lastSequences.get(definition.key);
    const evaluation = evaluateLawChange(definition, {
      currentStage,
      targetStage: input.targetStage,
      democracy: political?.democracy ?? 50,
      balance: resource.balance,
      atWar,
      turnsSinceLastChange: lastSequence === undefined ? null : input.turn.sequence - lastSequence,
      hasPendingOrder: pendingRows.length > 0,
      turnOpen: input.turn.status === "DRAFT",
    });
    if (!evaluation.allowed || !evaluation.quote) {
      throw new Error(evaluation.reason ?? "법·제도를 바꿀 수 없습니다.");
    }
    const quote = evaluation.quote;
    const nextBalance = new Decimal(resource.balance).minus(quote.cost).toDecimalPlaces(4);
    await tx
      .update(countryPoliticalResources)
      .set({ balance: nextBalance.toString(), updatedAt: now })
      .where(eq(countryPoliticalResources.id, resource.id));
    const [change] = await tx
      .insert(countryLawChanges)
      .values({
        campaignId: input.campaign.id,
        countryId: input.country.id,
        lawKey: definition.key,
        fromStage: currentStage,
        toStage: input.targetStage,
        cost: quote.cost,
        upkeepMode: quote.upkeepMode,
        upkeepMax: quote.upkeep,
        halfLifeYears: quote.halfLifeYears,
        orderedBy: input.userId,
        orderedTurnId: input.turn.id,
      })
      .returning();
    await tx.insert(auditLogs).values({
      campaignId: input.campaign.id,
      actorId: input.userId,
      action: "ORDER_LAW_CHANGE",
      targetType: "COUNTRY_LAW",
      targetId: change.id,
      beforeSummary: { lawKey: definition.key, stage: currentStage, balance: resource.balance },
      afterSummary: {
        lawKey: definition.key,
        stage: input.targetStage,
        cost: quote.cost,
        balance: nextBalance.toString(),
      },
      reason: `${definition.label} 변경 추진`,
    });
    return change;
  });
}

export async function cancelLawChange(input: {
  userId: string;
  campaign: Campaign;
  country: Country;
  turn: Turn;
  changeId: string;
}) {
  if (input.turn.status !== "DRAFT") throw new Error("턴이 열려 있을 때만 취소할 수 있습니다.");
  const now = new Date();
  return db.transaction(async (tx) => {
    const [change] = await tx
      .select()
      .from(countryLawChanges)
      .where(
        and(
          eq(countryLawChanges.id, input.changeId),
          eq(countryLawChanges.countryId, input.country.id),
          eq(countryLawChanges.status, "PENDING"),
        ),
      )
      .limit(1)
      .for("update");
    if (!change) throw new Error("취소할 수 있는 변경이 없습니다.");
    const resource = await lockAndAccruePoliticalPower(tx, input.country.id, input.campaign, now);
    const refunded = clampPoliticalPower(new Decimal(resource.balance).plus(change.cost))
      .toDecimalPlaces(4)
      .toString();
    await tx
      .update(countryPoliticalResources)
      .set({ balance: refunded, updatedAt: now })
      .where(eq(countryPoliticalResources.id, resource.id));
    await tx
      .update(countryLawChanges)
      .set({ status: "CANCELLED", closedTurnId: input.turn.id, updatedAt: now })
      .where(eq(countryLawChanges.id, change.id));
    await tx.insert(auditLogs).values({
      campaignId: input.campaign.id,
      actorId: input.userId,
      action: "CANCEL_LAW_CHANGE",
      targetType: "COUNTRY_LAW",
      targetId: change.id,
      beforeSummary: { status: "PENDING", balance: resource.balance },
      afterSummary: { status: "CANCELLED", refund: change.cost, balance: refunded },
      reason: "시행 전 취소",
    });
  });
}

/** 관리자가 정치력 없이 법·제도 단계를 직접 정한다. 기다리던 변경은 환불하고 취소한다. */
export async function adminSetLawStage(input: {
  actorId: string;
  countryId: string;
  lawKey: string;
  stage: number;
  reason: string;
}) {
  const definition = requireLawDefinition(input.lawKey);
  if (!isValidLawStage(definition, input.stage)) throw new Error("존재하지 않는 단계입니다.");
  const now = new Date();
  return db.transaction(async (tx) => {
    const [country] = await tx
      .select()
      .from(countries)
      .where(eq(countries.id, input.countryId))
      .limit(1);
    if (!country) throw new Error("국가를 찾을 수 없습니다.");
    const [campaign] = await tx
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, country.campaignId))
      .limit(1);
    if (!campaign) throw new Error("캠페인을 찾을 수 없습니다.");
    const stages = await getCountryLawStages(tx, country);
    const pending = await tx
      .select()
      .from(countryLawChanges)
      .where(
        and(
          eq(countryLawChanges.countryId, country.id),
          eq(countryLawChanges.lawKey, definition.key),
          eq(countryLawChanges.status, "PENDING"),
        ),
      );
    if (pending.length) {
      const resource = await lockAndAccruePoliticalPower(tx, country.id, campaign, now);
      const refund = pending.reduce((sum, row) => sum.plus(row.cost), new Decimal(0));
      await tx
        .update(countryPoliticalResources)
        .set({
          balance: clampPoliticalPower(new Decimal(resource.balance).plus(refund))
            .toDecimalPlaces(4)
            .toString(),
          updatedAt: now,
        })
        .where(eq(countryPoliticalResources.id, resource.id));
      await tx
        .update(countryLawChanges)
        .set({ status: "CANCELLED", updatedAt: now })
        .where(
          inArray(
            countryLawChanges.id,
            pending.map((row) => row.id),
          ),
        );
    }
    await tx
      .update(countryLawChanges)
      .set({ status: "SUPERSEDED", updatedAt: now })
      .where(
        and(
          eq(countryLawChanges.countryId, country.id),
          eq(countryLawChanges.lawKey, definition.key),
          eq(countryLawChanges.status, "ACTIVE"),
        ),
      );
    await setLawStage(tx, {
      countryId: country.id,
      definition,
      stage: input.stage,
      turnId: null,
      now,
    });
    await tx.insert(auditLogs).values({
      campaignId: country.campaignId,
      actorId: input.actorId,
      action: "SET_COUNTRY_LAW",
      targetType: "COUNTRY",
      targetId: country.id,
      beforeSummary: { lawKey: definition.key, stage: stages[definition.key] },
      afterSummary: { lawKey: definition.key, stage: input.stage },
      reason: input.reason,
    });
  });
}

/** 기존 경제체제 설정과 경제법 단계를 맞춘다. */
export async function syncEconomyLawWithSystem(
  tx: DatabaseTransaction,
  countryId: string,
  economicSystem: string,
) {
  const definition = requireLawDefinition("economyLaw");
  const [row] = await tx
    .select({ stage: countryLaws.stage })
    .from(countryLaws)
    .where(and(eq(countryLaws.countryId, countryId), eq(countryLaws.lawKey, "economyLaw")))
    .limit(1);
  if (row && economicSystemForEconomyLaw(row.stage) === economicSystem) return;
  const stage = economicSystem === "PLANNED" ? 4 : 3;
  await tx
    .insert(countryLaws)
    .values({ countryId, lawKey: definition.key, stage })
    .onConflictDoUpdate({
      target: [countryLaws.countryId, countryLaws.lawKey],
      set: { stage, updatedAt: new Date() },
    });
}

export type LawBoardEntry = {
  definition: LawDefinition;
  stage: number;
  pending: { id: string; toStage: number; cost: string } | null;
  commitment: {
    toStage: number;
    adaptation: string;
    erosion: string;
    upkeep: string;
  } | null;
  cooldownRemaining: number;
  options: Array<{
    direction: "DOWN" | "UP";
    targetStage: number;
    allowed: boolean;
    reason: string | null;
    cost: string | null;
    upkeep: string | null;
  }>;
};

/** 플레이어 법·제도 화면 데이터 */
export async function getLawBoard(input: {
  campaign: Campaign;
  country: Country;
  turn: Turn | null;
}) {
  const power = await getPoliticalPowerState(input.country.id, input.campaign);
  const [stages, changes, lastSequences, political, atWar, ledgerRows, administration] =
    await Promise.all([
      getCountryLawStages(db, input.country),
      db
        .select()
        .from(countryLawChanges)
        .where(
          and(
            eq(countryLawChanges.countryId, input.country.id),
            inArray(countryLawChanges.status, ["PENDING", "ACTIVE"]),
          ),
        ),
      lastAppliedSequences(db, input.country.id),
      latestPolitical(db, input.country.id),
      isCountryAtWar(db, input.campaign.id, input.country.id),
      db
        .select({ ledger: politicalPowerLedger, sequence: turns.sequence })
        .from(politicalPowerLedger)
        .innerJoin(turns, eq(politicalPowerLedger.turnId, turns.id))
        .where(eq(politicalPowerLedger.countryId, input.country.id))
        .orderBy(desc(turns.sequence))
        .limit(6),
      evaluateCountryAdministration(db, input.country.id),
    ]);
  const democracy = political?.democracy ?? 50;
  const entries: LawBoardEntry[] = LAW_DEFINITIONS.map((definition) => {
    const stage = stages[definition.key];
    const pendingRow = changes.find(
      (row) => row.lawKey === definition.key && row.status === "PENDING",
    );
    const activeRow = changes.find(
      (row) =>
        row.lawKey === definition.key && row.status === "ACTIVE" && row.upkeepMode === "ADAPTIVE",
    );
    const lastSequence = lastSequences.get(definition.key);
    const turnsSince =
      lastSequence === undefined || !input.turn ? null : input.turn.sequence - lastSequence;
    const options = (
      [
        ["DOWN", stage - 1],
        ["UP", stage + 1],
      ] as const
    )
      .filter(([, target]) => isValidLawStage(definition, target))
      .map(([direction, targetStage]) => {
        const evaluation = evaluateLawChange(definition, {
          currentStage: stage,
          targetStage,
          democracy,
          balance: power.balance,
          atWar,
          turnsSinceLastChange: turnsSince,
          hasPendingOrder: Boolean(pendingRow),
          turnOpen: input.turn?.status === "DRAFT",
        });
        return {
          direction,
          targetStage,
          allowed: evaluation.allowed,
          reason: evaluation.reason,
          cost: evaluation.quote?.cost ?? null,
          upkeep: evaluation.quote?.upkeep ?? null,
        };
      });
    return {
      definition,
      stage,
      pending: pendingRow
        ? { id: pendingRow.id, toStage: pendingRow.toStage, cost: pendingRow.cost }
        : null,
      commitment: activeRow
        ? {
            toStage: activeRow.toStage,
            adaptation: activeRow.adaptation,
            erosion: activeRow.erosion,
            upkeep: adaptiveUpkeep(activeRow).toString(),
          }
        : null,
      cooldownRemaining:
        turnsSince === null ? 0 : Math.max(0, definition.cooldownTurns - turnsSince),
      options,
    };
  });

  const fixedItems = fixedLawUpkeepItems(stages);
  const adaptiveItems: UpkeepItem[] = entries.flatMap((entry) =>
    entry.commitment
      ? [
          {
            key: `adaptive:${entry.definition.key}`,
            lawKey: entry.definition.key,
            label: entry.definition.label,
            detail: `${entry.definition.stages[entry.commitment.toStage - 1]?.label ?? ""} 적응 중`,
            mode: "ADAPTIVE" as const,
            upkeep: entry.commitment.upkeep,
          },
        ]
      : [],
  );
  const upkeepItems = [...fixedItems, ...adaptiveItems];
  const upkeep = upkeepItems.reduce((sum, item) => sum.plus(item.upkeep), new Decimal(0));
  const incomeModifierTotal = input.turn
    ? await activeIncomeModifierTotal(db, input.country.id, input.turn.sequence)
    : new Decimal(0);
  const administrationIncome = administration?.tier.politicalPowerIncome ?? 0;
  const income = political
    ? calculatePoliticalPowerIncome({
        legitimacy: political.legitimacy,
        stability: political.stability,
        governmentApproval: political.governmentApproval,
        stateCapacity: political.stateCapacity,
        corruption: political.corruption,
        modifiers: incomeModifierTotal.plus(administrationIncome),
      })
    : null;

  return {
    power,
    netPerYear: new Decimal(power.incomePerGameDay).mul(365).toString(),
    preview: income
      ? {
          income: income.total.toString(),
          incomeComponents: income.components,
          administrationLabel: administration?.tier.label ?? null,
          administrationIncome,
          upkeep: upkeep.toString(),
          upkeepItems,
          net: income.total.minus(upkeep).toString(),
        }
      : null,
    entries,
    atWar,
    ledger: ledgerRows.map(({ ledger, sequence }) => ({ ...ledger, sequence })),
    maxBalance: POLITICAL_POWER_MAX,
  };
}
