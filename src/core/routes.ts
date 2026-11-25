// src/core/routes.ts

import * as THREE from 'three';
import { CONFIG } from '../config';
import type { CourseSegmentConfig, RouteDefinition, TrackStyle } from '../courses/types';
import { solveSegments, type ClosureReport, type SolverFrame } from './courseClosure';

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

export interface RailGap {
  readonly startS: number;
  readonly endS: number;
  readonly side: -1 | 1;
  readonly kind: 'entry' | 'merge';
}

export interface RailLimits {
  readonly left: number;
  readonly right: number;
  readonly leftOpen: boolean;
  readonly rightOpen: boolean;
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

export interface LapProgress {
  lap: number;
  sInLap: number;
}

export interface Route {
  readonly routeId: string;
  readonly name: string;
  isClosed(): boolean;
  getLength(): number;
  getFinishS(): number;
  getTrackWidth(): number;
  getFrameAt(s: number, out?: TrackFrame): TrackFrame;
  getCurvatureUpAt(s: number): number;
  getSegmentAt(s: number): SegmentInfo;
  getStyleAt(s: number): TrackStyle;
  getStyleRuns(): readonly StyleRun[];
  getSegmentNameAt(s: number): string | undefined;
  getZoneStarts(): readonly ZoneStart[];
  getSegmentList(): readonly CourseSegmentMeta[];
  getGapRanges(): readonly GapRange[];
  getGapRangeAt(s: number): GapRange | null;
  isGapAt(s: number): boolean;
  getBoostPads(): readonly BoostPadData[];
  getRailGaps(): readonly RailGap[];
  isRailGapAt(s: number, side: -1 | 1): boolean;
  getRailLimits(s: number): RailLimits;
  getChunks(chunkLength: number): CourseChunkRange[];
  getSamples(): readonly TrackFrame[];
  getSampleCount(): number;
  getBounds(): CourseBounds;
  wrapDistance(s: number): number;
  clampDistance(s: number): number;
  getLapProgress(s: number): LapProgress;
  findNearestS(worldPos: THREE.Vector3, hintS: number, window?: number): number;
}

export interface LoopGapInfo {
  segmentIndex: number;
  entryExitDistance: number;
}

export interface SampledTrackOptions {
  readonly segments: readonly CourseSegmentConfig[];
  readonly startFrame: SolverFrame;
  readonly closed: boolean;
  readonly defaultWidth: number;
  readonly stepLength: number;
  readonly bankBlendLength: number;
  readonly slopeBlendLength: number;
  readonly curvatureSmoothWindow: number;
  readonly boostPadLength: number;
  readonly boostPadWidth: number;
  readonly closureReport?: ClosureReport | null;
}

export interface SampledTrackResult {
  readonly sampleCount: number;
  readonly sTable: Float64Array;
  readonly posTable: Float32Array;
  readonly tanTable: Float32Array;
  readonly upTable: Float32Array;
  readonly rightTable: Float32Array;
  readonly widthTable: Float32Array;
  readonly bankTable: Float32Array;
  readonly kappaTable: Float32Array;
  readonly segIndexTable: Int32Array;
  readonly segTypeTable: Uint8Array;
  readonly segProgressTable: Float32Array;
  readonly isGapTable: Uint8Array;
  readonly segmentMeta: CourseSegmentMeta[];
  readonly styleRuns: StyleRun[];
  readonly zoneStarts: ZoneStart[];
  readonly totalLength: number;
  readonly bounds: CourseBounds;
  readonly gapRanges: GapRange[];
  readonly loopGaps: LoopGapInfo[];
  readonly boostPads: BoostPadData[];
  readonly closureReport: ClosureReport | null;
}

interface TurtleState {
  s: number;
  pitchRad: number;
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  baseUp: THREE.Vector3;
  baseRight: THREE.Vector3;
}

export const SEGMENT_TYPE_LIST: readonly CourseSegmentType[] = [
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
    if (lat < targetAbs) low = mid;
    else high = mid;
  }

