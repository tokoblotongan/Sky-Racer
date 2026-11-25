// src/audio/audioManager.ts

import { CONFIG } from '../config';

export type NoiseType = 'white' | 'brown';

export interface AudioBuses {
  sfx: GainNode;
  engine: GainNode;
  ambience: GainNode;
  master: GainNode;
}

export interface AudioManager {
  init: () => void;
  unlock: () => void;
  setMuted: (muted: boolean) => void;
  toggleMute: () => boolean;
  getMuted: () => boolean;
  setMasterVolume: (volume: number) => void;
  getMasterVolume: () => number;
  getBuses: () => AudioBuses | null;
  getContext: () => AudioContext | null;
  getNoiseBuffer: (type: NoiseType) => AudioBuffer | null;
  isUnlocked: () => boolean;
  isReady: () => boolean;
  dispose: () => void;
}

interface StoredAudioPrefs {
  muted?: boolean;
  masterVolume?: number;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function loadAudioPrefs(): { muted: boolean; masterVolume: number } {
  const defaults = {
    muted: Boolean(CONFIG.audio.mutedByDefault),
    masterVolume: clamp01(CONFIG.audio.masterVolume),
  };

  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return defaults;
    }
    const raw = window.localStorage.getItem(CONFIG.audio.storageKey);
    if (!raw) {
      return defaults;
    }
    const parsed = JSON.parse(raw) as StoredAudioPrefs;
    return {
      muted: typeof parsed.muted === 'boolean' ? parsed.muted : defaults.muted,
      masterVolume:
        typeof parsed.masterVolume === 'number' && Number.isFinite(parsed.masterVolume)
          ? clamp01(parsed.masterVolume)
          : defaults.masterVolume,
    };
  } catch {
    return defaults;
  }
}

function saveAudioPrefs(muted: boolean, masterVolume: number): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    const payload: StoredAudioPrefs = { muted, masterVolume };
    window.localStorage.setItem(CONFIG.audio.storageKey, JSON.stringify(payload));
  } catch {
    // Ignore storage quota or private browsing errors
  }
}

function createNoiseBuffer(ctx: AudioContext, type: NoiseType): AudioBuffer {
  const durationSec = 2;
  const sampleRate = ctx.sampleRate;
  const length = Math.max(1024, Math.floor(sampleRate * durationSec));
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  if (type === 'white') {
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  } else {
    let lastOut = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + 0.02 * white) / 1.02;
      data[i] = Math.max(-1, Math.min(1, lastOut * 3.5));
    }
    // Crossfade end into start for click-free seamless looping
    const fadeSamples = Math.min(256, Math.floor(length * 0.05));
    for (let i = 0; i < fadeSamples; i++) {
      const t = i / fadeSamples;
      const tailIdx = length - fadeSamples + i;
      data[tailIdx] = data[tailIdx] * (1 - t) + data[i] * t;
    }
  }

  return buffer;
}

