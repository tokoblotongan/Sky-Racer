// src/render/themes/kitchen/props/tableware.ts
// Tableware props: checkered flags, stacked colorful plates tower, and reusable mug / measuring cup fill geometries.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GraphicsPreset } from '../../../../config';
import { createSurfaceMaterial } from '../../../materialFactory';

export interface TablewareBuildHandle {
  readonly group: THREE.Group;
  dispose: () => void;
}

export interface InstancedFillGeometryPack {
  readonly mugGeom: THREE.BufferGeometry;
  readonly cupGeom: THREE.BufferGeometry;
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

export interface CheckeredFlagSpec {
  readonly pos: THREE.Vector3;
  readonly rotation: number;
  readonly scale: number;
  readonly poleColor: string;
}

export function buildCheckeredFlagsBatch(
  flags: readonly CheckeredFlagSpec[],
  flagTex: THREE.CanvasTexture,
  graphicsPreset: GraphicsPreset,
  castShadows: boolean,
): TablewareBuildHandle {
  const group = new THREE.Group();
  group.name = 'KitchenCheckeredFlagsBatch';

  const poleGeoms: THREE.BufferGeometry[] = [];
  const base = new THREE.CylinderGeometry(1.1, 1.35, 1.2, 10);
  base.translate(0, 0.6, 0);
  poleGeoms.push(base);
  const pole = new THREE.CylinderGeometry(0.28, 0.34, 27, 10);
  pole.translate(0, 14.1, 0);
  poleGeoms.push(pole);
  const finial = new THREE.SphereGeometry(0.65, 10, 8);
  finial.translate(0, 27.9, 0);
  poleGeoms.push(finial);
  const poleGeom = mergeNormalized(poleGeoms);

  const flagGeom = new THREE.PlaneGeometry(7.2, 4.2, 4, 2);
  const pAttr = flagGeom.attributes.position;
  for (let i = 0; i < pAttr.count; i++) {
    const x = pAttr.getX(i);
    pAttr.setZ(i, Math.sin((x / 7.2 + 0.5) * Math.PI * 2) * 0.42);
  }
  flagGeom.computeVertexNormals();
  flagGeom.translate(3.6, 25.0, 0);

  const poleMat = createSurfaceMaterial(graphicsPreset, {
    color: 0xffffff,
    roughness: 0.25,
    metalness: 0.2,
    fog: false,
  });
  const flagMat = createSurfaceMaterial(graphicsPreset, {
    map: flagTex,
    roughness: 0.45,
    metalness: 0.0,
    side: THREE.DoubleSide,
    fog: false,
  });

  const poleInst = new THREE.InstancedMesh(poleGeom, poleMat, flags.length);
  poleInst.castShadow = castShadows;
  const flagInst = new THREE.InstancedMesh(flagGeom, flagMat, flags.length);
  flagInst.castShadow = castShadows;

  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const euler = new THREE.Euler();
  const col = new THREE.Color();

  for (let i = 0; i < flags.length; i++) {
    const f = flags[i];
    euler.set(0, f.rotation, 0);
    q.setFromEuler(euler);
    s.setScalar(f.scale);
    mtx.compose(f.pos, q, s);
    poleInst.setMatrixAt(i, mtx);
    flagInst.setMatrixAt(i, mtx);
    col.set(f.poleColor);
    poleInst.setColorAt(i, col);
  }
  poleInst.instanceMatrix.needsUpdate = true;
  if (poleInst.instanceColor) poleInst.instanceColor.needsUpdate = true;
  poleInst.computeBoundingSphere();
  flagInst.instanceMatrix.needsUpdate = true;
  flagInst.computeBoundingSphere();
  freezeStatic(poleInst);
  freezeStatic(flagInst);
  group.add(poleInst, flagInst);

  return {
    group,
    dispose(): void {
      poleInst.dispose();
      flagInst.dispose();
      poleGeom.dispose();
      flagGeom.dispose();
      poleMat.dispose();
      flagMat.dispose();
    },
  };
}

export function buildCheckeredFlag(
  pos: THREE.Vector3,
  rotation: number,
  scale: number,
  poleColor: string,
  flagTex: THREE.CanvasTexture,
  graphicsPreset: GraphicsPreset,
  castShadows: boolean,
): TablewareBuildHandle {
  return buildCheckeredFlagsBatch([{ pos, rotation, scale, poleColor }], flagTex, graphicsPreset, castShadows);
}

export function buildPlateTower(
  pos: THREE.Vector3,
  rotation: number,
  scale: number,
  graphicsPreset: GraphicsPreset,
  receiveShadows: boolean,
  castShadows: boolean,
): TablewareBuildHandle {
  const group = new THREE.Group();
  group.name = 'KitchenPlateTower';
  group.position.copy(pos);
  group.rotation.y = rotation;
  group.scale.setScalar(scale);

  const plateColors = ['#F8FAFC', '#00E5FF', '#FFD000', '#EC4899', '#84CC16', '#7E22CE', '#FF2D3D'];
  const plateGeom = new THREE.CylinderGeometry(6.8, 5.2, 1.65, 18);
  plateGeom.translate(0, 0.825, 0);

  const plateMat = createSurfaceMaterial(graphicsPreset, {
    color: 0xffffff,
    roughness: 0.2,
    metalness: 0.06,
    clearcoat: 0.9,
    physical: true,
    fog: false,
  });

  const inst = new THREE.InstancedMesh(plateGeom, plateMat, plateColors.length);
  inst.castShadow = castShadows;
  inst.receiveShadow = receiveShadows;

  const mtx = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, 1, 1);
  const col = new THREE.Color();

