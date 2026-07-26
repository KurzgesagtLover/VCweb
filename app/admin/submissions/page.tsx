import { regenerateJudgmentAction, reviewJudgmentAction } from "@/src/actions/judgment";
import { requireRole } from "@/src/auth/session";
import { getAdminSubmissionQueue } from "@/src/db/queries/submissions";
import { getViewerContext } from "@/src/db/queries/viewer";
import { effectOperationLabel, effectTargetLabel, metricLabel } from "@/src/domain/display-labels";
import { PageHead } from "@/src/ui/page-head";

export const metadata = { title: "판정 검토" };

export default async function AdminSubmissionsPage() {
  const session = await requireRole("ADMIN");
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) return null;
  const queue = await getAdminSubmissionQueue(context.campaign.id);
  return (
    <div className="section-stack">
      <PageHead
        eyebrow="JUDGMENT REVIEW"
        title="연재 판정 검토"
        description="원문·판정 근거·실제 반영 diff를 나란히 검토합니다. 재생성해도 이전 실행은 보존됩니다."
        aside={<span className="status-pill">{queue.length}건</span>}
      />
      {queue.length === 0 ? (
        <div className="empty-state">현재 검토할 연재가 없습니다.</div>
      ) : (
        queue.map(({ submission, country, user, proposal, effects }) => (
          <article className="panel" key={submission.id}>
            <div className="panel-head">
              <div>
                <span className="eyebrow">
                  {country.name} · {submission.category} · v{submission.currentVersion}
                </span>
                <h2>{submission.title}</h2>
              </div>
              <span className="status-pill">{proposal?.status ?? submission.status}</span>
            </div>
            <div className="review-columns">
              <section>
                <h3>원문·국가 문맥</h3>
                <p className="muted">
                  작성자 {user.name} · 목표 {submission.goal}
                </p>
                <div className="submission-targets">
                  {submission.targetMetrics.map((metric) => (
                    <span key={metric}>{metricLabel(metric)}</span>
                  ))}
                </div>
                <div className="submission-copy">{submission.body}</div>
                <p className="muted">
                  예산 {submission.budget ?? "없음"} · 기간 {submission.expectedDurationTurns}턴
                </p>
              </section>
              <section>
                <h3>AI 판정 근거</h3>
                {proposal ? (
                  <>
                    <p>
                      <strong>{proposal.verdict}</strong> · 신뢰도{" "}
                      {Math.round(Number(proposal.confidence) * 100)}%
                    </p>
                    <p>{proposal.adminRationale}</p>
                    {proposal.assumptions.map((assumption) => (
                      <p className="muted" key={assumption}>
                        • {assumption}
                      </p>
                    ))}
                    {proposal.projectedChanges.length > 0 && (
                      <div className="table-wrap">
                        <table className="policy-projection-table">
                          <thead>
                            <tr>
                              <th>연차</th>
                              <th>지표</th>
                              <th>변화</th>
                            </tr>
                          </thead>
                          <tbody>
                            {proposal.projectedChanges.map((change, index) => (
                              <tr key={`${change.year}-${change.metric}-${index}`}>
                                <td>{change.year}년차</td>
                                <td>{metricLabel(change.metric)}</td>
                                <td>
                                  {change.delta > 0 ? "+" : ""}
                                  {change.delta}{" "}
                                  {change.unit === "PERCENTAGE_POINT"
                                    ? "%p"
                                    : change.unit === "PERCENT"
                                      ? "%"
                                      : ""}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {proposal.warnings.map((warning) => (
                      <p className="form-message" key={warning}>
                        {warning}
                      </p>
                    ))}
                  </>
                ) : (
                  <div className="empty-state">턴 작업 실행 후 판정이 생성됩니다.</div>
                )}
              </section>
              <section>
                <h3>수치·사건 diff</h3>
                {effects.length ? (
                  effects.map((effect) => (
                    <div className="effect-row" key={effect.id}>
                      <span>
                        {effectTargetLabel(effect.targetType)} · {metricLabel(effect.metric)}
                      </span>
                      <strong>
                        {effectOperationLabel(effect.operation)} {effect.value}
                      </strong>
                      <small>
                        {effect.durationTurns ? `${effect.durationTurns}턴` : "즉시"} ·{" "}
                        {effect.status}
                      </small>
                      {effect.validationWarning && (
                        <p className="form-message">{effect.validationWarning}</p>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="muted">제안 효과 없음</p>
                )}
              </section>
            </div>
            <div className="inline-actions">
              <form action={regenerateJudgmentAction}>
                <input type="hidden" name="submissionId" value={submission.id} />
                <button className="button secondary" type="submit">
                  새 실행으로 재생성
                </button>
              </form>
            </div>
            {proposal?.status === "PENDING" && (
              <form action={reviewJudgmentAction} className="form-stack judgment-review-form">
                <input type="hidden" name="proposalId" value={proposal.id} />
                <div className="form-grid">
                  <label className="wide">
                    플레이어 공개 요약
                    <textarea name="publicSummary" defaultValue={proposal.publicSummary} required />
                  </label>
                  <label className="wide">
                    관리자 판정 근거
                    <textarea
                      name="adminRationale"
                      defaultValue={proposal.adminRationale}
                      required
                    />
                  </label>
                  {effects.map((effect) => (
                    <div className="effect-edit wide" key={effect.id}>
                      <strong>
                        {effectTargetLabel(effect.targetType)} · {metricLabel(effect.metric)}
                      </strong>
                      <label>
                        값<input name={`effectValue:${effect.id}`} defaultValue={effect.value} />
                      </label>
                      <label>
                        기간
                        <input
                          type="number"
                          min={1}
                          max={12}
                          name={`effectDuration:${effect.id}`}
                          defaultValue={effect.durationTurns ?? ""}
                        />
                      </label>
                    </div>
                  ))}
                  <label className="wide">
                    추가 정보 요청 시 질문
                    <textarea name="question" />
                  </label>
                </div>
                <div className="inline-actions">
                  <button name="decision" value="APPROVED" type="submit">
                    수정값으로 승인
                  </button>
                  <button
                    name="decision"
                    value="NEEDS_INFO"
                    className="button secondary"
                    type="submit"
                  >
                    추가 정보 요청
                  </button>
                  <button name="decision" value="REJECTED" className="button danger" type="submit">
                    반려
                  </button>
                </div>
              </form>
            )}
          </article>
        ))
      )}
    </div>
  );
}
