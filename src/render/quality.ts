// src/render/quality.ts

import { CONFIG } from '../config';

export type QualityLevel = 'mobile' | 'low' | 'medium' | 'high';
export type QualityConfig = typeof CONFIG.quality;
export type QualityPreset = Omit<QualityConfig['levels'][QualityLevel], 'pixelRatioMax'> & {
  readonly pixelRatioMax: number;
};

export interface QualityManager {
  update: (dt: number) => void;
  getLevel: () => QualityLevel;
  setLevel: (level: QualityLevel) => void;
  getPreset: () => QualityPreset;
  getAverageFps: () => number;
  getAverageFrameMs: () => number;
  dispose: () => void;
}

const QUALITY_ORDER: readonly QualityLevel[] = ['mobile', 'low', 'medium', 'high'];

function isCoarsePointerDevice(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  if (window.matchMedia?.('(pointer: coarse)').matches) {
    return true;
  }
  return typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0 && window.innerWidth <= 1024;
}

export function isMobileQualityTarget(
  config: QualityConfig = CONFIG.quality,
  isCoarse = isCoarsePointerDevice(),
): boolean {
  if (isCoarse) {
    return true;
  }
  if (typeof navigator === 'undefined') {
    return false;
  }
  if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    return true;
  }
  const nav = navigator as Navigator & { deviceMemory?: number };
  if (
    typeof nav.deviceMemory === 'number' &&
    nav.deviceMemory <= config.mobileDetect.maxDeviceMemoryGb
  ) {
    return true;
  }
  if (
    typeof nav.hardwareConcurrency === 'number' &&
    nav.hardwareConcurrency <= config.mobileDetect.maxHardwareConcurrency
  ) {
    return true;
  }
  return false;
}

export function detectInitialQuality(
  config: QualityConfig = CONFIG.quality,
  isCoarse = isCoarsePointerDevice(),
): QualityLevel {
  if (config.initialOverride) {
    if (isCoarse && config.initialOverride === 'high') {
      return 'medium';
    }
    return config.initialOverride;
  }

  if (isMobileQualityTarget(config, isCoarse)) {
    return 'mobile';
  }

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  if (dpr >= 2.0) {
    return 'medium';
  }
  return 'high';
}

function getEffectivePreset(config: QualityConfig, level: QualityLevel, isCoarse: boolean): QualityPreset {
  const effectiveLevel: QualityLevel = isCoarse && level === 'high' ? 'medium' : level;
  const base = config.levels[effectiveLevel];
  if (!isCoarse || base.pixelRatioMax <= 1.5) {
    return base;
  }
  return {
    ...base,
    pixelRatioMax: 1.5,
  };
}

