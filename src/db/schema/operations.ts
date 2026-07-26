import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { campaigns } from "./campaign";
import { countries } from "./country";
import { chatChannelType, moderationActionType } from "./enums";

export const chatChannels = pgTable(
  "chat_channels",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    countryId: uuid("country_id").references(() => countries.id, { onDelete: "restrict" }),
    type: chatChannelType("type").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("chat_channels_campaign_idx").on(table.campaignId, table.type),
    uniqueIndex("chat_channels_country_uidx").on(table.campaignId, table.countryId),
  ],
);

export const chatChannelMembers = pgTable(
  "chat_channel_members",
  {
    channelId: uuid("channel_id")
      .notNull()
      .references(() => chatChannels.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("chat_channel_members_uidx").on(table.channelId, table.userId),
    index("chat_channel_members_user_idx").on(table.userId),
  ],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => chatChannels.id, { onDelete: "restrict" }),
    senderId: text("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    replyToId: uuid("reply_to_id"),
    body: text("body").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: text("deleted_by").references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({ columns: [table.replyToId], foreignColumns: [table.id] }).onDelete("restrict"),
    index("chat_messages_channel_created_idx").on(table.channelId, table.createdAt),
    index("chat_messages_sender_created_idx").on(table.senderId, table.createdAt),
    check("chat_messages_body_length_check", sql`char_length(${table.body}) BETWEEN 1 AND 1200`),
  ],
);

export const moderationActions = pgTable(
  "moderation_actions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    type: moderationActionType("type").notNull(),
    targetUserId: text("target_user_id").references(() => users.id, { onDelete: "restrict" }),
    messageId: uuid("message_id").references(() => chatMessages.id, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("moderation_actions_user_idx").on(table.targetUserId, table.createdAt),
    index("moderation_actions_message_idx").on(table.messageId),
  ],
);
