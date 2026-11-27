// src/ui/hud.ts

import { CONFIG, type AiDifficulty, type GraphicsPreset } from '../config';
import type { RacerStandingEntry } from '../core/standings';
import type { RacePhase, FinishResultData } from '../core/state';
import type { CourseMedals } from '../courses/types';
import type { TouchControlPrefs } from '../input/touch';
import {
  formatMedalLabel,
  type CourseRecords,
} from '../services/records';
import { createToastQueue, type ToastQueue } from './toastQueue';
import { getBuildId, isDebugUrlEnabled } from './errorOverlay';
import {
  createMinimap,
  getMinimapModeLabel,
  type MinimapController,
  type MinimapSizeMode,
} from './minimap';
import {
  hideResultScreen,
  showResultScreen,
  syncResultDifficultyUi,
} from './resultScreen';
import type { QualityLevel } from '../render/quality';
import './hud.css';

export interface HudViewModel {
  phase: RacePhase;
  resultReady: boolean;
  introActive?: boolean;
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
  position?: number;
  totalRacers?: number;
  standings?: readonly RacerStandingEntry[];
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
  courseId?: string;
  medals: CourseMedals;
  records: CourseRecords;
  racers?: number;
  aiDifficulty?: AiDifficulty;
  attractionsEnabled?: boolean;
}

export interface FinishScreenData {
  courseName: string;
  finish: FinishResultData;
  records: CourseRecords;
  aiDifficulty?: AiDifficulty;
  podiumActive?: boolean;
}

export interface HudCallbacks {
  onStartRace?: () => void;
  onRetryRace?: () => void;
  onReturnToMenu?: () => void;
  onCopyResult?: () => Promise<boolean> | boolean;
  onClearRecords?: () => void;
  onTryFullGraphics?: () => void;
  onUseSafeMode?: () => void;
  onSelectGraphicsPreset?: (preset: GraphicsPreset) => void;
  onSelectAiDifficulty?: (difficulty: AiDifficulty) => void;
  onToggleAttractions?: () => void;
  onCycleMinimap?: (mode: MinimapSizeMode) => void;
  onChangeBrightness?: (value: number) => void;
  onResetBrightness?: () => void;
  onMeasureLuminance?: () => number | null;
  onRunPresetBenchmark?: () => void;
  onGearCheckpointReset?: () => void;
  onGearRestartRace?: () => void;
  onGearToggleMute?: () => void;
  onGearToggleSteerMode?: () => void;
  onGearToggleAutoThrottle?: () => void;
  onGearToggleFullscreen?: () => void;
  onToggleMusic?: () => void;
  onChangeMusicVolume?: (value: number) => void;
  onOpenReport?: () => void;
}

export interface GraphicsUiState {
  preset: GraphicsPreset;
  brightness: number;
  touchPrefs?: TouchControlPrefs;
  minimapMode?: MinimapSizeMode;
  attractionsEnabled?: boolean;
  attractionsAvailable?: boolean;
  musicEnabled?: boolean;
  musicVolume?: number;
  probeActive?: boolean;
  benchmarkRunning?: boolean;
  raceActive?: boolean;
  measuredLuma?: number | null;
}

export interface PresetBenchmarkEntry {
  preset: GraphicsPreset;
  avgFps: number;
  avgFrameMs: number;
  luma: number | null;
  errorCount: number;
}

export interface PresetBenchmarkReport {
  activePreset: GraphicsPreset;
  recommendedPreset: GraphicsPreset;
  measuredLuma: number | null;
  targetLuma: number;
  entries: PresetBenchmarkEntry[];
}

export interface DebugCarStatus {
  index: number;
  label: string;
  routeId: string;
  mode: string;
  speedKmh: number;
  s: number;
  crashed: boolean;
}

export interface DebugMetricsSnapshot {
  fps: number;
  avgFrameMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  status: 'TITLE' | 'LOADING' | 'COUNTDOWN' | 'RACING' | 'FINISH';
  countdownSec: number;
  countdownWallMs: number;
  courseId: string;
  routeId: string;
  quality: QualityLevel;
  carCount: number;
  aiStepMs?: number;
  cars?: DebugCarStatus[];
  music?: {
    trackLabel: string;
    volume: number;
    status: string;
  };
}

