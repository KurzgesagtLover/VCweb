import Link from "next/link";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { logoutAction } from "@/src/actions/auth";
import type { AppSession } from "@/src/auth/auth";
import { db } from "@/src/db";
import { notifications } from "@/src/db/schema";
import { getPendingSuperEvents } from "@/src/db/queries/superevents";
import { turnStatusLabel } from "@/src/domain/display-labels";
import {
  adjudicationRealDayInterval,
  formatSeoulSchedule,
  nextTurnDeadline,
} from "@/src/domain/turn/schedule";
import { NavRail } from "./nav-rail";
import { NotificationCenter } from "./notification-center";
import { SuperEventBroadcast } from "./superevent-broadcast";

type Context = {
  campaign: {
    id: string;
    name: string;
    gameDaysPerRealDay: number;
    adjudicationIntervalGameDays: number;
    turnCloseHour: number;
    turnCloseMinute: number;
  };
  country: { id: string; name: string; color: string } | null;
  turn: { sequence: number; gameDateEnd: string; status: string; deadlineAt: Date | null } | null;
};

const playerNav = [
  ["외교·지도", "/diplomacy", "◍"],
  ["국가 브리핑", "/dashboard", "▦"],
  ["정치", "/country/politics", "◇"],
  ["경제", "/country/economy", "▥"],
  ["인문", "/country/society", "◎"],
  ["역사·지리", "/country/history", "⌁"],
  ["국토", "/country/territory", "⬢"],
  ["연구", "/country/research", "⌬"],
  ["사건", "/events", "!"],
  ["연재", "/submissions", "✎"],
  ["세계관", "/world", "◐"],
  ["채팅", "/chat", "◌"],
] as const;

const adminNav = [
  ["관리 현황", "/admin", "▦"],
  ["세계관 편집", "/admin/world", "◐"],
  ["국가 관리", "/admin/countries", "◈"],
  ["사용자·배정", "/admin/users", "♙"],
  ["경제 원장", "/admin/economy", "▥"],
  ["정치 원장", "/admin/politics", "◇"],
  ["판정 검토", "/admin/submissions", "✎"],
  ["사건·야당", "/admin/events", "!"],
  ["슈퍼이벤트", "/admin/superevents", "◉"],
  ["지도 편집", "/admin/map", "⬡"],
  ["행정구역 편집", "/admin/territory", "⬢"],
  ["외교 검토", "/admin/diplomacy", "◎"],
  ["운영 채팅", "/admin/chat", "◌"],
  ["사용자·제재", "/admin/moderation", "⊘"],
  ["AI 작업", "/admin/ai-jobs", "↻"],
  ["감사 로그", "/admin/audit", "≣"],
] as const;

const moderatorNav = [
  ["운영 채팅", "/admin/chat", "◌"],
  ["사용자·제재", "/admin/moderation", "⊘"],
] as const;

export async function AppShell({
  session,
  context,
  mode = "player",
  children,
}: {
  session: AppSession;
  context: Context;
  mode?: "player" | "admin";
  children: React.ReactNode;
}) {
  const [notificationRows, unreadRows, pendingSuperEvents] = await Promise.all([
    db.query.notifications.findMany({
      where: eq(notifications.userId, session.user.id),
      orderBy: [desc(notifications.createdAt)],
      limit: 6,
    }),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, session.user.id), isNull(notifications.readAt))),
    getPendingSuperEvents({
      campaignId: context.campaign.id,
      userId: session.user.id,
      countryId: context.country?.id ?? null,
    }),
  ]);
  const nav =
    mode === "admin" ? (session.user.role === "ADMIN" ? adminNav : moderatorNav) : playerNav;
  return (
    <div
      className="app-frame"
      style={{ "--country": context.country?.color ?? "#5aa5b4" } as React.CSSProperties}
    >
      <header className="topbar">
        <Link className="brand" href={mode === "admin" ? "/admin" : "/diplomacy"}>
          <span className="brand-mark" aria-hidden="true" />
          NEXUS
        </Link>
        <div className="turn-strip">
          <span>
            캠페인<strong>{context.campaign.name}</strong>
          </span>
          <span>
            게임 날짜<strong>{context.turn?.gameDateEnd ?? "미정"}</strong>
          </span>
          <span>
            턴 상태
            <strong>
              {context.turn
                ? `T${context.turn.sequence} · ${turnStatusLabel(context.turn.status)}`
                : "준비 중"}
            </strong>
          </span>
          <span>
            다음 마감
            <strong>
              {context.turn?.deadlineAt
                ? formatSeoulSchedule(context.turn.deadlineAt)
                : formatSeoulSchedule(
                    nextTurnDeadline(
                      new Date(),
                      adjudicationRealDayInterval(
                        context.campaign.gameDaysPerRealDay,
                        context.campaign.adjudicationIntervalGameDays,
                      ),
                      context.campaign.turnCloseHour,
                      context.campaign.turnCloseMinute,
                    ),
                  )}
            </strong>
          </span>
        </div>
        <div className="user-area">
          <NotificationCenter
            items={notificationRows.map((item) => ({
              ...item,
              createdAt: item.createdAt.toISOString(),
              readAt: item.readAt?.toISOString() ?? null,
            }))}
            unreadCount={unreadRows[0]?.count ?? 0}
          />
          <span>
            <small>
              {mode === "admin"
                ? session.user.role === "ADMIN"
                  ? "관리자"
                  : "운영자"
                : context.country?.name}
            </small>
            <br />
            {session.user.name}
          </span>
          <form action={logoutAction}>
            <button>로그아웃</button>
          </form>
        </div>
      </header>
      <aside className="sidebar">
        <NavRail
          label={mode === "admin" ? "관리 메뉴" : "국가 운영 메뉴"}
          items={nav.map(([label, href, glyph]) => ({ label, href, glyph }))}
          systemItem={
            session.user.role === "ADMIN" && mode === "player"
              ? { label: "관리자 화면", href: "/admin", glyph: "⚙" }
              : undefined
          }
        />
      </aside>
      <main className="content" id="main-content" tabIndex={-1}>
        {children}
      </main>
      <SuperEventBroadcast initialItems={pendingSuperEvents} />
    </div>
  );
}
