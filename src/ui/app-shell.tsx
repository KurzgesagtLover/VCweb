import { desc, eq, sql } from "drizzle-orm";
import { logoutAction } from "@/src/actions/auth";
import type { AppSession } from "@/src/auth/auth";
import { db } from "@/src/db";
import { countryProfileRevisions, notifications, politicalSnapshots, turns } from "@/src/db/schema";
import { getPendingSuperEvents } from "@/src/db/queries/superevents";
import { adjudicationRealDayInterval, type GameTimeUnit } from "@/src/domain/turn/schedule";
import { CountryFlag } from "./country-flag";
import { NavRail, type NavRailItem } from "./nav-rail";
import { NotificationCenter } from "./notification-center";
import {
  PoliticalStatusRail,
  type PoliticalMetricDetails,
  type PoliticalStatusMetrics,
} from "./political-status-rail";
import { ShellClock } from "./shell-clock";
import { SuperEventBroadcast } from "./superevent-broadcast";

type Context = {
  campaign: {
    id: string;
    name: string;
    gameDaysPerRealDay: number;
    adjudicationIntervalGameDays: number;
    gameTimePerRealDayValue?: number;
    gameTimePerRealDayUnit?: GameTimeUnit;
    adjudicationIntervalValue?: number;
    adjudicationIntervalUnit?: GameTimeUnit;
    turnCloseHour: number;
    turnCloseMinute: number;
    pausedAt?: Date | null;
  };
  country: {
    id: string;
    name: string;
    color: string;
    currentProfileRevisionId: string | null;
  } | null;
  turn: {
    sequence: number;
    gameDateStart?: string;
    gameDateEnd: string;
    status: string;
    deadlineAt: Date | null;
  } | null;
};

const playerNav: NavRailItem[] = [
  { label: "외교·지도", href: "/diplomacy", icon: "diplomacyMap" },
  { label: "국가 브리핑", href: "/dashboard", icon: "briefing" },
  { label: "정치", href: "/country/politics", icon: "politics" },
  { label: "경제", href: "/country/economy", icon: "economy" },
  { label: "인문", href: "/country/society", icon: "society" },
  { label: "역사·지리", href: "/country/history", icon: "historyGeography" },
  { label: "국토", href: "/country/territory", icon: "territory" },
  { label: "건설", href: "/country/construction", icon: "construction" },
  { label: "연구", href: "/country/research", icon: "research" },
  { label: "사건", href: "/events", icon: "event" },
  { label: "연재", href: "/submissions", icon: "submission" },
  { label: "세계 정세", href: "/world-state", icon: "world" },
  { label: "세계관", href: "/world", icon: "world" },
  { label: "채팅", href: "/chat", icon: "chat" },
  { label: "국가 변경", href: "/apply", icon: "switchCountry" },
];

const adminNav: NavRailItem[] = [
  { label: "관리 현황", href: "/admin", icon: "briefing" },
  { label: "세계관 편집", href: "/admin/world", icon: "world" },
  { label: "세계 메커니즘", href: "/admin/world-mechanics", icon: "world" },
  { label: "국가 관리", href: "/admin/countries", icon: "country" },
  { label: "사용자·배정", href: "/admin/users", icon: "society" },
  { label: "경제 원장", href: "/admin/economy", icon: "economy" },
  { label: "기업 관리", href: "/admin/companies", icon: "economy" },
  { label: "정치 원장", href: "/admin/politics", icon: "politics" },
  { label: "판정 검토", href: "/admin/submissions", icon: "submission" },
  { label: "사건·야당", href: "/admin/events", icon: "event" },
  { label: "슈퍼이벤트", href: "/admin/superevents", icon: "event" },
  { label: "지도 편집", href: "/admin/map", icon: "territory" },
  { label: "외교 검토", href: "/admin/diplomacy", icon: "diplomacyMap" },
  { label: "운영 채팅", href: "/admin/chat", icon: "chat" },
  { label: "사용자·제재", href: "/admin/moderation", icon: "shield" },
  { label: "AI 작업", href: "/admin/ai-jobs", icon: "research" },
  { label: "감사 로그", href: "/admin/audit", icon: "briefing" },
];

