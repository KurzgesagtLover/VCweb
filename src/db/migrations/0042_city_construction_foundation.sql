CREATE TABLE "campaign_cities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"city_id" text NOT NULL,
	"owner_country_id" uuid,
	"controller_country_id" uuid,
	"slot_capacity" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_cities_slot_capacity_check" CHECK ("campaign_cities"."slot_capacity" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "city_buildings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_city_id" uuid NOT NULL,
	"building_type" text NOT NULL,
	"level" integer DEFAULT 0 NOT NULL,
	"damaged_levels" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "city_buildings_type_check" CHECK (length(btrim("city_buildings"."building_type")) > 0),
	CONSTRAINT "city_buildings_level_check" CHECK ("city_buildings"."level" >= 0),
	CONSTRAINT "city_buildings_damage_check" CHECK ("city_buildings"."damaged_levels" BETWEEN 0 AND "city_buildings"."level")
);
--> statement-breakpoint
CREATE TABLE "city_construction_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_city_id" uuid NOT NULL,
	"ordered_by_country_id" uuid NOT NULL,
	"building_type" text NOT NULL,
	"target_level" integer NOT NULL,
	"queue_position" integer NOT NULL,
	"progress" numeric(20, 4) DEFAULT '0' NOT NULL,
	"required_work" numeric(20, 4) NOT NULL,
	"allocated_capacity" numeric(20, 4) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'QUEUED' NOT NULL,
	"created_turn_id" uuid NOT NULL,
	"started_turn_id" uuid,
	"completed_turn_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "city_construction_projects_type_check" CHECK (length(btrim("city_construction_projects"."building_type")) > 0),
	CONSTRAINT "city_construction_projects_target_check" CHECK ("city_construction_projects"."target_level" > 0),
	CONSTRAINT "city_construction_projects_queue_check" CHECK ("city_construction_projects"."queue_position" >= 0),
	CONSTRAINT "city_construction_projects_work_check" CHECK ("city_construction_projects"."progress" BETWEEN 0 AND "city_construction_projects"."required_work" AND "city_construction_projects"."required_work" > 0 AND "city_construction_projects"."allocated_capacity" >= 0),
	CONSTRAINT "city_construction_projects_status_check" CHECK ("city_construction_projects"."status" IN ('QUEUED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'))
);
--> statement-breakpoint
ALTER TABLE "campaign_cities" ADD CONSTRAINT "campaign_cities_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_cities" ADD CONSTRAINT "campaign_cities_city_id_world_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."world_cities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_cities" ADD CONSTRAINT "campaign_cities_owner_country_id_countries_id_fk" FOREIGN KEY ("owner_country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_cities" ADD CONSTRAINT "campaign_cities_controller_country_id_countries_id_fk" FOREIGN KEY ("controller_country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "city_buildings" ADD CONSTRAINT "city_buildings_campaign_city_id_campaign_cities_id_fk" FOREIGN KEY ("campaign_city_id") REFERENCES "public"."campaign_cities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "city_construction_projects" ADD CONSTRAINT "city_construction_projects_campaign_city_id_campaign_cities_id_fk" FOREIGN KEY ("campaign_city_id") REFERENCES "public"."campaign_cities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "city_construction_projects" ADD CONSTRAINT "city_construction_projects_ordered_by_country_id_countries_id_fk" FOREIGN KEY ("ordered_by_country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "city_construction_projects" ADD CONSTRAINT "city_construction_projects_created_turn_id_turns_id_fk" FOREIGN KEY ("created_turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "city_construction_projects" ADD CONSTRAINT "city_construction_projects_started_turn_id_turns_id_fk" FOREIGN KEY ("started_turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "city_construction_projects" ADD CONSTRAINT "city_construction_projects_completed_turn_id_turns_id_fk" FOREIGN KEY ("completed_turn_id") REFERENCES "public"."turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_cities_campaign_city_uidx" ON "campaign_cities" USING btree ("campaign_id","city_id");--> statement-breakpoint
CREATE INDEX "campaign_cities_owner_idx" ON "campaign_cities" USING btree ("campaign_id","owner_country_id");--> statement-breakpoint
CREATE INDEX "campaign_cities_controller_idx" ON "campaign_cities" USING btree ("campaign_id","controller_country_id");--> statement-breakpoint
CREATE UNIQUE INDEX "city_buildings_city_type_uidx" ON "city_buildings" USING btree ("campaign_city_id","building_type");--> statement-breakpoint
CREATE INDEX "city_buildings_city_idx" ON "city_buildings" USING btree ("campaign_city_id");--> statement-breakpoint
CREATE INDEX "city_construction_projects_queue_idx" ON "city_construction_projects" USING btree ("campaign_city_id","status","queue_position");--> statement-breakpoint
CREATE INDEX "city_construction_projects_country_idx" ON "city_construction_projects" USING btree ("ordered_by_country_id","status");