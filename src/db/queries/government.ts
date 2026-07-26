import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/src/db";
import {
  governmentOfficeDefinitions,
  governmentOfficeHolders,
  officePersonnelChanges,
} from "@/src/db/schema";

export async function getGovernmentStructure(countryId: string, includeInactive = false) {
  const definitions = await db.query.governmentOfficeDefinitions.findMany({
    where: includeInactive
      ? eq(governmentOfficeDefinitions.countryId, countryId)
      : and(
          eq(governmentOfficeDefinitions.countryId, countryId),
          eq(governmentOfficeDefinitions.isActive, true),
        ),
    orderBy: [
      asc(governmentOfficeDefinitions.branch),
      asc(governmentOfficeDefinitions.displayOrder),
      asc(governmentOfficeDefinitions.title),
    ],
  });
  if (!definitions.length) return { offices: [], recentChanges: [] };

  const holders = await db.query.governmentOfficeHolders.findMany({
    where: inArray(
      governmentOfficeHolders.officeId,
      definitions.map((office) => office.id),
    ),
    orderBy: [asc(governmentOfficeHolders.slotNumber)],
  });
  const holderMap = new Map<string, typeof holders>();
  for (const holder of holders) {
    const current = holderMap.get(holder.officeId) ?? [];
    current.push(holder);
    holderMap.set(holder.officeId, current);
  }
  const offices = definitions.map((office) => ({
    office,
    holders: (holderMap.get(office.id) ?? []).filter((holder) =>
      includeInactive ? true : holder.slotNumber <= office.seatCount,
    ),
  }));
  const recentChanges = await db.query.officePersonnelChanges.findMany({
    where: eq(officePersonnelChanges.countryId, countryId),
    orderBy: [desc(officePersonnelChanges.createdAt)],
    limit: 12,
  });
  return { offices, recentChanges };
}

export async function getOfficeSlot(officeId: string, slotNumber: number) {
  return db
    .select({ office: governmentOfficeDefinitions, holder: governmentOfficeHolders })
    .from(governmentOfficeDefinitions)
    .leftJoin(
      governmentOfficeHolders,
      and(
        eq(governmentOfficeHolders.officeId, governmentOfficeDefinitions.id),
        eq(governmentOfficeHolders.slotNumber, slotNumber),
      ),
    )
    .where(
      and(
        eq(governmentOfficeDefinitions.id, officeId),
        eq(governmentOfficeDefinitions.isActive, true),
      ),
    )
    .limit(1)
    .then((rows) => {
      const row = rows[0];
      return row && slotNumber <= row.office.seatCount ? row : null;
    });
}