const moderatorNav: NavRailItem[] = [
  { label: "운영 채팅", href: "/admin/chat", icon: "chat" },
  { label: "사용자·제재", href: "/admin/moderation", icon: "shield" },
];

const POLITICAL_METRIC_KEYS: Array<keyof PoliticalStatusMetrics> = [
  "stability",
  "legitimacy",
  "governmentApproval",
  "policySupport",
  "stateCapacity",
  "democracy",
  "unrest",
  "corruption",
];

const MODIFIER_SOURCE_LABELS: Record<string, string> = {
  JUDGMENT: "정책 판정",
  EVENT_CHOICE: "사건 선택",
  OPPOSITION_ACTION: "야당 행동",
  AUTO_TURN: "기본 추세",
  ADMIN: "관리자 조정",
};

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
  const politicalStatusPromise =
    mode === "player" && context.country
      ? db
          .select({
            stability: politicalSnapshots.stability,
            legitimacy: politicalSnapshots.legitimacy,
            governmentApproval: politicalSnapshots.governmentApproval,
            policySupport: politicalSnapshots.policySupport,
            stateCapacity: politicalSnapshots.stateCapacity,
            democracy: politicalSnapshots.democracy,
            unrest: politicalSnapshots.unrest,
            corruption: politicalSnapshots.corruption,
            gameDateEnd: turns.gameDateEnd,
          })
          .from(politicalSnapshots)
          .innerJoin(turns, eq(politicalSnapshots.turnId, turns.id))
          .where(eq(politicalSnapshots.countryId, context.country.id))
          .orderBy(desc(turns.sequence))
          .limit(2)
      : Promise.resolve([]);
  const politicalModifiersPromise =
    mode === "player" && context.country && context.turn
      ? db.execute<{
          metric: string;
          operation: string;
          value: string;
          sourceType: string;
        }>(sql`
          SELECT
            modifier.metric,
            modifier.operation,
            modifier.value,
            modifier.source_type AS "sourceType"
          FROM modifiers modifier
          INNER JOIN turns start_turn ON start_turn.id = modifier.start_turn_id
          LEFT JOIN turns end_turn ON end_turn.id = modifier.end_turn_id
          WHERE modifier.country_id = ${context.country.id}
            AND modifier.target_type = 'COUNTRY'
            AND modifier.metric IN (
              'stability', 'legitimacy', 'governmentApproval', 'policySupport',
              'stateCapacity', 'democracy', 'unrest', 'corruption'
            )
            AND start_turn.sequence <= ${context.turn.sequence}
            AND (
              end_turn.sequence >= ${context.turn.sequence}
              OR (
                end_turn.sequence IS NULL
                AND (
                  modifier.duration_turns IS NULL
                  OR start_turn.sequence + modifier.duration_turns > ${context.turn.sequence}
                )
              )
            )
          ORDER BY modifier.created_at DESC
          LIMIT 64
        `)
      : Promise.resolve([]);
  const [
    notificationRows,
    pendingSuperEvents,
    countryProfile,
    politicalStatusRows,
    politicalModifierRows,
  ] = await Promise.all([
    db.query.notifications.findMany({
      where: eq(notifications.userId, session.user.id),
      orderBy: [desc(notifications.createdAt)],
      limit: 40,
    }),
    getPendingSuperEvents({
      campaignId: context.campaign.id,
      userId: session.user.id,
      countryId: context.country?.id ?? null,
    }),
    context.country?.currentProfileRevisionId
      ? db.query.countryProfileRevisions.findFirst({
          where: eq(countryProfileRevisions.id, context.country.currentProfileRevisionId),
          columns: { flag: true },
        })
      : null,
    politicalStatusPromise,
    politicalModifiersPromise,
  ]);
  const nav =
    mode === "admin" ? (session.user.role === "ADMIN" ? adminNav : moderatorNav) : playerNav;
  const intervalRealDays = adjudicationRealDayInterval(
    context.campaign.gameTimePerRealDayValue ?? context.campaign.gameDaysPerRealDay,
    context.campaign.adjudicationIntervalValue ?? context.campaign.adjudicationIntervalGameDays,
    context.campaign.gameTimePerRealDayUnit ?? "DAY",
    context.campaign.adjudicationIntervalUnit ?? "DAY",
  );
  const latestPolitical = politicalStatusRows[0] ?? null;
  const previousPolitical = politicalStatusRows[1] ?? null;
  const elapsedGameDays =
    latestPolitical && previousPolitical
      ? Math.max(
          1,
          Math.round(
            (Date.parse(latestPolitical.gameDateEnd) - Date.parse(previousPolitical.gameDateEnd)) /
              86_400_000,
          ),
        )
      : null;
  const politicalMetricDetails = Object.fromEntries(
    POLITICAL_METRIC_KEYS.map((metric) => {
      const ratePerGameDay =
        latestPolitical && previousPolitical && elapsedGameDays
          ? (latestPolitical[metric] - previousPolitical[metric]) / elapsedGameDays
          : null;
      const causes = politicalModifierRows
        .filter((modifier) => modifier.metric === metric)
        .slice(0, 4)
        .map((modifier) => {
          const value = Number(modifier.value);
          const effect =
            modifier.operation === "MULTIPLY"
              ? `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`
              : `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
          return `${MODIFIER_SOURCE_LABELS[modifier.sourceType] ?? modifier.sourceType} ${effect}`;
        });
      return [metric, { ratePerGameDay, causes }];
    }),
  ) as PoliticalMetricDetails;

  return (
    <div
      className="app-frame"
      style={{ "--country": context.country?.color ?? "#5aa5b4" } as React.CSSProperties}
    >
      {mode === "player" && context.country ? (
        <div className="globe-own-flag shell-own-flag" aria-label={`${context.country.name} 국기`}>
          <span>
            <CountryFlag value={countryProfile?.flag} name={context.country.name} />
          </span>
        </div>
      ) : null}
      <div className="shell-corner">
        <form action={logoutAction}>
          <button type="submit" className="shell-logout">
            로그아웃
          </button>
        </form>
        <ShellClock
          gameDateStart={context.turn?.gameDateStart ?? context.turn?.gameDateEnd ?? null}
          gameDateEnd={context.turn?.gameDateEnd ?? null}
          deadlineAt={context.turn?.deadlineAt?.toISOString() ?? null}
          intervalRealDays={intervalRealDays}
          initialNow={new Date().toISOString()}
          pausedAt={context.campaign.pausedAt?.toISOString() ?? null}
        />
      </div>
      <aside className="sidebar">
        <NavRail
          label={mode === "admin" ? "관리 메뉴" : "국가 운영 메뉴"}
          items={nav}
          systemItem={
            session.user.role === "ADMIN" && mode === "player"
              ? { label: "관리자 화면", href: "/admin", icon: "settings" }
              : undefined
          }
        />
      </aside>
      {mode === "player" && latestPolitical ? (
        <PoliticalStatusRail metrics={latestPolitical} details={politicalMetricDetails} />
      ) : null}
      <main className="content" id="main-content" tabIndex={-1}>
        {children}
      </main>
      <NotificationCenter
        items={notificationRows.map((item) => ({
          id: item.id,
          type: item.type,
          title: item.title,
          body: item.body,
          href: item.href,
          createdAt: item.createdAt.toISOString(),
          readAt: item.readAt?.toISOString() ?? null,
        }))}
      />
      <SuperEventBroadcast initialItems={pendingSuperEvents} />
    </div>
  );
}
