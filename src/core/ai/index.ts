// src/core/ai/index.ts

import * as THREE from 'three';
import { CONFIG, type AiDifficulty, type AiRivalConfig } from '../../config';
import type { CarInput } from '../../input/controls';
import type { AttractionSystem } from '../attractions';
import type { Course } from '../course';
import type { CarState } from '../physics';
import type { RacePhase } from '../state';
import {
  computeAiDriverInput,
  createAiDriverContext,
  createIdleInput,
  type AiDriverContext,
} from './driver';
import { getCourseAiProfile } from './racingLine';
import {
  createRecoveryState,
  resetRecoveryState,
  stepAiRecovery,
} from './recovery';
import { createSeededRng, type SeededRng } from './rng';

export type { AiDifficulty } from '../../config';

export interface AiMetricsSnapshot {
  lastStepMs: number;
  totalRespawns: number;
  totalStuckEvents: number;
  totalWrongWayEvents: number;
  totalShortcutAttempts: number;
}

export interface AiController {
  readonly difficulty: AiDifficulty;
  setDifficulty: (difficulty: AiDifficulty) => void;
  getDifficulty: () => AiDifficulty;
  reset: (course: Course, difficulty?: AiDifficulty, seed?: number) => void;
  stepPrePhysics: (cars: readonly CarState[], course: Course, phase: RacePhase, dt: number) => void;
  sampleInput: (
    carIndex: number,
    cars: readonly CarState[],
    course: Course,
    phase: RacePhase,
    dt: number,
    attractions?: AttractionSystem | null,
    raceTimeSec?: number,
  ) => CarInput;
  getMetrics: () => AiMetricsSnapshot;
  isGhostCar: (carIndex: number) => boolean;
}

function nowHighResMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function computeProgressMeters(car: CarState, course: Course): number {
  const rawS = car.mode === 'grounded' ? car.s : car.sApprox;
  const lapOffset = car.routeId !== 'main' ? car.routeLapOffset : 0;
  return lapOffset + course.getProgressS(car.routeId, rawS);
}