  return sign * (low + high) * 0.5;
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

export function buildSampledTrack(options: SampledTrackOptions): SampledTrackResult {
  const activeSegments = options.segments;
  const startT = options.startFrame.tangent.clone().normalize();
  const startU = options.startFrame.up.clone();
  const startR = options.startFrame.right.clone();
  const pitchInit =
    options.startFrame.pitchRad ?? Math.asin(THREE.MathUtils.clamp(startT.y, -1, 1));

  const turtle: TurtleState = {
    s: 0,
    pitchRad: pitchInit,
    position: options.startFrame.position.clone(),
    tangent: startT,
    baseUp: startU,
    baseRight: startR,
  };
  orthonormalizeTurtle(turtle);

  const capacity = estimateTotalSamples(activeSegments, options.stepLength);
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
    firstSeg.width ?? options.defaultWidth,
    0,
    0,
    firstSeg.type,
    0,
    firstSeg.type === 'gap',
  );

  for (let segIdx = 0; segIdx < activeSegments.length; segIdx++) {
    const seg = activeSegments[segIdx];
    const segWidth = seg.width ?? options.defaultWidth;
    const segStartS = turtle.s;

    if (seg.type === 'straight') {
      const steps = Math.max(1, Math.round(seg.length / options.stepLength));
      const ds = seg.length / steps;

      for (let i = 1; i <= steps; i++) {
        turtle.position.addScaledVector(turtle.tangent, ds);
        turtle.s += ds;
        pushSample(segWidth, 0, segIdx, seg.type, i / steps, false);
      }
    } else if (seg.type === 'curve') {
      const angleRad = THREE.MathUtils.degToRad(seg.angleDeg);
      const arcLength = Math.abs(angleRad) * seg.radius;
      const steps = Math.max(2, Math.round(arcLength / options.stepLength));
      const ds = arcLength / steps;
      const dYaw = angleRad / steps;
      const targetBank = THREE.MathUtils.degToRad(seg.bankDeg);
      const blendLen = Math.min(options.bankBlendLength, arcLength * 0.45);

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
      const steps = Math.max(2, Math.round(seg.length / options.stepLength));
      const ds = seg.length / steps;
      const basePitch = turtle.pitchRad;
      const peakOffset = THREE.MathUtils.degToRad(seg.pitchDeg);
      const blendLen = Math.min(options.slopeBlendLength, seg.length * 0.45);

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
      const steps = Math.max(2, Math.round(seg.length / options.stepLength));
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
      const steps = Math.max(2, Math.round(seg.length / options.stepLength));
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
      const steps = Math.max(16, Math.round(circumference / options.stepLength));
      const ds = circumference / steps;
      const dPitch = (2 * Math.PI) / steps;

      const loopStartPos = turtle.position.clone();
      const yawAxis = turtle.baseUp.clone();
      const yawAmp = solveLoopYawAmplitude(
        turtle,
        seg.radius,
        seg.lateralOffset,
        options.stepLength,
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

  const sTable = sArr.subarray(0, count);
  const posTable = posArr.subarray(0, count * 3);
  const tanTable = tanArr.subarray(0, count * 3);
  const upTable = upArr.subarray(0, count * 3);
  const rightTable = rightArr.subarray(0, count * 3);
  const widthTable = widthArr.subarray(0, count);
  const bankTable = bankArr.subarray(0, count);
  const segIndexTable = segIdxArr.subarray(0, count);
  const segTypeTable = segTypeArr.subarray(0, count);
  const segProgressTable = segProgArr.subarray(0, count);
  const isGapTable = isGapArr.subarray(0, count);
  const kappaTable = new Float32Array(count);
  const totalLength = sTable[count - 1];

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

  let closureReport = options.closureReport ?? null;
  if (options.closed && count >= 3) {
    const lastIdx = count - 1;
    const last3 = lastIdx * 3;
    const errX = posTable[last3] - posTable[0];
    const errY = posTable[last3 + 1] - posTable[1];
    const errZ = posTable[last3 + 2] - posTable[2];
    const blendLen = Math.min(CONFIG.course.closure.blendLength, totalLength * 0.25);
    const blendStartS = Math.max(0, totalLength - blendLen);
    const errNorm = Math.hypot(errX, errY, errZ);

    if (errNorm > 1e-6 && blendLen > 1e-4) {
      for (let i = 0; i < count; i++) {
        const sVal = sTable[i];
        if (sVal <= blendStartS) continue;
        const w = smoothstep01((sVal - blendStartS) / blendLen);
        const i3 = i * 3;
        posTable[i3] -= errX * w;
        posTable[i3 + 1] -= errY * w;
        posTable[i3 + 2] -= errZ * w;
      }
      if (closureReport) {
        closureReport = {
          ...closureReport,
          blendApplied: true,
          blendLengthM: blendLen,
        };
      }
    }

    posTable[last3] = posTable[0];
    posTable[last3 + 1] = posTable[1];
    posTable[last3 + 2] = posTable[2];
    tanTable[last3] = tanTable[0];
    tanTable[last3 + 1] = tanTable[1];
    tanTable[last3 + 2] = tanTable[2];
    upTable[last3] = upTable[0];
    upTable[last3 + 1] = upTable[1];
    upTable[last3 + 2] = upTable[2];
    rightTable[last3] = rightTable[0];
    rightTable[last3 + 1] = rightTable[1];
    rightTable[last3 + 2] = rightTable[2];
    widthTable[lastIdx] = widthTable[0];
    bankTable[lastIdx] = bankTable[0];
  }

  const rawKappa = new Float32Array(count);
  const uniqueCount = Math.max(2, count - 1);
  for (let i = 0; i < count; i++) {
    let iPrev: number;
    let iNext: number;
    let spanS: number;
    if (options.closed) {
      const uIdx = i === count - 1 ? 0 : i;
      iPrev = (uIdx - 1 + uniqueCount) % uniqueCount;
      iNext = (uIdx + 1) % uniqueCount;
      const sPrev = iPrev === uniqueCount - 1 && uIdx === 0 ? sTable[iPrev] - totalLength : sTable[iPrev];
      const sNext = iNext === 0 && uIdx === uniqueCount - 1 ? totalLength : sTable[iNext];
      spanS = sNext - sPrev;
    } else {
      iPrev = Math.max(0, i - 1);
      iNext = Math.min(count - 1, i + 1);
      spanS = sTable[iNext] - sTable[iPrev];
    }
    if (spanS > 1e-6) {
      const p3 = iPrev * 3;
      const n3 = iNext * 3;
      const i3 = i * 3;
      _tmpDelta.set(
        (tanTable[n3] - tanTable[p3]) / spanS,
        (tanTable[n3 + 1] - tanTable[p3 + 1]) / spanS,
        (tanTable[n3 + 2] - tanTable[p3 + 2]) / spanS,
      );
      rawKappa[i] =
        _tmpDelta.x * upTable[i3] +
        _tmpDelta.y * upTable[i3 + 1] +
        _tmpDelta.z * upTable[i3 + 2];
    }
  }

  const halfWin = Math.max(0, Math.floor(options.curvatureSmoothWindow));
  for (let i = 0; i < count; i++) {
    let sum = 0;
    let winCount = 0;
    if (options.closed) {
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
    kappaTable[i] = winCount > 0 ? sum / winCount : 0;
  }

  const findSampleBracket = (queryS: number): { idx0: number; idx1: number; alpha: number } => {
    const clamped = THREE.MathUtils.clamp(queryS, 0, totalLength);
    const maxIndex = count - 1;
    let low = 0;
    let high = maxIndex;
    while (low < high - 1) {
      const mid = (low + high) >> 1;
      if (sTable[mid] <= clamped) low = mid;
      else high = mid;
    }
    const idx0 = low;
    const idx1 = Math.min(low + 1, maxIndex);
    const span = sTable[idx1] - sTable[idx0];
    const alpha = idx0 === idx1 || span <= 1e-6 ? 0 : (clamped - sTable[idx0]) / span;
    return { idx0, idx1, alpha };
  };

  const boostPads: BoostPadData[] = [];
  for (const meta of segmentMeta) {
    if (meta.config.boostPads && meta.type !== 'gap') {
      for (const padCfg of meta.config.boostPads) {
        const padS = THREE.MathUtils.lerp(
          meta.startS,
          meta.endS,
          THREE.MathUtils.clamp(padCfg.at, 0, 1),
        );
        const halfLen = options.boostPadLength * 0.5;
        const overlapsGap = gapRanges.some(
          (g) => padS + halfLen > g.startS && padS - halfLen < g.endS,
        );
        if (overlapsGap) continue;
        const { idx0, idx1, alpha } = findSampleBracket(padS);
        const w = THREE.MathUtils.lerp(widthTable[idx0], widthTable[idx1], alpha);
        const padWidth = padCfg.width ?? options.boostPadWidth;
        const maxLat = Math.max(0, w * 0.5 - padWidth * 0.5 - 0.15);
        boostPads.push({
          id: boostPads.length,
          s: padS,
          lateral: THREE.MathUtils.clamp(padCfg.lateral, -maxLat, maxLat),
          length: options.boostPadLength,
          width: padWidth,
        });
      }
    }
  }

  const minBound = new THREE.Vector3(Infinity, Infinity, Infinity);
  const maxBound = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (let i = 0; i < count; i++) {
    if (isGapTable[i] === 1) continue;
    const i3 = i * 3;
    const x = posTable[i3];
    const y = posTable[i3 + 1];
    const z = posTable[i3 + 2];
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
    if (isGapTable[i] === 1) continue;
    const i3 = i * 3;
    const dx = posTable[i3] - center.x;
    const dy = posTable[i3 + 1] - center.y;
    const dz = posTable[i3 + 2] - center.z;
    const dSq = dx * dx + dy * dy + dz * dz;
    if (dSq > maxRadiusSq) maxRadiusSq = dSq;
  }

  return {
    sampleCount: count,
    sTable,
    posTable,
    tanTable,
    upTable,
    rightTable,
    widthTable,
    bankTable,
    kappaTable,
    segIndexTable,
    segTypeTable,
    segProgressTable,
    isGapTable,
    segmentMeta,
    styleRuns,
    zoneStarts,
    totalLength,
    bounds: {
      center,
      radius: Math.sqrt(maxRadiusSq),
      min: minBound,
      max: maxBound,
    },
    gapRanges,
    loopGaps,
    boostPads,
    closureReport,
  };
}

export class SampledRouteBase implements Route {
  readonly routeId: string;
  readonly name: string;

  protected readonly closed: boolean;
  protected readonly trackWidth: number;
  protected readonly sampleCount: number;
  protected readonly sTable: Float64Array;
  protected readonly posTable: Float32Array;
  protected readonly tanTable: Float32Array;
  protected readonly upTable: Float32Array;
  protected readonly rightTable: Float32Array;
  protected readonly widthTable: Float32Array;
  protected readonly bankTable: Float32Array;
  protected readonly kappaTable: Float32Array;
  protected readonly segIndexTable: Int32Array;
  protected readonly segTypeTable: Uint8Array;
  protected readonly segProgressTable: Float32Array;
  protected readonly isGapTable: Uint8Array;
  protected readonly segmentMeta: CourseSegmentMeta[];
  protected readonly styleRuns: StyleRun[];
  protected readonly zoneStarts: ZoneStart[];
  protected readonly totalLength: number;
  protected readonly bounds: CourseBounds;
  protected readonly gapRanges: GapRange[];
  protected readonly boostPads: BoostPadData[];
  protected readonly railGaps: RailGap[];
  protected readonly mainWidthForRailLimits: number;
  protected cachedSamples: TrackFrame[] | null = null;
  protected finishS: number;

  constructor(
    routeId: string,
    name: string,
    closed: boolean,
    trackWidth: number,
    sampled: SampledTrackResult,
    railGaps: RailGap[] = [],
    mainWidthForRailLimits: number = trackWidth,
  ) {
    this.routeId = routeId;
    this.name = name;
    this.closed = closed;
    this.trackWidth = trackWidth;
    this.sampleCount = sampled.sampleCount;
    this.sTable = sampled.sTable;
    this.posTable = sampled.posTable;
    this.tanTable = sampled.tanTable;
    this.upTable = sampled.upTable;
    this.rightTable = sampled.rightTable;
    this.widthTable = sampled.widthTable;
    this.bankTable = sampled.bankTable;
    this.kappaTable = sampled.kappaTable;
    this.segIndexTable = sampled.segIndexTable;
    this.segTypeTable = sampled.segTypeTable;
    this.segProgressTable = sampled.segProgressTable;
    this.isGapTable = sampled.isGapTable;
    this.segmentMeta = sampled.segmentMeta;
    this.styleRuns = sampled.styleRuns;
    this.zoneStarts = sampled.zoneStarts;
    this.totalLength = sampled.totalLength;
    this.bounds = sampled.bounds;
    this.gapRanges = sampled.gapRanges;
    this.boostPads = sampled.boostPads;
    this.railGaps = railGaps;
    this.mainWidthForRailLimits = mainWidthForRailLimits;
    this.finishS = sampled.totalLength;
  }

  isClosed(): boolean {
    return this.closed;
  }

  getLength(): number {
    return this.totalLength;
  }

  getFinishS(): number {
    return this.finishS;
  }

  getTrackWidth(): number {
    return this.trackWidth;
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
        position: new THREE.Vector3(this.posTable[i3], this.posTable[i3 + 1], this.posTable[i3 + 2]),
        tangent: new THREE.Vector3(this.tanTable[i3], this.tanTable[i3 + 1], this.tanTable[i3 + 2]),
        up: new THREE.Vector3(this.upTable[i3], this.upTable[i3 + 1], this.upTable[i3 + 2]),
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
      chunks.push({ index, startS: cursor, endS: next });
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

  getBoostPads(): readonly BoostPadData[] {
    return this.boostPads;
  }

  getRailGaps(): readonly RailGap[] {
    return this.railGaps;
  }

  isRailGapAt(s: number, side: -1 | 1): boolean {
    if (this.railGaps.length === 0) {
      return false;
    }
    const queryS = this.closed ? this.wrapDistance(s) : this.clampDistance(s);
    for (let i = 0; i < this.railGaps.length; i++) {
      const gap = this.railGaps[i];
      if (gap.side !== side) continue;
      const atTerminalMerge =
        !this.closed &&
        gap.kind === 'merge' &&
        gap.endS >= this.totalLength - 1e-4 &&
        queryS >= gap.startS;
      if (atTerminalMerge || (queryS >= gap.startS && queryS < gap.endS)) {
        return true;
      }
    }
    return false;
  }

  getRailLimits(s: number): RailLimits {
    const { idx0, idx1, alpha } = this.findBracket(s);
    const width = THREE.MathUtils.lerp(this.widthTable[idx0], this.widthTable[idx1], alpha);
    const halfW = width * 0.5;
    let left = -halfW;
    let right = halfW;
    let leftOpen = false;
    let rightOpen = false;

    if (this.railGaps.length > 0) {
      const queryS = this.closed ? this.wrapDistance(s) : this.clampDistance(s);
      for (let i = 0; i < this.railGaps.length; i++) {
        const gap = this.railGaps[i];
        const atTerminalMerge =
          !this.closed &&
          gap.kind === 'merge' &&
          gap.endS >= this.totalLength - 1e-4 &&
          queryS >= gap.startS;
        if (!atTerminalMerge && (queryS < gap.startS || queryS >= gap.endS)) {
          continue;
        }
        if (this.routeId === 'main') {
          if (gap.side === 1) {
            rightOpen = true;
            if (gap.kind === 'entry') {
              right = halfW + CONFIG.shortcut.branchWidth;
            }
          }
        } else {
          if (gap.side === -1) {
            leftOpen = true;
            if (gap.kind === 'entry') {
              left = -halfW - this.mainWidthForRailLimits;
            } else {
              left = -halfW - (this.mainWidthForRailLimits - width);
            }
          }
        }
      }
    }

    return { left, right, leftOpen, rightOpen };
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

  protected findBracket(s: number): { idx0: number; idx1: number; alpha: number } {
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

export interface RouteAnchorHost {
  getFrameAt(s: number, out?: TrackFrame): TrackFrame;
  getSegmentList(): readonly CourseSegmentMeta[];
  getTrackWidth(): number;
}

export class BranchRoute extends SampledRouteBase {
  readonly fromS: number;
  readonly toS: number;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly entryGapLength: number;
  readonly mergeGapLength: number;
  readonly solveReport: ClosureReport;
  readonly definition: RouteDefinition;

  constructor(
    definition: RouteDefinition,
    fromS: number,
    toS: number,
    sampled: SampledTrackResult,
    railGaps: RailGap[],
    mainTrackWidth: number,
    solveReport: ClosureReport,
  ) {
    super(
      definition.id,
      definition.name,
      false,
      definition.width,
      sampled,
      railGaps,
      mainTrackWidth,
    );
    this.definition = definition;
    this.fromS = fromS;
    this.toS = toS;
    this.startOffset = definition.startOffset;
    this.endOffset = definition.endOffset;
    this.entryGapLength = definition.entryGapLength;
    this.mergeGapLength = definition.mergeGapLength;
    this.solveReport = solveReport;
  }
}

export function resolveRouteAnchorS(
  host: RouteAnchorHost,
  anchor: { readonly segmentIndex: number; readonly at: number },
): number {
  const segList = host.getSegmentList();
  const clampedIdx = THREE.MathUtils.clamp(anchor.segmentIndex, 0, segList.length - 1);
  const seg = segList[clampedIdx];
  return THREE.MathUtils.lerp(seg.startS, seg.endS, THREE.MathUtils.clamp(anchor.at, 0, 1));
}

export interface CreateRouteOptions {
  readonly stepLength?: number;
  readonly bankBlendLength?: number;
  readonly slopeBlendLength?: number;
  readonly curvatureSmoothWindow?: number;
  readonly boostPadLength?: number;
  readonly boostPadWidth?: number;
}

export function createRoute(
  host: RouteAnchorHost,
  routeDef: RouteDefinition,
  options?: CreateRouteOptions,
): BranchRoute {
  const stepLength = options?.stepLength ?? CONFIG.course.stepLength;
  const bankBlendLength = options?.bankBlendLength ?? CONFIG.course.bankBlendLength;
  const slopeBlendLength = options?.slopeBlendLength ?? CONFIG.course.slopeBlendLength;
  const curvatureSmoothWindow =
    options?.curvatureSmoothWindow ?? CONFIG.course.curvatureSmoothWindow;
  const boostPadLength = options?.boostPadLength ?? CONFIG.boost.padLength;
  const boostPadWidth = options?.boostPadWidth ?? CONFIG.boost.padWidth;

  const fromS = resolveRouteAnchorS(host, routeDef.fromAnchor);
  const toS = resolveRouteAnchorS(host, routeDef.toAnchor);

  const mainFrom = host.getFrameAt(fromS);
  const mainTo = host.getFrameAt(toS);

  const startFrame: SolverFrame = {
    position: mainFrom.position.clone().addScaledVector(mainFrom.right, routeDef.startOffset),
    tangent: mainFrom.tangent.clone().normalize(),
    up: mainFrom.up.clone(),
    right: mainFrom.right.clone(),
  };

  const targetFrame: SolverFrame = {
    position: mainTo.position.clone().addScaledVector(mainTo.right, routeDef.endOffset),
    tangent: mainTo.tangent.clone().normalize(),
    up: mainTo.up.clone(),
    right: mainTo.right.clone(),
  };

  const solved = solveSegments({
    startFrame,
    targetFrame,
    segments: routeDef.segments,
    stepLength,
    bankBlendLength,
    slopeBlendLength,
    maxIterations: CONFIG.course.closure.maxIterations,
    posToleranceM: 0.05,
    yawToleranceDeg: 0.1,
    pitchToleranceDeg: 0.1,
    maxSlopeDeg: CONFIG.course.closure.maxSlopeDeg,
    minStraightLength: 10,
    errorLabel: `Rute pintas '${routeDef.id}'`,
  });

  const sampled = buildSampledTrack({
    segments: solved.segments,
    startFrame,
    closed: false,
    defaultWidth: routeDef.width,
    stepLength,
    bankBlendLength,
    slopeBlendLength,
    curvatureSmoothWindow,
    boostPadLength,
    boostPadWidth,
    closureReport: solved.report,
  });

  const branchLen = sampled.totalLength;
  const railGaps: RailGap[] = [
    {
      startS: 0,
      endS: Math.min(branchLen, routeDef.entryGapLength),
      side: -1,
      kind: 'entry',
    },
    {
      startS: Math.max(0, branchLen - routeDef.mergeGapLength),
      endS: branchLen,
      side: -1,
      kind: 'merge',
    },
  ];

  return new BranchRoute(
    routeDef,
    fromS,
    toS,
    sampled,
    railGaps,
    host.getTrackWidth(),
    solved.report,
  );
}
