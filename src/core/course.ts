// src/core/course.ts

import * as THREE from 'three';
import type { CourseSegmentConfig } from '../config';

export type CourseSegmentType = CourseSegmentConfig['type'];

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

export interface SegmentInfo {
  index: number;
  type: CourseSegmentType;
  progress: number;
}

export interface CourseBounds {
  center: THREE.Vector3;
  radius: number;
  min: THREE.Vector3;
  max: THREE.Vector3;
}

export interface CourseConfig {
  segments: readonly CourseSegmentConfig[];
  startPosition: { readonly x: number; readonly y: number; readonly z: number };
  startHeadingDeg: number;
  defaultWidth: number;
  stepLength: number;
  bankBlendLength: number;
  slopeBlendLength: number;
  curvatureSmoothWindow: number;
  validate?: boolean;
}

interface InternalSample {
  s: number;
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  up: THREE.Vector3;
  right: THREE.Vector3;
  width: number;
  bank: number;
  kappaUp: number;
  segmentIndex: number;
  segmentType: CourseSegmentType;
  segmentProgress: number;
  isGap: boolean;
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

const _cross = new THREE.Vector3();
const _rotOut = new THREE.Vector3();
const _segVec = new THREE.Vector3();
const _relVec = new THREE.Vector3();

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

function applyBankToBasis(
  baseUp: THREE.Vector3,
  baseRight: THREE.Vector3,
  bankRad: number,
): { up: THREE.Vector3; right: THREE.Vector3 } {
  const cosB = Math.cos(bankRad);
  const sinB = Math.sin(bankRad);
  const right = new THREE.Vector3()
    .addScaledVector(baseRight, cosB)
    .addScaledVector(baseUp, sinB)
    .normalize();
  const up = new THREE.Vector3()
    .addScaledVector(baseUp, cosB)
    .addScaledVector(baseRight, -sinB)
    .normalize();
  return { up, right };
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

    // Yaw around entry up axis
    rotateRodrigues(t, yawAxis, -dPsi, _rotOut);
    t.copy(_rotOut);
    rotateRodrigues(u, yawAxis, -dPsi, _rotOut);
    u.copy(_rotOut);
    rotateRodrigues(r, yawAxis, -dPsi, _rotOut);
    r.copy(_rotOut);

    // Pitch around local right axis (+dPitch pitches upward around R)
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

export class Course {
  private readonly samples: InternalSample[];
  private readonly totalLength: number;
  private readonly bounds: CourseBounds;
  private readonly gapRanges: GapRange[];

  constructor(config: CourseConfig) {
    if (config.segments.length === 0) {
      throw new Error('Course requires at least 1 segment.');
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

    const samples: InternalSample[] = [];
    const gapRanges: GapRange[] = [];
    const loopGaps: LoopGapInfo[] = [];

    const pushSample = (
      width: number,
      bankRad: number,
      segmentIndex: number,
      segmentType: CourseSegmentType,
      segmentProgress: number,
      isGap: boolean,
    ): void => {
      const { up, right } = applyBankToBasis(turtle.baseUp, turtle.baseRight, bankRad);
      samples.push({
        s: turtle.s,
        position: turtle.position.clone(),
        tangent: turtle.tangent.clone(),
        up,
        right,
        width,
        bank: bankRad,
        kappaUp: 0,
        segmentIndex,
        segmentType,
        segmentProgress,
        isGap,
      });
    };

    // Initial sample at s = 0
    const firstSeg = config.segments[0];
    pushSample(
      firstSeg.width ?? config.defaultWidth,
      0,
      0,
      firstSeg.type,
      0,
      firstSeg.type === 'gap',
    );

    for (let segIdx = 0; segIdx < config.segments.length; segIdx++) {
      const seg = config.segments[segIdx];
      const segWidth = seg.width ?? config.defaultWidth;

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
          // Positive angleDeg = right turn -> rotate around baseUp by -dYaw
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

          // Final point at endS marks the start of the landing deck
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
    }

    // Compute numerical curvature kappa_up = (dT/ds) · up and smooth it
    const rawKappa = new Float32Array(samples.length);
    const dT = new THREE.Vector3();
    for (let i = 0; i < samples.length; i++) {
      const iPrev = Math.max(0, i - 1);
      const iNext = Math.min(samples.length - 1, i + 1);
      const spanS = samples[iNext].s - samples[iPrev].s;
      if (spanS > 1e-6) {
        dT.subVectors(samples[iNext].tangent, samples[iPrev].tangent).divideScalar(spanS);
        rawKappa[i] = dT.dot(samples[i].up);
      }
    }

    const halfWin = Math.max(0, Math.floor(config.curvatureSmoothWindow));
    for (let i = 0; i < samples.length; i++) {
      let sum = 0;
      let count = 0;
      const start = Math.max(0, i - halfWin);
      const end = Math.min(samples.length - 1, i + halfWin);
      for (let k = start; k <= end; k++) {
        sum += rawKappa[k];
        count++;
      }
      samples[i].kappaUp = count > 0 ? sum / count : 0;
    }

    this.samples = samples;
    this.gapRanges = gapRanges;
    this.totalLength = samples[samples.length - 1].s;

    const minBound = new THREE.Vector3(Infinity, Infinity, Infinity);
    const maxBound = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (const sample of samples) {
      if (sample.isGap) {
        continue;
      }
      minBound.min(sample.position);
      maxBound.max(sample.position);
    }
    const center = new THREE.Vector3().addVectors(minBound, maxBound).multiplyScalar(0.5);
    let maxRadiusSq = 0;
    for (const sample of samples) {
      if (sample.isGap) {
        continue;
      }
      const dSq = sample.position.distanceToSquared(center);
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
    for (const sample of this.samples) {
      const lenErr =
        Math.abs(sample.tangent.length() - 1) +
        Math.abs(sample.up.length() - 1) +
        Math.abs(sample.right.length() - 1);
      const dotErr =
        Math.abs(sample.tangent.dot(sample.up)) +
        Math.abs(sample.tangent.dot(sample.right)) +
        Math.abs(sample.up.dot(sample.right));
      maxOrthoError = Math.max(maxOrthoError, lenErr + dotErr);
    }

    // Check non-adjacent solid track clearance for self-intersection
    const minArcSeparation = defaultWidth * 2.2;
    let minClearance = Infinity;
    let collisionWarningCount = 0;
    const stride = Math.max(1, Math.floor(this.samples.length / 320));

    for (let i = 0; i < this.samples.length; i += stride) {
      const a = this.samples[i];
      if (a.isGap) {
        continue;
      }
      for (let j = i + 1; j < this.samples.length; j += stride) {
        const b = this.samples[j];
        if (b.isGap || b.s - a.s < minArcSeparation) {
          continue;
        }
        const dist = a.position.distanceTo(b.position);
        if (dist < minClearance) {
          minClearance = dist;
        }
        if (dist < Math.max(a.width, b.width)) {
          collisionWarningCount++;
        }
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

    console.info(
      `[SkyRacer Course] length=${this.totalLength.toFixed(2)}m | samples=${this.samples.length} | gaps=[${gapSummary}] | maxOrthoErr=${maxOrthoError.toExponential(2)} | loopGap=[${loopSummary}] | minNonAdjacentDist=${Number.isFinite(minClearance) ? minClearance.toFixed(2) : 'n/a'}m`,
    );

    if (collisionWarningCount > 0) {
      console.warn(
        `[SkyRacer Course] Peringatan: terdeteksi ${collisionWarningCount} pasangan sampel lintasan berjarak < lebar lintasan (${defaultWidth}m).`,
      );
    }
  }

  getLength(): number {
    return this.totalLength;
  }

  clampDistance(s: number): number {
    return THREE.MathUtils.clamp(s, 0, this.totalLength);
  }

  getBounds(): CourseBounds {
    return this.bounds;
  }

  getSamples(): readonly TrackFrame[] {
    return this.samples;
  }

  getGapRanges(): readonly GapRange[] {
    return this.gapRanges;
  }

  getGapRangeAt(s: number): GapRange | null {
    for (const gap of this.gapRanges) {
      if (s >= gap.startS && s < gap.endS) {
        return gap;
      }
    }
    return null;
  }

  isGapAt(s: number): boolean {
    return this.getGapRangeAt(s) !== null;
  }

  private findBracket(s: number): { idx0: number; idx1: number; alpha: number } {
    const clampedS = this.clampDistance(s);
    const maxIndex = this.samples.length - 1;

    let low = 0;
    let high = maxIndex;
    while (low < high - 1) {
      const mid = (low + high) >> 1;
      if (this.samples[mid].s <= clampedS) {
        low = mid;
      } else {
        high = mid;
      }
    }

    const idx0 = low;
    const idx1 = Math.min(low + 1, maxIndex);
    const span = this.samples[idx1].s - this.samples[idx0].s;
    const alpha = idx0 === idx1 || span <= 1e-6 ? 0 : (clampedS - this.samples[idx0].s) / span;
    return { idx0, idx1, alpha };
  }

  findNearestS(worldPos: THREE.Vector3, hintS: number, window = 32): number {
    const startIdx = this.findBracket(hintS - window).idx0;
    const endIdx = Math.min(this.samples.length - 1, this.findBracket(hintS + window).idx1);

    let bestIdx = startIdx;
    let bestDistSq = Infinity;
    for (let i = startIdx; i <= endIdx; i++) {
      const dSq = worldPos.distanceToSquared(this.samples[i].position);
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestIdx = i;
      }
    }

    // Refine continuously along adjacent sample segments
    let refinedS = this.samples[bestIdx].s;
    let refinedDistSq = bestDistSq;

    if (bestIdx > 0) {
      const a = this.samples[bestIdx - 1];
      const b = this.samples[bestIdx];
      _segVec.subVectors(b.position, a.position);
      const lenSq = _segVec.lengthSq();
      if (lenSq > 1e-8) {
        _relVec.subVectors(worldPos, a.position);
        const t = THREE.MathUtils.clamp(_relVec.dot(_segVec) / lenSq, 0, 1);
        _relVec.copy(a.position).addScaledVector(_segVec, t);
        const dSq = worldPos.distanceToSquared(_relVec);
        if (dSq < refinedDistSq) {
          refinedDistSq = dSq;
          refinedS = THREE.MathUtils.lerp(a.s, b.s, t);
        }
      }
    }

    if (bestIdx < this.samples.length - 1) {
      const a = this.samples[bestIdx];
      const b = this.samples[bestIdx + 1];
      _segVec.subVectors(b.position, a.position);
      const lenSq = _segVec.lengthSq();
      if (lenSq > 1e-8) {
        _relVec.subVectors(worldPos, a.position);
        const t = THREE.MathUtils.clamp(_relVec.dot(_segVec) / lenSq, 0, 1);
        _relVec.copy(a.position).addScaledVector(_segVec, t);
        const dSq = worldPos.distanceToSquared(_relVec);
        if (dSq < refinedDistSq) {
          refinedS = THREE.MathUtils.lerp(a.s, b.s, t);
        }
      }
    }

    return this.clampDistance(refinedS);
  }

  getFrameAt(s: number, out?: TrackFrame): TrackFrame {
    const clampedS = this.clampDistance(s);
    const { idx0, idx1, alpha } = this.findBracket(clampedS);

    const a = this.samples[idx0];
    const b = this.samples[idx1];

    const target: TrackFrame = out ?? {
      s: clampedS,
      position: new THREE.Vector3(),
      tangent: new THREE.Vector3(),
      up: new THREE.Vector3(),
      right: new THREE.Vector3(),
      width: a.width,
      bank: a.bank,
      isGap: a.isGap,
    };

    target.s = clampedS;
    target.position.lerpVectors(a.position, b.position, alpha);
    target.tangent.lerpVectors(a.tangent, b.tangent, alpha).normalize();
    target.up.lerpVectors(a.up, b.up, alpha);
    target.up.addScaledVector(target.tangent, -target.up.dot(target.tangent)).normalize();
    target.right.crossVectors(target.tangent, target.up).normalize();
    target.up.crossVectors(target.right, target.tangent).normalize();
    target.width = THREE.MathUtils.lerp(a.width, b.width, alpha);
    target.bank = THREE.MathUtils.lerp(a.bank, b.bank, alpha);
    target.isGap = this.isGapAt(clampedS);

    return target;
  }

  getCurvatureUpAt(s: number): number {
    const { idx0, idx1, alpha } = this.findBracket(s);
    return THREE.MathUtils.lerp(this.samples[idx0].kappaUp, this.samples[idx1].kappaUp, alpha);
  }

  getSegmentAt(s: number): SegmentInfo {
    const { idx0, idx1, alpha } = this.findBracket(s);
    const a = this.samples[idx0];
    const b = this.samples[idx1];
    if (a.segmentIndex === b.segmentIndex) {
      return {
        index: a.segmentIndex,
        type: a.segmentType,
        progress: THREE.MathUtils.lerp(a.segmentProgress, b.segmentProgress, alpha),
      };
    }
    return alpha < 0.5
      ? { index: a.segmentIndex, type: a.segmentType, progress: a.segmentProgress }
      : { index: b.segmentIndex, type: b.segmentType, progress: b.segmentProgress };
  }
}
