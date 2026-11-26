// src/render/fantasy/balloons.ts

import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { ResolvedDecorPlacement } from '../../courses/fantasyLandDecor';
import {
  countGeometryTriangles,
  setGeometrySwatch,
  SWATCH,
  type FantasyDecorMaterials,
  type FantasyDecorModule,
} from './decorMaterials';

interface BalloonState {
  baseX: number;
  baseY: number;
  baseZ: number;
  scale: number;
  yaw: number;
  phase: number;
  orbitRadius: number;
}

function buildBalloonEnvelopeGeometry(isMobile: boolean): THREE.BufferGeometry {
  const points = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(1.4, 1.3),
    new THREE.Vector2(2.8, 3.6),
    new THREE.Vector2(3.5, 5.8),
    new THREE.Vector2(3.1, 7.6),
    new THREE.Vector2(1.7, 8.8),
    new THREE.Vector2(0.0, 9.2),
  ];
  const geom = new THREE.LatheGeometry(points, isMobile ? 10 : 16);
  geom.translate(0, 1.6, 0);
  geom.computeVertexNormals();
  return geom;
}

export function buildBalloonsLandmark(
  placements: readonly ResolvedDecorPlacement[],
  mats: FantasyDecorMaterials,
  shadowsEnabled: boolean,
  quality: 'high' | 'medium' | 'mobile',
): FantasyDecorModule {
  const group = new THREE.Group();
  group.name = 'FantasyBalloonsGroup';

  if (placements.length === 0) {
    return {
      group,
      update(): void {},
      dispose(): void {},
      getTriangleCount: () => 0,
      getDrawCallCount: () => 0,
    };
  }

  const isMobile = quality === 'mobile';
  const envelopeGeom = buildBalloonEnvelopeGeometry(isMobile);
  const basketGeom = setGeometrySwatch(new THREE.BoxGeometry(1.7, 1.5, 1.7), SWATCH.BALLOON_BASKET);

  const envelopeInst = new THREE.InstancedMesh(envelopeGeom, mats.instancedColorMat, placements.length);
  const basketInst = new THREE.InstancedMesh(basketGeom, mats.paletteMat, placements.length);
  envelopeInst.castShadow = shadowsEnabled;
  basketInst.castShadow = false;

  const balloonColors = CONFIG.fantasy.palette.balloonColors;
  const tmpColor = new THREE.Color();
  const states: BalloonState[] = placements.map((p, idx) => {
    tmpColor.set(balloonColors[idx % balloonColors.length]);
    envelopeInst.setColorAt(idx, tmpColor);
    return {
      baseX: p.position.x,
      baseY: p.position.y,
      baseZ: p.position.z,
      scale: p.spec.scale,
      yaw: p.yaw,
      phase: idx * 0.92,
      orbitRadius: 2.2 + (idx % 3) * 1.1,
    };
  });
  if (envelopeInst.instanceColor) envelopeInst.instanceColor.needsUpdate = true;

  group.add(envelopeInst, basketInst);

  const dummy = new THREE.Object3D();
  const bobSpeed = CONFIG.fantasy.animSpeeds.balloonBobSpeed;
  const driftSpeed = CONFIG.fantasy.animSpeeds.balloonDriftSpeed;

  function syncMatrices(timeSec: number): void {
    for (let i = 0; i < states.length; i++) {
      const b = states[i];
      const bobY = Math.sin(timeSec * bobSpeed + b.phase) * 2.4;
      const dx = Math.cos(timeSec * driftSpeed + b.phase) * b.orbitRadius;
      const dz = Math.sin(timeSec * driftSpeed + b.phase) * b.orbitRadius;

      dummy.position.set(b.baseX + dx, b.baseY + bobY, b.baseZ + dz);
      dummy.rotation.set(0, b.yaw + timeSec * 0.08, 0);
      dummy.scale.setScalar(b.scale);
      dummy.updateMatrix();
      envelopeInst.setMatrixAt(i, dummy.matrix);
      basketInst.setMatrixAt(i, dummy.matrix);
    }
    envelopeInst.instanceMatrix.needsUpdate = true;
    basketInst.instanceMatrix.needsUpdate = true;
  }

  syncMatrices(0);
  envelopeInst.computeBoundingSphere();
  basketInst.computeBoundingSphere();

  const totalTriangles =
    (countGeometryTriangles(envelopeGeom) + countGeometryTriangles(basketGeom)) * placements.length;

  return {
    group,
    update(timeSec: number): void {
      syncMatrices(timeSec);
    },
    dispose(): void {
      envelopeInst.dispose();
      basketInst.dispose();
      envelopeGeom.dispose();
      basketGeom.dispose();
    },
    getTriangleCount(): number {
      return totalTriangles;
    },
    getDrawCallCount(): number {
      return 2;
    },
  };
}
