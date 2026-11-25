// src/core/autopilot.ts

import * as THREE from 'three';
import { CONFIG } from '../config';
import type { CarInput } from '../input/controls';
import type { Course, TrackFrame } from './course';
import type { CarState } from './physics';

const _frame: TrackFrame = {
  s: 0,
  position: new THREE.Vector3(),
  tangent: new THREE.Vector3(),
  up: new THREE.Vector3(),
  right: new THREE.Vector3(),
  width: CONFIG.course.trackWidth,
  bank: 0,
};

const _relPos = new THREE.Vector3();
const _carForward = new THREE.Vector3();

export function autopilotInput(state: CarState, course: Course): CarInput {
  let lateral = state.lateral;
  let yaw = state.yaw;

  if (state.mode !== 'grounded') {
    course.getFrameAt(state.sApprox, _frame);
    _relPos.subVectors(state.worldPos, _frame.position);
    lateral = _relPos.dot(_frame.right);
    _carForward.set(0, 0, -1).applyQuaternion(state.worldQuat).normalize();
    const fT = _carForward.dot(_frame.tangent);
    const fR = _carForward.dot(_frame.right);
    yaw = Math.atan2(fR, Math.max(0.1, fT));
  }

  const { kLateral, kYaw } = CONFIG.autopilot;
  const steer = THREE.MathUtils.clamp(-kLateral * lateral - kYaw * yaw, -1, 1);

  return {
    throttle: 1,
    brake: 0,
    steer,
    handbrake: false,
    resetPressed: false,
    restartPressed: false,
    confirmPressed: false,
    mutePressed: false,
  };
}
