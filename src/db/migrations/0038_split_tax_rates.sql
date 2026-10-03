ALTER TABLE "country_fiscal_policies" DROP CONSTRAINT "country_fiscal_policy_tax_rate_check";--> statement-breakpoint
ALTER TABLE "country_fiscal_policies" ADD COLUMN "income_tax_rate" numeric(8, 6);--> statement-breakpoint
ALTER TABLE "country_fiscal_policies" ADD COLUMN "corporate_tax_rate" numeric(8, 6);--> statement-breakpoint
ALTER TABLE "country_fiscal_policies" ADD COLUMN "other_tax_rate" numeric(8, 6);--> statement-breakpoint
UPDATE "country_fiscal_policies"
SET "income_tax_rate" = "tax_rate",
    "corporate_tax_rate" = "tax_rate",
    "other_tax_rate" = "tax_rate";--> statement-breakpoint
ALTER TABLE "country_fiscal_policies" ALTER COLUMN "income_tax_rate" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "country_fiscal_policies" ALTER COLUMN "corporate_tax_rate" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "country_fiscal_policies" ALTER COLUMN "other_tax_rate" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "country_fiscal_policies" DROP COLUMN "tax_rate";--> statement-breakpoint
ALTER TABLE "country_fiscal_policies" ADD CONSTRAINT "country_fiscal_policy_income_tax_rate_check" CHECK ("country_fiscal_policies"."income_tax_rate" BETWEEN 0 AND 0.75);--> statement-breakpoint
ALTER TABLE "country_fiscal_policies" ADD CONSTRAINT "country_fiscal_policy_corporate_tax_rate_check" CHECK ("country_fiscal_policies"."corporate_tax_rate" BETWEEN 0 AND 0.75);--> statement-breakpoint
ALTER TABLE "country_fiscal_policies" ADD CONSTRAINT "country_fiscal_policy_other_tax_rate_check" CHECK ("country_fiscal_policies"."other_tax_rate" BETWEEN 0 AND 0.75);
