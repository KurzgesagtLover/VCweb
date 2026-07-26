CREATE TABLE "campaign_lore_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"version" integer NOT NULL,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "administrative_division_cells" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"country_id" uuid NOT NULL,
	"division_id" uuid NOT NULL,
	"cell_id" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "lore_css" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "lore_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "lore_published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "administrative_division_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_lore_views" ADD CONSTRAINT "campaign_lore_views_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_lore_views" ADD CONSTRAINT "campaign_lore_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administrative_division_cells" ADD CONSTRAINT "administrative_division_cells_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administrative_division_cells" ADD CONSTRAINT "administrative_division_cells_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administrative_division_cells" ADD CONSTRAINT "administrative_division_cells_division_id_administrative_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."administrative_divisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administrative_division_cells" ADD CONSTRAINT "administrative_division_cells_cell_id_map_cells_id_fk" FOREIGN KEY ("cell_id") REFERENCES "public"."map_cells"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administrative_division_cells" ADD CONSTRAINT "administrative_division_cells_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_lore_views_campaign_user_uidx" ON "campaign_lore_views" USING btree ("campaign_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "administrative_division_cells_campaign_cell_uidx" ON "administrative_division_cells" USING btree ("campaign_id","cell_id");--> statement-breakpoint
CREATE INDEX "administrative_division_cells_division_idx" ON "administrative_division_cells" USING btree ("division_id");