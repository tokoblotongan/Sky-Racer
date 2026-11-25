// src/ui/hud.ts

import { CONFIG } from '../config';
import type { RacePhase, FinishResultData } from '../core/state';
import type { CourseMedals } from '../courses/types';
import {
  formatMedalLabel,
  type CourseRecords,
  type MedalType,
} from '../services/records';
import './hud.css';

export interface HudViewModel {
  phase: RacePhase;
  resultReady: boolean;
  speedKmh: number;
  boost01: number;
  progress01: number;
  timeSeconds: number;
  lap: number;
  totalLaps: number;
  lapTimeSeconds: number;
  bestLapSeconds: number | null;
  cpPassed: number;
  cpTotal: number;
  bestTime: number | null;
  wrongWay: boolean;
  muted: boolean;
  touchActive: boolean;
}

export interface CheckpointSplitNotice {
  index: number;
  total: number;
  time: number;
  delta: number | null;
}

export interface LapPopupNotice {
  lap: number;
  totalLaps: number;
  lapTime: number;
  isBestLap: boolean;
}

export interface TitleScreenData {
  courseName: string;
  medals: CourseMedals;
  records: CourseRecords;
}

export interface FinishScreenData {
  courseName: string;
  finish: FinishResultData;
  records: CourseRecords;
}

export interface HudCallbacks {
  onStartRace?: () => void;
  onRetryRace?: () => void;
  onReturnToMenu?: () => void;
  onCopyResult?: () => Promise<boolean> | boolean;
  onClearRecords?: () => void;
}

export interface HudHandle {
  root: HTMLElement;
  container: HTMLElement;
  topBarEl: HTMLElement;
  progressWrapEl: HTMLElement;
  progressFillEl: HTMLElement;
  progressMarkersEl: HTMLElement;
  progressMarkerEls: HTMLElement[];
  bottomLeftEl: HTMLElement;
  bottomRightEl: HTMLElement;
  speedValueEl: HTMLElement;
  arcFillEl: SVGCircleElement;
  boostWrapEl: HTMLElement;
  boostStateEl: HTMLElement;
  boostFillEl: HTMLElement;
  timerValueEl: HTMLElement;
  timerLapEl: HTMLElement;
  timerBestEl: HTMLElement;
  timerBestLapEl: HTMLElement;
  lapSlotEl: HTMLElement;
  cpSlotEl: HTMLElement;
  splitSlotEl: HTMLElement;
  airtimeSlotEl: HTMLElement;
  lapPopupSlotEl: HTMLElement;
  wrongWayEl: HTMLElement;
  loadingOverlayEl: HTMLElement;
  titleScreenEl: HTMLElement;
  titleCourseSelectSlotEl: HTMLElement;
  titleTargetGoldEl: HTMLElement;
  titleTargetSilverEl: HTMLElement;
  titleTargetBronzeEl: HTMLElement;
  titleTopListEl: HTMLElement;
  titleStartBtnEl: HTMLButtonElement;
  titleClearBtnEl: HTMLButtonElement;
  titleClearRingFillEl: SVGCircleElement;
  titleClearTextEl: HTMLElement;
  countdownEl: HTMLElement;
  finishScreenEl: HTMLElement;
  finishCardEl: HTMLElement;
  finishCourseNameEl: HTMLElement;
  finishBadgeEl: HTMLElement;
  finishMedalIconEl: HTMLElement;
  finishMedalLabelEl: HTMLElement;
  finishTimeEl: HTMLElement;
  finishDeltaEl: HTMLElement;
  finishStatsGridEl: HTMLElement;
  finishLapsBoxEl: HTMLElement;
  finishLapsEl: HTMLElement;
  finishSplitsEl: HTMLElement;
  finishTopListEl: HTMLElement;
  finishRetryBtnEl: HTMLButtonElement;
  finishMenuBtnEl: HTMLButtonElement;
  finishCopyBtnEl: HTMLButtonElement;
  audioBtnEl: HTMLButtonElement;
  airtimeTimerId: number | null;
  splitTimerId: number | null;
  lapPopupTimerId: number | null;
  countdownHideTimerId: number | null;
  copyResetTimerId: number | null;
  clearHoldRafId: number;
  clearHoldCleanup: () => void;
  disposeEvents: () => void;
  arcTotalLen: number;
  lastPhase: RacePhase | null;
  lastResultReady: boolean | null;
  lastSpeedInt: number;
  lastSpeedQuantized: number;
  lastBoostQuantized: number;
  lastBoostActive: boolean;
  lastProgressQuantized: number;
  lastCpPassed: number;
  lastTimeText: string;
  lastTimerLapText: string;
  lastBestText: string;
  lastBestLapText: string;
  lastLapText: string;
  lastShowLap: boolean | null;
  lastCpText: string;
  lastWrongWay: boolean | null;
  lastMuted: boolean | null;
  lastTouchActive: boolean | null;
}

const CLEAR_HOLD_DURATION_MS = 1200;
const CLEAR_HOLD_CIRC = 2 * Math.PI * 10;

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
  return `${sign}${Math.abs(delta).toFixed(2)} s`;
}

