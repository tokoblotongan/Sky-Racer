// src/core/standings.ts

import { CONFIG } from '../config';
import type { Course } from './course';
import type { CarState } from './physics';
import type { RaceState } from './state';

export interface RacerIdentity {
  readonly carIndex: number;
  readonly name: string;
  readonly color: string;
  readonly isPlayer: boolean;
}

export interface RacerStandingEntry {
  readonly carIndex: number;
  readonly rank: number;
  readonly name: string;
  readonly color: string;
  readonly isPlayer: boolean;
  readonly finished: boolean;
  readonly dnf: boolean;
  readonly finishTime: number | null;
  readonly bestLap: number | null;
  readonly progressMeters: number;
  readonly gapSeconds: number;
  readonly lap: number;
}

export interface OvertakeEvent {
  readonly type: 'overtake' | 'overtaken';
  readonly newRank: number;
  readonly rivalName: string;
}

export interface StandingsUpdateResult {
  readonly entries: readonly RacerStandingEntry[];
  readonly playerRank: number;
  readonly rawPlayerRank: number;
  readonly overtakeEvent: OvertakeEvent | null;
}

export interface StandingsTracker {
  reset: () => void;
  getIdentities: () => readonly RacerIdentity[];
  getLastSnapshot: () => readonly RacerStandingEntry[];
  update: (
    cars: readonly CarState[],
    course: Course,
    raceState: RaceState,
    dt: number,
  ) => StandingsUpdateResult;
}

export function getRacerIdentities(totalRacers: number): RacerIdentity[] {
  const count = Math.max(1, totalRacers);
  const playerPalette = CONFIG.car.visual.multiplayerPalettes[0];
  const out: RacerIdentity[] = [
    {
      carIndex: 0,
      name: 'Kamu',
      color: playerPalette?.body ?? '#FF2D3D',
      isPlayer: true,
    },
  ];
  for (let i = 1; i < count; i++) {
    const rival = CONFIG.ai.rivals[(i - 1) % CONFIG.ai.rivals.length];
    out.push({
      carIndex: i,
      name: rival.name,
      color: rival.color,
      isPlayer: false,
    });
  }
  return out;
}

export function computeCarProgressMeters(car: CarState, course: Course): number {
  const rawS = car.mode === 'grounded' ? car.s : car.sApprox;
  const lapOffset = car.routeId !== 'main' ? car.routeLapOffset : 0;
  return lapOffset + course.getProgressS(car.routeId, rawS);
}

