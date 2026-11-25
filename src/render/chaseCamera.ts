// src/render/chaseCamera.ts

import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Course, TrackFrame } from '../core/course';
import type { CarPose, CarState } from '../core/physics';

interface ScalarSpringState {
  value: number;
  velocity: number;
}

const _camFrame: TrackFrame = {
  s: 0,
  position: new THREE.Vector3(),
  tangent: new THREE.Vector3(),
  up: new THREE.Vector3(),
  right: new THREE.Vector3(),
  width: CONFIG.course.trackWidth,
  bank: 0,
};

const _lookFrame: TrackFrame = {
  s: 0,
  position: new THREE.Vector3(),
  tangent: new THREE.Vector3(),
  up: new THREE.Vector3(),
  right: new THREE.Vector3(),
  width: CONFIG.course.trackWidth,
  bank: 0,
};

const _targetPos = new THREE.Vector3();
const _targetLook = new THREE.Vector3();
const _relAir = new THREE.Vector3();
const _lookDir = new THREE.Vector3();
const _rolledUp = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);
const _upDeltaQuat = new THREE.Quaternion();
const _identityQuat = new THREE.Quaternion();
const _rollQuat = new THREE.Quaternion();

function smoothDampComponent(
  current: number,
  target: number,
  velocity: number,
  smoothTime: number,
  dt: number,
): [number, number] {
  const safeSmooth = Math.max(0.0001, smoothTime);
  const omega = 2 / safeSmooth;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;
  const temp = (velocity + omega * change) * dt;
  const nextVel = (velocity - omega * temp) * exp;
  const nextVal = target + (change + temp) * exp;
  return [nextVal, nextVel];
}

function smoothDampVector3(
  current: THREE.Vector3,
  target: THREE.Vector3,
  velocity: THREE.Vector3,
  smoothTime: number,
  dt: number,
): void {
  const [nx, vx] = smoothDampComponent(current.x, target.x, velocity.x, smoothTime, dt);
  const [ny, vy] = smoothDampComponent(current.y, target.y, velocity.y, smoothTime, dt);
  const [nz, vz] = smoothDampComponent(current.z, target.z, velocity.z, smoothTime, dt);
  current.set(nx, ny, nz);
  velocity.set(vx, vy, vz);
}

function smoothDampScalar(
  state: ScalarSpringState,
  target: number,
  smoothTime: number,
  dt: number,
): number {
  const [nextVal, nextVel] = smoothDampComponent(
    state.value,
    target,
    state.velocity,
    smoothTime,
    dt,
  );
  state.value = nextVal;
  state.velocity = nextVel;
  return nextVal;
}

function computeCourseCameraTargets(
  pose: CarPose,
  carState: CarState,
  course: Course,
): void {
  const cfg = CONFIG.camera;
  const totalLen = course.getLength();
  const trackS = carState.mode === 'grounded' ? carState.s : carState.sApprox;

  let lateral = carState.lateral;
  let extraAirHeight = 0;

  if (carState.mode !== 'grounded') {
    course.getFrameAt(trackS, _camFrame);
    _relAir.subVectors(pose.position, _camFrame.position);
    lateral = THREE.MathUtils.clamp(
      _relAir.dot(_camFrame.right),
      -_camFrame.width * 0.85,
      _camFrame.width * 0.85,
    );
    extraAirHeight = Math.max(0, _relAir.dot(_camFrame.up)) * cfg.airHeightFollowFactor;
  }

  const camS = trackS - cfg.distance;
  course.getFrameAt(camS, _camFrame);
  _targetPos.copy(_camFrame.position);
  if (camS < 0) {
    _targetPos.addScaledVector(_camFrame.tangent, camS);
  }
  _targetPos
    .addScaledVector(_camFrame.up, cfg.height + extraAirHeight)
    .addScaledVector(_camFrame.right, lateral * cfg.lateralFollowFactor);

  if (carState.mode === 'grounded') {
    const lookS = trackS + cfg.lookAheadDistance;
    course.getFrameAt(lookS, _lookFrame);
    _targetLook.copy(_lookFrame.position);
    if (lookS > totalLen) {
      _targetLook.addScaledVector(_lookFrame.tangent, lookS - totalLen);
    }
    _targetLook
      .addScaledVector(_lookFrame.up, cfg.lookHeightOffset)
      .addScaledVector(_lookFrame.right, lateral * cfg.lateralFollowFactor * 0.5);
  } else {
    const lookS = trackS + cfg.lookAheadDistance * 0.65;
    course.getFrameAt(lookS, _lookFrame);
    _targetLook.copy(_lookFrame.position);
    if (lookS > totalLen) {
      _targetLook.addScaledVector(_lookFrame.tangent, lookS - totalLen);
    }
    _targetLook
      .addScaledVector(_lookFrame.up, cfg.lookHeightOffset)
      .lerp(pose.position, 0.55);
  }
}

export class ChaseCamera {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly currentPos = new THREE.Vector3();
  private readonly posVelocity = new THREE.Vector3();
  private readonly lastSafePos = new THREE.Vector3();
  private readonly currentLook = new THREE.Vector3();
  private readonly lookVelocity = new THREE.Vector3();
  private readonly smoothedUp = new THREE.Vector3(0, 1, 0);

