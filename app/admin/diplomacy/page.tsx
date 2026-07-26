import { reviewAiDiplomaticResponseAction } from "@/src/actions/diplomacy";
import { requireRole } from "@/src/auth/session";
import { getAiDiplomacyReview } from "@/src/db/queries/diplomacy";
import { getViewerContext } from "@/src/db/queries/viewer";
import { PageHead } from "@/src/ui/page-head";

export const metadata = { title: "AI 외교 검토" };

export default async function AdminDiplomacyPage() {
  const session = await requireRole("ADMIN");
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) return null;
  const queue = await getAiDiplomacyReview(context.campaign.id);
  return (
    <div className="section-stack">
      <PageHead
        eyebrow="AI DIPLOMACY REVIEW"
        title="AI 국가 외교 답변"
        description="AI 초안은 규칙 검증과 관리자 승인 후에만 공식 발송됩니다."
        aside={<span className="status-pill">{queue.length}건</span>}
      />
      {queue.length === 0 ? (
        <div className="empty-state">검토할 AI 외교 답변이 없습니다.</div>
      ) : (
        queue.map(({ message, proposal, target }) => (
          <article className="panel" key={message.id}>
            <div className="panel-head">
              <div>
                <span className="eyebrow">
                  {target.name} · {proposal.type}
                </span>
                <h2>{proposal.title}</h2>
              </div>
              <span className="status-pill">DRAFT</span>
            </div>
            <div className="diff">
              <span className="diff-before">원 제안: {proposal.body}</span>
              <span>→</span>
              <span className="diff-after">AI 응답 초안</span>
            </div>
            <form action={reviewAiDiplomaticResponseAction} className="form-stack">
              <input type="hidden" name="messageId" value={message.id} />
              <label>
                공식 답변문
                <textarea
                  name="body"
                  defaultValue={message.body}
                  required
                  minLength={5}
                  maxLength={4000}
                />
              </label>
              <div className="inline-actions">
                <button name="decision" value="APPROVED">
                  수정값으로 발송 승인
                </button>
                <button name="decision" value="REJECTED" className="button danger">
                  초안 반려
                </button>
              </div>
            </form>
          </article>
        ))
      )}
    </div>
  );
}
