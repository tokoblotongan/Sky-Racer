// src/core/airPhysics.ts

import * as THREE from 'three';
import { CONFIG } from '../config';
import type { CarInput } from '../input/controls';
import type { CarState } from './physics';
import type { Route, TrackFrame } from './routes';

export type PhysicsEvent =
  | { type: 'takeoff' }
  | { type: 'landed'; airtime: number; impactSpeed: number }
  | { type: 'boost'; padId: number }
  | { type: 'fell' }
  | { type: 'respawn' };

const WORLD_UP = new THREE.Vector3(0, 1, 0);

const _frame: TrackFrame = {
  s: 0,
  position: new THREE.Vector3(),
  tangent: new THREE.Vector3(),
  up: new THREE.Vector3(),
  right: new THREE.Vector3(),
  width: CONFIG.course.trackWidth,
  bank: 0,
};

const _yawQuat = new THREE.Quaternion();
const _steerQuat = new THREE.Quaternion();
const _targetQuat = new THREE.Quaternion();
const _basisMat = new THREE.Matrix4();

const _carForward = new THREE.Vector3();
const _carRight = new THREE.Vector3();
const _velDir = new THREE.Vector3();
const _alignForward = new THREE.Vector3();
const _alignRight = new THREE.Vector3();
const _alignUp = new THREE.Vector3();
const _negForward = new THREE.Vector3();
const _relPos = new THREE.Vector3();

export function startAir(
  state: CarState,
  course: Route,
  events: PhysicsEvent[],
): void {
  const cfg = CONFIG.physics;
  const gap = course.getGapRangeAt(state.s);
  const lapLen = course.getLength();
  const lapOffset =
    course.isClosed() && lapLen > 1e-6 ? Math.floor(state.s / lapLen) * lapLen : 0;
  const takeoffS = gap
    ? lapOffset + (state.vForward >= 0 ? gap.startS : gap.endS)
    : state.s;

  course.getFrameAt(takeoffS, _frame);

  _yawQuat.setFromAxisAngle(_frame.up, -state.yaw);
  _carForward.copy(_frame.tangent).applyQuaternion(_yawQuat).normalize();
  _carRight.copy(_frame.right).applyQuaternion(_yawQuat).normalize();

  const signedOvershoot = state.s - takeoffS;
  state.worldPos
    .copy(_frame.position)
    .addScaledVector(_frame.right, state.lateral)
    .addScaledVector(_frame.up, cfg.rideHeight)
    .addScaledVector(_carForward, signedOvershoot);

  state.worldVel
    .copy(_carForward)
    .multiplyScalar(state.vForward)
    .addScaledVector(_carRight, state.vLateral);

  _negForward.copy(_carForward).negate();
  _basisMat.makeBasis(_carRight, _frame.up, _negForward);
  state.worldQuat.setFromRotationMatrix(_basisMat);

  state.mode = 'airborne';
  state.airtime = 0;
  state.fallTimer = 0;
  state.sApprox = state.s;
  state.lastGapEndS = gap ? lapOffset + gap.endS : state.s;
  const rawSafeS = (gap ? lapOffset + gap.startS : takeoffS) - cfg.respawnBackoff;
  state.lastSafeS = course.isClosed()
    ? rawSafeS
    : Math.max(course.routeId === 'main' ? CONFIG.car.startS : 0, rawSafeS);
  state.normalForce = 0;

  events.push({ type: 'takeoff' });
}

