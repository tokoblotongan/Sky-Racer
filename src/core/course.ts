// src/core/course.ts

import * as THREE from 'three';
import { arenaToCourseDefinition, type ArenaDefinition } from '../arenas/types';
import { CONFIG } from '../config';
import { getCourse, type CourseDefinition } from '../courses';
import type {
  CourseMedals,
  CourseSegmentConfig,
  RouteDefinition,
  ThemeId,
} from '../courses/types';
import { solveClosure, type ClosureReport } from './courseClosure';
import {
  BranchRoute,
  SampledRouteBase,
  buildSampledTrack,
  createRoute,
  type BoostPadData,
  type CourseBounds,
  type CourseChunkRange,
  type CourseSegmentMeta,
  type CourseSegmentType,
  type GapRange,
  type LapProgress,
  type LoopGapInfo,
  type RailGap,
  type RailLimits,
  type Route,
  type SegmentInfo,
  type StyleRun,
  type TrackFrame,
  type ZoneStart,
} from './routes';

export type {
  BoostPadData,
  CourseBounds,
  CourseChunkRange,
  CourseSegmentMeta,
  CourseSegmentType,
  GapRange,
  LapProgress,
  RailGap,
  RailLimits,
  Route,
  SegmentInfo,
  StyleRun,
  TrackFrame,
  ZoneStart,
};
export { BranchRoute };

export interface CheckpointData {
  index: number;
  s: number;
  frame: TrackFrame;
}

export interface GridSlot {
  index: number;
  s: number;
  lateral: number;
}

export interface CourseConfig {
  id?: string;
  name?: string;
  themeId?: ThemeId;
  closed?: boolean;
  laps?: number;
  racers?: number;
  hasAttractions?: boolean;
  medals?: CourseMedals;
  segments: readonly CourseSegmentConfig[];
  routes?: readonly RouteDefinition[];
  startPosition: { readonly x: number; readonly y: number; readonly z: number };
  startHeadingDeg: number;
  defaultWidth: number;
  stepLength: number;
  bankBlendLength: number;
  slopeBlendLength: number;
  curvatureSmoothWindow: number;
  finishMargin: number;
  boostPadLength: number;
  boostPadWidth: number;
  validate?: boolean;
}

export function buildCourseConfigFromDefinition(
  definition: CourseDefinition = getCourse(CONFIG.activeCourseId),
  validate: boolean = CONFIG.debug.logCourseValidation ||
    CONFIG.debug.showCourseFrames ||
    CONFIG.debug.showFps,
): CourseConfig {
  return {
    id: definition.id,
    name: definition.name,
    themeId: definition.themeId,
    closed: Boolean(definition.closed),
    laps: Math.max(1, Math.round(definition.laps ?? 1)),
    racers: Math.max(1, Math.round(definition.racers ?? 1)),
    hasAttractions: Boolean(definition.hasAttractions),
    medals: definition.medals,
    segments: definition.segments,
    routes: definition.routes,
    startPosition: definition.startPosition ?? CONFIG.course.startPosition,
    startHeadingDeg: definition.startHeadingDeg ?? CONFIG.course.startHeadingDeg,
    defaultWidth: definition.trackWidth ?? CONFIG.course.trackWidth,
    stepLength: CONFIG.course.stepLength,
    bankBlendLength: CONFIG.course.bankBlendLength,
    slopeBlendLength: CONFIG.course.slopeBlendLength,
    curvatureSmoothWindow: CONFIG.course.curvatureSmoothWindow,
    finishMargin: CONFIG.race.finishMargin,
    boostPadLength: CONFIG.boost.padLength,
    boostPadWidth: CONFIG.boost.padWidth,
    validate,
  };
}

export function buildCourseConfigFromArena(
  arena: ArenaDefinition,
  validate?: boolean,
): CourseConfig {
  return buildCourseConfigFromDefinition(arenaToCourseDefinition(arena), validate);
}

