// src/core/courseValidation.ts

import * as THREE from 'three';
import { CONFIG } from '../config';
import type { TrackStyle } from '../courses/types';
import { autopilotInput } from './autopilot';
import type { Course, CourseSegmentMeta, TrackFrame } from './course';
import type { ClosureReport } from './courseClosure';
import { createCarState, stepCar } from './physics';
import type { BranchRoute } from './routes';
import { updateRouteTransitions } from './routeTransitions';
import { createRaceState, getRespawnTarget, updateRace } from './state';
import { createAttractionSystem } from './attractions';
import {
  buildFantasyLandDecorPlan,
  estimateFantasyDecorBudgets,
  type DecorTierEstimate,
} from '../courses/fantasyLandDecor';
import { distanceSInterval } from '../courses/fantasyLandAttractions';

export interface LoopValidationResult {
  segmentIndex: number;
  startS: number;
  endS: number;
  radius: number;
  lateralOffset: number;
  approachLengthM: number;
  entrySpeed: number;
  topSpeed: number;
  minApexSpeedRequired: number;
  completed: boolean;
}

export interface JumpValidationResult {
  segmentIndex: number;
  startS: number;
  endS: number;
  gapLength: number;
  takeoffSpeed: number;
  minSpeedRequired: number;
  landed: boolean;
  airtime: number;
}

export interface ZoneValidationResult {
  name: string;
  style: TrackStyle;
  startS: number;
  endS: number;
  lengthM: number;
  passTimeSec: number;
  entrySpeedMs: number;
  exitSpeedMs: number;
  passesRecorded: number;
}

export interface TunnelClearanceResult {
  hasTunnel: boolean;
  cameraHeightM: number;
  interiorHeightM: number;
  requiredHeightM: number;
  ok: boolean;
}

export interface BranchValidationResult {
  routeId: string;
  name: string;
  fromS: number;
  toS: number;
  mainArcM: number;
  branchLengthM: number;
  width: number;
  entryWorldErrorM: number;
  entryEndWorldErrorM: number;
  mergeWorldErrorM: number;
  solverConverged: boolean;
  solverPosErrorM: number;
  solverYawErrorDeg: number;
  minCorridorClearanceM: number | null;
  jumps: JumpValidationResult[];
  mainTimeSec: number;
  shortcutTimeSec: number;
  timeSavingSec: number;
  perLapSavingSec: number;
  shortcutEntries: number;
  shortcutMerges: number;
  shortcutFalls: number;
  shortcutStuck: number;
  shortcutRailHits: number;
  ok: boolean;
}

export interface DecorValidationResult {
  checked: boolean;
  placementCount: number;
  minLateralClearanceM: number | null;
  minOverTrackClearanceM: number | null;
  rainbowApexAboveTrackM: number | null;
  blockedJumpOrGateCount: number;
  budgets: DecorTierEstimate[];
  ok: boolean;
}

export interface AttractionsValidationResult {
  checked: boolean;
  pendulumCount: number;
  ballGroupCount: number;
  windFanCount: number;
  jellyPuddleCount: number;
  mainBoostRingCount: number;
  shortcutBoostRingCount: number;
  minForbiddenClearanceM: number | null;
  minSafeLaneRatio: number;
  ok: boolean;
}

export interface CourseValidationReport {
  ok: boolean;
  closed: boolean;
  laps: number;
  trackWidth: number;
  lengthM: number;
  referenceTime: number;
  referenceLapTime: number;
  lapTimes: number[];
  bestLap: number | null;
  minNonAdjacentClearanceM: number | null;
  minStyleClearanceM: number | null;
  tunnelClearance: TunnelClearanceResult;
  closure: ClosureReport | null;
  checkpointTimes: number[];
  loops: LoopValidationResult[];
  jumps: JumpValidationResult[];
  zones: ZoneValidationResult[];
  branches: BranchValidationResult[];
  decor: DecorValidationResult | null;
  attractions: AttractionsValidationResult | null;
  railHits: number;
  stuckEvents: number;
  falls: number;
  warnings: string[];
  errors: string[];
}

interface ZoneSpan {
  name: string;
  style: TrackStyle;
  startS: number;
  endS: number;
}

function getSegmentIndexForS(segments: readonly CourseSegmentMeta[], s: number): number {
  for (let i = 0; i < segments.length; i++) {
    if (s >= segments[i].startS && s < segments[i].endS) {
      return i;
    }
  }
  return Math.max(0, segments.length - 1);
}

function collectNamedZones(segments: readonly CourseSegmentMeta[]): ZoneSpan[] {
  const spans: ZoneSpan[] = [];
  for (const seg of segments) {
    const trimmed = seg.name?.trim();
    if (!trimmed) {
      continue;
    }
    const prev = spans[spans.length - 1];
    if (prev && prev.name === trimmed && Math.abs(prev.endS - seg.startS) < 1e-3) {
      prev.endS = seg.endS;
    } else {
      spans.push({
        name: trimmed,
        style: seg.style,
        startS: seg.startS,
        endS: seg.endS,
      });
    }
  }
  return spans;
}

function getWorldPointOnFrame(frame: TrackFrame, lateral: number): THREE.Vector3 {
  return frame.position.clone().addScaledVector(frame.right, lateral);
}

function measureBranchCorridorClearance(course: Course, branch: BranchRoute): number | null {
  const branchSamples = branch.getSamples();
  const mainSamples = course.getSamples();
  const entryEnd = branch.entryGapLength + 15;
  const mergeStart = branch.getLength() - branch.mergeGapLength - 15;
  let minDist = Infinity;

  const strideB = Math.max(1, Math.floor(branchSamples.length / 220));
  const strideM = Math.max(1, Math.floor(mainSamples.length / 360));

  for (let i = 0; i < branchSamples.length; i += strideB) {
    const bs = branchSamples[i];
    if (bs.isGap || bs.s < entryEnd || bs.s > mergeStart) continue;

    for (let j = 0; j < mainSamples.length; j += strideM) {
      const ms = mainSamples[j];
      if (ms.isGap) continue;
      const nearEntry =
        ms.s >= branch.fromS - 20 && ms.s <= branch.fromS + branch.entryGapLength + 25;
      const nearMerge =
        ms.s >= branch.toS - branch.mergeGapLength - 25 && ms.s <= branch.toS + 20;
      if (nearEntry || nearMerge) continue;

      const d = bs.position.distanceTo(ms.position);
      if (d < minDist) {
        minDist = d;
      }
    }
  }

  return Number.isFinite(minDist) ? minDist : null;
}

interface BranchAutopilotOutcome {
  finished: boolean;
  elapsedTime: number;
  lapTimes: number[];
  railHits: number;
  falls: number;
  stuckEvents: number;
  entries: number;
  merges: number;
  jumps: JumpValidationResult[];
}

