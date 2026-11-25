// src/audio/loops.ts

import { CONFIG } from '../config';
import type { AudioManager } from './audioManager';

export interface LoopsUpdateParams {
  speedNorm: number;
  slip: number;
  grounded: boolean;
  airborne: boolean;
  falling: boolean;
  railContact: boolean;
  active: boolean;
}

export interface LoopsAudio {
  update: (params: LoopsUpdateParams, dt: number) => void;
  notifyRailHit: (intensity: number) => void;
  reset: () => void;
  dispose: () => void;
}

export function createLoops(manager: AudioManager): LoopsAudio {
  const ctx = manager.getContext();
  const buses = manager.getBuses();
  const whiteBuffer = manager.getNoiseBuffer('white');
  const brownBuffer = manager.getNoiseBuffer('brown');
  const cfg = CONFIG.audio;
  const updateInterval = 1 / Math.max(1, cfg.updateRateHz);

  let whiteSource: AudioBufferSourceNode | null = null;
  let brownSource: AudioBufferSourceNode | null = null;

  let skidFilter: BiquadFilterNode | null = null;
  let skidGain: GainNode | null = null;

  let windFilter: BiquadFilterNode | null = null;
  let windGain: GainNode | null = null;

  let railFilter: BiquadFilterNode | null = null;
  let railGain: GainNode | null = null;

  let ambienceFilter: BiquadFilterNode | null = null;
  let ambienceGain: GainNode | null = null;

  let railHitFallbackLevel = 0;
  let updateAccumulator = 0;
  let disposed = false;

  if (ctx && buses) {
    const now = ctx.currentTime;

    if (whiteBuffer) {
      whiteSource = ctx.createBufferSource();
      whiteSource.buffer = whiteBuffer;
      whiteSource.loop = true;

      // 1. Tire skid / drift squeal
      skidFilter = ctx.createBiquadFilter();
      skidFilter.type = 'bandpass';
      skidFilter.frequency.setValueAtTime(cfg.skid.filterFreq, now);
      skidFilter.Q.setValueAtTime(cfg.skid.filterQ, now);

      skidGain = ctx.createGain();
      skidGain.gain.setValueAtTime(0, now);

      whiteSource.connect(skidFilter);
      skidFilter.connect(skidGain);
      skidGain.connect(buses.sfx);

      // 2. Speed & airborne wind
      windFilter = ctx.createBiquadFilter();
      windFilter.type = 'lowpass';
      windFilter.frequency.setValueAtTime(cfg.wind.filterBase, now);
      windFilter.Q.setValueAtTime(0.7, now);

      windGain = ctx.createGain();
      windGain.gain.setValueAtTime(0, now);

      whiteSource.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(buses.sfx);

      // 3. Guardrail scrape hiss
      railFilter = ctx.createBiquadFilter();
      railFilter.type = 'bandpass';
      railFilter.frequency.setValueAtTime(cfg.railScrape.filterFreq, now);
      railFilter.Q.setValueAtTime(cfg.railScrape.filterQ, now);

      railGain = ctx.createGain();
      railGain.gain.setValueAtTime(0, now);

      whiteSource.connect(railFilter);
      railFilter.connect(railGain);
      railGain.connect(buses.sfx);

      whiteSource.start(now);
    }

    // 4. Subtle room brown-noise ambience
    if (brownBuffer) {
      brownSource = ctx.createBufferSource();
      brownSource.buffer = brownBuffer;
      brownSource.loop = true;

      ambienceFilter = ctx.createBiquadFilter();
      ambienceFilter.type = 'lowpass';
      ambienceFilter.frequency.setValueAtTime(cfg.ambience.filterFreq, now);
      ambienceFilter.Q.setValueAtTime(0.6, now);

      ambienceGain = ctx.createGain();
      ambienceGain.gain.setValueAtTime(cfg.ambience.level, now);

      brownSource.connect(ambienceFilter);
      ambienceFilter.connect(ambienceGain);
      ambienceGain.connect(buses.ambience);

      brownSource.start(now);
    }
  }

  function silenceGameplayLoops(): void {
    if (!ctx) {
      return;
    }
    const now = ctx.currentTime;
    if (skidGain) skidGain.gain.setTargetAtTime(0, now, 0.04);
    if (windGain) windGain.gain.setTargetAtTime(0, now, 0.06);
    if (railGain) railGain.gain.setTargetAtTime(0, now, 0.04);
  }

  function notifyRailHit(intensity: number): void {
    railHitFallbackLevel = Math.max(railHitFallbackLevel, Math.max(0.2, Math.min(1, intensity)));
  }

  function update(params: LoopsUpdateParams, dt: number): void {
    if (disposed || !ctx) {
      return;
    }

    if (railHitFallbackLevel > 0) {
      railHitFallbackLevel = Math.max(0, railHitFallbackLevel - cfg.railScrape.decayRate * dt);
    }

    updateAccumulator += dt;
    if (updateAccumulator < updateInterval) {
      return;
    }
    updateAccumulator = 0;

    if (!params.active) {
      silenceGameplayLoops();
      return;
    }

    const now = ctx.currentTime;
    const speedClamped = Math.max(0, Math.min(1.4, params.speedNorm));

    // 1. Skid / tire squeal when grounded with slip above threshold
    if (skidGain && skidFilter) {
      let targetSkid = 0;
      if (params.grounded && speedClamped > 0.08 && params.slip > cfg.skid.slipThreshold) {
        const slipNorm = Math.min(
          1,
          (params.slip - cfg.skid.slipThreshold) / Math.max(0.15, 0.65 - cfg.skid.slipThreshold),
        );
        const speedScale = Math.min(1, speedClamped * 1.4);
        targetSkid = cfg.skid.gainMax * slipNorm * speedScale;
        skidFilter.frequency.setTargetAtTime(
          cfg.skid.filterFreq + slipNorm * 420,
          now,
          0.045,
        );
      }
      skidGain.gain.setTargetAtTime(targetSkid, now, 0.04);
    }

    // 2. Wind scaled by speed and boosted when airborne or falling
    if (windGain && windFilter) {
      const airMultiplier = params.airborne || params.falling ? cfg.wind.airBoost : 1;
      const windAmount = Math.pow(Math.min(1.25, speedClamped), 1.35);
      const targetWind = Math.min(cfg.wind.gainMax * cfg.wind.airBoost, cfg.wind.gainMax * windAmount * airMultiplier);
      const windCutoff =
        cfg.wind.filterBase +
        (cfg.wind.filterMax - cfg.wind.filterBase) * Math.min(1, speedClamped * (params.airborne ? 1.15 : 0.9));

      windGain.gain.setTargetAtTime(targetWind, now, 0.06);
      windFilter.frequency.setTargetAtTime(windCutoff, now, 0.07);
    }

    // 3. Guardrail scrape from railContact flag (or fallback decay after railHit)
    if (railGain && railFilter) {
      const hasContact = params.grounded && params.railContact;
      const scrapeIntensity = hasContact
        ? Math.min(1, 0.3 + speedClamped * 0.7)
        : params.grounded
          ? railHitFallbackLevel * 0.7
          : 0;
      const targetRail = cfg.railScrape.gainMax * scrapeIntensity;
      railGain.gain.setTargetAtTime(targetRail, now, 0.035);
      railFilter.frequency.setTargetAtTime(
        cfg.railScrape.filterFreq + speedClamped * 450,
        now,
        0.045,
      );
    }
  }

  function reset(): void {
    railHitFallbackLevel = 0;
    updateAccumulator = updateInterval;
    silenceGameplayLoops();
  }

  function dispose(): void {
    if (disposed) {
      return;
    }
    disposed = true;
    try {
      whiteSource?.stop();
      brownSource?.stop();
    } catch {
      // Ignore already-stopped nodes
    }
    whiteSource?.disconnect();
    brownSource?.disconnect();
    skidFilter?.disconnect();
    skidGain?.disconnect();
    windFilter?.disconnect();
    windGain?.disconnect();
    railFilter?.disconnect();
    railGain?.disconnect();
    ambienceFilter?.disconnect();
    ambienceGain?.disconnect();

    whiteSource = null;
    brownSource = null;
    skidFilter = null;
    skidGain = null;
    windFilter = null;
    windGain = null;
    railFilter = null;
    railGain = null;
    ambienceFilter = null;
    ambienceGain = null;
  }

  return {
    update,
    notifyRailHit,
    reset,
    dispose,
  };
}
