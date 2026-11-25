// src/ui/hud.ts

import { CONFIG } from '../config';
import './hud.css';

export interface HudViewModel {
  speedKmh: number;
  boost01: number;
  timeSeconds: number;
}

export interface HudHandle {
  root: HTMLElement;
  container: HTMLElement;
  speedValueEl: HTMLElement;
  arcFillEl: SVGCircleElement;
  boostFillEl: HTMLElement;
  timerValueEl: HTMLElement;
  arcTotalLen: number;
  lastSpeedInt: number;
  lastSpeedQuantized: number;
  lastBoostQuantized: number;
  lastTimeText: string;
}

function formatRaceTime(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = Math.floor(safe % 60);
  const centis = Math.floor((safe * 100) % 100);

  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  const cc = String(centis).padStart(2, '0');
  return `${mm}:${ss}.${cc}`;
}

export function createHud(container: HTMLElement = document.body): HudHandle {
  const cfg = CONFIG.hud;
  const arcLen = cfg.gaugeArcCircumference * cfg.gaugeArcSweepRatio;
  const fullCirc = cfg.gaugeArcCircumference;

  const root = document.createElement('div');
  root.className = 'sr-hud';

  const hintClass = cfg.showControlsHint ? 'sr-hud-panel sr-hud-bottom-left' : 'sr-hud-hidden';

  root.innerHTML = `
    <div class="sr-hud-top">
      <div class="sr-hud-panel sr-timer-card">
        <span class="sr-timer-label">Time</span>
        <span class="sr-timer-value">00:00.00</span>
      </div>
      <div class="sr-hud-panel sr-checkpoint-slot sr-hud-hidden" data-slot="checkpoint"></div>
    </div>

    <div class="sr-hud-panel sr-airtime-slot sr-hud-hidden" data-slot="airtime"></div>

    <div class="${hintClass}">
      <span class="sr-hint-item"><span class="sr-key">W A S D</span> / <span class="sr-key">Panah</span> Kemudi</span>
      <span class="sr-hint-item"><span class="sr-key">Space</span> Drift</span>
      <span class="sr-hint-item"><span class="sr-key">R</span> Reset</span>
    </div>

    <div class="sr-hud-panel sr-hud-bottom-right">
      <div class="sr-speedo">
        <svg class="sr-speedo-svg" viewBox="0 0 132 116" aria-hidden="true">
          <defs>
            <linearGradient id="srSpeedoGrad" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="${cfg.colors.accentCyan}" />
              <stop offset="55%" stop-color="${cfg.colors.accentYellow}" />
              <stop offset="100%" stop-color="${cfg.colors.accentOrange}" />
            </linearGradient>
          </defs>
          <g transform="rotate(150 66 64)">
            <circle
              class="sr-speedo-track"
              cx="66"
              cy="64"
              r="${cfg.gaugeArcRadius}"
              stroke-dasharray="${arcLen.toFixed(2)} ${fullCirc.toFixed(2)}"
            />
            <circle
              class="sr-speedo-fill"
              cx="66"
              cy="64"
              r="${cfg.gaugeArcRadius}"
              stroke-dasharray="${arcLen.toFixed(2)} ${fullCirc.toFixed(2)}"
              stroke-dashoffset="${arcLen.toFixed(2)}"
            />
          </g>
        </svg>
        <div class="sr-speedo-readout">
          <span class="sr-speedo-value">0</span>
          <span class="sr-speedo-unit">${cfg.speedUnit}</span>
        </div>
      </div>

      <div class="sr-boost-wrap">
        <div class="sr-boost-header">
          <span>Boost</span>
          <span class="sr-boost-state">Terkunci</span>
        </div>
        <div class="sr-boost-bar">
          <div class="sr-boost-fill"></div>
        </div>
      </div>
    </div>
  `;

  container.appendChild(root);

  const speedValueEl = root.querySelector('.sr-speedo-value') as HTMLElement;
  const arcFillEl = root.querySelector('.sr-speedo-fill') as SVGCircleElement;
  const boostFillEl = root.querySelector('.sr-boost-fill') as HTMLElement;
  const timerValueEl = root.querySelector('.sr-timer-value') as HTMLElement;

  return {
    root,
    container,
    speedValueEl,
    arcFillEl,
    boostFillEl,
    timerValueEl,
    arcTotalLen: arcLen,
    lastSpeedInt: 0,
    lastSpeedQuantized: 0,
    lastBoostQuantized: 0,
    lastTimeText: '00:00.00',
  };
}

export function updateHud(hud: HudHandle, viewModel: HudViewModel): void {
  const speedInt = Math.max(0, Math.round(viewModel.speedKmh));
  if (speedInt !== hud.lastSpeedInt) {
    hud.lastSpeedInt = speedInt;
    hud.speedValueEl.textContent = String(speedInt);
  }

  const speedRatio = Math.min(1, Math.max(0, viewModel.speedKmh / CONFIG.hud.maxGaugeSpeedKmh));
  const speedQuantized = Math.round(speedRatio * 400);
  if (speedQuantized !== hud.lastSpeedQuantized) {
    hud.lastSpeedQuantized = speedQuantized;
    const dashOffset = hud.arcTotalLen * (1 - speedQuantized / 400);
    hud.arcFillEl.style.strokeDashoffset = dashOffset.toFixed(2);
  }

  const boostClamped = Math.min(1, Math.max(0, viewModel.boost01));
  const boostQuantized = Math.round(boostClamped * 200);
  if (boostQuantized !== hud.lastBoostQuantized) {
    hud.lastBoostQuantized = boostQuantized;
    hud.boostFillEl.style.transform = `scaleX(${(boostQuantized / 200).toFixed(3)})`;
  }

  const timeText = formatRaceTime(viewModel.timeSeconds);
  if (timeText !== hud.lastTimeText) {
    hud.lastTimeText = timeText;
    hud.timerValueEl.textContent = timeText;
  }
}

export function disposeHud(hud: HudHandle): void {
  if (hud.root.parentElement === hud.container) {
    hud.container.removeChild(hud.root);
  }
}
