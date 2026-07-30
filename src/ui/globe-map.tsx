"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  IDENTITY_FIT,
  MAP_PROJECTION_GLSL,
  boundsFit,
  projectToUv,
  projectionFit,
  projectionMode,
  type MapProjection,
  type ProjectionFit,
} from "@/src/domain/map/projection";
import { TnoDiplomacyPanel, type DiplomacyDetail } from "./tno-diplomacy-panel";

type Country = { id: string; name: string; code: string; color: string; isAi: boolean };
type Relation = { toCountryId: string; score: number; tags: string[] };
type Assignment = { colorHex: string; countryId: string };
type OwnCountry = {
  name: string;
  code: string;
  color: string;
  flag: string;
  stability: number | null;
};

const TEXTURE_WIDTH = 4096;
const MIN_ZOOM = 0.55;
const MAX_ZOOM = 4.2;
const DEFAULT_ZOOM = 0.92;

const VERTEX_SHADER = `#version 300 es
void main() {
  float x = float((gl_VertexID << 1) & 2);
  float y = float(gl_VertexID & 2);
  gl_Position = vec4(x * 2.0 - 1.0, y * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform vec2 uCenter;
uniform float uRadius;
uniform float uLon0;
uniform float uLat0;
uniform int uMode;
uniform vec4 uFit;
uniform float uGrid;
uniform sampler2D uMap;

out vec4 outColor;

${MAP_PROJECTION_GLSL}

float hash(vec2 cell) {
  return fract(sin(dot(cell, vec2(41.7913, 78.233))) * 43758.5453);
}

vec3 starField(vec2 point) {
  vec3 accumulated = vec3(0.0);
  for (int layer = 0; layer < 3; layer += 1) {
    float cellSize = 38.0 + float(layer) * 27.0;
    vec2 scaled = point / cellSize;
    vec2 cell = floor(scaled);
    vec2 local = fract(scaled);
    float seed = hash(cell + float(layer) * 19.7);
    if (seed < 0.80) continue;
    vec2 position = vec2(hash(cell + 3.7), hash(cell + 9.13));
    float radius = (0.9 + 1.6 * fract(seed * 17.3)) / cellSize;
    float brightness = smoothstep(radius, 0.0, length(local - position));
    vec3 tint = mix(vec3(0.66, 0.74, 0.9), vec3(0.9, 0.86, 0.78), fract(seed * 7.1));
    accumulated += tint * brightness * (0.55 + 0.75 * fract(seed * 3.3));
  }
  return accumulated;
}

void main() {
  vec2 offset = gl_FragCoord.xy - uCenter;
  float x = offset.x / uRadius;
  float y = offset.y / uRadius;
  float rho = length(vec2(x, y));

  if (rho > 1.0) {
    float halo = exp(-(rho - 1.0) * 13.0);
    vec3 space = vec3(0.008, 0.014, 0.022);
    vec3 atmosphere = vec3(0.14, 0.5, 0.68) * halo * 0.36;
    outColor = vec4(space + atmosphere + starField(gl_FragCoord.xy) * (1.0 - halo), 1.0);
    return;
  }

  float c = asin(clamp(rho, 0.0, 1.0));
  float sinC = sin(c);
  float cosC = cos(c);
  float lat = uLat0;
  float lon = uLon0;
  if (rho > 1e-6) {
    lat = asin(clamp(cosC * sin(uLat0) + (y * sinC * cos(uLat0)) / rho, -1.0, 1.0));
    lon = uLon0 + atan(x * sinC, rho * cosC * cos(uLat0) - y * sinC * sin(uLat0));
  }
  lon = mod(lon + PI, 2.0 * PI) - PI;

  vec2 uv = projectToUv(uMode, lon, lat, uFit);
  vec3 surface = texture(uMap, uv).rgb;

  vec3 normal = vec3(x, y, sqrt(max(0.0, 1.0 - rho * rho)));
  vec3 lightDirection = normalize(vec3(-0.35, 0.42, 0.84));
  float diffuse = max(dot(normal, lightDirection), 0.0);
  float shade = mix(1.0, 0.62 + 0.52 * diffuse, 0.62);
  float limb = smoothstep(1.0, 0.86, rho);
  vec3 color = surface * shade * mix(0.72, 1.0, limb);

  if (uGrid > 0.5) {
    float latDeg = lat * 180.0 / PI;
    float lonDeg = lon * 180.0 / PI;
    float latLine = 1.0 - smoothstep(0.0, 0.55, abs(fract(latDeg / 15.0 + 0.5) - 0.5) * 15.0);
    float lonLine = 1.0 - smoothstep(0.0, 0.55 / max(cos(lat), 0.12),
      abs(fract(lonDeg / 15.0 + 0.5) - 0.5) * 15.0);
    float equator = 1.0 - smoothstep(0.0, 0.7, abs(latDeg));
    float grid = clamp(max(latLine, lonLine) * 0.42 + equator * 0.45, 0.0, 1.0);
    color = mix(color, vec3(0.55, 0.88, 0.96), grid * limb * 0.5);
  }

  float rim = smoothstep(0.94, 1.0, rho);
  color += vec3(0.16, 0.52, 0.7) * rim * 0.3;
  outColor = vec4(color, 1.0);
}`;