export function createStandingsTracker(totalRacers: number): StandingsTracker {
  let identities = getRacerIdentities(totalRacers);
  let lastSnapshot: RacerStandingEntry[] = [];
  let confirmedPlayerRank = 1;
  let candidatePlayerRank = 1;
  let candidateElapsedMs = 0;
  let raceSettleTimerSec = 0;
  let prevConfirmedOrder: number[] = [];

  const reset = (): void => {
    identities = getRacerIdentities(identities.length);
    lastSnapshot = [];
    confirmedPlayerRank = 1;
    candidatePlayerRank = 1;
    candidateElapsedMs = 0;
    raceSettleTimerSec = 0;
    prevConfirmedOrder = [];
  };

  const update = (
    cars: readonly CarState[],
    course: Course,
    raceState: RaceState,
    dt: number,
  ): StandingsUpdateResult => {
    const count = Math.min(cars.length, Math.max(1, course.getRacers()));
    if (identities.length !== count) {
      identities = getRacerIdentities(count);
    }

    if (raceState.phase === 'RACING') {
      raceSettleTimerSec += Math.max(0, dt);
    } else if (raceState.phase === 'TITLE' || raceState.phase === 'COUNTDOWN') {
      raceSettleTimerSec = 0;
      confirmedPlayerRank = 1;
      candidatePlayerRank = 1;
      candidateElapsedMs = 0;
      prevConfirmedOrder = [];
    }

    const lapLen = Math.max(1, course.getLength());
    const totalLaps = Math.max(1, course.getLaps());
    const racerStates = raceState.racerProgress;

    const rawRows: Array<{
      carIndex: number;
      identity: RacerIdentity;
      finished: boolean;
      dnf: boolean;
      finishTime: number | null;
      bestLap: number | null;
      progressMeters: number;
      speed: number;
      lap: number;
    }> = [];

    for (let i = 0; i < count; i++) {
      const car = cars[i];
      const identity = identities[i];
      const rp = racerStates?.[i];
      const progressMeters = computeCarProgressMeters(car, course);
      const finished = rp ? rp.finished : i === 0 && raceState.phase === 'FINISH';
      const dnf = rp ? rp.dnf : false;
      const finishTime = rp
        ? rp.finishTime
        : i === 0 && raceState.phase === 'FINISH' && raceState.lastFinish
          ? raceState.lastFinish.time
          : null;
      const bestLap = rp ? rp.bestLap : i === 0 ? raceState.bestLap : null;
      const lap = rp
        ? rp.currentLap
        : Math.max(1, Math.min(totalLaps, Math.floor(Math.max(0, progressMeters) / lapLen) + 1));

      rawRows.push({
        carIndex: i,
        identity,
        finished,
        dnf,
        finishTime,
        bestLap,
        progressMeters,
        speed: Math.max(12, Math.abs(car.vForward)),
        lap,
      });
    }

    rawRows.sort((a, b) => {
      // Finished racers (non-DNF) come first, ordered by finish time
      const aFinOk = a.finished && !a.dnf && a.finishTime !== null;
      const bFinOk = b.finished && !b.dnf && b.finishTime !== null;
      if (aFinOk && bFinOk) {
        return (a.finishTime as number) - (b.finishTime as number);
      }
      if (aFinOk) return -1;
      if (bFinOk) return 1;

      // Unfinished active racers come before DNF
      if (a.dnf !== b.dnf) {
        return a.dnf ? 1 : -1;
      }

      const diff = b.progressMeters - a.progressMeters;
      if (Math.abs(diff) > 1e-3) {
        return diff;
      }
      return a.carIndex - b.carIndex;
    });

    const leader = rawRows[0];
    const entries: RacerStandingEntry[] = [];
    let rawPlayerRank = 1;

    for (let idx = 0; idx < rawRows.length; idx++) {
      const row = rawRows[idx];
      const rank = idx + 1;
      if (row.identity.isPlayer) {
        rawPlayerRank = rank;
      }

      let gapSeconds = 0;
      if (idx > 0 && leader) {
        if (
          row.finished &&
          !row.dnf &&
          leader.finished &&
          !leader.dnf &&
          row.finishTime !== null &&
          leader.finishTime !== null
        ) {
          gapSeconds = Math.max(0, row.finishTime - leader.finishTime);
        } else {
          const distGap = Math.max(0, leader.progressMeters - row.progressMeters);
          gapSeconds = distGap / Math.max(12, row.speed);
        }
      }

      entries.push({
        carIndex: row.carIndex,
        rank,
        name: row.identity.name,
        color: row.identity.color,
        isPlayer: row.identity.isPlayer,
        finished: row.finished,
        dnf: row.dnf,
        finishTime: row.finishTime,
        bestLap: row.bestLap,
        progressMeters: row.progressMeters,
        gapSeconds,
        lap: row.lap,
      });
    }

    lastSnapshot = entries;

    // Debounce rank swaps for display HUD & overtake/overtaken audio/toast cues
    let overtakeEvent: OvertakeEvent | null = null;
    const currentOrder = entries.map((e) => e.carIndex);

    if (raceState.phase === 'FINISH') {
      confirmedPlayerRank = rawPlayerRank;
      candidatePlayerRank = rawPlayerRank;
      candidateElapsedMs = 0;
    } else if (raceState.phase === 'RACING') {
      if (raceSettleTimerSec < 0.35) {
        confirmedPlayerRank = rawPlayerRank;
        candidatePlayerRank = rawPlayerRank;
        candidateElapsedMs = 0;
        prevConfirmedOrder = currentOrder;
      } else if (rawPlayerRank === confirmedPlayerRank) {
        candidatePlayerRank = confirmedPlayerRank;
        candidateElapsedMs = 0;
        prevConfirmedOrder = currentOrder;
      } else {
        if (rawPlayerRank !== candidatePlayerRank) {
          candidatePlayerRank = rawPlayerRank;
          candidateElapsedMs = Math.max(0, dt) * 1000;
        } else {
          candidateElapsedMs += Math.max(0, dt) * 1000;
        }

        if (candidateElapsedMs >= CONFIG.standings.debounceMs) {
          const prevRank = confirmedPlayerRank;
          confirmedPlayerRank = candidatePlayerRank;
          candidateElapsedMs = 0;

          if (raceSettleTimerSec >= 1.5 && count > 1 && prevRank !== confirmedPlayerRank) {
            const playerPassed = confirmedPlayerRank < prevRank;
            // Identify closest rival displaced around player's new slot
            let rivalName = 'Lawan';
            if (playerPassed) {
              const targetCarIdx = currentOrder[confirmedPlayerRank];
              const target = entries.find((e) => e.carIndex === targetCarIdx);
              if (target && !target.isPlayer) rivalName = target.name;
            } else {
              const aheadIdx = prevConfirmedOrder[prevRank - 1];
              const candidateAhead = entries[confirmedPlayerRank - 2];
              if (candidateAhead && !candidateAhead.isPlayer) {
                rivalName = candidateAhead.name;
              } else if (aheadIdx !== undefined) {
                const target = entries.find((e) => e.carIndex === aheadIdx);
                if (target && !target.isPlayer) rivalName = target.name;
              }
            }

            overtakeEvent = {
              type: playerPassed ? 'overtake' : 'overtaken',
              newRank: confirmedPlayerRank,
              rivalName,
            };
          }
          prevConfirmedOrder = currentOrder;
        }
      }
    }

    return {
      entries,
      playerRank: confirmedPlayerRank,
      rawPlayerRank,
      overtakeEvent,
    };
  };

  return {
    reset,
    getIdentities: () => identities,
    getLastSnapshot: () => lastSnapshot,
    update,
  };
}
