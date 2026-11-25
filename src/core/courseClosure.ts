// src/core/courseClosure.ts

import * as THREE from 'three';
import type { CourseSegmentConfig } from '../courses/types';

export interface ClosureAdjustment {
  readonly segmentIndex: number;
  readonly type: 'straight' | 'curve' | 'slope' | 'pitchTo';
  readonly field: 'length' | 'angleDeg' | 'pitchDeg';
  readonly originalValue: number;
  readonly solvedValue: number;
}

export interface ClosureReport {
  readonly converged: boolean;
  readonly iterations: number;
  readonly posErrorM: number;
  readonly dx: number;
  readonly dy: number;
  readonly dz: number;
  readonly dYawDeg: number;
  readonly dPitchDeg: number;
  readonly totalLengthM: number;
  readonly adjustments: readonly ClosureAdjustment[];
  readonly blendApplied: boolean;
  readonly blendLengthM: number;
}

export interface SolverFrame {
  readonly position: THREE.Vector3;
  readonly tangent: THREE.Vector3;
  readonly up: THREE.Vector3;
  readonly right: THREE.Vector3;
  readonly pitchRad?: number;
}

export interface SolveSegmentsOptions {
  readonly startFrame: SolverFrame;
  readonly targetFrame: SolverFrame;
  readonly segments: readonly CourseSegmentConfig[];
  readonly stepLength: number;
  readonly bankBlendLength: number;
  readonly slopeBlendLength: number;
  readonly maxIterations?: number;
  readonly posToleranceM?: number;
  readonly yawToleranceDeg?: number;
  readonly pitchToleranceDeg?: number;
  readonly maxSlopeDeg?: number;
  readonly minStraightLength?: number;
  readonly maxStraightLength?: number;
  readonly minCurveAngleDeg?: number;
  readonly maxCurveAngleDeg?: number;
  readonly errorLabel?: string;
}

export interface SolveSegmentsResult {
  readonly segments: CourseSegmentConfig[];
  readonly report: ClosureReport;
}

export interface SolveClosureOptions {
  readonly startPosition: { readonly x: number; readonly y: number; readonly z: number };
  readonly startHeadingDeg: number;
  readonly stepLength: number;
  readonly bankBlendLength: number;
  readonly slopeBlendLength: number;
  readonly maxIterations?: number;
  readonly posToleranceM?: number;
  readonly yawToleranceDeg?: number;
  readonly maxSlopeDeg?: number;
  readonly minStraightLength?: number;
  readonly maxStraightLength?: number;
  readonly minCurveAngleDeg?: number;
  readonly maxCurveAngleDeg?: number;
}

export interface SolveClosureResult {
  readonly segments: CourseSegmentConfig[];
  readonly report: ClosureReport;
}

interface AdjustVar {
  readonly segmentIndex: number;
  readonly type: 'straight' | 'curve' | 'slope' | 'pitchTo';
  readonly field: 'length' | 'angleDeg' | 'pitchDeg';
  readonly originalValue: number;
  readonly minValue: number;
  readonly maxValue: number;
  readonly stepEpsilon: number;
  value: number;
}

interface SimResult {
  dx: number;
  dy: number;
  dz: number;
  dYawRad: number;
  dPitchRad: number;
  totalLength: number;
}

const _cross = new THREE.Vector3();
const _rotOut = new THREE.Vector3();

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

