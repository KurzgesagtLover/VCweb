import { chooseEventOptionAction } from "@/src/actions/events";
import { requireSession } from "@/src/auth/session";
import { getCountryEvents } from "@/src/db/queries/events";
import { getViewerContext } from "@/src/db/queries/viewer";
import { TnoHeadline, TnoPlate, TnoReadout, TnoWindow } from "@/src/ui/tno-frame";

export const metadata = { title: "국가 사건" };

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "초안",
  REVIEW: "검토",
  PUBLISHED: "공개",
  RESOLVED: "종결",
  ARCHIVED: "보관",
};

export default async function EventsPage() {
  const session = await requireSession();
  const context = await getViewerContext(session.user.id);
  if (!context.country || !context.turn) return null;
  const records = await getCountryEvents(context.country.id);
  const current = records.filter(({ event }) => event.status === "PUBLISHED");
  const progressing = records.filter(({ event }) => ["DRAFT", "REVIEW"].includes(event.status));
  const past = records.filter(({ event }) => ["RESOLVED", "ARCHIVED"].includes(event.status));
  const missingRequired = current.filter(({ event, choice }) => event.required && !choice).length;
  const turnOpen = context.turn.status === "DRAFT";

  return (
    <TnoWindow
      title="사건 상황실"
      readout={
        <>
          <TnoReadout label="현재" value={`${current.length}건`} />
          <TnoReadout label="필수" value={`${missingRequired}건`} />
          <TnoReadout label="턴" value={turnOpen ? "선택 가능" : "선택 마감"} />
        </>
      }
    >
      <div className="tno-headline-row">
        <TnoHeadline label="현재 처리" value={`${current.length}건`} meta="공개된 사건" />
        <TnoHeadline
          label="필수 미선택"
          value={`${missingRequired}건`}
          meta={missingRequired ? "공개 차단 위험" : "이상 없음"}
          tone={missingRequired ? "bad" : "good"}
        />
        <TnoHeadline label="진행 징후" value={`${progressing.length}건`} meta="초안·검토 단계" />
        <TnoHeadline label="지난 사건" value={`${past.length}건`} meta="종결·보관" />
      </div>

      {missingRequired > 0 && (
        <div className="tno-alarm">필수 사건을 선택하지 않으면 다음 턴 공개가 차단됩니다.</div>
      )}

      {current.length === 0 ? (
        <TnoPlate title="대기 중인 결정" wide>
          <p>현재 선택해야 할 사건이 없습니다.</p>
        </TnoPlate>
      ) : (
        <div className="tno-event-stack">
          {current.map(({ event, options, choice }) => {
            const locked = !turnOpen || Boolean(choice && !event.choiceMutable);
            return (
              <article className="tno-event" key={event.id} data-required={event.required}>
                <header className="tno-event-head">
                  <span>{event.required ? "필수 선택" : "선택 사건"}</span>
                  <em>{event.visibility}</em>
                </header>
                <div className="tno-event-body">
                  <div className="tno-event-visual" aria-hidden>
                    <span>{event.portraitImageKey ? "인물 기록" : "현장 보고"}</span>
                    <small>{event.subtitle}</small>
                  </div>
                  <div className="tno-event-text">
                    <h2>{event.title}</h2>
                    <p>{event.body}</p>
                  </div>
                </div>
                <form action={chooseEventOptionAction} className="tno-event-options">
                  <input type="hidden" name="eventId" value={event.id} />
                  {options.map((option) => (
                    <label className="tno-event-option" key={option.id}>
                      <input
                        type="radio"
                        name="optionId"
                        value={option.id}
                        required
                        defaultChecked={choice?.optionId === option.id}
                        disabled={locked}
                        suppressHydrationWarning
                      />
                      <span>
                        <strong>{option.label}</strong>
                        <small>{option.description}</small>
                        <em>예상 효과 · {option.expectedEffect}</em>
                      </span>
                    </label>
                  ))}
                  <div className="tno-form-actions">
                    <button type="submit" disabled={locked}>
                      {choice ? `선택 변경 · v${choice.version + 1}` : "이 선택 확정"}
                    </button>
                  </div>
                </form>
              </article>
            );
          })}
        </div>
      )}

      <div className="tno-two-column">
        <TnoPlate title={`진행 징후 ${progressing.length}건`}>
          {progressing.length ? (
            <ul className="tno-entity-list">
              {progressing.map(({ event }) => (
                <li key={event.id}>
                  <span>{event.title}</span>
                  <em>{event.subtitle ?? "—"}</em>
                  <b>{STATUS_LABELS[event.status] ?? event.status}</b>
                </li>
              ))}
            </ul>
          ) : (
            <p>진행 중인 징후가 없습니다.</p>
          )}
        </TnoPlate>
        <TnoPlate title={`지난 사건 ${past.length}건`}>
          {past.length ? (
            <ul className="tno-entity-list">
              {past.map(({ event }) => (
                <li key={event.id}>
                  <span>{event.title}</span>
                  <em>{event.subtitle ?? "—"}</em>
                  <b>{STATUS_LABELS[event.status] ?? event.status}</b>
                </li>
              ))}
            </ul>
          ) : (
            <p>기록된 지난 사건이 없습니다.</p>
          )}
        </TnoPlate>
      </div>
    </TnoWindow>
  );
}
