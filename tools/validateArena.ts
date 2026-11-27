// tools/validateArena.ts
// Automatic Arena Kit validator: field completeness, course & attraction invariants,
// AI 1-lap smoke tests, headless scenery budgets, music assets, and unique record keys.

import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import {
  arenaToCourseDefinition,
  createDefaultArenaRegistry,
  resolveArenaCourseData,
  type ArenaDefinition,
} from '../src/arenas';
import { CONFIG, type AiDifficulty } from '../src/config';
import { createAiDrivers } from '../src/core/ai';
import { createAttractionSystem, triangleWave01 } from '../src/core/attractions';
import { autopilotInput } from '../src/core/autopilot';
import { resolveCarCollisions } from '../src/core/collisions';
import { buildCourseConfigFromDefinition, Course } from '../src/core/course';
import { validateCourse } from '../src/core/courseValidation';
import { createHazardEffectsTracker, type AttractionEvent } from '../src/core/hazardEffects';
import { stepCar } from '../src/core/physics';
import { updateRouteTransitions } from '../src/core/routeTransitions';
import {
  createRaceState,
  startCountdown,
  updateOpponentProgress,
  updateRace,
} from '../src/core/state';
import { distanceSInterval } from '../src/courses/fantasyLandAttractions';
import { getThemeDefinition } from '../src/render/themes';
import { getRecordsStorageKey } from '../src/services/records';

import type { GraphicsPreset } from '../src/config';

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

interface BudgetUsage {
  meshes: number;
  triangles: number;
  instances: number;
  drawCalls: number;
  textureMB: number;
  textureCount: number;
}

interface ArenaValidationSummary {
  arena: ArenaDefinition;
  ok: boolean;
  checks: CheckResult[];
  budgets?: BudgetUsage;
  tierBudgets?: Record<GraphicsPreset, BudgetUsage>;
}

function parseArenaIdArg(argv: readonly string[]): string | null {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--arena=')) {
      const v = arg.slice('--arena='.length).trim();
      if (v) return v;
    } else if (arg === '--arena' && i + 1 < argv.length) {
      const v = argv[i + 1].trim();
      if (v) return v;
    }
  }
  return null;
}

function withHeadlessDocument<T>(fn: () => T): T {
  const prevDoc = (globalThis as Record<string, unknown>).document;
  const noopProxy = new Proxy(
    {},
    {
      get(_target, prop): unknown {
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
          return () => ({ addColorStop: () => {} });
        }
        if (prop === 'measureText') {
          return () => ({ width: 10 });
        }
        return () => {};
      },
    },
  );
  (globalThis as Record<string, unknown>).document = {
    createElement(tag: string): unknown {
      if (tag === 'canvas') {
        return {
          width: 256,
          height: 256,
          getContext: () => noopProxy,
        };
      }
      return {};
    },
  };
  try {
    return fn();
  } finally {
    if (prevDoc === undefined) {
      delete (globalThis as Record<string, unknown>).document;
    } else {
      (globalThis as Record<string, unknown>).document = prevDoc;
    }
  }
}

function checkCompleteness(arena: ArenaDefinition): CheckResult {
  const missing: string[] = [];
  const rec = arena as unknown as Record<string, unknown>;
  for (const field of CONFIG.arenaKit.requiredFields) {
    const val = rec[field];
    if (val === undefined || val === null || (typeof val === 'string' && val.trim() === '')) {
      missing.push(field);
    }
  }

  let courseValid = false;
  let segmentCount = 0;
  try {
    const data = resolveArenaCourseData(arena);
    segmentCount = data.segments.length;
    courseValid =
      segmentCount > 0 &&
      Number.isFinite(data.trackWidth) &&
      data.trackWidth > 0 &&
      data.medals.gold > 0 &&
      data.medals.silver >= data.medals.gold &&
      data.medals.bronze >= data.medals.silver;
  } catch {
    courseValid = false;
  }
  if (!courseValid) {
    missing.push('course(valid data/segments/medals)');
  }

  if (arena.laps < 1 || !Number.isFinite(arena.laps)) {
    missing.push('laps(>=1)');
  }
  if (arena.opponentCount < 0 || !Number.isFinite(arena.opponentCount)) {
    missing.push('opponentCount(>=0)');
  }

  return {
    name: 'Field Completeness',
    ok: missing.length === 0,
    detail:
      missing.length === 0
        ? `All ${CONFIG.arenaKit.requiredFields.length} required fields present (${segmentCount} segments)`
        : `Missing/invalid fields: ${missing.join(', ')}`,
  };
}

