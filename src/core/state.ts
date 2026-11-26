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
import { applyGridStart, createGridCars } from './gridStart';
import type { CarState, PhysicsEvent } from './physics';

export type RacePhase = 'TITLE' | 'COUNTDOWN' | 'RACING' | 'FINISH';

export interface CarRaceSnapshot {
  s: number;
  sApprox: number;
  mode: 'grounded' | 'airborne' | 'falling';
  routeId?: string;
  routeLapOffset?: number;
  speedKmh?: number;
}

export interface RacerProgress {
  carIndex: number;
  currentLap: number;
  lapStartTime: number;
  lapTimes: number[];
  bestLap: number | null;
  nextCheckpointIndex: number;
  finished: boolean;
  dnf: boolean;
  finishTime: number | null;
}

export interface FinishClassificationEntry {
  carIndex: number;
  rank: number;
  name: string;
  color: string;
  isPlayer: boolean;
  totalTime: number | null;
  bestLap: number | null;
  dnf: boolean;
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
  lapTimes: number[];
  bestLap: number | null;
  stats: RaceStats;
  playerPosition?: number;
  totalRacers?: number;
  classification?: FinishClassificationEntry[];
}

export interface RaceState {
  phase: RacePhase;
  resultReady: boolean;
  finishDelayTimer: number;
  countdownTimer: number;
  countdownDisplayNumber: number;
  countdownStartMs: number | null;
  countdownPausedAtMs: number | null;
  countdownPausedTotalMs: number;
  countdownElapsedMs: number;
  countdownWatchdogTriggered: boolean;
  goHoldTimer: number;
  timer: number;
  laps: number;
  currentLap: number;
  lapStartTime: number;
  lapTimes: number[];
  bestLap: number | null;
  nextCheckpointIndex: number;
  passedCheckpoints: number[];
  splits: Array<number | null>;
  lastCheckpointIndex: number | null;
  routeId: string;
  bestTime: number | null;
  bestSplits: number[] | null;
  newBest: boolean;
  totalCheckpoints: number;
  stats: RaceStats;
  lastFinish: FinishResultData | null;
  persistRecords: boolean;
  cars: CarState[];
  racerProgress: RacerProgress[];
}

export type RaceEvent =
  | { type: 'countdownTick'; n: number }
  | { type: 'countdownWatchdog'; elapsedMs: number }
  | { type: 'go' }
  | {
      type: 'checkpoint';
      index: number;
      total: number;
      lap: number;
      totalLaps: number;
      time: number;
      delta: number | null;
    }
  | {
      type: 'lap';
      lap: number;
      totalLaps: number;
      lapTime: number;
      isBestLap: boolean;
    }
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

function createRacerProgressList(count: number): RacerProgress[] {
  const list: RacerProgress[] = [];
  for (let i = 0; i < count; i++) {
    list.push({
      carIndex: i,
      currentLap: 1,
      lapStartTime: 0,
      lapTimes: [],
      bestLap: null,
      nextCheckpointIndex: 0,
      finished: false,
      dnf: false,
      finishTime: null,
    });
  }
  return list;
}

function resetProgressFields(state: RaceState): void {
  state.resultReady = false;
  state.finishDelayTimer = 0;
  state.timer = 0;
  state.currentLap = 1;
  state.lapStartTime = 0;
  state.lapTimes = [];
  state.nextCheckpointIndex = 0;
  state.passedCheckpoints = [];
  state.splits = Array<number | null>(state.totalCheckpoints * state.laps).fill(null);
  state.lastCheckpointIndex = null;
  state.routeId = 'main';
  state.newBest = false;
  state.lastFinish = null;
  state.stats = createEmptyStats();
  state.countdownTimer = CONFIG.race.countdownSeconds;
  state.countdownDisplayNumber = Math.max(1, Math.ceil(CONFIG.race.countdownSeconds));
  state.countdownStartMs = null;
  state.countdownPausedAtMs = null;
  state.countdownPausedTotalMs = 0;
  state.countdownElapsedMs = 0;
  state.countdownWatchdogTriggered = false;
  state.goHoldTimer = 0;
  state.racerProgress = createRacerProgressList(state.cars.length);
}

