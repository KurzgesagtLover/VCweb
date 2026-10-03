"use client";

import NextImage from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import {
  COUNTRY_ENTITY_TYPE_LABELS,
  type CountryEntityType,
} from "@/src/domain/country/entity-type";
import {
  DIPLOMATIC_STATUS_LABELS,
  type DiplomaticRelationStatus,
} from "@/src/domain/diplomacy/status";
import {
  BORDER_LAYER_LABELS,
  BORDER_KIND_LABELS,
  borderLayerKind,
  DEFAULT_BORDER_DISPLAY_COLORS,
  DEFAULT_BORDER_LAYER_COLORS,
  type BorderClassification,
  type BorderKind,
  type BorderLayerKind,
} from "@/src/domain/map/border-palette";
import {
  MAP_PROJECTIONS,
  MAP_PROJECTION_ASPECT,
  MAP_PROJECTION_LABELS,
  type MapProjection,
} from "@/src/domain/map/projection";
import { interpolateRasterPoints } from "@/src/domain/map/raster-territory";

type Country = {
  id: string;
  name: string;
  code: string;
  color: string;
  entityType: CountryEntityType;
  isAi: boolean;
};
type CountryDraft = { name: string; entityType: CountryEntityType };
type ColorAssignment = { colorHex: string; countryId: string };
type MapRelation = {
  fromCountryId: string;
  toCountryId: string;
  status: DiplomaticRelationStatus;
};
type CountryDiplomacyAction =
  | "END_WAR"
  | "END_ALL_WARS"
  | "TRUCE_ALL_WARS"
  | "SET_STALEMATE"
  | "SET_TRUCE"
  | "END_ALLIANCE"
  | "END_ALL_ALLIANCES";

const WAR_RELATION_STATUSES = new Set<DiplomaticRelationStatus>(["WAR", "CIVIL_WAR"]);
const ALLIANCE_RELATION_STATUSES = new Set<DiplomaticRelationStatus>(["MUTUAL_DEFENSE"]);

function toCountryDrafts(rows: Country[]) {
  return Object.fromEntries(
    rows.map((country) => [country.id, { name: country.name, entityType: country.entityType }]),
  ) as Record<string, CountryDraft>;
}
type Tool = "assign" | "island" | "border" | "pencil" | "fill" | "erase";
type MapPoint = { x: number; y: number };
type MapGroupMode = "MUTUAL_WAR" | "MUTUAL_ALLIANCE" | "CREATE_BLOC";
type MapGroupMember = { id: string; name: string; point: MapPoint };
type CanvasPoint = MapPoint & { left: number; top: number; clientX: number; clientY: number };
type MenuState = {
  colorHex: string;
  x: number;
  y: number;
  clientX: number;
  clientY: number;
} | null;
type ZoomAnchor = { clientX: number; clientY: number; mapX: number; mapY: number };
type EditTile = {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  x: number;
  y: number;
  width: number;
  height: number;
};

const MIN_ZOOM = 25;
const MAX_ZOOM = 800;
const ZOOM_STEP = 25;
const EDIT_TILE_SIZE = 256;
const BORDER_LAYER_ORDER: BorderLayerKind[] = ["COAST", "LEGAL", "ACTIVE", "INACTIVE", "GUERRILLA"];

const DIPLOMATIC_STATUS_OPTIONS: DiplomaticRelationStatus[] = [
  "NORMAL",
  "WAR",
  "CIVIL_WAR",
  "TRUCE",
  "MUTUAL_DEFENSE",
  "INDEPENDENCE_GUARANTEE",
  "NO_RELATIONS",
  "STALEMATE",
  "GUERRILLA",
];

const MAP_GROUP_META: Record<
  MapGroupMode,
  { label: string; accent: string; applyLabel: string }
> = {
  MUTUAL_WAR: { label: "상호전쟁", accent: "rgba(217, 67, 105, 0.9)", applyLabel: "상호전쟁 적용" },
  MUTUAL_ALLIANCE: {
    label: "상호동맹",
    accent: "rgba(44, 193, 137, 0.9)",
    applyLabel: "상호동맹 적용",
  },
  CREATE_BLOC: { label: "세력 창설", accent: "rgba(0, 169, 196, 0.9)", applyLabel: "세력 창설" },
};

const TOOL_LABELS: Record<Tool, string> = {
  assign: "영토 할당",
  island: "섬 브러시",
  border: "국경색 선택",
  pencil: "연필",
  fill: "채우기",
  erase: "지우개",
};

function initialBorderLayerColors(
  rows: BorderClassification[],
  savedColors?: Partial<Record<BorderLayerKind, string>>,
) {
  const colors = { ...DEFAULT_BORDER_LAYER_COLORS };
  const assigned = new Set<BorderLayerKind>();
  for (const row of rows) {
    const layer = borderLayerKind(row.kind);
    if (!layer || assigned.has(layer)) continue;
    colors[layer] = row.displayColor.toUpperCase();
    assigned.add(layer);
  }
  for (const layer of BORDER_LAYER_ORDER) {
    const saved = savedColors?.[layer];
    if (saved && /^#[0-9A-Fa-f]{6}$/.test(saved)) colors[layer] = saved.toUpperCase();
  }
  return colors;
}

function rgba(hex: string) {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
    255,
  ] as const;
}

