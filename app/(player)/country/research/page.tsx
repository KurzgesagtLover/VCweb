import Decimal from "decimal.js";
import { allocateResearchPointsAction } from "@/src/actions/research";
import { requireSession } from "@/src/auth/session";
import { getCountryResearch } from "@/src/db/queries/country";
import { getViewerContext } from "@/src/db/queries/viewer";
import { PageHead } from "@/src/ui/page-head";

export const metadata = { title: "연구" };

export default async function ResearchPage() {
  const session = await requireSession();
  const context = await getViewerContext(session.user.id);
  if (!context.country || !context.campaign) return null;
  const tree = await getCountryResearch(context.country.id, context.campaign.id, context.turn?.id);
  const stateByNode = new Map(tree.states.map((state) => [state.techNodeId, state]));
  const allocationByNode = new Map(tree.allocations.map((a) => [a.techNodeId, a]));
  const allocated = tree.allocations.reduce((sum, a) => sum.plus(a.points), new Decimal(0));
  const eras = [...new Set(tree.nodes.map((node) => node.era))].sort();
  const prereqNames = new Map(tree.nodes.map((node) => [node.id, node.name]));
  return (
    <div className="section-stack">
      <PageHead
        eyebrow="RESEARCH DIRECTORATE"
        title="기술 연구"
        description="선행 관계를 만족하는 기술에 이번 턴 연구 포인트를 배분합니다."
        aside={
          <span className="status-pill">
            잔여 {new Decimal(100).minus(allocated).toFixed(0)} / 100
          </span>
        }
      />
      {tree.nodes.length ? (
        <section className="tech-tree">
          {eras.map((era) => (
            <div className="tech-column" key={era}>
              <h2 className="tech-era">ERA {era}</h2>
              {tree.nodes
                .filter((node) => node.era === era)
                .map((node) => {
                  const state = stateByNode.get(node.id);
                  const allocation = allocationByNode.get(node.id);
                  const status =
                    state?.status ??
                    (tree.edges.some((edge) => edge.techNodeId === node.id)
                      ? "LOCKED"
                      : "AVAILABLE");
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
                    <article className="tech-node" data-status={status} key={node.id}>
                      <div>
                        <span className="eyebrow">
                          {node.field} · {status}
                        </span>
                        <h3>{node.name}</h3>
                      </div>
                      <p className="muted">{node.description}</p>
                      <small>
                        비용 {node.cost} · 선행 {prerequisites.join(", ") || "없음"}
                      </small>
                      <div className="progress" aria-label={`진행률 ${progress.toFixed(0)}%`}>
                        <span style={{ width: `${progress}%` }} />
                      </div>
                      {status !== "LOCKED" && status !== "COMPLETED" && (
                        <form action={allocateResearchPointsAction} className="form-stack">
                          <input type="hidden" name="techNodeId" value={node.id} />
                          <label>
                            이번 턴 배분
                            <input
                              name="points"
                              type="number"
                              min="0"
                              max="100"
                              step="1"
                              defaultValue={allocation?.points ?? "0"}
                              disabled={context.turn?.status !== "DRAFT"}
                            />
                          </label>
                          <button disabled={context.turn?.status !== "DRAFT"}>배분 저장</button>
                        </form>
                      )}
                    </article>
                  );
                })}
            </div>
          ))}
        </section>
      ) : (
        <div className="empty-state">
          <strong>공개된 기술 노드가 없습니다.</strong>
          <p>관리자가 캠페인 기술 트리를 구성해야 합니다.</p>
        </div>
      )}
    </div>
  );
}