  for (let i = 0; i < plateColors.length; i++) {
    const jitterX = Math.sin(i * 1.9) * 0.55;
    const jitterZ = Math.cos(i * 2.3) * 0.55;
    p.set(jitterX, i * 1.68, jitterZ);
    mtx.compose(p, q, s);
    inst.setMatrixAt(i, mtx);
    col.set(plateColors[i]);
    inst.setColorAt(i, col);
  }
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  inst.computeBoundingSphere();
  freezeStatic(inst);
  group.add(inst);

  return {
    group,
    dispose(): void {
      inst.dispose();
      plateGeom.dispose();
      plateMat.dispose();
    },
  };
}

export function createTablewareFillGeometries(): InstancedFillGeometryPack {
  // Mug: cylinder + thick C-handle
  const mugParts: THREE.BufferGeometry[] = [];
  const mugBody = new THREE.CylinderGeometry(2.3, 2.1, 5.4, 12);
  mugBody.translate(0, 2.7, 0);
  mugParts.push(mugBody);
  const mugHandle = new THREE.TorusGeometry(1.5, 0.4, 6, 12, Math.PI);
  mugHandle.rotateZ(-Math.PI * 0.5);
  mugHandle.translate(2.3, 2.8, 0);
  mugParts.push(mugHandle);
  const mugGeom = mergeNormalized(mugParts);

  // Measuring cup: tapered beaker + pouring lip + angled handle
  const cupParts: THREE.BufferGeometry[] = [];
  const cupBody = new THREE.CylinderGeometry(2.6, 1.9, 5.2, 12);
  cupBody.translate(0, 2.6, 0);
  cupParts.push(cupBody);
  const cupHandle = new THREE.BoxGeometry(2.0, 0.6, 0.6);
  cupHandle.rotateZ(-0.22);
  cupHandle.translate(3.1, 4.1, 0);
  cupParts.push(cupHandle);
  const cupGeom = mergeNormalized(cupParts);

  return {
    mugGeom,
    cupGeom,
    dispose(): void {
      mugGeom.dispose();
      cupGeom.dispose();
    },
  };
}
