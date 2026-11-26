// src/core/physics.ts

import * as THREE from 'three';
import { CONFIG } from '../config';
import type { CarInput } from '../input/controls';
import { startAir, stepAir, type PhysicsEvent as AirPhysicsEvent } from './airPhysics';
import type { Route, TrackFrame } from './routes';
import type { RacePhase } from './state';

export type PhysicsEvent =
  | AirPhysicsEvent
  | { type: 'railHit'; side: -1 | 1; intensity: number; worldPos: THREE.Vector3 };

export type CarMode = 'grounded' | 'airborne' | 'falling';

export interface CarState {
  mode: CarMode;
  routeId: string;
  routeLapOffset: number;
  s: number;
  lateral: number;
  vForward: number;
  vLateral: number;
  yaw: number;
  steer: number;
  slip: number;
  wheelSpin: number;
  latAccel: number;
  longAccel: number;
  normalForce: number;
  boostTimeLeft: number;
  boostCooldown: number;
  railHitCooldown: number;
  currentGrip: number;
  railContactTimer: number;
  worldPos: THREE.Vector3;
  worldVel: THREE.Vector3;
  worldQuat: THREE.Quaternion;
  airtime: number;
  fallTimer: number;
  sApprox: number;
  lastSafeS: number;
  lastGapEndS: number;
  landingAlignTimer: number;
  landingStartQuat: THREE.Quaternion;
  crashed: boolean;
  crashTimer: number;
  crashSpinAngle: number;
  crashRollAngle: number;
  crashHitCooldown: number;
}

