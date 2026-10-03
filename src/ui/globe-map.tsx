"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { quantitativeMapColors, type MapMode } from "@/src/domain/map/map-mode";
import { celestialDirectionFromCamera, celestialPositions } from "@/src/domain/map/celestial";
import {
  elevationDetailWindow,
  elevationVisibleWindow,
  elevationWindowContains,
  elevationWindowStride,
} from "@/src/domain/map/elevation-detail";
import {
  IDENTITY_FIT,
  boundsFit,
  projectToUv,
  projectionFit,
  projectionMode,
  type MapProjection,
  type ProjectionFit,
} from "@/src/domain/map/projection";
import { currentGameInstant } from "@/src/domain/turn/schedule";
import {
  BASE_TEXTURE_WIDTH,
  DEFAULT_ZOOM,
  DETAIL_TEXTURE_WIDTH,
  MAX_ZOOM,
  MIN_ZOOM,
  DEFAULT_SEA_COLOR,
  buildCentroids,
  createProgram,
  detectSeaColor,
  detectMapBounds,
  extendMapEdges,
  globePointToLonLat,
  globeUniformLocations,
  recolorMapPixels,
  sampleCountry,
  type Sampler,
} from "./globe-core";
import { createGlobeLabelLayer, type GlobeLabelLayer, type GlobeLabelSource } from "./globe-labels";
import {
  createSatelliteConstellationLayer,
  type SatelliteConstellationLayer,
} from "./globe-satellites";
import {
  citiesForZoom,
  cityPopulationThreshold,
  createGlobeCityLayer,
  type GlobeCityLayer,
  type GlobeCitySource,
} from "./globe-cities";
import { TnoDiplomacyPanel, type DiplomacyDetail } from "./tno-diplomacy-panel";
import { ConstructionWorkspace, type ConstructionWorkspaceProps } from "./construction-workspace";
import { playCountrySelectSound } from "./ui-click-sound";
import {
  createGlobeAdministrativeBoundaryLayer,
  type AdministrativeBoundarySource,
  type GlobeAdministrativeBoundaryLayer,
} from "./globe-administrative-boundaries";

type Country = { id: string; name: string; code: string; color: string; isAi: boolean };
type Relation = { toCountryId: string; score: number; tags: string[] };
type Assignment = { colorHex: string; countryId: string };
export type MapModeDatum = {
  countryId: string;
  nominalGdp: string | null;
  population: string | null;
  diplomaticBlocColor: string | null;
  diplomaticBlocName: string | null;
  economicBlocColor: string | null;
  economicBlocName: string | null;
};
type OwnCountry = {
  name: string;
  code: string;
  color: string;
  entityType: string;
  flag: string;
  stability: number | null;
};
type GlobeGameClock = {
  gameDateStart: string;
  gameDateEnd: string;
  deadlineAt: string | null;
  intervalRealDays: number;
};

// 국명 라벨은 디테일 텍스처에만 새겨진다. 기본 텍스처는 색상 픽킹용이라 깨끗해야 한다.
const DETAIL_ZOOM_THRESHOLD = 1;
type BorderLayer = "COAST" | "LEGAL" | "ACTIVE" | "INACTIVE" | "GUERRILLA";
const BORDER_LAYERS: readonly BorderLayer[] = ["COAST", "LEGAL", "ACTIVE", "INACTIVE", "GUERRILLA"];
const DEFAULT_BORDER_LAYERS: Record<BorderLayer, boolean> = {
  COAST: false,
  LEGAL: false,
  ACTIVE: false,
  INACTIVE: false,
  GUERRILLA: false,
};

