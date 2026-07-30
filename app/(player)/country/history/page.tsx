import { requireSession } from "@/src/auth/session";
import { getCountryLedger } from "@/src/db/queries/country";
import { getViewerContext } from "@/src/db/queries/viewer";
import { formatDecimal } from "@/src/ui/format";
import { TnoHeadline, TnoPlate, TnoReadout, TnoStats, TnoWindow } from "@/src/ui/tno-frame";

export const metadata = { title: "역사·지리" };

export default async function HistoryPage() {
  const session = await requireSession();
  const context = await getViewerContext(session.user.id);
  if (!context.country) return null;
  const ledger = await getCountryLedger(context.country.id);
  if (!ledger) return null;
  const profile = ledger.profile;
  const levels = [...new Set(ledger.divisions.map((division) => division.level))].sort(
    (a, b) => a - b,
  );

  return (
    <TnoWindow
      title="역사·지리 원장"
      readout={
        <>
          <TnoReadout label="원장" value={`R${profile?.revision ?? 0}`} />
          <TnoReadout label="행성" value={profile?.planet ?? "미상"} />
          <TnoReadout label="구역" value={`${ledger.divisions.length}개`} />
        </>
      }
    >
      <div className="tno-headline-row">
        <TnoHeadline label="수도" value={profile?.capital ?? "—"} meta="행정 중심" />
        <TnoHeadline label="최대도시" value={profile?.largestCity ?? "—"} meta="인구 최대" />
        <TnoHeadline
          label="총면적"
          value={profile?.totalAreaKm2 ? formatDecimal(profile.totalAreaKm2, 0) : "—"}
          meta="km²"
        />
        <TnoHeadline
          label="내수면 비율"
          value={
            profile?.inlandWaterRatio
              ? `${formatDecimal(Number(profile.inlandWaterRatio) * 100, 1)}%`
              : "—"
          }
          meta="호소·하천"
        />
      </div>

      <div className="tno-two-column">
        <TnoPlate title="역사 기록">
          <div className="tno-longform">
            {profile?.history ? (
              profile.history
                .split(/\n{2,}/)
                .map((paragraph, index) => <p key={index}>{paragraph}</p>)
            ) : (
              <p>승인된 상세 역사 기록이 없습니다.</p>
            )}
          </div>
        </TnoPlate>

        <div className="tno-column-stack">
          <TnoPlate title="지리 개요">
            <TnoStats
              columns={2}
              items={[
                { label: "행성", value: profile?.planet ?? "—" },
                { label: "행정구역 단계", value: levels.length ? `${levels.length}단계` : "—" },
                { label: "하위 구역", value: `${ledger.divisions.length}개` },
                {
                  label: "국교",
                  value: profile?.stateReligion ?? "없음",
                },
              ]}
            />
          </TnoPlate>

          <TnoPlate title="행정구역 계층">
            {ledger.divisions.length ? (
              <div className="tno-division-tree">
                {levels.map((level) => (
                  <section key={level}>
                    <h4>{level}단계</h4>
                    <div className="tno-tag-row">
                      {ledger.divisions
                        .filter((division) => division.level === level)
                        .map((division) => (
                          <span key={division.id}>
                            {division.name}
                            <em>{division.typeName}</em>
                          </span>
                        ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <p>등록된 하위 행정구역이 없습니다.</p>
            )}
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
          <p>등록된 연혁이 없습니다.</p>
        )}
      </TnoPlate>
    </TnoWindow>
  );
}
