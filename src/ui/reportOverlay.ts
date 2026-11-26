// src/ui/reportOverlay.ts

import { getBuildId, getRecordedErrors, isSafeUrlEnabled } from './errorOverlay';

export interface WebGlDiagnostics {
  webglType: 'webgl2' | 'webgl1' | 'none';
  unmaskedRenderer: string;
  unmaskedVendor: string;
  maxTextureSize: number | null;
  extensions: {
    EXT_color_buffer_float: boolean;
    EXT_color_buffer_half_float: boolean;
    OES_texture_half_float: boolean;
    KHR_parallel_shader_compile: boolean;
  };
  glError: string;
  framebufferStatus: string;
}

export interface DeviceReportSnapshot {
  headline?: string;
  fatal?: boolean;
  safeMode: boolean;
  safeReasons?: readonly string[];
  quality?: string;
  renderedFrames?: number;
  gameStatus?: string;
  countdownSec?: number;
  diagnostics?: Partial<WebGlDiagnostics>;
  extraNote?: string;
}

let overlayEl: HTMLDivElement | null = null;
let headlineEl: HTMLDivElement | null = null;
let bodyEl: HTMLPreElement | null = null;
let closeBtnEl: HTMLButtonElement | null = null;
let copyTimerId: number | null = null;
let lastReportText = '';
let isFatalMode = false;

function getOrientationLabel(): string {
  if (typeof window === 'undefined') {
    return 'unknown';
  }
  const vw = window.visualViewport?.width ?? window.innerWidth;
  const vh = window.visualViewport?.height ?? window.innerHeight;
  const aspectMode = vh > vw ? 'portrait' : 'landscape';
  const apiType =
    typeof screen !== 'undefined' && screen.orientation?.type
      ? ` (${screen.orientation.type})`
      : '';
  return `${aspectMode}${apiType}`;
}

