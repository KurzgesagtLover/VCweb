"use client";

import Image from "next/image";
import { useRef, useState, type MouseEvent } from "react";
import { sendDiplomaticProposalAction } from "@/src/actions/diplomacy";
import { DiplomacyMap } from "@/src/ui/world-map";

type Country = { id: string; name: string; code: string; color: string; isAi: boolean };
type Relation = { toCountryId: string; score: number; tags: string[] };
type Assignment = { colorHex: string; countryId: string };
type PopupPoint = { left: number; top: number } | null;

const COPY = {
  close: "\ub2eb\uae30",
  ai: "AI \uad6d\uac00",
  player: "\uc778\uac04 \ub2f4\ub2f9",
  tags: "\uad00\uacc4 \ud0dc\uadf8",
  none: "\uae30\ub85d \uc5c6\uc74c",
  type: "\uc81c\uc548 \uc720\ud615",
  statement: "\uc131\uba85",
  negotiation: "\ud611\uc0c1",
  treaty: "\uc870\uc57d \uc81c\uc548",
  trade: "\ubb34\uc5ed \uc81c\uc548",
  aid: "\uc6d0\uc870",
  warning: "\uacbd\uace0",
  other: "\uae30\ud0c0",
  title: "\uc81c\ubaa9",
  body: "\ub0b4\uc6a9",
  visibility: "\uacf5\uac1c \ubc94\uc704",
  private: "\ube44\uacf5\uac1c",
  public: "\uacf5\uac1c",
  send: "\uc678\uad50 \uc81c\uc548 \ubcf4\ub0b4\uae30",
  turnClosed: "\ud604\uc7ac\ub294 \uc81c\uc548\uc744 \ubcf4\ub0bc \uc218 \uc5c6\uc2b5\ub2c8\ub2e4.",
  friendly: "\uc6b0\ud638",
  positive: "\ud638\uc758",
  neutral: "\uc911\ub9bd",
  tense: "\uae34\uc7a5",
  hostile: "\uc801\ub300",
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
  colorAssignments,
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
  rasterRevision: number;
  rasterWidth: number;
  rasterHeight: number;
  colorAssignments: Assignment[];
  countries: Country[];
  ownCountryId: string;
  relations: Relation[];
  turnOpen: boolean;
  divisionRevision: number;
}) {
  const sampleCanvasRef = useRef<HTMLCanvasElement>(null);
  const [sampledRevision, setSampledRevision] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [popupPoint, setPopupPoint] = useState<PopupPoint>(null);

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

  const selected = countries.find((country) => country.id === selectedId) ?? null;
  const relation = relations.find((item) => item.toCountryId === selectedId);
  const score = relation?.score ?? 0;
  const tag =
    score >= 60
      ? COPY.friendly
      : score >= 25
        ? COPY.positive
        : score > -25
          ? COPY.neutral
          : score > -60
            ? COPY.tense
            : COPY.hostile;
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

  function selectArea(event: MouseEvent<HTMLImageElement>) {
    const canvas = sampleCanvasRef.current;
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !context || sampledRevision !== rasterRevision) return;
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
    if (pixel[3] < 128 || (pixel[0] <= 32 && pixel[1] <= 32 && pixel[2] <= 32)) {
      setSelectedId(null);
      setPopupPoint(null);
      return;
    }
    const countryId = assignedCountryByColor.get(quantizedHex(pixel[0], pixel[1], pixel[2]));
    if (!countryId || countryId === ownCountryId) {
      setSelectedId(null);
      setPopupPoint(null);
      return;
    }
    setSelectedId(countryId);
    setPopupPoint({
      left: Math.max(14, Math.min(86, ((event.clientX - bounds.left) / bounds.width) * 100)),
      top: Math.max(12, Math.min(76, ((event.clientY - bounds.top) / bounds.height) * 100)),
    });
  }

  return (
    <div className="pixel-diplomacy-map">
      <div className="pixel-diplomacy-canvas-wrap">
        <Image
          src={`/api/map/image?mapId=${encodeURIComponent(mapId)}&v=${rasterRevision}`}
          alt="16K 세계 정치 지도"
          width={rasterWidth}
          height={rasterHeight}
          sizes="100vw"
          priority
          unoptimized
          className="pixel-diplomacy-canvas"
          draggable={false}
          onLoad={(event) => prepareSampler(event.currentTarget)}
          onClick={selectArea}
        />
        <canvas ref={sampleCanvasRef} className="pixel-map-sampler" aria-hidden="true" />
        {selected && popupPoint && (
          <aside
            className="diplomacy-map-popup panel"
            style={{ left: popupPoint.left + "%", top: popupPoint.top + "%" }}
          >
            <button
              type="button"
              className="pixel-menu-close"
              aria-label={COPY.close}
              onClick={() => setPopupPoint(null)}
            >
              x
            </button>
            <span className="eyebrow">
              {selected.code} ? {selected.isAi ? COPY.ai : COPY.player}
            </span>
            <h2>{selected.name}</h2>
            <div className="relation-meter">
              <strong>{score}</strong>
              <span>{tag}</span>
            </div>
            <p className="muted">
              {COPY.tags}: {relation?.tags.join(", ") || COPY.none}
            </p>
            <form action={sendDiplomaticProposalAction} className="form-stack">
              <input type="hidden" name="toCountryId" value={selected.id} />
              <label>
                {COPY.type}
                <select name="type" defaultValue="NEGOTIATION">
                  <option value="STATEMENT">{COPY.statement}</option>
                  <option value="NEGOTIATION">{COPY.negotiation}</option>
                  <option value="TREATY">{COPY.treaty}</option>
                  <option value="TRADE">{COPY.trade}</option>
                  <option value="AID">{COPY.aid}</option>
                  <option value="WARNING">{COPY.warning}</option>
                  <option value="OTHER">{COPY.other}</option>
                </select>
              </label>
              <label>
                {COPY.title}
                <input name="title" required minLength={4} maxLength={160} />
              </label>
              <label>
                {COPY.body}
                <textarea name="body" required minLength={20} maxLength={6000} />
              </label>
              <label>
                {COPY.visibility}
                <select name="visibility">
                  <option value="PRIVATE">{COPY.private}</option>
                  <option value="PUBLIC">{COPY.public}</option>
                </select>
              </label>
              <button type="submit" disabled={!turnOpen}>
                {COPY.send}
              </button>
              {!turnOpen && <p className="muted">{COPY.turnClosed}</p>}
            </form>
          </aside>
        )}
      </div>
    </div>
  );
}
