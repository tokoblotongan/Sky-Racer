// src/render/fantasy/crystals.ts

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

interface CrystalInstanceData {
  x: number;
  y: number;
  z: number;
  scale: number;
  yaw: number;
  tiltX: number;
  tiltZ: number;
  phase: number;
  isPortal: boolean;
}

function buildCrystalClusterGeometry(): THREE.BufferGeometry {
  const shards: THREE.BufferGeometry[] = [];
  const specs = [
    { rx: 0, rz: 0, h: 11.5, rad: 1.55, ox: 0, oz: 0 },
    { rx: 0.24, rz: -0.18, h: 8.2, rad: 1.15, ox: -1.3, oz: 0.6 },
    { rx: -0.2, rz: 0.26, h: 7.4, rad: 1.05, ox: 1.35, oz: -0.45 },
    { rx: 0.14, rz: 0.28, h: 5.6, rad: 0.85, ox: 0.55, oz: 1.25 },
  ];

  for (const sp of specs) {
    const body = new THREE.CylinderGeometry(sp.rad * 0.52, sp.rad, sp.h * 0.72, 6);
    body.translate(0, sp.h * 0.36, 0);
    const tip = new THREE.ConeGeometry(sp.rad * 0.52, sp.h * 0.28, 6);
    tip.translate(0, sp.h * 0.72 + sp.h * 0.14, 0);
    const shard = mergeNormalizedGeometries([body, tip]);
    shard.rotateX(sp.rx);
    shard.rotateZ(sp.rz);
    shard.translate(sp.ox, 0, sp.oz);
    shards.push(shard);
  }

  return mergeNormalizedGeometries(shards);
}

export function buildCrystalsLandmark(
  placements: readonly ResolvedDecorPlacement[],
  mats: FantasyDecorMaterials,
  shadowsEnabled: boolean,
): FantasyDecorModule {
  const group = new THREE.Group();
  group.name = 'FantasyCrystalsGroup';

  const cyanItems: CrystalInstanceData[] = [];
  const magentaItems: CrystalInstanceData[] = [];
  const yellowItems: CrystalInstanceData[] = [];
  const plinthItems: Array<{ x: number; z: number; height: number; radius: number }> = [];

  placements.forEach((p, idx) => {
    const isPortal = p.spec.variant.startsWith('portal');
    const item: CrystalInstanceData = {
      x: p.position.x,
      y: p.position.y,
      z: p.position.z,
      scale: p.spec.scale,
      yaw: p.yaw,
      tiltX: ((idx % 3) - 1) * 0.06,
      tiltZ: (((idx + 1) % 3) - 1) * 0.06,
      phase: idx * 0.75,
      isPortal,
    };

    if (p.spec.variant.includes('magenta')) {
      magentaItems.push(item);
    } else if (p.spec.variant.includes('yellow')) {
      yellowItems.push(item);
    } else {
      cyanItems.push(item);
    }

    if (p.position.y > 1.0) {
      plinthItems.push({
        x: p.position.x,
        z: p.position.z,
        height: p.position.y + 0.6,
        radius: 2.3 * p.spec.scale,
      });
    }
  });

  const crystalGeom = buildCrystalClusterGeometry();
  const crystalTris = countGeometryTriangles(crystalGeom);
  const plinthGeom = setGeometrySwatch(new THREE.CylinderGeometry(0.85, 1.35, 1, 8), SWATCH.CRYSTAL_PLINTH);
  const plinthTris = countGeometryTriangles(plinthGeom);

  const dummy = new THREE.Object3D();
  const animatedMeshes: Array<{ inst: THREE.InstancedMesh; items: CrystalInstanceData[] }> = [];
  let drawCallCount = 0;
  let totalTriangles = 0;

  const createBucket = (items: CrystalInstanceData[], mat: THREE.Material, label: string): void => {
    if (items.length === 0) return;
    const inst = new THREE.InstancedMesh(crystalGeom, mat, items.length);
    inst.name = label;
    inst.castShadow = shadowsEnabled;
    inst.receiveShadow = false;
    items.forEach((it, i) => {
      dummy.position.set(it.x, it.y, it.z);
      dummy.rotation.set(it.tiltX, it.yaw, it.tiltZ);
      dummy.scale.setScalar(it.scale);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    group.add(inst);
    animatedMeshes.push({ inst, items });
    drawCallCount++;
    totalTriangles += crystalTris * items.length;
  };

  createBucket(cyanItems, mats.crystalCyanMat, 'FantasyCrystalsCyan');
  createBucket(magentaItems, mats.crystalMagentaMat, 'FantasyCrystalsMagenta');
  createBucket(yellowItems, mats.crystalYellowMat, 'FantasyCrystalsYellow');

  if (plinthItems.length > 0) {
    const plinthInst = new THREE.InstancedMesh(plinthGeom, mats.paletteMat, plinthItems.length);
    plinthInst.name = 'FantasyCrystalPlinths';
    plinthInst.castShadow = shadowsEnabled;
    plinthInst.receiveShadow = shadowsEnabled;
    plinthItems.forEach((pl, i) => {
      dummy.position.set(pl.x, pl.height * 0.5, pl.z);
      dummy.rotation.set(0, i * 0.7, 0);
      dummy.scale.set(pl.radius, pl.height, pl.radius);
      dummy.updateMatrix();
      plinthInst.setMatrixAt(i, dummy.matrix);
    });
    plinthInst.instanceMatrix.needsUpdate = true;
    plinthInst.computeBoundingSphere();
    plinthInst.matrixAutoUpdate = false;
    plinthInst.updateMatrix();
    group.add(plinthInst);
    drawCallCount++;
    totalTriangles += plinthTris * plinthItems.length;
  }

  const pulseSpeed = CONFIG.fantasy.animSpeeds.crystalPulseSpeed;

  return {
    group,
    update(timeSec: number): void {
      const pulse = Math.sin(timeSec * pulseSpeed);
      mats.crystalCyanMat.emissiveIntensity = 0.85 + 0.25 * pulse;
      mats.crystalMagentaMat.emissiveIntensity = 0.85 + 0.25 * Math.sin(timeSec * pulseSpeed + 2.1);
      mats.crystalYellowMat.emissiveIntensity = 0.85 + 0.25 * Math.sin(timeSec * pulseSpeed + 4.2);

      // Gentle scale breathe on ring crystals
      for (const bucket of animatedMeshes) {
        let dirty = false;
        for (let i = 0; i < bucket.items.length; i++) {
          const it = bucket.items[i];
          if (it.isPortal) continue;
          const bob = Math.sin(timeSec * 0.9 + it.phase) * 0.25;
          dummy.position.set(it.x, it.y + bob, it.z);
          dummy.rotation.set(it.tiltX, it.yaw, it.tiltZ);
          dummy.scale.setScalar(it.scale);
          dummy.updateMatrix();
          bucket.inst.setMatrixAt(i, dummy.matrix);
          dirty = true;
        }
        if (dirty) {
          bucket.inst.instanceMatrix.needsUpdate = true;
        }
      }
    },
    dispose(): void {
      crystalGeom.dispose();
      plinthGeom.dispose();
    },
    getTriangleCount(): number {
      return totalTriangles;
    },
    getDrawCallCount(): number {
      return drawCallCount;
    },
  };
}
