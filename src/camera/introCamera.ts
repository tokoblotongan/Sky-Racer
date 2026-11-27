// src/camera/introCamera.ts

import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Course, CourseSegmentMeta, TrackFrame } from '../core/course';

export interface IntroCameraController {
  isActive: () => boolean;
  isFinished: () => boolean;
  start: (course: Course, aspect?: number) => boolean;
  skip: () => void;
  stop: () => void;
  update: (camera: THREE.PerspectiveCamera, realDt: number) => boolean;
}

const _tmpFrame: TrackFrame = {
  s: 0,
  position: new THREE.Vector3(),
  tangent: new THREE.Vector3(),
  up: new THREE.Vector3(),
  right: new THREE.Vector3(),
  width: CONFIG.course.trackWidth,
  bank: 0,
};

const _posCurveOut = new THREE.Vector3();
const _lookCurveOut = new THREE.Vector3();
const _blendedPos = new THREE.Vector3();
const _blendedLook = new THREE.Vector3();
const _blendedUp = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);

export function isReducedMotionPreferred(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function resolveGridChaseTarget(
  course: Course,
  aspect: number,
  outPos: THREE.Vector3,
  outLook: THREE.Vector3,
  outUp: THREE.Vector3,
): number {
  const camCfg = CONFIG.camera;
  const slot0 = course.getGridSlots(course.getRacers())[0];
  const isClosed = course.isClosed();
  const totalLen = course.getLength();

  const frame: TrackFrame = {
    s: 0,
    position: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
    up: new THREE.Vector3(),
    right: new THREE.Vector3(),
    width: CONFIG.course.trackWidth,
    bank: 0,
  };

  course.getFrameAt(slot0.s, frame);
  outUp.copy(frame.up).normalize();
  const widthRatio = frame.width / CONFIG.course.defaultWidth;
  const widthScale = 1 + Math.max(0, widthRatio - 1) * camCfg.widthScale;
  const carScale = CONFIG.car.visualScale;
  const portraitDistScale = aspect < 1 ? camCfg.portraitDistanceScale : 1;
  const camDistance = camCfg.distance * widthScale * carScale * portraitDistScale;
  const camHeight = camCfg.height * widthScale * carScale;

  const camS = slot0.s - camDistance;
  course.getFrameAt(camS, frame);
  outPos.copy(frame.position);
  if (!isClosed && camS < 0) {
    outPos.addScaledVector(frame.tangent, camS);
  }
  outPos
    .addScaledVector(frame.up, camHeight)
    .addScaledVector(frame.right, slot0.lateral * camCfg.lateralFollowFactor);

  const lookS = slot0.s + camCfg.lookAheadDistance;
  course.getFrameAt(lookS, frame);
  outLook.copy(frame.position);
  if (!isClosed && lookS > totalLen) {
    outLook.addScaledVector(frame.tangent, lookS - totalLen);
  }
  outLook
    .addScaledVector(frame.up, camCfg.lookHeightOffset * carScale)
    .addScaledVector(frame.right, slot0.lateral * camCfg.lateralFollowFactor * 0.5);

  if (aspect >= 1 || !Number.isFinite(aspect) || aspect <= 0) {
    return camCfg.fovBase;
  }
  const minHalfHFov = THREE.MathUtils.degToRad(camCfg.minHorizontalFovDeg) * 0.5;
  const requiredVFov = THREE.MathUtils.radToDeg(
    2 * Math.atan(Math.tan(minHalfHFov) / Math.max(0.25, aspect)),
  );
  return Math.min(camCfg.maxPortraitVerticalFovDeg, Math.max(camCfg.fovBase, requiredVFov));
}

function findNamedRange(
  segments: readonly CourseSegmentMeta[],
  namePart: string,
): { startS: number; endS: number; midS: number } | null {
  const needle = namePart.toLowerCase();
  let startS = Infinity;
  let endS = -Infinity;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.name && seg.name.toLowerCase().includes(needle)) {
      startS = Math.min(startS, seg.startS);
      endS = Math.max(endS, seg.endS);
    }
  }
  if (!Number.isFinite(startS) || !Number.isFinite(endS)) {
    return null;
  }
  return { startS, endS, midS: (startS + endS) * 0.5 };
}

