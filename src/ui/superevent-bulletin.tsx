"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  formatBulletinDate,
  splitBulletinSections,
  splitSuperEventBody,
  SUPER_EVENT_BULLETIN_DEFAULTS,
  type SuperEventBulletinView,
} from "@/src/domain/superevents/template";

export type SuperEventBulletinMode = "live" | "preview" | "embed";

const EDITION_LABEL: Record<SuperEventBulletinMode, string> = {
  live: "호외 · EXTRA",
  preview: "호외 미리보기",
  embed: "호외 편성 미리보기",
};

const TYPEWRITER_TICK_MS = 20;
const TYPEWRITER_MAX_TICKS = 800;

/**
 * 호외(일반 이벤트). 슈퍼이벤트 앞에 한 장 끼는 신문 지면으로,
 * 전대역 송출과 달리 배경을 흐리지 않고 지면만 얹는다. 자체 음원도 없다.
 */
export function SuperEventBulletin({
  bulletin,
  broadcastAt,
  codeName,
  mode = "live",
  onContinue,
}: {
  bulletin: SuperEventBulletinView;
  broadcastAt: string | null;
  codeName: string;
  mode?: SuperEventBulletinMode;
  onContinue?: () => void;
}) {
  const overlay = mode !== "embed";
  const [phase, setPhase] = useState<"boot" | "live">("boot");
  const [visibleCharacters, setVisibleCharacters] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const caretRef = useRef<HTMLSpanElement>(null);
  const paragraphs = useMemo(() => splitSuperEventBody(bulletin.body), [bulletin.body]);
  const paragraphCharacters = useMemo(
    () => paragraphs.map((paragraph) => Array.from(paragraph)),
    [paragraphs],
  );
  const totalCharacters = useMemo(
    () => paragraphCharacters.reduce((sum, characters) => sum + characters.length, 0),
    [paragraphCharacters],
  );
  const shownCharacters = mode === "embed" ? totalCharacters : visibleCharacters;
  const typing = mode !== "embed" && phase === "live" && shownCharacters < totalCharacters;
  const sections = splitBulletinSections(bulletin.section);
  // 송출 전 초안은 기준 시각이 없어 서버와 클라이언트의 "지금"이 어긋난다. 붙은 뒤에 찍는다.
  const dateline = broadcastAt || phase === "live" ? formatBulletinDate(broadcastAt) : "";
  const kicker = bulletin.kicker.trim() || SUPER_EVENT_BULLETIN_DEFAULTS.kicker;

  useEffect(() => {
    const timer = setTimeout(() => setPhase("live"), 40);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (mode === "embed" || phase !== "live" || visibleCharacters >= totalCharacters) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const timer = window.setTimeout(() => setVisibleCharacters(totalCharacters), 0);
      return () => window.clearTimeout(timer);
    }

    const charactersPerTick = Math.max(1, Math.ceil(totalCharacters / TYPEWRITER_MAX_TICKS));
    const timer = window.setTimeout(
      () => setVisibleCharacters((count) => Math.min(totalCharacters, count + charactersPerTick)),
      TYPEWRITER_TICK_MS,
    );
    return () => window.clearTimeout(timer);
  }, [mode, phase, totalCharacters, visibleCharacters]);

  useEffect(() => {
    if (!typing) return;
    caretRef.current?.scrollIntoView({ block: "nearest" });
  }, [shownCharacters, typing]);

  useEffect(() => {
    if (!overlay || phase !== "live") return;
    if (typing) stageRef.current?.focus();
    else continueRef.current?.focus();
  }, [overlay, phase, typing]);

  useEffect(() => {
    if (!overlay) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [overlay]);

  useEffect(() => {
    if (!overlay || !onContinue) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== "Escape") return;
      if (phase !== "live") return;
      event.preventDefault();
      if (event.key === "Enter" && typing) {
        setVisibleCharacters(totalCharacters);
        return;
      }
      onContinue();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onContinue, overlay, phase, totalCharacters, typing]);

  return (
    <div
      className="sb-stage"
      ref={stageRef}
      tabIndex={overlay ? -1 : undefined}
      data-phase={phase}
      data-mode={mode}
      role={overlay ? "dialog" : undefined}
      aria-modal={overlay ? true : undefined}
      aria-labelledby={overlay ? "sb-headline" : undefined}
    >
      <article className="sb-page">
        <header className="sb-masthead">
          <span className="sb-edition">{EDITION_LABEL[mode]}</span>
          <strong className="sb-outlet">
            {bulletin.outlet || SUPER_EVENT_BULLETIN_DEFAULTS.outlet}
          </strong>
          <span className="sb-dateline">
            {dateline}
            {codeName && <em>{codeName}</em>}
          </span>
        </header>

        {sections.length > 0 && (
          <nav className="sb-sections" aria-label="지면 구성">
            {sections.map((section) => (
              <span key={section}>{section}</span>
            ))}
          </nav>
        )}

        <div className="sb-sheet">
          <h1 className="sb-headline" id="sb-headline">
            {bulletin.headline || "제목 없는 기사"}
          </h1>
          {bulletin.byline && <p className="sb-byline">{bulletin.byline}</p>}

          <div className="sb-article">
            {bulletin.imageUrl && (
              <figure className="sb-plate">
                <Image
                  src={bulletin.imageUrl}
                  alt=""
                  fill
                  sizes="(max-width: 720px) 100vw, 55vw"
                  unoptimized
                />
                <span className="se-grain" aria-hidden="true" />
                {bulletin.imageCaption && <figcaption>{bulletin.imageCaption}</figcaption>}
              </figure>
            )}

            {paragraphs.length > 0 && (
              <div
                className="sb-body"
                data-typing={typing ? "true" : undefined}
                onClick={() => {
                  if (typing) setVisibleCharacters(totalCharacters);
                }}
              >
                {mode !== "embed" && <span className="sr-only">{paragraphs.join("\n\n")}</span>}
                {paragraphCharacters.map((characters, index) => {
                  const charactersBefore = paragraphCharacters
                    .slice(0, index)
                    .reduce((sum, item) => sum + item.length, 0);
                  const count = Math.max(
                    0,
                    Math.min(characters.length, shownCharacters - charactersBefore),
                  );
                  const isActive = typing && count > 0 && count < characters.length;
                  const isNext = typing && count === 0 && shownCharacters === charactersBefore;

                  return (
                    <p key={`${index}-${characters.slice(0, 12).join("")}`} aria-hidden={overlay}>
                      {characters.slice(0, count).join("")}
                      {(isActive || isNext) && (
                        <span className="sb-type-caret" ref={caretRef} aria-hidden="true" />
                      )}
                    </p>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <button
          className="sb-continue"
          type="button"
          ref={continueRef}
          disabled={!onContinue}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || !typing) return;
            event.preventDefault();
            event.stopPropagation();
            setVisibleCharacters(totalCharacters);
          }}
          onClick={() => {
            if (typing) setVisibleCharacters(totalCharacters);
            else onContinue?.();
          }}
        >
          <span className="sb-continue-mark" aria-hidden="true" />
          <span className="sb-continue-label">{kicker}</span>
          <em aria-hidden="true">ENTER</em>
        </button>
      </article>
    </div>
  );
}
