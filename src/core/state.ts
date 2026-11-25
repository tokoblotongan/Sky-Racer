// src/core/state.ts

import { CONFIG } from '../config';
import {
  determineMedal,
  getRecords,
  submitRun,
  type MedalType,
  type RaceStats,
} from '../services/records';
import type { Course } from './course';
import type { PhysicsEvent } from './physics';

export type RacePhase = 'TITLE' | 'COUNTDOWN' | 'RACING' | 'FINISH';

export interface CarRaceSnapshot {
  s: number;
  sApprox: number;
  mode: 'grounded' | 'airborne' | 'falling';
  speedKmh?: number;
}

export interface FinishResultData {
  time: number;
  medal: MedalType;
  isNewBest: boolean;
  rank: number | null;
  deltaToBest: number | null;
  splits: number[];
  splitDeltas: Array<number | null>;
  isNewSplitBest: boolean[];
  stats: RaceStats;
}

export interface RaceState {
  phase: RacePhase;
  resultReady: boolean;
  finishDelayTimer: number;
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
  stats: RaceStats;
  lastFinish: FinishResultData | null;
  persistRecords: boolean;
}

export type RaceEvent =
  | { type: 'countdownTick'; n: number }
  | { type: 'go' }
  | { type: 'checkpoint'; index: number; total: number; time: number; delta: number | null }
  | ({ type: 'finish' } & FinishResultData)
  | { type: 'resultReady' }
  | { type: 'restart' }
  | { type: 'toTitle' };

export interface CreateRaceStateOptions {
  persistRecords?: boolean;
}

function createEmptyStats(): RaceStats {
  return {
    topSpeedKmh: 0,
    totalAirtime: 0,
    longestAirtime: 0,
    boostCount: 0,
    railHits: 0,
    resets: 0,
    falls: 0,
    checkpointsHit: 0,
  };
}

function resetProgressFields(state: RaceState): void {
  state.resultReady = false;
  state.finishDelayTimer = 0;
  state.timer = 0;
  state.nextCheckpointIndex = 0;
  state.passedCheckpoints = [];
  state.splits = Array<number | null>(state.totalCheckpoints).fill(null);
  state.lastCheckpointIndex = null;
  state.newBest = false;
  state.lastFinish = null;
  state.stats = createEmptyStats();
  state.countdownTimer = CONFIG.race.countdownSeconds;
  state.countdownDisplayNumber = Math.max(1, Math.ceil(CONFIG.race.countdownSeconds));
  state.goHoldTimer = 0;
}

export function createRaceState(course: Course, options?: CreateRaceStateOptions): RaceState {
  const totalCheckpoints = course.getCheckpoints().length;
  const persistRecords = options?.persistRecords ?? true;
  const records = persistRecords ? getRecords(course.getId(), course.getMedals()) : null;
  const bestSplits =
    records && records.bestSplits.length === totalCheckpoints ? [...records.bestSplits] : null;

  return {
    phase: 'TITLE',
    resultReady: false,
    finishDelayTimer: 0,
    countdownTimer: 0,
    countdownDisplayNumber: 0,
    goHoldTimer: 0,
    timer: 0,
    nextCheckpointIndex: 0,
    passedCheckpoints: [],
    splits: Array<number | null>(totalCheckpoints).fill(null),
    lastCheckpointIndex: null,
    bestTime: records?.best ? records.best.time : null,
    bestSplits,
    newBest: false,
    totalCheckpoints,
    stats: createEmptyStats(),
    lastFinish: null,
    persistRecords,
  };
}

