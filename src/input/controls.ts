// src/input/controls.ts

import { CONFIG } from '../config';

export interface CarInput {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
  resetPressed: boolean;
  confirmPressed: boolean;
}

export interface KeyboardControls {
  sample: (dt: number) => CarInput;
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

export function createKeyboardControls(): KeyboardControls {
  const pressed = new Set<string>();
  let resetQueued = false;
  let confirmQueued = false;

  let throttle = 0;
  let brake = 0;
  let steer = 0;

  function onKeyDown(event: KeyboardEvent): void {
    if (PREVENT_SCROLL_CODES.has(event.code)) {
      event.preventDefault();
    }

    if (event.code === 'KeyR' && !event.repeat) {
      resetQueued = true;
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

  function sample(dt: number): CarInput {
    const cfg = CONFIG.input;

    const gasTarget = pressed.has('KeyW') || pressed.has('ArrowUp') ? 1 : 0;
    const brakeTarget = pressed.has('KeyS') || pressed.has('ArrowDown') ? 1 : 0;

    const left = pressed.has('KeyA') || pressed.has('ArrowLeft') ? 1 : 0;
    const right = pressed.has('KeyD') || pressed.has('ArrowRight') ? 1 : 0;
    const steerTarget = right - left;

    const handbrake = pressed.has('Space');

    throttle = approachExponential(throttle, gasTarget, cfg.throttleResponseRate, dt);
    brake = approachExponential(brake, brakeTarget, cfg.brakeResponseRate, dt);

    const isReleasing =
      Math.abs(steerTarget) <= 0.01 ||
      (Math.abs(steer) > 0.01 && Math.sign(steerTarget) !== Math.sign(steer));
    const rampTime = isReleasing ? cfg.steerReleaseTime : cfg.steerAttackTime;
    const maxSteerStep = dt / Math.max(0.001, rampTime);
    const steerDelta = steerTarget - steer;
    if (Math.abs(steerDelta) <= maxSteerStep) {
      steer = steerTarget;
    } else {
      steer += Math.sign(steerDelta) * maxSteerStep;
    }

    if (Math.abs(throttle) < 1e-3 && gasTarget === 0) throttle = 0;
    if (Math.abs(brake) < 1e-3 && brakeTarget === 0) brake = 0;
    if (Math.abs(steer) < 1e-3 && steerTarget === 0) steer = 0;

    const resetPressed = resetQueued;
    resetQueued = false;

    const confirmPressed = confirmQueued;
    confirmQueued = false;

    return {
      throttle,
      brake,
      steer,
      handbrake,
      resetPressed,
      confirmPressed,
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
