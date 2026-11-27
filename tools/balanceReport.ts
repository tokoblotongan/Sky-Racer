// tools/balanceReport.ts
// Headless 30-race balance simulator per difficulty using a human proxy-player.

import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { CONFIG, type AiDifficulty, type AiRivalConfig } from '../src/config';
import { createAiDrivers } from '../src/core/ai';
import {
  computeAiDriverInput,
  createAiDriverContext,
  createIdleInput,
} from '../src/core/ai/driver';
import { createRecoveryState, stepAiRecovery } from '../src/core/ai/recovery';
import { createSeededRng } from '../src/core/ai/rng';
import { createAttractionSystem } from '../src/core/attractions';
import { resolveCarCollisions } from '../src/core/collisions';
import { buildCourseConfigFromDefinition, Course } from '../src/core/course';
import {
  createHazardEffectsTracker,
  type AttractionEvent,
} from '../src/core/hazardEffects';
import { stepCar } from '../src/core/physics';
import { updateRouteTransitions } from '../src/core/routeTransitions';
import { createStandingsTracker } from '../src/core/standings';
import {
  buildClassification,
  createRaceState,
  markUnfinishedAsDnfAndFinalize,
  startCountdown,
  updateOpponentProgress,
  updateRace,
} from '../src/core/state';
import { fantasyLandCourse } from '../src/courses/fantasyLand';
import type { CarInput } from '../src/input/controls';

const RACES_PER_DIFFICULTY = 30;
const DT = 1 / 60;
const MAX_RACE_SEC = 340;
const PROXY_REACTION_SEC = 0.2;
const PROXY_REACTION_STEPS = Math.max(1, Math.round(PROXY_REACTION_SEC / DT));

const DIFFICULTIES: readonly {
  difficulty: AiDifficulty;
  targetWinMin: number;
  targetWinMax: number;
  targetLapRatio: number;
}[] = [
  { difficulty: 'mudah', targetWinMin: 0.7, targetWinMax: 1.0, targetLapRatio: 1.12 },
  { difficulty: 'sedang', targetWinMin: 0.4, targetWinMax: 0.6, targetLapRatio: 1.06 },
  { difficulty: 'sulit', targetWinMin: 0.0, targetWinMax: 0.25, targetLapRatio: 1.0 },
];

const PROXY_RIVAL_PROFILE: AiRivalConfig = {
  id: 'proxy-player',
  name: 'Pemain-Proksi',
  color: '#FF2D3D',
  accent: '#FFD000',
  stripe: '#FFF6E0',
  design: 'gt',
  skill: 0.94,
  preferredOffset: 0.0,
  shortcutChance: 0.55,
  boostUsage: 0.85,
  style: 'balanced',
};

interface RaceResult {
  difficulty: AiDifficulty;
  seed: number;
  playerRank: number;
  playerTime: number;
  positionTimes: Array<number | null>;
  overtakes: number;
  hazardHits: number;
  playerLaps: number;
  aiLaps: number;
  stuckEvents: number;
  rollovers: number;
  aiLapTimes: number[];
}

