// src/camera/introCamera.ts

import * as THREE from 'three';
import type { ArenaIntroCameraConfig, IntroCameraWaypointConfig } from '../arenas/types';
import { CONFIG } from '../config';
import type { Course, CourseSegmentMeta, TrackFrame } from '../core/course';

export interface IntroCameraController {
  isActive: () => boolean;
  isFinished: () => boolean;
  start: (course: Course, aspect?: number, introConfig?: ArenaIntroCameraConfig) => boolean;
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

function resolveWaypointS(
  wp: IntroCameraWaypointConfig,
  course: Course,
  segments: readonly CourseSegmentMeta[],
  totalLen: number,
): number {
  const anchor = wp.anchor;
  if (anchor.kind === 'namedSegment') {
    const range = findNamedRange(segments, anchor.namePart);
    if (range) {
      const frac = anchor.fraction ?? 0.5;
      const baseS = range.startS + (range.endS - range.startS) * frac;
      return baseS + (anchor.offsetS ?? 0);
    }
    return totalLen * anchor.fallbackFraction;
  }
  if (anchor.kind === 'segmentType') {
    const matching = segments.filter(
      (seg) =>
        seg.type === anchor.segmentType &&
        (anchor.minLength === undefined || seg.length >= anchor.minLength),
    );
    const chosen = matching[anchor.occurrenceIndex ?? 0];
    if (chosen) {
      const frac = anchor.fraction ?? 0.5;
      return chosen.startS + (chosen.endS - chosen.startS) * frac;
    }
    if (anchor.fallbackType) {
      const fbList = segments.filter((seg) => seg.type === anchor.fallbackType);
      const fbSeg = fbList[anchor.fallbackOccurrenceIndex ?? 0];
      if (fbSeg) {
        return fbSeg.startS;
      }
    }
    return totalLen * anchor.fallbackFraction;
  }
  if (anchor.kind === 'gridStart') {
    const startSlotS = course.getGridSlots(course.getRacers())[0].s;
    return startSlotS + anchor.offsetS;
  }
  if (anchor.kind === 'courseEnd') {
    return Math.max(0, course.isClosed() ? totalLen - anchor.closedOffsetS : anchor.openS);
  }
  return totalLen * anchor.fraction;
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
  introConfig?: ArenaIntroCameraConfig,
): {
  posCurve: THREE.CatmullRomCurve3;
  lookCurve: THREE.CatmullRomCurve3;
} {
  const cfg = CONFIG.intro;
  const totalLen = Math.max(100, course.getLength());
  const segments = course.getSegmentList();
  const posPoints: THREE.Vector3[] = [];
  const lookPoints: THREE.Vector3[] = [];

  const waypoints: readonly IntroCameraWaypointConfig[] =
    introConfig?.highlightPoints && introConfig.highlightPoints.length > 0
      ? introConfig.highlightPoints
      : CONFIG.arenaKit.introCameraDefaults.highlightPoints;

  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i];
    const s = resolveWaypointS(wp, course, segments, totalLen);
    const lat =
      wp.lateralFixed !== undefined
        ? wp.lateralFixed
        : cfg.lateralOffset * (wp.lateralScale ?? 0);
    const built = buildWaypointFromCourseS(
      course,
      s,
      cfg.heightOffset * wp.heightScale,
      lat,
      wp.lookDeltaMeters,
      wp.lookHeightOffset,
    );
    posPoints.push(built.pos);
    lookPoints.push(built.look);
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
  let activeDurationSec: number = CONFIG.intro.durationSeconds;
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

  const start = (
    course: Course,
    aspect = 1.77,
    introConfig?: ArenaIntroCameraConfig,
  ): boolean => {
    if (isReducedMotionPreferred()) {
      stop();
      finished = true;
      return false;
    }
    activeDurationSec = Math.max(
      1.5,
      introConfig?.durationSeconds ?? CONFIG.arenaKit.introCameraDefaults.durationSeconds,
    );
    endFov = resolveGridChaseTarget(course, aspect, endPos, endLook, endUp);
    const curves = buildIntroSplines(course, endPos, endLook, introConfig);
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
    const duration = activeDurationSec;
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
