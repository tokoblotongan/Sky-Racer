// src/core/collisions.ts

import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Course } from './course';
import { getCarPose, type CarPose, type CarState } from './physics';
import type { TrackFrame } from './routes';
import type { RacePhase } from './state';

export interface CarCollisionEvent {
  carIndex: number;
  otherIndex: number;
  intensity: number;
  crashed: boolean;
  worldPos: THREE.Vector3;
}

const _poses: CarPose[] = [];
const _deltaPos = new THREE.Vector3();
const _avgForward = new THREE.Vector3();
const _avgRight = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _relVel = new THREE.Vector3();
const _frameA: TrackFrame = {
  s: 0,
  position: new THREE.Vector3(),
  tangent: new THREE.Vector3(),
  up: new THREE.Vector3(),
  right: new THREE.Vector3(),
  width: CONFIG.course.trackWidth,
  bank: 0,
};
const _frameB: TrackFrame = {
  s: 0,
  position: new THREE.Vector3(),
  tangent: new THREE.Vector3(),
  up: new THREE.Vector3(),
  right: new THREE.Vector3(),
  width: CONFIG.course.trackWidth,
  bank: 0,
};

function ensurePosePool(count: number): void {
  while (_poses.length < count) {
    _poses.push({
      position: new THREE.Vector3(),
      tangent: new THREE.Vector3(),
      up: new THREE.Vector3(),
      right: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
    });
  }
}

function triggerCrash(car: CarState, directionSign: number): void {
  const cfg = CONFIG.multiCar;
  car.crashed = true;
  car.crashTimer = cfg.crashDuration;
  car.vForward *= cfg.crashSpeedFactor;
  car.crashSpinAngle = 0.01 * directionSign;
  car.crashRollAngle = 0.01 * directionSign;
}

function syncGroundedVelFromWorld(car: CarState, pose: CarPose, frame: TrackFrame): void {
  if (car.mode !== 'grounded') {
    return;
  }
  const cosY = Math.cos(car.yaw);
  const sinY = Math.sin(car.yaw);
  const vTrackT = car.worldVel.dot(frame.tangent);
  const vTrackR = car.worldVel.dot(frame.right);
  car.vForward = THREE.MathUtils.clamp(
    vTrackT * cosY + vTrackR * sinY,
    -CONFIG.physics.maxReverseSlideSpeed,
    CONFIG.physics.maxSpeed * CONFIG.boost.maxSpeedMultiplier,
  );
  car.vLateral = THREE.MathUtils.clamp(
    -vTrackT * sinY + vTrackR * cosY,
    -CONFIG.physics.maxSlipSpeed,
    CONFIG.physics.maxSlipSpeed,
  );
  void pose;
}

function computeWorldVelocity(car: CarState, frame: TrackFrame, out: THREE.Vector3): void {
  if (car.mode !== 'grounded') {
    out.copy(car.worldVel);
    return;
  }
  const cosY = Math.cos(car.yaw);
  const sinY = Math.sin(car.yaw);
  const vTrackT = car.vForward * cosY - car.vLateral * sinY;
  const vTrackR = car.vForward * sinY + car.vLateral * cosY;
  out.set(0, 0, 0).addScaledVector(frame.tangent, vTrackT).addScaledVector(frame.right, vTrackR);
}

export function stepCarCrashRecovery(cars: readonly CarState[], dt: number): void {
  const cfg = CONFIG.multiCar;
  const duration = Math.max(0.1, cfg.crashDuration);
  for (let i = 0; i < cars.length; i++) {
    const car = cars[i];
    if (car.crashHitCooldown > 0) {
      car.crashHitCooldown = Math.max(0, car.crashHitCooldown - dt);
    }
    if (!car.crashed) {
      car.crashSpinAngle = 0;
      car.crashRollAngle = 0;
      continue;
    }

    car.crashTimer = Math.max(0, car.crashTimer - dt);
    const progress = 1 - car.crashTimer / duration;
    if (progress < 0.72) {
      const spinSign = car.crashSpinAngle >= 0 ? 1 : -1;
      car.crashSpinAngle += spinSign * cfg.crashSpinSpeed * dt;
      car.crashRollAngle += spinSign * cfg.crashRollSpeed * dt;
    } else {
      const recoverRate = 1 - Math.exp(-12 * dt);
      car.crashSpinAngle = THREE.MathUtils.lerp(car.crashSpinAngle, 0, recoverRate);
      car.crashRollAngle = THREE.MathUtils.lerp(car.crashRollAngle, 0, recoverRate);
    }

    if (car.crashTimer <= 0) {
      car.crashed = false;
      car.crashTimer = 0;
      car.crashSpinAngle = 0;
      car.crashRollAngle = 0;
    }
  }
}