function checkCourseAndAttractions(arena: ArenaDefinition, course: Course): CheckResult {
  const courseReport = validateCourse(course, CONFIG.physics, {
    validateAttractions: arena.capabilities.hasAttractions,
  });
  const errors = [...courseReport.errors];

  let attrDetail = 'attractions=disabled';
  if (arena.capabilities.hasAttractions) {
    const attr = createAttractionSystem(course, true, 'sedang', true);
    const { plan } = attr;
    if (!plan.enabledForCourse) {
      errors.push('Attractions capability enabled but AttractionSystem inactive');
    } else {
      const mainLen = course.getLength();
      const minClear = CONFIG.attractions.clearanceMeters;
      for (const fz of plan.forbiddenZones) {
        for (const p of plan.pendulums) {
          const d = distanceSInterval(p.s, p.s, fz.startS, fz.endS, mainLen, true);
          if (d < minClear - 1e-4) {
            errors.push(`${p.id} clearance ${d.toFixed(1)}m < ${minClear}m (${fz.label})`);
          }
        }
        for (const g of plan.ballGroups) {
          const s0 = Math.min(...g.balls.map((b) => b.s));
          const s1 = Math.max(...g.balls.map((b) => b.s));
          const d = distanceSInterval(s0, s1, fz.startS, fz.endS, mainLen, true);
          if (d < minClear - 1e-4) {
            errors.push(`${g.id} clearance ${d.toFixed(1)}m < ${minClear}m (${fz.label})`);
          }
        }
        for (const w of plan.windFans) {
          const d = distanceSInterval(w.sStart, w.sEnd, fz.startS, fz.endS, mainLen, true);
          if (d < minClear - 1e-4) {
            errors.push(`${w.id} clearance ${d.toFixed(1)}m < ${minClear}m (${fz.label})`);
          }
        }
        for (const j of plan.jellyPuddles) {
          const d = distanceSInterval(j.sStart, j.sEnd, fz.startS, fz.endS, mainLen, true);
          if (d < minClear - 1e-4) {
            errors.push(`${j.id} clearance ${d.toFixed(1)}m < ${minClear}m (${fz.label})`);
          }
        }
      }

      void triangleWave01(0);
      for (let i = 0; i <= 120; i++) {
        attr.evaluateAtTime(1.25 + i * 0.12);
        for (const p of attr.getPendulums()) {
          const safeFrac =
            Math.max(p.safeLaneLeftWidth, p.safeLaneRightWidth) / Math.max(1, p.spec.trackWidth);
          if (safeFrac < CONFIG.attractions.safeLaneFraction - 1e-4) {
            errors.push(`${p.spec.id} safe lane ${(safeFrac * 100).toFixed(1)}% < 40%`);
          }
        }
        for (const g of attr.getBallGroups()) {
          if (g.minSafeLaneFraction < CONFIG.attractions.safeLaneFraction - 1e-4) {
            errors.push(`${g.spec.id} safe lane ${(g.minSafeLaneFraction * 100).toFixed(1)}% < 40%`);
          }
        }
      }

      const mainRings = plan.boostRings.filter((r) => r.routeId === 'main').length;
      const shortcutRings = plan.boostRings.filter((r) => r.routeId !== 'main').length;
      attrDetail = `pendulums=${plan.pendulums.length}, balls=${plan.ballGroups.length}, wind=${plan.windFans.length}, jelly=${plan.jellyPuddles.length}, rings=${mainRings}+${shortcutRings}`;
    }
  }

  const lengthInfo = `len=${courseReport.lengthM.toFixed(1)}m, autopilot=${courseReport.referenceTime.toFixed(2)}s, ${attrDetail}`;
  return {
    name: 'Course & Attractions',
    ok: errors.length === 0 && courseReport.ok,
    detail:
      errors.length === 0 && courseReport.ok
        ? lengthInfo
        : `${lengthInfo}; errors: ${errors.slice(0, 3).join(' | ')}`,
  };
}