export class Course extends SampledRouteBase implements Route {
  private readonly id: string;
  private readonly themeId: ThemeId;
  private readonly laps: number;
  readonly racers: number;
  private readonly attractionsEnabled: boolean;
  private readonly medals: CourseMedals;
  private readonly closureReport: ClosureReport | null;
  private readonly checkpoints: CheckpointData[];
  private readonly branchRoutes: BranchRoute[] = [];
  private readonly branchMap: Map<string, BranchRoute> = new Map();

  constructor(inputConfig?: CourseConfig) {
    const config = inputConfig ?? buildCourseConfigFromDefinition();
    const fallbackDef = getCourse(CONFIG.activeCourseId);
    const id = config.id ?? fallbackDef.id;
    const name = config.name ?? fallbackDef.name;
    const themeId = config.themeId ?? fallbackDef.themeId ?? 'toyroom';
    const closed = Boolean(config.closed);
    const laps = Math.max(1, Math.round(config.laps ?? 1));
    const racers = Math.max(1, Math.round(config.racers ?? fallbackDef.racers ?? 1));
    const medals = config.medals ?? fallbackDef.medals;

    if (config.segments.length === 0) {
      throw new Error('Course requires at least 1 segment.');
    }

    let activeSegments: readonly CourseSegmentConfig[] = config.segments;
    let closureReport: ClosureReport | null = null;
    if (closed) {
      const closureCfg = CONFIG.course.closure;
      const solved = solveClosure(config.segments, {
        startPosition: config.startPosition,
        startHeadingDeg: config.startHeadingDeg,
        stepLength: config.stepLength,
        bankBlendLength: config.bankBlendLength,
        slopeBlendLength: config.slopeBlendLength,
        maxIterations: closureCfg.maxIterations,
        posToleranceM: closureCfg.posToleranceM,
        yawToleranceDeg: closureCfg.yawToleranceDeg,
        maxSlopeDeg: closureCfg.maxSlopeDeg,
      });
      activeSegments = solved.segments;
      closureReport = solved.report;
    }

    const headingRad = THREE.MathUtils.degToRad(config.startHeadingDeg);
    const startT = new THREE.Vector3(Math.sin(headingRad), 0, -Math.cos(headingRad)).normalize();
    const startU = new THREE.Vector3(0, 1, 0);
    const startR = new THREE.Vector3().crossVectors(startT, startU).normalize();

    const sampled = buildSampledTrack({
      segments: activeSegments,
      startFrame: {
        position: new THREE.Vector3(
          config.startPosition.x,
          config.startPosition.y,
          config.startPosition.z,
        ),
        tangent: startT,
        up: startU,
        right: startR,
        pitchRad: 0,
      },
      closed,
      defaultWidth: config.defaultWidth,
      stepLength: config.stepLength,
      bankBlendLength: config.bankBlendLength,
      slopeBlendLength: config.slopeBlendLength,
      curvatureSmoothWindow: config.curvatureSmoothWindow,
      boostPadLength: config.boostPadLength,
      boostPadWidth: config.boostPadWidth,
      closureReport,
    });

    const railGaps: RailGap[] = [];
    super('main', name, closed, config.defaultWidth, sampled, railGaps, config.defaultWidth);

    this.id = id;
    this.themeId = themeId;
    this.laps = laps;
    this.racers = racers;
    this.attractionsEnabled = Boolean(config.hasAttractions);
    this.medals = medals;
    this.closureReport = sampled.closureReport;

    const clampOutsideGap = (s: number): number => {
      let clamped = THREE.MathUtils.clamp(s, 0, this.totalLength);
      const gap = this.getGapRangeAt(clamped);
      if (gap) {
        clamped = clamped - gap.startS < gap.endS - clamped ? gap.startS : gap.endS;
      }
      return THREE.MathUtils.clamp(clamped, 0, this.totalLength);
    };

    const checkpoints: CheckpointData[] = [];
    for (const meta of this.segmentMeta) {
      if (meta.config.checkpoint) {
        const cpS = clampOutsideGap(meta.startS);
        checkpoints.push({
          index: checkpoints.length,
          s: cpS,
          frame: this.getFrameAt(cpS),
        });
      }
    }

    this.checkpoints = checkpoints;
    this.finishS = this.closed
      ? this.totalLength * this.laps
      : clampOutsideGap(Math.max(0, this.totalLength - config.finishMargin));

    if (config.routes && config.routes.length > 0) {
      for (const routeDef of config.routes) {
        const branch = createRoute(this, routeDef, {
          stepLength: config.stepLength,
          bankBlendLength: config.bankBlendLength,
          slopeBlendLength: config.slopeBlendLength,
          curvatureSmoothWindow: config.curvatureSmoothWindow,
          boostPadLength: config.boostPadLength,
          boostPadWidth: config.boostPadWidth,
        });
        this.branchRoutes.push(branch);
        this.branchMap.set(branch.routeId, branch);

        railGaps.push({
          startS: branch.fromS,
          endS: Math.min(this.totalLength, branch.fromS + branch.entryGapLength),
          side: 1,
          kind: 'entry',
        });
        railGaps.push({
          startS: Math.max(0, branch.toS - branch.mergeGapLength),
          endS: branch.toS,
          side: 1,
          kind: 'merge',
        });
      }
    }

    if (config.validate) {
      this.logCourseValidation(config.defaultWidth, sampled.loopGaps);
    }
  }

