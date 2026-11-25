// src/core/course.ts

import * as THREE from 'three';
import { CONFIG } from '../config';
import { getCourse, type CourseDefinition } from '../courses';
import type { CourseMedals, CourseSegmentConfig, ThemeId, TrackStyle } from '../courses/types';
import { solveClosure, type ClosureReport } from './courseClosure';

export type CourseSegmentType = CourseSegmentConfig['type'];

export interface StyleRun {
  style: TrackStyle;
  startS: number;
  endS: number;
  name?: string;
}

export interface ZoneStart {
  name: string;
  s: number;
}

export interface GapRange {
  startS: number;
  endS: number;
}

export interface TrackFrame {
  s: number;
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  up: THREE.Vector3;
  right: THREE.Vector3;
  width: number;
  bank: number;
  isGap?: boolean;
}

export interface CheckpointData {
  index: number;
  s: number;
  frame: TrackFrame;
}

export interface BoostPadData {
  id: number;
  s: number;
  lateral: number;
  length: number;
  width: number;
}

export interface SegmentInfo {
  index: number;
  type: CourseSegmentType;
  progress: number;
}

export interface CourseSegmentMeta {
  index: number;
  type: CourseSegmentType;
  startS: number;
  endS: number;
  length: number;
  style: TrackStyle;
  name?: string;
  config: CourseSegmentConfig;
}

export interface CourseChunkRange {
  index: number;
  startS: number;
  endS: number;
}

export interface CourseBounds {
  center: THREE.Vector3;
  radius: number;
  min: THREE.Vector3;
  max: THREE.Vector3;
}

export interface GridSlot {
  index: number;
  s: number;
  lateral: number;
}

export interface LapProgress {
  lap: number;
  sInLap: number;
}