export function probeCapabilitiesFromGl(gl: WebGLRenderingContext | WebGL2RenderingContext | null): WebGlDiagnostics {
  if (!gl) {
    return {
      webglType: 'none',
      unmaskedRenderer: 'none',
      unmaskedVendor: 'none',
      maxTextureSize: null,
      extensions: {
        EXT_color_buffer_float: false,
        EXT_color_buffer_half_float: false,
        OES_texture_half_float: false,
        KHR_parallel_shader_compile: false,
      },
      glError: 'NO_CONTEXT',
      framebufferStatus: 'N/A',
    };
  }

  const isWebGL2 =
    typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  const debugExt = gl.getExtension('WEBGL_debug_renderer_info');
  const unmaskedRenderer = String(
    gl.getParameter(debugExt ? debugExt.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? 'unknown',
  );
  const unmaskedVendor = String(
    gl.getParameter(debugExt ? debugExt.UNMASKED_VENDOR_WEBGL : gl.VENDOR) ?? 'unknown',
  );
  const maxTexRaw = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  const maxTextureSize = typeof maxTexRaw === 'number' && Number.isFinite(maxTexRaw) ? maxTexRaw : null;

  const glErrCode = gl.getError();
  const glError = glErrCode === gl.NO_ERROR ? 'NO_ERROR' : `0x${glErrCode.toString(16)}`;
  const fbCode = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  const framebufferStatus =
    fbCode === gl.FRAMEBUFFER_COMPLETE ? 'COMPLETE' : `0x${fbCode.toString(16)}`;

  return {
    webglType: isWebGL2 ? 'webgl2' : 'webgl1',
    unmaskedRenderer,
    unmaskedVendor,
    maxTextureSize,
    extensions: {
      EXT_color_buffer_float: Boolean(gl.getExtension('EXT_color_buffer_float')),
      EXT_color_buffer_half_float: Boolean(gl.getExtension('EXT_color_buffer_half_float')),
      OES_texture_half_float: Boolean(gl.getExtension('OES_texture_half_float')),
      KHR_parallel_shader_compile: Boolean(gl.getExtension('KHR_parallel_shader_compile')),
    },
    glError,
    framebufferStatus,
  };
}

export function formatDeviceReportText(snapshot: DeviceReportSnapshot): string {
  const buildId = getBuildId();
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';
  const sw = typeof screen !== 'undefined' ? screen.width : 0;
  const sh = typeof screen !== 'undefined' ? screen.height : 0;
  const vw =
    typeof window !== 'undefined'
      ? Math.round(window.visualViewport?.width ?? window.innerWidth)
      : 0;
  const vh =
    typeof window !== 'undefined'
      ? Math.round(window.visualViewport?.height ?? window.innerHeight)
      : 0;
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const diag = snapshot.diagnostics;
  const ext = diag?.extensions;
  const errors = getRecordedErrors();

  const lines: string[] = [
    `BUILD ID   : v${buildId}`,
    `SAFE MODE  : ${snapshot.safeMode ? 'ON' : 'OFF'}${
      snapshot.safeReasons && snapshot.safeReasons.length > 0
        ? ` (${snapshot.safeReasons.join(', ')})`
        : isSafeUrlEnabled()
          ? ' (?safe)'
          : ''
    }`,
    `QUALITY    : ${snapshot.quality ?? 'unknown'}`,
    `FRAMES     : ${snapshot.renderedFrames ?? 0}`,
    `STATUS     : ${snapshot.gameStatus ?? 'unknown'}${
      snapshot.gameStatus === 'COUNTDOWN' && typeof snapshot.countdownSec === 'number'
        ? ` (${snapshot.countdownSec})`
        : ''
    }`,
    `SCREEN/VP  : ${sw}x${sh} | vp ${vw}x${vh} | DPR ${dpr.toFixed(2)}`,
    `ORIENTATION: ${getOrientationLabel()}`,
    `WEBGL      : ${diag?.webglType ?? 'unknown'} | GL_ERR ${diag?.glError ?? '?'} | FB ${diag?.framebufferStatus ?? '?'}`,
    `RENDERER   : ${diag?.unmaskedRenderer ?? 'unknown'}`,
    `VENDOR     : ${diag?.unmaskedVendor ?? 'unknown'}`,
    `MAX_TEX    : ${diag?.maxTextureSize ?? 'unknown'}`,
    `EXT FLOAT  : cb_float=${ext?.EXT_color_buffer_float ? 'Y' : 'N'} cb_half=${ext?.EXT_color_buffer_half_float ? 'Y' : 'N'} oes_half=${ext?.OES_texture_half_float ? 'Y' : 'N'}`,
    `EXT PAR_SC : ${ext?.KHR_parallel_shader_compile ? 'Y' : 'N'}`,
    `USER AGENT : ${ua}`,
  ];

  if (snapshot.extraNote) {
    lines.push(`NOTE       : ${snapshot.extraNote}`);
  }

  lines.push('ERRORS (LAST 5):');
  if (errors.length === 0) {
    lines.push('  (tidak ada error)');
  } else {
    for (let i = 0; i < errors.length; i++) {
      const e = errors[i];
      const loc = e.location ? ` [${e.location}]` : '';
      const cnt = e.count > 1 ? ` (x${e.count})` : '';
      lines.push(`  ${i + 1}. ${e.message}${loc}${cnt}`);
    }
  }

  return lines.join('\n');
}

async function copyTextFallback(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', 'true');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function ensureOverlayDom(): void {
  if (typeof document === 'undefined' || overlayEl) {
    return;
  }
  const mount = document.body || document.documentElement;
  if (!mount) {
    return;
  }

  const root = document.createElement('div');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.style.position = 'fixed';
  root.style.inset = '0';
  root.style.zIndex = '75';
  root.style.display = 'none';
  root.style.alignItems = 'center';
  root.style.justifyContent = 'center';
  root.style.padding = 'max(12px, env(safe-area-inset-top, 0px)) 12px max(12px, env(safe-area-inset-bottom, 0px))';
  root.style.background = 'rgba(2, 6, 23, 0.92)';
  root.style.pointerEvents = 'auto';
  root.style.touchAction = 'pan-y';
  root.style.boxSizing = 'border-box';
  root.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

  const card = document.createElement('div');
  card.style.width = 'min(96vw, 680px)';
  card.style.maxHeight = 'calc(100dvh - 24px)';
  card.style.display = 'flex';
  card.style.flexDirection = 'column';
  card.style.gap = '10px';
  card.style.padding = '14px 16px';
  card.style.borderRadius = '14px';
  card.style.background = '#0f172a';
  card.style.border = '2px solid #38bdf8';
  card.style.boxShadow = '0 16px 40px rgba(0, 0, 0, 0.65)';
  card.style.color = '#f8fafc';
  card.style.boxSizing = 'border-box';
  card.style.overflow = 'hidden';

  const title = document.createElement('div');
  title.style.fontSize = 'clamp(15px, 3.6vw, 19px)';
  title.style.fontWeight = '900';
  title.style.color = '#ffd000';
  title.style.lineHeight = '1.25';
  title.textContent = 'Laporan Perangkat Sky Racer';

  const pre = document.createElement('pre');
  pre.style.margin = '0';
  pre.style.padding = '10px 12px';
  pre.style.borderRadius = '10px';
  pre.style.background = '#020617';
  pre.style.border = '1px solid rgba(148, 163, 184, 0.35)';
  pre.style.color = '#e2e8f0';
  pre.style.fontFamily = 'inherit';
  pre.style.fontSize = 'clamp(11.5px, 2.7vw, 13.5px)';
  pre.style.fontWeight = '700';
  pre.style.lineHeight = '1.42';
  pre.style.whiteSpace = 'pre-wrap';
  pre.style.wordBreak = 'break-word';
  pre.style.overflowY = 'auto';
  pre.style.userSelect = 'text';
  pre.style.webkitUserSelect = 'text';
  pre.style.flex = '1 1 auto';

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.flexWrap = 'wrap';
  actions.style.gap = '8px';
  actions.style.justifyContent = 'flex-end';

  const makeBtn = (label: string, bg: string, color: string): HTMLButtonElement => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.style.minHeight = '40px';
    btn.style.padding = '8px 14px';
    btn.style.borderRadius = '10px';
    btn.style.border = '1.5px solid rgba(255,255,255,0.35)';
    btn.style.background = bg;
    btn.style.color = color;
    btn.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    btn.style.fontSize = '13px';
    btn.style.fontWeight = '800';
    btn.style.cursor = 'pointer';
    btn.style.touchAction = 'manipulation';
    return btn;
  };

  const copyBtn = makeBtn('Salin Laporan', '#0ea5e9', '#082f49');
  const reloadBtn = makeBtn('Muat Ulang', '#f59e0b', '#0f172a');
  const closeBtn = makeBtn('Tutup', '#334155', '#f8fafc');

  copyBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const ok = await copyTextFallback(lastReportText);
    copyBtn.textContent = ok ? 'Tersalin!' : 'Gagal Menyalin';
    if (copyTimerId !== null) {
      window.clearTimeout(copyTimerId);
    }
    copyTimerId = window.setTimeout(() => {
      copyBtn.textContent = 'Salin Laporan';
      copyTimerId = null;
    }, 1800);
  });

  reloadBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    window.location.reload();
  });

  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hideReportOverlay();
  });

  root.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });

  actions.appendChild(copyBtn);
  actions.appendChild(reloadBtn);
  actions.appendChild(closeBtn);
  card.appendChild(title);
  card.appendChild(pre);
  card.appendChild(actions);
  root.appendChild(card);
  mount.appendChild(root);

  overlayEl = root;
  headlineEl = title;
  bodyEl = pre;
  closeBtnEl = closeBtn;
}

