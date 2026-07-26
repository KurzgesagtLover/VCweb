import { redirect } from "next/navigation";
import { requireSession } from "@/src/auth/session";
import { getCountryLedger } from "@/src/db/queries/country";
import { getDiplomacyDesk } from "@/src/db/queries/diplomacy";
import { getCountryEvents } from "@/src/db/queries/events";
import { getViewerContext } from "@/src/db/queries/viewer";
import { domainLabel, metricLabel } from "@/src/domain/display-labels";
import { formatMoney, formatPercent } from "@/src/ui/format";
import { MetricCard } from "@/src/ui/metric-card";
import { PageHead } from "@/src/ui/page-head";

export const metadata = { title: "국가 대시보드" };

export default async function DashboardPage() {
  const session = await requireSession();
  const context = await getViewerContext(session.user.id);
  if (!context.country) return null;
  if (context.country.setupStatus !== "APPROVED") redirect("/country/setup");
  const [ledger, eventRecords, diplomacy] = await Promise.all([
    getCountryLedger(context.country.id),
    getCountryEvents(context.country.id),
    getDiplomacyDesk(context.country.campaignId, context.country.id),
  ]);
  if (!ledger) return null;
  const e = ledger.economic;
  const p = ledger.political;
  return (
    <div className="section-stack">
      <PageHead
        eyebrow={`NATIONAL BRIEF / TURN ${context.turn?.sequence ?? "—"}`}
        title={`${ledger.profile?.flag ?? "⚑"} ${ledger.country.name}`}
        description={`${ledger.profile?.capital ?? "수도 미정"} · ${p?.governmentForm ?? ledger.profile?.governmentForm ?? "정체 미정"}`}
        aside={<span className="status-pill">{context.turn?.status ?? "준비 중"}</span>}
      />
      <section className="metric-grid">
        <MetricCard
          label="실질 GDP 성장률"
          value={formatPercent(e?.realGdpGrowth)}
          meta={`기준연도 ${e?.referenceYear ?? "—"}`}
        />
        <MetricCard
          label="소비자물가 변동률"
          value={formatPercent(e?.inflationRate)}
          tone={e && Number(e.inflationRate) > 0.08 ? "warning" : undefined}
        />
        <MetricCard label="실업률" value={formatPercent(e?.unemploymentRate)} />
        <MetricCard label="정부지출" value={formatMoney(e?.governmentSpending, e?.currencyCode)} />
        <MetricCard label="정치 안정도" value={p?.stability ?? "—"} meta="0–100" />
        <MetricCard label="정부 지지도" value={p?.governmentApproval ?? "—"} meta="0–100" />
        <MetricCard label="사회 불안" value={p?.unrest ?? "—"} meta="0–100 · 낮을수록 안정" />
        <MetricCard label="국가 역량" value={p?.stateCapacity ?? "—"} meta="연구력 산정 입력" />
        <MetricCard
          label="국가신용등급"
          value={e?.creditRating ?? "—"}
          meta={`계산 점수 ${e?.creditScore ?? "—"}`}
        />
        <MetricCard label="연구 포인트" value="100" meta="이번 턴 배분 가능" />
      </section>
      <section className="admin-grid">
        <article className="panel">
          <div className="panel-head">
            <h2>최근 승인 변경</h2>
            <span className="eyebrow">AUDITED</span>
          </div>
          {ledger.approvedChanges.length ? (
            <div className="data-list">
              {ledger.approvedChanges.slice(-5).map((change) => (
                <div className="data-row" key={change.id}>
                  <dt>
                    {domainLabel(change.domain)} · {metricLabel(change.metric)}
                  </dt>
                  <dd>
                    {String(change.beforeValue)} → {String(change.afterValue)}
                  </dd>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">아직 승인된 수동 변경이 없습니다.</div>
          )}
        </article>
        <article className="panel">
          <div className="panel-head">
            <h2>운영 신호</h2>
          </div>
          <div className="data-list">
            <div className="data-row">
              <dt>턴 단계</dt>
              <dd>{context.turn?.status}</dd>
            </div>
            <div className="data-row">
              <dt>국가 설정</dt>
              <dd>{context.country.setupStatus}</dd>
            </div>
            <div className="data-row">
              <dt>미처리 사건</dt>
              <dd>{eventRecords.filter(({ event }) => event.status === "PUBLISHED").length}건</dd>
            </div>
            <div className="data-row">
              <dt>외교 제안</dt>
              <dd>
                {
                  diplomacy.records.filter(({ proposal }) =>
                    ["SENT", "COUNTERED"].includes(proposal.status),
                  ).length
                }
                건
              </dd>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
