import { and, eq } from "drizzle-orm";
import { setUserStatusAction } from "@/src/actions/chat";
import { assignCountryAction } from "@/src/actions/country";
import { releaseCountryAssignmentAction, setUserRoleAction } from "@/src/actions/users";
import { requireRole } from "@/src/auth/session";
import { db } from "@/src/db";
import { campaignMemberships, countries, countryAssignments, users } from "@/src/db/schema";
import { getAdminOverview } from "@/src/db/queries/admin";
import { getViewerContext } from "@/src/db/queries/viewer";
import { PageHead } from "@/src/ui/page-head";

export const metadata = { title: "사용자·배정" };

export default async function AdminUsersPage() {
  const session = await requireRole("ADMIN");
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) return null;
  const [overview, memberRows, assignmentRows] = await Promise.all([
    getAdminOverview(context.campaign.id),
    db
      .select({ membership: campaignMemberships, user: users })
      .from(campaignMemberships)
      .innerJoin(users, eq(campaignMemberships.userId, users.id))
      .where(eq(campaignMemberships.campaignId, context.campaign.id)),
    db
      .select({ assignment: countryAssignments, country: countries, user: users })
      .from(countryAssignments)
      .innerJoin(countries, eq(countryAssignments.countryId, countries.id))
      .innerJoin(users, eq(countryAssignments.userId, users.id))
      .where(
        and(
          eq(countryAssignments.campaignId, context.campaign.id),
          eq(countryAssignments.isActive, true),
        ),
      ),
  ]);
  const assignedCountryIds = new Set(assignmentRows.map(({ country }) => country.id));
  const assignmentByUser = new Map(assignmentRows.map((row) => [row.user.id, row]));
  return (
    <div className="section-stack">
      <PageHead
        eyebrow="ADMIN / USERS"
        title="사용자·배정"
        description="가입 사용자의 역할과 국가 배정을 관리합니다. 관리자 계정은 국가 운영에 배정하지 않습니다."
      />
      <section className="panel">
        <div className="panel-head">
          <h2>국가 배정 요청</h2>
          <span className="status-pill">{overview.applications.length}건</span>
        </div>
        {overview.applications.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>신청자</th>
                  <th>희망 국명</th>
                  <th>운영 계획</th>
                  <th>배정</th>
                </tr>
              </thead>
              <tbody>
                {overview.applications.map(({ application, user }) => (
                  <tr key={application.id}>
                    <td>
                      {user.name}
                      <br />
                      <small>{user.email}</small>
                    </td>
                    <td>{application.requestedCountryName}</td>
                    <td title={application.reason}>{application.reason.slice(0, 100)}</td>
                    <td>
                      <form action={assignCountryAction} className="inline-actions">
                        <input type="hidden" name="applicationId" value={application.id} />
                        <select name="countryId" required defaultValue="" aria-label="배정 국가">
                          <option value="" disabled>
                            국가 선택
                          </option>
                          {overview.countries
                            .filter(
                              (country) => !country.isAi && !assignedCountryIds.has(country.id),
                            )
                            .map((country) => (
                              <option value={country.id} key={country.id}>
                                {country.name}
                              </option>
                            ))}
                        </select>
                        <button>배정</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">대기 중인 배정 요청이 없습니다.</div>
        )}
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>캠페인 사용자</h2>
          <span className="status-pill">{memberRows.length}명</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>사용자</th>
                <th>역할</th>
                <th>상태</th>
                <th>담당 국가</th>
                <th>역할 변경</th>
                <th>계정·배정</th>
              </tr>
            </thead>
            <tbody>
              {memberRows.map(({ user }) => {
                const assigned = assignmentByUser.get(user.id);
                const self = user.id === session.user.id;
                return (
                  <tr key={user.id}>
                    <td>
                      {user.name}
                      <br />
                      <small>{user.email}</small>
                    </td>
                    <td>{user.role}</td>
                    <td>{user.status}</td>
                    <td>{assigned?.country.name ?? "—"}</td>
                    <td>
                      {self ? (
                        <small>현재 계정</small>
                      ) : (
                        <form action={setUserRoleAction} className="inline-actions">
                          <input type="hidden" name="targetUserId" value={user.id} />
                          <select name="role" defaultValue={user.role} aria-label="역할">
                            <option value="USER">USER</option>
                            <option value="PLAYER">PLAYER</option>
                            <option value="MODERATOR">MODERATOR</option>
                            <option value="ADMIN">ADMIN</option>
                          </select>
                          <input
                            name="reason"
                            required
                            minLength={3}
                            placeholder="변경 사유"
                            aria-label="역할 변경 사유"
                          />
                          <button className="button secondary">저장</button>
                        </form>
                      )}
                    </td>
                    <td>
                      {!self && assigned ? (
                        <form action={releaseCountryAssignmentAction} className="inline-actions">
                          <input type="hidden" name="assignmentId" value={assigned.assignment.id} />
                          <input
                            name="reason"
                            required
                            minLength={3}
                            placeholder="해제 사유"
                            aria-label="배정 해제 사유"
                          />
                          <button className="danger">배정 해제</button>
                        </form>
                      ) : !self ? (
                        <form action={setUserStatusAction} className="inline-actions">
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
                            {user.status === "ACTIVE" ? "정지" : "활성화"}
                          </button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
