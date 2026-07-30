import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { campaigns, turns } from "./campaign";
import { countries } from "./country";
import { superEventAudience, superEventStatus } from "./enums";

/**
 * 슈퍼이벤트: 턴 진행과 무관하게 관리자가 전 국가에 강제 송출하는 전면 연출.
 * 선택지가 없고 효과도 적용하지 않으므로 `events`와 분리해 둔다.
 */
export const superEvents = pgTable(
  "super_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    turnId: uuid("turn_id").references(() => turns.id, { onDelete: "restrict" }),
    status: superEventStatus("status").notNull().default("DRAFT"),
    audience: superEventAudience("audience").notNull().default("ALL"),
    targetCountryId: uuid("target_country_id").references(() => countries.id, {
      onDelete: "restrict",
    }),
    codeName: text("code_name").notNull().default(""),
    sourceLabel: text("source_label").notNull().default(""),
    title: text("title").notNull(),
    subtitle: text("subtitle").notNull().default(""),
    body: text("body").notNull().default(""),
    footnote: text("footnote").notNull().default(""),
    stampText: text("stamp_text").notNull().default(""),
    imageUrl: text("image_url"),
    imageAlt: text("image_alt").notNull().default(""),
    audioUrl: text("audio_url"),
    audioVolume: integer("audio_volume").notNull().default(70),
    audioStartSeconds: integer("audio_start_seconds").notNull().default(0),
    audioIntroReduced: boolean("audio_intro_reduced").notNull().default(false),
    dismissLabel: text("dismiss_label").notNull().default("확인"),
    holdSeconds: integer("hold_seconds").notNull().default(4),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    broadcastAt: timestamp("broadcast_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("super_events_campaign_status_idx").on(table.campaignId, table.status),
    index("super_events_broadcast_idx").on(table.campaignId, table.broadcastAt),
  ],
);

/** 사용자별 확인 기록. 확인한 사용자에게는 다시 띄우지 않는다. */
export const superEventReceipts = pgTable(
  "super_event_receipts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    superEventId: uuid("super_event_id")
      .notNull()
      .references(() => superEvents.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("super_event_receipts_event_user_uidx").on(table.superEventId, table.userId),
    index("super_event_receipts_user_idx").on(table.userId),
  ],
);