export function refreshRaceRecords(state: RaceState, course: Course): void {
  if (!state.persistRecords) {
    state.bestTime = null;
    state.bestSplits = null;
    return;
  }
  const records = getRecords(course.getId(), course.getMedals());
  state.bestTime = records.best ? records.best.time : null;
  state.bestSplits =
    records.bestSplits.length === state.totalCheckpoints ? [...records.bestSplits] : null;
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

export function returnToTitle(state: RaceState, course: Course): RaceEvent[] {
  resetProgressFields(state);
  refreshRaceRecords(state, course);
  state.phase = 'TITLE';
  state.countdownTimer = 0;
  state.countdownDisplayNumber = 0;
  return [{ type: 'toTitle' }];
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
  if (state.phase === 'RACING') {
    state.stats.resets++;
    if (CONFIG.race.resetPenaltySeconds > 0) {
      state.timer += CONFIG.race.resetPenaltySeconds;
    }
  }
}

function recordPhysicsStats(state: RaceState, physicsEvents: readonly PhysicsEvent[]): void {
  for (let i = 0; i < physicsEvents.length; i++) {
    const ev = physicsEvents[i];
    if (ev.type === 'boost') {
      state.stats.boostCount++;
    } else if (ev.type === 'railHit') {
      state.stats.railHits++;
    } else if (ev.type === 'fell') {
      state.stats.falls++;
    } else if (ev.type === 'landed') {
      const air = Math.max(0, ev.airtime);
      state.stats.totalAirtime += air;
      if (air > state.stats.longestAirtime) {
        state.stats.longestAirtime = air;
      }
    }
  }
}

export function updateRace(
  state: RaceState,
  car: CarRaceSnapshot,
  course: Course,
  dt: number,
  physicsEvents?: readonly PhysicsEvent[],
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

  if (state.phase === 'FINISH') {
    if (!state.resultReady) {
      state.finishDelayTimer -= dt;
      if (state.finishDelayTimer <= 0) {
        state.finishDelayTimer = 0;
        state.resultReady = true;
        events.push({ type: 'resultReady' });
      }
    }
    return events;
  }

  if (state.phase !== 'RACING') {
    return events;
  }

  state.timer += dt;
  if (state.goHoldTimer > 0) {
    state.goHoldTimer = Math.max(0, state.goHoldTimer - dt);
  }

  if (typeof car.speedKmh === 'number' && Number.isFinite(car.speedKmh)) {
    if (car.speedKmh > state.stats.topSpeedKmh) {
      state.stats.topSpeedKmh = car.speedKmh;
    }
  }

  if (physicsEvents && physicsEvents.length > 0) {
    recordPhysicsStats(state, physicsEvents);
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
      state.stats.checkpointsHit = state.passedCheckpoints.length;
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
    state.resultReady = CONFIG.race.resultDelay <= 0;
    state.finishDelayTimer = Math.max(0, CONFIG.race.resultDelay);

    const finalTime = state.timer;
    const completedSplits = state.splits.map((sVal) => sVal ?? finalTime);
    const medal = determineMedal(finalTime, course.getMedals());
    const prevBestSplits = state.bestSplits ? [...state.bestSplits] : null;
    const splitDeltas = completedSplits.map((val, idx) => {
      const prev =
        prevBestSplits && idx < prevBestSplits.length ? prevBestSplits[idx] : null;
      return prev !== null && Number.isFinite(prev) ? val - prev : null;
    });

    const statsSnapshot: RaceStats = { ...state.stats };
    let isNewBest = state.bestTime === null || finalTime < state.bestTime;
    let rank: number | null = 1;
    let deltaToBest: number | null =
      state.bestTime !== null ? finalTime - state.bestTime : null;
    let isNewSplitBest = completedSplits.map((val, idx) => {
      const prev =
        prevBestSplits && idx < prevBestSplits.length ? prevBestSplits[idx] : null;
      return prev === null || !Number.isFinite(prev) || val < prev;
    });

    if (state.persistRecords) {
      const submitted = submitRun(course.getId(), {
        time: finalTime,
        splits: completedSplits,
        medal,
        stats: statsSnapshot,
      });
      isNewBest = submitted.isNewBest;
      rank = submitted.rank;
      deltaToBest = submitted.deltaToBest;
      isNewSplitBest = submitted.isNewSplitBest;
      state.bestTime = submitted.records.best ? submitted.records.best.time : finalTime;
      state.bestSplits = [...submitted.records.bestSplits];
    } else if (isNewBest) {
      state.bestTime = finalTime;
      state.bestSplits = [...completedSplits];
    }

    state.newBest = isNewBest;

    const finishData: FinishResultData = {
      time: finalTime,
      medal,
      isNewBest,
      rank,
      deltaToBest,
      splits: completedSplits,
      splitDeltas,
      isNewSplitBest,
      stats: statsSnapshot,
    };
    state.lastFinish = finishData;

    events.push({
      type: 'finish',
      ...finishData,
    });
    if (state.resultReady) {
      events.push({ type: 'resultReady' });
    }
  }

  return events;
}