function runAiOneLapSmoke(arena: ArenaDefinition): CheckResult {
  if (!arena.capabilities.hasOpponents || arena.opponentCount <= 0) {
    return {
      name: 'AI Smoke Test (1 Lap)',
      ok: true,
      detail: 'Skipped (single-car arena: hasOpponents=false)',
    };
  }

  const baseDef = arenaToCourseDefinition(arena);
  const oneLapCourse = new Course(
    buildCourseConfigFromDefinition(
      {
        ...baseDef,
        laps: 1,
      },
      false,
    ),
  );

  const difficulties: AiDifficulty[] = ['mudah', 'sedang', 'sulit'];
  const dt = 1 / 60;
  const refLapSec = baseDef.referenceLapTime ?? baseDef.referenceTime / Math.max(1, arena.laps);
  const maxSimSec = Math.max(120, refLapSec * 2.5);
  const maxSteps = Math.ceil(maxSimSec / dt);
  const envScratch = { gripMultiplier: 1, lateralAccel: 0 };
  const attrEvents: AttractionEvent[] = [];

  const diffSummaries: string[] = [];
  const failures: string[] = [];

  for (let dIdx = 0; dIdx < difficulties.length; dIdx++) {
    const diff = difficulties[dIdx];
    const seed = 7101 + dIdx * 137;
    const state = createRaceState(oneLapCourse, { persistRecords: false });
    startCountdown(state, 0, oneLapCourse);
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
        oneLapCourse,
        0.1,
        undefined,
        clockMs,
      );
    }
    state.timer = 0;

    const ai = createAiDrivers(oneLapCourse, diff, seed);
    const attractions = createAttractionSystem(
      oneLapCourse,
      arena.capabilities.hasAttractions,
      diff,
      arena.capabilities.hasAttractions,
    );
    const hazardEffects = createHazardEffectsTracker(state.cars.length);
    const numCars = state.cars.length;
    const stuckTimers = new Array<number>(numCars).fill(0);
    const prevCrashed = new Array<boolean>(numCars).fill(false);
    const lastHazardHitAt = new Array<number>(numCars).fill(-99);

    let maxStuckSec = 0;
    let obstacleRollovers = 0;
    let nanDetected = false;
    let simTime = 0;

    for (let step = 0; step < maxSteps; step++) {
      simTime += dt;
      attractions.evaluateAtTime(simTime);
      hazardEffects.stepPrePhysics(state.cars, attractions, dt);
      ai.stepPrePhysics(state.cars, oneLapCourse, 'RACING', dt);

      for (let i = 0; i < numCars; i++) {
        const car = state.cars[i];
        const rp = state.racerProgress[i];
        const route = oneLapCourse.getRoute(car.routeId);
        const carPhase = i === 0 ? state.phase : rp?.finished ? 'FINISH' : 'RACING';

        const input =
          i === 0
            ? autopilotInput(car, route, { course: oneLapCourse, preferRoute: 'main' })
            : ai.sampleInput(i, state.cars, oneLapCourse, carPhase, dt, attractions, simTime);

        stepCar(car, input, route, dt, {
          phase: carPhase,
          respawnTarget: { s: Math.max(4, car.lastSafeS), lateral: 0 },
          respawnRoute: oneLapCourse.getRoute('main'),
          env: hazardEffects.getEnvModifiers(i, envScratch),
        });
        updateRouteTransitions(car, oneLapCourse);

        if (
          !Number.isFinite(car.s) ||
          !Number.isFinite(car.vForward) ||
          !Number.isFinite(car.worldPos.x)
        ) {
          nanDetected = true;
        }

        if (i > 0) {
          if (!rp?.finished) {
            if (Math.abs(car.vForward) < CONFIG.ai.stuck.minSpeed) {
              stuckTimers[i] += dt;
              if (stuckTimers[i] > maxStuckSec) maxStuckSec = stuckTimers[i];
            } else {
              stuckTimers[i] = 0;
            }
          }
          if (car.crashed && !prevCrashed[i] && simTime - lastHazardHitAt[i] <= 0.75) {
            obstacleRollovers++;
          }
          prevCrashed[i] = car.crashed;
        }
      }

      resolveCarCollisions(state.cars, oneLapCourse, dt, 'RACING');
      attrEvents.length = 0;
      hazardEffects.stepPostPhysics(state.cars, oneLapCourse, attractions, dt, attrEvents);
      for (const ae of attrEvents) {
        if (ae.type === 'hazardHit' && ae.carIndex > 0) {
          lastHazardHitAt[ae.carIndex] = simTime;
        }
      }

      updateRace(
        state,
        {
          s: state.cars[0].s,
          sApprox: state.cars[0].sApprox,
          mode: state.cars[0].mode,
          routeId: state.cars[0].routeId,
          routeLapOffset: state.cars[0].routeLapOffset,
          speedKmh: Math.abs(state.cars[0].vForward) * 3.6,
        },
        oneLapCourse,
        dt,
        undefined,
        clockMs + simTime * 1000,
      );
      updateOpponentProgress(state, oneLapCourse, simTime);

      const allAiDone = state.racerProgress.slice(1).every((r) => Boolean(r?.finished));
      if (allAiDone) {
        break;
      }
    }

    const finishedTimes = state.racerProgress
      .slice(1)
      .map((r) => (r?.finished && r.finishTime !== null ? r.finishTime : null));
    const allFinished = finishedTimes.every((t) => t !== null);
    const avgLap = allFinished
      ? finishedTimes.reduce<number>((acc, v) => acc + (v ?? 0), 0) / Math.max(1, finishedTimes.length)
      : maxSimSec;

    const stuckOk = maxStuckSec < CONFIG.ai.stuck.seconds;
    if (!allFinished || !stuckOk || obstacleRollovers > 0 || nanDetected) {
      failures.push(
        `${diff}: finished=${allFinished}, maxStuck=${maxStuckSec.toFixed(2)}s, obstacleRollovers=${obstacleRollovers}, nan=${nanDetected}`,
      );
    }
    diffSummaries.push(`${diff}=${avgLap.toFixed(1)}s`);
  }

  return {
    name: 'AI Smoke Test (1 Lap)',
    ok: failures.length === 0,
    detail:
      failures.length === 0
        ? `0 stuck, 0 obstacle rollovers (${diffSummaries.join(', ')})`
        : failures.join(' | '),
  };
}