function createMedalBadgeSvg(medal: MedalType): string {
  let fillMain = '#475569';
  let fillShade = '#334155';
  let strokeColor = '#94A3B8';
  let starColor = '#CBD5E1';
  let ribbonLeft = '#334155';
  let ribbonRight = '#475569';

  if (medal === 'gold') {
    fillMain = '#FFD23F';
    fillShade = '#E59500';
    strokeColor = '#FFFDF7';
    starColor = '#FFFDF7';
    ribbonLeft = '#1E6BFF';
    ribbonRight = '#35D4FF';
  } else if (medal === 'silver') {
    fillMain = '#E2E8F0';
    fillShade = '#94A3B8';
    strokeColor = '#FFFDF7';
    starColor = '#FFFDF7';
    ribbonLeft = '#1E6BFF';
    ribbonRight = '#64748B';
  } else if (medal === 'bronze') {
    fillMain = '#F4A261';
    fillShade = '#B45309';
    strokeColor = '#FFE8CC';
    starColor = '#FFFDF7';
    ribbonLeft = '#9A3412';
    ribbonRight = '#EA580C';
  }

  return `
    <svg class="sr-medal-svg" viewBox="0 0 64 64" aria-hidden="true">
      <polygon points="18,4 28,4 32,22 22,22" fill="${ribbonLeft}" />
      <polygon points="46,4 36,4 32,22 42,22" fill="${ribbonRight}" />
      <circle cx="32" cy="38" r="20" fill="${fillShade}" stroke="${strokeColor}" stroke-width="2.6" />
      <circle cx="32" cy="36" r="16" fill="${fillMain}" />
      <polygon
        points="32,24 35.4,31.2 43.3,32.2 37.5,37.7 39,45.5 32,41.6 25,45.5 26.5,37.7 20.7,32.2 28.6,31.2"
        fill="${starColor}"
      />
    </svg>
  `;
}