function smoothstep01(t: number): number {
  const c = THREE.MathUtils.clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

function orthonormalize(
  tangent: THREE.Vector3,
  baseUp: THREE.Vector3,
  baseRight: THREE.Vector3,
): void {
  tangent.normalize();
  baseUp.addScaledVector(tangent, -baseUp.dot(tangent)).normalize();
  baseRight.crossVectors(tangent, baseUp).normalize();
  baseUp.crossVectors(baseRight, tangent).normalize();
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
  pos: THREE.Vector3,
  tangent: THREE.Vector3,
  baseUp: THREE.Vector3,
  baseRight: THREE.Vector3,
  radius: number,
  lateralOffset: number,
  stepLength: number,
): number {
  if (Math.abs(lateralOffset) < 1e-4) {
    return 0;
  }
  const measureLateral = (amp: number): number => {
    const endPos = simulateLoopEndpoint(pos, tangent, baseUp, baseRight, radius, stepLength, amp);
    return endPos.sub(pos).dot(baseRight);
  };
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

function simulateSegmentsEndpoint(
  segments: readonly CourseSegmentConfig[],
  options: SolveSegmentsOptions,
): SimResult {
  const startT = options.startFrame.tangent.clone().normalize();
  const startU = options.startFrame.up.clone();
  const startR = options.startFrame.right.clone();
  orthonormalize(startT, startU, startR);

  const targetT = options.targetFrame.tangent.clone().normalize();
  const targetU = options.targetFrame.up.clone();
  const targetR = options.targetFrame.right.clone();
  orthonormalize(targetT, targetU, targetR);

  const pos = options.startFrame.position.clone();
  const tangent = startT.clone();
  const baseUp = startU.clone();
  const baseRight = startR.clone();
  let s = 0;
  let pitchRad =
    options.startFrame.pitchRad ?? Math.asin(THREE.MathUtils.clamp(startT.y, -1, 1));
  const targetPitchRad =
    options.targetFrame.pitchRad ?? Math.asin(THREE.MathUtils.clamp(targetT.y, -1, 1));

  for (let segIdx = 0; segIdx < segments.length; segIdx++) {
    const seg = segments[segIdx];
    if (seg.type === 'straight') {
      const steps = Math.max(1, Math.round(seg.length / options.stepLength));
      const ds = seg.length / steps;
      pos.addScaledVector(tangent, ds * steps);
      s += ds * steps;
    } else if (seg.type === 'curve') {
      const angleRad = THREE.MathUtils.degToRad(seg.angleDeg);
      const arcLength = Math.abs(angleRad) * seg.radius;
      const steps = Math.max(2, Math.round(arcLength / options.stepLength));
      const ds = arcLength / steps;
      const dYaw = angleRad / steps;
      for (let i = 1; i <= steps; i++) {
        rotateRodrigues(tangent, baseUp, -dYaw, _rotOut);
        tangent.copy(_rotOut);
        rotateRodrigues(baseRight, baseUp, -dYaw, _rotOut);
        baseRight.copy(_rotOut);
        orthonormalize(tangent, baseUp, baseRight);
        pos.addScaledVector(tangent, ds);
        s += ds;
      }
    } else if (seg.type === 'slope') {
      const steps = Math.max(2, Math.round(seg.length / options.stepLength));
      const ds = seg.length / steps;
      const basePitch = pitchRad;
      const peakOffset = THREE.MathUtils.degToRad(seg.pitchDeg);
      const blendLen = Math.min(options.slopeBlendLength, seg.length * 0.45);
      const evalPitch = (dLocal: number): number => {
        if (blendLen <= 1e-4) return basePitch + peakOffset;
        if (dLocal < blendLen) return basePitch + peakOffset * smoothstep01(dLocal / blendLen);
        if (dLocal > seg.length - blendLen) {
          return (
            basePitch +
            peakOffset * (1 - smoothstep01((dLocal - (seg.length - blendLen)) / blendLen))
          );
        }
        return basePitch + peakOffset;
      };
      let prevPitch = basePitch;
      for (let i = 1; i <= steps; i++) {
        const nextPitch = evalPitch(i * ds);
        const dPitch = nextPitch - prevPitch;
        prevPitch = nextPitch;
        rotateRodrigues(tangent, baseRight, dPitch, _rotOut);
        tangent.copy(_rotOut);
        rotateRodrigues(baseUp, baseRight, dPitch, _rotOut);
        baseUp.copy(_rotOut);
        orthonormalize(tangent, baseUp, baseRight);
        pos.addScaledVector(tangent, ds);
        s += ds;
      }
      pitchRad = prevPitch;
    } else if (seg.type === 'pitchTo' || seg.type === 'gap') {
      const steps = Math.max(2, Math.round(seg.length / options.stepLength));
      const ds = seg.length / steps;
      const startPitch = pitchRad;
      const targetPitch = THREE.MathUtils.degToRad(
        seg.type === 'pitchTo' ? seg.pitchDeg : seg.exitPitchDeg,
      );
      let prevPitch = startPitch;
      for (let i = 1; i <= steps; i++) {
        const nextPitch = THREE.MathUtils.lerp(startPitch, targetPitch, smoothstep01(i / steps));
        const dPitch = nextPitch - prevPitch;
        prevPitch = nextPitch;
        rotateRodrigues(tangent, baseRight, dPitch, _rotOut);
        tangent.copy(_rotOut);
        rotateRodrigues(baseUp, baseRight, dPitch, _rotOut);
        baseUp.copy(_rotOut);
        orthonormalize(tangent, baseUp, baseRight);
        pos.addScaledVector(tangent, ds);
        s += ds;
      }
      pitchRad = targetPitch;
    } else if (seg.type === 'loop') {
      const circumference = 2 * Math.PI * seg.radius;
      const steps = Math.max(16, Math.round(circumference / options.stepLength));
      const ds = circumference / steps;
      const dPitch = (2 * Math.PI) / steps;
      const yawAxis = baseUp.clone();
      const yawAmp = solveLoopYawAmplitude(
        pos,
        tangent,
        baseUp,
        baseRight,
        seg.radius,
        seg.lateralOffset,
        options.stepLength,
      );
      let prevPsi = 0;
      for (let i = 1; i <= steps; i++) {
        const sinHalf = Math.sin(Math.PI * (i / steps));
        const psi = -yawAmp * sinHalf * sinHalf;
        const dPsi = psi - prevPsi;
        prevPsi = psi;

        rotateRodrigues(tangent, yawAxis, -dPsi, _rotOut);
        tangent.copy(_rotOut);
        rotateRodrigues(baseUp, yawAxis, -dPsi, _rotOut);
        baseUp.copy(_rotOut);
        rotateRodrigues(baseRight, yawAxis, -dPsi, _rotOut);
        baseRight.copy(_rotOut);

        rotateRodrigues(tangent, baseRight, dPitch, _rotOut);
        tangent.copy(_rotOut);
        rotateRodrigues(baseUp, baseRight, dPitch, _rotOut);
        baseUp.copy(_rotOut);
        orthonormalize(tangent, baseUp, baseRight);

        pos.addScaledVector(tangent, ds);
        s += ds;
      }
    }
  }

  const dx = pos.x - options.targetFrame.position.x;
  const dy = pos.y - options.targetFrame.position.y;
  const dz = pos.z - options.targetFrame.position.z;
  const dYawRad = Math.atan2(tangent.dot(targetR), tangent.dot(targetT));
  const dPitchRad = Math.asin(THREE.MathUtils.clamp(tangent.y, -1, 1)) - targetPitchRad;

  return {
    dx,
    dy,
    dz,
    dYawRad,
    dPitchRad,
    totalLength: s,
  };
}

function solveLinearSystem(matrix: number[][], rhs: number[]): number[] | null {
  const n = rhs.length;
  const a = matrix.map((row) => [...row]);
  const b = [...rhs];

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let pivotVal = Math.abs(a[col][col]);
    for (let row = col + 1; row < n; row++) {
      const cand = Math.abs(a[row][col]);
      if (cand > pivotVal) {
        pivotVal = cand;
        pivotRow = row;
      }
    }
    if (pivotVal < 1e-12) {
      return null;
    }
    if (pivotRow !== col) {
      [a[col], a[pivotRow]] = [a[pivotRow], a[col]];
      [b[col], b[pivotRow]] = [b[pivotRow], b[col]];
    }

    const diag = a[col][col];
    for (let row = col + 1; row < n; row++) {
      const factor = a[row][col] / diag;
      if (Math.abs(factor) < 1e-15) continue;
      for (let k = col; k < n; k++) {
        a[row][k] -= factor * a[col][k];
      }
      b[row] -= factor * b[col];
    }
  }

  const x = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = b[row];
    for (let col = row + 1; col < n; col++) {
      sum -= a[row][col] * x[col];
    }
    x[row] = sum / a[row][row];
  }
  return x;
}

