import Link from "next/link";
import {
  approveCountrySetupAction,
  createCountryAction,
  requestCountrySetupChangesAction,
} from "@/src/actions/country";
import { requireRole } from "@/src/auth/session";
import { getAdminOverview, getActiveAssignments } from "@/src/db/queries/admin";
import { getViewerContext } from "@/src/db/queries/viewer";
import { DeleteCountryButton } from "@/src/ui/delete-country-button";
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
    <div className="section-stack admin-countries-page">
      <PageHead
        eyebrow="ADMIN / COUNTRIES"
        title="국가 관리"
        description="초기 원장 승인과 국가별 공개 상태를 관리합니다."
      />
      <section className="panel admin-countries-create">
        <div className="panel-head">
          <h2>국가 생성</h2>
        </div>
        <form action={createCountryAction} className="form-grid country-create-form">
          <label>
            국명
            <input name="name" required minLength={2} maxLength={80} placeholder="국가 이름" />
          </label>
          <label>
            코드
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
            유형
            <select name="controlType" defaultValue="PLAYER">
              <option value="PLAYER">플레이어</option>
              <option value="AI">AI</option>
            </select>
          </label>
          <div className="country-create-submit">
            <button type="submit">생성</button>
          </div>
        </form>
      </section>
      {overview.setupSubmissions.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <h2>빠른 설정 검토</h2>
            <span className="status-pill">{overview.setupSubmissions.length}건</span>
          </div>
          <div className="section-stack admin-countries-review">
            {overview.setupSubmissions.map(({ submission, country, user }) => {
              const setup = submission.quickSetup as Record<string, unknown>;
              return (
                <article className="details-panel" key={submission.id}>
                  <div className="details-body" style={{ paddingTop: "0.75rem" }}>
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
                    <div className="form-grid" style={{ marginTop: "0.75rem" }}>
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
        </section>
      )}
      <section className="panel admin-countries-ledger">
        <div className="panel-head">
          <h2>국가 원장</h2>
          <span className="status-pill">{overview.countries.length}개국</span>
        </div>
        <div className="table-wrap country-ledger-wrap">
          <table className="country-ledger-table">
            <thead>
              <tr>
                <th>국가</th>
                <th>코드</th>
                <th>유형</th>
                <th>설정</th>
                <th>배정</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {overview.countries.map((country) => (
                <tr key={country.id}>
                  <td>
                    <span className="country-ledger-name">
                      <i style={{ background: country.color }} />
                      {country.name}
                    </span>
                  </td>
                  <td className="numeric">{country.code}</td>
                  <td>{country.isAi ? "AI" : "인간"}</td>
                  <td>{country.setupStatus}</td>
                  <td>{assignedIds.has(country.id) ? "배정" : "미배정"}</td>
                  <td>
                    <div className="inline-actions country-ledger-actions">
                      <Link className="button secondary" href={`/admin/countries/${country.id}`}>
                        원장
                      </Link>
                      <DeleteCountryButton
                        countryId={country.id}
                        countryName={country.name}
                        compact
                      />
                    </div>
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
