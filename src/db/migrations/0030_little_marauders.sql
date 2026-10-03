CREATE TABLE "country_development_tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"stage" integer DEFAULT 3 NOT NULL,
	"progress" numeric(9, 4) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "country_development_tracks_metric_check" CHECK ("country_development_tracks"."metric" IN ('literacy', 'poverty', 'agriculturalSelfSufficiency', 'factoryEquipment', 'industrialExpertise', 'researchFacilities', 'academicFoundation')),
	CONSTRAINT "country_development_tracks_stage_check" CHECK ("country_development_tracks"."stage" BETWEEN 1 AND 5),
	CONSTRAINT "country_development_tracks_progress_check" CHECK ("country_development_tracks"."progress" BETWEEN -150 AND 150)
);
--> statement-breakpoint
ALTER TABLE "country_development_tracks" ADD CONSTRAINT "country_development_tracks_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "country_development_tracks_country_metric_uidx" ON "country_development_tracks" USING btree ("country_id","metric");--> statement-breakpoint
INSERT INTO "country_development_tracks" ("country_id", "metric", "stage", "progress")
SELECT "countries"."id", "metrics"."metric", 3, 0
FROM "countries"
CROSS JOIN (
	VALUES
		('literacy'),
		('poverty'),
		('agriculturalSelfSufficiency'),
		('factoryEquipment'),
		('industrialExpertise'),
		('researchFacilities'),
		('academicFoundation')
) AS "metrics"("metric")
ON CONFLICT ("country_id", "metric") DO NOTHING;
