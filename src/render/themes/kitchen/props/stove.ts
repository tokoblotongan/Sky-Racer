// src/render/themes/kitchen/props/stove.ts
// Giant stove props for Tikungan Kompor: vivid magenta-red glowing burner coils and front knob bar.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GraphicsPreset } from '../../../../config';
import { createSurfaceMaterial } from '../../../materialFactory';

export interface StoveBuildHandle {
  readonly group: THREE.Group;
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

export interface StoveBurnerSpec {
  readonly pos: THREE.Vector3;
  readonly rotation: number;
  readonly scale: number;
}

export function buildStoveBurnersBatch(
  burners: readonly StoveBurnerSpec[],
  baseColor: string,
  glowColor: string,
  graphicsPreset: GraphicsPreset,
  receiveShadows: boolean,
): StoveBuildHandle {
  const group = new THREE.Group();
  group.name = 'KitchenStoveBurnersBatch';

  const baseGeoms: THREE.BufferGeometry[] = [];
  const dish = new THREE.CylinderGeometry(10.2, 10.6, 1.8, 22);
  dish.translate(0, 0.9, 0);
  baseGeoms.push(dish);
  const hub = new THREE.CylinderGeometry(2.2, 2.5, 2.3, 14);
  hub.translate(0, 1.15, 0);
  baseGeoms.push(hub);
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2 + Math.PI * 0.25;
    const arm = new THREE.BoxGeometry(7.8, 0.8, 0.9);
    arm.rotateY(ang);
    arm.translate(Math.cos(ang) * 5.6, 2.4, -Math.sin(ang) * 5.6);
    baseGeoms.push(arm);
  }
  const baseGeom = mergeNormalized(baseGeoms);

  const coilGeoms: THREE.BufferGeometry[] = [];
  for (const r of [4.2, 6.4, 8.5]) {
    const ring = new THREE.TorusGeometry(r, 0.46, 8, 24);
    ring.rotateX(Math.PI * 0.5);
    ring.translate(0, 2.0, 0);
    coilGeoms.push(ring);
  }
  const coilGeom = mergeNormalized(coilGeoms);

  const baseMat = createSurfaceMaterial(graphicsPreset, {
    color: baseColor,
    roughness: 0.35,
    metalness: 0.35,
    fog: false,
  });
  const coilMat = createSurfaceMaterial(graphicsPreset, {
    color: glowColor,
    emissive: glowColor,
    emissiveIntensity: graphicsPreset === 'hemat' ? 1.5 : 2.1,
    roughness: 0.2,
    metalness: 0.05,
    fog: false,
  });

  const baseInst = new THREE.InstancedMesh(baseGeom, baseMat, burners.length);
  baseInst.receiveShadow = receiveShadows;
  const coilInst = new THREE.InstancedMesh(coilGeom, coilMat, burners.length);

  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const euler = new THREE.Euler();

  for (let i = 0; i < burners.length; i++) {
    const b = burners[i];
    euler.set(0, b.rotation, 0);
    q.setFromEuler(euler);
    s.setScalar(b.scale);
    mtx.compose(b.pos, q, s);
    baseInst.setMatrixAt(i, mtx);
    coilInst.setMatrixAt(i, mtx);
  }
  baseInst.instanceMatrix.needsUpdate = true;
  baseInst.computeBoundingSphere();
  coilInst.instanceMatrix.needsUpdate = true;
  coilInst.computeBoundingSphere();
  freezeStatic(baseInst);
  freezeStatic(coilInst);
  group.add(baseInst, coilInst);

  return {
    group,
    dispose(): void {
      baseInst.dispose();
      coilInst.dispose();
      baseGeom.dispose();
      coilGeom.dispose();
      baseMat.dispose();
      coilMat.dispose();
    },
  };
}

