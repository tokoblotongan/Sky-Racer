// src/core/ai/avoidance.ts

import * as THREE from 'three';
import { CONFIG, type AiRivalConfig } from '../../config';
import type { Course } from '../course';
import type { CarState } from '../physics';
import type { Route, TrackFrame } from '../routes';

export interface AvoidanceAdjustment {
  lateralOffset: number;
  speedMultiplier: number;
  draftBonus: number;
}

const _selfFrame: TrackFrame = {
  s: 0,
  position: new THREE.Vector3(),
  tangent: new THREE.Vector3(),
  up: new THREE.Vector3(),
  right: new THREE.Vector3(),
  width: CONFIG.course.trackWidth,
  bank: 0,
};

const _otherFrame: TrackFrame = {
  s: 0,
  position: new THREE.Vector3(),
  tangent: new THREE.Vector3(),
  up: new THREE.Vector3(),
  right: new THREE.Vector3(),
  width: CONFIG.course.trackWidth,
  bank: 0,
};

export function computeAvoidance(
  carIndex: number,
  cars: readonly CarState[],
  course: Course,
  route: Route,
  rival: AiRivalConfig,
  out: AvoidanceAdjustment,
): AvoidanceAdjustment {
  out.lateralOffset = 0;
  out.speedMultiplier = 1;
  out.draftBonus = 0;

  const self = cars[carIndex];
  if (!self || cars.length <= 1) {
    return out;
  }

  const cfg = CONFIG.ai.avoidance;
  const draftCfg = CONFIG.ai.draft;
  const isClosed = route.isClosed();
  const routeLen = Math.max(1, route.getLength());
  const selfS = self.mode === 'grounded' ? self.s : self.sApprox;
  const selfSWrapped = isClosed ? route.wrapDistance(selfS) : selfS;
  const selfY =
    self.mode === 'grounded'
      ? route.getFrameAt(selfSWrapped, _selfFrame).position.y
      : self.worldPos.y;

  const styleGapFactor =
    rival.style === 'cautious' ? 1.35 : rival.style === 'aggressive' ? 0.78 : 1.0;
  const styleSteerFactor =
    rival.style === 'cautious' ? 1.2 : rival.style === 'aggressive' ? 0.85 : 1.0;

  const limits = route.getRailLimits(selfSWrapped);
  const safeMinLat = limits.left + cfg.sideClearance;
  const safeMaxLat = limits.right - cfg.sideClearance;

  let nearestAheadDs = Infinity;
  let nearestAheadLateral = 0;
  let nearestAheadSpeed = Infinity;
  let immediateSidePush = 0;

  for (let j = 0; j < cars.length; j++) {
    if (j === carIndex) continue;
    const other = cars[j];
    if (other.mode === 'falling') continue;
    if (other.routeId !== self.routeId) continue;

    const otherS = other.mode === 'grounded' ? other.s : other.sApprox;
    const otherSWrapped = isClosed ? route.wrapDistance(otherS) : otherS;
    const otherY =
      other.mode === 'grounded'
        ? route.getFrameAt(otherSWrapped, _otherFrame).position.y
        : other.worldPos.y;

    // Crucial vertical check: prevent stacked loops / overpasses from triggering false avoidance!
    if (Math.abs(otherY - selfY) > 2.5) {
      continue;
    }

    let ds = otherSWrapped - selfSWrapped;
    if (isClosed) {
      if (ds > routeLen * 0.5) ds -= routeLen;
      if (ds < -routeLen * 0.5) ds += routeLen;
    }

    const dLat = other.lateral - self.lateral;
    const absDLat = Math.abs(dLat);

    // Immediate side-by-side clearance (within car length overlaps)
    if (Math.abs(ds) <= 4.2 && absDLat < cfg.sideClearance * 1.45) {
      const pushDir = dLat >= 0 ? -1 : 1;
      const urgency = 1 - Math.abs(ds) / 4.2;
      immediateSidePush += pushDir * urgency * cfg.lateralGain * styleSteerFactor;
    }

    // Ahead lookahead for passing & slipstream
    if (ds > 0.4 && ds <= cfg.lookAheadMeters) {
      // Slipstream detection when trailing cleanly in lane ahead
      if (
        draftCfg.enabled &&
        ds >= 2.0 &&
        ds <= draftCfg.rangeMeters &&
        absDLat <= draftCfg.lateralThreshold &&
        other.vForward > 14
      ) {
        if (draftCfg.bonus > out.draftBonus) {
          out.draftBonus = draftCfg.bonus;
        }
      }

      if (absDLat < cfg.sideClearance * 1.35 && ds < nearestAheadDs) {
        nearestAheadDs = ds;
        nearestAheadLateral = other.lateral;
        nearestAheadSpeed = other.vForward;
      }
    }
  }

  let desiredOffset = immediateSidePush;

  if (Number.isFinite(nearestAheadDs)) {
    const passDirLeft = nearestAheadLateral - cfg.sideClearance >= safeMinLat;
    const passDirRight = nearestAheadLateral + cfg.sideClearance <= safeMaxLat;
    let passSide = 0;

    if (passDirLeft && passDirRight) {
      // Pick side closer to self or with more room
      const roomLeft = nearestAheadLateral - safeMinLat;
      const roomRight = safeMaxLat - nearestAheadLateral;
      passSide = self.lateral <= nearestAheadLateral ? (roomLeft >= 1.2 ? -1 : 1) : (roomRight >= 1.2 ? 1 : -1);
    } else if (passDirRight) {
      passSide = 1;
    } else if (passDirLeft) {
      passSide = -1;
    }

    const proximity = THREE.MathUtils.clamp(1 - nearestAheadDs / cfg.lookAheadMeters, 0, 1);
    if (passSide !== 0) {
      desiredOffset += passSide * cfg.sideClearance * (0.45 + 0.75 * proximity) * styleSteerFactor;
    }

    // If very close directly behind a slower car and cannot clear cleanly yet, ease pace smoothly
    const gapLimit = cfg.minGap * styleGapFactor;
    if (nearestAheadDs < gapLimit) {
      const speedMatch = THREE.MathUtils.clamp(
        (nearestAheadSpeed + 2.5) / Math.max(12, self.vForward),
        0.55,
        1.0,
      );
      const t = THREE.MathUtils.clamp(1 - nearestAheadDs / gapLimit, 0, 1);
      out.speedMultiplier = THREE.MathUtils.lerp(1.0, speedMatch, t * 0.85);
    }
  }

  // Clamp total offset so car stays safely within track width bounds relative to center
  const targetLat = THREE.MathUtils.clamp(
    self.lateral + desiredOffset,
    safeMinLat,
    safeMaxLat,
  );
  const clampedDelta = THREE.MathUtils.clamp(
    targetLat - self.lateral,
    -cfg.laneOffsetClamp,
    cfg.laneOffsetClamp,
  );
  out.lateralOffset = clampedDelta;

  // Unused parameter guard
  void course;
  return out;
}
