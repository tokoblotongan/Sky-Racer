// src/core/physics.ts

import * as THREE from 'three';
import { CONFIG } from '../config';
import type { CarInput } from '../input/controls';
import { startAir, stepAir, type PhysicsEvent } from './airPhysics';
import type { Course, TrackFrame } from './course';

export type { PhysicsEvent } from './airPhysics';

export type CarMode = 'grounded' | 'airborne' | 'falling';

export interface CarState {
  mode: CarMode;
  s: number;
  lateral: number;
  vForward: number;
  vLateral: number;
  yaw: number;
  steer: number;
  wheelSpin: number;
  latAccel: number;
  longAccel: number;
  normalForce: number;
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
}

export interface CarPose {
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  up: THREE.Vector3;
  right: THREE.Vector3;
  quaternion: THREE.Quaternion;
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

export function createCarState(): CarState {
  return {
    mode: 'grounded',
    s: CONFIG.car.startS,
    lateral: CONFIG.car.startLateral,
    vForward: 0,
    vLateral: 0,
    yaw: 0,
    steer: 0,
    wheelSpin: 0,
    latAccel: 0,
    longAccel: 0,
    normalForce: CONFIG.physics.gravity,
    worldPos: new THREE.Vector3(),
    worldVel: new THREE.Vector3(),
    worldQuat: new THREE.Quaternion(),
    airtime: 0,
    fallTimer: 0,
    sApprox: CONFIG.car.startS,
    lastSafeS: CONFIG.car.startS,
    lastGapEndS: 0,
    landingAlignTimer: 0,
    landingStartQuat: new THREE.Quaternion(),
  };
}

export function copyCarState(src: CarState, dst: CarState): void {
  dst.mode = src.mode;
  dst.s = src.s;
  dst.lateral = src.lateral;
  dst.vForward = src.vForward;
  dst.vLateral = src.vLateral;
  dst.yaw = src.yaw;
  dst.steer = src.steer;
  dst.wheelSpin = src.wheelSpin;
  dst.latAccel = src.latAccel;
  dst.longAccel = src.longAccel;
  dst.normalForce = src.normalForce;
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
}

export function interpolateCarState(
  prev: CarState,
  curr: CarState,
  alpha: number,
  out: CarState,
): void {
  // Avoid bogus interpolation across mode switches (e.g. respawn or takeoff)
  if (prev.mode !== curr.mode) {
    copyCarState(curr, out);
    return;
  }

  out.mode = curr.mode;
  out.s = THREE.MathUtils.lerp(prev.s, curr.s, alpha);
  out.lateral = THREE.MathUtils.lerp(prev.lateral, curr.lateral, alpha);
  out.vForward = THREE.MathUtils.lerp(prev.vForward, curr.vForward, alpha);
  out.vLateral = THREE.MathUtils.lerp(prev.vLateral, curr.vLateral, alpha);
  out.yaw = THREE.MathUtils.lerp(prev.yaw, curr.yaw, alpha);
  out.steer = THREE.MathUtils.lerp(prev.steer, curr.steer, alpha);
  out.wheelSpin = THREE.MathUtils.lerp(prev.wheelSpin, curr.wheelSpin, alpha);
  out.latAccel = THREE.MathUtils.lerp(prev.latAccel, curr.latAccel, alpha);
  out.longAccel = THREE.MathUtils.lerp(prev.longAccel, curr.longAccel, alpha);
  out.normalForce = THREE.MathUtils.lerp(prev.normalForce, curr.normalForce, alpha);
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
}

function stepGroundedCar(
  state: CarState,
  input: CarInput,
  course: Course,
  dt: number,
  events: PhysicsEvent[],
): void {
  const cfg = CONFIG.physics;
  const wheelRadius = CONFIG.car.wheelRadius;
  course.getFrameAt(state.s, _frame);
  _prevTangent.copy(_frame.tangent);

  const prevVForward = state.vForward;
  const prevVLateral = state.vLateral;
  const prevYaw = state.yaw;

  if (state.landingAlignTimer > 0) {
    state.landingAlignTimer = Math.max(0, state.landingAlignTimer - dt);
  }

  // 1. Track-space gravity components (world g = (0, -gravity, 0))
  const gFrameTangent = -cfg.gravity * _frame.tangent.y;
  const gFrameRight = -cfg.gravity * _frame.right.y;
  const gDotUp = -cfg.gravity * _frame.up.y;

  const cosYPre = Math.cos(state.yaw);
  const sinYPre = Math.sin(state.yaw);
  const gHeading = gFrameTangent * cosYPre + gFrameRight * sinYPre;
  const gCarRight = -gFrameTangent * sinYPre + gFrameRight * cosYPre;

  // 2. Longitudinal drive, braking, reverse, gravity along track, rolling resistance & drag
  if (input.throttle > 0) {
    if (state.vForward < -0.4) {
      state.vForward = Math.min(0, state.vForward + cfg.brakeDecel * input.throttle * dt);
    } else {
      const speedRatio = THREE.MathUtils.clamp(state.vForward / cfg.maxSpeed, 0, 1);
      const accelScale = Math.max(0, 1 - Math.pow(speedRatio, cfg.accelFalloffExponent));
      state.vForward += cfg.accel * input.throttle * accelScale * dt;
    }
  }

  if (input.brake > 0) {
    if (state.vForward > 0.4) {
      state.vForward = Math.max(0, state.vForward - cfg.brakeDecel * input.brake * dt);
    } else if (state.vForward > -cfg.reverseMaxSpeed) {
      state.vForward = Math.max(
        -cfg.reverseMaxSpeed,
        state.vForward - cfg.reverseAccel * input.brake * dt,
      );
    }
  }

  // Gravity acceleration along track tangent
  state.vForward += gHeading * dt;

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
  } else if (input.throttle === 0 && input.brake === 0 && Math.abs(_frame.tangent.y) < 0.08) {
    const rollDrop = cfg.rollingResistance * dt;
    if (Math.abs(state.vForward) <= rollDrop) {
      state.vForward = 0;
    } else {
      state.vForward -= Math.sign(state.vForward) * rollDrop;
    }
  }

