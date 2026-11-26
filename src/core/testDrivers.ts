// src/core/testDrivers.ts

import * as THREE from 'three';
import { CONFIG } from '../config';
import type { CarInput } from '../input/controls';
import { autopilotInput } from './autopilot';
import type { Course } from './course';
import type { CarState } from './physics';
import type { Route, TrackFrame } from './routes';
import type { RacePhase } from './state';

const PARKED_INPUT: CarInput = {
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: true,
  resetPressed: false,
  confirmPressed: false,
  mutePressed: false,
};

const CRASHED_INPUT: CarInput = {
  throttle: 0,
  brake: 0.35,
  steer: 0,
  handbrake: false,
  resetPressed: false,
  confirmPressed: false,
  mutePressed: false,
};

const _frame: TrackFrame = {
  s: 0,
  position: new THREE.Vector3(),
  tangent: new THREE.Vector3(),
  up: new THREE.Vector3(),
  right: new THREE.Vector3(),
  width: CONFIG.course.trackWidth,
  bank: 0,
};

export interface TestDriversController {
  reset: (racers?: number) => void;
  sampleInput: (
    carIndex: number,
    cars: readonly CarState[],
    course: Course,
    phase: RacePhase,
  ) => CarInput;
}

function hashChoice(carIndex: number, lap: number): number {
  const n = ((carIndex * 73856093) ^ ((lap + 1) * 19349663)) >>> 0;
  return (n % 1000) / 1000;
}

function needsFullSpeedForSegment(route: Route, s: number): boolean {
  const seg = route.getSegmentAt(s);
  if (seg.type === 'loop' || seg.type === 'gap') {
    return true;
  }
  const segList = route.getSegmentList();
  const nextMeta = segList[seg.index + 1];
  if (nextMeta && (nextMeta.type === 'loop' || nextMeta.type === 'gap')) {
    return true;
  }
  const lookAheadS = route.isClosed() ? route.wrapDistance(s + 55) : route.clampDistance(s + 55);
  const aheadSeg = route.getSegmentAt(lookAheadS);
  return aheadSeg.type === 'loop' || aheadSeg.type === 'gap';
}

export function createTestDrivers(): TestDriversController {
  const lapChoices = new Map<string, 'main' | 'shortcut'>();

  function getPreferRoute(carIndex: number, lap: number): 'main' | 'shortcut' {
    const key = `${carIndex}:${lap}`;
    const existing = lapChoices.get(key);
    if (existing) {
      return existing;
    }
    const probs = CONFIG.ai.shortcutProbs;
    const prob = probs[carIndex % probs.length] ?? 0.3;
    const choice: 'main' | 'shortcut' = hashChoice(carIndex, lap) < prob ? 'shortcut' : 'main';
    lapChoices.set(key, choice);
    return choice;
  }

  function reset(): void {
    lapChoices.clear();
  }

  function sampleInput(
    carIndex: number,
    cars: readonly CarState[],
    course: Course,
    phase: RacePhase,
  ): CarInput {
    if (phase !== 'RACING') {
      return PARKED_INPUT;
    }
    const car = cars[carIndex];
    if (!car) {
      return PARKED_INPUT;
    }
    if (car.crashed) {
      return CRASHED_INPUT;
    }

    const route = course.getRoute(car.routeId);
    const activeS = car.mode === 'grounded' ? car.s : car.sApprox;
    const lapLen = Math.max(1, course.getLength());
    const approxLap = course.isClosed() ? Math.max(1, Math.floor(Math.max(0, activeS) / lapLen) + 1) : 1;
    const preferRoute = getPreferRoute(carIndex, approxLap);

    const base = autopilotInput(car, route, { course, preferRoute });
    if (car.mode !== 'grounded') {
      return base;
    }

    const aiCfg = CONFIG.ai;
    const laneOffsets = aiCfg.laneOffsets;
    let laneTarget = laneOffsets[carIndex % laneOffsets.length] ?? 0;

    // Respect shortcut entry/merge zones without pulling away from autopilot target
    const inShortcutOrEntry =
      car.routeId !== 'main' ||
      (preferRoute === 'shortcut' &&
        course.getBranchRoutes().some((b) => {
          const curS = course.isClosed() ? course.wrapDistance(activeS) : activeS;
          return curS >= b.fromS - 45 && curS <= b.fromS + b.entryGapLength + 4;
        }));

    if (inShortcutOrEntry) {
      laneTarget = 0;
    }

    // Gentle forward car avoidance so bots overtake instead of tailgating linearly
    const totalLen = route.getLength();
    const isClosed = route.isClosed();
    let avoidOffset = 0;
    for (let j = 0; j < cars.length; j++) {
      if (j === carIndex) continue;
      const other = cars[j];
      if (other.routeId !== car.routeId || other.mode === 'falling') continue;
      if (Math.abs(other.worldPos.y - car.worldPos.y) > CONFIG.multiCar.verticalOverlapLimit) {
        continue;
      }
      const otherS = other.mode === 'grounded' ? other.s : other.sApprox;
      let ds = otherS - activeS;
      if (isClosed) {
        if (ds < -totalLen * 0.5) ds += totalLen;
        if (ds > totalLen * 0.5) ds -= totalLen;
      }
      if (ds > 0.5 && ds < aiCfg.avoidanceLookahead) {
        const dLat = other.lateral - car.lateral;
        if (Math.abs(dLat) < aiCfg.avoidanceSideBuffer) {
          const dir = dLat >= 0 ? -1 : 1;
          const weight = 1 - ds / aiCfg.avoidanceLookahead;
          avoidOffset += dir * aiCfg.avoidanceGain * weight;
        }
      }
    }

    const limits = route.getRailLimits(activeS);
    route.getFrameAt(activeS, _frame);
    const minLat = limits.left + aiCfg.minSafeRailMargin;
    const maxLat = limits.right - aiCfg.minSafeRailMargin;
    const combinedOffset = THREE.MathUtils.clamp(laneTarget + avoidOffset, -6, 6);
    let steer = base.steer;
    if (!inShortcutOrEntry && minLat <= maxLat) {
      const clampedLat = THREE.MathUtils.clamp(combinedOffset, minLat, maxLat);
      steer = THREE.MathUtils.clamp(
        base.steer + CONFIG.autopilot.kLateral * (clampedLat - car.lateral) * 0.55,
        -1,
        1,
      );
    }

    const paceFactors = aiCfg.paceFactors;
    const pace = paceFactors[carIndex % paceFactors.length] ?? 0.92;
    const needFullSpeed =
      needsFullSpeedForSegment(route, activeS) || car.vForward < aiCfg.boostThrottleMinSpeed;
    const throttle = needFullSpeed ? 1 : pace;

    return {
      throttle,
      brake: 0,
      steer,
      handbrake: false,
      resetPressed: false,
      confirmPressed: false,
      mutePressed: false,
    };
  }

  return {
    reset,
    sampleInput,
  };
}