export function showReportOverlay(snapshot: DeviceReportSnapshot): void {
  ensureOverlayDom();
  if (!overlayEl || !headlineEl || !bodyEl || !closeBtnEl) {
    return;
  }
  isFatalMode = Boolean(snapshot.fatal);
  headlineEl.textContent = snapshot.headline || 'Laporan Perangkat Sky Racer';
  headlineEl.style.color = isFatalMode ? '#f87171' : '#ffd000';
  lastReportText = formatDeviceReportText(snapshot);
  bodyEl.textContent = lastReportText;
  closeBtnEl.style.display = isFatalMode ? 'none' : 'inline-flex';
  overlayEl.style.display = 'flex';
}

export function updateReportOverlay(snapshot: DeviceReportSnapshot): void {
  if (!overlayEl || overlayEl.style.display === 'none' || !bodyEl || !headlineEl) {
    return;
  }
  if (snapshot.headline) {
    headlineEl.textContent = snapshot.headline;
  }
  lastReportText = formatDeviceReportText(snapshot);
  bodyEl.textContent = lastReportText;
}

export function hideReportOverlay(): void {
  if (overlayEl && !isFatalMode) {
    overlayEl.style.display = 'none';
  }
}

export function isReportOverlayOpen(): boolean {
  return Boolean(overlayEl && overlayEl.style.display !== 'none');
}

export function disposeReportOverlay(): void {
  if (copyTimerId !== null) {
    window.clearTimeout(copyTimerId);
    copyTimerId = null;
  }
  if (overlayEl && overlayEl.parentElement) {
    overlayEl.parentElement.removeChild(overlayEl);
  }
  overlayEl = null;
  headlineEl = null;
  bodyEl = null;
  closeBtnEl = null;
  isFatalMode = false;
}
