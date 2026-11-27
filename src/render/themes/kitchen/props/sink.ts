// src/render/themes/kitchen/props/sink.ts
// Giant sink props for Jembatan Wastafel: sink basin below bridge, emissive UV-scrolled water,
// towering faucet arch over the bridge, and a dish rack with colorful instanced cups.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GraphicsPreset } from '../../../../config';
import { createSurfaceMaterial } from '../../../materialFactory';

export interface SinkBuildHandle {
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

export function buildSinkBasin(
  pos: THREE.Vector3,
  yawRad: number,
  wallColor: string,
  rimColor: string,
  graphicsPreset: GraphicsPreset,
  receiveShadows: boolean,
): SinkBuildHandle {
  const group = new THREE.Group();
  group.name = 'KitchenSinkBasin';
  group.position.set(pos.x, 0, pos.z);
  group.rotation.y = yawRad;

  const lengthX = 142;
  const depthZ = 58;
  const wallH = 8.4;
  const wallT = 4.2;

  const wallGeoms: THREE.BufferGeometry[] = [];
  // Basin bottom pad
  const floor = new THREE.BoxGeometry(lengthX, 0.5, depthZ);
  floor.translate(0, 0.25, 0);
  wallGeoms.push(floor);

  // 4 outer basin walls (well below bridge deck y = 15.3..23.9)
  const frontW = new THREE.BoxGeometry(lengthX, wallH, wallT);
  frontW.translate(0, wallH * 0.5, depthZ * 0.5 - wallT * 0.5);
  wallGeoms.push(frontW);
  const backW = new THREE.BoxGeometry(lengthX, wallH, wallT);
  backW.translate(0, wallH * 0.5, -depthZ * 0.5 + wallT * 0.5);
  wallGeoms.push(backW);
  const leftW = new THREE.BoxGeometry(wallT, wallH, depthZ - wallT * 2);
  leftW.translate(-lengthX * 0.5 + wallT * 0.5, wallH * 0.5, 0);
  wallGeoms.push(leftW);
  const rightW = new THREE.BoxGeometry(wallT, wallH, depthZ - wallT * 2);
  rightW.translate(lengthX * 0.5 - wallT * 0.5, wallH * 0.5, 0);
  wallGeoms.push(rightW);

  const rimGeoms: THREE.BufferGeometry[] = [];
  const rimT = 5.6;
  const rimH = 1.1;
  const rimF = new THREE.BoxGeometry(lengthX + 2.4, rimH, rimT);
  rimF.translate(0, wallH + rimH * 0.5, depthZ * 0.5 - wallT * 0.5);
  rimGeoms.push(rimF);
  const rimB = new THREE.BoxGeometry(lengthX + 2.4, rimH, rimT);
  rimB.translate(0, wallH + rimH * 0.5, -depthZ * 0.5 + wallT * 0.5);
  rimGeoms.push(rimB);
  const rimL = new THREE.BoxGeometry(rimT, rimH, depthZ);
  rimL.translate(-lengthX * 0.5 + wallT * 0.5, wallH + rimH * 0.5, 0);
  rimGeoms.push(rimL);
  const rimR = new THREE.BoxGeometry(rimT, rimH, depthZ);
  rimR.translate(lengthX * 0.5 - wallT * 0.5, wallH + rimH * 0.5, 0);
  rimGeoms.push(rimR);

  const wallGeom = mergeNormalized(wallGeoms);
  const rimGeom = mergeNormalized(rimGeoms);

  const wallMat = createSurfaceMaterial(graphicsPreset, {
    color: wallColor,
    roughness: 0.25,
    metalness: 0.08,
    clearcoat: 0.85,
    physical: true,
    fog: false,
  });
  const rimMat = createSurfaceMaterial(graphicsPreset, {
    color: rimColor,
    roughness: 0.22,
    metalness: 0.14,
    fog: false,
  });

  const wallMesh = new THREE.Mesh(wallGeom, wallMat);
  wallMesh.receiveShadow = receiveShadows;
  const rimMesh = new THREE.Mesh(rimGeom, rimMat);
  rimMesh.receiveShadow = receiveShadows;
  group.add(wallMesh, rimMesh);
  freezeStatic(group);

  return {
    group,
    dispose(): void {
      wallGeom.dispose();
      rimGeom.dispose();
      wallMat.dispose();
      rimMat.dispose();
    },
  };
}

export function buildSinkWater(
  pos: THREE.Vector3,
  yawRad: number,
  waterTex: THREE.CanvasTexture,
  graphicsPreset: GraphicsPreset,
): SinkBuildHandle {
  const group = new THREE.Group();
  group.name = 'KitchenSinkWater';
  group.position.set(pos.x, 4.2, pos.z);
  group.rotation.y = yawRad;

  const waterGeom = new THREE.PlaneGeometry(134, 50);
  waterGeom.rotateX(-Math.PI * 0.5);

  const waterMat = createSurfaceMaterial(graphicsPreset, {
    map: waterTex,
    color: '#FFFFFF',
    emissive: '#00B4FF',
    emissiveMap: waterTex,
    emissiveIntensity: 0.65,
    roughness: 0.16,
    metalness: 0.08,
    fog: false,
  });

  const waterMesh = new THREE.Mesh(waterGeom, waterMat);
  waterMesh.name = 'SinkWaterSurface';
  freezeStatic(waterMesh);
  group.add(waterMesh);

  return {
    group,
    dispose(): void {
      waterGeom.dispose();
      waterMat.dispose();
    },
  };
}

export function buildFaucetArch(
  bridgeCenterPos: THREE.Vector3,
  rightDir: THREE.Vector3,
  chromeColor: string,
  accentColor: string,
  graphicsPreset: GraphicsPreset,
  receiveShadows: boolean,
  castShadows: boolean,
): SinkBuildHandle {
  const group = new THREE.Group();
  group.name = 'KitchenFaucetArch';

  // Anchor base on the -right (+Z) side of the sink rim, well outside track & bridge deck
  const horizRight = new THREE.Vector3(rightDir.x, 0, rightDir.z).normalize();
  const basePos = new THREE.Vector3(bridgeCenterPos.x, 0, bridgeCenterPos.z).addScaledVector(
    horizRight,
    -35,
  );
  const tangentDir = new THREE.Vector3(-horizRight.z, 0, horizRight.x);

  const chromeGeoms: THREE.BufferGeometry[] = [];
  const baseCollar = new THREE.CylinderGeometry(5.2, 6.2, 9.5, 16);
  baseCollar.translate(basePos.x, 4.75, basePos.z);
  chromeGeoms.push(baseCollar);

  // Smooth swan-neck arch soaring up to y = 49 m (20 m above the bridge chase camera)
  const curve = new THREE.CatmullRomCurve3([
    basePos.clone().setY(8.5),
    basePos.clone().setY(32.0),
    basePos.clone().addScaledVector(horizRight, 11).setY(47.5),
    basePos.clone().addScaledVector(horizRight, 26).setY(48.5),
    basePos.clone().addScaledVector(horizRight, 34).setY(39.0),
  ]);
  const neckGeom = new THREE.TubeGeometry(curve, 24, 2.35, 12, false);
  chromeGeoms.push(neckGeom);

  const aerator = new THREE.CylinderGeometry(2.6, 3.3, 2.8, 14);
  aerator.translate(
    basePos.x + horizRight.x * 34,
    38.0,
    basePos.z + horizRight.z * 34,
  );
  chromeGeoms.push(aerator);

  const chromeGeom = mergeNormalized(chromeGeoms);
  const chromeMat = createSurfaceMaterial(graphicsPreset, {
    color: chromeColor,
    roughness: 0.18,
    metalness: 0.74,
    clearcoat: 0.9,
    physical: true,
    fog: false,
  });
  const chromeMesh = new THREE.Mesh(chromeGeom, chromeMat);
  chromeMesh.castShadow = castShadows;
  chromeMesh.receiveShadow = receiveShadows;
  freezeStatic(chromeMesh);
  group.add(chromeMesh);

  // Hot (#FF2D3D) & Cold (#00E5FF) twin tap knobs flanking the faucet base
  const hotGeoms: THREE.BufferGeometry[] = [];
  const coldGeoms: THREE.BufferGeometry[] = [];
  for (const [sign, targetList] of [
    [-1, hotGeoms],
    [1, coldGeoms],
  ] as const) {
    const knobPos = basePos.clone().addScaledVector(tangentDir, sign * 11.5);
    const stem = new THREE.CylinderGeometry(1.7, 2.1, 10.5, 12);
    stem.translate(knobPos.x, 5.25, knobPos.z);
    targetList.push(stem);
    const crossA = new THREE.BoxGeometry(6.8, 1.3, 1.5);
    crossA.translate(knobPos.x, 11.0, knobPos.z);
    targetList.push(crossA);
    const crossB = new THREE.BoxGeometry(1.5, 1.3, 6.8);
    crossB.translate(knobPos.x, 11.0, knobPos.z);
    targetList.push(crossB);
  }

  const hotGeom = mergeNormalized(hotGeoms);
  const coldGeom = mergeNormalized(coldGeoms);
  const hotMat = createSurfaceMaterial(graphicsPreset, {
    color: '#FF2D3D',
    roughness: 0.25,
    metalness: 0.14,
    fog: false,
  });
  const coldMat = createSurfaceMaterial(graphicsPreset, {
    color: accentColor,
    roughness: 0.25,
    metalness: 0.14,
    fog: false,
  });

  const hotMesh = new THREE.Mesh(hotGeom, hotMat);
  const coldMesh = new THREE.Mesh(coldGeom, coldMat);
  freezeStatic(hotMesh);
  freezeStatic(coldMesh);
  group.add(hotMesh, coldMesh);

  return {
    group,
    dispose(): void {
      chromeGeom.dispose();
      hotGeom.dispose();
      coldGeom.dispose();
      chromeMat.dispose();
      hotMat.dispose();
      coldMat.dispose();
    },
  };
}

export function buildDishRack(
  pos: THREE.Vector3,
  rotation: number,
  scale: number,
  rackColor: string,
  graphicsPreset: GraphicsPreset,
  receiveShadows: boolean,
  castShadows: boolean,
): SinkBuildHandle {
  const group = new THREE.Group();
  group.name = 'KitchenDishRack';
  group.position.copy(pos);
  group.rotation.y = rotation;
  group.scale.setScalar(scale);

  const frameGeoms: THREE.BufferGeometry[] = [];
  const trayW = 16.5;
  const trayD = 12.0;
  const base = new THREE.BoxGeometry(trayW, 0.85, trayD);
  base.translate(0, 0.425, 0);
  frameGeoms.push(base);

  const railH = 3.2;
  const frontR = new THREE.BoxGeometry(trayW, 0.45, 0.45);
  frontR.translate(0, railH, trayD * 0.5 - 0.3);
  frameGeoms.push(frontR);
  const backR = new THREE.BoxGeometry(trayW, 0.45, 0.45);
  backR.translate(0, railH, -trayD * 0.5 + 0.3);
  frameGeoms.push(backR);
  const leftR = new THREE.BoxGeometry(0.45, 0.45, trayD);
  leftR.translate(-trayW * 0.5 + 0.3, railH, 0);
  frameGeoms.push(leftR);
  const rightR = new THREE.BoxGeometry(0.45, 0.45, trayD);
  rightR.translate(trayW * 0.5 - 0.3, railH, 0);
  frameGeoms.push(rightR);

  for (const cx of [-trayW * 0.5 + 0.3, trayW * 0.5 - 0.3]) {
    for (const cz of [-trayD * 0.5 + 0.3, trayD * 0.5 - 0.3]) {
      const post = new THREE.BoxGeometry(0.45, railH, 0.45);
      post.translate(cx, railH * 0.5, cz);
      frameGeoms.push(post);
    }
  }

  const rackGeom = mergeNormalized(frameGeoms);
  const rackMat = createSurfaceMaterial(graphicsPreset, {
    color: rackColor,
    roughness: 0.24,
    metalness: 0.16,
    fog: false,
  });
  const rackMesh = new THREE.Mesh(rackGeom, rackMat);
  rackMesh.castShadow = castShadows;
  rackMesh.receiveShadow = receiveShadows;
  group.add(rackMesh);

  // Instanced colorful cups stacked cleanly inside the dish rack
  const cupGeom = new THREE.CylinderGeometry(1.75, 1.35, 4.4, 12);
  cupGeom.translate(0, 2.2, 0);
  const cupMat = createSurfaceMaterial(graphicsPreset, {
    color: 0xffffff,
    roughness: 0.22,
    metalness: 0.06,
    clearcoat: 0.85,
    physical: true,
    fog: false,
  });

  const cupColors = ['#FF2D3D', '#FFD000', '#84CC16', '#A855F7', '#0A5CFF', '#EC4899'];
  const cupInst = new THREE.InstancedMesh(cupGeom, cupMat, 8);
  cupInst.castShadow = castShadows;
  cupInst.receiveShadow = receiveShadows;

  const mtx = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, 1, 1);
  const col = new THREE.Color();

  for (let i = 0; i < 8; i++) {
    const colIdx = i % 4;
    const rowIdx = Math.floor(i / 4);
    p.set(-5.4 + colIdx * 3.6, 0.9, -2.7 + rowIdx * 5.4);
    mtx.compose(p, q, s);
    cupInst.setMatrixAt(i, mtx);
    col.set(cupColors[i % cupColors.length]);
    cupInst.setColorAt(i, col);
  }
  cupInst.instanceMatrix.needsUpdate = true;
  if (cupInst.instanceColor) cupInst.instanceColor.needsUpdate = true;
  cupInst.computeBoundingSphere();
  group.add(cupInst);
  freezeStatic(group);

  return {
    group,
    dispose(): void {
      cupInst.dispose();
      rackGeom.dispose();
      cupGeom.dispose();
      rackMat.dispose();
      cupMat.dispose();
    },
  };
}
