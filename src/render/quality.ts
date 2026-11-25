// src/render/quality.ts

import { CONFIG } from '../config';

export type QualityLevel = 'low' | 'medium' | 'high';
export type QualityConfig = typeof CONFIG.quality;
export type QualityPreset = QualityConfig['levels'][QualityLevel];

export interface QualityManager {
  update: (dt: number) => void;
  getLevel: () => QualityLevel;
  setLevel: (level: QualityLevel) => void;
  getPreset: () => QualityPreset;
  getAverageFps: () => number;
  dispose: () => void;
}

const QUALITY_ORDER: readonly QualityLevel[] = ['low', 'medium', 'high'];

function detectInitialQuality(config: QualityConfig): QualityLevel {
  if (config.initialOverride) {
    return config.initialOverride;
  }

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const cores =
    typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number'
      ? navigator.hardwareConcurrency
      : 4;

  if (cores <= 2 || (cores <= 4 && dpr >= 2.5)) {
    return 'low';
  }
  if (cores <= 6 || dpr >= 2.0) {
    return 'medium';
  }
  return 'high';
}

export function createQualityManager(
  config: QualityConfig = CONFIG.quality,
  onChange?: (level: QualityLevel, preset: QualityPreset) => void,
): QualityManager {
  let currentLevel: QualityLevel = detectInitialQuality(config);
  let lowestAutoLevel: QualityLevel = currentLevel;

  let warmupRemaining: number = config.warmupSec;
  let sampleTime = 0;
  let sampleFrames = 0;
  let lowFpsAccum = 0;
  let lastAvgFps = 60;

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
    debugEl.textContent = `QUALITY: ${currentLevel.toUpperCase()} [F2] | FPS: ${Math.round(lastAvgFps)}`;
  }

  function applyLevel(nextLevel: QualityLevel, isAutoDowngrade: boolean): void {
    if (nextLevel === currentLevel) {
      return;
    }
    currentLevel = nextLevel;
    if (isAutoDowngrade) {
      const idx = QUALITY_ORDER.indexOf(nextLevel);
      const minIdx = QUALITY_ORDER.indexOf(lowestAutoLevel);
      if (idx < minIdx) {
        lowestAutoLevel = nextLevel;
      }
    }
    sampleTime = 0;
    sampleFrames = 0;
    lowFpsAccum = 0;
    warmupRemaining = 1.5;
    refreshDebugBadge();
    onChange?.(currentLevel, config.levels[currentLevel]);
  }

  function setLevel(level: QualityLevel): void {
    applyLevel(level, false);
  }

  function getLevel(): QualityLevel {
    return currentLevel;
  }

  function getPreset(): QualityPreset {
    return config.levels[currentLevel];
  }

  function getAverageFps(): number {
    return lastAvgFps;
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
      const bucketDt = sampleTime;
      sampleTime = 0;
      sampleFrames = 0;

      if (lastAvgFps < config.fpsDowngradeThreshold) {
        lowFpsAccum += bucketDt;
        if (lowFpsAccum >= config.fpsDowngradeWindowSec) {
          const currentIdx = QUALITY_ORDER.indexOf(currentLevel);
          if (currentIdx > 0) {
            const nextLevel = QUALITY_ORDER[currentIdx - 1];
            const lowestIdx = QUALITY_ORDER.indexOf(lowestAutoLevel);
            if (currentIdx - 1 <= lowestIdx) {
              applyLevel(nextLevel, true);
            }
          } else {
            lowFpsAccum = 0;
          }
        }
      } else {
        lowFpsAccum = 0;
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
    dispose,
  };
}