export function resolveCarCollisions(
  cars: CarState[],
  course: Course,
  dt: number,
  phase: RacePhase,
): CarCollisionEvent[] {
  stepCarCrashRecovery(cars, dt);

  if (cars.length < 2 || (phase !== 'RACING' && phase !== 'FINISH')) {
    return [];
  }

  ensurePosePool(cars.length);
  for (let i = 0; i < cars.length; i++) {
    const car = cars[i];
    const route = course.getRoute(car.routeId);
    getCarPose(car, route, _poses[i]);
    if (car.mode === 'grounded') {
      route.getFrameAt(car.s, _frameA);
      computeWorldVelocity(car, _frameA, car.worldVel);
    }
  }

  const events: CarCollisionEvent[] = [];
  const cfg = CONFIG.multiCar;
  const fullLength = CONFIG.car.carHalfLength * 2;
  const fullWidth = CONFIG.car.carHalfWidth * 2 + cfg.separationPadding;
  const maxCheckDistSq = (fullLength + fullWidth) * (fullLength + fullWidth);
  const railMargin = CONFIG.physics.railInnerOffset + CONFIG.car.carHalfWidth;

  for (let i = 0; i < cars.length; i++) {
    const carA = cars[i];
    if (carA.mode === 'falling') continue;
    const poseA = _poses[i];
    const routeA = course.getRoute(carA.routeId);

    for (let j = i + 1; j < cars.length; j++) {
      const carB = cars[j];
      if (carB.mode === 'falling') continue;
      const poseB = _poses[j];

      _deltaPos.subVectors(poseB.position, poseA.position);
      if (Math.abs(_deltaPos.y) > cfg.verticalOverlapLimit) continue;
      if (_deltaPos.lengthSq() > maxCheckDistSq) continue;

      _avgForward.addVectors(poseA.tangent, poseB.tangent);
      if (_avgForward.lengthSq() < 1e-4) _avgForward.copy(poseA.tangent);
      _avgForward.normalize();

      _avgRight.addVectors(poseA.right, poseB.right);
      if (_avgRight.lengthSq() < 1e-4) _avgRight.copy(poseA.right);
      _avgRight.normalize();

      const dLong = _deltaPos.dot(_avgForward);
      const dLat = _deltaPos.dot(_avgRight);
      const overlapLong = fullLength - Math.abs(dLong);
      const overlapLat = fullWidth - Math.abs(dLat);

      if (overlapLong <= 0 || overlapLat <= 0) {
        continue;
      }

      const routeB = course.getRoute(carB.routeId);
      if (carA.mode === 'grounded') routeA.getFrameAt(carA.s, _frameA);
      if (carB.mode === 'grounded') routeB.getFrameAt(carB.s, _frameB);

      let sepAxis: 'lat' | 'long' = overlapLat <= overlapLong ? 'lat' : 'long';
      const penetration = sepAxis === 'lat' ? overlapLat : overlapLong;
      const sign = sepAxis === 'lat' ? (dLat >= 0 ? 1 : -1) : dLong >= 0 ? 1 : -1;

      if (sepAxis === 'lat') {
        _normal.copy(_avgRight).multiplyScalar(sign);
      } else {
        _normal.copy(_avgForward).multiplyScalar(sign);
      }

      const halfPush = penetration * 0.5;
      if (carA.mode === 'grounded') {
        if (sepAxis === 'lat') {
          const limA = routeA.getRailLimits(carA.s);
          carA.lateral = THREE.MathUtils.clamp(
            carA.lateral - sign * halfPush,
            limA.left + railMargin,
            limA.right - railMargin,
          );
        } else {
          carA.s -= sign * halfPush;
        }
      } else {
        carA.worldPos.addScaledVector(_normal, -halfPush);
      }

      if (carB.mode === 'grounded') {
        if (sepAxis === 'lat') {
          const limB = routeB.getRailLimits(carB.s);
          carB.lateral = THREE.MathUtils.clamp(
            carB.lateral + sign * halfPush,
            limB.left + railMargin,
            limB.right - railMargin,
          );
        } else {
          carB.s += sign * halfPush;
        }
      } else {
        carB.worldPos.addScaledVector(_normal, halfPush);
      }

      _relVel.subVectors(carB.worldVel, carA.worldVel);
      const closingSpeed = -_relVel.dot(_normal);
      let triggeredCrash = false;

      if (closingSpeed > 0) {
        const jImp = (1 + cfg.restitution) * 0.5 * closingSpeed;
        carA.worldVel.addScaledVector(_normal, -jImp);
        carB.worldVel.addScaledVector(_normal, jImp);

        const scrapeScale = Math.exp(-cfg.scrapeDamping * dt);
        if (sepAxis === 'lat') {
          carA.vForward *= scrapeScale;
          carB.vForward *= scrapeScale;
        }

        if (carA.mode === 'grounded') syncGroundedVelFromWorld(carA, poseA, _frameA);
        if (carB.mode === 'grounded') syncGroundedVelFromWorld(carB, poseB, _frameB);

        if (closingSpeed >= cfg.crashRelSpeedThreshold) {
          if (!carA.crashed && carA.crashHitCooldown <= 0) {
            triggerCrash(carA, sign);
            triggeredCrash = true;
          }
          if (!carB.crashed && carB.crashHitCooldown <= 0) {
            triggerCrash(carB, -sign);
            triggeredCrash = true;
          }
        }
      }

      if (
        (closingSpeed >= cfg.minImpactForceForSpark || triggeredCrash) &&
        carA.crashHitCooldown <= 0 &&
        carB.crashHitCooldown <= 0
      ) {
        carA.crashHitCooldown = cfg.collisionCooldown;
        carB.crashHitCooldown = cfg.collisionCooldown;
        const contactPos = new THREE.Vector3().lerpVectors(poseA.position, poseB.position, 0.5);
        const intensity = THREE.MathUtils.clamp(closingSpeed / 16, 0.25, 1);
        events.push({
          carIndex: i,
          otherIndex: j,
          intensity,
          crashed: triggeredCrash,
          worldPos: contactPos,
        });
      }
    }
  }

  return events;
}
