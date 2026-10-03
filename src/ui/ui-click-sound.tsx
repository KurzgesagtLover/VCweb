"use client";

import { useEffect } from "react";

const CLICKABLE =
  "button, a.gate-choice, a.button, a.nav-rail-link, input[type='submit'], input[type='button'], [role='button'], .se-dismiss, .sb-continue, summary";

let sharedContext: AudioContext | null = null;
let lastButtonAt = 0;
let lastCountryAt = 0;
let pressedTarget: Element | null = null;

function getContext(): AudioContext {
  if (!sharedContext || sharedContext.state === "closed") {
    sharedContext = new AudioContext();
  }
  return sharedContext;
}

function createOutput(context: AudioContext, volume: number) {
  const gain = context.createGain();
  gain.gain.value = volume;

  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 8;
  compressor.ratio.value = 5;
  compressor.attack.value = 0.0015;
  compressor.release.value = 0.08;

  gain.connect(compressor);
  compressor.connect(context.destination);
  return gain;
}

function createNoise(context: AudioContext, duration: number) {
  const frames = Math.max(1, Math.floor(context.sampleRate * duration));
  const buffer = context.createBuffer(1, frames, context.sampleRate);
  const data = buffer.getChannelData(0);

  let previous = 0;
  for (let index = 0; index < frames; index += 1) {
    const white = Math.random() * 2 - 1;
    previous = previous * 0.18 + white * 0.82;
    data[index] = previous;
  }

  const source = context.createBufferSource();
  source.buffer = buffer;
  return source;
}

function scheduleLeverTravel(
  context: AudioContext,
  output: AudioNode,
  at: number,
  duration: number,
  gainAmount: number,
) {
  const travel = createNoise(context, duration);
  const band = context.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 0.7;
  band.frequency.setValueAtTime(520, at);
  band.frequency.exponentialRampToValueAtTime(1_450, at + duration);

  const level = context.createGain();
  level.gain.setValueAtTime(0.0001, at);
  level.gain.linearRampToValueAtTime(gainAmount, at + 0.006);
  level.gain.setValueAtTime(gainAmount * 0.72, at + duration * 0.62);
  level.gain.exponentialRampToValueAtTime(0.0001, at + duration);

  travel.connect(band);
  band.connect(level);
  level.connect(output);
  travel.start(at);
  travel.stop(at + duration);
}

function scheduleSpringTension(
  context: AudioContext,
  output: AudioNode,
  at: number,
  duration: number,
  startFrequency: number,
  endFrequency: number,
  gainAmount: number,
) {
  const spring = context.createOscillator();
  spring.type = "triangle";
  spring.frequency.setValueAtTime(startFrequency, at);
  spring.frequency.exponentialRampToValueAtTime(endFrequency, at + duration);

  const level = context.createGain();
  level.gain.setValueAtTime(0.0001, at);
  level.gain.linearRampToValueAtTime(gainAmount, at + 0.008);
  level.gain.exponentialRampToValueAtTime(0.0001, at + duration);

  spring.connect(level);
  level.connect(output);
  spring.start(at);
  spring.stop(at + duration);
}

