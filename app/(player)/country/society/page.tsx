import { requireSession } from "@/src/auth/session";
import { getCountryLedger } from "@/src/db/queries/country";
import { getViewerContext } from "@/src/db/queries/viewer";
import { metricLabel } from "@/src/domain/display-labels";
import { formatDecimal, formatPercent } from "@/src/ui/format";
import {
  TnoChips,
  TnoGauges,
  TnoHeadline,
  TnoPlate,
  TnoReadout,
  TnoStats,
  TnoWindow,
} from "@/src/ui/tno-frame";

export const metadata = { title: "인문" };

export default async function SocietyPage() {
  const session = await requireSession();
  const context = await getViewerContext(session.user.id);
  if (!context.country) return null;
  const ledger = await getCountryLedger(context.country.id);
  if (!ledger) return null;
  const demo = ledger.demographic;
  const profile = ledger.profile;
  const economy = ledger.economic;

  const population = demo ? Number(demo.population) : 0;
  const foreignResidents = demo ? Number(demo.foreignResidents) : 0;
  const citizensAbroad = demo ? Number(demo.citizensAbroad) : 0;
  const diaspora = demo ? Number(demo.diaspora) : 0;
  const residentBase = population + foreignResidents;
  const compositionRows = residentBase
    ? [
        {
          label: "국내 거주 자국민",
          value: population,
          ratio: population / residentBase,
          color: "#4bb6f2",
        },
        {
          label: "국내 거주 외국인",
          value: foreignResidents,
          ratio: foreignResidents / residentBase,
          color: "#f2c14b",
        },
        {
          label: "해외 거주 자국인",
          value: citizensAbroad,
          ratio: citizensAbroad / residentBase,
          color: "#a97bf2",
        },
        {
          label: "디아스포라",
          value: diaspora,
          ratio: diaspora / residentBase,
          color: "#f2794b",
        },
      ]
    : [];

  const estimated = (demo?.estimatedFields ?? []).map((field) => metricLabel(field));

  return (
    <TnoWindow
      title="인문·사회"
      readout={
        <>
          <TnoReadout label="국가" value={ledger.country.name} />
          <TnoReadout label="추정 항목" value={`${estimated.length}건`} />
        </>
      }
    >
      <div className="tno-headline-row">
        <TnoHeadline
          label="총인구"
          value={demo ? formatDecimal(demo.population, 0) : "—"}
          meta="명"
        />
        <TnoHeadline
          label="인구 성장률"
          value={formatPercent(demo?.populationGrowthRate, 2)}
          meta="연간"
          tone={demo && Number(demo.populationGrowthRate) < 0 ? "bad" : "good"}
        />
        <TnoHeadline
          label="합계출산율"
          value={demo ? formatDecimal(demo.fertilityRate, 2) : "—"}
          meta="여성 1명당"
          tone={demo && Number(demo.fertilityRate) < 1.5 ? "bad" : undefined}
        />
        <TnoHeadline
          label="기대수명"
          value={demo ? formatDecimal(demo.lifeExpectancy, 1) : "—"}
          meta="세"
        />
      </div>

      <div className="tno-two-column">
        <TnoPlate title="인구 구조">
          {compositionRows.length ? (
            <div className="tno-gauge-list">
              {compositionRows.map((row) => (
                <div className="tno-gauge tno-gauge-wide" key={row.label}>
                  <span>{row.label}</span>
                  <div className="tno-bar">
                    <i
                      style={{
                        width: `${Math.min(100, row.ratio * 100)}%`,
                        background: row.color,
                      }}
                    />
                  </div>
                  <b>{formatDecimal(row.value, 0)}</b>
                </div>
              ))}
            </div>
          ) : (
            <p>인구 스냅샷이 없습니다.</p>
          )}
          <div className="tno-plate-divider" />
          <TnoStats
            columns={2}
            items={[
              {
                label: "인구밀도",
                value: demo ? `${formatDecimal(demo.populationDensity, 1)} /km²` : "—",
              },
              { label: "평균연령", value: demo ? `${formatDecimal(demo.medianAge, 1)}세` : "—" },
              { label: "실업률", value: formatPercent(economy?.unemploymentRate, 2) },
              { label: "소득 지니", value: economy ? formatDecimal(economy.incomeGini, 3) : "—" },
            ]}
          />
        </TnoPlate>

        <div className="tno-column-stack">
          <TnoPlate title="사회 지표">
            <TnoGauges
              items={[
                { label: "정통성", value: ledger.political?.legitimacy ?? null },
                { label: "행정 역량", value: ledger.political?.stateCapacity ?? null },
                { label: "사회 불안", value: ledger.political?.unrest ?? null, invert: true },
                { label: "부패", value: ledger.political?.corruption ?? null, invert: true },
              ]}
            />
          </TnoPlate>

          <TnoPlate title="언어·종교">
            <div className="tno-subhead">공용어</div>
            <TnoChips items={profile?.officialLanguages ?? []} empty="등록된 공용어 없음" />
            <div className="tno-subhead">공용 문자</div>
            <TnoChips items={profile?.officialScripts ?? []} empty="등록된 문자 없음" />
            <div className="tno-subhead">국교</div>
            <TnoChips
              items={profile?.stateReligion ? [profile.stateReligion] : []}
              empty="국교 없음/미지정"
            />
          </TnoPlate>
        </div>
      </div>

      <div className="tno-two-column">
        <TnoPlate title="군사·안보 개요">
          <p>{profile?.militaryDescription ?? "등록된 군사 설명이 없습니다."}</p>
        </TnoPlate>
        <TnoPlate title="추정 입력 항목">
          <TnoChips items={estimated} empty="모든 항목이 제출 값 기준입니다." />
        </TnoPlate>
      </div>
    </TnoWindow>
  );
}
