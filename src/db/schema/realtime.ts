import { integer, jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { campaigns } from "./campaign";

/** 캠페인별 실시간 계층 시계. 마지막 판정 시각과 그때의 게임 시각을 기억한다. */
export const realtimeClocks = pgTable("realtime_clocks", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id")
    .notNull()
    .unique()
    .references(() => campaigns.id, { onDelete: "restrict" }),
  lastTickAt: timestamp("last_tick_at", { withTimezone: true }),
  lastGameAt: timestamp("last_game_at", { withTimezone: true }),
  tickCount: integer("tick_count").notNull().default(0),
  lastResult: jsonb("last_result").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
