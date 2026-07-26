export const GLOBAL_MAP_H3_RESOLUTION = 4;
export const MAP_H3_RESOLUTIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
export type MapH3Resolution = (typeof MAP_H3_RESOLUTIONS)[number];

export function getMapTileResolution(
  selectedResolution: MapH3Resolution,
  zoom: number,
): MapH3Resolution {
  const visibleResolution =
    zoom <= 1
      ? 2
      : zoom <= 3
        ? 3
        : zoom === 4
          ? 4
          : zoom <= 6
            ? 5
            : zoom === 7
              ? 6
              : zoom <= 9
                ? 7
                : 8;
  return Math.min(selectedResolution, visibleResolution) as MapH3Resolution;
}

const MINIMUM_SAFE_TILE_ZOOM = [0, 0, 0, 2, 4, 5, 6, 8, 9] as const;

export function getMinimumSafeTileZoom(resolution: number) {
  const normalized = Math.min(8, Math.max(1, Math.round(resolution)));
  return MINIMUM_SAFE_TILE_ZOOM[normalized];
}
