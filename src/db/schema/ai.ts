import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { campaigns } from "./campaign";

export const aiProviderCredentials = pgTable(
  "ai_provider_credentials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    encryptedKey: text("encrypted_key").notNull(),
    keyHint: text("key_hint").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("ai_provider_credentials_campaign_provider_uidx").on(
      table.campaignId,
      table.provider,
    ),
  ],
);

export const aiTaskConfigs = pgTable(
  "ai_task_configs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    taskType: text("task_type").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    systemPrompt: text("system_prompt").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("ai_task_configs_campaign_task_uidx").on(table.campaignId, table.taskType),
  ],
);
