import Decimal from "decimal.js";
import { redirect } from "next/navigation";
import { requireSession } from "@/src/auth/session";
import { getCountryLedger } from "@/src/db/queries/country";
import { getDiplomacyDesk } from "@/src/db/queries/diplomacy";
import { getCountryEvents } from "@/src/db/queries/events";
import { getViewerContext } from "@/src/db/queries/viewer";
import { domainLabel, metricLabel } from "@/src/domain/display-labels";
import { formatDecimal, formatMoney, formatPercent } from "@/src/ui/format";
import {
  TnoBanner,
  TnoChips,
  TnoGauges,
  TnoHeadline,
  TnoKeyValues,
  TnoPlate,
  TnoReadout,
  TnoStats,
  TnoWindow,
} from "@/src/ui/tno-frame";

export const metadata = { title: "국가 브리핑" };

const TURN_STATUS_LABELS: Record<string, string> = {
  DRAFT: "제출 기간",
  LOCKED: "제출 마감",
  CALCULATING: "계산 중",
  PUBLISHED: "결과 공개",
};

const TABS = [
  ["briefing", "브리핑"],
  ["profile", "국가 요람"],
] as const;

type DashboardTab = (typeof TABS)[number][0];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await requireSession();
  const context = await getViewerContext(session.user.id);
  if (!context.country) return null;
  if (context.country.setupStatus !== "APPROVED") redirect("/country/setup");
  const params = await searchParams;
  const activeTab: DashboardTab = TABS.some(([value]) => value === params.tab)
    ? (params.tab as DashboardTab)
    : "briefing";
  const [ledger, eventRecords, diplomacy] = await Promise.all([
    getCountryLedger(context.country.id),
    getCountryEvents(context.country.id),
    getDiplomacyDesk(context.country.campaignId, context.country.id),
  ]);
  if (!ledger) return null;
  const profile = ledger.profile;
  const economy = ledger.economic;
  const politics = ledger.political;
  const demo = ledger.demographic;
  const openEvents = eventRecords.filter(({ event }) => event.status === "PUBLISHED").length;
  const openProposals = diplomacy.records.filter(({ proposal }) =>
    ["SENT", "COUNTERED", "PENDING_AI", "DELAYED"].includes(proposal.status),
  ).length;
  const turnStatus = context.turn?.status ?? "준비 중";
  const headOfState =
    ledger.offices.find((office) => office.officeType === "HEAD_OF_STATE")?.holderName ??
    politics?.headOfState;
  const perCapita =
    economy && demo && !new Decimal(demo.population).isZero()
      ? new Decimal(economy.realGdp).mul(1_000_000).div(demo.population).toString()
      : null;

  const signals = [
    { label: "경기 역성장", active: economy ? Number(economy.realGdpGrowth) < 0 : false },
    { label: "고물가", active: economy ? Number(economy.inflationRate) > 0.05 : false },
    { label: "대량 실업", active: economy ? Number(economy.unemploymentRate) > 0.08 : false },
    { label: "사회 불안", active: politics ? politics.unrest > 55 : false },
    { label: "정통성 약화", active: politics ? politics.legitimacy < 40 : false },
    { label: "미처리 사건", active: openEvents > 0 },
  ];

  return (
    <TnoWindow
      title="국가 브리핑"
      readout={
        <>
          <TnoReadout label="턴" value={`T${context.turn?.sequence ?? "—"}`} />
          <TnoReadout label="단계" value={TURN_STATUS_LABELS[turnStatus] ?? turnStatus} />
          <TnoReadout
            label="게임일"
            value={context.turn?.gameDateEnd ? String(context.turn.gameDateEnd).slice(0, 10) : "—"}
          />
          <TnoReadout label="원장" value={`R${profile?.revision ?? 0}`} />
        </>
      }
      tabs={TABS.map(([value, label]) => ({
        label,
        href: value === "briefing" ? "/dashboard" : `/dashboard?tab=${value}`,
        active: activeTab === value,
      }))}
    >
      <TnoBanner
        flag={profile?.flag ?? "⚑"}
        name={ledger.country.name}
        lines={[
          politics?.governmentForm ?? profile?.governmentForm ?? "정체 미정",
          `${profile?.capital ?? "수도 미정"} · ${politics?.rulingParty ?? "집권 세력 미정"}`,
        ]}
        emblem={ledger.country.code}
        color={ledger.country.color}
      />

      {activeTab === "briefing" ? (
        <>
          <div className="tno-headline-row">
            <TnoHeadline
              label="실질 성장률"
              value={formatPercent(economy?.realGdpGrowth, 2)}
              meta={`기준연도 ${economy?.referenceYear ?? "—"}`}
              tone={economy && Number(economy.realGdpGrowth) < 0 ? "bad" : "good"}
            />
            <TnoHeadline
              label="물가 상승률"
              value={formatPercent(economy?.inflationRate, 2)}
              meta="소비자물가 기준"
              tone={economy && Number(economy.inflationRate) > 0.05 ? "bad" : undefined}
            />
            <TnoHeadline
              label="실업률"
              value={formatPercent(economy?.unemploymentRate, 2)}
              meta="경제활동인구 대비"
              tone={economy && Number(economy.unemploymentRate) > 0.08 ? "bad" : undefined}
            />
            <TnoHeadline
              label="국가신용등급"
              value={economy?.creditRating ?? "—"}
              meta={`환산 점수 ${economy?.creditScore ?? "—"}`}
            />
          </div>

          <div className="tno-two-column">
            <TnoPlate title="정치 계기판">
              <TnoGauges
                items={[
                  { label: "안정도", value: politics?.stability ?? null },
                  { label: "정통성", value: politics?.legitimacy ?? null },
                  { label: "정권 지지", value: politics?.governmentApproval ?? null },
                  { label: "정책 지지", value: politics?.policySupport ?? null },
                  { label: "행정 역량", value: politics?.stateCapacity ?? null },
                  { label: "민주주의", value: politics?.democracy ?? null },
                  { label: "사회 불안", value: politics?.unrest ?? null, invert: true },
                  { label: "부패", value: politics?.corruption ?? null, invert: true },
                ]}
              />
            </TnoPlate>

            <div className="tno-column-stack">
              <TnoPlate title="운영 신호">
                <div className="tno-signal-grid">
                  {signals.map((signal) => (
                    <span key={signal.label} className={`tno-signal ${signal.active ? "on" : ""}`}>
                      <i>{signal.active ? "!" : "·"}</i>
                      {signal.label}
                    </span>
                  ))}
                </div>
              </TnoPlate>

              <TnoPlate title="집무 현황">
                <TnoStats
                  columns={2}
                  items={[
                    { label: "턴 단계", value: TURN_STATUS_LABELS[turnStatus] ?? turnStatus },
                    {
                      label: "국가 설정",
                      value:
                        context.country.setupStatus === "APPROVED"
                          ? "승인"
                          : context.country.setupStatus,
                    },
                    {
                      label: "미처리 사건",
                      value: `${openEvents}건`,
                      tone: openEvents ? "bad" : undefined,
                    },
                    { label: "진행 외교", value: `${openProposals}건` },
                    {
                      label: "정부지출",
                      value: formatMoney(economy?.governmentSpending, economy?.currencyCode),
                    },
                    { label: "부채/GDP", value: formatPercent(economy?.debtToGdp, 1) },
                  ]}
                />
              </TnoPlate>
            </div>
          </div>

          <TnoPlate title="최근 승인 변경" wide>
            {ledger.approvedChanges.length ? (
              <ul className="tno-entity-list">
                {ledger.approvedChanges
                  .slice(-6)
                  .reverse()
                  .map((change) => (
                    <li key={change.id}>
                      <span>
                        {domainLabel(change.domain)} · {metricLabel(change.metric)}
                      </span>
                      <em>{change.reason}</em>
                      <b>
                        {String(change.beforeValue)} → {String(change.afterValue)}
                      </b>
                    </li>
                  ))}
              </ul>
            ) : (
              <p>아직 승인된 수동 변경이 없습니다.</p>
            )}
          </TnoPlate>
        </>
      ) : (
        <>
          <div className="tno-headline-row">
            <TnoHeadline
              label="총인구"
              value={demo ? formatDecimal(demo.population, 0) : "—"}
              meta="명"
            />
            <TnoHeadline
              label="실질 GDP"
              value={formatMoney(economy?.realGdp, economy?.currencyCode)}
              meta={`기준연도 ${economy?.referenceYear ?? "—"}`}
            />
            <TnoHeadline
              label="1인당 GDP"
              value={perCapita ? formatDecimal(perCapita, 0) : "—"}
              meta={economy?.currencyCode ?? "기준화폐"}
            />
            <TnoHeadline
              label="총면적"
              value={profile?.totalAreaKm2 ? formatDecimal(profile.totalAreaKm2, 0) : "—"}
              meta="km²"
            />
          </div>

          <div className="tno-two-column">
            <TnoPlate title="국가 요람">
              <TnoStats
                columns={2}
                items={[
                  { label: "국명", value: ledger.country.name },
                  { label: "국가코드", value: ledger.country.code },
                  { label: "수도", value: profile?.capital ?? "—" },
                  { label: "최대도시", value: profile?.largestCity ?? "—" },
                  {
                    label: "정치체제",
                    value: politics?.governmentForm ?? profile?.governmentForm ?? "—",
                  },
                  { label: "국가원수", value: headOfState ?? "—" },
                  {
                    label: "공식 화폐",
                    value: profile?.officialCurrency ?? economy?.currencyCode ?? "—",
                  },
                  { label: "행성", value: profile?.planet ?? "—" },
                ]}
              />
            </TnoPlate>

            <div className="tno-column-stack">
              <TnoPlate title="국가 상징">
                <TnoKeyValues
                  items={[
                    ["국기", profile?.flag ?? "미등록"],
                    ["표어", profile?.motto ?? "미등록"],
                    ["국가(國歌)", profile?.nationalAnthem ?? "미등록"],
                    ["국목", profile?.nationalTree ?? "미등록"],
                    ["국화", profile?.nationalFlower ?? "미등록"],
                    ["국조", profile?.nationalBird ?? "미등록"],
                    ["국수", profile?.nationalAnimal ?? "미등록"],
                    ["국교", profile?.stateReligion ?? "없음/미지정"],
                  ]}
                />
              </TnoPlate>

              <TnoPlate title="주요 산업">
                <TnoChips
                  items={profile?.majorIndustries ?? []}
                  empty="등록된 주요 산업이 없습니다."
                />
              </TnoPlate>
            </div>
          </div>

          <TnoPlate title="연혁" wide>
            {profile?.timeline?.length ? (
              <ul className="tno-timeline">
                {profile.timeline.map((entry, index) => (
                  <li key={`${entry.year}-${index}`}>
                    <b>{entry.year}</b>
                    <span>{entry.event}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>{profile?.history ?? "등록된 연혁이 없습니다."}</p>
            )}
          </TnoPlate>
        </>
      )}
    </TnoWindow>
  );
}
