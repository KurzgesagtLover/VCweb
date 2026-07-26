import { requireSession } from "@/src/auth/session";
import { getCountryLedger } from "@/src/db/queries/country";
import { getViewerContext } from "@/src/db/queries/viewer";
import { RememberedDisclosure } from "@/src/ui/disclosure";
import { formatDecimal, formatPercent } from "@/src/ui/format";
import { DataList, MetricCard } from "@/src/ui/metric-card";
import { PageHead } from "@/src/ui/page-head";

export const metadata = { title: "인문" };

export default async function SocietyPage() {
  const session = await requireSession();
  const context = await getViewerContext(session.user.id);
  if (!context.country) return null;
  const ledger = await getCountryLedger(context.country.id);
  if (!ledger) return null;
  const d = ledger.demographic;
  const p = ledger.profile;
  return (
    <div className="section-stack">
      <PageHead
        eyebrow="COUNTRY LEDGER / SOCIETY"
        title="인문·사회"
        description="인구와 사회 기반의 현재 공개 스냅샷입니다."
      />
      <section className="metric-grid">
        <MetricCard label="총인구" value={d ? `${formatDecimal(d.population, 0)} 명` : "—"} />
        <MetricCard
          label="인구밀도"
          value={d ? `${formatDecimal(d.populationDensity, 1)} 명/km²` : "—"}
        />
        <MetricCard label="출산율" value={d ? formatDecimal(d.fertilityRate, 2) : "—"} />
        <MetricCard label="인구성장률" value={formatPercent(d?.populationGrowthRate)} />
        <MetricCard label="기대수명" value={d ? `${formatDecimal(d.lifeExpectancy, 1)}세` : "—"} />
        <MetricCard label="평균연령" value={d ? `${formatDecimal(d.medianAge, 1)}세` : "—"} />
        <MetricCard
          label="해외 거주 자국인"
          value={d ? `${formatDecimal(d.citizensAbroad, 0)} 명` : "—"}
        />
        <MetricCard
          label="국내 거주 외국인"
          value={d ? `${formatDecimal(d.foreignResidents, 0)} 명` : "—"}
        />
        <MetricCard label="공용어" value={p?.officialLanguages?.join(", ") || "—"} />
        <MetricCard label="국교" value={p?.stateReligion ?? "없음/미지정"} />
      </section>
      <RememberedDisclosure storageKey="country-society-details" title="세부 지표 보기">
        <DataList
          items={[
            ["디아스포라", d ? `${formatDecimal(d.diaspora, 0)} 명` : null],
            ["공용 문자", p?.officialScripts?.join(", ")],
            ["군대", p?.militaryDescription],
            ["추정 입력", d?.estimatedFields?.join(", ") || "없음"],
          ]}
        />
      </RememberedDisclosure>
    </div>
  );
}
