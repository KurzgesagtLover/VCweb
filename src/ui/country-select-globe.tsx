"use client";

import NextImage from "next/image";
import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormState } from "@/src/actions/auth";
import { applyForCountryAction } from "@/src/actions/country";
import { CountryFlag } from "./country-flag";
import {
  COUNTRY_ENTITY_TYPE_LABELS,
  type CountryEntityType,
} from "@/src/domain/country/entity-type";
import {
  IDENTITY_FIT,
  boundsFit,
  projectToUv,
  projectionFit,
  projectionMode,
  type MapProjection,
  type ProjectionFit,
} from "@/src/domain/map/projection";
import {
  BASE_TEXTURE_WIDTH,
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
  sampleCountry,
  type Sampler,
} from "./globe-core";
import { createGlobeLabelLayer, type GlobeLabelLayer, type GlobeLabelSource } from "./globe-labels";
import { playCountrySelectSound } from "./ui-click-sound";

export type NationalSpirit = { name: string; description: string | null };

export type SelectableCountry = {
  id: string;
  name: string;
  code: string;
  color: string;
  entityType: CountryEntityType;
  flag: string | null;
  leaderName: string | null;
  leaderTitle: string | null;
  leaderPortrait: string | null;
  ideology: string;
  rulingParty: string | null;
  rulingPartyColor: string | null;
  elections: string;
  governmentForm: string | null;
  capital: string | null;
  stability: number | null;
  spirits: NationalSpirit[];
  history: string | null;
  available: boolean;
  unavailableReason: string | null;
};

type TextureWindow = { left: number; top: number; width: number; height: number };

// 라벨이 보이는 배율에서 시작한다.
const SELECT_DEFAULT_ZOOM = 1.05;
const DETAIL_ZOOM_THRESHOLD = 1;
const SELECT_BORDER_LAYERS = "";

const PENALTY_WORDS = /악화|감소|하락|저하|약화|손실|불이익|제한/;

