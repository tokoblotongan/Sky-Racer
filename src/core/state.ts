// src/core/state.ts

import { CONFIG } from '../config';
import type { Course } from './course';

export type RacePhase = 'TITLE' | 'COUNTDOWN' | 'RACING' | 'FINISH';

export interface CarRaceSnapshot {
  s: number;
  sApprox: number;
  mode: 'grounded' | 'airborne' | 'falling';
}

export interface RaceState {
  phase: RacePhase;
  countdownTimer: number;
  countdownDisplayNumber: number;
  goHoldTimer: number;
  timer: number;
  nextCheckpointIndex: number;
  passedCheckpoints: number[];
  splits: Array<number | null>;
  lastCheckpointIndex: number | null;
  bestTime: number | null;
  bestSplits: number[] | null;
  newBest: boolean;
  totalCheckpoints: number;
}

export type RaceEvent =
  | { type: 'countdownTick'; n: number }
  | { type: 'go' }
  | { type: 'checkpoint'; index: number; total: number; time: number; delta: number | null }
  | { type: 'finish'; time: number; newBest: boolean }
  | { type: 'restart' };

interface StoredBestRecord {
  bestTime: number;
  bestSplits: number[];
}

function loadBestRecord(): StoredBestRecord | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }
    const raw = window.localStorage.getItem(CONFIG.storage.key);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<StoredBestRecord>;
    if (
      typeof parsed.bestTime !== 'number' ||
      !Number.isFinite(parsed.bestTime) ||
      parsed.bestTime <= 0
    ) {
      return null;
    }
    const bestSplits = Array.isArray(parsed.bestSplits)
      ? parsed.bestSplits.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
      : [];
    return {
      bestTime: parsed.bestTime,
      bestSplits,
    };
  } catch {
    return null;
  }
}

function saveBestRecord(bestTime: number, bestSplits: number[]): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    const payload: StoredBestRecord = {
      bestTime,
      bestSplits,
    };
    window.localStorage.setItem(CONFIG.storage.key, JSON.stringify(payload));
  } catch {
    // Ignore storage quota or private browsing errors
  }
}

function resetProgressFields(state: RaceState): void {
  state.timer = 0;
  state.nextCheckpointIndex = 0;
  state.passedCheckpoints = [];
  state.splits = Array<number | null>(state.totalCheckpoints).fill(null);
  state.lastCheckpointIndex = null;
  state.newBest = false;
  state.countdownTimer = CONFIG.race.countdownSeconds;
  state.countdownDisplayNumber = Math.max(1, Math.ceil(CONFIG.race.countdownSeconds));
  state.goHoldTimer = 0;
}

export function createRaceState(course: Course): RaceState {
  const totalCheckpoints = course.getCheckpoints().length;
  const stored = loadBestRecord();
  const bestSplits =
    stored && stored.bestSplits.length === totalCheckpoints ? stored.bestSplits : null;

  return {
    phase: 'TITLE',
    countdownTimer: 0,
    countdownDisplayNumber: 0,
    goHoldTimer: 0,
    timer: 0,
    nextCheckpointIndex: 0,
    passedCheckpoints: [],
    splits: Array<number | null>(totalCheckpoints).fill(null),
    lastCheckpointIndex: null,
    bestTime: stored ? stored.bestTime : null,
    bestSplits,
    newBest: false,
    totalCheckpoints,
  };
}

export function startCountdown(state: RaceState): RaceEvent[] {
  resetProgressFields(state);
  state.phase = 'COUNTDOWN';
  return [{ type: 'countdownTick', n: state.countdownDisplayNumber }];
}

export function restartRace(state: RaceState): RaceEvent[] {
  resetProgressFields(state);
  state.phase = 'COUNTDOWN';
  return [
    { type: 'restart' },
    { type: 'countdownTick', n: state.countdownDisplayNumber },
  ];
}

export function getRespawnTarget(
  state: RaceState,
  course: Course,
): { s: number; lateral: number } {
  if (state.lastCheckpointIndex !== null) {
    const cpFrame = course.getCheckpointFrame(state.lastCheckpointIndex);
    return { s: cpFrame.s, lateral: 0 };
  }
  return { s: CONFIG.car.startS, lateral: CONFIG.car.startLateral };
}

export function applyManualResetPenalty(state: RaceState): void {
  if (state.phase === 'RACING' && CONFIG.race.resetPenaltySeconds > 0) {
    state.timer += CONFIG.race.resetPenaltySeconds;
  }
}

export function updateRace(
  state: RaceState,
  car: CarRaceSnapshot,
  course: Course,
  dt: number,
): RaceEvent[] {
  const events: RaceEvent[] = [];

  if (state.phase === 'COUNTDOWN') {
    state.countdownTimer -= dt;
    if (state.countdownTimer > 0) {
      const displayNum = Math.max(1, Math.ceil(state.countdownTimer));
      if (displayNum !== state.countdownDisplayNumber) {
        state.countdownDisplayNumber = displayNum;
        events.push({ type: 'countdownTick', n: displayNum });
      }
      return events;
    }

    const overflowDt = Math.max(0, -state.countdownTimer);
    state.phase = 'RACING';
    state.countdownTimer = 0;
    state.countdownDisplayNumber = 0;
    state.goHoldTimer = CONFIG.race.goHoldSeconds;
    state.timer = overflowDt;
    events.push({ type: 'go' });
    return events;
  }

  if (state.phase !== 'RACING') {
    return events;
  }

  state.timer += dt;
  if (state.goHoldTimer > 0) {
    state.goHoldTimer = Math.max(0, state.goHoldTimer - dt);
  }

  const activeS = car.mode === 'grounded' ? car.s : car.sApprox;
  const checkpoints = course.getCheckpoints();

  while (state.nextCheckpointIndex < checkpoints.length) {
    const cp = checkpoints[state.nextCheckpointIndex];
    if (activeS >= cp.s) {
      const idx = state.nextCheckpointIndex;
      const splitTime = state.timer;
      const prevBestSplit =
        state.bestSplits && idx < state.bestSplits.length ? state.bestSplits[idx] : null;
      const delta =
        prevBestSplit !== null && Number.isFinite(prevBestSplit)
          ? splitTime - prevBestSplit
          : null;

      state.splits[idx] = splitTime;
      state.passedCheckpoints.push(idx);
      state.lastCheckpointIndex = idx;
      state.nextCheckpointIndex++;

      events.push({
        type: 'checkpoint',
        index: idx,
        total: checkpoints.length,
        time: splitTime,
        delta,
      });
    } else {
      break;
    }
  }

  if (activeS >= course.getFinishS()) {
    state.phase = 'FINISH';
    state.goHoldTimer = 0;

    const isNewBest = state.bestTime === null || state.timer < state.bestTime;
    if (isNewBest) {
      state.newBest = true;
      state.bestTime = state.timer;
      const completedSplits = state.splits.map((sVal) => sVal ?? state.timer);
      state.bestSplits = completedSplits;
      saveBestRecord(state.bestTime, completedSplits);
    }

    events.push({
      type: 'finish',
      time: state.timer,
      newBest: state.newBest,
    });
  }

  return events;
}