  private logCourseValidation(defaultWidth: number, loopGaps: readonly LoopGapInfo[]): void {
    let maxOrthoError = 0;
    for (let i = 0; i < this.sampleCount; i++) {
      const i3 = i * 3;
      const tx = this.tanTable[i3];
      const ty = this.tanTable[i3 + 1];
      const tz = this.tanTable[i3 + 2];
      const ux = this.upTable[i3];
      const uy = this.upTable[i3 + 1];
      const uz = this.upTable[i3 + 2];
      const rx = this.rightTable[i3];
      const ry = this.rightTable[i3 + 1];
      const rz = this.rightTable[i3 + 2];

      const lenErr =
        Math.abs(Math.hypot(tx, ty, tz) - 1) +
        Math.abs(Math.hypot(ux, uy, uz) - 1) +
        Math.abs(Math.hypot(rx, ry, rz) - 1);
      const dotErr =
        Math.abs(tx * ux + ty * uy + tz * uz) +
        Math.abs(tx * rx + ty * ry + tz * rz) +
        Math.abs(ux * rx + uy * ry + uz * rz);
      maxOrthoError = Math.max(maxOrthoError, lenErr + dotErr);
    }

    const minArcSeparation = defaultWidth * 2.2;
    let minClearance = Infinity;
    let collisionWarningCount = 0;
    const stride = Math.max(1, Math.floor(this.sampleCount / 360));

    for (let i = 0; i < this.sampleCount; i += stride) {
      if (this.isGapTable[i] === 1) continue;
      const i3 = i * 3;
      const ax = this.posTable[i3];
      const ay = this.posTable[i3 + 1];
      const az = this.posTable[i3 + 2];
      const as = this.sTable[i];
      const aw = this.widthTable[i];

      for (let j = i + stride; j < this.sampleCount; j += stride) {
        if (this.isGapTable[j] === 1) continue;
        const rawDs = this.sTable[j] - as;
        const arcSep = this.closed ? Math.min(rawDs, this.totalLength - rawDs) : rawDs;
        if (arcSep < minArcSeparation) continue;
        const j3 = j * 3;
        const dist = Math.hypot(
          this.posTable[j3] - ax,
          this.posTable[j3 + 1] - ay,
          this.posTable[j3 + 2] - az,
        );
        if (dist < minClearance) minClearance = dist;
        if (dist < Math.max(aw, this.widthTable[j])) collisionWarningCount++;
      }
    }

    const loopSummary =
      loopGaps.length > 0
        ? loopGaps
            .map((g) => `seg#${g.segmentIndex}: ${g.entryExitDistance.toFixed(3)}m`)
            .join(', ')
        : 'none';

    const gapSummary =
      this.gapRanges.length > 0
        ? this.gapRanges
            .map((g) => `${g.startS.toFixed(1)}-${g.endS.toFixed(1)}m`)
            .join(', ')
        : 'none';

    const closureNote = this.closureReport
      ? ` | closureErr=${this.closureReport.posErrorM.toFixed(4)}m yaw=${this.closureReport.dYawDeg.toFixed(3)}°`
      : '';

    const branchNote =
      this.branchRoutes.length > 0
        ? ` | routes=[${this.branchRoutes.map((b) => `${b.routeId}:${b.getLength().toFixed(1)}m`).join(', ')}]`
        : '';

    console.info(
      `[SkyRacer Course] length=${this.totalLength.toFixed(2)}m | samples=${this.sampleCount} | gaps=[${gapSummary}] | maxOrthoErr=${maxOrthoError.toExponential(2)} | loopGap=[${loopSummary}] | minNonAdjacentDist=${Number.isFinite(minClearance) ? minClearance.toFixed(2) : 'n/a'}m${closureNote}${branchNote}`,
    );

    if (collisionWarningCount > 0) {
      console.warn(
        `[SkyRacer Course] Peringatan: terdeteksi ${collisionWarningCount} pasangan sampel lintasan berjarak < lebar lintasan (${defaultWidth}m).`,
      );
    }
  }