export function createRaceState(course: Course, options?: CreateRaceStateOptions): RaceState {
  const totalCheckpoints = course.getCheckpoints().length;
  const laps = course.getLaps();
  const totalSplitCount = totalCheckpoints * laps;
  const persistRecords = options?.persistRecords ?? true;
  const records = persistRecords ? getRecords(course.getId(), course.getMedals()) : null;
  const bestSplits =
    records && records.bestSplits.length === totalSplitCount ? [...records.bestSplits] : null;

  const cars = createGridCars(course);
  return {
    phase: 'TITLE',
    resultReady: false,
    finishDelayTimer: 0,
    countdownTimer: 0,
    countdownDisplayNumber: 0,
    countdownStartMs: null,
    countdownPausedAtMs: null,
    countdownPausedTotalMs: 0,
    countdownElapsedMs: 0,
    countdownWatchdogTriggered: false,
    goHoldTimer: 0,
    timer: 0,
    laps,
    currentLap: 1,
    lapStartTime: 0,
    lapTimes: [],
    bestLap: records?.bestLap ?? null,
    nextCheckpointIndex: 0,
    passedCheckpoints: [],
    splits: Array<number | null>(totalSplitCount).fill(null),
    lastCheckpointIndex: null,
    routeId: 'main',
    bestTime: records?.best ? records.best.time : null,
    bestSplits,
    newBest: false,
    totalCheckpoints,
    stats: createEmptyStats(),
    lastFinish: null,
    persistRecords,
    cars,
    racerProgress: createRacerProgressList(cars.length),
  };
}

export function refreshRaceRecords(state: RaceState, course: Course): void {
  if (!state.persistRecords) {
    state.bestTime = null;
    state.bestSplits = null;
    state.bestLap = null;
    return;
  }
  const records = getRecords(course.getId(), course.getMedals());
  const totalSplitCount = state.totalCheckpoints * state.laps;
  state.bestTime = records.best ? records.best.time : null;
  state.bestLap = records.bestLap ?? null;
  state.bestSplits =
    records.bestSplits.length === totalSplitCount ? [...records.bestSplits] : null;
}

export function startCountdown(state: RaceState, nowMs?: number, course?: Course): RaceEvent[] {
  resetProgressFields(state);
  if (course) {
    applyGridStart(state.cars, course);
  }
  state.phase = 'COUNTDOWN';
  state.countdownStartMs = typeof nowMs === 'number' && Number.isFinite(nowMs) ? nowMs : null;
  return [{ type: 'countdownTick', n: state.countdownDisplayNumber }];
}

export function restartRace(state: RaceState, nowMs?: number, course?: Course): RaceEvent[] {
  resetProgressFields(state);
  if (course) {
    applyGridStart(state.cars, course);
  }
  state.phase = 'COUNTDOWN';
  state.countdownStartMs = typeof nowMs === 'number' && Number.isFinite(nowMs) ? nowMs : null;
  return [
    { type: 'restart' },
    { type: 'countdownTick', n: state.countdownDisplayNumber },
  ];
}

export function pauseRaceClock(state: RaceState, nowMs: number): void {
  if (state.phase !== 'COUNTDOWN' || state.countdownStartMs === null) {
    return;
  }
  if (state.countdownPausedAtMs === null) {
    state.countdownPausedAtMs = nowMs;
  }
}

export function resumeRaceClock(state: RaceState, nowMs: number): void {
  if (state.phase !== 'COUNTDOWN' || state.countdownStartMs === null) {
    state.countdownPausedAtMs = null;
    return;
  }
  if (state.countdownPausedAtMs !== null) {
    state.countdownPausedTotalMs += Math.max(0, nowMs - state.countdownPausedAtMs);
    state.countdownPausedAtMs = null;
  }
}

