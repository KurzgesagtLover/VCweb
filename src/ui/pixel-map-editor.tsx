"use client";

import NextImage from "next/image";
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

type Country = { id: string; name: string; code: string; color: string };
type Tool = "assign" | "island" | "border" | "pencil" | "fill" | "erase";
type AssignmentMode = "COLOR" | "REGION";
type MapPoint = { x: number; y: number };
type MenuState = { colorHex: string; x: number; y: number; left: number; top: number } | null;
type ZoomAnchor = { clientX: number; clientY: number; mapX: number; mapY: number };

const MIN_ZOOM = 25;
const MAX_ZOOM = 800;
const ZOOM_STEP = 25;
const BORDER_LAYER_ORDER: BorderLayerKind[] = ["COAST", "LEGAL", "ACTIVE", "INACTIVE"];

const TOOL_LABELS: Record<Tool, string> = {
  assign: "영토 할당",
  island: "섬 브러시",
  border: "국경색 선택",
  pencil: "연필",
  fill: "채우기",
  erase: "지우개",
};

function initialBorderLayerColors(rows: BorderClassification[]) {
  const colors = { ...DEFAULT_BORDER_LAYER_COLORS };
  const assigned = new Set<BorderLayerKind>();
  for (const row of rows) {
    const layer = borderLayerKind(row.kind);
    if (!layer || assigned.has(layer)) continue;
    colors[layer] = row.displayColor.toUpperCase();
    assigned.add(layer);
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
  borderRevision,
  initialBorderClassifications,
  rasterProjection = "EQUIRECTANGULAR",
}: {
  campaignId: string;
  mapId: string;
  mapRevision: number;
  rasterRevision: number;
  hasRaster: boolean;
  countries: Country[];
  borderRevision: number;
  initialBorderClassifications: BorderClassification[];
  rasterProjection?: MapProjection;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef(false);
  const zoomRef = useRef(100);
  const zoomAnchorRef = useRef<ZoomAnchor | null>(null);
  const lastPaintPointRef = useRef<MapPoint | null>(null);
  const [tool, setTool] = useState<Tool>("assign");
  const [paintColor, setPaintColor] = useState("#2F8CA3");
  const [brushSize, setBrushSize] = useState(8);
  const [zoom, setZoom] = useState(100);
  const [ready, setReady] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [menu, setMenu] = useState<MenuState>(null);
  const [countryId, setCountryId] = useState(countries.at(0)?.id ?? "");
  const [territoryColor, setTerritoryColor] = useState(countries.at(0)?.color ?? "#5C6670");
  const [oceanColor, setOceanColor] = useState("#2F8CA3");
  const [assignmentMode, setAssignmentMode] = useState<AssignmentMode>("COLOR");
  const [islandPoints, setIslandPoints] = useState<MapPoint[]>([]);
  const [visibleBorderLayers, setVisibleBorderLayers] = useState<Record<BorderLayerKind, boolean>>({
    COAST: true,
    LEGAL: true,
    ACTIVE: true,
    INACTIVE: true,
  });
  const [borderLayerColors, setBorderLayerColors] = useState(() =>
    initialBorderLayerColors(initialBorderClassifications),
  );
  const [borderSourceColor, setBorderSourceColor] = useState("#000000");
  const [borderKind, setBorderKind] = useState<BorderKind>("LEGAL");
  const [borderDisplayColor, setBorderDisplayColor] = useState(DEFAULT_BORDER_DISPLAY_COLORS.LEGAL);
  const [borderClassifications, setBorderClassifications] = useState(initialBorderClassifications);
  const [projection, setProjection] = useState<MapProjection>(rasterProjection);

  const selectedCountry = countries.find((country) => country.id === countryId);
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
      setReady(true);
      setDirty(false);
    };
    image.src = `/api/map/image?mapId=${encodeURIComponent(mapId)}&v=${rasterRevision}&borders=1`;
  }, [hasRaster, mapId, rasterRevision]);

  useEffect(() => {
    loadCanvas();
  }, [loadCanvas]);

  const saveCanvas = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error("지도를 저장할 수 없습니다.");
    const file = await canvasPng(canvas);
    const formData = new FormData();
    formData.set("campaignId", campaignId);
    formData.set("mapId", mapId);
    formData.set("mode", "save");
    formData.set("file", file);
    const response = await fetch("/api/admin/map/raster", { method: "POST", body: formData });
    const result = (await response.json()) as { error?: string; revision?: number };
    if (!response.ok) throw new Error(result.error ?? "지도를 저장할 수 없습니다.");
    setDirty(false);
    return result.revision ?? rasterRevision;
  }, [campaignId, mapId, rasterRevision]);

  function sampledColor(point: MapPoint) {
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

  function pushIslandPoint(point: MapPoint) {
    const previous = lastPaintPointRef.current;
    const additions = previous
      ? interpolateRasterPoints(previous, point, Math.max(1, brushSize / 3))
      : [point];
    lastPaintPointRef.current = point;
    setIslandPoints((current) => [...current, ...additions].slice(-5000));
  }

  function paint(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !context) return;
    const point = canvasPoint(canvas, event);
    if (tool === "assign") {
      const colorHex = sampledColor(point);
      if (!colorHex) return;
      if (
        borderClassifications.some(
          (classification) => classification.sourceColor.toUpperCase() === colorHex,
        )
      ) {
        setMessage("등록된 국경색은 영토로 할당할 수 없습니다.");
        setMenu(null);
        return;
      }
      setMenu({ colorHex, x: point.x, y: point.y, left: point.left, top: point.top });
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
      if (floodFill(context, point.x, point.y, rgba(paintColor))) setDirty(true);
      return;
    }
    const size = Math.max(1, Math.round(brushSize));
    const previous = lastPaintPointRef.current;
    const points = previous
      ? interpolateRasterPoints(previous, point, Math.max(1, size / 3))
      : [point];
    context.fillStyle = paintColor;
    for (const current of points) {
      const left = Math.floor(current.x - size / 2);
      const top = Math.floor(current.y - size / 2);
      if (tool === "erase") context.clearRect(left, top, size, size);
      else context.fillRect(left, top, size, size);
    }
    lastPaintPointRef.current = point;
    setDirty(true);
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
      await saveCanvas();
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
          expectedRasterRevision: rasterRevision,
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
      setIslandPoints([]);
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "영토를 할당하지 못했습니다.");
      setBusy(false);
    }
  }

  function updateBorderLayerColor(layer: BorderLayerKind, color: string) {
    const displayColor = color.toUpperCase();
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
          expectedRasterRevision: rasterRevision,
          classifications: borderClassifications,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "국경 분류를 저장하지 못했습니다.");
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
              if (value !== "island") setIslandPoints([]);
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
              onChange={(event) => updateBorderLayerColor(layer, event.target.value)}
            />
          </div>
        ))}
        <button
          type="button"
          className="secondary"
          disabled={!borderClassifications.length || busy || dirty}
          onClick={() => void saveBorderClassifications()}
        >
          국경색 저장
        </button>
      </section>

      {tool === "island" && (
        <section className="pixel-tool-panel">
          <label>
            국가
            <select
              value={countryId}
              onChange={(event) => {
                setCountryId(event.target.value);
                const country = countries.find((item) => item.id === event.target.value);
                if (country) setTerritoryColor(country.color);
              }}
            >
              {countries.map((country) => (
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
          <button type="button" className="secondary" onClick={() => setIslandPoints([])}>
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
                  onClick={() =>
                    setBorderClassifications((current) =>
                      current.filter((row) => row.sourceColor !== classification.sourceColor),
                    )
                  }
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            disabled={!borderClassifications.length || busy}
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
                paint(event);
              }}
              onPointerMove={(event) => {
                if (!drawingRef.current || !["pencil", "erase", "island"].includes(tool)) return;
                paint(event);
              }}
              onPointerUp={(event) => {
                drawingRef.current = false;
                lastPaintPointRef.current = null;
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={() => {
                drawingRef.current = false;
                lastPaintPointRef.current = null;
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
            {islandPoints.length > 0 && canvasSize.width > 0 && (
              <svg
                className="pixel-selection-overlay"
                viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
                aria-hidden="true"
              >
                <polyline
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
            {menu && (
              <div className="pixel-map-menu panel" style={{ left: menu.left, top: menu.top }}>
                <button
                  type="button"
                  className="pixel-menu-close"
                  aria-label="닫기"
                  onClick={() => setMenu(null)}
                >
                  ×
                </button>
                <div className="pixel-picked-color">
                  <i style={{ background: menu.colorHex }} />
                  <strong>{menu.colorHex}</strong>
                </div>
                <label>
                  할당 방식
                  <select
                    value={assignmentMode}
                    onChange={(event) => setAssignmentMode(event.target.value as AssignmentMode)}
                  >
                    <option value="COLOR">같은 색 전체</option>
                    <option value="REGION">연결된 한 구역</option>
                  </select>
                </label>
                <label>
                  국가
                  <select
                    value={countryId}
                    onChange={(event) => {
                      setCountryId(event.target.value);
                      const country = countries.find((item) => item.id === event.target.value);
                      if (country) setTerritoryColor(country.color);
                    }}
                  >
                    {countries.map((country) => (
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
                    value={assignmentMode === "COLOR" ? menu.colorHex : territoryColor}
                    disabled={assignmentMode === "COLOR"}
                    onChange={(event) => setTerritoryColor(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  disabled={!selectedCountry || busy}
                  onClick={() => {
                    void assignTerritory(assignmentMode);
                  }}
                >
                  {assignmentMode === "COLOR" ? "같은 색 전체 할당" : "이 구역만 할당"}
                </button>
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
