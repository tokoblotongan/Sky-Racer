// tools/simulateRace.ts
// Headless AI race benchmark for FantasyLand across 5 seeds x 3 difficulties.

import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { CONFIG, type AiDifficulty } from '../src/config';
import { createAiDrivers } from '../src/core/ai';
import { createAttractionSystem } from '../src/core/attractions';
import { autopilotInput } from '../src/core/autopilot';
import { resolveCarCollisions } from '../src/core/collisions';
import { buildCourseConfigFromDefinition, Course } from '../src/core/course';
import {
  createHazardEffectsTracker,
  type AttractionEvent,
} from '../src/core/hazardEffects';
import { getCarPose, stepCar, type CarPose } from '../src/core/physics';
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

interface DifficultySpec {
  difficulty: AiDifficulty;
  targetRatio: number;
}

interface SingleRaceReport {
  difficulty: AiDifficulty;
  seed: number;
  allAiFinished: boolean;
  nanCount: number;
  maxStuckSec: number;
  aiLapTimes: number[];
  aiAvgLapSec: number;
  lapRatioToRef: number;
  standingsConsistent: boolean;
  overtakeEvents: number;
  rankChangesAllCars: number;
  collisionEvents: number;
  shortcutEntries: number;
  shortcutMerges: number;
  shortcutFalls: number;
  tunnelingEvents: number;
  chainedRollovers: number;
  aiHazardHits: number;
  aiHazardHitsPerCarLap: number;
  aiRingPasses: number;
  hazardRollovers: number;
  avgAiCpuMsPerStep: number;
  avgAiCpuMsPerCar: number;
  aiTotalTimes: Array<number | null>;
  playerTime: number | null;
}

const SEEDS = [101, 202, 303, 404, 505] as const;
const DIFFICULTY_SPECS: readonly DifficultySpec[] = [
  { difficulty: 'mudah', targetRatio: 1.12 },
  { difficulty: 'sedang', targetRatio: 1.06 },
  { difficulty: 'sulit', targetRatio: 1.0 },
];
const RATIO_TOLERANCE = 0.04; // ±4%
const DT = 1 / 60;
const MAX_RACE_SEC = 360;

function hasNaNInCar(car: ReturnType<typeof createRaceState>['cars'][number]): boolean {
  return (
    !Number.isFinite(car.s) ||
    !Number.isFinite(car.sApprox) ||
    !Number.isFinite(car.lateral) ||
    !Number.isFinite(car.yaw) ||
    !Number.isFinite(car.vForward) ||
    !Number.isFinite(car.vLateral) ||
    !Number.isFinite(car.worldPos.x) ||
    !Number.isFinite(car.worldPos.y) ||
    !Number.isFinite(car.worldPos.z) ||
    !Number.isFinite(car.worldVel.x) ||
    !Number.isFinite(car.worldVel.y) ||
    !Number.isFinite(car.worldVel.z)
  );
}

