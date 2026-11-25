// src/render/carGeometry.ts

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  CAR_DESIGNS,
  type CarDesignId,
  type CarDesignSpec,
  type CrossSectionStation,
} from './carDesigns';

export interface WheelDetailOptions {
  spokeCount?: number;
  tireThicknessRatio?: number;
}

export interface WheelGeomSet {
  tireGeom: THREE.BufferGeometry;
  rimGeom: THREE.BufferGeometry;
  spokeGeom: THREE.BufferGeometry;
  hubGeom: THREE.BufferGeometry;
  discGeom: THREE.BufferGeometry;
  caliperGeom: THREE.BufferGeometry;
}

export interface CabinGeomSet {
  roofGeom: THREE.BufferGeometry;
  glassGeom: THREE.BufferGeometry;
  trimGeom: THREE.BufferGeometry;
}

export interface ArchGeomSet {
  flareGeom: THREE.BufferGeometry;
  wellGeom: THREE.BufferGeometry;
}

export interface CarDetailsGeomSet {
  headlightGeom: THREE.BufferGeometry;
  grilleGeom: THREE.BufferGeometry;
  splitterGeom: THREE.BufferGeometry;
  mirrorGeom: THREE.BufferGeometry;
  diffuserGeom: THREE.BufferGeometry;
  exhaustPipeGeom: THREE.BufferGeometry;
  exhaustCoreGeom: THREE.BufferGeometry;
  exhaustHaloGeom: THREE.BufferGeometry;
  spoilerBodyGeom: THREE.BufferGeometry;
  spoilerAccentGeom: THREE.BufferGeometry;
  taillightGeom: THREE.BufferGeometry;
  underglowGeom: THREE.BufferGeometry;
}

export interface CarGeometryBundle {
  design: CarDesignSpec;
  bodyGeom: THREE.BufferGeometry;
  cabin: CabinGeomSet;
  wheels: {
    front: WheelGeomSet;
    rear: WheelGeomSet;
  };
  arch: ArchGeomSet;
  details: CarDetailsGeomSet;
  triangleCount: number;
}

interface InterpolatedStation {
  zNorm: number;
  zWorld: number;
  halfWidth: number;
  bottomY: number;
  shoulderY: number;
  roofY: number;
  cornerRoundness: number;
  cabinInset: number;
}

const bundleCache = new Map<string, CarGeometryBundle>();

function countTriangles(geom: THREE.BufferGeometry): number {
  if (geom.index) {
    return geom.index.count / 3;
  }
  const pos = geom.getAttribute('position');
  return pos ? pos.count / 3 : 0;
}

function ensureUvAndNormal(geom: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geom.index ? geom.toNonIndexed() : geom;
  if (!g.getAttribute('normal')) {
    g.computeVertexNormals();
  }
  if (!g.getAttribute('uv')) {
    const count = g.getAttribute('position').count;
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  }
  return g;
}

function mergeSafe(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const prepared = geometries.map((g) => ensureUvAndNormal(g));
  const merged = mergeGeometries(prepared, false);
  for (const g of prepared) {
    if (!geometries.includes(g)) {
      g.dispose();
    }
  }
  for (const g of geometries) {
    g.dispose();
  }
  if (!merged) {
    throw new Error('Failed to merge car geometries.');
  }
  return merged;
}

