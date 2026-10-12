import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { campaigns, turns } from "./campaign";
import { countries } from "./country";

/** 국가에 붙은 국가정신. 같은 키는 한 국가에 하나만 활성 상태로 둔다. */
export const countrySpirits = pgTable(
  "country_spirits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    countryId: uuid("country_id")
      .notNull()
      .references(() => countries.id, { onDelete: "restrict" }),
    /** 템플릿 키 또는 직접 만든 국가정신 키 */
    spiritKey: text("spirit_key").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    category: text("category").notNull().default("SPECIAL"),
    effects: jsonb("effects").$type<Record<string, unknown>>().notNull().default({}),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id"),
    startTurnId: uuid("start_turn_id").references(() => turns.id, { onDelete: "restrict" }),
    startsOn: date("starts_on").notNull(),
    /** 마지막으로 유지되는 게임 날짜. null이면 뗄 때까지 유지 */
    endsOn: date("ends_on"),
    status: text("status").notNull().default("ACTIVE"),
    endedTurnId: uuid("ended_turn_id").references(() => turns.id, { onDelete: "restrict" }),
    endedReason: text("ended_reason"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("country_spirits_country_idx").on(table.countryId, table.status),
    uniqueIndex("country_spirits_active_key_uidx")
      .on(table.countryId, table.spiritKey)
      .where(sql`${table.status} = 'ACTIVE'`),
    check("country_spirits_status_check", sql`${table.status} IN ('ACTIVE', 'EXPIRED', 'REMOVED')`),
    check(
      "country_spirits_source_check",
      sql`${table.sourceType} IN ('ADMIN', 'EVENT', 'JUDGMENT', 'WORLD', 'SCRIPT', 'SYSTEM')`,
    ),
    check(
      "country_spirits_category_check",
      sql`${table.category} IN ('POLITICS', 'ECONOMY', 'SOCIETY', 'MILITARY', 'DIPLOMACY', 'WORLD', 'SPECIAL')`,
    ),
  ],
);
