import Decimal from "decimal.js";
import { requireSession } from "@/src/auth/session";
import { getCountryLedger } from "@/src/db/queries/country";
import { getViewerContext } from "@/src/db/queries/viewer";
import { RememberedDisclosure } from "@/src/ui/disclosure";
import { formatDecimal, formatMoney } from "@/src/ui/format";
import { DataList, MetricCard } from "@/src/ui/metric-card";
import { PageHead } from "@/src/ui/page-head";

export const metadata = { title: "국가 개요" };

export default async function OverviewPage() {
  const session = await requireSession();
  const context = await getViewerContext(session.user.id);
  if (!context.country) return null;
  const ledger = await getCountryLedger(context.country.id);
  if (!ledger) return null;
  const profile = ledger.profile;
  const economy = ledger.economic;
  const demo = ledger.demographic;
  const head =
    ledger.offices.find((office) => office.officeType === "HEAD_OF_STATE")?.holderName ??
    ledger.political?.headOfState;
  const perCapita =
    economy && demo && !new Decimal(demo.population).isZero()
      ? new Decimal(economy.realGdp).mul(1_000_000).div(demo.population).toString()
      : null;
  return (
    <div className="section-stack">
      <PageHead
        eyebrow="COUNTRY LEDGER / OVERVIEW"
        title="국가 개요"
        description="현재 판단에 필요한 승인 원장 핵심 10개 항목입니다."
      />
      <section className="metric-grid">
        <MetricCard label="국명" value={ledger.country.name} />
        <MetricCard label="국기" value={profile?.flag ?? "⚑"} />
        <MetricCard label="수도" value={profile?.capital} />
        <MetricCard
          label="정치체제"
          value={ledger.political?.governmentForm ?? profile?.governmentForm}
        />
        <MetricCard label="국가원수" value={head} />
        <MetricCard label="총인구" value={demo ? `${formatDecimal(demo.population, 0)} 명` : "—"} />
        <MetricCard
          label="총면적"
          value={profile?.totalAreaKm2 ? `${formatDecimal(profile.totalAreaKm2, 1)} km²` : "—"}
        />
        <MetricCard label="실질 GDP" value={formatMoney(economy?.realGdp, economy?.currencyCode)} />
        <MetricCard
          label="1인당 GDP"
          value={perCapita ? `${formatDecimal(perCapita, 0)} ${economy?.currencyCode}` : "—"}
        />
        <MetricCard label="공식 화폐" value={profile?.officialCurrency ?? economy?.currencyCode} />
      </section>
      <RememberedDisclosure storageKey="country-overview-details" title="세부 정보 보기">
        <DataList
          items={[
            ["표어", profile?.motto],
            ["국가(國歌)", profile?.nationalAnthem],
            ["국목", profile?.nationalTree],
            ["국화", profile?.nationalFlower],
            ["국조", profile?.nationalBird],
            ["국수", profile?.nationalAnimal],
            ["최대도시", profile?.largestCity],
            ["행성", profile?.planet],
            ["국가코드", ledger.country.code],
            ["주요 산업", profile?.majorIndustries?.join(", ")],
          ]}
        />
      </RememberedDisclosure>
    </div>
  );
}