export function createQualityManager(
  config: QualityConfig = CONFIG.quality,
  onChange?: (level: QualityLevel, preset: QualityPreset) => void,
): QualityManager {
  const isCoarse = isCoarsePointerDevice();
  let currentLevel: QualityLevel = detectInitialQuality(config, isCoarse);
  let lowestAutoLevel: QualityLevel = currentLevel;

  let warmupRemaining: number = config.warmupSec;
  let sampleTime = 0;
  let sampleFrames = 0;
  let slowAccum = 0;
  let lastAvgFps = 60;
  let lastAvgFrameMs = 16.67;

  let debugEl: HTMLElement | null = null;
  if (config.showQualityDebug && typeof document !== 'undefined') {
    debugEl = document.createElement('div');
    debugEl.style.position = 'fixed';
    debugEl.style.top = '10px';
    debugEl.style.right = '10px';
    debugEl.style.padding = '6px 10px';
    debugEl.style.borderRadius = '6px';
    debugEl.style.background = 'rgba(15, 23, 42, 0.8)';
    debugEl.style.border = '1px solid rgba(53, 212, 255, 0.45)';
    debugEl.style.color = '#35D4FF';
    debugEl.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace';
    debugEl.style.fontSize = '12px';
    debugEl.style.fontWeight = '700';
    debugEl.style.pointerEvents = 'none';
    debugEl.style.userSelect = 'none';
    debugEl.style.zIndex = '35';
    document.body.appendChild(debugEl);
  }

  function refreshDebugBadge(): void {
    if (!debugEl) {
      return;
    }
    debugEl.textContent = `QUALITY: ${currentLevel.toUpperCase()} [F2] | FPS: ${Math.round(lastAvgFps)} (${lastAvgFrameMs.toFixed(1)}ms)`;
  }

  function applyLevel(nextLevel: QualityLevel, isAutoDowngrade: boolean): void {
    const resolvedLevel: QualityLevel = isCoarse && nextLevel === 'high' ? 'medium' : nextLevel;
    if (resolvedLevel === currentLevel) {
      return;
    }
    currentLevel = resolvedLevel;
    if (isAutoDowngrade) {
      const idx = QUALITY_ORDER.indexOf(resolvedLevel);
      const minIdx = QUALITY_ORDER.indexOf(lowestAutoLevel);
      if (idx < minIdx) {
        lowestAutoLevel = resolvedLevel;
      }
    }
    sampleTime = 0;
    sampleFrames = 0;
    slowAccum = 0;
    warmupRemaining = 1.5;
    refreshDebugBadge();
    onChange?.(currentLevel, getEffectivePreset(config, currentLevel, isCoarse));
  }

  function setLevel(level: QualityLevel): void {
    applyLevel(level, false);
  }

  function getLevel(): QualityLevel {
    return currentLevel;
  }

  function getPreset(): QualityPreset {
    return getEffectivePreset(config, currentLevel, isCoarse);
  }

  function getAverageFps(): number {
    return lastAvgFps;
  }

  function getAverageFrameMs(): number {
    return lastAvgFrameMs;
  }

  function update(dt: number): void {
    if (dt <= 0) {
      return;
    }

    if (warmupRemaining > 0) {
      warmupRemaining = Math.max(0, warmupRemaining - dt);
      return;
    }

    sampleTime += dt;
    sampleFrames += 1;

    const bucketWindow = 0.5;
    if (sampleTime >= bucketWindow) {
      lastAvgFps = sampleFrames / sampleTime;
      lastAvgFrameMs = (sampleTime / sampleFrames) * 1000;
      const bucketDt = sampleTime;
      sampleTime = 0;
      sampleFrames = 0;

      if (
        lastAvgFrameMs > config.frameTimeDowngradeMs ||
        lastAvgFps < config.fpsDowngradeThreshold
      ) {
        slowAccum += bucketDt;
        if (slowAccum >= config.fpsDowngradeWindowSec) {
          const currentIdx = QUALITY_ORDER.indexOf(currentLevel);
          if (currentIdx > 0) {
            const nextLevel = QUALITY_ORDER[currentIdx - 1];
            const lowestIdx = QUALITY_ORDER.indexOf(lowestAutoLevel);
            if (currentIdx - 1 <= lowestIdx) {
              applyLevel(nextLevel, true);
            }
          } else {
            slowAccum = 0;
          }
        }
      } else {
        slowAccum = 0;
      }

      refreshDebugBadge();
    }
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (!config.showQualityDebug) {
      return;
    }
    if (event.code === 'F2' && !event.repeat) {
      event.preventDefault();
      const idx = QUALITY_ORDER.indexOf(currentLevel);
      const next = QUALITY_ORDER[(idx + 1) % QUALITY_ORDER.length];
      applyLevel(next, false);
    }
  }

  if (config.showQualityDebug && typeof window !== 'undefined') {
    window.addEventListener('keydown', onKeyDown);
  }

  refreshDebugBadge();

  function dispose(): void {
    if (config.showQualityDebug && typeof window !== 'undefined') {
      window.removeEventListener('keydown', onKeyDown);
    }
    if (debugEl && debugEl.parentElement) {
      debugEl.parentElement.removeChild(debugEl);
      debugEl = null;
    }
  }

  return {
    update,
    getLevel,
    setLevel,
    getPreset,
    getAverageFps,
    getAverageFrameMs,
    dispose,
  };
}