function buildWaypointFromCourseS(
  course: Course,
  trackS: number,
  heightLift: number,
  lateralPush: number,
  lookDeltaS: number,
  lookHeightOffset: number,
): { pos: THREE.Vector3; look: THREE.Vector3 } {
  const frame: TrackFrame = {
    s: 0,
    position: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
    up: new THREE.Vector3(),
    right: new THREE.Vector3(),
    width: CONFIG.course.trackWidth,
    bank: 0,
  };
  course.getFrameAt(trackS, frame);
  const pos = frame.position
    .clone()
    .addScaledVector(_worldUp, heightLift)
    .addScaledVector(frame.right, lateralPush);

  course.getFrameAt(trackS + lookDeltaS, _tmpFrame);
  const look = _tmpFrame.position.clone().addScaledVector(_worldUp, lookHeightOffset);
  return { pos, look };
}

function buildIntroSplines(
  course: Course,
  endPos: THREE.Vector3,
  endLook: THREE.Vector3,
): {
  posCurve: THREE.CatmullRomCurve3;
  lookCurve: THREE.CatmullRomCurve3;
} {
  const cfg = CONFIG.intro;
  const totalLen = Math.max(100, course.getLength());
  const segments = course.getSegmentList();
  const posPoints: THREE.Vector3[] = [];
  const lookPoints: THREE.Vector3[] = [];

  const pushWp = (
    s: number,
    lift: number,
    lat: number,
    lookDelta: number = cfg.lookAheadMeters,
    lookLift = 1.8,
  ): void => {
    const wp = buildWaypointFromCourseS(course, s, lift, lat, lookDelta, lookLift);
    posPoints.push(wp.pos);
    lookPoints.push(wp.look);
  };

  if (course.getId() === 'fantasy-land') {
    const dragonLoop = findNamedRange(segments, 'Dragon Loop');
    const bridge = findNamedRange(segments, 'Jembatan Pelangi');
    const tunnel = findNamedRange(segments, 'Terowongan Kristal');

    const loopS = dragonLoop ? dragonLoop.midS : totalLen * 0.24;
    const bridgeS = bridge ? bridge.midS : totalLen * 0.37;
    const tunnelS = tunnel ? tunnel.startS + (tunnel.endS - tunnel.startS) * 0.35 : totalLen * 0.44;

    // 1. Wide establishing view near Dragon Loop entrance
    pushWp(loopS - 38, cfg.heightOffset * 1.45, -cfg.lateralOffset * 1.5, 42, 4.5);
    // 2. Orbit outside Dragon Loop to showcase vertical corkscrew silhouette
    pushWp(loopS, cfg.heightOffset * 1.25, cfg.lateralOffset * 2.1, -6, 6.0);
    // 3. Glide across Jembatan Pelangi overlooking rainbow arch & park
    pushWp(bridgeS, cfg.heightOffset * 1.15, -cfg.lateralOffset * 1.35, 34, 2.2);
    // 4. Frame Terowongan Kristal portal & glowing ribs before sweeping to start straight
    pushWp(tunnelS, cfg.heightOffset * 1.05, cfg.lateralOffset * 1.25, -18, 2.5);
    // 5. Elevated approach down the main straight toward grid slot 0
    pushWp(Math.max(0, course.isClosed() ? totalLen - 34 : 0), cfg.heightOffset * 0.72, 2.5, 42, 1.4);
  } else {
    // Acrobatic showcase for Sky Circuit (or any open/custom track):
    // highlight Loop 1, Jump 1 / Flyover, and Loop 2
    const loops = segments.filter((seg) => seg.type === 'loop');
    const gaps = segments.filter((seg) => seg.type === 'gap');
    const flyover = segments.find((seg) => seg.type === 'straight' && seg.length >= 90);

    const p1S = loops[0] ? (loops[0].startS + loops[0].endS) * 0.5 : totalLen * 0.24;
    const p2S = flyover
      ? (flyover.startS + flyover.endS) * 0.45
      : gaps[0]
        ? gaps[0].startS
        : totalLen * 0.52;
    const p3S = loops[1]
      ? (loops[1].startS + loops[1].endS) * 0.5
      : gaps[1]
        ? gaps[1].startS
        : totalLen * 0.74;

    // 1. Acrobatic Loop 1 aerial shot
    pushWp(p1S, cfg.heightOffset * 1.2, cfg.lateralOffset * 1.55, 10, 4.2);
    // 2. Elevated Flyover / Jump 1 sweep
    pushWp(p2S, cfg.heightOffset * 1.15, -cfg.lateralOffset * 1.3, 28, 2.0);
    // 3. Second Loop showcase
    pushWp(p3S, cfg.heightOffset * 1.05, cfg.lateralOffset * 1.45, -12, 3.8);
    // 4. Swoop back above opening straight ahead of the grid
    const startSlotS = course.getGridSlots(course.getRacers())[0].s;
    pushWp(startSlotS + 26, cfg.heightOffset * 0.65, -4.5, -24, 1.5);
  }

  // Final point matches the grid chase camera pose so blend completes seamlessly
  posPoints.push(endPos.clone());
  lookPoints.push(endLook.clone());

  return {
    posCurve: new THREE.CatmullRomCurve3(posPoints, false, 'centripetal', 0.5),
    lookCurve: new THREE.CatmullRomCurve3(lookPoints, false, 'centripetal', 0.5),
  };
}

