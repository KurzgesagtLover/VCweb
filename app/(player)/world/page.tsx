import { requireSession } from "@/src/auth/session";
import { getViewerContext } from "@/src/db/queries/viewer";
import { LoreFrame } from "@/src/ui/lore-frame";
import { TnoReadout, TnoWindow } from "@/src/ui/tno-frame";

export const metadata = { title: "세계관" };

export default async function WorldPage() {
  const session = await requireSession();
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) return null;
  return (
    <TnoWindow
      title={`${context.campaign.name} 세계관 기록실`}
      readout={
        <>
          <TnoReadout label="개정" value={`v${context.campaign.loreVersion}`} />
          <TnoReadout label="상태" value={context.campaign.lore.trim() ? "게시" : "미게시"} />
        </>
      }
    >
      {context.campaign.lore.trim() ? (
        <div className="tno-lore-slot">
          <LoreFrame
            html={context.campaign.lore}
            css={context.campaign.loreCss}
            title={`${context.campaign.name} 세계관`}
          />
        </div>
      ) : (
        <p>아직 게시된 세계관이 없습니다.</p>
      )}
    </TnoWindow>
  );
}
