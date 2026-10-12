import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { updateCountryEconomicSystemAction } from "@/src/actions/country";
import { adjustCountryDevelopmentAction } from "@/src/actions/development";
import { setCountryLawStageAction } from "@/src/actions/laws";
import {
  createAdministrativeDivisionAction,
  reviewAdministrativeDivisionRequestAction,
} from "@/src/actions/territory";
import { requireRole } from "@/src/auth/session";
import { db } from "@/src/db";
import { administrativeDivisionRequests } from "@/src/db/schema";
import { getCountryLedger } from "@/src/db/queries/country";
import { ECONOMY_STATISTICS_CURRENCY } from "@/src/domain/economy/currency";
import { LAW_CATEGORY_LABELS, LAW_DEFINITIONS } from "@/src/domain/politics/laws";
import { getCountryLawStages } from "@/src/services/laws";
import { DeleteCountryButton } from "@/src/ui/delete-country-button";
import { DevelopmentTrackGrid } from "@/src/ui/development-tracks";
import { RememberedDisclosure } from "@/src/ui/disclosure";
import { formatMoney, formatPercent } from "@/src/ui/format";
import { DataList, MetricCard } from "@/src/ui/metric-card";
import { formatMetric } from "@/src/ui/metric-format";
import { PageHead } from "@/src/ui/page-head";