function runSingleRace(
  course: Course,
  difficulty: AiDifficulty,
  seed: number,
): SingleRaceReport {
  const state = createRaceState(course, { persistRecords: false });
  startCountdown(state, 0, course);
  // Skip countdown wait cleanly using deterministic wall clock progression
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

  let nanCount = 0;
  let maxStuckSec = 0;
  const stuckTimers = new Array<number>(numCars).fill(0);
  let standingsConsistent = true;
  let overtakeEvents = 0;
  let rankChangesAllCars = 0;
  let collisionEvents = 0;
  let shortcutEntries = 0;
  let shortcutMerges = 0;
  let shortcutFalls = 0;
  let tunnelingEvents = 0;
  let chainedRollovers = 0;
  let aiHazardHits = 0;
  let aiRingPasses = 0;
  let hazardRollovers = 0;
  const lastHazardHitAt = new Array<number>(numCars).fill(-99);

  const prevCrashed = new Array<boolean>(numCars).fill(false);
  const timeSinceCrashEnd = new Array<number>(numCars).fill(99);
  const tempPose: CarPose = {
    position: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
    up: new THREE.Vector3(),
    right: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
  };
  const prevPositions = state.cars.map((c) =>
    getCarPose(c, course.getRoute(c.routeId)).position.clone(),
  );
  let prevOrder: number[] = [];

  let totalAiCpuMs = 0;
  let aiCpuSteps = 0;
  let simTime = 0;
  let playerFinishedTime: number | null = null;

  const maxSteps = Math.ceil(MAX_RACE_SEC / DT);
  const tempPos = new THREE.Vector3();

  for (let step = 0; step < maxSteps; step++) {
    simTime += DT;

    attractions.evaluateAtTime(simTime);
    hazardEffects.stepPrePhysics(state.cars, attractions, DT);

    const prevRespawns = ai.getMetrics().totalRespawns;
    const tPre0 = performance.now();
    ai.stepPrePhysics(state.cars, course, 'RACING', DT);
    const tPre1 = performance.now();
    totalAiCpuMs += tPre1 - tPre0;

    const respawnsNow = ai.getMetrics().totalRespawns;
    const didRespawnThisStep = respawnsNow > prevRespawns;

    for (let i = 0; i < numCars; i++) {
      const car = state.cars[i];
      const rp = state.racerProgress[i];
      const route = course.getRoute(car.routeId);
      const carPhase = i === 0 ? state.phase : rp?.finished ? 'FINISH' : 'RACING';

      let input;
      if (i === 0) {
        input = autopilotInput(car, route, { course, preferRoute: 'main' });
      } else {
        const tIn0 = performance.now();
        input = ai.sampleInput(i, state.cars, course, carPhase, DT, attractions, simTime);
        totalAiCpuMs += performance.now() - tIn0;
      }

      const evs = stepCar(car, input, route, DT, {
        phase: carPhase,
        respawnTarget: { s: Math.max(4, car.lastSafeS), lateral: 0 },
        respawnRoute: course.getRoute('main'),
        env: hazardEffects.getEnvModifiers(i, envScratch),
      });
      const trans = updateRouteTransitions(car, course);

      if (i > 0 && trans) {
        if (trans.kind === 'enter') shortcutEntries++;
        if (trans.kind === 'merge') shortcutMerges++;
      }

      let fellInStep = false;
      for (let e = 0; e < evs.length; e++) {
        if (evs[e].type === 'fell') {
          fellInStep = true;
          if (i > 0 && car.routeId !== 'main') {
            shortcutFalls++;
          }
        }
      }

      if (i > 0) {
        // Track continuous stuck time (excluding post-finish)
        if (!rp?.finished) {
          if (Math.abs(car.vForward) < CONFIG.ai.stuck.minSpeed) {
            stuckTimers[i] += DT;
            if (stuckTimers[i] > maxStuckSec) {
              maxStuckSec = stuckTimers[i];
            }
          } else {
            stuckTimers[i] = 0;
          }
        }

        // Chained rollover & hazard rollover check
        if (car.crashed && !prevCrashed[i]) {
          if (timeSinceCrashEnd[i] < 1.0) {
            chainedRollovers++;
          }
          if (simTime - lastHazardHitAt[i] <= 0.75) {
            hazardRollovers++;
          }
        }
        if (!car.crashed && prevCrashed[i]) {
          timeSinceCrashEnd[i] = 0;
        } else if (!car.crashed) {
          timeSinceCrashEnd[i] += DT;
        }
        prevCrashed[i] = car.crashed;

        // Tunneling check: unexpected jump > 8m in one 1/60s tick (excluding respawns/falls)
        getCarPose(car, course.getRoute(car.routeId), tempPose);
        tempPos.copy(tempPose.position);
        if (!didRespawnThisStep && !fellInStep && step > 2) {
          const jumpDist = tempPos.distanceTo(prevPositions[i]);
          if (jumpDist > 8.0) {
            tunnelingEvents++;
          }
        }
        prevPositions[i].copy(tempPos);
      }

      if (hasNaNInCar(car)) {
        nanCount++;
      }
    }

    aiCpuSteps++;

    const colEvents = resolveCarCollisions(state.cars, course, DT, 'RACING');
    collisionEvents += colEvents.length;

    hazardEffects.stepPostPhysics(state.cars, course, attractions, DT, attrEvents);
    for (let aiIdx = 0; aiIdx < attrEvents.length; aiIdx++) {
      const ae = attrEvents[aiIdx];
      if (ae.carIndex > 0) {
        if (ae.type === 'hazardHit') {
          aiHazardHits++;
          lastHazardHitAt[ae.carIndex] = simTime;
        } else if (ae.type === 'ringPass') {
          aiRingPasses++;
        }
      }
    }

    if (state.phase === 'RACING') {
      const activeCar = state.cars[0];
      const raceEvents = updateRace(
        state,
        {
          s: activeCar.s,
          sApprox: activeCar.sApprox,
          mode: activeCar.mode,
          routeId: activeCar.routeId,
          routeLapOffset: activeCar.routeLapOffset,
          speedKmh: Math.abs(activeCar.vForward) * 3.6,
        },
        course,
        DT,
      );
      for (let e = 0; e < raceEvents.length; e++) {
        if (raceEvents[e].type === 'finish') {
          playerFinishedTime = raceEvents[e].time;
        }
      }
    }

    updateOpponentProgress(state, course, simTime);
    const standResult = standings.update(state.cars, course, state, DT);
    if (standResult.overtakeEvent) {
      overtakeEvents++;
    }

    // Check monotonic & consistent standings invariant
    const entries = standResult.entries;
    if (entries.length !== numCars) {
      standingsConsistent = false;
    } else {
      let seenUnfinished = false;
      let prevFinishTime = -1;
      let prevProg = Infinity;
      const order: number[] = [];
      for (let k = 0; k < entries.length; k++) {
        const entry = entries[k];
        order.push(entry.carIndex);
        if (entry.rank !== k + 1) {
          standingsConsistent = false;
        }
        if (entry.finished && !entry.dnf) {
          if (seenUnfinished || (entry.finishTime ?? 0) < prevFinishTime - 1e-6) {
            standingsConsistent = false;
          }
          prevFinishTime = entry.finishTime ?? 0;
        } else {
          seenUnfinished = true;
          if (!entry.dnf) {
            if (entry.progressMeters > prevProg + 1e-3) {
              standingsConsistent = false;
            }
            prevProg = entry.progressMeters;
          }
        }
      }
      if (prevOrder.length === order.length && simTime > 1.5) {
        for (let k = 0; k < order.length; k++) {
          if (order[k] !== prevOrder[k]) {
            rankChangesAllCars++;
            break;
          }
        }
      }
      prevOrder = order;
    }

    let allAiDone = true;
    for (let i = 1; i < numCars; i++) {
      if (!state.racerProgress[i]?.finished) {
        allAiDone = false;
        break;
      }
    }
    if (allAiDone && state.phase === 'FINISH') {
      break;
    }
  }

  const aiLapTimes: number[] = [];
  const aiTotalTimes: Array<number | null> = [];
  let allAiFinished = true;
  for (let i = 1; i < numCars; i++) {
    const rp = state.racerProgress[i];
    if (!rp || !rp.finished || rp.dnf) {
      allAiFinished = false;
    }
    aiTotalTimes.push(rp?.finishTime ?? null);
    if (rp) {
      for (const lt of rp.lapTimes) {
        aiLapTimes.push(lt);
      }
    }
  }

  const aiAvgLapSec =
    aiLapTimes.length > 0
      ? aiLapTimes.reduce((sum, v) => sum + v, 0) / aiLapTimes.length
      : 0;
  const refLap = fantasyLandCourse.referenceLapTime ?? 65.06;
  const lapRatioToRef = aiAvgLapSec / refLap;
  const avgAiCpuMsPerStep = aiCpuSteps > 0 ? totalAiCpuMs / aiCpuSteps : 0;
  const avgAiCpuMsPerCar = avgAiCpuMsPerStep / Math.max(1, numCars - 1);
  const totalAiLaps = Math.max(1, aiLapTimes.length);
  const aiHazardHitsPerCarLap = aiHazardHits / totalAiLaps;

  return {
    difficulty,
    seed,
    allAiFinished,
    nanCount,
    maxStuckSec,
    aiLapTimes,
    aiAvgLapSec,
    lapRatioToRef,
    standingsConsistent,
    overtakeEvents,
    rankChangesAllCars,
    collisionEvents,
    shortcutEntries,
    shortcutMerges,
    shortcutFalls,
    tunnelingEvents,
    chainedRollovers,
    aiHazardHits,
    aiHazardHitsPerCarLap: Number(aiHazardHitsPerCarLap.toFixed(3)),
    aiRingPasses,
    hazardRollovers,
    avgAiCpuMsPerStep,
    avgAiCpuMsPerCar,
    aiTotalTimes,
    playerTime: playerFinishedTime,
  };
}

