CREATE TABLE "country_political_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_id" uuid NOT NULL,
	"balance" numeric(12, 4) DEFAULT '100' NOT NULL,
	"income_per_game_day" numeric(12, 6) DEFAULT '0.1' NOT NULL,
	"last_accrued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "country_political_resources_country_id_unique" UNIQUE("country_id"),
	CONSTRAINT "political_resource_balance_check" CHECK ("country_political_resources"."balance" BETWEEN 0 AND 1000),
	CONSTRAINT "political_resource_income_check" CHECK ("country_political_resources"."income_per_game_day" BETWEEN -10 AND 10)
);
--> statement-breakpoint
ALTER TABLE "country_political_resources" ADD CONSTRAINT "country_political_resources_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "country_political_resources" ("country_id")
SELECT "id" FROM "countries"
ON CONFLICT ("country_id") DO NOTHING;
