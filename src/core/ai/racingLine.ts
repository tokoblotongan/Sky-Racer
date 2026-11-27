// src/core/ai/racingLine.ts

import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { Course } from '../course';
import type { BoostPadData, Route, TrackFrame } from '../routes';

export interface RouteProfile {
  readonly routeId: string;
  readonly isClosed: boolean;
  readonly length: number;
  readonly stepLength: number;
  readonly sampleCount: number;
  readonly targetLateral: Float32Array;
  readonly maxSpeed: Float32Array;
  readonly minSafeSpeed: Float32Array;
  readonly curvature: Float32Array;
  readonly boostPads: readonly BoostPadData[];
}

export interface SampledLinePoint {
  targetLateral: number;
  maxSpeed: number;
  minSafeSpeed: number;
  curvature: number;
}

export interface CourseAiProfile {
  readonly courseId: string;
  readonly getRouteProfile: (routeId: string) => RouteProfile;
  readonly sampleAt: (routeId: string, s: number, out: SampledLinePoint) => SampledLinePoint;
  readonly findBestBoostPad: (
    routeId: string,
    s: number,
    lookaheadMeters: number,
    currentLateral: number,
  ) => BoostPadData | null;
}

const profileCache = new WeakMap<Course, CourseAiProfile>();
const _tanDiff = new THREE.Vector3();

function wrapIndex(idx: number, count: number, closed: boolean): number {
  if (closed) {
    const r = idx % count;
    return r < 0 ? r + count : r;
  }
  return Math.max(0, Math.min(count - 1, idx));
}