function testFastForwardSettlement(course: Course): {
  passed: boolean;
  wallMs: number;
  simSecondsAdvanced: number;
  allRankedValid: boolean;
} {
  const wall0 = performance.now();
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

  const ai = createAiDrivers(course, 'sedang', 777);
  let simTime = 0;
  // Simulate player finishing after 185s while AI still on track (e.g. player ahead)
  for (let step = 0; step < Math.ceil(180 / DT); step++) {
    simTime += DT;
    ai.stepPrePhysics(state.cars, course, 'RACING', DT);
    for (let i = 1; i < state.cars.length; i++) {
      const car = state.cars[i];
      const input = ai.sampleInput(i, state.cars, course, 'RACING', DT);
      stepCar(car, input, course.getRoute(car.routeId), DT, {
        phase: 'RACING',
        respawnTarget: { s: Math.max(4, car.lastSafeS), lateral: 0 },
        respawnRoute: course.getRoute('main'),
      });
      updateRouteTransitions(car, course);
    }
    resolveCarCollisions(state.cars, course, DT, 'RACING');
    updateOpponentProgress(state, course, simTime);
  }

  // Trigger player finish manually to enter FINISH settlement window
  state.phase = 'FINISH';
  state.racerProgress[0].finished = true;
  state.racerProgress[0].dnf = false;
  state.racerProgress[0].finishTime = simTime;
  state.lastFinish = {
    time: simTime,
    medal: 'gold',
    isNewBest: false,
    rank: 1,
    deltaToBest: null,
    splits: [],
    splitDeltas: [],
    isNewSplitBest: [],
    lapTimes: [60, 60, 60],
    bestLap: 60,
    stats: { ...state.stats },
    playerPosition: 1,
    totalRacers: state.cars.length,
    classification: buildClassification(state, course),
  };

  let ffSim = 0;
  const maxFf = CONFIG.ai.finish.fastForwardTimeoutSeconds;
  while (ffSim < maxFf) {
    let allDone = true;
    for (let i = 1; i < state.racerProgress.length; i++) {
      if (!state.racerProgress[i].finished) {
        allDone = false;
        break;
      }
    }
    if (allDone) break;

    ffSim += DT;
    simTime += DT;
    ai.stepPrePhysics(state.cars, course, 'RACING', DT);
    for (let i = 1; i < state.cars.length; i++) {
      const car = state.cars[i];
      if (state.racerProgress[i].finished) continue;
      const input = ai.sampleInput(i, state.cars, course, 'RACING', DT);
      stepCar(car, input, course.getRoute(car.routeId), DT, {
        phase: 'RACING',
        respawnTarget: { s: Math.max(4, car.lastSafeS), lateral: 0 },
        respawnRoute: course.getRoute('main'),
      });
      updateRouteTransitions(car, course);
    }
    resolveCarCollisions(state.cars, course, DT, 'RACING');
    updateOpponentProgress(state, course, simTime);
  }

  markUnfinishedAsDnfAndFinalize(state, course);
  const wallMs = performance.now() - wall0;
  const cls = state.lastFinish?.classification ?? [];
  const allRankedValid =
    cls.length === state.cars.length &&
    cls.every((row, idx) => row.rank === idx + 1 && (row.dnf || row.totalTime !== null));

  return {
    passed: ffSim <= maxFf + DT && allRankedValid && wallMs < 5000,
    wallMs,
    simSecondsAdvanced: ffSim,
    allRankedValid,
  };
}

