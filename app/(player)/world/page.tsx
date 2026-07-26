import { requireSession } from "@/src/auth/session";
import { getViewerContext } from "@/src/db/queries/viewer";
import { LoreFrame } from "@/src/ui/lore-frame";
import { PageHead } from "@/src/ui/page-head";

export const metadata = { title: "세계관" };

export default async function WorldPage() {
  const session = await requireSession();
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) return null;
  return (
    <div className="section-stack">
      <PageHead
        eyebrow="WORLD ARCHIVE"
        title={context.campaign.name}
        description=""
        aside={<span className="status-pill">v{context.campaign.loreVersion}</span>}
      />
      {context.campaign.lore.trim() ? (
        <LoreFrame
          html={context.campaign.lore}
          css={context.campaign.loreCss}
          title={`${context.campaign.name} 세계관`}
        />
      ) : (
        <div className="empty-state">아직 게시된 세계관이 없습니다.</div>
      )}
    </div>
  );
}