function measureThemePresetUsage(
  arena: ArenaDefinition,
  course: Course,
  graphicsPreset: GraphicsPreset,
): BudgetUsage {
  return withHeadlessDocument(() => {
    const scene = new THREE.Scene();
    const themeDef = arena.themeDefinition ?? getThemeDefinition(arena.theme);
    const quality = graphicsPreset === 'hemat' ? 'mobile' : graphicsPreset === 'seimbang' ? 'medium' : 'high';
    const handle = themeDef.buildScenery({
      course,
      quality,
      scene,
      maxAnisotropy: 1,
      presetName: 'vivid',
      graphicsPreset,
    });

    let meshes = 0;
    let triangles = 0;
    let instances = 0;
    let drawCalls = 0;
    const textures = new Set<THREE.Texture>();

    handle.group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        meshes++;
        const mesh = obj as THREE.Mesh;
        const geom = mesh.geometry;
        if (geom) {
          const triBase = geom.index
            ? geom.index.count / 3
            : geom.attributes.position
              ? geom.attributes.position.count / 3
              : 0;
          if ((obj as THREE.InstancedMesh).isInstancedMesh) {
            const inst = obj as THREE.InstancedMesh;
            instances += inst.count;
            triangles += triBase * inst.count;
            if (inst.count > 0) drawCalls++;
          } else {
            triangles += triBase;
            drawCalls++;
          }
        }
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          if (!m) continue;
          const record = m as unknown as Record<string, unknown>;
          for (const key of [
            'map',
            'roughnessMap',
            'metalnessMap',
            'normalMap',
            'emissiveMap',
            'alphaMap',
            'bumpMap',
            'aoMap',
          ]) {
            const tex = record[key] as THREE.Texture | undefined;
            if (tex && tex.isTexture) {
              textures.add(tex);
            }
          }
        }
      }
    });

    let textureBytes = 0;
    textures.forEach((tex) => {
      const img = tex.image as { width?: number; height?: number } | undefined;
      if (img && img.width && img.height) {
        textureBytes += img.width * img.height * 4 * 1.3333;
      }
    });

    handle.dispose();

    return {
      meshes,
      triangles: Math.round(triangles),
      instances,
      drawCalls,
      textureMB: Number((textureBytes / (1024 * 1024)).toFixed(2)),
      textureCount: textures.size,
    };
  });
}