export interface CourseConfig {
  id?: string;
  name?: string;
  themeId?: ThemeId;
  closed?: boolean;
  laps?: number;
  medals?: CourseMedals;
  segments: readonly CourseSegmentConfig[];
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

interface TurtleState {
  s: number;
  pitchRad: number;
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  baseUp: THREE.Vector3;
  baseRight: THREE.Vector3;
}

interface LoopGapInfo {
  segmentIndex: number;
  entryExitDistance: number;
}

const SEGMENT_TYPE_LIST: readonly CourseSegmentType[] = [
  'straight',
  'curve',
  'slope',
  'pitchTo',
  'gap',
  'loop',
];

const _cross = new THREE.Vector3();
const _rotOut = new THREE.Vector3();
const _segVec = new THREE.Vector3();
const _relVec = new THREE.Vector3();
const _bankUp = new THREE.Vector3();
const _bankRight = new THREE.Vector3();
const _tmpA = new THREE.Vector3();
const _tmpB = new THREE.Vector3();
const _tmpDelta = new THREE.Vector3();

function rotateRodrigues(
  vec: THREE.Vector3,
  unitAxis: THREE.Vector3,
  angleRad: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  if (Math.abs(angleRad) < 1e-10) {
    return out.copy(vec);
  }
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  const dot = unitAxis.dot(vec);
  _cross.crossVectors(unitAxis, vec);

  out
    .copy(vec)
    .multiplyScalar(cosA)
    .addScaledVector(_cross, sinA)
    .addScaledVector(unitAxis, dot * (1 - cosA));
  return out;
}

function orthonormalizeTurtle(turtle: TurtleState): void {
  turtle.tangent.normalize();
  turtle.baseUp.addScaledVector(turtle.tangent, -turtle.baseUp.dot(turtle.tangent)).normalize();
  turtle.baseRight.crossVectors(turtle.tangent, turtle.baseUp).normalize();
  turtle.baseUp.crossVectors(turtle.baseRight, turtle.tangent).normalize();
}

function smoothstep01(t: number): number {
  const c = THREE.MathUtils.clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

function applyBankToBasisInPlace(
  baseUp: THREE.Vector3,
  baseRight: THREE.Vector3,
  bankRad: number,
  outUp: THREE.Vector3,
  outRight: THREE.Vector3,
): void {
  const cosB = Math.cos(bankRad);
  const sinB = Math.sin(bankRad);
  outRight
    .set(0, 0, 0)
    .addScaledVector(baseRight, cosB)
    .addScaledVector(baseUp, sinB)
    .normalize();
  outUp
    .set(0, 0, 0)
    .addScaledVector(baseUp, cosB)
    .addScaledVector(baseRight, -sinB)
    .normalize();
}

function simulateLoopEndpoint(
  startPos: THREE.Vector3,
  startT: THREE.Vector3,
  startU: THREE.Vector3,
  startR: THREE.Vector3,
  radius: number,
  stepLength: number,
  yawAmplitudeRad: number,
): THREE.Vector3 {
  const circumference = 2 * Math.PI * radius;
  const steps = Math.max(16, Math.round(circumference / stepLength));
  const ds = circumference / steps;
  const dPitch = (2 * Math.PI) / steps;

  const pos = startPos.clone();
  const t = startT.clone();
  const u = startU.clone();
  const r = startR.clone();
  const yawAxis = startU.clone();

  let prevPsi = 0;

  for (let i = 1; i <= steps; i++) {
    const frac = i / steps;
    const sinHalf = Math.sin(Math.PI * frac);
    const psi = -yawAmplitudeRad * sinHalf * sinHalf;
    const dPsi = psi - prevPsi;
    prevPsi = psi;

    rotateRodrigues(t, yawAxis, -dPsi, _rotOut);
    t.copy(_rotOut);
    rotateRodrigues(u, yawAxis, -dPsi, _rotOut);
    u.copy(_rotOut);
    rotateRodrigues(r, yawAxis, -dPsi, _rotOut);
    r.copy(_rotOut);

    rotateRodrigues(t, r, dPitch, _rotOut);
    t.copy(_rotOut);
    rotateRodrigues(u, r, dPitch, _rotOut);
    u.copy(_rotOut);

    t.normalize();
    u.addScaledVector(t, -u.dot(t)).normalize();
    r.crossVectors(t, u).normalize();

    pos.addScaledVector(t, ds);
  }

  return pos;
}

function solveLoopYawAmplitude(
  turtle: TurtleState,
  radius: number,
  lateralOffset: number,
  stepLength: number,
): number {
  const measureLateral = (amp: number): number => {
    const endPos = simulateLoopEndpoint(
      turtle.position,
      turtle.tangent,
      turtle.baseUp,
      turtle.baseRight,
      radius,
      stepLength,
      amp,
    );
    return endPos.sub(turtle.position).dot(turtle.baseRight);
  };

  if (Math.abs(lateralOffset) < 1e-4) {
    return 0;
  }

  const sign = Math.sign(lateralOffset);
  const targetAbs = Math.abs(lateralOffset);

  let low = 0;
  let high = 0.05;
  while (high < Math.PI * 0.48 && sign * measureLateral(sign * high) < targetAbs) {
    high *= 1.5;
  }
  high = Math.min(high, Math.PI * 0.48);

  for (let iter = 0; iter < 36; iter++) {
    const mid = (low + high) * 0.5;
    const lat = sign * measureLateral(sign * mid);
    if (lat < targetAbs) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return sign * (low + high) * 0.5;
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
    medals: definition.medals,
    segments: definition.segments,
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

function estimateTotalSamples(segments: readonly CourseSegmentConfig[], stepLength: number): number {
  let count = 1;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.type === 'straight' || seg.type === 'slope' || seg.type === 'pitchTo' || seg.type === 'gap') {
      count += Math.max(2, Math.round(seg.length / stepLength));
    } else if (seg.type === 'curve') {
      const arc = Math.abs(THREE.MathUtils.degToRad(seg.angleDeg)) * seg.radius;
      count += Math.max(2, Math.round(arc / stepLength));
    } else if (seg.type === 'loop') {
      const circ = 2 * Math.PI * seg.radius;
      count += Math.max(16, Math.round(circ / stepLength));
    }
  }
  return count + 4;
}

export class Course {
  private readonly sampleCount: number;
  private readonly sTable: Float64Array;
  private readonly posTable: Float32Array;
  private readonly tanTable: Float32Array;
  private readonly upTable: Float32Array;
  private readonly rightTable: Float32Array;
  private readonly widthTable: Float32Array;
  private readonly bankTable: Float32Array;
  private readonly kappaTable: Float32Array;
  private readonly segIndexTable: Int32Array;
  private readonly segTypeTable: Uint8Array;
  private readonly segProgressTable: Float32Array;
  private readonly isGapTable: Uint8Array;

  private readonly id: string;
  private readonly name: string;
  private readonly themeId: ThemeId;
  private readonly closed: boolean;
  private readonly laps: number;
  private readonly trackWidth: number;
  private readonly medals: CourseMedals;
  private readonly closureReport: ClosureReport | null;
  private cachedSamples: TrackFrame[] | null = null;
  private readonly segmentMeta: CourseSegmentMeta[];
  private readonly styleRuns: StyleRun[];
  private readonly zoneStarts: ZoneStart[];
  private readonly totalLength: number;
  private readonly bounds: CourseBounds;
  private readonly gapRanges: GapRange[];
  private readonly checkpoints: CheckpointData[];
  private readonly boostPads: BoostPadData[];
  private readonly finishS: number;

  constructor(inputConfig?: CourseConfig) {
    const config = inputConfig ?? buildCourseConfigFromDefinition();
    const fallbackDef = getCourse(CONFIG.activeCourseId);
    this.id = config.id ?? fallbackDef.id;
    this.name = config.name ?? fallbackDef.name;
    this.themeId = config.themeId ?? fallbackDef.themeId ?? 'toyroom';
    this.closed = Boolean(config.closed);
    this.laps = Math.max(1, Math.round(config.laps ?? 1));
    this.trackWidth = config.defaultWidth;
    this.medals = config.medals ?? fallbackDef.medals;
    if (config.segments.length === 0) {
      throw new Error('Course requires at least 1 segment.');
    }

    let activeSegments: readonly CourseSegmentConfig[] = config.segments;
    let closureReport: ClosureReport | null = null;
    if (this.closed) {
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

    const turtle: TurtleState = {
      s: 0,
      pitchRad: 0,
      position: new THREE.Vector3(
        config.startPosition.x,
        config.startPosition.y,
        config.startPosition.z,
      ),
      tangent: startT,
      baseUp: startU,
      baseRight: startR,
    };

    const capacity = estimateTotalSamples(activeSegments, config.stepLength);
    let sArr = new Float64Array(capacity);
    let posArr = new Float32Array(capacity * 3);
    let tanArr = new Float32Array(capacity * 3);
    let upArr = new Float32Array(capacity * 3);
    let rightArr = new Float32Array(capacity * 3);
    let widthArr = new Float32Array(capacity);
    let bankArr = new Float32Array(capacity);
    let segIdxArr = new Int32Array(capacity);
    let segTypeArr = new Uint8Array(capacity);
    let segProgArr = new Float32Array(capacity);
    let isGapArr = new Uint8Array(capacity);
    let count = 0;

    const ensureCapacity = (needed: number): void => {
      if (needed <= sArr.length) {
        return;
      }
      const nextCap = Math.max(needed, Math.floor(sArr.length * 1.5));
      const growF64 = (src: Float64Array<ArrayBuffer>, mult = 1): Float64Array<ArrayBuffer> => {
        const dst = new Float64Array(nextCap * mult);
        dst.set(src);
        return dst;
      };
      const growF32 = (src: Float32Array<ArrayBuffer>, mult = 1): Float32Array<ArrayBuffer> => {
        const dst = new Float32Array(nextCap * mult);
        dst.set(src);
        return dst;
      };
      const growI32 = (src: Int32Array<ArrayBuffer>): Int32Array<ArrayBuffer> => {
        const dst = new Int32Array(nextCap);
        dst.set(src);
        return dst;
      };
      const growU8 = (src: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => {
        const dst = new Uint8Array(nextCap);
        dst.set(src);
        return dst;
      };

      sArr = growF64(sArr);
      posArr = growF32(posArr, 3);
      tanArr = growF32(tanArr, 3);
      upArr = growF32(upArr, 3);
      rightArr = growF32(rightArr, 3);
      widthArr = growF32(widthArr);
      bankArr = growF32(bankArr);
      segIdxArr = growI32(segIdxArr);
      segTypeArr = growU8(segTypeArr);
      segProgArr = growF32(segProgArr);
      isGapArr = growU8(isGapArr);
    };

    const segmentTypeCode = (type: CourseSegmentType): number => {
      switch (type) {
        case 'straight':
          return 0;
        case 'curve':
          return 1;
        case 'slope':
          return 2;
        case 'pitchTo':
          return 3;
        case 'gap':
          return 4;
        case 'loop':
          return 5;
      }
    };

    const pushSample = (
      width: number,
      bankRad: number,
      segmentIndex: number,
      segmentType: CourseSegmentType,
      segmentProgress: number,
      isGap: boolean,
    ): void => {
      ensureCapacity(count + 1);
      applyBankToBasisInPlace(turtle.baseUp, turtle.baseRight, bankRad, _bankUp, _bankRight);

      const idx3 = count * 3;
      sArr[count] = turtle.s;
      posArr[idx3] = turtle.position.x;
      posArr[idx3 + 1] = turtle.position.y;
      posArr[idx3 + 2] = turtle.position.z;

      tanArr[idx3] = turtle.tangent.x;
      tanArr[idx3 + 1] = turtle.tangent.y;
      tanArr[idx3 + 2] = turtle.tangent.z;

      upArr[idx3] = _bankUp.x;
      upArr[idx3 + 1] = _bankUp.y;
      upArr[idx3 + 2] = _bankUp.z;

      rightArr[idx3] = _bankRight.x;
      rightArr[idx3 + 1] = _bankRight.y;
      rightArr[idx3 + 2] = _bankRight.z;

      widthArr[count] = width;
      bankArr[count] = bankRad;
      segIdxArr[count] = segmentIndex;
      segTypeArr[count] = segmentTypeCode(segmentType);
      segProgArr[count] = segmentProgress;
      isGapArr[count] = isGap ? 1 : 0;
      count++;
    };

    const gapRanges: GapRange[] = [];
    const loopGaps: LoopGapInfo[] = [];
    const segmentMeta: CourseSegmentMeta[] = [];

    const firstSeg = activeSegments[0];
    pushSample(
      firstSeg.width ?? config.defaultWidth,
      0,
      0,
      firstSeg.type,
      0,
      firstSeg.type === 'gap',
    );

    for (let segIdx = 0; segIdx < activeSegments.length; segIdx++) {
      const seg = activeSegments[segIdx];
      const segWidth = seg.width ?? config.defaultWidth;
      const segStartS = turtle.s;

      if (seg.type === 'straight') {
        const steps = Math.max(1, Math.round(seg.length / config.stepLength));
        const ds = seg.length / steps;

        for (let i = 1; i <= steps; i++) {
          turtle.position.addScaledVector(turtle.tangent, ds);
          turtle.s += ds;
          pushSample(segWidth, 0, segIdx, seg.type, i / steps, false);
        }
      } else if (seg.type === 'curve') {
        const angleRad = THREE.MathUtils.degToRad(seg.angleDeg);
        const arcLength = Math.abs(angleRad) * seg.radius;
        const steps = Math.max(2, Math.round(arcLength / config.stepLength));
        const ds = arcLength / steps;
        const dYaw = angleRad / steps;
        const targetBank = THREE.MathUtils.degToRad(seg.bankDeg);
        const blendLen = Math.min(config.bankBlendLength, arcLength * 0.45);

        for (let i = 1; i <= steps; i++) {
          const dLocal = i * ds;
          rotateRodrigues(turtle.tangent, turtle.baseUp, -dYaw, _rotOut);
          turtle.tangent.copy(_rotOut);
          rotateRodrigues(turtle.baseRight, turtle.baseUp, -dYaw, _rotOut);
          turtle.baseRight.copy(_rotOut);
          orthonormalizeTurtle(turtle);

          turtle.position.addScaledVector(turtle.tangent, ds);
          turtle.s += ds;

          let bankFactor = 1;
          if (blendLen > 1e-4) {
            if (dLocal < blendLen) {
              bankFactor = smoothstep01(dLocal / blendLen);
            } else if (dLocal > arcLength - blendLen) {
              bankFactor = 1 - smoothstep01((dLocal - (arcLength - blendLen)) / blendLen);
            }
          }

          pushSample(segWidth, targetBank * bankFactor, segIdx, seg.type, i / steps, false);
        }
      } else if (seg.type === 'slope') {
        const steps = Math.max(2, Math.round(seg.length / config.stepLength));
        const ds = seg.length / steps;
        const basePitch = turtle.pitchRad;
        const peakOffset = THREE.MathUtils.degToRad(seg.pitchDeg);
        const blendLen = Math.min(config.slopeBlendLength, seg.length * 0.45);

        const evalPitch = (dLocal: number): number => {
          if (blendLen <= 1e-4) {
            return basePitch + peakOffset;
          }
          if (dLocal < blendLen) {
            return basePitch + peakOffset * smoothstep01(dLocal / blendLen);
          }
          if (dLocal > seg.length - blendLen) {
            return (
              basePitch + peakOffset * (1 - smoothstep01((dLocal - (seg.length - blendLen)) / blendLen))
            );
          }
          return basePitch + peakOffset;
        };

        let prevPitch = basePitch;
        for (let i = 1; i <= steps; i++) {
          const dLocal = i * ds;
          const nextPitch = evalPitch(dLocal);
          const dPitch = nextPitch - prevPitch;
          prevPitch = nextPitch;

          rotateRodrigues(turtle.tangent, turtle.baseRight, dPitch, _rotOut);
          turtle.tangent.copy(_rotOut);
          rotateRodrigues(turtle.baseUp, turtle.baseRight, dPitch, _rotOut);
          turtle.baseUp.copy(_rotOut);
          orthonormalizeTurtle(turtle);

          turtle.position.addScaledVector(turtle.tangent, ds);
          turtle.s += ds;

          pushSample(segWidth, 0, segIdx, seg.type, i / steps, false);
        }
        turtle.pitchRad = prevPitch;
      } else if (seg.type === 'pitchTo') {
        const steps = Math.max(2, Math.round(seg.length / config.stepLength));
        const ds = seg.length / steps;
        const startPitch = turtle.pitchRad;
        const targetPitch = THREE.MathUtils.degToRad(seg.pitchDeg);

        let prevPitch = startPitch;
        for (let i = 1; i <= steps; i++) {
          const frac = i / steps;
          const nextPitch = THREE.MathUtils.lerp(startPitch, targetPitch, smoothstep01(frac));
          const dPitch = nextPitch - prevPitch;
          prevPitch = nextPitch;

          rotateRodrigues(turtle.tangent, turtle.baseRight, dPitch, _rotOut);
          turtle.tangent.copy(_rotOut);
          rotateRodrigues(turtle.baseUp, turtle.baseRight, dPitch, _rotOut);
          turtle.baseUp.copy(_rotOut);
          orthonormalizeTurtle(turtle);

          turtle.position.addScaledVector(turtle.tangent, ds);
          turtle.s += ds;

          pushSample(segWidth, 0, segIdx, seg.type, frac, false);
        }
        turtle.pitchRad = targetPitch;
      } else if (seg.type === 'gap') {
        const startS = turtle.s;
        const steps = Math.max(2, Math.round(seg.length / config.stepLength));
        const ds = seg.length / steps;
        const startPitch = turtle.pitchRad;
        const targetPitch = THREE.MathUtils.degToRad(seg.exitPitchDeg);

        let prevPitch = startPitch;
        for (let i = 1; i <= steps; i++) {
          const frac = i / steps;
          const nextPitch = THREE.MathUtils.lerp(startPitch, targetPitch, smoothstep01(frac));
          const dPitch = nextPitch - prevPitch;
          prevPitch = nextPitch;

          rotateRodrigues(turtle.tangent, turtle.baseRight, dPitch, _rotOut);
          turtle.tangent.copy(_rotOut);
          rotateRodrigues(turtle.baseUp, turtle.baseRight, dPitch, _rotOut);
          turtle.baseUp.copy(_rotOut);
          orthonormalizeTurtle(turtle);

          turtle.position.addScaledVector(turtle.tangent, ds);
          turtle.s += ds;

          const sampleIsGap = i < steps;
          pushSample(segWidth, 0, segIdx, seg.type, frac, sampleIsGap);
        }
        turtle.pitchRad = targetPitch;
        gapRanges.push({ startS, endS: turtle.s });
      } else if (seg.type === 'loop') {
        const circumference = 2 * Math.PI * seg.radius;
        const steps = Math.max(16, Math.round(circumference / config.stepLength));
        const ds = circumference / steps;
        const dPitch = (2 * Math.PI) / steps;

        const loopStartPos = turtle.position.clone();
        const yawAxis = turtle.baseUp.clone();
        const yawAmp = solveLoopYawAmplitude(
          turtle,
          seg.radius,
          seg.lateralOffset,
          config.stepLength,
        );

        let prevPsi = 0;
        for (let i = 1; i <= steps; i++) {
          const frac = i / steps;
          const sinHalf = Math.sin(Math.PI * frac);
          const psi = -yawAmp * sinHalf * sinHalf;
          const dPsi = psi - prevPsi;
          prevPsi = psi;

          rotateRodrigues(turtle.tangent, yawAxis, -dPsi, _rotOut);
          turtle.tangent.copy(_rotOut);
          rotateRodrigues(turtle.baseUp, yawAxis, -dPsi, _rotOut);
          turtle.baseUp.copy(_rotOut);
          rotateRodrigues(turtle.baseRight, yawAxis, -dPsi, _rotOut);
          turtle.baseRight.copy(_rotOut);

          rotateRodrigues(turtle.tangent, turtle.baseRight, dPitch, _rotOut);
          turtle.tangent.copy(_rotOut);
          rotateRodrigues(turtle.baseUp, turtle.baseRight, dPitch, _rotOut);
          turtle.baseUp.copy(_rotOut);
          orthonormalizeTurtle(turtle);

          turtle.position.addScaledVector(turtle.tangent, ds);
          turtle.s += ds;

          pushSample(segWidth, 0, segIdx, seg.type, frac, false);
        }

        loopGaps.push({
          segmentIndex: segIdx,
          entryExitDistance: turtle.position.distanceTo(loopStartPos),
        });
      }

      segmentMeta.push({
        index: segIdx,
        type: seg.type,
        startS: segStartS,
        endS: turtle.s,
        length: turtle.s - segStartS,
        style: seg.style ?? 'road',
        name: seg.name,
        config: seg,
      });
    }

    this.sampleCount = count;
    this.sTable = sArr.subarray(0, count);
    this.posTable = posArr.subarray(0, count * 3);
    this.tanTable = tanArr.subarray(0, count * 3);
    this.upTable = upArr.subarray(0, count * 3);
    this.rightTable = rightArr.subarray(0, count * 3);
    this.widthTable = widthArr.subarray(0, count);
    this.bankTable = bankArr.subarray(0, count);
    this.segIndexTable = segIdxArr.subarray(0, count);
    this.segTypeTable = segTypeArr.subarray(0, count);
    this.segProgressTable = segProgArr.subarray(0, count);
    this.isGapTable = isGapArr.subarray(0, count);
    this.kappaTable = new Float32Array(count);
    this.segmentMeta = segmentMeta;
    this.gapRanges = gapRanges;
    this.totalLength = this.sTable[count - 1];

    const styleRuns: StyleRun[] = [];
    for (const meta of segmentMeta) {
      const prev = styleRuns[styleRuns.length - 1];
      if (prev && prev.style === meta.style && Math.abs(prev.endS - meta.startS) < 1e-3) {
        prev.endS = meta.endS;
        if (!prev.name && meta.name) {
          prev.name = meta.name;
        }
      } else {
        styleRuns.push({
          style: meta.style,
          startS: meta.startS,
          endS: meta.endS,
          name: meta.name,
        });
      }
    }
    this.styleRuns = styleRuns;

    const zoneStarts: ZoneStart[] = [];
    let lastZoneName: string | undefined;
    for (const meta of segmentMeta) {
      const trimmed = meta.name?.trim();
      if (trimmed) {
        if (trimmed !== lastZoneName) {
          zoneStarts.push({ name: trimmed, s: meta.startS });
        }
        lastZoneName = trimmed;
      } else {
        lastZoneName = undefined;
      }
    }
    this.zoneStarts = zoneStarts;

    // Closed-circuit seam closure blend over the last blendLength meters + exact endpoint snap
    if (this.closed && count >= 3) {
      const lastIdx = count - 1;
      const last3 = lastIdx * 3;
      const errX = this.posTable[last3] - this.posTable[0];
      const errY = this.posTable[last3 + 1] - this.posTable[1];
      const errZ = this.posTable[last3 + 2] - this.posTable[2];
      const blendLen = Math.min(CONFIG.course.closure.blendLength, this.totalLength * 0.25);
      const blendStartS = Math.max(0, this.totalLength - blendLen);
      const errNorm = Math.hypot(errX, errY, errZ);

      if (errNorm > 1e-6 && blendLen > 1e-4) {
        for (let i = 0; i < count; i++) {
          const sVal = this.sTable[i];
          if (sVal <= blendStartS) continue;
          const w = smoothstep01((sVal - blendStartS) / blendLen);
          const i3 = i * 3;
          this.posTable[i3] -= errX * w;
          this.posTable[i3 + 1] -= errY * w;
          this.posTable[i3 + 2] -= errZ * w;
        }
        if (closureReport) {
          closureReport = {
            ...closureReport,
            blendApplied: true,
            blendLengthM: blendLen,
          };
        }
      }

      // Guarantee exact C1 continuity at s = totalLength == 0
      this.posTable[last3] = this.posTable[0];
      this.posTable[last3 + 1] = this.posTable[1];
      this.posTable[last3 + 2] = this.posTable[2];
      this.tanTable[last3] = this.tanTable[0];
      this.tanTable[last3 + 1] = this.tanTable[1];
      this.tanTable[last3 + 2] = this.tanTable[2];
      this.upTable[last3] = this.upTable[0];
      this.upTable[last3 + 1] = this.upTable[1];
      this.upTable[last3 + 2] = this.upTable[2];
      this.rightTable[last3] = this.rightTable[0];
      this.rightTable[last3 + 1] = this.rightTable[1];
      this.rightTable[last3 + 2] = this.rightTable[2];
      this.widthTable[lastIdx] = this.widthTable[0];
      this.bankTable[lastIdx] = this.bankTable[0];
    }
    this.closureReport = closureReport;

    // Compute numerical curvature kappa_up = (dT/ds) · up and smooth it
    const rawKappa = new Float32Array(count);
    const uniqueCount = Math.max(2, count - 1);
    for (let i = 0; i < count; i++) {
      let iPrev: number;
      let iNext: number;
      let spanS: number;
      if (this.closed) {
        const uIdx = i === count - 1 ? 0 : i;
        iPrev = (uIdx - 1 + uniqueCount) % uniqueCount;
        iNext = (uIdx + 1) % uniqueCount;
        const sPrev = iPrev === uniqueCount - 1 && uIdx === 0 ? this.sTable[iPrev] - this.totalLength : this.sTable[iPrev];
        const sNext = iNext === 0 && uIdx === uniqueCount - 1 ? this.totalLength : this.sTable[iNext];
        spanS = sNext - sPrev;
      } else {
        iPrev = Math.max(0, i - 1);
        iNext = Math.min(count - 1, i + 1);
        spanS = this.sTable[iNext] - this.sTable[iPrev];
      }
      if (spanS > 1e-6) {
        const p3 = iPrev * 3;
        const n3 = iNext * 3;
        const i3 = i * 3;
        _tmpDelta.set(
          (this.tanTable[n3] - this.tanTable[p3]) / spanS,
          (this.tanTable[n3 + 1] - this.tanTable[p3 + 1]) / spanS,
          (this.tanTable[n3 + 2] - this.tanTable[p3 + 2]) / spanS,
        );
        rawKappa[i] =
          _tmpDelta.x * this.upTable[i3] +
          _tmpDelta.y * this.upTable[i3 + 1] +
          _tmpDelta.z * this.upTable[i3 + 2];
      }
    }

    const halfWin = Math.max(0, Math.floor(config.curvatureSmoothWindow));
    for (let i = 0; i < count; i++) {
      let sum = 0;
      let winCount = 0;
      if (this.closed) {
        const uIdx = i === count - 1 ? 0 : i;
        for (let k = -halfWin; k <= halfWin; k++) {
          const wrapped = ((uIdx + k) % uniqueCount + uniqueCount) % uniqueCount;
          sum += rawKappa[wrapped];
          winCount++;
        }
      } else {
        const start = Math.max(0, i - halfWin);
        const end = Math.min(count - 1, i + halfWin);
        for (let k = start; k <= end; k++) {
          sum += rawKappa[k];
          winCount++;
        }
      }
      this.kappaTable[i] = winCount > 0 ? sum / winCount : 0;
    }

    const checkpoints: CheckpointData[] = [];
    const boostPads: BoostPadData[] = [];

    const clampOutsideGap = (s: number): number => {
      let clamped = THREE.MathUtils.clamp(s, 0, this.totalLength);
      const gap = this.getGapRangeAt(clamped);
      if (gap) {
        clamped =
          clamped - gap.startS < gap.endS - clamped ? gap.startS : gap.endS;
      }
      return THREE.MathUtils.clamp(clamped, 0, this.totalLength);
    };

    for (const meta of segmentMeta) {
      if (meta.config.checkpoint) {
        const cpS = clampOutsideGap(meta.startS);
        checkpoints.push({
          index: checkpoints.length,
          s: cpS,
          frame: this.getFrameAt(cpS),
        });
      }

      if (meta.config.boostPads && meta.type !== 'gap') {
        for (const padCfg of meta.config.boostPads) {
          const padS = THREE.MathUtils.lerp(
            meta.startS,
            meta.endS,
            THREE.MathUtils.clamp(padCfg.at, 0, 1),
          );
          const halfLen = config.boostPadLength * 0.5;
          const overlapsGap = this.gapRanges.some(
            (g) => padS + halfLen > g.startS && padS - halfLen < g.endS,
          );
          if (overlapsGap) {
            continue;
          }
          const padFrame = this.getFrameAt(padS);
          const padWidth = padCfg.width ?? config.boostPadWidth;
          const maxLat = Math.max(0, padFrame.width * 0.5 - padWidth * 0.5 - 0.15);
          boostPads.push({
            id: boostPads.length,
            s: padS,
            lateral: THREE.MathUtils.clamp(padCfg.lateral, -maxLat, maxLat),
            length: config.boostPadLength,
            width: padWidth,
          });
        }
      }
    }

    this.checkpoints = checkpoints;
    this.boostPads = boostPads;
    this.finishS = this.closed
      ? this.totalLength * this.laps
      : clampOutsideGap(Math.max(0, this.totalLength - config.finishMargin));

    const minBound = new THREE.Vector3(Infinity, Infinity, Infinity);
    const maxBound = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (let i = 0; i < count; i++) {
      if (this.isGapTable[i] === 1) {
        continue;
      }
      const i3 = i * 3;
      const x = this.posTable[i3];
      const y = this.posTable[i3 + 1];
      const z = this.posTable[i3 + 2];
      if (x < minBound.x) minBound.x = x;
      if (y < minBound.y) minBound.y = y;
      if (z < minBound.z) minBound.z = z;
      if (x > maxBound.x) maxBound.x = x;
      if (y > maxBound.y) maxBound.y = y;
      if (z > maxBound.z) maxBound.z = z;
    }

    const center = new THREE.Vector3().addVectors(minBound, maxBound).multiplyScalar(0.5);
    let maxRadiusSq = 0;
    for (let i = 0; i < count; i++) {
      if (this.isGapTable[i] === 1) {
        continue;
      }
      const i3 = i * 3;
      const dx = this.posTable[i3] - center.x;
      const dy = this.posTable[i3 + 1] - center.y;
      const dz = this.posTable[i3 + 2] - center.z;
      const dSq = dx * dx + dy * dy + dz * dz;
      if (dSq > maxRadiusSq) {
        maxRadiusSq = dSq;
      }
    }

    this.bounds = {
      center,
      radius: Math.sqrt(maxRadiusSq),
      min: minBound,
      max: maxBound,
    };

    if (config.validate) {
      this.logCourseValidation(config.defaultWidth, loopGaps);
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

    console.info(
      `[SkyRacer Course] length=${this.totalLength.toFixed(2)}m | samples=${this.sampleCount} | gaps=[${gapSummary}] | maxOrthoErr=${maxOrthoError.toExponential(2)} | loopGap=[${loopSummary}] | minNonAdjacentDist=${Number.isFinite(minClearance) ? minClearance.toFixed(2) : 'n/a'}m${closureNote}`,
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

  isClosed(): boolean {
    return this.closed;
  }

  getLaps(): number {
    return this.laps;
  }

  getTrackWidth(): number {
    return this.trackWidth;
  }

  getClosureReport(): ClosureReport | null {
    return this.closureReport;
  }

  getMedals(): CourseMedals {
    return this.medals;
  }

  getLength(): number {
    return this.totalLength;
  }

  wrapDistance(s: number): number {
    if (!this.closed || this.totalLength <= 1e-6) {
      return THREE.MathUtils.clamp(s, 0, this.totalLength);
    }
    const mod = s % this.totalLength;
    return mod < 0 ? mod + this.totalLength : mod;
  }

  clampDistance(s: number): number {
    if (this.closed) {
      return s;
    }
    return THREE.MathUtils.clamp(s, 0, this.totalLength);
  }

  getLapProgress(s: number): LapProgress {
    if (!this.closed || this.totalLength <= 1e-6) {
      return { lap: 0, sInLap: THREE.MathUtils.clamp(s, 0, this.totalLength) };
    }
    return {
      lap: Math.floor(s / this.totalLength),
      sInLap: this.wrapDistance(s),
    };
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
        const s = Math.max(0.5, CONFIG.car.startS - row * gridCfg.rowSpacing - col * gridCfg.columnStagger);
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

  getBounds(): CourseBounds {
    return this.bounds;
  }

  getSamples(): readonly TrackFrame[] {
    if (this.cachedSamples) {
      return this.cachedSamples;
    }
    const list: TrackFrame[] = new Array(this.sampleCount);
    for (let i = 0; i < this.sampleCount; i++) {
      const i3 = i * 3;
      list[i] = {
        s: this.sTable[i],
        position: new THREE.Vector3(
          this.posTable[i3],
          this.posTable[i3 + 1],
          this.posTable[i3 + 2],
        ),
        tangent: new THREE.Vector3(
          this.tanTable[i3],
          this.tanTable[i3 + 1],
          this.tanTable[i3 + 2],
        ),
        up: new THREE.Vector3(
          this.upTable[i3],
          this.upTable[i3 + 1],
          this.upTable[i3 + 2],
        ),
        right: new THREE.Vector3(
          this.rightTable[i3],
          this.rightTable[i3 + 1],
          this.rightTable[i3 + 2],
        ),
        width: this.widthTable[i],
        bank: this.bankTable[i],
        isGap: this.isGapTable[i] === 1,
      };
    }
    this.cachedSamples = list;
    return list;
  }

  getSampleCount(): number {
    return this.sampleCount;
  }

  getSegmentList(): readonly CourseSegmentMeta[] {
    return this.segmentMeta;
  }

  getChunks(chunkLength: number): CourseChunkRange[] {
    const safeLen = Math.max(5, chunkLength);
    const chunks: CourseChunkRange[] = [];
    let cursor = 0;
    let index = 0;
    while (cursor < this.totalLength - 1e-4) {
      const next = Math.min(this.totalLength, cursor + safeLen);
      chunks.push({
        index,
        startS: cursor,
        endS: next,
      });
      cursor = next;
      index++;
    }
    if (chunks.length === 0) {
      chunks.push({ index: 0, startS: 0, endS: this.totalLength });
    }
    return chunks;
  }

  getGapRanges(): readonly GapRange[] {
    return this.gapRanges;
  }

  getCheckpoints(): readonly CheckpointData[] {
    return this.checkpoints;
  }

  getBoostPads(): readonly BoostPadData[] {
    return this.boostPads;
  }

  getFinishS(): number {
    return this.finishS;
  }

  getCheckpointFrame(index: number): TrackFrame {
    if (this.checkpoints.length === 0) {
      return this.getFrameAt(0);
    }
    const clampedIdx = THREE.MathUtils.clamp(index, 0, this.checkpoints.length - 1);
    return this.checkpoints[clampedIdx].frame;
  }

  getGapRangeAt(s: number): GapRange | null {
    if (this.gapRanges.length === 0) {
      return null;
    }
    const queryS = this.closed ? this.wrapDistance(s) : s;
    for (const gap of this.gapRanges) {
      if (queryS >= gap.startS && queryS < gap.endS) {
        return gap;
      }
    }
    return null;
  }

  isGapAt(s: number): boolean {
    return this.getGapRangeAt(s) !== null;
  }

  private findBracket(s: number): { idx0: number; idx1: number; alpha: number } {
    const queryS = this.closed ? this.wrapDistance(s) : this.clampDistance(s);
    const maxIndex = this.sampleCount - 1;

    let low = 0;
    let high = maxIndex;
    while (low < high - 1) {
      const mid = (low + high) >> 1;
      if (this.sTable[mid] <= queryS) {
        low = mid;
      } else {
        high = mid;
      }
    }

    const idx0 = low;
    const idx1 = Math.min(low + 1, maxIndex);
    const span = this.sTable[idx1] - this.sTable[idx0];
    const alpha = idx0 === idx1 || span <= 1e-6 ? 0 : (queryS - this.sTable[idx0]) / span;
    return { idx0, idx1, alpha };
  }

  findNearestS(worldPos: THREE.Vector3, hintS: number, window = 32): number {
    if (this.closed) {
      const uniqueCount = Math.max(2, this.sampleCount - 1);
      const centerIdx = Math.min(uniqueCount - 1, this.findBracket(hintS).idx0);
      const avgStep = Math.max(0.05, this.totalLength / uniqueCount);
      const halfSteps = Math.max(4, Math.ceil(window / avgStep));

      let bestIdx = centerIdx;
      let bestDistSq = Infinity;
      for (let k = -halfSteps; k <= halfSteps; k++) {
        const idx = ((centerIdx + k) % uniqueCount + uniqueCount) % uniqueCount;
        const i3 = idx * 3;
        const dx = worldPos.x - this.posTable[i3];
        const dy = worldPos.y - this.posTable[i3 + 1];
        const dz = worldPos.z - this.posTable[i3 + 2];
        const dSq = dx * dx + dy * dy + dz * dz;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = idx;
        }
      }

      let refinedWrappedS = this.sTable[bestIdx];
      let refinedDistSq = bestDistSq;

      const prevIdx = (bestIdx - 1 + uniqueCount) % uniqueCount;
      const nextIdx = (bestIdx + 1) % uniqueCount;

      {
        const a3 = prevIdx * 3;
        const b3 = bestIdx * 3;
        _tmpA.set(this.posTable[a3], this.posTable[a3 + 1], this.posTable[a3 + 2]);
        _tmpB.set(this.posTable[b3], this.posTable[b3 + 1], this.posTable[b3 + 2]);
        _segVec.subVectors(_tmpB, _tmpA);
        const lenSq = _segVec.lengthSq();
        if (lenSq > 1e-8) {
          _relVec.subVectors(worldPos, _tmpA);
          const t = THREE.MathUtils.clamp(_relVec.dot(_segVec) / lenSq, 0, 1);
          _relVec.copy(_tmpA).addScaledVector(_segVec, t);
          const dSq = worldPos.distanceToSquared(_relVec);
          if (dSq < refinedDistSq) {
            refinedDistSq = dSq;
            const sA = bestIdx === 0 ? this.sTable[prevIdx] - this.totalLength : this.sTable[prevIdx];
            const sB = this.sTable[bestIdx];
            refinedWrappedS = this.wrapDistance(THREE.MathUtils.lerp(sA, sB, t));
          }
        }
      }

      {
        const a3 = bestIdx * 3;
        const b3 = nextIdx * 3;
        _tmpA.set(this.posTable[a3], this.posTable[a3 + 1], this.posTable[a3 + 2]);
        _tmpB.set(this.posTable[b3], this.posTable[b3 + 1], this.posTable[b3 + 2]);
        _segVec.subVectors(_tmpB, _tmpA);
        const lenSq = _segVec.lengthSq();
        if (lenSq > 1e-8) {
          _relVec.subVectors(worldPos, _tmpA);
          const t = THREE.MathUtils.clamp(_relVec.dot(_segVec) / lenSq, 0, 1);
          _relVec.copy(_tmpA).addScaledVector(_segVec, t);
          const dSq = worldPos.distanceToSquared(_relVec);
          if (dSq < refinedDistSq) {
            const sA = this.sTable[bestIdx];
            const sB = nextIdx === 0 ? this.totalLength : this.sTable[nextIdx];
            refinedWrappedS = this.wrapDistance(THREE.MathUtils.lerp(sA, sB, t));
          }
        }
      }

      const lapShift = Math.round((hintS - refinedWrappedS) / this.totalLength) * this.totalLength;
      return refinedWrappedS + lapShift;
    }

    const startIdx = this.findBracket(hintS - window).idx0;
    const endIdx = Math.min(this.sampleCount - 1, this.findBracket(hintS + window).idx1);

    let bestIdx = startIdx;
    let bestDistSq = Infinity;
    for (let i = startIdx; i <= endIdx; i++) {
      const i3 = i * 3;
      const dx = worldPos.x - this.posTable[i3];
      const dy = worldPos.y - this.posTable[i3 + 1];
      const dz = worldPos.z - this.posTable[i3 + 2];
      const dSq = dx * dx + dy * dy + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestIdx = i;
      }
    }

    let refinedS = this.sTable[bestIdx];
    let refinedDistSq = bestDistSq;

    if (bestIdx > 0) {
      const a3 = (bestIdx - 1) * 3;
      const b3 = bestIdx * 3;
      _tmpA.set(this.posTable[a3], this.posTable[a3 + 1], this.posTable[a3 + 2]);
      _tmpB.set(this.posTable[b3], this.posTable[b3 + 1], this.posTable[b3 + 2]);
      _segVec.subVectors(_tmpB, _tmpA);
      const lenSq = _segVec.lengthSq();
      if (lenSq > 1e-8) {
        _relVec.subVectors(worldPos, _tmpA);
        const t = THREE.MathUtils.clamp(_relVec.dot(_segVec) / lenSq, 0, 1);
        _relVec.copy(_tmpA).addScaledVector(_segVec, t);
        const dSq = worldPos.distanceToSquared(_relVec);
        if (dSq < refinedDistSq) {
          refinedDistSq = dSq;
          refinedS = THREE.MathUtils.lerp(this.sTable[bestIdx - 1], this.sTable[bestIdx], t);
        }
      }
    }

    if (bestIdx < this.sampleCount - 1) {
      const a3 = bestIdx * 3;
      const b3 = (bestIdx + 1) * 3;
      _tmpA.set(this.posTable[a3], this.posTable[a3 + 1], this.posTable[a3 + 2]);
      _tmpB.set(this.posTable[b3], this.posTable[b3 + 1], this.posTable[b3 + 2]);
      _segVec.subVectors(_tmpB, _tmpA);
      const lenSq = _segVec.lengthSq();
      if (lenSq > 1e-8) {
        _relVec.subVectors(worldPos, _tmpA);
        const t = THREE.MathUtils.clamp(_relVec.dot(_segVec) / lenSq, 0, 1);
        _relVec.copy(_tmpA).addScaledVector(_segVec, t);
        const dSq = worldPos.distanceToSquared(_relVec);
        if (dSq < refinedDistSq) {
          refinedS = THREE.MathUtils.lerp(this.sTable[bestIdx], this.sTable[bestIdx + 1], t);
        }
      }
    }

    return this.clampDistance(refinedS);
  }

  getFrameAt(s: number, out?: TrackFrame): TrackFrame {
    const queryS = this.closed ? this.wrapDistance(s) : this.clampDistance(s);
    const { idx0, idx1, alpha } = this.findBracket(queryS);

    const a3 = idx0 * 3;
    const b3 = idx1 * 3;

    const target: TrackFrame = out ?? {
      s: queryS,
      position: new THREE.Vector3(),
      tangent: new THREE.Vector3(),
      up: new THREE.Vector3(),
      right: new THREE.Vector3(),
      width: this.widthTable[idx0],
      bank: this.bankTable[idx0],
      isGap: this.isGapTable[idx0] === 1,
    };

    target.s = queryS;
    target.position.set(
      THREE.MathUtils.lerp(this.posTable[a3], this.posTable[b3], alpha),
      THREE.MathUtils.lerp(this.posTable[a3 + 1], this.posTable[b3 + 1], alpha),
      THREE.MathUtils.lerp(this.posTable[a3 + 2], this.posTable[b3 + 2], alpha),
    );
    target.tangent
      .set(
        THREE.MathUtils.lerp(this.tanTable[a3], this.tanTable[b3], alpha),
        THREE.MathUtils.lerp(this.tanTable[a3 + 1], this.tanTable[b3 + 1], alpha),
        THREE.MathUtils.lerp(this.tanTable[a3 + 2], this.tanTable[b3 + 2], alpha),
      )
      .normalize();
    target.up.set(
      THREE.MathUtils.lerp(this.upTable[a3], this.upTable[b3], alpha),
      THREE.MathUtils.lerp(this.upTable[a3 + 1], this.upTable[b3 + 1], alpha),
      THREE.MathUtils.lerp(this.upTable[a3 + 2], this.upTable[b3 + 2], alpha),
    );
    target.up.addScaledVector(target.tangent, -target.up.dot(target.tangent)).normalize();
    target.right.crossVectors(target.tangent, target.up).normalize();
    target.up.crossVectors(target.right, target.tangent).normalize();
    target.width = THREE.MathUtils.lerp(this.widthTable[idx0], this.widthTable[idx1], alpha);
    target.bank = THREE.MathUtils.lerp(this.bankTable[idx0], this.bankTable[idx1], alpha);
    target.isGap = this.isGapAt(queryS);

    return target;
  }

  getCurvatureUpAt(s: number): number {
    const { idx0, idx1, alpha } = this.findBracket(s);
    return THREE.MathUtils.lerp(this.kappaTable[idx0], this.kappaTable[idx1], alpha);
  }

  getSegmentAt(s: number): SegmentInfo {
    const { idx0, idx1, alpha } = this.findBracket(s);
    const segA = this.segIndexTable[idx0];
    const segB = this.segIndexTable[idx1];
    if (segA === segB) {
      return {
        index: segA,
        type: SEGMENT_TYPE_LIST[this.segTypeTable[idx0]],
        progress: THREE.MathUtils.lerp(
          this.segProgressTable[idx0],
          this.segProgressTable[idx1],
          alpha,
        ),
      };
    }
    return alpha < 0.5
      ? {
          index: segA,
          type: SEGMENT_TYPE_LIST[this.segTypeTable[idx0]],
          progress: this.segProgressTable[idx0],
        }
      : {
          index: segB,
          type: SEGMENT_TYPE_LIST[this.segTypeTable[idx1]],
          progress: this.segProgressTable[idx1],
        };
  }

  getStyleAt(s: number): TrackStyle {
    const seg = this.getSegmentAt(s);
    return this.segmentMeta[seg.index]?.style ?? 'road';
  }

  getStyleRuns(): readonly StyleRun[] {
    return this.styleRuns;
  }

  getSegmentNameAt(s: number): string | undefined {
    const seg = this.getSegmentAt(s);
    return this.segmentMeta[seg.index]?.name;
  }

  getZoneStarts(): readonly ZoneStart[] {
    return this.zoneStarts;
  }
}