export interface CarPose {
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  up: THREE.Vector3;
  right: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

export interface StepCarOptions {
  phase: RacePhase;
  respawnTarget: { readonly s: number; readonly lateral: number };
  respawnRoute?: Route;
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

const _afterFrame: TrackFrame = {
  s: 0,
  position: new THREE.Vector3(),
  tangent: new THREE.Vector3(),
  up: new THREE.Vector3(),
  right: new THREE.Vector3(),
  width: CONFIG.course.trackWidth,
  bank: 0,
};

const _prevTangent = new THREE.Vector3();
const _tangentDelta = new THREE.Vector3();
const _negForward = new THREE.Vector3();
const _yawQuat = new THREE.Quaternion();
const _trackQuat = new THREE.Quaternion();
const _basisMat = new THREE.Matrix4();

function smoothstep01(t: number): number {
  const c = THREE.MathUtils.clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

const LOCKED_PARK_INPUT: CarInput = {
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: true,
  resetPressed: false,
  confirmPressed: false,
};

const LOCKED_FINISH_INPUT: CarInput = {
  throttle: 0,
  brake: 0.75,
  steer: 0,
  handbrake: false,
  resetPressed: false,
  confirmPressed: false,
};

const CRASH_COAST_INPUT: CarInput = {
  throttle: 0,
  brake: 0.35,
  steer: 0,
  handbrake: false,
  resetPressed: false,
  confirmPressed: false,
};

export interface CreateCarStateOptions {
  s?: number;
  lateral?: number;
  routeId?: string;
}

export function createCarState(options?: CreateCarStateOptions): CarState {
  const startS = options?.s ?? CONFIG.car.startS;
  const startLat = options?.lateral ?? CONFIG.car.startLateral;
  return {
    mode: 'grounded',
    routeId: options?.routeId ?? 'main',
    routeLapOffset: 0,
    s: startS,
    lateral: startLat,
    vForward: 0,
    vLateral: 0,
    yaw: 0,
    steer: 0,
    slip: 0,
    wheelSpin: 0,
    latAccel: 0,
    longAccel: 0,
    normalForce: CONFIG.physics.gravity,
    boostTimeLeft: 0,
    boostCooldown: 0,
    railHitCooldown: 0,
    currentGrip: CONFIG.physics.grip,
    railContactTimer: 0,
    worldPos: new THREE.Vector3(),
    worldVel: new THREE.Vector3(),
    worldQuat: new THREE.Quaternion(),
    airtime: 0,
    fallTimer: 0,
    sApprox: startS,
    lastSafeS: startS,
    lastGapEndS: 0,
    landingAlignTimer: 0,
    landingStartQuat: new THREE.Quaternion(),
    crashed: false,
    crashTimer: 0,
    crashSpinAngle: 0,
    crashRollAngle: 0,
    crashHitCooldown: 0,
  };
}

export function copyCarState(src: CarState, dst: CarState): void {
  dst.mode = src.mode;
  dst.routeId = src.routeId;
  dst.routeLapOffset = src.routeLapOffset;
  dst.s = src.s;
  dst.lateral = src.lateral;
  dst.vForward = src.vForward;
  dst.vLateral = src.vLateral;
  dst.yaw = src.yaw;
  dst.steer = src.steer;
  dst.slip = src.slip;
  dst.wheelSpin = src.wheelSpin;
  dst.latAccel = src.latAccel;
  dst.longAccel = src.longAccel;
  dst.normalForce = src.normalForce;
  dst.boostTimeLeft = src.boostTimeLeft;
  dst.boostCooldown = src.boostCooldown;
  dst.railHitCooldown = src.railHitCooldown;
  dst.currentGrip = src.currentGrip;
  dst.railContactTimer = src.railContactTimer;
  dst.worldPos.copy(src.worldPos);
  dst.worldVel.copy(src.worldVel);
  dst.worldQuat.copy(src.worldQuat);
  dst.airtime = src.airtime;
  dst.fallTimer = src.fallTimer;
  dst.sApprox = src.sApprox;
  dst.lastSafeS = src.lastSafeS;
  dst.lastGapEndS = src.lastGapEndS;
  dst.landingAlignTimer = src.landingAlignTimer;
  dst.landingStartQuat.copy(src.landingStartQuat);
  dst.crashed = src.crashed;
  dst.crashTimer = src.crashTimer;
  dst.crashSpinAngle = src.crashSpinAngle;
  dst.crashRollAngle = src.crashRollAngle;
  dst.crashHitCooldown = src.crashHitCooldown;
}

export function interpolateCarState(
  prev: CarState,
  curr: CarState,
  alpha: number,
  out: CarState,
): void {
  // Avoid bogus interpolation across mode or route switches (e.g. respawn, branch merge, or takeoff)
  if (prev.mode !== curr.mode || prev.routeId !== curr.routeId) {
    copyCarState(curr, out);
    return;
  }

  out.mode = curr.mode;
  out.routeId = curr.routeId;
  out.routeLapOffset = curr.routeLapOffset;
  out.s = THREE.MathUtils.lerp(prev.s, curr.s, alpha);
  out.lateral = THREE.MathUtils.lerp(prev.lateral, curr.lateral, alpha);
  out.vForward = THREE.MathUtils.lerp(prev.vForward, curr.vForward, alpha);
  out.vLateral = THREE.MathUtils.lerp(prev.vLateral, curr.vLateral, alpha);
  out.yaw = THREE.MathUtils.lerp(prev.yaw, curr.yaw, alpha);
  out.steer = THREE.MathUtils.lerp(prev.steer, curr.steer, alpha);
  out.slip = THREE.MathUtils.lerp(prev.slip, curr.slip, alpha);
  out.wheelSpin = THREE.MathUtils.lerp(prev.wheelSpin, curr.wheelSpin, alpha);
  out.latAccel = THREE.MathUtils.lerp(prev.latAccel, curr.latAccel, alpha);
  out.longAccel = THREE.MathUtils.lerp(prev.longAccel, curr.longAccel, alpha);
  out.normalForce = THREE.MathUtils.lerp(prev.normalForce, curr.normalForce, alpha);
  out.boostTimeLeft = THREE.MathUtils.lerp(prev.boostTimeLeft, curr.boostTimeLeft, alpha);
  out.boostCooldown = THREE.MathUtils.lerp(prev.boostCooldown, curr.boostCooldown, alpha);
  out.railHitCooldown = curr.railHitCooldown;
  out.currentGrip = curr.currentGrip;
  out.railContactTimer = curr.railContactTimer;
  out.worldPos.lerpVectors(prev.worldPos, curr.worldPos, alpha);
  out.worldVel.lerpVectors(prev.worldVel, curr.worldVel, alpha);
  out.worldQuat.slerpQuaternions(prev.worldQuat, curr.worldQuat, alpha);
  out.airtime = THREE.MathUtils.lerp(prev.airtime, curr.airtime, alpha);
  out.fallTimer = THREE.MathUtils.lerp(prev.fallTimer, curr.fallTimer, alpha);
  out.sApprox = THREE.MathUtils.lerp(prev.sApprox, curr.sApprox, alpha);
  out.lastSafeS = curr.lastSafeS;
  out.lastGapEndS = curr.lastGapEndS;
  out.landingAlignTimer = THREE.MathUtils.lerp(
    prev.landingAlignTimer,
    curr.landingAlignTimer,
    alpha,
  );
  out.landingStartQuat.copy(curr.landingStartQuat);
  out.crashed = curr.crashed;
  out.crashTimer = THREE.MathUtils.lerp(prev.crashTimer, curr.crashTimer, alpha);
  out.crashSpinAngle = THREE.MathUtils.lerp(prev.crashSpinAngle, curr.crashSpinAngle, alpha);
  out.crashRollAngle = THREE.MathUtils.lerp(prev.crashRollAngle, curr.crashRollAngle, alpha);
  out.crashHitCooldown = curr.crashHitCooldown;
}

export function triggerBoost(state: CarState): void {
  const boostCfg = CONFIG.boost;
  const boostedMax = CONFIG.physics.maxSpeed * boostCfg.maxSpeedMultiplier;
  state.boostTimeLeft = boostCfg.duration;
  state.boostCooldown = boostCfg.retriggerCooldown;

  if (state.mode === 'grounded' && state.vForward >= -1) {
    state.vForward = Math.min(boostedMax, Math.max(0, state.vForward) + boostCfg.kickSpeed);
  }
}

export function respawnAt(
  state: CarState,
  route: Route,
  s: number,
  lateral: number,
  speedFactor: number,
  routeLapOffset = 0,
): void {
  const clampedS = route.clampDistance(s);
  route.getFrameAt(clampedS, _frame);
  const limits = route.getRailLimits(clampedS);
  const margin = CONFIG.physics.railInnerOffset + CONFIG.car.carHalfWidth;
  const minLat = limits.left + margin;
  const maxLat = limits.right - margin;
  const clampedLat =
    minLat <= maxLat ? THREE.MathUtils.clamp(lateral, minLat, maxLat) : (minLat + maxLat) * 0.5;

  const forwardSpeed = Math.max(0, state.vForward) * speedFactor;

  state.mode = 'grounded';
  state.routeId = route.routeId;
  state.routeLapOffset = route.routeId === 'main' ? 0 : routeLapOffset;
  state.s = clampedS;
  state.sApprox = clampedS;
  state.lastSafeS = clampedS;
  state.lastGapEndS = 0;
  state.lateral = clampedLat;
  state.vForward = forwardSpeed;
  state.vLateral = 0;
  state.yaw = 0;
  state.steer = 0;
  state.slip = 0;
  state.airtime = 0;
  state.fallTimer = 0;
  state.landingAlignTimer = 0;
  state.latAccel = 0;
  state.longAccel = 0;
  state.boostTimeLeft = 0;
  state.boostCooldown = 0;
  state.railHitCooldown = 0;
  state.currentGrip = CONFIG.physics.grip;
  state.railContactTimer = 0;
  state.normalForce = CONFIG.physics.gravity * _frame.up.y;
  state.crashed = false;
  state.crashTimer = 0;
  state.crashSpinAngle = 0;
  state.crashRollAngle = 0;
  state.crashHitCooldown = 0;

  state.worldPos
    .copy(_frame.position)
    .addScaledVector(_frame.right, clampedLat)
    .addScaledVector(_frame.up, CONFIG.physics.rideHeight);
  state.worldVel.copy(_frame.tangent).multiplyScalar(forwardSpeed);
  _negForward.copy(_frame.tangent).negate();
  _basisMat.makeBasis(_frame.right, _frame.up, _negForward);
  state.worldQuat.setFromRotationMatrix(_basisMat);
}

function stepGroundedCar(
  state: CarState,
  input: CarInput,
  course: Route,
  dt: number,
  phase: RacePhase,
  events: PhysicsEvent[],
): void {
  const cfg = CONFIG.physics;
  const boostCfg = CONFIG.boost;
  const wheelRadius = CONFIG.car.wheelRadius;
  course.getFrameAt(state.s, _frame);
  _prevTangent.copy(_frame.tangent);

  const prevVForward = state.vForward;
  const prevVLateral = state.vLateral;
  const prevYaw = state.yaw;

  if (state.landingAlignTimer > 0) {
    state.landingAlignTimer = Math.max(0, state.landingAlignTimer - dt);
  }

  state.boostTimeLeft = Math.max(0, state.boostTimeLeft - dt);
  state.boostCooldown = Math.max(0, state.boostCooldown - dt);
  state.railHitCooldown = Math.max(0, state.railHitCooldown - dt);
  const isBoosting = state.boostTimeLeft > 0;
  const boostedMaxSpeed = cfg.maxSpeed * boostCfg.maxSpeedMultiplier;
  const activeMaxSpeed = isBoosting ? boostedMaxSpeed : cfg.maxSpeed;

  // 1. Track-space gravity components (world g = (0, -gravity, 0))
  const gFrameTangent = -cfg.gravity * _frame.tangent.y;
  const gFrameRight = -cfg.gravity * _frame.right.y;
  const gDotUp = -cfg.gravity * _frame.up.y;

  const cosYPre = Math.cos(state.yaw);
  const sinYPre = Math.sin(state.yaw);
  const gHeading = gFrameTangent * cosYPre + gFrameRight * sinYPre;
  const gCarRight = -gFrameTangent * sinYPre + gFrameRight * cosYPre;

  // 2. Longitudinal drive, boost, braking, reverse, gravity along track, rolling resistance & drag
  if (input.throttle > 0) {
    if (state.vForward < -0.4) {
      state.vForward = Math.min(0, state.vForward + cfg.brakeDecel * input.throttle * dt);
    } else if (state.vForward < activeMaxSpeed) {
      const speedRatio = THREE.MathUtils.clamp(state.vForward / activeMaxSpeed, 0, 1);
      const accelScale = Math.max(0, 1 - Math.pow(speedRatio, cfg.accelFalloffExponent));
      state.vForward += cfg.accel * input.throttle * accelScale * dt;
    }
  }

  if (isBoosting && phase === 'RACING') {
    const boostRatio = THREE.MathUtils.clamp(state.vForward / boostedMaxSpeed, 0, 1);
    const boostScale = Math.max(0, 1 - Math.pow(boostRatio, cfg.accelFalloffExponent));
    state.vForward += boostCfg.extraAccel * boostScale * dt;
  }

  if (input.brake > 0) {
    if (phase === 'FINISH') {
      state.vForward = Math.max(0, state.vForward - cfg.brakeDecel * input.brake * dt);
    } else if (state.vForward > 0.4) {
      state.vForward = Math.max(0, state.vForward - cfg.brakeDecel * input.brake * dt);
    } else if (state.vForward > -cfg.reverseMaxSpeed) {
      state.vForward = Math.max(
        -cfg.reverseMaxSpeed,
        state.vForward - cfg.reverseAccel * input.brake * dt,
      );
    }
  }

  // Gravity acceleration along track tangent (parked cleanly during TITLE/COUNTDOWN)
  if (phase === 'RACING' || phase === 'FINISH') {
    state.vForward += gHeading * dt;
  }

  // Prevent stalling upside down at loop apex
  if (_frame.up.y < -0.05 && Math.abs(state.vForward) < cfg.invertedStallSpeed) {
    const seg = course.getSegmentAt(state.s);
    const slideDir =
      Math.abs(_frame.tangent.y) > 0.04
        ? Math.sign(-_frame.tangent.y)
        : seg.progress < 0.5
          ? -1
          : 1;
    state.vForward += slideDir * cfg.invertedSlideAssist * dt;
  }

  if (input.handbrake) {
    const hbDrop = cfg.handbrakeDrag * dt;
    if (Math.abs(state.vForward) <= hbDrop) {
      state.vForward = 0;
    } else {
      state.vForward -= Math.sign(state.vForward) * hbDrop;
    }
  } else if (
    !isBoosting &&
    input.throttle === 0 &&
    input.brake === 0 &&
    Math.abs(_frame.tangent.y) < 0.08
  ) {
    const rollDrop = cfg.rollingResistance * dt;
    if (Math.abs(state.vForward) <= rollDrop) {
      state.vForward = 0;
    } else {
      state.vForward -= Math.sign(state.vForward) * rollDrop;
    }
  }

  // Smoothly return excess post-boost speed toward normal maxSpeed once boost expires
  if (!isBoosting && state.vForward > cfg.maxSpeed) {
    const excess = state.vForward - cfg.maxSpeed;
    state.vForward -= excess * (1 - Math.exp(-1.8 * dt));
  }

  // Quadratic aero drag + speed bounds
  state.vForward -= cfg.drag * state.vForward * Math.abs(state.vForward) * dt;
  state.vForward = THREE.MathUtils.clamp(
    state.vForward,
    -cfg.maxReverseSlideSpeed,
    boostedMaxSpeed,
  );

  // 3. Steering -> yaw relative to track tangent (speed-limited & controlled)
  const absSpeed = Math.abs(state.vForward);
  const speedNorm01 = THREE.MathUtils.clamp(absSpeed / Math.max(1, cfg.maxSpeed), 0, 1);
  const steerLimit = THREE.MathUtils.lerp(1, CONFIG.input.highSpeedSteerLimit, speedNorm01);
  const effectiveSteer = input.steer * steerLimit;
  state.steer = effectiveSteer;

  let speedFactor = 0;
  if (absSpeed > 1e-4) {
    if (absSpeed <= cfg.steerPeakSpeed) {
      const riseT = THREE.MathUtils.clamp(absSpeed / Math.max(0.1, cfg.steerPeakSpeed), 0, 1);
      speedFactor = riseT * (2 - riseT);
    } else {
      const highT = THREE.MathUtils.clamp(
        (absSpeed - cfg.steerPeakSpeed) / Math.max(1, cfg.maxSpeed - cfg.steerPeakSpeed),
        0,
        1,
      );
      speedFactor = THREE.MathUtils.lerp(1, cfg.steerHighSpeedFactor, highT);
    }
  }

  const steerDirection = state.vForward >= -0.25 ? 1 : -1;
  const handbrakeTurnBoost = input.handbrake ? cfg.handbrakeYawBoost : 1;

  if (Math.abs(input.steer) > 0.01) {
    const yawDelta =
      effectiveSteer *
      steerDirection *
      cfg.steerRate *
      speedFactor *
      handbrakeTurnBoost *
      dt;
    state.yaw += yawDelta;
  } else {
    const alignRate = cfg.yawSelfAlign * THREE.MathUtils.lerp(0.35, 1.45, speedNorm01);
    state.yaw *= Math.exp(-alignRate * dt);
    if (Math.abs(state.yaw) < 1e-4) {
      state.yaw = 0;
    }
  }

  state.yaw = THREE.MathUtils.clamp(state.yaw, -cfg.maxYaw, cfg.maxYaw);
  const dYaw = state.yaw - prevYaw;
  const yawRate = dt > 0 ? dYaw / dt : 0;

  // 4. Re-project track-plane velocity, apply lateral banking gravity, decay lateral slip with grip recovery
  if (Math.abs(dYaw) > 1e-6) {
    const cosD = Math.cos(dYaw);
    const sinD = Math.sin(dYaw);
    const nextForward = state.vForward * cosD + state.vLateral * sinD;
    const nextLateral = -state.vForward * sinD + state.vLateral * cosD;
    state.vForward = nextForward;
    state.vLateral = nextLateral;
  }

  state.vLateral += gCarRight * cfg.bankGravityFactor * dt;

  if (input.handbrake) {
    state.currentGrip = cfg.handbrakeGrip;
  } else if (state.currentGrip < cfg.grip) {
    const recoverRate = (cfg.grip - cfg.handbrakeGrip) / Math.max(0.02, cfg.gripRecoverTime);
    state.currentGrip = Math.min(cfg.grip, state.currentGrip + recoverRate * dt);
  } else {
    state.currentGrip = cfg.grip;
  }

  state.vLateral *= Math.exp(-state.currentGrip * dt);
  state.vLateral = THREE.MathUtils.clamp(state.vLateral, -cfg.maxSlipSpeed, cfg.maxSlipSpeed);
  if (Math.abs(state.vLateral) < 1e-4 && Math.abs(gCarRight) < 0.05) {
    state.vLateral = 0;
  }

  // 5. Advance s and lateral in track-space
  const cosY = Math.cos(state.yaw);
  const sinY = Math.sin(state.yaw);
  let vTrackTangent = state.vForward * cosY - state.vLateral * sinY;
  let vTrackRight = state.vForward * sinY + state.vLateral * cosY;

  state.s += vTrackTangent * dt;
  state.lateral += vTrackRight * dt;

  // 6. Guardrail bounds (yaw-aware footprint & asymmetric railGaps), smooth depenetration, one-time impact penalty & anti-stuck
  const halfExtentLateral =
    CONFIG.car.carHalfWidth * Math.abs(cosY) + CONFIG.car.carHalfLength * Math.abs(sinY);
  const railLimits = course.getRailLimits(state.s);
  const rawMinLat = railLimits.left + cfg.railInnerOffset + halfExtentLateral;
  const rawMaxLat = railLimits.right - cfg.railInnerOffset - halfExtentLateral;
  const midLat = (rawMinLat + rawMaxLat) * 0.5;
  const minLateral = rawMinLat <= rawMaxLat ? rawMinLat : midLat - 0.1;
  const maxLateral = rawMinLat <= rawMaxLat ? rawMaxLat : midLat + 0.1;

  const contactSide: -1 | 0 | 1 =
    state.lateral >= maxLateral - 0.01 ? 1 : state.lateral <= minLateral + 0.01 ? -1 : 0;

  if (contactSide !== 0) {
    state.railContactTimer += dt;

    const penetration = contactSide === 1 ? state.lateral - maxLateral : minLateral - state.lateral;
    if (penetration > 0) {
      const pushOut = Math.min(penetration, cfg.railPushOutSpeed * dt);
      state.lateral -= contactSide * pushOut;
      state.lateral = THREE.MathUtils.clamp(state.lateral, minLateral - 0.35, maxLateral + 0.35);
    }

    const vIntoWall = contactSide * vTrackRight;
    if (vIntoWall > 0) {
      if (vIntoWall > 0.35 && state.railHitCooldown <= 0) {
        const impactRatio = THREE.MathUtils.clamp(vIntoWall / 22, 0, 1);
        vTrackTangent *= 1 - cfg.railImpactPenalty * impactRatio;
        if (phase === 'RACING') {
          const contactPos = _frame.position
            .clone()
            .addScaledVector(_frame.right, state.lateral + contactSide * halfExtentLateral)
            .addScaledVector(_frame.up, 0.36);
          events.push({
            type: 'railHit',
            side: contactSide,
            intensity: THREE.MathUtils.clamp(vIntoWall / 14, 0.2, 1),
            worldPos: contactPos,
          });
        }
        state.railHitCooldown = cfg.railHitCooldown;
      }
      vTrackRight = -contactSide * vIntoWall * cfg.railRestitution;
    }

    vTrackTangent *= Math.exp(-cfg.railScrapeFriction * dt);

    // Exact 2D transpose rotation back into car-space (avoids cos(yaw) division spikes)
    state.vForward = vTrackTangent * cosY + vTrackRight * sinY;
    state.vLateral = THREE.MathUtils.clamp(
      -vTrackTangent * sinY + vTrackRight * cosY,
      -cfg.maxSlipSpeed,
      cfg.maxSlipSpeed,
    );

    if (state.vForward >= -0.25 && contactSide * state.yaw > 0) {
      const yawToZero = Math.min(Math.abs(state.yaw), cfg.railAlignRate * dt);
      state.yaw -= Math.sign(state.yaw) * yawToZero;
    }

    if (state.railContactTimer >= cfg.stuckTime && Math.abs(state.vForward) < cfg.stuckSpeed) {
      state.lateral -= contactSide * cfg.railPushOutSpeed * 0.5 * dt;
      if (contactSide * state.yaw > 0) {
        const strongAlign = Math.min(Math.abs(state.yaw), cfg.railAlignRate * 2.0 * dt);
        state.yaw -= Math.sign(state.yaw) * strongAlign;
      }
      const awaySpeed = -contactSide * state.vLateral;
      if (awaySpeed < 1.5) {
        const pushDelta = Math.min(1.5 - awaySpeed, cfg.railPushOutSpeed * dt);
        state.vLateral -= contactSide * pushDelta;
        state.vLateral = THREE.MathUtils.clamp(
          state.vLateral,
          -cfg.maxSlipSpeed,
          cfg.maxSlipSpeed,
        );
      }
    }
  } else {
    state.railContactTimer = 0;
  }

  state.slip =
    phase === 'RACING'
      ? Math.atan2(Math.abs(state.vLateral), Math.max(0.5, Math.abs(state.vForward)))
      : 0;

  // 7. Clamp s to [0, endClampS] with smooth stop past finish (open courses only)
  const totalLength = course.getLength();
  if (!course.isClosed()) {
    const endClampS = Math.max(totalLength, course.getFinishS() + 0.5);
    if (state.s <= 0) {
      state.s = 0;
      if (state.vForward < 0) {
        state.vForward = 0;
        state.vLateral = 0;
      }
    } else if (state.s >= endClampS) {
      state.s = endClampS;
      const stopDecay = Math.exp(-cfg.endStopDamping * dt);
      state.vForward *= stopDecay;
      state.vLateral *= stopDecay;
      if (Math.abs(state.vForward) < 0.08) {
        state.vForward = 0;
      }
    }
  }

  // 8. Normal force N = vForward^2 * kappa_up - dot(g, up)
  const kappaUp = course.getCurvatureUpAt(state.s);
  state.normalForce = state.vForward * state.vForward * kappaUp - gDotUp;

  // 9. Wheel spin & body suspension accelerations
  state.wheelSpin += (state.vForward / wheelRadius) * dt;
  if (dt > 0) {
    course.getFrameAt(state.s, _afterFrame);
    _tangentDelta.subVectors(_afterFrame.tangent, _prevTangent);
    const trackTurnRate = _tangentDelta.dot(_frame.right) / dt;
    state.longAccel = (state.vForward - prevVForward) / dt;
    state.latAccel =
      (state.vLateral - prevVLateral) / dt + state.vForward * (yawRate + trackTurnRate);
  }

  // 10. Boost pad detection (only while grounded and during RACING; wrapped on closed circuits)
  if (phase === 'RACING' && state.boostCooldown <= 0 && !course.isGapAt(state.s)) {
    const boostPads = course.getBoostPads();
    const checkS = course.isClosed() ? course.wrapDistance(state.s) : state.s;
    for (const pad of boostPads) {
      const rawDiff = Math.abs(checkS - pad.s);
      const longDist = course.isClosed() ? Math.min(rawDiff, totalLength - rawDiff) : rawDiff;
      if (
        longDist <= pad.length * 0.5 &&
        Math.abs(state.lateral - pad.lateral) < pad.width * 0.5
      ) {
        triggerBoost(state);
        events.push({ type: 'boost', padId: pad.id });
        break;
      }
    }
  }

  // 11. Takeoff at gap start (only detach at gaps so loop behavior remains unchanged)
  if (course.isGapAt(state.s)) {
    const airEvents: AirPhysicsEvent[] = [];
    startAir(state, course, airEvents);
    for (const ev of airEvents) events.push(ev);
  } else {
    state.sApprox = state.s;
  }
}

export function stepCar(
  state: CarState,
  input: CarInput,
  route: Route,
  dt: number,
  options: StepCarOptions,
): PhysicsEvent[] {
  const events: PhysicsEvent[] = [];

  if (options.phase === 'TITLE' || options.phase === 'COUNTDOWN') {
    state.boostTimeLeft = 0;
    state.boostCooldown = 0;
    stepGroundedCar(state, LOCKED_PARK_INPUT, route, dt, options.phase, events);
    return events;
  }

  const effectiveInput =
    options.phase === 'FINISH'
      ? LOCKED_FINISH_INPUT
      : state.crashed
        ? CRASH_COAST_INPUT
        : input;

  if (state.mode === 'grounded') {
    stepGroundedCar(state, effectiveInput, route, dt, options.phase, events);
  } else {
    state.slip = 0;
    const airEvents: AirPhysicsEvent[] = [];
    stepAir(state, effectiveInput, route, dt, airEvents);
    for (const ev of airEvents) events.push(ev);
    if (events.some((ev) => ev.type === 'respawn')) {
      respawnAt(
        state,
        options.respawnRoute ?? route,
        options.respawnTarget.s,
        options.respawnTarget.lateral,
        CONFIG.physics.respawnSpeedFactor,
      );
    }
  }

  return events;
}

export function getCarPose(state: CarState, course: Route, out?: CarPose): CarPose {
  const pose: CarPose = out ?? {
    position: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
    up: new THREE.Vector3(),
    right: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
  };

  if (state.mode !== 'grounded') {
    pose.position.copy(state.worldPos);
    pose.quaternion.copy(state.worldQuat).normalize();
    pose.right.set(1, 0, 0).applyQuaternion(pose.quaternion).normalize();
    pose.up.set(0, 1, 0).applyQuaternion(pose.quaternion).normalize();
    pose.tangent.set(0, 0, -1).applyQuaternion(pose.quaternion).normalize();
    return pose;
  }

  course.getFrameAt(state.s, _frame);

  pose.position
    .copy(_frame.position)
    .addScaledVector(_frame.right, state.lateral)
    .addScaledVector(_frame.up, CONFIG.physics.rideHeight);

  _yawQuat.setFromAxisAngle(_frame.up, -state.yaw);
  pose.tangent.copy(_frame.tangent).applyQuaternion(_yawQuat).normalize();
  pose.right.copy(_frame.right).applyQuaternion(_yawQuat).normalize();
  pose.up.copy(_frame.up).normalize();

  _negForward.copy(pose.tangent).negate();
  _basisMat.makeBasis(pose.right, pose.up, _negForward);
  _trackQuat.setFromRotationMatrix(_basisMat);

  if (state.landingAlignTimer > 0 && CONFIG.physics.landingAlignTime > 1e-4) {
    const progress = 1 - state.landingAlignTimer / CONFIG.physics.landingAlignTime;
    pose.quaternion.slerpQuaternions(state.landingStartQuat, _trackQuat, smoothstep01(progress));
    pose.right.set(1, 0, 0).applyQuaternion(pose.quaternion).normalize();
    pose.up.set(0, 1, 0).applyQuaternion(pose.quaternion).normalize();
    pose.tangent.set(0, 0, -1).applyQuaternion(pose.quaternion).normalize();
  } else {
    pose.quaternion.copy(_trackQuat);
  }

  return pose;
}