function catmullRomScalar(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

function sampleStation(
  stations: readonly CrossSectionStation[],
  zNorm: number,
  length: number,
): InterpolatedStation {
  const clampedZ = THREE.MathUtils.clamp(zNorm, 0, 1);
  const lastIdx = stations.length - 1;

  if (clampedZ <= stations[0].z) {
    const s = stations[0];
    return {
      zNorm: clampedZ,
      zWorld: (clampedZ - 0.5) * length,
      halfWidth: s.halfWidth,
      bottomY: s.bottomY,
      shoulderY: s.shoulderY,
      roofY: s.roofY,
      cornerRoundness: s.cornerRoundness,
      cabinInset: s.cabinInset,
    };
  }
  if (clampedZ >= stations[lastIdx].z) {
    const s = stations[lastIdx];
    return {
      zNorm: clampedZ,
      zWorld: (clampedZ - 0.5) * length,
      halfWidth: s.halfWidth,
      bottomY: s.bottomY,
      shoulderY: s.shoulderY,
      roofY: s.roofY,
      cornerRoundness: s.cornerRoundness,
      cabinInset: s.cabinInset,
    };
  }

  let segIdx = 0;
  for (let i = 0; i < lastIdx; i++) {
    if (clampedZ >= stations[i].z && clampedZ <= stations[i + 1].z) {
      segIdx = i;
      break;
    }
  }

  const s0 = stations[Math.max(0, segIdx - 1)];
  const s1 = stations[segIdx];
  const s2 = stations[Math.min(lastIdx, segIdx + 1)];
  const s3 = stations[Math.min(lastIdx, segIdx + 2)];

  const span = Math.max(1e-5, s2.z - s1.z);
  const t = THREE.MathUtils.clamp((clampedZ - s1.z) / span, 0, 1);

  const halfWidth = Math.max(0.18, catmullRomScalar(s0.halfWidth, s1.halfWidth, s2.halfWidth, s3.halfWidth, t));
  const bottomY = Math.max(0.05, catmullRomScalar(s0.bottomY, s1.bottomY, s2.bottomY, s3.bottomY, t));
  const shoulderY = Math.max(
    bottomY + 0.08,
    catmullRomScalar(s0.shoulderY, s1.shoulderY, s2.shoulderY, s3.shoulderY, t),
  );
  const roofY = Math.max(
    shoulderY,
    catmullRomScalar(s0.roofY, s1.roofY, s2.roofY, s3.roofY, t),
  );
  const cornerRoundness = THREE.MathUtils.clamp(
    catmullRomScalar(s0.cornerRoundness, s1.cornerRoundness, s2.cornerRoundness, s3.cornerRoundness, t),
    2.0,
    5.0,
  );
  const cabinInset = THREE.MathUtils.clamp(
    catmullRomScalar(s0.cabinInset, s1.cabinInset, s2.cabinInset, s3.cabinInset, t),
    0.1,
    0.96,
  );

  return {
    zNorm: clampedZ,
    zWorld: (clampedZ - 0.5) * length,
    halfWidth,
    bottomY,
    shoulderY,
    roofY,
    cornerRoundness,
    cabinInset,
  };
}

function superellipsePoint(
  theta: number,
  halfWidth: number,
  bottomY: number,
  shoulderY: number,
  nTop: number,
  nBottom: number,
  deckCrown: number,
): { x: number; y: number } {
  const sinT = Math.sin(theta);
  const cosT = Math.cos(theta);
  const midY = (bottomY + shoulderY) * 0.5;
  const halfH = (shoulderY - bottomY) * 0.5;

  // theta=0 is bottom center (0,-1), theta=pi/2 is right (+1,0), theta=pi is top (0,+1), theta=3pi/2 is left (-1,0).
  const vSign = -cosT;
  const vExp = vSign >= 0 ? nTop : nBottom;
  const xScaled = Math.sign(sinT) * Math.pow(Math.abs(sinT), 2 / vExp) * halfWidth;
  const yNorm = Math.sign(vSign) * Math.pow(Math.abs(vSign), 2 / vExp);

  // Subtle hood/deck crown peaking along the top centerline (vSign > 0, |x| small)
  const crown = vSign > 0 ? deckCrown * Math.pow(vSign, 2.2) : 0;
  // Subtle lower rocker tuck-in near floor pan
  const rockerTuck = vSign < -0.25 ? 1 - 0.06 * Math.abs(vSign + 0.25) : 1;

  return {
    x: xScaled * rockerTuck,
    y: midY + yNorm * halfH + crown,
  };
}

function wheelCutoutFactor(
  zWorld: number,
  wheelZ: number,
  wheelRadius: number,
): number {
  const dz = Math.abs(zWorld - wheelZ);
  const cutoutHalfLen = wheelRadius * 1.14;
  if (dz >= cutoutHalfLen) {
    return 0;
  }
  const u = dz / cutoutHalfLen;
  // Smooth arch profile peaking at axle center
  return Math.sqrt(Math.max(0, 1 - u * u));
}

/**
 * Weld seam normals along closed superellipse rings (col 0 and col radialSegs share position)
 * so the bottom seam has completely smooth shading.
 */
function smoothClosedRingSeamNormals(
  geom: THREE.BufferGeometry,
  ringCount: number,
  radialSegs: number,
): void {
  geom.computeVertexNormals();
  const norm = geom.getAttribute('normal') as THREE.BufferAttribute;
  const stride = radialSegs + 1;
  for (let r = 0; r < ringCount; r++) {
    const i0 = r * stride;
    const iEnd = r * stride + radialSegs;
    const nx = norm.getX(i0) + norm.getX(iEnd);
    const ny = norm.getY(i0) + norm.getY(iEnd);
    const nz = norm.getZ(i0) + norm.getZ(iEnd);
    const len = Math.hypot(nx, ny, nz) || 1;
    norm.setXYZ(i0, nx / len, ny / len, nz / len);
    norm.setXYZ(iEnd, nx / len, ny / len, nz / len);
  }
  norm.needsUpdate = true;
}

export function buildLoftBody(design: CarDesignSpec): THREE.BufferGeometry {
  const bodySteps = 38;
  const radialSegs = 28;
  const stride = radialSegs + 1;

  interface RingSpec {
    zNorm: number;
    zWorld: number;
    halfWidth: number;
    bottomY: number;
    shoulderY: number;
    nTop: number;
    nBottom: number;
    deckCrown: number;
    scaleXY: number;
  }

  const rings: RingSpec[] = [];

  // Rounded front nose cap bevel rings (z=0 tapering forward slightly)
  const noseStation = sampleStation(design.stations, 0, design.length);
  const noseMidY = (noseStation.bottomY + noseStation.shoulderY) * 0.5;
  rings.push({
    zNorm: 0,
    zWorld: noseStation.zWorld - 0.032,
    halfWidth: noseStation.halfWidth * 0.35,
    bottomY: noseMidY - 0.015,
    shoulderY: noseMidY + 0.015,
    nTop: 2.2,
    nBottom: 2.2,
    deckCrown: 0,
    scaleXY: 1,
  });
  rings.push({
    zNorm: 0,
    zWorld: noseStation.zWorld - 0.018,
    halfWidth: noseStation.halfWidth * 0.74,
    bottomY: THREE.MathUtils.lerp(noseMidY, noseStation.bottomY, 0.7),
    shoulderY: THREE.MathUtils.lerp(noseMidY, noseStation.shoulderY, 0.7),
    nTop: 2.3,
    nBottom: 2.5,
    deckCrown: design.deckCrown * 0.25,
    scaleXY: 1,
  });

  for (let i = 0; i <= bodySteps; i++) {
    const zNorm = i / bodySteps;
    const st = sampleStation(design.stations, zNorm, design.length);
    rings.push({
      zNorm,
      zWorld: st.zWorld,
      halfWidth: st.halfWidth,
      bottomY: st.bottomY,
      shoulderY: st.shoulderY,
      nTop: st.cornerRoundness,
      nBottom: st.cornerRoundness + 1.8,
      deckCrown: design.deckCrown * (0.4 + 0.6 * Math.sin(zNorm * Math.PI)),
      scaleXY: 1,
    });
  }

  // Rounded rear tail cap bevel rings
  const tailStation = sampleStation(design.stations, 1, design.length);
  const tailMidY = (tailStation.bottomY + tailStation.shoulderY) * 0.52;
  rings.push({
    zNorm: 1,
    zWorld: tailStation.zWorld + 0.014,
    halfWidth: tailStation.halfWidth * 0.84,
    bottomY: THREE.MathUtils.lerp(tailMidY, tailStation.bottomY, 0.72),
    shoulderY: THREE.MathUtils.lerp(tailMidY, tailStation.shoulderY, 0.72),
    nTop: 2.4,
    nBottom: 2.8,
    deckCrown: design.deckCrown * 0.2,
    scaleXY: 1,
  });
  rings.push({
    zNorm: 1,
    zWorld: tailStation.zWorld + 0.025,
    halfWidth: tailStation.halfWidth * 0.42,
    bottomY: tailMidY - 0.02,
    shoulderY: tailMidY + 0.02,
    nTop: 2.2,
    nBottom: 2.2,
    deckCrown: 0,
    scaleXY: 1,
  });

  const ringCount = rings.length;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r < ringCount; r++) {
    const ring = rings[r];
    const fCut = wheelCutoutFactor(ring.zWorld, design.wheels.frontOffsetZ, design.wheels.frontRadius);
    const rCut = wheelCutoutFactor(ring.zWorld, design.wheels.rearOffsetZ, design.wheels.rearRadius);
    const archFactor = Math.max(fCut, rCut);

    for (let c = 0; c <= radialSegs; c++) {
      const v = c / radialSegs; // 0 = bottom center, 0.25 = right flank, 0.5 = top center, 0.75 = left flank, 1 = bottom center
      const theta = v * Math.PI * 2;
      const pt = superellipsePoint(
        theta,
        ring.halfWidth,
        ring.bottomY,
        ring.shoulderY,
        ring.nTop,
        ring.nBottom,
        ring.deckCrown,
      );

      let px = pt.x;
      let py = pt.y;

      // Smooth lower-flank wheel-well tuck so wheels spin/turn cleanly inside arch flares without body clipping
      if (archFactor > 0.01) {
        const isFront = fCut >= rCut;
        const maxArchY = isFront
          ? design.wheels.frontRadius * 1.15
          : design.wheels.rearRadius * 1.14;
        const trackLimit = (isFront ? design.wheels.frontTrackHalfWidth : design.wheels.rearTrackHalfWidth) -
          (isFront ? design.wheels.frontWidth : design.wheels.rearWidth) * 0.52;

        if (py < maxArchY && Math.abs(px) > trackLimit * 0.78) {
          const hBlend = THREE.MathUtils.clamp((maxArchY - py) / Math.max(0.08, maxArchY - ring.bottomY), 0, 1);
          const archTuck = archFactor * Math.pow(hBlend, 0.65);
          const targetX = Math.sign(px) * Math.min(Math.abs(px), trackLimit - 0.025);
          px = THREE.MathUtils.lerp(px, targetX, archTuck * 0.92);
          // Slight upward arch lift only on outermost lower edge
          const wBlend = THREE.MathUtils.clamp((Math.abs(pt.x) - trackLimit * 0.85) / 0.22, 0, 1);
          py = THREE.MathUtils.lerp(py, Math.max(py, maxArchY * 0.55), archTuck * wBlend * 0.35);
        }
      }

      positions.push(px, py, ring.zWorld);
      uvs.push(ring.zNorm, v);
    }
  }

  for (let r = 0; r < ringCount - 1; r++) {
    for (let c = 0; c < radialSegs; c++) {
      const a = r * stride + c;
      const b = a + 1;
      const cIdx = (r + 1) * stride + c;
      const d = cIdx + 1;

      indices.push(a, b, cIdx);
      indices.push(b, d, cIdx);
    }
  }

  // Close front & rear pole caps cleanly
  const frontCenterIdx = positions.length / 3;
  positions.push(0, noseMidY, noseStation.zWorld - 0.042);
  uvs.push(0, 0.5);
  for (let c = 0; c < radialSegs; c++) {
    indices.push(frontCenterIdx, c + 1, c);
  }

  const backCenterIdx = positions.length / 3;
  const lastRingStart = (ringCount - 1) * stride;
  positions.push(0, tailMidY, tailStation.zWorld + 0.032);
  uvs.push(1, 0.5);
  for (let c = 0; c < radialSegs; c++) {
    indices.push(backCenterIdx, lastRingStart + c, lastRingStart + c + 1);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  smoothClosedRingSeamNormals(geom, ringCount, radialSegs);
  return geom;
}

export function buildCabin(design: CarDesignSpec): CabinGeomSet {
  const steps = 16;
  const { startZ, endZ, topStartZ, topEndZ, roofCrown, pillarInset } = design.cabin;

  interface CabinSlice {
    zNorm: number;
    zWorld: number;
    baseHalfW: number;
    topHalfW: number;
    baseY: number;
    topY: number;
  }

  const slices: CabinSlice[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const zNorm = THREE.MathUtils.lerp(startZ, endZ, t);
    const st = sampleStation(design.stations, zNorm, design.length);

    // Base width sits well inside body shoulders; top tapers smoothly inward (tumblehome)
    const baseHalfW = st.halfWidth * (1 - st.cabinInset * 0.72);
    const tumblehome = 0.74 - 0.08 * Math.sin(t * Math.PI);
    const topHalfW = Math.max(0.24, baseHalfW * tumblehome);

    const baseY = st.shoulderY - 0.025; // Tuck cleanly inside body deck (zero gap)
    const rawRoof = st.roofY;
    // Smooth roof height curve from windshield base -> crown -> fastback deck
    let topY = rawRoof;
    if (zNorm < topStartZ) {
      const wt = THREE.MathUtils.smoothstep(zNorm, startZ, topStartZ);
      topY = THREE.MathUtils.lerp(st.shoulderY + 0.01, rawRoof, wt);
    } else if (zNorm > topEndZ) {
      const rt = THREE.MathUtils.smoothstep(zNorm, topEndZ, endZ);
      topY = THREE.MathUtils.lerp(rawRoof, st.shoulderY + 0.015, rt);
    }
    topY = Math.max(baseY + 0.02, topY);

    slices.push({
      zNorm,
      zWorld: st.zWorld,
      baseHalfW,
      topHalfW,
      baseY,
      topY,
    });
  }

  // 1. Dark glass greenhouse loft (left base -> left top -> crown -> right top -> right base)
  const glassCrossPts = 6; // 0: L-base, 1: L-shoulder, 2: L-roof, 3: center-roof, 4: R-roof, 5: R-shoulder, 6: R-base
  const glassCols = glassCrossPts + 1;
  const gPos: number[] = [];
  const gUv: number[] = [];
  const gIdx: number[] = [];

  for (let r = 0; r < slices.length; r++) {
    const s = slices[r];
    const crownY = s.topY + roofCrown * (s.topY > s.baseY + 0.08 ? 1 : 0.2);
    const midY = THREE.MathUtils.lerp(s.baseY, s.topY, 0.56);
    const midW = THREE.MathUtils.lerp(s.baseHalfW, s.topHalfW, 0.45);

    const ringPts: [number, number][] = [
      [-s.baseHalfW, s.baseY],
      [-midW, midY],
      [-s.topHalfW * 0.88, s.topY],
      [0, crownY],
      [s.topHalfW * 0.88, s.topY],
      [midW, midY],
      [s.baseHalfW, s.baseY],
    ];

    for (let c = 0; c < glassCols; c++) {
      gPos.push(ringPts[c][0], ringPts[c][1], s.zWorld);
      gUv.push(r / steps, c / glassCrossPts);
    }
  }

  for (let r = 0; r < slices.length - 1; r++) {
    for (let c = 0; c < glassCrossPts; c++) {
      const a = r * glassCols + c;
      const b = a + 1;
      const cIdx = (r + 1) * glassCols + c;
      const d = cIdx + 1;
      gIdx.push(a, cIdx, b);
      gIdx.push(b, cIdx, d);
    }
  }

  // Close front & rear ends of glass
  const fCap = gPos.length / 3;
  gPos.push(0, slices[0].baseY + 0.01, slices[0].zWorld);
  gUv.push(0, 0.5);
  for (let c = 0; c < glassCrossPts; c++) {
    gIdx.push(fCap, c, c + 1);
  }
  const bCap = gPos.length / 3;
  const lastRow = (slices.length - 1) * glassCols;
  gPos.push(0, slices[slices.length - 1].baseY + 0.01, slices[slices.length - 1].zWorld);
  gUv.push(1, 0.5);
  for (let c = 0; c < glassCrossPts; c++) {
    gIdx.push(bCap, lastRow + c + 1, lastRow + c);
  }

  const glassGeom = new THREE.BufferGeometry();
  glassGeom.setAttribute('position', new THREE.Float32BufferAttribute(gPos, 3));
  glassGeom.setAttribute('uv', new THREE.Float32BufferAttribute(gUv, 2));
  glassGeom.setIndex(gIdx);
  glassGeom.computeVertexNormals();

  // 2. Painted roof panel sitting slightly proud over the crown section (with aligned stripe UVs!)
  const roofSteps = 8;
  const roofCross = 6;
  const roofCols = roofCross + 1;
  const rPos: number[] = [];
  const rUv: number[] = [];
  const rIdx: number[] = [];
  const rZStart = THREE.MathUtils.lerp(startZ, topStartZ, 0.85);
  const rZEnd = THREE.MathUtils.lerp(topEndZ, endZ, 0.25);

  for (let r = 0; r <= roofSteps; r++) {
    const rt = r / roofSteps;
    const zNorm = THREE.MathUtils.lerp(rZStart, rZEnd, rt);
    const st = sampleStation(design.stations, zNorm, design.length);
    const baseHalfW = st.halfWidth * (1 - st.cabinInset * 0.72);
    const topHalfW = Math.max(0.22, baseHalfW * 0.72) * 0.86;
    const roofLift = 0.008;
    const edgeY = st.roofY + roofLift * 0.4;
    const centerY = st.roofY + roofCrown + roofLift;

    for (let c = 0; c < roofCols; c++) {
      const cx = (c / roofCross) * 2 - 1; // -1 .. +1
      const x = cx * topHalfW;
      const y = THREE.MathUtils.lerp(centerY, edgeY, cx * cx);
      rPos.push(x, y, st.zWorld);
      // Map v around 0.5 using same lateral scale as body (~0.5 + x / (2 * bodyWidth))
      const vBodyMatch = 0.5 + (x / Math.max(0.4, st.halfWidth)) * 0.24;
      rUv.push(zNorm, vBodyMatch);
    }
  }

  for (let r = 0; r < roofSteps; r++) {
    for (let c = 0; c < roofCross; c++) {
      const a = r * roofCols + c;
      const b = a + 1;
      const cIdx = (r + 1) * roofCols + c;
      const d = cIdx + 1;
      rIdx.push(a, cIdx, b);
      rIdx.push(b, cIdx, d);
    }
  }

  const roofGeom = new THREE.BufferGeometry();
  roofGeom.setAttribute('position', new THREE.Float32BufferAttribute(rPos, 3));
  roofGeom.setAttribute('uv', new THREE.Float32BufferAttribute(rUv, 2));
  roofGeom.setIndex(rIdx);
  roofGeom.computeVertexNormals();

  // 3. Dark pillar trim / window surround (A-pillars, B-pillars, C-pillars, beltline)
  const trimParts: THREE.BufferGeometry[] = [];
  const startSt = sampleStation(design.stations, startZ, design.length);
  const topStartSt = sampleStation(design.stations, topStartZ, design.length);
  const topEndSt = sampleStation(design.stations, topEndZ, design.length);
  const endSt = sampleStation(design.stations, endZ, design.length);

  const midZ = (topStartZ + topEndZ) * 0.5;
  const midSt = sampleStation(design.stations, midZ, design.length);

  for (const side of [-1, 1]) {
    // A-pillar beam
    const aStart = new THREE.Vector3(
      side * (startSt.halfWidth * (1 - startSt.cabinInset * 0.72) - pillarInset),
      startSt.shoulderY,
      startSt.zWorld,
    );
    const aEnd = new THREE.Vector3(
      side * (topStartSt.halfWidth * (1 - topStartSt.cabinInset * 0.72) * 0.65),
      topStartSt.roofY,
      topStartSt.zWorld,
    );
    const aVec = new THREE.Vector3().subVectors(aEnd, aStart);
    const aMesh = new THREE.BoxGeometry(0.032, 0.032, aVec.length());
    aMesh.lookAt(aVec);
    aMesh.translate(
      (aStart.x + aEnd.x) * 0.5,
      (aStart.y + aEnd.y) * 0.5 + 0.004,
      (aStart.z + aEnd.z) * 0.5,
    );
    trimParts.push(aMesh);

    // Thin B-pillar upright dividing front/rear side glass
    const bBot = new THREE.Vector3(
      side * (midSt.halfWidth * (1 - midSt.cabinInset * 0.72) * 0.94),
      midSt.shoulderY,
      midSt.zWorld,
    );
    const bTop = new THREE.Vector3(
      side * (midSt.halfWidth * (1 - midSt.cabinInset * 0.72) * 0.66),
      midSt.roofY,
      midSt.zWorld,
    );
    const bVec = new THREE.Vector3().subVectors(bTop, bBot);
    const bMesh = new THREE.BoxGeometry(0.026, 0.026, bVec.length());
    bMesh.lookAt(bVec);
    bMesh.translate(
      (bBot.x + bTop.x) * 0.5,
      (bBot.y + bTop.y) * 0.5,
      (bBot.z + bTop.z) * 0.5,
    );
    trimParts.push(bMesh);

    // C-pillar fastback beam
    const cStart = new THREE.Vector3(
      side * (topEndSt.halfWidth * (1 - topEndSt.cabinInset * 0.72) * 0.65),
      topEndSt.roofY,
      topEndSt.zWorld,
    );
    const cEnd = new THREE.Vector3(
      side * (endSt.halfWidth * (1 - endSt.cabinInset * 0.72) - pillarInset),
      endSt.shoulderY + 0.01,
      endSt.zWorld,
    );
    const cVec = new THREE.Vector3().subVectors(cEnd, cStart);
    const cMesh = new THREE.BoxGeometry(0.036, 0.032, cVec.length());
    cMesh.lookAt(cVec);
    cMesh.translate(
      (cStart.x + cEnd.x) * 0.5,
      (cStart.y + cEnd.y) * 0.5 + 0.004,
      (cStart.z + cEnd.z) * 0.5,
    );
    trimParts.push(cMesh);
  }

  return {
    roofGeom,
    glassGeom,
    trimGeom: mergeSafe(trimParts),
  };
}

function createSingleWheelGeomSet(
  radius: number,
  width: number,
  spokeCount: number,
  tireThicknessRatio: number,
  isLeft: boolean,
): WheelGeomSet {
  const halfW = width * 0.5;
  const rimRadius = radius * (1 - tireThicknessRatio);
  const latheSegs = 22;

  // 1. Rounded sidewall + crowned tread tire via LatheGeometry (lathe around Y, then rotateZ(PI/2) -> X axis)
  const tireProfile: THREE.Vector2[] = [
    new THREE.Vector2(rimRadius * 0.96, -halfW * 0.84),
    new THREE.Vector2(radius * 0.86, -halfW * 0.99),
    new THREE.Vector2(radius * 0.97, -halfW * 0.94),
    new THREE.Vector2(radius, -halfW * 0.62),
    new THREE.Vector2(radius * 1.005, 0),
    new THREE.Vector2(radius, halfW * 0.62),
    new THREE.Vector2(radius * 0.97, halfW * 0.94),
    new THREE.Vector2(radius * 0.86, halfW * 0.99),
    new THREE.Vector2(rimRadius * 0.96, halfW * 0.84),
    new THREE.Vector2(rimRadius * 0.96, -halfW * 0.84),
  ];
  const tireGeom = new THREE.LatheGeometry(tireProfile, latheSegs);
  tireGeom.rotateZ(Math.PI / 2);

  // 2. Stepped alloy barrel rim with deep outer lip
  const rimProfile: THREE.Vector2[] = [
    new THREE.Vector2(rimRadius * 0.66, -halfW * 0.72),
    new THREE.Vector2(rimRadius * 0.99, -halfW * 0.84),
    new THREE.Vector2(rimRadius * 1.02, -halfW * 0.74),
    new THREE.Vector2(rimRadius * 0.9, -halfW * 0.62),
    new THREE.Vector2(rimRadius * 0.9, halfW * 0.62),
    new THREE.Vector2(rimRadius * 1.02, halfW * 0.74),
    new THREE.Vector2(rimRadius * 0.99, halfW * 0.84),
    new THREE.Vector2(rimRadius * 0.66, halfW * 0.72),
  ];
  const rimGeom = new THREE.LatheGeometry(rimProfile, latheSegs);
  rimGeom.rotateZ(Math.PI / 2);

  // 3. Multi-spoke wheel face (5-7 tapered spokes mirrored slightly outward on outer wheel face)
  const spokes: THREE.BufferGeometry[] = [];
  const spokeLen = rimRadius * 0.82;
  const spokeThicknessX = width * 0.14;
  const faceDir = isLeft ? -1 : 1;
  const spokeFaceX = faceDir * halfW * 0.64;

  for (let i = 0; i < spokeCount; i++) {
    const angle = (i / spokeCount) * Math.PI * 2;
    const spoke = new THREE.BoxGeometry(spokeThicknessX, spokeLen, radius * 0.085);
    spoke.translate(0, spokeLen * 0.5 + rimRadius * 0.16, 0);
    // Dish taper slightly inward toward hub
    spoke.rotateX(angle);
    spoke.translate(spokeFaceX, 0, 0);
    spokes.push(spoke);
  }
  const spokeGeom = mergeSafe(spokes);

  // 4. Center lock / lug hub cap
  const hubGeom = new THREE.CylinderGeometry(rimRadius * 0.26, rimRadius * 0.28, width * 0.34, 12);
  hubGeom.rotateZ(Math.PI / 2);
  hubGeom.translate(faceDir * halfW * 0.56, 0, 0);

  // 5. Brake rotor disc visible behind spokes
  const discGeom = new THREE.CylinderGeometry(rimRadius * 0.72, rimRadius * 0.72, width * 0.16, 18);
  discGeom.rotateZ(Math.PI / 2);
  discGeom.translate(faceDir * halfW * 0.18, 0, 0);

  // 6. Stationary brake caliper (positioned at rear-upper quadrant of rotor)
  const caliperGeom = new THREE.BoxGeometry(width * 0.26, rimRadius * 0.32, rimRadius * 0.24);
  caliperGeom.rotateX(0.45);
  caliperGeom.translate(faceDir * halfW * 0.22, rimRadius * 0.46, rimRadius * 0.38);

  return {
    tireGeom,
    rimGeom,
    spokeGeom,
    hubGeom,
    discGeom,
    caliperGeom,
  };
}

export function buildWheelAssembly(
  design: CarDesignSpec,
  opts: WheelDetailOptions = {},
): { front: WheelGeomSet; rear: WheelGeomSet } {
  const spokeCount = THREE.MathUtils.clamp(Math.round(opts.spokeCount ?? 6), 5, 7);
  const tireThicknessRatio = THREE.MathUtils.clamp(opts.tireThicknessRatio ?? 0.34, 0.24, 0.44);

  // Wheel geometry is symmetric around X=0 with outer dish/caliper facing +X;
  // left side mirrors cleanly by rotating wheel mount Y = Math.PI or using faceDir.
  // Keeping right-facing (+X outer) on both geometries and rotating left steerPivot/mount 180° around Y?
  // Note: rotating a spinning wheel by PI around Y flips wheelSpin direction! Better to keep spinMesh unflipped and mirror outer face via faceDir, OR just build symmetric dual-dish + one caliper:
  // Actually front/rear sets are small enough (~1k tris each) OR we build symmetrical spoke/disc and place caliper inside car.ts on the outer face!
  // Let's keep spokeGeom & hubGeom dual-symmetric or right-facing: wait, right-facing (+X) is right wheels, left-facing (-X) is left wheels.
  // Even cleaner: build symmetric rim + tire + disc, and build spokes on BOTH faces? No, inner face is hidden in wheel well!
  // Wait: if we put spokes & hub at x = 0..±halfW? If we rotate `spinMesh`? No, if left wheel has a separate `spinMesh.rotation.y = Math.PI`, then `spinMesh.rotation.x = -state.wheelSpin` would spin backward!
  // Instead, if `rimHolder` inside `spinMesh` is rotated `Y = Math.PI` for left wheels, then `spinMesh.rotation.x = -state.wheelSpin` spins forward on BOTH sides AND shares 100% of the exact same `front` / `rear` `WheelGeomSet`!
  // Let's verify: spinMesh rotates around local X (`rotation.x = -wheelSpin`). Inside `spinMesh`, a child `wheelGeoGroup` rotated `rotation.y = Math.PI` flips `+X` to `-X` while `spinMesh.rotation.x` STILL rotates around the global axle X in the exact same forward direction!
  // And for `caliperMesh` (child of `steerPivot`, non-spinning), `caliperMesh.rotation.y = Math.PI` flips its `+X` offset to `-X` too! That halves wheel geometry memory & cache size!
  const front = createSingleWheelGeomSet(
    design.wheels.frontRadius,
    design.wheels.frontWidth,
    spokeCount,
    tireThicknessRatio,
    false,
  );
  const rear = createSingleWheelGeomSet(
    design.wheels.rearRadius,
    design.wheels.rearWidth,
    spokeCount,
    tireThicknessRatio,
    false,
  );

  return { front, rear };
}

function buildSingleArchFlareAndWell(
  cx: number,
  cz: number,
  wheelRadius: number,
  wheelWidth: number,
  flareCfg: CarDesignSpec['archFlare'],
  side: -1 | 1,
): { flare: THREE.BufferGeometry; well: THREE.BufferGeometry } {
  const outerR = wheelRadius * flareCfg.radiusScale;
  const innerR = outerR - flareCfg.thickness;
  const arcSegs = 14;
  const startAngle = -Math.PI * 0.08;
  const endAngle = Math.PI * 1.08;

  // Swept curved arch lip wrapping over the wheel
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];

  const profPts = 4; // 0: inner body edge, 1: outer upper ridge, 2: outer lower lip, 3: inner lip
  const xBase = side * (Math.abs(cx) - wheelWidth * 0.22);
  const xOuter = side * (Math.abs(cx) + wheelWidth * 0.44 + flareCfg.overhang * 0.75);

  for (let i = 0; i <= arcSegs; i++) {
    const t = i / arcSegs;
    const angle = THREE.MathUtils.lerp(startAngle, endAngle, t);
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    // Taper overhang down gently near bottom tips
    const tipFade = Math.sin(t * Math.PI);
    const xOut = THREE.MathUtils.lerp(xBase + side * 0.04, xOuter, 0.45 + 0.55 * tipFade);

    const ring: [number, number, number][] = [
      [xBase, Math.max(0.08, wheelRadius + sinA * outerR), cz - cosA * outerR],
      [xOut, Math.max(0.08, wheelRadius + sinA * outerR), cz - cosA * outerR],
      [xOut, Math.max(0.08, wheelRadius + sinA * innerR), cz - cosA * innerR],
      [xBase, Math.max(0.08, wheelRadius + sinA * innerR), cz - cosA * innerR],
    ];

    for (let p = 0; p < profPts; p++) {
      pos.push(ring[p][0], ring[p][1], ring[p][2]);
      uv.push(t, p / (profPts - 1));
    }
  }

  for (let i = 0; i < arcSegs; i++) {
    for (let p = 0; p < profPts - 1; p++) {
      const a = i * profPts + p;
      const b = a + 1;
      const c = (i + 1) * profPts + p;
      const d = c + 1;
      if (side > 0) {
        idx.push(a, c, b);
        idx.push(b, c, d);
      } else {
        idx.push(a, b, c);
        idx.push(b, d, c);
      }
    }
  }

  const flare = new THREE.BufferGeometry();
  flare.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  flare.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  flare.setIndex(idx);
  flare.computeVertexNormals();

  // Solid dark wheel-well backing drum tucked behind tire & strictly below fender crown
  const wellRadius = wheelRadius * 0.97;
  const well = new THREE.CylinderGeometry(
    wellRadius,
    wellRadius,
    wheelWidth * 0.52,
    16,
  );
  well.rotateZ(Math.PI / 2);
  well.translate(side * (Math.abs(cx) - wheelWidth * 0.34), wheelRadius * 0.92, cz);

  return { flare, well };
}

