import Link from "next/link";
import type { Role } from "@/src/auth/permissions";
import type { getAccessibleChatChannels, getChatPage } from "@/src/db/queries/chat";
import { canPostChatChannel } from "@/src/domain/chat/policy";
import { ChatComposer } from "./chat-composer";
import { ChatLiveRefresh } from "./chat-live-refresh";

type Channels = Awaited<ReturnType<typeof getAccessibleChatChannels>>;
type MessagePage = Awaited<ReturnType<typeof getChatPage>>;

const channelLabel = { CAMPAIGN: "전체", COUNTRY: "국가", ANNOUNCEMENT: "공지" } as const;

export function ChatWorkspace({
  basePath,
  role,
  countryId,
  channels,
  selected,
  page,
  replyToId,
  timeoutRemainingMs,
}: {
  basePath: "/chat" | "/admin/chat";
  role: Role;
  countryId: string | null;
  channels: Channels;
  selected: Channels[number];
  page: MessagePage;
  replyToId?: string;
  timeoutRemainingMs: number;
}) {
  const canPost = canPostChatChannel({
    role,
    assignedCountryId: countryId,
    channelType: selected.type,
    channelCountryId: selected.countryId,
  });
  const channelUrl = `${basePath}?channel=${selected.id}`;
  return (
    <section className="chat-layout">
      <aside className="chat-channel-panel">
        <h2>채널</h2>
        <nav aria-label="채팅 채널">
          {channels.map((channel) => (
            <Link
              href={`${basePath}?channel=${channel.id}`}
              className={channel.id === selected.id ? "chat-channel active" : "chat-channel"}
              aria-current={channel.id === selected.id ? "page" : undefined}
              key={channel.id}
            >
              <small>{channelLabel[channel.type]}</small>
              <span>{channel.name}</span>
            </Link>
          ))}
        </nav>
      </aside>
      <article className="chat-room">
        <header className="panel-head">
          <div>
            <small>{channelLabel[selected.type]} 채널</small>
            <h2>{selected.name}</h2>
          </div>
          <ChatLiveRefresh />
        </header>
        {page.hasMore && page.nextCursor && (
          <Link
            className="button secondary chat-more"
            href={`${channelUrl}&before=${page.nextCursor}`}
          >
            이전 메시지
          </Link>
        )}
        <div className="chat-messages" role="log" aria-live="polite" aria-label="메시지 목록">
          {page.messages.length ? (
            page.messages.map(({ message, sender, parent }) => (
              <article
                className={message.deletedAt ? "chat-message deleted" : "chat-message"}
                key={message.id}
              >
                {parent && (
                  <blockquote>
                    <strong>{parent.sender?.name ?? "사용자"}</strong>{" "}
                    {parent.message.deletedAt ? "삭제된 메시지" : parent.message.body.slice(0, 120)}
                  </blockquote>
                )}
                <header>
                  <strong>{sender?.name ?? "사용자"}</strong>
                  <span className="role-chip">{sender?.role ?? "USER"}</span>
                  <time dateTime={message.createdAt.toISOString()}>
                    {new Intl.DateTimeFormat("ko-KR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(message.createdAt)}
                  </time>
                </header>
                {message.deletedAt ? <p>삭제된 메시지입니다.</p> : <p>{message.body}</p>}
                {!message.deletedAt && canPost && (
                  <Link
                    className="text-action"
                    href={`${channelUrl}&reply=${message.id}#message-composer`}
                  >
                    답글
                  </Link>
                )}
              </article>
            ))
          ) : (
            <div className="empty-state">첫 메시지를 남겨 보세요.</div>
          )}
        </div>
        {timeoutRemainingMs > 0 ? (
          <div className="form-message" role="status">
            채팅 타임아웃 중 · 약 {Math.max(1, Math.ceil(timeoutRemainingMs / 60_000))}분 남음
          </div>
        ) : canPost ? (
          <ChatComposer channelId={selected.id} replyToId={replyToId} />
        ) : (
          <div className="empty-state">읽기 전용 채널입니다.</div>
        )}
      </article>
    </section>
  );
}
