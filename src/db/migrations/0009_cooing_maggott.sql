CREATE TABLE "administrative_division_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_id" uuid NOT NULL,
	"requested_by" text NOT NULL,
	"type_name" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"review_note" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "administrative_division_request_status_check" CHECK ("administrative_division_requests"."status" IN ('PENDING', 'APPROVED', 'REJECTED'))
);
--> statement-breakpoint
CREATE TABLE "country_fiscal_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_id" uuid NOT NULL,
	"tax_rate" numeric(8, 6) NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "country_fiscal_policies_country_id_unique" UNIQUE("country_id"),
	CONSTRAINT "country_fiscal_policy_tax_rate_check" CHECK ("country_fiscal_policies"."tax_rate" BETWEEN 0 AND 0.75)
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "auto_approve_economic_multipliers" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "administrative_division_requests" ADD CONSTRAINT "administrative_division_requests_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administrative_division_requests" ADD CONSTRAINT "administrative_division_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administrative_division_requests" ADD CONSTRAINT "administrative_division_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_fiscal_policies" ADD CONSTRAINT "country_fiscal_policies_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_fiscal_policies" ADD CONSTRAINT "country_fiscal_policies_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "administrative_division_requests_country_idx" ON "administrative_division_requests" USING btree ("country_id","status");