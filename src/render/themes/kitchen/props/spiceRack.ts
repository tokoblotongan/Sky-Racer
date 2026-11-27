// src/render/themes/kitchen/props/spiceRack.ts
// Spice shelf with instanced colorful jars, cyan-glow shortcut arrow sign, and shared spice-jar fill geometry.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GraphicsPreset } from '../../../../config';
import { createSurfaceMaterial } from '../../../materialFactory';

export interface SpiceRackBuildHandle {
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

export function createSpiceJarFillGeometry(): THREE.BufferGeometry {
  const jarParts: THREE.BufferGeometry[] = [];
  const body = new THREE.CylinderGeometry(1.7, 1.75, 4.8, 10);
  body.translate(0, 2.4, 0);
  jarParts.push(body);
  const neck = new THREE.CylinderGeometry(1.35, 1.55, 0.7, 10);
  neck.translate(0, 5.1, 0);
  jarParts.push(neck);
  const cap = new THREE.CylinderGeometry(1.45, 1.45, 0.9, 10);
  cap.translate(0, 5.75, 0);
  jarParts.push(cap);
  return mergeNormalized(jarParts);
}

export interface SpiceShelfSpec {
  readonly pos: THREE.Vector3;
  readonly rotation: number;
  readonly scale: number;
  readonly shelfColor: string;
  readonly accentColor: string;
}

export function buildSpiceShelvesBatch(
  shelves: readonly SpiceShelfSpec[],
  graphicsPreset: GraphicsPreset,
  receiveShadows: boolean,
  castShadows: boolean,
): SpiceRackBuildHandle {
  const group = new THREE.Group();
  group.name = 'KitchenSpiceShelvesBatch';

  const shelfW = 22;
  const shelfD = 6.2;
  const rackH = 31;
  const tierYs = [5.5, 15.5, 25.5];

  const rackGeoms: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1] as const) {
    const post = new THREE.BoxGeometry(1.4, rackH, shelfD);
    post.translate(side * (shelfW * 0.5 - 0.7), rackH * 0.5, 0);
    rackGeoms.push(post);
  }
  for (const y of tierYs) {
    const plank = new THREE.BoxGeometry(shelfW, 1.1, shelfD);
    plank.translate(0, y, 0);
    rackGeoms.push(plank);
    const guard = new THREE.BoxGeometry(shelfW, 0.9, 0.45);
    guard.translate(0, y + 1.1, shelfD * 0.5 - 0.35);
    rackGeoms.push(guard);
  }
  const topCrown = new THREE.BoxGeometry(shelfW + 1.4, 1.4, shelfD + 0.8);
  topCrown.translate(0, rackH + 0.4, 0);
  rackGeoms.push(topCrown);

  const rackGeom = mergeNormalized(rackGeoms);
  const rackMat = createSurfaceMaterial(graphicsPreset, {
    color: 0xffffff,
    roughness: 0.28,
    metalness: 0.1,
    clearcoat: 0.8,
    physical: true,
    fog: false,
  });

  const rackInst = new THREE.InstancedMesh(rackGeom, rackMat, shelves.length);
  rackInst.castShadow = castShadows;
  rackInst.receiveShadow = receiveShadows;

  const jarsPerTier = 4;
  const jarsPerShelf = tierYs.length * jarsPerTier;
  const jarGeom = createSpiceJarFillGeometry();
  const jarMat = createSurfaceMaterial(graphicsPreset, {
    color: 0xffffff,
    roughness: 0.22,
    metalness: 0.08,
    clearcoat: 0.85,
    physical: true,
    fog: false,
  });
  const jarInst = new THREE.InstancedMesh(jarGeom, jarMat, shelves.length * jarsPerShelf);
  jarInst.castShadow = castShadows;
  jarInst.receiveShadow = receiveShadows;

  const baseJarColors = ['#FF2D3D', '#FFD000', '#84CC16', '#00E5FF', '#A855F7', '#EC4899'];
  const shelfMtx = new THREE.Matrix4();
  const jarLocalMtx = new THREE.Matrix4();
  const jarWorldMtx = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const qIdentity = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const sJar = new THREE.Vector3(1.05, 1.05, 1.05);
  const euler = new THREE.Euler();
  const col = new THREE.Color();

  let jarIdx = 0;
  for (let si = 0; si < shelves.length; si++) {
    const sh = shelves[si];
    euler.set(0, sh.rotation, 0);
    q.setFromEuler(euler);
    s.setScalar(sh.scale);
    shelfMtx.compose(sh.pos, q, s);
    rackInst.setMatrixAt(si, shelfMtx);
    col.set(sh.shelfColor);
    rackInst.setColorAt(si, col);

    for (let t = 0; t < tierYs.length; t++) {
      for (let j = 0; j < jarsPerTier; j++) {
        const x = THREE.MathUtils.lerp(-7.2, 7.2, j / (jarsPerTier - 1));
        p.set(x, tierYs[t] + 0.55, 0.2);
        jarLocalMtx.compose(p, qIdentity, sJar);
        jarWorldMtx.multiplyMatrices(shelfMtx, jarLocalMtx);
        jarInst.setMatrixAt(jarIdx, jarWorldMtx);
        const colorPool = [...baseJarColors, sh.accentColor];
        col.set(colorPool[(t * jarsPerTier + j) % colorPool.length]);
        jarInst.setColorAt(jarIdx, col);
        jarIdx++;
      }
    }
  }

  rackInst.instanceMatrix.needsUpdate = true;
  if (rackInst.instanceColor) rackInst.instanceColor.needsUpdate = true;
  rackInst.computeBoundingSphere();
  jarInst.instanceMatrix.needsUpdate = true;
  if (jarInst.instanceColor) jarInst.instanceColor.needsUpdate = true;
  jarInst.computeBoundingSphere();
  freezeStatic(rackInst);
  freezeStatic(jarInst);
  group.add(rackInst, jarInst);

  return {
    group,
    dispose(): void {
      rackInst.dispose();
      jarInst.dispose();
      rackGeom.dispose();
      jarGeom.dispose();
      rackMat.dispose();
      jarMat.dispose();
    },
  };
}

