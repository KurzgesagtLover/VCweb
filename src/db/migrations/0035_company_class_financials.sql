CREATE TABLE "company_class_financials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_id" uuid NOT NULL,
	"company_class" text NOT NULL,
	"total_revenue" numeric(30, 4) DEFAULT '0' NOT NULL,
	"total_gross_profit" numeric(30, 4) DEFAULT '0' NOT NULL,
	"total_operating_profit" numeric(30, 4) DEFAULT '0' NOT NULL,
	"total_net_income" numeric(30, 4) DEFAULT '0' NOT NULL,
	"total_assets" numeric(30, 4) DEFAULT '0' NOT NULL,
	"total_debt" numeric(30, 4) DEFAULT '0' NOT NULL,
	"total_enterprise_value" numeric(30, 4) DEFAULT '0' NOT NULL,
	"total_employees" numeric(24, 0) DEFAULT '0' NOT NULL,
	"total_research_and_development_expense" numeric(30, 4) DEFAULT '0' NOT NULL,
	"total_capital_expenditure" numeric(30, 4) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_class_financials_class_check" CHECK ("company_class_financials"."company_class" IN ('LARGE', 'MEDIUM', 'SMALL')),
	CONSTRAINT "company_class_financials_nonnegative_totals_check" CHECK ("company_class_financials"."total_revenue" >= 0 AND "company_class_financials"."total_assets" >= 0 AND "company_class_financials"."total_debt" >= 0 AND "company_class_financials"."total_enterprise_value" >= 0 AND "company_class_financials"."total_employees" >= 0 AND "company_class_financials"."total_research_and_development_expense" >= 0 AND "company_class_financials"."total_capital_expenditure" >= 0)
);
--> statement-breakpoint
ALTER TABLE "major_companies" ADD COLUMN "gross_profit" numeric(30, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_class_financials" ADD CONSTRAINT "company_class_financials_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_class_financials_country_class_uidx" ON "company_class_financials" USING btree ("country_id","company_class");