import {
  addPolicyPromotionAction,
  addSubmissionCommentAction,
  submitSubmissionAction,
} from "@/src/actions/submission";
import { requireSession } from "@/src/auth/session";
import { getCountryPolicyGoals, getCountrySubmissions } from "@/src/db/queries/submissions";
import { getViewerContext } from "@/src/db/queries/viewer";
import { SERIAL_CATEGORY_LABELS, type SerialCategory } from "@/src/domain/policy/metrics";
import { metricLabel } from "@/src/domain/display-labels";
import { PolicyCreateDialogs } from "@/src/ui/policy-create-dialogs";
import { TnoHeadline, TnoPlate, TnoReadout, TnoWindow } from "@/src/ui/tno-frame";
import { SubmissionEditor } from "@/src/ui/submission-editor";

export const metadata = { title: "연재" };

function displayMetricValue(metric: string, value: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  if (
    [
      "realGdpGrowth",
      "inflationRate",
      "unemploymentRate",
      "debtToGdp",
      "currentAccountToGdp",
    ].includes(metric)
  ) {
    return `${(numeric * 100).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}%`;
  }
  return numeric.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}

function categoryLabel(category: string) {
  return SERIAL_CATEGORY_LABELS[category as SerialCategory] ?? category;
}

const statusLabels: Record<string, string> = {
  DRAFT: "작성 중",
  SUBMITTED: "판정 대기",
  LOCKED: "접수 완료",
  JUDGING: "AI 판정 중",
  NEEDS_INFO: "보완 필요",
  APPROVED: "승인 완료",
  REJECTED: "반려",
  PUBLISHED: "시행 중",
};

