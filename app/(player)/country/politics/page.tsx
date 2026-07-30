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
import {
  TnoBanner,
  TnoGauges,
  TnoHeadline,
  TnoPlate,
  TnoReadout,
  TnoStats,
  TnoTrend,
  TnoWindow,
} from "@/src/ui/tno-frame";

export const metadata = { title: "정치" };

type PoliticsTab = "overview" | "personnel" | "assembly" | "replace";
const TABS: Array<[PoliticsTab, string]> = [
  ["overview", "정치 현황"],
  ["personnel", "권력기관 인사"],
  ["assembly", "국회·정당"],
  ["replace", "인사 교체"],
];

type Structure = Awaited<ReturnType<typeof getGovernmentStructure>>;
type Ledger = NonNullable<Awaited<ReturnType<typeof getCountryLedger>>>;

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

  return (
    <div className="tno-personnel-slot">
      <GovernmentPersonnelCarousel branches={branchData} />
    </div>
  );
}

function AssemblyView({ ledger }: { ledger: Ledger }) {
  const parties = ledger.parties
    .map(({ party, snapshot }) => ({ party, snapshot, seats: snapshot?.seats ?? 0 }))
    .sort((a, b) => b.seats - a.seats);
  const totalSeats = parties.reduce((sum, item) => sum + item.seats, 0);
  const governing = parties.filter(({ snapshot }) => snapshot?.isGovernment);
  const governingSeats = governing.reduce((sum, item) => sum + item.seats, 0);

  return (
    <>
      <div className="tno-headline-row">
        <TnoHeadline label="총 의석" value={`${totalSeats}석`} meta={`${parties.length}개 정당`} />
        <TnoHeadline
          label="여당 의석"
          value={`${governingSeats}석`}
          meta={totalSeats ? `${((governingSeats / totalSeats) * 100).toFixed(1)}%` : "—"}
          tone={totalSeats && governingSeats * 2 > totalSeats ? "good" : "bad"}
        />
        <TnoHeadline label="여당" value={ledger.political?.rulingParty ?? "—"} meta="집권 세력" />
        <TnoHeadline
          label="제1야당"
          value={ledger.political?.oppositionParty ?? "—"}
          meta="원내 최대 야당"
        />
      </div>

      <TnoPlate title="국회 의석 구성" wide>
        {totalSeats ? (
          <>
            <div
              className="tno-seatbar"
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
            </div>
            <div className="tno-party-list">
              <div className="tno-party-head">
                <span>정당</span>
                <span>구분</span>
                <b>의석</b>
                <b>지지율</b>
                <b>조직력</b>
                <b>정치자금</b>
              </div>
              {parties.map(({ party, snapshot, seats }) => (
                <div className="tno-party-row" key={party.id}>
                  <span className="tno-party-name">
                    <i style={{ backgroundColor: party.color }} />
                    {party.name}
                  </span>
                  <span className={snapshot?.isGovernment ? "tno-party-gov" : "tno-party-opp"}>
                    {snapshot?.isGovernment ? "여당" : "야당"}
                  </span>
                  <b>{seats}</b>
                  <b>{formatPercent(snapshot?.support)}</b>
                  <b>{snapshot?.organization ?? "—"}</b>
                  <b>{formatMoney(snapshot?.funds, "")}</b>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p>의석 데이터가 없습니다.</p>
        )}
      </TnoPlate>

      <TnoPlate title="정당 주요 인물" wide>
        {parties.some(({ party }) => party.notablePeople.length) ? (
          <ul className="tno-entity-list">
            {parties
              .filter(({ party }) => party.notablePeople.length)
              .map(({ party }) => (
                <li key={party.id}>
                  <span>{party.name}</span>
                  <em>{party.notablePeople.join(" · ")}</em>
                  <b>{party.notablePeople.length}인</b>
                </li>
              ))}
          </ul>
        ) : (
          <p>등록된 정당 인물이 없습니다.</p>
        )}
      </TnoPlate>
    </>
  );
}

function ReplacementView({ structure, updated }: { structure: Structure; updated: boolean }) {
  const officeById = new Map(structure.offices.map(({ office }) => [office.id, office]));
  return (
    <>
      {updated && <p className="form-message success">새 인사와 초상화가 반영되었습니다.</p>}
      <div className="tno-two-column">
        <TnoPlate title="인사 교체 명령">
          {structure.offices.length ? (
            <form
              action={replaceOfficeHolderAction}
              className="tno-form-stack"
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
                <textarea name="narrative" minLength={80} maxLength={12000} rows={7} required />
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
              <div className="tno-form-actions">
                <button type="submit">인사 교체 반영</button>
              </div>
            </form>
          ) : (
            <p>관리자가 직책 구조를 설정한 뒤 인사를 교체할 수 있습니다.</p>
          )}
        </TnoPlate>

        <TnoPlate title={`최근 인사 기록 · ${structure.recentChanges.length}건`}>
          {structure.recentChanges.length ? (
            <div className="tno-history-list">
              {structure.recentChanges.map((change) => {
                const office = officeById.get(change.officeId);
                return (
                  <article key={change.id}>
                    <header>
                      <strong>
                        {office?.title ?? "직책"}
                        {office && office.seatCount > 1 ? ` ${change.slotNumber}인` : ""}
                      </strong>
                      <time>
                        {new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(
                          change.createdAt,
                        )}
                      </time>
                    </header>
                    <span>
                      {change.previousHolderName ?? "공석"} → {change.newHolderName}
                    </span>
                    <p>{change.narrative}</p>
                  </article>
                );
              })}
            </div>
          ) : (
            <p>아직 인사 교체 기록이 없습니다.</p>
          )}
        </TnoPlate>
      </div>
    </>
  );
}

function OverviewView({ ledger }: { ledger: Ledger }) {
  const p = ledger.political;
  const politicalChanges = ledger.approvedChanges.filter((change) => change.domain === "POLITICS");

  return (
    <>
      <div className="tno-headline-row">
        <TnoHeadline
          label="안정도"
          value={p?.stability ?? "—"}
          meta="0–100"
          tone={p && p.stability < 40 ? "bad" : "good"}
        />
        <TnoHeadline
          label="정권 지지도"
          value={p?.governmentApproval ?? "—"}
          meta="0–100"
          tone={p && p.governmentApproval < 40 ? "bad" : undefined}
        />
        <TnoHeadline
          label="정통성"
          value={p?.legitimacy ?? "—"}
          meta="0–100"
          tone={p && p.legitimacy < 40 ? "bad" : undefined}
        />
        <TnoHeadline
          label="사회 불안"
          value={p?.unrest ?? "—"}
          meta="낮을수록 안정"
          tone={p && p.unrest > 55 ? "bad" : "good"}
        />
      </div>

      <div className="tno-two-column">
        <TnoPlate title="정치 계기판">
          <TnoGauges
            items={[
              { label: "안정도", value: p?.stability ?? null },
              { label: "정통성", value: p?.legitimacy ?? null },
              { label: "정권 지지", value: p?.governmentApproval ?? null },
              { label: "정책 지지", value: p?.policySupport ?? null },
              { label: "행정 역량", value: p?.stateCapacity ?? null },
              { label: "민주주의", value: p?.democracy ?? null },
              { label: "사회 불안", value: p?.unrest ?? null, invert: true },
              { label: "부패", value: p?.corruption ?? null, invert: true },
            ]}
          />
        </TnoPlate>

        <div className="tno-column-stack">
          <TnoPlate title="정부 구성">
            <TnoStats
              columns={2}
              items={[
                { label: "정치체제", value: p?.governmentForm ?? "—" },
                { label: "국가원수", value: p?.headOfState ?? "—" },
                { label: "행정부 수반", value: p?.headOfGovernment ?? "—" },
                { label: "의회 의장", value: p?.assemblySpeaker ?? "—" },
                { label: "최고재판관", value: p?.chiefJustice ?? "—" },
                { label: "여당", value: p?.rulingParty ?? "—" },
              ]}
            />
          </TnoPlate>

          <TnoPlate title="정권 지지도 추세">
            <TnoTrend
              rows={ledger.politicalTrend.map((row) => ({
                label: `T${row.turnSequence}`,
                value: row.snapshot.governmentApproval,
              }))}
            />
          </TnoPlate>
        </div>
      </div>

      <TnoPlate title="정치 승인 변경 이력" wide>
        {politicalChanges.length ? (
          <ul className="tno-entity-list">
            {politicalChanges
              .slice(-8)
              .reverse()
              .map((change) => (
                <li key={change.id}>
                  <span>{metricLabel(change.metric)}</span>
                  <em>{change.reason}</em>
                  <b>
                    {String(change.beforeValue)} → {String(change.afterValue)}
                  </b>
                </li>
              ))}
          </ul>
        ) : (
          <p>승인된 정치 지표 변경이 없습니다.</p>
        )}
      </TnoPlate>
    </>
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
  const activeTab: PoliticsTab = TABS.some(([value]) => value === params.tab)
    ? (params.tab as PoliticsTab)
    : "overview";
  const [ledger, structure] = await Promise.all([
    getCountryLedger(context.country.id),
    getGovernmentStructure(context.country.id),
  ]);
  if (!ledger) return null;
  const politics = ledger.political;

  return (
    <TnoWindow
      title="정치 원장"
      readout={
        <>
          <TnoReadout label="여당" value={politics?.rulingParty ?? "—"} />
          <TnoReadout label="안정" value={politics ? `${politics.stability}%` : "—"} />
          <TnoReadout label="지지" value={politics ? `${politics.governmentApproval}%` : "—"} />
        </>
      }
      tabs={TABS.map(([value, label]) => ({
        label,
        href: `/country/politics?tab=${value}`,
        active: activeTab === value,
      }))}
    >
      <TnoBanner
        flag={ledger.profile?.flag ?? "⚑"}
        name={ledger.country.name}
        lines={[
          politics?.governmentForm ?? ledger.profile?.governmentForm ?? "정체 미정",
          `${politics?.headOfState ?? "국가원수 미정"} · 야당 ${politics?.oppositionParty ?? "미정"}`,
        ]}
        emblem={ledger.country.code}
        color={ledger.country.color}
      />

      {activeTab === "overview" && <OverviewView ledger={ledger} />}
      {activeTab === "personnel" && <PersonnelView structure={structure} />}
      {activeTab === "assembly" && <AssemblyView ledger={ledger} />}
      {activeTab === "replace" && (
        <ReplacementView structure={structure} updated={params.updated === "1"} />
      )}
    </TnoWindow>
  );
}
