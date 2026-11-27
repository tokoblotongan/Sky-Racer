// src/render/themes/kitchen/props/utensils.ts
// Giant utensil props for Lompatan Talenan: lime-green cutting board ramp with handle hole, spatula, and whisk.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GraphicsPreset } from '../../../../config';
import type { Route } from '../../../../core/course';
import { createSurfaceMaterial } from '../../../materialFactory';

export interface UtensilBuildHandle {
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

export function buildCuttingBoardRamp(
  route: Route,
  rampStartS: number,
  rampEndS: number,
  boardColor: string,
  trimColor: string,
  graphicsPreset: GraphicsPreset,
  receiveShadows: boolean,
  castShadows: boolean,
): UtensilBuildHandle {
  const group = new THREE.Group();
  group.name = 'KitchenCuttingBoardRamp';

  // Position cleanly beneath the jump takeoff ramp so board never protrudes above the orange track surface
  const midFrame = route.getFrameAt((rampStartS + rampEndS) * 0.5);
  const startFrame = route.getFrameAt(rampStartS);
  const endFrame = route.getFrameAt(rampEndS);
  const boardDir = new THREE.Vector3().subVectors(endFrame.position, startFrame.position);
  const pitchRad = Math.atan2(boardDir.y, Math.hypot(boardDir.x, boardDir.z));
  const yawRad = Math.atan2(boardDir.x, boardDir.z);

  const boardLen = 30;
  const boardHalfW = 11.2;
  const cornerR = 2.4;

  // Rounded rectangle board in local XZ (drawn in XY then extruded along Y thickness)
  const shape = new THREE.Shape();
  const hx = boardLen * 0.5;
  const hz = boardHalfW;
  shape.moveTo(-hx + cornerR, -hz);
  shape.lineTo(hx - cornerR, -hz);
  shape.quadraticCurveTo(hx, -hz, hx, -hz + cornerR);
  shape.lineTo(hx, hz - cornerR);
  shape.quadraticCurveTo(hx, hz, hx - cornerR, hz);
  shape.lineTo(-hx + cornerR, hz);
  shape.quadraticCurveTo(-hx, hz, -hx, hz - cornerR);
  shape.lineTo(-hx, -hz + cornerR);
  shape.quadraticCurveTo(-hx, -hz, -hx + cornerR, -hz);

  // Iconic cutting-board cutout hole handle on the front-right corner peeking cleanly past the track edge
  const hole = new THREE.Path();
  const holeCx = hx - 4.2;
  const holeCz = hz - 2.35;
  hole.moveTo(holeCx - 2.3, holeCz - 0.75);
  hole.lineTo(holeCx + 2.3, holeCz - 0.75);
  hole.absarc(holeCx + 2.3, holeCz, 0.75, -Math.PI * 0.5, Math.PI * 0.5, false);
  hole.lineTo(holeCx - 2.3, holeCz + 0.75);
  hole.absarc(holeCx - 2.3, holeCz, 0.75, Math.PI * 0.5, Math.PI * 1.5, false);
  shape.holes.push(hole);

  const boardGeom = new THREE.ExtrudeGeometry(shape, {
    depth: 1.35,
    bevelEnabled: true,
    bevelThickness: 0.22,
    bevelSize: 0.22,
    bevelSegments: 2,
    curveSegments: 8,
  });
  boardGeom.rotateX(Math.PI * 0.5); // extrudes downward from y=0 to y=-1.35

  const boardHolder = new THREE.Group();
  boardHolder.position
    .copy(midFrame.position)
    .addScaledVector(midFrame.up, -0.72);
  boardHolder.rotation.order = 'YXZ';
  boardHolder.rotation.y = yawRad - Math.PI * 0.5;
  boardHolder.rotation.z = pitchRad;

  const boardMat = createSurfaceMaterial(graphicsPreset, {
    color: boardColor,
    roughness: 0.26,
    metalness: 0.04,
    clearcoat: 0.85,
    physical: true,
    fog: false,
  });
  const boardMesh = new THREE.Mesh(boardGeom, boardMat);
  boardMesh.castShadow = castShadows;
  boardMesh.receiveShadow = receiveShadows;
  boardHolder.add(boardMesh);
  freezeStatic(boardHolder);
  group.add(boardHolder);

  // Decorative bright green support blocks underneath connecting cutting board ramp to counter (y = 0)
  const blockH = Math.max(2, midFrame.position.y - 1.4);
  const blockGeoms: THREE.BufferGeometry[] = [];
  for (const side of [-8.2, 8.2]) {
    const leg = new THREE.BoxGeometry(3.2, blockH, 3.2);
    leg.translate(
      midFrame.position.x + midFrame.right.x * side,
      blockH * 0.5,
      midFrame.position.z + midFrame.right.z * side,
    );
    blockGeoms.push(leg);
  }
  const blockGeom = mergeNormalized(blockGeoms);
  const trimMat = createSurfaceMaterial(graphicsPreset, {
    color: trimColor,
    roughness: 0.34,
    metalness: 0.05,
    fog: false,
  });
  const blockMesh = new THREE.Mesh(blockGeom, trimMat);
  blockMesh.receiveShadow = receiveShadows;
  freezeStatic(blockMesh);
  group.add(blockMesh);

  return {
    group,
    dispose(): void {
      boardGeom.dispose();
      blockGeom.dispose();
      boardMat.dispose();
      trimMat.dispose();
    },
  };
}

export function buildSpatula(
  pos: THREE.Vector3,
  rotation: number,
  scale: number,
  bladeColor: string,
  handleColor: string,
  graphicsPreset: GraphicsPreset,
  receiveShadows: boolean,
  castShadows: boolean,
): UtensilBuildHandle {
  const group = new THREE.Group();
  group.name = 'KitchenSpatula';
  group.position.copy(pos);
  group.rotation.y = rotation;
  group.scale.setScalar(scale);

  // Standing upright on a colorful cylindrical stand block beside the ramp
  const bladeGeoms: THREE.BufferGeometry[] = [];
  const neckAndHandle: THREE.BufferGeometry[] = [];

  const plinth = new THREE.CylinderGeometry(3.4, 3.8, 2.2, 12);
  plinth.translate(0, 1.1, 0);
  bladeGeoms.push(plinth);

  const blade = new THREE.BoxGeometry(6.8, 8.6, 0.75);
  blade.translate(0, 26.2, 0);
  bladeGeoms.push(blade);

  const shaft = new THREE.CylinderGeometry(0.62, 0.72, 12.5, 10);
  shaft.translate(0, 16.5, 0);
  neckAndHandle.push(shaft);

  const grip = new THREE.CylinderGeometry(1.15, 1.0, 9.6, 12);
  grip.translate(0, 6.2, 0);
  neckAndHandle.push(grip);

  const bladeGeom = mergeNormalized(bladeGeoms);
  const handleGeom = mergeNormalized(neckAndHandle);

  const bladeMat = createSurfaceMaterial(graphicsPreset, {
    color: bladeColor,
    roughness: 0.25,
    metalness: 0.12,
    clearcoat: 0.85,
    physical: true,
    fog: false,
  });
  const handleMat = createSurfaceMaterial(graphicsPreset, {
    color: handleColor,
    roughness: 0.28,
    metalness: 0.22,
    fog: false,
  });

  const bladeMesh = new THREE.Mesh(bladeGeom, bladeMat);
  bladeMesh.castShadow = castShadows;
  bladeMesh.receiveShadow = receiveShadows;
  const handleMesh = new THREE.Mesh(handleGeom, handleMat);
  handleMesh.castShadow = castShadows;
  group.add(bladeMesh, handleMesh);
  freezeStatic(group);

  return {
    group,
    dispose(): void {
      bladeGeom.dispose();
      handleGeom.dispose();
      bladeMat.dispose();
      handleMat.dispose();
    },
  };
}

export function buildWhisk(
  pos: THREE.Vector3,
  rotation: number,
  scale: number,
  handleColor: string,
  wireColor: string,
  graphicsPreset: GraphicsPreset,
  receiveShadows: boolean,
  castShadows: boolean,
): UtensilBuildHandle {
  const group = new THREE.Group();
  group.name = 'KitchenWhisk';
  group.position.copy(pos);
  group.rotation.y = rotation;
  group.scale.setScalar(scale);

  const handleGeoms: THREE.BufferGeometry[] = [];
  const wireGeoms: THREE.BufferGeometry[] = [];

  const handle = new THREE.CylinderGeometry(1.35, 1.7, 13.5, 12);
  handle.translate(0, 6.75, 0);
  handleGeoms.push(handle);

  const collar = new THREE.CylinderGeometry(1.45, 1.45, 1.4, 12);
  collar.translate(0, 14.0, 0);
  wireGeoms.push(collar);

  const loopCount = 5;
  for (let i = 0; i < loopCount; i++) {
    const ang = (i / loopCount) * Math.PI * 2;
    const cosA = Math.cos(ang);
    const sinA = Math.sin(ang);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(cosA * 0.9, 14.4, sinA * 0.9),
      new THREE.Vector3(cosA * 4.2, 22.0, sinA * 4.2),
      new THREE.Vector3(0, 29.2, 0),
      new THREE.Vector3(-cosA * 4.2, 22.0, -sinA * 4.2),
      new THREE.Vector3(-cosA * 0.9, 14.4, -sinA * 0.9),
    ]);
    wireGeoms.push(new THREE.TubeGeometry(curve, 14, 0.24, 6, false));
  }

  const handleGeom = mergeNormalized(handleGeoms);
  const wireGeom = mergeNormalized(wireGeoms);

  const handleMat = createSurfaceMaterial(graphicsPreset, {
    color: handleColor,
    roughness: 0.24,
    metalness: 0.08,
    clearcoat: 0.85,
    physical: true,
    fog: false,
  });
  const wireMat = createSurfaceMaterial(graphicsPreset, {
    color: wireColor,
    roughness: 0.22,
    metalness: 0.65,
    fog: false,
  });

  const handleMesh = new THREE.Mesh(handleGeom, handleMat);
  handleMesh.castShadow = castShadows;
  handleMesh.receiveShadow = receiveShadows;
  const wireMesh = new THREE.Mesh(wireGeom, wireMat);
  wireMesh.castShadow = castShadows;
  group.add(handleMesh, wireMesh);
  freezeStatic(group);

  return {
    group,
    dispose(): void {
      handleGeom.dispose();
      wireGeom.dispose();
      handleMat.dispose();
      wireMat.dispose();
    },
  };
}
