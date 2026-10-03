ALTER TABLE "country_applications" ADD COLUMN "requested_country_id" uuid;--> statement-breakpoint
ALTER TABLE "country_applications" ADD COLUMN "kind" text DEFAULT 'ASSIGN' NOT NULL;--> statement-breakpoint
ALTER TABLE "country_applications" ADD CONSTRAINT "country_applications_kind_check" CHECK ("country_applications"."kind" IN ('ASSIGN', 'TRANSFER', 'RELEASE'));