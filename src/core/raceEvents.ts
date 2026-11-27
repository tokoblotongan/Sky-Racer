// src/core/raceEvents.ts

import type { MedalType } from '../services/records';

export type GameFlowState =
  | 'title'
  | 'intro'
  | 'countdown'
  | 'racing'
  | 'finished'
  | 'podium';

export interface RaceEventMap {
  gameStateChanged: {
    state: GameFlowState;
    prevState: GameFlowState;
    courseId: string;
  };
  raceStart: {
    courseId: string;
    totalLaps: number;
    totalRacers: number;
  };
  lapChanged: {
    lap: number;
    totalLaps: number;
    completedLap: number;
    lapTime: number;
    isBestLap: boolean;
  };
  lastLapStarted: {
    lap: number;
    totalLaps: number;
    courseId: string;
  };
  playerFinished: {
    position: number;
    totalRacers: number;
    time: number;
    medal: MedalType;
    isNewBest: boolean;
  };
  resultWin: {
    position: number;
    totalRacers: number;
    time: number;
    medal: MedalType;
    courseId: string;
  };
  resultLose: {
    position: number;
    totalRacers: number;
    time: number;
    medal: MedalType;
    courseId: string;
  };
  hazardHit: {
    carIndex: number;
    kind: string;
  };
  ringPass: {
    carIndex: number;
    boostSeconds: number;
  };
  boostStarted: {
    carIndex: number;
    source: 'pad' | 'ring';
  };
}

export type RaceEventName = keyof RaceEventMap;
export type RaceEventListener<K extends RaceEventName> = (payload: RaceEventMap[K]) => void;

export interface RaceEventBus {
  on: <K extends RaceEventName>(event: K, listener: RaceEventListener<K>) => () => void;
  once: <K extends RaceEventName>(event: K, listener: RaceEventListener<K>) => () => void;
  emit: <K extends RaceEventName>(event: K, payload: RaceEventMap[K]) => void;
  clear: () => void;
  dispose: () => void;
}

export function createRaceEventBus(): RaceEventBus {
  const listeners = new Map<RaceEventName, Set<RaceEventListener<RaceEventName>>>();
  let disposed = false;

  const on = <K extends RaceEventName>(
    event: K,
    listener: RaceEventListener<K>,
  ): (() => void) => {
    if (disposed) {
      return () => {};
    }
    let set = listeners.get(event);
    if (!set) {
      set = new Set();
      listeners.set(event, set);
    }
    const wrapped = listener as RaceEventListener<RaceEventName>;
    set.add(wrapped);
    return () => {
      set?.delete(wrapped);
    };
  };

  const once = <K extends RaceEventName>(
    event: K,
    listener: RaceEventListener<K>,
  ): (() => void) => {
    let off: () => void = () => {};
    const wrapped: RaceEventListener<K> = (payload) => {
      off();
      listener(payload);
    };
    off = on(event, wrapped);
    return off;
  };

  const emit = <K extends RaceEventName>(event: K, payload: RaceEventMap[K]): void => {
    if (disposed) {
      return;
    }
    const set = listeners.get(event);
    if (!set || set.size === 0) {
      return;
    }
    const snapshot = Array.from(set);
    for (let i = 0; i < snapshot.length; i++) {
      (snapshot[i] as RaceEventListener<K>)(payload);
    }
  };

  const clear = (): void => {
    listeners.clear();
  };

  const dispose = (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    listeners.clear();
  };

  return {
    on,
    once,
    emit,
    clear,
    dispose,
  };
}
