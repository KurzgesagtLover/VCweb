import { getSession } from "@/src/auth/session";
import { getPendingSuperEvents } from "@/src/db/queries/superevents";
import { getViewerContext } from "@/src/db/queries/viewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session || session.user.status !== "ACTIVE")
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) return Response.json({ items: [] });
  const items = await getPendingSuperEvents({
    campaignId: context.campaign.id,
    userId: session.user.id,
    countryId: context.country?.id ?? null,
  });
  return Response.json({ items });
}
