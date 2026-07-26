"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { markAllNotificationsReadAction } from "@/src/actions/notifications";

type Item = {
  id: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

export function NotificationCenter({ items, unreadCount }: { items: Item[]; unreadCount: number }) {
  const router = useRouter();
  useEffect(() => {
    const stream = new EventSource("/api/notifications/stream");
    stream.addEventListener("notification", () => router.refresh());
    return () => stream.close();
  }, [router]);

  return (
    <details className="notification-center">
      <summary aria-label={`알림 ${unreadCount}개`}>
        알림{unreadCount > 0 && <strong>{unreadCount}</strong>}
      </summary>
      <div className="notification-popover">
        <div className="panel-head">
          <h2>알림</h2>
        </div>
        {items.length ? (
          items.map((item) => (
            <Link
              className={item.readAt ? "notification-item" : "notification-item unread"}
              href={item.href ?? "#"}
              key={item.id}
            >
              <strong>{item.title}</strong>
              <span>{item.body}</span>
              <time dateTime={item.createdAt}>
                {new Intl.DateTimeFormat("ko-KR", {
                  dateStyle: "short",
                  timeStyle: "short",
                }).format(new Date(item.createdAt))}
              </time>
            </Link>
          ))
        ) : (
          <div className="empty-state">새 알림이 없습니다.</div>
        )}
        {unreadCount > 0 && (
          <form action={markAllNotificationsReadAction}>
            <button className="button secondary">모두 읽음</button>
          </form>
        )}
      </div>
    </details>
  );
}
