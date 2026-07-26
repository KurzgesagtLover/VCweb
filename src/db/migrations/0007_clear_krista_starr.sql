CREATE TABLE "government_office_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_id" uuid NOT NULL,
	"branch" text NOT NULL,
	"title" text NOT NULL,
	"seat_count" integer DEFAULT 1 NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "government_office_branch_check" CHECK ("government_office_definitions"."branch" IN ('EXECUTIVE', 'JUDICIAL', 'LEGISLATIVE')),
	CONSTRAINT "government_office_seat_count_check" CHECK ("government_office_definitions"."seat_count" BETWEEN 1 AND 12)
);
--> statement-breakpoint
CREATE TABLE "government_office_holders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"office_id" uuid NOT NULL,
	"slot_number" integer NOT NULL,
	"holder_name" text,
	"portrait_path" text,
	"appointment_narrative" text,
	"appointed_by" text,
	"start_turn_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "government_office_holder_slot_check" CHECK ("government_office_holders"."slot_number" BETWEEN 1 AND 12)
);
--> statement-breakpoint
CREATE TABLE "office_personnel_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_id" uuid NOT NULL,
	"office_id" uuid NOT NULL,
	"slot_number" integer NOT NULL,
	"previous_holder_name" text,
	"new_holder_name" text NOT NULL,
	"narrative" text NOT NULL,
	"portrait_path" text NOT NULL,
	"submitted_by" text NOT NULL,
	"turn_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "government_office_definitions" ADD CONSTRAINT "government_office_definitions_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "government_office_holders" ADD CONSTRAINT "government_office_holders_office_id_government_office_definitions_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."government_office_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "government_office_holders" ADD CONSTRAINT "government_office_holders_appointed_by_users_id_fk" FOREIGN KEY ("appointed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "government_office_holders" ADD CONSTRAINT "government_office_holders_start_turn_id_turns_id_fk" FOREIGN KEY ("start_turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "office_personnel_changes" ADD CONSTRAINT "office_personnel_changes_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "office_personnel_changes" ADD CONSTRAINT "office_personnel_changes_office_id_government_office_definitions_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."government_office_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "office_personnel_changes" ADD CONSTRAINT "office_personnel_changes_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "office_personnel_changes" ADD CONSTRAINT "office_personnel_changes_turn_id_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "government_office_country_branch_title_uidx" ON "government_office_definitions" USING btree ("country_id","branch","title");--> statement-breakpoint
CREATE UNIQUE INDEX "government_office_holder_slot_uidx" ON "government_office_holders" USING btree ("office_id","slot_number");--> statement-breakpoint
CREATE INDEX "office_personnel_changes_country_idx" ON "office_personnel_changes" USING btree ("country_id","created_at");--> statement-breakpoint
WITH latest_politics AS (
	SELECT DISTINCT ON (p."country_id") p."country_id"
	FROM "political_snapshots" p
	JOIN "turns" t ON t."id" = p."turn_id"
	ORDER BY p."country_id", t."sequence" DESC
)
INSERT INTO "government_office_definitions" ("country_id", "branch", "title", "seat_count", "display_order")
SELECT latest_politics."country_id", office."branch", office."title", 1, office."display_order"
FROM latest_politics
CROSS JOIN (VALUES
	('EXECUTIVE', '국가원수', 10),
	('EXECUTIVE', '행정부 수반', 20),
	('JUDICIAL', '최고재판관', 10),
	('LEGISLATIVE', '의회 의장', 10)
) AS office("branch", "title", "display_order")
ON CONFLICT ("country_id", "branch", "title") DO NOTHING;--> statement-breakpoint
WITH latest_politics AS (
	SELECT DISTINCT ON (p."country_id")
		p."country_id", p."turn_id", p."head_of_state", p."head_of_government", p."assembly_speaker", p."chief_justice"
	FROM "political_snapshots" p
	JOIN "turns" t ON t."id" = p."turn_id"
	ORDER BY p."country_id", t."sequence" DESC
)
INSERT INTO "government_office_holders" ("office_id", "slot_number", "holder_name", "start_turn_id")
SELECT d."id", 1,
	CASE d."title"
		WHEN '국가원수' THEN p."head_of_state"
		WHEN '행정부 수반' THEN p."head_of_government"
		WHEN '최고재판관' THEN p."chief_justice"
		WHEN '의회 의장' THEN p."assembly_speaker"
	END,
	p."turn_id"
FROM "government_office_definitions" d
JOIN latest_politics p ON p."country_id" = d."country_id"
WHERE NOT EXISTS (
	SELECT 1 FROM "government_office_holders" h
	WHERE h."office_id" = d."id" AND h."slot_number" = 1
);