export function createAiDrivers(
  initialCourse: Course,
  initialDifficulty: AiDifficulty = CONFIG.ai.defaultDifficulty,
  initialSeed = 421701,
): AiController {
  let currentDifficulty: AiDifficulty = initialDifficulty;
  let rng: SeededRng = createSeededRng(initialSeed);
  let contexts: AiDriverContext[] = [];
  let inputBuffers: CarInput[] = [];
  const idleInput = createIdleInput();
  let lastStepMs = 0;

  const initForCourse = (course: Course): void => {
    // Warm racing-line profile once on setup
    getCourseAiProfile(course);

    const racers = Math.max(1, course.getRacers());
    const rivals = CONFIG.ai.rivals;
    contexts = [];
    inputBuffers = [];

    for (let i = 0; i < racers; i++) {
      inputBuffers.push(createIdleInput());
      if (i === 0) {
        continue;
      }
      const rival: AiRivalConfig = rivals[(i - 1) % rivals.length];
      const childRng = createSeededRng(rng.int(1, 0x7fffffff));
      const reactionDelay = childRng.range(0, CONFIG.ai.startReactionMaxSec);
      const recovery = createRecoveryState(reactionDelay);
      contexts.push(createAiDriverContext(i, rival, childRng, recovery));
    }
  };

  initForCourse(initialCourse);

  const setDifficulty = (difficulty: AiDifficulty): void => {
    currentDifficulty = difficulty;
  };

  const reset = (course: Course, difficulty?: AiDifficulty, seed?: number): void => {
    if (difficulty) {
      currentDifficulty = difficulty;
    }
    if (typeof seed === 'number') {
      rng = createSeededRng(seed);
    }
    if (contexts.length !== Math.max(0, course.getRacers() - 1)) {
      initForCourse(course);
    } else {
      getCourseAiProfile(course);
      for (let i = 0; i < contexts.length; i++) {
        const ctx = contexts[i];
        const reactionDelay = ctx.rng.range(0, CONFIG.ai.startReactionMaxSec);
        resetRecoveryState(ctx.recovery, reactionDelay);
        ctx.shortcutTracker.reset();
        ctx.shortcutAttempts = 0;
      }
    }
    lastStepMs = 0;
  };

  const stepPrePhysics = (
    cars: readonly CarState[],
    course: Course,
    phase: RacePhase,
    dt: number,
  ): void => {
    if (contexts.length === 0) {
      lastStepMs = 0;
      return;
    }
    const t0 = nowHighResMs();
    const isActiveRace = phase === 'RACING';
    for (let i = 0; i < contexts.length; i++) {
      const ctx = contexts[i];
      const car = cars[ctx.carIndex];
      if (!car) continue;
      stepAiRecovery(car, ctx.recovery, course, dt, isActiveRace);
    }
    lastStepMs = Math.max(0, nowHighResMs() - t0);
  };

  const sampleInput = (
    carIndex: number,
    cars: readonly CarState[],
    course: Course,
    phase: RacePhase,
    dt: number,
    attractions: AttractionSystem | null = null,
    raceTimeSec = 0,
  ): CarInput => {
    if (carIndex <= 0 || phase !== 'RACING') {
      return idleInput;
    }
    const ctx = contexts[carIndex - 1];
    if (!ctx) {
      return idleInput;
    }

    const t0 = nowHighResMs();
    const diffCfg =
      CONFIG.ai.difficulties[currentDifficulty] ?? CONFIG.ai.difficulties.sedang;

    // Gentle bounded rubber-banding relative to player car (car 0)
    let rubberBandFactor = 1.0;
    const rbCfg = CONFIG.ai.rubberBand;
    if (rbCfg.enabled && cars[0] && cars[carIndex]) {
      const playerProg = computeProgressMeters(cars[0], course);
      const aiProg = computeProgressMeters(cars[carIndex], course);
      const gap = playerProg - aiProg; // >0 means AI is behind player
      const ratio = THREE.MathUtils.clamp(gap / Math.max(1, rbCfg.rangeMeters), -1, 1);
      if (ratio >= 0) {
        rubberBandFactor = 1 + ratio * rbCfg.maxBoost;
      } else {
        rubberBandFactor = 1 + ratio * rbCfg.maxSlow;
      }
    }

    const out = inputBuffers[carIndex] ?? createIdleInput();
    computeAiDriverInput(
      ctx,
      cars,
      course,
      diffCfg.skillMultiplier,
      rubberBandFactor,
      dt,
      out,
      attractions,
      raceTimeSec,
    );
    lastStepMs += Math.max(0, nowHighResMs() - t0);
    return out;
  };

  const getMetrics = (): AiMetricsSnapshot => {
    let totalRespawns = 0;
    let totalStuckEvents = 0;
    let totalWrongWayEvents = 0;
    let totalShortcutAttempts = 0;
    for (let i = 0; i < contexts.length; i++) {
      const ctx = contexts[i];
      totalRespawns += ctx.recovery.respawnCount;
      totalStuckEvents += ctx.recovery.stuckCount;
      totalWrongWayEvents += ctx.recovery.wrongWayCount;
      totalShortcutAttempts += ctx.shortcutAttempts;
    }
    return {
      lastStepMs,
      totalRespawns,
      totalStuckEvents,
      totalWrongWayEvents,
      totalShortcutAttempts,
    };
  };

  const isGhostCar = (carIndex: number): boolean => {
    if (carIndex <= 0) return false;
    const ctx = contexts[carIndex - 1];
    return ctx ? ctx.recovery.ghostTimer > 0 : false;
  };

  return {
    get difficulty() {
      return currentDifficulty;
    },
    setDifficulty,
    getDifficulty: () => currentDifficulty,
    reset,
    stepPrePhysics,
    sampleInput,
    getMetrics,
    isGhostCar,
  };
}
