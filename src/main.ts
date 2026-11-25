// src/main.ts

import * as THREE from 'three';
import { setAudioPaused } from './audio/audioManager';
import { createSound, type SoundSnapshot } from './audio/sound';
import { CONFIG, type VisualPresetName } from './config';
import { buildCourseConfigFromDefinition, Course, type TrackFrame } from './core/course';
import { createWrongWayDetector } from './core/wrongWay';
import { getCourse, getLastCourseId, listCourses, setLastCourseId } from './courses';
import {
  copyCarState,
  createCarState,
  getCarPose,
  interpolateCarState,
  respawnAt,
  stepCar,
  type CarPose,
  type CarState,
} from './core/physics';
import { updateRouteTransitions } from './core/routeTransitions';
import {
  applyManualResetPenalty,
  createRaceState,
  getRespawnTarget,
  pauseRaceClock,
  refreshRaceRecords,
  restartRace,
  resumeRaceClock,
  returnToTitle,
  startCountdown,
  updateRace,
  type FinishResultData,
  type RaceEvent,
  type RaceState,
} from './core/state';
import { createKeyboardControls } from './input/controls';
import { createTouchControls, requestLandscapeOrientation } from './input/touch';
import { buildBridgeMesh, type BridgeVisual } from './render/bridge';
import { buildCarMesh, type CarVisual } from './render/car';
import type { CarDesignId } from './render/carDesigns';
import { ChaseCamera } from './render/chaseCamera';
import { buildGates, type GatesVisual } from './render/gates';
import { createParticles } from './render/particles';
import { createPostFx } from './render/postfx';
import { createQualityManager, detectInitialQuality, type QualityLevel } from './render/quality';
import { createSceneContext } from './render/scene';
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
  logErrorOverlay,
} from './ui/errorOverlay';
import {
  createHud,
  disposeHud,
  hideAirtimePopup,
  hideCountdownOverlay,
  hideFinishScreen,
  hideLapPopup,
  hideLoadingOverlay,
  hideSplitPopup,
  hideZoneToast,
  setHudProgressCheckpoints,
  setStartButtonLoading,
  showAirtimePopup,
  showContextLostOverlay,
  showCountdownOverlay,
  showFinishScreen,
  showLapPopup,
  showLoadingOverlay,
  showShortcutToast,
  showSplitPopup,
  showZoneToast,
  updateDebugMetricsOverlay,
  updateHud,
  updateTitleScreen,
  type HudViewModel,
} from './ui/hud';

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

