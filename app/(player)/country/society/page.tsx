import { requireSession } from "@/src/auth/session";
import { db } from "@/src/db";
import { getCountryLedger } from "@/src/db/queries/country";
import { getViewerContext } from "@/src/db/queries/viewer";
import {
  ageGroups,
  fiveYearBands,
  manpowerPool,
  normalizeAgeStructure,
} from "@/src/domain/demography/age-structure";
import { metricLabel } from "@/src/domain/display-labels";
import { requireLawDefinition } from "@/src/domain/politics/laws";
import { getCountryLawStages } from "@/src/services/country-state";
import { DevelopmentTrackGrid } from "@/src/ui/development-tracks";
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

  const ageStructure = normalizeAgeStructure(demo?.ageStructure);
  const groups = ageStructure ? ageGroups(ageStructure) : null;
  const bands = ageStructure ? fiveYearBands(ageStructure).reverse() : [];
  const largestBand = Math.max(1, ...bands.map((band) => band.value));
  const lawStages = await getCountryLawStages(db, ledger.country);
  const conscription = requireLawDefinition("conscriptionLaw");
  const conscriptionStage = conscription.stages[(lawStages.conscriptionLaw ?? 1) - 1];
  const manpowerShare = Number(conscriptionStage?.manpowerShare ?? 0);
  const manpower = ageStructure ? manpowerPool(ageStructure, manpowerShare) : null;
  const percentOf = (value: number) => `${(value * 100).toFixed(1)}%`;

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

      <TnoPlate title="국가 발전 기반" wide>
        <DevelopmentTrackGrid tracks={ledger.developmentTracks} />
      </TnoPlate>

      <TnoPlate title="사회 제도" wide>
        <DevelopmentTrackGrid tracks={ledger.socialInstitutions} />
      </TnoPlate>

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
              { label: "중위연령", value: demo ? `${formatDecimal(demo.medianAge, 1)}세` : "—" },
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

      <TnoPlate title="연령 구조" wide>
        {ageStructure && groups ? (
          <div className="tno-two-column">
            <div className="tno-gauge-list age-pyramid">
              {bands.map((band) => (
                <div className="tno-gauge tno-gauge-wide" key={band.label}>
                  <span>{band.label}</span>
                  <div className="tno-bar">
                    <i style={{ width: `${(band.value / largestBand) * 100}%` }} />
                  </div>
                  <b>{formatDecimal(band.value / 1000, 0)}천</b>
                </div>
              ))}
            </div>
            <TnoStats
              columns={2}
              items={[
                { label: "유소년(0–14)", value: percentOf(groups.childShare) },
                { label: "생산가능(15–64)", value: percentOf(groups.workingShare) },
                { label: "고령(65+)", value: percentOf(groups.elderlyShare) },
                { label: "부양비", value: formatDecimal(groups.dependencyRatio, 2) },
                { label: "학령인구(6–17)", value: formatDecimal(groups.schoolAge, 0) },
                { label: "대학 연령(18–24)", value: formatDecimal(groups.universityAge, 0) },
                { label: "병역 연령(18–49)", value: formatDecimal(groups.militaryAge, 0) },
                {
                  label: `동원 가능 병력 (${conscriptionStage?.label ?? "징병법"})`,
                  value: manpower === null ? "—" : formatDecimal(manpower, 0),
                },
                {
                  label: "연간 순이동률",
                  value: formatPercent(demo?.netMigrationRate ?? null, 2),
                },
              ]}
            />
          </div>
        ) : (
          <p>다음 턴 계산 때 출산율·기대수명·중위연령으로 연령 구조가 만들어집니다.</p>
        )}
      </TnoPlate>

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
