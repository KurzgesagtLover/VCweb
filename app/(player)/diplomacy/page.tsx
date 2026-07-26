import { respondToDiplomaticProposalAction } from "@/src/actions/diplomacy";
import { requireSession } from "@/src/auth/session";
import { eq } from "drizzle-orm";
import { db } from "@/src/db";
import { mapRasterColorAssignments, mapRasters } from "@/src/db/schema";
import { getDiplomacyDesk } from "@/src/db/queries/diplomacy";
import { getPrimaryCampaignMap } from "@/src/db/queries/maps";
import { getViewerContext } from "@/src/db/queries/viewer";
import { PageHead } from "@/src/ui/page-head";
import { PixelDiplomacyMap } from "@/src/ui/pixel-diplomacy-map";

export const metadata = { title: "외교·세계 지도" };

export default async function DiplomacyPage() {
  const session = await requireSession();
  const context = await getViewerContext(session.user.id);
  if (!context.campaign || !context.country || !context.turn) return null;
  const primaryMap = await getPrimaryCampaignMap(context.campaign.id);
  if (!primaryMap) return null;
  const [desk, raster, colorAssignments] = await Promise.all([
    getDiplomacyDesk(context.campaign.id, context.country.id),
    db.query.mapRasters.findFirst({
      where: eq(mapRasters.mapId, primaryMap.id),
      columns: { revision: true, width: true, height: true },
    }),
    db.query.mapRasterColorAssignments.findMany({
      where: eq(mapRasterColorAssignments.mapId, primaryMap.id),
      columns: { colorHex: true, countryId: true },
    }),
  ]);
  const countryById = new Map(desk.countries.map((country) => [country.id, country]));
  return (
    <div className="section-stack diplomacy-page">
      <PageHead
        eyebrow="WORLD RELATIONS DESK"
        title="세계 지도와 외교"
        description="지도에서 타국을 선택해 공개 정보와 양국 관계를 확인하고 제안을 보냅니다."
        aside={<span className="status-pill">MAP R{primaryMap.revision}</span>}
      />
      <div className="diplomacy-map-bleed">
        <PixelDiplomacyMap
          mapId={primaryMap.id}
          mapRevision={primaryMap.revision}
          hexResolution={primaryMap.hexResolution}
          adaptiveResolution={primaryMap.adaptiveResolution}
          rasterRevision={raster?.revision ?? 0}
          rasterWidth={raster?.width ?? 16384}
          rasterHeight={raster?.height ?? 8192}
          colorAssignments={colorAssignments}
          countries={desk.countries.map(({ id, name, code, color, isAi }) => ({
            id,
            name,
            code,
            color,
            isAi,
          }))}
          ownCountryId={context.country.id}
          relations={desk.relations.map(({ toCountryId, score, tags }) => ({
            toCountryId,
            score,
            tags,
          }))}
          turnOpen={context.turn.status === "DRAFT"}
          divisionRevision={primaryMap.administrativeDivisionRevision}
        />
      </div>
      <section className="section-stack">
        <h2>제안함·수신함</h2>
        {desk.records.length === 0 ? (
          <div className="empty-state">
            아직 외교 제안이 없습니다. 지도에서 타국을 선택해 첫 제안을 보내세요.
          </div>
        ) : (
          desk.records.map(({ proposal, messages }) => {
            const incoming = proposal.toCountryId === context.country!.id;
            const counterpart = countryById.get(
              incoming ? proposal.fromCountryId : proposal.toCountryId,
            );
            return (
              <article className="panel" key={proposal.id}>
                <div className="panel-head">
                  <div>
                    <span className="eyebrow">
                      {incoming ? "수신" : "발신"} · {proposal.type} · {proposal.visibility}
                    </span>
                    <h3>{proposal.title}</h3>
                  </div>
                  <span className="status-pill">{proposal.status}</span>
                </div>
                <p className="muted">상대국 {counterpart?.name ?? "미상"}</p>
                <div className="diplomatic-thread">
                  {messages
                    .filter((message) => message.status === "SENT")
                    .map((message) => (
                      <div className="diplomatic-message" key={message.id}>
                        <strong>
                          {countryById.get(message.senderCountryId)?.name ?? "국가 대표"}
                        </strong>
                        <p>{message.body}</p>
                        <small>{message.responseType}</small>
                      </div>
                    ))}
                </div>
                {incoming &&
                  ["SENT", "COUNTERED", "DELAYED"].includes(proposal.status) &&
                  context.turn!.status === "DRAFT" && (
                    <form action={respondToDiplomaticProposalAction} className="form-stack">
                      <input type="hidden" name="proposalId" value={proposal.id} />
                      <label>
                        응답
                        <select name="response">
                          <option value="ACCEPT">수락</option>
                          <option value="REJECT">거절</option>
                          <option value="COUNTER">수정 제안</option>
                          <option value="DELAY">보류</option>
                        </select>
                      </label>
                      <label>
                        답변문
                        <textarea name="body" required minLength={5} maxLength={4000} />
                      </label>
                      <button type="submit">공식 답변 발송</button>
                    </form>
                  )}
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
