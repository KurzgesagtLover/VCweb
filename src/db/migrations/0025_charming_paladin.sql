CREATE TYPE "public"."diplomatic_bloc_status" AS ENUM('ACTIVE', 'DISSOLVED');--> statement-breakpoint
CREATE TYPE "public"."diplomatic_proposal_intent" AS ENUM('GENERAL', 'ALLIANCE_FOUNDATION', 'MUTUAL_DEFENSE', 'INDEPENDENCE_GUARANTEE', 'TRUCE');--> statement-breakpoint
CREATE TYPE "public"."diplomatic_relation_status" AS ENUM('NORMAL', 'WAR', 'CIVIL_WAR', 'TRUCE', 'MUTUAL_DEFENSE', 'INDEPENDENCE_GUARANTEE', 'NO_RELATIONS');--> statement-breakpoint
CREATE TABLE "diplomatic_bloc_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bloc_id" uuid NOT NULL,
	"country_id" uuid NOT NULL,
	"role" text DEFAULT 'MEMBER' NOT NULL,
	"joined_turn_id" uuid,
	"added_by" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "diplomatic_bloc_members_role_check" CHECK ("diplomatic_bloc_members"."role" IN ('LEADER', 'MEMBER'))
);
--> statement-breakpoint
CREATE TABLE "diplomatic_blocs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name" text NOT NULL,
	"acronym" text NOT NULL,
	"color" text DEFAULT '#5D7388' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "diplomatic_bloc_status" DEFAULT 'ACTIVE' NOT NULL,
	"founded_turn_id" uuid,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "country_relations" ADD COLUMN "status" "diplomatic_relation_status" DEFAULT 'NORMAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "diplomatic_proposals" ADD COLUMN "intent" "diplomatic_proposal_intent" DEFAULT 'GENERAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "diplomatic_proposals" ADD COLUMN "terms" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "diplomatic_bloc_members" ADD CONSTRAINT "diplomatic_bloc_members_bloc_id_diplomatic_blocs_id_fk" FOREIGN KEY ("bloc_id") REFERENCES "public"."diplomatic_blocs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diplomatic_bloc_members" ADD CONSTRAINT "diplomatic_bloc_members_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diplomatic_bloc_members" ADD CONSTRAINT "diplomatic_bloc_members_joined_turn_id_turns_id_fk" FOREIGN KEY ("joined_turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diplomatic_bloc_members" ADD CONSTRAINT "diplomatic_bloc_members_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diplomatic_blocs" ADD CONSTRAINT "diplomatic_blocs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diplomatic_blocs" ADD CONSTRAINT "diplomatic_blocs_founded_turn_id_turns_id_fk" FOREIGN KEY ("founded_turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diplomatic_blocs" ADD CONSTRAINT "diplomatic_blocs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "diplomatic_bloc_members_bloc_country_uidx" ON "diplomatic_bloc_members" USING btree ("bloc_id","country_id");--> statement-breakpoint
CREATE UNIQUE INDEX "diplomatic_bloc_members_country_uidx" ON "diplomatic_bloc_members" USING btree ("country_id");--> statement-breakpoint
CREATE UNIQUE INDEX "diplomatic_blocs_campaign_name_uidx" ON "diplomatic_blocs" USING btree ("campaign_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "diplomatic_blocs_campaign_acronym_uidx" ON "diplomatic_blocs" USING btree ("campaign_id","acronym");