import Decimal from "decimal.js";
import { allocateResearchPointsAction } from "@/src/actions/research";
import { requireSession } from "@/src/auth/session";
import { getCountryResearch } from "@/src/db/queries/country";
import { getViewerContext } from "@/src/db/queries/viewer";
import { TnoHeadline, TnoPlate, TnoReadout, TnoWindow } from "@/src/ui/tno-frame";

export const metadata = { title: "연구" };

const STATUS_LABELS: Record<string, string> = {
  LOCKED: "봉인",
  AVAILABLE: "착수 가능",
  IN_PROGRESS: "연구 중",
  COMPLETED: "완료",
};

export default async function ResearchPage() {
  const session = await requireSession();
  const context = await getViewerContext(session.user.id);
  if (!context.country || !context.campaign) return null;
  const tree = await getCountryResearch(context.country.id, context.campaign.id, context.turn?.id);
  const stateByNode = new Map(tree.states.map((state) => [state.techNodeId, state]));
  const allocationByNode = new Map(tree.allocations.map((item) => [item.techNodeId, item]));
  const allocated = tree.allocations.reduce((sum, item) => sum.plus(item.points), new Decimal(0));
  const remaining = new Decimal(100).minus(allocated);
  const eras = [...new Set(tree.nodes.map((node) => node.era))].sort();
  const prereqNames = new Map(tree.nodes.map((node) => [node.id, node.name]));
  const turnOpen = context.turn?.status === "DRAFT";
  const completed = tree.states.filter((state) => state.status === "COMPLETED").length;
  const inProgress = tree.states.filter((state) => state.status === "IN_PROGRESS").length;

  function statusOf(nodeId: string) {
    const state = stateByNode.get(nodeId);
    if (state) return state.status;
    return tree.edges.some((edge) => edge.techNodeId === nodeId) ? "LOCKED" : "AVAILABLE";
  }

  return (
    <TnoWindow
      title="연구 원장"
      readout={
        <>
          <TnoReadout label="잔여" value={`${remaining.toFixed(0)}pt`} />
          <TnoReadout label="배분" value={`${allocated.toFixed(0)}pt`} />
          <TnoReadout label="턴" value={turnOpen ? "배분 가능" : "배분 마감"} />
        </>
      }
    >
      <div className="tno-headline-row">
        <TnoHeadline
          label="잔여 포인트"
          value={remaining.toFixed(0)}
          meta="총 100pt / 턴"
          tone={remaining.lessThanOrEqualTo(0) ? "bad" : "good"}
        />
        <TnoHeadline label="연구 중" value={`${inProgress}건`} meta="진행 노드" />
        <TnoHeadline
          label="완료"
          value={`${completed}건`}
          meta={`총 ${tree.nodes.length}개 노드`}
        />
        <TnoHeadline label="시대 구간" value={eras.length ? `${eras.length}개` : "—"} meta="ERA" />
      </div>

      {tree.nodes.length ? (
        <div className="tno-tech-grid">
          {eras.map((era) => (
            <section className="tno-tech-column" key={era}>
              <h3 className="tno-section-tab">ERA {era}</h3>
              {tree.nodes
                .filter((node) => node.era === era)
                .map((node) => {
                  const state = stateByNode.get(node.id);
                  const allocation = allocationByNode.get(node.id);
                  const status = statusOf(node.id);
                  const progress = state
                    ? Decimal.min(
                        100,
                        new Decimal(state.progressPoints).div(node.cost).mul(100),
                      ).toNumber()
                    : 0;
                  const prerequisites = tree.edges
                    .filter((edge) => edge.techNodeId === node.id)
                    .map((edge) => prereqNames.get(edge.prerequisiteId))
                    .filter(Boolean);
                  return (
                    <article className="tno-tech-node" data-status={status} key={node.id}>
                      <header>
                        <strong>{node.name}</strong>
                        <em>{STATUS_LABELS[status] ?? status}</em>
                      </header>
                      <small className="tno-tech-field">
                        {node.field} · 비용 {node.cost}pt
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
                      </small>
                      {status !== "LOCKED" && status !== "COMPLETED" && (
                        <form action={allocateResearchPointsAction} className="tno-tech-form">
                          <input type="hidden" name="techNodeId" value={node.id} />
                          <label>
                            배분
                            <input
                              name="points"
                              type="number"
                              min="0"
                              max="100"
                              step="1"
                              defaultValue={allocation?.points ?? "0"}
                              disabled={!turnOpen}
                            />
                          </label>
                          <button type="submit" disabled={!turnOpen}>
                            저장
                          </button>
                        </form>
                      )}
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
    </TnoWindow>
  );
}
