import { requireRole } from "@/src/auth/session";
import { getAdminOverview } from "@/src/db/queries/admin";
import { getAdminCountryTable } from "@/src/db/queries/country";
import { getGovernmentStructure } from "@/src/db/queries/government";
import { getViewerContext } from "@/src/db/queries/viewer";
import { AdminLedger } from "@/src/ui/admin-ledger";
import { GovernmentOfficeAdmin } from "@/src/ui/government-office-admin";
import { PageHead } from "@/src/ui/page-head";

export const metadata = { title: "정치 원장 관리" };
export default async function AdminPoliticsPage({
  searchParams,
}: {
  searchParams: Promise<{ country?: string }>;
}) {
  const session = await requireRole("ADMIN");
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) return null;
  const params = await searchParams;
  const [rows, overview] = await Promise.all([
    getAdminCountryTable(context.campaign.id),
    getAdminOverview(context.campaign.id),
  ]);
  const selected = rows.find(({ country }) => country.id === params.country);
  const structure = selected ? await getGovernmentStructure(selected.country.id, true) : null;
  return (
    <div className="section-stack">
      <PageHead
        eyebrow="ADMIN / POLITICS"
        title="정치 원장 관리"
        description="0–100 범위 검증과 사유 기록을 거쳐 정치 지표를 수정합니다."
      />
      <AdminLedger
        domain="POLITICS"
        rows={rows}
        overview={overview}
        selectedCountryId={selected?.country.id}
      />
      {selected && structure ? (
        <GovernmentOfficeAdmin
          countryId={selected.country.id}
          countryName={selected.country.name}
          structure={structure}
        />
      ) : (
        <div className="empty-state">
          국가를 선택하면 행정부·사법부·입법부 직책을 설정할 수 있습니다.
        </div>
      )}
    </div>
  );
}