function runBranchAutopilotSim(
  course: Course,
  branch: BranchRoute,
  branchMinSpeedReqBySeg: ReadonlyMap<number, number>,
): BranchAutopilotOutcome {
  const dt = 1 / 60;
  const maxSteps = Math.round(360 / dt);
  const startSlot = course.getGridSlots(1)[0];
  const carState = createCarState({ s: startSlot.s, lateral: startSlot.lateral });
  const raceState = createRaceState(course, { persistRecords: false });
  raceState.phase = 'RACING';

  const jumpResults: JumpValidationResult[] = branch
    .getSegmentList()
    .filter((s) => s.type === 'gap')
    .map((s) => ({
      segmentIndex: s.index,
      startS: s.startS,
      endS: s.endS,
      gapLength: s.length,
      takeoffSpeed: 0,
      minSpeedRequired: branchMinSpeedReqBySeg.get(s.index) ?? 0,
      landed: false,
      airtime: 0,
    }));

  let activeJumpIdx = -1;
  let railHits = 0;
  let falls = 0;
  let stuckEvents = 0;
  let entries = 0;
  let merges = 0;
  let lowSpeedTimer = 0;
  let simElapsed = 0;
  let finished = false;

  for (let step = 0; step < maxSteps; step++) {
    const activeRoute = course.getRoute(carState.routeId);
    const input = autopilotInput(carState, activeRoute, { course, preferRoute: 'shortcut' });
    const respawnTarget = getRespawnTarget(raceState, course);
    const events = stepCar(carState, input, activeRoute, dt, {
      phase: raceState.phase,
      respawnTarget,
      respawnRoute: course.getRoute(respawnTarget.routeId),
    });
    simElapsed += dt;

    const transition = updateRouteTransitions(carState, course);
    if (transition?.toRouteId === branch.routeId && transition.kind === 'enter') {
      entries++;
    } else if (transition?.fromRouteId === branch.routeId && transition.kind === 'merge') {
      merges++;
    }

    const onBranch = carState.routeId === branch.routeId;
    for (const ev of events) {
      if (ev.type === 'railHit') {
        railHits++;
      } else if (ev.type === 'fell') {
        falls++;
      } else if (ev.type === 'takeoff' && onBranch) {
        let bestIdx = -1;
        let bestDist = Infinity;
        for (let ji = 0; ji < jumpResults.length; ji++) {
          const d = Math.abs(carState.sApprox - jumpResults[ji].startS);
          if (d < bestDist) {
            bestDist = d;
            bestIdx = ji;
          }
        }
        if (bestIdx >= 0 && bestDist < 12) {
          activeJumpIdx = bestIdx;
          if (jumpResults[bestIdx].takeoffSpeed === 0) {
            jumpResults[bestIdx].takeoffSpeed = carState.worldVel.length();
          }
        }
      } else if (ev.type === 'landed' && activeJumpIdx >= 0) {
        if (onBranch) {
          const jr = jumpResults[activeJumpIdx];
          if (carState.s >= jr.endS - 1.5) {
            jr.landed = true;
            jr.airtime = Math.max(jr.airtime, ev.airtime);
          }
        }
        activeJumpIdx = -1;
      }
    }

    if (simElapsed > 2.0 && carState.mode === 'grounded' && Math.abs(carState.vForward) < 2.0) {
      lowSpeedTimer += dt;
      if (lowSpeedTimer >= 1.5) {
        stuckEvents++;
        lowSpeedTimer = 0;
      }
    } else {
      lowSpeedTimer = 0;
    }

    const raceEvents = updateRace(
      raceState,
      {
        s: carState.s,
        sApprox: carState.sApprox,
        mode: carState.mode,
        routeId: carState.routeId,
        routeLapOffset: carState.routeLapOffset,
      },
      course,
      dt,
    );

    if (raceEvents.some((ev) => ev.type === 'finish')) {
      finished = true;
      break;
    }
  }

  return {
    finished,
    elapsedTime: finished ? raceState.timer : simElapsed,
    lapTimes: raceState.lapTimes.map((t) => Number(t.toFixed(3))),
    railHits,
    falls,
    stuckEvents,
    entries,
    merges,
    jumps: jumpResults,
  };
}

export interface ValidateCourseOptions {
  readonly validateDecor?: boolean;
  readonly validateAttractions?: boolean;
}

