// src/core/ai/recovery.ts

import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { Course } from '../course';
import { getCarPose, respawnAt, type CarPose, type CarState } from '../physics';
import type { Route, TrackFrame } from '../routes';

export interface RecoveryState {
  stuckTimer: number;
  wrongWayTimer: number;
  ghostTimer: number;
  respawnCount: number;
  stuckCount: number;
  wrongWayCount: number;
  speedIntegral: number;
  reactionDelayLeft: number;
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

const _pose: CarPose = {
  position: new THREE.Vector3(),
  tangent: new THREE.Vector3(),
  up: new THREE.Vector3(),
  right: new THREE.Vector3(),
  quaternion: new THREE.Quaternion(),
};

export function createRecoveryState(reactionDelaySec = 0): RecoveryState {
  return {
    stuckTimer: 0,
    wrongWayTimer: 0,
    ghostTimer: 0,
    respawnCount: 0,
    stuckCount: 0,
    wrongWayCount: 0,
    speedIntegral: 0,
    reactionDelayLeft: Math.max(0, reactionDelaySec),
  };
}

export function resetRecoveryState(state: RecoveryState, reactionDelaySec = 0): void {
  state.stuckTimer = 0;
  state.wrongWayTimer = 0;
  state.ghostTimer = 0;
  state.respawnCount = 0;
  state.stuckCount = 0;
  state.wrongWayCount = 0;
  state.speedIntegral = 0;
  state.reactionDelayLeft = Math.max(0, reactionDelaySec);
}

export function stepAiRecovery(
  car: CarState,
  recovery: RecoveryState,
  course: Course,
  dt: number,
  isActiveRace: boolean,
): 'none' | 'stuck' | 'wrongWay' {
  if (recovery.ghostTimer > 0) {
    recovery.ghostTimer = Math.max(0, recovery.ghostTimer - dt);
  }

  if (!isActiveRace) {
    recovery.stuckTimer = 0;
    recovery.wrongWayTimer = 0;
    return 'none';
  }

  if (recovery.reactionDelayLeft > 0) {
    recovery.reactionDelayLeft = Math.max(0, recovery.reactionDelayLeft - dt);
    return 'none';
  }

  if (car.mode === 'falling' || car.crashed) {
    recovery.stuckTimer = 0;
    recovery.wrongWayTimer = 0;
    return 'none';
  }

  const activeRoute: Route = course.getRoute(car.routeId);
  const speed =
    car.mode === 'grounded'
      ? Math.hypot(car.vForward, car.vLateral)
      : car.worldVel.length();

  if (speed < CONFIG.ai.stuck.minSpeed) {
    recovery.stuckTimer += dt;
  } else {
    recovery.stuckTimer = Math.max(0, recovery.stuckTimer - dt * 1.5);
  }

  const activeS = car.mode === 'grounded' ? car.s : car.sApprox;
  activeRoute.getFrameAt(activeS, _frame);
  getCarPose(car, activeRoute, _pose);
  const headingDot = _pose.tangent.dot(_frame.tangent);

  let movingWrong = false;
  if (car.mode === 'grounded') {
    const cosY = Math.cos(car.yaw);
    const sinY = Math.sin(car.yaw);
    const vTrackTangent = car.vForward * cosY - car.vLateral * sinY;
    const motionDot = speed > 1e-4 ? vTrackTangent / speed : 1;
    movingWrong =
      speed > 1.5 &&
      ((motionDot < CONFIG.ai.wrongWay.dot && car.vForward < -0.5) ||
        headingDot < CONFIG.ai.wrongWay.dot);
  } else {
    const motionDot = speed > 1e-4 ? car.worldVel.dot(_frame.tangent) / speed : 1;
    movingWrong =
      speed > 1.5 && Math.min(motionDot, headingDot) < CONFIG.ai.wrongWay.dot;
  }

  if (movingWrong) {
    recovery.wrongWayTimer += dt;
  } else {
    recovery.wrongWayTimer = Math.max(0, recovery.wrongWayTimer - dt * 2.0);
  }

  const doRespawn = (reason: 'stuck' | 'wrongWay'): void => {
    const mainRoute = course.getRoute('main');
    const currentSafeS =
      car.routeId === 'main'
        ? car.lastSafeS
        : car.routeLapOffset + course.getProgressS(car.routeId, car.lastSafeS);
    const safeMainS = Math.max(4, currentSafeS);
    respawnAt(car, mainRoute, safeMainS, 0, CONFIG.physics.respawnSpeedFactor, 0);
    recovery.stuckTimer = 0;
    recovery.wrongWayTimer = 0;
    recovery.ghostTimer = 1.25;
    recovery.speedIntegral = 0;
    recovery.respawnCount++;
    if (reason === 'stuck') {
      recovery.stuckCount++;
    } else {
      recovery.wrongWayCount++;
    }
  };

  if (recovery.stuckTimer >= CONFIG.ai.stuck.seconds) {
    doRespawn('stuck');
    return 'stuck';
  }

  if (recovery.wrongWayTimer >= CONFIG.ai.wrongWay.seconds) {
    doRespawn('wrongWay');
    return 'wrongWay';
  }

  return 'none';
}
