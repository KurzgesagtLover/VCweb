import { requireSession } from "@/src/auth/session";
import { getCountryLedger } from "@/src/db/queries/country";
import { getViewerContext } from "@/src/db/queries/viewer";
import { RememberedDisclosure } from "@/src/ui/disclosure";
import { formatDecimal } from "@/src/ui/format";
import { DataList, MetricCard } from "@/src/ui/metric-card";
import { PageHead } from "@/src/ui/page-head";

export const metadata = { title: "역사·지리" };

export default async function HistoryPage() {
  const session = await requireSession();
  const context = await getViewerContext(session.user.id);
  if (!context.country) return null;
  const ledger = await getCountryLedger(context.country.id);
  if (!ledger) return null;
  const profile = ledger.profile;
  const levels = new Set(ledger.divisions.map((d) => d.level)).size;
  return (
    <div className="section-stack">
      <PageHead
        eyebrow="COUNTRY LEDGER / TERRITORY"
        title="역사·지리"
        description="승인된 지리 원장과 행정구역 계층을 표시합니다."
      />
      <section className="metric-grid">
        <MetricCard label="수도" value={profile?.capital} />
        <MetricCard label="최대도시" value={profile?.largestCity} />
        <MetricCard
          label="총면적"
          value={profile?.totalAreaKm2 ? `${formatDecimal(profile.totalAreaKm2, 1)} km²` : "—"}
        />
        <MetricCard
          label="내수면 비율"
          value={
            profile?.inlandWaterRatio
              ? `${formatDecimal(Number(profile.inlandWaterRatio) * 100, 1)}%`
              : "—"
          }
        />
        <MetricCard label="행정구역 단계" value={levels || "—"} />
        <MetricCard label="행성" value={profile?.planet ?? "아르카디아"} />
      </section>
      <RememberedDisclosure storageKey="country-history-details" title="전체 역사와 행정구역 보기">
        <div className="section-stack">
          <article>
            <h2>역사 기록</h2>
            <p className="muted">{profile?.history || "승인된 상세 역사 기록이 없습니다."}</p>
          </article>
          {profile?.timeline?.length ? (
            <DataList items={profile.timeline.map((entry) => [entry.year, entry.event])} />
          ) : null}
          <article>
            <h2>행정구역</h2>
            {ledger.divisions.length ? (
              <DataList
                items={ledger.divisions.map((d) => [`${d.level}단계 · ${d.typeName}`, d.name])}
              />
            ) : (
              <div className="empty-state">등록된 하위 행정구역이 없습니다.</div>
            )}
          </article>
        </div>
      </RememberedDisclosure>
    </div>
  );
}
