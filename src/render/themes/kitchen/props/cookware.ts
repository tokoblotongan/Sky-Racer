// src/render/themes/kitchen/props/cookware.ts
// Giant cookware props: polka-dot blue enamel pot tunnel shell, pot lid, kettle, and upright frying pan loop frame.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GraphicsPreset } from '../../../../config';
import type { Route, TrackFrame } from '../../../../core/course';
import { createSurfaceMaterial } from '../../../materialFactory';

export interface CookwareBuildHandle {
  readonly group: THREE.Group;
  dispose: () => void;
}

export interface KettleBuildHandle extends CookwareBuildHandle {
  readonly spoutWorldPos: THREE.Vector3;
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

export function buildPotTunnelShell(
  route: Route,
  startS: number,
  endS: number,
  polkaTex: THREE.CanvasTexture,
  graphicsPreset: GraphicsPreset,
  receiveShadows: boolean,
  castShadows: boolean,
): CookwareBuildHandle {
  const group = new THREE.Group();
  group.name = 'KitchenPotTunnelShell';

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const innerR = 12.65;
  const outerR = 13.45;
  const springY = 2.4;
  const domeH = 9.95;
  const wallBaseY = -1.1;
  const arcSegs = 14;
  const ringSegs = 14;

  const frames: TrackFrame[] = [];
  for (let r = 0; r <= ringSegs; r++) {
    const s = THREE.MathUtils.lerp(startS + 1.0, endS - 1.0, r / ringSegs);
    frames.push(route.getFrameAt(s));
  }

  const buildArcPts = (rad: number, height: number): Array<{ x: number; y: number; u: number }> => {
    const pts: Array<{ x: number; y: number; u: number }> = [];
    pts.push({ x: rad, y: wallBaseY, u: 0.0 });
    for (let i = 0; i <= arcSegs; i++) {
      const t = i / arcSegs;
      const ang = t * Math.PI;
      pts.push({
        x: Math.cos(ang) * rad,
        y: springY + Math.sin(ang) * height,
        u: t,
      });
    }
    pts.push({ x: -rad, y: wallBaseY, u: 1.0 });
    return pts;
  };

  const outerPts = buildArcPts(outerR, domeH + (outerR - innerR));
  const stride = outerPts.length;
  const ringCount = frames.length;
  const positions = new Float32Array(ringCount * stride * 3);
  const uvs = new Float32Array(ringCount * stride * 2);
  const indices: number[] = [];
  const tmp = new THREE.Vector3();

  for (let r = 0; r < ringCount; r++) {
    const f = frames[r];
    const v = r / Math.max(1, ringCount - 1);
    for (let p = 0; p < stride; p++) {
      const pt = outerPts[p];
      tmp.copy(f.position).addScaledVector(f.right, pt.x).addScaledVector(f.up, pt.y);
      const idx = r * stride + p;
      positions[idx * 3] = tmp.x;
      positions[idx * 3 + 1] = tmp.y;
      positions[idx * 3 + 2] = tmp.z;
      uvs[idx * 2] = pt.u;
      uvs[idx * 2 + 1] = v;
    }
  }

  for (let r = 0; r < ringCount - 1; r++) {
    const rowA = r * stride;
    const rowB = (r + 1) * stride;
    for (let p = 0; p < stride - 1; p++) {
      const a = rowA + p;
      const b = rowA + p + 1;
      const c = rowB + p;
      const d = rowB + p + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const shellGeom = new THREE.BufferGeometry();
  shellGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  shellGeom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  shellGeom.setIndex(indices);
  shellGeom.computeVertexNormals();
  shellGeom.computeBoundingSphere();
  geometries.push(shellGeom);

  const enamelMat = createSurfaceMaterial(graphicsPreset, {
    map: polkaTex,
    roughness: 0.24,
    metalness: 0.14,
    clearcoat: 0.85,
    physical: true,
    side: THREE.DoubleSide,
    fog: false,
  });
  const metalMat = createSurfaceMaterial(graphicsPreset, {
    color: '#E2E8F0',
    roughness: 0.24,
    metalness: 0.68,
    clearcoat: 0.8,
    physical: true,
    fog: false,
  });
  materials.push(enamelMat, metalMat);

  const shellMesh = new THREE.Mesh(shellGeom, enamelMat);
  shellMesh.name = 'PotTunnelEnamelBody';
  shellMesh.castShadow = castShadows;
  shellMesh.receiveShadow = receiveShadows;
  freezeStatic(shellMesh);
  group.add(shellMesh);

  // Rolled silver rim collars at entry & exit + lateral loop pot handles + counter support base
  const metalGeoms: THREE.BufferGeometry[] = [];
  const enamelExtraGeoms: THREE.BufferGeometry[] = [];

  for (const rimFrame of [frames[0], frames[frames.length - 1]]) {
    const negFwd = rimFrame.tangent.clone().negate();
    const basis = new THREE.Matrix4().makeBasis(rimFrame.right, rimFrame.up, negFwd);
    basis.setPosition(
      rimFrame.position.clone().addScaledVector(rimFrame.up, 2.4),
    );
    const collar = new THREE.TorusGeometry(outerR + 0.2, 0.55, 8, 22, Math.PI);
    collar.applyMatrix4(basis);
    metalGeoms.push(collar);
  }

  const midFrame = route.getFrameAt((startS + endS) * 0.5);
  const negFwdMid = midFrame.tangent.clone().negate();
  const midBasis = new THREE.Matrix4().makeBasis(midFrame.right, midFrame.up, negFwdMid);

  // Two side pot handles
  for (const side of [-1, 1] as const) {
    const handlePts = [
      new THREE.Vector3(side * outerR, 4.2, -9),
      new THREE.Vector3(side * (outerR + 4.4), 5.6, -5),
      new THREE.Vector3(side * (outerR + 4.4), 5.6, 5),
      new THREE.Vector3(side * outerR, 4.2, 9),
    ];
    const curve = new THREE.CatmullRomCurve3(handlePts);
    const hGeom = new THREE.TubeGeometry(curve, 12, 0.72, 8, false);
    hGeom.applyMatrix4(midBasis.clone().setPosition(midFrame.position));
    metalGeoms.push(hGeom);
  }

  // Enamel cradle blocks resting tunnel pot solidly on the counter (y = 0)
  for (const sFrac of [0.22, 0.78]) {
    const f = route.getFrameAt(THREE.MathUtils.lerp(startS, endS, sFrac));
    const h = Math.max(2, f.position.y - 0.8);
    const cradle = new THREE.BoxGeometry(22, h, 10);
    const cradleMtx = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(f.right.x, 0, f.right.z).normalize(),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(-f.tangent.x, 0, -f.tangent.z).normalize(),
    );
    cradleMtx.setPosition(f.position.x, h * 0.5, f.position.z);
    cradle.applyMatrix4(cradleMtx);
    enamelExtraGeoms.push(cradle);
  }

  const mergedMetal = mergeNormalized(metalGeoms);
  const mergedBase = mergeNormalized(enamelExtraGeoms);
  geometries.push(mergedMetal, mergedBase);

  const metalMesh = new THREE.Mesh(mergedMetal, metalMat);
  metalMesh.name = 'PotTunnelRimsAndHandles';
  metalMesh.castShadow = castShadows;
  metalMesh.receiveShadow = receiveShadows;
  freezeStatic(metalMesh);
  group.add(metalMesh);

  const baseMat = createSurfaceMaterial(graphicsPreset, {
    color: '#0A5CFF',
    roughness: 0.3,
    metalness: 0.14,
    fog: false,
  });
  materials.push(baseMat);
  const baseMesh = new THREE.Mesh(mergedBase, baseMat);
  baseMesh.name = 'PotTunnelCradles';
  baseMesh.receiveShadow = receiveShadows;
  freezeStatic(baseMesh);
  group.add(baseMesh);

  return {
    group,
    dispose(): void {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}

export function buildPotLid(
  pos: THREE.Vector3,
  rotation: number,
  scale: number,
  color: string,
  accentColor: string,
  graphicsPreset: GraphicsPreset,
  receiveShadows: boolean,
  castShadows: boolean,
): CookwareBuildHandle {
  const group = new THREE.Group();
  group.name = 'KitchenPotLid';
  group.position.copy(pos);
  group.rotation.y = rotation;
  group.scale.setScalar(scale);

  const radius = 7.4;
  const lidGeoms: THREE.BufferGeometry[] = [];
  const dome = new THREE.SphereGeometry(radius, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.42);
  dome.scale(1, 0.42, 1);
  lidGeoms.push(dome);
  const rim = new THREE.TorusGeometry(radius * 0.96, 0.36, 8, 20);
  rim.rotateX(Math.PI * 0.5);
  rim.translate(0, radius * 0.11, 0);
  lidGeoms.push(rim);

  const knobCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-2.1, radius * 0.38, 0),
    new THREE.Vector3(-1.4, radius * 0.62, 0),
    new THREE.Vector3(1.4, radius * 0.62, 0),
    new THREE.Vector3(2.1, radius * 0.38, 0),
  ]);
  const knob = new THREE.TubeGeometry(knobCurve, 10, 0.4, 8, false);

  const lidGeom = mergeNormalized(lidGeoms);
  // Stand the lid nearly upright (tilted 72 deg) centered above y = 0
  lidGeom.rotateX(THREE.MathUtils.degToRad(74));
  lidGeom.translate(0, radius * 0.96, 0);
  knob.rotateX(THREE.MathUtils.degToRad(74));
  knob.translate(0, radius * 0.96, 0);

  const lidMat = createSurfaceMaterial(graphicsPreset, {
    color,
    roughness: 0.24,
    metalness: 0.16,
    clearcoat: 0.85,
    physical: true,
    side: THREE.DoubleSide,
    fog: false,
  });
  const knobMat = createSurfaceMaterial(graphicsPreset, {
    color: accentColor,
    roughness: 0.25,
    metalness: 0.55,
    fog: false,
  });

  const lidMesh = new THREE.Mesh(lidGeom, lidMat);
  lidMesh.castShadow = castShadows;
  lidMesh.receiveShadow = receiveShadows;
  const knobMesh = new THREE.Mesh(knob, knobMat);
  knobMesh.castShadow = castShadows;
  group.add(lidMesh, knobMesh);
  freezeStatic(group);

  return {
    group,
    dispose(): void {
      lidGeom.dispose();
      knob.dispose();
      lidMat.dispose();
      knobMat.dispose();
    },
  };
}

export function buildKettle(
  pos: THREE.Vector3,
  rotation: number,
  scale: number,
  color: string,
  accentColor: string,
  graphicsPreset: GraphicsPreset,
  receiveShadows: boolean,
  castShadows: boolean,
): KettleBuildHandle {
  const group = new THREE.Group();
  group.name = 'KitchenKettle';
  group.position.copy(pos);
  group.rotation.y = rotation;
  group.scale.setScalar(scale);

  const bodyGeoms: THREE.BufferGeometry[] = [];
  const accentGeoms: THREE.BufferGeometry[] = [];

  // Kettle belly
  const belly = new THREE.CylinderGeometry(3.4, 4.9, 8.2, 16);
  belly.translate(0, 4.1, 0);
  bodyGeoms.push(belly);

  // Tapered shoulder & spout
  const dome = new THREE.SphereGeometry(3.5, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
  dome.scale(1, 0.55, 1);
  dome.translate(0, 8.0, 0);
  bodyGeoms.push(dome);

  const spoutCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(3.6, 3.6, 0),
    new THREE.Vector3(5.8, 6.2, 0),
    new THREE.Vector3(6.6, 9.6, 0),
  ]);
  const spout = new THREE.TubeGeometry(spoutCurve, 10, 0.72, 8, false);
  bodyGeoms.push(spout);