function quantizedHex(red: number, green: number, blue: number) {
  return (
    "#" +
    [red & 0xf8, green & 0xf8, blue & 0xf8]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vertex || !fragment) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

type Sampler = { data: Uint8ClampedArray; width: number; height: number };

export function GlobeMap({
  mapId,
  rasterRevision,
  projection,
  colorAssignments,
  countries,
  ownCountryId,
  ownCountry,
  relations,
  turnOpen,
  inboxCount,
  children,
}: {
  mapId: string;
  rasterRevision: number;
  projection: MapProjection;
  colorAssignments: Assignment[];
  countries: Country[];
  ownCountryId: string;
  ownCountry: OwnCountry;
  relations: Relation[];
  turnOpen: boolean;
  inboxCount: number;
  children: ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const uniformsRef = useRef<Record<string, WebGLUniformLocation | null>>({});
  const textureRef = useRef<WebGLTexture | null>(null);
  const samplerRef = useRef<Sampler | null>(null);
  const centroidsRef = useRef<Map<string, { lon: number; lat: number }>>(new Map());
  const fitRef = useRef<ProjectionFit>(IDENTITY_FIT);
  const viewRef = useRef({ lon: 0, lat: 18, zoom: DEFAULT_ZOOM });
  const dragRef = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null);
  const frameRef = useRef(0);
  const animationRef = useRef(0);
  const touchedRef = useRef(false);
  const assignmentsRef = useRef(
    new Map(colorAssignments.map((item) => [item.colorHex.toUpperCase(), item.countryId])),
  );

  const [status, setStatus] = useState<"loading" | "ready" | "unsupported" | "failed">("loading");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [details, setDetails] = useState<DiplomacyDetail | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [homeLocated, setHomeLocated] = useState(false);
  const [showBorders, setShowBorders] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const dossierOpen = Boolean(selectedId);

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
    const panelWidth = dossierOpen ? Math.min(560, canvas.clientWidth * 0.46) : 0;
    gl.viewport(0, 0, width, height);
    gl.useProgram(program);
    gl.uniform2f(uniforms.center ?? null, (width - panelWidth * ratio) / 2, height / 2);
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
    gl.uniform1f(uniforms.grid ?? null, showGrid ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }, [dossierOpen, projection, showGrid]);

  const scheduleRender = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = 0;
      render();
    });
  }, [render]);

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
    programRef.current = program;
    uniformsRef.current = {
      center: gl.getUniformLocation(program, "uCenter"),
      radius: gl.getUniformLocation(program, "uRadius"),
      lon0: gl.getUniformLocation(program, "uLon0"),
      lat0: gl.getUniformLocation(program, "uLat0"),
      mode: gl.getUniformLocation(program, "uMode"),
      fit: gl.getUniformLocation(program, "uFit"),
      grid: gl.getUniformLocation(program, "uGrid"),
      map: gl.getUniformLocation(program, "uMap"),
    };
    const texture = gl.createTexture();
    textureRef.current = texture;
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
    gl.useProgram(program);
    gl.uniform1i(uniformsRef.current.map ?? null, 0);
    gl.activeTexture(gl.TEXTURE0);

    const observer = new ResizeObserver(() => scheduleRender());
    observer.observe(canvas);
    scheduleRender();

    return () => {
      observer.disconnect();
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
      if (animationRef.current) window.cancelAnimationFrame(animationRef.current);
      frameRef.current = 0;
      animationRef.current = 0;
      gl.deleteTexture(texture);
      gl.deleteProgram(program);
      glRef.current = null;
      programRef.current = null;
      textureRef.current = null;
    };
  }, [scheduleRender]);

  // React의 onWheel은 패시브로 등록되어 preventDefault가 막히므로 직접 붙인다.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      touchedRef.current = true;
      const factor = Math.exp(-event.deltaY * 0.0014);
      viewRef.current.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, viewRef.current.zoom * factor));
      scheduleRender();
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [scheduleRender]);

  useEffect(() => {
    assignmentsRef.current = new Map(
      colorAssignments.map((item) => [item.colorHex.toUpperCase(), item.countryId]),
    );
  }, [colorAssignments]);

  useEffect(() => {
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
        setHomeLocated(Boolean(home));
        if (home && !touchedRef.current) {
          viewRef.current.lon = home.lon;
          viewRef.current.lat = home.lat;
        }
      }
      // 가장자리를 늘린 결과를 GPU도 같이 쓰도록 캔버스를 올린다. 2D 컨텍스트가 없으면 원본을 쓴다.
      if (gl && textureRef.current) {
        gl.bindTexture(gl.TEXTURE_2D, textureRef.current);
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
      setStatus("ready");
      scheduleRender();
    };
    image.onerror = () => {
      if (active) setStatus("failed");
    };
    image.src = `/api/map/globe?mapId=${encodeURIComponent(mapId)}&v=${rasterRevision}&borders=${
      showBorders ? "1" : "0"
    }&size=${TEXTURE_WIDTH}`;
    return () => {
      active = false;
    };
  }, [mapId, ownCountryId, projection, rasterRevision, scheduleRender, showBorders]);

  useEffect(() => {
    scheduleRender();
  }, [scheduleRender, showGrid]);

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
    const radius = (Math.min(bounds.width, bounds.height) / 2) * viewRef.current.zoom;
    const inset = dossierOpen ? Math.min(560, bounds.width * 0.46) : 0;
    const x = (clientX - bounds.left - (bounds.width - inset) / 2) / radius;
    const y = (bounds.height / 2 - (clientY - bounds.top)) / radius;
    const rho = Math.hypot(x, y);
    if (rho > 1) return null;
    const view = viewRef.current;
    const lat0 = (view.lat * Math.PI) / 180;
    const lon0 = (view.lon * Math.PI) / 180;
    const c = Math.asin(Math.min(1, rho));
    const sinC = Math.sin(c);
    const cosC = Math.cos(c);
    if (rho < 1e-6) return { lon: view.lon, lat: view.lat };
    const lat = Math.asin(
      Math.max(-1, Math.min(1, cosC * Math.sin(lat0) + (y * sinC * Math.cos(lat0)) / rho)),
    );
    const lon =
      lon0 + Math.atan2(x * sinC, rho * cosC * Math.cos(lat0) - y * sinC * Math.sin(lat0));
    return {
      lon: (((((lon * 180) / Math.PI + 180) % 360) + 360) % 360) - 180,
      lat: (lat * 180) / Math.PI,
    };
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
      else animationRef.current = 0;
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
    if (!drag || drag.moved) return;
    const countryId = countryAt(event.clientX, event.clientY);
    if (!countryId || countryId === ownCountryId) return;
    openCountry(countryId, false);
  }

  function resetView() {
    animateTo({ lon: 0, lat: 18 });
    viewRef.current.zoom = DEFAULT_ZOOM;
    scheduleRender();
  }

  function focusOwnCountry() {
    const centroid = centroidsRef.current.get(ownCountryId);
    if (centroid) animateTo(centroid);
  }

  const selected = countries.find((country) => country.id === selectedId) ?? null;
  const hoveredCountry = hover ? countries.find((country) => country.id === hover.id) : null;
  const rosterCountries = countries.filter((country) => country.id !== ownCountryId);

  return (
    <div className={`globe-stage ${dossierOpen ? "has-diplomacy-dossier" : ""}`}>
      <canvas
        ref={canvasRef}
        className="globe-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => setHover(null)}
        aria-label="구체 세계 지도"
      />

      {status !== "ready" && (
        <div className="globe-status">
          {status === "loading" && "지구 궤도 관측망 동기화 중…"}
          {status === "unsupported" && "이 브라우저에서 WebGL2를 사용할 수 없습니다."}
          {status === "failed" && "지도 텍스처를 불러오지 못했습니다."}
        </div>
      )}

      <div className="globe-hud globe-hud-top">
        <span className="globe-brand">
          <b>{ownCountry.flag}</b>
          {ownCountry.name}
        </span>
        <span className={`globe-channel ${turnOpen ? "open" : ""}`}>
          {turnOpen ? "외교 채널 개방" : "외교 채널 폐쇄"}
        </span>
      </div>

      <div className="globe-hud globe-hud-bottom">
        <button
          type="button"
          onClick={focusOwnCountry}
          disabled={!homeLocated}
          title={homeLocated ? "자국 영토로 시점 이동" : "지도에 배정된 자국 영토가 없습니다."}
        >
          자국 위치
        </button>
        <button type="button" onClick={resetView}>
          시점 초기화
        </button>
        <label>
          <input
            type="checkbox"
            checked={showBorders}
            onChange={(event) => setShowBorders(event.target.checked)}
            autoComplete="off"
            suppressHydrationWarning
          />
          국경선
        </label>
        <label>
          <input
            type="checkbox"
            checked={showGrid}
            onChange={(event) => setShowGrid(event.target.checked)}
            autoComplete="off"
            suppressHydrationWarning
          />
          경위선
        </label>
        <button
          type="button"
          className={inboxOpen ? "active" : ""}
          onClick={() => setInboxOpen((open) => !open)}
        >
          외교 전문 {inboxCount}
        </button>
      </div>

      {hover && hoveredCountry && (
        <div
          className="pixel-map-hover"
          style={{ left: `${hover.x}px`, top: `${hover.y}px` }}
          aria-hidden="true"
        >
          <i style={{ background: hoveredCountry.color }} />
          {hoveredCountry.name}
          {hoveredCountry.id === ownCountryId && <em>자국</em>}
        </div>
      )}

      <aside className="diplomacy-country-rail globe-rail" aria-label="국가 목록">
        <h2>국가 목록</h2>
        <div className="diplomacy-rail-list">
          {rosterCountries.length === 0 ? (
            <p>다른 국가가 없습니다.</p>
          ) : (
            rosterCountries.map((country) => {
              const relation = relations.find((item) => item.toCountryId === country.id);
              const score = relation?.score ?? 0;
              return (
                <button
                  type="button"
                  key={country.id}
                  className={country.id === selectedId ? "active" : ""}
                  onClick={() => openCountry(country.id)}
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

      {inboxOpen && (
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

      {selected && (
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
    </div>
  );
}

function sampleCountry(
  sampler: Sampler,
  projection: MapProjection,
  fit: ProjectionFit,
  assignments: Map<string, string>,
  lon: number,
  lat: number,
) {
  const uv = projectToUv(projection, lon, lat, fit);
  const x = Math.max(0, Math.min(sampler.width - 1, Math.round(uv.u * (sampler.width - 1))));
  const y = Math.max(0, Math.min(sampler.height - 1, Math.round(uv.v * (sampler.height - 1))));
  const index = (y * sampler.width + x) * 4;
  if (sampler.data[index + 3] < 128) return null;
  return (
    assignments.get(
      quantizedHex(sampler.data[index], sampler.data[index + 1], sampler.data[index + 2]),
    ) ?? null
  );
}

function samePixel(data: Uint8ClampedArray, index: number, target: number[], tolerance = 12) {
  return (
    Math.abs(data[index] - target[0]) <= tolerance &&
    Math.abs(data[index + 1] - target[1]) <= tolerance &&
    Math.abs(data[index + 2] - target[2]) <= tolerance
  );
}

/** 투영 경계에 그려진 검은 윤곽선 두께. 8픽셀 이상은 지형으로 보고 멈춘다. */
const MAX_OUTLINE_PX = 8;

function isOutline(data: Uint8ClampedArray, index: number) {
  return data[index] + data[index + 1] + data[index + 2] <= 96;
}

/**
 * 타원형 투영 이미지는 지도 밖이 배경색으로 채워져 있다. 적도(중앙 가로줄)와
 * 본초자오선(중앙 세로줄)은 투영 경계에 정확히 맞닿으므로, 두 줄에서 배경이 끝나는
 * 지점을 찾아 지도 본체의 실제 사각형을 측정한다. 범례 같은 장식은 중앙 십자선을
 * 건드리지 않으므로 영향을 주지 않는다.
 *
 * 경계에는 보통 검은 윤곽선이 그려져 있어, 경도 ±180을 샘플링하면 그 선이 자오선
 * 틈처럼 보인다. 윤곽선 두께를 재서 그만큼 안쪽으로 물러나고, 바이리니어 보간이
 * 윤곽선을 물지 않도록 2픽셀을 더 남긴다.
 */
function detectMapBounds(sampler: Sampler) {
  const { data, width, height } = sampler;
  const background = [data[0], data[1], data[2]];
  const midY = Math.floor(height / 2);
  const midX = Math.floor(width / 2);
  const rowIndex = (x: number) => (midY * width + x) * 4;
  const columnIndex = (y: number) => (y * width + midX) * 4;

  let left = 0;
  while (left < width - 1 && samePixel(data, rowIndex(left), background)) left += 1;
  let right = width - 1;
  while (right > left && samePixel(data, rowIndex(right), background)) right -= 1;
  let top = 0;
  while (top < height - 1 && samePixel(data, columnIndex(top), background)) top += 1;
  let bottom = height - 1;
  while (bottom > top && samePixel(data, columnIndex(bottom), background)) bottom -= 1;

  const usable = right - left + 1 >= width * 0.5 && bottom - top + 1 >= height * 0.5;
  if (!usable) return null;

  let leftInset = 0;
  while (leftInset < MAX_OUTLINE_PX && isOutline(data, rowIndex(left + leftInset))) leftInset += 1;
  let rightInset = 0;
  while (rightInset < MAX_OUTLINE_PX && isOutline(data, rowIndex(right - rightInset)))
    rightInset += 1;
  let topInset = 0;
  while (topInset < MAX_OUTLINE_PX && isOutline(data, columnIndex(top + topInset))) topInset += 1;
  let bottomInset = 0;
  while (bottomInset < MAX_OUTLINE_PX && isOutline(data, columnIndex(bottom - bottomInset)))
    bottomInset += 1;

  const margin = 2;
  return {
    left: left + leftInset + margin,
    right: right - rightInset - margin,
    top: top + topInset + margin,
    bottom: bottom - bottomInset - margin,
  };
}

/** 경계 밖으로 늘려둘 폭. 이 지도의 타원은 표준식과 최대 13픽셀 어긋난다. */
const EDGE_EXTENSION_PX = 28;

/**
 * 투영 공식으로 계산한 타원 경계와 이미지에 그려진 실제 경계는 완전히 일치하지 않는다.
 * 어긋난 만큼 경도 ±180 근처에서 배경색과 검은 윤곽선이 자오선 틈처럼 보이므로,
 * 각 행의 가장자리 색을 지도 밖으로 늘려 그 오차를 흡수한다. 지도는 중앙 경선을 축으로
 * 좌우 대칭이므로, 범례 같은 장식이 없는 오른쪽 경계를 재서 왼쪽은 대칭으로 구한다.
 */
function extendMapEdges(sampler: Sampler, bounds: { left: number; right: number }) {
  const { data, width, height } = sampler;
  const background = [data[0], data[1], data[2]];
  const centerX = (bounds.left + bounds.right) / 2;
  const index = (x: number, y: number) => (y * width + x) * 4;
  const paint = (from: number, to: number, y: number, source: number) => {
    for (let x = Math.max(0, from); x <= Math.min(width - 1, to); x += 1) {
      const target = index(x, y);
      data[target] = data[source];
      data[target + 1] = data[source + 1];
      data[target + 2] = data[source + 2];
    }
  };

  for (let y = 0; y < height; y += 1) {
    let edge = width - 1;
    while (edge > centerX && samePixel(data, index(edge, y), background)) edge -= 1;
    if (edge <= centerX) continue;

    let clean = edge;
    while (clean > centerX && edge - clean < MAX_OUTLINE_PX && isOutline(data, index(clean, y)))
      clean -= 1;
    paint(clean + 1, edge + EDGE_EXTENSION_PX, y, index(clean, y));

    // 왼쪽 경계는 대칭으로 잡고, 확실히 안쪽인 지점부터 되짚어 깨끗한 첫 픽셀을 찾는다.
    const mirrored = Math.round(2 * centerX - edge);
    let leftClean = Math.max(0, Math.min(width - 1, mirrored + MAX_OUTLINE_PX));
    const limit = Math.max(0, mirrored - MAX_OUTLINE_PX);
    while (leftClean > limit) {
      const previous = index(leftClean - 1, y);
      if (isOutline(data, previous) || samePixel(data, previous, background)) break;
      leftClean -= 1;
    }
    paint(mirrored - EDGE_EXTENSION_PX, leftClean - 1, y, index(leftClean, y));
  }
}

/** 1도 격자를 훑어 국가별 중심 좌표를 구한다. 레일에서 국가를 고르면 그 지점으로 회전한다. */
function buildCentroids(
  sampler: Sampler,
  projection: MapProjection,
  fit: ProjectionFit,
  assignments: Map<string, string>,
) {
  const accumulator = new Map<string, { x: number; y: number; z: number; weight: number }>();
  for (let lat = -89; lat <= 89; lat += 1) {
    const weight = Math.cos((lat * Math.PI) / 180);
    for (let lon = -180; lon < 180; lon += 1) {
      const countryId = sampleCountry(sampler, projection, fit, assignments, lon, lat);
      if (!countryId) continue;
      const latRad = (lat * Math.PI) / 180;
      const lonRad = (lon * Math.PI) / 180;
      const entry = accumulator.get(countryId) ?? { x: 0, y: 0, z: 0, weight: 0 };
      entry.x += Math.cos(latRad) * Math.cos(lonRad) * weight;
      entry.y += Math.cos(latRad) * Math.sin(lonRad) * weight;
      entry.z += Math.sin(latRad) * weight;
      entry.weight += weight;
      accumulator.set(countryId, entry);
    }
  }
  const centroids = new Map<string, { lon: number; lat: number }>();
  for (const [countryId, entry] of accumulator) {
    if (entry.weight <= 0) continue;
    const length = Math.hypot(entry.x, entry.y, entry.z);
    if (length < 1e-9) continue;
    centroids.set(countryId, {
      lon: (Math.atan2(entry.y, entry.x) * 180) / Math.PI,
      lat: (Math.asin(entry.z / length) * 180) / Math.PI,
    });
  }
  return centroids;
}
