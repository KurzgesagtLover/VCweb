"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { markAllNotificationsReadAction } from "@/src/actions/notifications";

type Item = {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

type CategoryId = "turn" | "event" | "system";

const CATEGORIES: {
  id: CategoryId;
  label: string;
  glyph: string;
  match: (type: string) => boolean;
}[] = [
  {
    id: "turn",
    label: "턴",
    glyph: "◷",
    match: (type) => type === "TURN_PUBLISHED" || type.startsWith("TURN_"),
  },
  {
    id: "event",
    label: "이벤트",
    glyph: "◉",
    match: (type) => type === "SUPER_EVENT" || type.includes("EVENT"),
  },
  {
    id: "system",
    label: "일반",
    glyph: "✦",
    match: () => true,
  },
];

function categorize(type: string): CategoryId {
  for (const category of CATEGORIES) {
    if (category.id === "system") continue;
    if (category.match(type)) return category.id;
  }
  return "system";
}

export function NotificationCenter({ items }: { items: Item[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState<CategoryId | null>(null);
  const visible = pathname === "/diplomacy";

  useEffect(() => {
    if (!visible) return;
    const stream = new EventSource("/api/notifications/stream");
    stream.addEventListener("notification", () => router.refresh());
    return () => stream.close();
  }, [router, visible]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const grouped = useMemo(() => {
    const buckets: Record<CategoryId, Item[]> = { turn: [], event: [], system: [] };
    for (const item of items) {
      buckets[categorize(item.type)].push(item);
    }
    return buckets;
  }, [items]);

  const unreadByCategory = useMemo(() => {
    const counts: Record<CategoryId, number> = { turn: 0, event: 0, system: 0 };
    for (const category of CATEGORIES) {
      counts[category.id] = grouped[category.id].filter((item) => !item.readAt).length;
    }
    return counts;
  }, [grouped]);

  const activeItems = open ? grouped[open] : [];
  const activeMeta = open ? CATEGORIES.find((category) => category.id === open) : null;
  const activeUnread = open ? unreadByCategory[open] : 0;

  if (!visible) return null;

  return (
    <div className="notification-dock">
      {CATEGORIES.map((category) => {
        const unread = unreadByCategory[category.id];
        const isOpen = open === category.id;
        return (
          <button
            key={category.id}
            type="button"
            className={isOpen ? "notification-dock-btn open" : "notification-dock-btn"}
            aria-label={`${category.label} 알림${unread > 0 ? ` ${unread}개` : ""}`}
            aria-expanded={isOpen}
            onClick={() => setOpen(isOpen ? null : category.id)}
          >
            <span className="notification-dock-content">
              <span aria-hidden="true">{category.glyph}</span>
              <span className="notification-dock-copy">{category.label} 알림</span>
            </span>
            {unread > 0 ? <strong>{unread > 9 ? "9+" : unread}</strong> : null}
          </button>
        );
      })}

      {open && activeMeta ? (
        <div className="notification-popover" role="dialog" aria-label={`${activeMeta.label} 알림`}>
          <div className="panel-head">
            <h2>{activeMeta.label} 알림</h2>
            <button type="button" className="button secondary" onClick={() => setOpen(null)}>
              닫기
            </button>
          </div>
          {activeItems.length ? (
            activeItems.map((item) => (
              <Link
                className={item.readAt ? "notification-item" : "notification-item unread"}
                href={item.href ?? "#"}
                key={item.id}
                onClick={() => setOpen(null)}
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
          {activeUnread > 0 ? (
            <form action={markAllNotificationsReadAction}>
              <button className="button secondary">모두 읽음</button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
