// src/core/ai/driver.ts

import * as THREE from 'three';
import { CONFIG, type AiRivalConfig } from '../../config';
import type { CarInput } from '../../input/controls';
import type { Course } from '../course';
import type { CarState } from '../physics';
import type { Route, TrackFrame } from '../routes';
import { computeAvoidance, type AvoidanceAdjustment } from './avoidance';
import {
  getCourseAiProfile,
  type CourseAiProfile,
  type SampledLinePoint,
} from './racingLine';
import type { RecoveryState } from './recovery';
import type { SeededRng } from './rng';
import {
  createShortcutTracker,
  type ShortcutGuidance,
  type ShortcutTracker,
} from './shortcutDecision';

export interface AiDriverContext {
  readonly carIndex: number;
  readonly rival: AiRivalConfig;
  readonly rng: SeededRng;
  readonly recovery: RecoveryState;
  readonly shortcutTracker: ShortcutTracker;
  shortcutAttempts: number;
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
const _lookFrame: TrackFrame = {
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
const _sampledNow: SampledLinePoint = {
  targetLateral: 0,
  maxSpeed: 40,
  minSafeSpeed: 0,
  curvature: 0,
};
const _sampledAhead: SampledLinePoint = {
  targetLateral: 0,
  maxSpeed: 40,
  minSafeSpeed: 0,
  curvature: 0,
};
const _avoidance: AvoidanceAdjustment = {
  lateralOffset: 0,
  speedMultiplier: 1,
  draftBonus: 0,
};
const _shortcutGuidance: ShortcutGuidance = {
  overrideLateral: null,
  takingShortcut: false,
};

export function createIdleInput(): CarInput {
  return {
    throttle: 0,
    brake: 0,
    steer: 0,
    handbrake: false,
    resetPressed: false,
    restartPressed: false,
    confirmPressed: false,
    mutePressed: false,
  };
}

export function computeAiDriverInput(
  ctx: AiDriverContext,
  cars: readonly CarState[],
  course: Course,
  difficultyMultiplier: number,
  rubberBandFactor: number,
  dt: number,
  outInput: CarInput,
): CarInput {
  const car = cars[ctx.carIndex];
  if (!car || car.mode === 'falling') {
    outInput.throttle = 0;
    outInput.brake = 0;
    outInput.steer = 0;
    outInput.handbrake = false;
    outInput.resetPressed = false;
    return outInput;
  }

  // Respect per-car seeded start reaction delay right after GO
  if (ctx.recovery.reactionDelayLeft > 0) {
    outInput.throttle = 0;
    outInput.brake = 0;
    outInput.steer = 0;
    outInput.handbrake = false;
    outInput.resetPressed = false;
    return outInput;
  }

  const route: Route = course.getRoute(car.routeId);
  const profile: CourseAiProfile = getCourseAiProfile(course);
  const activeS = car.mode === 'grounded' ? car.s : car.sApprox;

  let lateral = car.lateral;
  let yaw = car.yaw;
  if (car.mode !== 'grounded') {
    route.getFrameAt(activeS, _frame);
    _relPos.subVectors(car.worldPos, _frame.position);
    lateral = _relPos.dot(_frame.right);
    _carForward.set(0, 0, -1).applyQuaternion(car.worldQuat).normalize();
    const fT = _carForward.dot(_frame.tangent);
    const fR = _carForward.dot(_frame.right);
    yaw = Math.atan2(fR, Math.max(0.1, fT));
  } else {
    route.getFrameAt(activeS, _frame);
  }

  // 1. Sample racing line ahead with speed-dependent lookahead
  const speed = Math.max(0, car.vForward);
  const lookaheadDist = CONFIG.ai.lookahead.base + CONFIG.ai.lookahead.perSpeed * speed;
  const lookS = activeS + lookaheadDist;

  profile.sampleAt(route.routeId, activeS, _sampledNow);
  profile.sampleAt(route.routeId, lookS, _sampledAhead);
  route.getFrameAt(lookS, _lookFrame);

  // Combine racing-line apex preference with rival's subtle preferred lane offset
  let desiredLateral = THREE.MathUtils.clamp(
    _sampledAhead.targetLateral + ctx.rival.preferredOffset * 0.45,
    -(_lookFrame.width * 0.5 - CONFIG.ai.racingLine.railSafeMargin),
    _lookFrame.width * 0.5 - CONFIG.ai.racingLine.railSafeMargin,
  );

  // 2. Aim toward upcoming boost pad weighted by rival boostUsage
  const padLook = CONFIG.ai.racingLine.padLookaheadMeters * (0.45 + 0.55 * ctx.rival.boostUsage);
  const boostPad = profile.findBestBoostPad(route.routeId, activeS, padLook, lateral);
  if (boostPad) {
    const padWeight = CONFIG.ai.racingLine.padPullWeight * ctx.rival.boostUsage;
    desiredLateral = THREE.MathUtils.lerp(desiredLateral, boostPad.lateral, padWeight);
  }

  // 3. Shortcut decision and entry/merge guidance
  ctx.shortcutTracker.evaluate(
    car,
    route,
    course,
    ctx.rival,
    difficultyMultiplier,
    ctx.rng,
    _shortcutGuidance,
    () => {
      ctx.shortcutAttempts++;
    },
  );
  if (_shortcutGuidance.overrideLateral !== null) {
    desiredLateral = _shortcutGuidance.overrideLateral;
  }

  // 4. Obstacle avoidance and slipstream check
  computeAvoidance(ctx.carIndex, cars, course, route, ctx.rival, _avoidance);
  if (Math.abs(_avoidance.lateralOffset) > 1e-3 && !_shortcutGuidance.takingShortcut) {
    desiredLateral += _avoidance.lateralOffset * 0.85;
  }

  // Keep steering target strictly inside physical rail limits (unless crossing open shortcut gap)
  if (!_shortcutGuidance.takingShortcut) {
    const limitsNow = route.getRailLimits(lookS);
    const steerMargin = CONFIG.physics.railInnerOffset + CONFIG.car.carHalfWidth + 0.45;
    const minLat = limitsNow.left + steerMargin;
    const maxLat = limitsNow.right - steerMargin;
    if (minLat <= maxLat) {
      desiredLateral = THREE.MathUtils.clamp(desiredLateral, minLat, maxLat);
    }
  }

  // 5. Pure pursuit heading error in track coordinates
  const latError = desiredLateral - lateral;
  const targetYaw = Math.atan2(latError, Math.max(6.0, lookaheadDist));
  const lookAngleDelta = Math.atan2(
    _lookFrame.tangent.dot(_frame.right),
    Math.max(0.1, _lookFrame.tangent.dot(_frame.tangent)),
  );
  const combinedHeadingErr = targetYaw + lookAngleDelta * 0.35 - yaw;

  // Compensate for highSpeedSteerLimit in physics.ts so pure pursuit delivers true angular authority
  const speedNorm = THREE.MathUtils.clamp(speed / Math.max(1, CONFIG.physics.maxSpeed), 0, 1);
  const steerLimit = THREE.MathUtils.lerp(1, CONFIG.input.highSpeedSteerLimit, speedNorm);
  const rawSteerCmd = (combinedHeadingErr * 2.25) / Math.max(0.25, steerLimit);
  outInput.steer = THREE.MathUtils.clamp(rawSteerCmd, -1, 1);

  // 6. Longitudinal PI speed controller with pace calibration, rubber band & critical loop/jump floor
  const rivalPaceSpread = 0.94 + 0.06 * ctx.rival.skill;
  const combinedSkill = rivalPaceSpread * difficultyMultiplier;
  const refCruise =
    difficultyMultiplier >= 0.99
      ? Math.max(CONFIG.ai.cruiseReferenceSpeed, CONFIG.physics.maxSpeed * 0.96)
      : CONFIG.ai.cruiseReferenceSpeed;
  const paceCap =
    refCruise *
    combinedSkill *
    rubberBandFactor *
    (1 + _avoidance.draftBonus);

  const cornerTarget = _sampledAhead.maxSpeed * (0.86 + 0.14 * ctx.rival.skill * difficultyMultiplier);
  const requiredMin = Math.max(_sampledNow.minSafeSpeed, _sampledAhead.minSafeSpeed);

  let targetSpeed = Math.min(paceCap, cornerTarget) * _avoidance.speedMultiplier;
  if (requiredMin > 0) {
    // Ensure loops and gap jumps stay above critical safety speed regardless of rubber band / skill
    targetSpeed = Math.max(targetSpeed, requiredMin);
  }
  if (car.boostTimeLeft > 0) {
    targetSpeed = Math.max(
      targetSpeed,
      Math.min(CONFIG.physics.maxSpeed * CONFIG.boost.maxSpeedMultiplier, paceCap * 1.15),
    );
  }

  const speedErr = targetSpeed - car.vForward;
  const piCfg = CONFIG.ai.speedPI;
  ctx.recovery.speedIntegral = THREE.MathUtils.clamp(
    ctx.recovery.speedIntegral + speedErr * dt,
    -piCfg.maxIntegral,
    piCfg.maxIntegral,
  );

  const controlSignal = piCfg.kp * speedErr + piCfg.ki * ctx.recovery.speedIntegral;

  if (car.vForward < 4 && targetSpeed > 4) {
    // Clean full launch from standstill
    outInput.throttle = 1;
    outInput.brake = 0;
  } else if (controlSignal >= -0.08) {
    outInput.throttle = THREE.MathUtils.clamp(controlSignal + 0.12, 0, 1);
    outInput.brake = 0;
  } else {
    outInput.throttle = 0;
    outInput.brake = THREE.MathUtils.clamp((-controlSignal - 0.08) * 0.9, 0, 1);
  }

  outInput.handbrake = false;
  outInput.resetPressed = false;
  return outInput;
}

export function createAiDriverContext(
  carIndex: number,
  rival: AiRivalConfig,
  rng: SeededRng,
  recovery: RecoveryState,
): AiDriverContext {
  return {
    carIndex,
    rival,
    rng,
    recovery,
    shortcutTracker: createShortcutTracker(),
    shortcutAttempts: 0,
  };
}
