// src/ui/hud.ts

import { CONFIG } from '../config';
import type { RacePhase, RaceState } from '../core/state';
import './hud.css';

export interface HudViewModel {
  phase: RacePhase;
  speedKmh: number;
  boost01: number;
  timeSeconds: number;
  cpPassed: number;
  cpTotal: number;
  bestTime: number | null;
  muted: boolean;
}

export interface CheckpointSplitNotice {
  index: number;
  total: number;
  time: number;
  delta: number | null;
}

export interface HudHandle {
  root: HTMLElement;
  container: HTMLElement;
  topBarEl: HTMLElement;
  bottomLeftEl: HTMLElement;
  bottomRightEl: HTMLElement;
  speedValueEl: HTMLElement;
  arcFillEl: SVGCircleElement;
  boostWrapEl: HTMLElement;
  boostStateEl: HTMLElement;
  boostFillEl: HTMLElement;
  timerValueEl: HTMLElement;
  cpSlotEl: HTMLElement;
  splitSlotEl: HTMLElement;
  airtimeSlotEl: HTMLElement;
  titleScreenEl: HTMLElement;
  titleBestEl: HTMLElement;
  countdownEl: HTMLElement;
  finishScreenEl: HTMLElement;
  finishBadgeEl: HTMLElement;
  finishTimeEl: HTMLElement;
  finishBestEl: HTMLElement;
  finishSplitsEl: HTMLElement;
  audioBtnEl: HTMLButtonElement;
  airtimeTimerId: number | null;
  splitTimerId: number | null;
  countdownHideTimerId: number | null;
  arcTotalLen: number;
  lastPhase: RacePhase | null;
  lastSpeedInt: number;
  lastSpeedQuantized: number;
  lastBoostQuantized: number;
  lastBoostActive: boolean;
  lastTimeText: string;
  lastCpText: string;
  lastTitleBestText: string;
  lastMuted: boolean | null;
}

export function formatRaceTime(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = Math.floor(safe % 60);
  const centis = Math.floor((safe * 100) % 100);

  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  const cc = String(centis).padStart(2, '0');
  return `${mm}:${ss}.${cc}`;
}

function formatSplitSeconds(seconds: number): string {
  return `${Math.max(0, seconds).toFixed(2)} s`;
}

function formatDelta(delta: number): string {
  const sign = delta > 0 ? '+' : '-';
  return `${sign}${Math.abs(delta).toFixed(2)}`;
}

