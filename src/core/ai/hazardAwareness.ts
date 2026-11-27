// src/core/ai/hazardAwareness.ts

import * as THREE from 'three';
import { CONFIG, type AiRivalConfig } from '../../config';
import type { AttractionSystem } from '../attractions';
import { triangleWave01 } from '../attractions';
import type { CarState } from '../physics';

export interface HazardAvoidanceResult {
  overrideLateral: number | null;
  speedMultiplier: number;
  windCompensationAccel: number;
}

function forwardDistanceS(fromS: number, targetS: number, routeLen: number, closed: boolean): number {
  let ds = targetS - fromS;
  if (closed && ds < 0) {
    ds += routeLen;
  }
  return ds;
}

export function computeAiRingGuidance(
  car: CarState,
  routeId: string,
  routeLength: number,
  closed: boolean,
  trackWidth: number,
  currentDesiredLateral: number,
  attractions: AttractionSystem | null | undefined,
  difficultyMultiplier: number,
  rival: AiRivalConfig,
): number {
  if (!attractions || !attractions.plan.enabledForCourse) {
    return currentDesiredLateral;
  }

  const activeS = car.mode === 'grounded' ? car.s : car.sApprox;
  const steerMargin = CONFIG.physics.railInnerOffset + CONFIG.car.carHalfWidth + 0.65;
  const halfSafe = Math.max(1, trackWidth * 0.5 - steerMargin);

  const ringLookahead = 44;
  let bestRingDist = Infinity;
  let bestRingLat: number | null = null;
  const rings = attractions.getBoostRings();
  for (let i = 0; i < rings.length; i++) {
    const ring = rings[i];
    if (ring.routeId !== routeId) continue;
    const ds = forwardDistanceS(activeS, ring.s, routeLength, closed);
    if (ds > 4 && ds <= ringLookahead && ds < bestRingDist) {
      bestRingDist = ds;
      bestRingLat = ring.lateral;
    }
  }
  if (bestRingLat === null) {
    return currentDesiredLateral;
  }

  const ringTargetLat = bestRingLat + rival.preferredOffset * 0.35;
  const pull = THREE.MathUtils.clamp(
    rival.boostUsage * (0.22 + 0.28 * difficultyMultiplier),
    0.15,
    0.52,
  );
  return THREE.MathUtils.clamp(
    THREE.MathUtils.lerp(currentDesiredLateral, ringTargetLat, pull),
    -halfSafe,
    halfSafe,
  );
}

