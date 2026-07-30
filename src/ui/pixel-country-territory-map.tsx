"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const MIN_ZOOM = 25;
const MAX_ZOOM = 800;

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

export function PixelCountryTerritoryMap({
  mapId,
  rasterRevision,
  borderRevision,
  countryName,
  territoryColor,
}: {
  mapId: string;
  rasterRevision: number;
  borderRevision: number;
  countryName: string;
  territoryColor: string | null;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(100);
  const [showBorders, setShowBorders] = useState(true);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
      viewport.scrollTop = Math.max(0, (viewport.scrollHeight - viewport.clientHeight) / 2);
    });
    return () => cancelAnimationFrame(frame);
  }, [zoom, showBorders, rasterRevision, borderRevision]);

  if (!rasterRevision || !territoryColor || imageFailed) {
    return (
      <div className="territory-pixel-map territory-pixel-map-empty">
        <div className="empty-state">
          {!rasterRevision ? "등록된 픽셀 지도가 없습니다." : "배정된 자국 영토가 없습니다."}
        </div>
      </div>
    );
  }

  return (
    <div className="territory-pixel-map">
      <div className="territory-pixel-toolbar">
        <strong>
          <i style={{ background: territoryColor ?? "transparent" }} />
          {countryName}
        </strong>
        <div className="pixel-map-zoom" aria-label="지도 확대·축소">
          <label className="map-border-toggle">
            <input
              type="checkbox"
              checked={showBorders}
              onChange={(event) => setShowBorders(event.target.checked)}
            />
            국경선
          </label>
          <button type="button" onClick={() => setZoom((value) => clampZoom(value - 25))}>
            −
          </button>
          <output>{zoom}%</output>
          <button type="button" onClick={() => setZoom((value) => clampZoom(value + 25))}>
            +
          </button>
          <button type="button" onClick={() => setZoom(100)}>
            맞춤
          </button>
        </div>
      </div>
      <div ref={viewportRef} className="pixel-map-viewport territory-pixel-viewport">
        <div
          className="territory-pixel-canvas-wrap"
          style={{ width: `${zoom}%`, height: `${zoom}%` }}
        >
          <Image
            src={`/api/map/territory?mapId=${encodeURIComponent(
              mapId,
            )}&v=${rasterRevision}&br=${borderRevision}&borders=${
              showBorders ? "1" : "0"
            }&layout=centroid-1`}
            alt={`${countryName} 국토 지도`}
            fill
            sizes="100vw"
            priority
            unoptimized
            className="territory-pixel-canvas"
            draggable={false}
            onError={() => setImageFailed(true)}
          />
        </div>
      </div>
    </div>
  );
}