export function createHud(container: HTMLElement = document.body): HudHandle {
  const cfg = CONFIG.hud;
  const arcLen = cfg.gaugeArcCircumference * cfg.gaugeArcSweepRatio;
  const fullCirc = cfg.gaugeArcCircumference;

  const root = document.createElement('div');
  root.className = 'sr-hud';

  const hintClass = cfg.showControlsHint ? 'sr-hud-panel sr-hud-bottom-left sr-hud-hidden' : 'sr-hud-hidden';

  root.innerHTML = `
    <div class="sr-hud-top sr-hud-hidden">
      <div class="sr-hud-panel sr-timer-card">
        <span class="sr-timer-label">Time</span>
        <span class="sr-timer-value">00:00.00</span>
      </div>
      <div class="sr-hud-panel sr-checkpoint-slot" data-slot="checkpoint">CP 0 / 0</div>
    </div>

    <button type="button" class="sr-hud-panel sr-audio-btn" aria-label="Suara aktif (M)" title="Suara (M)">
      <svg class="sr-audio-icon sr-audio-icon-on" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 9.5v5h4l5 4.5V5L8 9.5H4z" fill="currentColor" />
        <path d="M16.2 8.8a4.8 4.8 0 0 1 0 6.4M18.8 6.3a8.2 8.2 0 0 1 0 11.4" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" />
      </svg>
      <svg class="sr-audio-icon sr-audio-icon-off" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 9.5v5h4l5 4.5V5L8 9.5H4z" fill="currentColor" />
        <path d="M16.5 9l4.5 6M21 9l-4.5 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
      </svg>
    </button>

    <div class="sr-hud-panel sr-split-slot sr-hud-hidden" data-slot="split"></div>
    <div class="sr-hud-panel sr-airtime-slot sr-hud-hidden" data-slot="airtime"></div>

    <div class="${hintClass}">
      <span class="sr-hint-item"><span class="sr-key">W A S D</span> / <span class="sr-key">Panah</span> Kemudi</span>
      <span class="sr-hint-item"><span class="sr-key">Space</span> Drift</span>
      <span class="sr-hint-item"><span class="sr-key">R</span> Checkpoint</span>
      <span class="sr-hint-item"><span class="sr-key">Enter</span> Ulang</span>
      <span class="sr-hint-item"><span class="sr-key">M</span> Suara</span>
    </div>

    <div class="sr-hud-panel sr-hud-bottom-right sr-hud-hidden">
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
          <span class="sr-boost-state">Siap</span>
        </div>
        <div class="sr-boost-bar">
          <div class="sr-boost-fill"></div>
        </div>
      </div>
    </div>

    <div class="sr-overlay-center sr-title-screen">
      <div class="sr-hud-panel sr-title-card">
        <div class="sr-title-kicker">Stunt Track Challenge</div>
        <h1 class="sr-title-logo">SKY RACER</h1>
        <div class="sr-title-best sr-hud-hidden"></div>
        <div class="sr-title-prompt">Tekan <span class="sr-key">Enter</span> untuk mulai</div>
        <div class="sr-title-controls">
          <span class="sr-hint-item"><span class="sr-key">W A S D</span> / <span class="sr-key">Panah</span> Kemudi</span>
          <span class="sr-hint-item"><span class="sr-key">Space</span> Drift</span>
          <span class="sr-hint-item"><span class="sr-key">R</span> Checkpoint</span>
          <span class="sr-hint-item"><span class="sr-key">Enter</span> Mulai / Ulang</span>
          <span class="sr-hint-item"><span class="sr-key">M</span> Suara</span>
        </div>
      </div>
    </div>

    <div class="sr-overlay-center sr-countdown-overlay sr-hud-hidden">
      <div class="sr-countdown-text">3</div>
    </div>

    <div class="sr-overlay-center sr-finish-screen sr-hud-hidden">
      <div class="sr-hud-panel sr-finish-card">
        <div class="sr-finish-header">
          <span class="sr-finish-title">BALAPAN SELESAI</span>
          <span class="sr-finish-newbest sr-hud-hidden">NEW BEST!</span>
        </div>
        <div class="sr-finish-times">
          <div class="sr-finish-stat">
            <span class="sr-finish-stat-label">Waktu Akhir</span>
            <span class="sr-finish-stat-value sr-finish-final-time">00:00.00</span>
          </div>
          <div class="sr-finish-stat">
            <span class="sr-finish-stat-label">Best Time</span>
            <span class="sr-finish-stat-value sr-finish-best-time">00:00.00</span>
          </div>
        </div>
        <div class="sr-finish-splits"></div>
        <div class="sr-finish-prompt">Tekan <span class="sr-key">Enter</span> untuk balapan lagi</div>
      </div>
    </div>
  `;

  container.appendChild(root);

  return {
    root,
    container,
    topBarEl: root.querySelector('.sr-hud-top') as HTMLElement,
    bottomLeftEl: root.querySelector('.sr-hud-bottom-left') as HTMLElement,
    bottomRightEl: root.querySelector('.sr-hud-bottom-right') as HTMLElement,
    speedValueEl: root.querySelector('.sr-speedo-value') as HTMLElement,
    arcFillEl: root.querySelector('.sr-speedo-fill') as SVGCircleElement,
    boostWrapEl: root.querySelector('.sr-boost-wrap') as HTMLElement,
    boostStateEl: root.querySelector('.sr-boost-state') as HTMLElement,
    boostFillEl: root.querySelector('.sr-boost-fill') as HTMLElement,
    timerValueEl: root.querySelector('.sr-timer-value') as HTMLElement,
    cpSlotEl: root.querySelector('[data-slot="checkpoint"]') as HTMLElement,
    splitSlotEl: root.querySelector('[data-slot="split"]') as HTMLElement,
    airtimeSlotEl: root.querySelector('[data-slot="airtime"]') as HTMLElement,
    titleScreenEl: root.querySelector('.sr-title-screen') as HTMLElement,
    titleBestEl: root.querySelector('.sr-title-best') as HTMLElement,
    countdownEl: root.querySelector('.sr-countdown-overlay') as HTMLElement,
    finishScreenEl: root.querySelector('.sr-finish-screen') as HTMLElement,
    finishBadgeEl: root.querySelector('.sr-finish-newbest') as HTMLElement,
    finishTimeEl: root.querySelector('.sr-finish-final-time') as HTMLElement,
    finishBestEl: root.querySelector('.sr-finish-best-time') as HTMLElement,
    finishSplitsEl: root.querySelector('.sr-finish-splits') as HTMLElement,
    audioBtnEl: root.querySelector('.sr-audio-btn') as HTMLButtonElement,
    airtimeTimerId: null,
    splitTimerId: null,
    countdownHideTimerId: null,
    arcTotalLen: arcLen,
    lastPhase: null,
    lastSpeedInt: 0,
    lastSpeedQuantized: 0,
    lastBoostQuantized: 0,
    lastBoostActive: false,
    lastTimeText: '00:00.00',
    lastCpText: 'CP 0 / 0',
    lastTitleBestText: '',
    lastMuted: null,
  };
}