export function computeAiHazardGuidance(
  car: CarState,
  routeId: string,
  routeLength: number,
  closed: boolean,
  trackWidth: number,
  currentDesiredLateral: number,
  attractions: AttractionSystem | null | undefined,
  raceTimeSec: number,
  _difficultyMultiplier: number,
  _rival: AiRivalConfig,
  out: HazardAvoidanceResult,
): HazardAvoidanceResult {
  out.overrideLateral = null;
  out.speedMultiplier = 1;
  out.windCompensationAccel = 0;

  if (!attractions || !attractions.plan.enabledForCourse || !attractions.isActive() || routeId !== 'main') {
    return out;
  }

  const activeS = car.mode === 'grounded' ? car.s : car.sApprox;
  const speed = Math.max(14, Math.abs(car.vForward));
  const steerMargin = CONFIG.physics.railInnerOffset + CONFIG.car.carHalfWidth + 0.65;
  const halfSafe = Math.max(1, trackWidth * 0.5 - steerMargin);

  const diffKey = attractions.getDifficulty();
  const diffScale = CONFIG.attractions.difficultyScale[diffKey] ?? CONFIG.attractions.difficultyScale.sedang;
  const warnSec = CONFIG.attractions.warningSeconds;
  // Reaction sharpness: easy AI dodges late/softly, hard AI dodges cleanly into safe lane
  const dodgeWeight =
    diffKey === 'sulit' ? 1.0 : diffKey === 'sedang' ? 0.85 : 0.55;

  const lookahead = Math.min(82, Math.max(36, speed * 1.45));
  let targetLat = out.overrideLateral ?? currentDesiredLateral;
  let closestHazardDist = Infinity;
  let overridden = false;

  // 1. Candy Pendulums prediction at arrival time
  const pCfg = CONFIG.attractions.pendulum;
  const periodP = pCfg.periodSec * diffScale.periodScale;
  const omegaP = (Math.PI * 2) / Math.max(0.5, periodP);
  const pendulums = attractions.getPendulums();

  for (let i = 0; i < pendulums.length; i++) {
    const p = pendulums[i];
    const ds = forwardDistanceS(activeS, p.spec.s, routeLength, closed);
    if (ds <= 1 || ds > lookahead) continue;

    const arrivalT = raceTimeSec + ds / speed;
    if (arrivalT < warnSec) continue;

    const futureAngle = pCfg.maxAngleRad * Math.sin(omegaP * (arrivalT - warnSec) + p.spec.phaseRad);
    const predBobLat = Math.sin(futureAngle) * pCfg.armLength;
    const minClear = pCfg.bobRadius + CONFIG.car.carHalfWidth + 1.5;

    if (ds < closestHazardDist && Math.abs(targetLat - predBobLat) < minClear) {
      closestHazardDist = ds;
      // Pick the wider continuous safe side cleanly inside track rails
      const safeRight = THREE.MathUtils.clamp(predBobLat + minClear + 0.6, -halfSafe, halfSafe);
      const safeLeft = THREE.MathUtils.clamp(predBobLat - minClear - 0.6, -halfSafe, halfSafe);
      const chooseRight = Math.abs(safeRight - predBobLat) >= Math.abs(safeLeft - predBobLat)
        ? safeRight
        : safeLeft;
      targetLat = THREE.MathUtils.lerp(targetLat, chooseRight, dodgeWeight);
      overridden = true;
    }
  }

  // 2. Rolling Balls prediction at arrival time
  const bCfg = CONFIG.attractions.balls;
  const periodB = bCfg.periodSec * diffScale.periodScale;
  const ballGroups = attractions.getBallGroups();

  for (let g = 0; g < ballGroups.length; g++) {
    const grp = ballGroups[g];
    const dsCenter = forwardDistanceS(activeS, grp.spec.centerS, routeLength, closed);
    if (dsCenter <= 1 || dsCenter > lookahead + 8) continue;

    for (let b = 0; b < grp.balls.length; b++) {
      const ball = grp.balls[b];
      const spec = grp.spec.balls[b];
      const ds = forwardDistanceS(activeS, ball.s, routeLength, closed);
      if (ds <= 1 || ds > lookahead) continue;

      const arrivalT = raceTimeSec + ds / speed;
      if (arrivalT < warnSec) continue;

      const phase01 = (arrivalT - warnSec) / Math.max(0.5, periodB) + spec.phaseOffset01;
      const predLat = triangleWave01(phase01) * grp.spec.amplitude;
      const minClear = bCfg.ballRadius + CONFIG.car.carHalfWidth + 1.5;

      if (ds < closestHazardDist && Math.abs(targetLat - predLat) < minClear) {
        closestHazardDist = ds;
        const safeRight = THREE.MathUtils.clamp(predLat + minClear + 0.6, -halfSafe, halfSafe);
        const safeLeft = THREE.MathUtils.clamp(predLat - minClear - 0.6, -halfSafe, halfSafe);
        const pick = Math.abs(safeRight - predLat) >= Math.abs(safeLeft - predLat)
          ? safeRight
          : safeLeft;
        targetLat = THREE.MathUtils.lerp(targetLat, pick, dodgeWeight);
        overridden = true;
      }
    }
  }

  // 3. Jelly Puddle avoidance into dry lane
  const jellies = attractions.getJellyPuddles();
  for (let j = 0; j < jellies.length; j++) {
    const jp = jellies[j];
    const dsStart = forwardDistanceS(activeS, jp.spec.sStart, routeLength, closed);
    const inside = activeS >= jp.spec.sStart && activeS <= jp.spec.sEnd;
    if (!inside && (dsStart <= 0 || dsStart > lookahead)) continue;

    const ds = inside ? 5 : dsStart;
    const minClear = jp.spec.halfWidth + CONFIG.car.carHalfWidth + 0.9;
    if (ds < closestHazardDist && Math.abs(targetLat - jp.spec.lateralCenter) < minClear) {
      closestHazardDist = ds;
      const drySideTarget =
        jp.spec.lateralCenter < 0
          ? THREE.MathUtils.clamp(jp.spec.lateralCenter + jp.spec.halfWidth + 2.2, -halfSafe, halfSafe)
          : THREE.MathUtils.clamp(jp.spec.lateralCenter - jp.spec.halfWidth - 2.2, -halfSafe, halfSafe);
      targetLat = THREE.MathUtils.lerp(targetLat, drySideTarget, dodgeWeight);
      overridden = true;
    }
  }

  // 4. Wind Fan crosswind anticipation (offset gently upwind inside zone)
  const windAccel = attractions.getWindAccelAt(routeId, activeS + 10);
  if (Math.abs(windAccel) > 0.5) {
    out.windCompensationAccel = windAccel;
    const counterLat = THREE.MathUtils.clamp(
      targetLat - Math.sign(windAccel) * 2.1 * dodgeWeight,
      -halfSafe,
      halfSafe,
    );
    targetLat = counterLat;
    overridden = true;
  }

  if (overridden) {
    out.overrideLateral = THREE.MathUtils.clamp(targetLat, -halfSafe, halfSafe);
  }
  return out;
}
