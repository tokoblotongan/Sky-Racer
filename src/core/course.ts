// src/core/course.ts

import * as THREE from 'three';
import type { CourseControlPointConfig } from '../config';

export interface TrackFrame {
  s: number;
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  up: THREE.Vector3;
  right: THREE.Vector3;
  width: number;
  bank: number;
}

interface InternalSample {
  s: number;
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  baseUp: THREE.Vector3;
  baseRight: THREE.Vector3;
  up: THREE.Vector3;
  right: THREE.Vector3;
  width: number;
  bank: number;
}

export interface CourseBounds {
  center: THREE.Vector3;
  radius: number;
  min: THREE.Vector3;
  max: THREE.Vector3;
}

export interface CourseConfig {
  controlPoints: readonly CourseControlPointConfig[];
  defaultWidth: number;
  samplesPerMeter: number;
  curveDivisionsPerPoint: number;
}

const _worldUp = new THREE.Vector3(0, 1, 0);
const _fallbackUp = new THREE.Vector3(0, 0, 1);
const _quat = new THREE.Quaternion();
const _tmpVec = new THREE.Vector3();

function smoothstep01(t: number): number {
  const c = THREE.MathUtils.clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

function findControlPointArcPositions(
  curve: THREE.CatmullRomCurve3,
  points: readonly THREE.Vector3[],
): number[] {
  const count = points.length;
  const uList: number[] = new Array<number>(count);
  uList[0] = 0;
  uList[count - 1] = 1;

  const probeSteps = Math.max(240, count * 40);
  let startStep = 0;

  for (let i = 1; i < count - 1; i++) {
    const target = points[i];
    let bestStep = startStep;
    let bestDistSq = Infinity;

    const maxStep = probeSteps - (count - 1 - i);
    for (let step = startStep + 1; step <= maxStep; step++) {
      const u = step / probeSteps;
      curve.getPointAt(u, _tmpVec);
      const distSq = _tmpVec.distanceToSquared(target);
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestStep = step;
      }
    }

    // Refine locally around bestStep
    let low = Math.max(uList[i - 1] + 1e-4, (bestStep - 1) / probeSteps);
    let high = Math.min(0.9999, (bestStep + 1) / probeSteps);
    for (let iter = 0; iter < 12; iter++) {
      const m1 = low + (high - low) / 3;
      const m2 = high - (high - low) / 3;
      curve.getPointAt(m1, _tmpVec);
      const d1 = _tmpVec.distanceToSquared(target);
      curve.getPointAt(m2, _tmpVec);
      const d2 = _tmpVec.distanceToSquared(target);
      if (d1 < d2) {
        high = m2;
      } else {
        low = m1;
      }
    }

    uList[i] = (low + high) * 0.5;
    startStep = bestStep;
  }

  return uList;
}

function interpolateControlScalar(
  u: number,
  uKnots: readonly number[],
  values: readonly number[],
): number {
  if (u <= uKnots[0]) {
    return values[0];
  }
  const last = uKnots.length - 1;
  if (u >= uKnots[last]) {
    return values[last];
  }

  let seg = 0;
  for (let i = 0; i < last; i++) {
    if (u >= uKnots[i] && u <= uKnots[i + 1]) {
      seg = i;
      break;
    }
  }

  const span = uKnots[seg + 1] - uKnots[seg];
  const localT = span > 1e-6 ? (u - uKnots[seg]) / span : 0;
  const smoothT = smoothstep01(localT);
  return THREE.MathUtils.lerp(values[seg], values[seg + 1], smoothT);
}

export class Course {
  private readonly curve: THREE.CatmullRomCurve3;
  private readonly totalLength: number;
  private readonly samples: InternalSample[];
  private readonly sampleStepS: number;
  private readonly framesView: TrackFrame[];
  private readonly bounds: CourseBounds;

