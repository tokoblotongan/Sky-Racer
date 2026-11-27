// src/ui/transitions.ts

import { CONFIG } from '../config';

export interface ScreenTransition {
  flashFade: (onMidpoint?: () => void) => void;
  dispose: () => void;
}

function isReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function createScreenTransition(container: HTMLElement): ScreenTransition {
  const overlay = document.createElement('div');
  overlay.className = 'sr-screen-fade';
  overlay.setAttribute('aria-hidden', 'true');
  container.appendChild(overlay);

  let midTimer: number | null = null;
  let endTimer: number | null = null;
  let disposed = false;

  const clearTimers = (): void => {
    if (midTimer !== null) {
      window.clearTimeout(midTimer);
      midTimer = null;
    }
    if (endTimer !== null) {
      window.clearTimeout(endTimer);
      endTimer = null;
    }
  };

  const flashFade = (onMidpoint?: () => void): void => {
    if (disposed) {
      onMidpoint?.();
      return;
    }
    clearTimers();
    if (isReducedMotion() || CONFIG.polish.fadeMs <= 0) {
      overlay.classList.remove('sr-screen-fade--active');
      onMidpoint?.();
      return;
    }

    const halfMs = Math.max(40, Math.round(CONFIG.polish.fadeMs * 0.5));
    overlay.style.transitionDuration = `${halfMs}ms`;
    overlay.classList.add('sr-screen-fade--active');

    midTimer = window.setTimeout(() => {
      midTimer = null;
      if (!disposed) {
        onMidpoint?.();
        overlay.classList.remove('sr-screen-fade--active');
        endTimer = window.setTimeout(() => {
          endTimer = null;
        }, halfMs);
      }
    }, halfMs);
  };

  const dispose = (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    clearTimers();
    if (overlay.parentElement === container) {
      container.removeChild(overlay);
    }
  };

  return {
    flashFade,
    dispose,
  };
}
