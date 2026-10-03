"use client";

/**
 * HTMLAudioElement 출력에 얇은 테이프/라디오 히스를 섞는다.
 * MediaElementSource는 요소당 한 번만 만들 수 있으므로 WeakMap으로 재사용한다.
 * 볼륨은 element.volume 대신 GainNode로 조절해야 들린다.
 */

type HissHandle = {
  setVolume: (volume: number) => void;
  setHissLevel: (level: number) => void;
  setHissMuted: (muted: boolean) => void;
  resume: () => Promise<void>;
  dispose: () => void;
};

type Wiring = {
  context: AudioContext;
  musicGain: GainNode;
  noiseGain: GainNode;
  noise: AudioBufferSourceNode;
  hissLevel: number;
  hissMuted: boolean;
  disposed: boolean;
};

const wirings = new WeakMap<HTMLAudioElement, Wiring>();
let sharedContext: AudioContext | null = null;

function getContext(): AudioContext {
  if (!sharedContext || sharedContext.state === "closed") {
    sharedContext = new AudioContext();
  }
  return sharedContext;
}

function makeNoiseBuffer(context: AudioContext, seconds = 2): AudioBuffer {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  // 약한 갈색 노이즈에 가깝게 적분해 거친 화이트 노이즈보다 덜 날카롭게 만든다.
  let last = 0;
  for (let i = 0; i < length; i += 1) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.5;
  }
  return buffer;
}

function syncNoiseGain(wiring: Wiring) {
  wiring.noiseGain.gain.value = wiring.hissMuted || wiring.disposed ? 0 : wiring.hissLevel;
}

/**
 * audio 요소에 히스를 연결한다. 이미 연결된 요소면 핸들만 돌려준다.
 * @param hissLevel 목적지 기준 절대 게인. 0.02~0.05 정도가 은은하다.
 */
export function attachAudioHiss(
  audio: HTMLAudioElement,
  { hissLevel = 0.03 }: { hissLevel?: number } = {},
): HissHandle {
  let wiring = wirings.get(audio);

  if (!wiring || wiring.disposed) {
    const context = getContext();
    const source = context.createMediaElementSource(audio);
    const musicGain = context.createGain();
    const noiseGain = context.createGain();
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 2800;
    filter.Q.value = 0.55;

    const noise = context.createBufferSource();
    noise.buffer = makeNoiseBuffer(context);
    noise.loop = true;

    source.connect(musicGain);
    musicGain.connect(context.destination);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(context.destination);
    noise.start();

    wiring = {
      context,
      musicGain,
      noiseGain,
      noise,
      hissLevel,
      hissMuted: false,
      disposed: false,
    };
    wirings.set(audio, wiring);
    syncNoiseGain(wiring);
  } else {
    wiring.hissLevel = hissLevel;
    syncNoiseGain(wiring);
  }

  const current = wiring;
  return {
    setVolume(volume: number) {
      if (current.disposed) return;
      current.musicGain.gain.value = Math.max(0, Math.min(1, volume));
    },
    setHissLevel(level: number) {
      if (current.disposed) return;
      current.hissLevel = Math.max(0, Math.min(0.2, level));
      syncNoiseGain(current);
    },
    setHissMuted(muted: boolean) {
      if (current.disposed) return;
      current.hissMuted = muted;
      syncNoiseGain(current);
    },
    async resume() {
      if (current.disposed) return;
      if (current.context.state === "suspended") await current.context.resume();
    },
    dispose() {
      if (current.disposed) return;
      current.disposed = true;
      current.noiseGain.gain.value = 0;
      current.musicGain.gain.value = 0;
      try {
        current.noise.stop();
      } catch {
        // already stopped
      }
      try {
        current.noise.disconnect();
        current.noiseGain.disconnect();
        current.musicGain.disconnect();
      } catch {
        // graph already torn down with the element
      }
    },
  };
}