export function showAirtimePopup(hud: HudHandle, airtimeSeconds: number): void {
  if (hud.airtimeTimerId !== null) {
    window.clearTimeout(hud.airtimeTimerId);
    hud.airtimeTimerId = null;
  }

  hud.airtimeSlotEl.textContent = `AIRTIME ${airtimeSeconds.toFixed(2)} s`;
  hud.airtimeSlotEl.classList.remove('sr-hud-hidden', 'sr-airtime-active');
  void hud.airtimeSlotEl.offsetWidth;
  hud.airtimeSlotEl.classList.add('sr-airtime-active');

  hud.airtimeTimerId = window.setTimeout(() => {
    hud.airtimeSlotEl.classList.add('sr-hud-hidden');
    hud.airtimeSlotEl.classList.remove('sr-airtime-active');
    hud.airtimeTimerId = null;
  }, CONFIG.hud.airtimePopupDurationMs);
}

export function hideAirtimePopup(hud: HudHandle): void {
  if (hud.airtimeTimerId !== null) {
    window.clearTimeout(hud.airtimeTimerId);
    hud.airtimeTimerId = null;
  }
  hud.airtimeSlotEl.classList.add('sr-hud-hidden');
  hud.airtimeSlotEl.classList.remove('sr-airtime-active');
}

export function showSplitPopup(hud: HudHandle, notice: CheckpointSplitNotice): void {
  if (hud.splitTimerId !== null) {
    window.clearTimeout(hud.splitTimerId);
    hud.splitTimerId = null;
  }

  const cpLabel = `CP ${notice.index + 1} / ${notice.total}`;
  const timeLabel = formatSplitSeconds(notice.time);
  hud.splitSlotEl.textContent = '';

  const cpSpan = document.createElement('span');
  cpSpan.className = 'sr-split-cp';
  cpSpan.textContent = cpLabel;
  hud.splitSlotEl.appendChild(cpSpan);

  const timeSpan = document.createElement('span');
  timeSpan.className = 'sr-split-time';
  timeSpan.textContent = timeLabel;
  hud.splitSlotEl.appendChild(timeSpan);

  if (notice.delta !== null) {
    const deltaSpan = document.createElement('span');
    deltaSpan.className =
      notice.delta <= 0 ? 'sr-split-delta sr-split-delta-fast' : 'sr-split-delta sr-split-delta-slow';
    deltaSpan.textContent = formatDelta(notice.delta);
    hud.splitSlotEl.appendChild(deltaSpan);
  }

  hud.splitSlotEl.classList.remove('sr-hud-hidden', 'sr-split-active');
  void hud.splitSlotEl.offsetWidth;
  hud.splitSlotEl.classList.add('sr-split-active');

  hud.splitTimerId = window.setTimeout(() => {
    hud.splitSlotEl.classList.add('sr-hud-hidden');
    hud.splitSlotEl.classList.remove('sr-split-active');
    hud.splitTimerId = null;
  }, CONFIG.hud.splitPopupDurationMs);
}

export function hideSplitPopup(hud: HudHandle): void {
  if (hud.splitTimerId !== null) {
    window.clearTimeout(hud.splitTimerId);
    hud.splitTimerId = null;
  }
  hud.splitSlotEl.classList.add('sr-hud-hidden');
  hud.splitSlotEl.classList.remove('sr-split-active');
}

export function showCountdownOverlay(hud: HudHandle, label: string, isGo: boolean): void {
  if (hud.countdownHideTimerId !== null) {
    window.clearTimeout(hud.countdownHideTimerId);
    hud.countdownHideTimerId = null;
  }

  const textEl = hud.countdownEl.querySelector('.sr-countdown-text') as HTMLElement;
  textEl.textContent = label;
  textEl.classList.toggle('sr-countdown-go', isGo);

  hud.countdownEl.classList.remove('sr-hud-hidden');
  textEl.classList.remove('sr-countdown-pop');
  void textEl.offsetWidth;
  textEl.classList.add('sr-countdown-pop');

  if (isGo) {
    hud.countdownHideTimerId = window.setTimeout(() => {
      hud.countdownEl.classList.add('sr-hud-hidden');
      textEl.classList.remove('sr-countdown-pop', 'sr-countdown-go');
      hud.countdownHideTimerId = null;
    }, Math.round(CONFIG.race.goHoldSeconds * 1000));
  }
}

export function hideCountdownOverlay(hud: HudHandle): void {
  if (hud.countdownHideTimerId !== null) {
    window.clearTimeout(hud.countdownHideTimerId);
    hud.countdownHideTimerId = null;
  }
  hud.countdownEl.classList.add('sr-hud-hidden');
}