export interface HudHandle {
  root: HTMLElement;
  container: HTMLElement;
  topBarEl: HTMLElement;
  posSlotEl: HTMLElement;
  standingsPanelEl: HTMLElement;
  progressWrapEl: HTMLElement;
  progressFillEl: HTMLElement;
  progressMarkersEl: HTMLElement;
  progressMarkerEls: HTMLElement[];
  bottomLeftEl: HTMLElement;
  hintFullEl: HTMLElement;
  hintBadgeEl: HTMLButtonElement;
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
  toastLaneEl: HTMLElement;
  toastQueue: ToastQueue;
  loadingOverlayEl: HTMLElement;
  loadingPillEl: HTMLElement;
  contextLostOverlayEl: HTMLElement;
  contextLostCardEl: HTMLButtonElement;
  debugMetricsEl: HTMLElement;
  titleScreenEl: HTMLElement;
  titleCourseSelectSlotEl: HTMLElement;
  titleDiffRowEl: HTMLElement;
  titleDiffBtns: Record<AiDifficulty, HTMLButtonElement>;
  titleAttrRowEl: HTMLElement;
  titleAttrBtnEl: HTMLButtonElement;
  titleTargetGoldEl: HTMLElement;
  titleTargetSilverEl: HTMLElement;
  titleTargetBronzeEl: HTMLElement;
  titleTopListEl: HTMLElement;
  titleStartBtnEl: HTMLButtonElement;
  titleClearBtnEl: HTMLButtonElement;
  titleClearRingFillEl: SVGCircleElement;
  titleClearTextEl: HTMLElement;
  titleGfxBarEl: HTMLElement;
  titleGfxStatusEl: HTMLElement;
  titlePresetBtns: Record<GraphicsPreset, HTMLButtonElement>;
  titleBrightnessInputEl: HTMLInputElement;
  titleBrightnessValEl: HTMLElement;
  titleBrightnessResetEl: HTMLButtonElement;
  titleDebugBarEl: HTMLElement;
  titleLumaBtnEl: HTMLButtonElement;
  titleBenchBtnEl: HTMLButtonElement;
  titleLumaTextEl: HTMLElement;
  titleVersionBtnEl: HTMLButtonElement;
  gearWrapEl: HTMLElement;
  gearBtnEl: HTMLButtonElement;
  gearPopoverEl: HTMLElement;
  gearRaceActionsEl: HTMLElement;
  gearCpBtnEl: HTMLButtonElement;
  gearRestartBtnEl: HTMLButtonElement;
  gearMuteBtnEl: HTMLButtonElement;
  gearMuteTextEl: HTMLElement;
  gearSteerBtnEl: HTMLButtonElement;
  gearAutoBtnEl: HTMLButtonElement;
  gearFsBtnEl: HTMLButtonElement;
  gearMinimapBtnEl: HTMLButtonElement;
  gearAttrBtnEl: HTMLButtonElement;
  gearMusicToggleBtnEl: HTMLButtonElement;
  gearMusicSliderEl: HTMLInputElement;
  gearMusicValEl: HTMLElement;
  gearPresetBtns: Record<GraphicsPreset, HTMLButtonElement>;
  gearBrightnessInputEl: HTMLInputElement;
  gearBrightnessValEl: HTMLElement;
  gearBrightnessResetEl: HTMLButtonElement;
  gearDebugRowEl: HTMLElement;
  gearLumaBtnEl: HTMLButtonElement;
  gearBenchBtnEl: HTMLButtonElement;
  gearLumaTextEl: HTMLElement;
  gearAutoCloseTimerId: number | null;
  gearOpen: boolean;
  minimap: MinimapController;
  benchOverlayEl: HTMLElement;
  benchBodyEl: HTMLElement;
  benchCloseBtnEl: HTMLButtonElement;
  safeBannerEl: HTMLElement;
  safeBannerTimerId: number | null;
  countdownEl: HTMLElement;
  finishScreenEl: HTMLElement;
  finishCardEl: HTMLElement;
  finishCourseNameEl: HTMLElement;
  finishPosBannerEl: HTMLElement;
  finishBadgeEl: HTMLElement;
  finishMedalIconEl: HTMLElement;
  finishMedalLabelEl: HTMLElement;
  finishTimeEl: HTMLElement;
  finishDeltaEl: HTMLElement;
  finishStatsGridEl: HTMLElement;
  finishStandingsBoxEl: HTMLElement;
  finishStandingsEl: HTMLElement;
  finishDiffRowEl: HTMLElement;
  finishDiffBtns: Record<AiDifficulty, HTMLButtonElement>;
  finishLapsBoxEl: HTMLElement;
  finishLapsEl: HTMLElement;
  finishSplitsEl: HTMLElement;
  finishTopListEl: HTMLElement;
  finishRetryBtnEl: HTMLButtonElement;
  finishMenuBtnEl: HTMLButtonElement;
  finishCopyBtnEl: HTMLButtonElement;
  speedLinesEl: HTMLElement;
  audioBtnEl: HTMLButtonElement;
  countdownHideTimerId: number | null;
  copyResetTimerId: number | null;
  clearHoldRafId: number;
  clearHoldCleanup: () => void;
  disposeEvents: () => void;
  arcTotalLen: number;
  lastPhase: RacePhase | null;
  lastResultReady: boolean | null;
  lastIntroActive: boolean | null;
  lastSpeedInt: number;
  lastSpeedQuantized: number;
  lastBoostQuantized: number;
  lastBoostActive: boolean;
  lastSpeedLinesOpacity: number;
  lastProgressQuantized: number;
  lastCpPassed: number;
  lastTimeText: string;
  lastTimerLapText: string;
  lastBestText: string;
  lastBestLapText: string;
  lastBestLapSeconds: number | null;
  lastLapText: string;
  lastShowLap: boolean | null;
  lastPosText: string;
  lastShowPos: boolean | null;
  lastStandingsKey: string;
  lastCpText: string;
  lastWrongWay: boolean | null;
  lastMuted: boolean | null;
  lastTouchActive: boolean | null;
  lastCompact: boolean | null;
  lastPortrait: boolean | null;
  lastTimeSeconds: number;
  lastToastTickMs: number;
  hintManualExpanded: boolean | null;
  lastHintCollapsed: boolean | null;
  lastDebugMetricsSampleMs: number;
  lastDebugMetricsKey: string;
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

function formatDelta(delta: number): string {
  const sign = delta > 0 ? '+' : '-';
  return `${sign}${Math.abs(delta).toFixed(2)} s`;
}

function applyHudConfigCssVars(root: HTMLElement): void {
  const cfg = CONFIG.hud;
  root.style.setProperty('--sr-panel-opacity', String(cfg.panelOpacity));
  root.style.setProperty('--sr-panel-border-opacity', String(cfg.panelBorderOpacity));
  root.style.setProperty('--sr-mobile-panel-opacity', String(cfg.mobilePanelOpacity));
  root.style.setProperty('--sr-mobile-speedo-opacity', String(cfg.mobileSpeedoOpacity));
  root.style.setProperty('--sr-mobile-top-max-dvh', `${cfg.mobileTopMaxHeightPct}dvh`);
  root.style.setProperty('--sr-toast-bg-opacity', String(cfg.toastBgOpacity));
  root.style.setProperty('--sr-toast-border-opacity', String(cfg.toastBorderOpacity));
  root.style.setProperty('--sr-toast-fade-in', `${cfg.toastFadeInMs}ms`);
  root.style.setProperty('--sr-toast-fade-out', `${cfg.toastFadeOutMs}ms`);
  root.style.setProperty('--sr-toast-top', `${cfg.toastTopVh}vh`);
  root.style.setProperty('--sr-toast-font-size', `${cfg.toastFontVh}vh`);
  root.style.setProperty('--sr-toast-zone-font-size', `${cfg.toastZoneFontVh}vh`);
  root.style.setProperty('--sr-toast-wrongway-font-size', `${cfg.toastWrongWayFontVh}vh`);
  root.style.setProperty('--sr-progress-height', `${cfg.progressBarHeightPx}px`);
  root.style.setProperty('--sr-speedo-scale', String(cfg.speedoScale));
  root.style.setProperty('--sr-speedo-opacity', String(cfg.speedoOpacity));
  root.style.setProperty('--sr-speedo-right', `${cfg.speedoEdgeRightPx}px`);
  root.style.setProperty('--sr-speedo-bottom', `${cfg.speedoEdgeBottomPx}px`);
  root.style.setProperty(
    '--sr-hint-collapsed-opacity',
    String(cfg.controlsHintCollapsedOpacity),
  );
  root.style.setProperty('--sr-debug-opacity', String(CONFIG.debugOverlay.opacity));
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
  applyHudConfigCssVars(root);

  const hintClass = cfg.showControlsHint
    ? 'sr-hud-bottom-left sr-hud-hidden'
    : 'sr-hud-hidden';

  root.innerHTML = `
    <div class="sr-speed-lines" aria-hidden="true"></div>

    <div class="sr-hud-top sr-hud-hidden">
      <div class="sr-hud-panel sr-pos-slot sr-hud-hidden" data-slot="pos">P1 / 4</div>
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

    <div class="sr-hud-panel sr-standings-panel sr-hud-hidden" aria-label="Klasemen Sementara"></div>

    <div class="sr-progress-wrap sr-hud-hidden">
      <div class="sr-progress-track">
        <div class="sr-progress-fill"></div>
        <div class="sr-progress-markers"></div>
      </div>
    </div>

    <div class="sr-toast-lane" aria-live="polite"></div>

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

    <div class="${hintClass}">
      <div class="sr-hud-panel sr-hint-full">
        <span class="sr-hint-item"><span class="sr-key">W A S D</span> / <span class="sr-key">Panah</span> Kemudi</span>
        <span class="sr-hint-item"><span class="sr-key">Space</span> Drift</span>
        <span class="sr-hint-item"><span class="sr-key">R</span> Checkpoint</span>
        <span class="sr-hint-item"><span class="sr-key">Enter</span> Ulang</span>
        <span class="sr-hint-item"><span class="sr-key">M</span> Suara</span>
        <span class="sr-hint-item"><span class="sr-key">N</span> Denah</span>
        <span class="sr-hint-item"><span class="sr-key">H</span> Panduan</span>
      </div>
      <button type="button" class="sr-hud-panel sr-hint-badge" aria-label="Tampilkan panduan tombol (H)" title="Panduan tombol (H)">?</button>
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

    <div class="sr-gear-wrap">
      <button type="button" class="sr-hud-panel sr-gear-btn" aria-label="Pengaturan dan menu cepat" aria-expanded="false" title="Pengaturan">
        <svg class="sr-gear-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 8.75a3.25 3.25 0 1 0 0 6.5 3.25 3.25 0 0 0 0-6.5Z" fill="none" stroke="currentColor" stroke-width="2" />
          <path d="M19.4 13.5a7.9 7.9 0 0 0 .06-1.5c0-.51-.02-1.01-.06-1.5l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.4 7.4 0 0 0-2.6-1.5l-.36-2.54a.5.5 0 0 0-.49-.42h-3.84a.5.5 0 0 0-.49.42l-.36 2.54a7.4 7.4 0 0 0-2.6 1.5l-2.39-.96a.5.5 0 0 0-.61.22L2.45 8.28a.5.5 0 0 0 .12.64L4.6 10.5c-.04.49-.06.99-.06 1.5s.02 1.01.06 1.5l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.4.31.61.22l2.39-.96c.78.64 1.66 1.15 2.6 1.5l.36 2.54c.04.24.25.42.49.42h3.84c.24 0 .45-.18.49-.42l.36-2.54a7.4 7.4 0 0 0 2.6-1.5l2.39.96c.21.09.48 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
        </svg>
      </button>
      <div class="sr-hud-panel sr-gear-popover sr-hud-hidden" role="dialog" aria-label="Menu Cepat">
        <div class="sr-gear-section sr-gear-race-actions sr-hud-hidden">
          <div class="sr-gear-label">Kontrol Balap</div>
          <div class="sr-gear-action-grid">
            <button type="button" class="sr-gear-action-btn sr-gear-cp-btn">CP</button>
            <button type="button" class="sr-gear-action-btn sr-gear-restart-btn">ULANG</button>
            <button type="button" class="sr-gear-action-btn sr-gear-mute-btn">
              <svg class="sr-gear-speaker-icon sr-gear-speaker-on" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 9.5v5h4l5 4.5V5L8 9.5H4z" fill="currentColor" />
                <path d="M16.2 8.8a4.8 4.8 0 0 1 0 6.4" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" />
              </svg>
              <svg class="sr-gear-speaker-icon sr-gear-speaker-off" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 9.5v5h4l5 4.5V5L8 9.5H4z" fill="currentColor" />
                <path d="M16.5 9l4.5 6M21 9l-4.5 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
              </svg>
              <span class="sr-gear-mute-label">SUARA</span>
            </button>
            <button type="button" class="sr-gear-action-btn sr-gear-steer-btn">STIK</button>
            <button type="button" class="sr-gear-action-btn sr-gear-auto-btn">AUTO</button>
            <button type="button" class="sr-gear-action-btn sr-gear-fs-btn">FULL</button>
          </div>
        </div>
        <div class="sr-gear-section">
          <div class="sr-gear-label">Tampilan &amp; Arena</div>
          <div class="sr-gear-f6-grid">
            <button type="button" class="sr-gear-action-btn sr-gear-minimap-btn">DENAH: KECIL</button>
            <button type="button" class="sr-gear-action-btn sr-gear-attr-btn sr-hud-hidden">ATRAKSI: NYALA</button>
          </div>
        </div>
        <div class="sr-gear-section">
          <div class="sr-gear-row-between">
            <label class="sr-gear-label" for="srGearMusicVol">Volume Musik</label>
            <span class="sr-brightness-val sr-gear-music-val">${CONFIG.audio.music.defaultVolume.toFixed(2)}</span>
          </div>
          <div class="sr-music-ctrl-row">
            <button type="button" class="sr-gear-action-btn sr-gear-music-toggle-btn sr-gear-action-btn--on">MUSIK: NYALA</button>
            <input id="srGearMusicVol" class="sr-brightness-slider sr-gear-music-slider" type="range" min="0" max="1" step="0.05" value="${CONFIG.audio.music.defaultVolume}" />
          </div>
        </div>
        <div class="sr-gear-section">
          <div class="sr-gear-label">Preset Grafis</div>
          <div class="sr-preset-seg sr-gear-preset-seg">
            <button type="button" class="sr-preset-btn" data-preset="hemat">Hemat</button>
            <button type="button" class="sr-preset-btn" data-preset="seimbang">Seimbang</button>
            <button type="button" class="sr-preset-btn" data-preset="penuh">Penuh</button>
          </div>
        </div>
        <div class="sr-gear-section">
          <div class="sr-gear-row-between">
            <label class="sr-gear-label" for="srGearBrightness">Kecerahan</label>
            <span class="sr-brightness-val sr-gear-brightness-val">1.15</span>
          </div>
          <div class="sr-brightness-row">
            <input id="srGearBrightness" class="sr-brightness-slider sr-gear-brightness-slider" type="range" min="${CONFIG.safeMode.brightnessMin}" max="${CONFIG.safeMode.brightnessMax}" step="0.05" value="${CONFIG.safeMode.brightnessDefaultBalanced}" />
            <button type="button" class="sr-btn sr-btn-secondary sr-btn-mini sr-gear-brightness-reset">Reset</button>
          </div>
        </div>
        <div class="sr-gear-section sr-gear-debug-row sr-hud-hidden">
          <div class="sr-gear-debug-actions">
            <button type="button" class="sr-btn sr-btn-secondary sr-btn-mini sr-gear-luma-btn">Ukur kecerahan</button>
            <button type="button" class="sr-btn sr-btn-secondary sr-btn-mini sr-gear-bench-btn">Uji preset</button>
          </div>
          <div class="sr-luma-readout sr-gear-luma-text"></div>
        </div>
      </div>
    </div>

    <div class="sr-overlay-center sr-title-screen">
      <div class="sr-hud-panel sr-title-card">
        <div class="sr-title-kicker">Stunt Track Time Trial</div>
        <h1 class="sr-title-logo">SKY RACER</h1>
        <div class="sr-arena-select"></div>
        <div class="sr-title-diff-row sr-hud-hidden">
          <span class="sr-title-diff-label">Kesulitan Lawan</span>
          <div class="sr-preset-seg sr-title-diff-seg">
            <button type="button" class="sr-preset-btn sr-diff-btn" data-diff="mudah">Mudah</button>
            <button type="button" class="sr-preset-btn sr-diff-btn" data-diff="sedang">Sedang</button>
            <button type="button" class="sr-preset-btn sr-diff-btn" data-diff="sulit">Sulit</button>
          </div>
        </div>
        <div class="sr-title-attr-row sr-hud-hidden">
          <span class="sr-title-diff-label">Atraksi Arena</span>
          <button type="button" class="sr-preset-btn sr-title-attr-btn">Atraksi: Nyala</button>
        </div>
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
          <span class="sr-hint-item">Menu ⚙ kanan atas</span>
        </div>
        <div class="sr-title-gfx-bar">
          <div class="sr-title-gfx-row">
            <span class="sr-title-gfx-status">Grafis: Seimbang</span>
            <div class="sr-preset-seg sr-title-preset-seg">
              <button type="button" class="sr-preset-btn" data-preset="hemat">Hemat</button>
              <button type="button" class="sr-preset-btn" data-preset="seimbang">Seimbang</button>
              <button type="button" class="sr-preset-btn" data-preset="penuh">Penuh</button>
            </div>
          </div>
          <div class="sr-title-brightness-row">
            <label class="sr-title-brightness-label" for="srTitleBrightness">Kecerahan</label>
            <input id="srTitleBrightness" class="sr-brightness-slider sr-title-brightness-slider" type="range" min="${CONFIG.safeMode.brightnessMin}" max="${CONFIG.safeMode.brightnessMax}" step="0.05" value="${CONFIG.safeMode.brightnessDefaultBalanced}" />
            <span class="sr-brightness-val sr-title-brightness-val">1.15</span>
            <button type="button" class="sr-btn sr-btn-secondary sr-btn-mini sr-title-brightness-reset">Reset</button>
          </div>
          <div class="sr-title-debug-bar sr-hud-hidden">
            <button type="button" class="sr-btn sr-btn-secondary sr-btn-mini sr-title-luma-btn">Ukur kecerahan</button>
            <button type="button" class="sr-btn sr-btn-secondary sr-btn-mini sr-title-bench-btn">Uji preset</button>
            <span class="sr-luma-readout sr-title-luma-text"></span>
          </div>
        </div>
      </div>
      <button type="button" class="sr-title-version-btn" aria-label="Versi build">v${getBuildId()}</button>
    </div>

    <div class="sr-safe-banner sr-hud-hidden" role="status" aria-live="polite">Mode aman aktif</div>

    <div class="sr-overlay-center sr-countdown-overlay sr-hud-hidden">
      <div class="sr-countdown-text">3</div>
    </div>

    <div class="sr-overlay-center sr-loading-overlay sr-hud-hidden" aria-live="polite">
      <div class="sr-hud-panel sr-loading-pill">Memuat arena...</div>
    </div>

    <div class="sr-overlay-center sr-bench-overlay sr-hud-hidden" role="dialog" aria-modal="true">
      <div class="sr-hud-panel sr-bench-card">
        <div class="sr-bench-title">Hasil Uji Preset</div>
        <div class="sr-bench-body"></div>
        <div class="sr-bench-actions">
          <button type="button" class="sr-btn sr-btn-primary sr-btn-compact sr-bench-close-btn">Tutup</button>
        </div>
      </div>
    </div>

    <div class="sr-overlay-center sr-contextlost-overlay sr-hud-hidden" role="alertdialog" aria-modal="true">
      <button type="button" class="sr-hud-panel sr-contextlost-card">
        <span class="sr-contextlost-title">Grafik terhenti.</span>
        <span class="sr-contextlost-sub">Ketuk untuk memuat ulang</span>
      </button>
    </div>

    <div class="sr-debug-metrics sr-hud-hidden" aria-hidden="true"></div>

    <div class="sr-overlay-center sr-finish-screen sr-hud-hidden">
      <div class="sr-hud-panel sr-finish-card">
        <div class="sr-finish-col sr-finish-col-left">
          <div class="sr-finish-header">
            <div class="sr-finish-course-block">
              <span class="sr-finish-kicker sr-finish-course-name">Sky Circuit</span>
              <span class="sr-finish-title">BALAPAN SELESAI</span>
            </div>
            <span class="sr-finish-pos-banner sr-hud-hidden">P1</span>
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

          <div class="sr-finish-diff-row sr-hud-hidden">
            <span class="sr-finish-diff-label">Ganti kesulitan</span>
            <div class="sr-preset-seg sr-finish-diff-seg">
              <button type="button" class="sr-preset-btn sr-diff-btn" data-diff="mudah">Mudah</button>
              <button type="button" class="sr-preset-btn sr-diff-btn" data-diff="sedang">Sedang</button>
              <button type="button" class="sr-preset-btn sr-diff-btn" data-diff="sulit">Sulit</button>
            </div>
          </div>

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
          <div class="sr-finish-panel-box sr-finish-standings-box sr-hud-hidden">
            <div class="sr-box-heading">Klasemen Balapan</div>
            <div class="sr-finish-standings"></div>
          </div>
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

  const toastLaneEl = root.querySelector('.sr-toast-lane') as HTMLElement;
  const toastQueue = createToastQueue(toastLaneEl);

  const bottomLeftEl = root.querySelector('.sr-hud-bottom-left') as HTMLElement;
  const hintFullEl = root.querySelector('.sr-hint-full') as HTMLElement;
  const hintBadgeEl = root.querySelector('.sr-hint-badge') as HTMLButtonElement;

  const titleStartBtnEl = root.querySelector('.sr-title-start-btn') as HTMLButtonElement;
  const titleClearBtnEl = root.querySelector('.sr-title-clear-btn') as HTMLButtonElement;
  const titleClearRingFillEl = root.querySelector('.sr-hold-ring-fill') as SVGCircleElement;
  const titleClearTextEl = root.querySelector('.sr-title-clear-text') as HTMLElement;
  const titleDiffRowEl = root.querySelector('.sr-title-diff-row') as HTMLElement;
  const titleDiffBtns: Record<AiDifficulty, HTMLButtonElement> = {
    mudah: root.querySelector('.sr-title-diff-seg [data-diff="mudah"]') as HTMLButtonElement,
    sedang: root.querySelector('.sr-title-diff-seg [data-diff="sedang"]') as HTMLButtonElement,
    sulit: root.querySelector('.sr-title-diff-seg [data-diff="sulit"]') as HTMLButtonElement,
  };
  const titleAttrRowEl = root.querySelector('.sr-title-attr-row') as HTMLElement;
  const titleAttrBtnEl = root.querySelector('.sr-title-attr-btn') as HTMLButtonElement;
  const titleGfxBarEl = root.querySelector('.sr-title-gfx-bar') as HTMLElement;
  const titleGfxStatusEl = root.querySelector('.sr-title-gfx-status') as HTMLElement;
  const titlePresetBtns: Record<GraphicsPreset, HTMLButtonElement> = {
    hemat: root.querySelector('.sr-title-preset-seg [data-preset="hemat"]') as HTMLButtonElement,
    seimbang: root.querySelector('.sr-title-preset-seg [data-preset="seimbang"]') as HTMLButtonElement,
    penuh: root.querySelector('.sr-title-preset-seg [data-preset="penuh"]') as HTMLButtonElement,
  };
  const titleBrightnessInputEl = root.querySelector('.sr-title-brightness-slider') as HTMLInputElement;
  const titleBrightnessValEl = root.querySelector('.sr-title-brightness-val') as HTMLElement;
  const titleBrightnessResetEl = root.querySelector('.sr-title-brightness-reset') as HTMLButtonElement;
  const titleDebugBarEl = root.querySelector('.sr-title-debug-bar') as HTMLElement;
  const titleLumaBtnEl = root.querySelector('.sr-title-luma-btn') as HTMLButtonElement;
  const titleBenchBtnEl = root.querySelector('.sr-title-bench-btn') as HTMLButtonElement;
  const titleLumaTextEl = root.querySelector('.sr-title-luma-text') as HTMLElement;
  const titleVersionBtnEl = root.querySelector('.sr-title-version-btn') as HTMLButtonElement;

  const gearWrapEl = root.querySelector('.sr-gear-wrap') as HTMLElement;
  const gearBtnEl = root.querySelector('.sr-gear-btn') as HTMLButtonElement;
  const gearPopoverEl = root.querySelector('.sr-gear-popover') as HTMLElement;
  const gearRaceActionsEl = root.querySelector('.sr-gear-race-actions') as HTMLElement;
  const gearCpBtnEl = root.querySelector('.sr-gear-cp-btn') as HTMLButtonElement;
  const gearRestartBtnEl = root.querySelector('.sr-gear-restart-btn') as HTMLButtonElement;
  const gearMuteBtnEl = root.querySelector('.sr-gear-mute-btn') as HTMLButtonElement;
  const gearMuteTextEl = root.querySelector('.sr-gear-mute-label') as HTMLElement;
  const gearSteerBtnEl = root.querySelector('.sr-gear-steer-btn') as HTMLButtonElement;
  const gearAutoBtnEl = root.querySelector('.sr-gear-auto-btn') as HTMLButtonElement;
  const gearFsBtnEl = root.querySelector('.sr-gear-fs-btn') as HTMLButtonElement;
  const gearMinimapBtnEl = root.querySelector('.sr-gear-minimap-btn') as HTMLButtonElement;
  const gearAttrBtnEl = root.querySelector('.sr-gear-attr-btn') as HTMLButtonElement;
  const gearMusicToggleBtnEl = root.querySelector('.sr-gear-music-toggle-btn') as HTMLButtonElement;
  const gearMusicSliderEl = root.querySelector('.sr-gear-music-slider') as HTMLInputElement;
  const gearMusicValEl = root.querySelector('.sr-gear-music-val') as HTMLElement;

  const minimap = createMinimap((mode) => {
    gearMinimapBtnEl.textContent = `DENAH: ${getMinimapModeLabel(mode)}`;
    callbacks.onCycleMinimap?.(mode);
  });
  root.appendChild(minimap.element);
  gearMinimapBtnEl.textContent = `DENAH: ${getMinimapModeLabel(minimap.getSizeMode())}`;
  const gearPresetBtns: Record<GraphicsPreset, HTMLButtonElement> = {
    hemat: root.querySelector('.sr-gear-preset-seg [data-preset="hemat"]') as HTMLButtonElement,
    seimbang: root.querySelector('.sr-gear-preset-seg [data-preset="seimbang"]') as HTMLButtonElement,
    penuh: root.querySelector('.sr-gear-preset-seg [data-preset="penuh"]') as HTMLButtonElement,
  };
  const gearBrightnessInputEl = root.querySelector('.sr-gear-brightness-slider') as HTMLInputElement;
  const gearBrightnessValEl = root.querySelector('.sr-gear-brightness-val') as HTMLElement;
  const gearBrightnessResetEl = root.querySelector('.sr-gear-brightness-reset') as HTMLButtonElement;
  const gearDebugRowEl = root.querySelector('.sr-gear-debug-row') as HTMLElement;
  const gearLumaBtnEl = root.querySelector('.sr-gear-luma-btn') as HTMLButtonElement;
  const gearBenchBtnEl = root.querySelector('.sr-gear-bench-btn') as HTMLButtonElement;
  const gearLumaTextEl = root.querySelector('.sr-gear-luma-text') as HTMLElement;

  const benchOverlayEl = root.querySelector('.sr-bench-overlay') as HTMLElement;
  const benchBodyEl = root.querySelector('.sr-bench-body') as HTMLElement;
  const benchCloseBtnEl = root.querySelector('.sr-bench-close-btn') as HTMLButtonElement;

  const safeBannerEl = root.querySelector('.sr-safe-banner') as HTMLElement;
  const finishDiffRowEl = root.querySelector('.sr-finish-diff-row') as HTMLElement;
  const finishDiffBtns: Record<AiDifficulty, HTMLButtonElement> = {
    mudah: root.querySelector('.sr-finish-diff-seg [data-diff="mudah"]') as HTMLButtonElement,
    sedang: root.querySelector('.sr-finish-diff-seg [data-diff="sedang"]') as HTMLButtonElement,
    sulit: root.querySelector('.sr-finish-diff-seg [data-diff="sulit"]') as HTMLButtonElement,
  };
  const finishRetryBtnEl = root.querySelector('.sr-finish-retry-btn') as HTMLButtonElement;
  const finishMenuBtnEl = root.querySelector('.sr-finish-menu-btn') as HTMLButtonElement;
  const finishCopyBtnEl = root.querySelector('.sr-finish-copy-btn') as HTMLButtonElement;
  const speedLinesEl = root.querySelector('.sr-speed-lines') as HTMLElement;

  const debugModeEnabled = isDebugUrlEnabled();
  if (debugModeEnabled) {
    titleDebugBarEl.classList.remove('sr-hud-hidden');
    gearDebugRowEl.classList.remove('sr-hud-hidden');
  }

  const setGearOpen = (open: boolean): void => {
    handle.gearOpen = open;
    gearPopoverEl.classList.toggle('sr-hud-hidden', !open);
    gearBtnEl.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (handle.gearAutoCloseTimerId !== null) {
      window.clearTimeout(handle.gearAutoCloseTimerId);
      handle.gearAutoCloseTimerId = null;
    }
    if (open) {
      handle.gearAutoCloseTimerId = window.setTimeout(() => {
        setGearOpen(false);
      }, CONFIG.touch.gearAutoCloseMs);
    }
  };

  const bumpGearAutoCloseTimer = (): void => {
    if (!handle.gearOpen) {
      return;
    }
    if (handle.gearAutoCloseTimerId !== null) {
      window.clearTimeout(handle.gearAutoCloseTimerId);
    }
    handle.gearAutoCloseTimerId = window.setTimeout(() => {
      setGearOpen(false);
    }, CONFIG.touch.gearAutoCloseMs);
  };

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

  const handleGearWrapPointerDown = (e: PointerEvent): void => {
    e.stopPropagation();
    bumpGearAutoCloseTimer();
  };
  const handleGearBtnClick = (e: MouseEvent): void => {
    e.stopPropagation();
    gearBtnEl.blur();
    setGearOpen(!handle.gearOpen);
  };
  const handleGearPopoverInteract = (e: Event): void => {
    e.stopPropagation();
    bumpGearAutoCloseTimer();
  };
  const handleDocumentPointerDownForGear = (e: PointerEvent): void => {
    if (!handle.gearOpen) {
      return;
    }
    const target = e.target;
    if (target instanceof Node && !gearWrapEl.contains(target)) {
      setGearOpen(false);
    }
  };

  const stopProp = (e: Event): void => {
    e.stopPropagation();
  };
  const presetKeys: GraphicsPreset[] = ['hemat', 'seimbang', 'penuh'];
  const presetClickHandlers: Array<{ el: HTMLButtonElement; fn: (e: MouseEvent) => void }> = [];
  for (const key of presetKeys) {
    const onTitleClick = (e: MouseEvent): void => {
      e.stopPropagation();
      titlePresetBtns[key].blur();
      callbacks.onSelectGraphicsPreset?.(key);
    };
    const onGearClick = (e: MouseEvent): void => {
      e.stopPropagation();
      bumpGearAutoCloseTimer();
      callbacks.onSelectGraphicsPreset?.(key);
    };
    titlePresetBtns[key].addEventListener('pointerdown', stopProp);
    titlePresetBtns[key].addEventListener('click', onTitleClick);
    gearPresetBtns[key].addEventListener('click', onGearClick);
    presetClickHandlers.push({ el: titlePresetBtns[key], fn: onTitleClick });
    presetClickHandlers.push({ el: gearPresetBtns[key], fn: onGearClick });
  }

  const diffKeys: AiDifficulty[] = ['mudah', 'sedang', 'sulit'];
  const diffClickHandlers: Array<{ el: HTMLButtonElement; fn: (e: MouseEvent) => void }> = [];
  for (const diff of diffKeys) {
    const applyDiffSelection = (btn: HTMLButtonElement) => (e: MouseEvent): void => {
      e.stopPropagation();
      btn.blur();
      for (const dk of diffKeys) {
        titleDiffBtns[dk].classList.toggle('sr-preset-btn--active', dk === diff);
        finishDiffBtns[dk].classList.toggle('sr-preset-btn--active', dk === diff);
      }
      callbacks.onSelectAiDifficulty?.(diff);
    };
    const onTitleDiffClick = applyDiffSelection(titleDiffBtns[diff]);
    const onFinishDiffClick = applyDiffSelection(finishDiffBtns[diff]);
    titleDiffBtns[diff].addEventListener('pointerdown', stopProp);
    titleDiffBtns[diff].addEventListener('click', onTitleDiffClick);
    finishDiffBtns[diff].addEventListener('pointerdown', stopProp);
    finishDiffBtns[diff].addEventListener('click', onFinishDiffClick);
    diffClickHandlers.push({ el: titleDiffBtns[diff], fn: onTitleDiffClick });
    diffClickHandlers.push({ el: finishDiffBtns[diff], fn: onFinishDiffClick });
  }

  const handleBrightnessInput = (slider: HTMLInputElement) => (e: Event): void => {
    e.stopPropagation();
    bumpGearAutoCloseTimer();
    const val = Number.parseFloat(slider.value);
    if (Number.isFinite(val)) {
      callbacks.onChangeBrightness?.(val);
    }
  };
  const onTitleBrightnessInput = handleBrightnessInput(titleBrightnessInputEl);
  const onGearBrightnessInput = handleBrightnessInput(gearBrightnessInputEl);

  titleBrightnessInputEl.addEventListener('pointerdown', stopProp);
  titleBrightnessInputEl.addEventListener('input', onTitleBrightnessInput);
  gearBrightnessInputEl.addEventListener('pointerdown', handleGearPopoverInteract);
  gearBrightnessInputEl.addEventListener('input', onGearBrightnessInput);

  const handleBrightnessReset = (e: MouseEvent): void => {
    e.stopPropagation();
    bumpGearAutoCloseTimer();
    callbacks.onResetBrightness?.();
  };
  titleBrightnessResetEl.addEventListener('pointerdown', stopProp);
  titleBrightnessResetEl.addEventListener('click', handleBrightnessReset);
  gearBrightnessResetEl.addEventListener('click', handleBrightnessReset);

  const handleMeasureLumaClick = (e: MouseEvent): void => {
    e.stopPropagation();
    bumpGearAutoCloseTimer();
    const luma = callbacks.onMeasureLuminance?.() ?? null;
    const text =
      luma === null
        ? 'Luma: --'
        : `Luma ${luma.toFixed(2)} (target ${CONFIG.safeMode.targetLuma.toFixed(2)})`;
    titleLumaTextEl.textContent = text;
    gearLumaTextEl.textContent = text;
  };
  const handleRunBenchClick = (e: MouseEvent): void => {
    e.stopPropagation();
    setGearOpen(false);
    callbacks.onRunPresetBenchmark?.();
  };
  const handleBenchCloseClick = (e: MouseEvent): void => {
    e.stopPropagation();
    benchOverlayEl.classList.add('sr-hud-hidden');
  };

  titleLumaBtnEl.addEventListener('pointerdown', stopProp);
  titleLumaBtnEl.addEventListener('click', handleMeasureLumaClick);
  gearLumaBtnEl.addEventListener('click', handleMeasureLumaClick);
  titleBenchBtnEl.addEventListener('pointerdown', stopProp);
  titleBenchBtnEl.addEventListener('click', handleRunBenchClick);
  gearBenchBtnEl.addEventListener('click', handleRunBenchClick);
  benchCloseBtnEl.addEventListener('click', handleBenchCloseClick);

  const onGearCp = (e: MouseEvent): void => {
    e.stopPropagation();
    setGearOpen(false);
    callbacks.onGearCheckpointReset?.();
  };
  const onGearRestart = (e: MouseEvent): void => {
    e.stopPropagation();
    setGearOpen(false);
    callbacks.onGearRestartRace?.();
  };
  const onGearMute = (e: MouseEvent): void => {
    e.stopPropagation();
    bumpGearAutoCloseTimer();
    callbacks.onGearToggleMute?.();
  };
  const onGearSteer = (e: MouseEvent): void => {
    e.stopPropagation();
    bumpGearAutoCloseTimer();
    callbacks.onGearToggleSteerMode?.();
  };
  const onGearAuto = (e: MouseEvent): void => {
    e.stopPropagation();
    bumpGearAutoCloseTimer();
    callbacks.onGearToggleAutoThrottle?.();
  };
  const onGearFs = (e: MouseEvent): void => {
    e.stopPropagation();
    setGearOpen(false);
    callbacks.onGearToggleFullscreen?.();
  };
  const onGearMinimap = (e: MouseEvent): void => {
    e.stopPropagation();
    bumpGearAutoCloseTimer();
    const next = minimap.cycleSizeMode();
    gearMinimapBtnEl.textContent = `DENAH: ${getMinimapModeLabel(next)}`;
    callbacks.onCycleMinimap?.(next);
  };
  const onAttrToggle = (e: MouseEvent): void => {
    e.stopPropagation();
    bumpGearAutoCloseTimer();
    titleAttrBtnEl.blur();
    gearAttrBtnEl.blur();
    callbacks.onToggleAttractions?.();
  };
  const onGearMusicToggle = (e: MouseEvent): void => {
    e.stopPropagation();
    bumpGearAutoCloseTimer();
    gearMusicToggleBtnEl.blur();
    callbacks.onToggleMusic?.();
  };
  const onGearMusicVolumeInput = (e: Event): void => {
    e.stopPropagation();
    bumpGearAutoCloseTimer();
    const val = Number.parseFloat(gearMusicSliderEl.value);
    if (Number.isFinite(val)) {
      callbacks.onChangeMusicVolume?.(val);
    }
  };

  titleAttrBtnEl.addEventListener('pointerdown', stopProp);
  titleAttrBtnEl.addEventListener('click', onAttrToggle);
  gearWrapEl.addEventListener('pointerdown', handleGearWrapPointerDown);
  gearBtnEl.addEventListener('click', handleGearBtnClick);
  gearPopoverEl.addEventListener('pointerdown', handleGearPopoverInteract);
  gearPopoverEl.addEventListener('click', handleGearPopoverInteract);
  window.addEventListener('pointerdown', handleDocumentPointerDownForGear, true);
  gearCpBtnEl.addEventListener('click', onGearCp);
  gearRestartBtnEl.addEventListener('click', onGearRestart);
  gearMuteBtnEl.addEventListener('click', onGearMute);
  gearSteerBtnEl.addEventListener('click', onGearSteer);
  gearAutoBtnEl.addEventListener('click', onGearAuto);
  gearFsBtnEl.addEventListener('click', onGearFs);
  gearMinimapBtnEl.addEventListener('click', onGearMinimap);
  gearAttrBtnEl.addEventListener('click', onAttrToggle);
  gearMusicToggleBtnEl.addEventListener('click', onGearMusicToggle);
  gearMusicSliderEl.addEventListener('pointerdown', handleGearPopoverInteract);
  gearMusicSliderEl.addEventListener('input', onGearMusicVolumeInput);

  let versionTapTimestamps: number[] = [];
  const handleVersionPointerDown = (e: PointerEvent): void => {
    e.stopPropagation();
  };
  const handleVersionClick = (e: MouseEvent): void => {
    e.stopPropagation();
    const now = performance.now();
    const windowMs = CONFIG.safeMode.versionTapWindowMs;
    versionTapTimestamps = versionTapTimestamps.filter((t) => now - t <= windowMs);
    versionTapTimestamps.push(now);
    if (versionTapTimestamps.length >= CONFIG.safeMode.versionTapCount) {
      versionTapTimestamps = [];
      callbacks.onOpenReport?.();
    }
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
  titleVersionBtnEl.addEventListener('pointerdown', handleVersionPointerDown);
  titleVersionBtnEl.addEventListener('click', handleVersionClick);

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

  // Debug strip (PALET, FOG, BLOOM, EXP): hidden by default unless ?debug in URL, toggled with ` (Backquote)
  let debugStripEl: HTMLElement | null = null;
  let debugStripVisible =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('debug');

  const syncDebugStrip = (): void => {
    if (!debugStripEl) {
      for (let i = 0; i < container.children.length; i++) {
        const child = container.children[i];
        if (
          child instanceof HTMLElement &&
          child !== root &&
          child.textContent?.includes('PALET [')
        ) {
          debugStripEl = child;
          break;
        }
      }
    }
    if (!debugStripEl) {
      return;
    }
    debugStripEl.classList.add('sr-debug-strip');
    debugStripEl.style.display = debugStripVisible ? 'block' : 'none';
    debugStripEl.style.opacity = String(cfg.debugStripOpacity);
    debugStripEl.style.fontSize = `${cfg.debugStripFontSizePx}px`;
    debugStripEl.style.padding = '3px 8px';
    debugStripEl.style.bottom = '8px';
  };
  syncDebugStrip();

  const handle: HudHandle = {
    root,
    container,
    topBarEl: root.querySelector('.sr-hud-top') as HTMLElement,
    posSlotEl: root.querySelector('[data-slot="pos"]') as HTMLElement,
    standingsPanelEl: root.querySelector('.sr-standings-panel') as HTMLElement,
    progressWrapEl: root.querySelector('.sr-progress-wrap') as HTMLElement,
    progressFillEl: root.querySelector('.sr-progress-fill') as HTMLElement,
    progressMarkersEl: root.querySelector('.sr-progress-markers') as HTMLElement,
    progressMarkerEls: [],
    bottomLeftEl,
    hintFullEl,
    hintBadgeEl,
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
    toastLaneEl,
    toastQueue,
    loadingOverlayEl: root.querySelector('.sr-loading-overlay') as HTMLElement,
    loadingPillEl: root.querySelector('.sr-loading-pill') as HTMLElement,
    contextLostOverlayEl: root.querySelector('.sr-contextlost-overlay') as HTMLElement,
    contextLostCardEl: root.querySelector('.sr-contextlost-card') as HTMLButtonElement,
    debugMetricsEl: root.querySelector('.sr-debug-metrics') as HTMLElement,
    titleScreenEl: root.querySelector('.sr-title-screen') as HTMLElement,
    titleCourseSelectSlotEl: root.querySelector('.sr-arena-select') as HTMLElement,
    titleDiffRowEl,
    titleDiffBtns,
    titleAttrRowEl,
    titleAttrBtnEl,
    titleTargetGoldEl: root.querySelector('.sr-target-gold') as HTMLElement,
    titleTargetSilverEl: root.querySelector('.sr-target-silver') as HTMLElement,
    titleTargetBronzeEl: root.querySelector('.sr-target-bronze') as HTMLElement,
    titleTopListEl: root.querySelector('.sr-title-top-list') as HTMLElement,
    titleStartBtnEl,
    titleClearBtnEl,
    titleClearRingFillEl,
    titleClearTextEl,
    titleGfxBarEl,
    titleGfxStatusEl,
    titlePresetBtns,
    titleBrightnessInputEl,
    titleBrightnessValEl,
    titleBrightnessResetEl,
    titleDebugBarEl,
    titleLumaBtnEl,
    titleBenchBtnEl,
    titleLumaTextEl,
    titleVersionBtnEl,
    gearWrapEl,
    gearBtnEl,
    gearPopoverEl,
    gearRaceActionsEl,
    gearCpBtnEl,
    gearRestartBtnEl,
    gearMuteBtnEl,
    gearMuteTextEl,
    gearSteerBtnEl,
    gearAutoBtnEl,
    gearFsBtnEl,
    gearMinimapBtnEl,
    gearAttrBtnEl,
    gearMusicToggleBtnEl,
    gearMusicSliderEl,
    gearMusicValEl,
    gearPresetBtns,
    gearBrightnessInputEl,
    gearBrightnessValEl,
    gearBrightnessResetEl,
    gearDebugRowEl,
    gearLumaBtnEl,
    gearBenchBtnEl,
    gearLumaTextEl,
    gearAutoCloseTimerId: null,
    gearOpen: false,
    minimap,
    benchOverlayEl,
    benchBodyEl,
    benchCloseBtnEl,
    safeBannerEl,
    safeBannerTimerId: null,
    countdownEl: root.querySelector('.sr-countdown-overlay') as HTMLElement,
    finishScreenEl: root.querySelector('.sr-finish-screen') as HTMLElement,
    finishCardEl: root.querySelector('.sr-finish-card') as HTMLElement,
    finishCourseNameEl: root.querySelector('.sr-finish-course-name') as HTMLElement,
    finishPosBannerEl: root.querySelector('.sr-finish-pos-banner') as HTMLElement,
    finishBadgeEl: root.querySelector('.sr-finish-newbest') as HTMLElement,
    finishMedalIconEl: root.querySelector('.sr-finish-medal-icon') as HTMLElement,
    finishMedalLabelEl: root.querySelector('.sr-finish-medal-label') as HTMLElement,
    finishTimeEl: root.querySelector('.sr-finish-final-time') as HTMLElement,
    finishDeltaEl: root.querySelector('.sr-finish-delta') as HTMLElement,
    finishStatsGridEl: root.querySelector('.sr-finish-stats-grid') as HTMLElement,
    finishStandingsBoxEl: root.querySelector('.sr-finish-standings-box') as HTMLElement,
    finishStandingsEl: root.querySelector('.sr-finish-standings') as HTMLElement,
    finishDiffRowEl,
    finishDiffBtns,
    finishLapsBoxEl: root.querySelector('.sr-finish-laps-box') as HTMLElement,
    finishLapsEl: root.querySelector('.sr-finish-laps') as HTMLElement,
    finishSplitsEl: root.querySelector('.sr-finish-splits') as HTMLElement,
    finishTopListEl: root.querySelector('.sr-finish-top-list') as HTMLElement,
    finishRetryBtnEl,
    finishMenuBtnEl,
    finishCopyBtnEl,
    speedLinesEl,
    audioBtnEl: root.querySelector('.sr-audio-btn') as HTMLButtonElement,
    countdownHideTimerId: null,
    copyResetTimerId: null,
    clearHoldRafId: 0,
    clearHoldCleanup: cancelClearHold,
    disposeEvents: () => {},
    arcTotalLen: arcLen,
    lastPhase: null,
    lastResultReady: null,
    lastIntroActive: null,
    lastSpeedInt: 0,
    lastSpeedQuantized: 0,
    lastBoostQuantized: 0,
    lastBoostActive: false,
    lastSpeedLinesOpacity: 0,
    lastProgressQuantized: 0,
    lastCpPassed: 0,
    lastTimeText: '00:00.00',
    lastTimerLapText: '',
    lastBestText: '',
    lastBestLapText: '',
    lastBestLapSeconds: null,
    lastLapText: '',
    lastShowLap: null,
    lastPosText: '',
    lastShowPos: null,
    lastStandingsKey: '',
    lastCpText: 'CP 0 / 0',
    lastWrongWay: null,
    lastMuted: null,
    lastTouchActive: null,
    lastCompact: null,
    lastPortrait: null,
    lastTimeSeconds: 0,
    lastToastTickMs: performance.now(),
    hintManualExpanded: null,
    lastHintCollapsed: null,
    lastDebugMetricsSampleMs: -Infinity,
    lastDebugMetricsKey: '',
  };

  const syncHintCollapseClass = (): void => {
    if (!CONFIG.hud.showControlsHint) {
      return;
    }
    const autoExpanded =
      handle.lastPhase === 'COUNTDOWN' ||
      (handle.lastPhase === 'RACING' &&
        handle.lastTimeSeconds < CONFIG.hud.controlsHintFullSeconds);
    const expanded =
      handle.hintManualExpanded !== null ? handle.hintManualExpanded : autoExpanded;
    const collapsed = !expanded;
    if (collapsed !== handle.lastHintCollapsed) {
      handle.lastHintCollapsed = collapsed;
      bottomLeftEl.classList.toggle('sr-hint--collapsed', collapsed);
    }
  };

  const toggleControlsHint = (): void => {
    if (
      !CONFIG.hud.showControlsHint ||
      handle.lastTouchActive ||
      handle.lastPhase === 'TITLE' ||
      handle.lastPhase === 'FINISH'
    ) {
      return;
    }
    const currentlyCollapsed = handle.lastHintCollapsed ?? false;
    handle.hintManualExpanded = currentlyCollapsed;
    syncHintCollapseClass();
  };

  const handleHintBadgeClick = (): void => {
    hintBadgeEl.blur();
    toggleControlsHint();
  };
  hintBadgeEl.addEventListener('click', handleHintBadgeClick);

  const handleHudKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    const target = event.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    ) {
      return;
    }
    if (event.code === 'KeyH') {
      toggleControlsHint();
    } else if (event.code === 'Backquote') {
      debugStripVisible = !debugStripVisible;
      syncDebugStrip();
    }
  };
  window.addEventListener('keydown', handleHudKeyDown);

  const handleContextLostReload = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
    window.location.reload();
  };
  handle.contextLostOverlayEl.addEventListener('click', handleContextLostReload);
  handle.contextLostCardEl.addEventListener('click', handleContextLostReload);

  handle.disposeEvents = () => {
    cancelClearHold();
    if (copyResetTimerId !== null) {
      window.clearTimeout(copyResetTimerId);
      copyResetTimerId = null;
    }
    if (handle.safeBannerTimerId !== null) {
      window.clearTimeout(handle.safeBannerTimerId);
      handle.safeBannerTimerId = null;
    }
    if (handle.gearAutoCloseTimerId !== null) {
      window.clearTimeout(handle.gearAutoCloseTimerId);
      handle.gearAutoCloseTimerId = null;
    }
    window.removeEventListener('keydown', handleHudKeyDown);
    window.removeEventListener('pointerdown', handleDocumentPointerDownForGear, true);
    hintBadgeEl.removeEventListener('click', handleHintBadgeClick);
    handle.contextLostOverlayEl.removeEventListener('click', handleContextLostReload);
    handle.contextLostCardEl.removeEventListener('click', handleContextLostReload);
    titleStartBtnEl.removeEventListener('click', handleStartClick);
    finishRetryBtnEl.removeEventListener('click', handleRetryClick);
    finishMenuBtnEl.removeEventListener('click', handleMenuClick);
    finishCopyBtnEl.removeEventListener('click', handleCopyClick);
    titleVersionBtnEl.removeEventListener('pointerdown', handleVersionPointerDown);
    titleVersionBtnEl.removeEventListener('click', handleVersionClick);
    titleClearBtnEl.removeEventListener('pointerdown', onClearDown);
    titleClearBtnEl.removeEventListener('pointerup', onClearEnd);
    titleClearBtnEl.removeEventListener('pointercancel', onClearEnd);
    titleClearBtnEl.removeEventListener('lostpointercapture', onClearEnd);

    for (const key of presetKeys) {
      titlePresetBtns[key].removeEventListener('pointerdown', stopProp);
    }
    for (const entry of presetClickHandlers) {
      entry.el.removeEventListener('click', entry.fn);
    }
    for (const dk of diffKeys) {
      titleDiffBtns[dk].removeEventListener('pointerdown', stopProp);
      finishDiffBtns[dk].removeEventListener('pointerdown', stopProp);
    }
    for (const entry of diffClickHandlers) {
      entry.el.removeEventListener('click', entry.fn);
    }

    titleBrightnessInputEl.removeEventListener('pointerdown', stopProp);
    titleBrightnessInputEl.removeEventListener('input', onTitleBrightnessInput);
    gearBrightnessInputEl.removeEventListener('pointerdown', handleGearPopoverInteract);
    gearBrightnessInputEl.removeEventListener('input', onGearBrightnessInput);
    titleBrightnessResetEl.removeEventListener('pointerdown', stopProp);
    titleBrightnessResetEl.removeEventListener('click', handleBrightnessReset);
    gearBrightnessResetEl.removeEventListener('click', handleBrightnessReset);

    titleLumaBtnEl.removeEventListener('pointerdown', stopProp);
    titleLumaBtnEl.removeEventListener('click', handleMeasureLumaClick);
    gearLumaBtnEl.removeEventListener('click', handleMeasureLumaClick);
    titleBenchBtnEl.removeEventListener('pointerdown', stopProp);
    titleBenchBtnEl.removeEventListener('click', handleRunBenchClick);
    gearBenchBtnEl.removeEventListener('click', handleRunBenchClick);
    benchCloseBtnEl.removeEventListener('click', handleBenchCloseClick);

    gearWrapEl.removeEventListener('pointerdown', handleGearWrapPointerDown);
    gearBtnEl.removeEventListener('click', handleGearBtnClick);
    gearPopoverEl.removeEventListener('pointerdown', handleGearPopoverInteract);
    gearPopoverEl.removeEventListener('click', handleGearPopoverInteract);
    gearCpBtnEl.removeEventListener('click', onGearCp);
    gearRestartBtnEl.removeEventListener('click', onGearRestart);
    gearMuteBtnEl.removeEventListener('click', onGearMute);
    gearSteerBtnEl.removeEventListener('click', onGearSteer);
    gearAutoBtnEl.removeEventListener('click', onGearAuto);
    gearFsBtnEl.removeEventListener('click', onGearFs);
    gearMinimapBtnEl.removeEventListener('click', onGearMinimap);
    gearAttrBtnEl.removeEventListener('click', onAttrToggle);
    gearMusicToggleBtnEl.removeEventListener('click', onGearMusicToggle);
    gearMusicSliderEl.removeEventListener('pointerdown', handleGearPopoverInteract);
    gearMusicSliderEl.removeEventListener('input', onGearMusicVolumeInput);
    titleAttrBtnEl.removeEventListener('pointerdown', stopProp);
    titleAttrBtnEl.removeEventListener('click', onAttrToggle);
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

  const showDifficulty = (data.racers ?? 1) > 1;
  hud.titleDiffRowEl.classList.toggle('sr-hud-hidden', !showDifficulty);
  if (showDifficulty) {
    const activeDiff = data.aiDifficulty ?? CONFIG.ai.defaultDifficulty;
    const diffKeys: AiDifficulty[] = ['mudah', 'sedang', 'sulit'];
    for (const dk of diffKeys) {
      hud.titleDiffBtns[dk].classList.toggle('sr-preset-btn--active', dk === activeDiff);
    }
  }

  const showAttrRow = data.courseId === 'fantasy-land';
  hud.titleAttrRowEl.classList.toggle('sr-hud-hidden', !showAttrRow);
  if (showAttrRow) {
    const enabled = data.attractionsEnabled ?? true;
    hud.titleAttrBtnEl.textContent = enabled ? 'Atraksi: Nyala' : 'Atraksi: Mati';
    hud.titleAttrBtnEl.classList.toggle('sr-preset-btn--active', enabled);
  }

  renderTopRecordsList(hud.titleTopListEl, data.records, null);

  const hasRecords = data.records.best !== null || data.records.top.length > 0;
  hud.titleClearBtnEl.disabled = !hasRecords;
  if (!hasRecords && hud.titleClearTextEl.textContent !== 'Rekor Dihapus!') {
    hud.titleClearTextEl.textContent = 'Belum ada rekor';
  } else if (hasRecords && hud.titleClearTextEl.textContent === 'Belum ada rekor') {
    hud.titleClearTextEl.textContent = 'Hapus Rekor (Tahan)';
  }
}

