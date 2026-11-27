// src/render/themes/kitchen/props/food.ts
// Giant food & counter appliance props: salt & pepper shakers, fruit bowl with instanced fruit, toaster & rolling pin geometries.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GraphicsPreset } from '../../../../config';
import { createSurfaceMaterial } from '../../../materialFactory';

export interface FoodBuildHandle {
  readonly group: THREE.Group;
  dispose: () => void;
}

export interface CounterApplianceGeometryPack {
  readonly toasterGeom: THREE.BufferGeometry;
  readonly rollingPinGeom: THREE.BufferGeometry;
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

export function buildShaker(
  name: string,
  pos: THREE.Vector3,
  rotation: number,
  scale: number,
  bodyColor: string,
  capColor: string,
  graphicsPreset: GraphicsPreset,
  receiveShadows: boolean,
  castShadows: boolean,
): FoodBuildHandle {
  const group = new THREE.Group();
  group.name = name;
  group.position.copy(pos);
  group.rotation.y = rotation;
  group.scale.setScalar(scale);

  const bodyGeoms: THREE.BufferGeometry[] = [];
  const lower = new THREE.CylinderGeometry(3.2, 3.6, 15.5, 10);
  lower.translate(0, 7.75, 0);
  bodyGeoms.push(lower);
  const foot = new THREE.CylinderGeometry(3.75, 3.85, 1.4, 10);
  foot.translate(0, 0.7, 0);
  bodyGeoms.push(foot);
  const bodyGeom = mergeNormalized(bodyGeoms);

  const capGeoms: THREE.BufferGeometry[] = [];
  const neck = new THREE.CylinderGeometry(2.75, 3.1, 1.4, 12);
  neck.translate(0, 16.0, 0);
  capGeoms.push(neck);
  const dome = new THREE.SphereGeometry(2.8, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
  dome.translate(0, 16.5, 0);
  capGeoms.push(dome);
  const capGeom = mergeNormalized(capGeoms);

  const bodyMat = createSurfaceMaterial(graphicsPreset, {
    color: bodyColor,
    roughness: 0.24,
    metalness: 0.08,
    clearcoat: 0.85,
    physical: true,
    fog: false,
  });
  const capMat = createSurfaceMaterial(graphicsPreset, {
    color: capColor,
    roughness: 0.22,
    metalness: 0.52,
    clearcoat: 0.8,
    physical: true,
    fog: false,
  });

  const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
  bodyMesh.castShadow = castShadows;
  bodyMesh.receiveShadow = receiveShadows;
  const capMesh = new THREE.Mesh(capGeom, capMat);
  capMesh.castShadow = castShadows;
  group.add(bodyMesh, capMesh);
  freezeStatic(group);

  return {
    group,
    dispose(): void {
      bodyGeom.dispose();
      capGeom.dispose();
      bodyMat.dispose();
      capMat.dispose();
    },
  };
}

export function buildFruitBowl(
  pos: THREE.Vector3,
  rotation: number,
  scale: number,
  bowlColor: string,
  rimColor: string,
  graphicsPreset: GraphicsPreset,
  receiveShadows: boolean,
  castShadows: boolean,
): FoodBuildHandle {
  const group = new THREE.Group();
  group.name = 'KitchenFruitBowl';
  group.position.copy(pos);
  group.rotation.y = rotation;
  group.scale.setScalar(scale);

  // Scalloped ceramic bowl via LatheGeometry
  const lathePts = [
    new THREE.Vector2(0, 0.2),
    new THREE.Vector2(3.6, 0.2),
    new THREE.Vector2(4.0, 1.2),
    new THREE.Vector2(6.5, 3.8),
    new THREE.Vector2(7.8, 6.2),
    new THREE.Vector2(7.3, 6.4),
    new THREE.Vector2(5.9, 3.8),
    new THREE.Vector2(3.4, 1.4),
    new THREE.Vector2(0, 1.2),
  ];
  const bowlGeom = new THREE.LatheGeometry(lathePts, 18);
  const rimGeom = new THREE.TorusGeometry(7.6, 0.38, 8, 20);
  rimGeom.rotateX(Math.PI * 0.5);
  rimGeom.translate(0, 6.3, 0);

  const bowlMat = createSurfaceMaterial(graphicsPreset, {
    color: bowlColor,
    roughness: 0.22,
    metalness: 0.08,
    clearcoat: 0.85,
    physical: true,
    fog: false,
  });
  const rimMat = createSurfaceMaterial(graphicsPreset, {
    color: rimColor,
    roughness: 0.25,
    metalness: 0.12,
    fog: false,
  });

  const bowlMesh = new THREE.Mesh(bowlGeom, bowlMat);
  bowlMesh.castShadow = castShadows;
  bowlMesh.receiveShadow = receiveShadows;
  const rimMesh = new THREE.Mesh(rimGeom, rimMat);
  group.add(bowlMesh, rimMesh);

  // Instanced big colorful fruit inside the bowl: red apples, yellow lemons, lime greens
  const fruitGeom = new THREE.SphereGeometry(2.1, 12, 10);
  const fruitMat = createSurfaceMaterial(graphicsPreset, {
    color: 0xffffff,
    roughness: 0.24,
    metalness: 0.04,
    clearcoat: 0.85,
    physical: true,
    fog: false,
  });

  const fruitSpecs = [
    { x: -2.6, y: 3.8, z: -1.8, sx: 1.05, sy: 0.96, sz: 1.05, color: '#FF2D3D' }, // apple red
    { x: 2.5, y: 3.7, z: -1.6, sx: 1.28, sy: 0.88, sz: 0.88, color: '#FFD000' }, // lemon yellow
    { x: 0.1, y: 3.9, z: 2.6, sx: 0.95, sy: 0.9, sz: 0.95, color: '#84CC16' }, // lime green
    { x: -2.8, y: 4.1, z: 2.1, sx: 1.25, sy: 0.86, sz: 0.86, color: '#FFD000' },
    { x: 2.9, y: 4.2, z: 2.0, sx: 1.08, sy: 0.98, sz: 1.08, color: '#FF2D3D' },
    { x: 0.0, y: 4.4, z: -2.7, sx: 0.92, sy: 0.86, sz: 0.92, color: '#84CC16' },
    { x: -1.2, y: 6.4, z: 0.4, sx: 1.08, sy: 0.98, sz: 1.08, color: '#FF2D3D' },
    { x: 1.8, y: 6.3, z: -0.3, sx: 1.24, sy: 0.88, sz: 0.88, color: '#FFD000' },
    { x: 0.2, y: 7.4, z: -0.6, sx: 0.98, sy: 0.94, sz: 0.98, color: '#84CC16' },
  ];

  const fruitInst = new THREE.InstancedMesh(fruitGeom, fruitMat, fruitSpecs.length);
  fruitInst.castShadow = castShadows;
  fruitInst.receiveShadow = receiveShadows;
  const mtx = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const col = new THREE.Color();

  for (let i = 0; i < fruitSpecs.length; i++) {
    const f = fruitSpecs[i];
    p.set(f.x, f.y, f.z);
    q.setFromEuler(new THREE.Euler(i * 0.4, i * 1.1, i * 0.3));
    s.set(f.sx, f.sy, f.sz);
    mtx.compose(p, q, s);
    fruitInst.setMatrixAt(i, mtx);
    col.set(f.color);
    fruitInst.setColorAt(i, col);
  }
  fruitInst.instanceMatrix.needsUpdate = true;
  if (fruitInst.instanceColor) fruitInst.instanceColor.needsUpdate = true;
  fruitInst.computeBoundingSphere();
  group.add(fruitInst);
  freezeStatic(group);

  return {
    group,
    dispose(): void {
      fruitInst.dispose();
      bowlGeom.dispose();
      rimGeom.dispose();
      fruitGeom.dispose();
      bowlMat.dispose();
      rimMat.dispose();
      fruitMat.dispose();
    },
  };
}

export function createCounterApplianceFillGeometries(): CounterApplianceGeometryPack {
  // Generic rounded-top toaster box shape (no brands/logos)
  const toasterParts: THREE.BufferGeometry[] = [];
  const body = new THREE.BoxGeometry(6.8, 5.6, 4.6);
  body.translate(0, 2.8, 0);
  toasterParts.push(body);
  const topCrown = new THREE.CylinderGeometry(2.3, 2.3, 6.8, 10, 1, false, 0, Math.PI);
  topCrown.rotateZ(Math.PI * 0.5);
  topCrown.translate(0, 5.6, 0);
  toasterParts.push(topCrown);
  const lever = new THREE.BoxGeometry(0.8, 0.7, 1.4);
  lever.translate(3.7, 3.6, 0);
  toasterParts.push(lever);
  const toasterGeom = mergeNormalized(toasterParts);

  // Toy bright-colored rolling pin (no brown wood!)
  const pinParts: THREE.BufferGeometry[] = [];
  const roller = new THREE.CylinderGeometry(1.55, 1.55, 6.4, 12);
  roller.rotateZ(Math.PI * 0.5);
  roller.translate(0, 1.55, 0);
  pinParts.push(roller);
  for (const side of [-1, 1]) {
    const handle = new THREE.CylinderGeometry(0.65, 0.78, 2.4, 10);
    handle.rotateZ(Math.PI * 0.5);
    handle.translate(side * 4.4, 1.55, 0);
    pinParts.push(handle);
  }
  const rollingPinGeom = mergeNormalized(pinParts);

  return {
    toasterGeom,
    rollingPinGeom,
    dispose(): void {
      toasterGeom.dispose();
      rollingPinGeom.dispose();
    },
  };
}
