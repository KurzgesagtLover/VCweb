CREATE TABLE "company_scale_statistics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_id" uuid NOT NULL,
	"large_enterprise_count" numeric(24, 0) DEFAULT '0' NOT NULL,
	"medium_enterprise_count" numeric(24, 0) DEFAULT '0' NOT NULL,
	"small_enterprise_count" numeric(24, 0) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_scale_statistics_country_id_unique" UNIQUE("country_id"),
	CONSTRAINT "company_scale_statistics_counts_check" CHECK ("company_scale_statistics"."large_enterprise_count" >= 0 AND "company_scale_statistics"."medium_enterprise_count" >= 0 AND "company_scale_statistics"."small_enterprise_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "logo" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "slogan" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "abbreviation" text;--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "founded" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "history" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "legal_form" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "headquarters" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "place_of_foundation" text;--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "chief_executive_officer" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "board_chair" text;--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "parent_company" text DEFAULT '없음' NOT NULL;--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "largest_shareholder" text;--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "major_shareholders" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "subsidiaries" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "affiliates" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "employee_count" numeric(24, 0) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "indirect_employment" numeric(24, 0);--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "overseas_employees" numeric(24, 0);--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "average_salary" numeric(30, 4);--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "union_membership_rate" numeric(8, 6);--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "revenue" numeric(30, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "operating_profit" numeric(30, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "net_income" numeric(30, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "total_assets" numeric(30, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "total_debt" numeric(30, 4);--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "enterprise_value" numeric(30, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "market_capitalization" numeric(30, 4);--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "credit_rating" text;--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "research_and_development_expense" numeric(30, 4);--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "capital_expenditure" numeric(30, 4);--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "cash_and_equivalents" numeric(30, 4);--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "dividends_paid" numeric(30, 4);--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "debt_ratio" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "operating_margin" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "products_and_services" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "brands" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "production_facilities" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "research_facilities" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "overseas_bases" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "major_markets" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "competitors" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "is_listed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "stock_exchange" text;--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "ticker_symbol" text;--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "shares_outstanding" numeric(30, 0);--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "share_price" numeric(30, 4);--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "dividend_yield" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "company_scale_statistics" ADD CONSTRAINT "company_scale_statistics_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "major_companies_country_name_uidx" ON "major_companies" USING btree ("country_id","name");--> statement-breakpoint
ALTER TABLE "major_companies" ADD CONSTRAINT "major_companies_employee_count_check" CHECK ("major_companies"."employee_count" >= 0);--> statement-breakpoint
ALTER TABLE "major_companies" ADD CONSTRAINT "major_companies_union_membership_rate_check" CHECK ("major_companies"."union_membership_rate" IS NULL OR "major_companies"."union_membership_rate" BETWEEN 0 AND 1);--> statement-breakpoint
ALTER TABLE "major_companies" ADD CONSTRAINT "major_companies_financial_ratio_check" CHECK (("major_companies"."debt_ratio" IS NULL OR "major_companies"."debt_ratio" >= 0) AND ("major_companies"."dividend_yield" IS NULL OR "major_companies"."dividend_yield" >= 0));--> statement-breakpoint
ALTER TABLE "major_companies" ADD CONSTRAINT "major_companies_simulation_indices_check" CHECK ("major_companies"."size_index" BETWEEN 0 AND 100 AND "major_companies"."systemic_importance" BETWEEN 0 AND 100 AND "major_companies"."health" BETWEEN 0 AND 100);