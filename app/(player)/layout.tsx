import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { requireSession } from "@/src/auth/session";
import { db } from "@/src/db";
import { campaignLoreViews } from "@/src/db/schema";
import { getViewerContext } from "@/src/db/queries/viewer";
import { AppShell } from "@/src/ui/app-shell";

export default async function PlayerLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  if (session.user.role === "ADMIN") redirect("/admin");
  if (session.user.role === "MODERATOR") redirect("/admin/moderation");
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) redirect("/");
  if (!context.assignment || !context.country) redirect("/apply");
  if (context.campaign.loreVersion > 0 && context.campaign.lore.trim()) {
    const loreView = await db.query.campaignLoreViews.findFirst({
      where: and(
        eq(campaignLoreViews.campaignId, context.campaign.id),
        eq(campaignLoreViews.userId, session.user.id),
      ),
    });
    if (!loreView || loreView.version < context.campaign.loreVersion) redirect("/world-intro");
  }
  return (
    <AppShell
      session={session}
      context={{ campaign: context.campaign, country: context.country, turn: context.turn }}
    >
      {children}
    </AppShell>
  );
}
