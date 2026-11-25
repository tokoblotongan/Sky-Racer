// src/render/chaseCamera.ts

import * as THREE from 'three';
import { CONFIG } from '../config';
import type { CarPose, CarState } from '../core/physics';

interface ScalarSpringState {
  value: number;
  velocity: number;
}

const _targetPos = new THREE.Vector3();
const _targetLook = new THREE.Vector3();
const _lookDir = new THREE.Vector3();
const _rolledUp = new THREE.Vector3();
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

export class ChaseCamera {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly currentPos = new THREE.Vector3();
  private readonly posVelocity = new THREE.Vector3();
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

  snapTo(pose: CarPose): void {
    const cfg = CONFIG.camera;

    this.currentPos
      .copy(pose.position)
      .addScaledVector(pose.tangent, -cfg.distance)
      .addScaledVector(pose.up, cfg.height);
    this.posVelocity.set(0, 0, 0);

    this.currentLook
      .copy(pose.position)
      .addScaledVector(pose.tangent, cfg.lookAheadDistance)
      .addScaledVector(pose.up, cfg.lookHeightOffset);
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

  update(pose: CarPose, carState: CarState, realDt: number): void {
    const cfg = CONFIG.camera;
    const dt = THREE.MathUtils.clamp(realDt, 1e-4, CONFIG.sim.maxFrameDt);

    // 1. Target position behind and above car along local track normal
    _targetPos
      .copy(pose.position)
      .addScaledVector(pose.tangent, -cfg.distance)
      .addScaledVector(pose.up, cfg.height);
    smoothDampVector3(this.currentPos, _targetPos, this.posVelocity, cfg.positionSmoothTime, dt);

    // 2. Target lookAt ahead of car
    _targetLook
      .copy(pose.position)
      .addScaledVector(pose.tangent, cfg.lookAheadDistance)
      .addScaledVector(pose.up, cfg.lookHeightOffset);
    smoothDampVector3(this.currentLook, _targetLook, this.lookVelocity, cfg.lookSmoothTime, dt);

    // 3. Blend camera up vector smoothly toward track up (loop & banking safe)
    const upBlendAlpha = 1 - Math.exp(-cfg.upBlendSpeed * dt);
    _upDeltaQuat.setFromUnitVectors(this.smoothedUp, pose.up);
    _identityQuat.identity().slerp(_upDeltaQuat, upBlendAlpha);
    this.smoothedUp.applyQuaternion(_identityQuat).normalize();

    // 4. Subtle dynamic camera roll from steering and yaw drift
    const yawNorm = carState.yaw / CONFIG.physics.maxYaw;
    const combinedTurn = THREE.MathUtils.clamp(
      carState.steer + yawNorm * cfg.rollYawWeight,
      -1.35,
      1.35,
    );
    const targetRollRad = combinedTurn * THREE.MathUtils.degToRad(cfg.rollFromSteer);
    const currentRollRad = smoothDampScalar(this.rollSpring, targetRollRad, cfg.rollSmoothTime, dt);

    _lookDir.subVectors(this.currentLook, this.currentPos).normalize();
    _rollQuat.setFromAxisAngle(_lookDir, currentRollRad);
    _rolledUp.copy(this.smoothedUp).applyQuaternion(_rollQuat).normalize();

    // 5. Speed-driven FOV widening (plus future boost bonus)
    const speedRatio = THREE.MathUtils.clamp(
      Math.abs(carState.vForward) / CONFIG.physics.maxSpeed,
      0,
      1,
    );
    const targetFov = cfg.fovBase + cfg.fovMaxExtra * Math.pow(speedRatio, 1.15) + this.boostFovBonusDeg;
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
