// src/render/fantasy/castle.ts

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

interface FlagAnimAnchor {
  x: number;
  y: number;
  z: number;
  phase: number;
}

export function buildCastleLandmark(
  placement: ResolvedDecorPlacement,
  mats: FantasyDecorMaterials,
  shadowsEnabled: boolean,
): FantasyDecorModule {
  const group = new THREE.Group();
  group.name = 'FantasyCastleGroup';

  const isSimple = placement.spec.variant === 'simple';
  const scale = placement.spec.scale;
  const segCount = isSimple ? 10 : 16;

  const parts: THREE.BufferGeometry[] = [];
  const goldParts: THREE.BufferGeometry[] = [];
  const flagAnchors: FlagAnimAnchor[] = [];

  const addSwatched = (geom: THREE.BufferGeometry, swatch: number, tx = 0, ty = 0, tz = 0): void => {
    geom.translate(tx, ty, tz);
    parts.push(setGeometrySwatch(geom, swatch));
  };

  const addGold = (geom: THREE.BufferGeometry, tx = 0, ty = 0, tz = 0): void => {
    geom.translate(tx, ty, tz);
    goldParts.push(setGeometrySwatch(geom, SWATCH.GOLD));
  };

  // Grand terraced foundation plinth
  addSwatched(new THREE.CylinderGeometry(28, 30.5, 4, isSimple ? 12 : 24), SWATCH.CASTLE_TRIM, 0, 2, 0);
  addSwatched(new THREE.BoxGeometry(38, 6, 32), SWATCH.CASTLE_WALL, 0, 7, 0);

  // Curtain walls & corner towers
  const cornerSpecs: Array<{ x: number; z: number; h: number; r: number; roof: number }> = [
    { x: -16, z: -13, h: 24, r: 4.2, roof: SWATCH.ROOF_BLUE },
    { x: 16, z: -13, h: 24, r: 4.2, roof: SWATCH.ROOF_BLUE },
    { x: -16, z: 13, h: 28, r: 4.5, roof: SWATCH.ROOF_RED },
    { x: 16, z: 13, h: 28, r: 4.5, roof: SWATCH.ROOF_RED },
  ];

  // Outer perimeter walls
  addSwatched(new THREE.BoxGeometry(32, 16, 3.2), SWATCH.CASTLE_WALL, 0, 12, -13);
  addSwatched(new THREE.BoxGeometry(3.2, 16, 26), SWATCH.CASTLE_WALL, -16, 12, 0);
  addSwatched(new THREE.BoxGeometry(3.2, 16, 26), SWATCH.CASTLE_WALL, 16, 12, 0);
  // Front gate flanks + arch lintel
  addSwatched(new THREE.BoxGeometry(10.5, 17, 3.6), SWATCH.CASTLE_WALL, -10.5, 12.5, 13);
  addSwatched(new THREE.BoxGeometry(10.5, 17, 3.6), SWATCH.CASTLE_WALL, 10.5, 12.5, 13);
  addSwatched(new THREE.BoxGeometry(12, 6, 4.0), SWATCH.CASTLE_TRIM, 0, 18.5, 13);
  addSwatched(new THREE.BoxGeometry(7.2, 11.5, 2.2), SWATCH.WINDOW_DARK, 0, 9.75, 12.6);

  // Corner towers + sharp conical roofs + spires + flag anchors
  cornerSpecs.forEach((t, idx) => {
    addSwatched(new THREE.CylinderGeometry(t.r, t.r * 1.08, t.h, segCount), SWATCH.CASTLE_WALL, t.x, 4 + t.h * 0.5, t.z);
    addSwatched(new THREE.CylinderGeometry(t.r * 1.16, t.r * 1.05, 1.8, segCount), SWATCH.CASTLE_TRIM, t.x, 4 + t.h + 0.4, t.z);
    const roofH = t.r * 3.1;
    addSwatched(new THREE.ConeGeometry(t.r * 1.32, roofH, segCount), t.roof, t.x, 4 + t.h + 1.2 + roofH * 0.5, t.z);
    const spireTop = 4 + t.h + 1.2 + roofH;
    addGold(new THREE.CylinderGeometry(0.16, 0.24, 4.2, 6), t.x, spireTop + 2.1, t.z);
    addGold(new THREE.SphereGeometry(0.45, 8, 6), t.x, spireTop + 0.4, t.z);
    flagAnchors.push({ x: t.x, y: spireTop + 3.9, z: t.z, phase: idx * 1.35 });
  });

  // Central Tall Citadel Keep & flanking high turrets
  addSwatched(new THREE.BoxGeometry(16, 30, 14), SWATCH.CASTLE_WALL, 0, 23, -1);
  addSwatched(new THREE.BoxGeometry(17.2, 2.2, 15.2), SWATCH.CASTLE_TRIM, 0, 38.2, -1);
  addSwatched(new THREE.CylinderGeometry(6.2, 6.6, 16, segCount), SWATCH.CASTLE_WALL, 0, 46, -1);
  addSwatched(new THREE.ConeGeometry(7.6, 20, segCount), SWATCH.ROOF_PURPLE, 0, 64, -1);
  addGold(new THREE.CylinderGeometry(0.22, 0.34, 6.5, 6), 0, 77, -1);
  addGold(new THREE.OctahedronGeometry(0.95, 0), 0, 80.5, -1);
  flagAnchors.push({ x: 0, y: 79.5, z: -1, phase: 0.4 });

  if (!isSimple) {
    const innerTurrets: Array<{ x: number; z: number; h: number; roof: number }> = [
      { x: -8.2, z: 5.5, h: 24, roof: SWATCH.ROOF_PURPLE },
      { x: 8.2, z: 5.5, h: 24, roof: SWATCH.ROOF_PURPLE },
      { x: -8.5, z: -7.5, h: 26, roof: SWATCH.ROOF_BLUE },
      { x: 8.5, z: -7.5, h: 26, roof: SWATCH.ROOF_RED },
    ];
    innerTurrets.forEach((it, idx) => {
      addSwatched(new THREE.CylinderGeometry(3.1, 3.3, it.h, segCount), SWATCH.CASTLE_WALL, it.x, 22 + it.h * 0.5, it.z);
      addSwatched(new THREE.ConeGeometry(3.9, 11, segCount), it.roof, it.x, 22 + it.h + 5.5, it.z);
      const topY = 22 + it.h + 11;
      addGold(new THREE.CylinderGeometry(0.14, 0.2, 3.6, 6), it.x, topY + 1.8, it.z);
      flagAnchors.push({ x: it.x, y: topY + 3.4, z: it.z, phase: 2.2 + idx * 0.9 });
    });

    // Rose arch windows on keep front & flanks
    addSwatched(new THREE.BoxGeometry(3.2, 6.5, 0.8), SWATCH.WINDOW_DARK, 0, 31, 6.1);
    addSwatched(new THREE.BoxGeometry(2.2, 5.0, 0.8), SWATCH.WINDOW_DARK, -4.6, 30, 6.1);
    addSwatched(new THREE.BoxGeometry(2.2, 5.0, 0.8), SWATCH.WINDOW_DARK, 4.6, 30, 6.1);
  }

  const castleGeom = mergeNormalizedGeometries([...parts, ...goldParts]);
  const castleMesh = new THREE.Mesh(castleGeom, mats.paletteMat);
  castleMesh.castShadow = shadowsEnabled;
  castleMesh.receiveShadow = shadowsEnabled;
  group.add(castleMesh);

  // Small fluttering pennant flags on tower spires via InstancedMesh
  const bannerShape = new THREE.Shape();
  bannerShape.moveTo(0, 0);
  bannerShape.lineTo(3.8, -0.65);
  bannerShape.lineTo(0, -1.35);
  bannerShape.closePath();
  const flagGeom = new THREE.ExtrudeGeometry(bannerShape, { depth: 0.08, bevelEnabled: false });
  flagGeom.translate(0.1, 0, -0.04);

  const flagInst = new THREE.InstancedMesh(flagGeom, mats.instancedColorMat, flagAnchors.length);
  flagInst.castShadow = false;
  const flagColors = CONFIG.fantasy.palette.castleFlagColors;
  const tmpColor = new THREE.Color();
  for (let i = 0; i < flagAnchors.length; i++) {
    tmpColor.set(flagColors[i % flagColors.length]);
    flagInst.setColorAt(i, tmpColor);
  }
  if (flagInst.instanceColor) flagInst.instanceColor.needsUpdate = true;
  group.add(flagInst);

  group.position.set(placement.position.x, placement.position.y, placement.position.z);
  group.rotation.y = placement.yaw;
  group.scale.setScalar(scale);

  const dummy = new THREE.Object3D();
  const waveSpeed = CONFIG.fantasy.animSpeeds.flagWaveSpeed;

  function syncFlags(timeSec: number): void {
    for (let i = 0; i < flagAnchors.length; i++) {
      const a = flagAnchors[i];
      dummy.position.set(a.x, a.y, a.z);
      dummy.rotation.set(
        Math.sin(timeSec * waveSpeed * 1.2 + a.phase) * 0.06,
        Math.sin(timeSec * waveSpeed + a.phase) * 0.34,
        Math.cos(timeSec * waveSpeed * 0.9 + a.phase) * 0.05,
      );
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      flagInst.setMatrixAt(i, dummy.matrix);
    }
    flagInst.instanceMatrix.needsUpdate = true;
  }

  syncFlags(0);

  const totalTriangles =
    countGeometryTriangles(castleGeom) +
    countGeometryTriangles(flagGeom) * flagAnchors.length;

  return {
    group,
    update(timeSec: number): void {
      syncFlags(timeSec);
    },
    dispose(): void {
      castleGeom.dispose();
      flagGeom.dispose();
    },
    getTriangleCount(): number {
      return totalTriangles;
    },
    getDrawCallCount(): number {
      return 2;
    },
  };
}