function runSingleBalanceRace(
  course: Course,
  difficulty: AiDifficulty,
  seed: number,
): RaceResult {
  const state = createRaceState(course, { persistRecords: false });
  startCountdown(state, 0, course);
  let clockMs = 0;
  while (state.phase === 'COUNTDOWN') {
    clockMs += 100;
    updateRace(
      state,
      {
        s: state.cars[0].s,
        sApprox: state.cars[0].sApprox,
        mode: state.cars[0].mode,
        routeId: state.cars[0].routeId,
        routeLapOffset: state.cars[0].routeLapOffset,
        speedKmh: 0,
      },
      course,
      0.1,
      undefined,
      clockMs,
    );
  }
  state.timer = 0;

  const ai = createAiDrivers(course, difficulty, seed);
  const attractions = createAttractionSystem(course, true, difficulty);
  const hazardEffects = createHazardEffectsTracker(state.cars.length);
  const standings = createStandingsTracker(course.getRacers());
  const numCars = state.cars.length;
  const attrEvents: AttractionEvent[] = [];
  const envScratch = { gripMultiplier: 1, lateralAccel: 0 };

  const proxyRng = createSeededRng(seed ^ 0x5f3759df);
  const proxyRecovery = createRecoveryState(PROXY_REACTION_SEC);
  const proxyDriverCtx = createAiDriverContext(0, PROXY_RIVAL_PROFILE, proxyRng, proxyRecovery);
  const proxyRawInput = createIdleInput();
  const proxyDelayQueue: number[] = new Array<number>(PROXY_REACTION_STEPS).fill(0);
  let delayHead = 0;
  let smoothNoise = 0;

  let overtakes = 0;
  let hazardHits = 0;
  let stuckEvents = 0;
  let rollovers = 0;
  const stuckTimers = new Array<number>(numCars).fill(0);
  const stuckCounted = new Array<boolean>(numCars).fill(false);
  const prevCrashed = new Array<boolean>(numCars).fill(false);
  const prevRanks = new Array<number>(numCars).fill(0);

  let simTime = 0;
  const maxSteps = Math.ceil(MAX_RACE_SEC / DT);
  const proxySedangMult = CONFIG.ai.difficulties.sedang.skillMultiplier;

  for (let step = 0; step < maxSteps; step++) {
    simTime += DT;

    attractions.evaluateAtTime(simTime);
    hazardEffects.stepPrePhysics(state.cars, attractions, DT);

    // Step proxy recovery & AI recovery
    stepAiRecovery(state.cars[0], proxyRecovery, course, DT, state.phase === 'RACING');
    ai.stepPrePhysics(state.cars, course, 'RACING', DT);

    for (let i = 0; i < numCars; i++) {
      const car = state.cars[i];
      const rp = state.racerProgress[i];
      const route = course.getRoute(car.routeId);
      const carPhase = i === 0 ? state.phase : rp?.finished ? 'FINISH' : 'RACING';

      let input: CarInput;
      if (i === 0) {
        if (state.phase !== 'RACING') {
          input = createIdleInput();
        } else {
          computeAiDriverInput(
            proxyDriverCtx as unknown as Parameters<typeof computeAiDriverInput>[0],
            state.cars,
            course,
            proxySedangMult,
            1.0,
            DT,
            proxyRawInput,
            attractions,
            simTime,
          );
          // Apply 0.2s human reaction latency on steering + low-frequency steering noise
          const delayedSteer = proxyDelayQueue[delayHead];
          proxyDelayQueue[delayHead] = proxyRawInput.steer;
          delayHead = (delayHead + 1) % PROXY_REACTION_STEPS;

          const noiseStep = proxyRng.range(-1, 1) * 0.14;
          smoothNoise = smoothNoise * 0.94 + noiseStep * 0.06;
          proxyRawInput.steer = THREE.MathUtils.clamp(delayedSteer + smoothNoise, -1, 1);
          input = proxyRawInput;
        }
      } else {
        input = ai.sampleInput(i, state.cars, course, carPhase, DT, attractions, simTime);
      }

      stepCar(car, input, route, DT, {
        phase: carPhase,
        respawnTarget: { s: Math.max(4, car.lastSafeS), lateral: 0 },
        respawnRoute: course.getRoute('main'),
        env: hazardEffects.getEnvModifiers(i, envScratch),
      });
      updateRouteTransitions(car, course);

      if (!rp?.finished) {
        if (Math.abs(car.vForward) < CONFIG.ai.stuck.minSpeed && simTime > 1.5) {
          stuckTimers[i] += DT;
          if (stuckTimers[i] >= CONFIG.ai.stuck.seconds && !stuckCounted[i]) {
            stuckCounted[i] = true;
            stuckEvents++;
          }
        } else {
          stuckTimers[i] = 0;
          stuckCounted[i] = false;
        }
      }

      if (car.crashed && !prevCrashed[i]) {
        rollovers++;
      }
      prevCrashed[i] = car.crashed;
    }

    resolveCarCollisions(state.cars, course, DT, 'RACING');
    hazardEffects.stepPostPhysics(state.cars, course, attractions, DT, attrEvents);
    for (let k = 0; k < attrEvents.length; k++) {
      if (attrEvents[k].type === 'hazardHit') {
        hazardHits++;
      }
    }

    if (state.phase === 'RACING') {
      const c0 = state.cars[0];
      updateRace(
        state,
        {
          s: c0.s,
          sApprox: c0.sApprox,
          mode: c0.mode,
          routeId: c0.routeId,
          routeLapOffset: c0.routeLapOffset,
          speedKmh: Math.abs(c0.vForward) * 3.6,
        },
        course,
        DT,
      );
    }

    updateOpponentProgress(state, course, simTime);
    const standRes = standings.update(state.cars, course, state, DT);
    if (standRes.overtakeEvent) {
      overtakes++;
    }
    if (simTime > 2.0) {
      for (const entry of standRes.entries) {
        const prevR = prevRanks[entry.carIndex];
        if (prevR > 0 && entry.rank < prevR && entry.carIndex !== 0) {
          // Track pack position swaps for realistic overtake intensity too
        }
        prevRanks[entry.carIndex] = entry.rank;
      }
    }

    const allDone = state.racerProgress.every((rp) => rp.finished);
    if (allDone && state.phase === 'FINISH') {
      break;
    }
  }

  markUnfinishedAsDnfAndFinalize(state, course);
  const cls = buildClassification(state, course);
  const playerRow = cls.find((r) => r.isPlayer);
  const aiLapTimes: number[] = [];
  for (let i = 1; i < state.racerProgress.length; i++) {
    const rp = state.racerProgress[i];
    if (rp) {
      aiLapTimes.push(...rp.lapTimes);
    }
  }

  return {
    difficulty,
    seed,
    playerRank: playerRow?.rank ?? 4,
    playerTime: state.racerProgress[0]?.finishTime ?? MAX_RACE_SEC,
    positionTimes: cls.map((c) => c.totalTime),
    overtakes,
    hazardHits,
    playerLaps: state.racerProgress[0]?.lapTimes.length ?? state.laps,
    aiLaps: aiLapTimes.length,
    stuckEvents,
    rollovers,
    aiLapTimes,
  };
}