// 국민정신 설명은 자유 서술이므로 글머리표로 시작하는 줄만 효과 목록으로 떼어 낸다.
// 부호를 붙이지 않은 줄은 문구로 이로운 효과인지 판단해 색을 나눈다.
function splitSpiritText(description: string | null) {
  const lines = (description ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const body: string[] = [];
  const modifiers: Array<{ text: string; penalty: boolean }> = [];
  for (const line of lines) {
    if (!/^[-•*+]/.test(line)) {
      body.push(line);
      continue;
    }
    const text = line.replace(/^[-•*+]\s*/, "");
    const penalty = line.startsWith("-") || PENALTY_WORDS.test(text);
    modifiers.push({ text, penalty });
  }
  return { body: body.join(" ") || null, modifiers };
}

export function CountrySelectGlobe({
  mapId,
  rasterRevision,
  projection,
  colorAssignments,
  countries,
  currentCountryId,
  mode,
}: {
  mapId: string;
  rasterRevision: number;
  projection: MapProjection;
  colorAssignments: Array<{ colorHex: string; countryId: string }>;
  countries: SelectableCountry[];
  currentCountryId: string | null;
  mode: "ASSIGN" | "TRANSFER";
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const uniformsRef = useRef<Record<string, WebGLUniformLocation | null>>({});
  const baseTextureRef = useRef<WebGLTexture | null>(null);
  const detailTextureRef = useRef<WebGLTexture | null>(null);
  const detailBoundsRef = useRef<TextureWindow>({ left: 0, top: 0, width: 1, height: 1 });
  const detailReadyRef = useRef(false);
  const detailLoadRef = useRef(0);
  const detailTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detailSizeRef = useRef(2048);
  const queueDetailRef = useRef<(delay?: number) => void>(() => undefined);
  const samplerRef = useRef<Sampler | null>(null);
  const labelHostRef = useRef<SVGGElement>(null);
  const labelLayerRef = useRef<GlobeLabelLayer | null>(null);
  const labelSourceRef = useRef<GlobeLabelSource[]>([]);
  const centroidsRef = useRef<Map<string, { lon: number; lat: number }>>(new Map());
  const seaColorRef = useRef<[number, number, number]>(DEFAULT_SEA_COLOR);
  const fitRef = useRef<ProjectionFit>(IDENTITY_FIT);
  const viewRef = useRef({ lon: 0, lat: 18, zoom: SELECT_DEFAULT_ZOOM });
  const dragRef = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null);
  const frameRef = useRef(0);
  const animationRef = useRef(0);
  const zoomAnimationRef = useRef(0);
  const zoomTargetRef = useRef(SELECT_DEFAULT_ZOOM);
  const zoomPreviousFrameRef = useRef(0);
  const assignmentsRef = useRef(
    new Map(colorAssignments.map((item) => [item.colorHex.toUpperCase(), item.countryId])),
  );

  const [status, setStatus] = useState<"loading" | "ready" | "unsupported" | "failed">("loading");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [search, setSearch] = useState("");
  const [state, action, submitting] = useActionState<FormState, FormData>(
    applyForCountryAction,
    {},
  );

  const countryById = useMemo(
    () => new Map(countries.map((country) => [country.id, country])),
    [countries],
  );
  const selected = selectedId ? (countryById.get(selectedId) ?? null) : null;
  const hoveredCountry = hover ? (countryById.get(hover.id) ?? null) : null;

  // 서류창이 화면 하단을 차지하므로 캔버스 자체가 줄어든다. 구체는 남은 영역의 정중앙에 둔다.
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
    gl.viewport(0, 0, width, height);
    gl.useProgram(program);
    gl.uniform2f(uniforms.center ?? null, width / 2, height / 2);
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
    gl.uniform1f(uniforms.grid ?? null, 0);
    gl.uniform1f(uniforms.coastline ?? null, 1);
    const detailBounds = detailBoundsRef.current;
    gl.uniform4f(
      uniforms.detailBounds ?? null,
      detailBounds.left,
      detailBounds.top,
      detailBounds.width,
      detailBounds.height,
    );
    gl.uniform1f(uniforms.detailReady ?? null, detailReadyRef.current ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    labelLayerRef.current?.draw({
      width: canvas.clientWidth,
      height: canvas.clientHeight,
      panelInset: 0,
      view,
    });
  }, [projection]);

  const scheduleRender = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = 0;
      render();
    });
  }, [render]);

  const visibleTextureWindow = useCallback((): TextureWindow | null => {
    const canvas = canvasRef.current;
    const view = viewRef.current;
    if (!canvas || view.zoom < DETAIL_ZOOM_THRESHOLD) return null;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const points: Array<{ u: number; v: number }> = [];
    for (let row = 0; row <= 8; row += 1) {
      for (let column = 0; column <= 10; column += 1) {
        const point = globePointToLonLat(
          (width * column) / 10,
          (height * row) / 8,
          width,
          height,
          0,
          view,
        );
        if (point) points.push(projectToUv(projection, point.lon, point.lat, fitRef.current));
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
  }, [projection]);

  const loadDetailTexture = useCallback(() => {
    if (!rasterRevision) return;
    const bounds = visibleTextureWindow();
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
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
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
      layers: SELECT_BORDER_LAYERS,
      size: String(detailSizeRef.current),
      left: String(requestBounds.left),
      top: String(requestBounds.top),
      width: String(requestBounds.width),
      height: String(requestBounds.height),
    });
    image.src = `/api/map/globe/texture?${params.toString()}`;
  }, [mapId, rasterRevision, scheduleRender, visibleTextureWindow]);

  const queueDetailTexture = useCallback(
    (delay = 180) => {
      if (detailTimerRef.current) clearTimeout(detailTimerRef.current);
      detailTimerRef.current = setTimeout(loadDetailTexture, delay);
    },
    [loadDetailTexture],
  );

  useEffect(() => {
    queueDetailRef.current = queueDetailTexture;
  }, [queueDetailTexture]);

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
    detailSizeRef.current =
      Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) >= DETAIL_TEXTURE_WIDTH
        ? DETAIL_TEXTURE_WIDTH
        : 2048;
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
    baseTextureRef.current = baseTexture;
    detailTextureRef.current = detailTexture;
    gl.useProgram(program);
    gl.uniform1i(uniformsRef.current.map ?? null, 0);
    gl.uniform1i(uniformsRef.current.detailMap ?? null, 1);
    gl.activeTexture(gl.TEXTURE0);

    const observer = new ResizeObserver(() => {
      scheduleRender();
      queueDetailRef.current();
    });
    observer.observe(canvas);
    scheduleRender();

    return () => {
      observer.disconnect();
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
      if (animationRef.current) window.cancelAnimationFrame(animationRef.current);
      if (detailTimerRef.current) clearTimeout(detailTimerRef.current);
      frameRef.current = 0;
      animationRef.current = 0;
      detailTimerRef.current = null;
      detailLoadRef.current += 1;
      gl.deleteTexture(baseTexture);
      gl.deleteTexture(detailTexture);
      gl.deleteProgram(program);
      glRef.current = null;
      programRef.current = null;
      baseTextureRef.current = null;
      detailTextureRef.current = null;
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
      }
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
          context ? offscreen : image,
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      }
      labelLayerRef.current?.setLabels(labelSourceRef.current, projection, fitRef.current);
      setStatus("ready");
      queueDetailRef.current(0);
      scheduleRender();
    };
    image.onerror = () => {
      if (active) setStatus("failed");
    };
    image.src = `/api/map/globe/texture?mapId=${encodeURIComponent(mapId)}&v=${rasterRevision}&pv=3&layers=${SELECT_BORDER_LAYERS}&size=${BASE_TEXTURE_WIDTH}`;
    return () => {
      active = false;
    };
  }, [mapId, projection, rasterRevision, scheduleRender]);

  useEffect(() => {
    scheduleRender();
    queueDetailTexture();
  }, [queueDetailTexture, scheduleRender, selectedId]);

  function countryAt(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    const sampler = samplerRef.current;
    if (!canvas || !sampler) return null;
    const bounds = canvas.getBoundingClientRect();
    const point = globePointToLonLat(
      clientX - bounds.left,
      clientY - bounds.top,
      bounds.width,
      bounds.height,
      0,
      viewRef.current,
    );
    if (!point) return null;
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
    setSelectedId(countryId);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) return;
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
      return;
    }
    const countryId = countryAt(event.clientX, event.clientY);
    if (!countryId || !countryById.has(countryId)) {
      if (hover) setHover(null);
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    setHover({ id: countryId, x: event.clientX - bounds.left, y: event.clientY - bounds.top });
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
    const countryId = countryAt(event.clientX, event.clientY);
    if (countryId && countryById.has(countryId)) {
      playCountrySelectSound();
      openCountry(countryId, false);
    }
  }

  const normalizedSearch = search.trim().toLocaleLowerCase("ko-KR");
  const searchResults = normalizedSearch
    ? countries
        .filter((country) =>
          `${country.name} ${country.code}`.toLocaleLowerCase("ko-KR").includes(normalizedSearch),
        )
        .slice(0, 20)
    : [];

  return (
    <div className={`cs-stage ${selected ? "is-card-open" : ""}`}>
      <canvas
        ref={canvasRef}
        className="cs-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => setHover(null)}
        aria-label="국가 선택 구체 지도"
      />
      <svg className="globe-label-layer" aria-hidden="true">
        <g ref={labelHostRef} />
      </svg>

      {status !== "ready" && (
        <p className="cs-status">
          {status === "loading" && "지구 궤도 관측망 동기화 중…"}
          {status === "unsupported" && "이 브라우저에서 WebGL2를 사용할 수 없습니다."}
          {status === "failed" && "지도 텍스처를 불러오지 못했습니다."}
        </p>
      )}

      <div className="cs-finder">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="국명 · 코드 검색"
          aria-label="국가 검색"
        />
        {searchResults.length > 0 && (
          <ul>
            {searchResults.map((country) => (
              <li key={country.id}>
                <button
                  type="button"
                  data-click-sound="country"
                  onClick={() => {
                    setSearch("");
                    playCountrySelectSound();
                    openCountry(country.id);
                  }}
                >
                  <i style={{ background: country.color }} />
                  <span>{country.name}</span>
                  {!country.available && <em>불가</em>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {hover && hoveredCountry && (
        <div className="cs-hover" style={{ left: `${hover.x}px`, top: `${hover.y}px` }} aria-hidden>
          <i style={{ background: hoveredCountry.color }} />
          {hoveredCountry.name}
          {hoveredCountry.id === currentCountryId && <em>담당 중</em>}
        </div>
      )}

      {selected && (
        <form action={action} className="cs-country-card" aria-label={`${selected.name} 국가 선택`}>
          <input type="hidden" name="countryId" value={selected.id} />
          <input type="hidden" name="kind" value={mode} />
          <input type="hidden" name="reason" value="" />

          <button
            type="button"
            className="cs-card-close"
            onClick={() => setSelectedId(null)}
            aria-label="국가 선택창 닫기"
          >
            ×
          </button>

          <section className="cs-card-flag" aria-label="국기">
            <span style={{ color: selected.color }}>
              <CountryFlag value={selected.flag} name={selected.name} />
            </span>
          </section>

          <section className="cs-card-portrait" aria-label="지도자 초상화">
            {selected.leaderPortrait ? (
              <NextImage
                src={selected.leaderPortrait}
                alt={`${selected.leaderName ?? selected.name} 초상`}
                width={210}
                height={280}
                unoptimized
              />
            ) : (
              <span>
                <CountryFlag value={selected.flag} name={selected.name} />
              </span>
            )}
            <div>
              <strong>{selected.leaderName ?? "지도자 미정"}</strong>
              {selected.leaderTitle && <small>{selected.leaderTitle}</small>}
            </div>
          </section>

          <section className="cs-card-emblem" aria-label="국장">
            <span style={{ borderColor: selected.color }}>
              <CountryFlag value={selected.flag} name={selected.name} />
            </span>
          </section>

          <header className="cs-card-name">
            <h2>{selected.name}</h2>
            <p>
              {COUNTRY_ENTITY_TYPE_LABELS[selected.entityType]} · {selected.code}
            </p>
          </header>

          <section className="cs-card-spirits" aria-label="국민정신">
            <h3>국민정신</h3>
            <div>
              {selected.spirits.length ? (
                selected.spirits.slice(0, 8).map((spirit, index) => {
                  const { body, modifiers } = splitSpiritText(spirit.description);
                  return (
                    <article key={`${spirit.name}-${index}`} className="cs-card-spirit">
                      <i aria-hidden>{index + 1}</i>
                      <span>
                        <strong>{spirit.name}</strong>
                        {body && <small>{body}</small>}
                        {modifiers.map((modifier, modifierIndex) => (
                          <small
                            key={modifierIndex}
                            className={modifier.penalty ? "is-penalty" : undefined}
                          >
                            {modifier.text}
                          </small>
                        ))}
                      </span>
                    </article>
                  );
                })
              ) : (
                <p className="cs-card-empty">등록된 국민정신 없음</p>
              )}
            </div>
          </section>

          <section className="cs-card-facts" aria-label="국가 정보">
            <h3>정보</h3>
            <dl>
              <div>
                <dt>지도자</dt>
                <dd>{selected.leaderName ?? "미정"}</dd>
              </div>
              <div>
                <dt>정부 형태</dt>
                <dd>{selected.governmentForm ?? "미상"}</dd>
              </div>
              <div>
                <dt>집권 정당</dt>
                <dd>
                  {selected.rulingPartyColor && (
                    <i style={{ background: selected.rulingPartyColor }} aria-hidden />
                  )}
                  {selected.rulingParty ?? "미상"}
                </dd>
              </div>
              <div>
                <dt>이념</dt>
                <dd>{selected.ideology}</dd>
              </div>
              <div>
                <dt>수도</dt>
                <dd>{selected.capital ?? "미공개"}</dd>
              </div>
              <div>
                <dt>선거</dt>
                <dd>{selected.elections}</dd>
              </div>
              <div>
                <dt>안정도</dt>
                <dd>{selected.stability == null ? "미상" : `${selected.stability}%`}</dd>
              </div>
            </dl>
          </section>

          <section className="cs-card-description" aria-label="국가 설명">
            <h3>설명</h3>
            <div className="cs-card-description-body">
              {selected.history ? (
                selected.history
                  .split(/\n{2,}/)
                  .map((paragraph, index) => <p key={index}>{paragraph}</p>)
              ) : (
                <p className="cs-card-empty">등록된 국가 설명이 없습니다.</p>
              )}
            </div>
            <footer className="cs-card-description-action">
              {!selected.available && (
                <span>{selected.unavailableReason ?? "선택할 수 없는 국가입니다."}</span>
              )}
              {state.error && (
                <span className="is-error" role="alert">
                  {state.error}
                </span>
              )}
              {state.success && (
                <span className="is-success" role="status">
                  {state.success}
                </span>
              )}
              {selected.available && (
                <button disabled={submitting}>{submitting ? "전송 중…" : "국가 선택"}</button>
              )}
            </footer>
          </section>
        </form>
      )}
    </div>
  );
}
