// src/render/chaseCamera.ts

import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Route, TrackFrame } from '../core/routes';
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
const _shakePos = new THREE.Vector3();
const _shakeLook = new THREE.Vector3();
const _shakeRight = new THREE.Vector3();

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

function resolveEffectiveVerticalFov(baseVerticalFov: number, aspect: number): number {
  if (aspect >= 1 || !Number.isFinite(aspect) || aspect <= 0) {
    return baseVerticalFov;
  }
  const cfg = CONFIG.camera;
  const minHalfHFov = THREE.MathUtils.degToRad(cfg.minHorizontalFovDeg) * 0.5;
  const requiredVFov = THREE.MathUtils.radToDeg(
    2 * Math.atan(Math.tan(minHalfHFov) / Math.max(0.25, aspect)),
  );
  return Math.min(cfg.maxPortraitVerticalFovDeg, Math.max(baseVerticalFov, requiredVFov));
}

function computeCourseCameraTargets(
  pose: CarPose,
  carState: CarState,
  course: Route,
  aspect = 1.77,
): void {
  const cfg = CONFIG.camera;
  const totalLen = course.getLength();
  const isClosed = course.isClosed();
  const trackS = carState.mode === 'grounded' ? carState.s : carState.sApprox;

  course.getFrameAt(trackS, _camFrame);
  const widthRatio = _camFrame.width / CONFIG.course.defaultWidth;
  const widthScale = 1 + Math.max(0, widthRatio - 1) * cfg.widthScale;
  const carScale = CONFIG.car.visualScale;
  const portraitDistScale = aspect < 1 ? cfg.portraitDistanceScale : 1;
  const camDistance = cfg.distance * widthScale * carScale * portraitDistScale;
  const camHeight = cfg.height * widthScale * carScale;

  let lateral = carState.lateral;
  let extraAirHeight = 0;

  if (carState.mode !== 'grounded') {
    _relAir.subVectors(pose.position, _camFrame.position);
    lateral = THREE.MathUtils.clamp(
      _relAir.dot(_camFrame.right),
      -_camFrame.width * 0.85,
      _camFrame.width * 0.85,
    );
    extraAirHeight = Math.max(0, _relAir.dot(_camFrame.up)) * cfg.airHeightFollowFactor;
  }

  const camS = trackS - camDistance;
  course.getFrameAt(camS, _camFrame);
  _targetPos.copy(_camFrame.position);
  if (!isClosed && camS < 0) {
    _targetPos.addScaledVector(_camFrame.tangent, camS);
  }
  _targetPos
    .addScaledVector(_camFrame.up, camHeight + extraAirHeight)
    .addScaledVector(_camFrame.right, lateral * cfg.lateralFollowFactor);

  if (carState.mode === 'grounded') {
    const lookS = trackS + cfg.lookAheadDistance;
    course.getFrameAt(lookS, _lookFrame);
    _targetLook.copy(_lookFrame.position);
    if (!isClosed && lookS > totalLen) {
      _targetLook.addScaledVector(_lookFrame.tangent, lookS - totalLen);
    }
    _targetLook
      .addScaledVector(_lookFrame.up, cfg.lookHeightOffset * carScale)
      .addScaledVector(_lookFrame.right, lateral * cfg.lateralFollowFactor * 0.5);
  } else {
    const lookS = trackS + cfg.lookAheadDistance * 0.65;
    course.getFrameAt(lookS, _lookFrame);
    _targetLook.copy(_lookFrame.position);
    if (!isClosed && lookS > totalLen) {
      _targetLook.addScaledVector(_lookFrame.tangent, lookS - totalLen);
    }
    _targetLook
      .addScaledVector(_lookFrame.up, cfg.lookHeightOffset * carScale)
      .lerp(pose.position, 0.55);
  }
}