  private readonly fovSpring: ScalarSpringState;
  private readonly rollSpring: ScalarSpringState = { value: 0, velocity: 0 };
  private boostFovBonusDeg = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.fovSpring = { value: CONFIG.camera.fovBase, velocity: 0 };
  }

  setBoostFovBonus(bonusDeg: number): void {
    this.boostFovBonusDeg = bonusDeg;
  }

  snapTo(pose: CarPose, carState: CarState, course: Course): void {
    const cfg = CONFIG.camera;
    computeCourseCameraTargets(pose, carState, course);

    this.currentPos.copy(_targetPos);
    this.lastSafePos.copy(_targetPos);
    this.posVelocity.set(0, 0, 0);

    this.currentLook.copy(_targetLook);
    this.lookVelocity.set(0, 0, 0);

    this.smoothedUp.copy(pose.up).normalize();
    this.rollSpring.value = 0;
    this.rollSpring.velocity = 0;

    const targetFov = cfg.fovBase + this.boostFovBonusDeg;
    this.fovSpring.value = targetFov;
    this.fovSpring.velocity = 0;
    if (Math.abs(this.camera.fov - targetFov) > 1e-4) {
      this.camera.fov = targetFov;
      this.camera.updateProjectionMatrix();
    }

    this.camera.position.copy(this.currentPos);
    this.camera.up.copy(this.smoothedUp);
    this.camera.lookAt(this.currentLook);
  }

  update(pose: CarPose, carState: CarState, course: Course, realDt: number): void {
    const cfg = CONFIG.camera;
    const dt = THREE.MathUtils.clamp(realDt, 1e-4, CONFIG.sim.maxFrameDt);

    if (carState.mode === 'falling') {
      // Freeze camera at last safe height above track and keep looking at the falling car
      this.currentPos.copy(this.lastSafePos);
      this.posVelocity.set(0, 0, 0);
      smoothDampVector3(
        this.currentLook,
        pose.position,
        this.lookVelocity,
        cfg.fallingLookSmoothTime,
        dt,
      );

      const upBlendAlpha = 1 - Math.exp(-cfg.upBlendSpeed * dt);
      _upDeltaQuat.setFromUnitVectors(this.smoothedUp, _worldUp);
      _identityQuat.identity().slerp(_upDeltaQuat, upBlendAlpha);
      this.smoothedUp.applyQuaternion(_identityQuat).normalize();
      _rolledUp.copy(this.smoothedUp);
    } else {
      computeCourseCameraTargets(pose, carState, course);
      smoothDampVector3(this.currentPos, _targetPos, this.posVelocity, cfg.positionSmoothTime, dt);
      smoothDampVector3(this.currentLook, _targetLook, this.lookVelocity, cfg.lookSmoothTime, dt);

      const minSafeY = course.getBounds().min.y + 1.2;
      if (this.currentPos.y >= minSafeY) {
        this.lastSafePos.copy(this.currentPos);
      }

      const desiredUp = carState.mode === 'airborne' ? _worldUp : pose.up;
      const upBlendAlpha = 1 - Math.exp(-cfg.upBlendSpeed * dt);
      _upDeltaQuat.setFromUnitVectors(this.smoothedUp, desiredUp);
      _identityQuat.identity().slerp(_upDeltaQuat, upBlendAlpha);
      this.smoothedUp.applyQuaternion(_identityQuat).normalize();

      const yawNorm = carState.yaw / CONFIG.physics.maxYaw;
      const combinedTurn =
        carState.mode === 'grounded'
          ? THREE.MathUtils.clamp(carState.steer + yawNorm * cfg.rollYawWeight, -1.35, 1.35)
          : THREE.MathUtils.clamp(carState.steer * 0.4, -0.6, 0.6);
      const targetRollRad = combinedTurn * THREE.MathUtils.degToRad(cfg.rollFromSteer);
      const currentRollRad = smoothDampScalar(this.rollSpring, targetRollRad, cfg.rollSmoothTime, dt);

      _lookDir.subVectors(this.currentLook, this.currentPos).normalize();
      _rollQuat.setFromAxisAngle(_lookDir, currentRollRad);
      _rolledUp.copy(this.smoothedUp).applyQuaternion(_rollQuat).normalize();
    }

    const speedMag =
      carState.mode === 'grounded' ? Math.abs(carState.vForward) : carState.worldVel.length();
    const speedRatio = THREE.MathUtils.clamp(speedMag / CONFIG.physics.maxSpeed, 0, 1);
    const targetFov =
      cfg.fovBase + cfg.fovMaxExtra * Math.pow(speedRatio, 1.15) + this.boostFovBonusDeg;
    const nextFov = smoothDampScalar(this.fovSpring, targetFov, cfg.fovSmoothTime, dt);
    if (Math.abs(this.camera.fov - nextFov) > 1e-3) {
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
    }

    this.camera.position.copy(this.currentPos);
    this.camera.up.copy(_rolledUp);
    this.camera.lookAt(this.currentLook);
  }
}