function main(): void {
  const course = new Course(buildCourseConfigFromDefinition(fantasyLandCourse, false));
  const refLap = fantasyLandCourse.referenceLapTime ?? 65.06;

  interface DiffSummary {
    difficulty: AiDifficulty;
    races: number;
    winRate: number;
    avgGapP1P2: number;
    avgGapP2P3: number;
    avgGapP3P4: number;
    avgOvertakes: number;
    hazardHitsPerLap: number;
    totalStuck: number;
    avgRollovers: number;
    aiAvgLapSec: number;
    aiLapRatio: number;
    winPass: boolean;
    overtakePass: boolean;
    ratioPass: boolean;
    stuckPass: boolean;
  }

  const summaries: DiffSummary[] = [];

  for (let dIdx = 0; dIdx < DIFFICULTIES.length; dIdx++) {
    const spec = DIFFICULTIES[dIdx];
    const results: RaceResult[] = [];
    for (let n = 0; n < RACES_PER_DIFFICULTY; n++) {
      const seed = 1001 + dIdx * 10000 + n * 131;
      results.push(runSingleBalanceRace(course, spec.difficulty, seed));
    }

    const wins = results.filter((r) => r.playerRank === 1).length;
    const winRate = wins / results.length;
    const gaps12: number[] = [];
    const gaps23: number[] = [];
    const gaps34: number[] = [];
    for (const r of results) {
      const [t1, t2, t3, t4] = r.positionTimes;
      if (t1 !== null && t2 !== null) gaps12.push(t2 - t1);
      if (t2 !== null && t3 !== null) gaps23.push(t3 - t2);
      if (t3 !== null && t4 !== null) gaps34.push(t4 - t3);
    }
    const avg = (arr: number[]): number =>
      arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

    const avgOvertakes = avg(results.map((r) => r.overtakes));
    const totalHazardHits = results.reduce((s, r) => s + r.hazardHits, 0);
    const totalCarLaps = Math.max(
      1,
      results.reduce((s, r) => s + r.playerLaps + r.aiLaps, 0),
    );
    const hazardHitsPerLap = totalHazardHits / totalCarLaps;
    const totalStuck = results.reduce((s, r) => s + r.stuckEvents, 0);
    const avgRollovers = avg(results.map((r) => r.rollovers));
    const allAiLaps = results.flatMap((r) => r.aiLapTimes);
    const aiAvgLapSec = avg(allAiLaps);
    const aiLapRatio = aiAvgLapSec / refLap;

    const winPass = winRate >= spec.targetWinMin && winRate <= spec.targetWinMax;
    const overtakePass = spec.difficulty === 'sedang' ? avgOvertakes >= 3 : true;
    const ratioPass = Math.abs(aiLapRatio - spec.targetLapRatio) <= 0.03;
    const stuckPass = totalStuck === 0;

    summaries.push({
      difficulty: spec.difficulty,
      races: results.length,
      winRate,
      avgGapP1P2: avg(gaps12),
      avgGapP2P3: avg(gaps23),
      avgGapP3P4: avg(gaps34),
      avgOvertakes,
      hazardHitsPerLap,
      totalStuck,
      avgRollovers,
      aiAvgLapSec,
      aiLapRatio,
      winPass,
      overtakePass,
      ratioPass,
      stuckPass,
    });
  }

  console.log('\n=== BALANCE REPORT (N=30 per kesulitan, pemain-proksi Sedang + reaksi 0.2s + derau kemudi) ===');
  for (const s of summaries) {
    console.log(
      `${s.difficulty.padEnd(7)} | win=${(s.winRate * 100).toFixed(1)}% (${s.winPass ? 'OK' : 'FAIL'})` +
        ` | gaps=[${s.avgGapP1P2.toFixed(2)}s, ${s.avgGapP2P3.toFixed(2)}s, ${s.avgGapP3P4.toFixed(2)}s]` +
        ` | overtakes=${s.avgOvertakes.toFixed(2)}/race (${s.overtakePass ? 'OK' : 'FAIL'})` +
        ` | hazard=${s.hazardHitsPerLap.toFixed(2)}/lap` +
        ` | stuck=${s.totalStuck} (${s.stuckPass ? 'OK' : 'FAIL'})` +
        ` | rollovers=${s.avgRollovers.toFixed(2)}` +
        ` | aiLapRatio=${s.aiLapRatio.toFixed(3)}x (${s.ratioPass ? 'OK' : 'FAIL'})`,
    );
  }

  const allPassed = summaries.every(
    (s) => s.winPass && s.overtakePass && s.ratioPass && s.stuckPass,
  );
  console.log(`OVERALL: ${allPassed ? 'PASS' : 'NEEDS TUNING'}\n`);

  const lines: string[] = [
    '# Laporan Keseimbangan Balapan (Stage F7)',
    '',
    `- **Arena**: FantasyLand (3 lap, 4 pembalap)`,
    `- **Simulasi**: N = ${RACES_PER_DIFFICULTY} balapan per kesulitan dengan seed berbeda (total ${RACES_PER_DIFFICULTY * DIFFICULTIES.length} balapan headless)`,
    `- **Pemain-Proksi (khusus tool)**: Pengemudi AI Sedang (\`skillMultiplier = ${CONFIG.ai.difficulties.sedang.skillMultiplier}\`) + jeda reaksi \`${PROXY_REACTION_SEC}s\` + derau kemudi acak terhalus`,
    `- **Lap Referensi**: \`${refLap.toFixed(2)} s\``,
    '',
    '## Ringkasan Hasil Simulasi',
    '',
    '| Kesulitan | Peluang Menang Proksi | Target Menang | Selisih Finis Rata-rata (P1-P2 / P2-P3 / P3-P4) | Salip / Balapan | Kena Rintangan / Lap | Macet | Terguling / Balapan | Rasio Lap AI |',
    '|---|---:|---:|---|---:|---:|---:|---:|---:|',
  ];

  for (const s of summaries) {
    const targetWinStr =
      s.difficulty === 'mudah'
        ? '>= 70%'
        : s.difficulty === 'sedang'
          ? '40–60%'
          : '<= 25%';
    lines.push(
      `| **${s.difficulty}** | ${(s.winRate * 100).toFixed(1)}% (${s.winPass ? 'PASS' : 'FAIL'}) | ${targetWinStr} | ` +
        `${s.avgGapP1P2.toFixed(2)}s / ${s.avgGapP2P3.toFixed(2)}s / ${s.avgGapP3P4.toFixed(2)}s | ` +
        `${s.avgOvertakes.toFixed(2)} | ${s.hazardHitsPerLap.toFixed(2)} | ${s.totalStuck} | ` +
        `${s.avgRollovers.toFixed(2)} | ${s.aiLapRatio.toFixed(3)}x (${s.aiAvgLapSec.toFixed(2)}s) |`,
    );
  }

  lines.push(
    '',
    '## Perubahan Nilai Tuning di `src/config.ts` (`CONFIG.ai`)',
    '',
    '| Parameter | Nilai Lama | Nilai Baru |',
    '|---|---|---|',
    `| \`ai.difficulties.mudah.skillMultiplier\` | \`0.82\` | \`${CONFIG.ai.difficulties.mudah.skillMultiplier}\` |`,
    `| \`ai.difficulties.sedang.skillMultiplier\` | \`0.92\` | \`${CONFIG.ai.difficulties.sedang.skillMultiplier}\` |`,
    `| \`ai.difficulties.sulit.skillMultiplier\` | \`1.0\` | \`${CONFIG.ai.difficulties.sulit.skillMultiplier}\` |`,
    `| \`ai.cruiseReferenceSpeed\` | \`43.5\` | \`${CONFIG.ai.cruiseReferenceSpeed}\` |`,
    `| \`ai.rubberBand.maxBoost\` | \`0.05\` | \`${CONFIG.ai.rubberBand.maxBoost}\` |`,
    `| \`ai.rubberBand.maxSlow\` | \`0.06\` | \`${CONFIG.ai.rubberBand.maxSlow}\` |`,
    `| \`ai.startReactionMaxSec\` | \`0.24\` | \`${CONFIG.ai.startReactionMaxSec}\` |`,
    `| \`ai.rivals[0..2].skill\` | \`0.90 / 0.95 / 0.98\` | \`${CONFIG.ai.rivals.map((r) => r.skill).join(' / ')}\` |`,
    '',
    `Status target keseluruhan: **${allPassed ? 'MEMENUHI SEMUA SASARAN' : 'BELUM MEMENUHI SEMUA SASARAN'}**.`,
    '',
  );

  const outDir = path.resolve(process.cwd(), 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'balance.md'), lines.join('\n'), 'utf8');
  console.log('Laporan tersimpan di: reports/balance.md');

  process.exit(allPassed ? 0 : 1);
}

main();
