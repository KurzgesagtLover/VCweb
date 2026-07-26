import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { acknowledgeCampaignLoreAction } from "@/src/actions/campaign";
import { requireSession } from "@/src/auth/session";
import { db } from "@/src/db";
import { campaignLoreViews } from "@/src/db/schema";
import { getViewerContext } from "@/src/db/queries/viewer";
import { LoreFrame } from "@/src/ui/lore-frame";

export const metadata = { title: "세계관" };

export default async function WorldIntroPage() {
  const session = await requireSession();
  if (session.user.role === "ADMIN" || session.user.role === "MODERATOR") redirect("/admin");
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) redirect("/");
  const view = await db.query.campaignLoreViews.findFirst({
    where: and(
      eq(campaignLoreViews.campaignId, context.campaign.id),
      eq(campaignLoreViews.userId, session.user.id),
    ),
  });
  if (
    !context.campaign.lore.trim() ||
    context.campaign.loreVersion < 1 ||
    (view && view.version >= context.campaign.loreVersion)
  ) {
    redirect(context.assignment ? "/dashboard" : "/apply");
  }

  return (
    <main className="lore-intro-page">
      <LoreFrame
        html={context.campaign.lore}
        css={context.campaign.loreCss}
        title={`${context.campaign.name} 세계관`}
        className="lore-intro-frame"
      />
      <form action={acknowledgeCampaignLoreAction} className="lore-enter-form">
        <button type="submit">입장</button>
      </form>
    </main>
  );
}