  constructor(config: CourseConfig) {
    if (config.controlPoints.length < 2) {
      throw new Error('Course requires at least 2 control points.');
    }

    const controlVectors = config.controlPoints.map(
      (pt) => new THREE.Vector3(pt.x, pt.y, pt.z),
    );
    const bankRadians = config.controlPoints.map((pt) =>
      THREE.MathUtils.degToRad(pt.bankDeg),
    );
    const widths = config.controlPoints.map((pt) => pt.width ?? config.defaultWidth);

    this.curve = new THREE.CatmullRomCurve3(controlVectors, false, 'centripetal', 0.5);
    this.curve.arcLengthDivisions = Math.max(
      400,
      controlVectors.length * config.curveDivisionsPerPoint,
    );
    this.totalLength = this.curve.getLength();

    const uKnots = findControlPointArcPositions(this.curve, controlVectors);
    const sampleCount = Math.max(2, Math.ceil(this.totalLength * config.samplesPerMeter) + 1);
    this.sampleStepS = this.totalLength / (sampleCount - 1);
    this.samples = new Array<InternalSample>(sampleCount);
    this.framesView = new Array<TrackFrame>(sampleCount);

    const minBound = new THREE.Vector3(Infinity, Infinity, Infinity);
    const maxBound = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

    for (let i = 0; i < sampleCount; i++) {
      const u = i / (sampleCount - 1);
      const s = u * this.totalLength;
      const position = this.curve.getPointAt(u);
      const tangent = this.curve.getTangentAt(u).normalize();

      const baseUp = new THREE.Vector3();
      const baseRight = new THREE.Vector3();

      if (i === 0) {
        const refUp = Math.abs(tangent.dot(_worldUp)) > 0.96 ? _fallbackUp : _worldUp;
        baseUp.copy(refUp).addScaledVector(tangent, -refUp.dot(tangent)).normalize();
        baseRight.crossVectors(tangent, baseUp).normalize();
        baseUp.crossVectors(baseRight, tangent).normalize();
      } else {
        const prev = this.samples[i - 1];
        _quat.setFromUnitVectors(prev.tangent, tangent);
        baseUp.copy(prev.baseUp).applyQuaternion(_quat);
        baseUp.addScaledVector(tangent, -baseUp.dot(tangent)).normalize();
        baseRight.crossVectors(tangent, baseUp).normalize();
        baseUp.crossVectors(baseRight, tangent).normalize();
      }

      const bank = interpolateControlScalar(u, uKnots, bankRadians);
      const width = interpolateControlScalar(u, uKnots, widths);

      const cosB = Math.cos(bank);
      const sinB = Math.sin(bank);
      const right = new THREE.Vector3()
        .addScaledVector(baseRight, cosB)
        .addScaledVector(baseUp, sinB)
        .normalize();
      const up = new THREE.Vector3()
        .addScaledVector(baseUp, cosB)
        .addScaledVector(baseRight, -sinB)
        .normalize();

      this.samples[i] = {
        s,
        position,
        tangent,
        baseUp,
        baseRight,
        up,
        right,
        width,
        bank,
      };

      this.framesView[i] = {
        s,
        position,
        tangent,
        up,
        right,
        width,
        bank,
      };

      minBound.min(position);
      maxBound.max(position);
    }

    const center = new THREE.Vector3().addVectors(minBound, maxBound).multiplyScalar(0.5);
    let maxRadiusSq = 0;
    for (const sample of this.samples) {
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
    return this.framesView;
  }

  getFrameAt(s: number, out?: TrackFrame): TrackFrame {
    const clampedS = this.clampDistance(s);
    const maxIndex = this.samples.length - 1;
    const exactIndex = clampedS / this.sampleStepS;
    const idx0 = Math.min(Math.floor(exactIndex), maxIndex);
    const idx1 = Math.min(idx0 + 1, maxIndex);
    const alpha = idx0 === idx1 ? 0 : exactIndex - idx0;

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

    return target;
  }
}