  // Quadratic aero drag + speed bounds
  state.vForward -= cfg.drag * state.vForward * Math.abs(state.vForward) * dt;
  state.vForward = THREE.MathUtils.clamp(
    state.vForward,
    -cfg.maxReverseSlideSpeed,
    cfg.maxSpeed,
  );

  // 3. Steering -> yaw relative to track tangent
  state.steer = input.steer;
  const absSpeed = Math.abs(state.vForward);
  const lowSpeedFactor = THREE.MathUtils.clamp(absSpeed / cfg.steerMinSpeed, 0, 1);
  const speedNorm = absSpeed / cfg.steerRefSpeed;
  const highSpeedFactor = 1 / (1 + speedNorm * speedNorm * cfg.steerHighSpeedDamp);
  const steerDirection = state.vForward >= -0.25 ? 1 : -1;
  const handbrakeTurnBoost = input.handbrake ? cfg.handbrakeYawBoost : 1;

  if (Math.abs(input.steer) > 0.01) {
    const yawDelta =
      input.steer *
      steerDirection *
      cfg.steerRate *
      lowSpeedFactor *
      highSpeedFactor *
      handbrakeTurnBoost *
      dt;
    state.yaw += yawDelta;
  } else {
    const alignRate = cfg.yawSelfAlign * THREE.MathUtils.lerp(0.25, 1, lowSpeedFactor);
    state.yaw *= Math.exp(-alignRate * dt);
    if (Math.abs(state.yaw) < 1e-4) {
      state.yaw = 0;
    }
  }

