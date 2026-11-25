// src/audio/engine.ts

import { CONFIG } from '../config';
import type { AudioManager } from './audioManager';

export interface EngineUpdateParams {
  speedNorm: number;
  throttle: number;
  boostActive: boolean;
  airborne: boolean;
  active: boolean;
}

export interface EngineAudio {
  update: (params: EngineUpdateParams, dt: number) => void;
  fadeOut: () => void;
  fadeIn: () => void;
  reset: () => void;
  dispose: () => void;
}

export function createEngine(manager: AudioManager): EngineAudio {
  const ctx = manager.getContext();
  const buses = manager.getBuses();
  const whiteBuffer = manager.getNoiseBuffer('white');
  const cfg = CONFIG.audio.engine;
  const updateInterval = 1 / Math.max(1, CONFIG.audio.updateRateHz);

  let oscSaw: OscillatorNode | null = null;
  let oscSquare: OscillatorNode | null = null;
  let oscSawGain: GainNode | null = null;
  let oscSquareGain: GainNode | null = null;
  let engineFilter: BiquadFilterNode | null = null;
  let motorMixGain: GainNode | null = null;

  let noiseSource: AudioBufferSourceNode | null = null;
  let tireFilter: BiquadFilterNode | null = null;
  let tireGain: GainNode | null = null;
  let boostFilter: BiquadFilterNode | null = null;
  let boostGain: GainNode | null = null;

  let envelopeGain: GainNode | null = null;
  let isFadedIn = false;
  let updateAccumulator = 0;
  let disposed = false;

  if (ctx && buses) {
    try {
      const now = ctx.currentTime;

      envelopeGain = ctx.createGain();
      envelopeGain.gain.setValueAtTime(0, now);
      envelopeGain.connect(buses.engine);

      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.setValueAtTime(cfg.filterBase, now);
      engineFilter.Q.setValueAtTime(1.4, now);

      motorMixGain = ctx.createGain();
      motorMixGain.gain.setValueAtTime(cfg.idleGain, now);

      oscSaw = ctx.createOscillator();
      oscSaw.type = 'sawtooth';
      oscSaw.frequency.setValueAtTime(cfg.idleFreq, now);
      oscSaw.detune.setValueAtTime(-cfg.detuneCents, now);
      oscSawGain = ctx.createGain();
      oscSawGain.gain.setValueAtTime(0.58, now);

      oscSquare = ctx.createOscillator();
      oscSquare.type = 'square';
      oscSquare.frequency.setValueAtTime(cfg.idleFreq * 1.002, now);
      oscSquare.detune.setValueAtTime(cfg.detuneCents, now);
      oscSquareGain = ctx.createGain();
      oscSquareGain.gain.setValueAtTime(0.32, now);

      oscSaw.connect(oscSawGain);
      oscSquare.connect(oscSquareGain);
      oscSawGain.connect(engineFilter);
      oscSquareGain.connect(engineFilter);
      engineFilter.connect(motorMixGain);
      motorMixGain.connect(envelopeGain);

      oscSaw.start(now);
      oscSquare.start(now);

      if (whiteBuffer) {
        noiseSource = ctx.createBufferSource();
        noiseSource.buffer = whiteBuffer;
        noiseSource.loop = true;

        tireFilter = ctx.createBiquadFilter();
        tireFilter.type = 'bandpass';
        tireFilter.frequency.setValueAtTime(860, now);
        tireFilter.Q.setValueAtTime(1.1, now);

        tireGain = ctx.createGain();
        tireGain.gain.setValueAtTime(0, now);

        boostFilter = ctx.createBiquadFilter();
        boostFilter.type = 'bandpass';
        boostFilter.frequency.setValueAtTime(1250, now);
        boostFilter.Q.setValueAtTime(1.4, now);

        boostGain = ctx.createGain();
        boostGain.gain.setValueAtTime(0, now);

        noiseSource.connect(tireFilter);
        tireFilter.connect(tireGain);
        tireGain.connect(envelopeGain);

        noiseSource.connect(boostFilter);
        boostFilter.connect(boostGain);
        boostGain.connect(envelopeGain);

        noiseSource.start(now);
      }
    } catch {
      dispose();
    }
  }

  function applyIdleTargets(): void {
    if (!ctx || ctx.state !== 'running' || !oscSaw || !oscSquare || !engineFilter || !motorMixGain) {
      return;
    }
    try {
      const now = ctx.currentTime;
      oscSaw.frequency.setTargetAtTime(cfg.idleFreq, now, 0.05);
      oscSquare.frequency.setTargetAtTime(cfg.idleFreq * 1.002, now, 0.05);
      engineFilter.frequency.setTargetAtTime(cfg.filterBase, now, 0.05);
      motorMixGain.gain.setTargetAtTime(cfg.idleGain, now, 0.05);
      if (tireGain) {
        tireGain.gain.setTargetAtTime(0, now, 0.04);
      }
      if (boostGain) {
        boostGain.gain.setTargetAtTime(0, now, 0.05);
      }
    } catch {
      // Ignore WebAudio scheduling errors
    }
  }

  function fadeOut(): void {
    if (disposed || !ctx || !envelopeGain) {
      return;
    }
    if (!isFadedIn) {
      return;
    }
    isFadedIn = false;
    try {
      const now = ctx.currentTime;
      const tc = Math.max(0.02, cfg.fadeOutTime / 3);
      envelopeGain.gain.cancelScheduledValues(now);
      envelopeGain.gain.setTargetAtTime(0, now, tc);
    } catch {
      // Ignore fade errors
    }
  }

  function fadeIn(): void {
    if (disposed || !ctx || !envelopeGain || ctx.state !== 'running') {
      return;
    }
    if (isFadedIn) {
      return;
    }
    isFadedIn = true;
    try {
      const now = ctx.currentTime;
      const tc = Math.max(0.015, cfg.fadeInTime / 3);
      envelopeGain.gain.cancelScheduledValues(now);
      envelopeGain.gain.setTargetAtTime(1, now, tc);
    } catch {
      // Ignore fade errors
    }
  }

  function update(params: EngineUpdateParams, dt: number): void {
    if (
      disposed ||
      !ctx ||
      ctx.state !== 'running' ||
      !oscSaw ||
      !oscSquare ||
      !engineFilter ||
      !motorMixGain
    ) {
      return;
    }

    updateAccumulator += dt;
    if (updateAccumulator < updateInterval) {
      return;
    }
    updateAccumulator = 0;

    try {
      if (!params.active) {
        if (isFadedIn) {
          fadeOut();
        }
        applyIdleTargets();
        return;
      }

      if (!isFadedIn) {
        fadeIn();
      }

    const now = ctx.currentTime;
    const speedClamped = Math.max(0, Math.min(1.4, params.speedNorm));
    const throttleClamped = Math.max(0, Math.min(1, params.throttle));

    // Base frequency rises smoothly with speed and slight throttle load
    const speedCurve = Math.pow(Math.min(1, speedClamped), 0.85);
    let targetFreq =
      cfg.idleFreq +
      (cfg.maxFreq - cfg.idleFreq) * speedCurve +
      throttleClamped * 16 +
      Math.max(0, speedClamped - 1) * 45;

    if (params.boostActive) {
      targetFreq *= cfg.boostPitchMult;
    }
    if (params.airborne) {
      targetFreq *= cfg.airRevMult;
    }

    const pitchTimeConst = params.airborne ? 0.065 : 0.05;
    oscSaw.frequency.setTargetAtTime(targetFreq, now, pitchTimeConst);
    oscSquare.frequency.setTargetAtTime(targetFreq * 1.003, now, pitchTimeConst);

    // Filter opens with speed, throttle, and boost
    const cutoffFactor = Math.min(
      1,
      speedClamped * 0.72 +
        throttleClamped * 0.28 +
        (params.boostActive ? 0.22 : 0) +
        (params.airborne ? 0.1 : 0),
    );
    const targetCutoff = cfg.filterBase + (cfg.filterMax - cfg.filterBase) * cutoffFactor;
    engineFilter.frequency.setTargetAtTime(targetCutoff, now, 0.055);

    // Gain rises gently from quiet idle to full drive without overwhelming SFX
    const loadRatio = Math.min(1, speedClamped * 0.75 + throttleClamped * 0.35);
    const targetMotorGain =
      cfg.idleGain +
      (cfg.driveGain - cfg.idleGain) * loadRatio +
      (params.boostActive ? 0.04 : 0);
    motorMixGain.gain.setTargetAtTime(targetMotorGain, now, 0.05);

    if (tireGain && tireFilter) {
      const targetTireGain = params.airborne
        ? 0
        : cfg.tireNoiseLevel * Math.min(1, speedClamped);
      tireGain.gain.setTargetAtTime(targetTireGain, now, 0.05);
      tireFilter.frequency.setTargetAtTime(620 + speedClamped * 750, now, 0.06);
    }

    if (boostGain && boostFilter) {
      const targetBoostGain = params.boostActive
        ? cfg.boostWhooshLevel * (params.airborne ? 0.75 : 1)
        : 0;
      boostGain.gain.setTargetAtTime(targetBoostGain, now, 0.06);
      boostFilter.frequency.setTargetAtTime(
        params.boostActive ? 1450 + speedClamped * 500 : 950,
        now,
        0.07,
      );
      }
    } catch {
      // Ignore engine audio scheduling errors
    }
  }

  function reset(): void {
    updateAccumulator = updateInterval;
    applyIdleTargets();
  }

  function dispose(): void {
    if (disposed) {
      return;
    }
    disposed = true;
    try {
      oscSaw?.stop();
      oscSquare?.stop();
      noiseSource?.stop();
    } catch {
      // Ignore already-stopped nodes
    }
    oscSaw?.disconnect();
    oscSquare?.disconnect();
    oscSawGain?.disconnect();
    oscSquareGain?.disconnect();
    engineFilter?.disconnect();
    motorMixGain?.disconnect();
    noiseSource?.disconnect();
    tireFilter?.disconnect();
    tireGain?.disconnect();
    boostFilter?.disconnect();
    boostGain?.disconnect();
    envelopeGain?.disconnect();

    oscSaw = null;
    oscSquare = null;
    oscSawGain = null;
    oscSquareGain = null;
    engineFilter = null;
    motorMixGain = null;
    noiseSource = null;
    tireFilter = null;
    tireGain = null;
    boostFilter = null;
    boostGain = null;
    envelopeGain = null;
  }

  return {
    update,
    fadeOut,
    fadeIn,
    reset,
    dispose,
  };
}
