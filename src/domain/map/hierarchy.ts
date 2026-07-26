import { cellToCenterChild, cellToParent, getResolution } from "h3-js";
import { GLOBAL_MAP_H3_RESOLUTION } from "./grid";

export function getMapCellCandidates(cellId: string) {
  const resolution = getResolution(cellId);
  const candidates = [cellId];
  for (let parentResolution = resolution - 1; parentResolution >= 1; parentResolution -= 1) {
    candidates.push(cellToParent(cellId, parentResolution));
  }
  if (resolution < GLOBAL_MAP_H3_RESOLUTION) {
    candidates.push(cellToCenterChild(cellId, GLOBAL_MAP_H3_RESOLUTION));
  }
  return [...new Set(candidates)];
}

export function resolveCellValue<T extends { revision: number }>(
  candidates: string[],
  values: Map<string, T>,
) {
  let resolved: T | undefined;
  let resolvedIndex = Number.POSITIVE_INFINITY;
  candidates.forEach((cellId, index) => {
    const value = values.get(cellId);
    if (
      value &&
      (!resolved ||
        value.revision > resolved.revision ||
        (value.revision === resolved.revision && index < resolvedIndex))
    ) {
      resolved = value;
      resolvedIndex = index;
    }
  });
  return resolved;
}
