import { chooseEventOptionAction } from "@/src/actions/events";
import { requireSession } from "@/src/auth/session";
import { getCountryEvents } from "@/src/db/queries/events";
import { getViewerContext } from "@/src/db/queries/viewer";
import { PageHead } from "@/src/ui/page-head";

export const metadata = { title: "국가 사건" };

export default async function EventsPage() {
  const session = await requireSession();
  const context = await getViewerContext(session.user.id);
  if (!context.country || !context.turn) return null;
  const records = await getCountryEvents(context.country.id);
  const current = records.filter(({ event }) => event.status === "PUBLISHED");
  const progressing = records.filter(({ event }) => ["DRAFT", "REVIEW"].includes(event.status));
  const past = records.filter(({ event }) => ["RESOLVED", "ARCHIVED"].includes(event.status));
  const missingRequired = current.filter(({ event, choice }) => event.required && !choice).length;

  return (
    <div className="section-stack">
      <PageHead
        eyebrow="NATIONAL INCIDENT DESK"
        title="사건과 선택"
        description="현재 결정, 진행 중인 징후, 지난 사건을 한곳에서 확인합니다."
        aside={<span className="status-pill">필수 미선택 {missingRequired}건</span>}
      />
      {missingRequired > 0 && (
        <div className="form-message">필수 사건을 선택하지 않으면 다음 턴 공개가 차단됩니다.</div>
      )}
      <section className="event-tabs" aria-label="사건 상태 요약">
        <span>현재 처리 {current.length}</span>
        <span>진행 중 {progressing.length}</span>
        <span>지난 사건 {past.length}</span>
      </section>
      {current.length === 0 ? (
        <div className="empty-state">현재 선택해야 할 사건이 없습니다.</div>
      ) : (
        current.map(({ event, options, choice }) => (
          <article className="vn-event" key={event.id}>
            <div className="vn-scene" data-scene="긴급 상황실">
              <div
                className="vn-portrait"
                aria-label={event.portraitImageKey ?? "사건 관계자 실루엣"}
              >
                <span>{event.portraitImageKey ? "인물 기록" : "현장 보고"}</span>
              </div>
              <div className="vn-caption">
                <span>{event.visibility}</span>
                <strong>{event.subtitle}</strong>
              </div>
            </div>
            <div className="vn-dialogue">
              <span className="eyebrow">{event.required ? "필수 선택" : "선택 사건"}</span>
              <h2>{event.title}</h2>
              <p>{event.body}</p>
              <form action={chooseEventOptionAction} className="event-options">
                <input type="hidden" name="eventId" value={event.id} />
                {options.map((option) => (
                  <label className="event-option" key={option.id}>
                    <input
                      type="radio"
                      name="optionId"
                      value={option.id}
                      required
                      defaultChecked={choice?.optionId === option.id}
                      disabled={Boolean(choice && !event.choiceMutable)}
                    />
                    <span>
                      <strong>{option.label}</strong>
                      <small>{option.description}</small>
                      <em>예상: {option.expectedEffect}</em>
                    </span>
                  </label>
                ))}
                <button
                  type="submit"
                  disabled={
                    context.turn!.status !== "DRAFT" || Boolean(choice && !event.choiceMutable)
                  }
                >
                  {choice ? `선택 변경 · v${choice.version + 1}` : "이 선택 확정"}
                </button>
              </form>
            </div>
          </article>
        ))
      )}
      <details className="details-panel">
        <summary>진행 중 사건 {progressing.length}건</summary>
        <div className="details-body data-list">
          {progressing.map(({ event }) => (
            <div className="data-row" key={event.id}>
              <dt>{event.title}</dt>
              <dd>{event.status}</dd>
            </div>
          ))}
        </div>
      </details>
      <details className="details-panel">
        <summary>지난 사건 {past.length}건</summary>
        <div className="details-body data-list">
          {past.map(({ event }) => (
            <div className="data-row" key={event.id}>
              <dt>{event.title}</dt>
              <dd>{event.status}</dd>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
