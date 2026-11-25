// src/boot.ts

import { initErrorOverlay, logErrorOverlay } from './ui/errorOverlay';

initErrorOverlay();

async function start(): Promise<void> {
  try {
    const mod = await import('./main');
    await mod.bootstrap();
  } catch (err) {
    if (err instanceof Error) {
      logErrorOverlay(err.message || 'boot failed');
    } else {
      logErrorOverlay(String(err ?? 'boot failed'));
    }
  }
}

void start();
