// src/ui/toastQueue.ts

import { CONFIG } from '../config';

export type ToastKind = 'wrongWay' | 'lap' | 'zone' | 'airtime' | 'split' | 'overtake';
export type ToastTone = 'neutral' | 'fast' | 'slow';

export interface ToastPayload {
  kind: ToastKind;
  text: string;
  subtext?: string;
  priority: number;
  durationMs: number;
  tone?: ToastTone;
  deltaText?: string;
  sticky?: boolean;
}

export interface ToastQueue {
  push: (msg: ToastPayload) => void;
  update: (dt: number) => void;
  clearKind: (kind: ToastKind) => void;
  clear: () => void;
  dispose: () => void;
}

interface ActiveToast {
  msg: ToastPayload;
  elapsedMs: number;
  leaving: boolean;
}

interface PendingToast {
  msg: ToastPayload;
  ageMs: number;
}

const KIND_CLASS: Record<ToastKind, string> = {
  wrongWay: 'sr-toast--wrong-way',
  lap: 'sr-toast--lap',
  zone: 'sr-toast--zone',
  airtime: 'sr-toast--airtime',
  split: 'sr-toast--split',
  overtake: 'sr-toast--overtake',
};

function isReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function createToastQueue(laneEl: HTMLElement): ToastQueue {
  const toastEl = document.createElement('div');
  toastEl.className = 'sr-toast sr-hud-hidden';
  toastEl.setAttribute('aria-live', 'polite');
  laneEl.appendChild(toastEl);

  let active: ActiveToast | null = null;
  let pending: PendingToast | null = null;
  let disposed = false;

  const renderToast = (msg: ToastPayload): void => {
    toastEl.textContent = '';
    toastEl.className = `sr-toast ${KIND_CLASS[msg.kind]}`;
    toastEl.setAttribute('data-kind', msg.kind);
    toastEl.setAttribute('role', msg.kind === 'wrongWay' ? 'alert' : 'status');

    if (msg.kind === 'wrongWay') {
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.setAttribute('class', 'sr-wrong-way-icon');
      icon.setAttribute('viewBox', '0 0 24 24');
      icon.setAttribute('aria-hidden', 'true');

      const tri = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      tri.setAttribute('d', 'M12 3L2 20h20L12 3z');
      tri.setAttribute('fill', 'none');
      tri.setAttribute('stroke', 'currentColor');
      tri.setAttribute('stroke-width', '2.3');
      tri.setAttribute('stroke-linejoin', 'round');

      const excl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      excl.setAttribute('d', 'M12 9v5M12 17h.01');
      excl.setAttribute('stroke', 'currentColor');
      excl.setAttribute('stroke-width', '2.4');
      excl.setAttribute('stroke-linecap', 'round');

      icon.appendChild(tri);
      icon.appendChild(excl);
      toastEl.appendChild(icon);
    }

    const mainEl = document.createElement('span');
    mainEl.className = 'sr-toast-text';
    if (msg.kind === 'split') {
      if (msg.tone === 'fast') {
        mainEl.classList.add('sr-split-delta-fast');
      } else if (msg.tone === 'slow') {
        mainEl.classList.add('sr-split-delta-slow');
      }
    }
    mainEl.textContent = msg.text;
    toastEl.appendChild(mainEl);

    if (msg.subtext) {
      const subEl = document.createElement('span');
      subEl.className = 'sr-toast-subtext';

      const timeSpan = document.createElement('span');
      timeSpan.textContent = msg.subtext;
      subEl.appendChild(timeSpan);

      if (msg.deltaText) {
        const deltaSpan = document.createElement('span');
        deltaSpan.className =
          msg.tone === 'fast'
            ? 'sr-toast-delta sr-split-delta-fast'
            : msg.tone === 'slow'
              ? 'sr-toast-delta sr-split-delta-slow'
              : 'sr-toast-delta sr-split-delta-neutral';
        deltaSpan.textContent = msg.deltaText;
        subEl.appendChild(deltaSpan);
      }

      toastEl.appendChild(subEl);
    }

    if (isReducedMotion()) {
      toastEl.classList.add('sr-toast--visible');
    } else {
      void toastEl.offsetWidth;
      toastEl.classList.add('sr-toast--visible');
    }
  };

  const hideDom = (): void => {
    toastEl.className = 'sr-toast sr-hud-hidden';
    toastEl.removeAttribute('data-kind');
  };

  const activate = (msg: ToastPayload): void => {
    active = {
      msg,
      elapsedMs: 0,
      leaving: false,
    };
    renderToast(msg);
  };

  const promotePending = (): void => {
    if (pending === null) {
      return;
    }
    if (pending.ageMs > CONFIG.hud.toastMaxPendingAgeMs) {
      pending = null;
      return;
    }
    const nextMsg = pending.msg;
    pending = null;
    activate(nextMsg);
  };

  const push = (msg: ToastPayload): void => {
    if (disposed) {
      return;
    }

    if (active !== null && active.msg.kind === 'wrongWay' && msg.kind === 'wrongWay') {
      active.elapsedMs = 0;
      active.leaving = false;
      return;
    }

    if (active === null) {
      activate(msg);
      return;
    }

    if (msg.priority > active.msg.priority) {
      if (pending !== null && pending.msg.priority <= msg.priority) {
        pending = null;
      }
      activate(msg);
      return;
    }

    if (msg.priority === active.msg.priority) {
      activate(msg);
      return;
    }

    // Lower priority while another message is active: keep at most one non-stacked candidate,
    // which is discarded if its age exceeds CONFIG.hud.toastMaxPendingAgeMs (600 ms).
    if (pending === null || msg.priority >= pending.msg.priority) {
      pending = {
        msg,
        ageMs: 0,
      };
    }
  };

  const update = (dt: number): void => {
    if (disposed) {
      return;
    }

    const dtMs = Math.max(0, dt) * 1000;

    if (pending !== null) {
      pending.ageMs += dtMs;
      if (pending.ageMs > CONFIG.hud.toastMaxPendingAgeMs) {
        pending = null;
      }
    }

    if (active === null) {
      if (pending !== null) {
        promotePending();
      }
      return;
    }

    if (active.msg.sticky) {
      return;
    }

    active.elapsedMs += dtMs;
    const totalMs = Math.max(1, active.msg.durationMs);
    const fadeOutMs = isReducedMotion() ? 0 : Math.min(CONFIG.hud.toastFadeOutMs, totalMs);
    const fadeStartMs = Math.max(0, totalMs - fadeOutMs);

    if (!active.leaving && fadeOutMs > 0 && active.elapsedMs >= fadeStartMs) {
      active.leaving = true;
      toastEl.classList.remove('sr-toast--visible');
      toastEl.classList.add('sr-toast--leaving');
    }

    if (active.elapsedMs >= totalMs) {
      active = null;
      hideDom();
      promotePending();
    }
  };

  const clearKind = (kind: ToastKind): void => {
    if (disposed) {
      return;
    }
    if (pending !== null && pending.msg.kind === kind) {
      pending = null;
    }
    if (active !== null && active.msg.kind === kind) {
      active = null;
      hideDom();
      promotePending();
    }
  };

  const clear = (): void => {
    pending = null;
    active = null;
    hideDom();
  };

  const dispose = (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    clear();
    if (toastEl.parentElement === laneEl) {
      laneEl.removeChild(toastEl);
    }
  };

  return {
    push,
    update,
    clearKind,
    clear,
    dispose,
  };
}