function cloneSegmentsWithVars(
  baseSegments: readonly CourseSegmentConfig[],
  vars: readonly AdjustVar[],
): CourseSegmentConfig[] {
  const out: CourseSegmentConfig[] = baseSegments.map((seg) => ({ ...seg }));
  for (const v of vars) {
    const seg = out[v.segmentIndex];
    if (v.type === 'straight' && seg.type === 'straight') {
      out[v.segmentIndex] = { ...seg, length: v.value };
    } else if (v.type === 'curve' && seg.type === 'curve') {
      out[v.segmentIndex] = { ...seg, angleDeg: v.value };
    } else if (v.type === 'slope' && seg.type === 'slope') {
      out[v.segmentIndex] = { ...seg, pitchDeg: v.value };
    } else if (v.type === 'pitchTo' && seg.type === 'pitchTo') {
      out[v.segmentIndex] = { ...seg, pitchDeg: v.value };
    }
  }
  return out;
}

export function solveSegments(options: SolveSegmentsOptions): SolveSegmentsResult {
  const baseSegments = options.segments;
  const maxIterations = options.maxIterations ?? 200;
  const posToleranceM = options.posToleranceM ?? 0.02;
  const yawToleranceDeg = options.yawToleranceDeg ?? 0.05;
  const pitchToleranceDeg = options.pitchToleranceDeg ?? Number.POSITIVE_INFINITY;
  const maxSlopeDeg = options.maxSlopeDeg ?? 22;
  const minStraight = options.minStraightLength ?? 20;
  const maxStraight = options.maxStraightLength ?? 600;
  const minCurveAngle = options.minCurveAngleDeg ?? 5;
  const maxCurveAngle = options.maxCurveAngleDeg ?? 175;
  const errorLabel = options.errorLabel ?? 'Sirkuit tertutup';

  const vars: AdjustVar[] = [];
  for (let i = 0; i < baseSegments.length; i++) {
    const seg = baseSegments[i];
    if (seg.type === 'straight' && seg.adjust) {
      vars.push({
        segmentIndex: i,
        type: 'straight',
        field: 'length',
        originalValue: seg.length,
        minValue: minStraight,
        maxValue: maxStraight,
        stepEpsilon: 1e-3,
        value: seg.length,
      });
    } else if (seg.type === 'curve' && seg.adjust) {
      const sign = seg.angleDeg < 0 ? -1 : 1;
      vars.push({
        segmentIndex: i,
        type: 'curve',
        field: 'angleDeg',
        originalValue: seg.angleDeg,
        minValue: sign > 0 ? minCurveAngle : -maxCurveAngle,
        maxValue: sign > 0 ? maxCurveAngle : -minCurveAngle,
        stepEpsilon: 1e-3,
        value: seg.angleDeg,
      });
    } else if (seg.type === 'slope' && seg.adjust) {
      vars.push({
        segmentIndex: i,
        type: 'slope',
        field: 'pitchDeg',
        originalValue: seg.pitchDeg,
        minValue: -maxSlopeDeg,
        maxValue: maxSlopeDeg,
        stepEpsilon: 1e-3,
        value: seg.pitchDeg,
      });
    } else if (seg.type === 'pitchTo' && seg.adjust) {
      vars.push({
        segmentIndex: i,
        type: 'pitchTo',
        field: 'pitchDeg',
        originalValue: seg.pitchDeg,
        minValue: -maxSlopeDeg,
        maxValue: maxSlopeDeg,
        stepEpsilon: 1e-3,
        value: seg.pitchDeg,
      });
    }
  }

  const YAW_WEIGHT = 120;
  const PITCH_WEIGHT = 120;
  const residualVec = (sim: SimResult): number[] => [
    sim.dx,
    sim.dy,
    sim.dz,
    sim.dYawRad * YAW_WEIGHT,
    sim.dPitchRad * PITCH_WEIGHT,
  ];
  const costOf = (r: readonly number[]): number =>
    0.5 * (r[0] * r[0] + r[1] * r[1] + r[2] * r[2] + r[3] * r[3] + r[4] * r[4]);

  let currentSegments = cloneSegmentsWithVars(baseSegments, vars);
  let currentSim = simulateSegmentsEndpoint(currentSegments, options);
  let currentR = residualVec(currentSim);
  let currentCost = costOf(currentR);
  let iterations = 0;

  if (vars.length > 0) {
    let lambda = 1e-3;
    const m = currentR.length;
    const n = vars.length;

    for (let iter = 0; iter < maxIterations; iter++) {
      const posErr = Math.hypot(currentSim.dx, currentSim.dy, currentSim.dz);
      const yawErrDeg = Math.abs(THREE.MathUtils.radToDeg(currentSim.dYawRad));
      const pitchErrDeg = Math.abs(THREE.MathUtils.radToDeg(currentSim.dPitchRad));
      if (posErr <= 1e-4 && yawErrDeg <= 1e-4 && pitchErrDeg <= 1e-4) {
        break;
      }

      iterations = iter + 1;
      const J: number[][] = Array.from({ length: m }, () => new Array<number>(n).fill(0));

      for (let col = 0; col < n; col++) {
        const orig = vars[col].value;
        const eps = vars[col].stepEpsilon;
        vars[col].value = THREE.MathUtils.clamp(orig + eps, vars[col].minValue, vars[col].maxValue);
        const forwardDelta = vars[col].value - orig;
        const usedEps =
          Math.abs(forwardDelta) > eps * 0.25
            ? forwardDelta
            : (() => {
                vars[col].value = THREE.MathUtils.clamp(
                  orig - eps,
                  vars[col].minValue,
                  vars[col].maxValue,
                );
                return vars[col].value - orig;
              })();

        const perturbedSegs = cloneSegmentsWithVars(baseSegments, vars);
        const perturbedSim = simulateSegmentsEndpoint(perturbedSegs, options);
        const perturbedR = residualVec(perturbedSim);
        vars[col].value = orig;

        if (Math.abs(usedEps) > 1e-9) {
          for (let row = 0; row < m; row++) {
            J[row][col] = (perturbedR[row] - currentR[row]) / usedEps;
          }
        }
      }

      const jtj: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
      const negJtr = new Array<number>(n).fill(0);

      for (let i = 0; i < n; i++) {
        let g = 0;
        for (let row = 0; row < m; row++) {
          g += J[row][i] * currentR[row];
        }
        negJtr[i] = -g;
        for (let j = 0; j < n; j++) {
          let sum = 0;
          for (let row = 0; row < m; row++) {
            sum += J[row][i] * J[row][j];
          }
          jtj[i][j] = sum;
        }
      }

      let accepted = false;
      for (let tryCount = 0; tryCount < 8; tryCount++) {
        const damped = jtj.map((row, idx) =>
          row.map((val, jIdx) => (idx === jIdx ? val + lambda * Math.max(1, val) : val)),
        );
        const delta = solveLinearSystem(damped, negJtr);
        if (!delta) {
          lambda *= 10;
          continue;
        }

        const candValues = vars.map((v, idx) =>
          THREE.MathUtils.clamp(v.value + delta[idx], v.minValue, v.maxValue),
        );
        const saved = vars.map((v) => v.value);
        vars.forEach((v, idx) => {
          v.value = candValues[idx];
        });

        const candSegs = cloneSegmentsWithVars(baseSegments, vars);
        const candSim = simulateSegmentsEndpoint(candSegs, options);
        const candR = residualVec(candSim);
        const candCost = costOf(candR);

        if (candCost < currentCost) {
          currentSegments = candSegs;
          currentSim = candSim;
          currentR = candR;
          currentCost = candCost;
          lambda = Math.max(1e-7, lambda * 0.35);
          accepted = true;
          break;
        } else {
          vars.forEach((v, idx) => {
            v.value = saved[idx];
          });
          lambda *= 5;
        }
      }

      if (!accepted && lambda > 1e8) {
        break;
      }
    }
  }

  const posErrorM = Math.hypot(currentSim.dx, currentSim.dy, currentSim.dz);
  const dYawDeg = THREE.MathUtils.radToDeg(currentSim.dYawRad);
  const dPitchDeg = THREE.MathUtils.radToDeg(currentSim.dPitchRad);
  const converged =
    posErrorM <= posToleranceM &&
    Math.abs(dYawDeg) <= yawToleranceDeg &&
    Math.abs(dPitchDeg) <= pitchToleranceDeg;

  const adjustments: ClosureAdjustment[] = vars.map((v) => ({
    segmentIndex: v.segmentIndex,
    type: v.type,
    field: v.field,
    originalValue: v.originalValue,
    solvedValue: Number(v.value.toFixed(4)),
  }));

  if (!converged) {
    const adjSummary =
      adjustments.length > 0
        ? adjustments
            .map(
              (a) =>
                `seg#${a.segmentIndex + 1} (${a.type}.${a.field}: ${a.originalValue} -> ${a.solvedValue})`,
            )
            .join(', ')
        : 'tidak ada segmen dengan adjust: true';
    throw new Error(
      `[CourseClosure] ${errorLabel} gagal konvergen setelah ${iterations} iterasi. ` +
        `Sisa posisi=(${currentSim.dx.toFixed(3)}, ${currentSim.dy.toFixed(3)}, ${currentSim.dz.toFixed(3)}) m ` +
        `(total ${posErrorM.toFixed(3)} m > toleransi ${posToleranceM} m), ` +
        `dYaw=${dYawDeg.toFixed(3)}° (toleransi ±${yawToleranceDeg}°), ` +
        `dPitch=${dPitchDeg.toFixed(3)}°. ` +
        `Segmen adjust: ${adjSummary}.`,
    );
  }

  return {
    segments: currentSegments,
    report: {
      converged,
      iterations,
      posErrorM,
      dx: currentSim.dx,
      dy: currentSim.dy,
      dz: currentSim.dz,
      dYawDeg,
      dPitchDeg,
      totalLengthM: currentSim.totalLength,
      adjustments,
      blendApplied: false,
      blendLengthM: 0,
    },
  };
}

