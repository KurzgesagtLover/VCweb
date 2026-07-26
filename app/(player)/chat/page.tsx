import type { Role } from "@/src/auth/permissions";
import { requireSession } from "@/src/auth/session";
import {
  getAccessibleChatChannels,
  getActiveChatTimeout,
  getChatPage,
} from "@/src/db/queries/chat";
import { getViewerContext } from "@/src/db/queries/viewer";
import { ChatWorkspace } from "@/src/ui/chat-workspace";
import { PageHead } from "@/src/ui/page-head";

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
    <div className="section-stack">
      <PageHead
        eyebrow="COMMUNICATIONS"
        title="채팅"
        description="캠페인과 국가 채널의 대화를 확인합니다."
      />
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
  );
}