function checkThemeBudgets(
  arena: ArenaDefinition,
  course: Course,
): {
  result: CheckResult;
  usage: BudgetUsage;
  tierBudgets: Record<GraphicsPreset, BudgetUsage>;
} {
  const hematUsage = measureThemePresetUsage(arena, course, 'hemat');
  const seimbangUsage = measureThemePresetUsage(arena, course, 'seimbang');
  const usage = measureThemePresetUsage(arena, course, 'penuh');

  const b = arena.budgets;
  const over: string[] = [];
  if (usage.meshes > b.meshes) over.push(`meshes ${usage.meshes}/${b.meshes}`);
  if (usage.triangles > b.triangles) over.push(`tris ${usage.triangles}/${b.triangles}`);
  if (usage.instances > b.instances) over.push(`instances ${usage.instances}/${b.instances}`);
  if (usage.textureMB > b.textureMB) over.push(`texMB ${usage.textureMB}/${b.textureMB}`);

  return {
    usage,
    tierBudgets: {
      hemat: hematUsage,
      seimbang: seimbangUsage,
      penuh: usage,
    },
    result: {
      name: 'Scenery Budgets',
      ok: over.length === 0,
      detail:
        over.length === 0
          ? `meshes=${usage.meshes}/${b.meshes}, tris=${usage.triangles}/${b.triangles}, inst=${usage.instances}/${b.instances}, tex=${usage.textureMB.toFixed(2)}/${b.textureMB.toFixed(2)}MB`
          : `Over budget: ${over.join(', ')}`,
    },
  };
}

function checkDecorClearance(arena: ArenaDefinition, course: Course): CheckResult | null {
  const themeDef = arena.themeDefinition ?? getThemeDefinition(arena.theme);
  if (!themeDef.getDecorFootprints) {
    return null;
  }

  const footprints = withHeadlessDocument(() =>
    themeDef.getDecorFootprints!({
      course,
      quality: 'high',
      scene: new THREE.Scene(),
      maxAnisotropy: 1,
      presetName: 'vivid',
      graphicsPreset: 'penuh',
    }),
  );

  const reqClearance = CONFIG.kitchenDecor.clearanceMeters;
  const routeSamples: Array<{ routeId: string; x: number; z: number; halfWidth: number }> = [];
  for (const route of course.getAllRoutes()) {
    const samples = route.getSamples();
    for (let i = 0; i < samples.length; i++) {
      const f = samples[i];
      routeSamples.push({
        routeId: route.routeId,
        x: f.position.x,
        z: f.position.z,
        halfWidth: f.width * 0.5,
      });
    }
  }

  const violations: string[] = [];
  let minEdgeClearance = Number.POSITIVE_INFINITY;
  let checkedCount = 0;
  let structureCount = 0;

  for (const fp of footprints) {
    if (fp.isTrackStructure) {
      structureCount++;
      continue;
    }
    checkedCount++;
    let fpMin = Number.POSITIVE_INFINITY;
    let worstRoute = 'main';
    for (const sample of routeSamples) {
      const dist = Math.hypot(fp.x - sample.x, fp.z - sample.z);
      const edgeClearance = dist - fp.radius - sample.halfWidth;
      if (edgeClearance < fpMin) {
        fpMin = edgeClearance;
        worstRoute = sample.routeId;
      }
    }
    if (fpMin < minEdgeClearance) {
      minEdgeClearance = fpMin;
    }
    if (fpMin < reqClearance - 1e-3) {
      violations.push(`${fp.id} (${worstRoute}: ${fpMin.toFixed(2)}m < ${reqClearance}m)`);
    }
  }

  const minLabel = Number.isFinite(minEdgeClearance) ? `${minEdgeClearance.toFixed(2)}m` : 'n/a';
  return {
    name: 'Decor Clearance',
    ok: violations.length === 0,
    detail:
      violations.length === 0
        ? `${checkedCount} props cleared >= ${reqClearance}m (min=${minLabel}, trackStructures=${structureCount})`
        : `Clearance violations: ${violations.slice(0, 4).join(', ')}`,
  };
}