  // Lid + arched top handle + whistle cap
  const lidCap = new THREE.CylinderGeometry(2.1, 2.3, 0.7, 12);
  lidCap.translate(0, 9.8, 0);
  accentGeoms.push(lidCap);

  const handleCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-3.4, 7.6, 0),
    new THREE.Vector3(-4.8, 12.6, 0),
    new THREE.Vector3(0, 14.2, 0),
    new THREE.Vector3(3.2, 11.4, 0),
  ]);
  const handle = new THREE.TubeGeometry(handleCurve, 14, 0.55, 8, false);
  accentGeoms.push(handle);

  const spoutTip = new THREE.CylinderGeometry(0.95, 0.72, 1.1, 10);
  spoutTip.translate(6.6, 9.9, 0);
  accentGeoms.push(spoutTip);

  const bodyGeom = mergeNormalized(bodyGeoms);
  const accentGeom = mergeNormalized(accentGeoms);

  const bodyMat = createSurfaceMaterial(graphicsPreset, {
    color,
    roughness: 0.22,
    metalness: 0.15,
    clearcoat: 0.9,
    physical: true,
    fog: false,
  });
  const accentMat = createSurfaceMaterial(graphicsPreset, {
    color: accentColor,
    roughness: 0.24,
    metalness: 0.5,
    fog: false,
  });

  const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
  bodyMesh.castShadow = castShadows;
  bodyMesh.receiveShadow = receiveShadows;
  const accentMesh = new THREE.Mesh(accentGeom, accentMat);
  accentMesh.castShadow = castShadows;
  group.add(bodyMesh, accentMesh);
  freezeStatic(group);

  const spoutLocal = new THREE.Vector3(6.8 * scale, 10.6 * scale, 0);
  spoutLocal.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation).add(pos);

  return {
    group,
    spoutWorldPos: spoutLocal,
    dispose(): void {
      bodyGeom.dispose();
      accentGeom.dispose();
      bodyMat.dispose();
      accentMat.dispose();
    },
  };
}