export function validateCourse(
  course: Course,
  physicsConfig: typeof CONFIG.physics = CONFIG.physics,
  options?: ValidateCourseOptions,
): CourseValidationReport {
  const warnings: string[] = [];
  const errors: string[] = [];

  const isClosed = course.isClosed();
  const laps = course.getLaps();
  const lengthM = course.getLength();
  const segments = course.getSegmentList();
  const checkpoints = course.getCheckpoints();
  const boostPads = course.getBoostPads();
  const gaps = course.getGapRanges();
  const trackWidth = course.getTrackWidth();
  const closureReport = course.getClosureReport();
  const styleRuns = course.getStyleRuns();

  if (isClosed) {
    if (!closureReport) {
      errors.push('Sirkuit tertutup tidak memiliki laporan penutupan (closureReport).');
    } else if (
      !closureReport.converged ||
      closureReport.posErrorM > CONFIG.course.closure.posToleranceM ||
      Math.abs(closureReport.dYawDeg) > CONFIG.course.closure.yawToleranceDeg
    ) {
      errors.push(
        `Sirkuit gagal menutup di titik start: posErr=${closureReport.posErrorM.toFixed(4)} m, dYaw=${closureReport.dYawDeg.toFixed(3)}°.`,
      );
    }
    if (lengthM < 700 || lengthM > 3200) {
      warnings.push(
        `Panjang satu lap ${lengthM.toFixed(1)} m di luar kisaran wajar 700-3200 m.`,
      );
    }
  } else if (lengthM < 900 || lengthM > 1200) {
    warnings.push(
      `Panjang lintasan ${lengthM.toFixed(1)} m di luar kisaran target 900-1200 m.`,
    );
  }

  // (a) Self-intersection, 3D clearance, crossing height difference, ground clearance, and bridge/tunnel separation
  const sampleStep = 1.0;
  const maxSampleS = isClosed ? Math.max(0, lengthM - 1e-4) : lengthM + 1e-4;
  const sampledFrames: Array<{ frame: TrackFrame; segIndex: number; style: TrackStyle }> = [];
  for (let s = 0; s <= maxSampleS; s += sampleStep) {
    const f = course.getFrameAt(s);
    if (!f.isGap) {
      const segIdx = getSegmentIndexForS(segments, s);
      sampledFrames.push({
        frame: f,
        segIndex: segIdx,
        style: segments[segIdx]?.style ?? 'road',
      });
    }
  }

  const minFloorY = 1.5;
  let lowestFloorY = Infinity;
  for (const item of sampledFrames) {
    if (item.frame.position.y < lowestFloorY) {
      lowestFloorY = item.frame.position.y;
    }
  }
  if (lowestFloorY < minFloorY) {
    warnings.push(
      `Ketinggian minimum lintasan ${lowestFloorY.toFixed(2)} m terlalu dekat dengan lantai (< ${minFloorY} m).`,
    );
  }

  const min3DClearance = 2.5 * trackWidth;
  const minArcSeparation = Math.max(24, trackWidth * 3.2);
  const minStyleSeparation = 40;
  const cellSize = Math.max(min3DClearance, minStyleSeparation);
  const grid = new Map<string, number[]>();

  for (let i = 0; i < sampledFrames.length; i++) {
    const p = sampledFrames[i].frame.position;
    const gx = Math.floor(p.x / cellSize);
    const gz = Math.floor(p.z / cellSize);
    const key = `${gx},${gz}`;
    let bucket = grid.get(key);
    if (!bucket) {
      bucket = [];
      grid.set(key, bucket);
    }
    bucket.push(i);
  }

  let worstNonAdjacentClearance = Infinity;
  let worstStyleClearance = Infinity;
  let worstCrossingVertDiff = Infinity;
  const reportedPairs = new Set<string>();
  const loopSegs = segments.filter((seg) => seg.type === 'loop');
  const hasOverpassHazard = segments.some((s) => s.type === 'gap' || s.type === 'loop');

  const isSameStyleRun = (sA: number, sB: number): boolean => {
    for (const run of styleRuns) {
      if (run.style === 'road') continue;
      if (sA >= run.startS - 1 && sA <= run.endS + 1 && sB >= run.startS - 1 && sB <= run.endS + 1) {
        return true;
      }
    }
    return false;
  };

  for (let i = 0; i < sampledFrames.length; i++) {
    const a = sampledFrames[i];
    const pa = a.frame.position;
    const gx = Math.floor(pa.x / cellSize);
    const gz = Math.floor(pa.z / cellSize);

    for (let dxCell = -1; dxCell <= 1; dxCell++) {
      for (let dzCell = -1; dzCell <= 1; dzCell++) {
        const bucket = grid.get(`${gx + dxCell},${gz + dzCell}`);
        if (!bucket) continue;

        for (const j of bucket) {
          if (j <= i) continue;
          const b = sampledFrames[j];
          const rawDs = b.frame.s - a.frame.s;
          const ds = isClosed ? Math.min(rawDs, lengthM - rawDs) : rawDs;
          if (ds < minArcSeparation) continue;

          const sameLoopNeighborhood = loopSegs.some((lp) => {
            const margin = Math.max(22, (lp.config.type === 'loop' ? lp.config.radius : 12) * 2.1);
            return a.frame.s >= lp.startS - margin && b.frame.s <= lp.endS + margin;
          });
          if (sameLoopNeighborhood) {
            continue;
          }

          const pb = b.frame.position;
          const dx = pb.x - pa.x;
          const dy = pb.y - pa.y;
          const dz = pb.z - pa.z;
          const horizDist = Math.hypot(dx, dz);
          const vertDist = Math.abs(dy);
          const dist3D = Math.hypot(dx, dy, dz);

          const segPairKey = `${a.segIndex}-${b.segIndex}`;

          if (horizDist < trackWidth) {
            if (vertDist < worstCrossingVertDiff) {
              worstCrossingVertDiff = vertDist;
            }
            if (
              (vertDist < 12 || (isClosed && !hasOverpassHazard)) &&
              !reportedPairs.has(`cross:${segPairKey}`)
            ) {
              reportedPairs.add(`cross:${segPairKey}`);
              errors.push(
                `Persilangan segmen #${a.segIndex} (s=${a.frame.s.toFixed(0)}m) dan #${b.segIndex} (s=${b.frame.s.toFixed(0)}m) selisih tinggi hanya ${vertDist.toFixed(1)} m.`,
              );
            }
          } else {
            if (dist3D < worstNonAdjacentClearance) {
              worstNonAdjacentClearance = dist3D;
            }
            if (dist3D < trackWidth * 1.35 && !reportedPairs.has(`col:${segPairKey}`)) {
              reportedPairs.add(`col:${segPairKey}`);
              errors.push(
                `Lintasan bertabrakan antara segmen #${a.segIndex} (s=${a.frame.s.toFixed(0)}m) dan #${b.segIndex} (s=${b.frame.s.toFixed(0)}m): jarak 3D ${dist3D.toFixed(1)} m.`,
              );
            } else if (dist3D < min3DClearance && !reportedPairs.has(`near:${segPairKey}`)) {
              reportedPairs.add(`near:${segPairKey}`);
              warnings.push(
                `Jarak non-bersebelahan segmen #${a.segIndex} dan #${b.segIndex} hanya ${dist3D.toFixed(1)} m (< ${min3DClearance.toFixed(1)} m).`,
              );
            }
          }

          const involvesBridgeOrTunnel =
            a.style === 'bridge' ||
            a.style === 'tunnel' ||
            b.style === 'bridge' ||
            b.style === 'tunnel';
          if (
            involvesBridgeOrTunnel &&
            !isSameStyleRun(a.frame.s, b.frame.s) &&
            ds >= minStyleSeparation
          ) {
            if (dist3D < worstStyleClearance) {
              worstStyleClearance = dist3D;
            }
            if (dist3D < minStyleSeparation && !reportedPairs.has(`style:${segPairKey}`)) {
              reportedPairs.add(`style:${segPairKey}`);
              errors.push(
                `Zona jembatan/terowongan segmen #${a.segIndex} terlalu dekat dengan segmen #${b.segIndex} (${dist3D.toFixed(1)} m < ${minStyleSeparation} m).`,
              );
            }
          }
        }
      }
    }
  }

  // (b) Geometric ballistic feasibility check per gap
  const maxPossibleSpeed = physicsConfig.maxSpeed * CONFIG.boost.maxSpeedMultiplier;
  const minSpeedReqBySeg = new Map<number, number>();
  for (const seg of segments) {
    if (seg.type !== 'gap' || seg.config.type !== 'gap') continue;
    const fStart = course.getFrameAt(seg.startS);
    const fEnd = course.getFrameAt(seg.endS);
    const dx = fEnd.position.x - fStart.position.x;
    const dz = fEnd.position.z - fStart.position.z;
    const horizSpan = Math.hypot(dx, dz);
    const tanHoriz = Math.max(0.15, Math.hypot(fStart.tangent.x, fStart.tangent.z));
    const slopeTan = fStart.tangent.y / tanHoriz;
    const dyTarget = fEnd.position.y - fStart.position.y;
    const neededDrop = horizSpan * slopeTan - dyTarget;
    if (neededDrop <= 0.1) {
      errors.push(
        `Lompatan segmen #${seg.index} (s=${seg.startS.toFixed(1)}m) tidak realistis secara balistik (sudut ramp tidak cukup menanjak).`,
      );
      minSpeedReqBySeg.set(seg.index, Infinity);
    } else {
      const vHorizMin = horizSpan * Math.sqrt(physicsConfig.gravity / (2 * neededDrop));
      const vMinRequired = vHorizMin / tanHoriz;
      minSpeedReqBySeg.set(seg.index, vMinRequired);
      if (vMinRequired > maxPossibleSpeed) {
        errors.push(
          `Lompatan segmen #${seg.index} butuh kecepatan minimal ${vMinRequired.toFixed(1)} m/s (> kecepatan maksimal ${maxPossibleSpeed.toFixed(1)} m/s).`,
        );
      }
    }
  }

  // (c) Geometric loop rules
  const loopRules = CONFIG.loopRules;
  const strictLoopRules = isClosed || trackWidth >= 12;
  const loopResults: LoopValidationResult[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.type !== 'loop' || seg.config.type !== 'loop') continue;
    const minApexSpeedRequired = Math.sqrt(physicsConfig.gravity * seg.config.radius);

    // Measure non-curving approach run-in (straight or slope segments before loop)
    let approachLengthM = 0;
    let hasDownhillOrWideBoost = false;
    for (let k = i - 1; k >= 0; k--) {
      const prev = segments[k];
      if (prev.type === 'straight' || prev.type === 'slope') {
        approachLengthM += prev.length;
        if (prev.config.type === 'slope' && prev.config.pitchDeg < 0) {
          hasDownhillOrWideBoost = true;
        }
        if (prev.config.boostPads && prev.config.boostPads.length > 0) {
          const hasWideOrMulti =
            prev.config.boostPads.length >= 2 ||
            prev.config.boostPads.some((p) => (p.width ?? CONFIG.boost.padWidth) >= 3.2);
          if (hasWideOrMulti || prev.config.boostPads.length >= 1) {
            hasDownhillOrWideBoost = true;
          }
        }
      } else {
        break;
      }
    }

    if (strictLoopRules) {
      if (seg.config.radius < loopRules.minRadius) {
        errors.push(
          `Loop segmen #${seg.index} radius=${seg.config.radius} m < minimum ${loopRules.minRadius} m.`,
        );
      }
      if (Math.abs(seg.config.lateralOffset) <= trackWidth + loopRules.offsetMargin) {
        errors.push(
          `Loop segmen #${seg.index} lateralOffset=${seg.config.lateralOffset} m harus lebih besar dari lebar + ${loopRules.offsetMargin} m (${trackWidth + loopRules.offsetMargin} m).`,
        );
      }
      if (approachLengthM < loopRules.minApproachLength) {
        errors.push(
          `Pendekatan lurus sebelum loop segmen #${seg.index} hanya ${approachLengthM.toFixed(1)} m (< ${loopRules.minApproachLength} m).`,
        );
      } else if (!hasDownhillOrWideBoost) {
        warnings.push(
          `Pendekatan sebelum loop segmen #${seg.index} belum memiliki turunan atau pad boost lebar.`,
        );
      }
    } else {
      if (Math.abs(seg.config.lateralOffset) < trackWidth + 1.0) {
        errors.push(
          `Loop segmen #${seg.index} lateralOffset=${seg.config.lateralOffset}m terlalu sempit (< lebar lintasan + 1 m).`,
        );
      }
      if (approachLengthM < 40) {
        warnings.push(
          `Lurus sebelum loop segmen #${seg.index} hanya ${approachLengthM.toFixed(1)} m (< 40 m).`,
        );
      }
    }

    loopResults.push({
      segmentIndex: seg.index,
      startS: seg.startS,
      endS: seg.endS,
      radius: seg.config.radius,
      lateralOffset: seg.config.lateralOffset,
      approachLengthM: Number(approachLengthM.toFixed(1)),
      entrySpeed: 0,
      topSpeed: 0,
      minApexSpeedRequired,
      completed: false,
    });
  }

  // (d) Tunnel headroom >= chase camera height + 6 m
  const hasTunnel = styleRuns.some((r) => r.style === 'tunnel');
  const widthRatio = trackWidth / CONFIG.course.defaultWidth;
  const widthScale = 1 + Math.max(0, widthRatio - 1) * CONFIG.camera.widthScale;
  const cameraHeightM = CONFIG.camera.height * widthScale * CONFIG.car.visualScale;
  const requiredHeightM = cameraHeightM + 6;
  const interiorHeightM = CONFIG.styles.tunnel.interiorHeight;
  const tunnelOk = !hasTunnel || interiorHeightM >= requiredHeightM;
  if (!tunnelOk) {
    errors.push(
      `Tinggi dalam terowongan ${interiorHeightM.toFixed(2)} m < tinggi kamera + 6 m (${requiredHeightM.toFixed(2)} m).`,
    );
  }

  // Checkpoints & boost pads inside gaps/loops and before hazards
  for (const cp of checkpoints) {
    const segIdx = getSegmentIndexForS(segments, cp.s);
    const seg = segments[segIdx];
    if (course.isGapAt(cp.s) || seg?.type === 'gap') {
      errors.push(`Checkpoint #${cp.index + 1} berada di dalam celah (gap) pada s=${cp.s.toFixed(1)} m.`);
    }
    if (seg?.type === 'loop') {
      errors.push(`Checkpoint #${cp.index + 1} berada di dalam loop pada s=${cp.s.toFixed(1)} m.`);
    }
  }

  for (const pad of boostPads) {
    const halfLen = pad.length * 0.5;
    const padInGap = gaps.some((g) => pad.s + halfLen > g.startS && pad.s - halfLen < g.endS);
    if (padInGap) {
      errors.push(`Boost pad #${pad.id + 1} pada s=${pad.s.toFixed(1)} m bertumpuk dengan celah.`);
    }
    const padFrame = course.getFrameAt(pad.s);
    const maxLat = padFrame.width * 0.5 - pad.width * 0.5;
    if (Math.abs(pad.lateral) > maxLat + 0.05) {
      errors.push(`Boost pad #${pad.id + 1} keluar dari batas lebar lintasan.`);
    }
  }

  for (const seg of segments) {
    if (seg.type !== 'gap' && seg.type !== 'loop') continue;
    const hasCpBefore = checkpoints.some(
      (cp) => cp.s <= seg.startS + 0.5 && seg.startS - cp.s <= 160,
    );
    if (!hasCpBefore) {
      warnings.push(
        `Tidak ada checkpoint dalam 160 m sebelum ${seg.type} (segmen #${seg.index}, s=${seg.startS.toFixed(1)} m).`,
      );
    }
  }

  // (e) Checkpoint count & spacing
  if (isClosed) {
    if (checkpoints.length < 4 || checkpoints.length > 12) {
      warnings.push(
        `Jumlah checkpoint per lap ${checkpoints.length} (target 4-12 checkpoint).`,
      );
    }
    if (checkpoints.length > 0) {
      const cpLoop = [...checkpoints.map((c) => c.s), checkpoints[0].s + lengthM];
      for (let i = 1; i < cpLoop.length; i++) {
        const spacing = cpLoop[i] - cpLoop[i - 1];
        if (spacing > 650) {
          warnings.push(
            `Jarak antar checkpoint melingkar terlalu panjang (${spacing.toFixed(1)} m > 650 m).`,
          );
        } else if (spacing < 35) {
          warnings.push(
            `Jarak antar checkpoint terlalu rapat (${spacing.toFixed(1)} m < 35 m).`,
          );
        }
      }
    }
  } else {
    if (checkpoints.length < 8 || checkpoints.length > 11) {
      warnings.push(
        `Jumlah checkpoint ${checkpoints.length} (target 8-11 checkpoint).`,
      );
    }
    const finishS = course.getFinishS();
    const cpBounds = [CONFIG.car.startS, ...checkpoints.map((c) => c.s), finishS];
    for (let i = 1; i < cpBounds.length; i++) {
      const spacing = cpBounds[i] - cpBounds[i - 1];
      if (spacing > 220) {
        warnings.push(
          `Jarak antar titik aman terlalu panjang (${spacing.toFixed(1)} m > 220 m).`,
        );
      } else if (i > 1 && i < cpBounds.length - 1 && spacing < 35) {
        warnings.push(
          `Jarak antar checkpoint #${i - 1} dan #${i} terlalu rapat (${spacing.toFixed(1)} m < 35 m).`,
        );
      }
    }
  }

  // (f) Full headless autopilot simulation (dt = 1/60, timeout 360s)
  const dt = 1 / 60;
  const maxSteps = Math.round(360 / dt);

  const startSlot = course.getGridSlots(1)[0];
  const carState = createCarState({ s: startSlot.s, lateral: startSlot.lateral });
  const raceState = createRaceState(course, { persistRecords: false });
  raceState.phase = 'RACING';

  const jumpResults: JumpValidationResult[] = segments
    .filter((s) => s.type === 'gap')
    .map((s) => ({
      segmentIndex: s.index,
      startS: s.startS,
      endS: s.endS,
      gapLength: s.length,
      takeoffSpeed: 0,
      minSpeedRequired: minSpeedReqBySeg.get(s.index) ?? 0,
      landed: false,
      airtime: 0,
    }));

  const namedZoneSpans = collectNamedZones(segments);
  const zoneAccum = namedZoneSpans.map((z) => ({
    span: z,
    active: false,
    enterTime: 0,
    enterSpeed: 0,
    totalTime: 0,
    totalEntrySpeed: 0,
    totalExitSpeed: 0,
    passes: 0,
  }));

  const loopEntered = new Set<number>();
  let activeJumpIdx = -1;
  let railHits = 0;
  let falls = 0;
  let stuckEvents = 0;
  let lowSpeedTimer = 0;
  let simElapsed = 0;
  let finished = false;
  let prevWrappedS = isClosed ? course.wrapDistance(startSlot.s) : startSlot.s;

  for (let step = 0; step < maxSteps; step++) {
    const activeRoute = course.getRoute(carState.routeId);
    const input = autopilotInput(carState, activeRoute, { course, preferRoute: 'main' });
    const respawnTarget = getRespawnTarget(raceState, course);
    const events = stepCar(carState, input, activeRoute, dt, {
      phase: raceState.phase,
      respawnTarget,
      respawnRoute: course.getRoute(respawnTarget.routeId),
    });
    simElapsed += dt;
    updateRouteTransitions(carState, course);

    const rawS = carState.mode === 'grounded' ? carState.s : carState.sApprox;
    const wrappedS = isClosed ? course.wrapDistance(rawS) : rawS;
    const speedNow =
      carState.mode === 'grounded' ? Math.abs(carState.vForward) : carState.worldVel.length();

    // Track per-zone pass telemetry across laps
    const wrappedReset = isClosed && prevWrappedS > lengthM * 0.7 && wrappedS < lengthM * 0.3;
    for (const z of zoneAccum) {
      if (wrappedReset && z.active) {
        z.active = false;
      }
      const inside = wrappedS >= z.span.startS && wrappedS < z.span.endS;
      if (!z.active && inside && prevWrappedS <= z.span.startS + 4) {
        z.active = true;
        z.enterTime = simElapsed;
        z.enterSpeed = speedNow;
      } else if (z.active && (wrappedS >= z.span.endS || wrappedReset)) {
        z.active = false;
        z.totalTime += simElapsed - z.enterTime;
        z.totalEntrySpeed += z.enterSpeed;
        z.totalExitSpeed += speedNow;
        z.passes += 1;
      }
    }
    prevWrappedS = wrappedS;

    for (const lr of loopResults) {
      const inLoop = wrappedS >= lr.startS && wrappedS <= lr.endS;
      if (!loopEntered.has(lr.segmentIndex) && inLoop) {
        loopEntered.add(lr.segmentIndex);
        lr.entrySpeed = Math.max(lr.entrySpeed, speedNow);
      }
      if (inLoop) {
        const segMid = (lr.startS + lr.endS) * 0.5;
        if (Math.abs(wrappedS - segMid) < lr.radius * 0.7) {
          if (lr.topSpeed === 0 || speedNow < lr.topSpeed) {
            lr.topSpeed = speedNow;
          }
        }
      }
      if (!lr.completed && loopEntered.has(lr.segmentIndex) && wrappedS > lr.endS) {
        lr.completed = true;
      }
    }

    for (const ev of events) {
      if (ev.type === 'railHit') {
        railHits++;
      } else if (ev.type === 'fell') {
        falls++;
      } else if (ev.type === 'takeoff') {
        const takeoffWrappedS = isClosed ? course.wrapDistance(carState.sApprox) : carState.sApprox;
        let bestIdx = -1;
        let bestDist = Infinity;
        for (let ji = 0; ji < jumpResults.length; ji++) {
          const jr = jumpResults[ji];
          const d = Math.abs(takeoffWrappedS - jr.startS);
          if (d < bestDist) {
            bestDist = d;
            bestIdx = ji;
          }
        }
        if (bestIdx >= 0 && bestDist < 12) {
          activeJumpIdx = bestIdx;
          if (jumpResults[bestIdx].takeoffSpeed === 0) {
            jumpResults[bestIdx].takeoffSpeed = carState.worldVel.length();
          }
        }
      } else if (ev.type === 'landed') {
        if (activeJumpIdx >= 0) {
          const jr = jumpResults[activeJumpIdx];
          const landWrappedS = isClosed ? course.wrapDistance(carState.s) : carState.s;
          if (landWrappedS >= jr.endS - 1.5) {
            jr.landed = true;
            jr.airtime = Math.max(jr.airtime, ev.airtime);
          }
          activeJumpIdx = -1;
        }
      }
    }

    if (simElapsed > 2.0 && carState.mode === 'grounded' && Math.abs(carState.vForward) < 2.0) {
      lowSpeedTimer += dt;
      if (lowSpeedTimer >= 1.5) {
        stuckEvents++;
        lowSpeedTimer = 0;
      }
    } else {
      lowSpeedTimer = 0;
    }

    const raceEvents = updateRace(
      raceState,
      {
        s: carState.s,
        sApprox: carState.sApprox,
        mode: carState.mode,
        routeId: carState.routeId,
        routeLapOffset: carState.routeLapOffset,
      },
      course,
      dt,
    );

    if (raceEvents.some((ev) => ev.type === 'finish')) {
      finished = true;
      break;
    }
  }

  const referenceTime = finished ? raceState.timer : simElapsed;
  const lapTimes = raceState.lapTimes.map((t) => Number(t.toFixed(3)));
  const bestLap =
    raceState.bestLap !== null
      ? Number(raceState.bestLap.toFixed(3))
      : lapTimes.length > 0
        ? Math.min(...lapTimes)
        : null;
  const referenceLapTime =
    lapTimes.length > 0
      ? Number((lapTimes.reduce((sum, v) => sum + v, 0) / lapTimes.length).toFixed(3))
      : Number((referenceTime / Math.max(1, laps)).toFixed(3));
  const checkpointTimes = raceState.splits.map((s) => (s !== null ? Number(s.toFixed(3)) : -1));

  // (g) Fail/warn rules
  if (!finished) {
    errors.push(`Autopilot tidak mencapai finish dalam batas waktu 360 detik.`);
  }
  if (falls > 0) {
    errors.push(`Autopilot terjatuh dari lintasan sebanyak ${falls} kali.`);
  }
  if (stuckEvents > 0) {
    errors.push(`Autopilot terdeteksi macet sebanyak ${stuckEvents} kali.`);
  }
  for (const jr of jumpResults) {
    if (!jr.landed) {
      errors.push(
        `Lompatan segmen #${jr.segmentIndex} (celah ${jr.gapLength.toFixed(1)} m) gagal mendarat oleh autopilot.`,
      );
    }
  }
  for (const lr of loopResults) {
    if (!lr.completed) {
      errors.push(`Loop segmen #${lr.segmentIndex} gagal diselesaikan autopilot.`);
    } else if (lr.topSpeed <= lr.minApexSpeedRequired) {
      errors.push(
        `Kecepatan puncak loop segmen #${lr.segmentIndex} (${lr.topSpeed.toFixed(1)} m/s) tidak melampaui syarat sqrt(g*r) = ${lr.minApexSpeedRequired.toFixed(1)} m/s.`,
      );
    }
  }

  if (railHits > 10) {
    errors.push(`Terjadi terlalu banyak benturan pagar oleh autopilot (${railHits} kali).`);
  } else if (railHits > 0) {
    warnings.push(`Autopilot menyentuh pagar sebanyak ${railHits} kali.`);
  }

  if (isClosed) {
    if (referenceLapTime > 90) {
      warnings.push(`Waktu referensi per lap autopilot ${referenceLapTime.toFixed(2)} s melampaui 90 s.`);
    }
  } else if (referenceTime > 120) {
    warnings.push(`Waktu referensi autopilot ${referenceTime.toFixed(2)} s melampaui 120 s.`);
  }

  const zones: ZoneValidationResult[] = zoneAccum.map((z) => {
    const p = Math.max(1, z.passes);
    return {
      name: z.span.name,
      style: z.span.style,
      startS: Number(z.span.startS.toFixed(2)),
      endS: Number(z.span.endS.toFixed(2)),
      lengthM: Number((z.span.endS - z.span.startS).toFixed(2)),
      passTimeSec: z.passes > 0 ? Number((z.totalTime / p).toFixed(2)) : 0,
      entrySpeedMs: z.passes > 0 ? Number((z.totalEntrySpeed / p).toFixed(1)) : 0,
      exitSpeedMs: z.passes > 0 ? Number((z.totalExitSpeed / p).toFixed(1)) : 0,
      passesRecorded: z.passes,
    };
  });

  // (h) Branching shortcut route validation
  const branchResults: BranchValidationResult[] = [];
  const branchRoutes = course.getBranchRoutes();
  for (const branch of branchRoutes) {
    const branchErrorCountBefore = errors.length;
    const branchLen = branch.getLength();
    const mainArcM = branch.toS - branch.fromS;
    const solveRep = branch.solveReport;

    if (
      !solveRep.converged ||
      solveRep.posErrorM > CONFIG.course.closure.posToleranceM ||
      Math.abs(solveRep.dYawDeg) > CONFIG.course.closure.yawToleranceDeg
    ) {
      errors.push(
        `Rute pintas '${branch.routeId}' gagal konvergen ke jalur utama: posErr=${solveRep.posErrorM.toFixed(4)} m, dYaw=${solveRep.dYawDeg.toFixed(3)}°.`,
      );
    }

    const mainHalfW = course.getFrameAt(branch.fromS).width * 0.5;
    const branchHalfW = branch.getTrackWidth() * 0.5;
    const entryWorldErrorM = getWorldPointOnFrame(course.getFrameAt(branch.fromS), mainHalfW).distanceTo(
      getWorldPointOnFrame(branch.getFrameAt(0), -branchHalfW),
    );
    const entryEndWorldErrorM = getWorldPointOnFrame(
      course.getFrameAt(branch.fromS + branch.entryGapLength),
      mainHalfW,
    ).distanceTo(getWorldPointOnFrame(branch.getFrameAt(branch.entryGapLength), -branchHalfW));
    const mergeWorldErrorM = getWorldPointOnFrame(branch.getFrameAt(branchLen), 0).distanceTo(
      getWorldPointOnFrame(course.getFrameAt(branch.toS), branch.endOffset),
    );

    if (entryWorldErrorM > 0.1 || entryEndWorldErrorM > 0.15) {
      errors.push(
        `Kontinuitas sambungan masuk rute '${branch.routeId}' tidak sejajar (errStart=${entryWorldErrorM.toFixed(3)}m, errEnd=${entryEndWorldErrorM.toFixed(3)}m).`,
      );
    }
    if (mergeWorldErrorM > 0.1) {
      errors.push(
        `Kontinuitas sambungan keluar rute '${branch.routeId}' tidak menyatu bersih (err=${mergeWorldErrorM.toFixed(3)}m).`,
      );
    }

    for (const cp of checkpoints) {
      if (cp.s >= branch.fromS - 0.5 && cp.s <= branch.fromS + branch.entryGapLength + 0.5) {
        errors.push(
          `Checkpoint utama #${cp.index + 1} (s=${cp.s.toFixed(1)}m) berada di dalam celah masuk rute '${branch.routeId}'.`,
        );
      }
      if (cp.s >= branch.toS - branch.mergeGapLength - 0.5 && cp.s <= branch.toS + 0.5) {
        errors.push(
          `Checkpoint utama #${cp.index + 1} (s=${cp.s.toFixed(1)}m) berada di dalam celah gabung rute '${branch.routeId}'.`,
        );
      }
    }

    const minCorridorClearanceM = measureBranchCorridorClearance(course, branch);
    if (
      minCorridorClearanceM !== null &&
      minCorridorClearanceM < CONFIG.shortcut.corridorClearance
    ) {
      errors.push(
        `Koridor rute '${branch.routeId}' terlalu dekat jalur utama (${minCorridorClearanceM.toFixed(1)} m < ${CONFIG.shortcut.corridorClearance} m).`,
      );
    }

    // Ballistic feasibility for gaps inside branch
    const branchMinSpeedBySeg = new Map<number, number>();
    for (const seg of branch.getSegmentList()) {
      if (seg.type !== 'gap' || seg.config.type !== 'gap') continue;
      const fStart = branch.getFrameAt(seg.startS);
      const fEnd = branch.getFrameAt(seg.endS);
      const dx = fEnd.position.x - fStart.position.x;
      const dz = fEnd.position.z - fStart.position.z;
      const horizSpan = Math.hypot(dx, dz);
      const tanHoriz = Math.max(0.15, Math.hypot(fStart.tangent.x, fStart.tangent.z));
      const slopeTan = fStart.tangent.y / tanHoriz;
      const dyTarget = fEnd.position.y - fStart.position.y;
      const neededDrop = horizSpan * slopeTan - dyTarget;
      if (neededDrop <= 0.1) {
        errors.push(
          `Lompatan rute '${branch.routeId}' segmen #${seg.index} tidak realistis secara balistik.`,
        );
        branchMinSpeedBySeg.set(seg.index, Infinity);
      } else {
        const vHorizMin = horizSpan * Math.sqrt(physicsConfig.gravity / (2 * neededDrop));
        const vMinRequired = vHorizMin / tanHoriz;
        branchMinSpeedBySeg.set(seg.index, vMinRequired);
        if (vMinRequired > maxPossibleSpeed) {
          errors.push(
            `Lompatan rute '${branch.routeId}' segmen #${seg.index} butuh kecepatan ${vMinRequired.toFixed(1)} m/s (> maks ${maxPossibleSpeed.toFixed(1)} m/s).`,
          );
        }
      }
    }

    const simOut = runBranchAutopilotSim(course, branch, branchMinSpeedBySeg);
    if (!simOut.finished) {
      errors.push(`Autopilot rute '${branch.routeId}' gagal mencapai finish.`);
    }
    if (simOut.entries < laps) {
      errors.push(
        `Autopilot rute '${branch.routeId}' hanya masuk ${simOut.entries}/${laps} kali sepanjang balapan.`,
      );
    }
    if (simOut.merges < laps) {
      errors.push(
        `Autopilot rute '${branch.routeId}' hanya menyatu kembali ${simOut.merges}/${laps} kali.`,
      );
    }
    if (simOut.falls > 0) {
      errors.push(`Autopilot rute '${branch.routeId}' terjatuh ${simOut.falls} kali.`);
    }
    if (simOut.stuckEvents > 0) {
      errors.push(`Autopilot rute '${branch.routeId}' macet ${simOut.stuckEvents} kali.`);
    }
    for (const jr of simOut.jumps) {
      if (!jr.landed) {
        errors.push(
          `Lompatan rute '${branch.routeId}' segmen #${jr.segmentIndex} gagal didarati autopilot.`,
        );
      }
    }

    const timeSavingSec = referenceTime - simOut.elapsedTime;
    const perLapSavingSec = timeSavingSec / Math.max(1, laps);
    if (perLapSavingSec < CONFIG.shortcut.minTimeSaving) {
      warnings.push(
        `Penghematan waktu rute '${branch.routeId}' per pengambilan (${perLapSavingSec.toFixed(2)} s/lap, total ${timeSavingSec.toFixed(2)} s) < target ${CONFIG.shortcut.minTimeSaving.toFixed(1)} s (pertimbangkan memperpendek segmen lurus atau menambah pad boost).`,
      );
    } else if (perLapSavingSec > CONFIG.shortcut.maxTimeSaving) {
      warnings.push(
        `Penghematan waktu rute '${branch.routeId}' per pengambilan (${perLapSavingSec.toFixed(2)} s/lap, total ${timeSavingSec.toFixed(2)} s) > target ${CONFIG.shortcut.maxTimeSaving.toFixed(1)} s (pertimbangkan sedikit memperpanjang jalur jembatan pintas).`,
      );
    }

    branchResults.push({
      routeId: branch.routeId,
      name: branch.name,
      fromS: Number(branch.fromS.toFixed(2)),
      toS: Number(branch.toS.toFixed(2)),
      mainArcM: Number(mainArcM.toFixed(2)),
      branchLengthM: Number(branchLen.toFixed(2)),
      width: branch.getTrackWidth(),
      entryWorldErrorM: Number(entryWorldErrorM.toFixed(4)),
      entryEndWorldErrorM: Number(entryEndWorldErrorM.toFixed(4)),
      mergeWorldErrorM: Number(mergeWorldErrorM.toFixed(4)),
      solverConverged: solveRep.converged,
      solverPosErrorM: Number(solveRep.posErrorM.toFixed(5)),
      solverYawErrorDeg: Number(solveRep.dYawDeg.toFixed(4)),
      minCorridorClearanceM:
        minCorridorClearanceM !== null ? Number(minCorridorClearanceM.toFixed(2)) : null,
      jumps: simOut.jumps.map((j) => ({
        ...j,
        startS: Number(j.startS.toFixed(2)),
        endS: Number(j.endS.toFixed(2)),
        gapLength: Number(j.gapLength.toFixed(2)),
        takeoffSpeed: Number(j.takeoffSpeed.toFixed(2)),
        minSpeedRequired: Number(
          (Number.isFinite(j.minSpeedRequired) ? j.minSpeedRequired : 0).toFixed(2),
        ),
        airtime: Number(j.airtime.toFixed(3)),
      })),
      mainTimeSec: Number(referenceTime.toFixed(3)),
      shortcutTimeSec: Number(simOut.elapsedTime.toFixed(3)),
      timeSavingSec: Number(timeSavingSec.toFixed(3)),
      perLapSavingSec: Number(perLapSavingSec.toFixed(3)),
      shortcutEntries: simOut.entries,
      shortcutMerges: simOut.merges,
      shortcutFalls: simOut.falls,
      shortcutStuck: simOut.stuckEvents,
      shortcutRailHits: simOut.railHits,
      ok: errors.length === branchErrorCountBefore,
    });
  }

  // (i) Theme decor clearance & render budget validation (for closed fantasyland arenas)
  let decorReport: DecorValidationResult | null = null;
  const shouldCheckDecor =
    options?.validateDecor ?? (course.getThemeId() === 'fantasyland' && isClosed);
  if (shouldCheckDecor) {
    const decorPlan = buildFantasyLandDecorPlan(course, 'high');
    const decorBudgets = estimateFantasyDecorBudgets(course);
    const minReqClear = CONFIG.fantasy.minClearance;
    const minOverReqClear = CONFIG.fantasy.overTrackClearance;
    const jumpMargin = CONFIG.fantasy.jumpExclusionMargin;
    const gateMargin = CONFIG.fantasy.gateExclusionMargin;

    interface DecorCheckPt {
      x: number;
      y: number;
      z: number;
      hw: number;
      isJumpZone: boolean;
      isGateZone: boolean;
    }
    const routePts: DecorCheckPt[] = [];
    const checkFrame: TrackFrame = {
      s: 0,
      position: new THREE.Vector3(),
      tangent: new THREE.Vector3(),
      up: new THREE.Vector3(),
      right: new THREE.Vector3(),
      width: trackWidth,
      bank: 0,
    };
    for (const r of course.getAllRoutes()) {
      const rLen = r.getLength();
      const rSegs = r.getSegmentList();
      const jRanges = rSegs
        .filter((sg) => sg.type === 'gap')
        .map((sg) => ({ a: sg.startS - jumpMargin, b: sg.endS + 32 + jumpMargin }));
      const gRanges: Array<{ a: number; b: number }> = [];
      if (r.routeId === 'main') {
        for (const br of branchRoutes) {
          gRanges.push({ a: br.fromS - gateMargin, b: br.fromS + br.entryGapLength + gateMargin });
          gRanges.push({ a: br.toS - br.mergeGapLength - gateMargin, b: br.toS + gateMargin });
        }
      } else {
        const br = branchRoutes.find((b) => b.routeId === r.routeId);
        if (br) {
          gRanges.push({ a: 0, b: br.entryGapLength + gateMargin });
          gRanges.push({ a: rLen - br.mergeGapLength - gateMargin, b: rLen });
        }
      }
      for (let s = 0; s <= rLen; s += 2.5) {
        r.getFrameAt(s, checkFrame);
        routePts.push({
          x: checkFrame.position.x,
          y: checkFrame.position.y,
          z: checkFrame.position.z,
          hw: checkFrame.width * 0.5,
          isJumpZone: jRanges.some((rg) => s >= rg.a && s <= rg.b),
          isGateZone: gRanges.some((rg) => s >= rg.a && s <= rg.b),
        });
      }
    }

    let minLateralClearance = Infinity;
    let minOverTrackClearance = Infinity;
    let rainbowApexAboveTrack: number | null = null;
    let blockedJumpOrGateCount = 0;
    const decorErrorsBefore = errors.length;

    for (const p of decorPlan.placements) {
      if (p.spec.type === 'rainbow' && p.legs && p.halfSpan) {
        rainbowApexAboveTrack = p.apexHeightAboveTrack ?? null;
        if (rainbowApexAboveTrack !== null && rainbowApexAboveTrack < 35) {
          errors.push(
            `Pelangi '${p.id}' memiliki puncak ${rainbowApexAboveTrack.toFixed(1)} m di atas lintasan (< 35 m).`,
          );
        }
        for (const leg of p.legs) {
          for (const pt of routePts) {
            const edgeClear = Math.hypot(leg.x - pt.x, leg.z - pt.z) - pt.hw - leg.radius;
            if (edgeClear < minLateralClearance) {
              minLateralClearance = edgeClear;
            }
            if (edgeClear < minReqClear) {
              errors.push(
                `Kaki pelangi '${p.id}' terlalu dekat lintasan (${edgeClear.toFixed(1)} m < ${minReqClear} m).`,
              );
              break;
            }
            if ((pt.isJumpZone || pt.isGateZone) && edgeClear < minReqClear + 4) {
              blockedJumpOrGateCount++;
              errors.push(
                `Kaki pelangi '${p.id}' mengganggu zona pendaratan lompatan atau gerbang pintas.`,
              );
              break;
            }
          }
        }

        // Verify overhead arch height over track corridors
        const rRight = new THREE.Vector3(p.right.x, 0, p.right.z).normalize();
        const rFwd = new THREE.Vector3(-rRight.z, 0, rRight.x).normalize();
        const innerR = Math.max(10, p.halfSpan - 4.8);
        const innerH = Math.max(10, p.position.y - 4.8);
        for (const pt of routePts) {
          const dx = pt.x - p.position.x;
          const dz = pt.z - p.position.z;
          const alongFwd = Math.abs(dx * rFwd.x + dz * rFwd.z);
          if (alongFwd > pt.hw + 3) continue;
          const alongRight = Math.abs(dx * rRight.x + dz * rRight.z);
          if (alongRight >= innerR) continue;
          const u = Math.min(1, alongRight / innerR);
          const archBottomY = innerH * Math.sqrt(Math.max(0, 1 - u * u));
          const vertGap = archBottomY - pt.y;
          if (vertGap < minOverTrackClearance) {
            minOverTrackClearance = vertGap;
          }
          if (vertGap < minOverReqClear) {
            errors.push(
              `Lengkungan pelangi '${p.id}' melintas terlalu rendah (${vertGap.toFixed(1)} m < ${minOverReqClear} m).`,
            );
            break;
          }
        }
        continue;
      }

      for (const pt of routePts) {
        const edgeClear = Math.hypot(p.position.x - pt.x, p.position.z - pt.z) - pt.hw - p.footprintRadius;
        const vertClear = Math.abs(p.position.y - pt.y) - p.halfHeight;
        if (edgeClear < minReqClear) {
          if (p.isOverhead) {
            if (vertClear < minOverTrackClearance) {
              minOverTrackClearance = vertClear;
            }
            if (vertClear < minOverReqClear) {
              errors.push(
                `Dekor '${p.id}' melintas terlalu rendah di atas lintasan (${vertClear.toFixed(1)} m < ${minOverReqClear} m).`,
              );
              break;
            }
          } else {
            if (edgeClear < minLateralClearance) {
              minLateralClearance = edgeClear;
            }
            errors.push(
              `Dekor '${p.id}' (${p.spec.type}) melanggar jarak aman lintasan (${edgeClear.toFixed(1)} m < ${minReqClear} m).`,
            );
            break;
          }
        } else {
          if (edgeClear < minLateralClearance) {
            minLateralClearance = edgeClear;
          }
          if (!p.isOverhead && (pt.isJumpZone || pt.isGateZone) && edgeClear < minReqClear) {
            blockedJumpOrGateCount++;
            errors.push(
              `Dekor '${p.id}' menghalangi zona pendaratan lompatan atau gerbang pintas.`,
            );
            break;
          }
        }
      }
    }

    for (const est of decorBudgets) {
      if (!est.withinBudget) {
        warnings.push(
          `Anggaran dekor FantasyLand tier '${est.tier}' melebihi batas: drawCalls=${est.drawCalls}/${est.budgetDrawCalls}, tris=${est.triangles}/${est.budgetTriangles}.`,
        );
      }
    }

    decorReport = {
      checked: true,
      placementCount: decorPlan.placements.length,
      minLateralClearanceM: Number.isFinite(minLateralClearance)
        ? Number(minLateralClearance.toFixed(2))
        : null,
      minOverTrackClearanceM: Number.isFinite(minOverTrackClearance)
        ? Number(minOverTrackClearance.toFixed(2))
        : null,
      rainbowApexAboveTrackM: rainbowApexAboveTrack,
      blockedJumpOrGateCount,
      budgets: decorBudgets,
      ok: errors.length === decorErrorsBefore && blockedJumpOrGateCount === 0,
    };
  }

  // (j) Attractions validation (counts, >=40m clearance, >=40% safe lane)
  let attractionsReport: AttractionsValidationResult | null = null;
  const shouldCheckAttractions = options?.validateAttractions ?? course.hasAttractions();
  if (shouldCheckAttractions) {
    const attrSys = createAttractionSystem(course, true, 'sedang');
    const plan = attrSys.plan;
    const attrErrorsBefore = errors.length;
    const limits = CONFIG.attractions.maxPerLap;
    const reqClear = CONFIG.attractions.clearanceMeters;
    const reqSafeRatio = CONFIG.attractions.safeLaneFraction;

    if (plan.pendulums.length > limits.pendulum) {
      errors.push(`Jumlah bandul melebihi batas (${plan.pendulums.length} > ${limits.pendulum}).`);
    }
    if (plan.ballGroups.length > limits.balls) {
      errors.push(`Jumlah kelompok bola melebihi batas (${plan.ballGroups.length} > ${limits.balls}).`);
    }
    if (plan.windFans.length > limits.wind) {
      errors.push(`Jumlah kipas angin melebihi batas (${plan.windFans.length} > ${limits.wind}).`);
    }
    if (plan.jellyPuddles.length > limits.jelly) {
      errors.push(`Jumlah area jeli melebihi batas (${plan.jellyPuddles.length} > ${limits.jelly}).`);
    }
    const mainRings = plan.boostRings.filter((r) => r.routeId === 'main');
    const shortcutRings = plan.boostRings.filter((r) => r.routeId !== 'main');
    if (mainRings.length > limits.rings) {
      errors.push(`Jumlah cincin boost jalur utama melebihi batas (${mainRings.length} > ${limits.rings}).`);
    }

    let minForbiddenClear = Infinity;
    const checkHazardInterval = (label: string, s0: number, s1: number): void => {
      for (const fz of plan.forbiddenZones) {
        const dist = distanceSInterval(s0, s1, fz.startS, fz.endS, lengthM, isClosed);
        if (dist < minForbiddenClear) {
          minForbiddenClear = dist;
        }
        if (dist < reqClear - 1e-4) {
          errors.push(
            `Rintangan '${label}' terlalu dekat zona khusus '${fz.label}' (${dist.toFixed(1)} m < ${reqClear} m).`,
          );
        }
      }
    };

    for (const p of plan.pendulums) {
      checkHazardInterval(p.id, p.s, p.s);
    }
    for (const g of plan.ballGroups) {
      const s0 = Math.min(...g.balls.map((b) => b.s));
      const s1 = Math.max(...g.balls.map((b) => b.s));
      checkHazardInterval(g.id, s0, s1);
    }
    for (const w of plan.windFans) {
      checkHazardInterval(w.id, w.sStart, w.sEnd);
    }
    for (const j of plan.jellyPuddles) {
      checkHazardInterval(j.id, j.sStart, j.sEnd);
    }

    let minSafeLaneRatio = 1;
    const warnTime = CONFIG.attractions.warningSeconds;
    for (let stepIdx = 0; stepIdx <= 120; stepIdx++) {
      const simT = warnTime + 0.05 + stepIdx * 0.12;
      attrSys.evaluateAtTime(simT);
      for (const p of attrSys.getPendulums()) {
        const ratio = Math.max(p.safeLaneLeftWidth, p.safeLaneRightWidth) / Math.max(1, p.spec.trackWidth);
        if (ratio < minSafeLaneRatio) {
          minSafeLaneRatio = ratio;
        }
      }
      for (const g of attrSys.getBallGroups()) {
        if (g.minSafeLaneFraction < minSafeLaneRatio) {
          minSafeLaneRatio = g.minSafeLaneFraction;
        }
      }
    }
    for (const jp of plan.jellyPuddles) {
      const halfW = jp.trackWidth * 0.5;
      const leftClear = Math.max(0, halfW + (jp.lateralCenter - jp.halfWidth));
      const rightClear = Math.max(0, halfW - (jp.lateralCenter + jp.halfWidth));
      const ratio = Math.max(leftClear, rightClear) / Math.max(1, jp.trackWidth);
      if (ratio < minSafeLaneRatio) {
        minSafeLaneRatio = ratio;
      }
    }
    if (minSafeLaneRatio < reqSafeRatio - 1e-4) {
      errors.push(
        `Jalur aman rintangan FantasyLand kurang dari ${(reqSafeRatio * 100).toFixed(0)}% lebar lintasan (${(minSafeLaneRatio * 100).toFixed(1)}%).`,
      );
    }

    attractionsReport = {
      checked: true,
      pendulumCount: plan.pendulums.length,
      ballGroupCount: plan.ballGroups.length,
      windFanCount: plan.windFans.length,
      jellyPuddleCount: plan.jellyPuddles.length,
      mainBoostRingCount: mainRings.length,
      shortcutBoostRingCount: shortcutRings.length,
      minForbiddenClearanceM: Number.isFinite(minForbiddenClear)
        ? Number(minForbiddenClear.toFixed(2))
        : null,
      minSafeLaneRatio: Number(minSafeLaneRatio.toFixed(3)),
      ok: errors.length === attrErrorsBefore,
    };
  }

  return {
    ok: errors.length === 0,
    closed: isClosed,
    laps,
    trackWidth,
    lengthM: Number(lengthM.toFixed(2)),
    referenceTime: Number(referenceTime.toFixed(3)),
    referenceLapTime,
    lapTimes,
    bestLap,
    minNonAdjacentClearanceM: Number.isFinite(worstNonAdjacentClearance)
      ? Number(worstNonAdjacentClearance.toFixed(2))
      : null,
    minStyleClearanceM: Number.isFinite(worstStyleClearance)
      ? Number(worstStyleClearance.toFixed(2))
      : null,
    tunnelClearance: {
      hasTunnel,
      cameraHeightM: Number(cameraHeightM.toFixed(2)),
      interiorHeightM: Number(interiorHeightM.toFixed(2)),
      requiredHeightM: Number(requiredHeightM.toFixed(2)),
      ok: tunnelOk,
    },
    closure: closureReport,
    checkpointTimes,
    loops: loopResults.map((l) => ({
      ...l,
      startS: Number(l.startS.toFixed(2)),
      endS: Number(l.endS.toFixed(2)),
      entrySpeed: Number(l.entrySpeed.toFixed(2)),
      topSpeed: Number(l.topSpeed.toFixed(2)),
      minApexSpeedRequired: Number(l.minApexSpeedRequired.toFixed(2)),
    })),
    jumps: jumpResults.map((j) => ({
      ...j,
      startS: Number(j.startS.toFixed(2)),
      endS: Number(j.endS.toFixed(2)),
      gapLength: Number(j.gapLength.toFixed(2)),
      takeoffSpeed: Number(j.takeoffSpeed.toFixed(2)),
      minSpeedRequired: Number(
        (Number.isFinite(j.minSpeedRequired) ? j.minSpeedRequired : 0).toFixed(2),
      ),
      airtime: Number(j.airtime.toFixed(3)),
    })),
    zones,
    branches: branchResults,
    decor: decorReport,
    attractions: attractionsReport,
    railHits,
    stuckEvents,
    falls,
    warnings,
    errors,
  };
}