export function createAudioManager(): AudioManager {
  let ctx: AudioContext | null = null;
  let buses: AudioBuses | null = null;
  let limiter: DynamicsCompressorNode | null = null;
  let whiteNoiseBuffer: AudioBuffer | null = null;
  let brownNoiseBuffer: AudioBuffer | null = null;

  let initialized = false;
  let disposed = false;
  let unlocked = false;
  let unlockListenersAttached = false;

  const prefs = loadAudioPrefs();
  let muted = prefs.muted;
  let masterVolume = prefs.masterVolume;

  function applyMasterGain(immediate = false): void {
    if (!ctx || !buses) {
      return;
    }
    const target = muted ? 0 : masterVolume;
    const now = ctx.currentTime;
    buses.master.gain.cancelScheduledValues(now);
    if (immediate) {
      buses.master.gain.setValueAtTime(target, now);
    } else {
      buses.master.gain.setTargetAtTime(target, now, 0.015);
    }
  }

  function removeUnlockListeners(): void {
    if (!unlockListenersAttached) {
      return;
    }
    window.removeEventListener('keydown', handleFirstInteraction, true);
    window.removeEventListener('pointerdown', handleFirstInteraction, true);
    unlockListenersAttached = false;
  }

  function resumeContext(): void {
    if (!ctx || disposed) {
      return;
    }
    if (ctx.state === 'suspended') {
      ctx
        .resume()
        .then(() => {
          if (ctx && ctx.state === 'running') {
            unlocked = true;
            removeUnlockListeners();
          }
        })
        .catch(() => {
          // Ignore autoplay restriction errors until next user gesture
        });
    } else if (ctx.state === 'running') {
      unlocked = true;
      removeUnlockListeners();
    }
  }

  function handleFirstInteraction(): void {
    if (disposed) {
      removeUnlockListeners();
      return;
    }
    if (!initialized) {
      init();
    }
    unlocked = true;
    resumeContext();
    removeUnlockListeners();
  }

  function handleVisibilityChange(): void {
    if (!ctx || disposed) {
      return;
    }
    if (document.hidden) {
      if (ctx.state === 'running') {
        ctx.suspend().catch(() => {});
      }
    } else if (unlocked && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  }

  function init(): void {
    if (initialized || disposed) {
      return;
    }
    initialized = true;

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) {
        return;
      }

      ctx = new AudioCtx();
      const cfg = CONFIG.audio;

      const sfxGain = ctx.createGain();
      sfxGain.gain.setValueAtTime(cfg.sfxVolume, ctx.currentTime);

      const engineGain = ctx.createGain();
      engineGain.gain.setValueAtTime(cfg.engineVolume, ctx.currentTime);

      const ambienceGain = ctx.createGain();
      ambienceGain.gain.setValueAtTime(cfg.ambienceVolume, ctx.currentTime);

      const masterGain = ctx.createGain();
      limiter = ctx.createDynamicsCompressor();
      limiter.threshold.setValueAtTime(cfg.limiter.threshold, ctx.currentTime);
      limiter.knee.setValueAtTime(3, ctx.currentTime);
      limiter.ratio.setValueAtTime(cfg.limiter.ratio, ctx.currentTime);
      limiter.attack.setValueAtTime(cfg.limiter.attack, ctx.currentTime);
      limiter.release.setValueAtTime(cfg.limiter.release, ctx.currentTime);

      sfxGain.connect(masterGain);
      engineGain.connect(masterGain);
      ambienceGain.connect(masterGain);
      masterGain.connect(limiter);
      limiter.connect(ctx.destination);

      buses = {
        sfx: sfxGain,
        engine: engineGain,
        ambience: ambienceGain,
        master: masterGain,
      };

      applyMasterGain(true);

      // Build white and brown noise buffers once
      whiteNoiseBuffer = createNoiseBuffer(ctx, 'white');
      brownNoiseBuffer = createNoiseBuffer(ctx, 'brown');

      if (ctx.state === 'running') {
        unlocked = true;
      }

      document.addEventListener('visibilitychange', handleVisibilityChange);
    } catch {
      ctx = null;
      buses = null;
      limiter = null;
    }
  }

  function unlock(): void {
    if (disposed) {
      return;
    }
    if (!initialized) {
      init();
    }
    if (!ctx) {
      return;
    }
    if (ctx.state === 'running') {
      unlocked = true;
      removeUnlockListeners();
      return;
    }
    if (!unlockListenersAttached) {
      window.addEventListener('keydown', handleFirstInteraction, { capture: true, passive: true });
      window.addEventListener('pointerdown', handleFirstInteraction, { capture: true, passive: true });
      unlockListenersAttached = true;
    }
    // Also attempt resume immediately in case unlock() was invoked from a gesture
    resumeContext();
  }

  function setMuted(nextMuted: boolean): void {
    muted = Boolean(nextMuted);
    applyMasterGain(false);
    saveAudioPrefs(muted, masterVolume);
  }

  function toggleMute(): boolean {
    setMuted(!muted);
    return muted;
  }

  function getMuted(): boolean {
    return muted;
  }

  function setMasterVolume(volume: number): void {
    masterVolume = clamp01(Number.isFinite(volume) ? volume : masterVolume);
    applyMasterGain(false);
    saveAudioPrefs(muted, masterVolume);
  }

  function getMasterVolume(): number {
    return masterVolume;
  }

  function getBuses(): AudioBuses | null {
    return buses;
  }

  function getContext(): AudioContext | null {
    return ctx;
  }

  function getNoiseBuffer(type: NoiseType): AudioBuffer | null {
    if (!ctx) {
      return null;
    }
    if (type === 'white') {
      if (!whiteNoiseBuffer) {
        whiteNoiseBuffer = createNoiseBuffer(ctx, 'white');
      }
      return whiteNoiseBuffer;
    }
    if (!brownNoiseBuffer) {
      brownNoiseBuffer = createNoiseBuffer(ctx, 'brown');
    }
    return brownNoiseBuffer;
  }

  function isUnlocked(): boolean {
    return Boolean(ctx && !disposed && (unlocked || ctx.state === 'running'));
  }

  function isReady(): boolean {
    return Boolean(ctx && buses && !disposed);
  }

  function dispose(): void {
    if (disposed) {
      return;
    }
    disposed = true;
    removeUnlockListeners();
    document.removeEventListener('visibilitychange', handleVisibilityChange);

    if (buses) {
      buses.sfx.disconnect();
      buses.engine.disconnect();
      buses.ambience.disconnect();
      buses.master.disconnect();
      buses = null;
    }
    if (limiter) {
      limiter.disconnect();
      limiter = null;
    }
    whiteNoiseBuffer = null;
    brownNoiseBuffer = null;

    if (ctx) {
      ctx.close().catch(() => {});
      ctx = null;
    }
  }

  return {
    init,
    unlock,
    setMuted,
    toggleMute,
    getMuted,
    setMasterVolume,
    getMasterVolume,
    getBuses,
    getContext,
    getNoiseBuffer,
    isUnlocked,
    isReady,
    dispose,
  };
}
