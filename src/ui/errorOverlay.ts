// src/ui/errorOverlay.ts

import { CONFIG } from '../config';

function isTouchCapableDevice(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const coarse = Boolean(window.matchMedia?.('(pointer: coarse)').matches);
  const touchPoints = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const mobileUa = /Android|iPhone|iPad|iPod/i.test(ua);
  return coarse || touchPoints || mobileUa;
}

export function isDebugUrlEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    return new URLSearchParams(window.location.search).has('debug');
  } catch {
    return window.location.search.includes('debug');
  }
}

export function isErrorOverlayEnabled(): boolean {
  return isTouchCapableDevice() || isDebugUrlEnabled();
}

function shortenFileName(file?: string): string {
  if (!file) {
    return '';
  }
  const clean = file.split('?')[0].split('#')[0];
  const parts = clean.split('/');
  return parts[parts.length - 1] || clean;
}

function extractLocationFromStack(stack?: string): { file?: string; line?: number } {
  if (!stack) {
    return {};
  }
  const lines = stack.split('\n');
  for (const raw of lines) {
    const match = raw.match(/(https?:\/\/[^\s)]+|\/[^\s)]+\.[tj]sx?):(\d+)(?::\d+)?/);
    if (match) {
      return {
        file: shortenFileName(match[1]),
        line: Number.parseInt(match[2], 10),
      };
    }
  }
  return {};
}

function formatErrorLines(message: string, file?: string, line?: number): string {
  const maxLines = Math.max(1, CONFIG.errorOverlay.maxLines);
  const rawLower = (message || 'unknown error').replace(/\r/g, '').trim().toLowerCase();
  const baseLines = rawLower
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const locFile = shortenFileName(file).toLowerCase();
  const locSuffix =
    locFile && typeof line === 'number' && Number.isFinite(line) && line > 0
      ? `${locFile}:${line}`
      : locFile || (typeof line === 'number' && line > 0 ? `line ${line}` : '');

  const lines: string[] = [];
  if (baseLines.length === 0) {
    lines.push('error');
  } else {
    for (let i = 0; i < baseLines.length && lines.length < maxLines; i++) {
      lines.push(baseLines[i]);
    }
  }

  if (locSuffix) {
    if (lines.length < maxLines) {
      lines.push(locSuffix);
    } else {
      lines[maxLines - 1] = `${locSuffix} | ${lines[maxLines - 1]}`;
    }
  }

  return lines.slice(0, maxLines).join('\n');
}

let initialized = false;
let boxEl: HTMLDivElement | null = null;
let listenersBound = false;

function ensureBox(): HTMLDivElement | null {
  if (typeof document === 'undefined' || !isErrorOverlayEnabled()) {
    return null;
  }
  if (boxEl && boxEl.isConnected) {
    return boxEl;
  }
  const mountTarget = document.body || document.documentElement;
  if (!mountTarget) {
    return null;
  }
  if (!boxEl) {
    boxEl = document.createElement('div');
    boxEl.setAttribute('role', 'status');
    boxEl.setAttribute('aria-live', 'polite');
    boxEl.style.position = 'fixed';
    boxEl.style.left = 'max(10px, env(safe-area-inset-left, 0px))';
    boxEl.style.bottom = 'max(10px, env(safe-area-inset-bottom, 0px))';
    boxEl.style.maxWidth = 'min(82vw, 440px)';
    boxEl.style.padding = '6px 10px';
    boxEl.style.borderRadius = '8px';
    boxEl.style.background = 'rgba(127, 29, 29, 0.88)';
    boxEl.style.border = '1px solid rgba(254, 202, 202, 0.55)';
    boxEl.style.color = '#fef2f2';
    boxEl.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace';
    boxEl.style.fontSize = '11px';
    boxEl.style.fontWeight = '700';
    boxEl.style.lineHeight = '1.35';
    boxEl.style.whiteSpace = 'pre-wrap';
    boxEl.style.wordBreak = 'break-word';
    boxEl.style.textTransform = 'lowercase';
    boxEl.style.zIndex = '60';
    boxEl.style.display = 'none';
    boxEl.style.cursor = 'pointer';
    boxEl.style.touchAction = 'manipulation';
    boxEl.style.pointerEvents = 'auto';
    boxEl.style.userSelect = 'none';
    boxEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
    });
    boxEl.addEventListener('click', (e) => {
      e.stopPropagation();
      if (boxEl) {
        boxEl.style.display = 'none';
      }
    });
  }
  mountTarget.appendChild(boxEl);
  return boxEl;
}

export function logErrorOverlay(message: string, file?: string, line?: number): void {
  if (!isErrorOverlayEnabled()) {
    return;
  }
  const el = ensureBox();
  if (!el) {
    return;
  }
  el.textContent = formatErrorLines(message, file, line);
  el.style.display = 'block';
}

function onWindowError(event: ErrorEvent): void {
  const errObj = event.error instanceof Error ? event.error : null;
  const fallbackLoc = errObj ? extractLocationFromStack(errObj.stack) : {};
  const msg = event.message || errObj?.message || 'runtime error';
  const file = event.filename || fallbackLoc.file;
  const line = event.lineno || fallbackLoc.line;
  logErrorOverlay(msg, file, line);
}

function onUnhandledRejection(event: PromiseRejectionEvent): void {
  const reason = event.reason;
  if (reason instanceof Error) {
    const loc = extractLocationFromStack(reason.stack);
    logErrorOverlay(reason.message || 'unhandled rejection', loc.file, loc.line);
    return;
  }
  const msg =
    typeof reason === 'string'
      ? reason
      : reason != null
        ? String(reason)
        : 'unhandled promise rejection';
  logErrorOverlay(msg);
}

function onWebglContextLost(): void {
  logErrorOverlay('webgl context lost');
}

export function attachCanvasContextLostLogger(canvas: HTMLCanvasElement): () => void {
  const handler = (): void => {
    logErrorOverlay('webgl context lost');
  };
  canvas.addEventListener('webglcontextlost', handler);
  return () => {
    canvas.removeEventListener('webglcontextlost', handler);
  };
}

export function initErrorOverlay(): void {
  if (initialized || typeof window === 'undefined') {
    return;
  }
  initialized = true;
  if (!listenersBound) {
    window.addEventListener('error', onWindowError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    window.addEventListener('webglcontextlost', onWebglContextLost);
    listenersBound = true;
  }
  if (document.readyState !== 'loading') {
    ensureBox();
  } else {
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        ensureBox();
      },
      { once: true },
    );
  }
}

export function disposeErrorOverlay(): void {
  if (typeof window !== 'undefined' && listenersBound) {
    window.removeEventListener('error', onWindowError);
    window.removeEventListener('unhandledrejection', onUnhandledRejection);
    window.removeEventListener('webglcontextlost', onWebglContextLost);
    listenersBound = false;
  }
  if (boxEl && boxEl.parentElement) {
    boxEl.parentElement.removeChild(boxEl);
  }
  boxEl = null;
  initialized = false;
}
