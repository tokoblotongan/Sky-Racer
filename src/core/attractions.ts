// src/core/attractions.ts

import { CONFIG, type AiDifficulty } from '../config';
import type { Course } from './course';
import {
  createFantasyLandAttractionsPlan,
  type FantasyLandAttractionsPlan,
  type JellyPuddleAttractionSpec,
  type PendulumAttractionSpec,
  type RollingBallGroupSpec,
  type WindFanAttractionSpec,
} from '../courses/fantasyLandAttractions';

export interface PendulumState {
  readonly spec: PendulumAttractionSpec;
  angleRad: number;
  bobLateral: number;
  bobHeightAboveDeck: number;
  safeLaneLeftWidth: number;
  safeLaneRightWidth: number;
  active: boolean;
  /** Normalized 0..1 intensity for floor telegraph warning (>=1.2s anticipation + always visible) */
  warningLevel: number;
  dangerLaneSide: -1 | 0 | 1;
}

export interface RollingBallRuntime {
  readonly id: string;
  readonly s: number;
  lateral: number;
  spinAngleRad: number;
  /** Direction of lateral travel (-1 or +1) */
  velocitySign: -1 | 1;
}

export interface RollingBallGroupState {
  readonly spec: RollingBallGroupSpec;
  readonly balls: RollingBallRuntime[];
  active: boolean;
  warningLevel: number;
  minSafeLaneFraction: number;
}

export interface WindFanState {
  readonly spec: WindFanAttractionSpec;
  fanAngleRad: number;
  /** Current normalized intensity 0..1 */
  strength01: number;
  peakAccel: number;
  active: boolean;
  warningLevel: number;
}

export interface JellyPuddleState {
  readonly spec: JellyPuddleAttractionSpec;
  uvOffset: number;
  active: boolean;
  warningLevel: number;
}

export interface BoostRingState {
  readonly id: string;
  readonly routeId: string;
  readonly s: number;
  readonly lateral: number;
  readonly yOffset: number;
  readonly variant: 'cyan' | 'yellow';
  readonly spinAngleRad: number;
  readonly pulseScale: number;
}

export interface MinimapAttractionMarker {
  readonly kind: 'hazard' | 'ring';
  readonly routeId: string;
  readonly s: number;
  readonly lateral: number;
}

export interface AttractionSystem {
  readonly plan: FantasyLandAttractionsPlan;
  isActive: () => boolean;
  setEnabled: (enabled: boolean) => void;
  getEnabled: () => boolean;
  setDifficulty: (difficulty: AiDifficulty) => void;
  getDifficulty: () => AiDifficulty;
  reset: () => void;
  evaluateAtTime: (raceTimeSec: number) => void;
  getTimeSec: () => number;
  getPendulums: () => readonly PendulumState[];
  getBallGroups: () => readonly RollingBallGroupState[];
  getWindFans: () => readonly WindFanState[];
  getJellyPuddles: () => readonly JellyPuddleState[];
  getBoostRings: () => readonly BoostRingState[];
  getWindAccelAt: (routeId: string, s: number) => number;
  getNearestWindFanProximity: (
    px: number,
    py: number,
    pz: number,
    maxDistMeters: number,
  ) => number;
  getMinimapMarkers: () => readonly MinimapAttractionMarker[];
}

export function triangleWave01(phase01: number): number {
  const p = ((phase01 % 1) + 1) % 1;
  if (p < 0.25) return p * 4;
  if (p < 0.75) return 2 - p * 4;
  return p * 4 - 4;
}

function triangleSlopeSign(phase01: number): -1 | 1 {
  const p = ((phase01 % 1) + 1) % 1;
  return p < 0.25 || p >= 0.75 ? 1 : -1;
}

