// src/input/touch.ts

import { CONFIG } from '../config';
import type { PhysicsEvent } from '../core/physics';
import type { RacePhase } from '../core/state';
import '../ui/touch.css';

export type TouchConfig = typeof CONFIG.touch;
export type SteerMode = 'stick' | 'buttons';

export interface TouchControlState {
  steer: number;
  throttle: number;
  brake: number;
  handbrake: boolean;
  usingAutoThrottle: boolean;
}

export interface TouchPresses {
  reset: boolean;
  restart: boolean;
  confirm: boolean;
  mute: boolean;
}

export interface TouchControls {
  getState: () => TouchControlState;
  consumePresses: () => TouchPresses;
  setPhase: (phase: RacePhase) => void;
  setVisible: (visible: boolean) => void;
  onHaptic: (event: PhysicsEvent) => void;
  isEnabled: () => boolean;
  isPortraitBlocked: () => boolean;
  setMutedVisual: (muted: boolean) => void;
  onStatusChange: (cb: () => void) => () => void;
  dispose: () => void;
}

interface StoredTouchPrefs {
  steerMode?: SteerMode;
  autoThrottle?: boolean;
  muted?: boolean;
}

function loadTouchPrefs(config: TouchConfig): {
  steerMode: SteerMode;
  autoThrottle: boolean;
} {
  const defaults = {
    steerMode: config.steerMode as SteerMode,
    autoThrottle: config.autoThrottleDefault,
  };
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return defaults;
    }
    const raw = window.localStorage.getItem(config.storageKey);
    if (!raw) {
      return defaults;
    }
    const parsed = JSON.parse(raw) as StoredTouchPrefs;
    return {
      steerMode:
        parsed.steerMode === 'stick' || parsed.steerMode === 'buttons'
          ? parsed.steerMode
          : defaults.steerMode,
      autoThrottle:
        typeof parsed.autoThrottle === 'boolean'
          ? parsed.autoThrottle
          : defaults.autoThrottle,
    };
  } catch {
    return defaults;
  }
}

function saveTouchPrefs(
  config: TouchConfig,
  steerMode: SteerMode,
  autoThrottle: boolean,
  muted: boolean,
): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    const payload: StoredTouchPrefs = { steerMode, autoThrottle, muted };
    window.localStorage.setItem(config.storageKey, JSON.stringify(payload));
  } catch {
    // Ignore storage quota or private browsing errors
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function detectInitialCoarsePointer(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  if (window.matchMedia?.('(pointer: coarse)').matches) {
    return true;
  }
  if (typeof navigator !== 'undefined') {
    if (navigator.maxTouchPoints > 0) {
      return true;
    }
    if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      return true;
    }
  }
  return false;
}

export function requestLandscapeOrientation(): void {
  if (typeof screen === 'undefined') {
    return;
  }
  try {
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (mode: string) => Promise<void>;
    };
    if (typeof orientation?.lock === 'function') {
      void orientation.lock('landscape').catch(() => {
        // Ignore unsupported orientation lock (e.g. non-fullscreen or iOS Safari)
      });
    }
  } catch {
    // Ignore unsupported orientation lock errors
  }
}

function hasFullscreenSupport(target: HTMLElement): boolean {
  if (typeof document === 'undefined') {
    return false;
  }
  const doc = document as Document & {
    webkitFullscreenEnabled?: boolean;
  };
  const el = target as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  return Boolean(
    (doc.fullscreenEnabled && typeof el.requestFullscreen === 'function') ||
      (doc.webkitFullscreenEnabled && typeof el.webkitRequestFullscreen === 'function'),
  );
}

function isFullscreenActive(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }
  const doc = document as Document & { webkitFullscreenElement?: Element | null };
  return Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
}