export function buildArchFlare(design: CarDesignSpec): ArchGeomSet {
  const flares: THREE.BufferGeometry[] = [];
  const wells: THREE.BufferGeometry[] = [];
  const { wheels, archFlare } = design;

  for (const side of [-1, 1] as const) {
    const f = buildSingleArchFlareAndWell(
      wheels.frontTrackHalfWidth,
      wheels.frontOffsetZ,
      wheels.frontRadius,
      wheels.frontWidth,
      archFlare,
      side,
    );
    flares.push(f.flare);
    wells.push(f.well);

    const r = buildSingleArchFlareAndWell(
      wheels.rearTrackHalfWidth,
      wheels.rearOffsetZ,
      wheels.rearRadius,
      wheels.rearWidth,
      archFlare,
      side,
    );
    flares.push(r.flare);
    wells.push(r.well);
  }

  return {
    flareGeom: mergeSafe(flares),
    wellGeom: mergeSafe(wells),
  };
}

export function buildDetails(design: CarDesignSpec): CarDetailsGeomSet {
  // 1. Sleek swept LED headlights (L + R)
  const hlParts: THREE.BufferGeometry[] = [];
  const hl = design.headlights;
  for (const side of [-1, 1]) {
    const pod = new THREE.BoxGeometry(hl.width, hl.height, hl.depth);
    pod.rotateY(side * -hl.sweepY);
    pod.rotateX(hl.tiltX);
    pod.translate(side * hl.x, hl.y, hl.z);
    hlParts.push(pod);

    // Subtle DRL eyebrow accent bar on outer edge
    const brow = new THREE.BoxGeometry(hl.width * 0.72, hl.height * 0.36, hl.depth * 0.78);
    brow.rotateY(side * -hl.sweepY);
    brow.rotateX(hl.tiltX);
    brow.translate(side * (hl.x + 0.03), hl.y + hl.height * 0.48, hl.z + 0.02);
    hlParts.push(brow);
  }
  const headlightGeom = mergeSafe(hlParts);

  // 2. Front air intake grille + horizontal aero blade
  const gr = design.grille;
  const grilleParts: THREE.BufferGeometry[] = [];
  const grilleRecess = new THREE.BoxGeometry(gr.width, gr.height, gr.depth);
  grilleRecess.translate(0, gr.y, gr.z);
  grilleParts.push(grilleRecess);
  const grilleBar = new THREE.BoxGeometry(gr.width * 0.96, gr.height * 0.24, gr.depth * 1.18);
  grilleBar.translate(0, gr.y, gr.z - 0.01);
  grilleParts.push(grilleBar);
  const grilleGeom = mergeSafe(grilleParts);

  // 3. Front aero splitter with side endplates
  const sp = design.splitter;
  const splitterParts: THREE.BufferGeometry[] = [];
  const mainLip = new THREE.BoxGeometry(sp.width, sp.height, sp.depth);
  mainLip.translate(0, sp.y, sp.z);
  splitterParts.push(mainLip);
  for (const side of [-1, 1]) {
    const endplate = new THREE.BoxGeometry(0.035, sp.height * 2.1, sp.depth * 0.85);
    endplate.translate(side * (sp.width * 0.5 - 0.015), sp.y + sp.height * 0.55, sp.z + 0.01);
    splitterParts.push(endplate);
  }
  const splitterGeom = mergeSafe(splitterParts);

  // 4. Sculpted aerodynamic side mirrors (L + R)
  const mr = design.mirrors;
  const mirrorParts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const stalk = new THREE.BoxGeometry(0.07, 0.028, 0.055);
    stalk.rotateZ(side * 0.32);
    stalk.translate(side * (mr.x - mr.width * 0.32), mr.y - 0.022, mr.z);
    mirrorParts.push(stalk);

    const housing = new THREE.BoxGeometry(mr.width, mr.height, mr.depth);
    housing.rotateY(side * -0.22);
    housing.translate(side * mr.x, mr.y, mr.z + 0.015);
    mirrorParts.push(housing);
  }
  const mirrorGeom = mergeSafe(mirrorParts);

  // 5. Rear diffuser + vertical aero fins
  const df = design.diffuser;
  const diffuserParts: THREE.BufferGeometry[] = [];
  const tray = new THREE.BoxGeometry(df.width, df.height * 0.35, df.depth);
  tray.rotateX(-0.18);
  tray.translate(0, df.y, df.z);
  diffuserParts.push(tray);
  const finCount = Math.max(2, df.finCount);
  for (let i = 0; i < finCount; i++) {
    const frac = finCount === 1 ? 0 : (i / (finCount - 1)) * 2 - 1;
    const fin = new THREE.BoxGeometry(0.026, df.height, df.depth * 0.88);
    fin.translate(frac * (df.width * 0.42), df.y + df.height * 0.25, df.z + 0.01);
    diffuserParts.push(fin);
  }
  const diffuserGeom = mergeSafe(diffuserParts);

  // 6. Exhaust pipe (centered at origin so car.ts can place left & right + animate cores/halos)
  const ex = design.exhausts;
  const exhaustPipeGeom = new THREE.CylinderGeometry(
    ex.radius * 0.92,
    ex.radius * 1.05,
    ex.length,
    12,
  );
  exhaustPipeGeom.rotateX(Math.PI / 2);
  const exhaustCoreGeom = new THREE.SphereGeometry(ex.radius * 0.78, 10, 8);
  const exhaustHaloGeom = new THREE.SphereGeometry(ex.radius * 2.0, 12, 10);

  // 7. Integrated ducktail / wedge aero lip spoiler (flows directly from rear hips)
  const spl = design.spoiler;
  const spoilerBodyParts: THREE.BufferGeometry[] = [];
  const spoilerAccentParts: THREE.BufferGeometry[] = [];

  if (spl.style === 'ducktail') {
    // Swept integrated ducktail curved across width
    const duckSteps = 10;
    const wHalf = spl.width * 0.5;
    for (let i = 0; i < duckSteps; i++) {
      const t0 = i / duckSteps - 0.5;
      const segW = spl.width / duckSteps + 0.01;
      const archLift = (1 - Math.pow(t0 * 2, 2)) * 0.028;
      const sweepZ = Math.pow(t0 * 2, 2) * 0.045;
      const blade = new THREE.BoxGeometry(segW, spl.height, spl.chord);
      blade.rotateX(-spl.tiltX);
      blade.translate(t0 * spl.width, spl.y + archLift, spl.z - sweepZ);
      spoilerBodyParts.push(blade);
    }
    const gurneyLip = new THREE.BoxGeometry(spl.width * 0.94, 0.028, 0.04);
    gurneyLip.rotateX(-spl.tiltX);
    gurneyLip.translate(0, spl.y + spl.height * 0.52, spl.z + spl.chord * 0.42);
    spoilerAccentParts.push(gurneyLip);
    // Low side shoulder blend wings
    for (const side of [-1, 1]) {
      const wingTip = new THREE.BoxGeometry(0.045, spl.height * 1.15, spl.chord * 1.1);
      wingTip.rotateX(-spl.tiltX * 0.7);
      wingTip.translate(side * (wHalf - 0.01), spl.y - 0.01, spl.z - 0.02);
      spoilerBodyParts.push(wingTip);
    }
  } else {
    // Low-slung aero wedge wing blended on short rear deck risers
    for (const side of [-1, 1]) {
      const riser = new THREE.BoxGeometry(0.055, spl.height * 0.85, spl.chord * 0.75);
      riser.translate(side * (spl.width * 0.24), spl.y - spl.height * 0.15, spl.z - 0.02);
      spoilerBodyParts.push(riser);
    }
    const mainPlane = new THREE.BoxGeometry(spl.width, 0.052, spl.chord);
    mainPlane.rotateX(-spl.tiltX);
    mainPlane.translate(0, spl.y + spl.height * 0.34, spl.z);
    spoilerBodyParts.push(mainPlane);

    for (const side of [-1, 1]) {
      const endplate = new THREE.BoxGeometry(0.036, spl.height * 1.35, spl.chord * 1.12);
      endplate.translate(side * (spl.width * 0.5), spl.y + spl.height * 0.22, spl.z);
      spoilerAccentParts.push(endplate);
    }
  }
  const spoilerBodyGeom = mergeSafe(spoilerBodyParts);
  const spoilerAccentGeom = mergeSafe(spoilerAccentParts);

  // 8. Full-width RED rear taillight bar wrapping subtly around corners (zero z-fighting)
  const tl = design.taillights;
  const tlParts: THREE.BufferGeometry[] = [];
  const centerBar = new THREE.BoxGeometry(tl.width, tl.height, tl.depth);
  centerBar.translate(0, tl.y, tl.z);
  tlParts.push(centerBar);
  for (const side of [-1, 1]) {
    const cornerWing = new THREE.BoxGeometry(0.055, tl.height * 1.18, tl.wrapDepth);
    cornerWing.rotateY(side * -0.35);
    cornerWing.translate(side * (tl.width * 0.5 + 0.01), tl.y, tl.z - tl.wrapDepth * 0.32);
    tlParts.push(cornerWing);
  }
  const taillightGeom = mergeSafe(tlParts);

  // 9. Thin low-profile underglow strips under side sills & rear diffuser
  const ug = design.underglow;
  const ugParts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const sideStrip = new THREE.BoxGeometry(0.045, 0.016, ug.length * 0.66);
    sideStrip.translate(side * (ug.width * 0.5), ug.y, ug.z);
    ugParts.push(sideStrip);
  }
  const rearStrip = new THREE.BoxGeometry(ug.width * 0.72, 0.016, 0.045);
  rearStrip.translate(0, ug.y + 0.02, ug.z + ug.length * 0.5);
  ugParts.push(rearStrip);
  const underglowGeom = mergeSafe(ugParts);

  return {
    headlightGeom,
    grilleGeom,
    splitterGeom,
    mirrorGeom,
    diffuserGeom,
    exhaustPipeGeom,
    exhaustCoreGeom,
    exhaustHaloGeom,
    spoilerBodyGeom,
    spoilerAccentGeom,
    taillightGeom,
    underglowGeom,
  };
}

