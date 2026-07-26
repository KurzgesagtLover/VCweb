import Link from "next/link";
import { replaceOfficeHolderAction } from "@/src/actions/government";
import { requireSession } from "@/src/auth/session";
import { getCountryLedger } from "@/src/db/queries/country";
import { getGovernmentStructure } from "@/src/db/queries/government";
import { getViewerContext } from "@/src/db/queries/viewer";
import { governmentBranchLabel, metricLabel } from "@/src/domain/display-labels";
import { formatMoney, formatPercent } from "@/src/ui/format";
import {
  GovernmentPersonnelCarousel,
  type PersonnelBranch,
} from "@/src/ui/government-personnel-carousel";
import { DataList, MetricCard } from "@/src/ui/metric-card";
import { PageHead } from "@/src/ui/page-head";
import { TrendBars } from "@/src/ui/trend-bars";

export const metadata = { title: "정치" };

type PoliticsTab = "overview" | "personnel" | "assembly" | "replace";
const tabs: Array<[PoliticsTab, string]> = [
  ["overview", "정치 현황"],
  ["personnel", "권력기관 인사"],
  ["assembly", "국회·정당"],
  ["replace", "인사 교체"],
];

type Structure = Awaited<ReturnType<typeof getGovernmentStructure>>;

function PersonnelView({ structure }: { structure: Structure }) {
  const branches = ["EXECUTIVE", "JUDICIAL", "LEGISLATIVE"] as const;
  const branchData: PersonnelBranch[] = branches.map((branch) => ({
    id: branch,
    label: governmentBranchLabel(branch),
    people: structure.offices
      .filter(({ office }) => office.branch === branch)
      .flatMap(({ office, holders }) =>
        Array.from({ length: office.seatCount }, (_, index) => {
          const slotNumber = index + 1;
          const holder = holders.find((item) => item.slotNumber === slotNumber);
          return {
            key: `${office.id}:${slotNumber}`,
            officeTitle: `${office.title}${office.seatCount > 1 ? ` ${slotNumber}인` : ""}`,
            holderName: holder?.holderName ?? null,
            portraitPath: holder?.portraitPath ?? null,
          };
        }),
      ),
  }));

  return <GovernmentPersonnelCarousel branches={branchData} />;
}