export function returnToTitle(state: RaceState, course: Course): RaceEvent[] {
  resetProgressFields(state);
  applyGridStart(state.cars, course);
  refreshRaceRecords(state, course);
  state.phase = 'TITLE';
  state.countdownTimer = 0;
  state.countdownDisplayNumber = 0;
  return [{ type: 'toTitle' }];
}

export function getRespawnTarget(
  state: RaceState,
  course: Course,
): { routeId: string; s: number; lateral: number } {
  if (state.lastCheckpointIndex !== null) {
    const cpFrame = course.getCheckpointFrame(state.lastCheckpointIndex);
    const lapOffset = course.isClosed() ? (state.currentLap - 1) * course.getLength() : 0;
    return { routeId: 'main', s: lapOffset + cpFrame.s, lateral: 0 };
  }
  if (course.isClosed() && state.currentLap > 1) {
    return { routeId: 'main', s: (state.currentLap - 1) * course.getLength(), lateral: 0 };
  }
  const slot0 = course.getGridSlots(course.getRacers())[0];
  return { routeId: 'main', s: slot0.s, lateral: slot0.lateral };
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
  nowMs?: number,
): RaceEvent[] {
  const events: RaceEvent[] = [];

  if (state.phase === 'COUNTDOWN') {
    if (typeof nowMs === 'number' && Number.isFinite(nowMs)) {
      if (state.countdownStartMs === null) {
        state.countdownStartMs = nowMs;
      }
      if (state.countdownPausedAtMs !== null) {
        return events;
      }

      const elapsedMs = Math.max(0, nowMs - state.countdownStartMs - state.countdownPausedTotalMs);
      state.countdownElapsedMs = elapsedMs;

      if (elapsedMs >= CONFIG.race.countdownWatchdogMs) {
        state.phase = 'RACING';
        state.countdownTimer = 0;
        state.countdownDisplayNumber = 0;
        state.countdownWatchdogTriggered = true;
        state.goHoldTimer = CONFIG.race.goHoldSeconds;
        state.timer = 0;
        events.push({ type: 'countdownWatchdog', elapsedMs });
        events.push({ type: 'go' });
        return events;
      }

      const stepMs = Math.max(100, CONFIG.race.countdownStepMs);
      const totalCountdownMs = CONFIG.race.countdownSeconds * stepMs;
      const remainingMs = totalCountdownMs - elapsedMs;
      if (remainingMs > 0) {
        state.countdownTimer = remainingMs / 1000;
        const displayNum = Math.max(
          1,
          Math.min(CONFIG.race.countdownSeconds, Math.ceil(remainingMs / stepMs)),
        );
        if (displayNum !== state.countdownDisplayNumber) {
          state.countdownDisplayNumber = displayNum;
          events.push({ type: 'countdownTick', n: displayNum });
        }
        return events;
      }

      const overflowDt = Math.max(0, -remainingMs / 1000);
      state.phase = 'RACING';
      state.countdownTimer = 0;
      state.countdownDisplayNumber = 0;
      state.goHoldTimer = CONFIG.race.goHoldSeconds;
      state.timer = overflowDt;
      events.push({ type: 'go' });
      return events;
    }

    state.countdownTimer -= dt;
    state.countdownElapsedMs += Math.max(0, dt) * 1000;
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

  const activeRouteId = car.routeId ?? 'main';
  state.routeId = activeRouteId;
  const rawActiveS = car.mode === 'grounded' ? car.s : car.sApprox;
  const activeS = (car.routeLapOffset ?? 0) + course.getProgressS(activeRouteId, rawActiveS);
  const checkpoints = course.getCheckpoints();
  const lapLength = course.getLength();
  const isClosed = course.isClosed();

  const advanceLapCheckpoints = (): void => {
    const lapOffset = isClosed ? (state.currentLap - 1) * lapLength : 0;
    while (state.nextCheckpointIndex < checkpoints.length) {
      const cp = checkpoints[state.nextCheckpointIndex];
      if (activeS >= lapOffset + cp.s) {
        const idx = state.nextCheckpointIndex;
        const splitIdx = (state.currentLap - 1) * checkpoints.length + idx;
        const splitTime = state.timer;
        const prevBestSplit =
          state.bestSplits && splitIdx < state.bestSplits.length
            ? state.bestSplits[splitIdx]
            : null;
        const delta =
          prevBestSplit !== null && Number.isFinite(prevBestSplit)
            ? splitTime - prevBestSplit
            : null;

        state.splits[splitIdx] = splitTime;
        state.passedCheckpoints.push(splitIdx);
        state.stats.checkpointsHit = state.passedCheckpoints.length;
        // Keep respawn anchors strictly on main track so branch falls/resets get a clean run-up
        if (activeRouteId === 'main') {
          state.lastCheckpointIndex = idx;
        }
        state.nextCheckpointIndex++;

        events.push({
          type: 'checkpoint',
          index: idx,
          total: checkpoints.length,
          lap: state.currentLap,
          totalLaps: state.laps,
          time: splitTime,
          delta,
        });
      } else {
        break;
      }
    }
  };

  advanceLapCheckpoints();

  // Intermediate lap crossing on closed multi-lap courses (anti-cheat: all lap checkpoints required)
  while (
    isClosed &&
    state.currentLap < state.laps &&
    state.nextCheckpointIndex >= checkpoints.length &&
    activeS >= state.currentLap * lapLength
  ) {
    const completedLap = state.currentLap;
    const lapTime = Math.max(0, state.timer - state.lapStartTime);
    state.lapTimes.push(lapTime);
    const isBestLap = state.bestLap === null || lapTime < state.bestLap;
    if (isBestLap) {
      state.bestLap = lapTime;
    }
    state.lapStartTime = state.timer;
    state.currentLap++;
    state.nextCheckpointIndex = 0;
    state.lastCheckpointIndex = null;

    events.push({
      type: 'lap',
      lap: completedLap,
      totalLaps: state.laps,
      lapTime,
      isBestLap,
    });

    advanceLapCheckpoints();
  }

  const readyToFinish = isClosed
    ? state.currentLap >= state.laps &&
      state.nextCheckpointIndex >= checkpoints.length &&
      activeS >= course.getFinishS()
    : activeS >= course.getFinishS();

  if (readyToFinish) {
    state.phase = 'FINISH';
    state.goHoldTimer = 0;
    state.resultReady = CONFIG.race.resultDelay <= 0;
    state.finishDelayTimer = Math.max(0, CONFIG.race.resultDelay);

    const finalTime = state.timer;
    if (isClosed && state.laps > 1) {
      const finalLapTime = Math.max(0, finalTime - state.lapStartTime);
      state.lapTimes.push(finalLapTime);
      if (state.bestLap === null || finalLapTime < state.bestLap) {
        state.bestLap = finalLapTime;
      }
    }

    const completedSplits = state.splits.map((sVal) => sVal ?? finalTime);
    const medal = determineMedal(finalTime, course.getMedals());
    const prevBestSplits = state.bestSplits ? [...state.bestSplits] : null;
    const splitDeltas = completedSplits.map((val, idx) => {
      const prev =
        prevBestSplits && idx < prevBestSplits.length ? prevBestSplits[idx] : null;
      return prev !== null && Number.isFinite(prev) ? val - prev : null;
    });

    const statsSnapshot: RaceStats = { ...state.stats };
    const lapTimesSnapshot = [...state.lapTimes];
    let isNewBest = state.bestTime === null || finalTime < state.bestTime;
    let rank: number | null = 1;
    let deltaToBest: number | null =
      state.bestTime !== null ? finalTime - state.bestTime : null;
    let isNewSplitBest = completedSplits.map((val, idx) => {
      const prev =
        prevBestSplits && idx < prevBestSplits.length ? prevBestSplits[idx] : null;
      return prev === null || !Number.isFinite(prev) || val < prev;
    });

    if (state.racerProgress[0]) {
      const rp0 = state.racerProgress[0];
      rp0.currentLap = state.currentLap;
      rp0.lapStartTime = state.lapStartTime;
      rp0.lapTimes = [...lapTimesSnapshot];
      rp0.bestLap =
        lapTimesSnapshot.length > 0 ? Math.min(...lapTimesSnapshot) : state.bestLap;
      rp0.nextCheckpointIndex = state.nextCheckpointIndex;
      rp0.finished = true;
      rp0.dnf = false;
      rp0.finishTime = finalTime;
    }

    let finishedAhead = 0;
    for (let i = 1; i < state.racerProgress.length; i++) {
      const rp = state.racerProgress[i];
      if (rp && rp.finished && !rp.dnf && rp.finishTime !== null && rp.finishTime <= finalTime) {
        finishedAhead++;
      }
    }
    const playerPosition = state.cars.length > 1 ? finishedAhead + 1 : 1;

    if (state.persistRecords) {
      const submitted = submitRun(course.getId(), {
        time: finalTime,
        splits: completedSplits,
        lapTimes: lapTimesSnapshot,
        bestLap: state.bestLap,
        medal,
        stats: statsSnapshot,
        position: state.cars.length > 1 ? playerPosition : undefined,
      });
      isNewBest = submitted.isNewBest;
      rank = submitted.rank;
      deltaToBest = submitted.deltaToBest;
      isNewSplitBest = submitted.isNewSplitBest;
      state.bestTime = submitted.records.best ? submitted.records.best.time : finalTime;
      state.bestSplits = [...submitted.records.bestSplits];
      state.bestLap = submitted.records.bestLap ?? state.bestLap;
    } else if (isNewBest) {
      state.bestTime = finalTime;
      state.bestSplits = [...completedSplits];
    }

    state.newBest = isNewBest;

    const classification = buildClassification(state, course);

    const finishData: FinishResultData = {
      time: finalTime,
      medal,
      isNewBest,
      rank,
      deltaToBest,
      splits: completedSplits,
      splitDeltas,
      isNewSplitBest,
      lapTimes: lapTimesSnapshot,
      bestLap: state.bestLap,
      stats: statsSnapshot,
      playerPosition,
      totalRacers: state.cars.length,
      classification,
    };
    state.lastFinish = finishData;

    events.push({
      type: 'finish',
      ...finishData,
    });
    if (state.resultReady) {
      events.push({ type: 'resultReady' });
    }
  } else if (state.racerProgress[0]) {
    const rp0 = state.racerProgress[0];
    rp0.currentLap = state.currentLap;
    rp0.lapStartTime = state.lapStartTime;
    rp0.lapTimes = [...state.lapTimes];
    rp0.bestLap = state.lapTimes.length > 0 ? Math.min(...state.lapTimes) : null;
    rp0.nextCheckpointIndex = state.nextCheckpointIndex;
  }

  return events;
}

export function updateOpponentProgress(
  state: RaceState,
  course: Course,
  simTime: number,
): void {
  if (state.cars.length <= 1) {
    return;
  }
  const checkpoints = course.getCheckpoints();
  const lapLength = course.getLength();
  const isClosed = course.isClosed();
  const totalLaps = state.laps;
  const finishS = course.getFinishS();

  for (let i = 1; i < state.cars.length; i++) {
    const car = state.cars[i];
    const rp = state.racerProgress[i];
    if (!car || !rp || rp.finished) {
      continue;
    }

    const rawActiveS = car.mode === 'grounded' ? car.s : car.sApprox;
    const activeS =
      (car.routeId !== 'main' ? car.routeLapOffset : 0) +
      course.getProgressS(car.routeId, rawActiveS);

    const advanceCps = (): void => {
      const lapOffset = isClosed ? (rp.currentLap - 1) * lapLength : 0;
      while (rp.nextCheckpointIndex < checkpoints.length) {
        const cp = checkpoints[rp.nextCheckpointIndex];
        if (activeS >= lapOffset + cp.s) {
          rp.nextCheckpointIndex++;
        } else {
          break;
        }
      }
    };

    advanceCps();

    while (
      isClosed &&
      rp.currentLap < totalLaps &&
      rp.nextCheckpointIndex >= checkpoints.length &&
      activeS >= rp.currentLap * lapLength
    ) {
      const lapTime = Math.max(0, simTime - rp.lapStartTime);
      rp.lapTimes.push(lapTime);
      if (rp.bestLap === null || lapTime < rp.bestLap) {
        rp.bestLap = lapTime;
      }
      rp.lapStartTime = simTime;
      rp.currentLap++;
      rp.nextCheckpointIndex = 0;
      advanceCps();
    }

    const done = isClosed
      ? rp.currentLap >= totalLaps &&
        rp.nextCheckpointIndex >= checkpoints.length &&
        activeS >= finishS
      : activeS >= finishS;

    if (done) {
      if (isClosed && totalLaps > 1) {
        const finalLap = Math.max(0, simTime - rp.lapStartTime);
        rp.lapTimes.push(finalLap);
        if (rp.bestLap === null || finalLap < rp.bestLap) {
          rp.bestLap = finalLap;
        }
      }
      rp.finished = true;
      rp.dnf = false;
      rp.finishTime = simTime;
    }
  }
}

export function buildClassification(
  state: RaceState,
  course: Course,
): FinishClassificationEntry[] {
  const playerColor = CONFIG.car.visual.multiplayerPalettes[0]?.body ?? '#FF2D3D';

  const rows = state.cars.map((car, i) => {
    const rp = state.racerProgress[i];
    const isPlayer = i === 0;
    const rival = isPlayer ? null : CONFIG.ai.rivals[(i - 1) % CONFIG.ai.rivals.length];
    const rawS = car.mode === 'grounded' ? car.s : car.sApprox;
    const prog = (car.routeId !== 'main' ? car.routeLapOffset : 0) + course.getProgressS(car.routeId, rawS);
    const finished = rp ? rp.finished : false;
    const dnf = rp ? rp.dnf : false;
    const totalTime = rp ? rp.finishTime : null;
    const bestLap = rp
      ? rp.bestLap
      : isPlayer && state.lapTimes.length > 0
        ? Math.min(...state.lapTimes)
        : null;
    return {
      carIndex: i,
      name: isPlayer ? 'Kamu' : rival?.name ?? `Lawan ${i}`,
      color: isPlayer ? playerColor : rival?.color ?? '#0A5CFF',
      isPlayer,
      finished,
      dnf,
      totalTime,
      bestLap,
      progress: prog,
    };
  });

  rows.sort((a, b) => {
    const aOk = a.finished && !a.dnf && a.totalTime !== null;
    const bOk = b.finished && !b.dnf && b.totalTime !== null;
    if (aOk && bOk) return (a.totalTime as number) - (b.totalTime as number);
    if (aOk) return -1;
    if (bOk) return 1;
    if (a.dnf !== b.dnf) return a.dnf ? 1 : -1;
    return b.progress - a.progress;
  });

  return rows.map((r, idx) => ({
    carIndex: r.carIndex,
    rank: idx + 1,
    name: r.name,
    color: r.color,
    isPlayer: r.isPlayer,
    totalTime: r.totalTime,
    bestLap: r.bestLap,
    dnf: r.dnf,
  }));
}

export function markUnfinishedAsDnfAndFinalize(state: RaceState, course: Course): void {
  for (let i = 1; i < state.racerProgress.length; i++) {
    const rp = state.racerProgress[i];
    if (rp && !rp.finished) {
      rp.dnf = true;
      rp.finished = true;
      rp.finishTime = null;
    }
  }
  if (state.lastFinish) {
    const classification = buildClassification(state, course);
    state.lastFinish.classification = classification;
    const playerEntry = classification.find((e) => e.isPlayer);
    if (playerEntry) {
      state.lastFinish.playerPosition = playerEntry.rank;
    }
    state.lastFinish.totalRacers = state.cars.length;
  }
}
