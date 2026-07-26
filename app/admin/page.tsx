import Link from "next/link";
import { updateCampaignSettingsAction } from "@/src/actions/campaign";
import { requireRole } from "@/src/auth/session";
import { getAdminOverview, getTurnOperationalState } from "@/src/db/queries/admin";
import { getViewerContext } from "@/src/db/queries/viewer";
import { turnStatusLabel } from "@/src/domain/display-labels";
import {
  adjudicationRealDayInterval,
  formatAdjudicationCadence,
  formatSeoulSchedule,
  judgmentEndsAt,
  nextTurnDeadline,
} from "@/src/domain/turn/schedule";
import { MetricCard } from "@/src/ui/metric-card";
import { PageHead } from "@/src/ui/page-head";

export const metadata = { title: "관리 현황" };

const gameTimeUnitOptions = [
  ["DAY", "일"],
  ["MONTH", "개월"],
  ["YEAR", "년"],
] as const;

export default async function AdminPage() {
  const session = await requireRole("ADMIN");
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) return null;
  const overview = await getAdminOverview(context.campaign.id);
  const operations = context.turn ? await getTurnOperationalState(context.turn.id) : null;
  const realDayInterval = adjudicationRealDayInterval(
    context.campaign.gameTimePerRealDayValue,
    context.campaign.adjudicationIntervalValue,
    context.campaign.gameTimePerRealDayUnit,
    context.campaign.adjudicationIntervalUnit,
  );
  const deadline =
    context.turn?.deadlineAt ??
    nextTurnDeadline(
      new Date(),
      realDayInterval,
      context.campaign.turnCloseHour,
      context.campaign.turnCloseMinute,
    );
  const cadenceLabel = formatAdjudicationCadence(
    realDayInterval,
    context.campaign.turnCloseHour,
    context.campaign.turnCloseMinute,
  );
  return (
    <div className="section-stack">
      <PageHead
        eyebrow="ADMIN CONTROL"
        title="캠페인 운영 현황"
        description="승인 대기와 원장 변경을 우선순위별로 확인합니다."
        aside={
          <span className="status-pill">
            {context.turn ? turnStatusLabel(context.turn.status) : "준비 중"}
          </span>
        }
      />
      <section className="panel settings-panel">
        <div className="panel-head">
          <h2>캠페인 설정</h2>
        </div>
        <form action={updateCampaignSettingsAction} className="campaign-settings-form">
          <label>
            캠페인 이름
            <input
              name="name"
              defaultValue={context.campaign.name}
              required
              minLength={2}
              maxLength={80}
            />
          </label>
          <label>
            현실 1일당 게임 진행량
            <span className="input-with-unit">
              <input
                type="number"
                name="gameTimePerRealDayValue"
                defaultValue={context.campaign.gameTimePerRealDayValue}
                min={1}
                max={365000}
                required
              />
              <select
                name="gameTimePerRealDayUnit"
                defaultValue={context.campaign.gameTimePerRealDayUnit}
                aria-label="게임 진행 단위"
              >
                {gameTimeUnitOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </span>
          </label>
          <label>
            판정 진행 주기
            <span className="input-with-unit">
              <input
                type="number"
                name="adjudicationIntervalValue"
                defaultValue={context.campaign.adjudicationIntervalValue}
                min={1}
                max={365000}
                required
              />
              <select
                name="adjudicationIntervalUnit"
                defaultValue={context.campaign.adjudicationIntervalUnit}
                aria-label="판정 주기 단위"
              >
                {gameTimeUnitOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </span>
          </label>
          <label>
            마감 기준 시각
            <input
              type="time"
              name="closeTime"
              defaultValue={`${String(context.campaign.turnCloseHour).padStart(2, "0")}:${String(context.campaign.turnCloseMinute).padStart(2, "0")}`}
              required
            />
          </label>
          <label>
            사용할 지도 수
            <input
              type="number"
              name="mapCount"
              defaultValue={context.campaign.mapCount}
              min={1}
              max={16}
              required
            />
          </label>
          <div className="campaign-schedule-summary">{cadenceLabel}</div>
          <button type="submit">설정 저장</button>
        </form>
      </section>
      <section className="metric-grid">
        <MetricCard label="현재 턴" value={context.turn ? `T${context.turn.sequence}` : "—"} />
        <MetricCard
          label="국가 배정 대기"
          value={overview.applications.length}
          tone={overview.applications.length ? "warning" : undefined}
        />
        <MetricCard
          label="설정 승인 대기"
          value={overview.setupSubmissions.length}
          tone={overview.setupSubmissions.length ? "warning" : undefined}
        />
        <MetricCard
          label="지표 diff 검토"
          value={overview.pendingChanges.length}
          tone={overview.pendingChanges.length ? "warning" : undefined}
        />
        <MetricCard label="운영 국가" value={overview.countries.length} />
        <MetricCard
          label="턴 작업 대기"
          value={operations?.queuedJobs ?? 0}
          tone={operations?.failedJobs ? "warning" : undefined}
        />
        <MetricCard label="판정 검토" value={operations?.pendingJudgments ?? 0} />
        <MetricCard label="사건 검토" value={operations?.pendingEvents ?? 0} />
      </section>
      <section className="admin-grid">
        <article className="panel">
          <div className="panel-head">
            <h2>처리 대기열</h2>
            <Link href={overview.applications.length ? "/admin/users" : "/admin/countries"}>
              전체 보기 →
            </Link>
          </div>
          {overview.applications.length +
            overview.setupSubmissions.length +
            overview.pendingChanges.length ===
          0 ? (
            <div className="empty-state">현재 대기 중인 국가 설정·원장 변경이 없습니다.</div>
          ) : (
            <div className="data-list">
              <div className="data-row">
                <dt>국가 배정</dt>
                <dd>{overview.applications.length}건</dd>
              </div>
              <div className="data-row">
                <dt>초기 설정</dt>
                <dd>{overview.setupSubmissions.length}건</dd>
              </div>
              <div className="data-row">
                <dt>경제·정치 변경</dt>
                <dd>{overview.pendingChanges.length}건</dd>
              </div>
            </div>
          )}
        </article>
        <article className="panel">
          <div className="panel-head">
            <h2>턴 일정</h2>
            <span className="status-pill">{cadenceLabel}</span>
          </div>
          {context.turn ? (
            <div className="data-list">
              <div className="data-row">
                <dt>현재 상태</dt>
                <dd>{turnStatusLabel(context.turn.status)}</dd>
              </div>
              <div className="data-row">
                <dt>제출 마감</dt>
                <dd>{formatSeoulSchedule(deadline)}</dd>
              </div>
              <div className="data-row">
                <dt>판정 완료</dt>
                <dd>{formatSeoulSchedule(judgmentEndsAt(deadline))}</dd>
              </div>
              <div className="data-row">
                <dt>접수 연재</dt>
                <dd>{operations?.submissions.length ?? 0}건</dd>
              </div>
              <div className="data-row">
                <dt>처리 대기</dt>
                <dd>{operations?.queuedJobs ?? 0}건</dd>
              </div>
            </div>
          ) : (
            <div className="empty-state">활성 턴이 없습니다.</div>
          )}
        </article>
      </section>
    </div>
  );
}