function AssemblyView({
  ledger,
}: {
  ledger: NonNullable<Awaited<ReturnType<typeof getCountryLedger>>>;
}) {
  const parties = ledger.parties
    .map(({ party, snapshot }) => ({ party, snapshot, seats: snapshot?.seats ?? 0 }))
    .sort((a, b) => b.seats - a.seats);
  const totalSeats = parties.reduce((sum, item) => sum + item.seats, 0);
  return (
    <div className="section-stack">
      <section className="panel">
        <div className="panel-head">
          <h2>국회 의석 구성</h2>
          <span className="status-pill">총 {totalSeats}석</span>
        </div>
        {totalSeats ? (
          <>
            <div
              className="seat-composition"
              role="img"
              aria-label={parties.map(({ party, seats }) => `${party.name} ${seats}석`).join(", ")}
            >
              {parties
                .filter(({ seats }) => seats > 0)
                .map(({ party, seats }) => (
                  <span
                    key={party.id}
                    style={{
                      width: `${(seats / totalSeats) * 100}%`,
                      backgroundColor: party.color,
                    }}
                  />
                ))}
              <i aria-hidden="true" />
            </div>
            <div className="seat-legend">
              {parties.map(({ party, snapshot, seats }) => (
                <div key={party.id}>
                  <span style={{ backgroundColor: party.color }} />
                  <strong>{party.name}</strong>
                  <em>{seats}석</em>
                  <small>{snapshot?.isGovernment ? "여당" : "야당"}</small>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="empty-state">의석 데이터가 없습니다.</div>
        )}
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>정당 목록</h2>
          <span className="status-pill">{parties.length}개 정당</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>정당</th>
                <th>구분</th>
                <th className="numeric">의석</th>
                <th className="numeric">지지율</th>
                <th className="numeric">조직력</th>
                <th className="numeric">자금</th>
                <th>주요 인물</th>
              </tr>
            </thead>
            <tbody>
              {parties.map(({ party, snapshot, seats }) => (
                <tr key={party.id}>
                  <td>
                    <span className="party-name">
                      <i style={{ backgroundColor: party.color }} />
                      {party.name}
                    </span>
                  </td>
                  <td>{snapshot?.isGovernment ? "여당" : "야당"}</td>
                  <td className="numeric">{seats}</td>
                  <td className="numeric">{formatPercent(snapshot?.support)}</td>
                  <td className="numeric">{snapshot?.organization ?? "—"}</td>
                  <td className="numeric">{formatMoney(snapshot?.funds, "정치자금")}</td>
                  <td>{party.notablePeople.join(" · ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ReplacementView({ structure, updated }: { structure: Structure; updated: boolean }) {
  const officeById = new Map(structure.offices.map(({ office }) => [office.id, office]));
  return (
    <div className="section-stack">
      {updated && <p className="form-message success">새 인사와 초상화가 반영되었습니다.</p>}
      <section className="panel">
        <div className="panel-head">
          <h2>인사 교체</h2>
          <span className="eyebrow">PLAYER ACTION</span>
        </div>
        {structure.offices.length ? (
          <form
            action={replaceOfficeHolderAction}
            className="form-stack"
            encType="multipart/form-data"
          >
            <label>
              교체 직책
              <select name="officeSlot" required defaultValue="">
                <option value="" disabled>
                  직책 선택
                </option>
                {structure.offices.flatMap(({ office }) =>
                  Array.from({ length: office.seatCount }, (_, index) => (
                    <option value={`${office.id}:${index + 1}`} key={`${office.id}:${index + 1}`}>
                      {governmentBranchLabel(office.branch)} · {office.title}
                      {office.seatCount > 1 ? ` ${index + 1}인` : ""}
                    </option>
                  )),
                )}
              </select>
            </label>
            <label>
              새 인사 이름
              <input name="newHolderName" minLength={2} maxLength={80} required />
            </label>
            <label>
              인사 교체 연재
              <textarea name="narrative" minLength={80} maxLength={12000} required />
            </label>
            <label>
              초상화 파일
              <input
                name="portrait"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                required
              />
            </label>
            <button type="submit">인사 교체 반영</button>
          </form>
        ) : (
          <div className="empty-state">
            관리자가 직책 구조를 설정한 뒤 인사를 교체할 수 있습니다.
          </div>
        )}
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>최근 인사 기록</h2>
          <span className="status-pill">{structure.recentChanges.length}건</span>
        </div>
        {structure.recentChanges.length ? (
          <div className="personnel-history">
            {structure.recentChanges.map((change) => {
              const office = officeById.get(change.officeId);
              return (
                <article key={change.id}>
                  <strong>
                    {office?.title ?? "직책"}
                    {office && office.seatCount > 1 ? ` ${change.slotNumber}인` : ""}
                  </strong>
                  <span>
                    {change.previousHolderName ?? "공석"} → {change.newHolderName}
                  </span>
                  <p>{change.narrative}</p>
                  <time>
                    {new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(
                      change.createdAt,
                    )}
                  </time>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">아직 인사 교체 기록이 없습니다.</div>
        )}
      </section>
    </div>
  );
}

export default async function PoliticsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; updated?: string }>;
}) {
  const session = await requireSession();
  const context = await getViewerContext(session.user.id);
  if (!context.country) return null;
  const params = await searchParams;
  const activeTab = tabs.some(([value]) => value === params.tab)
    ? (params.tab as PoliticsTab)
    : "overview";
  const [ledger, structure] = await Promise.all([
    getCountryLedger(context.country.id),
    getGovernmentStructure(context.country.id),
  ]);
  if (!ledger) return null;
  const p = ledger.political;

  return (
    <div className="section-stack">
      <PageHead
        eyebrow="COUNTRY LEDGER / POLITICS"
        title="정치 원장"
        description="정부 구성과 의회 현황, 정치 지표를 확인합니다."
      />
      <nav className="ledger-tabs politics-tabs" aria-label="정치 원장 메뉴" role="tablist">
        {tabs.map(([value, label]) => (
          <Link
            key={value}
            href={`/country/politics?tab=${value}`}
            role="tab"
            aria-selected={activeTab === value}
            className={activeTab === value ? "active" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>

      {activeTab === "overview" && (
        <div className="section-stack" role="tabpanel">
          <section className="metric-grid">
            <MetricCard label="정치체제" value={p?.governmentForm} />
            <MetricCard label="국가원수" value={p?.headOfState} />
            <MetricCard label="행정부 수반" value={p?.headOfGovernment ?? "—"} />
            <MetricCard label="의회 의장" value={p?.assemblySpeaker ?? "—"} />
            <MetricCard label="최고재판관" value={p?.chiefJustice ?? "—"} />
            <MetricCard label="여당" value={p?.rulingParty} />
            <MetricCard label="제1야당" value={p?.oppositionParty} />
            <MetricCard label="안정도" value={p?.stability} meta="0–100" />
            <MetricCard label="정부 지지도" value={p?.governmentApproval} meta="0–100" />
            <MetricCard label="사회 불안" value={p?.unrest} meta="0–100 · 낮을수록 안정" />
          </section>
          <section className="panel">
            <div className="panel-head">
              <h2>최근 8턴 정부 지지도</h2>
              <span className="eyebrow">APPROVAL INDEX</span>
            </div>
            <TrendBars
              format="number"
              rows={ledger.politicalTrend.map((row) => ({
                label: `T${row.turnSequence}`,
                value: String(row.snapshot.governmentApproval),
              }))}
            />
          </section>
          <section className="panel">
            <div className="panel-head">
              <h2>정치 세부 지표</h2>
            </div>
            <DataList
              items={[
                ["정통성", p?.legitimacy],
                ["국가 역량", p?.stateCapacity],
                ["부패", p?.corruption],
                ["민주성", p?.democracy],
              ]}
            />
          </section>
          {ledger.approvedChanges.some((change) => change.domain === "POLITICS") && (
            <section className="panel">
              <div className="panel-head">
                <h2>승인 변경 이력</h2>
              </div>
              <DataList
                items={ledger.approvedChanges
                  .filter((change) => change.domain === "POLITICS")
                  .map((change) => [
                    metricLabel(change.metric),
                    `${String(change.beforeValue)} → ${String(change.afterValue)} · ${change.reason}`,
                  ])}
              />
            </section>
          )}
        </div>
      )}
      {activeTab === "personnel" && <PersonnelView structure={structure} />}
      {activeTab === "assembly" && <AssemblyView ledger={ledger} />}
      {activeTab === "replace" && (
        <ReplacementView structure={structure} updated={params.updated === "1"} />
      )}
    </div>
  );
}
