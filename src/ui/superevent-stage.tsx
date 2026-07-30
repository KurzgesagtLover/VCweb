"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  formatSuperEventStamp,
  splitSuperEventBody,
  type SuperEventView,
} from "@/src/domain/superevents/template";
import { OST_DUCK_EVENT, OST_RESTORE_EVENT } from "./background-ost";

export type SuperEventStageMode = "live" | "preview" | "embed";

const LIVE_LABEL: Record<SuperEventStageMode, string> = {
  live: "송출 중",
  preview: "미리보기",
  embed: "편성 미리보기",
};

/**
 * 슈퍼이벤트 단일 템플릿. 화면 전체를 덮는 전대역 송출 창으로,
 * 사진·오디오·문구만 갈아 끼워 어떤 사건에도 쓴다.
 *
 * live는 플레이어에게 실제로 송출할 때, preview는 관리자가 전체 화면으로 확인할 때,
 * embed는 편성 화면 안에 축소해 붙일 때 쓴다.
 */
export function SuperEventStage({
  view,
  onDismiss,
  mode = "live",
}: {
  view: SuperEventView;
  onDismiss?: () => void;
  mode?: SuperEventStageMode;
}) {
  const overlay = mode !== "embed";
  const [phase, setPhase] = useState<"boot" | "live">("boot");
  const [remaining, setRemaining] = useState(mode === "live" ? view.holdSeconds : 0);
  const dismissRef = useRef<HTMLButtonElement>(null);
  const paragraphs = splitSuperEventBody(view.body);
  const locked = remaining > 0;

  // 잠깐 암전을 둔 뒤 브라운관을 켜듯 창을 점화한다.
  useEffect(() => {
    const timer = setTimeout(() => setPhase("live"), 220);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (phase !== "live" || remaining <= 0) return;
    const timer = setTimeout(() => setRemaining((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [phase, remaining]);

  useEffect(() => {
    if (overlay && phase === "live" && !locked) dismissRef.current?.focus();
  }, [locked, overlay, phase]);

  // 송출 중에는 뒤 화면을 굴리지 못하게 하고, 배경 음악은 잠시 눌러 둔다.
  useEffect(() => {
    if (!overlay) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.dispatchEvent(new Event(OST_DUCK_EVENT));
    return () => {
      document.body.style.overflow = previousOverflow;
      window.dispatchEvent(new Event(OST_RESTORE_EVENT));
    };
  }, [overlay]);

  useEffect(() => {
    if (!overlay || !onDismiss) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== "Escape") return;
      if (locked || phase !== "live") return;
      event.preventDefault();
      onDismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [locked, onDismiss, overlay, phase]);

  return (
    <div
      className="se-stage"
      data-phase={phase}
      data-mode={mode}
      role={overlay ? "dialog" : undefined}
      aria-modal={overlay ? true : undefined}
      aria-labelledby={overlay ? `se-title-${view.id}` : undefined}
    >
      {view.imageUrl && (
        <div className="se-bleed" aria-hidden="true">
          <Image src={view.imageUrl} alt="" fill sizes="100vw" unoptimized />
        </div>
      )}
      <div className="se-noise" aria-hidden="true" />
      <div className="se-flash" aria-hidden="true" />

      <article className="se-window">
        <header className="se-rail">
          <span className="se-live">
            <i aria-hidden="true" />
            {LIVE_LABEL[mode]}
          </span>
          <span className="se-code">{view.codeName || "SE-000"}</span>
          <span className="se-source">{view.sourceLabel}</span>
          <span className="se-clock">{formatSuperEventStamp(view.broadcastAt)}</span>
        </header>

        {view.imageUrl ? (
          <figure className="se-plate">
            <Image src={view.imageUrl} alt={view.imageAlt} fill sizes="100vw" unoptimized />
            <span className="se-plate-grid" aria-hidden="true" />
            {view.subtitle && <figcaption>{view.subtitle}</figcaption>}
          </figure>
        ) : (
          view.subtitle && <p className="se-eyebrow">{view.subtitle}</p>
        )}

        <div className="se-copy">
          <h1 className="se-title" id={`se-title-${view.id}`}>
            {view.title}
          </h1>
          <span className="se-rule" aria-hidden="true" />
          {paragraphs.length > 0 && (
            <div className="se-body">
              {paragraphs.map((paragraph, index) => (
                <p key={`${index}-${paragraph.slice(0, 12)}`}>{paragraph}</p>
              ))}
            </div>
          )}
        </div>

        <footer className="se-foot">
          <div className="se-seal">
            {view.stampText && <span className="se-stamp">{view.stampText}</span>}
            {view.footnote && <p>{view.footnote}</p>}
          </div>
          <button
            className="se-dismiss"
            type="button"
            ref={dismissRef}
            disabled={locked || !onDismiss}
            onClick={onDismiss}
          >
            <span>{view.dismissLabel || "확인"}</span>
            {locked && <em aria-hidden="true">{remaining}</em>}
          </button>
        </footer>
      </article>

      {mode === "live" && view.audioUrl && (
        <SuperEventAudio
          src={view.audioUrl}
          volume={view.audioVolume}
          startSeconds={view.audioStartSeconds}
          reduceIntro={view.audioIntroReduced}
        />
      )}
    </div>
  );
}

function SuperEventAudio({
  src,
  volume,
  startSeconds,
  reduceIntro,
}: {
  src: string;
  volume: number;
  startSeconds: number;
  reduceIntro: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const targetVolume = Math.min(1, Math.max(0, volume / 100));
    let rampFrame: number | null = null;
    let rampStarted = false;
    let introComplete = !reduceIntro;

    const seekToStart = () => {
      const latestStart = Number.isFinite(audio.duration)
        ? Math.min(startSeconds, Math.max(0, audio.duration - 0.1))
        : startSeconds;
      try {
        audio.currentTime = latestStart;
      } catch {
        // Metadata can arrive after the first autoplay attempt.
      }
    };
    const rampVolume = () => {
      if (introComplete || rampStarted || targetVolume === 0) return;
      rampStarted = true;
      const startedAt = performance.now();
      const step = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / 5000);
        audio.volume = targetVolume * (0.35 + progress * 0.65);
        if (progress < 1) rampFrame = requestAnimationFrame(step);
        else {
          rampFrame = null;
          introComplete = true;
        }
      };
      rampFrame = requestAnimationFrame(step);
    };
    const play = () => {
      void audio
        .play()
        .then(rampVolume)
        .catch(() => undefined);
    };
    const prepare = () => {
      seekToStart();
      audio.volume = reduceIntro ? targetVolume * 0.35 : targetVolume;
      play();
    };
    const repeatFromStart = () => {
      if (rampFrame !== null) cancelAnimationFrame(rampFrame);
      rampFrame = null;
      introComplete = true;
      audio.volume = targetVolume;
      seekToStart();
      play();
    };

    if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) prepare();
    else audio.addEventListener("loadedmetadata", prepare, { once: true });
    // 자동 재생이 막힌 브라우저에서는 첫 조작에 맞춰 다시 시도한다.
    window.addEventListener("pointerdown", play, { once: true });
    window.addEventListener("keydown", play, { once: true });
    audio.addEventListener("ended", repeatFromStart);
    return () => {
      if (rampFrame !== null) cancelAnimationFrame(rampFrame);
      audio.removeEventListener("loadedmetadata", prepare);
      audio.removeEventListener("ended", repeatFromStart);
      window.removeEventListener("pointerdown", play);
      window.removeEventListener("keydown", play);
      audio.pause();
    };
  }, [reduceIntro, src, startSeconds, volume]);

  return <audio ref={audioRef} src={src} preload="auto" aria-hidden="true" />;
}
