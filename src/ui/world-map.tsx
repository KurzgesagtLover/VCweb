"use client";

import maplibregl, { type StyleSpecification } from "maplibre-gl";
import { gridDisk } from "h3-js";
import { useEffect, useRef, useState } from "react";
import { sendDiplomaticProposalAction } from "@/src/actions/diplomacy";
import { saveMapChangeSetAction } from "@/src/actions/map";
import { saveAdministrativeDivisionCellsAction } from "@/src/actions/territory";
import type { BorderClassification } from "@/src/domain/map/border-palette";
import { getMinimumSafeTileZoom } from "@/src/domain/map/grid";
import { PixelMapEditor } from "@/src/ui/pixel-map-editor";

type Country = { id: string; name: string; code: string; color: string; isAi: boolean };
type PickedHex = {
  cellId: string;
  countryCode: string | null;
  divisionId: string | null;
  isLocked: boolean;
  isOverview: boolean;
};

function featureToHex(feature: {
  properties: Record<string, unknown> | null;
  id?: string | number;
}): PickedHex {
  const properties = feature.properties as Record<string, unknown>;
  return {
    cellId: String(properties.cell_id ?? feature.id ?? ""),
    countryCode: typeof properties.country_code === "string" ? properties.country_code : null,
    divisionId: typeof properties.division_id === "string" ? properties.division_id : null,
    isLocked: properties.is_locked === true || properties.is_locked === "true",
    isOverview: properties.is_overview === true || properties.is_overview === "true",
  };
}