  state.yaw = THREE.MathUtils.clamp(state.yaw, -cfg.maxYaw, cfg.maxYaw);
  const dYaw = state.yaw - prevYaw;
  const yawRate = dt > 0 ? dYaw / dt : 0;

  // 4. Re-project track-plane velocity, apply lateral banking gravity, decay lateral slip by grip
  if (Math.abs(dYaw) > 1e-6) {
    const cosD = Math.cos(dYaw);
    const sinD = Math.sin(dYaw);
    const nextForward = state.vForward * cosD + state.vLateral * sinD;
    const nextLateral = -state.vForward * sinD + state.vLateral * cosD;
    state.vForward = nextForward;
    state.vLateral = nextLateral;
  }

  state.vLateral += gCarRight * cfg.bankGravityFactor * dt;

  const activeGrip = input.handbrake ? cfg.handbrakeGrip : cfg.grip;
  state.vLateral *= Math.exp(-activeGrip * dt);
  if (Math.abs(state.vLateral) < 1e-4 && Math.abs(gCarRight) < 0.05) {
    state.vLateral = 0;
  }

  // 5. Advance s and lateral in track-space
  const cosY = Math.cos(state.yaw);
  const sinY = Math.sin(state.yaw);
  const vTrackTangent = state.vForward * cosY - state.vLateral * sinY;
  let vTrackRight = state.vForward * sinY + state.vLateral * cosY;

  state.s += vTrackTangent * dt;
  state.lateral += vTrackRight * dt;

  // 6. Guardrail bounds, bounce restitution & speed penalty
  const maxLateral = Math.max(0.2, _frame.width * 0.5 - cfg.railMargin);
  if (state.lateral > maxLateral) {
    state.lateral = maxLateral;
    if (vTrackRight > 0) {
      vTrackRight = -vTrackRight * cfg.railRestitution;
      state.vForward *= cfg.railSpeedPenalty;
      state.yaw *= cfg.railYawDamp;
      const cosR = Math.cos(state.yaw);
      const sinR = Math.sin(state.yaw);
      state.vLateral = (vTrackRight - state.vForward * sinR) / Math.max(0.2, cosR);
    }
  } else if (state.lateral < -maxLateral) {
    state.lateral = -maxLateral;
    if (vTrackRight < 0) {
      vTrackRight = -vTrackRight * cfg.railRestitution;
      state.vForward *= cfg.railSpeedPenalty;
      state.yaw *= cfg.railYawDamp;
      const cosR = Math.cos(state.yaw);
      const sinR = Math.sin(state.yaw);
      state.vLateral = (vTrackRight - state.vForward * sinR) / Math.max(0.2, cosR);
    }
  }

  // 7. Clamp s to [0, totalLength] with smooth stop at ends
  const totalLength = course.getLength();
  if (state.s <= 0) {
    state.s = 0;
    if (state.vForward < 0) {
      state.vForward = 0;
      state.vLateral = 0;
    }
  } else if (state.s >= totalLength) {
    state.s = totalLength;
    const stopDecay = Math.exp(-cfg.endStopDamping * dt);
    state.vForward *= stopDecay;
    state.vLateral *= stopDecay;
    if (Math.abs(state.vForward) < 0.08) {
      state.vForward = 0;
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

  // 10. Takeoff at gap start (only detach at gaps so loop behavior remains unchanged)
  if (course.isGapAt(state.s)) {
    startAir(state, course, events);
  } else {
    state.sApprox = state.s;
  }
}

export function stepCar(
  state: CarState,
  input: CarInput,
  course: Course,
  dt: number,
): PhysicsEvent[] {
  const events: PhysicsEvent[] = [];

  if (state.mode === 'grounded') {
    stepGroundedCar(state, input, course, dt, events);
  } else {
    stepAir(state, input, course, dt, events);
  }

  return events;
}

export function getCarPose(state: CarState, course: Course, out?: CarPose): CarPose {
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
