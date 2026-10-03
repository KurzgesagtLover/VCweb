ALTER TABLE "economic_snapshots" ADD COLUMN "poverty_rate" numeric(8, 6) DEFAULT '0.12' NOT NULL;--> statement-breakpoint
ALTER TABLE "economic_snapshots" ADD COLUMN "agricultural_productivity_index" numeric(14, 6) DEFAULT '100' NOT NULL;--> statement-breakpoint
ALTER TABLE "economic_snapshots" ADD COLUMN "food_self_sufficiency" numeric(8, 6) DEFAULT '0.8' NOT NULL;--> statement-breakpoint
ALTER TABLE "economic_snapshots" ADD COLUMN "industrial_capital_stock_index" numeric(14, 6) DEFAULT '100' NOT NULL;--> statement-breakpoint
ALTER TABLE "economic_snapshots" ADD COLUMN "research_capacity_index" numeric(14, 6) DEFAULT '100' NOT NULL;--> statement-breakpoint
ALTER TABLE "political_snapshots" ADD COLUMN "political_power" numeric(12, 4) DEFAULT '100' NOT NULL;--> statement-breakpoint
ALTER TABLE "economic_snapshots" ADD CONSTRAINT "economic_poverty_check" CHECK ("economic_snapshots"."poverty_rate" BETWEEN 0 AND 1);--> statement-breakpoint
ALTER TABLE "economic_snapshots" ADD CONSTRAINT "economic_agricultural_productivity_check" CHECK ("economic_snapshots"."agricultural_productivity_index" > 0);--> statement-breakpoint
ALTER TABLE "economic_snapshots" ADD CONSTRAINT "economic_food_self_sufficiency_check" CHECK ("economic_snapshots"."food_self_sufficiency" BETWEEN 0 AND 2);--> statement-breakpoint
ALTER TABLE "economic_snapshots" ADD CONSTRAINT "economic_industrial_capital_stock_check" CHECK ("economic_snapshots"."industrial_capital_stock_index" > 0);--> statement-breakpoint
ALTER TABLE "economic_snapshots" ADD CONSTRAINT "economic_research_capacity_check" CHECK ("economic_snapshots"."research_capacity_index" > 0);--> statement-breakpoint
ALTER TABLE "political_snapshots" ADD CONSTRAINT "political_power_check" CHECK ("political_snapshots"."political_power" BETWEEN 0 AND 1000);