function main(): void {
  const course = new Course(buildCourseConfigFromDefinition(fantasyLandCourse, false));
  const refLap = fantasyLandCourse.referenceLapTime ?? 65.06;

  const allRuns: SingleRaceReport[] = [];
  for (const spec of DIFFICULTY_SPECS) {
    for (const seed of SEEDS) {
      allRuns.push(runSingleRace(course, spec.difficulty, seed));
    }
  }

  const ffResult = testFastForwardSettlement(course);

  const check1Passed = allRuns.every(
    (r) => r.allAiFinished && r.nanCount === 0 && r.maxStuckSec <= 5.0,
  );

  const difficultySummaries = DIFFICULTY_SPECS.map((spec) => {
    const runs = allRuns.filter((r) => r.difficulty === spec.difficulty);
    const allLaps = runs.flatMap((r) => r.aiLapTimes);
    const avgLap =
      allLaps.length > 0 ? allLaps.reduce((s, v) => s + v, 0) / allLaps.length : 0;
    const actualRatio = avgLap / refLap;
    const relErr = Math.abs(actualRatio - spec.targetRatio) / spec.targetRatio;
    const passed = relErr <= RATIO_TOLERANCE;
    return {
      difficulty: spec.difficulty,
      avgLapSec: Number(avgLap.toFixed(2)),
      targetLapSec: Number((refLap * spec.targetRatio).toFixed(2)),
      actualRatio: Number(actualRatio.toFixed(4)),
      targetRatio: spec.targetRatio,
      relErrorPct: Number((relErr * 100).toFixed(2)),
      passed,
    };
  });

  const check2Passed = difficultySummaries.every((s) => s.passed);
  const check3Passed = allRuns.every((r) => r.standingsConsistent);
  const totalOvertakes = allRuns.reduce((s, r) => s + r.overtakeEvents, 0);
  const totalRankChanges = allRuns.reduce((s, r) => s + r.rankChangesAllCars, 0);
  const totalCollisions = allRuns.reduce((s, r) => s + r.collisionEvents, 0);
  const check4Passed = totalRankChanges > 0; // active racing interactions recorded
  const totalShortcutEntries = allRuns.reduce((s, r) => s + r.shortcutEntries, 0);
  const totalShortcutMerges = allRuns.reduce((s, r) => s + r.shortcutMerges, 0);
  const totalShortcutFalls = allRuns.reduce((s, r) => s + r.shortcutFalls, 0);
  const check5Passed = totalShortcutEntries > 0 && totalShortcutFalls === 0;
  const totalTunneling = allRuns.reduce((s, r) => s + r.tunnelingEvents, 0);
  const totalChainedRollovers = allRuns.reduce((s, r) => s + r.chainedRollovers, 0);
  const check6Passed = totalTunneling === 0 && totalChainedRollovers === 0;
  const avgCpuPerCar =
    allRuns.reduce((s, r) => s + r.avgAiCpuMsPerCar, 0) / Math.max(1, allRuns.length);
  const avgCpuPerStep =
    allRuns.reduce((s, r) => s + r.avgAiCpuMsPerStep, 0) / Math.max(1, allRuns.length);
  const check7Passed = avgCpuPerCar <= 0.2;
  const check8Passed = ffResult.passed;

  const hazardHitLimits: Record<AiDifficulty, number> = {
    mudah: 3.0,
    sedang: 1.5,
    sulit: 0.8,
  };
  const hazardStatsByDiff = DIFFICULTY_SPECS.map((spec) => {
    const runs = allRuns.filter((r) => r.difficulty === spec.difficulty);
    const totalHits = runs.reduce((s, r) => s + r.aiHazardHits, 0);
    const totalLaps = Math.max(1, runs.reduce((s, r) => s + r.aiLapTimes.length, 0));
    const hitsPerLap = totalHits / totalLaps;
    return {
      difficulty: spec.difficulty,
      hitsPerLap,
      limit: hazardHitLimits[spec.difficulty],
      ok: hitsPerLap <= hazardHitLimits[spec.difficulty],
    };
  });
  const totalHazardRollovers = allRuns.reduce((s, r) => s + r.hazardRollovers, 0);
  const totalAiRingPasses = allRuns.reduce((s, r) => s + r.aiRingPasses, 0);
  const check9Passed =
    totalHazardRollovers === 0 &&
    hazardStatsByDiff.every((h) => h.ok) &&
    totalAiRingPasses > 0;

  const checks = [
    {
      id: 1,
      name: '3-Lap Completion, Zero NaN & Stuck <= 5s',
      passed: check1Passed,
      detail: `allFinished=${allRuns.every((r) => r.allAiFinished)}, nan=${allRuns.reduce((s, r) => s + r.nanCount, 0)}, maxStuck=${Math.max(...allRuns.map((r) => r.maxStuckSec)).toFixed(2)}s`,
    },
    {
      id: 2,
      name: 'AI Lap Pace vs Ref (65.06s) within ±4%',
      passed: check2Passed,
      detail: difficultySummaries
        .map(
          (d) =>
            `${d.difficulty}:${d.avgLapSec}s (${d.actualRatio.toFixed(3)}x vs ${d.targetRatio.toFixed(2)}x, err=${d.relErrorPct}%)`,
        )
        .join(' | '),
    },
    {
      id: 3,
      name: 'Standings Monotonic & Consistent',
      passed: check3Passed,
      detail: `runsOk=${allRuns.filter((r) => r.standingsConsistent).length}/${allRuns.length}`,
    },
    {
      id: 4,
      name: 'Overtakes & Collisions Recorded',
      passed: check4Passed,
      detail: `playerOvertakes=${totalOvertakes}, packRankChanges=${totalRankChanges}, collisions=${totalCollisions}`,
    },
    {
      id: 5,
      name: 'Shortcut Usage & Zero Failed Jumps',
      passed: check5Passed,
      detail: `entries=${totalShortcutEntries}, merges=${totalShortcutMerges}, falls=${totalShortcutFalls}`,
    },
    {
      id: 6,
      name: 'Zero Tunneling & Chained Rollovers',
      passed: check6Passed,
      detail: `tunneling=${totalTunneling}, chainedRollovers=${totalChainedRollovers}`,
    },
    {
      id: 7,
      name: 'AI CPU Cost <= 0.2 ms/car',
      passed: check7Passed,
      detail: `avgPerCar=${avgCpuPerCar.toFixed(4)}ms, avgTotal3AI=${avgCpuPerStep.toFixed(4)}ms`,
    },
    {
      id: 8,
      name: 'Fast-Forward Finish Settlement <= 30s',
      passed: check8Passed,
      detail: `simAdvanced=${ffResult.simSecondsAdvanced.toFixed(2)}s, wall=${ffResult.wallMs.toFixed(1)}ms, valid=${ffResult.allRankedValid}`,
    },
    {
      id: 9,
      name: 'Attractions Fair & AI Hazard Dodging',
      passed: check9Passed,
      detail: `${hazardStatsByDiff.map((h) => `${h.difficulty}:${h.hitsPerLap.toFixed(2)}<=${h.limit}`).join(' | ')}, ringPasses=${totalAiRingPasses}, hazardRollovers=${totalHazardRollovers}`,
    },
  ];

  const allPassed = checks.every((c) => c.passed);

  console.log('');
  console.log(`=== SIMULASI AI FANTASYLAND (${SEEDS.length} seeds x ${DIFFICULTY_SPECS.length} kesulitan = ${allRuns.length} balapan) ===`);
  console.log('---------------------------------------------------------------------------------------------');
  for (const c of checks) {
    console.log(
      `#${c.id} ${c.name.padEnd(40)} | ${c.passed ? 'PASS' : 'FAIL'} | ${c.detail}`,
    );
  }
  console.log('---------------------------------------------------------------------------------------------');
  console.log(`OVERALL: ${allPassed ? 'ALL 9 CHECKS PASS' : 'FAILED'}`);

  const outDir = path.resolve(process.cwd(), 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'ai-report.json');
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        courseId: fantasyLandCourse.id,
        referenceLapTime: refLap,
        seeds: SEEDS,
        overallPassed: allPassed,
        checks,
        difficultySummaries,
        fastForwardTest: ffResult,
        runs: allRuns,
      },
      null,
      2,
    ),
    'utf8',
  );
  console.log('Laporan tersimpan di: reports/ai-report.json');

  process.exit(allPassed ? 0 : 1);
}

main();
