// src/core/ai/rng.ts

export interface SeededRng {
  readonly seed: number;
  next: () => number;
  range: (min: number, max: number) => number;
  int: (min: number, maxInclusive: number) => number;
  chance: (probability: number) => boolean;
}

export function createSeededRng(seed: number): SeededRng {
  let state = (seed | 0) >>> 0;
  if (state === 0) {
    state = 0x6d2b79f5;
  }

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const range = (min: number, max: number): number => min + (max - min) * next();

  const int = (min: number, maxInclusive: number): number => {
    if (maxInclusive <= min) {
      return min;
    }
    return min + Math.floor(next() * (maxInclusive - min + 1));
  };

  const chance = (probability: number): boolean => {
    if (probability <= 0) return false;
    if (probability >= 1) return true;
    return next() < probability;
  };

  return {
    seed: seed >>> 0,
    next,
    range,
    int,
    chance,
  };
}
