// src/render/bridge.ts

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CONFIG, VISUAL_PRESETS, type VisualPreset, type VisualPresetName } from '../config';
import type { Course, TrackFrame } from '../core/course';

export interface BridgeVisual {
  group: THREE.Group;
  applyPalette: (name: VisualPresetName) => void;
  dispose: () => void;
}

function makeNonIndexedNormalized(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  if (!nonIndexed.getAttribute('normal')) {
    nonIndexed.computeVertexNormals();
  }
  if (!nonIndexed.getAttribute('uv')) {
    const pos = nonIndexed.getAttribute('position');
    nonIndexed.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
  }
  return nonIndexed;
}

function mergeWithCleanup(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (geoms.length === 0) {
    return new THREE.BoxGeometry(0.1, 0.1, 0.1);
  }
  const prepared = geoms.map((g) => makeNonIndexedNormalized(g));
  const merged = mergeGeometries(prepared, false);
  for (const g of geoms) g.dispose();
  for (const g of prepared) g.dispose();
  if (!merged) {
    return new THREE.BoxGeometry(0.1, 0.1, 0.1);
  }
  merged.computeBoundingSphere();
  return merged;
}

function createBridgeBodyTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, size, 0);
    grad.addColorStop(0.0, '#E2E8F0');
    grad.addColorStop(0.28, '#FFFFFF');
    grad.addColorStop(0.72, '#FFFDF7');
    grad.addColorStop(1.0, '#CBD5E1');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = 'rgba(148, 163, 184, 0.14)';
    for (let y = 0; y < size; y += 32) {
      ctx.fillRect(0, y, size, 2);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createCableTexture(maxAnisotropy: number, colorHex: string): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.fillStyle = colorHex;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.fillRect(size * 0.25, 0, size * 0.2, size);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function buildSweptCableGeometry(
  frames: readonly TrackFrame[],
  lateralSign: -1 | 1,
  cableHeight: number,
  cableRadius: number,
): THREE.BufferGeometry {
  const radialSegs = 6;
  const ringStride = radialSegs + 1;
  const ringCount = frames.length;
  const positions = new Float32Array(ringCount * ringStride * 3);
  const uvs = new Float32Array(ringCount * ringStride * 2);
  const indices: number[] = [];

  const center = new THREE.Vector3();
  const pt = new THREE.Vector3();

  for (let r = 0; r < ringCount; r++) {
    const f = frames[r];
    const edgeOffset =
      lateralSign * (f.width * 0.5 + CONFIG.physics.railInnerOffset + 0.14);

    center
      .copy(f.position)
      .addScaledVector(f.right, edgeOffset)
      .addScaledVector(f.up, cableHeight);

    const vCoord = f.s * 0.25;
    for (let p = 0; p < ringStride; p++) {
      const ang = ((p % radialSegs) / radialSegs) * Math.PI * 2;
      const cosA = Math.cos(ang) * cableRadius;
      const sinA = Math.sin(ang) * cableRadius;
      pt.copy(center).addScaledVector(f.right, cosA).addScaledVector(f.up, sinA);

      const idx = r * ringStride + p;
      positions[idx * 3] = pt.x;
      positions[idx * 3 + 1] = pt.y;
      positions[idx * 3 + 2] = pt.z;
      uvs[idx * 2] = p / radialSegs;
      uvs[idx * 2 + 1] = vCoord;
    }
  }

  for (let r = 0; r < ringCount - 1; r++) {
    const rowA = r * ringStride;
    const rowB = (r + 1) * ringStride;
    for (let p = 0; p < radialSegs; p++) {
      const a = rowA + p;
      const b = rowA + p + 1;
      const c = rowB + p;
      const d = rowB + p + 1;
      indices.push(a, b, c);
      indices.push(b, d, c);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  geom.computeBoundingSphere();
  return geom;
}

function createArchBeamSegment(
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  radialSegments = 8,
): THREE.BufferGeometry {
  const dir = new THREE.Vector3().subVectors(end, start);
  const len = Math.max(0.05, dir.length());
  const geom = new THREE.CylinderGeometry(radius, radius, len, radialSegments, 1);
  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.normalize(),
  );
  const mat = new THREE.Matrix4().compose(mid, quat, new THREE.Vector3(1, 1, 1));
  geom.applyMatrix4(mat);
  return geom;
}

export function buildBridgeMesh(
  course: Course,
  groundYAt: (x: number, z: number) => number,
  maxAnisotropy = 8,
  initialPreset: VisualPresetName = CONFIG.visual.activePreset,
): BridgeVisual {
  const group = new THREE.Group();
  group.name = 'BridgeGroup';

  const bridgeRuns = course.getStyleRuns().filter((r) => r.style === 'bridge');
  if (bridgeRuns.length === 0) {
    return {
      group,
      applyPalette: () => {},
      dispose: () => {},
    };
  }

  const bridgeCfg = CONFIG.styles.bridge;
  const preset: VisualPreset = VISUAL_PRESETS[initialPreset];

  const bodyTex = createBridgeBodyTexture(maxAnisotropy);
  const whiteCableTex = createCableTexture(maxAnisotropy, '#FFFFFF');
  let accentCableTex = createCableTexture(maxAnisotropy, preset.colors.accent);

  const whiteMat = new THREE.MeshPhysicalMaterial({
    map: bodyTex,
    color: 0xffffff,
    roughness: 0.26,
    metalness: 0.08,
    clearcoat: 0.72,
    clearcoatRoughness: 0.14,
  });

  const accentMat = new THREE.MeshPhysicalMaterial({
    map: accentCableTex,
    color: 0xffffff,
    roughness: 0.22,
    metalness: 0.1,
    clearcoat: 0.8,
    clearcoatRoughness: 0.12,
  });

  const whiteCableMat = new THREE.MeshPhysicalMaterial({
    map: whiteCableTex,
    color: 0xffffff,
    roughness: 0.24,
    metalness: 0.16,
    clearcoat: 0.65,
  });

  const geomsToDispose: THREE.BufferGeometry[] = [];
  const matsToDispose: THREE.Material[] = [whiteMat, accentMat, whiteCableMat];
  const texsToDispose: THREE.Texture[] = [bodyTex, whiteCableTex];

  const postHeight = bridgeCfg.railHeight + 0.08;
  const postGeom = new THREE.CylinderGeometry(0.11, 0.13, postHeight, 10);
  const finialGeom = new THREE.SphereGeometry(0.15, 10, 8);
  geomsToDispose.push(postGeom, finialGeom);

  const postMatrices: THREE.Matrix4[] = [];
  const finialMatrices: THREE.Matrix4[] = [];

  const whiteStructGeoms: THREE.BufferGeometry[] = [];
  const accentStructGeoms: THREE.BufferGeometry[] = [];

  const tmpFrame: TrackFrame = {
    s: 0,
    position: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
    up: new THREE.Vector3(),
    right: new THREE.Vector3(),
    width: course.getTrackWidth(),
    bank: 0,
  };
  const basisMat = new THREE.Matrix4();
  const negFwd = new THREE.Vector3();
  const tmpPos = new THREE.Vector3();

  for (const run of bridgeRuns) {
    const runLen = run.endS - run.startS;
    if (runLen < 1) {
      continue;
    }

    // 1. Sample frames along bridge span for swept open railings & cables
    const cableStep = 1.0;
    const sampleCount = Math.max(4, Math.ceil(runLen / cableStep) + 1);
    const runFrames: TrackFrame[] = [];
    for (let i = 0; i < sampleCount; i++) {
      const s = THREE.MathUtils.lerp(run.startS, run.endS, i / (sampleCount - 1));
      runFrames.push(course.getFrameAt(s));
    }

    const cableCount = Math.max(2, bridgeCfg.cableCount);
    const cableMinY = 0.22;
    const cableMaxY = bridgeCfg.railHeight;
    for (let c = 0; c < cableCount; c++) {
      const frac = cableCount === 1 ? 1 : c / (cableCount - 1);
      const cableY = THREE.MathUtils.lerp(cableMinY, cableMaxY, frac);
      const isTopAccent = c === cableCount - 1;
      const mat = isTopAccent ? accentMat : whiteCableMat;
      const rad = isTopAccent ? 0.068 : 0.044;

      for (const side of [-1, 1] as const) {
        const cableGeom = buildSweptCableGeometry(runFrames, side, cableY, rad);
        geomsToDispose.push(cableGeom);
        const cableMesh = new THREE.Mesh(cableGeom, mat);
        cableMesh.castShadow = true;
        cableMesh.receiveShadow = true;
        cableMesh.updateMatrix();
        cableMesh.matrixAutoUpdate = false;
        group.add(cableMesh);
      }
    }

    // 2. Open railing posts + yellow finials every postSpacing meters
    const postCount = Math.max(2, Math.floor(runLen / bridgeCfg.postSpacing) + 1);
    for (let i = 0; i < postCount; i++) {
      const s = THREE.MathUtils.lerp(run.startS + 0.5, run.endS - 0.5, i / (postCount - 1));
      course.getFrameAt(s, tmpFrame);
      negFwd.copy(tmpFrame.tangent).negate();
      basisMat.makeBasis(tmpFrame.right, tmpFrame.up, negFwd);

      const edgeOffset = tmpFrame.width * 0.5 + CONFIG.physics.railInnerOffset + 0.14;
      for (const side of [-1, 1] as const) {
        tmpPos
          .copy(tmpFrame.position)
          .addScaledVector(tmpFrame.right, side * edgeOffset)
          .addScaledVector(tmpFrame.up, postHeight * 0.45);
        const pMat = basisMat.clone().setPosition(tmpPos);
        postMatrices.push(pMat);

        tmpPos
          .copy(tmpFrame.position)
          .addScaledVector(tmpFrame.right, side * edgeOffset)
          .addScaledVector(tmpFrame.up, postHeight * 0.96);
        const fMat = basisMat.clone().setPosition(tmpPos);
        finialMatrices.push(fMat);
      }
    }

    // 3. Support pylons & graceful arches below bridge deck down to groundYAt(x, z)
    const pylonMargin = Math.min(10, runLen * 0.12);
    const pylonSpan = Math.max(0, runLen - pylonMargin * 2);
    const pylonIntervals = Math.max(1, Math.round(pylonSpan / bridgeCfg.pylonSpacing));
    const pylonStations: Array<{
      s: number;
      leftTop: THREE.Vector3;
      rightTop: THREE.Vector3;
      leftBottomY: number;
      rightBottomY: number;
      frame: TrackFrame;
    }> = [];

    for (let i = 0; i <= pylonIntervals; i++) {
      const s =
        pylonSpan > 1
          ? THREE.MathUtils.lerp(run.startS + pylonMargin, run.endS - pylonMargin, i / pylonIntervals)
          : (run.startS + run.endS) * 0.5;
      const frame = course.getFrameAt(s);
      const latOffset = frame.width * 0.42;
      const deckUnderOffset = CONFIG.course.trackThickness + 0.15;

      const leftTop = frame.position
        .clone()
        .addScaledVector(frame.right, -latOffset)
        .addScaledVector(frame.up, -deckUnderOffset);
      const rightTop = frame.position
        .clone()
        .addScaledVector(frame.right, latOffset)
        .addScaledVector(frame.up, -deckUnderOffset);

      const leftGroundY = groundYAt(leftTop.x, leftTop.z);
      const rightGroundY = groundYAt(rightTop.x, rightTop.z);

      pylonStations.push({
        s,
        leftTop,
        rightTop,
        leftBottomY: leftGroundY - 0.8,
        rightBottomY: rightGroundY - 0.8,
        frame,
      });

      // Vertical tapered columns + yellow base & deck collars
      for (const sideInfo of [
        { top: leftTop, botY: leftGroundY - 0.8 },
        { top: rightTop, botY: rightGroundY - 0.8 },
      ]) {
        const colH = Math.max(1.5, sideInfo.top.y - sideInfo.botY);
        const colGeom = new THREE.CylinderGeometry(0.56, 0.78, colH, 12);
        colGeom.translate(sideInfo.top.x, sideInfo.botY + colH * 0.5, sideInfo.top.z);
        whiteStructGeoms.push(colGeom);

        const collarGeom = new THREE.CylinderGeometry(0.74, 0.74, 0.75, 12);
        collarGeom.translate(sideInfo.top.x, sideInfo.top.y - 0.35, sideInfo.top.z);
        accentStructGeoms.push(collarGeom);

        const footingGeom = new THREE.CylinderGeometry(0.95, 1.15, 1.2, 12);
        footingGeom.translate(sideInfo.top.x, sideInfo.botY + 1.0, sideInfo.top.z);
        accentStructGeoms.push(footingGeom);
      }

      // Cross-beam under deck linking left and right pillars
      const crossBeam = createArchBeamSegment(leftTop, rightTop, 0.42, 8);
      whiteStructGeoms.push(crossBeam);

      // Lower mid-height cross brace when bridge is high above ground
      const minColH = Math.min(leftTop.y - leftGroundY, rightTop.y - rightGroundY);
      if (minColH > 9) {
        const midBraceY = Math.min(leftTop.y, rightTop.y) - minColH * 0.52;
        const braceL = new THREE.Vector3(leftTop.x, midBraceY, leftTop.z);
        const braceR = new THREE.Vector3(rightTop.x, midBraceY, rightTop.z);
        whiteStructGeoms.push(createArchBeamSegment(braceL, braceR, 0.28, 8));
      }
    }

    // Graceful arches between consecutive pylon stations
    for (let i = 0; i < pylonStations.length - 1; i++) {
      const a = pylonStations[i];
      const b = pylonStations[i + 1];
      const spanSteps = 10;

      for (const side of [-1, 1] as const) {
        const startTop = side === -1 ? a.leftTop : a.rightTop;
        const endTop = side === -1 ? b.leftTop : b.rightTop;
        const startBotY = side === -1 ? a.leftBottomY : a.rightBottomY;
        const endBotY = side === -1 ? b.leftBottomY : b.rightBottomY;

        const avgClearance = Math.min(
          startTop.y - startBotY,
          endTop.y - endBotY,
        );
        const sag = Math.min(bridgeCfg.archHeight, Math.max(2.5, avgClearance * 0.46));

        const archPts: THREE.Vector3[] = [];
        for (let k = 0; k <= spanSteps; k++) {
          const t = k / spanSteps;
          const s = THREE.MathUtils.lerp(a.s, b.s, t);
          course.getFrameAt(s, tmpFrame);
          const lat = side * (tmpFrame.width * 0.42);
          const deckPt = tmpFrame.position
            .clone()
            .addScaledVector(tmpFrame.right, lat)
            .addScaledVector(tmpFrame.up, -(CONFIG.course.trackThickness + 0.15));

          // Arch curve starts low near piers and rises gracefully up toward mid-span underside
          const archRise = Math.sin(Math.PI * t);
          const archPt = deckPt.clone();
          archPt.y -= sag * (1 - archRise) + 0.35;
          archPts.push(archPt);

          if (k > 0 && k < spanSteps && k % 2 === 0) {
            const strut = createArchBeamSegment(archPt, deckPt, 0.14, 6);
            accentStructGeoms.push(strut);
          }
        }

        for (let k = 0; k < archPts.length - 1; k++) {
          const seg = createArchBeamSegment(archPts[k], archPts[k + 1], 0.34, 8);
          whiteStructGeoms.push(seg);
        }
      }
    }
  }

  if (postMatrices.length > 0) {
    const postInst = new THREE.InstancedMesh(postGeom, whiteMat, postMatrices.length);
    const finialInst = new THREE.InstancedMesh(finialGeom, accentMat, finialMatrices.length);
    postInst.castShadow = true;
    postInst.receiveShadow = true;
    finialInst.castShadow = true;
    finialInst.receiveShadow = true;
    for (let i = 0; i < postMatrices.length; i++) {
      postInst.setMatrixAt(i, postMatrices[i]);
      finialInst.setMatrixAt(i, finialMatrices[i]);
    }
    postInst.instanceMatrix.needsUpdate = true;
    postInst.computeBoundingSphere();
    finialInst.instanceMatrix.needsUpdate = true;
    finialInst.computeBoundingSphere();
    group.add(postInst, finialInst);
  }

  if (whiteStructGeoms.length > 0) {
    const mergedWhite = mergeWithCleanup(whiteStructGeoms);
    geomsToDispose.push(mergedWhite);
    const whiteMesh = new THREE.Mesh(mergedWhite, whiteMat);
    whiteMesh.castShadow = true;
    whiteMesh.receiveShadow = true;
    whiteMesh.updateMatrix();
    whiteMesh.matrixAutoUpdate = false;
    group.add(whiteMesh);
  }

  if (accentStructGeoms.length > 0) {
    const mergedAccent = mergeWithCleanup(accentStructGeoms);
    geomsToDispose.push(mergedAccent);
    const accentMesh = new THREE.Mesh(mergedAccent, accentMat);
    accentMesh.castShadow = true;
    accentMesh.receiveShadow = true;
    accentMesh.updateMatrix();
    accentMesh.matrixAutoUpdate = false;
    group.add(accentMesh);
  }

  function applyPalette(name: VisualPresetName): void {
    const nextPreset = VISUAL_PRESETS[name];
    const prevTex = accentCableTex;
    accentCableTex = createCableTexture(maxAnisotropy, nextPreset.colors.accent);
    accentMat.map = accentCableTex;
    accentMat.needsUpdate = true;
    prevTex.dispose();
  }

  function dispose(): void {
    for (const g of geomsToDispose) g.dispose();
    for (const m of matsToDispose) m.dispose();
    for (const t of texsToDispose) t.dispose();
    accentCableTex.dispose();
  }

  return {
    group,
    applyPalette,
    dispose,
  };
}