export default async function AdminCountryDetail({
  params,
}: {
  params: Promise<{ countryId: string }>;
}) {
  await requireRole("ADMIN");
  const { countryId } = await params;
  const ledger = await getCountryLedger(countryId);
  if (!ledger) notFound();
  const divisionRequests = await db.query.administrativeDivisionRequests.findMany({
    where: eq(administrativeDivisionRequests.countryId, countryId),
    orderBy: [desc(administrativeDivisionRequests.createdAt)],
  });
  const lawStages = await getCountryLawStages(db, ledger.country);
  const adm1Divisions = ledger.divisions.filter((division) => division.level === 1);
  const adm2Count = ledger.divisions.filter((division) => division.level === 2).length;
  return (
    <div className="section-stack">
      <PageHead
        eyebrow="ADMIN / COUNTRY LEDGER"
        title={ledger.country.name}
        description="승인 원장과 현재 스냅샷을 분야별로 확인합니다. 수치 변경은 경제·정치 diff 화면에서 제안합니다."
        aside={<span className="status-pill">{ledger.country.setupStatus}</span>}
      />
      <section className="panel settings-panel">
        <div className="panel-head">
          <h2>국가 운영 유형</h2>
          <DeleteCountryButton countryId={countryId} countryName={ledger.country.name} />
        </div>
        <form action={updateCountryEconomicSystemAction} className="inline-actions">
          <input type="hidden" name="countryId" value={countryId} />
          <select name="economicSystem" defaultValue={ledger.country.economicSystem}>
            <option value="FREE_MARKET">자유시장형</option>
            <option value="PLANNED">계획경제형</option>
          </select>
          <button type="submit">저장</button>
        </form>
      </section>
      <section className="metric-grid">
        <MetricCard label="코드" value={ledger.country.code} />
        <MetricCard label="수도" value={ledger.profile?.capital} />
        <MetricCard label="실질 GDP" value={formatMoney(ledger.economic?.realGdp)} />
        <MetricCard label="성장률" value={formatPercent(ledger.economic?.realGdpGrowth)} />
        <MetricCard label="안정도" value={formatMetric(ledger.political?.stability)} />
      </section>
      <section className="panel settings-panel">
        <div className="panel-head">
          <h2>국가 발전 기반</h2>
        </div>
        <DevelopmentTrackGrid tracks={ledger.developmentTracks} />
        <div className="panel-head development-section-head">
          <h3>사회 제도</h3>
        </div>
        <DevelopmentTrackGrid tracks={ledger.socialInstitutions} />
        <form action={adjustCountryDevelopmentAction} className="form-grid">
          <input type="hidden" name="countryId" value={countryId} />
          <label>
            지표
            <select name="metric" required>
              {[...ledger.developmentTracks, ...ledger.socialInstitutions].map((track) => (
                <option key={track.key} value={track.key}>
                  {track.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            진척도 변화
            <input name="delta" type="number" min="-150" max="150" step="1" required />
          </label>
          <label>
            사유
            <input name="reason" required minLength={3} maxLength={1000} />
          </label>
          <div className="inline-actions">
            <button type="submit">적용</button>
          </div>
        </form>
      </section>
      <section className="panel settings-panel">
        <div className="panel-head">
          <h2>법·제도</h2>
          <span className="status-pill">경제법은 국가 운영 유형과 연동</span>
        </div>
        <div className="division-list">
          {LAW_DEFINITIONS.map((definition) => (
            <div key={definition.key}>
              <strong>{definition.label}</strong>
              <span>
                {definition.stages[lawStages[definition.key] - 1]?.label} (
                {lawStages[definition.key]}/{definition.stages.length})
              </span>
            </div>
          ))}
        </div>
        <form action={setCountryLawStageAction} className="form-grid">
          <input type="hidden" name="countryId" value={countryId} />
          <label>
            법·제도 단계
            <select name="lawStage" required defaultValue="">
              <option value="" disabled>
                선택
              </option>
              {LAW_DEFINITIONS.map((definition) => (
                <optgroup
                  key={definition.key}
                  label={`${LAW_CATEGORY_LABELS[definition.category]} · ${definition.label}`}
                >
                  {definition.stages.map((stage, index) => (
                    <option key={stage.label} value={`${definition.key}:${index + 1}`}>
                      {index + 1}. {stage.label}
                      {index + 1 === lawStages[definition.key] ? " (현재)" : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label>
            사유
            <input name="reason" required minLength={3} maxLength={1000} />
          </label>
          <div className="inline-actions">
            <button type="submit">적용</button>
          </div>
        </form>
        <p className="muted">
          관리자 변경은 정치력을 쓰지 않습니다. 시행을 기다리던 플레이어 변경은 환불하고 취소하며,
          적응 중이던 사회·문화 변경의 유지비도 끝납니다.
        </p>
      </section>
      <RememberedDisclosure storageKey={`admin-country-${countryId}`} title="전체 원장 보기">
        <DataList
          items={[
            ["프로필 리비전", ledger.profile?.revision],
            ["역사", ledger.profile?.history],
            ["총면적", ledger.profile?.totalAreaKm2],
            ["공용어", ledger.profile?.officialLanguages?.join(", ")],
            ["주요 산업", ledger.profile?.majorIndustries?.join(", ")],
            ["정부 형태", ledger.political?.governmentForm],
            ["국가원수", ledger.political?.headOfState],
            ["인구", ledger.demographic?.population],
            ["경제 통계 통화", ECONOMY_STATISTICS_CURRENCY],
            ["계산 규칙", ledger.economic?.rulesVersion],
          ]}
        />
      </RememberedDisclosure>
      <section className="panel settings-panel">
        <div className="panel-head">
          <h2>행정구역</h2>
          <span className="status-pill">
            ADM1 {adm1Divisions.length} · ADM2 {adm2Count.toLocaleString("ko-KR")}
          </span>
        </div>
        <div className="division-list">
          {adm1Divisions.length ? (
            adm1Divisions.map((division) => (
              <div key={division.id}>
                <strong>{division.name}</strong>
                <span>{division.typeName}</span>
              </div>
            ))
          ) : (
            <div className="empty-state">등록된 ADM1 행정구역이 없습니다.</div>
          )}
        </div>
        <form action={createAdministrativeDivisionAction} className="form-grid">
          <input type="hidden" name="countryId" value={countryId} />
          <label>
            구역 종류
            <input name="typeName" defaultValue="주" required minLength={1} maxLength={40} />
          </label>
          <label>
            이름
            <input name="name" required minLength={1} maxLength={80} />
          </label>
          <div className="inline-actions">
            <button type="submit">이름 추가</button>
          </div>
        </form>
      </section>
      {divisionRequests.some((request) => request.status === "PENDING") && (
        <section className="panel">
          <div className="panel-head">
            <h2>행정구역 이름 요청</h2>
          </div>
          <div className="section-stack">
            {divisionRequests
              .filter((request) => request.status === "PENDING")
              .map((request) => (
                <form
                  action={reviewAdministrativeDivisionRequestAction}
                  className="division-review-form"
                  key={request.id}
                >
                  <input type="hidden" name="requestId" value={request.id} />
                  <div>
                    <strong>{request.name}</strong>
                    <span>{request.typeName}</span>
                  </div>
                  <label>
                    검토 메모
                    <input name="reviewNote" maxLength={500} />
                  </label>
                  <div className="inline-actions">
                    <button type="submit" name="decision" value="APPROVED">
                      승인
                    </button>
                    <button type="submit" name="decision" value="REJECTED" className="danger">
                      반려
                    </button>
                  </div>
                </form>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}