export function showLoadingOverlay(
  hud: HudHandle,
  message = 'Memuat arena...',
  percent?: number,
): void {
  const pct =
    typeof percent === 'number' && Number.isFinite(percent)
      ? ` ${Math.min(100, Math.max(0, Math.round(percent)))}%`
      : '';
  hud.loadingPillEl.textContent = `${message}${pct}`;
  hud.loadingOverlayEl.classList.remove('sr-hud-hidden');
}

export function hideLoadingOverlay(hud: HudHandle): void {
  hud.loadingOverlayEl.classList.add('sr-hud-hidden');
}

export function setStartButtonLoading(
  hud: HudHandle,
  loading: boolean,
  queued = false,
): void {
  hud.titleStartBtnEl.setAttribute('aria-disabled', loading ? 'true' : 'false');
  hud.titleStartBtnEl.classList.toggle('sr-btn--loading', loading);
  if (loading && queued) {
    hud.titleStartBtnEl.textContent = 'Menyiapkan...';
  } else {
    hud.titleStartBtnEl.textContent = 'Mulai Balapan';
  }
}

export function showContextLostOverlay(hud: HudHandle): void {
  hud.contextLostOverlayEl.classList.remove('sr-hud-hidden');
}

export function updateDebugMetricsOverlay(
  hud: HudHandle,
  metrics: DebugMetricsSnapshot,
  nowMs: number,
): void {
  if (!isDebugUrlEnabled()) {
    return;
  }
  hud.debugMetricsEl.classList.remove('sr-hud-hidden');
  const musicKey = metrics.music
    ? `${metrics.music.trackLabel}:${metrics.music.volume.toFixed(2)}:${metrics.music.status}`
    : '';
  const stateKey = `${metrics.status}:${metrics.courseId}:${metrics.routeId}:${metrics.quality}:${metrics.carCount}:${musicKey}`;
  const elapsedMs = nowMs - hud.lastDebugMetricsSampleMs;
  if (elapsedMs < CONFIG.debugOverlay.sampleIntervalMs && stateKey === hud.lastDebugMetricsKey) {
    return;
  }
  hud.lastDebugMetricsSampleMs = nowMs;
  hud.lastDebugMetricsKey = stateKey;

  const cdPart =
    metrics.status === 'COUNTDOWN'
      ? `CD ${metrics.countdownSec} (${Math.round(metrics.countdownWallMs)}ms) `
      : '';
  const carSummary =
    metrics.cars && metrics.cars.length > 0
      ? '\n' +
        metrics.cars
          .map(
            (c) =>
              `#${c.index} ${c.label} ${Math.round(c.speedKmh)}km/h ${c.mode} s=${c.s.toFixed(1)} [${c.routeId}]${c.crashed ? ' CRASH' : ''}`,
          )
          .join('\n')
      : '';
  const aiPart =
    typeof metrics.aiStepMs === 'number' && metrics.carCount > 1
      ? ` | AI ${metrics.aiStepMs.toFixed(2)}ms`
      : '';
  const musicPart = metrics.music
    ? `\nMUSIC: ${metrics.music.trackLabel} | VOL ${metrics.music.volume.toFixed(2)} | ${metrics.music.status.toUpperCase()}`
    : '';
  hud.debugMetricsEl.textContent =
    `${Math.round(metrics.fps)} FPS | ${metrics.avgFrameMs.toFixed(1)} ms | ${metrics.quality.toUpperCase()}\n` +
    `DC ${metrics.drawCalls} | TRI ${metrics.triangles} | GEO ${metrics.geometries} TEX ${metrics.textures}\n` +
    `${metrics.status} ${cdPart}| ${metrics.courseId} (${metrics.routeId}) | CARS ${metrics.carCount}${aiPart}${musicPart}${carSummary}`;
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
  if (airtimeSeconds < CONFIG.hud.airtimeMinSeconds) {
    return;
  }
  hud.toastQueue.push({
    kind: 'airtime',
    text: `UDARA ${airtimeSeconds.toFixed(1)} s`,
    priority: CONFIG.hud.toastPriorities.airtime,
    durationMs: CONFIG.hud.airtimePopupDurationMs,
  });
}