function quantizedHex(red: number, green: number, blue: number) {
  return (
    "#" +
    [red & 0xf8, green & 0xf8, blue & 0xf8]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

function canvasPoint(canvas: HTMLCanvasElement, event: PointerEvent<HTMLCanvasElement>) {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: Math.max(
      0,
      Math.min(
        canvas.width - 1,
        Math.floor(((event.clientX - bounds.left) / bounds.width) * canvas.width),
      ),
    ),
    y: Math.max(
      0,
      Math.min(
        canvas.height - 1,
        Math.floor(((event.clientY - bounds.top) / bounds.height) * canvas.height),
      ),
    ),
    left: event.clientX - bounds.left,
    top: event.clientY - bounds.top,
    clientX: event.clientX,
    clientY: event.clientY,
  };
}

function samePixel(data: Uint8ClampedArray, offset: number, target: readonly number[]) {
  return (
    data[offset] === target[0] &&
    data[offset + 1] === target[1] &&
    data[offset + 2] === target[2] &&
    data[offset + 3] === target[3]
  );
}

function floodFill(
  context: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  color: readonly number[],
) {
  const { width, height } = context.canvas;
  const image = context.getImageData(0, 0, width, height);
  const data = image.data;
  const startOffset = (startY * width + startX) * 4;
  const target = [
    data[startOffset],
    data[startOffset + 1],
    data[startOffset + 2],
    data[startOffset + 3],
  ];
  if (target.every((value, index) => value === color[index])) return false;
  const stack: Array<[number, number]> = [[startX, startY]];
  while (stack.length) {
    const next = stack.pop();
    if (!next) break;
    const [x, y] = next;
    if (!samePixel(data, (y * width + x) * 4, target)) continue;
    let scanY = y;
    while (scanY >= 0 && samePixel(data, (scanY * width + x) * 4, target)) scanY -= 1;
    scanY += 1;
    let leftOpen = false;
    let rightOpen = false;
    for (; scanY < height && samePixel(data, (scanY * width + x) * 4, target); scanY += 1) {
      const offset = (scanY * width + x) * 4;
      data[offset] = color[0];
      data[offset + 1] = color[1];
      data[offset + 2] = color[2];
      data[offset + 3] = color[3];
      if (x > 0) {
        const matches = samePixel(data, (scanY * width + x - 1) * 4, target);
        if (matches && !leftOpen) stack.push([x - 1, scanY]);
        leftOpen = matches;
      }
      if (x < width - 1) {
        const matches = samePixel(data, (scanY * width + x + 1) * 4, target);
        if (matches && !rightOpen) stack.push([x + 1, scanY]);
        rightOpen = matches;
      }
    }
  }
  context.putImageData(image, 0, 0);
  return true;
}

async function canvasPng(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("지도를 이미지로 만들 수 없습니다.");
  return new File([blob], "pixel-map.png", { type: "image/png" });
}

export function PixelMapEditor({
  campaignId,
  mapId,
  mapRevision,
  rasterRevision,
  hasRaster,
  countries,
  colorAssignments,
  borderRevision,
  initialBorderClassifications,
  initialBorderLayerColors: savedBorderLayerColors,
  rasterProjection = "EQUIRECTANGULAR",
  initialRelations = [],
}: {
  campaignId: string;
  mapId: string;
  mapRevision: number;
  rasterRevision: number;
  hasRaster: boolean;
  countries: Country[];
  colorAssignments: ColorAssignment[];
  borderRevision: number;
  initialBorderClassifications: BorderClassification[];
  initialBorderLayerColors?: Partial<Record<BorderLayerKind, string>>;
  rasterProjection?: MapProjection;
  initialRelations?: MapRelation[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const editLayerRef = useRef<HTMLDivElement>(null);
  const editTilesRef = useRef(new Map<string, EditTile>());
  const drawingRef = useRef(false);
  const dirtyRef = useRef(false);
  const zoomRef = useRef(100);
  const zoomAnchorRef = useRef<ZoomAnchor | null>(null);
  const lastPaintPointRef = useRef<MapPoint | null>(null);
  const queuedPaintPointRef = useRef<CanvasPoint | null>(null);
  const paintFrameRef = useRef<number | null>(null);
  const islandPointsRef = useRef<MapPoint[]>([]);
  const islandPolylineRef = useRef<SVGPolylineElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<Tool>("assign");
  const [paintColor, setPaintColor] = useState("#2F8CA3");
  const [brushSize, setBrushSize] = useState(8);
  const [zoom, setZoom] = useState(100);
  const [ready, setReady] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [dirty, setDirty] = useState(false);
  const [borderSettingsDirty, setBorderSettingsDirty] = useState(false);
  const [currentRasterRevision, setCurrentRasterRevision] = useState(rasterRevision);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [menu, setMenu] = useState<MenuState>(null);
  const [countryId, setCountryId] = useState(countries.at(0)?.id ?? "");
  const [territoryColor, setTerritoryColor] = useState(countries.at(0)?.color ?? "#5C6670");
  const [oceanColor, setOceanColor] = useState("#2F8CA3");
  const [islandPoints, setIslandPoints] = useState<MapPoint[]>([]);
  const [visibleBorderLayers, setVisibleBorderLayers] = useState<Record<BorderLayerKind, boolean>>({
    COAST: false,
    LEGAL: false,
    ACTIVE: false,
    INACTIVE: false,
    GUERRILLA: false,
  });
  const [borderLayerColors, setBorderLayerColors] = useState(() =>
    initialBorderLayerColors(initialBorderClassifications, savedBorderLayerColors),
  );
  const [borderSourceColor, setBorderSourceColor] = useState("#000000");
  const [borderKind, setBorderKind] = useState<BorderKind>("LEGAL");
  const [borderDisplayColor, setBorderDisplayColor] = useState(DEFAULT_BORDER_DISPLAY_COLORS.LEGAL);
  const [borderClassifications, setBorderClassifications] = useState(initialBorderClassifications);
  const [projection, setProjection] = useState<MapProjection>(rasterProjection);
  const [savedCountries, setSavedCountries] = useState(countries);
  const [countryDrafts, setCountryDrafts] = useState(() => toCountryDrafts(countries));
  const [diplomacyTargetId, setDiplomacyTargetId] = useState("");
  const [diplomacyStatus, setDiplomacyStatus] = useState<DiplomaticRelationStatus>("NORMAL");
  const [diplomacyReason, setDiplomacyReason] = useState("지도에서 외교 관계 변경");
  const [pickingDiplomacyTarget, setPickingDiplomacyTarget] = useState(false);
  const [diplomacyLink, setDiplomacyLink] = useState<{
    from: MapPoint;
    to: MapPoint | null;
  } | null>(null);
  const [mapGroupMode, setMapGroupMode] = useState<MapGroupMode | null>(null);
  const [mapGroupMembers, setMapGroupMembers] = useState<MapGroupMember[]>([]);
  const [blocName, setBlocName] = useState("");
  const [blocAcronym, setBlocAcronym] = useState("");
  const [blocColor, setBlocColor] = useState("#5D7388");
  const [blocDescription, setBlocDescription] = useState("");
  const [blocLeaderId, setBlocLeaderId] = useState("");
  const [relations] = useState(initialRelations);

  const editableCountries = useMemo(
    () =>
      savedCountries.map((country) => {
        const draft = countryDrafts[country.id];
        return draft ? { ...country, ...draft } : country;
      }),
    [savedCountries, countryDrafts],
  );
  const pendingCountryUpdates = useMemo(
    () =>
      savedCountries.flatMap((country) => {
        const draft = countryDrafts[country.id];
        if (!draft) return [];
        if (draft.name === country.name && draft.entityType === country.entityType) return [];
        return [{ countryId: country.id, name: draft.name, entityType: draft.entityType }];
      }),
    [savedCountries, countryDrafts],
  );
  const selectedDraft = countryId ? countryDrafts[countryId] : null;

  const assignedCountryByColor = useMemo(() => {
    const assignmentByColor = new Map(
      colorAssignments.map((assignment) => [
        assignment.colorHex.toUpperCase(),
        assignment.countryId,
      ]),
    );
    return new Map(
      [...assignmentByColor].map(([color, assignedCountryId]) => [
        color,
        editableCountries.find((country) => country.id === assignedCountryId),
      ]),
    );
  }, [colorAssignments, editableCountries]);
  const menuCountry = menu ? assignedCountryByColor.get(menu.colorHex.toUpperCase()) : null;
  const diplomacyTarget = diplomacyTargetId
    ? editableCountries.find((country) => country.id === diplomacyTargetId) ?? null
    : null;
  const menuCountryRelations = useMemo(() => {
    if (!menuCountry) return [];
    const nameById = new Map(editableCountries.map((country) => [country.id, country.name]));
    return relations
      .filter(
        (relation) =>
          relation.fromCountryId === menuCountry.id && relation.status !== "NORMAL",
      )
      .map((relation) => ({
        ...relation,
        counterpartName: nameById.get(relation.toCountryId) ?? "알 수 없음",
      }))
      .sort((a, b) => a.counterpartName.localeCompare(b.counterpartName, "ko"));
  }, [menuCountry, relations, editableCountries]);
  const menuWarRelations = menuCountryRelations.filter((relation) =>
    WAR_RELATION_STATUSES.has(relation.status),
  );
  const menuAllianceRelations = menuCountryRelations.filter((relation) =>
    ALLIANCE_RELATION_STATUSES.has(relation.status),
  );
  const menuOtherRelations = menuCountryRelations.filter(
    (relation) =>
      !WAR_RELATION_STATUSES.has(relation.status) &&
      !ALLIANCE_RELATION_STATUSES.has(relation.status),
  );
  const mapGroupIds = new Set(mapGroupMembers.map((member) => member.id));
  const pickingMapGroup = mapGroupMode !== null;
  const cleanMapUrl = useMemo(
    () => `/api/map/image?mapId=${encodeURIComponent(mapId)}&v=${rasterRevision}&borders=0`,
    [mapId, rasterRevision],
  );
  const borderOverlayUrl = useMemo(() => {
    const layers = BORDER_LAYER_ORDER.filter((kind) => visibleBorderLayers[kind]);
    if (!borderRevision || !layers.length) return null;
    const params = new URLSearchParams({
      mapId,
      v: String(borderRevision),
      layers: layers.join(","),
    });
    for (const kind of BORDER_LAYER_ORDER) {
      params.set(`color-${kind.toLowerCase()}`, borderLayerColors[kind].slice(1));
    }
    return `/api/map/borders?${params.toString()}`;
  }, [borderLayerColors, borderRevision, mapId, visibleBorderLayers]);

  function markDirty() {
    if (dirtyRef.current) return;
    dirtyRef.current = true;
    setDirty(true);
  }

  function clearEditTiles() {
    editTilesRef.current.clear();
    editLayerRef.current?.replaceChildren();
  }

  function editTileAt(column: number, row: number) {
    const key = `${column}:${row}`;
    const existing = editTilesRef.current.get(key);
    if (existing) return existing;
    const source = canvasRef.current;
    const layer = editLayerRef.current;
    if (!source || !layer) return null;
    const x = column * EDIT_TILE_SIZE;
    const y = row * EDIT_TILE_SIZE;
    const width = Math.min(EDIT_TILE_SIZE, source.width - x);
    const height = Math.min(EDIT_TILE_SIZE, source.height - y);
    if (width <= 0 || height <= 0) return null;
    const canvas = document.createElement("canvas");
    canvas.className = "pixel-map-edit-tile";
    canvas.width = width;
    canvas.height = height;
    canvas.style.left = `${(x / source.width) * 100}%`;
    canvas.style.top = `${(y / source.height) * 100}%`;
    canvas.style.width = `${(width / source.width) * 100}%`;
    canvas.style.height = `${(height / source.height) * 100}%`;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.imageSmoothingEnabled = false;
    context.drawImage(source, x, y, width, height, 0, 0, width, height);
    const tile = { canvas, context, x, y, width, height };
    editTilesRef.current.set(key, tile);
    layer.append(canvas);
    return tile;
  }

  function paintEditSquare(point: MapPoint, size: number, erase: boolean) {
    const source = canvasRef.current;
    if (!source) return;
    const left = Math.floor(point.x - size / 2);
    const top = Math.floor(point.y - size / 2);
    const clippedLeft = Math.max(0, left);
    const clippedTop = Math.max(0, top);
    const clippedRight = Math.min(source.width, left + size);
    const clippedBottom = Math.min(source.height, top + size);
    if (clippedRight <= clippedLeft || clippedBottom <= clippedTop) return;
    const firstColumn = Math.floor(clippedLeft / EDIT_TILE_SIZE);
    const lastColumn = Math.floor((clippedRight - 1) / EDIT_TILE_SIZE);
    const firstRow = Math.floor(clippedTop / EDIT_TILE_SIZE);
    const lastRow = Math.floor((clippedBottom - 1) / EDIT_TILE_SIZE);
    for (let row = firstRow; row <= lastRow; row += 1) {
      for (let column = firstColumn; column <= lastColumn; column += 1) {
        const tile = editTileAt(column, row);
        if (!tile) continue;
        const localLeft = left - tile.x;
        const localTop = top - tile.y;
        if (erase) tile.context.clearRect(localLeft, localTop, size, size);
        else {
          tile.context.fillStyle = paintColor;
          tile.context.fillRect(localLeft, localTop, size, size);
        }
      }
    }
  }

  function commitEditTiles() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !context || !editTilesRef.current.size) return;
    for (const tile of editTilesRef.current.values()) {
      context.clearRect(tile.x, tile.y, tile.width, tile.height);
      context.drawImage(tile.canvas, tile.x, tile.y);
    }
    clearEditTiles();
  }

  function clearIslandSelection() {
    islandPointsRef.current = [];
    if (islandPolylineRef.current) islandPolylineRef.current.setAttribute("points", "");
    setIslandPoints([]);
  }

  const loadCanvas = useCallback(() => {
    if (!hasRaster || !canvasRef.current) return;
    setReady(false);
    const image = new Image();
    image.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      setCanvasSize({ width: image.naturalWidth, height: image.naturalHeight });
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      context.imageSmoothingEnabled = false;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      clearEditTiles();
      clearIslandSelection();
      setReady(true);
      dirtyRef.current = false;
      setDirty(false);
    };
    image.src = `/api/map/image?mapId=${encodeURIComponent(mapId)}&v=${rasterRevision}&borders=0`;
  }, [hasRaster, mapId, rasterRevision]);

  useEffect(() => {
    loadCanvas();
  }, [loadCanvas]);

  useLayoutEffect(() => {
    const node = menuRef.current;
    if (!menu || !node) return;
    const margin = 10;
    const rect = node.getBoundingClientRect();
    let left = menu.clientX + 12;
    let top = menu.clientY + 12;
    if (left + rect.width > window.innerWidth - margin) {
      left = Math.max(margin, menu.clientX - rect.width - 12);
    }
    if (top + rect.height > window.innerHeight - margin) {
      top = Math.max(margin, menu.clientY - rect.height - 12);
    }
    if (left < margin) left = margin;
    if (top < margin) top = margin;
    node.style.left = `${left}px`;
    node.style.top = `${top}px`;
  }, [menu, pickingDiplomacyTarget, diplomacyTargetId]);

  async function saveCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error("지도를 저장할 수 없습니다.");
    commitEditTiles();
    const file = await canvasPng(canvas);
    const formData = new FormData();
    formData.set("campaignId", campaignId);
    formData.set("mapId", mapId);
    formData.set("mode", "save");
    formData.set("file", file);
    const response = await fetch("/api/admin/map/raster", { method: "POST", body: formData });
    const result = (await response.json()) as { error?: string; revision?: number };
    if (!response.ok) throw new Error(result.error ?? "지도를 저장할 수 없습니다.");
    dirtyRef.current = false;
    setDirty(false);
    return result.revision ?? rasterRevision;
  }

  function sampledColor(point: MapPoint) {
    const column = Math.floor(point.x / EDIT_TILE_SIZE);
    const row = Math.floor(point.y / EDIT_TILE_SIZE);
    const tile = editTilesRef.current.get(`${column}:${row}`);
    if (tile) {
      const pixel = tile.context.getImageData(point.x - tile.x, point.y - tile.y, 1, 1).data;
      if (pixel[3] < 128) return null;
      return quantizedHex(pixel[0], pixel[1], pixel[2]);
    }
    const context = canvasRef.current?.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    const pixel = context.getImageData(point.x, point.y, 1, 1).data;
    if (pixel[3] < 128) return null;
    return quantizedHex(pixel[0], pixel[1], pixel[2]);
  }

  function changeZoom(nextZoom: number, clientX?: number, clientY?: number) {
    const viewport = viewportRef.current;
    const canvasWrap = canvasWrapRef.current;
    const normalized = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
    if (normalized === zoomRef.current) return;
    zoomRef.current = normalized;
    if (!viewport || !canvasWrap) {
      setZoom(normalized);
      return;
    }
    const viewportBounds = viewport.getBoundingClientRect();
    const mapBounds = canvasWrap.getBoundingClientRect();
    const anchorClientX = clientX ?? viewportBounds.left + viewport.clientWidth / 2;
    const anchorClientY = clientY ?? viewportBounds.top + viewport.clientHeight / 2;
    zoomAnchorRef.current = {
      clientX: anchorClientX,
      clientY: anchorClientY,
      mapX: Math.max(0, Math.min(1, (anchorClientX - mapBounds.left) / mapBounds.width)),
      mapY: Math.max(0, Math.min(1, (anchorClientY - mapBounds.top) / mapBounds.height)),
    };
    setZoom(normalized);
  }

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const canvasWrap = canvasWrapRef.current;
    const anchor = zoomAnchorRef.current;
    if (!viewport || !canvasWrap || !anchor) return;
    const mapBounds = canvasWrap.getBoundingClientRect();
    viewport.scrollLeft += mapBounds.left + anchor.mapX * mapBounds.width - anchor.clientX;
    viewport.scrollTop += mapBounds.top + anchor.mapY * mapBounds.height - anchor.clientY;
    zoomAnchorRef.current = null;
  }, [zoom]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const handleWheel = (event: WheelEvent) => {
      const nextZoom = zoomRef.current + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
      const normalized = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
      if (normalized === zoomRef.current) return;
      event.preventDefault();
      changeZoom(normalized, event.clientX, event.clientY);
    };
    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  });

  useEffect(
    () => () => {
      if (paintFrameRef.current !== null) window.cancelAnimationFrame(paintFrameRef.current);
    },
    [],
  );

  function pushIslandPoint(point: MapPoint) {
    const previous = lastPaintPointRef.current;
    const additions = previous
      ? interpolateRasterPoints(previous, point, Math.max(1, brushSize / 3))
      : [point];
    lastPaintPointRef.current = point;
    islandPointsRef.current = [...islandPointsRef.current, ...additions].slice(-5000);
    islandPolylineRef.current?.setAttribute(
      "points",
      islandPointsRef.current.map((current) => `${current.x},${current.y}`).join(" "),
    );
  }

  function paint(point: CanvasPoint) {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !context) return;
    if (tool === "assign") {
      const colorHex = sampledColor(point);
      if (!colorHex) return;
      if (
        borderClassifications.some(
          (classification) => classification.sourceColor.toUpperCase() === colorHex,
        )
      ) {
        setMessage("등록된 국경색은 영토로 할당할 수 없습니다.");
        if (!pickingDiplomacyTarget && !pickingMapGroup) setMenu(null);
        return;
      }
      const assignedCountry = assignedCountryByColor.get(colorHex);
      if (!assignedCountry) {
        setMessage("이 색상에는 등록된 국가가 없습니다. 지도를 다시 업로드해 자동 등록하세요.");
        if (!pickingDiplomacyTarget && !pickingMapGroup) setMenu(null);
        return;
      }
      if (mapGroupMode) {
        if (assignedCountry.entityType === "GUERRILLA_GROUP") {
          setMessage("게릴라 단체는 이 선택에 포함할 수 없습니다.");
          return;
        }
        const meta = MAP_GROUP_META[mapGroupMode];
        const removing = mapGroupIds.has(assignedCountry.id);
        setMapGroupMembers((current) => {
          if (removing) return current.filter((member) => member.id !== assignedCountry.id);
          return [
            ...current,
            {
              id: assignedCountry.id,
              name: assignedCountry.name,
              point: { x: point.x, y: point.y },
            },
          ];
        });
        setBlocLeaderId((current) => {
          if (removing) {
            if (current !== assignedCountry.id) return current;
            const remaining = mapGroupMembers.filter((member) => member.id !== assignedCountry.id);
            return remaining.at(0)?.id ?? "";
          }
          return current || assignedCountry.id;
        });
        setMessage(
          removing
            ? `${assignedCountry.name}을(를) ${meta.label}에서 뺐습니다.`
            : `${assignedCountry.name}을(를) ${meta.label}에 추가했습니다.`,
        );
        return;
      }
      if (pickingDiplomacyTarget && menuCountry) {
        if (assignedCountry.id === menuCountry.id) {
          setMessage("다른 국가를 지도에서 선택하세요.");
          return;
        }
        setDiplomacyTargetId(assignedCountry.id);
        setDiplomacyLink((current) =>
          current ? { ...current, to: { x: point.x, y: point.y } } : null,
        );
        const hasGuerrilla =
          menuCountry.entityType === "GUERRILLA_GROUP" ||
          assignedCountry.entityType === "GUERRILLA_GROUP";
        setDiplomacyStatus(hasGuerrilla ? "GUERRILLA" : "NORMAL");
        setPickingDiplomacyTarget(false);
        setMessage(`${assignedCountry.name}을(를) 상대국으로 연결했습니다.`);
        return;
      }
      selectCountryForEdit(assignedCountry.id);
      setDiplomacyTargetId("");
      setPickingDiplomacyTarget(false);
      setDiplomacyLink({ from: { x: point.x, y: point.y }, to: null });
      setMenu({
        colorHex,
        x: point.x,
        y: point.y,
        clientX: point.clientX,
        clientY: point.clientY,
      });
      setMessage("");
      return;
    }
    if (tool === "border") {
      const colorHex = sampledColor(point);
      if (!colorHex) return;
      setBorderSourceColor(colorHex);
      setMessage(`원본 국경색 ${colorHex} 선택`);
      return;
    }
    if (tool === "island") {
      pushIslandPoint(point);
      return;
    }
    if (tool === "fill") {
      commitEditTiles();
      if (floodFill(context, point.x, point.y, rgba(paintColor))) markDirty();
      return;
    }
    const size = Math.max(1, Math.round(brushSize));
    const previous = lastPaintPointRef.current;
    const points = previous
      ? interpolateRasterPoints(previous, point, Math.max(1, size / 3))
      : [point];
    for (const current of points) {
      paintEditSquare(current, size, tool === "erase");
    }
    lastPaintPointRef.current = point;
    markDirty();
  }

  function queuePaint(point: CanvasPoint) {
    queuedPaintPointRef.current = point;
    if (paintFrameRef.current !== null) return;
    paintFrameRef.current = window.requestAnimationFrame(() => {
      paintFrameRef.current = null;
      const queuedPoint = queuedPaintPointRef.current;
      queuedPaintPointRef.current = null;
      if (drawingRef.current && queuedPoint) paint(queuedPoint);
    });
  }

  function flushQueuedPaint() {
    if (paintFrameRef.current !== null) window.cancelAnimationFrame(paintFrameRef.current);
    paintFrameRef.current = null;
    const queuedPoint = queuedPaintPointRef.current;
    queuedPaintPointRef.current = null;
    if (queuedPoint) paint(queuedPoint);
  }

  function cancelQueuedPaint() {
    if (paintFrameRef.current !== null) window.cancelAnimationFrame(paintFrameRef.current);
    paintFrameRef.current = null;
    queuedPaintPointRef.current = null;
  }

  async function upload(formData: FormData) {
    setBusy(true);
    setMessage("");
    formData.set("campaignId", campaignId);
    formData.set("mapId", mapId);
    try {
      const response = await fetch("/api/admin/map/raster", { method: "POST", body: formData });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "업로드하지 못했습니다.");
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "업로드하지 못했습니다.");
      setBusy(false);
    }
  }

  async function saveProjection() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/map/projection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, mapId, projection }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "투영을 적용하지 못했습니다.");
      setMessage(`평면 투영을 ${MAP_PROJECTION_LABELS[projection]}으로 적용했습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "투영을 적용하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const revision = await saveCanvas();
      setCurrentRasterRevision(revision);
      setMessage("평면 지도를 저장했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function assignTerritory(mode: "COLOR" | "REGION" | "ISLAND") {
    const seed = mode === "ISLAND" ? islandPoints.at(0) : menu;
    if (!seed || !countryId) return;
    const targetColor = mode === "COLOR" && menu ? menu.colorHex : territoryColor;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/map/territory-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          mapId,
          countryId,
          mode,
          x: seed.x,
          y: seed.y,
          territoryColor: targetColor,
          oceanColor,
          brushRadius: brushSize,
          points: mode === "ISLAND" ? islandPoints : [],
          expectedMapRevision: mapRevision,
          expectedRasterRevision: currentRasterRevision,
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        changedPixels?: number;
        changedCells?: number;
      };
      if (!response.ok) throw new Error(result.error ?? "영토를 할당하지 못했습니다.");
      setMessage(
        `영토 픽셀 ${result.changedPixels?.toLocaleString("ko-KR") ?? 0}개를 할당했습니다.`,
      );
      setMenu(null);
      clearIslandSelection();
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "영토를 할당하지 못했습니다.");
      setBusy(false);
    }
  }

  function selectCountryForEdit(nextId: string) {
    setCountryId(nextId);
    const country = editableCountries.find((item) => item.id === nextId);
    if (country) setTerritoryColor(country.color);
  }

  function patchCountryDraft(nextId: string, patch: Partial<CountryDraft>) {
    setCountryDrafts((current) => {
      const previous = current[nextId] ?? {
        name: savedCountries.find((country) => country.id === nextId)?.name ?? "",
        entityType:
          savedCountries.find((country) => country.id === nextId)?.entityType ?? "STATE",
      };
      return {
        ...current,
        [nextId]: {
          name: patch.name ?? previous.name,
          entityType: patch.entityType ?? previous.entityType,
        },
      };
    });
  }

  async function saveCountryDrafts() {
    if (!pendingCountryUpdates.length) return;
    if (pendingCountryUpdates.some((update) => !update.name.trim())) {
      setMessage("국명이 비어 있는 국가가 있습니다.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/map/country", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          mapId,
          updates: pendingCountryUpdates,
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        countries?: { id: string; name: string; entityType: CountryEntityType }[];
      };
      if (!response.ok) throw new Error(result.error ?? "국가 정보를 변경하지 못했습니다.");
      const savedById = new Map((result.countries ?? []).map((country) => [country.id, country]));
      setSavedCountries((current) =>
        current.map((country) => {
          const saved = savedById.get(country.id);
          return saved
            ? { ...country, name: saved.name, entityType: saved.entityType }
            : country;
        }),
      );
      setCountryDrafts((current) => {
        const next = { ...current };
        for (const saved of result.countries ?? []) {
          next[saved.id] = { name: saved.name, entityType: saved.entityType };
        }
        return next;
      });
      setMessage(`국명·국체 ${pendingCountryUpdates.length}개국을 저장했습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "국가 정보를 변경하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function updateMapDiplomacy() {
    if (!menuCountry || !diplomacyTargetId) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/map/diplomacy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          fromCountryId: menuCountry.id,
          toCountryId: diplomacyTargetId,
          status: diplomacyStatus,
          reason: diplomacyReason,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "외교 관계를 변경하지 못했습니다.");
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "외교 관계를 변경하지 못했습니다.");
      setBusy(false);
    }
  }

  async function applyCountryDiplomacyAction(
    action: CountryDiplomacyAction,
    counterpartId?: string,
  ) {
    if (!menuCountry) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/map/diplomacy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "COUNTRY_ACTION",
          campaignId,
          countryId: menuCountry.id,
          action,
          counterpartId,
          reason: diplomacyReason,
        }),
      });
      const result = (await response.json()) as { error?: string; updatedPairs?: number };
      if (!response.ok) throw new Error(result.error ?? "외교 관계를 변경하지 못했습니다.");
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "외교 관계를 변경하지 못했습니다.");
      setBusy(false);
    }
  }

  function clearMapGroup() {
    setMapGroupMode(null);
    setMapGroupMembers([]);
    setBlocName("");
    setBlocAcronym("");
    setBlocColor("#5D7388");
    setBlocDescription("");
    setBlocLeaderId("");
  }

  function startMapGroup(mode: MapGroupMode) {
    setPickingDiplomacyTarget(false);
    if (mapGroupMode === mode) {
      setMapGroupMode(null);
      setMessage(`${MAP_GROUP_META[mode].label} 선택을 종료했습니다.`);
      return;
    }
    setMapGroupMode(mode);
    setMessage(
      `지도에서 ${MAP_GROUP_META[mode].label} 대상국을 클릭하세요. 다시 클릭하면 제외됩니다.`,
    );
  }

  async function applyMapGroup() {
    if (!mapGroupMode || mapGroupMembers.length < 2) return;
    if (mapGroupMode === "CREATE_BLOC") {
      if (!blocName.trim() || !blocAcronym.trim() || !blocLeaderId) {
        setMessage("세력 명칭·약칭·주도국을 입력하세요.");
        return;
      }
    }
    setBusy(true);
    setMessage("");
    try {
      const body =
        mapGroupMode === "CREATE_BLOC"
          ? {
              mode: "CREATE_BLOC",
              campaignId,
              countryIds: mapGroupMembers.map((member) => member.id),
              leaderCountryId: blocLeaderId,
              name: blocName.trim(),
              acronym: blocAcronym.trim(),
              color: blocColor,
              description: blocDescription.trim(),
            }
          : {
              mode: mapGroupMode,
              campaignId,
              countryIds: mapGroupMembers.map((member) => member.id),
            };
      const response = await fetch("/api/admin/map/diplomacy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as {
        error?: string;
        countryCount?: number;
        pairCount?: number;
        name?: string;
      };
      if (!response.ok) {
        throw new Error(
          result.error ??
            `${MAP_GROUP_META[mapGroupMode].label}을(를) 적용하지 못했습니다.`,
        );
      }
      const appliedMode = mapGroupMode;
      const appliedName = blocName;
      clearMapGroup();
      setMessage(
        appliedMode === "CREATE_BLOC"
          ? `세력 창설: ${result.name ?? appliedName} · ${result.countryCount ?? 0}개국`
          : `${MAP_GROUP_META[appliedMode].label} 적용: ${result.countryCount ?? 0}개국 · ${result.pairCount ?? 0}개 관계`,
      );
      window.location.reload();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "집단 외교를 적용하지 못했습니다.",
      );
      setBusy(false);
    }
  }

  function updateBorderLayerColor(layer: BorderLayerKind, color: string) {
    const displayColor = color.toUpperCase();
    setBorderSettingsDirty(true);
    setBorderLayerColors((current) => ({ ...current, [layer]: displayColor }));
    setBorderClassifications((current) =>
      current.map((classification) =>
        borderLayerKind(classification.kind) === layer
          ? { ...classification, displayColor }
          : classification,
      ),
    );
  }

  function addBorderClassification() {
    const displayColor = borderKind === "NONE" ? "#000000" : borderDisplayColor.toUpperCase();
    const layer = borderLayerKind(borderKind);
    if (layer) updateBorderLayerColor(layer, displayColor);
    setBorderClassifications((current) => [
      ...current.filter(
        (classification) =>
          classification.sourceColor.toUpperCase() !== borderSourceColor.toUpperCase(),
      ),
      {
        sourceColor: borderSourceColor.toUpperCase(),
        kind: borderKind,
        displayColor,
      },
    ]);
    setBorderSettingsDirty(true);
  }

  async function saveBorderClassifications() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/map/borders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          mapId,
          expectedRasterRevision: currentRasterRevision,
          classifications: borderClassifications,
          layerColors: borderLayerColors,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "국경 분류를 저장하지 못했습니다.");
      setBorderSettingsDirty(false);
      setMessage("업로드된 국경색 분류를 저장했습니다.");
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "국경 분류를 저장하지 못했습니다.");
      setBusy(false);
    }
  }

  return (
    <div className="pixel-map-shell">
      <div className="pixel-map-toolbar" role="toolbar">
        {(Object.keys(TOOL_LABELS) as Tool[]).map((value) => (
          <button
            type="button"
            key={value}
            className={tool === value ? "active" : "button secondary"}
            onClick={() => {
              setTool(value);
              setMenu(null);
              setPickingDiplomacyTarget(false);
              setDiplomacyLink(null);
              setDiplomacyTargetId("");
              clearMapGroup();
              if (value !== "island") clearIslandSelection();
            }}
          >
            {TOOL_LABELS[value]}
          </button>
        ))}
        <label className="pixel-color-control">
          <span>색상</span>
          <input
            type="color"
            value={paintColor}
            onChange={(event) => setPaintColor(event.target.value)}
          />
        </label>
        <label className="pixel-brush-control">
          <span>크기</span>
          <input
            type="range"
            min="1"
            max="128"
            value={brushSize}
            onChange={(event) => setBrushSize(Number(event.target.value))}
          />
          <output>{brushSize}px</output>
        </label>
        <div className="pixel-map-zoom" role="group" aria-label="지도 확대 축소">
          <button
            type="button"
            className="button secondary"
            aria-label="축소"
            disabled={zoom <= MIN_ZOOM}
            onClick={() => changeZoom(zoom - ZOOM_STEP)}
          >
            −
          </button>
          <output>{zoom}%</output>
          <button
            type="button"
            className="button secondary"
            aria-label="확대"
            disabled={zoom >= MAX_ZOOM}
            onClick={() => changeZoom(zoom + ZOOM_STEP)}
          >
            +
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={zoom === 100}
            onClick={() => changeZoom(100)}
          >
            맞춤
          </button>
        </div>
        <button type="button" disabled={!ready || !dirty || busy} onClick={() => void save()}>
          {busy ? "저장 중..." : "지도 저장"}
        </button>
      </div>

      <section className="pixel-border-display-panel" aria-label="지도 선 표시">
        {BORDER_LAYER_ORDER.map((layer) => (
          <div className="pixel-border-display-control" key={layer}>
            <label className="map-border-toggle">
              <input
                type="checkbox"
                checked={visibleBorderLayers[layer]}
                disabled={dirty}
                onChange={(event) =>
                  setVisibleBorderLayers((current) => ({
                    ...current,
                    [layer]: event.target.checked,
                  }))
                }
              />
              {BORDER_LAYER_LABELS[layer]}
            </label>
            <input
              type="color"
              value={borderLayerColors[layer]}
              disabled={dirty}
              aria-label={`${BORDER_LAYER_LABELS[layer]} 색상`}
              onInput={(event) => updateBorderLayerColor(layer, event.currentTarget.value)}
            />
          </div>
        ))}
        <button
          type="button"
          className="secondary"
          disabled={!borderSettingsDirty || busy || dirty}
          onClick={() => void saveBorderClassifications()}
        >
          국경색 저장
        </button>
      </section>

      <section className="pixel-country-edit-panel" aria-label="국명 및 국체 편집">
        <strong>국명·국체</strong>
        <label>
          국가
          <select
            value={countryId}
            onChange={(event) => selectCountryForEdit(event.target.value)}
          >
            {editableCountries.map((country) => (
              <option value={country.id} key={country.id}>
                {country.name}
                {pendingCountryUpdates.some((update) => update.countryId === country.id)
                  ? " · 수정됨"
                  : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          국명
          <input
            value={selectedDraft?.name ?? ""}
            maxLength={80}
            disabled={!countryId}
            onChange={(event) => patchCountryDraft(countryId, { name: event.target.value })}
          />
        </label>
        <label>
          국체
          <select
            value={selectedDraft?.entityType ?? "STATE"}
            disabled={!countryId}
            onChange={(event) =>
              patchCountryDraft(countryId, {
                entityType: event.target.value as CountryEntityType,
              })
            }
          >
            {Object.entries(COUNTRY_ENTITY_TYPE_LABELS).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={busy || pendingCountryUpdates.length === 0}
          onClick={() => void saveCountryDrafts()}
        >
          {pendingCountryUpdates.length
            ? `일괄 저장 (${pendingCountryUpdates.length})`
            : "일괄 저장"}
        </button>
      </section>

      <section className="pixel-map-group-panel" aria-label="집단 외교">
        <strong>집단 외교</strong>
        {(["MUTUAL_WAR", "MUTUAL_ALLIANCE", "CREATE_BLOC"] as MapGroupMode[]).map((mode) => (
          <button
            type="button"
            key={mode}
            className={mapGroupMode === mode ? "active" : "secondary"}
            onClick={() => startMapGroup(mode)}
          >
            {mapGroupMode === mode ? `${MAP_GROUP_META[mode].label} 선택 중` : MAP_GROUP_META[mode].label}
          </button>
        ))}
        <button
          type="button"
          className="secondary"
          disabled={!mapGroupMembers.length && !mapGroupMode}
          onClick={() => {
            clearMapGroup();
            setMessage("집단 외교 선택을 비웠습니다.");
          }}
        >
          선택 비우기
        </button>
        <button
          type="button"
          disabled={busy || !mapGroupMode || mapGroupMembers.length < 2}
          onClick={() => void applyMapGroup()}
        >
          {mapGroupMode && mapGroupMembers.length >= 2
            ? `${MAP_GROUP_META[mapGroupMode].applyLabel} (${mapGroupMembers.length})`
            : "적용"}
        </button>
        {mapGroupMode === "CREATE_BLOC" && (
          <div className="pixel-bloc-fields">
            <label>
              세력명
              <input
                value={blocName}
                maxLength={80}
                onChange={(event) => setBlocName(event.target.value)}
              />
            </label>
            <label>
              약칭
              <input
                value={blocAcronym}
                maxLength={12}
                onChange={(event) => setBlocAcronym(event.target.value)}
              />
            </label>
            <label>
              색상
              <input
                type="color"
                value={blocColor}
                onChange={(event) => setBlocColor(event.target.value)}
              />
            </label>
            <label>
              주도국
              <select
                value={blocLeaderId}
                onChange={(event) => setBlocLeaderId(event.target.value)}
              >
                {mapGroupMembers.map((member) => (
                  <option value={member.id} key={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="wide">
              설명
              <input
                value={blocDescription}
                maxLength={500}
                onChange={(event) => setBlocDescription(event.target.value)}
              />
            </label>
          </div>
        )}
        {mapGroupMembers.length > 0 && (
          <div className="pixel-map-group-list">
            {mapGroupMembers.map((member) => (
              <button
                type="button"
                className="secondary"
                key={member.id}
                onClick={() => {
                  setMapGroupMembers((current) =>
                    current.filter((item) => item.id !== member.id),
                  );
                  setBlocLeaderId((current) =>
                    current === member.id
                      ? mapGroupMembers.find((item) => item.id !== member.id)?.id ?? ""
                      : current,
                  );
                }}
              >
                {member.name}
                {blocLeaderId === member.id && mapGroupMode === "CREATE_BLOC" ? " · 주도" : ""} ×
              </button>
            ))}
          </div>
        )}
      </section>

      {tool === "island" && (
        <section className="pixel-tool-panel">
          <label>
            국가
            <select
              value={countryId}
              onChange={(event) => selectCountryForEdit(event.target.value)}
            >
              {editableCountries.map((country) => (
                <option value={country.id} key={country.id}>
                  {country.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            영토색
            <input
              type="color"
              value={territoryColor}
              onChange={(event) => setTerritoryColor(event.target.value)}
            />
          </label>
          <label>
            바다·해안색
            <input
              type="color"
              value={oceanColor}
              onChange={(event) => setOceanColor(event.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={!islandPoints.length || busy}
            onClick={() => void assignTerritory("ISLAND")}
          >
            선택한 섬 할당
          </button>
          <button type="button" className="secondary" onClick={clearIslandSelection}>
            선택 지우기
          </button>
        </section>
      )}

      {tool === "border" && (
        <section className="pixel-border-panel">
          <div className="pixel-border-config">
            <label>
              원본 국경색
              <input
                type="color"
                value={borderSourceColor}
                onChange={(event) => setBorderSourceColor(event.target.value)}
              />
            </label>
            <label>
              분류
              <select
                value={borderKind}
                onChange={(event) => {
                  const next = event.target.value as BorderKind;
                  setBorderKind(next);
                  const layer = borderLayerKind(next);
                  if (layer) setBorderDisplayColor(borderLayerColors[layer]);
                }}
              >
                {Object.entries(BORDER_KIND_LABELS).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              표시색
              <input
                type="color"
                value={borderDisplayColor}
                disabled={borderKind === "NONE"}
                onChange={(event) => setBorderDisplayColor(event.target.value)}
              />
            </label>
            <button type="button" onClick={addBorderClassification}>
              분류 추가
            </button>
          </div>
          <div className="pixel-border-list">
            {borderClassifications.map((classification) => (
              <div key={classification.sourceColor}>
                <i style={{ background: classification.sourceColor }} />
                <span>{classification.sourceColor}</span>
                <strong>{BORDER_KIND_LABELS[classification.kind]}</strong>
                {classification.kind !== "NONE" && (
                  <i style={{ background: classification.displayColor }} />
                )}
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setBorderSettingsDirty(true);
                    setBorderClassifications((current) =>
                      current.filter((row) => row.sourceColor !== classification.sourceColor),
                    );
                  }}
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            disabled={!borderSettingsDirty || busy || dirty}
            onClick={() => void saveBorderClassifications()}
          >
            국경 분류 저장
          </button>
        </section>
      )}

      {hasRaster ? (
        <div ref={viewportRef} className="pixel-map-viewport">
          <div
            ref={canvasWrapRef}
            className="pixel-map-canvas-wrap"
            style={{
              width: `${zoom}%`,
              minWidth: `${Math.round((720 * zoom) / 100)}px`,
              marginInline: zoom <= 100 ? "auto" : 0,
            }}
          >
            <canvas
              ref={canvasRef}
              className="pixel-map-canvas"
              aria-label="픽셀 지도 편집기"
              onPointerDown={(event) => {
                if (!ready || busy) return;
                drawingRef.current = true;
                lastPaintPointRef.current = null;
                event.currentTarget.setPointerCapture(event.pointerId);
                paint(canvasPoint(event.currentTarget, event));
              }}
              onPointerMove={(event) => {
                if (!drawingRef.current || !["pencil", "erase", "island"].includes(tool)) return;
                queuePaint(canvasPoint(event.currentTarget, event));
              }}
              onPointerUp={(event) => {
                flushQueuedPaint();
                drawingRef.current = false;
                lastPaintPointRef.current = null;
                if (tool === "island") setIslandPoints([...islandPointsRef.current]);
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={() => {
                cancelQueuedPaint();
                drawingRef.current = false;
                lastPaintPointRef.current = null;
                if (tool === "island") setIslandPoints([...islandPointsRef.current]);
              }}
            />
            {!dirty && canvasSize.width > 0 && (
              <NextImage
                className="pixel-map-clean-overlay"
                src={cleanMapUrl}
                alt=""
                width={canvasSize.width}
                height={canvasSize.height}
                unoptimized
                draggable={false}
              />
            )}
            {!dirty && borderOverlayUrl && (
              <NextImage
                className="pixel-border-overlay"
                src={borderOverlayUrl}
                alt=""
                width={canvasSize.width || 1}
                height={canvasSize.height || 1}
                unoptimized
                draggable={false}
              />
            )}
            <div ref={editLayerRef} className="pixel-map-edit-layer" aria-hidden="true" />
            {tool === "island" && canvasSize.width > 0 && (
              <svg
                className="pixel-selection-overlay"
                viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
                aria-hidden="true"
              >
                <polyline
                  ref={islandPolylineRef}
                  points={islandPoints.map((point) => `${point.x},${point.y}`).join(" ")}
                  fill="none"
                  stroke={territoryColor}
                  strokeWidth={brushSize * 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.62"
                />
              </svg>
            )}
            {diplomacyLink && canvasSize.width > 0 && (
              <svg
                className="pixel-diplomacy-link"
                viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
                aria-hidden="true"
              >
                <circle
                  cx={diplomacyLink.from.x}
                  cy={diplomacyLink.from.y}
                  r={Math.max(4, brushSize / 2)}
                  fill="rgba(0, 169, 196, 0.85)"
                />
                {diplomacyLink.to && (
                  <>
                    <line
                      x1={diplomacyLink.from.x}
                      y1={diplomacyLink.from.y}
                      x2={diplomacyLink.to.x}
                      y2={diplomacyLink.to.y}
                      stroke="rgba(0, 169, 196, 0.9)"
                      strokeWidth={Math.max(2, brushSize / 4)}
                      strokeDasharray="8 6"
                    />
                    <circle
                      cx={diplomacyLink.to.x}
                      cy={diplomacyLink.to.y}
                      r={Math.max(4, brushSize / 2)}
                      fill="rgba(217, 67, 105, 0.9)"
                    />
                  </>
                )}
              </svg>
            )}
            {mapGroupMembers.length > 0 && canvasSize.width > 0 && (
              <svg
                className="pixel-map-group-link"
                viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
                aria-hidden="true"
              >
                {mapGroupMembers.flatMap((from, index) =>
                  mapGroupMembers.slice(index + 1).map((to) => (
                    <line
                      key={`${from.id}-${to.id}`}
                      x1={from.point.x}
                      y1={from.point.y}
                      x2={to.point.x}
                      y2={to.point.y}
                      stroke={
                        mapGroupMode
                          ? MAP_GROUP_META[mapGroupMode].accent
                          : "rgba(217, 67, 105, 0.85)"
                      }
                      strokeWidth={Math.max(2, brushSize / 4)}
                      strokeDasharray="6 5"
                    />
                  )),
                )}
                {mapGroupMembers.map((member) => (
                  <circle
                    key={member.id}
                    cx={member.point.x}
                    cy={member.point.y}
                    r={Math.max(5, brushSize / 2)}
                    fill={
                      mapGroupMode
                        ? MAP_GROUP_META[mapGroupMode].accent
                        : "rgba(217, 67, 105, 0.95)"
                    }
                  />
                ))}
              </svg>
            )}
            {menu && (
              <div
                ref={menuRef}
                className="pixel-map-menu panel"
                style={{ left: menu.clientX, top: menu.clientY }}
              >
                <button
                  type="button"
                  className="pixel-menu-close"
                  aria-label="닫기"
                  onClick={() => {
                    setMenu(null);
                    setPickingDiplomacyTarget(false);
                    setDiplomacyLink(null);
                    setDiplomacyTargetId("");
                  }}
                >
                  ×
                </button>
                <div className="pixel-picked-color">
                  <i style={{ background: menu.colorHex }} />
                  <strong>{menu.colorHex}</strong>
                </div>
                {menuCountry && (
                  <>
                    <label>
                      국명
                      <input
                        value={countryDrafts[menuCountry.id]?.name ?? menuCountry.name}
                        maxLength={80}
                        onChange={(event) =>
                          patchCountryDraft(menuCountry.id, { name: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      국체
                      <select
                        value={countryDrafts[menuCountry.id]?.entityType ?? menuCountry.entityType}
                        onChange={(event) =>
                          patchCountryDraft(menuCountry.id, {
                            entityType: event.target.value as CountryEntityType,
                          })
                        }
                      >
                        {Object.entries(COUNTRY_ENTITY_TYPE_LABELS).map(([value, label]) => (
                          <option value={value} key={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="inline-actions">
                      <Link
                        className="button secondary"
                        href={`/admin/economy?country=${menuCountry.id}`}
                      >
                        경제
                      </Link>
                      <Link
                        className="button secondary"
                        href={`/admin/politics?country=${menuCountry.id}`}
                      >
                        정치
                      </Link>
                    </div>
                    <div className="pixel-map-diplomacy">
                      <strong>외교 관계</strong>
                      <div className="pixel-diplomacy-current">
                        <div className="pixel-diplomacy-current-head">
                          <span>현재 관계</span>
                          <div className="pixel-diplomacy-bulk">
                            <button
                              type="button"
                              className="secondary"
                              disabled={busy || menuWarRelations.length === 0}
                              onClick={() => void applyCountryDiplomacyAction("END_ALL_WARS")}
                            >
                              모든 전쟁 종료
                            </button>
                            <button
                              type="button"
                              className="secondary"
                              disabled={
                                busy ||
                                (menuWarRelations.length === 0 &&
                                  !menuOtherRelations.some(
                                    (relation) => relation.status === "STALEMATE",
                                  ))
                              }
                              onClick={() => void applyCountryDiplomacyAction("TRUCE_ALL_WARS")}
                            >
                              모든 전쟁 휴전
                            </button>
                            <button
                              type="button"
                              className="secondary"
                              disabled={busy || menuAllianceRelations.length === 0}
                              onClick={() =>
                                void applyCountryDiplomacyAction("END_ALL_ALLIANCES")
                              }
                            >
                              모든 동맹 종료
                            </button>
                          </div>
                        </div>
                        {menuCountryRelations.length === 0 ? (
                          <small className="pixel-diplomacy-hint muted">
                            특이 외교 관계 없음
                          </small>
                        ) : (
                          <ul className="pixel-diplomacy-relation-list">
                            {menuWarRelations.map((relation) => (
                              <li key={`war-${relation.toCountryId}`}>
                                <div className="pixel-diplomacy-relation-meta">
                                  <strong>{relation.counterpartName}</strong>
                                  <span>{DIPLOMATIC_STATUS_LABELS[relation.status]}</span>
                                </div>
                                <div className="pixel-diplomacy-relation-actions">
                                  <button
                                    type="button"
                                    className="secondary"
                                    disabled={busy}
                                    onClick={() =>
                                      void applyCountryDiplomacyAction(
                                        "END_WAR",
                                        relation.toCountryId,
                                      )
                                    }
                                  >
                                    종료
                                  </button>
                                  <button
                                    type="button"
                                    className="secondary"
                                    disabled={busy}
                                    onClick={() =>
                                      void applyCountryDiplomacyAction(
                                        "SET_STALEMATE",
                                        relation.toCountryId,
                                      )
                                    }
                                  >
                                    교착
                                  </button>
                                  <button
                                    type="button"
                                    className="secondary"
                                    disabled={busy}
                                    onClick={() =>
                                      void applyCountryDiplomacyAction(
                                        "SET_TRUCE",
                                        relation.toCountryId,
                                      )
                                    }
                                  >
                                    휴전
                                  </button>
                                </div>
                              </li>
                            ))}
                            {menuAllianceRelations.map((relation) => (
                              <li key={`ally-${relation.toCountryId}`}>
                                <div className="pixel-diplomacy-relation-meta">
                                  <strong>{relation.counterpartName}</strong>
                                  <span>{DIPLOMATIC_STATUS_LABELS[relation.status]}</span>
                                </div>
                                <div className="pixel-diplomacy-relation-actions">
                                  <button
                                    type="button"
                                    className="secondary"
                                    disabled={busy}
                                    onClick={() =>
                                      void applyCountryDiplomacyAction(
                                        "END_ALLIANCE",
                                        relation.toCountryId,
                                      )
                                    }
                                  >
                                    동맹 종료
                                  </button>
                                </div>
                              </li>
                            ))}
                            {menuOtherRelations.map((relation) => (
                              <li key={`other-${relation.toCountryId}-${relation.status}`}>
                                <div className="pixel-diplomacy-relation-meta">
                                  <strong>{relation.counterpartName}</strong>
                                  <span>{DIPLOMATIC_STATUS_LABELS[relation.status]}</span>
                                </div>
                                {(relation.status === "STALEMATE" ||
                                  relation.status === "TRUCE") && (
                                  <div className="pixel-diplomacy-relation-actions">
                                    {relation.status === "STALEMATE" && (
                                      <button
                                        type="button"
                                        className="secondary"
                                        disabled={busy}
                                        onClick={() =>
                                          void applyCountryDiplomacyAction(
                                            "SET_TRUCE",
                                            relation.toCountryId,
                                          )
                                        }
                                      >
                                        휴전
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      className="secondary"
                                      disabled={busy}
                                      onClick={() =>
                                        void applyCountryDiplomacyAction(
                                          "END_WAR",
                                          relation.toCountryId,
                                        )
                                      }
                                    >
                                      종료
                                    </button>
                                  </div>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      {diplomacyTarget ? (
                        <div className="pixel-diplomacy-target">
                          <span>
                            상대 <strong>{diplomacyTarget.name}</strong>
                          </span>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => {
                              setDiplomacyTargetId("");
                              setDiplomacyLink((current) =>
                                current ? { ...current, to: null } : current,
                              );
                              setPickingDiplomacyTarget(true);
                              setMessage("지도에서 상대 국가를 클릭하세요.");
                            }}
                          >
                            다시 선택
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className={pickingDiplomacyTarget ? "active" : "secondary"}
                          onClick={() => {
                            setPickingDiplomacyTarget(true);
                            setMessage("지도에서 상대 국가를 클릭하세요.");
                          }}
                        >
                          {pickingDiplomacyTarget
                            ? "지도에서 선택 중..."
                            : "지도에서 상대국 선택"}
                        </button>
                      )}
                      {pickingDiplomacyTarget && (
                        <small className="pixel-diplomacy-hint">
                          연결할 다른 국가를 지도에서 클릭하세요.
                        </small>
                      )}
                      <label>
                        관계
                        <select
                          value={diplomacyStatus}
                          onChange={(event) =>
                            setDiplomacyStatus(event.target.value as DiplomaticRelationStatus)
                          }
                        >
                          {DIPLOMATIC_STATUS_OPTIONS.filter((status) => {
                            const hasGuerrilla =
                              menuCountry.entityType === "GUERRILLA_GROUP" ||
                              diplomacyTarget?.entityType === "GUERRILLA_GROUP";
                            return hasGuerrilla
                              ? status === "GUERRILLA" || status === "NO_RELATIONS"
                              : status !== "GUERRILLA";
                          }).map((status) => (
                            <option value={status} key={status}>
                              {DIPLOMATIC_STATUS_LABELS[status]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <input
                        value={diplomacyReason}
                        maxLength={300}
                        placeholder="사유"
                        aria-label="관계 변경 사유"
                        onChange={(event) => setDiplomacyReason(event.target.value)}
                      />
                      <button
                        type="button"
                        disabled={busy || !diplomacyTargetId}
                        onClick={() => void updateMapDiplomacy()}
                      >
                        관계 적용
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="empty-state">평면 픽셀 지도를 업로드하세요.</div>
      )}

      <form action={upload} className="pixel-map-upload">
        <input type="file" name="file" accept="image/png,image/jpeg,image/webp" required />
        <label>
          평면 투영
          <select
            name="projection"
            value={projection}
            onChange={(event) => setProjection(event.target.value as MapProjection)}
          >
            {MAP_PROJECTIONS.map((option) => (
              <option key={option} value={option}>
                {MAP_PROJECTION_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
        <small>
          구체 지구에서 이 투영으로 역산합니다. 권장 가로세로비{" "}
          {MAP_PROJECTION_ASPECT[projection].toFixed(2)} : 1
        </small>
        <button type="submit" disabled={busy}>
          {hasRaster ? "이미지 교체·2×2 확대" : "평면 지도 업로드·2×2 확대"}
        </button>
        {hasRaster && (
          <button type="button" className="secondary" disabled={busy} onClick={saveProjection}>
            투영만 적용
          </button>
        )}
      </form>
      {message && <p className="form-message">{message}</p>}
    </div>
  );
}