export function createHud(
  container: HTMLElement = document.body,
  callbacks: HudCallbacks = {},
): HudHandle {
  const cfg = CONFIG.hud;
  const arcLen = cfg.gaugeArcCircumference * cfg.gaugeArcSweepRatio;
  const fullCirc = cfg.gaugeArcCircumference;

  const root = document.createElement('div');
  root.className = 'sr-hud sr-hud--modal';

  const hintClass = cfg.showControlsHint ? 'sr-hud-panel sr-hud-bottom-left sr-hud-hidden' : 'sr-hud-hidden';

  root.innerHTML = `
    <div class="sr-hud-top sr-hud-hidden">
      <div class="sr-hud-panel sr-lap-slot sr-hud-hidden" data-slot="lap">LAP 1 / 1</div>
      <div class="sr-hud-panel sr-timer-card">
        <div class="sr-timer-main">
          <span class="sr-timer-label">Time</span>
          <span class="sr-timer-value">00:00.00</span>
        </div>
        <div class="sr-timer-sub">
          <span class="sr-timer-lap sr-hud-hidden">LAP 00:00.00</span>
          <span class="sr-timer-best sr-hud-hidden">BEST 00:00.00</span>
          <span class="sr-timer-best-lap sr-hud-hidden">BL 00:00.00</span>
        </div>
      </div>
      <div class="sr-hud-panel sr-checkpoint-slot" data-slot="checkpoint">CP 0 / 0</div>
    </div>

    <div class="sr-progress-wrap sr-hud-hidden">
      <div class="sr-progress-track">
        <div class="sr-progress-fill"></div>
        <div class="sr-progress-markers"></div>
      </div>
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
    <div class="sr-hud-panel sr-lap-popup sr-hud-hidden" data-slot="lap-popup"></div>
    <div class="sr-hud-panel sr-wrong-way sr-hud-hidden" role="alert" aria-live="assertive">
      <svg class="sr-wrong-way-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3L2 20h20L12 3z" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linejoin="round" />
        <path d="M12 9v5M12 17h.01" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
      </svg>
      <span>ARAH SALAH</span>
    </div>

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
        <div class="sr-title-kicker">Stunt Track Time Trial</div>
        <h1 class="sr-title-logo">SKY RACER</h1>
        <div class="sr-arena-select"></div>
        <div class="sr-title-targets">
          <div class="sr-target-chip sr-target-chip--gold">
            <span class="sr-target-label">Emas</span>
            <span class="sr-target-time sr-target-gold">--:--.--</span>
          </div>
          <div class="sr-target-chip sr-target-chip--silver">
            <span class="sr-target-label">Perak</span>
            <span class="sr-target-time sr-target-silver">--:--.--</span>
          </div>
          <div class="sr-target-chip sr-target-chip--bronze">
            <span class="sr-target-label">Perunggu</span>
            <span class="sr-target-time sr-target-bronze">--:--.--</span>
          </div>
        </div>
        <div class="sr-title-top-box">
          <div class="sr-box-heading">5 Waktu Tercepat</div>
          <div class="sr-top-list sr-title-top-list"></div>
        </div>
        <div class="sr-title-actions">
          <button type="button" class="sr-btn sr-btn-primary sr-title-start-btn">Mulai Balapan</button>
          <button type="button" class="sr-btn sr-btn-danger-hold sr-title-clear-btn">
            <svg class="sr-hold-ring" viewBox="0 0 24 24" aria-hidden="true">
              <circle class="sr-hold-ring-track" cx="12" cy="12" r="10" />
              <circle
                class="sr-hold-ring-fill"
                cx="12"
                cy="12"
                r="10"
                stroke-dasharray="${CLEAR_HOLD_CIRC.toFixed(2)}"
                stroke-dashoffset="${CLEAR_HOLD_CIRC.toFixed(2)}"
              />
            </svg>
            <span class="sr-title-clear-text">Hapus Rekor (Tahan)</span>
          </button>
        </div>
        <div class="sr-title-prompt">
          <span class="sr-title-prompt-key">Tekan <span class="sr-key">Enter</span> atau klik tombol di atas</span>
          <span class="sr-title-prompt-touch">Ketuk Mulai atau area layar untuk balapan</span>
        </div>
        <div class="sr-title-controls">
          <span class="sr-hint-item"><span class="sr-key">W A S D</span> / <span class="sr-key">Panah</span> Kemudi</span>
          <span class="sr-hint-item"><span class="sr-key">Space</span> Drift</span>
          <span class="sr-hint-item"><span class="sr-key">R</span> Checkpoint</span>
          <span class="sr-hint-item"><span class="sr-key">Enter</span> Mulai / Ulang</span>
          <span class="sr-hint-item"><span class="sr-key">M</span> Suara</span>
        </div>
        <div class="sr-title-touch-controls">
          <span class="sr-hint-item">Kemudi kiri</span>
          <span class="sr-hint-item">Rem &amp; drift kanan</span>
          <span class="sr-hint-item">Tahan untuk ulang</span>
        </div>
      </div>
    </div>

    <div class="sr-overlay-center sr-countdown-overlay sr-hud-hidden">
      <div class="sr-countdown-text">3</div>
    </div>

    <div class="sr-overlay-center sr-loading-overlay sr-hud-hidden" aria-live="polite">
      <div class="sr-hud-panel sr-loading-pill">Memuat arena...</div>
    </div>

    <div class="sr-overlay-center sr-finish-screen sr-hud-hidden">
      <div class="sr-hud-panel sr-finish-card">
        <div class="sr-finish-col sr-finish-col-left">
          <div class="sr-finish-header">
            <div class="sr-finish-course-block">
              <span class="sr-finish-kicker sr-finish-course-name">Sky Circuit</span>
              <span class="sr-finish-title">BALAPAN SELESAI</span>
            </div>
            <span class="sr-finish-newbest sr-hud-hidden">REKOR BARU!</span>
          </div>

          <div class="sr-finish-hero">
            <div class="sr-finish-medal-wrap">
              <div class="sr-finish-medal-icon"></div>
              <span class="sr-finish-medal-label">Tanpa Medali</span>
            </div>
            <div class="sr-finish-time-block">
              <span class="sr-finish-final-time">00:00.00</span>
              <span class="sr-finish-delta sr-split-delta-neutral">Catatan Pertama</span>
            </div>
          </div>

          <div class="sr-finish-stats-grid"></div>

          <div class="sr-finish-actions">
            <button type="button" class="sr-btn sr-btn-primary sr-finish-retry-btn">Balapan lagi</button>
            <button type="button" class="sr-btn sr-btn-secondary sr-finish-menu-btn">Menu</button>
            <button type="button" class="sr-btn sr-btn-secondary sr-finish-copy-btn">Salin hasil</button>
          </div>
          <div class="sr-finish-key-hint">
            <span class="sr-key">Enter</span> Balapan lagi &nbsp;|&nbsp; <span class="sr-key">Esc</span> Menu
          </div>
        </div>

        <div class="sr-finish-col sr-finish-col-right">
          <div class="sr-finish-panel-box sr-finish-laps-box sr-hud-hidden">
            <div class="sr-box-heading">Waktu Per Lap</div>
            <div class="sr-finish-laps"></div>
          </div>
          <div class="sr-finish-panel-box">
            <div class="sr-box-heading">Catatan Split Checkpoint</div>
            <div class="sr-finish-splits"></div>
          </div>
          <div class="sr-finish-panel-box">
            <div class="sr-box-heading">5 Waktu Tercepat</div>
            <div class="sr-top-list sr-finish-top-list"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  container.appendChild(root);

  const titleStartBtnEl = root.querySelector('.sr-title-start-btn') as HTMLButtonElement;
  const titleClearBtnEl = root.querySelector('.sr-title-clear-btn') as HTMLButtonElement;
  const titleClearRingFillEl = root.querySelector('.sr-hold-ring-fill') as SVGCircleElement;
  const titleClearTextEl = root.querySelector('.sr-title-clear-text') as HTMLElement;
  const finishRetryBtnEl = root.querySelector('.sr-finish-retry-btn') as HTMLButtonElement;
  const finishMenuBtnEl = root.querySelector('.sr-finish-menu-btn') as HTMLButtonElement;
  const finishCopyBtnEl = root.querySelector('.sr-finish-copy-btn') as HTMLButtonElement;

  const handleStartClick = (): void => {
    titleStartBtnEl.blur();
    callbacks.onStartRace?.();
  };
  const handleRetryClick = (): void => {
    finishRetryBtnEl.blur();
    callbacks.onRetryRace?.();
  };
  const handleMenuClick = (): void => {
    finishMenuBtnEl.blur();
    callbacks.onReturnToMenu?.();
  };

  let copyResetTimerId: number | null = null;
  const handleCopyClick = async (): Promise<void> => {
    finishCopyBtnEl.blur();
    const ok = await callbacks.onCopyResult?.();
    finishCopyBtnEl.textContent = ok ? 'Tersalin!' : 'Gagal menyalin';
    if (copyResetTimerId !== null) {
      window.clearTimeout(copyResetTimerId);
    }
    copyResetTimerId = window.setTimeout(() => {
      finishCopyBtnEl.textContent = 'Salin hasil';
      copyResetTimerId = null;
    }, 1900);
  };

  titleStartBtnEl.addEventListener('click', handleStartClick);
  finishRetryBtnEl.addEventListener('click', handleRetryClick);
  finishMenuBtnEl.addEventListener('click', handleMenuClick);
  finishCopyBtnEl.addEventListener('click', handleCopyClick);

  // Hold-to-clear records button (~1.2s continuous hold with progress ring)
  let clearPointerId: number | null = null;
  let clearDownAt = 0;
  let clearHoldRafId = 0;
  let clearTriggered = false;

  const cancelClearHold = (): void => {
    clearPointerId = null;
    clearDownAt = 0;
    clearTriggered = false;
    if (clearHoldRafId) {
      window.cancelAnimationFrame(clearHoldRafId);
      clearHoldRafId = 0;
    }
    titleClearBtnEl.classList.remove('sr-holding');
    titleClearRingFillEl.style.strokeDashoffset = CLEAR_HOLD_CIRC.toFixed(2);
    if (!titleClearBtnEl.disabled && titleClearTextEl.textContent !== 'Rekor Dihapus!') {
      titleClearTextEl.textContent = 'Hapus Rekor (Tahan)';
    }
  };

  const tickClearHold = (): void => {
    if (clearPointerId === null) {
      return;
    }
    const elapsed = performance.now() - clearDownAt;
    const progress = Math.min(1, Math.max(0, elapsed / CLEAR_HOLD_DURATION_MS));
    titleClearRingFillEl.style.strokeDashoffset = (CLEAR_HOLD_CIRC * (1 - progress)).toFixed(2);

    if (progress >= 1 && !clearTriggered) {
      clearTriggered = true;
      cancelClearHold();
      titleClearTextEl.textContent = 'Rekor Dihapus!';
      callbacks.onClearRecords?.();
      window.setTimeout(() => {
        if (titleClearTextEl.textContent === 'Rekor Dihapus!') {
          titleClearTextEl.textContent = 'Hapus Rekor (Tahan)';
        }
      }, 1500);
      return;
    }
    clearHoldRafId = window.requestAnimationFrame(tickClearHold);
  };

  const onClearDown = (e: PointerEvent): void => {
    if (titleClearBtnEl.disabled || clearPointerId !== null) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    clearPointerId = e.pointerId;
    clearDownAt = performance.now();
    clearTriggered = false;
    try {
      titleClearBtnEl.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic events
    }
    titleClearBtnEl.classList.add('sr-holding');
    titleClearTextEl.textContent = 'Tahan...';
    clearHoldRafId = window.requestAnimationFrame(tickClearHold);
  };

  const onClearEnd = (e: PointerEvent): void => {
    if (e.pointerId !== clearPointerId) {
      return;
    }
    try {
      if (titleClearBtnEl.hasPointerCapture(e.pointerId)) {
        titleClearBtnEl.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore
    }
    cancelClearHold();
  };

  titleClearBtnEl.addEventListener('pointerdown', onClearDown);
  titleClearBtnEl.addEventListener('pointerup', onClearEnd);
  titleClearBtnEl.addEventListener('pointercancel', onClearEnd);
  titleClearBtnEl.addEventListener('lostpointercapture', onClearEnd);

  const handle: HudHandle = {
    root,
    container,
    topBarEl: root.querySelector('.sr-hud-top') as HTMLElement,
    progressWrapEl: root.querySelector('.sr-progress-wrap') as HTMLElement,
    progressFillEl: root.querySelector('.sr-progress-fill') as HTMLElement,
    progressMarkersEl: root.querySelector('.sr-progress-markers') as HTMLElement,
    progressMarkerEls: [],
    bottomLeftEl: root.querySelector('.sr-hud-bottom-left') as HTMLElement,
    bottomRightEl: root.querySelector('.sr-hud-bottom-right') as HTMLElement,
    speedValueEl: root.querySelector('.sr-speedo-value') as HTMLElement,
    arcFillEl: root.querySelector('.sr-speedo-fill') as SVGCircleElement,
    boostWrapEl: root.querySelector('.sr-boost-wrap') as HTMLElement,
    boostStateEl: root.querySelector('.sr-boost-state') as HTMLElement,
    boostFillEl: root.querySelector('.sr-boost-fill') as HTMLElement,
    timerValueEl: root.querySelector('.sr-timer-value') as HTMLElement,
    timerLapEl: root.querySelector('.sr-timer-lap') as HTMLElement,
    timerBestEl: root.querySelector('.sr-timer-best') as HTMLElement,
    timerBestLapEl: root.querySelector('.sr-timer-best-lap') as HTMLElement,
    lapSlotEl: root.querySelector('[data-slot="lap"]') as HTMLElement,
    cpSlotEl: root.querySelector('[data-slot="checkpoint"]') as HTMLElement,
    splitSlotEl: root.querySelector('[data-slot="split"]') as HTMLElement,
    airtimeSlotEl: root.querySelector('[data-slot="airtime"]') as HTMLElement,
    lapPopupSlotEl: root.querySelector('[data-slot="lap-popup"]') as HTMLElement,
    wrongWayEl: root.querySelector('.sr-wrong-way') as HTMLElement,
    loadingOverlayEl: root.querySelector('.sr-loading-overlay') as HTMLElement,
    titleScreenEl: root.querySelector('.sr-title-screen') as HTMLElement,
    titleCourseSelectSlotEl: root.querySelector('.sr-arena-select') as HTMLElement,
    titleTargetGoldEl: root.querySelector('.sr-target-gold') as HTMLElement,
    titleTargetSilverEl: root.querySelector('.sr-target-silver') as HTMLElement,
    titleTargetBronzeEl: root.querySelector('.sr-target-bronze') as HTMLElement,
    titleTopListEl: root.querySelector('.sr-title-top-list') as HTMLElement,
    titleStartBtnEl,
    titleClearBtnEl,
    titleClearRingFillEl,
    titleClearTextEl,
    countdownEl: root.querySelector('.sr-countdown-overlay') as HTMLElement,
    finishScreenEl: root.querySelector('.sr-finish-screen') as HTMLElement,
    finishCardEl: root.querySelector('.sr-finish-card') as HTMLElement,
    finishCourseNameEl: root.querySelector('.sr-finish-course-name') as HTMLElement,
    finishBadgeEl: root.querySelector('.sr-finish-newbest') as HTMLElement,
    finishMedalIconEl: root.querySelector('.sr-finish-medal-icon') as HTMLElement,
    finishMedalLabelEl: root.querySelector('.sr-finish-medal-label') as HTMLElement,
    finishTimeEl: root.querySelector('.sr-finish-final-time') as HTMLElement,
    finishDeltaEl: root.querySelector('.sr-finish-delta') as HTMLElement,
    finishStatsGridEl: root.querySelector('.sr-finish-stats-grid') as HTMLElement,
    finishLapsBoxEl: root.querySelector('.sr-finish-laps-box') as HTMLElement,
    finishLapsEl: root.querySelector('.sr-finish-laps') as HTMLElement,
    finishSplitsEl: root.querySelector('.sr-finish-splits') as HTMLElement,
    finishTopListEl: root.querySelector('.sr-finish-top-list') as HTMLElement,
    finishRetryBtnEl,
    finishMenuBtnEl,
    finishCopyBtnEl,
    audioBtnEl: root.querySelector('.sr-audio-btn') as HTMLButtonElement,
    airtimeTimerId: null,
    splitTimerId: null,
    lapPopupTimerId: null,
    countdownHideTimerId: null,
    copyResetTimerId: null,
    clearHoldRafId: 0,
    clearHoldCleanup: cancelClearHold,
    disposeEvents: () => {
      cancelClearHold();
      if (copyResetTimerId !== null) {
        window.clearTimeout(copyResetTimerId);
        copyResetTimerId = null;
      }
      titleStartBtnEl.removeEventListener('click', handleStartClick);
      finishRetryBtnEl.removeEventListener('click', handleRetryClick);
      finishMenuBtnEl.removeEventListener('click', handleMenuClick);
      finishCopyBtnEl.removeEventListener('click', handleCopyClick);
      titleClearBtnEl.removeEventListener('pointerdown', onClearDown);
      titleClearBtnEl.removeEventListener('pointerup', onClearEnd);
      titleClearBtnEl.removeEventListener('pointercancel', onClearEnd);
      titleClearBtnEl.removeEventListener('lostpointercapture', onClearEnd);
    },
    arcTotalLen: arcLen,
    lastPhase: null,
    lastResultReady: null,
    lastSpeedInt: 0,
    lastSpeedQuantized: 0,
    lastBoostQuantized: 0,
    lastBoostActive: false,
    lastProgressQuantized: 0,
    lastCpPassed: 0,
    lastTimeText: '00:00.00',
    lastTimerLapText: '',
    lastBestText: '',
    lastBestLapText: '',
    lastLapText: '',
    lastShowLap: null,
    lastCpText: 'CP 0 / 0',
    lastWrongWay: null,
    lastMuted: null,
    lastTouchActive: null,
  };

  return handle;
}

function renderTopRecordsList(
  containerEl: HTMLElement,
  records: CourseRecords,
  highlightRank: number | null,
): void {
  containerEl.textContent = '';
  if (records.top.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'sr-top-empty';
    empty.textContent = 'Belum ada catatan waktu';
    containerEl.appendChild(empty);
    return;
  }

  for (let i = 0; i < records.top.length; i++) {
    const entry = records.top[i];
    const rankNum = i + 1;
    const isHighlighted = highlightRank !== null && rankNum === highlightRank;

    const row = document.createElement('div');
    row.className = isHighlighted ? 'sr-top-row sr-top-row--highlight' : 'sr-top-row';

    const rankEl = document.createElement('span');
    rankEl.className = 'sr-top-rank';
    rankEl.textContent = `#${rankNum}`;
    row.appendChild(rankEl);

    const timeEl = document.createElement('span');
    timeEl.textContent = formatRaceTime(entry.time);
    row.appendChild(timeEl);

    const medalEl = document.createElement('span');
    medalEl.className = 'sr-top-medal-tag';
    medalEl.textContent = isHighlighted
      ? `${formatMedalLabel(entry.medal)} • BARU`
      : formatMedalLabel(entry.medal);
    row.appendChild(medalEl);

    containerEl.appendChild(row);
  }
}