export function stepAir(
  state: CarState,
  input: CarInput,
  course: Route,
  dt: number,
  events: PhysicsEvent[],
): void {
  const cfg = CONFIG.physics;
  const wheelRadius = CONFIG.car.wheelRadius;

  state.steer = input.steer;
  state.boostTimeLeft = Math.max(0, state.boostTimeLeft - dt);
  state.boostCooldown = Math.max(0, state.boostCooldown - dt);

  if (state.mode === 'airborne') {
    state.airtime += dt;

    // Gravity and light aerodynamic drag in air
    state.worldVel.y -= cfg.gravity * dt;
    const speed = state.worldVel.length();
    if (speed > 1e-4) {
      const dragScale = Math.max(0, 1 - cfg.airDrag * speed * dt);
      state.worldVel.multiplyScalar(dragScale);
    }

    // Subtle mid-air yaw correction around world up
    if (Math.abs(input.steer) > 0.01) {
      const steerDir = state.vForward >= -0.25 ? 1 : -1;
      const airYawDelta = -input.steer * steerDir * cfg.airYawControl * dt;
      _steerQuat.setFromAxisAngle(WORLD_UP, airYawDelta);
      state.worldVel.applyQuaternion(_steerQuat);
      state.worldQuat.premultiply(_steerQuat);
    }

    state.worldPos.addScaledVector(state.worldVel, dt);

    // Smoothly align body orientation with flight velocity vector and world up
    if (state.worldVel.lengthSq() > 0.25) {
      _velDir.copy(state.worldVel).normalize();
      _carForward.set(0, 0, -1).applyQuaternion(state.worldQuat);
      if (_carForward.dot(_velDir) >= -0.15) {
        _alignForward.copy(_velDir);
      } else {
        _alignForward.copy(_velDir).negate();
      }

      if (Math.abs(_alignForward.dot(WORLD_UP)) < 0.985) {
        _alignRight.crossVectors(_alignForward, WORLD_UP).normalize();
      } else {
        _alignRight.set(1, 0, 0).applyQuaternion(state.worldQuat);
        _alignRight.addScaledVector(_alignForward, -_alignRight.dot(_alignForward)).normalize();
      }
      _alignUp.crossVectors(_alignRight, _alignForward).normalize();
      _negForward.copy(_alignForward).negate();
      _basisMat.makeBasis(_alignRight, _alignUp, _negForward);
      _targetQuat.setFromRotationMatrix(_basisMat);

      const orientAlpha = 1 - Math.exp(-dt / Math.max(0.01, cfg.airOrientSmoothTime));
      state.worldQuat.slerp(_targetQuat, orientAlpha);
    }

    // Keep wheels spinning smoothly and relax suspension accelerations
    state.wheelSpin += (state.vForward / wheelRadius) * dt;
    const accelRelax = Math.exp(-6 * dt);
    state.latAccel *= accelRelax;
    state.longAccel *= accelRelax;
    state.normalForce = 0;

    // Windowed nearest-sample lookup along course centerline
    state.sApprox = course.findNearestS(state.worldPos, state.sApprox, cfg.airNearestWindow);
    course.getFrameAt(state.sApprox, _frame);

    _relPos.subVectors(state.worldPos, _frame.position);
    const heightAbove = _relPos.dot(_frame.up);
    const lateral = _relPos.dot(_frame.right);
    const velDotUp = state.worldVel.dot(_frame.up);
    const inGap = course.isGapAt(state.sApprox);
    const limits = course.getRailLimits(state.sApprox);
    const insideDeckWidth =
      lateral >= limits.left - cfg.landingLateralTolerance &&
      lateral <= limits.right + cfg.landingLateralTolerance;

    // Landing detection
    if (
      !inGap &&
      state.airtime > 0.05 &&
      heightAbove <= cfg.rideHeight &&
      insideDeckWidth &&
      velDotUp <= 0
    ) {
      const airtime = state.airtime;
      const impactSpeed = Math.abs(velDotUp);

      const vt = state.worldVel.dot(_frame.tangent);
      const vr = state.worldVel.dot(_frame.right);
      const planarSpeed = Math.hypot(vt, vr);

      const penaltyRatio = THREE.MathUtils.clamp(impactSpeed / cfg.impactRefSpeed, 0, 1);
      const postSpeed = planarSpeed * Math.max(0.15, 1 - cfg.landingPenalty * penaltyRatio);
      const scale = planarSpeed > 1e-4 ? postSpeed / planarSpeed : 0;
      const vtScaled = vt * scale;
      const vrScaled = vr * scale;

      const rawRelYaw = planarSpeed > 0.4 ? Math.atan2(vr, vt) : 0;
      state.yaw = THREE.MathUtils.clamp(rawRelYaw, -cfg.maxYaw, cfg.maxYaw);
      const cosY = Math.cos(state.yaw);
      const sinY = Math.sin(state.yaw);

      state.vForward = vtScaled * cosY + vrScaled * sinY;
      state.vLateral = -vtScaled * sinY + vrScaled * cosY;

      const minLat = limits.left + cfg.railMargin;
      const maxLat = limits.right - cfg.railMargin;
      state.s = state.sApprox;
      state.lateral =
        minLat <= maxLat
          ? THREE.MathUtils.clamp(lateral, minLat, maxLat)
          : (minLat + maxLat) * 0.5;

      state.landingStartQuat.copy(state.worldQuat);
      state.landingAlignTimer = cfg.landingAlignTime;
      state.mode = 'grounded';
      state.airtime = 0;
      state.fallTimer = 0;

      const kappaUp = course.getCurvatureUpAt(state.s);
      state.normalForce = state.vForward * state.vForward * kappaUp + cfg.gravity * _frame.up.y;
      state.longAccel = -impactSpeed * 1.4;

      events.push({ type: 'landed', airtime, impactSpeed });
      return;
    }

    // Fall detection (too deep below track or missed deck laterally past the gap)
    const minTrackY = course.getBounds().min.y;
    const belowTrack =
      state.worldPos.y < _frame.position.y - cfg.fallKillDepth ||
      state.worldPos.y < minTrackY - cfg.fallKillDepth;
    const missedDeckAfterGap =
      !inGap &&
      state.sApprox >= state.lastGapEndS &&
      !insideDeckWidth &&
      heightAbove <= cfg.rideHeight + 0.2;

    if (belowTrack || missedDeckAfterGap) {
      state.mode = 'falling';
      state.fallTimer = 0;
      events.push({ type: 'fell' });
    }
    return;
  }

  // mode === 'falling'
  state.fallTimer += dt;
  state.worldVel.y -= cfg.gravity * dt;
  state.worldPos.addScaledVector(state.worldVel, dt);

  // Keep car visible on the giant wooden floor during fall wait instead of clipping under y = 0
  if (state.worldPos.y < 0.02) {
    state.worldPos.y = 0.02;
    if (state.worldVel.y < 0) {
      state.worldVel.y = -state.worldVel.y * 0.18;
    }
    const floorDamp = Math.exp(-3.5 * dt);
    state.worldVel.x *= floorDamp;
    state.worldVel.z *= floorDamp;
  }

  state.wheelSpin += (state.vForward / wheelRadius) * dt * Math.exp(-state.fallTimer * 1.5);
  state.normalForce = 0;

  if (state.fallTimer >= cfg.respawnDelay) {
    events.push({ type: 'respawn' });
  }
}
