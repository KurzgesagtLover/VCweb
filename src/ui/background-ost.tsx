"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const GENERAL_OST_PLAYLIST = [
  "/ost/general-01.mp3",
  "/ost/general-02.mp3",
  "/ost/general-03.mp3",
  "/ost/general-03-extra.mp3",
  "/ost/general-04.mp3",
  "/ost/general-05.mp3",
  "/ost/general-06.mp3",
  "/ost/general-07.mp3",
  "/ost/general-08.mp3",
  "/ost/general-09.mp3",
  "/ost/general-10.mp3",
  "/ost/general-11.mp3",
] as const;

const PUBLIC_ROUTES = new Set(["/", "/login", "/register", "/unauthorized"]);

export const OST_START_EVENT = "nexus:ost-start";
export const OST_STOP_EVENT = "nexus:ost-stop";
/** 슈퍼이벤트처럼 자체 음원을 가진 연출이 뜬 동안 배경 음악을 눌러 둔다. */
export const OST_DUCK_EVENT = "nexus:ost-duck";
export const OST_RESTORE_EVENT = "nexus:ost-restore";

const BASE_VOLUME = 0.4;

export function BackgroundOst() {
  const pathname = usePathname();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [trackIndex, setTrackIndex] = useState(0);
  const duckedRef = useRef(false);
  const shouldPlay = !PUBLIC_ROUTES.has(pathname);

  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = duckedRef.current ? 0 : BASE_VOLUME;
    if (duckedRef.current) return;
    void audio.play().catch(() => undefined);
  }, []);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setTrackIndex(0);
  }, []);

  useEffect(() => {
    const startFromLogin = () => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.currentTime = 0;
      setTrackIndex(0);
      play();
    };

    const duck = () => {
      duckedRef.current = true;
      audioRef.current?.pause();
    };
    const restore = () => {
      duckedRef.current = false;
      play();
    };

    window.addEventListener(OST_START_EVENT, startFromLogin);
    window.addEventListener(OST_STOP_EVENT, stop);
    window.addEventListener(OST_DUCK_EVENT, duck);
    window.addEventListener(OST_RESTORE_EVENT, restore);
    return () => {
      window.removeEventListener(OST_START_EVENT, startFromLogin);
      window.removeEventListener(OST_STOP_EVENT, stop);
      window.removeEventListener(OST_DUCK_EVENT, duck);
      window.removeEventListener(OST_RESTORE_EVENT, restore);
    };
  }, [play, stop]);

  useEffect(() => {
    if (!shouldPlay) {
      stop();
      return;
    }

    play();
    const resume = () => play();
    window.addEventListener("pointerdown", resume, { once: true });
    window.addEventListener("keydown", resume, { once: true });
    return () => {
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
    };
  }, [play, shouldPlay, stop, trackIndex]);

  return (
    <audio
      ref={audioRef}
      src={GENERAL_OST_PLAYLIST[trackIndex]}
      preload="auto"
      aria-hidden="true"
      onEnded={() => setTrackIndex((current) => (current + 1) % GENERAL_OST_PLAYLIST.length)}
    />
  );
}