export function buildPanLoopFrame(
  route: Route,
  startS: number,
  endS: number,
  color: string,
  secondaryColor: string,
  graphicsPreset: GraphicsPreset,
  receiveShadows: boolean,
  castShadows: boolean,
): CookwareBuildHandle {
  const group = new THREE.Group();
  group.name = 'KitchenPanLoopFrame';

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  // Swept flared frying pan outer collar hugging the underside (-up) of the loop track
  const ringCount = 26;
  const frames: TrackFrame[] = [];
  for (let i = 0; i <= ringCount; i++) {
    const s = THREE.MathUtils.lerp(startS, endS, i / ringCount);
    frames.push(route.getFrameAt(s));
  }

  // Cross-section sits cleanly behind (-up) the loop track (y <= -0.68) and flares out to ±10.6 m
  const prof = [
    { x: -10.8, y: -0.25 },
    { x: -10.0, y: -2.0 },
    { x: 10.0, y: -2.0 },
    { x: 10.8, y: -0.25 },
    { x: 9.2, y: -0.25 },
    { x: 8.6, y: -1.1 },
    { x: -8.6, y: -1.1 },
    { x: -9.2, y: -0.25 },
  ];
  const stride = prof.length;
  const positions = new Float32Array(frames.length * stride * 3);
  const indices: number[] = [];
  const tmp = new THREE.Vector3();

  for (let r = 0; r < frames.length; r++) {
    const f = frames[r];
    for (let p = 0; p < stride; p++) {
      const pt = prof[p];
      tmp.copy(f.position).addScaledVector(f.right, pt.x).addScaledVector(f.up, pt.y);
      const idx = r * stride + p;
      positions[idx * 3] = tmp.x;
      positions[idx * 3 + 1] = tmp.y;
      positions[idx * 3 + 2] = tmp.z;
    }
  }

  for (let r = 0; r < frames.length - 1; r++) {
    const rowA = r * stride;
    const rowB = (r + 1) * stride;
    for (let p = 0; p < stride; p++) {
      const pNext = (p + 1) % stride;
      const a = rowA + p;
      const b = rowA + pNext;
      const c = rowB + p;
      const d = rowB + pNext;
      indices.push(a, b, c, b, d, c);
    }
  }

  const panRimGeom = new THREE.BufferGeometry();
  panRimGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  panRimGeom.setIndex(indices);
  panRimGeom.computeVertexNormals();
  panRimGeom.computeBoundingSphere();
  geometries.push(panRimGeom);

  const panMat = createSurfaceMaterial(graphicsPreset, {
    color,
    roughness: 0.24,
    metalness: 0.18,
    clearcoat: 0.85,
    physical: true,
    side: THREE.DoubleSide,
    fog: false,
  });
  const handleMat = createSurfaceMaterial(graphicsPreset, {
    color: secondaryColor,
    roughness: 0.28,
    metalness: 0.12,
    clearcoat: 0.8,
    physical: true,
    fog: false,
  });
  materials.push(panMat, handleMat);

  const panMesh = new THREE.Mesh(panRimGeom, panMat);
  panMesh.name = 'PanLoopCollar';
  panMesh.castShadow = castShadows;
  panMesh.receiveShadow = receiveShadows;
  freezeStatic(panMesh);
  group.add(panMesh);

  // Giant frying pan handle rising diagonally up and outward (+X, +Y) from the top-outer rim
  const topOuterFrame = route.getFrameAt(THREE.MathUtils.lerp(startS, endS, 0.36));
  const anchorPos = topOuterFrame.position
    .clone()
    .addScaledVector(topOuterFrame.up, -2.0)
    .addScaledVector(topOuterFrame.right, -6.5);
  const handleDir = new THREE.Vector3(0.72, 0.69, 0.08).normalize();
  const handleLen = 34;
  const handleEnd = anchorPos.clone().addScaledVector(handleDir, handleLen);

  const handleGeoms: THREE.BufferGeometry[] = [];
  const shaft = new THREE.CylinderGeometry(1.5, 2.0, handleLen, 12);
  const mid = new THREE.Vector3().addVectors(anchorPos, handleEnd).multiplyScalar(0.5);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), handleDir);
  shaft.applyMatrix4(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)));
  handleGeoms.push(shaft);

  const gripTip = new THREE.TorusGeometry(2.3, 0.68, 8, 16);
  gripTip.applyMatrix4(new THREE.Matrix4().compose(handleEnd, q, new THREE.Vector3(1, 1, 1)));
  handleGeoms.push(gripTip);

  // Pedestal base under loop
  const entryFrame = route.getFrameAt(startS);
  const exitFrame = route.getFrameAt(endS);
  const baseCenter = new THREE.Vector3()
    .addVectors(entryFrame.position, exitFrame.position)
    .multiplyScalar(0.5);
  const baseH = Math.max(2, baseCenter.y - 1.5);
  const baseStand = new THREE.BoxGeometry(34, baseH, 16);
  baseStand.translate(baseCenter.x, baseH * 0.5, baseCenter.z);
  handleGeoms.push(baseStand);

  const mergedHandle = mergeNormalized(handleGeoms);
  geometries.push(mergedHandle);
  const handleMesh = new THREE.Mesh(mergedHandle, handleMat);
  handleMesh.name = 'PanLoopHandleAndBase';
  handleMesh.castShadow = castShadows;
  handleMesh.receiveShadow = receiveShadows;
  freezeStatic(handleMesh);
  group.add(handleMesh);

  return {
    group,
    dispose(): void {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