export function buildSpiceShelf(
  pos: THREE.Vector3,
  rotation: number,
  scale: number,
  shelfColor: string,
  accentColor: string,
  graphicsPreset: GraphicsPreset,
  receiveShadows: boolean,
  castShadows: boolean,
): SpiceRackBuildHandle {
  return buildSpiceShelvesBatch(
    [{ pos, rotation, scale, shelfColor, accentColor }],
    graphicsPreset,
    receiveShadows,
    castShadows,
  );
}

export function buildSpiceArrowSign(
  pos: THREE.Vector3,
  rotation: number,
  scale: number,
  frameColor: string,
  glowColor: string,
  signTex: THREE.CanvasTexture,
  graphicsPreset: GraphicsPreset,
): SpiceRackBuildHandle {
  const group = new THREE.Group();
  group.name = 'KitchenSpiceArrowSign';
  group.position.copy(pos);
  group.rotation.y = rotation;
  group.scale.setScalar(scale);

  const postGeom = new THREE.CylinderGeometry(0.45, 0.65, 25, 10);
  postGeom.translate(0, 12.5, 0);
  const postMat = createSurfaceMaterial(graphicsPreset, {
    color: frameColor,
    roughness: 0.35,
    metalness: 0.25,
    fog: false,
  });
  const postMesh = new THREE.Mesh(postGeom, postMat);

  const boardBoxGeom = new THREE.BoxGeometry(9.2, 4.8, 0.45);
  boardBoxGeom.translate(0, 23.2, 0);
  const boardGlowMat = createSurfaceMaterial(graphicsPreset, {
    color: glowColor,
    emissive: glowColor,
    emissiveIntensity: 1.25,
    roughness: 0.2,
    fog: false,
  });
  const boardBoxMesh = new THREE.Mesh(boardBoxGeom, boardGlowMat);

  const frontFace = new THREE.PlaneGeometry(8.8, 4.4);
  frontFace.translate(0, 23.2, 0.26);
  const backFace = new THREE.PlaneGeometry(8.8, 4.4);
  backFace.rotateY(Math.PI);
  backFace.translate(0, 23.2, -0.26);
  const faceGeom = mergeNormalized([frontFace, backFace]);

  const faceMat = createSurfaceMaterial(graphicsPreset, {
    map: signTex,
    emissive: 0xffffff,
    emissiveMap: signTex,
    emissiveIntensity: 1.15,
    roughness: 0.25,
    fog: false,
  });
  const faceMesh = new THREE.Mesh(faceGeom, faceMat);

  group.add(postMesh, boardBoxMesh, faceMesh);
  freezeStatic(group);

  return {
    group,
    dispose(): void {
      postGeom.dispose();
      boardBoxGeom.dispose();
      faceGeom.dispose();
      postMat.dispose();
      boardGlowMat.dispose();
      faceMat.dispose();
    },
  };
}
