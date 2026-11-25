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
import { createHud, disposeHud, updateHud, type HudViewModel } from './ui/hud';

interface DebugOverlay {
  update: (nowMs: number, carState: CarState) => void;
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
  panel.style.background = 'rgba(15, 23, 42, 0.74)';
  panel.style.color = '#FFD23F';
  panel.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace';
  panel.style.fontSize = '12px';
  panel.style.fontWeight = '700';
  panel.style.lineHeight = '1.45';
  panel.style.letterSpacing = '0.03em';
  panel.style.pointerEvents = 'none';
  panel.style.userSelect = 'none';
  panel.style.whiteSpace = 'pre';
  panel.textContent = 'FPS: --\nSPD: 0 km/h\nPOS: s=0.0m lat=0.00m';
  container.appendChild(panel);

  let frameCount = 0;
  let lastSampleMs = performance.now();
  let displayedFps = '--';

  return {
    update(nowMs: number, carState: CarState): void {
      frameCount++;
      const elapsedSec = (nowMs - lastSampleMs) / 1000;
      if (elapsedSec >= CONFIG.debug.fpsSampleIntervalSec) {
        displayedFps = String(Math.round(frameCount / elapsedSec));
        frameCount = 0;
        lastSampleMs = nowMs;
      }

      const speedKmh = Math.round(Math.abs(carState.vForward) * 3.6);
      const sText = carState.s.toFixed(1);
      const latText = carState.lateral.toFixed(2);
      panel.textContent = `FPS: ${displayedFps}\nSPD: ${speedKmh} km/h\nPOS: s=${sText}m lat=${latText}m`;
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
    controlPoints: CONFIG.course.controlPoints,
    defaultWidth: CONFIG.course.trackWidth,
    samplesPerMeter: CONFIG.course.samplesPerMeter,
    curveDivisionsPerPoint: CONFIG.course.curveDivisionsPerPoint,
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
  };
  const carBasis = new THREE.Matrix4();
  const negForward = new THREE.Vector3();

  const hudViewModel: HudViewModel = {
    speedKmh: 0,
    boost01: 0,
    timeSeconds: 0,
  };

  // Snap car & chase camera immediately at startup
  getCarPose(currState, course, renderPose);
  carVisual.group.position.copy(renderPose.position);
  negForward.copy(renderPose.tangent).negate();
  carBasis.makeBasis(renderPose.right, renderPose.up, negForward);
  carVisual.group.quaternion.setFromRotationMatrix(carBasis);
  if (!CONFIG.camera.debugOrbitMode) {
    chaseCamera.snapTo(renderPose);
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

    if (CONFIG.camera.snapOnReset && !CONFIG.camera.debugOrbitMode) {
      getCarPose(currState, course, renderPose);
      chaseCamera.snapTo(renderPose);
    }
  }

  function update(step: number): void {
    const input = controls.sample(step);
    if (input.resetPressed) {
      resetCarToStart();
      return;
    }

    copyCarState(currState, prevState);
    stepCar(currState, input, course, step);

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
    negForward.copy(renderPose.tangent).negate();
    carBasis.makeBasis(renderPose.right, renderPose.up, negForward);
    carVisual.group.quaternion.setFromRotationMatrix(carBasis);
    carVisual.update(renderState, realDt);

    if (CONFIG.camera.debugOrbitMode) {
      const interpolatedAngle = prevOrbitAngle + (currOrbitAngle - prevOrbitAngle) * alpha;
      sceneCtx.setCameraOrbitAngle(interpolatedAngle);
    } else {
      chaseCamera.update(renderPose, renderState, realDt);
    }

    hudViewModel.speedKmh = Math.abs(renderState.vForward) * CONFIG.hud.speedScale;
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
    debugOverlay?.update(nowMs, currState);

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
