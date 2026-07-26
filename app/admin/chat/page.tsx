import type { Role } from "@/src/auth/permissions";
import { requireRole } from "@/src/auth/session";
import {
  getAccessibleChatChannels,
  getActiveChatTimeout,
  getChatPage,
} from "@/src/db/queries/chat";
import { getViewerContext } from "@/src/db/queries/viewer";
import { ChatWorkspace } from "@/src/ui/chat-workspace";
import { PageHead } from "@/src/ui/page-head";

export const metadata = { title: "운영 채팅" };

export default async function AdminChatPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string; before?: string; reply?: string }>;
}) {
  const session = await requireRole("MODERATOR");
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) return null;
  const query = await searchParams;
  const channels = await getAccessibleChatChannels({
    campaignId: context.campaign.id,
    role: session.user.role as Role,
    countryId: null,
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
        eyebrow="OPERATIONS / CHAT"
        title="운영 채팅"
        description="공지와 전체 채널을 운영하고 국가 채널을 확인합니다."
      />
      <ChatWorkspace
        basePath="/admin/chat"
        role={session.user.role as Role}
        countryId={null}
        channels={channels}
        selected={selected}
        page={page}
        replyToId={query.reply}
        timeoutRemainingMs={timeout.remainingMs}
      />
    </div>
  );
}
