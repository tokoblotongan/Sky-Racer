// src/main.ts

import * as THREE from 'three';
import { setAudioPaused } from './audio/audioManager';
import { createSound, type SoundSnapshot } from './audio/sound';
import { CONFIG } from './config';
import { buildCourseConfigFromDefinition, Course } from './core/course';
import { getCourse } from './courses';
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
import {
  applyManualResetPenalty,
  createRaceState,
  getRespawnTarget,
  refreshRaceRecords,
  restartRace,
  returnToTitle,
  startCountdown,
  updateRace,
  type FinishResultData,
  type RaceEvent,
  type RaceState,
} from './core/state';
import { createKeyboardControls } from './input/controls';
import { createTouchControls } from './input/touch';
import { buildCarMesh } from './render/car';
import { ChaseCamera } from './render/chaseCamera';
import { buildGates } from './render/gates';
import { createParticles } from './render/particles';
import { createPostFx } from './render/postfx';
import { buildProps, type PropsVisual } from './render/props';
import { createQualityManager, type QualityLevel } from './render/quality';
import { createSceneContext } from './render/scene';
import { buildTrackMesh } from './render/track';
import {
  clearRecords,
  exportSummaryText,
  getRecords,
  type CourseRecords,
} from './services/records';
import {
  createHud,
  disposeHud,
  hideAirtimePopup,
  hideCountdownOverlay,
  hideFinishScreen,
  hideSplitPopup,
  setHudProgressCheckpoints,
  showAirtimePopup,
  showCountdownOverlay,
  showFinishScreen,
  showSplitPopup,
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
  panel.style.color = '#FFD23F';
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
    ): void {
      frameCount++;
      const elapsedSec = (nowMs - lastSampleMs) / 1000;
      if (elapsedSec >= CONFIG.debug.fpsSampleIntervalSec) {
        displayedFps = String(Math.round(frameCount / elapsedSec));
        frameCount = 0;
        lastSampleMs = nowMs;
      }

      const activeS = carState.mode === 'grounded' ? carState.s : carState.sApprox;
      course.getFrameAt(activeS, tmpFrame);
      const seg = course.getSegmentAt(activeS);
      const speedMs =
        carState.mode === 'grounded' ? Math.abs(carState.vForward) : carState.worldVel.length();
      const speedKmh = Math.round(speedMs * 3.6);
      const pitchDeg = Math.round(
        THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(tmpFrame.tangent.y, -1, 1))),
      );
      const bankDeg = Math.round(THREE.MathUtils.radToDeg(tmpFrame.bank));
      const yawDeg = THREE.MathUtils.radToDeg(carState.yaw);

      panel.textContent =
        `FPS: ${displayedFps} | QUAL: ${qualityLevel.toUpperCase()} | PHASE: ${raceState.phase} | MODE: ${carState.mode.toUpperCase()} | SPD: ${speedKmh} km/h\n` +
        `POS: s=${carState.s.toFixed(1)}m sApprox=${carState.sApprox.toFixed(1)}m lat=${carState.lateral.toFixed(2)}m | yaw=${yawDeg.toFixed(1)}° vLat=${carState.vLateral.toFixed(2)}m/s steer=${carState.steer.toFixed(2)} rail=${carState.railContactTimer.toFixed(2)}s\n` +
        `CP: next=${raceState.nextCheckpointIndex}/${raceState.totalCheckpoints} | BOOST: ${carState.boostTimeLeft.toFixed(2)}s | AIR: ${carState.airtime.toFixed(2)}s\n` +
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

