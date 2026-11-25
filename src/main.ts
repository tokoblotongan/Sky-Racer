// src/main.ts

import * as THREE from 'three';
import { CONFIG } from './config';
import { Course } from './core/course';
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
  restartRace,
  startCountdown,
  updateRace,
  type RaceEvent,
  type RaceState,
} from './core/state';
import { createKeyboardControls } from './input/controls';
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
  createHud,
  disposeHud,
  hideAirtimePopup,
  hideSplitPopup,
  showCountdownOverlay,
  showFinishScreen,
  showSplitPopup,
  showAirtimePopup,
  updateHud,
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

function bootstrap(): void {
  const container = document.getElementById('app');
  if (!container) {
    throw new Error('Root container #app not found.');
  }

  let propsVisual: PropsVisual | null = null;
  let activePropsDensityScale = -1;

  const sceneCtx = createSceneContext(container);
  const debugOverlay = createDebugOverlay(container);
  const hud = createHud(container);

  const course = new Course({
    segments: CONFIG.course.segments,
    startPosition: CONFIG.course.startPosition,
    startHeadingDeg: CONFIG.course.startHeadingDeg,
    defaultWidth: CONFIG.course.trackWidth,
    stepLength: CONFIG.course.stepLength,
    bankBlendLength: CONFIG.course.bankBlendLength,
    slopeBlendLength: CONFIG.course.slopeBlendLength,
    curvatureSmoothWindow: CONFIG.course.curvatureSmoothWindow,
    finishMargin: CONFIG.race.finishMargin,
    boostPadLength: CONFIG.boost.padLength,
    boostPadWidth: CONFIG.boost.padWidth,
    validate: CONFIG.debug.logCourseValidation || CONFIG.debug.showCourseFrames || CONFIG.debug.showFps,
  });

  const trackVisual = buildTrackMesh(course, sceneCtx.maxAnisotropy);
  sceneCtx.scene.add(trackVisual.group);

  const gates = buildGates(course, sceneCtx.maxAnisotropy);
  sceneCtx.scene.add(gates.group);

  const bounds = course.getBounds();
  const orbitRadius = Math.max(
    CONFIG.camera.orbitMinRadius,
    bounds.radius * CONFIG.camera.orbitRadiusScale,
  );
  sceneCtx.setOrbitTarget(bounds.center, orbitRadius, CONFIG.camera.orbitHeight);

  const carVisual = buildCarMesh(sceneCtx.maxAnisotropy);
  sceneCtx.scene.add(carVisual.group);

  const chaseCamera = new ChaseCamera(sceneCtx.camera);
  const controls = createKeyboardControls();

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

  const raceState = createRaceState(course);
  let referenceBestSplits: number[] | null = raceState.bestSplits
    ? [...raceState.bestSplits]
    : null;

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
    speedKmh: 0,
    boost01: 0,
    timeSeconds: 0,
    cpPassed: 0,
    cpTotal: raceState.totalCheckpoints,
    bestTime: raceState.bestTime,
  };

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

  function handleRaceEvents(events: readonly RaceEvent[]): void {
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
        showFinishScreen(hud, raceState, referenceBestSplits);
      }
    }
  }

  function handleConfirmAction(): void {
    if (raceState.phase === 'TITLE') {
      const events = startCountdown(raceState);
      chaseCamera.setMode('chase');
      handleRaceEvents(events);
      return;
    }

    prevState = createCarState();
    currState = createCarState();
    gates.reset();
    hideAirtimePopup(hud);
    hideSplitPopup(hud);

    const events = restartRace(raceState);
    referenceBestSplits = raceState.bestSplits ? [...raceState.bestSplits] : null;
    chaseCamera.setMode('chase');

    if (CONFIG.camera.snapOnReset && !CONFIG.camera.debugOrbitMode) {
      getCarPose(currState, course, renderPose);
      chaseCamera.snapTo(renderPose, currState, course);
    }

    handleRaceEvents(events);
  }

  function handleCheckpointReset(): void {
    const target = getRespawnTarget(raceState, course);
    respawnAt(currState, course, target.s, target.lateral, CONFIG.race.resetSpeedFactor);
    applyManualResetPenalty(raceState);
    copyCarState(currState, prevState);
    hideAirtimePopup(hud);

    if (CONFIG.camera.snapOnReset && !CONFIG.camera.debugOrbitMode) {
      getCarPose(currState, course, renderPose);
      chaseCamera.snapTo(renderPose, currState, course);
    }
  }

  function update(step: number): void {
    const input = controls.sample(step);

    if (input.confirmPressed) {
      handleConfirmAction();
      return;
    }

    if (input.resetPressed && raceState.phase === 'RACING') {
      handleCheckpointReset();
      return;
    }

    copyCarState(currState, prevState);
    const respawnTarget = getRespawnTarget(raceState, course);
    const physicsEvents = stepCar(currState, input, course, step, {
      phase: raceState.phase,
      respawnTarget,
    });

    for (const ev of physicsEvents) {
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

    const raceEvents = updateRace(
      raceState,
      {
        s: currState.s,
        sApprox: currState.sApprox,
        mode: currState.mode,
      },
      course,
      step,
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

    hudViewModel.phase = raceState.phase;
    hudViewModel.speedKmh = speedMs * CONFIG.hud.speedScale;
    hudViewModel.boost01 =
      CONFIG.boost.duration > 1e-4
        ? Math.min(1, Math.max(0, renderState.boostTimeLeft / CONFIG.boost.duration))
        : 0;
    hudViewModel.timeSeconds = raceState.timer;
    hudViewModel.cpPassed = raceState.passedCheckpoints.length;
    hudViewModel.cpTotal = raceState.totalCheckpoints;
    hudViewModel.bestTime = raceState.bestTime;
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

    if (sceneCtx.isSoftwareGl) {
      scheduleAfterSoftwareDraw(() => tick(performance.now()));
    } else {
      frameHandle = window.requestAnimationFrame(tick);
    }
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
    controls.dispose();
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
