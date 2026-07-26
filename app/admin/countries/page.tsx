import Link from "next/link";
import {
  approveCountrySetupAction,
  createCountryAction,
  requestCountrySetupChangesAction,
} from "@/src/actions/country";
import { requireRole } from "@/src/auth/session";
import { getAdminOverview, getActiveAssignments } from "@/src/db/queries/admin";
import { getViewerContext } from "@/src/db/queries/viewer";
import { PageHead } from "@/src/ui/page-head";

export const metadata = { title: "국가·배정 관리" };

export default async function AdminCountriesPage() {
  const session = await requireRole("ADMIN");
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) return null;
  const [overview, assignments] = await Promise.all([
    getAdminOverview(context.campaign.id),
    getActiveAssignments(context.campaign.id),
  ]);
  const assignedIds = new Set(assignments.map((a) => a.countryId));
  return (
    <div className="section-stack">
      <PageHead
        eyebrow="ADMIN / COUNTRIES"
        title="국가 관리"
        description="초기 원장 승인과 국가별 공개 상태를 관리합니다."
      />
      <section className="panel">
        <div className="panel-head">
          <h2>국가 생성</h2>
        </div>
        <form action={createCountryAction} className="form-grid">
          <label>
            국명
            <input name="name" required minLength={2} maxLength={80} placeholder="국가 이름" />
          </label>
          <label>
            국가 코드
            <input
              name="code"
              required
              minLength={2}
              maxLength={8}
              pattern="[A-Za-z0-9]+"
              placeholder="KOR"
            />
          </label>
          <label>
            운영 유형
            <select name="controlType" defaultValue="PLAYER">
              <option value="PLAYER">플레이어 국가</option>
              <option value="AI">AI 국가</option>
            </select>
          </label>
          <div className="inline-actions">
            <button type="submit">국가 생성</button>
          </div>
        </form>
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>빠른 국가 설정 검토</h2>
          <span className="status-pill">{overview.setupSubmissions.length}건</span>
        </div>
        {overview.setupSubmissions.length ? (
          <div className="section-stack">
            {overview.setupSubmissions.map(({ submission, country, user }) => {
              const setup = submission.quickSetup as Record<string, unknown>;
              return (
                <article className="details-panel" key={submission.id}>
                  <div className="details-body" style={{ paddingTop: "1rem" }}>
                    <div className="panel-head">
                      <div>
                        <h3>
                          {String(setup.countryName)} <small>({country.code})</small>
                        </h3>
                        <p className="muted">제출자 {user.name}</p>
                      </div>
                      <span className="status-pill">SUBMITTED</span>
                    </div>
                    <div className="data-list">
                      {Object.entries(setup).map(([key, value]) => (
                        <div className="data-row" key={key}>
                          <dt>{key}</dt>
                          <dd>{String(value)}</dd>
                        </div>
                      ))}
                    </div>
                    <div className="form-grid" style={{ marginTop: "1rem" }}>
                      <form action={approveCountrySetupAction} className="form-stack">
                        <input type="hidden" name="submissionId" value={submission.id} />
                        <label>
                          승인 메모
                          <input name="reviewComment" placeholder="선택 입력" />
                        </label>
                        <button>초기 원장 승인</button>
                      </form>
                      <form action={requestCountrySetupChangesAction} className="form-stack">
                        <input type="hidden" name="submissionId" value={submission.id} />
                        <label>
                          수정 요청 사유
                          <input name="reviewComment" required minLength={5} />
                        </label>
                        <button className="danger">수정 요청</button>
                      </form>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">검토할 빠른 설정이 없습니다.</div>
        )}
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>국가 원장</h2>
          <span className="status-pill">{overview.countries.length}개국</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>국가</th>
                <th>코드</th>
                <th>유형</th>
                <th>설정 상태</th>
                <th>배정</th>
                <th>상세</th>
              </tr>
            </thead>
            <tbody>
              {overview.countries.map((country) => (
                <tr key={country.id}>
                  <td>
                    <span style={{ color: country.color }}>◆</span> {country.name}
                  </td>
                  <td>{country.code}</td>
                  <td>{country.isAi ? "AI" : "인간"}</td>
                  <td>{country.setupStatus}</td>
                  <td>{assignedIds.has(country.id) ? "배정됨" : "미배정"}</td>
                  <td>
                    <Link href={`/admin/countries/${country.id}`}>원장 열기 →</Link>
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
