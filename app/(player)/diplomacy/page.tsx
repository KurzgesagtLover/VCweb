import { desc, eq } from "drizzle-orm";
import { respondToDiplomaticProposalAction } from "@/src/actions/diplomacy";
import { requireSession } from "@/src/auth/session";
import { db } from "@/src/db";
import {
  countryProfileRevisions,
  mapRasterBorderLayers,
  mapRasterColorAssignments,
  mapRasters,
  politicalSnapshots,
  turns,
} from "@/src/db/schema";
import { getDiplomacyDesk } from "@/src/db/queries/diplomacy";
import { getPrimaryCampaignMap } from "@/src/db/queries/maps";
import { getViewerContext } from "@/src/db/queries/viewer";
import { PixelDiplomacyMap } from "@/src/ui/pixel-diplomacy-map";

export const metadata = { title: "외교·세계 지도" };

const PROPOSAL_TYPE_LABELS: Record<string, string> = {
  STATEMENT: "공식 성명",
  NEGOTIATION: "협상",
  TREATY: "조약",
  TRADE: "무역",
  AID: "원조",
  WARNING: "경고",
  OTHER: "기타",
};

const PROPOSAL_STATUS_LABELS: Record<string, string> = {
  SENT: "발송됨",
  PENDING_AI: "AI 검토 중",
  ACCEPTED: "수락",
  REJECTED: "거절",
  COUNTERED: "수정 제안",
  DELAYED: "보류",
  EXPIRED: "만료",
};

export default async function DiplomacyPage() {
  const session = await requireSession();
  const context = await getViewerContext(session.user.id);
  if (!context.campaign || !context.country || !context.turn) return null;
  const primaryMap = await getPrimaryCampaignMap(context.campaign.id);
  if (!primaryMap) return null;
  const [desk, raster, colorAssignments, borderLayer, ownProfile, ownPolitical] = await Promise.all(
    [
      getDiplomacyDesk(context.campaign.id, context.country.id),
      db.query.mapRasters.findFirst({
        where: eq(mapRasters.mapId, primaryMap.id),
        columns: { revision: true, width: true, height: true },
      }),
      db.query.mapRasterColorAssignments.findMany({
        where: eq(mapRasterColorAssignments.mapId, primaryMap.id),
        columns: { colorHex: true, countryId: true },
      }),
      db.query.mapRasterBorderLayers.findFirst({
        where: eq(mapRasterBorderLayers.mapId, primaryMap.id),
        columns: { revision: true },
      }),
      context.country.currentProfileRevisionId
        ? db.query.countryProfileRevisions.findFirst({
            where: eq(countryProfileRevisions.id, context.country.currentProfileRevisionId),
            columns: { flag: true },
          })
        : null,
      db
        .select({ snapshot: politicalSnapshots })
        .from(politicalSnapshots)
        .innerJoin(turns, eq(politicalSnapshots.turnId, turns.id))
        .where(eq(politicalSnapshots.countryId, context.country.id))
        .orderBy(desc(turns.sequence))
        .limit(1),
    ],
  );
  const countryById = new Map(desk.countries.map((country) => [country.id, country]));
  return (
    <div className="diplomacy-page">
      <div className="diplomacy-map-bleed">
        <PixelDiplomacyMap
          mapId={primaryMap.id}
          mapRevision={primaryMap.revision}
          hexResolution={primaryMap.hexResolution}
          adaptiveResolution={primaryMap.adaptiveResolution}
          rasterRevision={raster?.revision ?? 0}
          rasterWidth={raster?.width ?? 16384}
          rasterHeight={raster?.height ?? 8192}
          borderRevision={borderLayer?.revision ?? 0}
          colorAssignments={colorAssignments}
          countries={desk.countries.map(({ id, name, code, color, isAi }) => ({
            id,
            name,
            code,
            color,
            isAi,
          }))}
          ownCountryId={context.country.id}
          ownCountry={{
            name: context.country.name,
            code: context.country.code,
            color: context.country.color,
            flag: ownProfile?.flag ?? "⚑",
            stability: ownPolitical[0]?.snapshot.stability ?? null,
          }}
          relations={desk.relations.map(({ toCountryId, score, tags }) => ({
            toCountryId,
            score,
            tags,
          }))}
          turnOpen={context.turn.status === "DRAFT"}
          divisionRevision={primaryMap.administrativeDivisionRevision}
        />
      </div>

      <section className="diplomacy-inbox" id="diplomacy-inbox">
        <header className="diplomacy-inbox-head">
          <h2>외교 전문 기록</h2>
          <span>
            총 {desk.records.length}건 · 지도 R{primaryMap.revision}
          </span>
        </header>
        {desk.records.length === 0 ? (
          <div className="empty-state">
            아직 외교 전문이 없습니다. 지도에서 타국을 선택해 첫 제안을 보내세요.
          </div>
        ) : (
          <div className="diplomacy-record-grid">
            {desk.records.map(({ proposal, messages }) => {
              const incoming = proposal.toCountryId === context.country!.id;
              const counterpart = countryById.get(
                incoming ? proposal.fromCountryId : proposal.toCountryId,
              );
              return (
                <article className="diplomacy-record" key={proposal.id}>
                  <header>
                    <span className={`diplomacy-record-dir ${incoming ? "in" : "out"}`}>
                      {incoming ? "수신" : "발신"}
                    </span>
                    <div>
                      <h3>{proposal.title}</h3>
                      <p>
                        {counterpart?.name ?? "미상"} ·{" "}
                        {PROPOSAL_TYPE_LABELS[proposal.type] ?? proposal.type} ·{" "}
                        {proposal.visibility === "PUBLIC" ? "공개" : "비공개"}
                      </p>
                    </div>
                    <span className="diplomacy-record-status">
                      {PROPOSAL_STATUS_LABELS[proposal.status] ?? proposal.status}
                    </span>
                  </header>
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
            })}
          </div>
        )}
      </section>
    </div>
  );
}
