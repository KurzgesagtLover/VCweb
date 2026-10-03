import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/src/db";
import { administrativeDivisionRequests, administrativeDivisions } from "@/src/db/schema";

export async function getCountryTerritory(countryId: string) {
  const [divisions, requests] = await Promise.all([
    db.query.administrativeDivisions.findMany({
      where: eq(administrativeDivisions.countryId, countryId),
      orderBy: [asc(administrativeDivisions.level), asc(administrativeDivisions.name)],
    }),
    db.query.administrativeDivisionRequests.findMany({
      where: eq(administrativeDivisionRequests.countryId, countryId),
      orderBy: [desc(administrativeDivisionRequests.createdAt)],
    }),
  ]);
  return {
    divisions,
    requests,
  };
}
