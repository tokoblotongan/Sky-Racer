// src/render/themes/kitchen/counter.ts
// Giant teal-and-white checker counter tabletop, edge trim, track stanchions, and lower checker floor.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GraphicsPreset } from '../../../config';
import type { Course } from '../../../core/course';
import { createSurfaceMaterial } from '../../materialFactory';
import type { KitchenTexturePack } from './textures';

export interface CounterLayoutMetrics {
  readonly cx: number;
  readonly cz: number;
  readonly counterW: number;
  readonly counterD: number;
  readonly roomW: number;
  readonly roomD: number;
  readonly floorY: number;
}

export interface KitchenCounterHandle {
  readonly group: THREE.Group;
  readonly metrics: CounterLayoutMetrics;
  getGroundY: (x: number, z: number) => number;
  dispose: () => void;
}

function mergeNormalized(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const prepared = geoms.map((g) => {
    const nonIdx = g.index ? g.toNonIndexed() : g.clone();
    if (!nonIdx.getAttribute('normal')) nonIdx.computeVertexNormals();
    if (!nonIdx.getAttribute('uv')) {
      const pos = nonIdx.getAttribute('position');
      nonIdx.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
    }
    return nonIdx;
  });
  const merged = mergeGeometries(prepared, false);
  for (const g of geoms) g.dispose();
  for (const g of prepared) g.dispose();
  if (!merged) return new THREE.BoxGeometry(1, 1, 1);
  merged.computeBoundingSphere();
  return merged;
}

function freezeStatic(obj: THREE.Object3D): void {
  obj.updateMatrix();
  obj.matrixAutoUpdate = false;
}

export function computeKitchenLayoutMetrics(course: Course): CounterLayoutMetrics {
  const bounds = course.getBounds();
  const cx = bounds.center.x;
  const cz = bounds.center.z;
  const spanX = bounds.max.x - bounds.min.x;
  const spanZ = bounds.max.z - bounds.min.z;
  const counterW = Math.ceil((spanX + 124) / 20) * 20;
  const counterD = Math.ceil((spanZ + 124) / 20) * 20;
  const roomW = counterW + 140;
  const roomD = counterD + 140;
  return {
    cx,
    cz,
    counterW,
    counterD,
    roomW,
    roomD,
    floorY: -34,
  };
}