export default async function SubmissionsPage() {
  const session = await requireSession();
  const context = await getViewerContext(session.user.id);
  if (!context.country || !context.turn) return null;
  const [records, goals] = await Promise.all([
    getCountrySubmissions(context.country.id),
    getCountryPolicyGoals(context.country.id),
  ]);
  const editable = context.turn.status === "DRAFT";
  const activeGoals = goals.filter((goal) => goal.status === "ACTIVE");
  const goalTypeLabel = context.country.economicSystem === "PLANNED" ? "국가계획" : "정책 목표";
  const activeSeries = records.filter(({ submission }) => submission.status !== "REJECTED");
  const publishedSeries = activeSeries.filter(
    ({ submission }) => submission.status === "PUBLISHED",
  );
  const averageAwareness = publishedSeries.length
    ? publishedSeries.reduce((sum, { submission }) => sum + Number(submission.publicAwareness), 0) /
      publishedSeries.length
    : null;

  return (
    <TnoWindow
      title="연재 사령부"
      readout={
        <>
          <TnoReadout label="턴" value={`T${context.turn.sequence}`} />
          <TnoReadout label="체제" value={editable ? "작성 가능" : "작성 마감"} />
          <TnoReadout
            label="체계"
            value={context.country.economicSystem === "PLANNED" ? "계획경제" : "자유시장"}
          />
        </>
      }
    >
      <div className="tno-headline-row">
        <TnoHeadline label={goalTypeLabel} value={`${activeGoals.length}개`} meta="진행 중 목표" />
        <TnoHeadline label="진행 연재" value={`${activeSeries.length}건`} meta="반려 제외" />
        <TnoHeadline label="시행 중" value={`${publishedSeries.length}건`} meta="공개 집행" />
        <TnoHeadline
          label="평균 인지도"
          value={averageAwareness === null ? "—" : `${averageAwareness.toFixed(1)}%`}
          meta="시행 중 연재 기준"
        />
      </div>

      {editable && (
        <div className="tno-action-bar">
          <PolicyCreateDialogs
            economicSystem={context.country.economicSystem}
            goals={activeGoals.map((goal) => ({ id: goal.id, name: goal.name }))}
          />
        </div>
      )}

      <TnoPlate title={`진행 중 정책 · ${activeGoals.length}개 목표`} wide>
        {activeGoals.length > 0 ? (
          <div className="policy-goal-grid">
            {activeGoals.map((goal) => (
              <article className="policy-goal-card active" key={goal.id}>
                <div>
                  <strong>{goal.name}</strong>
                  <span className="policy-card-state">ACTIVE</span>
                </div>
                <p>{metricLabel(goal.metric)}</p>
                <div className="goal-value-line">
                  <span>시작 {displayMetricValue(goal.metric, goal.baselineValue)}</span>
                  <strong>{displayMetricValue(goal.metric, goal.latestValue)}</strong>
                  <span>목표 {displayMetricValue(goal.metric, goal.targetValue)}</span>
                </div>
                <small>{goal.targetGameDate}까지</small>
              </article>
            ))}
          </div>
        ) : (
          <div className="policy-empty-card">
            <span className="eyebrow">NO ACTIVE SERIES</span>
            <p>
              진행 중인 {goalTypeLabel}가 없습니다. 상단의 <strong>정책 작성</strong>에서 새 목표를
              설정할 수 있습니다.
            </p>
          </div>
        )}
      </TnoPlate>

      <TnoPlate title={`진행 중 연재 · ${activeSeries.length}건`} wide>
        {activeSeries.length === 0 ? (
          <div className="policy-empty-card">
            <span className="eyebrow">NO ACTIVE POLICY</span>
            <p>
              진행 중인 연재가 없습니다. 상단의 <strong>연재 작성</strong>에서 첫 실행사항을 작성할
              수 있습니다.
            </p>
          </div>
        ) : (
          <div className="policy-card-grid">
            {activeSeries.map(
              ({ submission, versions, comments, proposal, policyGoal, effects }) => (
                <article
                  className={`submission-card policy-card ${submission.status.toLowerCase()}`}
                  key={submission.id}
                >
                  <div className="policy-card-head">
                    <span className="eyebrow">{categoryLabel(submission.category)}</span>
                    <span className="policy-card-state">
                      {statusLabels[submission.status] ?? submission.status}
                    </span>
                  </div>
                  <div className="policy-card-title">
                    <h3>{submission.title}</h3>
                    <span>v{submission.currentVersion}</span>
                  </div>
                  <p className="policy-card-goal">{submission.goal}</p>

                  <div className="submission-targets">
                    {submission.targetMetrics.map((metric) => (
                      <span key={metric}>{metricLabel(metric)}</span>
                    ))}
                  </div>

                  <dl className="policy-card-stats">
                    <div>
                      <dt>기간</dt>
                      <dd>{submission.expectedDurationTurns}턴</dd>
                    </div>
                    <div>
                      <dt>{submission.status === "PUBLISHED" ? "인지도" : "분량"}</dt>
                      <dd>
                        {submission.status === "PUBLISHED"
                          ? `${Number(submission.publicAwareness).toFixed(0)}%`
                          : `${submission.characterCount.toLocaleString("ko-KR")}자`}
                      </dd>
                    </div>
                    <div>
                      <dt>{submission.status === "PUBLISHED" ? "연재 지지" : "판정"}</dt>
                      <dd>
                        {submission.status === "PUBLISHED"
                          ? `${Number(submission.policySupport).toFixed(0)}%`
                          : proposal
                            ? (statusLabels[proposal.status] ?? proposal.status)
                            : "대기"}
                      </dd>
                    </div>
                  </dl>

                  {submission.status === "PUBLISHED" && (
                    <div className="policy-awareness">
                      <div>
                        <span>연재 인지도</span>
                        <strong>{Number(submission.publicAwareness).toFixed(1)}%</strong>
                      </div>
                      <progress max={100} value={Number(submission.publicAwareness)}>
                        {Number(submission.publicAwareness).toFixed(1)}%
                      </progress>
                    </div>
                  )}

                  {submission.status === "PUBLISHED" && (
                    <form action={addPolicyPromotionAction} className="promotion-form">
                      <input type="hidden" name="submissionId" value={submission.id} />
                      <label>
                        홍보 예산
                        <input name="amount" inputMode="decimal" required />
                      </label>
                      <button type="submit">홍보 집행</button>
                      {Number(submission.overpromotionPenalty) > 0.05 && (
                        <span className="form-message">
                          과도한 홍보로 연재 효과가 감소하고 있습니다.
                        </span>
                      )}
                    </form>
                  )}

                  {editable && submission.status === "DRAFT" && (
                    <form action={submitSubmissionAction} className="policy-card-submit">
                      <input type="hidden" name="submissionId" value={submission.id} />
                      <button type="submit">AI 판정 대기열에 제출</button>
                    </form>
                  )}

                  <details className="policy-card-expand">
                    <summary>연재 상세 및 판정 기록</summary>
                    <div className="details-body section-stack">
                      <div className="submission-copy">{submission.body}</div>
                      <div className="data-list">
                        <div className="data-row">
                          <dt>현재 버전</dt>
                          <dd>v{submission.currentVersion}</dd>
                        </div>
                        <div className="data-row">
                          <dt>연재 효과 배율</dt>
                          <dd>×{Number(submission.effectivenessMultiplier).toFixed(2)}</dd>
                        </div>
                        {policyGoal && (
                          <div className="data-row">
                            <dt>연결 정책</dt>
                            <dd>{policyGoal.name}</dd>
                          </div>
                        )}
                      </div>

                      {editable && ["DRAFT", "SUBMITTED"].includes(submission.status) && (
                        <details className="details-panel">
                          <summary>내용 수정</summary>
                          <SubmissionEditor
                            goals={activeGoals.map((goal) => ({ id: goal.id, name: goal.name }))}
                            initial={submission}
                          />
                        </details>
                      )}

                      {proposal ? (
                        <div className="judgment-public">
                          <span className="eyebrow">
                            {proposal.verdict} · 신뢰도{" "}
                            {Math.round(Number(proposal.confidence) * 100)}%
                          </span>
                          <h3>{proposal.publicSummary}</h3>
                          <p>{proposal.publicNarrative}</p>
                          {proposal.projectedChanges.length > 0 && (
                            <div className="table-wrap">
                              <table className="policy-projection-table">
                                <thead>
                                  <tr>
                                    <th>연차</th>
                                    <th>지표</th>
                                    <th>변화</th>
                                    <th>근거</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {proposal.projectedChanges.map((change, index) => (
                                    <tr key={`${change.year}-${change.metric}-${index}`}>
                                      <td>{change.year}년차</td>
                                      <td>{metricLabel(change.metric)}</td>
                                      <td>
                                        {change.delta > 0 ? "+" : ""}
                                        {change.delta.toLocaleString("ko-KR")}{" "}
                                        {change.unit === "PERCENTAGE_POINT"
                                          ? "%p"
                                          : change.unit === "PERCENT"
                                            ? "%"
                                            : ""}
                                      </td>
                                      <td>{change.rationale}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                          {effects.length > 0 && (
                            <p className="muted">
                              제안 효과 {effects.length}건 · 관리자 승인 상태 {proposal.status}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="muted">아직 판정 결과가 없습니다.</p>
                      )}

                      <div className="data-list">
                        {versions.map((version) => (
                          <div className="data-row" key={version.id}>
                            <dt>v{version.version}</dt>
                            <dd>
                              {new Intl.DateTimeFormat("ko-KR", {
                                dateStyle: "medium",
                                timeStyle: "short",
                              }).format(version.createdAt)}
                            </dd>
                          </div>
                        ))}
                      </div>
                      {comments.map(({ comment, author }) => (
                        <div className="review-note" key={comment.id}>
                          <strong>{comment.isAdmin ? "관리자 질문" : author.name}</strong>
                          <p>{comment.body}</p>
                        </div>
                      ))}
                      {submission.status === "NEEDS_INFO" && (
                        <form action={addSubmissionCommentAction} className="form-stack">
                          <input type="hidden" name="submissionId" value={submission.id} />
                          <label>
                            관리자 질문 답변
                            <textarea name="body" required minLength={2} />
                          </label>
                          <button type="submit">답변 제출</button>
                        </form>
                      )}
                    </div>
                  </details>
                </article>
              ),
            )}
          </div>
        )}
      </TnoPlate>
    </TnoWindow>
  );
}
