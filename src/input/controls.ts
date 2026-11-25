// src/input/controls.ts

import { CONFIG } from '../config';
import type { TouchControls } from './touch';

export interface CarInput {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
  resetPressed: boolean;
  restartPressed?: boolean;
  confirmPressed: boolean;
  mutePressed?: boolean;
}

export interface SampledCarInput extends CarInput {
  restartPressed: boolean;
  mutePressed: boolean;
}

export interface KeyboardControls {
  sample: (dt: number) => SampledCarInput;
  dispose: () => void;
}

const PREVENT_SCROLL_CODES = new Set([
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);

function approachExponential(current: number, target: number, rate: number, dt: number): number {
  const factor = 1 - Math.exp(-rate * dt);
  return current + (target - current) * factor;
}

export function createKeyboardControls(touchControls?: TouchControls | null): KeyboardControls {
  const pressed = new Set<string>();
  let resetQueued = false;
  let confirmQueued = false;
  let muteQueued = false;

  let kbThrottle = 0;
  let kbBrake = 0;
  let kbSteer = 0;
  let touchSteerSmoothed = 0;

  function onKeyDown(event: KeyboardEvent): void {
    if (PREVENT_SCROLL_CODES.has(event.code)) {
      event.preventDefault();
    }

    if (event.code === 'KeyR' && !event.repeat) {
      resetQueued = true;
    }

    if (event.code === 'KeyM' && !event.repeat) {
      muteQueued = true;
    }

    if ((event.code === 'Enter' || event.code === 'NumpadEnter') && !event.repeat) {
      event.preventDefault();
      confirmQueued = true;
    }

    pressed.add(event.code);
  }

  function onKeyUp(event: KeyboardEvent): void {
    pressed.delete(event.code);
  }

  function onWindowBlur(): void {
    pressed.clear();
  }

  window.addEventListener('keydown', onKeyDown, { passive: false });
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onWindowBlur);

  function sample(dt: number): SampledCarInput {
    const cfg = CONFIG.input;

    const gasTarget = pressed.has('KeyW') || pressed.has('ArrowUp') ? 1 : 0;
    const brakeTarget = pressed.has('KeyS') || pressed.has('ArrowDown') ? 1 : 0;

    const left = pressed.has('KeyA') || pressed.has('ArrowLeft') ? 1 : 0;
    const right = pressed.has('KeyD') || pressed.has('ArrowRight') ? 1 : 0;
    const steerTarget = right - left;

    const kbHandbrake = pressed.has('Space');

    kbThrottle = approachExponential(kbThrottle, gasTarget, cfg.throttleResponseRate, dt);
    kbBrake = approachExponential(kbBrake, brakeTarget, cfg.brakeResponseRate, dt);

    const isReleasing =
      Math.abs(steerTarget) <= 0.01 ||
      (Math.abs(kbSteer) > 0.01 && Math.sign(steerTarget) !== Math.sign(kbSteer));
    const rampTime = isReleasing ? cfg.steerReleaseTime : cfg.steerAttackTime;
    const maxSteerStep = dt / Math.max(0.001, rampTime);
    const steerDelta = steerTarget - kbSteer;
    if (Math.abs(steerDelta) <= maxSteerStep) {
      kbSteer = steerTarget;
    } else {
      kbSteer += Math.sign(steerDelta) * maxSteerStep;
    }

    if (Math.abs(kbThrottle) < 1e-3 && gasTarget === 0) kbThrottle = 0;
    if (Math.abs(kbBrake) < 1e-3 && brakeTarget === 0) kbBrake = 0;
    if (Math.abs(kbSteer) < 1e-3 && steerTarget === 0) kbSteer = 0;

    const kbReset = resetQueued;
    resetQueued = false;

    const kbConfirm = confirmQueued;
    confirmQueued = false;

    const kbMute = muteQueued;
    muteQueued = false;

    const touchState = touchControls?.getState();
    const touchPresses = touchControls?.consumePresses();

    const rawTouchSteer = touchState ? touchState.steer : 0;
    const touchSmoothTau = Math.max(0.004, CONFIG.touch.touchSteerSmoothTime);
    const touchAlpha = 1 - Math.exp(-dt / touchSmoothTau);
    touchSteerSmoothed += (rawTouchSteer - touchSteerSmoothed) * touchAlpha;
    if (Math.abs(touchSteerSmoothed) < 1e-3 && Math.abs(rawTouchSteer) < 1e-3) {
      touchSteerSmoothed = 0;
    }

    const steer =
      Math.abs(kbSteer) >= Math.abs(touchSteerSmoothed) ? kbSteer : touchSteerSmoothed;
    const throttle = Math.max(kbThrottle, touchState ? touchState.throttle : 0);
    const brake = Math.max(kbBrake, touchState ? touchState.brake : 0);
    const handbrake = kbHandbrake || Boolean(touchState?.handbrake);

    return {
      throttle,
      brake,
      steer,
      handbrake,
      resetPressed: kbReset || Boolean(touchPresses?.reset),
      restartPressed: Boolean(touchPresses?.restart),
      confirmPressed: kbConfirm || Boolean(touchPresses?.confirm),
      mutePressed: kbMute || Boolean(touchPresses?.mute),
    };
  }

  function dispose(): void {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onWindowBlur);
  }

  return {
    sample,
    dispose,
  };
}
