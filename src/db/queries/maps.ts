import { and, asc, eq, lte } from "drizzle-orm";
import { db } from "@/src/db";
import { campaignMaps } from "@/src/db/schema";

export function getCampaignMaps(campaignId: string, mapCount: number) {
  return db.query.campaignMaps.findMany({
    where: and(eq(campaignMaps.campaignId, campaignId), lte(campaignMaps.position, mapCount)),
    orderBy: [asc(campaignMaps.position)],
  });
}

export function getPrimaryCampaignMap(campaignId: string) {
  return db.query.campaignMaps.findFirst({
    where: and(eq(campaignMaps.campaignId, campaignId), eq(campaignMaps.position, 1)),
  });
}