  getId(): string {
    return this.id;
  }

  getName(): string {
    return this.name;
  }

  getThemeId(): ThemeId {
    return this.themeId;
  }

  getLaps(): number {
    return this.laps;
  }

  getRacers(): number {
    return this.racers;
  }

  hasAttractions(): boolean {
    return this.attractionsEnabled;
  }

  getClosureReport(): ClosureReport | null {
    return this.closureReport;
  }

  getMedals(): CourseMedals {
    return this.medals;
  }

  getRoute(id: string): Route {
    if (id === 'main') {
      return this;
    }
    return this.branchMap.get(id) ?? this;
  }

  getBranchRoute(id?: string): BranchRoute | null {
    if (id) {
      return this.branchMap.get(id) ?? null;
    }
    return this.branchRoutes[0] ?? null;
  }

  getBranchRoutes(): readonly BranchRoute[] {
    return this.branchRoutes;
  }

  getAllRoutes(): readonly Route[] {
    return [this, ...this.branchRoutes];
  }

  getProgressS(routeId: string, s: number): number {
    if (routeId === 'main') {
      return s;
    }
    const branch = this.branchMap.get(routeId);
    if (!branch) {
      return s;
    }
    const branchLen = Math.max(1e-4, branch.getLength());
    const frac = THREE.MathUtils.clamp(s / branchLen, 0, 1);
    return THREE.MathUtils.lerp(branch.fromS, branch.toS, frac);
  }

  getGridSlots(count = 1): GridSlot[] {
    const gridCfg = CONFIG.course.grid;
    const clampedCount = THREE.MathUtils.clamp(Math.round(count), 1, gridCfg.maxSlots);
    const slots: GridSlot[] = [];

    if (!this.closed) {
      for (let i = 0; i < clampedCount; i++) {
        const row = Math.floor(i / 2);
        const col = i % 2;
        const lat =
          i === 0
            ? CONFIG.car.startLateral
            : (col === 0 ? -1 : 1) * this.trackWidth * gridCfg.lateralFactor;
        const s = Math.max(
          0.5,
          CONFIG.car.startS - row * gridCfg.rowSpacing - col * gridCfg.columnStagger,
        );
        slots.push({ index: i, s, lateral: lat });
      }
      return slots;
    }

    const latOffset = this.trackWidth * gridCfg.lateralFactor;
    for (let i = 0; i < clampedCount; i++) {
      const row = Math.floor(i / 2);
      const col = i % 2;
      const side = col === 0 ? -1 : 1;
      const s = -(gridCfg.firstRowOffset + row * gridCfg.rowSpacing + col * gridCfg.columnStagger);
      slots.push({
        index: i,
        s,
        lateral: side * latOffset,
      });
    }
    return slots;
  }

  getCheckpoints(): readonly CheckpointData[] {
    return this.checkpoints;
  }

  getCheckpointFrame(index: number): TrackFrame {
    if (this.checkpoints.length === 0) {
      return this.getFrameAt(0);
    }
    const clampedIdx = THREE.MathUtils.clamp(index, 0, this.checkpoints.length - 1);
    return this.checkpoints[clampedIdx].frame;
  }
}