export function hideAirtimePopup(hud: HudHandle): void {
  hud.toastQueue.clearKind('airtime');
}

export function showSplitPopup(hud: HudHandle, notice: CheckpointSplitNotice): void {
  if (notice.delta === null) {
    return;
  }
  hud.toastQueue.push({
    kind: 'split',
    text: formatDelta(notice.delta),
    tone: notice.delta <= 0 ? 'fast' : 'slow',
    priority: CONFIG.hud.toastPriorities.split,
    durationMs: CONFIG.hud.splitPopupDurationMs,
  });
}

export function hideSplitPopup(hud: HudHandle): void {
  hud.toastQueue.clearKind('split');
}

export function showLapPopup(hud: HudHandle, notice: LapPopupNotice): void {
  if (notice.lap >= notice.totalLaps) {
    return;
  }
  const prevBestLap = hud.lastBestLapSeconds;
  const delta = prevBestLap !== null ? notice.lapTime - prevBestLap : null;

  hud.toastQueue.push({
    kind: 'lap',
    text: `LAP ${notice.lap} SELESAI`,
    subtext: formatRaceTime(notice.lapTime),
    deltaText: delta !== null ? formatDelta(delta) : undefined,
    tone: delta !== null ? (delta <= 0 ? 'fast' : 'slow') : 'neutral',
    priority: CONFIG.hud.toastPriorities.lap,
    durationMs: CONFIG.hud.lapToastDurationMs,
  });
}