export type CameraMode = 'title' | 'chase' | 'finish';

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
  private mode: CameraMode = 'chase';
  private titleOrbitAngle = 0.55;
  private titleTransitionTimer = 0;
  private finishOrbitAngle = 0;
  private finishOrbitInitialized = false;
  private shakeTimer = 0;
  private shakeDuration = 0.28;
  private shakeAmplitude = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.fovSpring = { value: CONFIG.camera.fovBase, velocity: 0 };
  }

  setMode(mode: CameraMode): void {
    if (this.mode === 'title' && mode === 'chase') {
      this.titleTransitionTimer = CONFIG.camera.titleToChaseBlendDuration;
      this.posVelocity.set(0, 0, 0);
      this.lookVelocity.set(0, 0, 0);
    }
    if (mode === 'finish' && this.mode !== 'finish') {
      this.finishOrbitInitialized = false;
    }
    this.mode = mode;
  }

  setBoostFovBonus(bonusDeg: number): void {
    this.boostFovBonusDeg = bonusDeg;
  }

  addShake(amplitude: number, durationSeconds = CONFIG.polish.shake.durationSeconds): void {
    if (amplitude <= 0 || durationSeconds <= 0) {
      return;
    }
    if (this.shakeTimer <= 0 || amplitude >= this.shakeAmplitude) {
      this.shakeAmplitude = amplitude;
    } else {
      this.shakeAmplitude = Math.min(amplitude * 1.35, this.shakeAmplitude + amplitude * 0.4);
    }
    this.shakeDuration = Math.max(0.05, durationSeconds);
    this.shakeTimer = this.shakeDuration;
  }

  clearShake(): void {
    this.shakeTimer = 0;
    this.shakeAmplitude = 0;
  }

  private computeTitleOrbitTargets(pose: CarPose): void {
    const carScale = CONFIG.car.visualScale;
    const orbitR = CONFIG.race.titleOrbitRadius * carScale;
    const orbitH = CONFIG.race.titleOrbitHeight * carScale;
    _targetPos.set(
      pose.position.x + Math.sin(this.titleOrbitAngle) * orbitR,
      pose.position.y + orbitH,
      pose.position.z + Math.cos(this.titleOrbitAngle) * orbitR,
    );
    _targetLook.copy(pose.position).addScaledVector(_worldUp, 0.72 * carScale);
  }

  private computeFinishOrbitTargets(pose: CarPose): void {
    const carScale = CONFIG.car.visualScale;
    const orbitR = CONFIG.camera.finishOrbitRadius * carScale;
    const orbitH = CONFIG.camera.finishOrbitHeight * carScale;
    _targetPos.set(
      pose.position.x + Math.sin(this.finishOrbitAngle) * orbitR,
      pose.position.y + orbitH,
      pose.position.z + Math.cos(this.finishOrbitAngle) * orbitR,
    );
    _targetLook.copy(pose.position).addScaledVector(_worldUp, 0.85 * carScale);
  }

  snapTo(pose: CarPose, carState: CarState, course: Route): void {
    const cfg = CONFIG.camera;
    this.titleTransitionTimer = 0;

    if (this.mode === 'title') {
      this.computeTitleOrbitTargets(pose);
      this.smoothedUp.copy(_worldUp);
    } else {
      computeCourseCameraTargets(pose, carState, course, this.camera.aspect);
      this.smoothedUp.copy(pose.up).normalize();
    }

    this.currentPos.copy(_targetPos);
    this.lastSafePos.copy(_targetPos);
    this.posVelocity.set(0, 0, 0);

    this.currentLook.copy(_targetLook);
    this.lookVelocity.set(0, 0, 0);

    this.rollSpring.value = 0;
    this.rollSpring.velocity = 0;
    this.clearShake();

    const baseFov = cfg.fovBase + this.boostFovBonusDeg;
    this.fovSpring.value = baseFov;
    this.fovSpring.velocity = 0;
    const targetFov = resolveEffectiveVerticalFov(baseFov, this.camera.aspect);
    if (Math.abs(this.camera.fov - targetFov) > 1e-4) {
      this.camera.fov = targetFov;
      this.camera.updateProjectionMatrix();
    }

    this.camera.position.copy(this.currentPos);
    this.camera.up.copy(this.smoothedUp);
    this.camera.lookAt(this.currentLook);
  }

  update(pose: CarPose, carState: CarState, course: Route, realDt: number): void {
    const cfg = CONFIG.camera;
    const dt = THREE.MathUtils.clamp(realDt, 1e-4, CONFIG.sim.maxFrameDt);

    if (this.mode === 'title') {
      this.titleOrbitAngle += CONFIG.race.titleOrbitSpeed * dt;
      this.computeTitleOrbitTargets(pose);
      this.currentPos.copy(_targetPos);
      this.lastSafePos.copy(_targetPos);
      this.currentLook.copy(_targetLook);
      this.smoothedUp.copy(_worldUp);
      _rolledUp.copy(_worldUp);
    } else if (this.mode === 'finish') {
      if (!this.finishOrbitInitialized) {
        const dx = this.currentPos.x - pose.position.x;
        const dz = this.currentPos.z - pose.position.z;
        this.finishOrbitAngle = Math.hypot(dx, dz) > 0.2 ? Math.atan2(dx, dz) : 0.4;
        this.finishOrbitInitialized = true;
      }
      this.finishOrbitAngle += cfg.finishOrbitSpeed * dt;
      this.computeFinishOrbitTargets(pose);
      smoothDampVector3(
        this.currentPos,
        _targetPos,
        this.posVelocity,
        cfg.finishOrbitSmoothTime,
        dt,
      );
      smoothDampVector3(
        this.currentLook,
        _targetLook,
        this.lookVelocity,
        cfg.finishOrbitSmoothTime * 0.75,
        dt,
      );

      const upBlendAlpha = 1 - Math.exp(-cfg.upBlendSpeed * dt);
      _upDeltaQuat.setFromUnitVectors(this.smoothedUp, _worldUp);
      _identityQuat.identity().slerp(_upDeltaQuat, upBlendAlpha);
      this.smoothedUp.applyQuaternion(_identityQuat).normalize();
      const currentRollRad = smoothDampScalar(this.rollSpring, 0, cfg.rollSmoothTime, dt);
      _lookDir.subVectors(this.currentLook, this.currentPos).normalize();
      _rollQuat.setFromAxisAngle(_lookDir, currentRollRad);
      _rolledUp.copy(this.smoothedUp).applyQuaternion(_rollQuat).normalize();
    } else if (carState.mode === 'falling') {
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
      let activePosSmooth: number = cfg.positionSmoothTime;
      let activeLookSmooth: number = cfg.lookSmoothTime;
      if (this.titleTransitionTimer > 0) {
        this.titleTransitionTimer = Math.max(0, this.titleTransitionTimer - dt);
        const blendFrac =
          this.titleTransitionTimer / Math.max(0.01, cfg.titleToChaseBlendDuration);
        activePosSmooth = THREE.MathUtils.lerp(
          cfg.positionSmoothTime,
          cfg.titleToChaseSmoothTime,
          blendFrac,
        );
        activeLookSmooth = THREE.MathUtils.lerp(
          cfg.lookSmoothTime,
          cfg.titleToChaseSmoothTime * 0.75,
          blendFrac,
        );
      }

      computeCourseCameraTargets(pose, carState, course, this.camera.aspect);
      smoothDampVector3(this.currentPos, _targetPos, this.posVelocity, activePosSmooth, dt);
      smoothDampVector3(this.currentLook, _targetLook, this.lookVelocity, activeLookSmooth, dt);

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
    const smoothedBaseFov = smoothDampScalar(this.fovSpring, targetFov, cfg.fovSmoothTime, dt);
    const nextFov = resolveEffectiveVerticalFov(smoothedBaseFov, this.camera.aspect);
    if (Math.abs(this.camera.fov - nextFov) > 1e-3) {
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
    }

    _shakePos.copy(this.currentPos);
    _shakeLook.copy(this.currentLook);
    if (this.shakeTimer > 0 && this.mode === 'chase') {
      this.shakeTimer = Math.max(0, this.shakeTimer - dt);
      const decay = this.shakeTimer / Math.max(1e-4, this.shakeDuration);
      const env = decay * decay * this.shakeAmplitude;
      const phase = (this.shakeDuration - this.shakeTimer) * CONFIG.polish.shake.frequencyHz * Math.PI * 2;
      _lookDir.subVectors(this.currentLook, this.currentPos).normalize();
      _shakeRight.crossVectors(_lookDir, _rolledUp).normalize();
      const offsetX = Math.sin(phase) * env;
      const offsetY = Math.cos(phase * 1.37) * env * 0.72;
      _shakePos.addScaledVector(_shakeRight, offsetX).addScaledVector(_rolledUp, offsetY);
      _shakeLook.addScaledVector(_shakeRight, offsetX * 0.55).addScaledVector(_rolledUp, offsetY * 0.55);
    }

    this.camera.position.copy(_shakePos);
    this.camera.up.copy(_rolledUp);
    this.camera.lookAt(_shakeLook);
  }
}