export function createIntroCamera(): IntroCameraController {
  let active = false;
  let finished = false;
  let elapsed = 0;
  let posCurve: THREE.CatmullRomCurve3 | null = null;
  let lookCurve: THREE.CatmullRomCurve3 | null = null;
  const endPos = new THREE.Vector3();
  const endLook = new THREE.Vector3();
  const endUp = new THREE.Vector3(0, 1, 0);
  let endFov: number = CONFIG.camera.fovBase;

  const stop = (): void => {
    active = false;
    finished = false;
    posCurve = null;
    lookCurve = null;
  };

  const skip = (): void => {
    if (!active) {
      return;
    }
    active = false;
    finished = true;
    posCurve = null;
    lookCurve = null;
  };

  const start = (course: Course, aspect = 1.77): boolean => {
    if (isReducedMotionPreferred()) {
      stop();
      finished = true;
      return false;
    }
    endFov = resolveGridChaseTarget(course, aspect, endPos, endLook, endUp);
    const curves = buildIntroSplines(course, endPos, endLook);
    posCurve = curves.posCurve;
    lookCurve = curves.lookCurve;
    elapsed = 0;
    active = true;
    finished = false;
    return true;
  };

  const update = (camera: THREE.PerspectiveCamera, realDt: number): boolean => {
    if (!active || !posCurve || !lookCurve) {
      return false;
    }
    const dt = THREE.MathUtils.clamp(realDt, 0, CONFIG.sim.maxFrameDt);
    const duration = Math.max(1.5, CONFIG.intro.durationSeconds);
    elapsed = Math.min(duration, elapsed + dt);
    const t = THREE.MathUtils.clamp(elapsed / duration, 0, 1);

    // Smooth ease-in-out curve progression along spline
    const easedT = t * t * (3 - 2 * t);
    posCurve.getPoint(easedT, _posCurveOut);
    lookCurve.getPoint(easedT, _lookCurveOut);

    const tailStart = Math.max(0.05, 1 - CONFIG.intro.tailBlendFraction);
    if (t >= tailStart) {
      const localAlpha = (t - tailStart) / Math.max(1e-4, 1 - tailStart);
      const blend = localAlpha * localAlpha * (3 - 2 * localAlpha);
      _blendedPos.lerpVectors(_posCurveOut, endPos, blend);
      _blendedLook.lerpVectors(_lookCurveOut, endLook, blend);
      _blendedUp.lerpVectors(_worldUp, endUp, blend).normalize();
      const targetFov = THREE.MathUtils.lerp(CONFIG.intro.fov, endFov, blend);
      if (Math.abs(camera.fov - targetFov) > 1e-3) {
        camera.fov = targetFov;
        camera.updateProjectionMatrix();
      }
      camera.position.copy(_blendedPos);
      camera.up.copy(_blendedUp);
      camera.lookAt(_blendedLook);
    } else {
      const introFov =
        camera.aspect < 1 ? Math.max(CONFIG.intro.fov, endFov) : CONFIG.intro.fov;
      if (Math.abs(camera.fov - introFov) > 1e-3) {
        camera.fov = introFov;
        camera.updateProjectionMatrix();
      }
      camera.position.copy(_posCurveOut);
      camera.up.copy(_worldUp);
      camera.lookAt(_lookCurveOut);
    }

    if (t >= 1) {
      active = false;
      finished = true;
      posCurve = null;
      lookCurve = null;
      return true;
    }
    return false;
  };

  return {
    isActive: () => active,
    isFinished: () => finished,
    start,
    skip,
    stop,
    update,
  };
}