export function hideLapPopup(hud: HudHandle): void {
  hud.toastQueue.clearKind('lap');
}

export function showLastLapBanner(hud: HudHandle): void {
  hud.toastQueue.push({
    kind: 'lastLap',
    text: 'LAP TERAKHIR!',
    priority: CONFIG.hud.toastPriorities.lastLap,
    durationMs: CONFIG.hud.lastLapToastDurationMs,
  });
}

export function showZoneToast(hud: HudHandle, title: string): void {
  hud.toastQueue.push({
    kind: 'zone',
    text: title,
    priority: CONFIG.hud.toastPriorities.zone,
    durationMs: CONFIG.hud.zoneToastDurationMs,
  });
}

export function hideZoneToast(hud: HudHandle): void {
  hud.toastQueue.clearKind('zone');
}

export function showShortcutToast(hud: HudHandle, title: string): void {
  hud.toastQueue.push({
    kind: 'zone',
    text: title,
    priority: CONFIG.hud.toastPriorities.zone,
    durationMs: CONFIG.hud.zoneToastDurationMs,
  });
}

export function showOvertakeToast(
  hud: HudHandle,
  kind: 'overtake' | 'overtaken',
  newPosition: number,
  rivalName: string,
): void {
  hud.toastQueue.push({
    kind: 'overtake',
    text:
      kind === 'overtake'
        ? `Naik ke P${newPosition}! (${rivalName})`
        : `Turun ke P${newPosition} (${rivalName})`,
    tone: kind === 'overtake' ? 'fast' : 'slow',
    priority: CONFIG.hud.toastPriorities.overtake,
    durationMs: CONFIG.hud.overtakePopupDurationMs,
  });
}

