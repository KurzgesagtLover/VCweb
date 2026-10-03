import { and, eq } from "drizzle-orm";
import Decimal from "decimal.js";
import { db } from "@/src/db";
import { countryDevelopmentTracks } from "@/src/db/schema";
import {
  DEFAULT_DEVELOPMENT_STAGE,
  advanceDevelopmentTrack,
  developmentMetricDefinition,
  type DevelopmentMetricKey,
} from "@/src/domain/development/tracks";

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function applyCountryDevelopmentDelta(
  tx: DatabaseTransaction,
  input: { countryId: string; metric: DevelopmentMetricKey; delta: string },
) {
  const [current] = await tx
    .select()
    .from(countryDevelopmentTracks)
    .where(
      and(
        eq(countryDevelopmentTracks.countryId, input.countryId),
        eq(countryDevelopmentTracks.metric, input.metric),
      ),
    )
    .limit(1);
  const before = {
    stage: current?.stage ?? DEFAULT_DEVELOPMENT_STAGE,
    progress: current?.progress ?? "0",
  };
  const definition = developmentMetricDefinition(input.metric);
  const after = advanceDevelopmentTrack(before, input.delta, definition.stages.length);

  await tx
    .insert(countryDevelopmentTracks)
    .values({
      countryId: input.countryId,
      metric: input.metric,
      stage: after.stage,
      progress: after.progress,
    })
    .onConflictDoUpdate({
      target: [countryDevelopmentTracks.countryId, countryDevelopmentTracks.metric],
      set: { stage: after.stage, progress: after.progress, updatedAt: new Date() },
    });

  return { before, after };
}

export async function applyCountryDevelopmentDeltas(
  tx: DatabaseTransaction,
  deltas: Array<{ countryId: string; metric: DevelopmentMetricKey; delta: string }>,
) {
  const totals = new Map<string, (typeof deltas)[number]>();
  for (const delta of deltas) {
    const key = `${delta.countryId}:${delta.metric}`;
    const current = totals.get(key);
    totals.set(key, {
      ...delta,
      delta: current ? new Decimal(current.delta).plus(delta.delta).toString() : delta.delta,
    });
  }
  for (const delta of totals.values()) await applyCountryDevelopmentDelta(tx, delta);
}
