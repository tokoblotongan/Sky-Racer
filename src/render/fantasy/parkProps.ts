// src/render/fantasy/parkProps.ts

import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { ResolvedDecorPlacement } from '../../courses/fantasyLandDecor';
import {
  countGeometryTriangles,
  mergeNormalizedGeometries,
  setGeometrySwatch,
  SWATCH,
  type FantasyDecorMaterials,
  type FantasyDecorModule,
} from './decorMaterials';

interface FlagState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  phase: number;
}

export function buildParkPropsLandmark(
  placements: readonly ResolvedDecorPlacement[],
  mats: FantasyDecorMaterials,
  shadowsEnabled: boolean,
): FantasyDecorModule {
  const group = new THREE.Group();
  group.name = 'FantasyParkPropsGroup';

  const lamps = placements.filter((p) => p.spec.variant === 'lamp');
  const flags = placements.filter((p) => p.spec.variant === 'flag');
  const flowers = placements.filter((p) => p.spec.variant === 'flowers');

  const ownedGeoms: THREE.BufferGeometry[] = [];
  let drawCalls = 0;
  let totalTriangles = 0;
  const dummy = new THREE.Object3D();

  // -------------------------------------------------------------------------
  // 1. Garden Lamp Pylons (grounded column up to track level + glowing lantern)
  // -------------------------------------------------------------------------
  if (lamps.length > 0) {
    const colGeom = new THREE.CylinderGeometry(0.32, 0.58, 1, 8);
    ownedGeoms.push(colGeom);

    const headGeom = mergeNormalizedGeometries([
      new THREE.CylinderGeometry(0.18, 0.24, 5.2, 8).translate(0, 2.6, 0),
      new THREE.BoxGeometry(1.1, 0.24, 0.35).translate(0.42, 5.1, 0),
    ]);
    ownedGeoms.push(headGeom);

    const bulbGeom = new THREE.OctahedronGeometry(0.62, 0);
    ownedGeoms.push(bulbGeom);

    const colInst = new THREE.InstancedMesh(colGeom, mats.paletteMat, lamps.length);
    const headInst = new THREE.InstancedMesh(headGeom, mats.darkMetalMat, lamps.length);
    const bulbInst = new THREE.InstancedMesh(bulbGeom, mats.glowAccentMat, lamps.length);

    colInst.castShadow = shadowsEnabled;
    headInst.castShadow = shadowsEnabled;

    lamps.forEach((l, i) => {
      const topY = Math.max(2, l.position.y);
      dummy.position.set(l.position.x, topY * 0.5, l.position.z);
      dummy.rotation.set(0, l.yaw, 0);
      dummy.scale.set(1, topY, 1);
      dummy.updateMatrix();
      colInst.setMatrixAt(i, dummy.matrix);

      // Turn lantern arm toward track center
      const armYaw = l.spec.side === 'left' ? l.yaw - Math.PI / 2 : l.yaw + Math.PI / 2;
      dummy.position.set(l.position.x, topY, l.position.z);
      dummy.rotation.set(0, armYaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      headInst.setMatrixAt(i, dummy.matrix);

      const bx = l.position.x + Math.cos(-armYaw) * 0.82;
      const bz = l.position.z + Math.sin(-armYaw) * 0.82;
      dummy.position.set(bx, topY + 4.45, bz);
      dummy.rotation.set(0, armYaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      bulbInst.setMatrixAt(i, dummy.matrix);
    });

    colInst.instanceMatrix.needsUpdate = true;
    headInst.instanceMatrix.needsUpdate = true;
    bulbInst.instanceMatrix.needsUpdate = true;
    colInst.computeBoundingSphere();
    headInst.computeBoundingSphere();
    bulbInst.computeBoundingSphere();
    colInst.matrixAutoUpdate = false;
    headInst.matrixAutoUpdate = false;
    bulbInst.matrixAutoUpdate = false;
    colInst.updateMatrix();
    headInst.updateMatrix();
    bulbInst.updateMatrix();

    group.add(colInst, headInst, bulbInst);
    drawCalls += 3;
    totalTriangles +=
      (countGeometryTriangles(colGeom) +
        countGeometryTriangles(headGeom) +
        countGeometryTriangles(bulbGeom)) *
      lamps.length;
  }

  // -------------------------------------------------------------------------
  // 2. Waving Flag Poles (grounded stanchions + animated colorful pennants)
  // -------------------------------------------------------------------------
  let flagBannerInst: THREE.InstancedMesh | null = null;
  const flagStates: FlagState[] = [];

  if (flags.length > 0) {
    const poleColGeom = new THREE.CylinderGeometry(0.24, 0.42, 1, 8);
    ownedGeoms.push(poleColGeom);

    const bannerShape = new THREE.Shape();
    bannerShape.moveTo(0, 0);
    bannerShape.lineTo(4.0, -0.75);
    bannerShape.lineTo(0, -1.65);
    bannerShape.closePath();
    const bannerGeom = new THREE.ExtrudeGeometry(bannerShape, { depth: 0.08, bevelEnabled: false });
    bannerGeom.translate(0.18, 0, -0.04);
    ownedGeoms.push(bannerGeom);

    const poleInst = new THREE.InstancedMesh(poleColGeom, mats.darkMetalMat, flags.length);
    flagBannerInst = new THREE.InstancedMesh(bannerGeom, mats.instancedColorMat, flags.length);
    poleInst.castShadow = shadowsEnabled;
    flagBannerInst.castShadow = shadowsEnabled;

    const palette = CONFIG.fantasy.palette.castleFlagColors;
    const tmpColor = new THREE.Color();

    flags.forEach((fl, i) => {
      const topY = Math.max(6, fl.position.y + 6.5);
      dummy.position.set(fl.position.x, topY * 0.5, fl.position.z);
      dummy.rotation.set(0, fl.yaw, 0);
      dummy.scale.set(1, topY, 1);
      dummy.updateMatrix();
      poleInst.setMatrixAt(i, dummy.matrix);

      tmpColor.set(palette[i % palette.length]);
      flagBannerInst!.setColorAt(i, tmpColor);

      flagStates.push({
        x: fl.position.x,
        y: topY - 0.3,
        z: fl.position.z,
        yaw: fl.yaw,
        phase: i * 1.15,
      });
    });

    if (flagBannerInst.instanceColor) flagBannerInst.instanceColor.needsUpdate = true;
    poleInst.instanceMatrix.needsUpdate = true;
    poleInst.computeBoundingSphere();
    poleInst.matrixAutoUpdate = false;
    poleInst.updateMatrix();
    group.add(poleInst, flagBannerInst);
    drawCalls += 2;
    totalTriangles +=
      (countGeometryTriangles(poleColGeom) + countGeometryTriangles(bannerGeom)) * flags.length;
  }

  const waveSpeed = CONFIG.fantasy.animSpeeds.flagWaveSpeed;
  const syncFlags = (timeSec: number): void => {
    if (!flagBannerInst) return;
    for (let i = 0; i < flagStates.length; i++) {
      const f = flagStates[i];
      dummy.position.set(f.x, f.y, f.z);
      dummy.rotation.set(
        Math.sin(timeSec * waveSpeed * 1.1 + f.phase) * 0.05,
        f.yaw + Math.sin(timeSec * waveSpeed + f.phase) * 0.32,
        0,
      );
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      flagBannerInst.setMatrixAt(i, dummy.matrix);
    }
    flagBannerInst.instanceMatrix.needsUpdate = true;
  };
  syncFlags(0);
  flagBannerInst?.computeBoundingSphere();

  // -------------------------------------------------------------------------
  // 3. Meadow Flower Patches (Instanced vibrant blooms, skipped on mobile/low)
  // -------------------------------------------------------------------------
  if (flowers.length > 0) {
    const blossoms: THREE.BufferGeometry[] = [];
    const offsets = [
      { x: 0, z: 0, s: 1.0 },
      { x: -1.6, z: 0.9, s: 0.82 },
      { x: 1.5, z: -0.8, s: 0.88 },
      { x: -0.9, z: -1.5, s: 0.76 },
      { x: 1.1, z: 1.4, s: 0.9 },
    ];
    for (const o of offsets) {
      const stem = new THREE.CylinderGeometry(0.08, 0.1, 0.7, 5);
      stem.translate(o.x, 0.35, o.z);
      const bloom = new THREE.CylinderGeometry(0.62 * o.s, 0.32 * o.s, 0.28, 6);
      bloom.translate(o.x, 0.72, o.z);
      blossoms.push(setGeometrySwatch(stem, SWATCH.ISLAND_GRASS), bloom);
    }
    const flowerGeom = mergeNormalizedGeometries(blossoms);
    ownedGeoms.push(flowerGeom);

    const flowerInst = new THREE.InstancedMesh(flowerGeom, mats.instancedColorMat, flowers.length);
    flowerInst.receiveShadow = true;
    const flowerColors = CONFIG.fantasy.palette.flowerColors;
    const tmpColor = new THREE.Color();

    flowers.forEach((fp, i) => {
      dummy.position.set(fp.position.x, fp.position.y, fp.position.z);
      dummy.rotation.set(0, fp.yaw, 0);
      dummy.scale.setScalar(fp.spec.scale);
      dummy.updateMatrix();
      flowerInst.setMatrixAt(i, dummy.matrix);
      tmpColor.set(flowerColors[i % flowerColors.length]);
      flowerInst.setColorAt(i, tmpColor);
    });

    flowerInst.instanceMatrix.needsUpdate = true;
    if (flowerInst.instanceColor) flowerInst.instanceColor.needsUpdate = true;
    flowerInst.computeBoundingSphere();
    flowerInst.matrixAutoUpdate = false;
    flowerInst.updateMatrix();
    group.add(flowerInst);
    drawCalls += 1;
    totalTriangles += countGeometryTriangles(flowerGeom) * flowers.length;
  }

  return {
    group,
    update(timeSec: number): void {
      syncFlags(timeSec);
    },
    dispose(): void {
      for (const g of ownedGeoms) g.dispose();
    },
    getTriangleCount(): number {
      return totalTriangles;
    },
    getDrawCallCount(): number {
      return drawCalls;
    },
  };
}