export function showHazardToast(hud: HudHandle, text = 'TERSENGGOL'): void {
  hud.toastQueue.push({
    kind: 'hazard',
    text,
    priority: CONFIG.hud.toastPriorities.hazard,
    durationMs: CONFIG.hud.hazardToastDurationMs,
  });
}

export function showRingBoostToast(hud: HudHandle, text = '+BOOST'): void {
  hud.toastQueue.push({
    kind: 'ring',
    text,
    priority: CONFIG.hud.toastPriorities.ring,
    durationMs: CONFIG.hud.ringToastDurationMs,
  });
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

export function syncFinishDifficulty(hud: HudHandle, difficulty: AiDifficulty): void {
  syncResultDifficultyUi(hud, difficulty);
}

export function showFinishScreen(hud: HudHandle, data: FinishScreenData): void {
  hud.toastQueue.clear();
  showResultScreen(hud, data);
}

export function hideFinishScreen(hud: HudHandle): void {
  hideResultScreen(hud);
}

export function hideModalScreens(hud: HudHandle): void {
  hud.root.classList.remove('sr-hud--modal');
  hud.titleScreenEl.classList.add('sr-hud-hidden');
  hud.titleScreenEl.style.pointerEvents = 'none';
  hideResultScreen(hud);
  hud.clearHoldCleanup();
  hud.toastQueue.clear();
}

const PRESET_LABELS: Record<GraphicsPreset, string> = {
  hemat: 'Hemat',
  seimbang: 'Seimbang',
  penuh: 'Penuh',
};

export function setGraphicsUiState(hud: HudHandle, state: GraphicsUiState): void {
  const keys: GraphicsPreset[] = ['hemat', 'seimbang', 'penuh'];
  const lockRacePresets = Boolean(state.raceActive);
  for (const k of keys) {
    const active = state.preset === k;
    hud.titlePresetBtns[k].classList.toggle('sr-preset-btn--active', active);
    hud.gearPresetBtns[k].classList.toggle('sr-preset-btn--active', active);
    hud.gearPresetBtns[k].disabled = lockRacePresets;
    hud.gearPresetBtns[k].title = lockRacePresets ? 'Ubah preset di layar judul' : '';
  }
  hud.gearBenchBtnEl.disabled = lockRacePresets;

  hud.titleGfxStatusEl.textContent = state.benchmarkRunning
    ? `Menguji preset (${PRESET_LABELS[state.preset]})...`
    : state.probeActive
      ? `Grafis: ${PRESET_LABELS[state.preset]} (uji 3 dtk)`
      : `Grafis: ${PRESET_LABELS[state.preset]}`;

  const bStr = state.brightness.toFixed(2);
  hud.titleBrightnessInputEl.value = bStr;
  hud.gearBrightnessInputEl.value = bStr;
  hud.titleBrightnessValEl.textContent = bStr;
  hud.gearBrightnessValEl.textContent = bStr;

  if (state.measuredLuma !== undefined) {
    const lumaText =
      state.measuredLuma === null
        ? ''
        : `Luma ${state.measuredLuma.toFixed(2)} (target ${CONFIG.safeMode.targetLuma.toFixed(2)})`;
    hud.titleLumaTextEl.textContent = lumaText;
    hud.gearLumaTextEl.textContent = lumaText;
  }

  if (state.touchPrefs) {
    const p = state.touchPrefs;
    hud.gearSteerBtnEl.textContent = p.steerMode === 'stick' ? 'STIK' : 'TOMBOL';
    hud.gearAutoBtnEl.classList.toggle('sr-gear-action-btn--on', p.autoThrottle);
    hud.gearMuteBtnEl.classList.toggle('sr-gear-action-btn--muted', p.muted);
    hud.gearMuteTextEl.textContent = p.muted ? 'BISU' : 'SUARA';
    hud.gearFsBtnEl.classList.toggle('sr-hud-hidden', !p.fullscreenSupported);
    hud.gearFsBtnEl.classList.toggle('sr-gear-action-btn--on', p.fullscreen);
  }

  if (typeof state.musicEnabled === 'boolean') {
    hud.gearMusicToggleBtnEl.textContent = state.musicEnabled ? 'MUSIK: NYALA' : 'MUSIK: MATI';
    hud.gearMusicToggleBtnEl.classList.toggle('sr-gear-action-btn--on', state.musicEnabled);
    hud.gearMusicToggleBtnEl.classList.toggle('sr-gear-action-btn--muted', !state.musicEnabled);
  }
  if (typeof state.musicVolume === 'number' && Number.isFinite(state.musicVolume)) {
    const mv = Math.max(0, Math.min(1, state.musicVolume));
    const mvStr = mv.toFixed(2);
    hud.gearMusicSliderEl.value = mvStr;
    hud.gearMusicValEl.textContent = mvStr;
  }

  const mmMode = state.minimapMode ?? hud.minimap.getSizeMode();
  hud.gearMinimapBtnEl.textContent = `DENAH: ${getMinimapModeLabel(mmMode)}`;
  hud.gearMinimapBtnEl.classList.toggle('sr-gear-action-btn--on', mmMode !== 'off');

  const showAttr = Boolean(state.attractionsAvailable);
  hud.gearAttrBtnEl.classList.toggle('sr-hud-hidden', !showAttr);
  if (showAttr) {
    const attrOn = state.attractionsEnabled ?? true;
    hud.gearAttrBtnEl.textContent = attrOn ? 'ATRAKSI: NYALA' : 'ATRAKSI: MATI';
    hud.gearAttrBtnEl.classList.toggle('sr-gear-action-btn--on', attrOn);
    hud.titleAttrBtnEl.textContent = attrOn ? 'Atraksi: Nyala' : 'Atraksi: Mati';
    hud.titleAttrBtnEl.classList.toggle('sr-preset-btn--active', attrOn);
  }
}

export function showBenchmarkResults(hud: HudHandle, report: PresetBenchmarkReport): void {
  hud.benchBodyEl.textContent = '';

  const meta = document.createElement('div');
  meta.className = 'sr-bench-meta';
  const lumaStr =
    report.measuredLuma === null
      ? '--'
      : `${report.measuredLuma.toFixed(2)} / ${report.targetLuma.toFixed(2)}`;
  meta.textContent =
    `Build v${getBuildId()} | Aktif: ${PRESET_LABELS[report.activePreset]} | ` +
    `Saran: ${PRESET_LABELS[report.recommendedPreset]} | Luma: ${lumaStr}`;
  hud.benchBodyEl.appendChild(meta);

  const list = document.createElement('div');
  list.className = 'sr-bench-rows';
  for (const entry of report.entries) {
    const row = document.createElement('div');
    row.className =
      entry.preset === report.activePreset
        ? 'sr-bench-row sr-bench-row--active'
        : 'sr-bench-row';

    const nameEl = document.createElement('span');
    nameEl.className = 'sr-bench-name';
    nameEl.textContent = PRESET_LABELS[entry.preset];
    row.appendChild(nameEl);

    const fpsEl = document.createElement('span');
    fpsEl.textContent = `${Math.round(entry.avgFps)} FPS (${entry.avgFrameMs.toFixed(1)} ms)`;
    row.appendChild(fpsEl);

    const lumaEl = document.createElement('span');
    lumaEl.textContent = entry.luma === null ? 'Luma --' : `Luma ${entry.luma.toFixed(2)}`;
    row.appendChild(lumaEl);

    list.appendChild(row);
  }
  hud.benchBodyEl.appendChild(list);
  hud.benchOverlayEl.classList.remove('sr-hud-hidden');
}

export function hideBenchmarkResults(hud: HudHandle): void {
  hud.benchOverlayEl.classList.add('sr-hud-hidden');
}

export function showSafeModeNotice(
  hud: HudHandle,
  message = 'Mode aman aktif',
  durationMs = CONFIG.safeMode.statusBannerMs,
): void {
  if (hud.safeBannerTimerId !== null) {
    window.clearTimeout(hud.safeBannerTimerId);
    hud.safeBannerTimerId = null;
  }
  hud.safeBannerEl.textContent = message;
  hud.safeBannerEl.classList.remove('sr-hud-hidden');
  if (durationMs > 0) {
    hud.safeBannerTimerId = window.setTimeout(() => {
      hud.safeBannerEl.classList.add('sr-hud-hidden');
      hud.safeBannerTimerId = null;
    }, durationMs);
  }
}

export function updateHud(hud: HudHandle, viewModel: HudViewModel): void {
  const nowMs = performance.now();
  const dt = Math.min(0.1, Math.max(0, (nowMs - hud.lastToastTickMs) / 1000));
  hud.lastToastTickMs = nowMs;

  const vw = window.visualViewport?.width ?? window.innerWidth;
  const vh = window.visualViewport?.height ?? window.innerHeight;
  const isCompact = viewModel.touchActive || vw < CONFIG.hud.compactBreakpointPx;
  const isPortrait = vh > vw;

  if (viewModel.touchActive !== hud.lastTouchActive) {
    hud.lastTouchActive = viewModel.touchActive;
    hud.root.classList.toggle('hud--touch', viewModel.touchActive);
  }
  if (isCompact !== hud.lastCompact) {
    hud.lastCompact = isCompact;
    hud.root.classList.toggle('hud--compact', isCompact);
  }
  if (isPortrait !== hud.lastPortrait) {
    hud.lastPortrait = isPortrait;
    hud.root.classList.toggle('hud--portrait', isPortrait);
  }

  if (viewModel.muted !== hud.lastMuted) {
    hud.lastMuted = viewModel.muted;
    hud.audioBtnEl.classList.toggle('sr-audio-muted', viewModel.muted);
    hud.audioBtnEl.setAttribute(
      'aria-label',
      viewModel.muted ? 'Suara bisu (M)' : 'Suara aktif (M)',
    );
  }

  const isIntro = Boolean(viewModel.introActive);
  if (
    viewModel.phase !== hud.lastPhase ||
    viewModel.resultReady !== hud.lastResultReady ||
    isIntro !== hud.lastIntroActive
  ) {
    const prevPhase = hud.lastPhase;
    hud.lastPhase = viewModel.phase;
    hud.lastResultReady = viewModel.resultReady;
    hud.lastIntroActive = isIntro;
    const isTitle = !isIntro && viewModel.phase === 'TITLE';
    const isFinish = !isIntro && viewModel.phase === 'FINISH';
    const showResults = isFinish && viewModel.resultReady;

    if (!isIntro && viewModel.phase === 'COUNTDOWN' && prevPhase !== 'COUNTDOWN') {
      hud.hintManualExpanded = null;
      hud.lastHintCollapsed = null;
    }

    hud.root.classList.toggle('sr-hud--modal', isTitle || showResults);
    hud.titleScreenEl.classList.toggle('sr-hud-hidden', !isTitle);
    hud.titleScreenEl.style.pointerEvents = isTitle ? '' : 'none';
    hud.finishScreenEl.classList.toggle('sr-hud-hidden', !showResults);
    hud.finishScreenEl.style.pointerEvents = showResults ? '' : 'none';
    hud.topBarEl.classList.toggle('sr-hud-hidden', isTitle || showResults || isIntro);
    hud.progressWrapEl.classList.toggle('sr-hud-hidden', isTitle || isFinish || isIntro);
    hud.bottomRightEl.classList.toggle('sr-hud-hidden', isTitle || isFinish || isIntro);
    hud.minimap.setVisible(!isTitle && !isFinish && !isIntro);
    if (isTitle || isFinish || isIntro) {
      hud.standingsPanelEl.classList.add('sr-hud-hidden');
    }

    const isDriving =
      !isIntro && (viewModel.phase === 'COUNTDOWN' || viewModel.phase === 'RACING');
    hud.gearWrapEl.classList.toggle('sr-hud-hidden', showResults || isIntro);
    hud.gearRaceActionsEl.classList.toggle(
      'sr-hud-hidden',
      !(viewModel.touchActive && isDriving),
    );
    hud.gearCpBtnEl.classList.toggle('sr-hud-hidden', isIntro || viewModel.phase !== 'RACING');
    if (showResults || isIntro) {
      hud.gearPopoverEl.classList.add('sr-hud-hidden');
      hud.gearOpen = false;
      if (hud.gearAutoCloseTimerId !== null) {
        window.clearTimeout(hud.gearAutoCloseTimerId);
        hud.gearAutoCloseTimerId = null;
      }
    }

    if (CONFIG.hud.showControlsHint) {
      hud.bottomLeftEl.classList.toggle('sr-hud-hidden', isTitle || isFinish || isIntro);
    }

    if (isTitle || isFinish || isIntro) {
      hideCountdownOverlay(hud);
    }
    if (isTitle || showResults || isIntro) {
      hud.toastQueue.clear();
    }
    if (!isTitle) {
      hud.clearHoldCleanup();
    }
  }

  const showWrongWay = !isIntro && viewModel.phase === 'RACING' && viewModel.wrongWay;
  if (showWrongWay !== hud.lastWrongWay) {
    hud.lastWrongWay = showWrongWay;
    if (showWrongWay) {
      hud.toastQueue.push({
        kind: 'wrongWay',
        text: 'ARAH SALAH',
        priority: CONFIG.hud.toastPriorities.wrongWay,
        durationMs: Number.POSITIVE_INFINITY,
        sticky: true,
      });
    } else {
      hud.toastQueue.clearKind('wrongWay');
    }
  }

  hud.toastQueue.update(dt);

  if (viewModel.phase === 'TITLE' || isIntro) {
    if (hud.lastSpeedLinesOpacity !== 0) {
      hud.lastSpeedLinesOpacity = 0;
      hud.speedLinesEl.classList.remove('sr-speed-lines--active');
      hud.speedLinesEl.style.setProperty('--sr-speed-lines-opacity', '0');
    }
    return;
  }

  hud.lastTimeSeconds = viewModel.timeSeconds;
  if (CONFIG.hud.showControlsHint && !viewModel.touchActive) {
    const autoExpanded =
      viewModel.phase === 'COUNTDOWN' ||
      (viewModel.phase === 'RACING' &&
        viewModel.timeSeconds < CONFIG.hud.controlsHintFullSeconds);
    const expanded =
      hud.hintManualExpanded !== null ? hud.hintManualExpanded : autoExpanded;
    const collapsed = !expanded;
    if (collapsed !== hud.lastHintCollapsed) {
      hud.lastHintCollapsed = collapsed;
      hud.bottomLeftEl.classList.toggle('sr-hint--collapsed', collapsed);
    }
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
  const boostSurging = viewModel.phase === 'RACING' && boostActive;
  const speedLinesOpacity = boostSurging
    ? Math.min(1, Math.max(0.35, boostClamped)) * CONFIG.polish.speedLines.maxOpacity
    : 0;
  const speedLinesQuantized = Math.round(speedLinesOpacity * 50) / 50;
  if (speedLinesQuantized !== hud.lastSpeedLinesOpacity) {
    hud.lastSpeedLinesOpacity = speedLinesQuantized;
    hud.speedLinesEl.classList.toggle('sr-speed-lines--active', speedLinesQuantized > 0);
    hud.speedLinesEl.style.setProperty('--sr-speed-lines-opacity', speedLinesQuantized.toFixed(2));
  }

  const totalRacers = viewModel.totalRacers ?? 1;
  const showPos = totalRacers > 1;
  if (showPos !== hud.lastShowPos) {
    hud.lastShowPos = showPos;
    hud.posSlotEl.classList.toggle('sr-hud-hidden', !showPos);
  }
  if (showPos) {
    const posNum = Math.max(1, Math.min(totalRacers, viewModel.position ?? 1));
    const posText = `P${posNum} / ${totalRacers}`;
    if (posText !== hud.lastPosText) {
      hud.lastPosText = posText;
      hud.posSlotEl.textContent = posText;
    }
  }

  const standings = viewModel.standings;
  const showMiniBoard =
    showPos &&
    !isCompact &&
    !viewModel.touchActive &&
    (viewModel.phase === 'COUNTDOWN' || viewModel.phase === 'RACING') &&
    Boolean(standings && standings.length > 1);
  hud.standingsPanelEl.classList.toggle('sr-hud-hidden', !showMiniBoard);
  if (showMiniBoard && standings) {
    let key = '';
    for (let i = 0; i < standings.length; i++) {
      const sEntry = standings[i];
      const gapRounded = sEntry.rank === 1 ? '0' : sEntry.gapSeconds.toFixed(1);
      key += `${sEntry.carIndex}:${gapRounded}|`;
    }
    if (key !== hud.lastStandingsKey) {
      hud.lastStandingsKey = key;
      hud.standingsPanelEl.textContent = '';
      for (let i = 0; i < standings.length; i++) {
        const sEntry = standings[i];
        const row = document.createElement('div');
        row.className = sEntry.isPlayer
          ? 'sr-standings-row sr-standings-row--player'
          : 'sr-standings-row';

        const rEl = document.createElement('span');
        rEl.className = 'sr-standings-rank';
        rEl.textContent = `${sEntry.rank}.`;
        row.appendChild(rEl);

        const dot = document.createElement('span');
        dot.className = 'sr-racer-dot';
        dot.style.backgroundColor = sEntry.color;
        row.appendChild(dot);

        const nameEl = document.createElement('span');
        nameEl.className = 'sr-standings-name';
        nameEl.textContent = sEntry.name;
        row.appendChild(nameEl);

        const gapEl = document.createElement('span');
        gapEl.className = 'sr-standings-gap';
        gapEl.textContent =
          sEntry.rank === 1
            ? '--'
            : sEntry.dnf
              ? 'DNF'
              : `+${sEntry.gapSeconds.toFixed(1)}s`;
        row.appendChild(gapEl);

        hud.standingsPanelEl.appendChild(row);
      }
    }
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

  hud.lastBestLapSeconds = viewModel.bestLapSeconds;
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
  hud.toastQueue.dispose();
  hud.minimap.dispose();
  hideCountdownOverlay(hud);
  hideFinishScreen(hud);
  hud.disposeEvents();
  if (hud.root.parentElement === hud.container) {
    hud.container.removeChild(hud.root);
  }
}