function buildRouteProfile(route: Route, course: Course): RouteProfile {
  const samples = route.getSamples();
  const sampleCount = Math.max(2, samples.length);
  const length = Math.max(1e-3, route.getLength());
  const isClosed = route.isClosed();
  const stepLength =
    sampleCount > 1
      ? Math.max(0.05, samples[1].s - samples[0].s)
      : CONFIG.course.stepLength;

  const targetLateral = new Float32Array(sampleCount);
  const maxSpeed = new Float32Array(sampleCount);
  const minSafeSpeed = new Float32Array(sampleCount);
  const curvature = new Float32Array(sampleCount);

  const smoothW = Math.max(2, CONFIG.ai.racingLine.smoothRadiusSamples);
  const apexPull = CONFIG.ai.racingLine.apexPullFactor;
  const railMargin = CONFIG.ai.racingLine.railSafeMargin;
  const topPhysicsSpeed = CONFIG.physics.maxSpeed;
  const maxAllowedSpeed = topPhysicsSpeed * CONFIG.boost.maxSpeedMultiplier;
  const gravity = CONFIG.physics.gravity;
  const baseLatAccel = CONFIG.ai.lateralAccelLimit;

  const branchByRoute = route.routeId === 'main' ? course.getBranchRoutes() : [];

  for (let i = 0; i < sampleCount; i++) {
    const frame = samples[i];
    const iPrev = wrapIndex(i - smoothW, sampleCount, isClosed);
    const iNext = wrapIndex(i + smoothW, sampleCount, isClosed);
    const dsSpan = Math.max(1, (iNext === iPrev ? smoothW * 2 : Math.abs(iNext - iPrev)) * stepLength);
    // Use actual modular sample distance on closed loops across seam
    const spanSteps = isClosed ? smoothW * 2 : Math.max(1, iNext - iPrev);
    const trueSpan = Math.max(stepLength, spanSteps * stepLength || dsSpan);

    _tanDiff.subVectors(samples[iNext].tangent, samples[iPrev].tangent);
    const kLat = _tanDiff.dot(frame.right) / trueSpan;
    curvature[i] = kLat;

    const limits = route.getRailLimits(frame.s);
    let safeLeft = limits.left + railMargin;
    let safeRight = limits.right - railMargin;

    // On main route past open entry gap without entering shortcut, bias inside safe main right edge
    if (route.routeId === 'main' && branchByRoute.length > 0) {
      for (let b = 0; b < branchByRoute.length; b++) {
        const br = branchByRoute[b];
        if (frame.s >= br.fromS - 4 && frame.s <= br.fromS + br.entryGapLength + 4) {
          const halfMain = frame.width * 0.5;
          safeRight = Math.min(safeRight, halfMain - railMargin);
        }
      }
    }

    if (safeLeft > safeRight) {
      const mid = (safeLeft + safeRight) * 0.5;
      safeLeft = mid;
      safeRight = mid;
    }

    // Pull toward inside of corner proportional to lateral curvature magnitude
    const halfSpan = Math.max(0, (safeRight - safeLeft) * 0.5);
    const curveStrength = THREE.MathUtils.clamp(Math.abs(kLat) * 45, 0, 1);
    const rawApex = -Math.sign(kLat) * halfSpan * apexPull * curveStrength;
    targetLateral[i] = THREE.MathUtils.clamp(rawApex, safeLeft, safeRight);

    // Effective lateral grip combines tire lateral accel limit + track banking component
    const effLatAccel = baseLatAccel + gravity * Math.abs(Math.sin(frame.bank)) * 0.9;
    const absK = Math.abs(kLat);
    let cornerSpeed = maxAllowedSpeed;
    if (absK > 1e-4) {
      cornerSpeed = Math.sqrt(effLatAccel / absK);
    }
    maxSpeed[i] = Math.min(maxAllowedSpeed, Math.max(16, cornerSpeed));
  }

  // Enforce safe minimum speed through loops and pre-gap launch windows
  const segments = route.getSegmentList();
  for (let sIdx = 0; sIdx < segments.length; sIdx++) {
    const seg = segments[sIdx];
    if (seg.config.type === 'loop') {
      const radius = Math.max(8, seg.config.radius ?? CONFIG.loopRules.minRadius);
      const safeLoopSpeed = Math.min(
        topPhysicsSpeed,
        Math.sqrt(5 * gravity * radius) * CONFIG.ai.racingLine.loopSafeSpeedMargin,
      );
      const startI = Math.max(0, Math.floor((seg.startS - 28) / stepLength));
      const endI = Math.min(sampleCount - 1, Math.ceil((seg.endS + 6) / stepLength));
      for (let i = startI; i <= endI; i++) {
        if (safeLoopSpeed > minSafeSpeed[i]) {
          minSafeSpeed[i] = safeLoopSpeed;
        }
        // Do not let corner-curvature estimate brake inside vertical loop entry
        if (maxSpeed[i] < safeLoopSpeed) {
          maxSpeed[i] = Math.min(maxAllowedSpeed, safeLoopSpeed * 1.12);
        }
      }
    } else if (seg.config.type === 'gap') {
      const gapLen = Math.max(4, seg.config.length);
      const longJumpFloor = gapLen >= 25 ? 37.5 : 26;
      const jumpMin = Math.max(longJumpFloor, Math.sqrt(gapLen * gravity * 0.65));
      const safeJumpSpeed = Math.min(
        topPhysicsSpeed,
        jumpMin * CONFIG.ai.racingLine.jumpSafeSpeedMargin,
      );
      const startI = Math.max(0, Math.floor((seg.startS - (gapLen >= 25 ? 70 : 55)) / stepLength));
      const endI = Math.min(sampleCount - 1, Math.ceil((seg.endS + 8) / stepLength));
      for (let i = startI; i <= endI; i++) {
        if (safeJumpSpeed > minSafeSpeed[i]) {
          minSafeSpeed[i] = safeJumpSpeed;
        }
        if (maxSpeed[i] < safeJumpSpeed) {
          maxSpeed[i] = Math.min(maxAllowedSpeed, safeJumpSpeed * 1.15);
        }
      }
    }
  }

  // Fallback check from explicit GapRange table in case a route has non-segment gap ranges
  const gapRanges = route.getGapRanges();
  for (let g = 0; g < gapRanges.length; g++) {
    const gap = gapRanges[g];
    const gapDist = Math.max(4, gap.endS - gap.startS);
    const ballisticFloor = Math.sqrt(Math.max(1, gapDist * gravity * 0.65)) * 1.12;
    const safeGapFloor = Math.min(topPhysicsSpeed, Math.max(gapDist >= 25 ? 37.5 : 28, ballisticFloor));
    const startI = Math.max(0, Math.floor((gap.startS - (gapDist >= 25 ? 65 : 45)) / stepLength));
    const endI = Math.min(sampleCount - 1, Math.ceil((gap.endS + 5) / stepLength));
    for (let i = startI; i <= endI; i++) {
      if (safeGapFloor > minSafeSpeed[i]) {
        minSafeSpeed[i] = safeGapFloor;
      }
      if (maxSpeed[i] < safeGapFloor) {
        maxSpeed[i] = Math.min(maxAllowedSpeed, safeGapFloor * 1.12);
      }
    }
  }

  // Multi-pass forward acceleration & backward braking envelope propagation
  const twoBrakeDs = 2 * CONFIG.ai.brakeDecel * stepLength;
  const twoAccelDs = 2 * CONFIG.ai.accelLimit * stepLength;
  const passes = isClosed ? 2 : 1;

  for (let pass = 0; pass < passes; pass++) {
    for (let i = sampleCount - 1; i >= 0; i--) {
      if (!isClosed && i === sampleCount - 1) continue;
      const iNext = i + 1 < sampleCount ? i + 1 : 0;
      const vNext = maxSpeed[iNext];
      const vReachable = Math.sqrt(vNext * vNext + twoBrakeDs);
      if (vReachable < maxSpeed[i]) {
        maxSpeed[i] = Math.max(minSafeSpeed[i], vReachable);
      }
    }
    for (let i = 0; i < sampleCount; i++) {
      if (!isClosed && i === 0) continue;
      const iPrev = i - 1 >= 0 ? i - 1 : sampleCount - 1;
      const vPrev = maxSpeed[iPrev];
      const vReachable = Math.sqrt(vPrev * vPrev + twoAccelDs);
      if (vReachable < maxSpeed[i]) {
        maxSpeed[i] = Math.max(minSafeSpeed[i], vReachable);
      }
    }
  }

  // Smooth lateral transitions cleanly so steering doesn't oscillate across adjacent samples
  const smoothedLat = new Float32Array(sampleCount);
  const latRadius = 4;
  for (let i = 0; i < sampleCount; i++) {
    let sum = 0;
    let count = 0;
    for (let k = -latRadius; k <= latRadius; k++) {
      const idx = wrapIndex(i + k, sampleCount, isClosed);
      sum += targetLateral[idx];
      count++;
    }
    smoothedLat[i] = sum / Math.max(1, count);
  }

  return {
    routeId: route.routeId,
    isClosed,
    length,
    stepLength,
    sampleCount,
    targetLateral: smoothedLat,
    maxSpeed,
    minSafeSpeed,
    curvature,
    boostPads: route.getBoostPads(),
  };
}

