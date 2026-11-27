// src/core/hazardEffects.ts

import * as THREE from 'three';
import { CONFIG } from '../config';
import type { AttractionSystem } from './attractions';
import type { Course } from './course';
import {
  triggerBoost,
  type CarState,
  type StepCarEnvModifiers,
} from './physics';
import type { TrackFrame } from './routes';

export type AttractionEvent =
  | {
      type: 'hazardHit';
      carIndex: number;
      hazardId: string;
      hazardKind: 'pendulum' | 'balls';
      worldPos: THREE.Vector3;
    }
  | {
      type: 'ringPass';
      carIndex: number;
      ringId: string;
      worldPos: THREE.Vector3;
      forward: THREE.Vector3;
      right: THREE.Vector3;
      up: THREE.Vector3;
    };

export interface HazardEffectsStats {
  totalHazardHitsByCar: readonly number[];
  totalRingPassesByCar: readonly number[];
}

export interface HazardEffectsTracker {
  reset: (carCount?: number) => void;
  stepPrePhysics: (
    cars: readonly CarState[],
    attractions: AttractionSystem,
    dt: number,
  ) => void;
  getEnvModifiers: (carIndex: number, out: { gripMultiplier: number; lateralAccel: number }) => StepCarEnvModifiers;
  stepPostPhysics: (
    cars: readonly CarState[],
    course: Course,
    attractions: AttractionSystem,
    dt: number,
    outEvents: AttractionEvent[],
  ) => void;
  getStats: () => HazardEffectsStats;
}

interface CarHazardState {
  immunity: Map<string, number>;
  ringCooldowns: Map<string, number>;
  spinOutTimer: number;
  spinGripMult: number;
  jellyTailTimer: number;
  onJellyNow: boolean;
  windAccel: number;
  hazardHits: number;
  ringPasses: number;
}

const _frame: TrackFrame = {
  s: 0,
  position: new THREE.Vector3(),
  tangent: new THREE.Vector3(),
  up: new THREE.Vector3(),
  right: new THREE.Vector3(),
  width: CONFIG.course.trackWidth,
  bank: 0,
};
const _tmpWorld = new THREE.Vector3();

function createCarHazardState(): CarHazardState {
  return {
    immunity: new Map(),
    ringCooldowns: new Map(),
    spinOutTimer: 0,
    spinGripMult: CONFIG.attractions.difficultyScale[CONFIG.ai.defaultDifficulty].spinGripMult,
    jellyTailTimer: 0,
    onJellyNow: false,
    windAccel: 0,
    hazardHits: 0,
    ringPasses: 0,
  };
}

function decayMapTimers(map: Map<string, number>, dt: number): void {
  if (map.size === 0) return;
  for (const [key, remaining] of map.entries()) {
    const next = remaining - dt;
    if (next <= 0) {
      map.delete(key);
    } else {
      map.set(key, next);
    }
  }
}