export function showFinishScreen(
  hud: HudHandle,
  raceState: RaceState,
  referenceBestSplits: number[] | null,
): void {
  hud.finishTimeEl.textContent = formatRaceTime(raceState.timer);
  hud.finishBestEl.textContent = formatRaceTime(raceState.bestTime ?? raceState.timer);
  hud.finishBadgeEl.classList.toggle('sr-hud-hidden', !raceState.newBest);

  hud.finishSplitsEl.textContent = '';
  const total = raceState.totalCheckpoints;
  for (let i = 0; i < total; i++) {
    const splitVal = raceState.splits[i];
    const row = document.createElement('div');
    row.className = 'sr-finish-split-row';

    const labelEl = document.createElement('span');
    labelEl.className = 'sr-finish-split-label';
    labelEl.textContent = `CP ${i + 1}`;
    row.appendChild(labelEl);

    const valEl = document.createElement('span');
    valEl.className = 'sr-finish-split-val';
    valEl.textContent = splitVal !== null ? formatSplitSeconds(splitVal) : '--.-- s';
    row.appendChild(valEl);

    const refSplit =
      referenceBestSplits && i < referenceBestSplits.length ? referenceBestSplits[i] : null;
    if (splitVal !== null && refSplit !== null && Number.isFinite(refSplit)) {
      const delta = splitVal - refSplit;
      const deltaEl = document.createElement('span');
      deltaEl.className =
        delta <= 0 ? 'sr-finish-split-delta sr-split-delta-fast' : 'sr-finish-split-delta sr-split-delta-slow';
      deltaEl.textContent = formatDelta(delta);
      row.appendChild(deltaEl);
    }

    hud.finishSplitsEl.appendChild(row);
  }

  hud.finishScreenEl.classList.remove('sr-hud-hidden');
}

export function updateHud(hud: HudHandle, viewModel: HudViewModel): void {
  if (viewModel.muted !== hud.lastMuted) {
    hud.lastMuted = viewModel.muted;
    hud.audioBtnEl.classList.toggle('sr-audio-muted', viewModel.muted);
    hud.audioBtnEl.setAttribute(
      'aria-label',
      viewModel.muted ? 'Suara bisu (M)' : 'Suara aktif (M)',
    );
  }

  if (viewModel.phase !== hud.lastPhase) {
    hud.lastPhase = viewModel.phase;
    const isTitle = viewModel.phase === 'TITLE';
    const isFinish = viewModel.phase === 'FINISH';

    hud.titleScreenEl.classList.toggle('sr-hud-hidden', !isTitle);
    hud.finishScreenEl.classList.toggle('sr-hud-hidden', !isFinish);
    hud.topBarEl.classList.toggle('sr-hud-hidden', isTitle);
    hud.bottomRightEl.classList.toggle('sr-hud-hidden', isTitle || isFinish);
    if (CONFIG.hud.showControlsHint) {
      hud.bottomLeftEl.classList.toggle('sr-hud-hidden', isTitle || isFinish);
    }

    if (isTitle || isFinish) {
      hideCountdownOverlay(hud);
    }
  }

  if (viewModel.phase === 'TITLE') {
    const bestText =
      viewModel.bestTime !== null ? `Best Time  ${formatRaceTime(viewModel.bestTime)}` : '';
    if (bestText !== hud.lastTitleBestText) {
      hud.lastTitleBestText = bestText;
      hud.titleBestEl.textContent = bestText;
      hud.titleBestEl.classList.toggle('sr-hud-hidden', bestText === '');
    }
    return;
  }

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
  const boostActive = boostClamped > 0.01;
  if (boostActive !== hud.lastBoostActive) {
    hud.lastBoostActive = boostActive;
    hud.boostWrapEl.classList.toggle('sr-boost-active', boostActive);
    hud.boostStateEl.textContent = boostActive ? 'BOOST!' : 'Siap';
  }

  const timeText = formatRaceTime(viewModel.timeSeconds);
  if (timeText !== hud.lastTimeText) {
    hud.lastTimeText = timeText;
    hud.timerValueEl.textContent = timeText;
  }

  const cpText = `CP ${viewModel.cpPassed} / ${viewModel.cpTotal}`;
  if (cpText !== hud.lastCpText) {
    hud.lastCpText = cpText;
    hud.cpSlotEl.textContent = cpText;
  }
}

export function disposeHud(hud: HudHandle): void {
  hideAirtimePopup(hud);
  hideSplitPopup(hud);
  hideCountdownOverlay(hud);
  if (hud.root.parentElement === hud.container) {
    hud.container.removeChild(hud.root);
  }
}