export function getCourseAiProfile(course: Course): CourseAiProfile {
  const existing = profileCache.get(course);
  if (existing) {
    return existing;
  }

  const routeProfiles = new Map<string, RouteProfile>();
  const allRoutes = course.getAllRoutes();
  for (let i = 0; i < allRoutes.length; i++) {
    const route = allRoutes[i];
    routeProfiles.set(route.routeId, buildRouteProfile(route, course));
  }

  const mainProfile = routeProfiles.get('main') ?? buildRouteProfile(course.getRoute('main'), course);

  const getRouteProfile = (routeId: string): RouteProfile =>
    routeProfiles.get(routeId) ?? mainProfile;

  const sampleAt = (routeId: string, s: number, out: SampledLinePoint): SampledLinePoint => {
    const prof = getRouteProfile(routeId);
    let wrappedS = s;
    if (prof.isClosed) {
      wrappedS = ((s % prof.length) + prof.length) % prof.length;
    } else {
      wrappedS = Math.max(0, Math.min(prof.length, s));
    }
    const fIdx = wrappedS / prof.stepLength;
    const i0 = Math.max(0, Math.min(prof.sampleCount - 1, Math.floor(fIdx)));
    const i1 = prof.isClosed
      ? (i0 + 1) % prof.sampleCount
      : Math.min(prof.sampleCount - 1, i0 + 1);
    const alpha = Math.max(0, Math.min(1, fIdx - Math.floor(fIdx)));

    out.targetLateral =
      prof.targetLateral[i0] + (prof.targetLateral[i1] - prof.targetLateral[i0]) * alpha;
    out.maxSpeed = prof.maxSpeed[i0] + (prof.maxSpeed[i1] - prof.maxSpeed[i0]) * alpha;
    out.minSafeSpeed =
      prof.minSafeSpeed[i0] + (prof.minSafeSpeed[i1] - prof.minSafeSpeed[i0]) * alpha;
    out.curvature = prof.curvature[i0] + (prof.curvature[i1] - prof.curvature[i0]) * alpha;
    return out;
  };

  const findBestBoostPad = (
    routeId: string,
    s: number,
    lookaheadMeters: number,
    currentLateral: number,
  ): BoostPadData | null => {
    const prof = getRouteProfile(routeId);
    const pads = prof.boostPads;
    if (pads.length === 0 || lookaheadMeters <= 0) {
      return null;
    }
    const curS = prof.isClosed
      ? ((s % prof.length) + prof.length) % prof.length
      : Math.max(0, Math.min(prof.length, s));
    let bestPad: BoostPadData | null = null;
    let bestScore = Infinity;

    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      let ds = pad.s - curS;
      if (prof.isClosed && ds < -1) {
        ds += prof.length;
      }
      if (ds < -0.5 || ds > lookaheadMeters) {
        continue;
      }
      const latDist = Math.abs(pad.lateral - currentLateral);
      const score = ds + latDist * 2.2;
      if (score < bestScore) {
        bestScore = score;
        bestPad = pad;
      }
    }

    return bestPad;
  };

  const profile: CourseAiProfile = {
    courseId: course.getId(),
    getRouteProfile,
    sampleAt,
    findBestBoostPad,
  };
  profileCache.set(course, profile);
  return profile;
}

// Keep TrackFrame import cleanly typed when tree-shaken by strict TS
export type { TrackFrame };
