// src/render/fantasy/rainbow.ts

import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { ResolvedDecorPlacement } from '../../courses/fantasyLandDecor';
import {
  countGeometryTriangles,
  type FantasyDecorMaterials,
  type FantasyDecorModule,
} from './decorMaterials';

function buildRainbowArchGeometry(
  halfSpan: number,
  apexY: number,
  bandWidth: number,
  archSegments: number,
): THREE.BufferGeometry {
  const radialSubdivs = 1;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // Smooth elliptical arch from (-halfSpan, -4, 0) up to (0, apexY, 0) to (+halfSpan, -4, 0)
  // Using -4 at base ensures legs embed cleanly into meadow ground (y = 0)
  const baseSink = -4;
  const heightSpan = apexY - baseSink;
  const innerR = halfSpan - bandWidth * 0.5;
  const outerR = halfSpan + bandWidth * 0.5;
  const innerH = heightSpan - bandWidth * 0.5;
  const outerH = heightSpan + bandWidth * 0.5;

  const halfDepth = 1.1; // Slight front/back thickness for clean 3D silhouette from oblique views

  for (let i = 0; i <= archSegments; i++) {
    const t = i / archSegments;
    const theta = Math.PI * (1 - t); // PI -> 0
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    const ix = cosT * innerR;
    const iy = baseSink + sinT * innerH;
    const ox = cosT * outerR;
    const oy = baseSink + sinT * outerH;

    // Front face (z = +halfDepth) & Back face (z = -halfDepth)
    // Vertices per slice: 0=innerFront, 1=outerFront, 2=innerBack, 3=outerBack
    positions.push(ix, iy, halfDepth);
    normals.push(0, 0, 1);
    uvs.push(t, 1);

    positions.push(ox, oy, halfDepth);
    normals.push(0, 0, 1);
    uvs.push(t, 0);

    positions.push(ix, iy, -halfDepth);
    normals.push(0, 0, -1);
    uvs.push(t, 1);

    positions.push(ox, oy, -halfDepth);
    normals.push(0, 0, -1);
    uvs.push(t, 0);
  }

  const stride = 4 * radialSubdivs;
  for (let i = 0; i < archSegments; i++) {
    const a = i * stride;
    const b = (i + 1) * stride;

    // Front face
    indices.push(a + 0, a + 1, b + 1);
    indices.push(a + 0, b + 1, b + 0);

    // Back face
    indices.push(a + 2, b + 3, a + 3);
    indices.push(a + 2, b + 2, b + 3);

    // Outer edge cap
    indices.push(a + 1, a + 3, b + 3);
    indices.push(a + 1, b + 3, b + 1);

    // Inner edge cap
    indices.push(a + 0, b + 2, a + 2);
    indices.push(a + 0, b + 0, b + 2);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeBoundingSphere();
  return geom;
}

export function buildRainbowLandmark(
  placement: ResolvedDecorPlacement,
  mats: FantasyDecorMaterials,
  quality: 'high' | 'medium' | 'mobile',
): FantasyDecorModule {
  const group = new THREE.Group();
  group.name = 'FantasyRainbowGroup';

  const halfSpan = placement.halfSpan ?? placement.spec.distance;
  const apexWorldY = placement.position.y;
  const bandWidth = 9.5;
  const segments = quality === 'mobile' ? 28 : 48;

  const geom = buildRainbowArchGeometry(halfSpan, apexWorldY, bandWidth, segments);
  const mesh = new THREE.Mesh(geom, mats.rainbowMat);
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  // Align local +X along placement.right (which is perpendicular to placement.tangent)
  // At ground center (x, 0, z), local +X aligns with frame.right, local +Y with world +Y
  const rightVec = new THREE.Vector3(placement.right.x, 0, placement.right.z).normalize();
  const upVec = new THREE.Vector3(0, 1, 0);
  const fwdVec = new THREE.Vector3().crossVectors(rightVec, upVec).normalize();
  const basisMat = new THREE.Matrix4().makeBasis(rightVec, upVec, fwdVec);
  mesh.quaternion.setFromRotationMatrix(basisMat);
  mesh.position.set(placement.position.x, 0, placement.position.z);
  mesh.updateMatrix();
  mesh.matrixAutoUpdate = false;
  group.add(mesh);

  const pulseSpeed = CONFIG.fantasy.animSpeeds.rainbowPulseSpeed;
  const triangles = countGeometryTriangles(geom);

  return {
    group,
    update(timeSec: number): void {
      mats.rainbowMat.emissiveIntensity = 0.56 + 0.14 * Math.sin(timeSec * pulseSpeed);
    },
    dispose(): void {
      geom.dispose();
    },
    getTriangleCount(): number {
      return triangles;
    },
    getDrawCallCount(): number {
      return 1;
    },
  };
}