export function solveClosure(
  baseSegments: readonly CourseSegmentConfig[],
  options: SolveClosureOptions,
): SolveClosureResult {
  const headingRad = THREE.MathUtils.degToRad(options.startHeadingDeg);
  const startT = new THREE.Vector3(Math.sin(headingRad), 0, -Math.cos(headingRad)).normalize();
  const startU = new THREE.Vector3(0, 1, 0);
  const startR = new THREE.Vector3().crossVectors(startT, startU).normalize();
  const startFrame: SolverFrame = {
    position: new THREE.Vector3(
      options.startPosition.x,
      options.startPosition.y,
      options.startPosition.z,
    ),
    tangent: startT,
    up: startU,
    right: startR,
    pitchRad: 0,
  };

  return solveSegments({
    startFrame,
    targetFrame: startFrame,
    segments: baseSegments,
    stepLength: options.stepLength,
    bankBlendLength: options.bankBlendLength,
    slopeBlendLength: options.slopeBlendLength,
    maxIterations: options.maxIterations,
    posToleranceM: options.posToleranceM,
    yawToleranceDeg: options.yawToleranceDeg,
    maxSlopeDeg: options.maxSlopeDeg,
    minStraightLength: options.minStraightLength,
    maxStraightLength: options.maxStraightLength,
    minCurveAngleDeg: options.minCurveAngleDeg,
    maxCurveAngleDeg: options.maxCurveAngleDeg,
    errorLabel: 'Sirkuit tertutup',
  });
}
