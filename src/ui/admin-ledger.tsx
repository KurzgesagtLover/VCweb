import {
  createAdminChangeProposalAction,
  reviewAdminChangeProposalAction,
} from "@/src/actions/admin";
import Link from "next/link";
import type { getAdminCountryTable } from "@/src/db/queries/country";
import type { getCountryLedger } from "@/src/db/queries/country";
import type { getAdminOverview } from "@/src/db/queries/admin";
import { metricLabel } from "@/src/domain/display-labels";
import { DEFAULT_ECONOMY_RULES, type EconomyRules } from "@/src/domain/economy/calculator";
import { EconomicLedgerDetail, type EconomyDetailTab } from "./economic-ledger-detail";
import { formatMoney, formatPerCapita, formatPercent } from "./format";

type CountryRows = Awaited<ReturnType<typeof getAdminCountryTable>>;
type Overview = Awaited<ReturnType<typeof getAdminOverview>>;

const metricOptions = {
  POLITICS: [
    ["stability", "안정도"],
    ["legitimacy", "정통성"],
    ["governmentApproval", "정부 지지도"],
    ["policySupport", "정책 지지도"],
    ["unrest", "사회 불안"],
    ["stateCapacity", "국가 역량"],
    ["corruption", "부패"],
    ["democracy", "민주성"],
  ],
} as const;

export function AdminLedger({
  domain,
  rows,
  overview,
  selectedLedger,
  selectedCountryId,
  activeTab = "overview",
  economyRules,
}: {
  domain: "ECONOMY" | "POLITICS";
  rows: CountryRows;
  overview: Overview;
  selectedLedger?: Awaited<ReturnType<typeof getCountryLedger>>;
  selectedCountryId?: string;
  activeTab?: EconomyDetailTab;
  economyRules?: EconomyRules;
}) {
  const pending = overview.pendingChanges.filter(({ change }) => change.domain === domain);
  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>{domain === "ECONOMY" ? "경제" : "정치"} 고밀도 원장</h2>
          <span className="status-pill">{rows.length}개국</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              {domain === "ECONOMY" ? (
                <tr>
                  <th>국가</th>
                  <th className="numeric">GDP</th>
                  <th className="numeric">1인당 GDP</th>
                  <th className="numeric">성장률</th>
                  <th className="numeric">부채율</th>
                </tr>
              ) : (
                <tr>
                  <th>국가</th>
                  <th>체제</th>
                  <th className="numeric">안정</th>
                  <th className="numeric">정통성</th>
                  <th className="numeric">정권 지지</th>
                  <th className="numeric">정책 지지</th>
                  <th className="numeric">불안</th>
                  <th className="numeric">역량</th>
                </tr>
              )}
            </thead>
            <tbody>
              {rows.map(({ country, economy, demographic, politics }) =>
                domain === "ECONOMY" ? (
                  <tr
                    key={country.id}
                    className={selectedCountryId === country.id ? "selected" : undefined}
                  >
                    <td>
                      <Link
                        className="table-country-link"
                        href={`/admin/economy?country=${country.id}&tab=overview#economic-detail`}
                        aria-current={selectedCountryId === country.id ? "page" : undefined}
                      >
                        {country.name}
                      </Link>
                    </td>
                    <td className="numeric">
                      {formatMoney(economy?.nominalGdp, economy?.currencyCode)}
                    </td>
                    <td className="numeric">
                      {formatPerCapita(
                        economy?.nominalGdp,
                        demographic?.population,
                        economy?.currencyCode,
                      )}
                    </td>
                    <td className="numeric">{formatPercent(economy?.realGdpGrowth)}</td>
                    <td className="numeric">{formatPercent(economy?.debtToGdp)}</td>
                  </tr>
                ) : (
                  <tr
                    key={country.id}
                    className={selectedCountryId === country.id ? "selected" : undefined}
                  >
                    <td>
                      <Link
                        className="table-country-link"
                        href={`/admin/politics?country=${country.id}#office-structure`}
                        aria-current={selectedCountryId === country.id ? "page" : undefined}
                      >
                        {country.name}
                      </Link>
                    </td>
                    <td>{politics?.governmentForm ?? "—"}</td>
                    <td className="numeric">{politics?.stability ?? "—"}</td>
                    <td className="numeric">{politics?.legitimacy ?? "—"}</td>
                    <td className="numeric">{politics?.governmentApproval ?? "—"}</td>
                    <td className="numeric">{politics?.policySupport ?? "—"}</td>
                    <td className="numeric">{politics?.unrest ?? "—"}</td>
                    <td className="numeric">{politics?.stateCapacity ?? "—"}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </section>
      {domain === "ECONOMY" &&
        (selectedLedger ? (
          <EconomicLedgerDetail
            ledger={selectedLedger}
            tab={activeTab}
            economyRules={economyRules ?? DEFAULT_ECONOMY_RULES}
          />
        ) : (
          <div className="empty-state">국가를 선택하면 전체 경제지표와 편집기가 열립니다.</div>
        ))}
      <section className={domain === "ECONOMY" ? "section-stack" : "admin-grid"}>
        {domain === "POLITICS" && (
          <article className="panel">
            <div className="panel-head">
              <h2>변경 diff 만들기</h2>
              <span className="eyebrow">TWO-STEP REVIEW</span>
            </div>
            <form action={createAdminChangeProposalAction} className="form-stack">
              <input type="hidden" name="domain" value={domain} />
              <label>
                국가
                <select name="countryId" required defaultValue="">
                  <option value="" disabled>
                    국가 선택
                  </option>
                  {rows.map(({ country }) => (
                    <option key={country.id} value={country.id}>
                      {country.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                지표
                <select name="metric" required>
                  {metricOptions.POLITICS.map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                변경값
                <input name="value" inputMode="decimal" required />
              </label>
              <label>
                변경 사유
                <textarea name="reason" minLength={10} maxLength={1000} required />
              </label>
              <button>diff 생성</button>
            </form>
          </article>
        )}
        <article className="panel">
          <div className="panel-head">
            <h2>승인 대기</h2>
            <span className="status-pill">{pending.length}건</span>
          </div>
          {pending.length ? (
            <div className="section-stack">
              {pending.map(({ change, country }) => (
                <article className="details-panel" key={change.id}>
                  <div className="details-body" style={{ paddingTop: "1rem" }}>
                    <strong>
                      {country.name} · {metricLabel(change.metric)}
                    </strong>
                    <div className="diff">
                      <span className="diff-before">{String(change.beforeValue)}</span>
                      <span>→</span>
                      <span className="diff-after">{String(change.afterValue)}</span>
                    </div>
                    <p className="muted">{change.reason}</p>
                    <div style={{ display: "flex", gap: ".5rem", marginTop: ".8rem" }}>
                      <form action={reviewAdminChangeProposalAction}>
                        <input type="hidden" name="proposalId" value={change.id} />
                        <input type="hidden" name="decision" value="APPROVED" />
                        <button>승인</button>
                      </form>
                      <form action={reviewAdminChangeProposalAction}>
                        <input type="hidden" name="proposalId" value={change.id} />
                        <input type="hidden" name="decision" value="REJECTED" />
                        <button className="danger">반려</button>
                      </form>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">검토할 변경 diff가 없습니다.</div>
          )}
        </article>
      </section>
    </>
  );
}
