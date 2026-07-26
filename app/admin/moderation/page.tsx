import {
  clearUserTimeoutAction,
  deleteChatMessageAction,
  setUserStatusAction,
  timeoutUserAction,
} from "@/src/actions/chat";
import { requireRole } from "@/src/auth/session";
import { getModerationDesk } from "@/src/db/queries/chat";
import { getViewerContext } from "@/src/db/queries/viewer";
import { PageHead } from "@/src/ui/page-head";

export const metadata = { title: "사용자·제재" };

export default async function ModerationPage() {
  const session = await requireRole("MODERATOR");
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) return null;
  const desk = await getModerationDesk(context.campaign.id);
  const latestTimeoutByUser = new Map<string, (typeof desk.actions)[number]>();
  for (const action of desk.actions) {
    if (
      action.targetUserId &&
      (action.type === "TIMEOUT_USER" || action.type === "CLEAR_TIMEOUT") &&
      !latestTimeoutByUser.has(action.targetUserId)
    ) {
      latestTimeoutByUser.set(action.targetUserId, action);
    }
  }
  return (
    <div className="section-stack">
      <PageHead
        eyebrow="OPERATIONS / MODERATION"
        title="사용자·제재"
        description="메시지 삭제와 채팅 타임아웃을 관리합니다."
      />
      <section className="panel">
        <div className="panel-head">
          <h2>사용자 상태</h2>
          <span className="status-pill">{desk.users.length}명</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>사용자</th>
                <th>역할</th>
                <th>상태</th>
                <th>채팅 제재</th>
                <th>조치</th>
              </tr>
            </thead>
            <tbody>
              {desk.users.map((user) => {
                const latest = latestTimeoutByUser.get(user.id);
                const activeTimeout = desk.activeTimeoutUserIds.has(user.id);
                const timeoutExpiresAt = activeTimeout ? (latest?.expiresAt ?? null) : null;
                return (
                  <tr key={user.id}>
                    <td>
                      {user.name}
                      <br />
                      <small>{user.email}</small>
                    </td>
                    <td>{user.role}</td>
                    <td>{user.status}</td>
                    <td>
                      {timeoutExpiresAt
                        ? `~ ${new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" }).format(timeoutExpiresAt)}`
                        : "없음"}
                    </td>
                    <td>
                      {user.id === session.user.id ? (
                        <small>현재 계정</small>
                      ) : (
                        <div className="moderation-actions">
                          <form action={activeTimeout ? clearUserTimeoutAction : timeoutUserAction}>
                            <input type="hidden" name="targetUserId" value={user.id} />
                            {!activeTimeout && (
                              <select name="minutes" defaultValue="60" aria-label="타임아웃 시간">
                                <option value="10">10분</option>
                                <option value="60">1시간</option>
                                <option value="1440">1일</option>
                              </select>
                            )}
                            <input
                              name="reason"
                              required
                              minLength={3}
                              placeholder="조치 사유"
                              aria-label="조치 사유"
                            />
                            <button className="button secondary">
                              {activeTimeout ? "타임아웃 해제" : "타임아웃"}
                            </button>
                          </form>
                          {session.user.role === "ADMIN" && (
                            <form action={setUserStatusAction}>
                              <input type="hidden" name="targetUserId" value={user.id} />
                              <input
                                type="hidden"
                                name="status"
                                value={user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"}
                              />
                              <input
                                name="reason"
                                required
                                minLength={3}
                                placeholder="조치 사유"
                                aria-label="계정 조치 사유"
                              />
                              <button
                                className={user.status === "ACTIVE" ? "danger" : "button secondary"}
                              >
                                {user.status === "ACTIVE" ? "계정 정지" : "계정 활성화"}
                              </button>
                            </form>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>최근 메시지</h2>
          <span className="status-pill">최근 100건</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>채널</th>
                <th>작성자</th>
                <th>메시지</th>
                <th>상태</th>
                <th>작업</th>
              </tr>
            </thead>
            <tbody>
              {desk.messages.map(({ message, sender, channel }) => (
                <tr key={message.id}>
                  <td>{channel.name}</td>
                  <td>{sender.name}</td>
                  <td>{message.deletedAt ? "삭제된 메시지" : message.body.slice(0, 160)}</td>
                  <td>{message.deletedAt ? "삭제됨" : "게시됨"}</td>
                  <td>
                    {!message.deletedAt && (
                      <form action={deleteChatMessageAction} className="inline-actions">
                        <input type="hidden" name="messageId" value={message.id} />
                        <input
                          name="reason"
                          required
                          minLength={3}
                          placeholder="삭제 사유"
                          aria-label="삭제 사유"
                        />
                        <button className="danger">삭제</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>제재 기록</h2>
          <span className="status-pill">최근 100건</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>시각</th>
                <th>유형</th>
                <th>대상</th>
                <th>사유</th>
                <th>만료</th>
              </tr>
            </thead>
            <tbody>
              {desk.actions.map((action) => (
                <tr key={action.id}>
                  <td>
                    {new Intl.DateTimeFormat("ko-KR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(action.createdAt)}
                  </td>
                  <td>{action.type}</td>
                  <td>
                    {desk.users.find((user) => user.id === action.targetUserId)?.name ?? "메시지"}
                  </td>
                  <td>{action.reason}</td>
                  <td>
                    {action.expiresAt
                      ? new Intl.DateTimeFormat("ko-KR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        }).format(action.expiresAt)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