export async function bootstrap(): Promise<void> {
  const container = document.getElementById('app');
  if (!container) {
    throw new Error('Root container #app not found.');
  }

  let activePreset: VisualPresetName = CONFIG.visual.activePreset;
  let activeCarDesign: CarDesignId = CONFIG.car.visual.designId;

  const detectedQuality = detectInitialQuality(CONFIG.quality);
  const sceneCtx = createSceneContext(container, detectedQuality);
  const debugOverlay = createDebugOverlay(container);
  const sound = createSound();
  sound.init();
  sound.unlock();

  const touchControls = createTouchControls(container, CONFIG.touch);
  touchControls.setMutedVisual(sound.getMuted());

  let selectedCourseId = getLastCourseId();
  let loadedCourseId = selectedCourseId;
  let activeCourseDef = getCourse(selectedCourseId);
  let course = new Course(buildCourseConfigFromDefinition(activeCourseDef));
  let raceState = createRaceState(course);
  const wrongWayDetector = createWrongWayDetector();
  let wrongWayActive = false;

  let lastFinishData: FinishResultData | null = null;
  let lastFinishRecords: CourseRecords | null = null;

  let onConfirmFromUi: () => void = () => {};
  let onReturnToMenuFromUi: () => void = () => {};
  let onClearRecordsFromUi: () => void = () => {};

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
      const summary = exportSummaryText(lastFinishData, {
        id: course.getId(),
        name: course.getName(),
        medals: course.getMedals(),
      });
      return copyTextToClipboard(summary);
    },
    onClearRecords: () => {
      onClearRecordsFromUi();
    },
  });

  function handleAudioButtonClick(): void {
    sound.unlock();
    const nextMuted = sound.toggleMute();
    touchControls.setMutedVisual(nextMuted);
    hud.audioBtnEl.blur();
  }
  hud.audioBtnEl.addEventListener('click', handleAudioButtonClick);

  let startGridSlot = course.getGridSlots(1)[0];
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

  let trackVisual: TrackVisual = buildTrackMesh(course, sceneCtx.maxAnisotropy);
  sceneCtx.scene.add(trackVisual.group);

  let gates: GatesVisual = buildGates(course, sceneCtx.maxAnisotropy);
  sceneCtx.scene.add(gates.group);

  let shortcutGateVisual: ShortcutGateVisual = buildShortcutGates(course, sceneCtx.maxAnisotropy);
  sceneCtx.scene.add(shortcutGateVisual.group);

  let orbitRadius = Math.max(
    CONFIG.camera.orbitMinRadius,
    bounds.radius * CONFIG.camera.orbitRadiusScale,
  );
  sceneCtx.setOrbitTarget(bounds.center, orbitRadius, CONFIG.camera.orbitHeight);

  let carVisual: CarVisual = buildCarMesh({
    designId: activeCarDesign,
    maxAnisotropy: sceneCtx.maxAnisotropy,
    presetName: activePreset,
  });
  sceneCtx.scene.add(carVisual.group);

  const chaseCamera = new ChaseCamera(sceneCtx.camera);
  const controls = createKeyboardControls(touchControls);

  let particles: ReturnType<typeof createParticles>;
  let postfx: ReturnType<typeof createPostFx>;

  const qualityManager = createQualityManager(CONFIG.quality, (level) => {
    sceneCtx.setQuality(level);
    particles?.setQuality(level);
    postfx?.setQuality(level);
  });

  const initialQuality = qualityManager.getLevel();
  sceneCtx.setQuality(initialQuality);
  sceneCtx.setTheme(course, initialQuality);

  let bridgeVisual: BridgeVisual = buildBridgeMesh(
    course,
    (x, z) => sceneCtx.getGroundY(x, z),
    sceneCtx.maxAnisotropy,
    activePreset,
  );
  sceneCtx.scene.add(bridgeVisual.group);

  let tunnelVisual: TunnelVisual = buildTunnelMesh(
    course,
    sceneCtx.maxAnisotropy,
    activePreset,
    initialQuality,
  );
  sceneCtx.scene.add(tunnelVisual.group);

  let trackAccentsVisual: TrackAccentsVisual = buildTrackAccents(
    course,
    sceneCtx.maxAnisotropy,
    activePreset,
  );
  sceneCtx.scene.add(trackAccentsVisual.group);

  particles = createParticles(sceneCtx.scene, initialQuality);
  postfx = createPostFx(
    sceneCtx.renderer,
    sceneCtx.scene,
    sceneCtx.camera,
    initialQuality,
    sceneCtx.isSoftwareGl,
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
    trackVisual.applyPalette(name);
    bridgeVisual.applyPalette(name);
    tunnelVisual.applyPalette(name);
    trackAccentsVisual.applyPalette(name);
    shortcutGateVisual.applyPalette(name);
    carVisual.applyPalette(name);
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
    const prevPos = carVisual.group.position.clone();
    const prevQuat = carVisual.group.quaternion.clone();
    sceneCtx.scene.remove(carVisual.group);
    carVisual.dispose();

    carVisual = buildCarMesh({
      designId: activeCarDesign,
      maxAnisotropy: sceneCtx.maxAnisotropy,
      presetName: activePreset,
    });
    carVisual.group.position.copy(prevPos);
    carVisual.group.quaternion.copy(prevQuat);
    carVisual.update(currState, 0);
    sceneCtx.scene.add(carVisual.group);
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

  function handleWindowResize(): void {
    const { width, height } = sceneCtx.getViewportSize();
    postfx.resize(width, height);
  }
  window.addEventListener('resize', handleWindowResize);

  const createStartCarState = (): CarState =>
    createCarState({ s: startGridSlot.s, lateral: startGridSlot.lateral });

  let prevState = createStartCarState();
  let currState = createStartCarState();
  const renderState = createStartCarState();

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

  getCarPose(currState, course, renderPose);
  carVisual.group.position.copy(renderPose.position);
  carVisual.group.quaternion.copy(renderPose.quaternion);

  chaseCamera.setMode('title');
  if (!CONFIG.camera.debugOrbitMode) {
    chaseCamera.snapTo(renderPose, currState, course);
  }

  const fixedStep = CONFIG.sim.fixedStep;
  const maxFrameDt = CONFIG.sim.maxFrameDt;

  let accumulator = 0;
  let lastFrameMs = performance.now();
  let prevOrbitAngle = 0;
  let currOrbitAngle = 0;
  let frameHandle = 0;
  let switchDebounceTimer = 0;
  let switchRafId = 0;
  let disposed = false;
  let contextLost = false;
  let isLoadingCourse = false;
  let pendingStartAfterLoad = false;
  let lastConfirmAtMs = 0;

  let courseSelect: CourseSelectHandle;

  function emitDebugMetrics(nowMs: number): void {
    if (!isDebugUrlEnabled()) {
      return;
    }
    const status = isLoadingCourse ? 'LOADING' : raceState.phase;
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
        routeId: currState.routeId,
        quality: qualityManager.getLevel(),
      },
      nowMs,
    );
  }

  function syncTitleUi(): void {
    const previewDef = getCourse(selectedCourseId);
    updateTitleScreen(hud, {
      courseName: previewDef.displayName,
      medals: previewDef.medals,
      records: getRecords(previewDef.id, previewDef.medals),
    });
    courseSelect?.setSelected(previewDef.id);
    courseSelect?.refreshRecords();
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
    window.cancelAnimationFrame(frameHandle);
    window.clearTimeout(frameHandle);
    try {
      setAudioPaused(true);
    } catch {
      // Ignore audio pause errors during context loss
    }
    logErrorOverlay('webgl context lost');
    hideLoadingOverlay(hud);
    setStartButtonLoading(hud, false, false);
    showContextLostOverlay(hud);
  };
  sceneCtx.renderer.domElement.addEventListener('webglcontextlost', handleCanvasContextLost);

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
      if (typeof renderer.compileAsync === 'function') {
        await renderer.compileAsync(sceneCtx.scene, sceneCtx.camera);
      } else {
        renderer.compile(sceneCtx.scene, sceneCtx.camera);
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
    zoneStarts = course.getZoneStarts();
    resetZoneTracking();
    wrongWayDetector.reset();
    wrongWayActive = false;

    startGridSlot = course.getGridSlots(1)[0];
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

    trackVisual = buildTrackMesh(course, sceneCtx.maxAnisotropy);
    trackVisual.applyPalette(activePreset);
    sceneCtx.scene.add(trackVisual.group);

    bridgeVisual = buildBridgeMesh(
      course,
      (x, z) => sceneCtx.getGroundY(x, z),
      sceneCtx.maxAnisotropy,
      activePreset,
    );
    sceneCtx.scene.add(bridgeVisual.group);

    tunnelVisual = buildTunnelMesh(
      course,
      sceneCtx.maxAnisotropy,
      activePreset,
      qualityManager.getLevel(),
    );
    sceneCtx.scene.add(tunnelVisual.group);

    if (showProgress) {
      showLoadingOverlay(hud, 'Memuat arena...', 75);
    }

    trackAccentsVisual = buildTrackAccents(course, sceneCtx.maxAnisotropy, activePreset);
    sceneCtx.scene.add(trackAccentsVisual.group);

    gates = buildGates(course, sceneCtx.maxAnisotropy);
    sceneCtx.scene.add(gates.group);

    shortcutGateVisual = buildShortcutGates(course, sceneCtx.maxAnisotropy);
    shortcutGateVisual.applyPalette(activePreset);
    sceneCtx.scene.add(shortcutGateVisual.group);

    orbitRadius = Math.max(
      CONFIG.camera.orbitMinRadius,
      bounds.radius * CONFIG.camera.orbitRadiusScale,
    );
    sceneCtx.setOrbitTarget(bounds.center, orbitRadius, CONFIG.camera.orbitHeight);

    lastFinishData = null;
    lastFinishRecords = null;
    lastThrottle = 0;
    prevState = createStartCarState();
    currState = createStartCarState();
    particles.reset();
    postfx.setSpeedIntensity(0);
    hideAirtimePopup(hud);
    hideSplitPopup(hud);
    hideLapPopup(hud);
    hideCountdownOverlay(hud);
    hideFinishScreen(hud);

    getCarPose(currState, course, renderPose);
    carVisual.group.position.copy(renderPose.position);
    carVisual.group.quaternion.copy(renderPose.quaternion);
    carVisual.update(currState, 0);

    chaseCamera.setMode('title');
    if (!CONFIG.camera.debugOrbitMode) {
      chaseCamera.snapTo(renderPose, currState, course);
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
    sound.unlock();
    sound.handleEvents([{ type: 'uiMove' }]);
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
  function setPaused(nextPaused: boolean): void {
    const resolved = Boolean(nextPaused);
    if (resolved === paused) {
      return;
    }
    const nowMs = performance.now();
    paused = resolved;
    try {
      setAudioPaused(paused);
    } catch {
      // Ignore audio pause failures
    }
    if (paused) {
      pauseRaceClock(raceState, nowMs);
    } else {
      resumeRaceClock(raceState, nowMs);
      lastFrameMs = nowMs;
      accumulator = 0;
    }
  }

  function syncPauseState(): void {
    setPaused(document.hidden || touchControls.isPortraitBlocked());
  }

  const unbindTouchStatus = touchControls.onStatusChange(syncPauseState);
  document.addEventListener('visibilitychange', syncPauseState);
  syncPauseState();

  function handleRaceEvents(events: readonly RaceEvent[]): void {
    touchControls.setPhase(raceState.phase);
    sound.setPhase(raceState.phase);
    sound.handleEvents(events);
    for (const ev of events) {
      if (ev.type === 'countdownTick') {
        showCountdownOverlay(hud, String(ev.n), false);
      } else if (ev.type === 'countdownWatchdog') {
        logErrorOverlay(`countdown watchdog forced start (${Math.round(ev.elapsedMs)}ms)`);
      } else if (ev.type === 'go') {
        showCountdownOverlay(hud, 'GO!', true);
      } else if (ev.type === 'checkpoint') {
        gates.setPassed(ev.index);
        gates.setActive(ev.index + 1);
        showSplitPopup(hud, ev);
      } else if (ev.type === 'lap') {
        gates.reset();
        showLapPopup(hud, ev);
      } else if (ev.type === 'finish') {
        lastFinishData = ev;
        lastFinishRecords = getRecords(course.getId(), course.getMedals());
        hideZoneToast(hud);
        chaseCamera.setMode('finish');
      } else if (ev.type === 'resultReady') {
        if (lastFinishData) {
          showFinishScreen(hud, {
            courseName: course.getName(),
            finish: lastFinishData,
            records: lastFinishRecords ?? getRecords(course.getId(), course.getMedals()),
          });
        }
      }
    }
  }

  function handleConfirmAction(): void {
    if (disposed || contextLost) {
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
      touchControls.consumePresses();
      lastFinishData = null;
      lastFinishRecords = null;
      hideFinishScreen(hud);
      wrongWayDetector.reset();
      wrongWayActive = false;

      if (touchControls.isEnabled()) {
        requestLandscapeOrientation();
      }

      resetZoneTracking();
      sound.handleEvents([{ type: 'uiConfirm' }]);
      particles.reset();
      postfx.setSpeedIntensity(0);
      const events = startCountdown(raceState, nowMs);
      chaseCamera.setMode('chase');
      handleRaceEvents(events);
      return;
    }

    lastConfirmAtMs = nowMs;
    touchControls.consumePresses();
    lastFinishData = null;
    lastFinishRecords = null;
    hideFinishScreen(hud);
    wrongWayDetector.reset();
    wrongWayActive = false;

    prevState = createStartCarState();
    currState = createStartCarState();
    gates.reset();
    particles.reset();
    postfx.setSpeedIntensity(0);
    hideAirtimePopup(hud);
    hideSplitPopup(hud);
    hideLapPopup(hud);
    hideCountdownOverlay(hud);

    sound.reset();
    const events = restartRace(raceState, nowMs);
    resetZoneTracking();
    chaseCamera.setMode('chase');

    if (CONFIG.camera.snapOnReset && !CONFIG.camera.debugOrbitMode) {
      getCarPose(currState, course, renderPose);
      chaseCamera.snapTo(renderPose, currState, course);
    }

    handleRaceEvents(events);
  }

  function handleReturnToTitle(): void {
    sound.unlock();
    clearPendingCourseSwitch();
    pendingStartAfterLoad = false;
    lastFinishData = null;
    lastFinishRecords = null;
    lastThrottle = 0;
    wrongWayDetector.reset();
    wrongWayActive = false;

    prevState = createStartCarState();
    currState = createStartCarState();
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

    if (!CONFIG.camera.debugOrbitMode) {
      getCarPose(currState, course, renderPose);
      chaseCamera.snapTo(renderPose, currState, course);
    }

    handleRaceEvents(events);
    sound.handleEvents([{ type: 'uiConfirm' }]);
    syncTitleUi();
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
    const target = getRespawnTarget(raceState, course);
    const targetRoute = course.getRoute(target.routeId);
    respawnAt(currState, targetRoute, target.s, target.lateral, CONFIG.race.resetSpeedFactor);
    applyManualResetPenalty(raceState);
    copyCarState(currState, prevState);
    wrongWayDetector.reset();
    wrongWayActive = false;
    hideAirtimePopup(hud);
    hideZoneToast(hud);
    sound.handleEvents([{ type: 'respawn' }]);

    if (CONFIG.camera.snapOnReset && !CONFIG.camera.debugOrbitMode) {
      getCarPose(currState, targetRoute, renderPose);
      chaseCamera.snapTo(renderPose, currState, targetRoute);
    }
  }

  function update(step: number, nowMs: number): void {
    const input = controls.sample(step);

    if (input.mutePressed) {
      sound.unlock();
      const nextMuted = sound.toggleMute();
      touchControls.setMutedVisual(nextMuted);
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

    copyCarState(currState, prevState);
    let activeRoute = course.getRoute(currState.routeId);
    const respawnTarget = getRespawnTarget(raceState, course);
    const respawnRoute = course.getRoute(respawnTarget.routeId);
    const physicsEvents = stepCar(currState, input, activeRoute, step, {
      phase: raceState.phase,
      respawnTarget,
      respawnRoute,
    });

    const routeTransition = updateRouteTransitions(currState, course);
    if (routeTransition) {
      activeRoute = course.getRoute(currState.routeId);
      if (routeTransition.kind === 'enter' && raceState.phase === 'RACING') {
        showShortcutToast(hud, routeTransition.routeName);
      }
    }

    for (const ev of physicsEvents) {
      touchControls.onHaptic(ev);
      if (ev.type === 'landed') {
        particles.emit({
          type: 'landed',
          impactSpeed: ev.impactSpeed,
          position: currState.worldPos,
        });
        if (raceState.phase === 'RACING' && ev.airtime >= CONFIG.physics.minAirtimeForBonus) {
          showAirtimePopup(hud, ev.airtime);
        }
      } else if (ev.type === 'railHit') {
        particles.emit(ev);
      } else if (ev.type === 'boost') {
        getCarPose(currState, activeRoute, eventPose);
        particles.emit({
          type: 'boost',
          position: eventPose.position,
          forward: eventPose.tangent,
          right: eventPose.right,
          up: eventPose.up,
        });
      } else if (ev.type === 'respawn') {
        const currentRoute = course.getRoute(currState.routeId);
        activeRoute = currentRoute;
        copyCarState(currState, prevState);
        hideAirtimePopup(hud);
        if (!CONFIG.camera.debugOrbitMode) {
          getCarPose(currState, currentRoute, renderPose);
          chaseCamera.snapTo(renderPose, currState, currentRoute);
        }
      }
    }

    sound.handleEvents(physicsEvents);

    const carSpeedKmh =
      (currState.mode === 'grounded' ? Math.abs(currState.vForward) : currState.worldVel.length()) *
      CONFIG.hud.speedScale;

    const raceEvents = updateRace(
      raceState,
      {
        s: currState.s,
        sApprox: currState.sApprox,
        mode: currState.mode,
        routeId: currState.routeId,
        routeLapOffset: currState.routeLapOffset,
        speedKmh: carSpeedKmh,
      },
      course,
      step,
      physicsEvents,
      nowMs,
    );
    handleRaceEvents(raceEvents);

    const activeWrongWayS = currState.mode === 'grounded' ? currState.s : currState.sApprox;
    activeRoute.getFrameAt(activeWrongWayS, wrongWayFrame);
    getCarPose(currState, activeRoute, eventPose);
    wrongWayActive = wrongWayDetector.update(
      {
        carState: currState,
        carPose: eventPose,
        trackFrame: wrongWayFrame,
        isClosed: isClosedCourse,
        phase: raceState.phase,
      },
      step,
    );

    const activeZoneS = currState.mode === 'grounded' ? currState.s : currState.sApprox;
    if (
      raceState.phase === 'RACING' &&
      currState.routeId === 'main' &&
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
    trackVisual.update(realDt);
    tunnelVisual.update(realDt);
    trackAccentsVisual.update(realDt);
    shortcutGateVisual.update(realDt);

    interpolateCarState(prevState, currState, alpha, renderState);
    const renderRoute = course.getRoute(renderState.routeId);
    getCarPose(renderState, renderRoute, renderPose);

    carVisual.group.position.copy(renderPose.position);
    carVisual.group.quaternion.copy(renderPose.quaternion);
    carVisual.update(renderState, realDt);

    const boostBonusDeg = renderState.boostTimeLeft > 0 ? CONFIG.boost.fovBonus : 0;
    chaseCamera.setBoostFovBonus(boostBonusDeg);

    if (CONFIG.camera.debugOrbitMode) {
      const interpolatedAngle = prevOrbitAngle + (currOrbitAngle - prevOrbitAngle) * alpha;
      sceneCtx.setCameraOrbitAngle(interpolatedAngle);
      sceneCtx.updateSunShadowTarget(bounds.center);
    } else {
      chaseCamera.update(renderPose, renderState, renderRoute, realDt);
      sceneCtx.updateSunShadowTarget(renderPose.position);
    }

    sceneCtx.updateTheme(sceneCtx.camera.position, realDt);
    particles.update(realDt, renderPose, renderState);

    const speedMs =
      renderState.mode === 'grounded'
        ? Math.abs(renderState.vForward)
        : renderState.worldVel.length();
    const speedRatio = speedMs / Math.max(1, CONFIG.physics.maxSpeed);
    const minFactor = CONFIG.fx.speedLines.minSpeedFactor;
    const baseSpeedFactor =
      speedRatio > minFactor
        ? THREE.MathUtils.clamp((speedRatio - minFactor) / Math.max(0.05, 1 - minFactor), 0, 1)
        : 0;
    const boostSurge = renderState.boostTimeLeft > 0 ? CONFIG.fx.speedLines.boostBonus : 0;
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
    soundSnapshot.boostActive = renderState.boostTimeLeft > 0;
    soundSnapshot.slip = renderState.slip;
    soundSnapshot.grounded = renderState.mode === 'grounded';
    soundSnapshot.airborne = renderState.mode === 'airborne';
    soundSnapshot.falling = renderState.mode === 'falling';
    soundSnapshot.railContact = renderState.railContactTimer > 0;
    sound.update(soundSnapshot, realDt);

    const rawProgressS = renderState.mode === 'grounded' ? renderState.s : renderState.sApprox;
    const activeProgressS =
      (renderState.routeId !== 'main' ? (renderState.routeLapOffset ?? 0) : 0) +
      course.getProgressS(renderState.routeId, rawProgressS);
    const lapStartS = Math.max(0, raceState.currentLap - 1) * progressSpanS;
    const progress01 = isClosedCourse
      ? activeProgressS < lapStartS
        ? 0
        : THREE.MathUtils.clamp((activeProgressS - lapStartS) / progressSpanS, 0, 1)
      : THREE.MathUtils.clamp((activeProgressS - startGridSlot.s) / progressSpanS, 0, 1);

    hudViewModel.phase = raceState.phase;
    hudViewModel.resultReady = raceState.resultReady;
    hudViewModel.speedKmh = speedMs * CONFIG.hud.speedScale;
    hudViewModel.boost01 =
      CONFIG.boost.duration > 1e-4
        ? Math.min(1, Math.max(0, renderState.boostTimeLeft / CONFIG.boost.duration))
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
    updateHud(hud, hudViewModel);

    postfx.render(realDt);
  }

  function scheduleAfterSoftwareDraw(next: () => void): void {
    const gl = sceneCtx.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = (): void => {
        if (disposed || contextLost) {
          return;
        }
        const status = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (status === gl.UNSIGNALED) {
          frameHandle = window.setTimeout(poll, CONFIG.renderer.softwareGlPollMs);
        } else {
          if (sync) {
            gl.deleteSync(sync);
          }
          frameHandle = window.setTimeout(next, CONFIG.renderer.softwareGlFramePauseMs);
        }
      };
      frameHandle = window.setTimeout(poll, CONFIG.renderer.softwareGlPollMs);
    } else {
      frameHandle = window.setTimeout(next, CONFIG.renderer.softwareGlFramePauseMs);
    }
  }

  function tick(nowMs: number): void {
    if (disposed || contextLost) {
      return;
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
        qualityManager.update(frameDt);
        debugOverlay?.update(
          nowMs,
          currState,
          raceState,
          course,
          qualityManager.getLevel(),
          activePreset,
          activeCarDesign,
        );
      }

      emitDebugMetrics(nowMs);
    } catch (err) {
      const info = extractErrorInfo(err);
      logErrorOverlay(info.message, info.file, info.line);
    } finally {
      if (!disposed && !contextLost) {
        if (sceneCtx.isSoftwareGl) {
          scheduleAfterSoftwareDraw(() => tick(performance.now()));
        } else {
          frameHandle = window.requestAnimationFrame(tick);
        }
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

    if (sceneCtx.isSoftwareGl) {
      tick(performance.now());
    } else {
      frameHandle = window.requestAnimationFrame(tick);
    }
  }

  window.addEventListener('beforeunload', () => {
    disposed = true;
    clearPendingCourseSwitch(false);
    sceneCtx.renderer.domElement.removeEventListener('webglcontextlost', handleCanvasContextLost);
    window.cancelAnimationFrame(frameHandle);
    window.clearTimeout(frameHandle);
    window.clearTimeout(debugToastTimeout);
    if (debugToastEl && debugToastEl.parentElement === container) {
      container.removeChild(debugToastEl);
    }
    if (debugFlagActive) {
      window.removeEventListener('keydown', handleDebugKey);
    }
    window.removeEventListener('resize', handleWindowResize);
    document.removeEventListener('visibilitychange', syncPauseState);
    unbindTouchStatus();
    hud.audioBtnEl.removeEventListener('click', handleAudioButtonClick);
    courseSelect.dispose();
    controls.dispose();
    touchControls.dispose();
    sound.dispose();
    disposeHud(hud);
    disposeErrorOverlay();
    debugOverlay?.dispose();
    qualityManager.dispose();
    particles.dispose();
    postfx.dispose();
    trackVisual.dispose();
    bridgeVisual.dispose();
    tunnelVisual.dispose();
    trackAccentsVisual.dispose();
    gates.dispose();
    shortcutGateVisual.dispose();
    carVisual.dispose();
    sceneCtx.dispose();
  });
}
