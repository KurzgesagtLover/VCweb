import { requireRole } from "@/src/auth/session";
import { getViewerContext } from "@/src/db/queries/viewer";
import { LoreEditor } from "@/src/ui/lore-editor";
import { PageHead } from "@/src/ui/page-head";

export const metadata = { title: "세계관 편집" };

export default async function AdminWorldPage() {
  const session = await requireRole("ADMIN");
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) return null;

  return (
    <div className="section-stack">
      <PageHead
        eyebrow="ADMIN / WORLD"
        title="세계관 편집"
        description=""
        aside={<span className="status-pill">v{context.campaign.loreVersion}</span>}
      />
      <LoreEditor initialHtml={context.campaign.lore} initialCss={context.campaign.loreCss} />
    </div>
  );
}