function scheduleDetentSnap(
  context: AudioContext,
  output: AudioNode,
  at: number,
  strength: number,
  bodyFrequency: number,
) {
  // 접점 스냅, 금속 레버, 외함 울림은 같은 순간에 발생해 하나의 타격으로 들린다.
  const snap = createNoise(context, 0.024);
  const snapBand = context.createBiquadFilter();
  snapBand.type = "bandpass";
  snapBand.frequency.value = 1_750;
  snapBand.Q.value = 0.85;
  const snapLevel = context.createGain();
  snapLevel.gain.setValueAtTime(strength, at);
  snapLevel.gain.exponentialRampToValueAtTime(0.0001, at + 0.024);
  snap.connect(snapBand);
  snapBand.connect(snapLevel);
  snapLevel.connect(output);

  const thump = createNoise(context, 0.05);
  const thumpFilter = context.createBiquadFilter();
  thumpFilter.type = "lowpass";
  thumpFilter.frequency.value = 430;
  thumpFilter.Q.value = 0.55;
  const thumpLevel = context.createGain();
  thumpLevel.gain.setValueAtTime(strength * 0.78, at);
  thumpLevel.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
  thump.connect(thumpFilter);
  thumpFilter.connect(thumpLevel);
  thumpLevel.connect(output);

  const body = context.createOscillator();
  body.type = "triangle";
  body.frequency.setValueAtTime(bodyFrequency * 1.22, at);
  body.frequency.exponentialRampToValueAtTime(bodyFrequency, at + 0.065);
  const bodyLevel = context.createGain();
  bodyLevel.gain.setValueAtTime(strength * 0.52, at);
  bodyLevel.gain.exponentialRampToValueAtTime(0.0001, at + 0.065);
  body.connect(bodyLevel);
  bodyLevel.connect(output);

  const metal = context.createOscillator();
  metal.type = "sine";
  metal.frequency.setValueAtTime(bodyFrequency * 12.5, at);
  metal.frequency.exponentialRampToValueAtTime(bodyFrequency * 9.8, at + 0.028);
  const metalLevel = context.createGain();
  metalLevel.gain.setValueAtTime(strength * 0.09, at);
  metalLevel.gain.exponentialRampToValueAtTime(0.0001, at + 0.028);
  metal.connect(metalLevel);
  metalLevel.connect(output);

  snap.start(at);
  snap.stop(at + 0.024);
  thump.start(at);
  thump.stop(at + 0.05);
  body.start(at);
  body.stop(at + 0.065);
  metal.start(at);
  metal.stop(at + 0.028);
}

function playButtonClick() {
  const now = performance.now();
  if (now - lastButtonAt < 55) return;
  lastButtonAt = now;

  const context = getContext();
  void context.resume();

  const at = context.currentTime + 0.004;
  const output = createOutput(context, 1.05);
  scheduleLeverTravel(context, output, at, 0.052, 0.075);
  scheduleSpringTension(context, output, at, 0.038, 76, 126, 0.035);
  scheduleDetentSnap(context, output, at + 0.032, 0.24, 92);
}

export function playCountrySelectSound() {
  const now = performance.now();
  if (now - lastCountryAt < 90) return;
  lastCountryAt = now;

  const context = getContext();
  void context.resume();

  const at = context.currentTime + 0.004;
  const output = createOutput(context, 1.08);
  scheduleLeverTravel(context, output, at, 0.07, 0.085);
  scheduleSpringTension(context, output, at, 0.052, 58, 105, 0.045);
  scheduleDetentSnap(context, output, at + 0.044, 0.29, 68);
}

function clickableFrom(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null;
  const hit = target.closest(CLICKABLE);
  if (!hit) return null;
  if (hit instanceof HTMLButtonElement && hit.disabled) return null;
  if (hit instanceof HTMLInputElement && hit.disabled) return null;
  if (hit.getAttribute("aria-disabled") === "true") return null;
  if (hit.hasAttribute("disabled")) return null;
  return hit;
}

export function UiClickSound() {
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const hit = clickableFrom(event.target);
      if (!hit || hit.getAttribute("data-click-sound") === "country") return;
      pressedTarget = hit;
    };

    const onPointerUp = (event: PointerEvent) => {
      if (event.button !== 0 || !pressedTarget) return;
      const releasedTarget = clickableFrom(event.target);
      const shouldPlay = releasedTarget === pressedTarget;
      pressedTarget = null;
      if (shouldPlay) playButtonClick();
    };

    const onPointerCancel = () => {
      pressedTarget = null;
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("pointercancel", onPointerCancel, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("pointercancel", onPointerCancel, true);
    };
  }, []);

  return null;
}