function bootstrap(): void {
  const container = document.getElementById('app');
  if (!container) {
    throw new Error('Root container #app not found.');
  }

  let propsVisual: PropsVisual | null = null;
  let activePropsDensityScale = -1;

  const sceneCtx = createSceneContext(container);
  const debugOverlay = createDebugOverlay(container);
  const sound = createSound();
  sound.init();
  sound.unlock();

  const touchControls = createTouchControls(container, CONFIG.touch);
  touchControls.setMutedVisual(sound.getMuted());

  const activeCourseDef = getCourse(CONFIG.activeCourseId);
  const course = new Course(buildCourseConfigFromDefinition(activeCourseDef));
  const raceState = createRaceState(course);

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

  const finishS = course.getFinishS();
  const progressSpanS = Math.max(1, finishS - CONFIG.car.startS);
  const checkpointRatios = course
    .getCheckpoints()
    .map((cp) => THREE.MathUtils.clamp((cp.s - CONFIG.car.startS) / progressSpanS, 0, 1));
  setHudProgressCheckpoints(hud, checkpointRatios);

  const bounds = course.getBounds();
  sceneCtx.setRoomBounds(bounds);

  const trackVisual = buildTrackMesh(course, sceneCtx.maxAnisotropy);
  sceneCtx.scene.add(trackVisual.group);

  const gates = buildGates(course, sceneCtx.maxAnisotropy);
  sceneCtx.scene.add(gates.group);

  const orbitRadius = Math.max(
    CONFIG.camera.orbitMinRadius,
    bounds.radius * CONFIG.camera.orbitRadiusScale,
  );
  sceneCtx.setOrbitTarget(bounds.center, orbitRadius, CONFIG.camera.orbitHeight);

  const carVisual = buildCarMesh(sceneCtx.maxAnisotropy);
  sceneCtx.scene.add(carVisual.group);

  const chaseCamera = new ChaseCamera(sceneCtx.camera);
  const controls = createKeyboardControls(touchControls);

  let particles: ReturnType<typeof createParticles>;
  let postfx: ReturnType<typeof createPostFx>;

  function syncPropsForQuality(level: QualityLevel): void {
    const nextDensityScale = CONFIG.quality.levels[level].propsDensityScale;
    if (propsVisual && nextDensityScale === activePropsDensityScale) {
      return;
    }
    if (propsVisual) {
      sceneCtx.scene.remove(propsVisual.group);
      propsVisual.dispose();
    }
    activePropsDensityScale = nextDensityScale;
    propsVisual = buildProps(course, level, sceneCtx.maxAnisotropy);
    sceneCtx.scene.add(propsVisual.group);
  }

  const qualityManager = createQualityManager(CONFIG.quality, (level) => {
    sceneCtx.setQuality(level);
    particles?.setQuality(level);
    postfx?.setQuality(level);
    syncPropsForQuality(level);
  });

  const initialQuality = qualityManager.getLevel();
  sceneCtx.setQuality(initialQuality);
  syncPropsForQuality(initialQuality);
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

  function handleWindowResize(): void {
    const { width, height } = sceneCtx.getViewportSize();
    postfx.resize(width, height);
  }
  window.addEventListener('resize', handleWindowResize);

  let prevState = createCarState();
  let currState = createCarState();
  const renderState = createCarState();

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

  const hudViewModel: HudViewModel = {
    phase: raceState.phase,
    resultReady: raceState.resultReady,
    speedKmh: 0,
    boost01: 0,
    progress01: 0,
    timeSeconds: 0,
    cpPassed: 0,
    cpTotal: raceState.totalCheckpoints,
    bestTime: raceState.bestTime,
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
  let disposed = false;

  function syncTitleUi(): void {
    updateTitleScreen(hud, {
      courseName: course.getName(),
      medals: course.getMedals(),
      records: getRecords(course.getId(), course.getMedals()),
    });
  }
  syncTitleUi();

  touchControls.setPhase(raceState.phase);

  let paused = false;
  function setPaused(nextPaused: boolean): void {
    const resolved = Boolean(nextPaused);
    if (resolved === paused) {
      return;
    }
    paused = resolved;
    setAudioPaused(paused);
    if (!paused) {
      lastFrameMs = performance.now();
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
      } else if (ev.type === 'go') {
        showCountdownOverlay(hud, 'GO!', true);
      } else if (ev.type === 'checkpoint') {
        gates.setPassed(ev.index);
        gates.setActive(ev.index + 1);
        showSplitPopup(hud, ev);
      } else if (ev.type === 'finish') {
        lastFinishData = ev;
        lastFinishRecords = getRecords(course.getId(), course.getMedals());
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
    sound.unlock();
    lastFinishData = null;
    lastFinishRecords = null;
    hideFinishScreen(hud);

    if (raceState.phase === 'TITLE') {
      sound.handleEvents([{ type: 'uiConfirm' }]);
      particles.reset();
      postfx.setSpeedIntensity(0);
      const events = startCountdown(raceState);
      chaseCamera.setMode('chase');
      handleRaceEvents(events);
      return;
    }

    prevState = createCarState();
    currState = createCarState();
    gates.reset();
    particles.reset();
    postfx.setSpeedIntensity(0);
    hideAirtimePopup(hud);
    hideSplitPopup(hud);
    hideCountdownOverlay(hud);

    sound.reset();
    const events = restartRace(raceState);
    chaseCamera.setMode('chase');

    if (CONFIG.camera.snapOnReset && !CONFIG.camera.debugOrbitMode) {
      getCarPose(currState, course, renderPose);
      chaseCamera.snapTo(renderPose, currState, course);
    }

    handleRaceEvents(events);
  }

  function handleReturnToTitle(): void {
    sound.unlock();
    lastFinishData = null;
    lastFinishRecords = null;
    lastThrottle = 0;

    prevState = createCarState();
    currState = createCarState();
    gates.reset();
    particles.reset();
    postfx.setSpeedIntensity(0);
    hideAirtimePopup(hud);
    hideSplitPopup(hud);
    hideCountdownOverlay(hud);
    hideFinishScreen(hud);

    sound.reset();
    const events = returnToTitle(raceState, course);
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
    clearRecords(course.getId());
    refreshRaceRecords(raceState, course);
    sound.handleEvents([{ type: 'uiConfirm' }]);
    syncTitleUi();
  };

  function handleCheckpointReset(): void {
    const target = getRespawnTarget(raceState, course);
    respawnAt(currState, course, target.s, target.lateral, CONFIG.race.resetSpeedFactor);
    applyManualResetPenalty(raceState);
    copyCarState(currState, prevState);
    hideAirtimePopup(hud);
    sound.handleEvents([{ type: 'respawn' }]);

    if (CONFIG.camera.snapOnReset && !CONFIG.camera.debugOrbitMode) {
      getCarPose(currState, course, renderPose);
      chaseCamera.snapTo(renderPose, currState, course);
    }
  }

  function update(step: number): void {
    const input = controls.sample(step);

    if (input.mutePressed) {
      sound.unlock();
      const nextMuted = sound.toggleMute();
      touchControls.setMutedVisual(nextMuted);
    }

    if (input.menuPressed && raceState.phase === 'FINISH') {
      lastThrottle = 0;
      handleReturnToTitle();
      return;
    }

    if (input.confirmPressed || (input.restartPressed && raceState.phase !== 'TITLE')) {
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
    const respawnTarget = getRespawnTarget(raceState, course);
    const physicsEvents = stepCar(currState, input, course, step, {
      phase: raceState.phase,
      respawnTarget,
    });

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
        getCarPose(currState, course, eventPose);
        particles.emit({
          type: 'boost',
          position: eventPose.position,
          forward: eventPose.tangent,
          right: eventPose.right,
          up: eventPose.up,
        });
      } else if (ev.type === 'respawn') {
        copyCarState(currState, prevState);
        hideAirtimePopup(hud);
        if (!CONFIG.camera.debugOrbitMode) {
          getCarPose(currState, course, renderPose);
          chaseCamera.snapTo(renderPose, currState, course);
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
        speedKmh: carSpeedKmh,
      },
      course,
      step,
      physicsEvents,
    );
    handleRaceEvents(raceEvents);

    if (CONFIG.camera.debugOrbitMode) {
      prevOrbitAngle = currOrbitAngle;
      currOrbitAngle += CONFIG.camera.orbitSpeed * step;
    }
  }

  function render(alpha: number, realDt: number): void {
    trackVisual.update(realDt);

    interpolateCarState(prevState, currState, alpha, renderState);
    getCarPose(renderState, course, renderPose);

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
      chaseCamera.update(renderPose, renderState, course, realDt);
      sceneCtx.updateSunShadowTarget(renderPose.position);
    }

    propsVisual?.update(sceneCtx.camera.position);
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

    const activeProgressS =
      renderState.mode === 'grounded' ? renderState.s : renderState.sApprox;
    hudViewModel.phase = raceState.phase;
    hudViewModel.resultReady = raceState.resultReady;
    hudViewModel.speedKmh = speedMs * CONFIG.hud.speedScale;
    hudViewModel.boost01 =
      CONFIG.boost.duration > 1e-4
        ? Math.min(1, Math.max(0, renderState.boostTimeLeft / CONFIG.boost.duration))
        : 0;
    hudViewModel.progress01 = THREE.MathUtils.clamp(
      (activeProgressS - CONFIG.car.startS) / progressSpanS,
      0,
      1,
    );
    hudViewModel.timeSeconds = raceState.timer;
    hudViewModel.cpPassed = raceState.passedCheckpoints.length;
    hudViewModel.cpTotal = raceState.totalCheckpoints;
    hudViewModel.bestTime = raceState.bestTime;
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
        if (disposed) {
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
    if (disposed) {
      return;
    }

    const rawDt = (nowMs - lastFrameMs) / 1000;
    lastFrameMs = nowMs;

    if (!paused) {
      const frameDt = Math.min(Math.max(rawDt, 0), maxFrameDt);
      accumulator += frameDt;

      while (accumulator >= fixedStep) {
        update(fixedStep);
        accumulator -= fixedStep;
      }

      const alpha = accumulator / fixedStep;
      render(alpha, frameDt);
      qualityManager.update(frameDt);
      debugOverlay?.update(nowMs, currState, raceState, course, qualityManager.getLevel());
    }

    if (sceneCtx.isSoftwareGl) {
      scheduleAfterSoftwareDraw(() => tick(performance.now()));
    } else {
      frameHandle = window.requestAnimationFrame(tick);
    }
  }

  if (paused) {
    updateHud(hud, hudViewModel);
    postfx.render(0);
  }

  if (sceneCtx.isSoftwareGl) {
    tick(performance.now());
  } else {
    frameHandle = window.requestAnimationFrame(tick);
  }

  window.addEventListener('beforeunload', () => {
    disposed = true;
    window.cancelAnimationFrame(frameHandle);
    window.clearTimeout(frameHandle);
    window.removeEventListener('resize', handleWindowResize);
    document.removeEventListener('visibilitychange', syncPauseState);
    unbindTouchStatus();
    hud.audioBtnEl.removeEventListener('click', handleAudioButtonClick);
    controls.dispose();
    touchControls.dispose();
    sound.dispose();
    disposeHud(hud);
    debugOverlay?.dispose();
    qualityManager.dispose();
    particles.dispose();
    postfx.dispose();
    propsVisual?.dispose();
    sceneCtx.dispose();
  });
}

bootstrap();
