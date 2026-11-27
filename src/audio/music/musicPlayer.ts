// src/audio/music/musicPlayer.ts

import { CONFIG } from '../../config';
import { logErrorOverlay } from '../../ui/errorOverlay';
import type { AudioManager } from '../audioManager';

export type MusicTrackId = keyof typeof CONFIG.audio.music.tracks;

export type MusicPlaybackStatus =
  | 'stopped'
  | 'queued'
  | 'playing'
  | 'paused'
  | 'error'
  | 'disabled';

export interface MusicDebugSnapshot {
  trackId: MusicTrackId | null;
  trackLabel: string;
  volume: number;
  effectiveVolume: number;
  enabled: boolean;
  muted: boolean;
  status: MusicPlaybackStatus;
}

export interface PlayTrackOptions {
  loop: boolean;
  fadeSeconds?: number;
  forceRestart?: boolean;
  fadeOutAtEnd?: boolean;
  introVolumeScale?: number;
}

export interface MusicPlayer {
  init: () => void;
  playTrack: (trackId: MusicTrackId, options: PlayTrackOptions) => void;
  preloadTrack: (trackId: MusicTrackId) => void;
  setIntroScale: (scale: number) => void;
  setCountdownDuck: (active: boolean) => void;
  triggerEventDuck: () => void;
  setPaused: (paused: boolean) => void;
  setTotalMuted: (muted: boolean) => void;
  setMusicEnabled: (enabled: boolean) => void;
  toggleMusicEnabled: () => boolean;
  isMusicEnabled: () => boolean;
  setVolume: (volume: number) => void;
  getVolume: () => number;
  getCurrentTrackId: () => MusicTrackId | null;
  getDebugSnapshot: () => MusicDebugSnapshot;
  update: (dt: number) => void;
  dispose: () => void;
}

interface StoredMusicPrefs {
  enabled?: boolean;
  volume?: number;
}

interface AudioSlot {
  el: HTMLAudioElement;
  source: MediaElementAudioSourceNode | null;
  gainNode: GainNode | null;
  trackId: MusicTrackId | null;
  loop: boolean;
  fadeOutAtEnd: boolean;
  gainValue: number;
  fadeFrom: number;
  fadeTo: number;
  fadeElapsed: number;
  fadeDuration: number;
  pauseAfterFade: boolean;
  endFadeTriggered: boolean;
  retryCount: number;
  errored: boolean;
  finishedNaturally: boolean;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function isNoMusicUrlEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    return new URLSearchParams(window.location.search).has('nomusic');
  } catch {
    return window.location.search.includes('nomusic');
  }
}

function resolveTrackUrl(trackId: MusicTrackId): string {
  const base =
    typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL
      ? import.meta.env.BASE_URL
      : '/';
  const cleanBase = base.endsWith('/') ? base : `${base}/`;
  return `${cleanBase}audio/${CONFIG.audio.music.tracks[trackId]}`;
}

function loadMusicPrefs(): { enabled: boolean; volume: number } {
  const cfg = CONFIG.audio.music;
  const defaults = {
    enabled: Boolean(cfg.defaultEnabled),
    volume: clamp01(cfg.defaultVolume),
  };
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return defaults;
    }
    const raw = window.localStorage.getItem(cfg.storageKey);
    if (!raw) {
      return defaults;
    }
    const parsed = JSON.parse(raw) as StoredMusicPrefs;
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : defaults.enabled,
      volume:
        typeof parsed.volume === 'number' && Number.isFinite(parsed.volume)
          ? clamp01(parsed.volume)
          : defaults.volume,
    };
  } catch {
    return defaults;
  }
}

function saveMusicPrefs(enabled: boolean, volume: number): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    const payload: StoredMusicPrefs = { enabled, volume };
    window.localStorage.setItem(CONFIG.audio.music.storageKey, JSON.stringify(payload));
  } catch {
    // Ignore storage quota or private browsing errors
  }
}

function createAudioSlot(isMobile: boolean): AudioSlot {
  const el = document.createElement('audio');
  el.preload = isMobile ? 'metadata' : 'auto';
  el.crossOrigin = 'anonymous';
  el.volume = 1;
  return {
    el,
    source: null,
    gainNode: null,
    trackId: null,
    loop: false,
    fadeOutAtEnd: false,
    gainValue: 0,
    fadeFrom: 0,
    fadeTo: 0,
    fadeElapsed: 0,
    fadeDuration: 0,
    pauseAfterFade: false,
    endFadeTriggered: false,
    retryCount: 0,
    errored: false,
    finishedNaturally: false,
  };
}

