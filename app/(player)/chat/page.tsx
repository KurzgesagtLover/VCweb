import type { Role } from "@/src/auth/permissions";
import { requireSession } from "@/src/auth/session";
import {
  getAccessibleChatChannels,
  getActiveChatTimeout,
  getChatPage,
} from "@/src/db/queries/chat";
import { getViewerContext } from "@/src/db/queries/viewer";
import { ChatWorkspace } from "@/src/ui/chat-workspace";
import { TnoReadout, TnoWindow } from "@/src/ui/tno-frame";

export const metadata = { title: "채팅" };

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string; before?: string; reply?: string }>;
}) {
  const session = await requireSession();
  const context = await getViewerContext(session.user.id);
  if (!context.campaign || !context.country) return null;
  const query = await searchParams;
  const channels = await getAccessibleChatChannels({
    campaignId: context.campaign.id,
    role: session.user.role as Role,
    countryId: context.country.id,
  });
  const selected = channels.find((channel) => channel.id === query.channel) ?? channels[0];
  if (!selected) return <div className="empty-state">사용할 수 있는 채널이 없습니다.</div>;
  const [page, timeout] = await Promise.all([
    getChatPage(selected.id, query.before),
    getActiveChatTimeout(session.user.id),
  ]);
  return (
    <TnoWindow
      title="통신망"
      readout={
        <>
          <TnoReadout label="채널" value={`${channels.length}개`} />
          <TnoReadout label="현재" value={selected.name} />
          <TnoReadout label="발신" value={timeout.remainingMs > 0 ? "차단 중" : "정상"} />
        </>
      }
    >
      <div className="tno-chat-slot">
        <ChatWorkspace
          basePath="/chat"
          role={session.user.role as Role}
          countryId={context.country.id}
          channels={channels}
          selected={selected}
          page={page}
          replyToId={query.reply}
          timeoutRemainingMs={timeout.remainingMs}
        />
      </div>
    </TnoWindow>
  );
}