export function createAttractionSystem(
  course: Course,
  initialEnabled = true,
  initialDifficulty: AiDifficulty = CONFIG.ai.defaultDifficulty,
  hasAttractions?: boolean,
): AttractionSystem {
  const plan = createFantasyLandAttractionsPlan(course, hasAttractions);
  let enabled = initialEnabled;
  let difficulty: AiDifficulty = initialDifficulty;
  let lastTimeSec = 0;

  const pendulums: PendulumState[] = plan.pendulums.map((spec) => ({
    spec,
    angleRad: 0,
    bobLateral: 0,
    bobHeightAboveDeck: CONFIG.attractions.pendulum.pivotHeight - CONFIG.attractions.pendulum.armLength,
    safeLaneLeftWidth: spec.trackWidth * 0.5,
    safeLaneRightWidth: spec.trackWidth * 0.5,
    active: false,
    warningLevel: 1,
    dangerLaneSide: 0,
  }));

  const ballGroups: RollingBallGroupState[] = plan.ballGroups.map((spec) => ({
    spec,
    balls: spec.balls.map((b) => ({
      id: b.id,
      s: b.s,
      lateral: 0,
      spinAngleRad: 0,
      velocitySign: 1,
    })),
    active: false,
    warningLevel: 1,
    minSafeLaneFraction: 0.45,
  }));

  const windFans: WindFanState[] = plan.windFans.map((spec) => ({
    spec,
    fanAngleRad: 0,
    strength01: 0,
    peakAccel: 0,
    active: false,
    warningLevel: 1,
  }));

  const jellyPuddles: JellyPuddleState[] = plan.jellyPuddles.map((spec) => ({
    spec,
    uvOffset: 0,
    active: false,
    warningLevel: 1,
  }));

  const boostRings: BoostRingState[] = plan.boostRings.map((spec) => ({
    id: spec.id,
    routeId: spec.routeId,
    s: spec.s,
    lateral: spec.lateral,
    yOffset: spec.yOffset,
    variant: spec.variant,
    spinAngleRad: spec.phaseRad,
    pulseScale: 1,
  }));

  const minimapMarkers: MinimapAttractionMarker[] = [];
  for (const p of plan.pendulums) {
    minimapMarkers.push({ kind: 'hazard', routeId: p.routeId, s: p.s, lateral: 0 });
  }
  for (const g of plan.ballGroups) {
    minimapMarkers.push({ kind: 'hazard', routeId: g.routeId, s: g.centerS, lateral: 0 });
  }
  for (const w of plan.windFans) {
    minimapMarkers.push({ kind: 'hazard', routeId: w.routeId, s: w.centerS, lateral: 0 });
  }
  for (const j of plan.jellyPuddles) {
    minimapMarkers.push({
      kind: 'hazard',
      routeId: j.routeId,
      s: j.centerS,
      lateral: j.lateralCenter,
    });
  }
  for (const r of plan.boostRings) {
    minimapMarkers.push({
      kind: 'ring',
      routeId: r.routeId,
      s: r.s,
      lateral: r.lateral,
    });
  }

  const isActive = (): boolean => enabled && plan.enabledForCourse;

  const evaluateAtTime = (rawTimeSec: number): void => {
    const t = Math.max(0, rawTimeSec);
    lastTimeSec = t;

    const ringCfg = CONFIG.attractions.ring;
    for (let i = 0; i < boostRings.length; i++) {
      const rSpec = plan.boostRings[i];
      const mut = boostRings[i] as {
        spinAngleRad: number;
        pulseScale: number;
      };
      mut.spinAngleRad = rSpec.phaseRad + t * ringCfg.spinSpeed;
      mut.pulseScale = 1 + 0.065 * Math.sin(t * ringCfg.pulseSpeed + rSpec.phaseRad);
    }

    if (!isActive()) {
      for (const p of pendulums) {
        p.angleRad = 0;
        p.bobLateral = 0;
        p.active = false;
        p.warningLevel = 0;
      }
      for (const g of ballGroups) {
        g.active = false;
        g.warningLevel = 0;
      }
      for (const w of windFans) {
        w.active = false;
        w.strength01 = 0;
        w.peakAccel = 0;
        w.warningLevel = 0;
      }
      for (const j of jellyPuddles) {
        j.active = false;
        j.warningLevel = 0;
      }
      return;
    }

    const diffCfg =
      CONFIG.attractions.difficultyScale[difficulty] ?? CONFIG.attractions.difficultyScale.sedang;
    const warnSec = CONFIG.attractions.warningSeconds;
    // Active starts cleanly only AFTER >= 1.2s visible floor warning
    const hazardTime = Math.max(0, t - warnSec);
    const hazardActive = t >= warnSec;

    // 1. Pendulums: angle = A * sin(2π t_active / T + phase)
    const pCfg = CONFIG.attractions.pendulum;
    const periodP = pCfg.periodSec * diffCfg.periodScale;
    const omegaP = (Math.PI * 2) / Math.max(0.5, periodP);
    const blinkWave = 0.55 + 0.45 * Math.sin(t * 7.5);

    for (let i = 0; i < pendulums.length; i++) {
      const p = pendulums[i];
      // Before warnSec expires, smoothly show pre-warning stripe blinking strongly
      const angle = hazardActive
        ? pCfg.maxAngleRad * Math.sin(omegaP * hazardTime + p.spec.phaseRad)
        : 0;
      const bobLateral = Math.sin(angle) * pCfg.armLength;
      const bobY = pCfg.pivotHeight - Math.cos(angle) * pCfg.armLength;

      // Predict 1.2s ahead so warning strip flashes on the incoming side
      const futureAngle = pCfg.maxAngleRad * Math.sin(omegaP * (hazardTime + warnSec) + p.spec.phaseRad);
      const futureLat = Math.sin(futureAngle) * pCfg.armLength;

      const halfW = p.spec.trackWidth * 0.5;
      p.angleRad = angle;
      p.bobLateral = bobLateral;
      p.bobHeightAboveDeck = bobY;
      p.safeLaneLeftWidth = Math.max(0, halfW + bobLateral - pCfg.bobRadius);
      p.safeLaneRightWidth = Math.max(0, halfW - bobLateral - pCfg.bobRadius);
      p.active = hazardActive;
      p.dangerLaneSide = Math.abs(futureLat) < 0.7 ? 0 : futureLat > 0 ? 1 : -1;
      p.warningLevel = hazardActive ? 0.45 + 0.55 * blinkWave : 0.75 + 0.25 * Math.sin(t * 14);
    }

    // 2. Rolling Balls: triangle wave side-to-side
    const bCfg = CONFIG.attractions.balls;
    const periodB = bCfg.periodSec * diffCfg.periodScale;
    const halfSpan = bCfg.ballRadius;
    for (let i = 0; i < ballGroups.length; i++) {
      const g = ballGroups[i];
      const halfW = g.spec.trackWidth * 0.5;
      let worstFraction = 1;
      for (let j = 0; j < g.balls.length; j++) {
        const ball = g.balls[j];
        const baseSpec = g.spec.balls[j];
        const phase01 = (hazardActive ? hazardTime / Math.max(0.5, periodB) : 0) + baseSpec.phaseOffset01;
        const wave = hazardActive ? triangleWave01(phase01) : 0;
        const lat = wave * g.spec.amplitude;
        ball.lateral = lat;
        ball.velocitySign = triangleSlopeSign(phase01);
        ball.spinAngleRad = -lat / Math.max(0.2, bCfg.ballRadius);

        const leftFree = Math.max(0, halfW + lat - halfSpan);
        const rightFree = Math.max(0, halfW - lat - halfSpan);
        const bestContinuous = Math.max(leftFree, rightFree) / Math.max(1, g.spec.trackWidth);
        if (bestContinuous < worstFraction) {
          worstFraction = bestContinuous;
        }
      }
      g.active = hazardActive;
      g.minSafeLaneFraction = worstFraction;
      g.warningLevel = hazardActive ? 0.45 + 0.55 * blinkWave : 0.75 + 0.25 * Math.sin(t * 14);
    }

    // 3. Giant Wind Fan
    const wCfg = CONFIG.attractions.wind;
    for (let i = 0; i < windFans.length; i++) {
      const w = windFans[i];
      w.fanAngleRad = t * 5.2;
      w.active = hazardActive;
      w.strength01 = hazardActive ? diffCfg.windScale : 0;
      w.peakAccel = hazardActive ? wCfg.maxAccel * diffCfg.windScale * w.spec.direction : 0;
      w.warningLevel = hazardActive ? 0.5 + 0.5 * blinkWave : 0.75 + 0.25 * Math.sin(t * 14);
    }

    // 4. Jelly Puddle
    const jCfg = CONFIG.attractions.jelly;
    for (let i = 0; i < jellyPuddles.length; i++) {
      const jp = jellyPuddles[i];
      jp.uvOffset = (t * jCfg.uvScrollSpeed) % 1;
      jp.active = hazardActive;
      jp.warningLevel = hazardActive ? 0.4 + 0.6 * blinkWave : 0.75 + 0.25 * Math.sin(t * 14);
    }
  };

  const getWindAccelAt = (routeId: string, s: number): number => {
    if (!isActive() || routeId !== 'main') {
      return 0;
    }
    const edgeBlend = CONFIG.attractions.wind.edgeBlendMeters;
    let total = 0;
    for (let i = 0; i < windFans.length; i++) {
      const w = windFans[i];
      if (!w.active || s < w.spec.sStart || s > w.spec.sEnd) {
        continue;
      }
      const distIn = s - w.spec.sStart;
      const distOut = w.spec.sEnd - s;
      const rampIn = Math.min(1, distIn / Math.max(0.5, edgeBlend));
      const rampOut = Math.min(1, distOut / Math.max(0.5, edgeBlend));
      const env = Math.min(rampIn, rampOut);
      // Smooth Hermite S-curve at zone edges so lateral push rises and falls gently
      const smooth = env * env * (3 - 2 * env);
      total += w.peakAccel * smooth;
    }
    const maxCap = CONFIG.attractions.wind.maxAccel;
    return Math.max(-maxCap, Math.min(maxCap, total));
  };

  const getNearestWindFanProximity = (
    px: number,
    py: number,
    pz: number,
    maxDistMeters: number,
  ): number => {
    if (!isActive() || maxDistMeters <= 0) {
      return 0;
    }
    let best = 0;
    for (let i = 0; i < windFans.length; i++) {
      const w = windFans[i];
      if (!w.active) continue;
      const pos = w.spec.fanTowerPos;
      const dx = px - pos.x;
      const dy = py - pos.y;
      const dz = pz - pos.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < maxDistMeters) {
        const p = (1 - dist / maxDistMeters) * w.strength01;
        if (p > best) best = p;
      }
    }
    return Math.max(0, Math.min(1, best));
  };

  const reset = (): void => {
    evaluateAtTime(0);
  };

  evaluateAtTime(0);

  return {
    plan,
    isActive,
    setEnabled: (next: boolean) => {
      enabled = next;
      evaluateAtTime(lastTimeSec);
    },
    getEnabled: () => enabled,
    setDifficulty: (next: AiDifficulty) => {
      difficulty = next;
      evaluateAtTime(lastTimeSec);
    },
    getDifficulty: () => difficulty,
    reset,
    evaluateAtTime,
    getTimeSec: () => lastTimeSec,
    getPendulums: () => pendulums,
    getBallGroups: () => ballGroups,
    getWindFans: () => windFans,
    getJellyPuddles: () => jellyPuddles,
    getBoostRings: () => boostRings,
    getWindAccelAt,
    getNearestWindFanProximity,
    getMinimapMarkers: () => minimapMarkers,
  };
}