export function createMusicPlayer(
  audioManager: AudioManager,
  isMobile: boolean,
): MusicPlayer {
  const noMusic = isNoMusicUrlEnabled();
  const prefs = loadMusicPrefs();
  let musicEnabled = prefs.enabled;
  let userVolume = prefs.volume;
  let totalMuted = audioManager.getMuted();
  let externalPaused = false;
  let disposed = false;

  const slotA = createAudioSlot(isMobile);
  const slotB = createAudioSlot(isMobile);
  const slots: [AudioSlot, AudioSlot] = [slotA, slotB];
  let activeSlotIdx = 0;

  let musicBusGain: GainNode | null = null;
  let webAudioWired = false;
  let unlockUnsub: (() => void) | null = null;
  let gestureListenersAttached = false;

  const preloadElements = new Map<MusicTrackId, HTMLAudioElement>();

  let currentIntroScale = 1;
  let targetIntroScale = 1;
  let countdownDuckActive = false;
  let eventDuckTimerSec = 0;
  let currentDuckScale = 1;

  let desiredRequest: {
    trackId: MusicTrackId;
    loop: boolean;
    fadeSeconds: number;
    fadeOutAtEnd: boolean;
  } | null = null;

  let status: MusicPlaybackStatus = noMusic ? 'disabled' : 'stopped';

  function getActiveSlot(): AudioSlot {
    return slots[activeSlotIdx];
  }

  function getInactiveSlot(): AudioSlot {
    return slots[1 - activeSlotIdx];
  }

  function ensureWebAudioWired(): void {
    if (webAudioWired || disposed || noMusic) {
      return;
    }
    const ctx = audioManager.getContext();
    const outNode = audioManager.getOutputNode();
    if (!ctx || !outNode) {
      return;
    }
    try {
      musicBusGain = ctx.createGain();
      musicBusGain.gain.setValueAtTime(computeBusGain(), ctx.currentTime);
      musicBusGain.connect(outNode);

      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        s.gainNode = ctx.createGain();
        s.gainNode.gain.setValueAtTime(s.gainValue, ctx.currentTime);
        s.source = ctx.createMediaElementSource(s.el);
        s.source.connect(s.gainNode);
        s.gainNode.connect(musicBusGain);
      }
      webAudioWired = true;
    } catch {
      webAudioWired = false;
    }
  }

  function computeBusGain(): number {
    if (noMusic || !musicEnabled || totalMuted) {
      return 0;
    }
    return clamp01(userVolume * currentIntroScale * currentDuckScale);
  }

  function applySlotGain(slot: AudioSlot): void {
    const g = clamp01(slot.gainValue);
    if (slot.gainNode) {
      const ctx = audioManager.getContext();
      if (ctx) {
        slot.gainNode.gain.setValueAtTime(g, ctx.currentTime);
        return;
      }
    }
    if (!webAudioWired) {
      slot.el.volume = clamp01(g * computeBusGain());
    }
  }

  function applyBusGain(): void {
    const target = computeBusGain();
    if (musicBusGain) {
      const ctx = audioManager.getContext();
      if (ctx) {
        musicBusGain.gain.setValueAtTime(target, ctx.currentTime);
        return;
      }
    }
    if (!webAudioWired) {
      for (let i = 0; i < slots.length; i++) {
        slots[i].el.volume = clamp01(slots[i].gainValue * target);
      }
    }
  }

  function removeGestureRetryListeners(): void {
    if (!gestureListenersAttached || typeof window === 'undefined') {
      return;
    }
    window.removeEventListener('pointerdown', handleGestureRetry, true);
    window.removeEventListener('keydown', handleGestureRetry, true);
    window.removeEventListener('touchend', handleGestureRetry, true);
    window.removeEventListener('click', handleGestureRetry, true);
    gestureListenersAttached = false;
  }

  function attachGestureRetryListeners(): void {
    if (gestureListenersAttached || disposed || noMusic || typeof window === 'undefined') {
      return;
    }
    window.addEventListener('pointerdown', handleGestureRetry, { capture: true, passive: true });
    window.addEventListener('keydown', handleGestureRetry, { capture: true, passive: true });
    window.addEventListener('touchend', handleGestureRetry, { capture: true, passive: true });
    window.addEventListener('click', handleGestureRetry, { capture: true, passive: true });
    gestureListenersAttached = true;
  }

  function startSlotFade(
    slot: AudioSlot,
    from: number,
    to: number,
    durationSec: number,
    pauseAfterFade: boolean,
  ): void {
    slot.fadeFrom = clamp01(from);
    slot.fadeTo = clamp01(to);
    slot.fadeElapsed = 0;
    slot.fadeDuration = Math.max(0, durationSec);
    slot.pauseAfterFade = pauseAfterFade;
    slot.gainValue = slot.fadeFrom;
    if (slot.fadeDuration <= 0) {
      slot.gainValue = slot.fadeTo;
      if (pauseAfterFade && slot.gainValue <= 0.001) {
        slot.el.pause();
      }
    }
    applySlotGain(slot);
  }

  function handleSlotFailure(slot: AudioSlot, reason: string): void {
    if (disposed || noMusic || !slot.trackId) {
      return;
    }
    const failedTrack = slot.trackId;
    if (slot.retryCount < 1) {
      slot.retryCount += 1;
      try {
        slot.el.src = resolveTrackUrl(failedTrack);
        slot.el.load();
        if (
          slot === getActiveSlot() &&
          musicEnabled &&
          !externalPaused &&
          !document.hidden &&
          audioManager.isUnlocked()
        ) {
          void attemptSlotPlay(slot);
        }
      } catch {
        // Fall through to permanent failure if load throws
      }
      return;
    }

    slot.errored = true;
    slot.gainValue = 0;
    applySlotGain(slot);
    try {
      slot.el.pause();
    } catch {
      // Ignore pause error
    }
    if (slot === getActiveSlot()) {
      status = 'error';
    }
    logErrorOverlay(`music failed (${failedTrack}): ${reason}`);
  }

  async function attemptSlotPlay(slot: AudioSlot): Promise<void> {
    if (
      disposed ||
      noMusic ||
      !musicEnabled ||
      externalPaused ||
      (typeof document !== 'undefined' && document.hidden) ||
      !slot.trackId ||
      slot.errored ||
      slot.finishedNaturally
    ) {
      return;
    }

    const reqTrackId = slot.trackId;
    ensureWebAudioWired();
    slot.el.preload = 'auto';

    try {
      const playPromise = slot.el.play();
      if (playPromise && typeof playPromise.then === 'function') {
        await playPromise;
      }
      if (disposed || slot.trackId !== reqTrackId || slot !== getActiveSlot()) {
        return;
      }
      status = 'playing';
      removeGestureRetryListeners();
    } catch (err) {
      if (disposed || slot.trackId !== reqTrackId) {
        return;
      }
      const errName = err instanceof Error ? err.name : '';
      if (errName === 'NotAllowedError') {
        status = 'queued';
        attachGestureRetryListeners();
        return;
      }
      if (errName === 'AbortError') {
        return;
      }
      const msg = err instanceof Error ? err.message : String(err ?? 'play error');
      handleSlotFailure(slot, msg);
    }
  }

  function handleGestureRetry(): void {
    if (disposed || noMusic) {
      removeGestureRetryListeners();
      return;
    }
    audioManager.unlock();
    ensureWebAudioWired();
    const active = getActiveSlot();
    if (
      desiredRequest &&
      musicEnabled &&
      !externalPaused &&
      !(typeof document !== 'undefined' && document.hidden) &&
      active.trackId &&
      !active.errored &&
      !active.finishedNaturally &&
      active.el.paused
    ) {
      void attemptSlotPlay(active);
    }
  }

  function bindSlotEvents(slot: AudioSlot): void {
    slot.el.addEventListener('error', () => {
      if (disposed || noMusic || !slot.trackId || !slot.el.getAttribute('src')) {
        return;
      }
      const code = slot.el.error?.code ?? 0;
      handleSlotFailure(slot, `media error code ${code}`);
    });

    slot.el.addEventListener('ended', () => {
      if (disposed || slot.loop) {
        return;
      }
      slot.finishedNaturally = true;
      if (slot === getActiveSlot()) {
        status = 'stopped';
      }
    });
  }

  bindSlotEvents(slotA);
  bindSlotEvents(slotB);

  function handleVisibilityChange(): void {
    if (disposed || noMusic) {
      return;
    }
    if (document.hidden) {
      for (let i = 0; i < slots.length; i++) {
        try {
          slots[i].el.pause();
        } catch {
          // Ignore pause error
        }
      }
      if (status === 'playing') {
        status = 'paused';
      }
    } else if (!externalPaused && musicEnabled && desiredRequest) {
      const active = getActiveSlot();
      if (active.trackId && !active.errored && !active.finishedNaturally) {
        if (audioManager.isUnlocked()) {
          void attemptSlotPlay(active);
        } else {
          status = 'queued';
          attachGestureRetryListeners();
        }
      }
    }
  }

  function init(): void {
    if (disposed || noMusic) {
      return;
    }
    ensureWebAudioWired();
    if (!unlockUnsub) {
      unlockUnsub = audioManager.onUnlock(() => {
        if (disposed || noMusic) {
          return;
        }
        ensureWebAudioWired();
        const active = getActiveSlot();
        if (
          desiredRequest &&
          musicEnabled &&
          !externalPaused &&
          !(typeof document !== 'undefined' && document.hidden) &&
          active.trackId &&
          !active.errored &&
          !active.finishedNaturally &&
          active.el.paused
        ) {
          void attemptSlotPlay(active);
        }
      });
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
  }

  function preloadTrack(trackId: MusicTrackId): void {
    if (disposed || noMusic || !musicEnabled) {
      return;
    }
    const active = getActiveSlot();
    if (active.trackId === trackId) {
      return;
    }
    const url = resolveTrackUrl(trackId);
    const desiredPreload = isMobile ? 'metadata' : 'auto';
    let preEl = preloadElements.get(trackId);
    if (!preEl) {
      preEl = document.createElement('audio');
      preEl.crossOrigin = 'anonymous';
      preEl.preload = desiredPreload;
      preEl.src = url;
      preloadElements.set(trackId, preEl);
      try {
        preEl.load();
      } catch {
        // Ignore load errors during speculative preload
      }
    } else if (preEl.preload !== desiredPreload) {
      preEl.preload = desiredPreload;
    }
  }

  function playTrack(trackId: MusicTrackId, options: PlayTrackOptions): void {
    if (disposed) {
      return;
    }
    const loop = options.loop;
    const fadeSeconds = Math.max(0, options.fadeSeconds ?? CONFIG.audio.music.fadeSeconds.crossfade);
    const forceRestart = Boolean(options.forceRestart);
    const fadeOutAtEnd = Boolean(options.fadeOutAtEnd);

    if (typeof options.introVolumeScale === 'number') {
      targetIntroScale = clamp01(options.introVolumeScale);
    }

    desiredRequest = {
      trackId,
      loop,
      fadeSeconds,
      fadeOutAtEnd,
    };

    if (noMusic) {
      status = 'disabled';
      return;
    }

    const currentActive = getActiveSlot();
    if (
      currentActive.trackId === trackId &&
      !forceRestart &&
      !currentActive.errored &&
      !currentActive.finishedNaturally
    ) {
      currentActive.loop = loop;
      currentActive.el.loop = loop;
      currentActive.fadeOutAtEnd = fadeOutAtEnd;
      if (musicEnabled && !externalPaused && !(typeof document !== 'undefined' && document.hidden)) {
        if (currentActive.el.paused) {
          if (audioManager.isUnlocked()) {
            void attemptSlotPlay(currentActive);
          } else {
            status = 'queued';
            attachGestureRetryListeners();
          }
        }
      }
      return;
    }

    const targetSlot = getInactiveSlot();
    const prevSlot = currentActive;

    targetSlot.trackId = trackId;
    targetSlot.loop = loop;
    targetSlot.fadeOutAtEnd = fadeOutAtEnd;
    targetSlot.endFadeTriggered = false;
    targetSlot.retryCount = 0;
    targetSlot.errored = false;
    targetSlot.finishedNaturally = false;
    targetSlot.el.loop = loop;
    targetSlot.el.preload =
      audioManager.isUnlocked() || !isMobile ? 'auto' : 'metadata';

    const nextUrl = resolveTrackUrl(trackId);
    try {
      targetSlot.el.pause();
      if (targetSlot.el.getAttribute('src') !== nextUrl) {
        targetSlot.el.src = nextUrl;
      }
      targetSlot.el.currentTime = 0;
    } catch {
      // Ignore seek error before metadata loads
    }

    const shouldCrossfade =
      fadeSeconds > 0 &&
      prevSlot.trackId !== null &&
      prevSlot.trackId !== trackId &&
      !prevSlot.el.paused &&
      !prevSlot.errored;

    if (shouldCrossfade) {
      startSlotFade(prevSlot, prevSlot.gainValue, 0, fadeSeconds, true);
      startSlotFade(targetSlot, 0, 1, fadeSeconds, false);
    } else {
      if (prevSlot !== targetSlot && prevSlot.trackId !== null) {
        startSlotFade(prevSlot, 0, 0, 0, true);
      }
      startSlotFade(targetSlot, 1, 1, 0, false);
    }

    activeSlotIdx = 1 - activeSlotIdx;

    if (!musicEnabled || externalPaused || (typeof document !== 'undefined' && document.hidden)) {
      status = 'paused';
      return;
    }

    if (audioManager.isUnlocked()) {
      void attemptSlotPlay(targetSlot);
    } else {
      status = 'queued';
      attachGestureRetryListeners();
    }
  }

  function setIntroScale(scale: number): void {
    targetIntroScale = clamp01(scale);
  }

  function setCountdownDuck(active: boolean): void {
    countdownDuckActive = Boolean(active);
  }

  function triggerEventDuck(): void {
    eventDuckTimerSec = Math.max(eventDuckTimerSec, CONFIG.audio.music.duck.ms / 1000);
  }

  function setPaused(nextPaused: boolean): void {
    const resolved = Boolean(nextPaused);
    if (resolved === externalPaused || disposed || noMusic) {
      return;
    }
    externalPaused = resolved;
    if (externalPaused || (typeof document !== 'undefined' && document.hidden)) {
      for (let i = 0; i < slots.length; i++) {
        try {
          slots[i].el.pause();
        } catch {
          // Ignore pause errors
        }
      }
      if (status === 'playing') {
        status = 'paused';
      }
    } else if (musicEnabled && desiredRequest) {
      const active = getActiveSlot();
      if (active.trackId && !active.errored && !active.finishedNaturally) {
        if (audioManager.isUnlocked()) {
          void attemptSlotPlay(active);
        } else {
          status = 'queued';
          attachGestureRetryListeners();
        }
      }
    }
  }

  function setTotalMuted(muted: boolean): void {
    totalMuted = Boolean(muted);
    applyBusGain();
  }

  function setMusicEnabled(enabled: boolean): void {
    const resolved = Boolean(enabled);
    if (resolved === musicEnabled) {
      return;
    }
    musicEnabled = resolved;
    saveMusicPrefs(musicEnabled, userVolume);
    applyBusGain();

    if (noMusic || disposed) {
      return;
    }

    if (!musicEnabled) {
      for (let i = 0; i < slots.length; i++) {
        try {
          slots[i].el.pause();
        } catch {
          // Ignore pause error
        }
      }
      if (status !== 'error' && status !== 'disabled') {
        status = 'paused';
      }
      return;
    }

    const active = getActiveSlot();
    if (desiredRequest) {
      if (active.trackId !== desiredRequest.trackId) {
        playTrack(desiredRequest.trackId, {
          loop: desiredRequest.loop,
          fadeSeconds: 0.4,
          fadeOutAtEnd: desiredRequest.fadeOutAtEnd,
        });
      } else if (!externalPaused && !(typeof document !== 'undefined' && document.hidden)) {
        if (audioManager.isUnlocked()) {
          void attemptSlotPlay(active);
        } else {
          status = 'queued';
          attachGestureRetryListeners();
        }
      }
    }
  }

  function toggleMusicEnabled(): boolean {
    setMusicEnabled(!musicEnabled);
    return musicEnabled;
  }

  function isMusicEnabled(): boolean {
    return musicEnabled;
  }

  function setVolume(volume: number): void {
    userVolume = clamp01(Number.isFinite(volume) ? volume : userVolume);
    saveMusicPrefs(musicEnabled, userVolume);
    applyBusGain();
  }

  function getVolume(): number {
    return userVolume;
  }

  function getCurrentTrackId(): MusicTrackId | null {
    return getActiveSlot().trackId ?? desiredRequest?.trackId ?? null;
  }

  function getDebugSnapshot(): MusicDebugSnapshot {
    const trackId = getCurrentTrackId();
    return {
      trackId,
      trackLabel: trackId ? CONFIG.audio.music.tracks[trackId] : 'none',
      volume: userVolume,
      effectiveVolume: computeBusGain(),
      enabled: musicEnabled,
      muted: totalMuted,
      status,
    };
  }

  function update(dt: number): void {
    if (disposed || noMusic) {
      return;
    }
    const safeDt = Math.max(0, Math.min(0.1, dt));

    if (eventDuckTimerSec > 0) {
      eventDuckTimerSec = Math.max(0, eventDuckTimerSec - safeDt);
    }

    const duckCfg = CONFIG.audio.music.duck;
    let targetDuck = 1;
    if (eventDuckTimerSec > 0) {
      targetDuck = Math.min(targetDuck, 1 - duckCfg.hazard);
    }
    if (countdownDuckActive) {
      targetDuck = Math.min(targetDuck, 1 - duckCfg.countdown);
    }

    const duckRate = targetDuck < currentDuckScale ? 22 : 6.5;
    currentDuckScale += (targetDuck - currentDuckScale) * (1 - Math.exp(-duckRate * safeDt));
    currentIntroScale += (targetIntroScale - currentIntroScale) * (1 - Math.exp(-8 * safeDt));
    applyBusGain();

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (slot.fadeDuration > 0 && slot.fadeElapsed < slot.fadeDuration) {
        slot.fadeElapsed = Math.min(slot.fadeDuration, slot.fadeElapsed + safeDt);
        const t = slot.fadeElapsed / slot.fadeDuration;
        slot.gainValue = slot.fadeFrom + (slot.fadeTo - slot.fadeFrom) * t;
        applySlotGain(slot);
        if (slot.fadeElapsed >= slot.fadeDuration && slot.pauseAfterFade && slot.gainValue <= 0.001) {
          try {
            slot.el.pause();
          } catch {
            // Ignore pause errors
          }
          slot.pauseAfterFade = false;
        }
      }
    }

    const active = getActiveSlot();
    if (
      active.fadeOutAtEnd &&
      !active.loop &&
      !active.endFadeTriggered &&
      !active.el.paused &&
      Number.isFinite(active.el.duration) &&
      active.el.duration > 0
    ) {
      const remaining = active.el.duration - active.el.currentTime;
      const endFadeSec = CONFIG.audio.music.fadeSeconds.end;
      if (remaining > 0.05 && remaining <= endFadeSec) {
        active.endFadeTriggered = true;
        startSlotFade(active, active.gainValue, 0, remaining, false);
      }
    }
  }

  function dispose(): void {
    if (disposed) {
      return;
    }
    disposed = true;
    removeGestureRetryListeners();
    if (unlockUnsub) {
      unlockUnsub();
      unlockUnsub = null;
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      try {
        s.el.pause();
        s.el.removeAttribute('src');
        s.el.load();
      } catch {
        // Ignore cleanup errors
      }
      try {
        s.source?.disconnect();
        s.gainNode?.disconnect();
      } catch {
        // Ignore Web Audio disconnect errors
      }
      s.source = null;
      s.gainNode = null;
      s.trackId = null;
    }
    try {
      musicBusGain?.disconnect();
    } catch {
      // Ignore disconnect errors
    }
    musicBusGain = null;

    preloadElements.forEach((el) => {
      try {
        el.pause();
        el.removeAttribute('src');
        el.load();
      } catch {
        // Ignore preload cleanup errors
      }
    });
    preloadElements.clear();
  }

  return {
    init,
    playTrack,
    preloadTrack,
    setIntroScale,
    setCountdownDuck,
    triggerEventDuck,
    setPaused,
    setTotalMuted,
    setMusicEnabled,
    toggleMusicEnabled,
    isMusicEnabled,
    setVolume,
    getVolume,
    getCurrentTrackId,
    getDebugSnapshot,
    update,
    dispose,
  };
}
