"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { attachAudioHiss } from "./audio-hiss";

const GENERAL_OST_PLAYLIST = [
  "/ost/general-04.mp3",
  "/ost/general-05.mp3",
  "/ost/general-06.mp3",
  "/ost/general-07.mp3",
  "/ost/general-08.mp3",
  "/ost/general-09.mp3",
  "/ost/general-10.mp3",
  "/ost/general-11.mp3",
] as const;

function shuffledPlaylist() {
  const tracks = [...GENERAL_OST_PLAYLIST];
  for (let index = tracks.length - 1; index > 0; index -= 1) {
    const random = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
    const swapIndex = random % (index + 1);
    [tracks[index], tracks[swapIndex]] = [tracks[swapIndex], tracks[index]];
  }
  return tracks;
}

const PUBLIC_ROUTES = new Set(["/", "/login", "/register", "/unauthorized"]);

export const OST_START_EVENT = "nexus:ost-start";
export const OST_STOP_EVENT = "nexus:ost-stop";
/** 슈퍼이벤트처럼 자체 음원을 가진 연출이 뜬 동안 배경 음악을 눌러 둔다. */
export const OST_DUCK_EVENT = "nexus:ost-duck";
export const OST_RESTORE_EVENT = "nexus:ost-restore";

const BASE_VOLUME = 0.4;
const HISS_LEVEL = 0.028;

export function BackgroundOst() {
  const pathname = usePathname();
  const audioRef = useRef<HTMLAudioElement>(null);
  const hissRef = useRef<ReturnType<typeof attachAudioHiss> | null>(null);
  const [playlist, setPlaylist] = useState<string[]>([]);
  const [trackIndex, setTrackIndex] = useState(0);
  const duckedRef = useRef(false);
  const shouldPlay = !PUBLIC_ROUTES.has(pathname);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setPlaylist(shuffledPlaylist()));
    return () => cancelAnimationFrame(frame);
  }, []);

  const ensureHiss = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return null;
    if (!hissRef.current) {
      hissRef.current = attachAudioHiss(audio, { hissLevel: HISS_LEVEL });
    }
    return hissRef.current;
  }, []);

  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const hiss = ensureHiss();
    void hiss?.resume();
    if (duckedRef.current) {
      hiss?.setVolume(0);
      hiss?.setHissMuted(true);
      return;
    }
    hiss?.setVolume(BASE_VOLUME);
    hiss?.setHissMuted(false);
    void audio.play().catch(() => undefined);
  }, [ensureHiss]);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    hissRef.current?.setVolume(0);
    hissRef.current?.setHissMuted(true);
    setTrackIndex(0);
  }, []);

  useEffect(() => {
    const startFromLogin = () => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.currentTime = 0;
      setPlaylist(shuffledPlaylist());
      setTrackIndex(0);
      requestAnimationFrame(play);
    };

    const duck = () => {
      duckedRef.current = true;
      audioRef.current?.pause();
      hissRef.current?.setVolume(0);
      hissRef.current?.setHissMuted(true);
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
    if (!playlist.length) return;

    play();
    const resume = () => play();
    window.addEventListener("pointerdown", resume, { once: true });
    window.addEventListener("keydown", resume, { once: true });
    return () => {
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
    };
  }, [play, playlist, shouldPlay, stop, trackIndex]);

  useEffect(
    () => () => {
      hissRef.current?.dispose();
      hissRef.current = null;
    },
    [],
  );

  return (
    <audio
      ref={audioRef}
      src={playlist[trackIndex]}
      preload="auto"
      aria-hidden="true"
      onEnded={() => setTrackIndex((current) => (current + 1) % playlist.length)}
    />
  );
}
