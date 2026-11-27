// src/audio/sound.ts

import type { RacePhase } from '../core/state';
import { createAudioManager, type AudioManager } from './audioManager';
import { createEngine, type EngineAudio, type EngineUpdateParams } from './engine';
import { createLoops, type LoopsAudio, type LoopsUpdateParams } from './loops';
import { createSfx, type SfxAudio, type SoundEffectEvent } from './sfx';

export type SoundEvent = SoundEffectEvent;

export interface SoundSnapshot {
  phase: RacePhase;
  speedNorm: number;
  throttle: number;
  boostActive: boolean;
  slip: number;
  grounded: boolean;
  airborne: boolean;
  falling: boolean;
  railContact: boolean;
  windFanProximity?: number;
}

export interface SoundSystem {
  init: () => void;
  unlock: () => void;
  update: (snapshot: SoundSnapshot, dt: number) => void;
  handleEvents: (events: readonly SoundEvent[]) => void;
  toggleMute: () => boolean;
  getMuted: () => boolean;
  setPhase: (phase: RacePhase) => void;
  reset: () => void;
  getAudioManager: () => AudioManager;
  dispose: () => void;
}

export function createSound(): SoundSystem {
  const manager: AudioManager = createAudioManager();
  let engine: EngineAudio | null = null;
  let loops: LoopsAudio | null = null;
  let sfx: SfxAudio | null = null;
  let currentPhase: RacePhase = 'TITLE';

  // Reusable parameter objects so update() does zero per-frame allocations
  const engineParams: EngineUpdateParams = {
    speedNorm: 0,
    throttle: 0,
    boostActive: false,
    airborne: false,
    active: false,
  };

  const loopsParams: LoopsUpdateParams = {
    speedNorm: 0,
    slip: 0,
    grounded: true,
    airborne: false,
    falling: false,
    railContact: false,
    windFanProximity: 0,
    active: false,
  };

  function ensureModules(): void {
    if (!manager.isReady()) {
      return;
    }
    try {
      if (!engine) {
        engine = createEngine(manager);
      }
      if (!loops) {
        loops = createLoops(manager);
      }
      if (!sfx) {
        sfx = createSfx(manager);
      }
    } catch {
      // Audio module failure must never block gameplay
    }
  }

  function applyPhaseState(phase: RacePhase): void {
    currentPhase = phase;
    if (!engine) {
      return;
    }
    try {
      if (phase === 'TITLE' || phase === 'FINISH') {
        engine.fadeOut();
      } else {
        engine.fadeIn();
      }
    } catch {
      // Ignore fade errors
    }
  }

  function init(): void {
    try {
      manager.init();
      ensureModules();
      applyPhaseState(currentPhase);
    } catch {
      // Ignore audio init errors
    }
  }

  function unlock(): void {
    try {
      manager.unlock();
      ensureModules();
      applyPhaseState(currentPhase);
    } catch {
      // Ignore audio unlock errors
    }
  }

  function setPhase(phase: RacePhase): void {
    if (phase === currentPhase) {
      return;
    }
    applyPhaseState(phase);
  }

  function update(snapshot: SoundSnapshot, dt: number): void {
    if (!manager.isReady() || !manager.isUnlocked()) {
      return;
    }
    try {
      ensureModules();

      if (snapshot.phase !== currentPhase) {
        applyPhaseState(snapshot.phase);
      }

      const isCountdown = snapshot.phase === 'COUNTDOWN';
      const isRacing = snapshot.phase === 'RACING';

      if (engine) {
        engineParams.speedNorm = isCountdown ? 0 : snapshot.speedNorm;
        engineParams.throttle = isCountdown ? 0 : snapshot.throttle;
        engineParams.boostActive = isRacing && snapshot.boostActive;
        engineParams.airborne = isRacing && snapshot.airborne;
        engineParams.active = isCountdown || isRacing;
        engine.update(engineParams, dt);
      }

      if (loops) {
        loopsParams.speedNorm = snapshot.speedNorm;
        loopsParams.slip = snapshot.slip;
        loopsParams.grounded = snapshot.grounded;
        loopsParams.airborne = snapshot.airborne;
        loopsParams.falling = snapshot.falling;
        loopsParams.railContact = snapshot.railContact;
        loopsParams.windFanProximity = snapshot.windFanProximity ?? 0;
        loopsParams.active = isRacing;
        loops.update(loopsParams, dt);
      }
    } catch {
      // Never let audio update errors halt frame loop
    }
  }

  function handleEvents(events: readonly SoundEvent[]): void {
    if (!manager.isReady() || !manager.isUnlocked() || events.length === 0) {
      return;
    }
    try {
      ensureModules();
      for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        if (ev.type === 'railHit') {
          loops?.notifyRailHit(ev.intensity);
        }
        sfx?.play(ev);
      }
    } catch {
      // Never let SFX errors halt countdown or race events
    }
  }

  function toggleMute(): boolean {
    try {
      return manager.toggleMute();
    } catch {
      return manager.getMuted();
    }
  }

  function getMuted(): boolean {
    return manager.getMuted();
  }

  function reset(): void {
    try {
      engine?.reset();
      loops?.reset();
      sfx?.reset();
    } catch {
      // Ignore reset errors
    }
  }

  function dispose(): void {
    try {
      engine?.dispose();
      loops?.dispose();
      sfx?.dispose();
    } catch {
      // Ignore dispose errors
    }
    engine = null;
    loops = null;
    sfx = null;
    manager.dispose();
  }

  return {
    init,
    unlock,
    update,
    handleEvents,
    toggleMute,
    getMuted,
    setPhase,
    reset,
    getAudioManager: () => manager,
    dispose,
  };
}