function checkMusicAssets(arena: ArenaDefinition): CheckResult {
  const audioDir = path.resolve(process.cwd(), 'public', 'audio');
  const maxBytes = CONFIG.arenaKit.maxMusicFileMB * 1024 * 1024;
  const musicEntries = Object.entries(arena.music ?? {}).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim().length > 0,
  );

  if (musicEntries.length === 0) {
    return {
      name: 'Music Assets',
      ok: true,
      detail: 'Uses default fallback tracks (no custom music overrides)',
    };
  }

  const seen = new Set<string>();
  const checkedLabels: string[] = [];
  const problems: string[] = [];

  for (const [, filename] of musicEntries) {
    if (seen.has(filename)) continue;
    seen.add(filename);
    const fullPath = path.join(audioDir, filename);
    if (!fs.existsSync(fullPath)) {
      problems.push(`missing public/audio/${filename}`);
      continue;
    }
    const stat = fs.statSync(fullPath);
    const mb = stat.size / (1024 * 1024);
    checkedLabels.push(`${filename} (${mb.toFixed(2)}MB)`);
    if (stat.size <= 0 || stat.size > maxBytes) {
      problems.push(`${filename} size ${mb.toFixed(2)}MB > ${CONFIG.arenaKit.maxMusicFileMB}MB`);
    }
  }

  return {
    name: 'Music Assets',
    ok: problems.length === 0,
    detail:
      problems.length === 0
        ? `${seen.size} files <= ${CONFIG.arenaKit.maxMusicFileMB}MB [${checkedLabels.join(', ')}]`
        : problems.join('; '),
  };
}

function checkUniqueStorageKeys(
  arena: ArenaDefinition,
  allArenas: readonly ArenaDefinition[],
): CheckResult {
  const myKey = getRecordsStorageKey(arena.id);
  const collisions = allArenas
    .filter((other) => other.id !== arena.id && getRecordsStorageKey(other.id) === myKey)
    .map((other) => other.id);

  return {
    name: 'Unique Record Key',
    ok: collisions.length === 0,
    detail:
      collisions.length === 0
        ? `key='${myKey}' (unique across ${allArenas.length} arenas)`
        : `Duplicate storage key '${myKey}' shared with: ${collisions.join(', ')}`,
  };
}

function validateSingleArena(
  arena: ArenaDefinition,
  allArenas: readonly ArenaDefinition[],
): ArenaValidationSummary {
  const checks: CheckResult[] = [];
  checks.push(checkCompleteness(arena));

  const course = new Course(buildCourseConfigFromDefinition(arenaToCourseDefinition(arena), false));
  checks.push(checkCourseAndAttractions(arena, course));
  checks.push(runAiOneLapSmoke(arena));

  const budgetOut = checkThemeBudgets(arena, course);
  checks.push(budgetOut.result);
  const decorClearance = checkDecorClearance(arena, course);
  if (decorClearance) {
    checks.push(decorClearance);
  }
  checks.push(checkMusicAssets(arena));
  checks.push(checkUniqueStorageKeys(arena, allArenas));

  return {
    arena,
    ok: checks.every((c) => c.ok),
    checks,
    budgets: budgetOut.usage,
    tierBudgets: budgetOut.tierBudgets,
  };
}

