import { requireRole } from "@/src/auth/session";
import { getActiveEconomyRule, getAdminOverview } from "@/src/db/queries/admin";
import { getAdminCountryTable, getCountryLedger } from "@/src/db/queries/country";
import { getViewerContext } from "@/src/db/queries/viewer";
import { AdminLedger } from "@/src/ui/admin-ledger";
import { PageHead } from "@/src/ui/page-head";
import { DEFAULT_ECONOMY_RULES, type EconomyRules } from "@/src/domain/economy/calculator";
import type { EconomyDetailTab } from "@/src/ui/economic-ledger-detail";

export const metadata = { title: "경제 원장 관리" };
const detailTabs = new Set<EconomyDetailTab>([
  "overview",
  "fiscal",
  "industry",
  "trend",
  "simulate",
  "edit",
]);

export default async function AdminEconomyPage({
  searchParams,
}: {
  searchParams: Promise<{ country?: string; tab?: string }>;
}) {
  const session = await requireRole("ADMIN");
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) return null;
  const params = await searchParams;
  const [rows, overview, activeRule] = await Promise.all([
    getAdminCountryTable(context.campaign.id),
    getAdminOverview(context.campaign.id),
    getActiveEconomyRule(context.campaign.id),
  ]);
  const economyRules: EconomyRules = activeRule
    ? {
        version: activeRule.version,
        coefficients: { ...DEFAULT_ECONOMY_RULES.coefficients, ...activeRule.coefficients },
        growthMin: activeRule.ranges.growth?.min ?? DEFAULT_ECONOMY_RULES.growthMin,
        growthMax: activeRule.ranges.growth?.max ?? DEFAULT_ECONOMY_RULES.growthMax,
      }
    : DEFAULT_ECONOMY_RULES;
  const selectedCountryId = rows.some(({ country }) => country.id === params.country)
    ? params.country
    : undefined;
  const selectedLedger = selectedCountryId ? await getCountryLedger(selectedCountryId) : null;
  const activeTab = detailTabs.has(params.tab as EconomyDetailTab)
    ? (params.tab as EconomyDetailTab)
    : "overview";
  return (
    <div className="section-stack">
      <PageHead
        eyebrow="ADMIN / ECONOMY"
        title="경제 원장 관리"
        description="원본 스냅샷은 보존하고, 변경 전·후 diff를 별도 승인합니다."
      />
      <AdminLedger
        domain="ECONOMY"
        rows={rows}
        overview={overview}
        selectedCountryId={selectedCountryId}
        selectedLedger={selectedLedger}
        activeTab={activeTab}
        economyRules={economyRules}
      />
    </div>
  );
}