export function createTouchControls(
  rootElement: HTMLElement,
  config: TouchConfig = CONFIG.touch,
): TouchControls {
  const prefs = loadTouchPrefs(config);
  let steerMode: SteerMode = prefs.steerMode;
  let autoThrottle = prefs.autoThrottle;
  let mutedVisual = false;

  let enabled =
    config.enableMode === 'always'
      ? true
      : config.enableMode === 'off'
        ? false
        : detectInitialCoarsePointer();
  let visible = true;
  let phase: RacePhase = 'TITLE';
  let disposed = false;
  let portraitBlocked = false;

  const statusCallbacks = new Set<() => void>();
  function emitStatusChange(): void {
    statusCallbacks.forEach((cb) => cb());
  }

  // Active control states
  let stickPointerId: number | null = null;
  let stickOriginX = 0;
  let stickSteer = 0;

  let leftPointerId: number | null = null;
  let rightPointerId: number | null = null;
  let brakePointerId: number | null = null;
  let driftPointerId: number | null = null;
  let gasPointerId: number | null = null;

  let resetPointerId: number | null = null;
  let resetDownAt = 0;
  let restartPointerId: number | null = null;
  let restartDownAt = 0;
  let restartRafId = 0;
  let restartTriggeredInHold = false;

  let mutePointerId: number | null = null;
  let steerModePointerId: number | null = null;
  let autoPointerId: number | null = null;
  let confirmPointerId: number | null = null;

  const queuedPresses: TouchPresses = {
    reset: false,
    restart: false,
    confirm: false,
    mute: false,
  };

  let lastHapticAt = 0;

  // Build DOM container
  const root = document.createElement('div');
  root.className = 'sr-touch-root sr-touch-hidden';
  root.style.setProperty('--sr-touch-btn-size', `${Math.max(56, config.buttonSize)}px`);
  root.style.setProperty('--sr-touch-idle-opacity', String(config.idleOpacity));
  root.style.setProperty('--sr-touch-pressed-opacity', String(config.pressedOpacity));
  root.style.setProperty('--sr-touch-safe-margin', `${config.safeMargin}px`);
  root.style.setProperty('--sr-stick-radius', `${config.stickMaxRadius}px`);

  const fullscreenSupported = hasFullscreenSupport(rootElement);
  const restartCircumference = 2 * Math.PI * 22;

  root.innerHTML = `
    <div class="sr-touch-confirm-backdrop sr-touch-hidden"></div>

    <div class="sr-touch-steer-zone">
      <div class="sr-touch-stick-base">
        <div class="sr-touch-stick-track">
          <svg class="sr-touch-stick-arrow" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <span class="sr-touch-stick-tick"></span>
          <svg class="sr-touch-stick-arrow" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
        <div class="sr-touch-stick-knob"></div>
      </div>

      <div class="sr-touch-steer-buttons sr-touch-hidden">
        <button type="button" class="sr-touch-btn sr-touch-btn-steer sr-touch-btn-left" aria-label="Belok kiri">
          <svg class="sr-touch-btn-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15.5 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <button type="button" class="sr-touch-btn sr-touch-btn-steer sr-touch-btn-right" aria-label="Belok kanan">
          <svg class="sr-touch-btn-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8.5 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>
    </div>

    <div class="sr-touch-actions">
      <button type="button" class="sr-touch-btn sr-touch-btn-drift" aria-label="Drift">
        <svg class="sr-touch-btn-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 17c3.5-6 6.5-8 13.5-8M15 5l4 4-4 4" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span class="sr-touch-btn-label">DRIFT</span>
      </button>
      <button type="button" class="sr-touch-btn sr-touch-btn-brake" aria-label="Rem atau Mundur">
        <svg class="sr-touch-btn-icon" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="6" y="6" width="12" height="12" rx="3" fill="currentColor" />
        </svg>
        <span class="sr-touch-btn-label">REM</span>
      </button>
      <button type="button" class="sr-touch-btn sr-touch-btn-gas sr-touch-hidden" aria-label="Gas">
        <svg class="sr-touch-btn-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5l6 9H6l6-9z" fill="currentColor" />
        </svg>
        <span class="sr-touch-btn-label">GAS</span>
      </button>
    </div>

    <div class="sr-touch-topbar">
      <button type="button" class="sr-touch-util-btn sr-touch-util-reset" aria-label="Reset ke checkpoint" title="Reset checkpoint">
        <svg class="sr-touch-util-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 12a8 8 0 1 0 2.5-5.8L4 8.5M4 4v4.5h4.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span class="sr-touch-util-text">CP</span>
      </button>
      <button type="button" class="sr-touch-util-btn sr-touch-util-restart" aria-label="Tahan untuk ulang balapan" title="Tahan untuk ulang">
        <svg class="sr-touch-restart-ring" viewBox="0 0 48 48" aria-hidden="true">
          <circle
            class="sr-touch-restart-ring-fill"
            cx="24"
            cy="24"
            r="22"
            stroke-dasharray="${restartCircumference.toFixed(2)}"
            stroke-dashoffset="${restartCircumference.toFixed(2)}"
          />
        </svg>
        <svg class="sr-touch-util-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 19V5l13 7-13 7z" fill="currentColor" />
        </svg>
        <span class="sr-touch-util-text">ULANG</span>
      </button>
      <button type="button" class="sr-touch-util-btn sr-touch-util-mute" aria-label="Suara">
        <svg class="sr-touch-util-icon sr-touch-icon-on" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 9.5v5h4l5 4.5V5L8 9.5H4z" fill="currentColor" />
          <path d="M16.2 8.8a4.8 4.8 0 0 1 0 6.4" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" />
        </svg>
        <svg class="sr-touch-util-icon sr-touch-icon-off" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 9.5v5h4l5 4.5V5L8 9.5H4z" fill="currentColor" />
          <path d="M16.5 9l4.5 6M21 9l-4.5 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
        </svg>
        <span class="sr-touch-util-text">SUARA</span>
      </button>
      <button type="button" class="sr-touch-util-btn sr-touch-util-steer-mode" aria-label="Ganti mode kemudi">
        <svg class="sr-touch-util-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2.2" />
          <circle cx="12" cy="12" r="2.2" fill="currentColor" />
          <path d="M12 5v4M6 15l4-2M18 15l-4-2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
        </svg>
        <span class="sr-touch-util-text sr-touch-steer-mode-text">STIK</span>
      </button>
      <button type="button" class="sr-touch-util-btn sr-touch-util-auto" aria-label="Gas otomatis">
        <svg class="sr-touch-util-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M13 3L6 14h5l-1 7 8-12h-5l0-6z" fill="currentColor" />
        </svg>
        <span class="sr-touch-util-text">AUTO</span>
      </button>
      <button type="button" class="sr-touch-util-btn sr-touch-util-fs ${fullscreenSupported ? '' : 'sr-touch-hidden'}" aria-label="Layar penuh">
        <svg class="sr-touch-util-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span class="sr-touch-util-text">FULL</span>
      </button>
    </div>

    <div class="sr-touch-portrait-overlay sr-touch-hidden" role="dialog" aria-live="polite">
      <svg class="sr-touch-portrait-icon" viewBox="0 0 64 64" aria-hidden="true">
        <rect x="20" y="10" width="24" height="44" rx="5" fill="none" stroke="currentColor" stroke-width="3.5" />
        <circle cx="32" cy="48" r="2.2" fill="currentColor" />
        <path d="M12 24c-2.5 5-2 11 1.5 16M8 38l5.5 2 1.5-5.5" fill="none" stroke="#35D4FF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <h2 class="sr-touch-portrait-title">Putar perangkat ke mode landscape</h2>
      <p class="sr-touch-portrait-sub">Balapan dijeda sementara hingga layar horizontal</p>
    </div>
  `;

  rootElement.appendChild(root);

  const confirmBackdropEl = root.querySelector('.sr-touch-confirm-backdrop') as HTMLElement;
  const steerZoneEl = root.querySelector('.sr-touch-steer-zone') as HTMLElement;
  const stickBaseEl = root.querySelector('.sr-touch-stick-base') as HTMLElement;
  const stickKnobEl = root.querySelector('.sr-touch-stick-knob') as HTMLElement;
  const steerButtonsEl = root.querySelector('.sr-touch-steer-buttons') as HTMLElement;
  const leftBtnEl = root.querySelector('.sr-touch-btn-left') as HTMLButtonElement;
  const rightBtnEl = root.querySelector('.sr-touch-btn-right') as HTMLButtonElement;
  const actionsEl = root.querySelector('.sr-touch-actions') as HTMLElement;
  const driftBtnEl = root.querySelector('.sr-touch-btn-drift') as HTMLButtonElement;
  const brakeBtnEl = root.querySelector('.sr-touch-btn-brake') as HTMLButtonElement;
  const gasBtnEl = root.querySelector('.sr-touch-btn-gas') as HTMLButtonElement;

  const topbarEl = root.querySelector('.sr-touch-topbar') as HTMLElement;
  const resetBtnEl = root.querySelector('.sr-touch-util-reset') as HTMLButtonElement;
  const restartBtnEl = root.querySelector('.sr-touch-util-restart') as HTMLButtonElement;
  const restartRingEl = root.querySelector('.sr-touch-restart-ring-fill') as SVGCircleElement;
  const muteBtnEl = root.querySelector('.sr-touch-util-mute') as HTMLButtonElement;
  const steerModeBtnEl = root.querySelector('.sr-touch-util-steer-mode') as HTMLButtonElement;
  const steerModeTextEl = root.querySelector('.sr-touch-steer-mode-text') as HTMLElement;
  const autoBtnEl = root.querySelector('.sr-touch-util-auto') as HTMLButtonElement;
  const fsBtnEl = root.querySelector('.sr-touch-util-fs') as HTMLButtonElement;
  const portraitOverlayEl = root.querySelector('.sr-touch-portrait-overlay') as HTMLElement;

  function safeCapture(el: Element, pointerId: number): void {
    try {
      el.setPointerCapture(pointerId);
    } catch {
      // Ignore if pointer already inactive or synthetic
    }
  }

  function safeRelease(el: Element, pointerId: number): void {
    try {
      if (el.hasPointerCapture(pointerId)) {
        el.releasePointerCapture(pointerId);
      }
    } catch {
      // Ignore
    }
  }

  function positionIdleStick(): void {
    const rect = steerZoneEl.getBoundingClientRect();
    const minCenterX = config.stickMaxRadius + 28;
    const centerX = Math.max(minCenterX, rect.width * 0.45);
    const centerY = Math.max(46, rect.height * 0.56);
    stickBaseEl.style.left = `${centerX.toFixed(1)}px`;
    stickBaseEl.style.top = `${centerY.toFixed(1)}px`;
    stickKnobEl.style.transform = 'translate3d(0px, 0px, 0px)';
  }

  function cancelRestartHold(): void {
    restartPointerId = null;
    restartDownAt = 0;
    restartTriggeredInHold = false;
    if (restartRafId) {
      window.cancelAnimationFrame(restartRafId);
      restartRafId = 0;
    }
    restartBtnEl.classList.remove('sr-touch-is-pressed', 'sr-touch-holding');
    restartRingEl.style.strokeDashoffset = restartCircumference.toFixed(2);
  }

  function clearAllActiveInputs(): void {
    stickPointerId = null;
    stickSteer = 0;
    steerZoneEl.classList.remove('sr-touch-is-active');
    positionIdleStick();

    leftPointerId = null;
    rightPointerId = null;
    brakePointerId = null;
    driftPointerId = null;
    gasPointerId = null;
    resetPointerId = null;
    mutePointerId = null;
    steerModePointerId = null;
    autoPointerId = null;
    confirmPointerId = null;

    leftBtnEl.classList.remove('sr-touch-is-pressed');
    rightBtnEl.classList.remove('sr-touch-is-pressed');
    brakeBtnEl.classList.remove('sr-touch-is-pressed');
    driftBtnEl.classList.remove('sr-touch-is-pressed');
    gasBtnEl.classList.remove('sr-touch-is-pressed');
    resetBtnEl.classList.remove('sr-touch-is-pressed');
    muteBtnEl.classList.remove('sr-touch-is-pressed');
    steerModeBtnEl.classList.remove('sr-touch-is-pressed');
    autoBtnEl.classList.remove('sr-touch-is-pressed');

    cancelRestartHold();
  }

  function syncUiState(): void {
    const active = enabled && visible;
    root.classList.toggle('sr-touch-hidden', !active);

    const vw = window.visualViewport?.width ?? window.innerWidth;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    if (window.visualViewport) {
      root.style.height = `${Math.round(vh)}px`;
    } else {
      root.style.height = '';
    }

    const nextPortrait = Boolean(active && config.orientationHint && vh > vw);
    const portraitChanged = nextPortrait !== portraitBlocked;
    portraitBlocked = nextPortrait;
    portraitOverlayEl.classList.toggle('sr-touch-hidden', !portraitBlocked);

    if (portraitBlocked) {
      clearAllActiveInputs();
    }

    const isDrivingPhase = phase === 'COUNTDOWN' || phase === 'RACING';
    const isTitlePhase = phase === 'TITLE';
    const isFinishPhase = phase === 'FINISH';

    // Hide all touch controls when FINISH results screen is displayed so nothing overlaps it
    topbarEl.classList.toggle('sr-touch-hidden', isFinishPhase || portraitBlocked);
    confirmBackdropEl.classList.toggle('sr-touch-hidden', !isTitlePhase || portraitBlocked);
    steerZoneEl.classList.toggle('sr-touch-hidden', !isDrivingPhase);
    actionsEl.classList.toggle('sr-touch-hidden', !isDrivingPhase);
    resetBtnEl.classList.toggle('sr-touch-hidden', !isDrivingPhase);
    restartBtnEl.classList.toggle('sr-touch-hidden', !isDrivingPhase);

    const isStick = steerMode === 'stick';
    stickBaseEl.classList.toggle('sr-touch-hidden', !isStick);
    steerButtonsEl.classList.toggle('sr-touch-hidden', isStick);
    steerModeTextEl.textContent = isStick ? 'STIK' : 'TOMBOL';

    gasBtnEl.classList.toggle('sr-touch-hidden', autoThrottle);
    autoBtnEl.classList.toggle('sr-touch-auto-on', autoThrottle);
    muteBtnEl.classList.toggle('sr-touch-is-muted', mutedVisual);

    if (isStick && stickPointerId === null) {
      positionIdleStick();
    }

    if (portraitChanged) {
      emitStatusChange();
    }
  }

  // Stick steering handlers
  function updateStickFromClientX(clientX: number): void {
    const maxR = Math.max(24, config.stickMaxRadius);
    const dx = clamp(clientX - stickOriginX, -maxR, maxR);
    stickKnobEl.style.transform = `translate3d(${dx.toFixed(1)}px, 0px, 0px)`;

    const raw = dx / maxR;
    const absRaw = Math.abs(raw);
    const dead = clamp(config.stickDeadzone, 0, 0.5);
    if (absRaw <= dead) {
      stickSteer = 0;
      return;
    }
    const norm = (absRaw - dead) / Math.max(0.05, 1 - dead);
    const curved = Math.pow(clamp(norm, 0, 1), config.stickResponseCurve);
    stickSteer = Math.sign(raw) * curved;
  }

  function onSteerZonePointerDown(e: PointerEvent): void {
    if (steerMode !== 'stick' || stickPointerId !== null || portraitBlocked) {
      return;
    }
    if (phase !== 'COUNTDOWN' && phase !== 'RACING') {
      return;
    }
    e.preventDefault();
    stickPointerId = e.pointerId;
    safeCapture(steerZoneEl, e.pointerId);

    const rect = steerZoneEl.getBoundingClientRect();
    const minPadX = config.stickMaxRadius + 24;
    const localX = clamp(e.clientX - rect.left, minPadX, Math.max(minPadX, rect.width - minPadX));
    const localY = clamp(e.clientY - rect.top, 38, Math.max(38, rect.height - 38));

    stickOriginX = rect.left + localX;
    stickBaseEl.style.left = `${localX.toFixed(1)}px`;
    stickBaseEl.style.top = `${localY.toFixed(1)}px`;
    steerZoneEl.classList.add('sr-touch-is-active');
    updateStickFromClientX(e.clientX);
  }

  function onSteerZonePointerMove(e: PointerEvent): void {
    if (e.pointerId !== stickPointerId || steerMode !== 'stick') {
      return;
    }
    e.preventDefault();
    updateStickFromClientX(e.clientX);
  }

  function onSteerZonePointerEnd(e: PointerEvent): void {
    if (e.pointerId !== stickPointerId) {
      return;
    }
    safeRelease(steerZoneEl, e.pointerId);
    stickPointerId = null;
    stickSteer = 0;
    steerZoneEl.classList.remove('sr-touch-is-active');
    positionIdleStick();
  }

  steerZoneEl.addEventListener('pointerdown', onSteerZonePointerDown);
  steerZoneEl.addEventListener('pointermove', onSteerZonePointerMove);
  steerZoneEl.addEventListener('pointerup', onSteerZonePointerEnd);
  steerZoneEl.addEventListener('pointercancel', onSteerZonePointerEnd);
  steerZoneEl.addEventListener('lostpointercapture', onSteerZonePointerEnd);

  // Helper to bind hold-style buttons with per-button pointerId capture
  function bindHoldButton(
    btn: HTMLButtonElement,
    getId: () => number | null,
    setId: (id: number | null) => void,
  ): () => void {
    const onDown = (e: PointerEvent): void => {
      if (getId() !== null || portraitBlocked) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      setId(e.pointerId);
      safeCapture(btn, e.pointerId);
      btn.classList.add('sr-touch-is-pressed');
    };
    const onEnd = (e: PointerEvent): void => {
      if (e.pointerId !== getId()) {
        return;
      }
      safeRelease(btn, e.pointerId);
      setId(null);
      btn.classList.remove('sr-touch-is-pressed');
    };
    btn.addEventListener('pointerdown', onDown);
    btn.addEventListener('pointerup', onEnd);
    btn.addEventListener('pointercancel', onEnd);
    btn.addEventListener('lostpointercapture', onEnd);

    return () => {
      btn.removeEventListener('pointerdown', onDown);
      btn.removeEventListener('pointerup', onEnd);
      btn.removeEventListener('pointercancel', onEnd);
      btn.removeEventListener('lostpointercapture', onEnd);
    };
  }

  const unbindLeft = bindHoldButton(leftBtnEl, () => leftPointerId, (id) => {
    leftPointerId = id;
  });
  const unbindRight = bindHoldButton(rightBtnEl, () => rightPointerId, (id) => {
    rightPointerId = id;
  });
  const unbindBrake = bindHoldButton(brakeBtnEl, () => brakePointerId, (id) => {
    brakePointerId = id;
  });
  const unbindDrift = bindHoldButton(driftBtnEl, () => driftPointerId, (id) => {
    driftPointerId = id;
  });
  const unbindGas = bindHoldButton(gasBtnEl, () => gasPointerId, (id) => {
    gasPointerId = id;
  });

  // Reset checkpoint button (short tap <= resetTapMaxMs)
  function onResetDown(e: PointerEvent): void {
    if (resetPointerId !== null || portraitBlocked) return;
    e.preventDefault();
    e.stopPropagation();
    resetPointerId = e.pointerId;
    resetDownAt = performance.now();
    safeCapture(resetBtnEl, e.pointerId);
    resetBtnEl.classList.add('sr-touch-is-pressed');
  }
  function onResetUp(e: PointerEvent): void {
    if (e.pointerId !== resetPointerId) return;
    const elapsed = performance.now() - resetDownAt;
    safeRelease(resetBtnEl, e.pointerId);
    resetPointerId = null;
    resetBtnEl.classList.remove('sr-touch-is-pressed');
    if (e.type === 'pointerup' && elapsed <= config.resetTapMaxMs && phase === 'RACING') {
      queuedPresses.reset = true;
    }
  }
  resetBtnEl.addEventListener('pointerdown', onResetDown);
  resetBtnEl.addEventListener('pointerup', onResetUp);
  resetBtnEl.addEventListener('pointercancel', onResetUp);
  resetBtnEl.addEventListener('lostpointercapture', onResetUp);

  // Hold-to-restart button (restartHoldMs = 600 ms with progress ring)
  function tickRestartHold(): void {
    if (restartPointerId === null || disposed) {
      return;
    }
    const elapsed = performance.now() - restartDownAt;
    const progress = clamp(elapsed / Math.max(100, config.restartHoldMs), 0, 1);
    const offset = restartCircumference * (1 - progress);
    restartRingEl.style.strokeDashoffset = offset.toFixed(2);

    if (progress >= 1 && !restartTriggeredInHold) {
      restartTriggeredInHold = true;
      queuedPresses.restart = true;
      triggerVibrate(config.haptics.boostMs);
      cancelRestartHold();
      return;
    }

    restartRafId = window.requestAnimationFrame(tickRestartHold);
  }

  function onRestartDown(e: PointerEvent): void {
    if (restartPointerId !== null || portraitBlocked || phase === 'TITLE') return;
    e.preventDefault();
    e.stopPropagation();
    restartPointerId = e.pointerId;
    restartDownAt = performance.now();
    restartTriggeredInHold = false;
    safeCapture(restartBtnEl, e.pointerId);
    restartBtnEl.classList.add('sr-touch-is-pressed', 'sr-touch-holding');
    restartRafId = window.requestAnimationFrame(tickRestartHold);
  }

  function onRestartEnd(e: PointerEvent): void {
    if (e.pointerId !== restartPointerId) return;
    safeRelease(restartBtnEl, e.pointerId);
    cancelRestartHold();
  }

  restartBtnEl.addEventListener('pointerdown', onRestartDown);
  restartBtnEl.addEventListener('pointerup', onRestartEnd);
  restartBtnEl.addEventListener('pointercancel', onRestartEnd);
  restartBtnEl.addEventListener('lostpointercapture', onRestartEnd);

  // Mute, Steer Mode, Auto-Throttle utility buttons
  function bindTapButton(
    btn: HTMLButtonElement,
    getId: () => number | null,
    setId: (id: number | null) => void,
    onTap: () => void,
  ): () => void {
    const onDown = (e: PointerEvent): void => {
      if (getId() !== null || portraitBlocked) return;
      e.preventDefault();
      e.stopPropagation();
      setId(e.pointerId);
      safeCapture(btn, e.pointerId);
      btn.classList.add('sr-touch-is-pressed');
    };
    const onEnd = (e: PointerEvent): void => {
      if (e.pointerId !== getId()) return;
      safeRelease(btn, e.pointerId);
      setId(null);
      btn.classList.remove('sr-touch-is-pressed');
      if (e.type === 'pointerup') {
        onTap();
      }
    };
    btn.addEventListener('pointerdown', onDown);
    btn.addEventListener('pointerup', onEnd);
    btn.addEventListener('pointercancel', onEnd);
    btn.addEventListener('lostpointercapture', onEnd);

    return () => {
      btn.removeEventListener('pointerdown', onDown);
      btn.removeEventListener('pointerup', onEnd);
      btn.removeEventListener('pointercancel', onEnd);
      btn.removeEventListener('lostpointercapture', onEnd);
    };
  }

  const unbindMute = bindTapButton(
    muteBtnEl,
    () => mutePointerId,
    (id) => {
      mutePointerId = id;
    },
    () => {
      queuedPresses.mute = true;
    },
  );

  const unbindSteerMode = bindTapButton(
    steerModeBtnEl,
    () => steerModePointerId,
    (id) => {
      steerModePointerId = id;
    },
    () => {
      steerMode = steerMode === 'stick' ? 'buttons' : 'stick';
      clearAllActiveInputs();
      saveTouchPrefs(config, steerMode, autoThrottle, mutedVisual);
      syncUiState();
    },
  );

  const unbindAuto = bindTapButton(
    autoBtnEl,
    () => autoPointerId,
    (id) => {
      autoPointerId = id;
    },
    () => {
      autoThrottle = !autoThrottle;
      gasPointerId = null;
      gasBtnEl.classList.remove('sr-touch-is-pressed');
      saveTouchPrefs(config, steerMode, autoThrottle, mutedVisual);
      syncUiState();
    },
  );

  // Fullscreen button uses click so requestFullscreen + orientation lock have proper user activation
  function onFullscreenPointerDown(e: PointerEvent): void {
    e.stopPropagation();
  }

  async function onFullscreenClick(e: MouseEvent): Promise<void> {
    e.stopPropagation();
    if (!fullscreenSupported) return;
    try {
      if (isFullscreenActive()) {
        const doc = document as Document & { webkitExitFullscreen?: () => Promise<void> | void };
        if (typeof doc.exitFullscreen === 'function') {
          await doc.exitFullscreen();
        } else if (typeof doc.webkitExitFullscreen === 'function') {
          await doc.webkitExitFullscreen();
        }
      } else {
        const el = rootElement as HTMLElement & {
          webkitRequestFullscreen?: () => Promise<void> | void;
        };
        if (typeof el.requestFullscreen === 'function') {
          await el.requestFullscreen();
        } else if (typeof el.webkitRequestFullscreen === 'function') {
          await el.webkitRequestFullscreen();
        }
        requestLandscapeOrientation();
      }
    } catch {
      // Ignore fullscreen denial errors
    }
  }
  fsBtnEl.addEventListener('pointerdown', onFullscreenPointerDown);
  fsBtnEl.addEventListener('click', onFullscreenClick);

  // Tap-anywhere outside Title card to confirm start on TITLE screen
  function onConfirmDown(e: PointerEvent): void {
    if (confirmPointerId !== null || portraitBlocked) return;
    if (phase !== 'TITLE') return;
    e.preventDefault();
    confirmPointerId = e.pointerId;
    safeCapture(confirmBackdropEl, e.pointerId);
  }
  function onConfirmEnd(e: PointerEvent): void {
    if (e.pointerId !== confirmPointerId) return;
    safeRelease(confirmBackdropEl, e.pointerId);
    confirmPointerId = null;
    if (e.type === 'pointerup' && phase === 'TITLE' && !portraitBlocked) {
      queuedPresses.confirm = true;
    }
  }
  confirmBackdropEl.addEventListener('pointerdown', onConfirmDown);
  confirmBackdropEl.addEventListener('pointerup', onConfirmEnd);
  confirmBackdropEl.addEventListener('pointercancel', onConfirmEnd);
  confirmBackdropEl.addEventListener('lostpointercapture', onConfirmEnd);

  // Global protection against browser gestures, stuck pointers, and first-touch detection
  function onFirstTouchActivate(e: PointerEvent): void {
    if (disposed || enabled || config.enableMode !== 'auto') {
      return;
    }
    if (e.pointerType === 'touch') {
      enabled = true;
      syncUiState();
      emitStatusChange();
      window.removeEventListener('pointerdown', onFirstTouchActivate, true);
    }
  }

  function onWindowBlur(): void {
    clearAllActiveInputs();
  }

  function onVisibilityChange(): void {
    if (document.hidden) {
      clearAllActiveInputs();
    }
  }

  function onViewportResize(): void {
    syncUiState();
  }

  function onContextMenu(e: Event): void {
    if (enabled) {
      e.preventDefault();
    }
  }

  function onSelectStart(e: Event): void {
    if (enabled) {
      e.preventDefault();
    }
  }

  function onGestureStart(e: Event): void {
    e.preventDefault();
  }

  function isInsideScrollableCard(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) {
      return false;
    }
    const scrollable = target.closest('.sr-title-card, .sr-finish-card, .sr-finish-splits');
    if (!(scrollable instanceof HTMLElement)) {
      return false;
    }
    return scrollable.scrollHeight > scrollable.clientHeight + 2;
  }

  function onDocumentTouchStart(e: TouchEvent): void {
    if (e.touches.length > 1) {
      e.preventDefault();
    }
  }

  function onDocumentTouchMove(e: TouchEvent): void {
    if (e.touches.length > 1) {
      e.preventDefault();
      return;
    }
    if (!isInsideScrollableCard(e.target)) {
      e.preventDefault();
    }
  }

  const coarseQuery =
    typeof window !== 'undefined' ? window.matchMedia?.('(pointer: coarse)') : undefined;
  function onCoarseMediaChange(e: MediaQueryListEvent): void {
    if (disposed || config.enableMode !== 'auto') {
      return;
    }
    const nextEnabled = Boolean(e.matches);
    if (nextEnabled !== enabled) {
      enabled = nextEnabled;
      if (!enabled) {
        clearAllActiveInputs();
      }
      syncUiState();
      emitStatusChange();
    }
  }

  window.addEventListener('blur', onWindowBlur);
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('resize', onViewportResize);
  window.addEventListener('orientationchange', onViewportResize);
  window.visualViewport?.addEventListener('resize', onViewportResize);
  coarseQuery?.addEventListener?.('change', onCoarseMediaChange);
  rootElement.addEventListener('contextmenu', onContextMenu);
  rootElement.addEventListener('selectstart', onSelectStart);
  document.addEventListener('gesturestart', onGestureStart, { passive: false });
  document.addEventListener('touchstart', onDocumentTouchStart, { passive: false });
  document.addEventListener('touchmove', onDocumentTouchMove, { passive: false });
  if (!enabled && config.enableMode === 'auto') {
    window.addEventListener('pointerdown', onFirstTouchActivate, true);
  }

  function triggerVibrate(durationMs: number): void {
    if (!enabled || !config.haptics.enabled || durationMs <= 0) {
      return;
    }
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
      return;
    }
    const now = performance.now();
    if (now - lastHapticAt < config.haptics.minInterval) {
      return;
    }
    lastHapticAt = now;
    try {
      navigator.vibrate(Math.round(durationMs));
    } catch {
      // Ignore vibration permission errors
    }
  }

  function getState(): TouchControlState {
    if (!enabled || !visible || portraitBlocked) {
      return {
        steer: 0,
        throttle: 0,
        brake: 0,
        handbrake: false,
        usingAutoThrottle: false,
      };
    }

    let steer = 0;
    if (steerMode === 'stick') {
      steer = stickSteer;
    } else {
      const right = rightPointerId !== null ? 1 : 0;
      const left = leftPointerId !== null ? 1 : 0;
      steer = right - left;
    }

    const brake = brakePointerId !== null ? 1 : 0;
    const handbrake = driftPointerId !== null;
    const usingAuto = autoThrottle && phase === 'RACING';
    // Cut auto-throttle while brake/reverse is held so the player can brake & reverse cleanly
    const throttle = usingAuto ? (brake > 0 ? 0 : 1) : gasPointerId !== null ? 1 : 0;

    return {
      steer,
      throttle,
      brake,
      handbrake,
      usingAutoThrottle: usingAuto,
    };
  }

  function consumePresses(): TouchPresses {
    const out: TouchPresses = {
      reset: queuedPresses.reset,
      restart: queuedPresses.restart,
      confirm: queuedPresses.confirm,
      mute: queuedPresses.mute,
    };
    queuedPresses.reset = false;
    queuedPresses.restart = false;
    queuedPresses.confirm = false;
    queuedPresses.mute = false;
    return out;
  }

  function setPhase(nextPhase: RacePhase): void {
    if (nextPhase === phase) {
      return;
    }
    phase = nextPhase;
    if (phase === 'TITLE' || phase === 'FINISH') {
      clearAllActiveInputs();
    }
    syncUiState();
  }

  function setVisible(nextVisible: boolean): void {
    if (nextVisible === visible) {
      return;
    }
    visible = Boolean(nextVisible);
    if (!visible) {
      clearAllActiveInputs();
    }
    syncUiState();
  }

  function onHaptic(event: PhysicsEvent): void {
    if (event.type === 'boost') {
      triggerVibrate(config.haptics.boostMs);
    } else if (event.type === 'railHit') {
      triggerVibrate(config.haptics.railMs);
    } else if (event.type === 'landed') {
      const ratio = clamp(event.impactSpeed / 22, 0.25, 1);
      triggerVibrate(ratio * config.haptics.landMaxMs);
    }
  }

  function setMutedVisual(muted: boolean): void {
    if (muted === mutedVisual) {
      return;
    }
    mutedVisual = muted;
    muteBtnEl.classList.toggle('sr-touch-is-muted', mutedVisual);
    saveTouchPrefs(config, steerMode, autoThrottle, mutedVisual);
  }

  function onStatusChange(cb: () => void): () => void {
    statusCallbacks.add(cb);
    return () => {
      statusCallbacks.delete(cb);
    };
  }

  syncUiState();

  function dispose(): void {
    if (disposed) {
      return;
    }
    disposed = true;
    clearAllActiveInputs();
    statusCallbacks.clear();

    steerZoneEl.removeEventListener('pointerdown', onSteerZonePointerDown);
    steerZoneEl.removeEventListener('pointermove', onSteerZonePointerMove);
    steerZoneEl.removeEventListener('pointerup', onSteerZonePointerEnd);
    steerZoneEl.removeEventListener('pointercancel', onSteerZonePointerEnd);
    steerZoneEl.removeEventListener('lostpointercapture', onSteerZonePointerEnd);

    unbindLeft();
    unbindRight();
    unbindBrake();
    unbindDrift();
    unbindGas();
    unbindMute();
    unbindSteerMode();
    unbindAuto();

    resetBtnEl.removeEventListener('pointerdown', onResetDown);
    resetBtnEl.removeEventListener('pointerup', onResetUp);
    resetBtnEl.removeEventListener('pointercancel', onResetUp);
    resetBtnEl.removeEventListener('lostpointercapture', onResetUp);

    restartBtnEl.removeEventListener('pointerdown', onRestartDown);
    restartBtnEl.removeEventListener('pointerup', onRestartEnd);
    restartBtnEl.removeEventListener('pointercancel', onRestartEnd);
    restartBtnEl.removeEventListener('lostpointercapture', onRestartEnd);

    fsBtnEl.removeEventListener('pointerdown', onFullscreenPointerDown);
    fsBtnEl.removeEventListener('click', onFullscreenClick);

    confirmBackdropEl.removeEventListener('pointerdown', onConfirmDown);
    confirmBackdropEl.removeEventListener('pointerup', onConfirmEnd);
    confirmBackdropEl.removeEventListener('pointercancel', onConfirmEnd);
    confirmBackdropEl.removeEventListener('lostpointercapture', onConfirmEnd);

    window.removeEventListener('pointerdown', onFirstTouchActivate, true);
    window.removeEventListener('blur', onWindowBlur);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('resize', onViewportResize);
    window.removeEventListener('orientationchange', onViewportResize);
    window.visualViewport?.removeEventListener('resize', onViewportResize);
    coarseQuery?.removeEventListener?.('change', onCoarseMediaChange);
    rootElement.removeEventListener('contextmenu', onContextMenu);
    rootElement.removeEventListener('selectstart', onSelectStart);
    document.removeEventListener('gesturestart', onGestureStart);
    document.removeEventListener('touchstart', onDocumentTouchStart);
    document.removeEventListener('touchmove', onDocumentTouchMove);

    if (root.parentElement === rootElement) {
      rootElement.removeChild(root);
    }
  }

  return {
    getState,
    consumePresses,
    setPhase,
    setVisible,
    onHaptic,
    isEnabled: () => enabled && visible,
    isPortraitBlocked: () => portraitBlocked,
    setMutedVisual,
    onStatusChange,
    dispose,
  };
}
