"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { DiplomacyMap } from "@/src/ui/world-map";
import { TnoDiplomacyPanel, type DiplomacyDetail } from "@/src/ui/tno-diplomacy-panel";

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

function quantizedHex(red: number, green: number, blue: number) {
  return (
    "#" +
    [red & 0xf8, green & 0xf8, blue & 0xf8]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

export function PixelDiplomacyMap({
  mapId,
  mapRevision,
  hexResolution,
  adaptiveResolution,
  rasterRevision,
  rasterWidth,
  rasterHeight,
  borderRevision,
  colorAssignments,
  countries,
  ownCountryId,
  ownCountry,
  relations,
  turnOpen,
  divisionRevision,
}: {
  mapId: string;
  mapRevision: number;
  hexResolution: number;
  adaptiveResolution: boolean;
  rasterRevision: number;
  rasterWidth: number;
  rasterHeight: number;
  borderRevision: number;
  colorAssignments: Assignment[];
  countries: Country[];
  ownCountryId: string;
  ownCountry: OwnCountry;
  relations: Relation[];
  turnOpen: boolean;
  divisionRevision: number;
}) {
  const sampleCanvasRef = useRef<HTMLCanvasElement>(null);
  const [sampledRevision, setSampledRevision] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [details, setDetails] = useState<DiplomacyDetail | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [showBorders, setShowBorders] = useState(true);

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

  if (!rasterRevision) {
    return (
      <DiplomacyMap
        mapId={mapId}
        mapRevision={mapRevision}
        hexResolution={hexResolution}
        adaptiveResolution={adaptiveResolution}
        countries={countries}
        ownCountryId={ownCountryId}
        relations={relations}
        turnOpen={turnOpen}
        divisionRevision={divisionRevision}
      />
    );
  }

  const assignedCountryByColor = new Map(
    colorAssignments.map((assignment) => [assignment.colorHex.toUpperCase(), assignment.countryId]),
  );

  function prepareSampler(image: HTMLImageElement) {
    const canvas = sampleCanvasRef.current;
    if (!canvas) return;
    const scale = Math.min(1, 4096 / image.naturalWidth);
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    setSampledRevision(rasterRevision);
  }

  function sampleCountryId(event: MouseEvent<HTMLImageElement>) {
    const canvas = sampleCanvasRef.current;
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !context || sampledRevision !== rasterRevision) return null;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(
      0,
      Math.min(
        canvas.width - 1,
        Math.floor(((event.clientX - bounds.left) / bounds.width) * canvas.width),
      ),
    );
    const y = Math.max(
      0,
      Math.min(
        canvas.height - 1,
        Math.floor(((event.clientY - bounds.top) / bounds.height) * canvas.height),
      ),
    );
    const pixel = context.getImageData(x, y, 1, 1).data;
    if (pixel[3] < 128) return null;
    return assignedCountryByColor.get(quantizedHex(pixel[0], pixel[1], pixel[2])) ?? null;
  }

  function trackHover(event: MouseEvent<HTMLImageElement>) {
    const countryId = sampleCountryId(event);
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

  function selectArea(event: MouseEvent<HTMLImageElement>) {
    const countryId = sampleCountryId(event);
    if (!countryId || countryId === ownCountryId || countryId === selectedId) return;
    setDetails(null);
    setDetailsLoading(true);
    setSelectedId(countryId);
  }

  const selected = countries.find((country) => country.id === selectedId) ?? null;
  const hoveredCountry = hover ? countries.find((country) => country.id === hover.id) : null;

  return (
    <div className={`pixel-diplomacy-map ${selected ? "has-diplomacy-dossier" : ""}`}>
      <div className="diplomacy-map-controls">
        <span className="diplomacy-map-brand">
          <b>{ownCountry.flag}</b>
          {ownCountry.name}
        </span>
        <label>
          <input
            type="checkbox"
            checked={showBorders}
            onChange={(event) => setShowBorders(event.target.checked)}
          />
          국경선
        </label>
        <span className={`diplomacy-map-turn ${turnOpen ? "open" : ""}`}>
          {turnOpen ? "외교 채널 개방" : "외교 채널 폐쇄"}
        </span>
      </div>
      <div className="pixel-diplomacy-canvas-wrap">
        <Image
          src={`/api/map/image?mapId=${encodeURIComponent(mapId)}&v=${rasterRevision}&borders=${
            showBorders ? "1" : "0"
          }`}
          alt="세계 정치 지도"
          width={rasterWidth}
          height={rasterHeight}
          sizes="100vw"
          priority
          unoptimized
          className="pixel-diplomacy-canvas"
          draggable={false}
          onLoad={(event) => prepareSampler(event.currentTarget)}
          onMouseMove={trackHover}
          onMouseLeave={() => setHover(null)}
          onClick={selectArea}
        />
        {showBorders && borderRevision > 0 && (
          <Image
            src={`/api/map/borders?mapId=${encodeURIComponent(mapId)}&v=${borderRevision}`}
            alt=""
            width={rasterWidth}
            height={rasterHeight}
            unoptimized
            className="pixel-diplomacy-border-layer"
            draggable={false}
          />
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
          </div>
        )}
        <canvas ref={sampleCanvasRef} className="pixel-map-sampler" aria-hidden="true" />
      </div>

      {selected && (
        <TnoDiplomacyPanel
          selected={selected}
          own={ownCountry}
          detail={details}
          loading={detailsLoading}
          turnOpen={turnOpen}
          inboxHref="#diplomacy-inbox"
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
