export type TechEdge = { tech: string; prerequisite: string };

export function assertValidTechGraph(nodes: string[], edges: TechEdge[]) {
  const nodeSet = new Set(nodes);
  if (nodeSet.size !== nodes.length) throw new Error("기술 코드가 중복되었습니다.");
  const adjacency = new Map(nodes.map((node) => [node, [] as string[]]));

  for (const edge of edges) {
    if (!nodeSet.has(edge.tech) || !nodeSet.has(edge.prerequisite)) {
      throw new Error("존재하지 않는 선행 기술이 있습니다.");
    }
    if (edge.tech === edge.prerequisite)
      throw new Error("기술은 자기 자신을 선행 조건으로 가질 수 없습니다.");
    adjacency.get(edge.prerequisite)?.push(edge.tech);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (node: string) => {
    if (visiting.has(node)) throw new Error("기술 트리에 순환 선행 조건이 있습니다.");
    if (visited.has(node)) return;
    visiting.add(node);
    adjacency.get(node)?.forEach(visit);
    visiting.delete(node);
    visited.add(node);
  };
  nodes.forEach(visit);
}

export function canResearch(input: {
  techCode: string;
  completedCodes: Set<string>;
  edges: TechEdge[];
  exclusiveGroup?: string | null;
  completedExclusiveGroups?: Set<string>;
}) {
  if (input.exclusiveGroup && input.completedExclusiveGroups?.has(input.exclusiveGroup))
    return false;
  return input.edges
    .filter((edge) => edge.tech === input.techCode)
    .every((edge) => input.completedCodes.has(edge.prerequisite));
}