function HexMap({
  mapId,
  mapRevision,
  onPick,
  onReady,
  projection = "globe",
  interactionMode = "select",
  countryCodeFilter,
  initialCenter,
  initialZoom = 3,
  divisionRevision = 0,
  hexResolution = 4,
  adaptiveResolution = true,
  ariaLabel = "헥사곤 세계 지도",
}: {
  mapId: string;
  mapRevision: number;
  onPick?: (hex: PickedHex, map: maplibregl.Map, behavior: "toggle" | "add" | "fill") => void;
  onReady?: (map: maplibregl.Map) => void;
  projection?: "globe" | "mercator";
  interactionMode?: "select" | "brush" | "fill" | "erase";
  countryCodeFilter?: string;
  initialCenter?: [number, number];
  initialZoom?: number;
  divisionRevision?: number;
  hexResolution?: number;
  adaptiveResolution?: boolean;
  ariaLabel?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef<NonNullable<typeof onPick>>(() => undefined);
  const modeRef = useRef(interactionMode);
  const readyCallback = useRef(onReady);
  const centerLongitude = initialCenter?.[0] ?? 0;
  const centerLatitude = initialCenter?.[1] ?? 0;
  const minimumSafeZoom = adaptiveResolution ? 0 : getMinimumSafeTileZoom(hexResolution);
  const [currentZoom, setCurrentZoom] = useState(initialZoom);

  useEffect(() => {
    callback.current = onPick ?? (() => undefined);
  }, [onPick]);
  useEffect(() => {
    modeRef.current = interactionMode;
  }, [interactionMode]);
  useEffect(() => {
    readyCallback.current = onReady;
  }, [onReady]);

  useEffect(() => {
    if (!container.current) return;
    const fillColor: StyleSpecification["layers"][number]["paint"] = {
      "fill-color": countryCodeFilter
        ? [
            "case",
            ["!=", ["get", "country_code"], countryCodeFilter],
            "transparent",
            ["boolean", ["feature-state", "selected"], false],
            ["coalesce", ["feature-state", "preview_color"], "#f1cf78"],
            ["coalesce", ["get", "country_color"], "#263943"],
          ]
        : [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            ["coalesce", ["feature-state", "preview_color"], "#f1cf78"],
            ["coalesce", ["get", "country_color"], "#263943"],
          ],
      "fill-opacity": countryCodeFilter
        ? [
            "case",
            ["!=", ["get", "country_code"], countryCodeFilter],
            0,
            ["boolean", ["feature-state", "selected"], false],
            0.92,
            0.72,
          ]
        : ["case", ["boolean", ["feature-state", "selected"], false], 0.92, 0.72],
    };
    const style: StyleSpecification = {
      version: 8,
      sources: {
        hexes: {
          type: "vector",
          tiles: [
            `${window.location.origin}/api/map/tiles/{z}/{x}/{y}?mapId=${encodeURIComponent(mapId)}&revision=${mapRevision}&divisionRevision=${divisionRevision}`,
          ],
          minzoom: minimumSafeZoom,
          maxzoom: 12,
          promoteId: "cell_id",
        },
      },
      layers: [
        { id: "void", type: "background", paint: { "background-color": "#081017" } },
        {
          id: "hex-fill",
          type: "fill",
          source: "hexes",
          "source-layer": "hexes",
          paint: fillColor,
        },
        {
          id: "hex-line",
          type: "line",
          source: "hexes",
          "source-layer": "hexes",
          paint: {
            "line-color": countryCodeFilter ? "#050507" : "#78909c",
            "line-width": countryCodeFilter ? 1 : 0.7,
            "line-opacity": countryCodeFilter
              ? ["case", ["==", ["get", "country_code"], countryCodeFilter], 0.9, 0]
              : 0.65,
          },
        },
        {
          id: "division-line",
          type: "line",
          source: "hexes",
          "source-layer": "divisions",
          paint: {
            "line-color": "#000000",
            "line-width": ["interpolate", ["linear"], ["zoom"], 0, 0.7, 3, 1.5, 7, 2.8, 10, 4],
            "line-opacity": 0.98,
          },
        },
      ],
    };
    const map = new maplibregl.Map({
      container: container.current,
      center: [centerLongitude, centerLatitude],
      zoom: initialZoom,
      minZoom: 0,
      maxZoom: 10,
      attributionControl: false,
      style,
    });
    map.on("style.load", () => {
      map.setProjection({ type: projection });
      readyCallback.current?.(map);
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");
    setCurrentZoom(map.getZoom());
    map.on("zoomend", () => setCurrentZoom(map.getZoom()));
    map.on("mouseenter", "hex-fill", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "hex-fill", () => (map.getCanvas().style.cursor = ""));
    map.on("click", "hex-fill", (event) => {
      if (modeRef.current !== "select" && modeRef.current !== "fill") return;
      const feature = event.features?.at(0);
      if (feature) {
        callback.current(
          featureToHex(feature),
          map,
          modeRef.current === "fill" ? "fill" : "toggle",
        );
      }
    });
    let painting = false;
    let lastPainted = "";
    map.on("mousedown", "hex-fill", (event) => {
      if (modeRef.current === "select" || modeRef.current === "fill") return;
      const feature = event.features?.at(0);
      if (!feature) return;
      const hex = featureToHex(feature);
      if (hex.isOverview) return;
      event.preventDefault();
      painting = true;
      map.dragPan.disable();
      lastPainted = hex.cellId;
      callback.current(hex, map, "add");
    });
    map.on("mousemove", (event) => {
      if (!painting) return;
      const feature = map.queryRenderedFeatures(event.point, { layers: ["hex-fill"] }).at(0);
      if (!feature) return;
      const hex = featureToHex(feature);
      if (hex.isOverview) return;
      if (hex.cellId === lastPainted) return;
      lastPainted = hex.cellId;
      callback.current(hex, map, "add");
    });
    map.on("mouseup", () => {
      painting = false;
      lastPainted = "";
      map.dragPan.enable();
    });
    return () => map.remove();
  }, [
    centerLatitude,
    centerLongitude,
    countryCodeFilter,
    divisionRevision,
    initialZoom,
    mapId,
    mapRevision,
    minimumSafeZoom,
    projection,
  ]);

  return (
    <div className="map-canvas-shell">
      <div className="map-canvas" ref={container} role="application" aria-label={ariaLabel} />
      {!adaptiveResolution && currentZoom < minimumSafeZoom && (
        <div className="map-resolution-warning" role="status">
          {"\uace0\uc815 \ud574\uc0c1\ub3c4 "}
          {hexResolution}
          {" \uc9c0\ub3c4\ub294 "}
          {minimumSafeZoom}
          {"\ub2e8\uacc4 \uc774\uc0c1 \ud655\ub300\ud558\uba74 \ud45c\uc2dc\ub429\ub2c8\ub2e4."}
        </div>
      )}
    </div>
  );
}

export function CountryTerritoryMap({
  mapId,
  mapRevision,
  hexResolution,
  adaptiveResolution,
  countryCode,
  countryName,
  center,
  divisionRevision,
}: {
  mapId: string;
  mapRevision: number;
  hexResolution: number;
  adaptiveResolution: boolean;
  countryCode: string;
  countryName: string;
  center: [number, number];
  divisionRevision: number;
}) {
  return (
    <div className="territory-map">
      <HexMap
        mapId={mapId}
        mapRevision={mapRevision}
        hexResolution={hexResolution}
        adaptiveResolution={adaptiveResolution}
        projection="mercator"
        countryCodeFilter={countryCode}
        initialCenter={center}
        initialZoom={4}
        divisionRevision={divisionRevision}
        ariaLabel={`${countryName} 국토 지도`}
      />
    </div>
  );
}

export function AdministrativeDivisionEditor({
  campaignId,
  mapId,
  mapRevision,
  hexResolution,
  adaptiveResolution,
  country,
  center,
  divisionRevision,
  divisions,
}: {
  campaignId: string;
  mapId: string;
  mapRevision: number;
  hexResolution: number;
  adaptiveResolution: boolean;
  country: Country;
  center: [number, number];
  divisionRevision: number;
  divisions: Array<{ id: string; name: string; typeName: string }>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<"assign" | "erase">("assign");
  const [divisionId, setDivisionId] = useState(divisions.at(0)?.id ?? "");
  const [editorMap, setEditorMap] = useState<maplibregl.Map | null>(null);
  const selectedRef = useRef(selected);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  function updateSelection(next: string[]) {
    const normalized = [...new Set(next)];
    const nextSet = new Set(normalized);
    for (const cellId of new Set([...selectedRef.current, ...normalized])) {
      editorMap?.setFeatureState(
        { source: "hexes", sourceLayer: "hexes", id: cellId },
        { selected: nextSet.has(cellId) },
      );
    }
    selectedRef.current = normalized;
    setSelected(normalized);
  }

  return (
    <div className="division-editor-layout">
      <div className="map-workspace">
        <div className="map-toolbar" role="toolbar" aria-label="행정구역 편집 도구">
          <button
            type="button"
            className={mode === "assign" ? "active" : "button secondary"}
            onClick={() => setMode("assign")}
          >
            구역 칠하기
          </button>
          <button
            type="button"
            className={mode === "erase" ? "active" : "button secondary"}
            onClick={() => setMode("erase")}
          >
            경계 지우기
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={selected.length === 0}
            onClick={() => updateSelection([])}
          >
            선택 해제
          </button>
        </div>
        <HexMap
          mapId={mapId}
          mapRevision={mapRevision}
          hexResolution={hexResolution}
          adaptiveResolution={adaptiveResolution}
          projection="mercator"
          interactionMode="brush"
          countryCodeFilter={country.code}
          initialCenter={center}
          initialZoom={4}
          divisionRevision={divisionRevision}
          ariaLabel={`${country.name} 행정구역 편집 지도`}
          onReady={setEditorMap}
          onPick={(hex) => {
            if (hex.isOverview || hex.isLocked || hex.countryCode !== country.code) return;
            if (!selectedRef.current.includes(hex.cellId)) {
              updateSelection([...selectedRef.current, hex.cellId]);
            }
          }}
        />
      </div>
      <aside className="panel map-save-panel">
        <form action={saveAdministrativeDivisionCellsAction} className="form-stack">
          <input type="hidden" name="campaignId" value={campaignId} />
          <input type="hidden" name="mapId" value={mapId} />
          <input type="hidden" name="countryId" value={country.id} />
          <input type="hidden" name="divisionId" value={mode === "assign" ? divisionId : ""} />
          <input type="hidden" name="mode" value={mode} />
          <input type="hidden" name="cellIds" value={selected.join(",")} />
          <span className="eyebrow">BOUNDARY R{divisionRevision}</span>
          <h2>{mode === "assign" ? "행정구역 배정" : "행정구역 경계 제거"}</h2>
          <div className="data-row">
            <dt>선택 셀</dt>
            <dd>{selected.length.toLocaleString("ko-KR")}개</dd>
          </div>
          {mode === "assign" && (
            <label>
              행정구역
              <select
                value={divisionId}
                onChange={(event) => setDivisionId(event.target.value)}
                required
              >
                {divisions.map((division) => (
                  <option value={division.id} key={division.id}>
                    {division.typeName} · {division.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            변경 사유
            <textarea name="reason" required minLength={5} maxLength={1000} />
          </label>
          <label className="toggle-control">
            <input type="checkbox" name="confirm" value="yes" required />
            <span>선택 영역을 확인했습니다.</span>
          </label>
          <button
            type="submit"
            disabled={selected.length === 0 || (mode === "assign" && !divisionId)}
          >
            적용
          </button>
        </form>
      </aside>
    </div>
  );
}

export function DiplomacyMap({
  mapId,
  mapRevision,
  hexResolution,
  adaptiveResolution,
  countries,
  ownCountryId,
  relations,
  turnOpen,
  divisionRevision,
}: {
  mapId: string;
  mapRevision: number;
  hexResolution: number;
  adaptiveResolution: boolean;
  countries: Country[];
  ownCountryId: string;
  relations: Array<{ toCountryId: string; score: number; tags: string[] }>;
  turnOpen: boolean;
  divisionRevision: number;
}) {
  const foreign = countries.filter((country) => country.id !== ownCountryId);
  const [selectedId, setSelectedId] = useState(foreign.at(0)?.id ?? null);
  const selected = countries.find((country) => country.id === selectedId) ?? null;
  const relation = relations.find((item) => item.toCountryId === selectedId);
  const score = relation?.score ?? 0;
  const tag =
    score >= 60
      ? "동맹적"
      : score >= 25
        ? "우호"
        : score > -25
          ? "중립"
          : score > -60
            ? "긴장"
            : "적대";

  return (
    <div className="map-diplomacy-layout">
      <div className="map-stage">
        <HexMap
          mapId={mapId}
          mapRevision={mapRevision}
          hexResolution={hexResolution}
          adaptiveResolution={adaptiveResolution}
          divisionRevision={divisionRevision}
          onPick={(hex) => {
            const country = countries.find((item) => item.code === hex.countryCode);
            if (country && country.id !== ownCountryId) setSelectedId(country.id);
          }}
        />
        <div className="country-picker" aria-label="지도 국가 바로 선택">
          {foreign.map((country) => (
            <button
              type="button"
              className={country.id === selectedId ? "active" : "button secondary"}
              onClick={() => setSelectedId(country.id)}
              key={country.id}
            >
              <span style={{ background: country.color }} />
              {country.name}
            </button>
          ))}
        </div>
      </div>
      <aside className="diplomacy-panel panel">
        {selected ? (
          <>
            <span className="eyebrow">
              {selected.code} · {selected.isAi ? "AI 국가" : "인간 담당"}
            </span>
            <h2>{selected.name}</h2>
            <div className="relation-meter">
              <strong>{score}</strong>
              <span>{tag}</span>
            </div>
            <p className="muted">관계 태그: {relation?.tags.join(", ") || "기록 없음"}</p>
            <form action={sendDiplomaticProposalAction} className="form-stack">
              <input type="hidden" name="toCountryId" value={selected.id} />
              <label>
                제안 유형
                <select name="type" defaultValue="NEGOTIATION">
                  <option value="STATEMENT">성명</option>
                  <option value="NEGOTIATION">협상</option>
                  <option value="TREATY">조약 제안</option>
                  <option value="TRADE">무역 제안</option>
                  <option value="AID">원조</option>
                  <option value="WARNING">경고</option>
                  <option value="OTHER">기타</option>
                </select>
              </label>
              <label>
                제목
                <input name="title" required minLength={4} maxLength={160} />
              </label>
              <label>
                내용
                <textarea name="body" required minLength={20} maxLength={6000} />
              </label>
              <label>
                공개 범위
                <select name="visibility">
                  <option value="PRIVATE">비공개</option>
                  <option value="PUBLIC">공개</option>
                </select>
              </label>
              <button type="submit" disabled={!turnOpen}>
                외교 제안 보내기
              </button>
              {!turnOpen && <p className="muted">DRAFT 턴에서만 새 제안을 보낼 수 있습니다.</p>}
            </form>
          </>
        ) : (
          <div className="empty-state">지도에서 타국을 선택하세요.</div>
        )}
      </aside>
    </div>
  );
}

export function MapEditor({
  campaignId,
  mapId,
  revision,
  hexResolution,
  adaptiveResolution,
  divisionRevision,
  rasterRevision,
  hasRaster,
  borderRevision,
  borderClassifications,
  countries,
}: {
  campaignId: string;
  mapId: string;
  revision: number;
  hexResolution: number;
  adaptiveResolution: boolean;
  divisionRevision: number;
  rasterRevision: number;
  hasRaster: boolean;
  borderRevision: number;
  borderClassifications: BorderClassification[];
  countries: Country[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [history, setHistory] = useState<string[][]>([[]]);
  const [cursor, setCursor] = useState(0);
  const [tool, setTool] = useState<"select" | "brush" | "fill" | "erase">("select");
  const [globeMap, setGlobeMap] = useState<maplibregl.Map | null>(null);
  const [targetCountryId, setTargetCountryId] = useState(countries.at(0)?.id ?? "");
  const selectedRef = useRef(selected);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  function syncSelection(next: string[]) {
    const normalized = [...new Set(next)].sort().slice(0, 5000);
    const nextSet = new Set(normalized);
    for (const cellId of new Set([...selectedRef.current, ...normalized])) {
      for (const map of [globeMap]) {
        map?.setFeatureState(
          { source: "hexes", sourceLayer: "hexes", id: cellId },
          { selected: nextSet.has(cellId) },
        );
      }
    }
    setSelected(normalized);
    selectedRef.current = normalized;
    return normalized;
  }

  function commit(next: string[]) {
    const normalized = syncSelection(next);
    const nextHistory = [...history.slice(0, cursor + 1), normalized];
    setHistory(nextHistory);
    setCursor(nextHistory.length - 1);
  }

  function pickCell(hex: PickedHex, map: maplibregl.Map, behavior: "toggle" | "add" | "fill") {
    if (hex.isOverview || hex.isLocked) return;
    if (behavior === "fill") {
      const matchingCells = new Map<string, PickedHex>();
      for (const feature of map.querySourceFeatures("hexes", { sourceLayer: "hexes" })) {
        const candidate = featureToHex(feature);
        if (
          !candidate.isOverview &&
          !candidate.isLocked &&
          candidate.countryCode === hex.countryCode
        ) {
          matchingCells.set(candidate.cellId, candidate);
        }
      }
      matchingCells.set(hex.cellId, hex);
      const connected: string[] = [];
      const queue = [hex.cellId];
      const visited = new Set<string>();
      while (queue.length && connected.length < 5000) {
        const cellId = queue.shift()!;
        if (visited.has(cellId) || !matchingCells.has(cellId)) continue;
        visited.add(cellId);
        connected.push(cellId);
        for (const neighborId of gridDisk(cellId, 1)) {
          if (!visited.has(neighborId) && matchingCells.has(neighborId)) {
            queue.push(neighborId);
          }
        }
      }
      commit([...selectedRef.current, ...connected]);
      return;
    }
    const has = selectedRef.current.includes(hex.cellId);
    const next =
      behavior === "add"
        ? has
          ? selectedRef.current
          : [...selectedRef.current, hex.cellId]
        : has
          ? selectedRef.current.filter((id) => id !== hex.cellId)
          : [...selectedRef.current, hex.cellId];
    commit(next);
  }

  const previewColor =
    countries.find((country) => country.id === targetCountryId)?.color ?? "#263943";

  useEffect(() => {
    for (const map of [globeMap]) {
      for (const cellId of selected) {
        map?.setFeatureState(
          { source: "hexes", sourceLayer: "hexes", id: cellId },
          { selected: true, preview_color: previewColor },
        );
      }
    }
  }, [globeMap, previewColor, selected]);

  return (
    <div className="map-admin-layout">
      <div className="map-workspace">
        <div className="dual-map-view">
          <section>
            <h3>구면 지도</h3>
            <div className="map-toolbar" role="toolbar" aria-label="지도 편집 도구">
              <button
                type="button"
                className={tool === "select" ? "active" : "button secondary"}
                onClick={() => setTool("select")}
              >
                선택
              </button>
              <button
                type="button"
                className={tool === "brush" ? "active" : "button secondary"}
                onClick={() => setTool("brush")}
              >
                브러시
              </button>
              <button
                type="button"
                className={tool === "fill" ? "active" : "button secondary"}
                onClick={() => setTool("fill")}
              >
                색 채우기
              </button>
              <button
                type="button"
                className={tool === "erase" ? "active" : "button secondary"}
                onClick={() => {
                  setTool("erase");
                  setTargetCountryId("");
                }}
              >
                지우개
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={cursor === 0}
                onClick={() => {
                  const next = cursor - 1;
                  setCursor(next);
                  syncSelection(history[next]);
                }}
              >
                실행 취소
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={cursor >= history.length - 1}
                onClick={() => {
                  const next = cursor + 1;
                  setCursor(next);
                  syncSelection(history[next]);
                }}
              >
                다시 실행
              </button>
            </div>
            <HexMap
              mapId={mapId}
              mapRevision={revision}
              hexResolution={hexResolution}
              adaptiveResolution={adaptiveResolution}
              projection="globe"
              divisionRevision={divisionRevision}
              interactionMode={tool}
              initialZoom={4}
              onReady={setGlobeMap}
              onPick={pickCell}
            />
          </section>
          <section className="pixel-map-section">
            <h3>{"\ud3c9\uba74 \ud53d\uc140 \uc9c0\ub3c4"}</h3>
            <PixelMapEditor
              campaignId={campaignId}
              mapId={mapId}
              mapRevision={revision}
              rasterRevision={rasterRevision}
              hasRaster={hasRaster}
              borderRevision={borderRevision}
              initialBorderClassifications={borderClassifications}
              countries={countries}
            />
          </section>
        </div>
      </div>
      <aside className="panel form-stack map-save-panel">
        <form action={saveMapChangeSetAction} className="form-stack">
          <input type="hidden" name="campaignId" value={campaignId} />
          <input type="hidden" name="mapId" value={mapId} />
          <input type="hidden" name="expectedRevision" value={revision} />
          <input type="hidden" name="cellIds" value={selected.join(",")} />
          <span className="eyebrow">MAP REVISION {revision}</span>
          <h2>영토 적용</h2>
          <div className="data-list">
            <div className="data-row">
              <dt>선택</dt>
              <dd>{selected.length}개</dd>
            </div>
          </div>
          <div className="map-palette" aria-label="국가 색상">
            <button
              type="button"
              className={!targetCountryId ? "active" : "button secondary"}
              onClick={() => setTargetCountryId("")}
            >
              미소유
            </button>
            {countries.map((country) => (
              <button
                type="button"
                key={country.id}
                className={targetCountryId === country.id ? "active" : "button secondary"}
                onClick={() => setTargetCountryId(country.id)}
              >
                <span style={{ background: country.color }} />
                {country.name}
              </button>
            ))}
          </div>
          <input type="hidden" name="targetCountryId" value={targetCountryId} />
          <label>
            변경 사유
            <textarea name="reason" required minLength={10} maxLength={1000} />
          </label>
          <label>
            <input type="checkbox" name="confirm" value="yes" required /> 적용 내용을 확인했습니다.
          </label>
          <button type="submit" disabled={selected.length === 0}>
            선택 영역 적용
          </button>
        </form>
      </aside>
    </div>
  );
}
