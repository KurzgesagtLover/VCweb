CREATE TYPE "public"."diplomatic_message_status" AS ENUM('DRAFT', 'SENT', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."diplomatic_proposal_status" AS ENUM('SENT', 'ACCEPTED', 'REJECTED', 'COUNTERED', 'DELAYED', 'PENDING_AI', 'PENDING_REVIEW', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."diplomatic_proposal_type" AS ENUM('STATEMENT', 'NEGOTIATION', 'TREATY', 'TRADE', 'AID', 'WARNING', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."diplomatic_visibility" AS ENUM('PUBLIC', 'PRIVATE');--> statement-breakpoint
CREATE TYPE "public"."effect_status" AS ENUM('VALID', 'WARNING', 'APPROVED', 'REJECTED', 'APPLIED');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('DRAFT', 'REVIEW', 'PUBLISHED', 'RESOLVED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."event_visibility" AS ENUM('PUBLIC', 'COUNTRY', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('CALCULATE_COUNTRY_ECONOMY', 'CALCULATE_COUNTRY_RESEARCH', 'JUDGE_SUBMISSION', 'GENERATE_OPPOSITION_ACTION', 'GENERATE_AI_DIPLOMACY_RESPONSE', 'GENERATE_TURN_EVENT', 'FINALIZE_TURN_REVIEW_DATA');--> statement-breakpoint
CREATE TYPE "public"."judgment_review_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'NEEDS_INFO');--> statement-breakpoint
CREATE TYPE "public"."judgment_run_status" AS ENUM('RUNNING', 'SUCCEEDED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."judgment_verdict" AS ENUM('SUCCESS', 'PARTIAL', 'FAILURE', 'DELAYED', 'NEEDS_ADMIN');--> statement-breakpoint
CREATE TYPE "public"."opposition_action_status" AS ENUM('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED');--> statement-breakpoint
CREATE TYPE "public"."submission_category" AS ENUM('ECONOMY', 'POLITICS', 'RESEARCH', 'SOCIETY', 'DIPLOMACY', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('DRAFT', 'SUBMITTED', 'LOCKED', 'JUDGING', 'NEEDS_INFO', 'APPROVED', 'REJECTED', 'PUBLISHED');--> statement-breakpoint
CREATE TABLE "applied_effects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"turn_id" uuid NOT NULL,
	"source_key" text NOT NULL,
	"effect_proposal_id" uuid,
	"event_choice_id" uuid,
	"modifier_id" uuid,
	"effect" jsonb NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "effect_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"judgment_proposal_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"metric" text NOT NULL,
	"operation" text NOT NULL,
	"value" numeric(18, 8) NOT NULL,
	"duration_turns" integer,
	"reason" text NOT NULL,
	"status" "effect_status" NOT NULL,
	"validation_warning" text,
	"original_effect" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "effect_operation_check" CHECK ("effect_proposals"."operation" IN ('ADD', 'MULTIPLY')),
	CONSTRAINT "effect_duration_check" CHECK ("effect_proposals"."duration_turns" IS NULL OR "effect_proposals"."duration_turns" BETWEEN 1 AND 12)
);
--> statement-breakpoint
CREATE TABLE "event_choices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"country_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"chosen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"order" integer NOT NULL,
	"label" text NOT NULL,
	"description" text NOT NULL,
	"expected_effect" text NOT NULL,
	"effects" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"country_id" uuid,
	"title" text NOT NULL,
	"subtitle" text DEFAULT '' NOT NULL,
	"body" text NOT NULL,
	"background_image_key" text,
	"portrait_image_key" text,
	"music_key" text,
	"visibility" "event_visibility" NOT NULL,
	"status" "event_status" DEFAULT 'DRAFT' NOT NULL,
	"start_turn_id" uuid NOT NULL,
	"expires_turn_id" uuid,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"trigger" jsonb,
	"required" boolean DEFAULT false NOT NULL,
	"choice_mutable" boolean DEFAULT true NOT NULL,
	"requires_admin" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"turn_id" uuid,
	"type" "job_type" NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "job_status" DEFAULT 'QUEUED' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error_code" text,
	"error_message" text,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "judgment_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"judgment_run_id" uuid NOT NULL,
	"submission_id" uuid,
	"country_id" uuid NOT NULL,
	"turn_id" uuid NOT NULL,
	"verdict" "judgment_verdict" NOT NULL,
	"public_summary" text NOT NULL,
	"public_narrative" text NOT NULL,
	"admin_rationale" text NOT NULL,
	"assumptions" text[] DEFAULT '{}' NOT NULL,
	"confidence" numeric(5, 4) NOT NULL,
	"follow_up_events" jsonb NOT NULL,
	"warnings" text[] DEFAULT '{}' NOT NULL,
	"requires_admin" boolean DEFAULT true NOT NULL,
	"status" "judgment_review_status" DEFAULT 'PENDING' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "judgment_confidence_check" CHECK ("judgment_proposals"."confidence" BETWEEN 0 AND 1)
);
--> statement-breakpoint
CREATE TABLE "judgment_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"turn_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"input_hash" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"status" "judgment_run_status" DEFAULT 'RUNNING' NOT NULL,
	"error_code" text,
	"error_message" text,
	"latency_ms" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"estimated_cost_usd" numeric(14, 8),
	"raw_output" jsonb,
	"validated_output" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"campaign_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"href" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opposition_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_id" uuid NOT NULL,
	"turn_id" uuid NOT NULL,
	"party_id" uuid,
	"event_id" uuid,
	"title" text NOT NULL,
	"narrative" text NOT NULL,
	"rationale" text NOT NULL,
	"effects" jsonb NOT NULL,
	"requires_admin" boolean DEFAULT true NOT NULL,
	"status" "opposition_action_status" DEFAULT 'PENDING_REVIEW' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"author_id" text NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submission_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"metadata" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"country_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"turn_id" uuid NOT NULL,
	"title" text NOT NULL,
	"category" "submission_category" NOT NULL,
	"body" text NOT NULL,
	"goal" text NOT NULL,
	"expected_duration_turns" integer NOT NULL,
	"budget" numeric(30, 4),
	"related_country_ids" uuid[] DEFAULT '{}' NOT NULL,
	"related_tech_ids" uuid[] DEFAULT '{}' NOT NULL,
	"status" "submission_status" DEFAULT 'DRAFT' NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"character_count" integer NOT NULL,
	"estimated_tokens" integer NOT NULL,
	"submitted_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submission_duration_check" CHECK ("submissions"."expected_duration_turns" BETWEEN 1 AND 12),
	CONSTRAINT "submission_budget_check" CHECK ("submissions"."budget" IS NULL OR "submissions"."budget" >= 0),
	CONSTRAINT "submission_content_size_check" CHECK ("submissions"."character_count" BETWEEN 1 AND 12000)
);
--> statement-breakpoint
CREATE TABLE "turn_country_workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"turn_id" uuid NOT NULL,
	"country_id" uuid NOT NULL,
	"before_economic" jsonb NOT NULL,
	"after_economic" jsonb NOT NULL,
	"before_political" jsonb NOT NULL,
	"after_political" jsonb NOT NULL,
	"evidence" jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "turn_step_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"turn_id" uuid NOT NULL,
	"step" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "job_status" DEFAULT 'RUNNING' NOT NULL,
	"result" jsonb,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "country_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"from_country_id" uuid NOT NULL,
	"to_country_id" uuid NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"last_interaction" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "country_relations_score_check" CHECK ("country_relations"."score" BETWEEN -100 AND 100),
	CONSTRAINT "country_relations_not_self_check" CHECK ("country_relations"."from_country_id" <> "country_relations"."to_country_id")
);
--> statement-breakpoint
CREATE TABLE "diplomatic_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"sender_country_id" uuid NOT NULL,
	"author_user_id" text,
	"response_type" text NOT NULL,
	"body" text NOT NULL,
	"is_ai" boolean DEFAULT false NOT NULL,
	"status" "diplomatic_message_status" DEFAULT 'SENT' NOT NULL,
	"relation_delta" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "diplomatic_orientations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_id" uuid NOT NULL,
	"public_principles" text NOT NULL,
	"interests" text[] DEFAULT '{}' NOT NULL,
	"taboos" text[] DEFAULT '{}' NOT NULL,
	"risk_tolerance" integer DEFAULT 50 NOT NULL,
	"goals" text[] DEFAULT '{}' NOT NULL,
	"private_context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "diplomatic_orientations_country_id_unique" UNIQUE("country_id")
);
--> statement-breakpoint
CREATE TABLE "diplomatic_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"turn_id" uuid NOT NULL,
	"from_country_id" uuid NOT NULL,
	"to_country_id" uuid NOT NULL,
	"created_by" text NOT NULL,
	"type" "diplomatic_proposal_type" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"visibility" "diplomatic_visibility" NOT NULL,
	"status" "diplomatic_proposal_status" DEFAULT 'SENT' NOT NULL,
	"expires_turn_id" uuid,
	"requires_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "diplomatic_proposals_not_self_check" CHECK ("diplomatic_proposals"."from_country_id" <> "diplomatic_proposals"."to_country_id")
);
--> statement-breakpoint
CREATE TABLE "map_cell_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"change_set_id" uuid NOT NULL,
	"cell_id" text NOT NULL,
	"previous_country_id" uuid,
	"new_country_id" uuid
);
--> statement-breakpoint
CREATE TABLE "map_cells" (
	"id" text PRIMARY KEY NOT NULL,
	"q" integer NOT NULL,
	"r" integer NOT NULL,
	"geometry" geometry(MultiPolygon,4326) NOT NULL,
	"center_latitude" numeric(10, 7) NOT NULL,
	"center_longitude" numeric(11, 7) NOT NULL,
	"is_land" boolean DEFAULT true NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	"area_km2" numeric(18, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "map_cells_area_check" CHECK ("map_cells"."area_km2" > 0)
);
--> statement-breakpoint
CREATE TABLE "map_change_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"base_revision" integer NOT NULL,
	"new_revision" integer NOT NULL,
	"target_country_id" uuid,
	"actor_id" text NOT NULL,
	"reason" text NOT NULL,
	"cell_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "map_ownership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"cell_id" text NOT NULL,
	"country_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "treaties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"party_country_ids" uuid[] NOT NULL,
	"terms" jsonb NOT NULL,
	"start_turn_id" uuid,
	"end_turn_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applied_effects" ADD CONSTRAINT "applied_effects_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applied_effects" ADD CONSTRAINT "applied_effects_turn_id_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applied_effects" ADD CONSTRAINT "applied_effects_effect_proposal_id_effect_proposals_id_fk" FOREIGN KEY ("effect_proposal_id") REFERENCES "public"."effect_proposals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "effect_proposals" ADD CONSTRAINT "effect_proposals_judgment_proposal_id_judgment_proposals_id_fk" FOREIGN KEY ("judgment_proposal_id") REFERENCES "public"."judgment_proposals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_choices" ADD CONSTRAINT "event_choices_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_choices" ADD CONSTRAINT "event_choices_option_id_event_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."event_options"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_choices" ADD CONSTRAINT "event_choices_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_choices" ADD CONSTRAINT "event_choices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_options" ADD CONSTRAINT "event_options_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_start_turn_id_turns_id_fk" FOREIGN KEY ("start_turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_expires_turn_id_turns_id_fk" FOREIGN KEY ("expires_turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_turn_id_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judgment_proposals" ADD CONSTRAINT "judgment_proposals_judgment_run_id_judgment_runs_id_fk" FOREIGN KEY ("judgment_run_id") REFERENCES "public"."judgment_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judgment_proposals" ADD CONSTRAINT "judgment_proposals_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judgment_proposals" ADD CONSTRAINT "judgment_proposals_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judgment_proposals" ADD CONSTRAINT "judgment_proposals_turn_id_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judgment_proposals" ADD CONSTRAINT "judgment_proposals_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judgment_runs" ADD CONSTRAINT "judgment_runs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judgment_runs" ADD CONSTRAINT "judgment_runs_turn_id_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opposition_actions" ADD CONSTRAINT "opposition_actions_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opposition_actions" ADD CONSTRAINT "opposition_actions_turn_id_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opposition_actions" ADD CONSTRAINT "opposition_actions_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opposition_actions" ADD CONSTRAINT "opposition_actions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opposition_actions" ADD CONSTRAINT "opposition_actions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_versions" ADD CONSTRAINT "submission_versions_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_versions" ADD CONSTRAINT "submission_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_turn_id_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turn_country_workspaces" ADD CONSTRAINT "turn_country_workspaces_turn_id_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turn_country_workspaces" ADD CONSTRAINT "turn_country_workspaces_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turn_step_runs" ADD CONSTRAINT "turn_step_runs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turn_step_runs" ADD CONSTRAINT "turn_step_runs_turn_id_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_relations" ADD CONSTRAINT "country_relations_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_relations" ADD CONSTRAINT "country_relations_from_country_id_countries_id_fk" FOREIGN KEY ("from_country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_relations" ADD CONSTRAINT "country_relations_to_country_id_countries_id_fk" FOREIGN KEY ("to_country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diplomatic_messages" ADD CONSTRAINT "diplomatic_messages_proposal_id_diplomatic_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."diplomatic_proposals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diplomatic_messages" ADD CONSTRAINT "diplomatic_messages_sender_country_id_countries_id_fk" FOREIGN KEY ("sender_country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diplomatic_messages" ADD CONSTRAINT "diplomatic_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diplomatic_orientations" ADD CONSTRAINT "diplomatic_orientations_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diplomatic_proposals" ADD CONSTRAINT "diplomatic_proposals_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diplomatic_proposals" ADD CONSTRAINT "diplomatic_proposals_turn_id_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diplomatic_proposals" ADD CONSTRAINT "diplomatic_proposals_from_country_id_countries_id_fk" FOREIGN KEY ("from_country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diplomatic_proposals" ADD CONSTRAINT "diplomatic_proposals_to_country_id_countries_id_fk" FOREIGN KEY ("to_country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diplomatic_proposals" ADD CONSTRAINT "diplomatic_proposals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diplomatic_proposals" ADD CONSTRAINT "diplomatic_proposals_expires_turn_id_turns_id_fk" FOREIGN KEY ("expires_turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_cell_changes" ADD CONSTRAINT "map_cell_changes_change_set_id_map_change_sets_id_fk" FOREIGN KEY ("change_set_id") REFERENCES "public"."map_change_sets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_cell_changes" ADD CONSTRAINT "map_cell_changes_cell_id_map_cells_id_fk" FOREIGN KEY ("cell_id") REFERENCES "public"."map_cells"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_cell_changes" ADD CONSTRAINT "map_cell_changes_previous_country_id_countries_id_fk" FOREIGN KEY ("previous_country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_cell_changes" ADD CONSTRAINT "map_cell_changes_new_country_id_countries_id_fk" FOREIGN KEY ("new_country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_change_sets" ADD CONSTRAINT "map_change_sets_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_change_sets" ADD CONSTRAINT "map_change_sets_target_country_id_countries_id_fk" FOREIGN KEY ("target_country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_change_sets" ADD CONSTRAINT "map_change_sets_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_ownership" ADD CONSTRAINT "map_ownership_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_ownership" ADD CONSTRAINT "map_ownership_cell_id_map_cells_id_fk" FOREIGN KEY ("cell_id") REFERENCES "public"."map_cells"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_ownership" ADD CONSTRAINT "map_ownership_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treaties" ADD CONSTRAINT "treaties_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treaties" ADD CONSTRAINT "treaties_start_turn_id_turns_id_fk" FOREIGN KEY ("start_turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treaties" ADD CONSTRAINT "treaties_end_turn_id_turns_id_fk" FOREIGN KEY ("end_turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "applied_effects_source_key_uidx" ON "applied_effects" USING btree ("source_key");--> statement-breakpoint
CREATE UNIQUE INDEX "event_choices_event_country_uidx" ON "event_choices" USING btree ("event_id","country_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_options_event_order_uidx" ON "event_options" USING btree ("event_id","order");--> statement-breakpoint
CREATE INDEX "events_country_status_idx" ON "events" USING btree ("country_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_idempotency_uidx" ON "jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "jobs_claim_idx" ON "jobs" USING btree ("status","available_at");--> statement-breakpoint
CREATE UNIQUE INDEX "judgment_proposal_run_uidx" ON "judgment_proposals" USING btree ("judgment_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "judgment_runs_idempotency_attempt_uidx" ON "judgment_runs" USING btree ("idempotency_key","attempt");--> statement-breakpoint
CREATE INDEX "judgment_runs_subject_idx" ON "judgment_runs" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "opposition_country_turn_uidx" ON "opposition_actions" USING btree ("country_id","turn_id");--> statement-breakpoint
CREATE UNIQUE INDEX "submission_versions_submission_version_uidx" ON "submission_versions" USING btree ("submission_id","version");--> statement-breakpoint
CREATE INDEX "submissions_turn_status_idx" ON "submissions" USING btree ("turn_id","status");--> statement-breakpoint
CREATE INDEX "submissions_country_idx" ON "submissions" USING btree ("country_id");--> statement-breakpoint
CREATE UNIQUE INDEX "turn_workspace_country_turn_uidx" ON "turn_country_workspaces" USING btree ("country_id","turn_id");--> statement-breakpoint
CREATE UNIQUE INDEX "turn_step_runs_idempotency_uidx" ON "turn_step_runs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "country_relations_direction_uidx" ON "country_relations" USING btree ("campaign_id","from_country_id","to_country_id");--> statement-breakpoint
CREATE INDEX "diplomatic_proposals_inbox_idx" ON "diplomatic_proposals" USING btree ("to_country_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "map_cell_changes_set_cell_uidx" ON "map_cell_changes" USING btree ("change_set_id","cell_id");--> statement-breakpoint
CREATE UNIQUE INDEX "map_cells_axial_uidx" ON "map_cells" USING btree ("q","r");--> statement-breakpoint
CREATE INDEX "map_cells_geometry_gidx" ON "map_cells" USING gist ("geometry");--> statement-breakpoint
CREATE UNIQUE INDEX "map_ownership_revision_cell_uidx" ON "map_ownership" USING btree ("campaign_id","revision","cell_id");--> statement-breakpoint
CREATE INDEX "map_ownership_lookup_idx" ON "map_ownership" USING btree ("campaign_id","cell_id","revision");
