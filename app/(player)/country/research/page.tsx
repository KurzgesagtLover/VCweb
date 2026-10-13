import Decimal from "decimal.js";
import { allocateResearchPointsAction, setTechClassifiedAction } from "@/src/actions/research";
import { requireSession } from "@/src/auth/session";
import { getCountryResearch } from "@/src/db/queries/country";
import { getViewerContext } from "@/src/db/queries/viewer";
import { CONSTRUCTION_FACILITIES } from "@/src/domain/construction/catalog";
import {
  BLOCK_REASON_LABELS,
  diffusionBonus,
  estimatedDays,
  researchBlockReason,
  type ResearchState,
} from "@/src/domain/research/progress";
import { getResearchBoard } from "@/src/services/research";
import { formatDecimal, formatPercent } from "@/src/ui/format";
import { TnoChips, TnoHeadline, TnoPlate, TnoReadout, TnoWindow } from "@/src/ui/tno-frame";

export const metadata = { title: "연구" };

const STATUS_LABELS: Record<string, string> = {
  LOCKED: "봉인",
  AVAILABLE: "착수 가능",
  IN_PROGRESS: "연구 중",
  COMPLETED: "완료",
};

const facilityName = (id: string) =>
  CONSTRUCTION_FACILITIES.find((facility) => facility.id === id)?.name ?? id;

