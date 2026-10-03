CREATE TABLE "economic_bloc_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bloc_id" uuid NOT NULL,
	"country_id" uuid NOT NULL,
	"role" text DEFAULT 'MEMBER' NOT NULL,
	"joined_turn_id" uuid,
	"added_by" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "economic_bloc_members_role_check" CHECK ("economic_bloc_members"."role" IN ('LEADER', 'MEMBER'))
);
--> statement-breakpoint
CREATE TABLE "economic_blocs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name" text NOT NULL,
	"acronym" text NOT NULL,
	"color" text DEFAULT '#8C7A52' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"founded_turn_id" uuid,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "economic_blocs_status_check" CHECK ("economic_blocs"."status" IN ('ACTIVE', 'DISSOLVED'))
);
--> statement-breakpoint
ALTER TABLE "economic_bloc_members" ADD CONSTRAINT "economic_bloc_members_bloc_id_economic_blocs_id_fk" FOREIGN KEY ("bloc_id") REFERENCES "public"."economic_blocs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_bloc_members" ADD CONSTRAINT "economic_bloc_members_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_bloc_members" ADD CONSTRAINT "economic_bloc_members_joined_turn_id_turns_id_fk" FOREIGN KEY ("joined_turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_bloc_members" ADD CONSTRAINT "economic_bloc_members_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_blocs" ADD CONSTRAINT "economic_blocs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_blocs" ADD CONSTRAINT "economic_blocs_founded_turn_id_turns_id_fk" FOREIGN KEY ("founded_turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_blocs" ADD CONSTRAINT "economic_blocs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "economic_bloc_members_bloc_country_uidx" ON "economic_bloc_members" USING btree ("bloc_id","country_id");--> statement-breakpoint
CREATE UNIQUE INDEX "economic_bloc_members_country_uidx" ON "economic_bloc_members" USING btree ("country_id");--> statement-breakpoint
CREATE UNIQUE INDEX "economic_blocs_campaign_name_uidx" ON "economic_blocs" USING btree ("campaign_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "economic_blocs_campaign_acronym_uidx" ON "economic_blocs" USING btree ("campaign_id","acronym");