function writePerArenaReport(outDir: string, summary: ArenaValidationSummary): string {
  const filename = `arena-${summary.arena.id}.md`;
  const lines: string[] = [
    `# Arena Validation Report: ${summary.arena.name} (\`${summary.arena.id}\`)`,
    '',
    `- **Status**: ${summary.ok ? 'PASS' : 'FAIL'}`,
    `- **Mode**: \`${summary.arena.mode}\` | **Laps**: ${summary.arena.laps} | **Opponents**: ${summary.arena.opponentCount}`,
    `- **Theme**: \`${summary.arena.theme}\` | **Coming Soon**: ${Boolean(summary.arena.comingSoon)}`,
    '',
    '| Check | Status | Details |',
    '|---|---|---|',
  ];
  for (const c of summary.checks) {
    lines.push(`| ${c.name} | ${c.ok ? 'PASS' : 'FAIL'} | ${c.detail} |`);
  }
  if (summary.tierBudgets) {
    lines.push('');
    lines.push('## Scenery Stats by Quality Preset');
    lines.push('');
    lines.push('| Preset | Meshes | Triangles | Instances | Est. Draw Calls | Texture MB |');
    lines.push('|---|---|---|---|---|---|');
    for (const preset of ['hemat', 'seimbang', 'penuh'] as const) {
      const t = summary.tierBudgets[preset];
      lines.push(
        `| \`${preset}\` | ${t.meshes} | ${t.triangles} | ${t.instances} | ${t.drawCalls} | ${t.textureMB.toFixed(2)} |`,
      );
    }
  }
  lines.push('');
  fs.writeFileSync(path.join(outDir, filename), lines.join('\n'), 'utf8');
  return filename;
}

function writeSummaryReport(
  outDir: string,
  summaries: readonly ArenaValidationSummary[],
): void {
  const allOk = summaries.every((s) => s.ok);
  const lines: string[] = [
    '# Arena Kit Validation Summary',
    '',
    `- **Overall Status**: ${allOk ? 'PASS' : 'FAIL'} (${summaries.filter((s) => s.ok).length}/${summaries.length} arenas passed)`,
    '',
    '| Arena ID | Name | Mode | Meshes | Triangles | Instances | Texture MB | Status |',
    '|---|---|---|---|---|---|---|---|',
  ];
  for (const s of summaries) {
    const b = s.budgets;
    lines.push(
      `| \`${s.arena.id}\` | ${s.arena.name} | \`${s.arena.mode}\` | ${b ? `${b.meshes}/${s.arena.budgets.meshes}` : 'n/a'} | ${b ? `${b.triangles}/${s.arena.budgets.triangles}` : 'n/a'} | ${b ? `${b.instances}/${s.arena.budgets.instances}` : 'n/a'} | ${b ? `${b.textureMB.toFixed(2)}/${s.arena.budgets.textureMB.toFixed(2)}` : 'n/a'} | ${s.ok ? 'PASS' : 'FAIL'} |`,
    );
  }
  lines.push('');
  fs.writeFileSync(path.join(outDir, 'arenas.md'), lines.join('\n'), 'utf8');
}

function main(): void {
  const registry = createDefaultArenaRegistry();
  const allArenas = registry.listArenas({ includeComingSoon: true });
  const requestedId = parseArenaIdArg(process.argv.slice(2));

  let targets: readonly ArenaDefinition[];
  if (requestedId) {
    const found = registry.getArena(requestedId);
    if (!found) {
      console.error(`Arena '${requestedId}' not found in ArenaRegistry.`);
      process.exit(1);
    }
    targets = [found];
  } else {
    targets = registry.listArenas({ includeComingSoon: false });
  }

  const outDir = path.resolve(process.cwd(), 'reports');
  fs.mkdirSync(outDir, { recursive: true });

  const summaries: ArenaValidationSummary[] = [];
  for (const arena of targets) {
    const summary = validateSingleArena(arena, allArenas);
    summaries.push(summary);
    const reportFile = writePerArenaReport(outDir, summary);

    console.log('');
    console.log(
      `=== VALIDATING ARENA: ${arena.name} (${arena.id}) [${summary.ok ? 'PASS' : 'FAIL'}] ===`,
    );
    for (const c of summary.checks) {
      console.log(`  [${c.ok ? 'PASS' : 'FAIL'}] ${c.name.padEnd(22)} | ${c.detail}`);
    }
    console.log(`  Report: reports/${reportFile}`);
  }

  if (!requestedId) {
    writeSummaryReport(outDir, summaries);
    console.log('\nSummary report written to: reports/arenas.md');
  }

  const allPassed = summaries.every((s) => s.ok);
  process.exit(allPassed ? 0 : 1);
}

main();