export function getCachedCarGeometryBundle(
  designId: CarDesignId,
  detailOpts: WheelDetailOptions = {},
): CarGeometryBundle {
  const spokeCount = THREE.MathUtils.clamp(Math.round(detailOpts.spokeCount ?? 6), 5, 7);
  const tireRatio = THREE.MathUtils.clamp(detailOpts.tireThicknessRatio ?? 0.34, 0.24, 0.44);
  const cacheKey = `${designId}:${spokeCount}:${tireRatio.toFixed(2)}`;

  const existing = bundleCache.get(cacheKey);
  if (existing) {
    return existing;
  }

  const design = CAR_DESIGNS[designId];
  const bodyGeom = buildLoftBody(design);
  const cabin = buildCabin(design);
  const wheels = buildWheelAssembly(design, {
    spokeCount,
    tireThicknessRatio: tireRatio,
  });
  const arch = buildArchFlare(design);
  const details = buildDetails(design);

  const singleWheelTris = (w: WheelGeomSet): number =>
    countTriangles(w.tireGeom) +
    countTriangles(w.rimGeom) +
    countTriangles(w.spokeGeom) +
    countTriangles(w.hubGeom) +
    countTriangles(w.discGeom) +
    countTriangles(w.caliperGeom);

  const triangleCount =
    countTriangles(bodyGeom) +
    countTriangles(cabin.roofGeom) +
    countTriangles(cabin.glassGeom) +
    countTriangles(cabin.trimGeom) +
    singleWheelTris(wheels.front) * 2 +
    singleWheelTris(wheels.rear) * 2 +
    countTriangles(arch.flareGeom) +
    countTriangles(arch.wellGeom) +
    countTriangles(details.headlightGeom) +
    countTriangles(details.grilleGeom) +
    countTriangles(details.splitterGeom) +
    countTriangles(details.mirrorGeom) +
    countTriangles(details.diffuserGeom) +
    countTriangles(details.exhaustPipeGeom) * 2 +
    countTriangles(details.exhaustCoreGeom) * 2 +
    countTriangles(details.exhaustHaloGeom) * 2 +
    countTriangles(details.spoilerBodyGeom) +
    countTriangles(details.spoilerAccentGeom) +
    countTriangles(details.taillightGeom) +
    countTriangles(details.underglowGeom);

  const bundle: CarGeometryBundle = {
    design,
    bodyGeom,
    cabin,
    wheels,
    arch,
    details,
    triangleCount,
  };

  bundleCache.set(cacheKey, bundle);
  return bundle;
}
