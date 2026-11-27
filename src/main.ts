// src/main.ts

import * as THREE from 'three';
import { setAudioPaused } from './audio/audioManager';
import { createMusicDirector } from './audio/music/musicDirector';
import { createMusicPlayer } from './audio/music/musicPlayer';
import { createSound, type SoundSnapshot } from './audio/sound';
import {
  CONFIG,
  type AiDifficulty,
  type GraphicsPreset,
  type VisualPresetName,
} from './config';
import { buildCourseConfigFromDefinition, Course, type TrackFrame } from './core/course';
import { createAttractionSystem, type AttractionSystem } from './core/attractions';
import {
  createHazardEffectsTracker,
  type AttractionEvent,
} from './core/hazardEffects';
import { createWrongWayDetector } from './core/wrongWay';
import { getCourse, getLastCourseId, listCourses, setLastCourseId } from './courses';
import {
  copyCarState,
  getCarPose,
  interpolateCarState,
  respawnAt,
  stepCar,
  type CarPose,
  type CarState,
  type PhysicsEvent,
} from './core/physics';
import { resolveCarCollisions } from './core/collisions';
import { applyGridStart, ensureCarsForCourse } from './core/gridStart';
import { updateRouteTransitions } from './core/routeTransitions';
import { createAiDrivers } from './core/ai';
import { createStandingsTracker, type RacerStandingEntry } from './core/standings';
import {
  applyManualResetPenalty,
  buildClassification,
  createRaceState,
  getRespawnTarget,
  markUnfinishedAsDnfAndFinalize,
  pauseRaceClock,
  refreshRaceRecords,
  restartRace,
  resumeRaceClock,
  returnToTitle,
  startCountdown,
  updateOpponentProgress,
  updateRace,
  type FinishResultData,
  type RaceEvent,
  type RaceState,
} from './core/state';
import { createKeyboardControls, type CarInput } from './input/controls';
import { createTouchControls, requestLandscapeOrientation } from './input/touch';
import {
  createAttractionManager,
  type AttractionManager,
} from './render/attractions/attractionManager';
import { createRaceEventBus, type GameFlowState } from './core/raceEvents';
import { createIntroCamera, isReducedMotionPreferred } from './camera/introCamera';
import { buildBridgeMesh, type BridgeVisual } from './render/bridge';
import { createCarFleet, type CarFleetVisual } from './render/carFleet';
import type { CarDesignId } from './render/carDesigns';
import { ChaseCamera } from './render/chaseCamera';
import { buildGates, type GatesVisual } from './render/gates';
import { createParticles } from './render/particles';
import { createPodiumScene, type PodiumSceneHandle } from './render/podium/podiumScene';
import { createPostFx } from './render/postfx';
import { createQualityManager, detectInitialQuality, type QualityLevel } from './render/quality';
import { createSceneContext, RendererInitError, type SceneContext } from './render/scene';
import { buildShortcutGates, type ShortcutGateVisual } from './render/shortcutGate';
import { buildTrackMesh, type TrackVisual } from './render/track';
import { buildTrackAccents, type TrackAccentsVisual } from './render/trackAccents';
import { buildTunnelMesh, type TunnelVisual } from './render/tunnel';
import {
  clearRecords,
  exportSummaryText,
  getRecords,
  type CourseRecords,
} from './services/records';
import { createCourseSelect, type CourseSelectHandle } from './ui/courseCard';
import {
  disposeErrorOverlay,
  isDebugUrlEnabled,
  isSafeUrlEnabled,
  logErrorOverlay,
} from './ui/errorOverlay';
import {
  createHud,
  disposeHud,
  hideAirtimePopup,
  hideBenchmarkResults,
  hideCountdownOverlay,
  hideFinishScreen,
  hideLapPopup,
  hideLoadingOverlay,
  hideModalScreens,
  hideSplitPopup,
  hideZoneToast,
  setGraphicsUiState,
  setHudProgressCheckpoints,
  setStartButtonLoading,
  showAirtimePopup,
  showBenchmarkResults,
  showContextLostOverlay,
  showCountdownOverlay,
  showFinishScreen,
  showHazardToast,
  showLapPopup,
  showLastLapBanner,
  showLoadingOverlay,
  showOvertakeToast,
  showRingBoostToast,
  showSafeModeNotice,
  showShortcutToast,
  showSplitPopup,
  showZoneToast,
  syncFinishDifficulty,
  updateDebugMetricsOverlay,
  updateHud,
  updateTitleScreen,
  type HudViewModel,
  type PresetBenchmarkEntry,
} from './ui/hud';
import { createIntroBanner } from './ui/introBanner';
import { createScreenTransition } from './ui/transitions';
import {
  disposeReportOverlay,
  isReportOverlayOpen,
  probeCapabilitiesFromGl,
  showReportOverlay,
  updateReportOverlay,
  type DeviceReportSnapshot,
} from './ui/reportOverlay';

interface DebugOverlay {
  update: (
    nowMs: number,
    carState: CarState,
    raceState: RaceState,
    course: Course,
    qualityLevel: QualityLevel,
    presetName: VisualPresetName,
    carDesignId: CarDesignId,
  ) => void;
  dispose: () => void;
}

function createDebugOverlay(container: HTMLElement): DebugOverlay | null {
  if (!CONFIG.debug.showFps) {
    return null;
  }

  const panel = document.createElement('div');
  panel.style.position = 'fixed';
  panel.style.top = '10px';
  panel.style.left = '10px';
  panel.style.padding = '6px 10px';
  panel.style.borderRadius = '6px';
  panel.style.background = 'rgba(15, 23, 42, 0.78)';
  panel.style.color = CONFIG.hud.colors.accentYellow;
  panel.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace';
  panel.style.fontSize = '12px';
  panel.style.fontWeight = '700';
  panel.style.lineHeight = '1.45';
  panel.style.letterSpacing = '0.03em';
  panel.style.pointerEvents = 'none';
  panel.style.userSelect = 'none';
  panel.style.whiteSpace = 'pre';
  panel.style.zIndex = '30';
  panel.textContent = 'FPS: --';
  container.appendChild(panel);

  const tmpFrame = {
    s: 0,
    position: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
    up: new THREE.Vector3(),
    right: new THREE.Vector3(),
    width: CONFIG.course.trackWidth,
    bank: 0,
  };

  let frameCount = 0;
  let lastSampleMs = performance.now();
  let displayedFps = '--';

  return {
    update(
      nowMs: number,
      carState: CarState,
      raceState: RaceState,
      course: Course,
      qualityLevel: QualityLevel,
      presetName: VisualPresetName,
      carDesignId: CarDesignId,
    ): void {
      frameCount++;
      const elapsedSec = (nowMs - lastSampleMs) / 1000;
      if (elapsedSec >= CONFIG.debug.fpsSampleIntervalSec) {
        displayedFps = String(Math.round(frameCount / elapsedSec));
        frameCount = 0;
        lastSampleMs = nowMs;
      }

      const debugRoute = course.getRoute(carState.routeId);
      const activeS = carState.mode === 'grounded' ? carState.s : carState.sApprox;
      debugRoute.getFrameAt(activeS, tmpFrame);
      const seg = debugRoute.getSegmentAt(activeS);
      const speedMs =
        carState.mode === 'grounded' ? Math.abs(carState.vForward) : carState.worldVel.length();
      const speedKmh = Math.round(speedMs * 3.6);
      const pitchDeg = Math.round(
        THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(tmpFrame.tangent.y, -1, 1))),
      );
      const bankDeg = Math.round(THREE.MathUtils.radToDeg(tmpFrame.bank));
      const yawDeg = THREE.MathUtils.radToDeg(carState.yaw);

      const lapInfo = raceState.laps > 1 ? ` | LAP: ${raceState.currentLap}/${raceState.laps}` : '';
      panel.textContent =
        `FPS: ${displayedFps} | DESIGN: ${carDesignId.toUpperCase()} | PRESET: ${presetName.toUpperCase()} | QUAL: ${qualityLevel.toUpperCase()} | PHASE: ${raceState.phase} | ROUTE: ${carState.routeId.toUpperCase()} | MODE: ${carState.mode.toUpperCase()} | SPD: ${speedKmh} km/h\n` +
        `POS: s=${carState.s.toFixed(1)}m sApprox=${carState.sApprox.toFixed(1)}m lat=${carState.lateral.toFixed(2)}m | yaw=${yawDeg.toFixed(1)}° vLat=${carState.vLateral.toFixed(2)}m/s steer=${carState.steer.toFixed(2)} rail=${carState.railContactTimer.toFixed(2)}s\n` +
        `CP: next=${raceState.nextCheckpointIndex}/${raceState.totalCheckpoints}${lapInfo} | BOOST: ${carState.boostTimeLeft.toFixed(2)}s | AIR: ${carState.airtime.toFixed(2)}s\n` +
        `SEG: #${seg.index} ${seg.type} (${Math.round(seg.progress * 100)}%) | PITCH: ${pitchDeg}° BANK: ${bankDeg}°`;
    },
    dispose(): void {
      if (panel.parentElement === container) {
        container.removeChild(panel);
      }
    },
  };
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) {
    return false;
  }
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

function extractErrorInfo(err: unknown): { message: string; file?: string; line?: number } {
  if (err instanceof Error) {
    const stackLines = (err.stack || '').split('\n');
    for (const raw of stackLines) {
      const match = raw.match(/(https?:\/\/[^\s)]+|\/[^\s)]+\.[tj]sx?):(\d+)(?::\d+)?/);
      if (match) {
        return {
          message: err.message || 'runtime error',
          file: match[1],
          line: Number.parseInt(match[2], 10),
        };
      }
    }
    return { message: err.message || 'runtime error' };
  }
  return { message: String(err ?? 'runtime error') };
}

function safeStorageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage errors
  }
}

function safeStorageRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage errors
  }
}

function detectMobileOrAndroid(): boolean {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const isMobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const hasCoarsePointer =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;
  const hasTouchPoints = typeof navigator !== 'undefined' && (navigator.maxTouchPoints ?? 0) > 0;
  return isMobileUa || hasCoarsePointer || hasTouchPoints;
}

function parseStoredPreset(raw: string | null): GraphicsPreset | null {
  if (raw === 'hemat' || raw === 'seimbang' || raw === 'penuh') {
    return raw;
  }
  return null;
}

function getDefaultBrightnessForPreset(preset: GraphicsPreset): number {
  if (preset === 'penuh') {
    return CONFIG.safeMode.brightnessDefaultFull;
  }
  if (preset === 'seimbang') {
    return CONFIG.safeMode.brightnessDefaultBalanced;
  }
  return CONFIG.safeMode.brightnessDefaultSafe;
}

function loadUserBrightness(preset: GraphicsPreset): number {
  const raw = safeStorageGet(CONFIG.safeMode.brightnessStorageKey);
  if (raw !== null) {
    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed)) {
      return THREE.MathUtils.clamp(
        parsed,
        CONFIG.safeMode.brightnessMin,
        CONFIG.safeMode.brightnessMax,
      );
    }
  }
  return getDefaultBrightnessForPreset(preset);
}