export function updateTitleScreen(hud: HudHandle, data: TitleScreenData): void {
  hud.titleTargetGoldEl.textContent = formatRaceTime(data.medals.gold);
  hud.titleTargetSilverEl.textContent = formatRaceTime(data.medals.silver);
  hud.titleTargetBronzeEl.textContent = formatRaceTime(data.medals.bronze);

  renderTopRecordsList(hud.titleTopListEl, data.records, null);

  const hasRecords = data.records.best !== null || data.records.top.length > 0;
  hud.titleClearBtnEl.disabled = !hasRecords;
  if (!hasRecords && hud.titleClearTextEl.textContent !== 'Rekor Dihapus!') {
    hud.titleClearTextEl.textContent = 'Belum ada rekor';
  } else if (hasRecords && hud.titleClearTextEl.textContent === 'Belum ada rekor') {
    hud.titleClearTextEl.textContent = 'Hapus Rekor (Tahan)';
  }
}

export function showLoadingOverlay(hud: HudHandle): void {
  hud.loadingOverlayEl.classList.remove('sr-hud-hidden');
}

export function hideLoadingOverlay(hud: HudHandle): void {
  hud.loadingOverlayEl.classList.add('sr-hud-hidden');
}

export function setHudProgressCheckpoints(
  hud: HudHandle,
  ratios: readonly number[],
): void {
  hud.progressMarkersEl.textContent = '';
  hud.progressMarkerEls = [];
  for (const ratio of ratios) {
    const clamped = Math.min(1, Math.max(0, ratio));
    const marker = document.createElement('span');
    marker.className = 'sr-progress-marker';
    marker.style.left = `${(clamped * 100).toFixed(2)}%`;
    hud.progressMarkersEl.appendChild(marker);
    hud.progressMarkerEls.push(marker);
  }
  hud.lastCpPassed = -1;
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

export function showLapPopup(hud: HudHandle, notice: LapPopupNotice): void {
  if (hud.lapPopupTimerId !== null) {
    window.clearTimeout(hud.lapPopupTimerId);
    hud.lapPopupTimerId = null;
  }

  hud.lapPopupSlotEl.textContent = '';

  const labelEl = document.createElement('span');
  labelEl.className = 'sr-lap-popup-label';
  labelEl.textContent = `LAP ${notice.lap} / ${notice.totalLaps}`;
  hud.lapPopupSlotEl.appendChild(labelEl);

  const timeEl = document.createElement('span');
  timeEl.className = 'sr-lap-popup-time';
  timeEl.textContent = formatRaceTime(notice.lapTime);
  hud.lapPopupSlotEl.appendChild(timeEl);

  if (notice.isBestLap) {
    const tagEl = document.createElement('span');
    tagEl.className = 'sr-lap-popup-best';
    tagEl.textContent = 'TERCEPAT!';
    hud.lapPopupSlotEl.appendChild(tagEl);
  }

  hud.lapPopupSlotEl.classList.remove('sr-hud-hidden', 'sr-lap-popup-active');
  void hud.lapPopupSlotEl.offsetWidth;
  hud.lapPopupSlotEl.classList.add('sr-lap-popup-active');

  hud.lapPopupTimerId = window.setTimeout(() => {
    hud.lapPopupSlotEl.classList.add('sr-hud-hidden');
    hud.lapPopupSlotEl.classList.remove('sr-lap-popup-active');
    hud.lapPopupTimerId = null;
  }, CONFIG.hud.splitPopupDurationMs + 300);
}

export function hideLapPopup(hud: HudHandle): void {
  if (hud.lapPopupTimerId !== null) {
    window.clearTimeout(hud.lapPopupTimerId);
    hud.lapPopupTimerId = null;
  }
  hud.lapPopupSlotEl.classList.add('sr-hud-hidden');
  hud.lapPopupSlotEl.classList.remove('sr-lap-popup-active');
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

export function showFinishScreen(hud: HudHandle, data: FinishScreenData): void {
  const { finish, records, courseName } = data;

  hud.finishCourseNameEl.textContent = courseName;
  hud.finishBadgeEl.classList.toggle('sr-hud-hidden', !finish.isNewBest);
  hud.finishMedalIconEl.innerHTML = createMedalBadgeSvg(finish.medal);
  hud.finishMedalLabelEl.textContent = formatMedalLabel(finish.medal);
  hud.finishTimeEl.textContent = formatRaceTime(finish.time);
  hud.finishCopyBtnEl.textContent = 'Salin hasil';

  hud.finishDeltaEl.className = 'sr-finish-delta';
  if (finish.deltaToBest === null) {
    hud.finishDeltaEl.classList.add('sr-split-delta-neutral');
    hud.finishDeltaEl.textContent = 'Catatan Waktu Pertama';
  } else if (finish.deltaToBest <= 0) {
    hud.finishDeltaEl.classList.add('sr-split-delta-fast');
    hud.finishDeltaEl.textContent = `${formatDelta(finish.deltaToBest)} lebih cepat`;
  } else {
    hud.finishDeltaEl.classList.add('sr-split-delta-slow');
    hud.finishDeltaEl.textContent = `${formatDelta(finish.deltaToBest)} dari rekor`;
  }

  // Stats grid
  const stats = finish.stats;
  const statItems: Array<{ label: string; value: string }> = [
    { label: 'Top Speed', value: `${Math.round(stats.topSpeedKmh)} km/h` },
    { label: 'Total Udara', value: `${stats.totalAirtime.toFixed(2)} s` },
    { label: 'Lompatan Terlama', value: `${stats.longestAirtime.toFixed(2)} s` },
    { label: 'Boost', value: String(stats.boostCount) },
    { label: 'Bentur Pagar', value: String(stats.railHits) },
    { label: 'Reset', value: String(stats.resets) },
    { label: 'Jatuh', value: String(stats.falls) },
  ];
  hud.finishStatsGridEl.textContent = '';
  for (const item of statItems) {
    const tile = document.createElement('div');
    tile.className = 'sr-stat-tile';
    const labelEl = document.createElement('span');
    labelEl.className = 'sr-stat-label';
    labelEl.textContent = item.label;
    const valEl = document.createElement('span');
    valEl.className = 'sr-stat-value';
    valEl.textContent = item.value;
    tile.appendChild(labelEl);
    tile.appendChild(valEl);
    hud.finishStatsGridEl.appendChild(tile);
  }

  // Per-lap breakdown (shown for multi-lap courses)
  const hasMultipleLaps = finish.lapTimes.length > 1;
  hud.finishLapsBoxEl.classList.toggle('sr-hud-hidden', !hasMultipleLaps);
  hud.finishLapsEl.textContent = '';
  if (hasMultipleLaps) {
    const runMinLap = Math.min(...finish.lapTimes);
    for (let i = 0; i < finish.lapTimes.length; i++) {
      const lapVal = finish.lapTimes[i];
      const isRunBest = Math.abs(lapVal - runMinLap) <= 1e-4;
      const isRecordBest = finish.bestLap !== null && lapVal <= finish.bestLap + 1e-4;

      const row = document.createElement('div');
      row.className = isRunBest ? 'sr-finish-lap-row sr-finish-lap-row--best' : 'sr-finish-lap-row';

      const labelEl = document.createElement('span');
      labelEl.className = 'sr-finish-lap-label';
      labelEl.textContent = `Lap ${i + 1}`;
      row.appendChild(labelEl);

      const valEl = document.createElement('span');
      valEl.className = 'sr-finish-lap-val';
      valEl.textContent = formatRaceTime(lapVal);
      row.appendChild(valEl);

      if (isRecordBest || isRunBest) {
        const tagEl = document.createElement('span');
        tagEl.className = 'sr-finish-split-best-tag';
        tagEl.textContent = isRecordBest ? 'TERBAIK' : 'TERCEPAT';
        row.appendChild(tagEl);
      }

      hud.finishLapsEl.appendChild(row);
    }
  }

  // Checkpoint splits table
  const cpPerLap =
    hasMultipleLaps && finish.splits.length % finish.lapTimes.length === 0
      ? finish.splits.length / finish.lapTimes.length
      : 0;
  hud.finishSplitsEl.textContent = '';
  for (let i = 0; i < finish.splits.length; i++) {
    const splitVal = finish.splits[i];
    const delta = i < finish.splitDeltas.length ? finish.splitDeltas[i] : null;
    const isSplitBest = i < finish.isNewSplitBest.length ? finish.isNewSplitBest[i] : false;

    const row = document.createElement('div');
    row.className = 'sr-finish-split-row';

    const labelEl = document.createElement('span');
    labelEl.className = 'sr-finish-split-label';
    if (cpPerLap > 0) {
      const lapNum = Math.floor(i / cpPerLap) + 1;
      const cpNum = (i % cpPerLap) + 1;
      labelEl.textContent = `L${lapNum}·CP${cpNum}`;
    } else {
      labelEl.textContent = `CP ${i + 1}`;
    }
    row.appendChild(labelEl);

    const valEl = document.createElement('span');
    valEl.className = 'sr-finish-split-val';
    valEl.textContent = formatSplitSeconds(splitVal);
    row.appendChild(valEl);

    const deltaEl = document.createElement('span');
    if (delta === null) {
      deltaEl.className = 'sr-finish-split-delta sr-split-delta-neutral';
      deltaEl.textContent = '--';
    } else if (delta <= 0) {
      deltaEl.className = 'sr-finish-split-delta sr-split-delta-fast';
      deltaEl.textContent = formatDelta(delta);
    } else {
      deltaEl.className = 'sr-finish-split-delta sr-split-delta-slow';
      deltaEl.textContent = formatDelta(delta);
    }
    row.appendChild(deltaEl);

    if (isSplitBest) {
      const bestTag = document.createElement('span');
      bestTag.className = 'sr-finish-split-best-tag';
      bestTag.textContent = 'TERBAIK';
      row.appendChild(bestTag);
    }

    hud.finishSplitsEl.appendChild(row);
  }

  // Top 5 list
  renderTopRecordsList(hud.finishTopListEl, records, finish.rank);

  hud.finishCardEl.classList.remove('sr-finish-enter');
  void hud.finishCardEl.offsetWidth;
  hud.finishCardEl.classList.add('sr-finish-enter');
  hud.finishScreenEl.classList.remove('sr-hud-hidden');
}

export function hideFinishScreen(hud: HudHandle): void {
  hud.finishScreenEl.classList.add('sr-hud-hidden');
  hud.finishCardEl.classList.remove('sr-finish-enter');
}

export function updateHud(hud: HudHandle, viewModel: HudViewModel): void {
  if (viewModel.touchActive !== hud.lastTouchActive) {
    hud.lastTouchActive = viewModel.touchActive;
    hud.root.classList.toggle('hud--touch', viewModel.touchActive);
  }

  if (viewModel.muted !== hud.lastMuted) {
    hud.lastMuted = viewModel.muted;
    hud.audioBtnEl.classList.toggle('sr-audio-muted', viewModel.muted);
    hud.audioBtnEl.setAttribute(
      'aria-label',
      viewModel.muted ? 'Suara bisu (M)' : 'Suara aktif (M)',
    );
  }

  if (viewModel.phase !== hud.lastPhase || viewModel.resultReady !== hud.lastResultReady) {
    hud.lastPhase = viewModel.phase;
    hud.lastResultReady = viewModel.resultReady;
    const isTitle = viewModel.phase === 'TITLE';
    const isFinish = viewModel.phase === 'FINISH';
    const showResults = isFinish && viewModel.resultReady;

    hud.root.classList.toggle('sr-hud--modal', isTitle || showResults);
    hud.titleScreenEl.classList.toggle('sr-hud-hidden', !isTitle);
    hud.finishScreenEl.classList.toggle('sr-hud-hidden', !showResults);
    hud.topBarEl.classList.toggle('sr-hud-hidden', isTitle || showResults);
    hud.progressWrapEl.classList.toggle('sr-hud-hidden', isTitle || isFinish);
    hud.bottomRightEl.classList.toggle('sr-hud-hidden', isTitle || isFinish);
    if (CONFIG.hud.showControlsHint) {
      hud.bottomLeftEl.classList.toggle('sr-hud-hidden', isTitle || isFinish);
    }

    if (isTitle || isFinish) {
      hideCountdownOverlay(hud);
    }
    if (!isTitle) {
      hud.clearHoldCleanup();
    }
  }

  const showWrongWay = viewModel.phase === 'RACING' && viewModel.wrongWay;
  if (showWrongWay !== hud.lastWrongWay) {
    hud.lastWrongWay = showWrongWay;
    hud.wrongWayEl.classList.toggle('sr-hud-hidden', !showWrongWay);
  }

  if (viewModel.phase === 'TITLE') {
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

  const showLap = viewModel.totalLaps > 1;
  if (showLap !== hud.lastShowLap) {
    hud.lastShowLap = showLap;
    hud.lapSlotEl.classList.toggle('sr-hud-hidden', !showLap);
    hud.timerLapEl.classList.toggle('sr-hud-hidden', !showLap);
  }

  if (showLap) {
    const lapText = `LAP ${viewModel.lap} / ${viewModel.totalLaps}`;
    if (lapText !== hud.lastLapText) {
      hud.lastLapText = lapText;
      hud.lapSlotEl.textContent = lapText;
    }

    const timerLapText = `LAP ${formatRaceTime(viewModel.lapTimeSeconds)}`;
    if (timerLapText !== hud.lastTimerLapText) {
      hud.lastTimerLapText = timerLapText;
      hud.timerLapEl.textContent = timerLapText;
    }
  }

  const timeText = formatRaceTime(viewModel.timeSeconds);
  if (timeText !== hud.lastTimeText) {
    hud.lastTimeText = timeText;
    hud.timerValueEl.textContent = timeText;
  }

  const bestText =
    viewModel.bestTime !== null ? `BEST ${formatRaceTime(viewModel.bestTime)}` : '';
  if (bestText !== hud.lastBestText) {
    hud.lastBestText = bestText;
    hud.timerBestEl.textContent = bestText;
    hud.timerBestEl.classList.toggle('sr-hud-hidden', bestText === '');
  }

  const bestLapText =
    showLap && viewModel.bestLapSeconds !== null
      ? `BL ${formatRaceTime(viewModel.bestLapSeconds)}`
      : '';
  if (bestLapText !== hud.lastBestLapText) {
    hud.lastBestLapText = bestLapText;
    hud.timerBestLapEl.textContent = bestLapText;
    hud.timerBestLapEl.classList.toggle('sr-hud-hidden', bestLapText === '');
  }

  const cpText = `CP ${viewModel.cpPassed} / ${viewModel.cpTotal}`;
  if (cpText !== hud.lastCpText) {
    hud.lastCpText = cpText;
    hud.cpSlotEl.textContent = cpText;
  }

  const progClamped = Math.min(1, Math.max(0, viewModel.progress01));
  const progQuantized = Math.round(progClamped * 500);
  if (progQuantized !== hud.lastProgressQuantized) {
    hud.lastProgressQuantized = progQuantized;
    hud.progressFillEl.style.transform = `scaleX(${(progQuantized / 500).toFixed(3)})`;
  }

  if (viewModel.cpPassed !== hud.lastCpPassed) {
    hud.lastCpPassed = viewModel.cpPassed;
    for (let i = 0; i < hud.progressMarkerEls.length; i++) {
      hud.progressMarkerEls[i].classList.toggle(
        'sr-progress-marker-passed',
        i < viewModel.cpPassed,
      );
    }
  }
}

export function disposeHud(hud: HudHandle): void {
  hideAirtimePopup(hud);
  hideSplitPopup(hud);
  hideLapPopup(hud);
  hideCountdownOverlay(hud);
  hideFinishScreen(hud);
  hud.disposeEvents();
  if (hud.root.parentElement === hud.container) {
    hud.container.removeChild(hud.root);
  }
}
