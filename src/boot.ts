// src/boot.ts

import { initErrorOverlay, logErrorOverlay } from './ui/errorOverlay';
import {
  probeCapabilitiesFromGl,
  showReportOverlay,
  type WebGlDiagnostics,
} from './ui/reportOverlay';

interface RendererInitLikeError extends Error {
  diagnostics?: WebGlDiagnostics;
  attemptErrors?: string[];
}

function isRendererInitError(err: unknown): err is RendererInitLikeError {
  return (
    err instanceof Error &&
    err.name === 'RendererInitError' &&
    'diagnostics' in err
  );
}

initErrorOverlay();

async function start(): Promise<void> {
  try {
    const mod = await import('./main');
    await mod.bootstrap();
  } catch (err) {
    const rendererFail = isRendererInitError(err);
    const message =
      err instanceof Error ? err.message || 'boot failed' : String(err ?? 'boot failed');
    logErrorOverlay(message);
    showReportOverlay({
      headline: rendererFail
        ? 'Perangkat tidak mendukung grafis 3D'
        : 'Gagal memuat Sky Racer',
      fatal: true,
      safeMode: true,
      safeReasons: rendererFail
        ? err.attemptErrors && err.attemptErrors.length > 0
          ? err.attemptErrors
          : ['webgl-failed']
        : ['boot-error'],
      gameStatus: 'BOOT_ERROR',
      diagnostics:
        rendererFail && err.diagnostics
          ? err.diagnostics
          : probeCapabilitiesFromGl(null),
      extraNote: rendererFail
        ? 'Perangkat tidak mendukung grafis 3D (WebGL2 gagal dibuat).'
        : message,
    });
  }
}

void start();