export async function bootstrap(): Promise<void> {
  const foundContainer = document.getElementById('app');
  if (!foundContainer) {
    throw new Error('Root container #app not found.');
  }
  const container: HTMLElement = foundContainer;

  let activePreset: VisualPresetName = CONFIG.visual.activePreset;
  let activeCarDesign: CarDesignId = CONFIG.car.visual.designId;

  const isMobileDevice = detectMobileOrAndroid();
  const urlSafe = isSafeUrlEnabled();
  const safeReasons: string[] = [];
  if (urlSafe) {
    safeReasons.push('url:?safe');
  }

  const addSafeReason = (reason: string): void => {
    if (reason && !safeReasons.includes(reason)) {
      safeReasons.push(reason);
    }
  };

  const storedPreset = parseStoredPreset(safeStorageGet(CONFIG.safeMode.presetStorageKey));
  let manualPresetSelected = !urlSafe && storedPreset !== null;
  const initialRequestedPreset: GraphicsPreset = urlSafe
    ? 'hemat'
    : storedPreset ?? (isMobileDevice ? 'seimbang' : 'penuh');

  const detectedQuality = detectInitialQuality(CONFIG.quality);
  let sceneCtx: SceneContext = createSceneContext(
    container,
    initialRequestedPreset === 'hemat' ? 'mobile' : detectedQuality,
    initialRequestedPreset === 'hemat',
    initialRequestedPreset,
  );
  let graphicsPreset: GraphicsPreset = sceneCtx.graphicsPreset;
  let safeMode = sceneCtx.safeMode;
  if (sceneCtx.rendererFallbackUsed) {
    addSafeReason('webgl-fallback');
  }
  if (sceneCtx.isSoftwareGl) {
    addSafeReason('software-gl');
  }

  let userBrightness = loadUserBrightness(graphicsPreset);
  sceneCtx.applyBrightness(userBrightness);

  const debugOverlay = createDebugOverlay(container);
  const sound = createSound();
  sound.init();
  sound.unlock();
  const musicPlayer = createMusicPlayer(sound.getAudioManager(), isMobileDevice);
  musicPlayer.init();

  const touchControls = createTouchControls(container, CONFIG.touch);
  touchControls.setMutedVisual(sound.getMuted());

  let selectedCourseId = getLastCourseId();
  let loadedCourseId = selectedCourseId;
  let activeCourseDef = getCourse(selectedCourseId);
  let course = new Course(buildCourseConfigFromDefinition(activeCourseDef));
  let raceState = createRaceState(course);
  const wrongWayDetector = createWrongWayDetector();
  let wrongWayActive = false;

  const isValidDifficulty = (v: string | null): v is AiDifficulty =>
    v === 'mudah' || v === 'sedang' || v === 'sulit';
  const storedDiff = safeStorageGet(CONFIG.ai.difficultyStorageKey);
  let aiDifficulty: AiDifficulty = isValidDifficulty(storedDiff)
    ? storedDiff
    : CONFIG.ai.defaultDifficulty;

  const storedAttr = safeStorageGet(CONFIG.attractions.storageKey);
  let attractionsEnabled =
    storedAttr === 'off'
      ? false
      : storedAttr === 'on'
        ? true
        : CONFIG.attractions.defaultEnabled;

  let attractionSystem: AttractionSystem = createAttractionSystem(
    course,
    attractionsEnabled,
    aiDifficulty,
  );
  const hazardEffects = createHazardEffectsTracker(course.getRacers());
  const attractionEvents: AttractionEvent[] = [];
  const ffAttractionEvents: AttractionEvent[] = [];
  const envScratch = { gripMultiplier: 1, lateralAccel: 0 };
  const ffEnvScratch = { gripMultiplier: 1, lateralAccel: 0 };

  let lastFinishData: FinishResultData | null = null;
  let lastFinishRecords: CourseRecords | null = null;

  let onConfirmFromUi: () => void = () => {};
  let onReturnToMenuFromUi: () => void = () => {};
  let onClearRecordsFromUi: () => void = () => {};
  let onSelectPresetFromUi: (preset: GraphicsPreset) => void = () => {};
  let onSelectAiDifficultyFromUi: (diff: AiDifficulty) => void = () => {};
  let onToggleAttractionsFromUi: () => void = () => {};
  let onCycleMinimapFromUi: () => void = () => {};
  let onChangeBrightnessFromUi: (value: number) => void = () => {};
  let onResetBrightnessFromUi: () => void = () => {};
  let onMeasureLumaFromUi: () => number | null = () => null;
  let onRunBenchFromUi: () => void = () => {};
  let onGearMuteFromUi: () => void = () => {};
  let onToggleMusicFromUi: () => void = () => {};
  let onChangeMusicVolumeFromUi: (value: number) => void = () => {};
  let onOpenReportFromUi: () => void = () => {};

  const hud = createHud(container, {
    onStartRace: () => {
      if (raceState.phase === 'TITLE') {
        onConfirmFromUi();
      }
    },
    onRetryRace: () => {
      if (raceState.phase !== 'TITLE') {
        onConfirmFromUi();
      }
    },
    onReturnToMenu: () => {
      onReturnToMenuFromUi();
    },
    onCopyResult: async () => {
      if (!lastFinishData) {
        return false;
      }
      const summary = exportSummaryText(
        {
          ...lastFinishData,
          position:
            (lastFinishData.totalRacers ?? 1) > 1 ? lastFinishData.playerPosition : undefined,
        },
        {
          id: course.getId(),
          name: course.getName(),
          medals: course.getMedals(),
        },
      );
      return copyTextToClipboard(summary);
    },
    onClearRecords: () => {
      onClearRecordsFromUi();
    },
    onSelectGraphicsPreset: (preset) => {
      onSelectPresetFromUi(preset);
    },
    onSelectAiDifficulty: (diff) => {
      onSelectAiDifficultyFromUi(diff);
    },
    onToggleAttractions: () => {
      onToggleAttractionsFromUi();
    },
    onCycleMinimap: () => {
      onCycleMinimapFromUi();
    },
    onChangeBrightness: (value) => {
      onChangeBrightnessFromUi(value);
    },
    onResetBrightness: () => {
      onResetBrightnessFromUi();
    },
    onMeasureLuminance: () => onMeasureLumaFromUi(),
    onRunPresetBenchmark: () => {
      onRunBenchFromUi();
    },
    onGearCheckpointReset: () => {
      touchControls.triggerCheckpointReset();
    },
    onGearRestartRace: () => {
      touchControls.triggerRestartRace();
    },
    onGearToggleMute: () => {
      onGearMuteFromUi();
    },
    onGearToggleSteerMode: () => {
      touchControls.toggleSteerMode();
    },
    onGearToggleAutoThrottle: () => {
      touchControls.toggleAutoThrottle();
    },
    onGearToggleFullscreen: () => {
      void touchControls.toggleFullscreen();
    },
    onToggleMusic: () => {
      onToggleMusicFromUi();
    },
    onChangeMusicVolume: (value) => {
      onChangeMusicVolumeFromUi(value);
    },
    onOpenReport: () => {
      onOpenReportFromUi();
    },
  });
  hud.minimap.setCourse(course, attractionSystem);
  hud.minimap.setAttractionsVisible(attractionsEnabled);

  function handleAudioButtonClick(): void {
    sound.unlock();
    const nextMuted = sound.toggleMute();
    musicPlayer.setTotalMuted(nextMuted);
    touchControls.setMutedVisual(nextMuted);
    hud.audioBtnEl.blur();
  }
  hud.audioBtnEl.addEventListener('click', handleAudioButtonClick);

  let startGridSlot = course.getGridSlots(course.getRacers())[0];
  let isClosedCourse = course.isClosed();
  let finishS = course.getFinishS();
  let lapLength = Math.max(1, course.getLength());
  let progressSpanS = isClosedCourse ? lapLength : Math.max(1, finishS - startGridSlot.s);

  function syncCourseCheckpointsHud(): void {
    const checkpointRatios = course
      .getCheckpoints()
      .map((cp) =>
        THREE.MathUtils.clamp(
          (isClosedCourse ? cp.s : cp.s - startGridSlot.s) / progressSpanS,
          0,
          1,
        ),
      );
    setHudProgressCheckpoints(hud, checkpointRatios);
  }
  syncCourseCheckpointsHud();

  let bounds = course.getBounds();
  sceneCtx.setRoomBounds(bounds);

  let trackVisual: TrackVisual = buildTrackMesh(
    course,
    sceneCtx.maxAnisotropy,
    activePreset,
    safeMode,
    graphicsPreset,
  );
  sceneCtx.scene.add(trackVisual.group);

  let gates: GatesVisual = buildGates(course, sceneCtx.maxAnisotropy, graphicsPreset);
  sceneCtx.scene.add(gates.group);

  let shortcutGateVisual: ShortcutGateVisual = buildShortcutGates(
    course,
    sceneCtx.maxAnisotropy,
    graphicsPreset,
  );
  sceneCtx.scene.add(shortcutGateVisual.group);

  let orbitRadius = Math.max(
    CONFIG.camera.orbitMinRadius,
    bounds.radius * CONFIG.camera.orbitRadiusScale,
  );
  sceneCtx.setOrbitTarget(bounds.center, orbitRadius, CONFIG.camera.orbitHeight);

  let carFleet: CarFleetVisual = createCarFleet({
    course,
    playerDesignId: activeCarDesign,
    maxAnisotropy: sceneCtx.maxAnisotropy,
    presetName: activePreset,
    graphicsPreset,
    isMobile: isMobileDevice,
  });
  sceneCtx.scene.add(carFleet.group);

  let chaseCamera = new ChaseCamera(sceneCtx.camera);
  const controls = createKeyboardControls(touchControls);

  let particles: ReturnType<typeof createParticles>;
  let postfx: ReturnType<typeof createPostFx>;
  let attractionManager: AttractionManager;

  const createActiveQualityManager = (isSafe: boolean): ReturnType<typeof createQualityManager> =>
    createQualityManager(
      isSafe ? { ...CONFIG.quality, initialOverride: 'mobile' } : CONFIG.quality,
      (level) => {
        const effectiveLevel: QualityLevel = safeMode ? 'mobile' : level;
        sceneCtx.setQuality(effectiveLevel, raceState.phase === 'TITLE');
        particles?.setQuality(effectiveLevel);
        postfx?.setQuality(effectiveLevel);
        attractionManager?.setQuality(graphicsPreset, effectiveLevel);
      },
    );

  let qualityManager = createActiveQualityManager(safeMode);

  const initialQuality: QualityLevel = safeMode ? 'mobile' : qualityManager.getLevel();
  sceneCtx.setQuality(initialQuality, true);
  sceneCtx.setTheme(course, initialQuality);

  let bridgeVisual: BridgeVisual = buildBridgeMesh(
    course,
    (x, z) => sceneCtx.getGroundY(x, z),
    sceneCtx.maxAnisotropy,
    activePreset,
    graphicsPreset,
  );
  sceneCtx.scene.add(bridgeVisual.group);

  let tunnelVisual: TunnelVisual = buildTunnelMesh(
    course,
    sceneCtx.maxAnisotropy,
    activePreset,
    initialQuality,
    graphicsPreset,
  );
  sceneCtx.scene.add(tunnelVisual.group);

  let trackAccentsVisual: TrackAccentsVisual = buildTrackAccents(
    course,
    sceneCtx.maxAnisotropy,
    activePreset,
    graphicsPreset,
  );
  sceneCtx.scene.add(trackAccentsVisual.group);

  attractionManager = createAttractionManager(
    sceneCtx.scene,
    course,
    attractionSystem,
    graphicsPreset,
    initialQuality,
  );

  particles = createParticles(sceneCtx.scene, initialQuality);
  postfx = createPostFx(
    sceneCtx.renderer,
    sceneCtx.scene,
    sceneCtx.camera,
    initialQuality,
    sceneCtx.isSoftwareGl,
    graphicsPreset,
    isMobileDevice,
  );
  const initialViewport = sceneCtx.getViewportSize();
  postfx.resize(initialViewport.width, initialViewport.height);

  function syncHudPalette(name: VisualPresetName): void {
    const hudColors = CONFIG.visual.presets[name].hud;
    hud.root.classList.toggle('sr-palette-pastel', name === 'pastel');
    const stops = hud.root.querySelectorAll('#srSpeedoGrad stop');
    if (stops.length >= 3) {
      stops[0].setAttribute('stop-color', hudColors.accentCyan);
      stops[1].setAttribute('stop-color', hudColors.accentYellow);
      stops[2].setAttribute('stop-color', hudColors.accentOrange);
    }
  }

  function applyPalette(name: VisualPresetName): void {
    activePreset = name;
    sceneCtx.applyPalette(name);
    sceneCtx.applyBrightness(userBrightness);
    trackVisual.applyPalette(name);
    bridgeVisual.applyPalette(name);
    tunnelVisual.applyPalette(name);
    trackAccentsVisual.applyPalette(name);
    shortcutGateVisual.applyPalette(name);
    carFleet.applyPalette(name);
    postfx.applyPalette(name);
    syncHudPalette(name);
  }

  syncHudPalette(activePreset);

  const rootContainer: HTMLElement = container;
  const debugFlagActive = CONFIG.visual.debugKeys || CONFIG.debug.showFps;
  let debugToastEl: HTMLDivElement | null = null;
  let debugToastTimeout = 0;

  function showDebugToast(text: string): void {
    if (CONFIG.debug.showFps) {
      return;
    }
    if (!debugToastEl) {
      debugToastEl = document.createElement('div');
      debugToastEl.style.position = 'fixed';
      debugToastEl.style.top = '10px';
      debugToastEl.style.left = '10px';
      debugToastEl.style.padding = '5px 9px';
      debugToastEl.style.borderRadius = '4px';
      debugToastEl.style.background = 'rgba(15, 23, 42, 0.78)';
      debugToastEl.style.color = '#FFD000';
      debugToastEl.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace';
      debugToastEl.style.fontSize = '12px';
      debugToastEl.style.fontWeight = '700';
      debugToastEl.style.pointerEvents = 'none';
      debugToastEl.style.userSelect = 'none';
      debugToastEl.style.zIndex = '30';
      rootContainer.appendChild(debugToastEl);
    }
    debugToastEl.textContent = text;
    debugToastEl.style.display = 'block';
    window.clearTimeout(debugToastTimeout);
    debugToastTimeout = window.setTimeout(() => {
      if (debugToastEl) {
        debugToastEl.style.display = 'none';
      }
    }, 2400);
  }

  function swapCarDesign(nextDesign: CarDesignId): void {
    if (nextDesign === activeCarDesign) {
      return;
    }
    activeCarDesign = nextDesign;
    carFleet.swapPlayerDesign(nextDesign, raceState.cars[0], course);
    showDebugToast(`CAR: ${activeCarDesign.toUpperCase()} | PRESET: ${activePreset.toUpperCase()}`);
  }

  function handleDebugKey(event: KeyboardEvent): void {
    if (!debugFlagActive) {
      return;
    }
    if (event.code === 'F5') {
      event.preventDefault();
      const nextPreset: VisualPresetName = activePreset === 'vivid' ? 'pastel' : 'vivid';
      applyPalette(nextPreset);
      showDebugToast(`CAR: ${activeCarDesign.toUpperCase()} | PRESET: ${activePreset.toUpperCase()}`);
    } else if (event.code === 'F6') {
      event.preventDefault();
      const nextDesign: CarDesignId = activeCarDesign === 'gt' ? 'wedge' : 'gt';
      swapCarDesign(nextDesign);
    }
  }
  if (debugFlagActive) {
    window.addEventListener('keydown', handleDebugKey);
  }

  const raceEventBus = createRaceEventBus();
  const musicDirector = createMusicDirector(musicPlayer, raceEventBus, selectedCourseId);
  const introCamera = createIntroCamera();
  const introBanner = createIntroBanner(container);
  const screenTransition = createScreenTransition(container);
  let podiumScene: PodiumSceneHandle | null = null;
  let introActive = false;
  let introPlayedForCourseId: string | null = null;
  let currentFlowState: GameFlowState = 'title';

  function setFlowState(nextState: GameFlowState): void {
    if (nextState === currentFlowState) {
      return;
    }
    const prevState = currentFlowState;
    currentFlowState = nextState;
    raceEventBus.emit('gameStateChanged', {
      state: nextState,
      prevState,
      courseId: course.getId(),
    });
  }

  function disposePodiumScene(): void {
    if (podiumScene) {
      podiumScene.dispose();
      podiumScene = null;
    }
  }

  let resizeOrientationTimer = 0;
  function handleWindowResize(): void {
    const { width, height } = sceneCtx.getViewportSize();
    postfx.resize(width, height);
    podiumScene?.resize(width, height);
    updateHud(hud, hudViewModel);
  }
  function handleWindowOrientationChange(): void {
    handleWindowResize();
    window.clearTimeout(resizeOrientationTimer);
    resizeOrientationTimer = window.setTimeout(handleWindowResize, 120);
  }
  window.addEventListener('resize', handleWindowResize);
  window.addEventListener('orientationchange', handleWindowOrientationChange);
  window.visualViewport?.addEventListener('resize', handleWindowResize);

  const prevCars: CarState[] = [];
  const renderCars: CarState[] = [];
  let aiRaceSeed = 421701;
  const aiController = createAiDrivers(course, aiDifficulty, aiRaceSeed);
  const standingsTracker = createStandingsTracker(course.getRacers());
  let latestStandings: readonly RacerStandingEntry[] = [];
  let latestPlayerRank = 1;
  let fastForwardSettled = true;
  let fastForwardSimElapsed = 0;

  onSelectAiDifficultyFromUi = (diff): void => {
    aiDifficulty = diff;
    safeStorageSet(CONFIG.ai.difficultyStorageKey, diff);
    aiController.setDifficulty(diff);
    attractionSystem.setDifficulty(diff);
    sound.unlock();
    sound.handleEvents([{ type: 'uiMove' }]);
    syncTitleUi();
    syncFinishDifficulty(hud, diff);
  };

  onToggleAttractionsFromUi = (): void => {
    attractionsEnabled = !attractionsEnabled;
    safeStorageSet(CONFIG.attractions.storageKey, attractionsEnabled ? 'on' : 'off');
    attractionSystem.setEnabled(attractionsEnabled);
    attractionManager.setEnabled(attractionsEnabled);
    hud.minimap.setAttractionsVisible(attractionsEnabled);
    sound.unlock();
    sound.handleEvents([{ type: 'uiConfirm' }]);
    syncTitleUi();
  };

  onCycleMinimapFromUi = (): void => {
    sound.unlock();
    sound.handleEvents([{ type: 'uiMove' }]);
    syncGraphicsUi();
  };

  function syncCarStateArrays(): void {
    ensureCarsForCourse(prevCars, course);
    ensureCarsForCourse(renderCars, course);
    for (let i = 0; i < raceState.cars.length; i++) {
      copyCarState(raceState.cars[i], prevCars[i]);
      copyCarState(raceState.cars[i], renderCars[i]);
    }
  }
  syncCarStateArrays();

  const renderPose: CarPose = {
    position: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
    up: new THREE.Vector3(),
    right: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
  };

  const eventPose: CarPose = {
    position: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
    up: new THREE.Vector3(),
    right: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
  };

  const wrongWayFrame: TrackFrame = {
    s: 0,
    position: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
    up: new THREE.Vector3(),
    right: new THREE.Vector3(),
    width: CONFIG.course.trackWidth,
    bank: 0,
    isGap: false,
  };

  const hudViewModel: HudViewModel = {
    phase: raceState.phase,
    resultReady: raceState.resultReady,
    introActive: false,
    speedKmh: 0,
    boost01: 0,
    progress01: 0,
    timeSeconds: 0,
    lap: raceState.currentLap,
    totalLaps: raceState.laps,
    lapTimeSeconds: 0,
    bestLapSeconds: raceState.bestLap,
    cpPassed: 0,
    cpTotal: raceState.totalCheckpoints,
    bestTime: raceState.bestTime,
    wrongWay: false,
    muted: sound.getMuted(),
    touchActive: touchControls.isEnabled(),
    position: 1,
    totalRacers: course.getRacers(),
    standings: [],
  };

  const soundSnapshot: SoundSnapshot = {
    phase: raceState.phase,
    speedNorm: 0,
    throttle: 0,
    boostActive: false,
    slip: 0,
    grounded: true,
    airborne: false,
    falling: false,
    railContact: false,
  };
  let lastThrottle = 0;

  carFleet.snapFromCars(raceState.cars, course, renderPose);

  chaseCamera.setMode('title');
  if (!CONFIG.camera.debugOrbitMode) {
    chaseCamera.snapTo(renderPose, raceState.cars[0], course);
  }

  const fixedStep = CONFIG.sim.fixedStep;
  const maxFrameDt = CONFIG.sim.maxFrameDt;

  let accumulator = 0;
  let lastFrameMs = performance.now();
  let prevOrbitAngle = 0;
  let currOrbitAngle = 0;
  let frameHandle = 0;
  let frameIsRaf = false;
  let switchDebounceTimer = 0;
  let switchRafId = 0;
  let disposed = false;
  let contextLost = false;
  let rebuilding = false;
  let isLoadingCourse = false;
  let pendingStartAfterLoad = false;
  let lastConfirmAtMs = 0;
  let renderedFrameCount = 0;
  let consecutiveErrorCount = 0;
  let firstFrameChecked = false;
  let reportOpenedForSafeErrors = false;
  let lastReportRefreshMs = 0;
  let initialProbeActive =
    isMobileDevice && !urlSafe && !manualPresetSelected && graphicsPreset === 'seimbang';
  let initialProbeElapsedSec = 0;
  let fullSlowElapsedSec = 0;
  let balancedEnvVerified = safeStorageGet(CONFIG.safeMode.normalOkStorageKey) === '1';
  let balancedEnvFailed = safeStorageGet(CONFIG.safeMode.normalTrialStorageKey) === 'failed';
  let balancedEnvTrialElapsedSec = 0;
  let balancedEnvCheckNextFrame = false;
  let pendingAutoDowngradePreset: GraphicsPreset | null = null;
  let benchmarkRunning = false;
  let benchmarkSampling = false;
  let benchmarkFrameSamplesMs: number[] = [];
  let benchmarkErrorCount = 0;
  let wallCountdownTimerId = 0;
  let startWatchdogTimerId = 0;
  let watchdogFiredForRace = false;

  const syncBalancedEnvironmentState = (): void => {
    if (
      graphicsPreset === 'seimbang' &&
      sceneCtx.canUseBalancedEnvironment() &&
      balancedEnvVerified &&
      !balancedEnvFailed
    ) {
      sceneCtx.setBalancedEnvironmentEnabled(true);
      balancedEnvCheckNextFrame = true;
    } else {
      sceneCtx.setBalancedEnvironmentEnabled(false);
      balancedEnvCheckNextFrame = false;
    }
  };
  const failBalancedEnvTrial = (): void => {
    balancedEnvFailed = true;
    balancedEnvVerified = false;
    balancedEnvCheckNextFrame = false;
    safeStorageSet(CONFIG.safeMode.normalTrialStorageKey, 'failed');
    safeStorageRemove(CONFIG.safeMode.normalOkStorageKey);
    sceneCtx.setBalancedEnvironmentEnabled(false);
  };
  syncBalancedEnvironmentState();

  let courseSelect: CourseSelectHandle;

  function cancelScheduledLoop(): void {
    if (frameHandle !== 0) {
      if (frameIsRaf) {
        window.cancelAnimationFrame(frameHandle);
      } else {
        window.clearTimeout(frameHandle);
      }
      frameHandle = 0;
      frameIsRaf = false;
    }
  }

  function clearWallCountdownTimer(): void {
    if (wallCountdownTimerId !== 0) {
      window.clearTimeout(wallCountdownTimerId);
      wallCountdownTimerId = 0;
    }
  }

  function clearStartWatchdog(): void {
    if (startWatchdogTimerId !== 0) {
      window.clearTimeout(startWatchdogTimerId);
      startWatchdogTimerId = 0;
    }
  }

  function syncGraphicsUi(measuredLuma?: number | null): void {
    setGraphicsUiState(hud, {
      preset: graphicsPreset,
      brightness: userBrightness,
      touchPrefs: touchControls.getPrefs(),
      minimapMode: hud.minimap.getSizeMode(),
      attractionsEnabled,
      attractionsAvailable: course.getId() === 'fantasy-land',
      musicEnabled: musicPlayer.isMusicEnabled(),
      musicVolume: musicPlayer.getVolume(),
      probeActive: initialProbeActive,
      benchmarkRunning,
      raceActive: raceState.phase !== 'TITLE',
      measuredLuma,
    });
  }
  syncGraphicsUi();

  function buildReportSnapshot(overrides?: Partial<DeviceReportSnapshot>): DeviceReportSnapshot {
    let diag;
    try {
      diag = sceneCtx.getDiagnostics();
    } catch {
      diag = probeCapabilitiesFromGl(null);
    }
    const musicSnap = musicPlayer.getDebugSnapshot();
    return {
      safeMode,
      safeReasons: [...safeReasons],
      quality: qualityManager.getLevel(),
      renderedFrames: renderedFrameCount,
      gameStatus: isLoadingCourse ? 'LOADING' : raceState.phase,
      countdownSec:
        raceState.phase === 'COUNTDOWN' ? raceState.countdownDisplayNumber : undefined,
      diagnostics: diag,
      music: {
        trackLabel: musicSnap.trackLabel,
        volume: musicSnap.volume,
        status: musicSnap.status,
      },
      ...overrides,
    };
  }

  onOpenReportFromUi = (): void => {
    showReportOverlay(buildReportSnapshot());
  };

  function emitDebugMetrics(nowMs: number): void {
    if (!isDebugUrlEnabled()) {
      return;
    }
    const status = isLoadingCourse ? 'LOADING' : raceState.phase;
    const playerCar = raceState.cars[0];
    const carsStatus = raceState.cars.map((car, index) => {
      const speedMs = car.mode === 'grounded' ? Math.abs(car.vForward) : car.worldVel.length();
      return {
        index,
        label: index === 0 ? 'P1' : `AI${index}`,
        routeId: car.routeId,
        mode: car.mode,
        speedKmh: speedMs * CONFIG.hud.speedScale,
        s: car.mode === 'grounded' ? car.s : car.sApprox,
        crashed: car.crashed,
      };
    });
    const aiMetrics = aiController.getMetrics();
    const musicSnap = musicPlayer.getDebugSnapshot();
    updateDebugMetricsOverlay(
      hud,
      {
        fps: qualityManager.getAverageFps(),
        avgFrameMs: qualityManager.getAverageFrameMs(),
        drawCalls: sceneCtx.renderer.info.render.calls,
        triangles: sceneCtx.renderer.info.render.triangles,
        geometries: sceneCtx.renderer.info.memory.geometries,
        textures: sceneCtx.renderer.info.memory.textures,
        status,
        countdownSec: raceState.countdownDisplayNumber,
        countdownWallMs: raceState.countdownElapsedMs,
        courseId: course.getId(),
        routeId: playerCar ? playerCar.routeId : 'main',
        quality: qualityManager.getLevel(),
        carCount: raceState.cars.length,
        aiStepMs: aiMetrics.lastStepMs,
        cars: carsStatus,
        music: {
          trackLabel: musicSnap.trackLabel,
          volume: musicSnap.volume,
          status: musicSnap.status,
        },
      },
      nowMs,
    );
  }

  function syncTitleUi(): void {
    const previewDef = getCourse(selectedCourseId);
    updateTitleScreen(hud, {
      courseName: previewDef.displayName,
      courseId: previewDef.id,
      medals: previewDef.medals,
      records: getRecords(previewDef.id, previewDef.medals),
      racers: previewDef.racers,
      aiDifficulty,
      attractionsEnabled,
    });
    courseSelect?.setSelected(previewDef.id);
    courseSelect?.refreshRecords();
    syncGraphicsUi();
  }

  function clearPendingCourseSwitch(hideOverlay = true): void {
    if (switchDebounceTimer !== 0) {
      window.clearTimeout(switchDebounceTimer);
      switchDebounceTimer = 0;
    }
    if (switchRafId !== 0) {
      window.cancelAnimationFrame(switchRafId);
      switchRafId = 0;
    }
    if (hideOverlay && !isLoadingCourse) {
      hideLoadingOverlay(hud);
    }
  }

  const handleCanvasContextLost = (event: Event): void => {
    event.preventDefault();
    if (contextLost) {
      return;
    }
    contextLost = true;
    pendingStartAfterLoad = false;
    isLoadingCourse = false;
    clearPendingCourseSwitch(false);
    clearWallCountdownTimer();
    clearStartWatchdog();
    cancelScheduledLoop();
    try {
      setAudioPaused(true);
      musicPlayer.setPaused(true);
    } catch {
      // Ignore audio pause errors during context loss
    }
    logErrorOverlay('webgl context lost');
    hideLoadingOverlay(hud);
    setStartButtonLoading(hud, false, false);
    showContextLostOverlay(hud);
  };

  const handleCanvasContextRestored = (): void => {
    if (disposed || !contextLost) {
      return;
    }
    contextLost = false;
    hud.contextLostOverlayEl.classList.add('sr-hud-hidden');
    try {
      setAudioPaused(paused);
      musicPlayer.setPaused(paused);
    } catch {
      // Ignore audio resume errors
    }
    void rebuildGraphicsPipeline(graphicsPreset, 'webglcontextrestored');
  };

  function bindCanvasContextEvents(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('webglcontextlost', handleCanvasContextLost);
    canvas.addEventListener('webglcontextrestored', handleCanvasContextRestored);
  }

  function unbindCanvasContextEvents(canvas: HTMLCanvasElement): void {
    canvas.removeEventListener('webglcontextlost', handleCanvasContextLost);
    canvas.removeEventListener('webglcontextrestored', handleCanvasContextRestored);
  }

  bindCanvasContextEvents(sceneCtx.renderer.domElement);

  async function precompileShaders(label = 'Memuat arena...'): Promise<void> {
    if (disposed || contextLost) {
      return;
    }
    showLoadingOverlay(hud, label, 85);
    emitDebugMetrics(performance.now());
    const renderer = sceneCtx.renderer as THREE.WebGLRenderer & {
      compileAsync?: (scene: THREE.Scene, camera: THREE.Camera) => Promise<void>;
    };
    try {
      const gl = renderer.getContext();
      const hasParallel = Boolean(gl.getExtension('KHR_parallel_shader_compile'));
      if (hasParallel && typeof renderer.compileAsync === 'function') {
        let timeoutId = 0;
        await Promise.race([
          renderer.compileAsync(sceneCtx.scene, sceneCtx.camera).finally(() => {
            window.clearTimeout(timeoutId);
          }),
          new Promise<void>((resolve) => {
            timeoutId = window.setTimeout(resolve, CONFIG.render.shaderPrecompileTimeoutMs);
          }),
        ]);
      }
    } catch (err) {
      const info = extractErrorInfo(err);
      logErrorOverlay(info.message, info.file, info.line);
    }
    if (!disposed && !contextLost) {
      showLoadingOverlay(hud, label, 100);
    }
  }

  let zoneStarts = course.getZoneStarts();
  const enteredZonesInLap = new Set<number>();
  let lastZoneLap = raceState.currentLap;
  let shownStartBannerInLap = false;

  function resetZoneTracking(): void {
    enteredZonesInLap.clear();
    lastZoneLap = raceState.currentLap;
    shownStartBannerInLap = false;
    hideZoneToast(hud);
  }

  function disposeCurrentCourseVisuals(): void {
    attractionManager.dispose();
    sceneCtx.scene.remove(trackVisual.group);
    trackVisual.dispose();
    sceneCtx.scene.remove(bridgeVisual.group);
    bridgeVisual.dispose();
    sceneCtx.scene.remove(tunnelVisual.group);
    tunnelVisual.dispose();
    sceneCtx.scene.remove(trackAccentsVisual.group);
    trackAccentsVisual.dispose();
    sceneCtx.scene.remove(gates.group);
    gates.dispose();
    sceneCtx.scene.remove(shortcutGateVisual.group);
    shortcutGateVisual.dispose();
    sceneCtx.scene.remove(carFleet.group);
    carFleet.dispose();
  }

  function buildCourseObjects(
    targetDef: ReturnType<typeof getCourse>,
    showProgress: boolean,
  ): void {
    if (showProgress) {
      showLoadingOverlay(hud, 'Memuat arena...', 30);
    }
    course = new Course(buildCourseConfigFromDefinition(targetDef));
    raceState = createRaceState(course);
    aiRaceSeed = (aiRaceSeed + 1013) >>> 0;
    aiController.reset(course, aiDifficulty, aiRaceSeed);
    attractionSystem = createAttractionSystem(course, attractionsEnabled, aiDifficulty);
    hazardEffects.reset(course.getRacers());
    standingsTracker.reset();
    latestStandings = [];
    latestPlayerRank = 1;
    fastForwardSettled = true;
    fastForwardSimElapsed = 0;
    zoneStarts = course.getZoneStarts();
    resetZoneTracking();
    wrongWayDetector.reset();
    wrongWayActive = false;

    startGridSlot = course.getGridSlots(course.getRacers())[0];
    isClosedCourse = course.isClosed();
    finishS = course.getFinishS();
    lapLength = Math.max(1, course.getLength());
    progressSpanS = isClosedCourse ? lapLength : Math.max(1, finishS - startGridSlot.s);
    syncCourseCheckpointsHud();

    bounds = course.getBounds();
    sceneCtx.setRoomBounds(bounds);
    sceneCtx.setTheme(course, qualityManager.getLevel());

    if (showProgress) {
      showLoadingOverlay(hud, 'Memuat arena...', 55);
    }

    trackVisual = buildTrackMesh(
      course,
      sceneCtx.maxAnisotropy,
      activePreset,
      safeMode,
      graphicsPreset,
    );
    sceneCtx.scene.add(trackVisual.group);

    bridgeVisual = buildBridgeMesh(
      course,
      (x, z) => sceneCtx.getGroundY(x, z),
      sceneCtx.maxAnisotropy,
      activePreset,
      graphicsPreset,
    );
    sceneCtx.scene.add(bridgeVisual.group);

    tunnelVisual = buildTunnelMesh(
      course,
      sceneCtx.maxAnisotropy,
      activePreset,
      safeMode ? 'mobile' : qualityManager.getLevel(),
      graphicsPreset,
    );
    sceneCtx.scene.add(tunnelVisual.group);

    if (showProgress) {
      showLoadingOverlay(hud, 'Memuat arena...', 75);
    }

    trackAccentsVisual = buildTrackAccents(
      course,
      sceneCtx.maxAnisotropy,
      activePreset,
      graphicsPreset,
    );
    sceneCtx.scene.add(trackAccentsVisual.group);

    gates = buildGates(course, sceneCtx.maxAnisotropy, graphicsPreset);
    sceneCtx.scene.add(gates.group);

    shortcutGateVisual = buildShortcutGates(course, sceneCtx.maxAnisotropy, graphicsPreset);
    shortcutGateVisual.applyPalette(activePreset);
    sceneCtx.scene.add(shortcutGateVisual.group);

    attractionManager = createAttractionManager(
      sceneCtx.scene,
      course,
      attractionSystem,
      graphicsPreset,
      safeMode ? 'mobile' : qualityManager.getLevel(),
    );
    hud.minimap.setCourse(course, attractionSystem);
    hud.minimap.setAttractionsVisible(attractionsEnabled);

    orbitRadius = Math.max(
      CONFIG.camera.orbitMinRadius,
      bounds.radius * CONFIG.camera.orbitRadiusScale,
    );
    sceneCtx.setOrbitTarget(bounds.center, orbitRadius, CONFIG.camera.orbitHeight);

    carFleet = createCarFleet({
      course,
      playerDesignId: activeCarDesign,
      maxAnisotropy: sceneCtx.maxAnisotropy,
      presetName: activePreset,
      graphicsPreset,
      isMobile: isMobileDevice,
    });
    sceneCtx.scene.add(carFleet.group);

    lastFinishData = null;
    lastFinishRecords = null;
    lastThrottle = 0;
    applyGridStart(raceState.cars, course, prevCars);
    syncCarStateArrays();
    particles.reset();
    postfx.setSpeedIntensity(0);
    hideAirtimePopup(hud);
    hideSplitPopup(hud);
    hideLapPopup(hud);
    hideCountdownOverlay(hud);
    hideFinishScreen(hud);

    carFleet.snapFromCars(raceState.cars, course, renderPose);

    chaseCamera.setMode('title');
    if (!CONFIG.camera.debugOrbitMode) {
      chaseCamera.snapTo(renderPose, raceState.cars[0], course);
    }

    hudViewModel.phase = raceState.phase;
    hudViewModel.resultReady = raceState.resultReady;
    hudViewModel.lap = raceState.currentLap;
    hudViewModel.totalLaps = raceState.laps;
    hudViewModel.cpPassed = 0;
    hudViewModel.cpTotal = raceState.totalCheckpoints;
    hudViewModel.bestTime = raceState.bestTime;
    hudViewModel.bestLapSeconds = raceState.bestLap;
    hudViewModel.wrongWay = false;
    hudViewModel.position = 1;
    hudViewModel.totalRacers = course.getRacers();
    hudViewModel.standings = latestStandings;

    touchControls.setPhase(raceState.phase);
    sound.setPhase(raceState.phase);
    lastFrameMs = performance.now();
    accumulator = 0;
  }

  async function loadCourse(id: string): Promise<void> {
    if (isLoadingCourse || disposed || contextLost) {
      return;
    }
    clearPendingCourseSwitch(false);
    const prevCourseId = loadedCourseId;
    const nextDef = getCourse(id);

    isLoadingCourse = true;
    setStartButtonLoading(hud, true, pendingStartAfterLoad);
    showLoadingOverlay(hud, 'Memuat arena...', 10);
    emitDebugMetrics(performance.now());

    try {
      selectedCourseId = nextDef.id;
      activeCourseDef = nextDef;

      disposeCurrentCourseVisuals();
      buildCourseObjects(nextDef, true);
      loadedCourseId = nextDef.id;
      await precompileShaders('Memuat arena...');
      syncTitleUi();
    } catch (err) {
      const info = extractErrorInfo(err);
      logErrorOverlay(info.message, info.file, info.line);
      pendingStartAfterLoad = false;

      const prevDef = getCourse(prevCourseId);
      selectedCourseId = prevDef.id;
      loadedCourseId = prevDef.id;
      activeCourseDef = prevDef;
      setLastCourseId(prevDef.id);
      try {
        disposeCurrentCourseVisuals();
        buildCourseObjects(prevDef, false);
        await precompileShaders('Memuat arena...');
      } catch (rollbackErr) {
        const rbInfo = extractErrorInfo(rollbackErr);
        logErrorOverlay(rbInfo.message, rbInfo.file, rbInfo.line);
      }
      syncTitleUi();
    } finally {
      isLoadingCourse = false;
      setStartButtonLoading(hud, false, false);
      hideLoadingOverlay(hud);
      emitDebugMetrics(performance.now());
      if (pendingStartAfterLoad && !disposed && !contextLost && raceState.phase === 'TITLE') {
        pendingStartAfterLoad = false;
        handleConfirmAction();
      }
    }
  }

  function selectArena(id: string): void {
    if (raceState.phase !== 'TITLE' || isLoadingCourse || contextLost) {
      return;
    }
    const nextDef = getCourse(id);
    if (nextDef.id === selectedCourseId && switchDebounceTimer === 0 && switchRafId === 0) {
      return;
    }
    selectedCourseId = nextDef.id;
    setLastCourseId(nextDef.id);
    introPlayedForCourseId = null;
    sound.unlock();
    sound.handleEvents([{ type: 'uiMove' }]);
    musicDirector.onArenaSelected(nextDef.id);
    syncTitleUi();

    clearPendingCourseSwitch();
    if (nextDef.id === loadedCourseId) {
      return;
    }

    switchDebounceTimer = window.setTimeout(() => {
      switchDebounceTimer = 0;
      if (
        disposed ||
        contextLost ||
        isLoadingCourse ||
        raceState.phase !== 'TITLE' ||
        selectedCourseId === loadedCourseId
      ) {
        return;
      }
      showLoadingOverlay(hud, 'Memuat arena...', 5);
      switchRafId = window.requestAnimationFrame(() => {
        switchRafId = 0;
        if (disposed || contextLost) {
          return;
        }
        if (raceState.phase === 'TITLE' && selectedCourseId !== loadedCourseId) {
          void loadCourse(selectedCourseId);
        } else {
          hideLoadingOverlay(hud);
        }
      });
    }, CONFIG.courseSelect.debounceMs);
  }

  courseSelect = createCourseSelect(
    hud.titleCourseSelectSlotEl,
    listCourses(),
    selectedCourseId,
    (id) => {
      selectArena(id);
    },
    () => {
      if (raceState.phase === 'TITLE') {
        onConfirmFromUi();
      }
    },
  );
  syncTitleUi();

  touchControls.setPhase(raceState.phase);

  let paused = false;

  function scheduleLoopStart(): void {
    if (disposed || contextLost || rebuilding) {
      return;
    }
    cancelScheduledLoop();
    if (sceneCtx.isSoftwareGl) {
      frameIsRaf = false;
      tick(performance.now());
    } else {
      frameIsRaf = true;
      frameHandle = window.requestAnimationFrame(tick);
    }
  }

  function restartLoopOnce(): void {
    if (disposed || contextLost || rebuilding) {
      return;
    }
    lastFrameMs = performance.now();
    accumulator = 0;
    scheduleLoopStart();
  }

  async function rebuildGraphicsPipeline(
    targetPreset: GraphicsPreset,
    reason?: string,
  ): Promise<void> {
    if (disposed || rebuilding) {
      return;
    }
    rebuilding = true;
    cancelScheduledLoop();
    if (reason) {
      addSafeReason(reason);
    }

    const prevSceneCtx = sceneCtx;
    const prevCanvas = prevSceneCtx.renderer.domElement;
    unbindCanvasContextEvents(prevCanvas);

    disposePodiumScene();
    disposeCurrentCourseVisuals();
    particles.dispose();
    postfx.dispose();
    qualityManager.dispose();
    prevSceneCtx.dispose();

    const targetSafeMode = targetPreset === 'hemat';
    const targetInitialQuality: QualityLevel = targetSafeMode
      ? 'mobile'
      : detectInitialQuality(CONFIG.quality);

    try {
      sceneCtx = createSceneContext(container, targetInitialQuality, targetSafeMode, targetPreset);
    } catch (err) {
      if (err instanceof RendererInitError) {
        showReportOverlay(
          buildReportSnapshot({
            headline: 'Perangkat tidak mendukung grafis 3D',
            fatal: true,
            safeMode: true,
            safeReasons: err.attemptErrors,
            diagnostics: err.diagnostics,
          }),
        );
      }
      rebuilding = false;
      throw err;
    }

    graphicsPreset = sceneCtx.graphicsPreset;
    safeMode = sceneCtx.safeMode;
    if (sceneCtx.rendererFallbackUsed) {
      addSafeReason('webgl-fallback');
    }
    if (sceneCtx.isSoftwareGl) {
      addSafeReason('software-gl');
    }

    userBrightness = loadUserBrightness(graphicsPreset);
    sceneCtx.applyBrightness(userBrightness);

    bindCanvasContextEvents(sceneCtx.renderer.domElement);
    qualityManager = createActiveQualityManager(safeMode);
    const activeQuality: QualityLevel = safeMode ? 'mobile' : qualityManager.getLevel();
    sceneCtx.setRoomBounds(bounds);
    sceneCtx.setQuality(activeQuality, true);
    sceneCtx.setTheme(course, activeQuality);
    syncBalancedEnvironmentState();
    sceneCtx.applyBrightness(userBrightness);
    sceneCtx.setOrbitTarget(bounds.center, orbitRadius, CONFIG.camera.orbitHeight);

    trackVisual = buildTrackMesh(
      course,
      sceneCtx.maxAnisotropy,
      activePreset,
      safeMode,
      graphicsPreset,
    );
    sceneCtx.scene.add(trackVisual.group);

    bridgeVisual = buildBridgeMesh(
      course,
      (x, z) => sceneCtx.getGroundY(x, z),
      sceneCtx.maxAnisotropy,
      activePreset,
      graphicsPreset,
    );
    sceneCtx.scene.add(bridgeVisual.group);

    tunnelVisual = buildTunnelMesh(
      course,
      sceneCtx.maxAnisotropy,
      activePreset,
      activeQuality,
      graphicsPreset,
    );
    sceneCtx.scene.add(tunnelVisual.group);

    trackAccentsVisual = buildTrackAccents(
      course,
      sceneCtx.maxAnisotropy,
      activePreset,
      graphicsPreset,
    );
    sceneCtx.scene.add(trackAccentsVisual.group);

    gates = buildGates(course, sceneCtx.maxAnisotropy, graphicsPreset);
    for (let i = 0; i < raceState.nextCheckpointIndex; i++) {
      gates.setPassed(i);
    }
    gates.setActive(raceState.nextCheckpointIndex);
    sceneCtx.scene.add(gates.group);

    shortcutGateVisual = buildShortcutGates(course, sceneCtx.maxAnisotropy, graphicsPreset);
    shortcutGateVisual.applyPalette(activePreset);
    sceneCtx.scene.add(shortcutGateVisual.group);

    attractionManager = createAttractionManager(
      sceneCtx.scene,
      course,
      attractionSystem,
      graphicsPreset,
      activeQuality,
    );

    carFleet = createCarFleet({
      course,
      playerDesignId: activeCarDesign,
      maxAnisotropy: sceneCtx.maxAnisotropy,
      presetName: activePreset,
      graphicsPreset,
      isMobile: isMobileDevice,
    });
    sceneCtx.scene.add(carFleet.group);

    const playerCar = raceState.cars[0];
    const activeRoute = course.getRoute(playerCar.routeId);
    carFleet.snapFromCars(raceState.cars, course, renderPose);

    chaseCamera = new ChaseCamera(sceneCtx.camera);
    if (raceState.phase === 'TITLE') {
      chaseCamera.setMode('title');
    } else if (raceState.phase === 'FINISH') {
      chaseCamera.setMode('finish');
    } else {
      chaseCamera.setMode('chase');
    }
    if (!CONFIG.camera.debugOrbitMode) {
      chaseCamera.snapTo(renderPose, playerCar, activeRoute);
    }

    particles = createParticles(sceneCtx.scene, activeQuality);
    postfx = createPostFx(
      sceneCtx.renderer,
      sceneCtx.scene,
      sceneCtx.camera,
      activeQuality,
      sceneCtx.isSoftwareGl,
      graphicsPreset,
      isMobileDevice,
    );
    const vp = sceneCtx.getViewportSize();
    postfx.resize(vp.width, vp.height);

    consecutiveErrorCount = 0;
    firstFrameChecked = false;
    fullSlowElapsedSec = 0;
    balancedEnvTrialElapsedSec = 0;
    pendingAutoDowngradePreset = null;
    lastFrameMs = performance.now();
    accumulator = 0;
    syncGraphicsUi();
    if (isReportOverlayOpen()) {
      updateReportOverlay(buildReportSnapshot());
    }

    rebuilding = false;
    scheduleLoopStart();
  }

  async function downgradeGraphicsOnFailure(reason: string): Promise<void> {
    if (disposed || rebuilding || safeMode) {
      return;
    }
    initialProbeActive = false;
    fullSlowElapsedSec = 0;
    addSafeReason(reason);
    if (graphicsPreset === 'penuh') {
      showSafeModeNotice(hud, 'Preset diturunkan ke Seimbang agar tetap lancar');
      await rebuildGraphicsPipeline('seimbang', reason);
    } else {
      showSafeModeNotice(hud, 'Mode hemat aktif');
      await rebuildGraphicsPipeline('hemat', reason);
    }
  }

  onSelectPresetFromUi = (nextPreset: GraphicsPreset): void => {
    if (disposed || rebuilding || benchmarkRunning || nextPreset === graphicsPreset) {
      return;
    }
    if (raceState.phase !== 'TITLE') {
      showSafeModeNotice(hud, 'Ubah preset grafis di layar judul');
      return;
    }
    if (urlSafe && nextPreset !== 'hemat') {
      showSafeModeNotice(hud, 'URL ?safe aktif: hanya mode Hemat');
      return;
    }
    initialProbeActive = false;
    manualPresetSelected = true;
    safeStorageSet(CONFIG.safeMode.presetStorageKey, nextPreset);
    void rebuildGraphicsPipeline(nextPreset, `manual-${nextPreset}`).then(() => {
      if (graphicsPreset !== nextPreset) {
        showSafeModeNotice(hud, 'Perangkat membatasi preset penuh, mode Hemat aktif');
      } else {
        const label =
          nextPreset === 'hemat' ? 'Hemat' : nextPreset === 'seimbang' ? 'Seimbang' : 'Penuh';
        showSafeModeNotice(hud, `Preset ${label} aktif`);
      }
      syncGraphicsUi();
    });
  };

  onChangeBrightnessFromUi = (value: number): void => {
    userBrightness = THREE.MathUtils.clamp(
      value,
      CONFIG.safeMode.brightnessMin,
      CONFIG.safeMode.brightnessMax,
    );
    safeStorageSet(CONFIG.safeMode.brightnessStorageKey, userBrightness.toFixed(2));
    sceneCtx.applyBrightness(userBrightness);
    syncGraphicsUi();
  };

  onResetBrightnessFromUi = (): void => {
    safeStorageRemove(CONFIG.safeMode.brightnessStorageKey);
    userBrightness = getDefaultBrightnessForPreset(graphicsPreset);
    sceneCtx.applyBrightness(userBrightness);
    syncGraphicsUi();
  };

  onMeasureLumaFromUi = (): number | null => {
    const luma = postfx.measureAverageLuminance();
    syncGraphicsUi(luma);
    return luma;
  };

  onGearMuteFromUi = (): void => {
    sound.unlock();
    const nextMuted = sound.toggleMute();
    musicPlayer.setTotalMuted(nextMuted);
    touchControls.setMutedVisual(nextMuted);
    syncGraphicsUi();
  };

  onToggleMusicFromUi = (): void => {
    sound.unlock();
    musicPlayer.toggleMusicEnabled();
    sound.handleEvents([{ type: 'uiMove' }]);
    syncGraphicsUi();
  };

  onChangeMusicVolumeFromUi = (value: number): void => {
    sound.unlock();
    musicPlayer.setVolume(value);
    syncGraphicsUi();
  };

  onRunBenchFromUi = (): void => {
    if (disposed || rebuilding || benchmarkRunning || contextLost || raceState.phase !== 'TITLE') {
      return;
    }
    const runSequence = async (): Promise<void> => {
      const priorPreset = graphicsPreset;
      const priorProbe = initialProbeActive;
      initialProbeActive = false;
      benchmarkRunning = true;
      hideBenchmarkResults(hud);
      syncGraphicsUi();

      const phases: GraphicsPreset[] = ['hemat', 'seimbang', 'penuh'];
      const entries: PresetBenchmarkEntry[] = [];

      try {
        for (const phasePreset of phases) {
          if (disposed || contextLost) {
            break;
          }
          await rebuildGraphicsPipeline(phasePreset, `bench-${phasePreset}`);
          if (disposed || contextLost) {
            break;
          }
          benchmarkFrameSamplesMs = [];
          benchmarkErrorCount = 0;
          benchmarkSampling = true;
          syncGraphicsUi();

          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, 3000);
          });

          benchmarkSampling = false;
          const samples = benchmarkFrameSamplesMs;
          const avgFrameMs =
            samples.length > 0
              ? samples.reduce((acc, v) => acc + v, 0) / samples.length
              : qualityManager.getAverageFrameMs();
          const avgFps = avgFrameMs > 0.1 ? 1000 / avgFrameMs : 0;
          const luma = postfx.measureAverageLuminance();
          entries.push({
            preset: graphicsPreset,
            avgFps,
            avgFrameMs,
            luma,
            errorCount: benchmarkErrorCount,
          });
        }

        if (!disposed && !contextLost && graphicsPreset !== priorPreset) {
          await rebuildGraphicsPipeline(priorPreset, 'bench-restore');
        }
      } finally {
        benchmarkSampling = false;
        benchmarkRunning = false;
        initialProbeActive = priorProbe && graphicsPreset === 'seimbang' && !manualPresetSelected;
      }

      if (disposed || contextLost) {
        return;
      }
      const measuredLuma = postfx.measureAverageLuminance();
      const penuhEntry = entries.find((e) => e.preset === 'penuh');
      const seimbangEntry = entries.find((e) => e.preset === 'seimbang');
      const recommendedPreset: GraphicsPreset =
        penuhEntry &&
        penuhEntry.errorCount === 0 &&
        penuhEntry.avgFrameMs <= CONFIG.quality.initialProbeBalancedMaxMs
          ? 'penuh'
          : seimbangEntry &&
              seimbangEntry.errorCount === 0 &&
              seimbangEntry.avgFrameMs <= CONFIG.quality.initialProbeBalancedMaxMs
            ? 'seimbang'
            : 'hemat';

      syncGraphicsUi(measuredLuma);
      showBenchmarkResults(hud, {
        activePreset: graphicsPreset,
        recommendedPreset,
        measuredLuma,
        targetLuma: CONFIG.safeMode.targetLuma,
        entries,
      });
    };

    void runSequence();
  };

  function pumpWallCountdown(): void {
    clearWallCountdownTimer();
    if (disposed || contextLost || paused || raceState.phase !== 'COUNTDOWN') {
      return;
    }
    const now = performance.now();
    const currPlayer = raceState.cars[0];
    const carSpeedKmh =
      (currPlayer.mode === 'grounded'
        ? Math.abs(currPlayer.vForward)
        : currPlayer.worldVel.length()) * CONFIG.hud.speedScale;
    const events = updateRace(
      raceState,
      {
        s: currPlayer.s,
        sApprox: currPlayer.sApprox,
        mode: currPlayer.mode,
        routeId: currPlayer.routeId,
        routeLapOffset: currPlayer.routeLapOffset,
        speedKmh: carSpeedKmh,
      },
      course,
      0,
      undefined,
      now,
    );
    if (events.length > 0) {
      handleRaceEvents(events);
    }
    if (raceState.phase === 'COUNTDOWN') {
      const stepMs = Math.max(100, CONFIG.race.countdownStepMs);
      const elapsed = Math.max(0, raceState.countdownElapsedMs);
      const nextBoundary = Math.min(
        CONFIG.race.countdownWatchdogMs,
        (Math.floor(elapsed / stepMs) + 1) * stepMs,
      );
      const delayMs = Math.max(16, nextBoundary - elapsed + 10);
      wallCountdownTimerId = window.setTimeout(pumpWallCountdown, delayMs);
    }
  }

  function startRenderWatchdog(): void {
    clearStartWatchdog();
    watchdogFiredForRace = false;
    const baselineFrames = renderedFrameCount;
    startWatchdogTimerId = window.setTimeout(() => {
      startWatchdogTimerId = 0;
      if (disposed || contextLost || paused || rebuilding || watchdogFiredForRace) {
        return;
      }
      if (renderedFrameCount === baselineFrames) {
        watchdogFiredForRace = true;
        logErrorOverlay('render watchdog: 0 frame dalam 1.5 detik setelah Mulai');
        if (!safeMode) {
          void downgradeGraphicsOnFailure('start-watchdog').then(() => {
            showReportOverlay(
              buildReportSnapshot({
                headline: 'Preset grafis diturunkan (render sempat macet)',
              }),
            );
          });
        } else {
          restartLoopOnce();
          showReportOverlay(
            buildReportSnapshot({
              headline: 'Render belum berjalan setelah Mulai',
            }),
          );
        }
      }
    }, CONFIG.safeMode.renderWatchdogMs);
  }

  function setPaused(nextPaused: boolean): void {
    const resolved = Boolean(nextPaused);
    if (resolved === paused) {
      return;
    }
    const nowMs = performance.now();
    paused = resolved;
    try {
      setAudioPaused(paused);
      musicPlayer.setPaused(paused);
    } catch {
      // Ignore audio pause failures
    }
    if (paused) {
      clearWallCountdownTimer();
      clearStartWatchdog();
      pauseRaceClock(raceState, nowMs);
    } else {
      resumeRaceClock(raceState, nowMs);
      lastFrameMs = nowMs;
      accumulator = 0;
      if (raceState.phase === 'COUNTDOWN') {
        pumpWallCountdown();
      }
    }
  }

  function syncPauseState(): void {
    setPaused(document.hidden || touchControls.isPortraitBlocked());
  }

  const handleTouchStatusChange = (): void => {
    syncPauseState();
    syncGraphicsUi();
  };

  const unbindTouchStatus = touchControls.onStatusChange(handleTouchStatusChange);
  document.addEventListener('visibilitychange', syncPauseState);
  syncPauseState();

  function hasUnfinishedAi(): boolean {
    if (raceState.cars.length <= 1) {
      return false;
    }
    for (let i = 1; i < raceState.racerProgress.length; i++) {
      const rp = raceState.racerProgress[i];
      if (rp && !rp.finished) {
        return true;
      }
    }
    return false;
  }

  function showResolvedResults(finishData: FinishResultData): void {
    const isMulti = (finishData.totalRacers ?? 1) > 1;
    const records = lastFinishRecords ?? getRecords(course.getId(), course.getMedals());
    const presentResults = (): void => {
      if (isMulti && !podiumScene) {
        podiumScene = createPodiumScene({
          classification: finishData.classification ?? [],
          playerDesignId: activeCarDesign,
          presetName: activePreset,
          graphicsPreset,
          maxAnisotropy: sceneCtx.maxAnisotropy,
          isMobile: isMobileDevice,
          environment: sceneCtx.scene.environment,
        });
        const vp = sceneCtx.getViewportSize();
        podiumScene.resize(vp.width, vp.height);
        setFlowState('podium');
      }

      showFinishScreen(hud, {
        courseName: course.getName(),
        finish: finishData,
        records,
        aiDifficulty,
        podiumActive: Boolean(podiumScene),
      });

      const won = isMulti
        ? (finishData.playerPosition ?? 1) === 1
        : finishData.medal !== 'none';
      const outcomePayload = {
        position: finishData.playerPosition ?? 1,
        totalRacers: finishData.totalRacers ?? course.getRacers(),
        time: finishData.time,
        medal: finishData.medal,
        courseId: course.getId(),
      };
      raceEventBus.emit(won ? 'resultWin' : 'resultLose', outcomePayload);
    };

    if (isMulti && !podiumScene) {
      screenTransition.flashFade(presentResults);
    } else {
      presentResults();
    }
  }

  function stepFastForwardBatch(step: number): void {
    if (fastForwardSettled || !hasUnfinishedAi()) {
      if (!fastForwardSettled) {
        fastForwardSettled = true;
        if (lastFinishData) {
          lastFinishData.classification = buildClassification(raceState, course);
        }
        hideLoadingOverlay(hud);
      }
      return;
    }

    const batchSteps = Math.max(4, CONFIG.ai.finish.fastForwardStepMultiplier * 6);
    const maxSimSec = CONFIG.ai.finish.fastForwardTimeoutSeconds;
    const mainRoute = course.getRoute('main');

    for (let sIdx = 0; sIdx < batchSteps; sIdx++) {
      if (!hasUnfinishedAi() || fastForwardSimElapsed >= maxSimSec) {
        break;
      }
      const ffTimeSec = raceState.timer + fastForwardSimElapsed;
      attractionSystem.evaluateAtTime(ffTimeSec);
      hazardEffects.stepPrePhysics(raceState.cars, attractionSystem, step);
      aiController.stepPrePhysics(raceState.cars, course, 'RACING', step);
      for (let i = 1; i < raceState.cars.length; i++) {
        const rp = raceState.racerProgress[i];
        const car = raceState.cars[i];
        if (!car || (rp && rp.finished)) continue;
        const aiIn = aiController.sampleInput(
          i,
          raceState.cars,
          course,
          'RACING',
          step,
          attractionSystem,
          ffTimeSec,
        );
        const carRoute = course.getRoute(car.routeId);
        stepCar(car, aiIn, carRoute, step, {
          phase: 'RACING',
          respawnTarget: { s: car.lastSafeS, lateral: 0 },
          respawnRoute: mainRoute,
          env: hazardEffects.getEnvModifiers(i, ffEnvScratch),
        });
        updateRouteTransitions(car, course);
      }
      resolveCarCollisions(raceState.cars, course, step, 'RACING');
      hazardEffects.stepPostPhysics(
        raceState.cars,
        course,
        attractionSystem,
        step,
        ffAttractionEvents,
      );
      fastForwardSimElapsed += step;
      updateOpponentProgress(raceState, course, raceState.timer + fastForwardSimElapsed);
    }

    if (!hasUnfinishedAi() || fastForwardSimElapsed >= maxSimSec) {
      markUnfinishedAsDnfAndFinalize(raceState, course);
      if (lastFinishData && raceState.lastFinish) {
        lastFinishData = raceState.lastFinish;
      }
      fastForwardSettled = true;
      hideLoadingOverlay(hud);
      if (raceState.resultReady && lastFinishData) {
        showResolvedResults(lastFinishData);
      }
    }
  }

  function handleRaceEvents(events: readonly RaceEvent[]): void {
    touchControls.setPhase(raceState.phase);
    sound.setPhase(raceState.phase);
    sound.handleEvents(events);
    hudViewModel.phase = raceState.phase;
    hudViewModel.resultReady = raceState.resultReady;
    for (const ev of events) {
      if (ev.type === 'countdownTick') {
        showCountdownOverlay(hud, String(ev.n), false);
      } else if (ev.type === 'countdownWatchdog') {
        logErrorOverlay(`countdown watchdog forced start (${Math.round(ev.elapsedMs)}ms)`);
        clearWallCountdownTimer();
      } else if (ev.type === 'go') {
        clearWallCountdownTimer();
        showCountdownOverlay(hud, 'GO!', true);
        setFlowState('racing');
        raceEventBus.emit('raceStart', {
          courseId: course.getId(),
          totalLaps: raceState.laps,
          totalRacers: course.getRacers(),
        });
        updateHud(hud, hudViewModel);
      } else if (ev.type === 'checkpoint') {
        gates.setPassed(ev.index);
        gates.setActive(ev.index + 1);
        showSplitPopup(hud, ev);
      } else if (ev.type === 'lap') {
        gates.reset();
        showLapPopup(hud, ev);
        raceEventBus.emit('lapChanged', {
          lap: ev.lap + 1,
          totalLaps: ev.totalLaps,
          completedLap: ev.lap,
          lapTime: ev.lapTime,
          isBestLap: ev.isBestLap,
        });
        if (ev.totalLaps > 1 && ev.lap === ev.totalLaps - 1) {
          showLastLapBanner(hud);
          raceEventBus.emit('lastLapStarted', {
            lap: ev.lap + 1,
            totalLaps: ev.totalLaps,
            courseId: course.getId(),
          });
        }
      } else if (ev.type === 'finish') {
        gates.triggerFinishFlash();
        setFlowState('finished');
        raceEventBus.emit('playerFinished', {
          position: ev.playerPosition ?? 1,
          totalRacers: ev.totalRacers ?? course.getRacers(),
          time: ev.time,
          medal: ev.medal,
          isNewBest: ev.isNewBest,
        });
        lastFinishData = ev;
        lastFinishRecords = getRecords(course.getId(), course.getMedals());
        fastForwardSimElapsed = 0;
        fastForwardSettled = !hasUnfinishedAi();
        hideZoneToast(hud);
        chaseCamera.setMode('finish');
      } else if (ev.type === 'resultReady') {
        if (!fastForwardSettled) {
          showLoadingOverlay(hud, 'Menghitung hasil...');
        } else if (lastFinishData) {
          showResolvedResults(lastFinishData);
        }
      }
    }
  }

  function beginCountdownAfterIntro(useFade: boolean): void {
    introActive = false;
    introBanner.hide();
    introCamera.stop();
    const enterCountdown = (): void => {
      if (disposed || contextLost) {
        return;
      }
      const events = startCountdown(raceState, performance.now(), course);
      const stInit = standingsTracker.update(raceState.cars, course, raceState, 0);
      latestStandings = stInit.entries;
      latestPlayerRank = stInit.playerRank;
      chaseCamera.setMode('chase');
      if (!CONFIG.camera.debugOrbitMode) {
        carFleet.snapFromCars(raceState.cars, course, renderPose);
        chaseCamera.snapTo(renderPose, raceState.cars[0], course);
      }
      setFlowState('countdown');
      handleRaceEvents(events);
      syncGraphicsUi();
      hudViewModel.introActive = false;
      updateHud(hud, hudViewModel);
      pumpWallCountdown();
      startRenderWatchdog();
    };

    if (useFade) {
      screenTransition.flashFade(enterCountdown);
    } else {
      enterCountdown();
    }
  }

  function skipIntro(): void {
    if (!introActive || disposed || contextLost) {
      return;
    }
    introCamera.skip();
    sound.handleEvents([{ type: 'uiMove' }]);
    beginCountdownAfterIntro(true);
  }

  function handleIntroSkipKey(event: KeyboardEvent): void {
    if (!introActive || event.repeat) {
      return;
    }
    if (event.code === 'Space' || event.code === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      skipIntro();
    }
  }
  window.addEventListener('keydown', handleIntroSkipKey);

  function handleConfirmAction(): void {
    if (disposed || contextLost) {
      return;
    }
    if (introActive) {
      skipIntro();
      return;
    }
    const nowMs = performance.now();
    if (nowMs - lastConfirmAtMs < 250) {
      return;
    }
    sound.unlock();

    if (raceState.phase === 'TITLE') {
      if (isLoadingCourse) {
        pendingStartAfterLoad = true;
        setStartButtonLoading(hud, true, true);
        return;
      }
      if (selectedCourseId !== loadedCourseId) {
        pendingStartAfterLoad = true;
        clearPendingCourseSwitch(false);
        void loadCourse(selectedCourseId);
        return;
      }

      lastConfirmAtMs = nowMs;
      disposePodiumScene();
      hideModalScreens(hud);
      hideLoadingOverlay(hud);
      touchControls.consumePresses();
      lastFinishData = null;
      lastFinishRecords = null;
      wrongWayDetector.reset();
      wrongWayActive = false;
      fastForwardSettled = true;
      fastForwardSimElapsed = 0;

      if (touchControls.isEnabled()) {
        requestLandscapeOrientation();
      }

      resetZoneTracking();
      sound.handleEvents([{ type: 'uiConfirm' }]);
      particles.reset();
      postfx.setSpeedIntensity(0);
      applyGridStart(raceState.cars, course, prevCars);
      syncCarStateArrays();
      aiRaceSeed = (aiRaceSeed + 1013) >>> 0;
      aiController.reset(course, aiDifficulty, aiRaceSeed);
      attractionSystem.reset();
      hazardEffects.reset(course.getRacers());
      standingsTracker.reset();
      carFleet.snapFromCars(raceState.cars, course, renderPose);

      const shouldPlayIntro =
        introPlayedForCourseId !== course.getId() && !isReducedMotionPreferred();
      introPlayedForCourseId = course.getId();

      if (shouldPlayIntro) {
        const vp = sceneCtx.getViewportSize();
        const started = introCamera.start(course, vp.width / Math.max(1, vp.height));
        if (started) {
          introActive = true;
          setFlowState('intro');
          const subtitle = course.isClosed()
            ? `${course.getLaps()} Lap \u2022 ${course.getRacers()} Pembalap`
            : 'Time Trial \u2022 1 Lap';
          introBanner.show(activeCourseDef.displayName || course.getName(), subtitle, () => {
            skipIntro();
          });
          hudViewModel.introActive = true;
          syncGraphicsUi();
          updateHud(hud, hudViewModel);
          return;
        }
      }

      beginCountdownAfterIntro(false);
      return;
    }

    lastConfirmAtMs = nowMs;
    introActive = false;
    introBanner.hide();
    introCamera.stop();
    hudViewModel.introActive = false;

    const runRetry = (): void => {
      disposePodiumScene();
      hideModalScreens(hud);
      hideLoadingOverlay(hud);
      touchControls.consumePresses();
      lastFinishData = null;
      lastFinishRecords = null;
      wrongWayDetector.reset();
      wrongWayActive = false;
      fastForwardSettled = true;
      fastForwardSimElapsed = 0;

      applyGridStart(raceState.cars, course, prevCars);
      syncCarStateArrays();
      aiRaceSeed = (aiRaceSeed + 1013) >>> 0;
      aiController.reset(course, aiDifficulty, aiRaceSeed);
      attractionSystem.reset();
      hazardEffects.reset(course.getRacers());
      standingsTracker.reset();
      gates.reset();
      particles.reset();
      postfx.setSpeedIntensity(0);
      hideAirtimePopup(hud);
      hideSplitPopup(hud);
      hideLapPopup(hud);
      hideCountdownOverlay(hud);

      sound.reset();
      const events = restartRace(raceState, performance.now(), course);
      resetZoneTracking();
      const stRestart = standingsTracker.update(raceState.cars, course, raceState, 0);
      latestStandings = stRestart.entries;
      latestPlayerRank = stRestart.playerRank;
      chaseCamera.setMode('chase');
      carFleet.snapFromCars(raceState.cars, course, renderPose);

      if (CONFIG.camera.snapOnReset && !CONFIG.camera.debugOrbitMode) {
        chaseCamera.snapTo(renderPose, raceState.cars[0], course);
      }

      setFlowState('countdown');
      handleRaceEvents(events);
      updateHud(hud, hudViewModel);
      pumpWallCountdown();
      startRenderWatchdog();
    };

    if (raceState.phase === 'FINISH') {
      screenTransition.flashFade(runRetry);
    } else {
      runRetry();
    }
  }

  function handleReturnToTitle(): void {
    sound.unlock();
    clearPendingCourseSwitch();
    clearWallCountdownTimer();
    clearStartWatchdog();
    pendingStartAfterLoad = false;
    introActive = false;
    introBanner.hide();
    introCamera.stop();
    hudViewModel.introActive = false;

    const finishReturn = (): void => {
      disposePodiumScene();
      lastFinishData = null;
      lastFinishRecords = null;
      lastThrottle = 0;
      wrongWayDetector.reset();
      wrongWayActive = false;
      fastForwardSettled = true;
      fastForwardSimElapsed = 0;
      hideLoadingOverlay(hud);

      applyGridStart(raceState.cars, course, prevCars);
      syncCarStateArrays();
      aiController.reset(course, aiDifficulty, aiRaceSeed);
      attractionSystem.reset();
      hazardEffects.reset(course.getRacers());
      standingsTracker.reset();
      latestStandings = [];
      latestPlayerRank = 1;
      gates.reset();
      particles.reset();
      postfx.setSpeedIntensity(0);
      hideAirtimePopup(hud);
      hideSplitPopup(hud);
      hideLapPopup(hud);
      hideCountdownOverlay(hud);
      hideFinishScreen(hud);

      sound.reset();
      const events = returnToTitle(raceState, course);
      resetZoneTracking();
      chaseCamera.setMode('title');
      carFleet.snapFromCars(raceState.cars, course, renderPose);

      if (!CONFIG.camera.debugOrbitMode) {
        chaseCamera.snapTo(renderPose, raceState.cars[0], course);
      }

      setFlowState('title');
      handleRaceEvents(events);
      updateHud(hud, hudViewModel);
      sound.handleEvents([{ type: 'uiConfirm' }]);
      syncTitleUi();
      if (pendingAutoDowngradePreset && pendingAutoDowngradePreset !== graphicsPreset) {
        const target = pendingAutoDowngradePreset;
        pendingAutoDowngradePreset = null;
        void rebuildGraphicsPipeline(target, 'deferred-auto-downgrade');
      }
    };

    screenTransition.flashFade(finishReturn);
  }

  onConfirmFromUi = handleConfirmAction;
  onReturnToMenuFromUi = handleReturnToTitle;
  onClearRecordsFromUi = (): void => {
    sound.unlock();
    const previewDef = getCourse(selectedCourseId);
    clearRecords(previewDef.id);
    if (previewDef.id === course.getId()) {
      refreshRaceRecords(raceState, course);
    }
    sound.handleEvents([{ type: 'uiConfirm' }]);
    syncTitleUi();
  };

  function handleCheckpointReset(): void {
    const playerCar = raceState.cars[0];
    const target = getRespawnTarget(raceState, course);
    const targetRoute = course.getRoute(target.routeId);
    respawnAt(playerCar, targetRoute, target.s, target.lateral, CONFIG.race.resetSpeedFactor);
    applyManualResetPenalty(raceState);
    copyCarState(playerCar, prevCars[0]);
    wrongWayDetector.reset();
    wrongWayActive = false;
    hideAirtimePopup(hud);
    hideZoneToast(hud);
    sound.handleEvents([{ type: 'respawn' }]);

    if (CONFIG.camera.snapOnReset && !CONFIG.camera.debugOrbitMode) {
      getCarPose(playerCar, targetRoute, renderPose);
      chaseCamera.snapTo(renderPose, playerCar, targetRoute);
    }
  }

  function update(step: number, nowMs: number): void {
    const input = controls.sample(step);

    if (input.mutePressed) {
      sound.unlock();
      const nextMuted = sound.toggleMute();
      musicPlayer.setTotalMuted(nextMuted);
      touchControls.setMutedVisual(nextMuted);
    }

    if (input.minimapPressed) {
      hud.minimap.cycleSizeMode();
      syncGraphicsUi();
    }

    if (introActive) {
      lastThrottle = 0;
      return;
    }

    if (input.navPressed !== 0 && raceState.phase === 'TITLE') {
      const allCourses = listCourses();
      if (allCourses.length > 1) {
        const curIdx = allCourses.findIndex((c) => c.id === selectedCourseId);
        const safeIdx = curIdx >= 0 ? curIdx : 0;
        const nextIdx = (safeIdx + input.navPressed + allCourses.length) % allCourses.length;
        selectArena(allCourses[nextIdx].id);
      }
    }

    if (input.menuPressed && raceState.phase === 'FINISH') {
      lastThrottle = 0;
      handleReturnToTitle();
      return;
    }

    const canConfirmNow =
      raceState.phase === 'TITLE' || (raceState.phase === 'FINISH' && raceState.resultReady);
    if ((input.confirmPressed && canConfirmNow) || (input.restartPressed && raceState.phase !== 'TITLE')) {
      lastThrottle = 0;
      handleConfirmAction();
      return;
    }

    if (input.resetPressed && raceState.phase === 'RACING') {
      lastThrottle = 0;
      handleCheckpointReset();
      return;
    }

    lastThrottle = raceState.phase === 'RACING' ? input.throttle : 0;

    const simAttractionTime = raceState.phase === 'RACING' ? raceState.timer : 0;
    attractionSystem.evaluateAtTime(simAttractionTime);
    hazardEffects.stepPrePhysics(raceState.cars, attractionSystem, step);

    ensureCarsForCourse(prevCars, course);
    const playerRespawnTarget = getRespawnTarget(raceState, course);
    const playerRespawnRoute = course.getRoute(playerRespawnTarget.routeId);
    const mainRoute = course.getRoute('main');
    let playerPhysicsEvents: PhysicsEvent[] = [];

    aiController.stepPrePhysics(raceState.cars, course, raceState.phase, step);

    for (let i = 0; i < raceState.cars.length; i++) {
      const car = raceState.cars[i];
      copyCarState(car, prevCars[i]);

      const carInput: CarInput =
        i === 0
          ? input
          : aiController.sampleInput(
              i,
              raceState.cars,
              course,
              raceState.phase,
              step,
              attractionSystem,
              simAttractionTime,
            );
      const carRoute = course.getRoute(car.routeId);
      const carRespawnTarget =
        i === 0
          ? playerRespawnTarget
          : { routeId: 'main', s: car.lastSafeS, lateral: 0 };
      const carRespawnRoute = i === 0 ? playerRespawnRoute : mainRoute;

      const stepEvents = stepCar(car, carInput, carRoute, step, {
        phase: raceState.phase,
        respawnTarget: carRespawnTarget,
        respawnRoute: carRespawnRoute,
        env: hazardEffects.getEnvModifiers(i, envScratch),
      });

      const transition = updateRouteTransitions(car, course);
      if (i === 0) {
        playerPhysicsEvents = stepEvents;
        if (transition && transition.kind === 'enter' && raceState.phase === 'RACING') {
          showShortcutToast(hud, transition.routeName);
        }
      }
    }

    const collisionEvents = resolveCarCollisions(raceState.cars, course, step, raceState.phase);
    for (let ci = 0; ci < collisionEvents.length; ci++) {
      const ev = collisionEvents[ci];
      if (ev.carIndex === 0 || ev.otherIndex === 0) {
        const hitEvt: Extract<PhysicsEvent, { type: 'railHit' }> = {
          type: 'railHit',
          side: ev.carIndex === 0 ? 1 : -1,
          intensity: ev.intensity,
          worldPos: ev.worldPos,
        };
        touchControls.onHaptic(hitEvt);
        particles.emit(hitEvt);
        sound.handleEvents([hitEvt]);
        if (!isReducedMotionPreferred() && graphicsPreset !== 'hemat') {
          chaseCamera.addShake(
            CONFIG.polish.shake.collisionAmplitude * THREE.MathUtils.clamp(ev.intensity, 0.45, 1),
            CONFIG.polish.shake.durationSeconds,
          );
        }
      }
    }

    if (raceState.phase === 'RACING') {
      hazardEffects.stepPostPhysics(
        raceState.cars,
        course,
        attractionSystem,
        step,
        attractionEvents,
      );
      for (let ai = 0; ai < attractionEvents.length; ai++) {
        const ae = attractionEvents[ai];
        if (ae.type === 'ringPass') {
          particles.emit({
            type: 'boost',
            position: ae.worldPos,
            forward: ae.forward,
            right: ae.right,
            up: ae.up,
          });
          particles.emit({
            type: 'railHit',
            side: 1,
            intensity: 0.72,
            worldPos: ae.worldPos,
          });
          if (ae.carIndex === 0) {
            sound.handleEvents([{ type: 'ringPass' }]);
            touchControls.onHaptic({ type: 'ringPass' });
            showRingBoostToast(hud);
            raceEventBus.emit('ringPass', {
              carIndex: 0,
              boostSeconds: CONFIG.attractions.ring.boostDuration,
            });
            raceEventBus.emit('boostStarted', { carIndex: 0, source: 'ring' });
          }
        } else if (ae.type === 'hazardHit') {
          particles.emit({
            type: 'railHit',
            side: 1,
            intensity: 0.85,
            worldPos: ae.worldPos,
          });
          if (ae.carIndex === 0) {
            sound.handleEvents([{ type: 'hazardHit' }]);
            touchControls.onHaptic({ type: 'hazardHit' });
            showHazardToast(hud);
            raceEventBus.emit('hazardHit', { carIndex: 0, kind: ae.hazardKind });
            if (!isReducedMotionPreferred() && graphicsPreset !== 'hemat') {
              chaseCamera.addShake(
                CONFIG.polish.shake.hazardAmplitude,
                CONFIG.polish.shake.durationSeconds,
              );
            }
          }
        }
      }
    }

    const currPlayer = raceState.cars[0];
    let activePlayerRoute = course.getRoute(currPlayer.routeId);

    for (const ev of playerPhysicsEvents) {
      touchControls.onHaptic(ev);
      if (ev.type === 'landed') {
        particles.emit({
          type: 'landed',
          impactSpeed: ev.impactSpeed,
          position: currPlayer.worldPos,
        });
        if (raceState.phase === 'RACING' && ev.airtime >= CONFIG.physics.minAirtimeForBonus) {
          showAirtimePopup(hud, ev.airtime);
        }
      } else if (ev.type === 'railHit') {
        particles.emit(ev);
      } else if (ev.type === 'boost') {
        getCarPose(currPlayer, activePlayerRoute, eventPose);
        particles.emit({
          type: 'boost',
          position: eventPose.position,
          forward: eventPose.tangent,
          right: eventPose.right,
          up: eventPose.up,
        });
        if (raceState.phase === 'RACING') {
          raceEventBus.emit('boostStarted', { carIndex: 0, source: 'pad' });
        }
      } else if (ev.type === 'respawn') {
        const currentRoute = course.getRoute(currPlayer.routeId);
        activePlayerRoute = currentRoute;
        copyCarState(currPlayer, prevCars[0]);
        hideAirtimePopup(hud);
        if (!CONFIG.camera.debugOrbitMode) {
          getCarPose(currPlayer, currentRoute, renderPose);
          chaseCamera.snapTo(renderPose, currPlayer, currentRoute);
        }
      }
    }

    sound.handleEvents(playerPhysicsEvents);

    const carSpeedKmh =
      (currPlayer.mode === 'grounded'
        ? Math.abs(currPlayer.vForward)
        : currPlayer.worldVel.length()) * CONFIG.hud.speedScale;

    if (raceState.phase === 'RACING') {
      updateOpponentProgress(raceState, course, raceState.timer + step);
    }

    const raceEvents = updateRace(
      raceState,
      {
        s: currPlayer.s,
        sApprox: currPlayer.sApprox,
        mode: currPlayer.mode,
        routeId: currPlayer.routeId,
        routeLapOffset: currPlayer.routeLapOffset,
        speedKmh: carSpeedKmh,
      },
      course,
      step,
      playerPhysicsEvents,
      nowMs,
    );
    handleRaceEvents(raceEvents);

    if (raceState.phase === 'FINISH' && !fastForwardSettled) {
      stepFastForwardBatch(step);
    }

    if (course.getRacers() > 1) {
      const standingsRes = standingsTracker.update(raceState.cars, course, raceState, step);
      latestStandings = standingsRes.entries;
      latestPlayerRank = standingsRes.playerRank;
      if (standingsRes.overtakeEvent && raceState.phase === 'RACING') {
        showOvertakeToast(
          hud,
          standingsRes.overtakeEvent.type,
          standingsRes.overtakeEvent.newRank,
          standingsRes.overtakeEvent.rivalName,
        );
        sound.handleEvents([{ type: standingsRes.overtakeEvent.type }]);
      }
    } else {
      latestStandings = [];
      latestPlayerRank = 1;
    }

    const activeWrongWayS = currPlayer.mode === 'grounded' ? currPlayer.s : currPlayer.sApprox;
    activePlayerRoute.getFrameAt(activeWrongWayS, wrongWayFrame);
    getCarPose(currPlayer, activePlayerRoute, eventPose);
    wrongWayActive = wrongWayDetector.update(
      {
        carState: currPlayer,
        carPose: eventPose,
        trackFrame: wrongWayFrame,
        isClosed: isClosedCourse,
        phase: raceState.phase,
      },
      step,
    );

    const activeZoneS = currPlayer.mode === 'grounded' ? currPlayer.s : currPlayer.sApprox;
    if (
      raceState.phase === 'RACING' &&
      currPlayer.routeId === 'main' &&
      !wrongWayActive
    ) {
      if (raceState.currentLap !== lastZoneLap) {
        enteredZonesInLap.clear();
        shownStartBannerInLap = false;
        lastZoneLap = raceState.currentLap;
      }
      const wrappedZoneS = isClosedCourse ? course.wrapDistance(activeZoneS) : activeZoneS;
      if (
        !shownStartBannerInLap &&
        course.getId() === 'fantasy-land' &&
        wrappedZoneS >= CONFIG.fantasy.zoneStartBanner.startS &&
        wrappedZoneS <= CONFIG.fantasy.zoneStartBanner.endS
      ) {
        shownStartBannerInLap = true;
        showZoneToast(hud, CONFIG.fantasy.zoneStartBanner.title);
      }
      for (let zi = 0; zi < zoneStarts.length; zi++) {
        if (enteredZonesInLap.has(zi)) continue;
        const zone = zoneStarts[zi];
        if (wrappedZoneS >= zone.s && wrappedZoneS <= zone.s + 24) {
          enteredZonesInLap.add(zi);
          showZoneToast(hud, zone.name);
        }
      }
    }

    if (CONFIG.camera.debugOrbitMode) {
      prevOrbitAngle = currOrbitAngle;
      currOrbitAngle += CONFIG.camera.orbitSpeed * step;
    }
  }

  function render(alpha: number, realDt: number): void {
    gates.update(realDt);
    musicPlayer.update(realDt);

    if (podiumScene && raceState.phase === 'FINISH' && raceState.resultReady && fastForwardSettled) {
      podiumScene.update(realDt);
      hudViewModel.introActive = false;
      hudViewModel.phase = raceState.phase;
      hudViewModel.resultReady = true;
      updateHud(hud, hudViewModel);
      sound.update(soundSnapshot, realDt);
      sceneCtx.renderer.render(podiumScene.scene, podiumScene.camera);
      return;
    }

    trackVisual.update(realDt);
    tunnelVisual.update(realDt);
    trackAccentsVisual.update(realDt);
    shortcutGateVisual.update(realDt);

    ensureCarsForCourse(renderCars, course);
    for (let i = 0; i < raceState.cars.length; i++) {
      interpolateCarState(prevCars[i], raceState.cars[i], alpha, renderCars[i]);
    }
    const showNametags =
      !introActive && (raceState.phase === 'COUNTDOWN' || raceState.phase === 'RACING');
    carFleet.updateFromCars(
      renderCars,
      course,
      realDt,
      renderPose,
      sceneCtx.camera.position,
      showNametags,
    );

    const renderPlayer = renderCars[0];
    const renderRoute = course.getRoute(renderPlayer.routeId);

    if (introActive) {
      const introDone = introCamera.update(sceneCtx.camera, realDt);
      sceneCtx.updateSunShadowTarget(renderPose.position);
      sceneCtx.updateTheme(sceneCtx.camera.position, realDt);
      attractionManager.update(attractionSystem, sceneCtx.camera.position);
      hudViewModel.introActive = true;
      updateHud(hud, hudViewModel);
      postfx.setSpeedIntensity(0);
      postfx.render(realDt);
      if (introDone) {
        beginCountdownAfterIntro(false);
      }
      return;
    }

    const boostBonusDeg = renderPlayer.boostTimeLeft > 0 ? CONFIG.boost.fovBonus : 0;
    chaseCamera.setBoostFovBonus(boostBonusDeg);

    if (CONFIG.camera.debugOrbitMode) {
      const interpolatedAngle = prevOrbitAngle + (currOrbitAngle - prevOrbitAngle) * alpha;
      sceneCtx.setCameraOrbitAngle(interpolatedAngle);
      sceneCtx.updateSunShadowTarget(bounds.center);
    } else {
      chaseCamera.update(renderPose, renderPlayer, renderRoute, realDt);
      sceneCtx.updateSunShadowTarget(renderPose.position);
    }

    sceneCtx.updateTheme(sceneCtx.camera.position, realDt);
    attractionManager.update(attractionSystem, renderPose.position);
    particles.update(realDt, renderPose, renderPlayer);

    const speedMs =
      renderPlayer.mode === 'grounded'
        ? Math.abs(renderPlayer.vForward)
        : renderPlayer.worldVel.length();
    const speedRatio = speedMs / Math.max(1, CONFIG.physics.maxSpeed);
    const minFactor = CONFIG.fx.speedLines.minSpeedFactor;
    const baseSpeedFactor =
      speedRatio > minFactor
        ? THREE.MathUtils.clamp((speedRatio - minFactor) / Math.max(0.05, 1 - minFactor), 0, 1)
        : 0;
    const boostSurge = renderPlayer.boostTimeLeft > 0 ? CONFIG.fx.speedLines.boostBonus : 0;
    const speedLineIntensity =
      raceState.phase === 'RACING'
        ? THREE.MathUtils.clamp(
            baseSpeedFactor * CONFIG.fx.speedLines.maxIntensity + boostSurge,
            0,
            1,
          )
        : 0;
    postfx.setSpeedIntensity(speedLineIntensity);

    soundSnapshot.phase = raceState.phase;
    soundSnapshot.speedNorm = speedRatio;
    soundSnapshot.throttle = lastThrottle;
    soundSnapshot.boostActive = renderPlayer.boostTimeLeft > 0;
    soundSnapshot.slip = renderPlayer.slip;
    soundSnapshot.grounded = renderPlayer.mode === 'grounded';
    soundSnapshot.airborne = renderPlayer.mode === 'airborne';
    soundSnapshot.falling = renderPlayer.mode === 'falling';
    soundSnapshot.railContact = renderPlayer.railContactTimer > 0;
    soundSnapshot.windFanProximity =
      raceState.phase === 'RACING'
        ? attractionSystem.getNearestWindFanProximity(
            renderPose.position.x,
            renderPose.position.y,
            renderPose.position.z,
            CONFIG.audio.attractionWind.maxDistanceMeters,
          )
        : 0;
    sound.update(soundSnapshot, realDt);

    const rawProgressS = renderPlayer.mode === 'grounded' ? renderPlayer.s : renderPlayer.sApprox;
    const activeProgressS =
      (renderPlayer.routeId !== 'main' ? (renderPlayer.routeLapOffset ?? 0) : 0) +
      course.getProgressS(renderPlayer.routeId, rawProgressS);
    const lapStartS = Math.max(0, raceState.currentLap - 1) * progressSpanS;
    const progress01 = isClosedCourse
      ? activeProgressS < lapStartS
        ? 0
        : THREE.MathUtils.clamp((activeProgressS - lapStartS) / progressSpanS, 0, 1)
      : THREE.MathUtils.clamp((activeProgressS - startGridSlot.s) / progressSpanS, 0, 1);

    hudViewModel.phase = raceState.phase;
    hudViewModel.resultReady = raceState.resultReady && fastForwardSettled;
    hudViewModel.speedKmh = speedMs * CONFIG.hud.speedScale;
    hudViewModel.boost01 =
      CONFIG.boost.duration > 1e-4
        ? Math.min(1, Math.max(0, renderPlayer.boostTimeLeft / CONFIG.boost.duration))
        : 0;
    hudViewModel.progress01 = progress01;
    hudViewModel.timeSeconds = raceState.timer;
    hudViewModel.lap = raceState.currentLap;
    hudViewModel.totalLaps = raceState.laps;
    hudViewModel.lapTimeSeconds =
      raceState.phase === 'RACING' || raceState.phase === 'FINISH'
        ? Math.max(0, raceState.timer - raceState.lapStartTime)
        : 0;
    hudViewModel.bestLapSeconds = raceState.bestLap;
    hudViewModel.cpPassed = raceState.nextCheckpointIndex;
    hudViewModel.cpTotal = raceState.totalCheckpoints;
    hudViewModel.bestTime = raceState.bestTime;
    hudViewModel.wrongWay = wrongWayActive;
    hudViewModel.muted = sound.getMuted();
    hudViewModel.touchActive = touchControls.isEnabled();
    hudViewModel.position = latestPlayerRank;
    hudViewModel.totalRacers = course.getRacers();
    hudViewModel.standings = latestStandings;
    updateHud(hud, hudViewModel);

    hud.minimap.update(
      renderCars,
      course,
      progress01,
      isMobileDevice || touchControls.isEnabled(),
      performance.now(),
    );

    postfx.render(realDt);
  }

  function scheduleAfterSoftwareDraw(next: () => void): void {
    const gl = sceneCtx.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = (): void => {
        if (disposed || contextLost || rebuilding) {
          return;
        }
        const status = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (status === gl.UNSIGNALED) {
          frameIsRaf = false;
          frameHandle = window.setTimeout(poll, CONFIG.renderer.softwareGlPollMs);
        } else {
          if (sync) {
            gl.deleteSync(sync);
          }
          frameIsRaf = false;
          frameHandle = window.setTimeout(next, CONFIG.renderer.softwareGlFramePauseMs);
        }
      };
      frameIsRaf = false;
      frameHandle = window.setTimeout(poll, CONFIG.renderer.softwareGlPollMs);
    } else {
      frameIsRaf = false;
      frameHandle = window.setTimeout(next, CONFIG.renderer.softwareGlFramePauseMs);
    }
  }

  function tick(nowMs: number): void {
    if (disposed || contextLost || rebuilding) {
      return;
    }

    if (!sceneCtx.isSoftwareGl) {
      frameIsRaf = true;
      frameHandle = window.requestAnimationFrame(tick);
    }

    try {
      const rawDt = (nowMs - lastFrameMs) / 1000;
      lastFrameMs = nowMs;

      if (!paused) {
        const frameDt = Math.min(Math.max(rawDt, 0), maxFrameDt);
        accumulator += frameDt;

        let subSteps = 0;
        while (accumulator >= fixedStep && subSteps < CONFIG.sim.maxSubSteps) {
          update(fixedStep, nowMs);
          accumulator -= fixedStep;
          subSteps++;
        }
        if (accumulator >= fixedStep) {
          accumulator = 0;
        }

        const alpha = accumulator / fixedStep;
        render(alpha, frameDt);
        renderedFrameCount++;
        consecutiveErrorCount = 0;

        if (!firstFrameChecked) {
          firstFrameChecked = true;
          const diag = sceneCtx.getDiagnostics();
          if (
            !safeMode &&
            (diag.glError !== 'NO_ERROR' || diag.framebufferStatus !== 'COMPLETE')
          ) {
            if (graphicsPreset === 'seimbang') {
              failBalancedEnvTrial();
            }
            logErrorOverlay(
              `GL/FB check failed: ${diag.glError} / ${diag.framebufferStatus}`,
            );
            void downgradeGraphicsOnFailure('gl-error-first-frame');
            return;
          }
        }

        if (balancedEnvCheckNextFrame) {
          balancedEnvCheckNextFrame = false;
          const diag = sceneCtx.getDiagnostics();
          if (diag.glError !== 'NO_ERROR' || diag.framebufferStatus !== 'COMPLETE') {
            failBalancedEnvTrial();
            logErrorOverlay(
              `Balanced env GL check failed: ${diag.glError} / ${diag.framebufferStatus}`,
            );
          }
        }

        if (
          graphicsPreset === 'seimbang' &&
          !balancedEnvFailed &&
          balancedEnvTrialElapsedSec < CONFIG.safeMode.normalTrialSec
        ) {
          balancedEnvTrialElapsedSec += frameDt;
          if (
            balancedEnvTrialElapsedSec >= CONFIG.safeMode.normalTrialSec &&
            !balancedEnvVerified &&
            sceneCtx.canUseBalancedEnvironment()
          ) {
            balancedEnvVerified = true;
            safeStorageSet(CONFIG.safeMode.normalOkStorageKey, '1');
            sceneCtx.setBalancedEnvironmentEnabled(true);
            balancedEnvCheckNextFrame = true;
          }
        }

        qualityManager.update(frameDt);
        if (benchmarkSampling && rawDt > 0 && rawDt < 0.5) {
          benchmarkFrameSamplesMs.push(rawDt * 1000);
        }

        if (initialProbeActive && !benchmarkRunning && graphicsPreset === 'seimbang') {
          initialProbeElapsedSec += frameDt;
          if (initialProbeElapsedSec >= CONFIG.quality.initialProbeSec) {
            initialProbeActive = false;
            const avgMs = qualityManager.getAverageFrameMs();
            if (avgMs > CONFIG.quality.initialProbeBalancedMaxMs) {
              if (raceState.phase === 'TITLE') {
                showSafeModeNotice(hud, 'Mode Hemat aktif agar frame rate lancar');
                void rebuildGraphicsPipeline('hemat', 'initial-probe-slow');
                return;
              }
              pendingAutoDowngradePreset = 'hemat';
            }
            syncGraphicsUi();
          }
        }

        if (graphicsPreset === 'penuh' && !benchmarkRunning && !urlSafe) {
          const avgMs = qualityManager.getAverageFrameMs();
          if (avgMs > CONFIG.quality.fullAutoDowngradeMs) {
            fullSlowElapsedSec += frameDt;
            if (fullSlowElapsedSec >= CONFIG.quality.fullAutoDowngradeSec) {
              fullSlowElapsedSec = 0;
              if (raceState.phase === 'TITLE') {
                void downgradeGraphicsOnFailure('auto-slow-full');
                return;
              }
              pendingAutoDowngradePreset = 'seimbang';
            }
          } else {
            fullSlowElapsedSec = 0;
          }
        } else {
          fullSlowElapsedSec = 0;
        }

        debugOverlay?.update(
          nowMs,
          raceState.cars[0],
          raceState,
          course,
          qualityManager.getLevel(),
          activePreset,
          activeCarDesign,
        );
      }

      emitDebugMetrics(nowMs);
      if (isReportOverlayOpen() && nowMs - lastReportRefreshMs >= 300) {
        lastReportRefreshMs = nowMs;
        updateReportOverlay(buildReportSnapshot());
      }
    } catch (err) {
      consecutiveErrorCount++;
      if (
        graphicsPreset === 'seimbang' &&
        balancedEnvTrialElapsedSec < CONFIG.safeMode.normalTrialSec
      ) {
        failBalancedEnvTrial();
      }
      if (benchmarkSampling) {
        benchmarkErrorCount++;
      }
      const info = extractErrorInfo(err);
      logErrorOverlay(info.message, info.file, info.line);
      if (consecutiveErrorCount >= CONFIG.safeMode.consecutiveErrorLimit) {
        if (!safeMode) {
          void downgradeGraphicsOnFailure('5x-frame-error');
          return;
        } else if (!reportOpenedForSafeErrors) {
          reportOpenedForSafeErrors = true;
          showReportOverlay(
            buildReportSnapshot({
              headline: 'Terjadi error render berulang',
            }),
          );
        }
      }
    } finally {
      if (sceneCtx.isSoftwareGl && !disposed && !contextLost && !rebuilding) {
        scheduleAfterSoftwareDraw(() => tick(performance.now()));
      }
    }
  }

  // Initial shader pre-compilation before gameplay countdown can begin
  isLoadingCourse = true;
  setStartButtonLoading(hud, true, false);
  showLoadingOverlay(hud, 'Memuat arena...', 50);
  emitDebugMetrics(performance.now());
  try {
    await precompileShaders('Memuat arena...');
  } finally {
    isLoadingCourse = false;
    setStartButtonLoading(hud, false, false);
    hideLoadingOverlay(hud);
    emitDebugMetrics(performance.now());
  }

  if (!disposed && !contextLost) {
    lastFrameMs = performance.now();
    accumulator = 0;

    if (paused) {
      updateHud(hud, hudViewModel);
      postfx.render(0);
    }

    if (pendingStartAfterLoad && raceState.phase === 'TITLE') {
      pendingStartAfterLoad = false;
      handleConfirmAction();
    }

    if (isDebugUrlEnabled()) {
      showReportOverlay(buildReportSnapshot());
    }

    scheduleLoopStart();
  }

  window.addEventListener('beforeunload', () => {
    disposed = true;
    clearPendingCourseSwitch(false);
    clearWallCountdownTimer();
    clearStartWatchdog();
    window.clearTimeout(resizeOrientationTimer);
    unbindCanvasContextEvents(sceneCtx.renderer.domElement);
    cancelScheduledLoop();
    window.clearTimeout(debugToastTimeout);
    if (debugToastEl && debugToastEl.parentElement === container) {
      container.removeChild(debugToastEl);
    }
    if (debugFlagActive) {
      window.removeEventListener('keydown', handleDebugKey);
    }
    window.removeEventListener('keydown', handleIntroSkipKey);
    window.removeEventListener('resize', handleWindowResize);
    window.removeEventListener('orientationchange', handleWindowOrientationChange);
    window.visualViewport?.removeEventListener('resize', handleWindowResize);
    document.removeEventListener('visibilitychange', syncPauseState);
    unbindTouchStatus();
    hud.audioBtnEl.removeEventListener('click', handleAudioButtonClick);
    disposePodiumScene();
    introBanner.dispose();
    screenTransition.dispose();
    musicDirector.dispose();
    musicPlayer.dispose();
    raceEventBus.dispose();
    courseSelect.dispose();
    controls.dispose();
    touchControls.dispose();
    sound.dispose();
    disposeHud(hud);
    disposeReportOverlay();
    disposeErrorOverlay();
    debugOverlay?.dispose();
    qualityManager.dispose();
    particles.dispose();
    postfx.dispose();
    attractionManager.dispose();
    trackVisual.dispose();
    bridgeVisual.dispose();
    tunnelVisual.dispose();
    trackAccentsVisual.dispose();
    gates.dispose();
    shortcutGateVisual.dispose();
    carFleet.dispose();
    sceneCtx.dispose();
  });
}