export default async function ResearchPage() {
  const session = await requireSession();
  const context = await getViewerContext(session.user.id);
  if (!context.country || !context.campaign) return null;
  const [tree, board] = await Promise.all([
    getCountryResearch(context.country.id, context.campaign.id, context.turn?.id),
    getResearchBoard({
      campaignId: context.campaign.id,
      countryId: context.country.id,
      turnSequence: context.turn?.sequence ?? null,
    }),
  ]);
  const capacity = board.capacity;
  const pointsPerYear = capacity ? Number(capacity.pointsPerYear) : 0;
  const fieldFactors = capacity?.fieldFactors ?? {};
  const facilities = new Set(capacity?.facilities ?? []);
  const states = new Map<string, ResearchState>(
    board.stateRows.map((row) => [
      row.techNodeId,
      { status: row.status, progressPoints: Number(row.progressPoints) },
    ]),
  );
  const stateRows = new Map(board.stateRows.map((row) => [row.techNodeId, row]));
  const allocationByNode = new Map(
    board.allocations.rows.map((row) => [row.techNodeId, Number(row.points)]),
  );
  const allocated = board.allocations.rows.reduce(
    (sum, row) => (states.get(row.techNodeId)?.status === "COMPLETED" ? sum : sum.plus(row.points)),
    new Decimal(0),
  );
  const usable = board.allocations.rows.reduce((sum, row) => {
    const tech = board.techs.get(row.techNodeId);
    if (!tech || researchBlockReason(tech, states, board.techs, facilities)) return sum;
    return sum.plus(row.points);
  }, new Decimal(0));
  const eras = [...new Set(tree.nodes.map((node) => node.era))].sort();
  const prereqNames = new Map(tree.nodes.map((node) => [node.id, node.name]));
  const completed = board.stateRows.filter((row) => row.status === "COMPLETED").length;
  const detail = (capacity?.detail ?? {}) as {
    education?: { tertiaryShare?: number; enrollmentTarget?: number };
    capacity?: { researchIntensity?: number };
  };

  return (
    <TnoWindow
      title="연구 원장"
      readout={
        <>
          <TnoReadout label="연구력" value={`${formatDecimal(pointsPerYear, 0)}pt/년`} />
          <TnoReadout label="배분" value={`${allocated.toFixed(0)}%`} />
          <TnoReadout label="가동" value={`${usable.toFixed(0)}%`} />
        </>
      }
    >
      <div className="tno-headline-row">
        <TnoHeadline
          label="연구 역량"
          value={formatDecimal(pointsPerYear, 1)}
          meta="연간 연구 포인트 · 실시간 진행"
          tone={pointsPerYear > 0 ? "good" : "bad"}
        />
        <TnoHeadline
          label="연구 인력"
          value={capacity ? formatDecimal(capacity.researchers, 0) : "—"}
          meta={`R&D ${capacity ? formatDecimal(Number(capacity.rdSpendingMillions) / 1000, 1) : "—"}B$`}
        />
        <TnoHeadline
          label="학사 이상 인력"
          value={capacity ? formatDecimal(capacity.tertiaryWorkers, 0) : "—"}
          meta={`생산가능인구의 ${formatPercent(detail.education?.tertiaryShare ?? null, 1)}`}
        />
        <TnoHeadline
          label="대학 진학률"
          value={formatPercent(capacity?.enrollmentRate ?? null, 1)}
          meta={`목표 ${formatPercent(detail.education?.enrollmentTarget ?? null, 1)} · 졸업 연 ${
            capacity ? formatDecimal(capacity.graduatesPerYear, 0) : "—"
          }명`}
        />
      </div>

      <TnoPlate title="분야 배율" wide>
        <TnoChips
          items={Object.entries(fieldFactors).map(
            ([field, factor]) => `${field} ×${Number(factor).toFixed(2)}`,
          )}
          empty="다음 턴 계산 뒤 연구 역량이 정해집니다."
        />
        <p className="research-note">
          배분하지 않았거나 진행할 수 없는 기술에 걸린 몫은 쓰이지 않습니다. 다른 나라가 기밀로 묶지
          않고 완성한 기술은 최대 50%까지 빨라집니다. 완성 효과는 다음 턴 공개 때 반영됩니다.
        </p>
      </TnoPlate>

      {tree.nodes.length ? (
        <div className="tno-tech-grid">
          {eras.map((era) => (
            <section className="tno-tech-column" key={era}>
              <h3 className="tno-section-tab">ERA {era}</h3>
              {tree.nodes
                .filter((node) => node.era === era)
                .map((node) => {
                  const tech = board.techs.get(node.id);
                  const state = states.get(node.id);
                  const row = stateRows.get(node.id);
                  const blocked = tech
                    ? researchBlockReason(tech, states, board.techs, facilities)
                    : "UNKNOWN";
                  const status =
                    state?.status === "COMPLETED"
                      ? "COMPLETED"
                      : blocked === "PREREQUISITE" || blocked === "EXCLUSIVE"
                        ? "LOCKED"
                        : (state?.status ?? "AVAILABLE");
                  const cost = Number(node.cost);
                  const progressPoints = state?.progressPoints ?? 0;
                  const progress = cost > 0 ? Math.min(100, (progressPoints / cost) * 100) : 0;
                  const percent = allocationByNode.get(node.id) ?? 0;
                  const diffusion = board.diffusion.get(node.id);
                  const bonus = diffusionBonus(diffusion?.weight ?? 0);
                  const multiplier = (Number(fieldFactors[node.field] ?? 1) || 1) * (1 + bonus);
                  const days =
                    status !== "COMPLETED" && !blocked
                      ? estimatedDays({
                          remaining: cost - progressPoints,
                          pointsPerYear,
                          percent,
                          multiplier,
                        })
                      : null;
                  const prerequisites = tree.edges
                    .filter((edge) => edge.techNodeId === node.id)
                    .map((edge) => prereqNames.get(edge.prerequisiteId))
                    .filter(Boolean);
                  const facilitiesNeeded = node.requiredFacilities ?? [];
                  return (
                    <article className="tno-tech-node" data-status={status} key={node.id}>
                      <header>
                        <strong>{node.name}</strong>
                        <em>{STATUS_LABELS[status] ?? status}</em>
                      </header>
                      <small className="tno-tech-field">
                        {node.field} ×{(Number(fieldFactors[node.field] ?? 1) || 1).toFixed(2)} ·
                        비용 {node.cost}pt
                        {diffusion
                          ? ` · 전파 +${Math.round(bonus * 100)}% (동맹 ${diffusion.partners}개국)`
                          : ""}
                      </small>
                      <p>{node.description}</p>
                      <div className="tno-bar" aria-label={`진행률 ${progress.toFixed(0)}%`}>
                        <i
                          className={progress >= 100 ? "good" : progress > 0 ? "fair" : ""}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <small className="tno-tech-prereq">
                        선행 {prerequisites.join(", ") || "없음"}
                        {facilitiesNeeded.length
                          ? ` · 시설 ${facilitiesNeeded.map(facilityName).join(", ")}`
                          : ""}
                      </small>
                      {blocked && blocked !== "COMPLETED" ? (
                        <small className="research-blocked">{BLOCK_REASON_LABELS[blocked]}</small>
                      ) : null}
                      {status === "COMPLETED" ? (
                        <form action={setTechClassifiedAction} className="tno-tech-form">
                          <input type="hidden" name="techNodeId" value={node.id} />
                          <input
                            type="hidden"
                            name="classified"
                            value={row?.classified ? "false" : "true"}
                          />
                          <button type="submit">
                            {row?.classified ? "기밀 해제" : "기밀 지정"}
                          </button>
                        </form>
                      ) : status !== "LOCKED" ? (
                        <form action={allocateResearchPointsAction} className="tno-tech-form">
                          <input type="hidden" name="techNodeId" value={node.id} />
                          <label>
                            배분 %
                            <input
                              name="points"
                              type="number"
                              min="0"
                              max="100"
                              step="1"
                              defaultValue={percent}
                            />
                          </label>
                          <button type="submit">저장</button>
                          {days !== null ? <small>약 {days}일</small> : null}
                        </form>
                      ) : null}
                    </article>
                  );
                })}
            </section>
          ))}
        </div>
      ) : (
        <TnoPlate title="기술 트리" wide>
          <p>공개된 기술 노드가 없습니다. 관리자가 캠페인 기술 트리를 구성해야 합니다.</p>
        </TnoPlate>
      )}
      <p className="research-note">
        완성 {completed}건 / 전체 {tree.nodes.length}건
      </p>
    </TnoWindow>
  );
}
