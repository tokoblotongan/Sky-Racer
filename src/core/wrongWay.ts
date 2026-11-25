// src/core/wrongWay.ts

import { CONFIG } from '../config';
import type { TrackFrame } from './course';
import type { CarPose, CarState } from './physics';
import type { RacePhase } from './state';

export interface WrongWayCheckInput {
  carState: CarState;
  carPose: CarPose;
  trackFrame: TrackFrame;
  isClosed: boolean;
  phase: RacePhase;
}

export interface WrongWayDetector {
  update: (input: WrongWayCheckInput, dt: number) => boolean;
  reset: () => void;
  isWrongWay: () => boolean;
}

export function createWrongWayDetector(): WrongWayDetector {
  let wrongTimer = 0;
  let clearTimer = 0;
  let active = false;

  function reset(): void {
    wrongTimer = 0;
    clearTimer = 0;
    active = false;
  }

  function update(input: WrongWayCheckInput, dt: number): boolean {
    const { carState, carPose, trackFrame, isClosed, phase } = input;
    const cfg = CONFIG.wrongWay;

    if (!isClosed || phase !== 'RACING' || carState.mode === 'falling') {
      reset();
      return false;
    }

    let speed = 0;
    let motionDot = 1;
    const headingDot = carPose.tangent.dot(trackFrame.tangent);

    if (carState.mode === 'grounded') {
      speed = Math.hypot(carState.vForward, carState.vLateral);
      if (speed > 1e-4) {
        const cosY = Math.cos(carState.yaw);
        const sinY = Math.sin(carState.yaw);
        const vTrackTangent = carState.vForward * cosY - carState.vLateral * sinY;
        motionDot = vTrackTangent / speed;
      }
    } else {
      speed = carState.worldVel.length();
      if (speed > 1e-4) {
        motionDot = carState.worldVel.dot(trackFrame.tangent) / speed;
      }
    }

    const effectiveDot = Math.min(motionDot, headingDot);
    const movingWrong =
      carState.mode === 'grounded'
        ? speed >= cfg.minSpeed && ((motionDot < cfg.dotThreshold && carState.vForward < -0.5) || headingDot < cfg.dotThreshold)
        : speed >= cfg.minSpeed && effectiveDot < cfg.dotThreshold;

    if (movingWrong) {
      wrongTimer += dt;
      clearTimer = 0;
      if (wrongTimer >= cfg.triggerSeconds) {
        active = true;
      }
    } else {
      wrongTimer = 0;
      if (active) {
        clearTimer += dt;
        if (clearTimer >= cfg.clearSeconds) {
          active = false;
        }
      } else {
        clearTimer = 0;
      }
    }

    return active;
  }

  function isWrongWay(): boolean {
    return active;
  }

  return {
    update,
    reset,
    isWrongWay,
  };
}