export function buildStoveBurner(
  pos: THREE.Vector3,
  rotation: number,
  scale: number,
  baseColor: string,
  glowColor: string,
  graphicsPreset: GraphicsPreset,
  receiveShadows: boolean,
): StoveBuildHandle {
  const group = new THREE.Group();
  group.name = 'KitchenStoveBurner';
  group.position.copy(pos);
  group.rotation.y = rotation;
  group.scale.setScalar(scale);

  // Dark slate enamel burner dish + 4 metallic grate fingers
  const baseGeoms: THREE.BufferGeometry[] = [];
  const dish = new THREE.CylinderGeometry(10.2, 10.6, 1.8, 22);
  dish.translate(0, 0.9, 0);
  baseGeoms.push(dish);

  const hub = new THREE.CylinderGeometry(2.2, 2.5, 2.3, 14);
  hub.translate(0, 1.15, 0);
  baseGeoms.push(hub);

  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2 + Math.PI * 0.25;
    const arm = new THREE.BoxGeometry(7.8, 0.8, 0.9);
    arm.rotateY(ang);
    arm.translate(Math.cos(ang) * 5.6, 2.4, -Math.sin(ang) * 5.6);
    baseGeoms.push(arm);
  }
  const baseGeom = mergeNormalized(baseGeoms);

  // Vivid magenta-red glowing coil rings (#FF1E5A, never orange)
  const coilGeoms: THREE.BufferGeometry[] = [];
  for (const r of [4.2, 6.4, 8.5]) {
    const ring = new THREE.TorusGeometry(r, 0.46, 8, 24);
    ring.rotateX(Math.PI * 0.5);
    ring.translate(0, 2.0, 0);
    coilGeoms.push(ring);
  }
  const coilGeom = mergeNormalized(coilGeoms);

  const baseMat = createSurfaceMaterial(graphicsPreset, {
    color: baseColor,
    roughness: 0.35,
    metalness: 0.35,
    fog: false,
  });
  const coilMat = createSurfaceMaterial(graphicsPreset, {
    color: glowColor,
    emissive: glowColor,
    emissiveIntensity: graphicsPreset === 'hemat' ? 1.5 : 2.1,
    roughness: 0.2,
    metalness: 0.05,
    fog: false,
  });

  const baseMesh = new THREE.Mesh(baseGeom, baseMat);
  baseMesh.receiveShadow = receiveShadows;
  const coilMesh = new THREE.Mesh(coilGeom, coilMat);
  group.add(baseMesh, coilMesh);
  freezeStatic(group);

  return {
    group,
    dispose(): void {
      baseGeom.dispose();
      coilGeom.dispose();
      baseMat.dispose();
      coilMat.dispose();
    },
  };
}

export function buildStoveKnobBar(
  pos: THREE.Vector3,
  rotation: number,
  scale: number,
  panelColor: string,
  graphicsPreset: GraphicsPreset,
  receiveShadows: boolean,
): StoveBuildHandle {
  const group = new THREE.Group();
  group.name = 'KitchenStoveKnobBar';
  group.position.copy(pos);
  group.rotation.y = rotation;
  group.scale.setScalar(scale);

  const panelGeom = new THREE.BoxGeometry(36, 6.2, 4.2);
  panelGeom.translate(0, 3.1, 0);
  const panelMat = createSurfaceMaterial(graphicsPreset, {
    color: panelColor,
    roughness: 0.32,
    metalness: 0.32,
    fog: false,
  });
  const panelMesh = new THREE.Mesh(panelGeom, panelMat);
  panelMesh.receiveShadow = receiveShadows;
  group.add(panelMesh);

  // Row of 5 big colorful stove knobs along the front
  const knobColors = ['#FF1E5A', '#FFD000', '#00E5FF', '#84CC16', '#A855F7'];
  const knobGeoms: THREE.BufferGeometry[] = [];
  const dial = new THREE.CylinderGeometry(2.1, 2.35, 1.8, 16);
  dial.rotateX(Math.PI * 0.5);
  knobGeoms.push(dial);
  const ridge = new THREE.BoxGeometry(0.65, 3.6, 2.2);
  ridge.translate(0, 0, 0.3);
  knobGeoms.push(ridge);
  const knobGeom = mergeNormalized(knobGeoms);

  const knobMat = createSurfaceMaterial(graphicsPreset, {
    color: 0xffffff,
    roughness: 0.24,
    metalness: 0.14,
    clearcoat: 0.85,
    physical: true,
    fog: false,
  });
  const knobInst = new THREE.InstancedMesh(knobGeom, knobMat, knobColors.length);
  const mtx = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, 1, 1);
  const col = new THREE.Color();

  for (let i = 0; i < knobColors.length; i++) {
    p.set(-13 + i * 6.5, 3.3, 2.6);
    q.setFromEuler(new THREE.Euler(0, 0, (i - 2) * 0.45));
    mtx.compose(p, q, s);
    knobInst.setMatrixAt(i, mtx);
    col.set(knobColors[i]);
    knobInst.setColorAt(i, col);
  }
  knobInst.instanceMatrix.needsUpdate = true;
  if (knobInst.instanceColor) knobInst.instanceColor.needsUpdate = true;
  knobInst.computeBoundingSphere();
  group.add(knobInst);
  freezeStatic(group);

  return {
    group,
    dispose(): void {
      knobInst.dispose();
      panelGeom.dispose();
      knobGeom.dispose();
      panelMat.dispose();
      knobMat.dispose();
    },
  };
}