export function createHazardEffectsTracker(initialCarCount = 4): HazardEffectsTracker {
  const states: CarHazardState[] = [];
  for (let i = 0; i < Math.max(1, initialCarCount); i++) {
    states.push(createCarHazardState());
  }

  const ensureCarState = (carIndex: number): CarHazardState => {
    while (states.length <= carIndex) {
      states.push(createCarHazardState());
    }
    return states[carIndex];
  };

  const reset = (carCount?: number): void => {
    const count = Math.max(1, carCount ?? states.length);
    states.length = 0;
    for (let i = 0; i < count; i++) {
      states.push(createCarHazardState());
    }
  };

  const stepPrePhysics = (
    cars: readonly CarState[],
    attractions: AttractionSystem,
    dt: number,
  ): void => {
    const active = attractions.isActive();
    const diffScale =
      CONFIG.attractions.difficultyScale[attractions.getDifficulty()] ??
      CONFIG.attractions.difficultyScale.sedang;
    for (let i = 0; i < cars.length; i++) {
      const st = ensureCarState(i);
      const car = cars[i];
      decayMapTimers(st.immunity, dt);
      decayMapTimers(st.ringCooldowns, dt);
      st.spinGripMult = diffScale.spinGripMult;
      if (st.spinOutTimer > 0) {
        st.spinOutTimer = Math.max(0, st.spinOutTimer - dt);
      }
      if (st.jellyTailTimer > 0) {
        st.jellyTailTimer = Math.max(0, st.jellyTailTimer - dt);
      }

      if (!active || !car || car.mode !== 'grounded') {
        st.onJellyNow = false;
        st.windAccel = 0;
        continue;
      }

      // Check jelly puddle footprint & refresh 0.4s tail timer
      let touchingJelly = false;
      if (car.routeId === 'main') {
        const jellies = attractions.getJellyPuddles();
        for (let j = 0; j < jellies.length; j++) {
          const jp = jellies[j];
          if (!jp.active) continue;
          if (car.s >= jp.spec.sStart && car.s <= jp.spec.sEnd) {
            const halfReach = jp.spec.halfWidth + CONFIG.car.carHalfWidth * 0.72;
            if (Math.abs(car.lateral - jp.spec.lateralCenter) <= halfReach) {
              touchingJelly = true;
              break;
            }
          }
        }
      }
      st.onJellyNow = touchingJelly;
      if (touchingJelly) {
        st.jellyTailTimer = CONFIG.attractions.jelly.tailSeconds;
      }

      // Compute smooth lateral wind acceleration inside wind fan zone
      st.windAccel = attractions.getWindAccelAt(car.routeId, car.s);
    }
  };

  const getEnvModifiers = (
    carIndex: number,
    out: { gripMultiplier: number; lateralAccel: number },
  ): StepCarEnvModifiers => {
    const st = states[carIndex];
    if (!st) {
      out.gripMultiplier = 1;
      out.lateralAccel = 0;
      return out;
    }
    let gripMult = 1;
    if (st.onJellyNow || st.jellyTailTimer > 0) {
      gripMult = Math.min(gripMult, CONFIG.attractions.jelly.gripMultiplier);
    }
    if (st.spinOutTimer > 0) {
      gripMult = Math.min(gripMult, st.spinGripMult);
    }
    out.gripMultiplier = gripMult;
    out.lateralAccel = st.windAccel;
    return out;
  };

  const stepPostPhysics = (
    cars: readonly CarState[],
    course: Course,
    attractions: AttractionSystem,
    dt: number,
    outEvents: AttractionEvent[],
  ): void => {
    outEvents.length = 0;
    if (!attractions.plan.enabledForCourse || dt <= 0) {
      return;
    }

    const pCfg = CONFIG.attractions.pendulum;
    const bCfg = CONFIG.attractions.balls;
    const rCfg = CONFIG.attractions.ring;
    const immunitySec = CONFIG.attractions.immunitySeconds;

    const pendulums = attractions.getPendulums();
    const ballGroups = attractions.getBallGroups();
    const boostRings = attractions.getBoostRings();
    const active = attractions.isActive();

    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];
      if (!car || car.mode === 'falling') {
        continue;
      }
      const st = ensureCarState(i);
      const carS = car.mode === 'grounded' ? car.s : car.sApprox;

      // Boost rings work even across airborne jumps & tunnel straight
      for (let r = 0; r < boostRings.length; r++) {
        const ring = boostRings[r];
        if (ring.routeId !== car.routeId) continue;
        if (st.ringCooldowns.has(ring.id)) continue;

        const spec = attractions.plan.boostRings[r];
        const dx = car.worldPos.x - spec.worldPos.x;
        const dy = car.worldPos.y - spec.worldPos.y;
        const dz = car.worldPos.z - spec.worldPos.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq <= rCfg.triggerRadius * rCfg.triggerRadius) {
          st.ringCooldowns.set(ring.id, 1.4);
          st.ringPasses++;

          // Trigger boost cleanly via existing boost API
          const prevLeft = car.boostTimeLeft;
          const prevCd = car.boostCooldown;
          car.boostCooldown = 0;
          triggerBoost(car);
          // For ring rewards keep duration >= ring.boostDuration without cutting longer pad boosts
          const minTarget = Math.max(prevLeft, rCfg.boostDuration);
          if (prevLeft > 0) {
            car.boostTimeLeft = Math.max(prevLeft, CONFIG.boost.duration);
          } else {
            car.boostTimeLeft = Math.min(CONFIG.boost.duration, minTarget + 0.3);
          }
          if (prevCd > 0 && prevLeft > 0) {
            car.boostCooldown = Math.min(prevCd, CONFIG.boost.retriggerCooldown);
          }

          const route = course.getRoute(car.routeId);
          route.getFrameAt(carS, _frame);
          outEvents.push({
            type: 'ringPass',
            carIndex: i,
            ringId: ring.id,
            worldPos: car.worldPos.clone(),
            forward: _frame.tangent.clone(),
            right: _frame.right.clone(),
            up: _frame.up.clone(),
          });
        }
      }

      if (!active || car.mode !== 'grounded' || car.routeId !== 'main') {
        continue;
      }

      // 1. Candy Pendulum collision (never triggers rollover / crash)
      for (let p = 0; p < pendulums.length; p++) {
        const pend = pendulums[p];
        if (!pend.active) continue;
        if (st.immunity.has(pend.spec.id)) continue;

        // Check height clearance: only collide if bob is low enough to strike the car
        if (pend.bobHeightAboveDeck - pCfg.bobRadius > 1.75) continue;

        const ds = Math.abs(carS - pend.spec.s);
        const maxLongReach = pCfg.bobRadius + CONFIG.car.carHalfLength * 0.85;
        if (ds > maxLongReach) continue;

        const dLat = car.lateral - pend.bobLateral;
        const maxLatReach = pCfg.bobRadius + CONFIG.car.carHalfWidth * 0.85;
        if (Math.abs(dLat) > maxLatReach) continue;

        // Elliptical contact test in track plane
        const nx = ds / maxLongReach;
        const nz = dLat / maxLatReach;
        if (nx * nx + nz * nz <= 1.05) {
          st.immunity.set(pend.spec.id, immunitySec);
          st.spinOutTimer = pCfg.spinOutSeconds;
          st.hazardHits++;

          car.vForward *= pCfg.speedMultiplier;
          const pushSign = dLat >= 0 ? 1 : -1;
          car.vLateral += pushSign * 5.2;
          car.yaw = THREE.MathUtils.clamp(
            car.yaw + pushSign * pCfg.yawKickRad,
            -CONFIG.physics.maxYaw,
            CONFIG.physics.maxYaw,
          );
          car.currentGrip = Math.min(car.currentGrip, CONFIG.physics.handbrakeGrip);

          _tmpWorld
            .copy(pend.spec.worldPos)
            .addScaledVector(pend.spec.worldRight, pend.bobLateral)
            .addScaledVector(pend.spec.worldUp, 0.7);
          outEvents.push({
            type: 'hazardHit',
            carIndex: i,
            hazardId: pend.spec.id,
            hazardKind: 'pendulum',
            worldPos: _tmpWorld.clone(),
          });
        }
      }

      // 2. Rolling Balls collision (never triggers rollover / crash)
      for (let g = 0; g < ballGroups.length; g++) {
        const grp = ballGroups[g];
        if (!grp.active) continue;
        if (st.immunity.has(grp.spec.id)) continue;

        for (let b = 0; b < grp.balls.length; b++) {
          const ball = grp.balls[b];
          const ds = Math.abs(carS - ball.s);
          const maxLongReach = bCfg.ballRadius + CONFIG.car.carHalfLength * 0.85;
          if (ds > maxLongReach) continue;

          const dLat = car.lateral - ball.lateral;
          const maxLatReach = bCfg.ballRadius + CONFIG.car.carHalfWidth * 0.85;
          if (Math.abs(dLat) > maxLatReach) continue;

          const nx = ds / maxLongReach;
          const nz = dLat / maxLatReach;
          if (nx * nx + nz * nz <= 1.05) {
            st.immunity.set(grp.spec.id, immunitySec);
            st.spinOutTimer = bCfg.spinOutSeconds;
            st.hazardHits++;

            car.vForward *= bCfg.speedMultiplier;
            const pushSign = dLat >= 0 ? 1 : -1;
            car.vLateral += pushSign * 4.6;
            car.yaw = THREE.MathUtils.clamp(
              car.yaw + pushSign * bCfg.yawKickRad,
              -CONFIG.physics.maxYaw,
              CONFIG.physics.maxYaw,
            );
            car.currentGrip = Math.min(car.currentGrip, CONFIG.physics.handbrakeGrip);

            const bSpec = grp.spec.balls[b];
            _tmpWorld
              .copy(bSpec.worldPos)
              .addScaledVector(bSpec.worldRight, ball.lateral)
              .addScaledVector(bSpec.worldUp, bCfg.ballRadius);
            outEvents.push({
              type: 'hazardHit',
              carIndex: i,
              hazardId: grp.spec.id,
              hazardKind: 'balls',
              worldPos: _tmpWorld.clone(),
            });
            break;
          }
        }
      }
    }
  };

  const getStats = (): HazardEffectsStats => ({
    totalHazardHitsByCar: states.map((s) => s.hazardHits),
    totalRingPassesByCar: states.map((s) => s.ringPasses),
  });

  return {
    reset,
    stepPrePhysics,
    getEnvModifiers,
    stepPostPhysics,
    getStats,
  };
}
