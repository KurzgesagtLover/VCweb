import { reviewGeneratedEventAction, reviewOppositionAction } from "@/src/actions/events";
import { requireRole } from "@/src/auth/session";
import { getAdminEventQueue } from "@/src/db/queries/events";
import { getViewerContext } from "@/src/db/queries/viewer";
import { PageHead } from "@/src/ui/page-head";

export const metadata = { title: "사건·야당 검토" };

export default async function AdminEventsPage() {
  const session = await requireRole("ADMIN");
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) return null;
  const queue = await getAdminEventQueue(context.campaign.id);
  return (
    <div className="section-stack">
      <PageHead
        eyebrow="POLITICAL EVENT REVIEW"
        title="사건·야당 행동 검토"
        description="자동 생성 사건과 국가별 최대 1건의 야당 행동을 공개 전에 검토합니다."
        aside={
          <span className="status-pill">{queue.events.length + queue.opposition.length}건</span>
        }
      />
      <section className="admin-grid">
        <div className="section-stack">
          <h2>자동 사건</h2>
          {queue.events.length === 0 ? (
            <div className="empty-state">검토할 자동 사건이 없습니다.</div>
          ) : (
            queue.events.map((event) => (
              <article className="panel" key={event.id}>
                <span className="eyebrow">
                  {event.visibility} · {event.sourceType}
                </span>
                <h3>{event.title}</h3>
                <p>{event.body}</p>
                <form action={reviewGeneratedEventAction} className="inline-actions">
                  <input type="hidden" name="eventId" value={event.id} />
                  <button name="decision" value="APPROVED">
                    공개 승인
                  </button>
                  <button name="decision" value="REJECTED" className="button danger">
                    폐기
                  </button>
                </form>
              </article>
            ))
          )}
        </div>
        <div className="section-stack">
          <h2>야당 자율 행동</h2>
          {queue.opposition.length === 0 ? (
            <div className="empty-state">검토할 야당 행동이 없습니다.</div>
          ) : (
            queue.opposition.map((action) => (
              <article className="panel" key={action.id}>
                <span className="eyebrow">관리자 승인 필요 · 효과 {action.effects.length}건</span>
                <h3>{action.title}</h3>
                <p>{action.narrative}</p>
                <p className="muted">{action.rationale}</p>
                <form action={reviewOppositionAction} className="inline-actions">
                  <input type="hidden" name="actionId" value={action.id} />
                  <button name="decision" value="APPROVED">
                    사건으로 승인
                  </button>
                  <button name="decision" value="REJECTED" className="button danger">
                    반려
                  </button>
                </form>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
