import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/src/db";
import {
  countryDevelopmentTracks,
  countryLaws,
  countryRelations,
  politicalSnapshots,
  turns,
} from "@/src/db/schema";
import { resolveLawStages, type LawStages } from "@/src/domain/politics/laws";

/** 국가 상태 조회 공용 함수. 법·예산·특수 시스템이 같이 쓴다. */

export type Reader = Pick<typeof db, "select">;

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

export const WAR_STATUSES = ["WAR", "CIVIL_WAR"] as const;
/** 위협으로 보는 관계 상태. 전쟁 외에 교착·게릴라전도 포함한다. */
export const THREAT_STATUSES = ["WAR", "CIVIL_WAR", "GUERRILLA", "STALEMATE"] as const;
/** 관계 점수가 이 값 이하이면 상태와 무관하게 위협으로 본다. */
export const HOSTILE_RELATION_SCORE = -50;

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
        inArray(countryRelations.status, [...WAR_STATUSES]),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** 전쟁 여부와 위협 상대 수. 같은 상대와의 양방향 관계는 한 번만 센다. */
export async function getCountryThreats(reader: Reader, campaignId: string, countryId: string) {
  const rows = await reader
    .select({
      fromCountryId: countryRelations.fromCountryId,
      toCountryId: countryRelations.toCountryId,
      status: countryRelations.status,
      score: countryRelations.score,
    })
    .from(countryRelations)
    .where(
      and(
        eq(countryRelations.campaignId, campaignId),
        or(
          eq(countryRelations.fromCountryId, countryId),
          eq(countryRelations.toCountryId, countryId),
        ),
      ),
    );
  const warStatuses = new Set<string>(WAR_STATUSES);
  const threatStatuses = new Set<string>(THREAT_STATUSES);
  const threatening = new Set<string>();
  let atWar = false;
  for (const row of rows) {
    const other = row.fromCountryId === countryId ? row.toCountryId : row.fromCountryId;
    if (warStatuses.has(row.status)) atWar = true;
    if (threatStatuses.has(row.status) || row.score <= HOSTILE_RELATION_SCORE) {
      threatening.add(other);
    }
  }
  return { atWar, threats: threatening.size, threatCountryIds: [...threatening] };
}

export async function latestPoliticalSnapshot(reader: Reader, countryId: string) {
  const [row] = await reader
    .select({ snapshot: politicalSnapshots })
    .from(politicalSnapshots)
    .innerJoin(turns, eq(politicalSnapshots.turnId, turns.id))
    .where(eq(politicalSnapshots.countryId, countryId))
    .orderBy(desc(turns.sequence))
    .limit(1);
  return row?.snapshot ?? null;
}
