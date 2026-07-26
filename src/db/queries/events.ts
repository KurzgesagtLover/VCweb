import { and, asc, desc, eq, or } from "drizzle-orm";
import { db } from "@/src/db";
import { eventChoices, eventOptions, events, oppositionActions } from "@/src/db/schema";

export async function getCountryEvents(countryId: string) {
  const rows = await db.query.events.findMany({
    where: or(eq(events.countryId, countryId), eq(events.visibility, "PUBLIC")),
    orderBy: [desc(events.createdAt)],
  });
  return Promise.all(
    rows.map(async (event) => {
      const [options, choice] = await Promise.all([
        db.query.eventOptions.findMany({
          where: eq(eventOptions.eventId, event.id),
          orderBy: [asc(eventOptions.order)],
        }),
        db.query.eventChoices.findFirst({
          where: and(eq(eventChoices.eventId, event.id), eq(eventChoices.countryId, countryId)),
        }),
      ]);
      return { event, options, choice: choice ?? null };
    }),
  );
}

export async function getAdminEventQueue(campaignId: string) {
  const [eventRows, oppositionRows] = await Promise.all([
    db.query.events.findMany({
      where: and(eq(events.campaignId, campaignId), eq(events.status, "REVIEW")),
      orderBy: [asc(events.createdAt)],
    }),
    db.query.oppositionActions.findMany({
      where: eq(oppositionActions.status, "PENDING_REVIEW"),
      orderBy: [asc(oppositionActions.createdAt)],
    }),
  ]);
  return { events: eventRows, opposition: oppositionRows };
}
