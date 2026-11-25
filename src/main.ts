// src/main.ts

import * as THREE from 'three';
import { CONFIG } from './config';
import { Course } from './core/course';
import {
  copyCarState,
  createCarState,
  getCarPose,
  interpolateCarState,
  stepCar,
  type CarPose,
  type CarState,
} from './core/physics';
import { createKeyboardControls } from './input/controls';
import { buildCarMesh } from './render/car';
import { ChaseCamera } from './render/chaseCamera';
import { createSceneContext } from './render/scene';
import { buildTrackMesh } from './render/track';
import {
  createHud,
  disposeHud,
  hideAirtimePopup,
  showAirtimePopup,
  updateHud,
  type HudViewModel,
} from './ui/hud';

interface DebugOverlay {
  update: (nowMs: number, carState: CarState, course: Course) => void;
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
    update(nowMs: number, carState: CarState, course: Course): void {
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

      panel.textContent =
        `FPS: ${displayedFps} | MODE: ${carState.mode.toUpperCase()} | SPD: ${speedKmh} km/h\n` +
        `POS: s=${carState.s.toFixed(1)}m sApprox=${carState.sApprox.toFixed(1)}m lat=${carState.lateral.toFixed(2)}m\n` +
        `SEG: #${seg.index} ${seg.type} (${Math.round(seg.progress * 100)}%) | AIR: ${carState.airtime.toFixed(2)}s\n` +
        `N: ${carState.normalForce.toFixed(1)} m/s² | PITCH: ${pitchDeg}° BANK: ${bankDeg}°`;
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
    validate: CONFIG.debug.logCourseValidation || CONFIG.debug.showCourseFrames || CONFIG.debug.showFps,
  });
  const trackMesh = buildTrackMesh(course, sceneCtx.maxAnisotropy);
  sceneCtx.scene.add(trackMesh);

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

  const hudViewModel: HudViewModel = {
    speedKmh: 0,
    boost01: 0,
    timeSeconds: 0,
  };

  getCarPose(currState, course, renderPose);
  carVisual.group.position.copy(renderPose.position);
  carVisual.group.quaternion.copy(renderPose.quaternion);
  if (!CONFIG.camera.debugOrbitMode) {
    chaseCamera.snapTo(renderPose, currState, course);
  }

  const fixedStep = CONFIG.sim.fixedStep;
  const maxFrameDt = CONFIG.sim.maxFrameDt;

  let accumulator = 0;
  let lastFrameMs = performance.now();
  let prevOrbitAngle = 0;
  let currOrbitAngle = 0;
  let raceStarted = false;
  let raceTimeSeconds = 0;
  let frameHandle = 0;
  let disposed = false;

  function resetCarToStart(): void {
    prevState = createCarState();
    currState = createCarState();
    raceStarted = false;
    raceTimeSeconds = 0;
    hideAirtimePopup(hud);

    if (CONFIG.camera.snapOnReset && !CONFIG.camera.debugOrbitMode) {
      getCarPose(currState, course, renderPose);
      chaseCamera.snapTo(renderPose, currState, course);
    }
  }

  function update(step: number): void {
    const input = controls.sample(step);
    if (input.resetPressed) {
      resetCarToStart();
      return;
    }

    copyCarState(currState, prevState);
    const events = stepCar(currState, input, course, step);

    for (const ev of events) {
      if (ev.type === 'landed' && ev.airtime >= CONFIG.physics.minAirtimeForBonus) {
        showAirtimePopup(hud, ev.airtime);
      } else if (ev.type === 'respawn') {
        copyCarState(currState, prevState);
        if (!CONFIG.camera.debugOrbitMode) {
          getCarPose(currState, course, renderPose);
          chaseCamera.snapTo(renderPose, currState, course);
        }
      }
    }

    if (!raceStarted && Math.abs(currState.vForward) > CONFIG.hud.moveThresholdSpeedMs) {
      raceStarted = true;
    }
    if (raceStarted) {
      raceTimeSeconds += step;
    }

    if (CONFIG.camera.debugOrbitMode) {
      prevOrbitAngle = currOrbitAngle;
      currOrbitAngle += CONFIG.camera.orbitSpeed * step;
    }
  }

  function render(alpha: number, realDt: number): void {
    interpolateCarState(prevState, currState, alpha, renderState);
    getCarPose(renderState, course, renderPose);

    carVisual.group.position.copy(renderPose.position);
    carVisual.group.quaternion.copy(renderPose.quaternion);
    carVisual.update(renderState, realDt);

    if (CONFIG.camera.debugOrbitMode) {
      const interpolatedAngle = prevOrbitAngle + (currOrbitAngle - prevOrbitAngle) * alpha;
      sceneCtx.setCameraOrbitAngle(interpolatedAngle);
    } else {
      chaseCamera.update(renderPose, renderState, course, realDt);
    }

    const speedMs =
      renderState.mode === 'grounded'
        ? Math.abs(renderState.vForward)
        : renderState.worldVel.length();
    hudViewModel.speedKmh = speedMs * CONFIG.hud.speedScale;
    hudViewModel.boost01 = 0;
    hudViewModel.timeSeconds = raceTimeSeconds;
    updateHud(hud, hudViewModel);

    sceneCtx.render();
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
    debugOverlay?.update(nowMs, currState, course);

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
    controls.dispose();
    disposeHud(hud);
    debugOverlay?.dispose();
    sceneCtx.dispose();
  });
}

bootstrap();