export function buildKitchenCounter(
  course: Course,
  textures: KitchenTexturePack,
  graphicsPreset: GraphicsPreset,
  receiveShadows: boolean,
  castShadows: boolean,
): KitchenCounterHandle {
  const group = new THREE.Group();
  group.name = 'KitchenCounterAssembly';

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const instanced: THREE.InstancedMesh[] = [];

  const metrics = computeKitchenLayoutMetrics(course);
  const { cx, cz, counterW, counterD, roomW, roomD, floorY } = metrics;
  const halfCounterW = counterW * 0.5;
  const halfCounterD = counterD * 0.5;

  // 1. Giant Teal & White Checker Countertop (y = 0)
  const counterMat = createSurfaceMaterial(graphicsPreset, {
    map: textures.counterChecker,
    roughness: 0.4,
    metalness: 0.02,
    fog: false,
  });
  materials.push(counterMat);

  const counterTopGeom = new THREE.PlaneGeometry(counterW, counterD);
  counterTopGeom.rotateX(-Math.PI / 2);
  geometries.push(counterTopGeom);

  const counterTopMesh = new THREE.Mesh(counterTopGeom, counterMat);
  counterTopMesh.name = 'KitchenCounterFloor';
  counterTopMesh.position.set(cx, 0, cz);
  counterTopMesh.receiveShadow = receiveShadows;
  counterTopMesh.castShadow = false;
  freezeStatic(counterTopMesh);
  group.add(counterTopMesh);

  // 2. Counter Edge Trim + Under-Counter Cabinet Skirt down to lower floor
  const trimThickness = 4.2;
  const trimHeight = 5.4;
  const trimGeoms: THREE.BufferGeometry[] = [];
  const trimFront = new THREE.BoxGeometry(counterW + trimThickness * 2, trimHeight, trimThickness);
  trimFront.translate(cx, -trimHeight * 0.5, cz + halfCounterD + trimThickness * 0.45);
  trimGeoms.push(trimFront);
  const trimBack = new THREE.BoxGeometry(counterW + trimThickness * 2, trimHeight, trimThickness);
  trimBack.translate(cx, -trimHeight * 0.5, cz - halfCounterD - trimThickness * 0.45);
  trimGeoms.push(trimBack);
  const trimLeft = new THREE.BoxGeometry(trimThickness, trimHeight, counterD);
  trimLeft.translate(cx - halfCounterW - trimThickness * 0.45, -trimHeight * 0.5, cz);
  trimGeoms.push(trimLeft);
  const trimRight = new THREE.BoxGeometry(trimThickness, trimHeight, counterD);
  trimRight.translate(cx + halfCounterW + trimThickness * 0.45, -trimHeight * 0.5, cz);
  trimGeoms.push(trimRight);

  const trimGeom = mergeNormalized(trimGeoms);
  geometries.push(trimGeom);
  const trimMat = createSurfaceMaterial(graphicsPreset, {
    color: '#0F766E',
    roughness: 0.34,
    metalness: 0.08,
    fog: false,
  });
  materials.push(trimMat);
  const trimMesh = new THREE.Mesh(trimGeom, trimMat);
  trimMesh.name = 'KitchenCounterEdgeTrim';
  trimMesh.receiveShadow = receiveShadows;
  freezeStatic(trimMesh);
  group.add(trimMesh);

  const skirtHeight = Math.abs(floorY) - trimHeight;
  const skirtGeom = new THREE.BoxGeometry(counterW - 6, skirtHeight, counterD - 6);
  skirtGeom.translate(cx, -trimHeight - skirtHeight * 0.5, cz);
  geometries.push(skirtGeom);
  const skirtMat = createSurfaceMaterial(graphicsPreset, {
    color: '#E2E8F0',
    roughness: 0.55,
    metalness: 0.04,
    fog: false,
  });
  materials.push(skirtMat);
  const skirtMesh = new THREE.Mesh(skirtGeom, skirtMat);
  skirtMesh.name = 'KitchenCounterBase';
  skirtMesh.receiveShadow = receiveShadows;
  freezeStatic(skirtMesh);
  group.add(skirtMesh);

  // 3. Bright Checker Floor far below the counter edge (y = -34)
  const floorGeom = new THREE.PlaneGeometry(roomW, roomD);
  floorGeom.rotateX(-Math.PI / 2);
  geometries.push(floorGeom);
  const floorMat = createSurfaceMaterial(graphicsPreset, {
    map: textures.floorChecker,
    roughness: 0.48,
    metalness: 0.02,
    fog: false,
  });
  materials.push(floorMat);
  const floorMesh = new THREE.Mesh(floorGeom, floorMat);
  floorMesh.name = 'KitchenLowerFloor';
  floorMesh.position.set(cx, floorY, cz);
  floorMesh.receiveShadow = receiveShadows;
  freezeStatic(floorMesh);
  group.add(floorMesh);

  // 4. Track Support Stanchions grounding elevated spans cleanly to the counter
  const allRoutes = course.getAllRoutes();
  const clearanceCell = 12;
  const trackGrid = new Map<string, Array<{ x: number; y: number; z: number; hw: number }>>();
  for (const route of allRoutes) {
    const routeSamples = route.getSamples();
    for (let i = 0; i < routeSamples.length; i += 6) {
      const f = routeSamples[i];
      if (f.isGap) continue;
      const gx = Math.floor(f.position.x / clearanceCell);
      const gz = Math.floor(f.position.z / clearanceCell);
      const key = `${gx},${gz}`;
      let list = trackGrid.get(key);
      if (!list) {
        list = [];
        trackGrid.set(key, list);
      }
      list.push({
        x: f.position.x,
        y: f.position.y,
        z: f.position.z,
        hw: f.width * 0.5,
      });
    }
  }

  const supportSpots: Array<{ x: number; z: number; topY: number }> = [];
  for (const route of allRoutes) {
    const routeLen = route.getLength();
    for (let s = 30; s < routeLen - 22; s += 44) {
      if (route.isGapAt(s) || route.getStyleAt(s) === 'bridge') continue;
      if (route.routeId !== 'main' && (route.isRailGapAt(s, -1) || route.isRailGapAt(s, 1))) {
        continue;
      }
      const frame = route.getFrameAt(s);
      if (frame.position.y < 3.5 || frame.up.y < 0.6) continue;

      let blockedByLower = false;
      const gx = Math.floor(frame.position.x / clearanceCell);
      const gz = Math.floor(frame.position.z / clearanceCell);
      for (let dx = -2; dx <= 2 && !blockedByLower; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          const cell = trackGrid.get(`${gx + dx},${gz + dz}`);
          if (!cell) continue;
          for (const pt of cell) {
            if (
              pt.y < frame.position.y - 2 &&
              Math.hypot(frame.position.x - pt.x, frame.position.z - pt.z) < pt.hw + 3.6
            ) {
              blockedByLower = true;
              break;
            }
          }
        }
      }
      if (!blockedByLower) {
        supportSpots.push({
          x: frame.position.x,
          z: frame.position.z,
          topY: frame.position.y - 0.35,
        });
      }
    }
  }

  if (supportSpots.length > 0) {
    const colGeom = new THREE.CylinderGeometry(1.1, 1.35, 1, 10);
    const plinthGeom = new THREE.CylinderGeometry(2.0, 2.35, 1.3, 10);
    geometries.push(colGeom, plinthGeom);

    const colMat = createSurfaceMaterial(graphicsPreset, {
      color: '#F8FAFC',
      roughness: 0.4,
      metalness: 0.08,
      fog: false,
    });
    const plinthMat = createSurfaceMaterial(graphicsPreset, {
      color: '#0A5CFF',
      roughness: 0.36,
      metalness: 0.1,
      fog: false,
    });
    materials.push(colMat, plinthMat);

    const colInst = new THREE.InstancedMesh(colGeom, colMat, supportSpots.length);
    const plinthInst = new THREE.InstancedMesh(plinthGeom, plinthMat, supportSpots.length);
    colInst.castShadow = castShadows;
    colInst.receiveShadow = receiveShadows;
    plinthInst.castShadow = castShadows;
    plinthInst.receiveShadow = receiveShadows;
    instanced.push(colInst, plinthInst);

    const mtx = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();

    for (let i = 0; i < supportSpots.length; i++) {
      const spot = supportSpots[i];
      pos.set(spot.x, 0.65, spot.z);
      scl.set(1, 1, 1);
      mtx.compose(pos, quat, scl);
      plinthInst.setMatrixAt(i, mtx);

      const h = Math.max(1.2, spot.topY - 0.55);
      pos.set(spot.x, 0.55 + h * 0.5, spot.z);
      scl.set(1, h, 1);
      mtx.compose(pos, quat, scl);
      colInst.setMatrixAt(i, mtx);
    }

    colInst.instanceMatrix.needsUpdate = true;
    colInst.computeBoundingSphere();
    plinthInst.instanceMatrix.needsUpdate = true;
    plinthInst.computeBoundingSphere();
    freezeStatic(colInst);
    freezeStatic(plinthInst);
    group.add(plinthInst, colInst);
  }

  return {
    group,
    metrics,
    getGroundY(x: number, z: number): number {
      const insideX = Math.abs(x - cx) <= halfCounterW;
      const insideZ = Math.abs(z - cz) <= halfCounterD;
      return insideX && insideZ ? 0 : floorY;
    },
    dispose(): void {
      for (const im of instanced) im.dispose();
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
