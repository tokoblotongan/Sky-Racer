// src/core/physics.ts

import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Course, TrackFrame } from './course';
import type { CarInput } from '../input/controls';

export interface CarState {
  s: number;
  lateral: number;
  vForward: number;
  vLateral: number;
  yaw: number;
  steer: number;
  wheelSpin: number;
  latAccel: number;
  longAccel: number;
}

export interface CarPose {
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  up: THREE.Vector3;
  right: THREE.Vector3;
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
const _yawQuat = new THREE.Quaternion();

export function createCarState(): CarState {
  return {
    s: CONFIG.car.startS,
    lateral: CONFIG.car.startLateral,
    vForward: 0,
    vLateral: 0,
    yaw: 0,
    steer: 0,
    wheelSpin: 0,
    latAccel: 0,
    longAccel: 0,
  };
}

export function copyCarState(src: CarState, dst: CarState): void {
  dst.s = src.s;
  dst.lateral = src.lateral;
  dst.vForward = src.vForward;
  dst.vLateral = src.vLateral;
  dst.yaw = src.yaw;
  dst.steer = src.steer;
  dst.wheelSpin = src.wheelSpin;
  dst.latAccel = src.latAccel;
  dst.longAccel = src.longAccel;
}

export function interpolateCarState(
  prev: CarState,
  curr: CarState,
  alpha: number,
  out: CarState,
): void {
  out.s = THREE.MathUtils.lerp(prev.s, curr.s, alpha);
  out.lateral = THREE.MathUtils.lerp(prev.lateral, curr.lateral, alpha);
  out.vForward = THREE.MathUtils.lerp(prev.vForward, curr.vForward, alpha);
  out.vLateral = THREE.MathUtils.lerp(prev.vLateral, curr.vLateral, alpha);
  out.yaw = THREE.MathUtils.lerp(prev.yaw, curr.yaw, alpha);
  out.steer = THREE.MathUtils.lerp(prev.steer, curr.steer, alpha);
  out.wheelSpin = THREE.MathUtils.lerp(prev.wheelSpin, curr.wheelSpin, alpha);
  out.latAccel = THREE.MathUtils.lerp(prev.latAccel, curr.latAccel, alpha);
  out.longAccel = THREE.MathUtils.lerp(prev.longAccel, curr.longAccel, alpha);
}

export function stepCar(
  state: CarState,
  input: CarInput,
  course: Course,
  dt: number,
): void {
  const cfg = CONFIG.physics;
  const wheelRadius = CONFIG.car.wheelRadius;
  course.getFrameAt(state.s, _frame);
  _prevTangent.copy(_frame.tangent);

  const prevVForward = state.vForward;
  const prevVLateral = state.vLateral;
  const prevYaw = state.yaw;

  // 1. Longitudinal drive, braking, reverse, rolling resistance & drag
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
    } else {
      state.vForward -= cfg.reverseAccel * input.brake * dt;
    }
  }

  if (input.handbrake) {
    const hbDrop = cfg.handbrakeDrag * dt;
    if (Math.abs(state.vForward) <= hbDrop) {
      state.vForward = 0;
    } else {
      state.vForward -= Math.sign(state.vForward) * hbDrop;
    }
  } else if (input.throttle === 0 && input.brake === 0) {
    const rollDrop = cfg.rollingResistance * dt;
    if (Math.abs(state.vForward) <= rollDrop) {
      state.vForward = 0;
    } else {
      state.vForward -= Math.sign(state.vForward) * rollDrop;
    }
  }

  // Quadratic aero drag
  state.vForward -= cfg.drag * state.vForward * Math.abs(state.vForward) * dt;
  state.vForward = THREE.MathUtils.clamp(state.vForward, -cfg.reverseMaxSpeed, cfg.maxSpeed);

  // 2. Steering -> yaw relative to track tangent (with speed dependency & self-align)
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

  // 3. Re-project track-plane velocity onto rotated heading & decay lateral slip by grip
  if (Math.abs(dYaw) > 1e-6) {
    const cosD = Math.cos(dYaw);
    const sinD = Math.sin(dYaw);
    const nextForward = state.vForward * cosD + state.vLateral * sinD;
    const nextLateral = -state.vForward * sinD + state.vLateral * cosD;
    state.vForward = nextForward;
    state.vLateral = nextLateral;
  }

  const activeGrip = input.handbrake ? cfg.handbrakeGrip : cfg.grip;
  state.vLateral *= Math.exp(-activeGrip * dt);
  if (Math.abs(state.vLateral) < 1e-4) {
    state.vLateral = 0;
  }

  // 4. Advance s and lateral from heading/lateral components in track-space
  const cosY = Math.cos(state.yaw);
  const sinY = Math.sin(state.yaw);
  const vTrackTangent = state.vForward * cosY - state.vLateral * sinY;
  let vTrackRight = state.vForward * sinY + state.vLateral * cosY;

  state.s += vTrackTangent * dt;
  state.lateral += vTrackRight * dt;

  // 5. Guardrail bounds, bounce restitution & speed penalty
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

  // 6. Clamp s to [0, totalLength] with smooth stop at ends (no finish state yet)
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

  // 7. Wheel spin & body suspension accelerations
  state.wheelSpin += (state.vForward / wheelRadius) * dt;
  if (dt > 0) {
    course.getFrameAt(state.s, _afterFrame);
    _tangentDelta.subVectors(_afterFrame.tangent, _prevTangent);
    const trackTurnRate = _tangentDelta.dot(_frame.right) / dt;
    state.longAccel = (state.vForward - prevVForward) / dt;
    state.latAccel =
      (state.vLateral - prevVLateral) / dt + state.vForward * (yawRate + trackTurnRate);
  }
}

export function getCarPose(state: CarState, course: Course, out?: CarPose): CarPose {
  course.getFrameAt(state.s, _frame);

  const pose: CarPose = out ?? {
    position: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
    up: new THREE.Vector3(),
    right: new THREE.Vector3(),
  };

  pose.position
    .copy(_frame.position)
    .addScaledVector(_frame.right, state.lateral)
    .addScaledVector(_frame.up, CONFIG.physics.rideHeight);

  // Positive yaw tilts car heading toward +right -> rotation around +up by -yaw
  _yawQuat.setFromAxisAngle(_frame.up, -state.yaw);
  pose.tangent.copy(_frame.tangent).applyQuaternion(_yawQuat).normalize();
  pose.right.copy(_frame.right).applyQuaternion(_yawQuat).normalize();
  pose.up.copy(_frame.up).normalize();

  return pose;
}