export function GlobeMap({
  mapId,
  rasterRevision,
  projection,
  colorAssignments,
  countries,
  ownCountryId,
  ownCountry,
  relations,
  mapModeData,
  gameClock,
  turnOpen,
  inboxCount,
  children,
  mode = "diplomacy",
  construction,
}: {
  mapId: string;
  rasterRevision: number;
  projection: MapProjection;
  colorAssignments: Assignment[];
  countries: Country[];
  ownCountryId: string;
  ownCountry: OwnCountry;
  relations: Relation[];
  mapModeData: MapModeDatum[];
  gameClock: GlobeGameClock;
  turnOpen: boolean;
  inboxCount: number;
  children?: ReactNode;
  mode?: "diplomacy" | "construction";
  construction?: Omit<ConstructionWorkspaceProps, "compact" | "selectedCityId" | "onSelectCity">;
}) {
  const constructionMode = mode === "construction" && Boolean(construction);
  type TextureWindow = { left: number; top: number; width: number; height: number };
  type ElevationAtlas = {
    canvas: HTMLCanvasElement;
    bounds: TextureWindow;
    stride: number;
  };

  const visibleTextureWindow = useCallback(
    (
      canvas: HTMLCanvasElement,
      view: { lon: number; lat: number; zoom: number },
      projection: MapProjection,
      fit: ProjectionFit,
      dossierOpen: boolean,
    ): TextureWindow | null => {
      if (view.zoom < DETAIL_ZOOM_THRESHOLD) return null;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const panelWidth = dossierOpen
        ? constructionMode
          ? width * 0.4
          : Math.min(560, width * 0.46)
        : 0;
      const panelInset = panelWidth;
      const usableWidth = Math.max(1, width - panelWidth);
      const mapLeft = 0;
      const points: Array<{ u: number; v: number }> = [];
      for (let row = 0; row <= 8; row += 1) {
        for (let column = 0; column <= 10; column += 1) {
          const point = globePointToLonLat(
            mapLeft + (usableWidth * column) / 10,
            (height * row) / 8,
            width,
            height,
            panelInset,
            view,
          );
          if (point) points.push(projectToUv(projection, point.lon, point.lat, fit));
        }
      }
      if (!points.length) return null;
      let left = Math.min(...points.map((point) => point.u));
      let right = Math.max(...points.map((point) => point.u));
      let top = Math.min(...points.map((point) => point.v));
      let bottom = Math.max(...points.map((point) => point.v));
      if (right - left > 0.72) {
        left = 0;
        right = 1;
      }
      const horizontalPadding = Math.max(0.012, (right - left) * 0.08);
      const verticalPadding = Math.max(0.012, (bottom - top) * 0.08);
      left = Math.max(0, left - horizontalPadding);
      right = Math.min(1, right + horizontalPadding);
      top = Math.max(0, top - verticalPadding);
      bottom = Math.min(1, bottom + verticalPadding);
      if (right - left < 0.005 || bottom - top < 0.005) return null;
      return { left, top, width: right - left, height: bottom - top };
    },
    [constructionMode],
  );

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const uniformsRef = useRef<Record<string, WebGLUniformLocation | null>>({});
  const baseTextureRef = useRef<WebGLTexture | null>(null);
  const detailTextureRef = useRef<WebGLTexture | null>(null);
  const elevationTextureRef = useRef<WebGLTexture | null>(null);
  const elevationReadyRef = useRef(false);
  const elevationDetailTextureRef = useRef<WebGLTexture | null>(null);
  const elevationDetailBoundsRef = useRef<TextureWindow>({ left: 0, top: 0, width: 1, height: 1 });
  const elevationDetailReadyRef = useRef(false);
  const elevationDetailAtlasRef = useRef<ElevationAtlas | null>(null);
  const elevationDetailPendingRef = useRef<Omit<ElevationAtlas, "canvas"> | null>(null);
  const elevationDetailLoadRef = useRef(0);
  const elevationDetailTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elevationDetailAbortRef = useRef<AbortController | null>(null);
  const elevationDetailTextureSizeRef = useRef(768);
  const detailBoundsRef = useRef<TextureWindow>({ left: 0, top: 0, width: 1, height: 1 });
  const detailReadyRef = useRef(false);
  const detailLoadRef = useRef(0);
  const detailTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detailTextureSizeRef = useRef(2048);
  const queueDetailTextureRef = useRef<(delay?: number) => void>(() => undefined);
  const queueElevationDetailRef = useRef<(delay?: number) => void>(() => undefined);
  const samplerRef = useRef<Sampler | null>(null);
  const labelHostRef = useRef<SVGGElement>(null);
  const labelLayerRef = useRef<GlobeLabelLayer | null>(null);
  const cityHostRef = useRef<HTMLCanvasElement>(null);
  const cityLayerRef = useRef<GlobeCityLayer | null>(null);
  const citySourceRef = useRef<GlobeCitySource[]>([]);
  const cityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cityRefreshFrameRef = useRef(0);
  const cityCatalogRef = useRef<GlobeCitySource[] | null>(null);
  const cityCatalogPendingRef = useRef(false);
  const cityPopulationThresholdRef = useRef<number | null>(null);
  const administrativeBoundaryHostRef = useRef<HTMLCanvasElement>(null);
  const administrativeBoundaryLayerRef = useRef<GlobeAdministrativeBoundaryLayer | null>(null);
  const satelliteCanvasRef = useRef<HTMLCanvasElement>(null);
  const satelliteLayerRef = useRef<SatelliteConstellationLayer | null>(null);
  const labelSourceRef = useRef<GlobeLabelSource[]>([]);
  const centroidsRef = useRef<Map<string, { lon: number; lat: number }>>(new Map());
  const seaColorRef = useRef<[number, number, number]>(DEFAULT_SEA_COLOR);
  const fitRef = useRef<ProjectionFit>(IDENTITY_FIT);
  const initialZoom = constructionMode ? 1.65 : DEFAULT_ZOOM;
  const viewRef = useRef({ lon: 0, lat: 18, zoom: initialZoom });
  const dragRef = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null);
  const frameRef = useRef(0);
  const animationRef = useRef(0);
  const zoomAnimationRef = useRef(0);
  const zoomTargetRef = useRef(initialZoom);
  const zoomPreviousFrameRef = useRef(0);
  const celestialAnimationRef = useRef(0);
  const touchedRef = useRef(false);
  const assignmentsRef = useRef(
    new Map(colorAssignments.map((item) => [item.colorHex.toUpperCase(), item.countryId])),
  );

  const [status, setStatus] = useState<"loading" | "ready" | "unsupported" | "failed">("loading");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [boundaryPoint, setBoundaryPoint] = useState<{ lon: number; lat: number } | null>(null);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [details, setDetails] = useState<DiplomacyDetail | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const borderLayers = DEFAULT_BORDER_LAYERS;
  const showGrid = false;
  const [inboxOpen, setInboxOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [mapMode, setMapMode] = useState<MapMode | null>(null);
  const [showSatellites, setShowSatellites] = useState(false);
  const [showCities, setShowCities] = useState(true);
  const [constructionCityId, setConstructionCityId] = useState(construction?.cities[0]?.id ?? "");
  const showSatellitesRef = useRef(false);
  const showCitiesRef = useRef(true);
  const dossierOpen = constructionMode || Boolean(selectedId);
  const constructionCitySourceIds = useMemo(
    () => construction?.cities.map((city) => city.cityId) ?? [],
    [construction],
  );
  const selectedConstructionCity = construction?.cities.find(
    (city) => city.id === constructionCityId,
  );

  const countryDisplayColors = useMemo(() => {
    let colors = new Map<string, string>();
    if (mapMode === "GDP" || mapMode === "GDP_PER_CAPITA" || mapMode === "POPULATION") {
      colors = quantitativeMapColors(
        mapModeData.map((datum) => {
          const population = datum.population === null ? null : Number(datum.population);
          const nominalGdp = datum.nominalGdp === null ? null : Number(datum.nominalGdp);
          const value =
            mapMode === "GDP"
              ? nominalGdp
              : mapMode === "POPULATION"
                ? population
                : nominalGdp !== null && population && population > 0
                  ? (nominalGdp * 1_000_000) / population
                  : null;
          return { countryId: datum.countryId, value };
        }),
      );
    } else if (mapMode === "BLOC" || mapMode === "ECONOMIC_BLOC") {
      colors = new Map(
        mapModeData.map((datum) => [
          datum.countryId,
          (mapMode === "BLOC" ? datum.diplomaticBlocColor : datum.economicBlocColor) ?? "#343A40",
        ]),
      );
    }
    return colors;
  }, [mapMode, mapModeData]);
  const countryDisplayColorsRef = useRef(countryDisplayColors);

  const recoloredCanvas = useCallback((sampler: Sampler) => {
    if (!countryDisplayColorsRef.current.size) return null;
    const canvas = document.createElement("canvas");
    canvas.width = sampler.width;
    canvas.height = sampler.height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.putImageData(
      new ImageData(
        recolorMapPixels(sampler, assignmentsRef.current, countryDisplayColorsRef.current),
        sampler.width,
        sampler.height,
      ),
      0,
      0,
    );
    return canvas;
  }, []);

  useEffect(() => {
    const handleMapMode = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          mode: MapMode | null;
          showSatellites: boolean;
          showCities?: boolean;
        }>
      ).detail;
      setMapMode(detail.mode);
      setShowSatellites(detail.showSatellites);
      setShowCities(detail.showCities ?? true);
    };
    window.addEventListener("game-map-mode-change", handleMapMode);
    const requestFrame = window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event("game-map-mode-request"));
    });
    return () => {
      window.cancelAnimationFrame(requestFrame);
      window.removeEventListener("game-map-mode-change", handleMapMode);
    };
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [searchOpen]);

  const borderLayerKey = BORDER_LAYERS.filter(
    (kind) => kind !== "COAST" && borderLayers[kind],
  ).join(",");
  const resolveGameInstant = useCallback(
    (now = new Date()) =>
      currentGameInstant({
        gameDateStart: gameClock.gameDateStart,
        gameDateEnd: gameClock.gameDateEnd,
        deadlineAt: gameClock.deadlineAt ? new Date(gameClock.deadlineAt) : null,
        intervalRealDays: gameClock.intervalRealDays,
        now,
      }) ?? new Date(`${gameClock.gameDateEnd}T12:00:00.000Z`),
    [gameClock],
  );
  const drawSatellites = useCallback(
    (time = performance.now()) => {
      const canvas = satelliteCanvasRef.current;
      const layer = satelliteLayerRef.current;
      if (!canvas || !layer) return;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const panelWidth = dossierOpen
        ? constructionMode
          ? canvas.clientWidth * 0.4
          : Math.min(560, canvas.clientWidth * 0.46)
        : 0;
      layer.draw({
        width,
        height,
        panelInset: panelWidth * ratio,
        pixelRatio: ratio,
        view: viewRef.current,
        visible: showSatellitesRef.current,
        time,
      });
    },
    [constructionMode, dossierOpen],
  );
  const render = useCallback(() => {
    const gl = glRef.current;
    const canvas = canvasRef.current;
    const program = programRef.current;
    if (!gl || !canvas || !program) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const uniforms = uniformsRef.current;
    const view = viewRef.current;
    // 우측 외교 서류창이 열리면 구체를 왼쪽으로 밀어 가려지지 않게 한다.
    const panelWidth = dossierOpen
      ? constructionMode
        ? canvas.clientWidth * 0.4
        : Math.min(560, canvas.clientWidth * 0.46)
      : 0;
    const panelInset = panelWidth;
    gl.viewport(0, 0, width, height);
    gl.useProgram(program);
    gl.uniform2f(uniforms.center ?? null, (width - panelInset * ratio) / 2, height / 2);
    gl.uniform2f(uniforms.resolution ?? null, width, height);
    gl.uniform1f(uniforms.radius ?? null, (Math.min(width, height) / 2) * view.zoom);
    gl.uniform1f(uniforms.lon0 ?? null, (view.lon * Math.PI) / 180);
    gl.uniform1f(uniforms.lat0 ?? null, (view.lat * Math.PI) / 180);
    gl.uniform1i(uniforms.mode ?? null, projectionMode(projection));
    gl.uniform4f(
      uniforms.fit ?? null,
      fitRef.current.offsetU,
      fitRef.current.offsetV,
      fitRef.current.scaleU,
      fitRef.current.scaleV,
    );
    gl.uniform3f(uniforms.seaColor ?? null, ...seaColorRef.current);
    gl.uniform1f(uniforms.grid ?? null, showGrid ? 1 : 0);
    gl.uniform1f(uniforms.coastline ?? null, borderLayers.COAST ? 1 : 0);
    const detailBounds = detailBoundsRef.current;
    gl.uniform4f(
      uniforms.detailBounds ?? null,
      detailBounds.left,
      detailBounds.top,
      detailBounds.width,
      detailBounds.height,
    );
    gl.uniform1f(uniforms.detailReady ?? null, detailReadyRef.current ? 1 : 0);
    gl.uniform1f(uniforms.elevationReady ?? null, elevationReadyRef.current ? 1 : 0);
    const elevationDetailBounds = elevationDetailBoundsRef.current;
    gl.uniform4f(
      uniforms.elevationDetailBounds ?? null,
      elevationDetailBounds.left,
      elevationDetailBounds.top,
      elevationDetailBounds.width,
      elevationDetailBounds.height,
    );
    gl.uniform1f(uniforms.elevationDetailReady ?? null, elevationDetailReadyRef.current ? 1 : 0);

    const celestial = celestialPositions(resolveGameInstant());
    const sunViewDirection = celestialDirectionFromCamera(
      celestial.sun,
      view.lon,
      view.lat,
      view.zoom,
    );
    const moonViewDirection = celestialDirectionFromCamera(
      celestial.moon,
      view.lon,
      view.lat,
      view.zoom,
    );
    gl.uniform3f(uniforms.sunDirection ?? null, ...celestial.sun.direction);
    gl.uniform3f(uniforms.moonDirection ?? null, ...celestial.moon.direction);
    gl.uniform3f(uniforms.sunViewDirection ?? null, ...sunViewDirection);
    gl.uniform3f(uniforms.moonViewDirection ?? null, ...moonViewDirection);
    gl.uniform1f(uniforms.sunAngularRadius ?? null, celestial.sun.angularRadius);
    gl.uniform1f(uniforms.moonAngularRadius ?? null, celestial.moon.angularRadius);
    gl.uniform1f(uniforms.moonIllumination ?? null, celestial.moonIllumination);
    gl.uniform1f(uniforms.celestialReady ?? null, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    drawSatellites();
    labelLayerRef.current?.draw({
      width: canvas.clientWidth,
      height: canvas.clientHeight,
      panelInset,
      view,
    });
    if (showCitiesRef.current) {
      cityLayerRef.current?.draw({
        width: canvas.clientWidth,
        height: canvas.clientHeight,
        panelInset,
        view,
      });
    }
    administrativeBoundaryLayerRef.current?.draw({
      width: canvas.clientWidth,
      height: canvas.clientHeight,
      panelInset,
      view,
    });
  }, [
    borderLayers.COAST,
    constructionMode,
    dossierOpen,
    drawSatellites,
    projection,
    resolveGameInstant,
    showGrid,
  ]);

  const scheduleRender = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = 0;
      render();
    });
  }, [render]);

  const loadDetailTexture = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !rasterRevision) return;
    const bounds = visibleTextureWindow(
      canvas,
      viewRef.current,
      projection,
      fitRef.current,
      dossierOpen,
    );
    const loadId = ++detailLoadRef.current;
    if (!bounds) {
      detailReadyRef.current = false;
      scheduleRender();
      return;
    }
    const requestBounds = Object.fromEntries(
      Object.entries(bounds).map(([key, value]) => [key, Number(value.toFixed(6))]),
    ) as TextureWindow;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      if (loadId !== detailLoadRef.current) return;
      const gl = glRef.current;
      const texture = detailTextureRef.current;
      if (!gl || !texture) return;
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
      const offscreen = document.createElement("canvas");
      offscreen.width = image.naturalWidth;
      offscreen.height = image.naturalHeight;
      const context = offscreen.getContext("2d", { willReadFrequently: true });
      context?.drawImage(image, 0, 0);
      const pixels = context?.getImageData(0, 0, offscreen.width, offscreen.height);
      const display = pixels
        ? recoloredCanvas({ data: pixels.data, width: pixels.width, height: pixels.height })
        : null;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, display ?? image);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      detailBoundsRef.current = requestBounds;
      detailReadyRef.current = true;
      scheduleRender();
    };
    image.onerror = () => {
      if (loadId !== detailLoadRef.current) return;
      detailReadyRef.current = false;
      scheduleRender();
    };
    const params = new URLSearchParams({
      mapId,
      v: String(rasterRevision),
      pv: "3",
      layers: borderLayerKey,
      size: String(detailTextureSizeRef.current),
      left: String(requestBounds.left),
      top: String(requestBounds.top),
      width: String(requestBounds.width),
      height: String(requestBounds.height),
    });
    image.src = `/api/map/globe/texture?${params.toString()}`;
  }, [
    borderLayerKey,
    dossierOpen,
    mapId,
    projection,
    rasterRevision,
    recoloredCanvas,
    scheduleRender,
    visibleTextureWindow,
  ]);

  const loadElevationDetailTexture = useCallback(async () => {
    const detailView = { ...viewRef.current, zoom: zoomTargetRef.current };
    const visibleBounds = elevationVisibleWindow(detailView);
    const desiredBounds = elevationDetailWindow(detailView);
    if (!visibleBounds || !desiredBounds) {
      elevationDetailAbortRef.current?.abort();
      elevationDetailAbortRef.current = null;
      elevationDetailLoadRef.current += 1;
      elevationDetailPendingRef.current = null;
      elevationDetailReadyRef.current = false;
      scheduleRender();
      return;
    }

    const wrapUnit = (value: number) => ((value % 1) + 1) % 1;
    const normalized = (bounds: TextureWindow): TextureWindow => ({
      ...bounds,
      left: wrapUnit(bounds.left),
    });
    const textureSize = elevationDetailTextureSizeRef.current;
    const desiredStride = elevationWindowStride(desiredBounds, textureSize);
    const atlas = elevationDetailAtlasRef.current;
    if (
      atlas &&
      atlas.stride <= desiredStride &&
      elevationWindowContains(normalized(atlas.bounds), visibleBounds)
    ) {
      elevationDetailBoundsRef.current = normalized(atlas.bounds);
      elevationDetailReadyRef.current = true;
      scheduleRender();
      return;
    }
    const pending = elevationDetailPendingRef.current;
    if (
      pending &&
      pending.stride <= desiredStride &&
      elevationWindowContains(normalized(pending.bounds), visibleBounds)
    ) {
      return;
    }

    const loadId = ++elevationDetailLoadRef.current;
    elevationDetailAbortRef.current?.abort();
    const abortController = new AbortController();
    elevationDetailAbortRef.current = abortController;
    const nextBounds = { ...desiredBounds };
    if (atlas) {
      const atlasCenter = atlas.bounds.left + atlas.bounds.width / 2;
      const nextCenter = nextBounds.left + nextBounds.width / 2;
      nextBounds.left += Math.round(atlasCenter - nextCenter);
    }
    elevationDetailPendingRef.current = { bounds: nextBounds, stride: desiredStride };

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round((nextBounds.width * 21_600) / desiredStride));
    canvas.height = Math.max(1, Math.round((nextBounds.height * 10_800) / desiredStride));
    const context = canvas.getContext("2d");
    if (!context) {
      abortController.abort();
      if (elevationDetailAbortRef.current === abortController) {
        elevationDetailAbortRef.current = null;
      }
      elevationDetailPendingRef.current = null;
      return;
    }

    const missing: TextureWindow[] = [nextBounds];
    if (atlas?.stride === desiredStride) {
      const old = atlas.bounds;
      const overlapLeft = Math.max(old.left, nextBounds.left);
      const overlapTop = Math.max(old.top, nextBounds.top);
      const overlapRight = Math.min(old.left + old.width, nextBounds.left + nextBounds.width);
      const overlapBottom = Math.min(old.top + old.height, nextBounds.top + nextBounds.height);
      if (overlapRight > overlapLeft && overlapBottom > overlapTop) {
        const sourceX = ((overlapLeft - old.left) / old.width) * atlas.canvas.width;
        const sourceY = ((overlapTop - old.top) / old.height) * atlas.canvas.height;
        const sourceWidth = ((overlapRight - overlapLeft) / old.width) * atlas.canvas.width;
        const sourceHeight = ((overlapBottom - overlapTop) / old.height) * atlas.canvas.height;
        const targetX = ((overlapLeft - nextBounds.left) / nextBounds.width) * canvas.width;
        const targetY = ((overlapTop - nextBounds.top) / nextBounds.height) * canvas.height;
        const targetWidth = ((overlapRight - overlapLeft) / nextBounds.width) * canvas.width;
        const targetHeight = ((overlapBottom - overlapTop) / nextBounds.height) * canvas.height;
        context.drawImage(
          atlas.canvas,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          targetX,
          targetY,
          targetWidth,
          targetHeight,
        );

        missing.length = 0;
        if (overlapTop > nextBounds.top) {
          missing.push({
            left: nextBounds.left,
            top: nextBounds.top,
            width: nextBounds.width,
            height: overlapTop - nextBounds.top,
          });
        }
        if (overlapBottom < nextBounds.top + nextBounds.height) {
          missing.push({
            left: nextBounds.left,
            top: overlapBottom,
            width: nextBounds.width,
            height: nextBounds.top + nextBounds.height - overlapBottom,
          });
        }
        if (overlapLeft > nextBounds.left) {
          missing.push({
            left: nextBounds.left,
            top: overlapTop,
            width: overlapLeft - nextBounds.left,
            height: overlapBottom - overlapTop,
          });
        }
        if (overlapRight < nextBounds.left + nextBounds.width) {
          missing.push({
            left: overlapRight,
            top: overlapTop,
            width: nextBounds.left + nextBounds.width - overlapRight,
            height: overlapBottom - overlapTop,
          });
        }
      }
    }

    const loadRegion = async (bounds: TextureWindow) => {
      const params = new URLSearchParams({
        size: String(textureSize),
        stride: String(desiredStride),
        left: String(Number(wrapUnit(bounds.left).toFixed(6))),
        top: String(Number(bounds.top.toFixed(6))),
        width: String(Number(bounds.width.toFixed(6))),
        height: String(Number(bounds.height.toFixed(6))),
      });
      const response = await fetch(`/api/map/elevation?${params.toString()}`, {
        cache: "force-cache",
        signal: abortController.signal,
      });
      if (!response.ok) throw new Error(`Elevation ${response.status}`);
      const source = URL.createObjectURL(await response.blob());
      try {
        const image = new Image();
        image.decoding = "async";
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = reject;
          image.src = source;
        });
        return { bounds, image };
      } finally {
        URL.revokeObjectURL(source);
      }
    };

    try {
      const regions = await Promise.all(
        missing.filter((bounds) => bounds.width > 0 && bounds.height > 0).map(loadRegion),
      );
      if (loadId !== elevationDetailLoadRef.current) return;
      for (const region of regions) {
        const targetX = ((region.bounds.left - nextBounds.left) / nextBounds.width) * canvas.width;
        const targetY = ((region.bounds.top - nextBounds.top) / nextBounds.height) * canvas.height;
        const targetWidth = (region.bounds.width / nextBounds.width) * canvas.width;
        const targetHeight = (region.bounds.height / nextBounds.height) * canvas.height;
        context.drawImage(region.image, targetX, targetY, targetWidth, targetHeight);
      }
      const gl = glRef.current;
      const texture = elevationDetailTextureRef.current;
      if (!gl || !texture) return;
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      elevationDetailAtlasRef.current = { canvas, bounds: nextBounds, stride: desiredStride };
      elevationDetailBoundsRef.current = normalized(nextBounds);
      elevationDetailReadyRef.current = true;
      scheduleRender();
    } catch {
      if (loadId === elevationDetailLoadRef.current && !elevationDetailAtlasRef.current) {
        elevationDetailReadyRef.current = false;
        scheduleRender();
      }
    } finally {
      if (loadId === elevationDetailLoadRef.current) {
        elevationDetailPendingRef.current = null;
        if (elevationDetailAbortRef.current === abortController) {
          elevationDetailAbortRef.current = null;
        }
      }
    }
  }, [scheduleRender]);

  const refreshCityLayer = useCallback(() => {
    if (cityRefreshFrameRef.current) return;
    cityRefreshFrameRef.current = window.requestAnimationFrame(() => {
      cityRefreshFrameRef.current = 0;
      const catalog = cityCatalogRef.current;
      if (!catalog) return;
      const threshold = cityPopulationThreshold(viewRef.current.zoom);
      if (threshold === cityPopulationThresholdRef.current) {
        scheduleRender();
        return;
      }
      cityPopulationThresholdRef.current = threshold;
      const visibleCities = citiesForZoom(catalog, viewRef.current.zoom);
      if (constructionMode && constructionCitySourceIds.length) {
        const visibleById = new Map(visibleCities.map((city) => [city.id, city]));
        const selectableIds = new Set(constructionCitySourceIds);
        for (const city of catalog) {
          if (selectableIds.has(city.id)) visibleById.set(city.id, city);
        }
        citySourceRef.current = [...visibleById.values()];
      } else {
        citySourceRef.current = visibleCities;
      }
      cityLayerRef.current?.setCities(citySourceRef.current);
      scheduleRender();
    });
  }, [constructionCitySourceIds, constructionMode, scheduleRender]);

  const loadCities = useCallback(() => {
    if (cityCatalogRef.current) {
      refreshCityLayer();
      return;
    }
    if (cityCatalogPendingRef.current) return;
    cityCatalogPendingRef.current = true;
    const params = new URLSearchParams({
      north: "90",
      south: "-90",
      west: "-180",
      east: "180",
      minPopulation: "50000",
      limit: "20000",
    });
    fetch(`/api/map/cities?${params.toString()}`)
      .then((response) => {
        if (!response.ok) throw new Error(`City source ${response.status}`);
        return response.json() as Promise<{ cities?: GlobeCitySource[] }>;
      })
      .then((payload) => {
        cityCatalogRef.current = payload.cities ?? [];
        refreshCityLayer();
      })
      .catch(() => undefined)
      .finally(() => {
        cityCatalogPendingRef.current = false;
      });
  }, [refreshCityLayer]);

  const queueCities = useCallback(
    (delay = 40) => {
      if (cityTimerRef.current) clearTimeout(cityTimerRef.current);
      cityTimerRef.current = setTimeout(() => {
        cityTimerRef.current = null;
        loadCities();
      }, delay);
    },
    [loadCities],
  );

  const queueElevationDetail = useCallback(
    (delay = 140) => {
      if (elevationDetailTimerRef.current) clearTimeout(elevationDetailTimerRef.current);
      elevationDetailTimerRef.current = setTimeout(() => {
        elevationDetailTimerRef.current = null;
        void loadElevationDetailTexture();
      }, delay);
    },
    [loadElevationDetailTexture],
  );

  const queueDetailTexture = useCallback(
    (delay = 180) => {
      if (detailTimerRef.current) clearTimeout(detailTimerRef.current);
      detailTimerRef.current = setTimeout(loadDetailTexture, delay);
      queueElevationDetail(Math.min(delay, 140));
      queueCities(Math.min(delay, 40));
    },
    [loadDetailTexture, queueCities, queueElevationDetail],
  );

  useEffect(() => {
    queueDetailTextureRef.current = queueDetailTexture;
  }, [queueDetailTexture]);

  useEffect(() => {
    queueElevationDetailRef.current = queueElevationDetail;
  }, [queueElevationDetail]);

  useEffect(() => {
    countryDisplayColorsRef.current = countryDisplayColors;
    const gl = glRef.current;
    const texture = baseTextureRef.current;
    const sampler = samplerRef.current;
    if (gl && texture && sampler) {
      const display = recoloredCanvas(sampler);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
      if (display) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, display);
      } else {
        const original = document.createElement("canvas");
        original.width = sampler.width;
        original.height = sampler.height;
        original
          .getContext("2d")
          ?.putImageData(new ImageData(new Uint8ClampedArray(sampler.data), sampler.width), 0, 0);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, original);
      }
      detailReadyRef.current = false;
      scheduleRender();
      queueDetailTextureRef.current(0);
    }
  }, [countryDisplayColors, recoloredCanvas, scheduleRender]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", {
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    const program = gl ? createProgram(gl) : null;
    if (!gl || !program) {
      window.requestAnimationFrame(() => setStatus("unsupported"));
      return;
    }
    glRef.current = gl;
    detailTextureSizeRef.current =
      Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) >= DETAIL_TEXTURE_WIDTH
        ? DETAIL_TEXTURE_WIDTH
        : 2048;
    elevationDetailTextureSizeRef.current = 768;
    programRef.current = program;
    uniformsRef.current = globeUniformLocations(gl, program);
    const createTexture = (unit: number) => {
      const texture = gl.createTexture();
      gl.activeTexture(unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array([12, 20, 30, 255]),
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      return texture;
    };
    const baseTexture = createTexture(gl.TEXTURE0);
    const detailTexture = createTexture(gl.TEXTURE1);
    const elevationTexture = createTexture(gl.TEXTURE2);
    const elevationDetailTexture = createTexture(gl.TEXTURE3);
    baseTextureRef.current = baseTexture;
    detailTextureRef.current = detailTexture;
    elevationTextureRef.current = elevationTexture;
    elevationDetailTextureRef.current = elevationDetailTexture;
    elevationReadyRef.current = false;
    elevationDetailReadyRef.current = false;
    gl.useProgram(program);
    gl.uniform1i(uniformsRef.current.map ?? null, 0);
    gl.uniform1i(uniformsRef.current.detailMap ?? null, 1);
    gl.uniform1i(uniformsRef.current.elevation ?? null, 2);
    gl.uniform1i(uniformsRef.current.elevationDetail ?? null, 3);
    gl.activeTexture(gl.TEXTURE0);

    let active = true;
    const elevationImage = new Image();
    elevationImage.decoding = "async";
    elevationImage.onload = () => {
      if (!active) return;
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, elevationTexture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, elevationImage);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      elevationReadyRef.current = true;
      scheduleRender();
    };
    elevationImage.onerror = () => {
      if (!active) return;
      elevationReadyRef.current = false;
      scheduleRender();
    };
    elevationImage.src = "/map/etopo-2022-relief-rg.png";

    const observer = new ResizeObserver(() => {
      scheduleRender();
      queueDetailTextureRef.current();
    });
    observer.observe(canvas);
    scheduleRender();

    return () => {
      active = false;
      observer.disconnect();
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
      if (animationRef.current) window.cancelAnimationFrame(animationRef.current);
      if (detailTimerRef.current) clearTimeout(detailTimerRef.current);
      if (elevationDetailTimerRef.current) clearTimeout(elevationDetailTimerRef.current);
      if (cityTimerRef.current) clearTimeout(cityTimerRef.current);
      if (cityRefreshFrameRef.current) window.cancelAnimationFrame(cityRefreshFrameRef.current);
      frameRef.current = 0;
      animationRef.current = 0;
      detailTimerRef.current = null;
      elevationDetailTimerRef.current = null;
      detailLoadRef.current += 1;
      elevationDetailLoadRef.current += 1;
      elevationDetailAbortRef.current?.abort();
      elevationDetailAbortRef.current = null;
      gl.deleteTexture(baseTexture);
      gl.deleteTexture(detailTexture);
      gl.deleteTexture(elevationTexture);
      gl.deleteTexture(elevationDetailTexture);
      gl.deleteProgram(program);
      glRef.current = null;
      programRef.current = null;
      baseTextureRef.current = null;
      detailTextureRef.current = null;
      elevationTextureRef.current = null;
      elevationDetailTextureRef.current = null;
      elevationReadyRef.current = false;
      elevationDetailReadyRef.current = false;
      elevationDetailAtlasRef.current = null;
      elevationDetailPendingRef.current = null;
      cityTimerRef.current = null;
      cityRefreshFrameRef.current = 0;
    };
  }, [scheduleRender]);

  // React의 onWheel은 패시브로 등록되어 preventDefault가 막히므로 직접 붙인다.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const view = viewRef.current;
    const animateZoom = (now: number) => {
      const elapsed = zoomPreviousFrameRef.current
        ? Math.min(48, now - zoomPreviousFrameRef.current)
        : 16;
      zoomPreviousFrameRef.current = now;
      const current = view.zoom;
      const target = zoomTargetRef.current;
      const blend = 1 - Math.exp(-elapsed / 82);
      const next = current + (target - current) * blend;
      view.zoom = Math.abs(target - next) < 0.0005 ? target : next;
      scheduleRender();
      if (view.zoom !== target) {
        zoomAnimationRef.current = window.requestAnimationFrame(animateZoom);
      } else {
        zoomAnimationRef.current = 0;
        zoomPreviousFrameRef.current = 0;
        queueDetailTexture(0);
      }
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      touchedRef.current = true;
      const unit =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? canvas.clientHeight
            : 1;
      const delta = Math.max(-240, Math.min(240, event.deltaY * unit));
      const factor = Math.exp(-delta * 0.00135);
      zoomTargetRef.current = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, zoomTargetRef.current * factor),
      );
      queueElevationDetailRef.current(90);
      if (!zoomAnimationRef.current) {
        zoomPreviousFrameRef.current = 0;
        zoomAnimationRef.current = window.requestAnimationFrame(animateZoom);
      }
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      canvas.removeEventListener("wheel", onWheel);
      if (zoomAnimationRef.current) window.cancelAnimationFrame(zoomAnimationRef.current);
      zoomAnimationRef.current = 0;
      zoomPreviousFrameRef.current = 0;
      zoomTargetRef.current = view.zoom;
    };
  }, [queueDetailTexture, scheduleRender]);

  useEffect(() => {
    assignmentsRef.current = new Map(
      colorAssignments.map((item) => [item.colorHex.toUpperCase(), item.countryId]),
    );
  }, [colorAssignments]);

  useEffect(() => {
    detailLoadRef.current += 1;
    detailReadyRef.current = false;
    scheduleRender();
    if (!rasterRevision) return;
    let active = true;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      if (!active) return;
      fitRef.current = projectionFit(projection, image.naturalWidth, image.naturalHeight);
      const gl = glRef.current;
      const offscreen = document.createElement("canvas");
      offscreen.width = image.naturalWidth;
      offscreen.height = image.naturalHeight;
      const context = offscreen.getContext("2d", { willReadFrequently: true });
      if (context) {
        context.imageSmoothingEnabled = false;
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, offscreen.width, offscreen.height);
        samplerRef.current = {
          data: pixels.data,
          width: offscreen.width,
          height: offscreen.height,
        };
        const bounds = detectMapBounds(samplerRef.current);
        seaColorRef.current =
          detectSeaColor(samplerRef.current, assignmentsRef.current, Boolean(bounds)) ??
          DEFAULT_SEA_COLOR;
        if (bounds) {
          fitRef.current = boundsFit(bounds, offscreen.width, offscreen.height);
          extendMapEdges(samplerRef.current, bounds);
          context.putImageData(pixels, 0, 0);
        }
        centroidsRef.current = buildCentroids(
          samplerRef.current,
          projection,
          fitRef.current,
          assignmentsRef.current,
        );
        const home = centroidsRef.current.get(ownCountryId);
        if (home && !touchedRef.current) {
          viewRef.current.lon = home.lon;
          viewRef.current.lat = home.lat;
        }
      }
      // 가장자리를 늘린 결과를 GPU도 같이 쓰도록 캔버스를 올린다. 2D 컨텍스트가 없으면 원본을 쓴다.
      if (gl && baseTextureRef.current) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, baseTextureRef.current);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          context ? (recoloredCanvas(samplerRef.current!) ?? offscreen) : image,
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      }
      labelLayerRef.current?.setLabels(labelSourceRef.current, projection, fitRef.current);
      setStatus("ready");
      queueDetailTextureRef.current(0);
      scheduleRender();
    };
    image.onerror = () => {
      if (active) setStatus("failed");
    };
    image.src = `/api/map/globe/texture?mapId=${encodeURIComponent(mapId)}&v=${rasterRevision}&pv=3&layers=${encodeURIComponent(borderLayerKey)}&size=${BASE_TEXTURE_WIDTH}`;
    return () => {
      active = false;
    };
  }, [
    borderLayerKey,
    mapId,
    ownCountryId,
    projection,
    rasterRevision,
    recoloredCanvas,
    scheduleRender,
  ]);

  useEffect(() => {
    const host = administrativeBoundaryHostRef.current;
    if (!host) return;
    const layer = createGlobeAdministrativeBoundaryLayer(host);
    administrativeBoundaryLayerRef.current = layer;
    scheduleRender();
    return () => {
      layer.clear();
      administrativeBoundaryLayerRef.current = null;
    };
  }, [scheduleRender]);

  useEffect(() => {
    const layer = administrativeBoundaryLayerRef.current;
    if (!layer) return;
    if (!boundaryPoint) {
      layer.clear();
      scheduleRender();
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({
      v: "2",
      lon: boundaryPoint.lon.toFixed(6),
      lat: boundaryPoint.lat.toFixed(6),
    });
    layer.clear();
    scheduleRender();
    fetch(`/api/map/administrative-boundaries?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Administrative boundaries ${response.status}`);
        return response.json() as Promise<{ boundaries?: AdministrativeBoundarySource[] }>;
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        layer.setBoundaries(payload.boundaries ?? []);
        scheduleRender();
      })
      .catch((error) => {
        if (error instanceof Error && error.name === "AbortError") return;
        layer.clear();
        scheduleRender();
      });
    return () => controller.abort();
  }, [boundaryPoint, scheduleRender]);

  useEffect(() => {
    const host = labelHostRef.current;
    if (!host) return;
    const layer = createGlobeLabelLayer(host);
    labelLayerRef.current = layer;
    layer.setLabels(labelSourceRef.current, projection, fitRef.current);
    scheduleRender();
    return () => {
      layer.clear();
      labelLayerRef.current = null;
    };
  }, [projection, scheduleRender]);

  useEffect(() => {
    const host = cityHostRef.current;
    if (!host) return;
    const layer = createGlobeCityLayer(host);
    cityLayerRef.current = layer;
    layer.setCities(citySourceRef.current);
    scheduleRender();
    queueCities(0);
    return () => {
      layer.clear();
      cityLayerRef.current = null;
    };
  }, [queueCities, scheduleRender]);

  useEffect(() => {
    cityLayerRef.current?.setInteractiveCities(
      constructionMode ? constructionCitySourceIds : [],
      constructionMode ? (selectedConstructionCity?.cityId ?? null) : null,
    );
    scheduleRender();
  }, [
    constructionCitySourceIds,
    constructionMode,
    scheduleRender,
    selectedConstructionCity?.cityId,
  ]);

  useEffect(() => {
    showCitiesRef.current = showCities;
    if (showCities) queueCities(0);
    scheduleRender();
  }, [queueCities, scheduleRender, showCities]);

  useEffect(() => {
    const canvas = satelliteCanvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    });
    if (!gl) return;
    const layer = createSatelliteConstellationLayer(gl);
    satelliteLayerRef.current = layer;
    drawSatellites();
    return () => {
      layer.clear();
      satelliteLayerRef.current = null;
    };
  }, [drawSatellites]);

  useEffect(() => {
    showSatellitesRef.current = showSatellites;
    drawSatellites();
    if (!showSatellites) return;
    let frame = 0;
    let previous = 0;
    const animate = (now: number) => {
      if (now - previous >= 50) {
        previous = now;
        drawSatellites(now);
      }
      frame = window.requestAnimationFrame(animate);
    };
    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [drawSatellites, showSatellites]);

  useEffect(() => {
    let previous = 0;
    const animate = (now: number) => {
      if (now - previous >= 80) {
        previous = now;
        render();
      }
      celestialAnimationRef.current = window.requestAnimationFrame(animate);
    };
    celestialAnimationRef.current = window.requestAnimationFrame(animate);
    return () => {
      window.cancelAnimationFrame(celestialAnimationRef.current);
      celestialAnimationRef.current = 0;
    };
  }, [render]);

  useEffect(() => {
    if (!rasterRevision) return;
    let active = true;
    fetch(`/api/map/globe/labels?mapId=${encodeURIComponent(mapId)}&v=${rasterRevision}`)
      .then((response) => (response.ok ? response.json() : { labels: [] }))
      .then((payload: { labels?: GlobeLabelSource[] }) => {
        if (!active) return;
        labelSourceRef.current = payload.labels ?? [];
        labelLayerRef.current?.setLabels(labelSourceRef.current, projection, fitRef.current);
        scheduleRender();
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [mapId, projection, rasterRevision, scheduleRender]);

  useEffect(() => {
    scheduleRender();
  }, [scheduleRender, showGrid]);

  useEffect(() => {
    queueDetailTexture();
  }, [dossierOpen, queueDetailTexture]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    let active = true;
    fetch(`/api/diplomacy/country?countryId=${encodeURIComponent(selectedId)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = (await response.json()) as DiplomacyDetail & { error?: string };
        if (!response.ok) throw new Error(result.error ?? "국가 정보를 불러오지 못했습니다.");
        if (active) setDetails(result);
      })
      .catch((error) => {
        if (active && error instanceof Error && error.name !== "AbortError") setDetails(null);
      })
      .finally(() => {
        if (active) setDetailsLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedId]);

  function screenToLonLat(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const bounds = canvas.getBoundingClientRect();
    const panelWidth = dossierOpen
      ? constructionMode
        ? bounds.width * 0.4
        : Math.min(560, bounds.width * 0.46)
      : 0;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    return globePointToLonLat(
      ((clientX - bounds.left) * canvas.width) / bounds.width,
      ((clientY - bounds.top) * canvas.height) / bounds.height,
      canvas.width,
      canvas.height,
      panelWidth * ratio,
      viewRef.current,
    );
  }

  function countryAt(clientX: number, clientY: number) {
    const sampler = samplerRef.current;
    const point = screenToLonLat(clientX, clientY);
    if (!sampler || !point) return null;
    return sampleCountry(
      sampler,
      projection,
      fitRef.current,
      assignmentsRef.current,
      point.lon,
      point.lat,
    );
  }

  function animateTo(target: { lon: number; lat: number }) {
    touchedRef.current = true;
    if (animationRef.current) window.cancelAnimationFrame(animationRef.current);
    const start = { ...viewRef.current };
    let delta = target.lon - start.lon;
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;
    const startedAt = performance.now();
    const duration = 620;
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      viewRef.current.lon = start.lon + delta * eased;
      viewRef.current.lat = start.lat + (target.lat - start.lat) * eased;
      render();
      if (progress < 1) animationRef.current = window.requestAnimationFrame(step);
      else {
        animationRef.current = 0;
        queueDetailTexture(0);
      }
    };
    animationRef.current = window.requestAnimationFrame(step);
  }

  function openCountry(countryId: string, focus = true) {
    if (focus) {
      const centroid = centroidsRef.current.get(countryId);
      if (centroid) animateTo(centroid);
    }
    if (countryId === selectedId) return;
    setDetails(null);
    setDetailsLoading(true);
    setSelectedId(countryId);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) return;
    touchedRef.current = true;
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // 포인터 캡처를 지원하지 않는 환경에서는 캔버스 위 이동만으로 회전한다.
    }
    if (animationRef.current) {
      window.cancelAnimationFrame(animationRef.current);
      animationRef.current = 0;
    }
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (drag && drag.pointerId === event.pointerId) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const bounds = canvas.getBoundingClientRect();
      const radius = (Math.min(bounds.width, bounds.height) / 2) * viewRef.current.zoom;
      const deltaX = event.clientX - drag.x;
      const deltaY = event.clientY - drag.y;
      if (Math.abs(deltaX) + Math.abs(deltaY) > 3) drag.moved = true;
      const scale = 57.2958 / Math.max(radius, 1);
      viewRef.current.lon = viewRef.current.lon - deltaX * scale;
      viewRef.current.lat = Math.max(
        -88,
        Math.min(88, viewRef.current.lat + deltaY * scale * 0.85),
      );
      drag.x = event.clientX;
      drag.y = event.clientY;
      if (hover) setHover(null);
      scheduleRender();
      queueDetailTexture(140);
      return;
    }
    const countryId = countryAt(event.clientX, event.clientY);
    if (!countryId) {
      if (hover) setHover(null);
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    setHover({
      id: countryId,
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    });
  }

  function handlePointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!drag) return;
    if (drag.moved) {
      queueDetailTexture(0);
      return;
    }
    if (constructionMode && construction) {
      const bounds = event.currentTarget.getBoundingClientRect();
      const city = cityLayerRef.current?.hitTest(
        event.clientX - bounds.left,
        event.clientY - bounds.top,
      );
      const campaignCity = city
        ? construction.cities.find((item) => item.cityId === city.id)
        : null;
      if (campaignCity) setConstructionCityId(campaignCity.id);
      return;
    }
    const point = screenToLonLat(event.clientX, event.clientY);
    setBoundaryPoint(point);
    const countryId = countryAt(event.clientX, event.clientY);
    if (!countryId || countryId === ownCountryId) return;
    playCountrySelectSound();
    openCountry(countryId, false);
  }

  function handleContextMenu(event: React.MouseEvent<HTMLCanvasElement>) {
    event.preventDefault();
    const countryId = countryAt(event.clientX, event.clientY);
    if (!countryId || countryId === ownCountryId) return;
    playCountrySelectSound();
    openCountry(countryId, false);
  }

  const selected = countries.find((country) => country.id === selectedId) ?? null;
  const hoveredCountry = hover ? countries.find((country) => country.id === hover.id) : null;
  const hoveredMapDatum = hover ? mapModeData.find((datum) => datum.countryId === hover.id) : null;
  const hoveredMapValue = (() => {
    if (!hoveredMapDatum) return null;
    if (!mapMode) return null;
    const gdp = hoveredMapDatum.nominalGdp === null ? null : Number(hoveredMapDatum.nominalGdp);
    const population =
      hoveredMapDatum.population === null ? null : Number(hoveredMapDatum.population);
    if (mapMode === "GDP") {
      return gdp === null ? "GDP 자료 없음" : `GDP $${gdp.toLocaleString("ko-KR")}M`;
    }
    if (mapMode === "GDP_PER_CAPITA") {
      const value =
        gdp === null || !population
          ? "1인당 GDP 자료 없음"
          : `1인당 GDP $${Math.round((gdp * 1_000_000) / population).toLocaleString("ko-KR")}`;
      return value;
    }
    if (mapMode === "POPULATION") {
      const value =
        population === null
          ? "인구 자료 없음"
          : `인구 ${Math.round(population).toLocaleString("ko-KR")}명`;
      return value;
    }
    const value =
      mapMode === "BLOC"
        ? (hoveredMapDatum.diplomaticBlocName ?? "소속 세력 없음")
        : (hoveredMapDatum.economicBlocName ?? "소속 경제권 없음");
    return value;
  })();
  const normalizedSearch = countrySearch.trim().toLocaleLowerCase("ko-KR");
  const rosterCountries = normalizedSearch
    ? countries
        .filter(
          (country) =>
            country.id !== ownCountryId &&
            `${country.name} ${country.code}`.toLocaleLowerCase("ko-KR").includes(normalizedSearch),
        )
        .slice(0, 30)
    : [];

  return (
    <div
      className={`globe-stage ${dossierOpen ? "has-diplomacy-dossier" : ""} ${constructionMode ? "has-construction-panel" : ""}`}
    >
      <canvas
        ref={canvasRef}
        className="globe-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onContextMenu={handleContextMenu}
        onPointerLeave={() => setHover(null)}
        aria-label="구체 세계 지도"
      />
      <canvas
        ref={satelliteCanvasRef}
        className="satellite-constellation-layer"
        aria-hidden="true"
      />
      <canvas
        ref={administrativeBoundaryHostRef}
        className="globe-administrative-boundary-layer"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          zIndex: 6,
          pointerEvents: "none",
        }}
        aria-hidden="true"
      />
      <canvas
        ref={cityHostRef}
        className="globe-city-layer"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          zIndex: 7,
          display: showCities ? "block" : "none",
          pointerEvents: "none",
          fontFamily: "var(--title)",
        }}
        aria-hidden="true"
      />
      <svg className="globe-label-layer" aria-hidden="true">
        <g ref={labelHostRef} />
      </svg>

      {showSatellites ? (
        <div className="satellite-constellation-legend" aria-label="위성통신망 범례">
          <span data-network="starlink">STARLINK</span>
          <span data-network="europe">EUROPE</span>
          <span data-network="china">CHINA</span>
        </div>
      ) : null}

      {status !== "ready" && (
        <div className="globe-status">
          {status === "loading" && "지구 궤도 관측망 동기화 중…"}
          {status === "unsupported" && "이 브라우저에서 WebGL2를 사용할 수 없습니다."}
          {status === "failed" && "지도 텍스처를 불러오지 못했습니다."}
        </div>
      )}

      {hover && hoveredCountry && (
        <div
          className="pixel-map-hover"
          style={{ left: `${hover.x}px`, top: `${hover.y}px` }}
          aria-hidden="true"
        >
          <i style={{ background: hoveredCountry.color }} />
          {hoveredCountry.name}
          {hoveredCountry.id === ownCountryId && <em>자국</em>}
          {hoveredMapValue ? <em>{hoveredMapValue}</em> : null}
        </div>
      )}

      {!constructionMode && (
        <aside className="globe-left-dock-sector" aria-label="검색, 알림 및 외교 전문">
          <div className="globe-search-field">
            <input
              type="search"
              value={countrySearch}
              onChange={(event) => setCountrySearch(event.target.value)}
              onFocus={() => setSearchOpen(true)}
              placeholder="국가 검색"
              aria-label="국가 검색어"
              aria-controls="globe-country-search"
            />

            {searchOpen && normalizedSearch ? (
              <aside
                className="diplomacy-country-rail globe-rail globe-search-results"
                id="globe-country-search"
                aria-label="국가 검색 결과"
              >
                <div className="diplomacy-rail-list">
                  {rosterCountries.length === 0 ? (
                    <p>검색 결과가 없습니다.</p>
                  ) : (
                    rosterCountries.map((country) => {
                      const relation = relations.find((item) => item.toCountryId === country.id);
                      const score = relation?.score ?? 0;
                      return (
                        <button
                          type="button"
                          key={country.id}
                          data-click-sound="country"
                          className={country.id === selectedId ? "active" : ""}
                          onClick={() => {
                            setSearchOpen(false);
                            playCountrySelectSound();
                            openCountry(country.id);
                          }}
                          title={country.name}
                        >
                          <i style={{ background: country.color }} />
                          <span>{country.name}</span>
                          <b className={score >= 25 ? "warm" : score > -25 ? "neutral" : "cold"}>
                            {score > 0 ? `+${score}` : score}
                          </b>
                        </button>
                      );
                    })
                  )}
                </div>
              </aside>
            ) : null}
          </div>

          <button
            type="button"
            className={inboxOpen ? "globe-sector-action open" : "globe-sector-action"}
            aria-expanded={inboxOpen}
            onClick={() => {
              setSearchOpen(false);
              setInboxOpen((open) => !open);
            }}
          >
            <span>외교 전문</span>
            <strong>{inboxCount}</strong>
          </button>
        </aside>
      )}

      {!constructionMode && inboxOpen && (
        <section className="globe-drawer" aria-label="외교 전문 기록">
          <header>
            <h2>외교 전문 기록</h2>
            <button type="button" onClick={() => setInboxOpen(false)} aria-label="닫기">
              ✕
            </button>
          </header>
          <div className="globe-drawer-body">{children}</div>
        </section>
      )}

      {!constructionMode && selected && (
        <TnoDiplomacyPanel
          selected={selected}
          own={ownCountry}
          detail={details}
          loading={detailsLoading}
          turnOpen={turnOpen}
          onOpenInbox={() => setInboxOpen(true)}
          onClose={() => {
            setSelectedId(null);
            setDetails(null);
            setDetailsLoading(false);
          }}
        />
      )}

      {constructionMode && construction && (
        <aside
          className="construction-map-panel"
          aria-label="도시 건설"
          style={{
            top: 0,
            right: 0,
            bottom: 0,
            left: "auto",
            width: "40vw",
            minWidth: 0,
            borderColor: "rgba(134, 231, 227, 0.82)",
            boxShadow:
              "inset 0 0 0 2px rgba(111, 227, 227, 0.34), -12px 0 38px rgba(0, 0, 0, 0.55), 0 0 18px rgba(111, 227, 227, 0.12)",
          }}
        >
          <header
            className="construction-map-titlebar"
            style={{ borderBottomColor: "rgba(134, 231, 227, 0.72)" }}
          >
            <div>
              <span>국토 개발</span>
              <h2>건설</h2>
            </div>
            <div>
              <b>{construction.cities.length}</b>
              <span>통제 도시</span>
              <b>{construction.projects.length}</b>
              <span>대기열</span>
            </div>
          </header>
          <ConstructionWorkspace
            {...construction}
            compact
            selectedCityId={constructionCityId}
            onSelectCity={setConstructionCityId}
          />
        </aside>
      )}
    </div>
  );
}
