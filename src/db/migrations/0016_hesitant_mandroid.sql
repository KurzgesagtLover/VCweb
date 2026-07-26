CREATE TABLE "map_raster_color_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"map_id" uuid NOT NULL,
	"color_hex" text NOT NULL,
	"country_id" uuid NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "map_rasters" (
	"map_id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"image_data" "bytea" NOT NULL,
	"content_type" text DEFAULT 'image/png' NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "map_raster_color_assignments" ADD CONSTRAINT "map_raster_color_assignments_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_raster_color_assignments" ADD CONSTRAINT "map_raster_color_assignments_map_id_campaign_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."campaign_maps"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_raster_color_assignments" ADD CONSTRAINT "map_raster_color_assignments_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_raster_color_assignments" ADD CONSTRAINT "map_raster_color_assignments_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_rasters" ADD CONSTRAINT "map_rasters_map_id_campaign_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."campaign_maps"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_rasters" ADD CONSTRAINT "map_rasters_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_rasters" ADD CONSTRAINT "map_rasters_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "map_raster_colors_map_color_uidx" ON "map_raster_color_assignments" USING btree ("map_id","color_hex");--> statement-breakpoint
CREATE UNIQUE INDEX "map_raster_colors_map_country_uidx" ON "map_raster_color_assignments" USING btree ("map_id","country_id");