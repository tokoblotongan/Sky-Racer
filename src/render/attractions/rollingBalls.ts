// src/render/attractions/rollingBalls.ts

import * as THREE from 'three';
import { CONFIG, type GraphicsPreset } from '../../config';
import type { RollingBallGroupState } from '../../core/attractions';
import { createSurfaceMaterial, type SurfaceMaterial } from '../materialFactory';

export interface RollingBallsVisualGroup {
  readonly group: THREE.Group;
  update: (groups: readonly RollingBallGroupState[], playerPos: THREE.Vector3) => void;
  setQuality: (preset: GraphicsPreset) => void;
  dispose: () => void;
}

function createBallStripeTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#FFFDF7';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#0A5CFF';
    ctx.fillRect(0, size * 0.22, size, size * 0.16);
    ctx.fillStyle = '#FF2FD0';
    ctx.fillRect(0, size * 0.62, size, size * 0.16);
    ctx.fillStyle = '#FFD000';
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.arc((i + 0.5) * (size / 8), size * 0.5, 9, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const BALL_TINTS = [0xff477e, 0x38bdf8, 0xffd000, 0x22c55e];

export function createRollingBallsVisuals(
  groups: readonly RollingBallGroupState[],
  preset: GraphicsPreset,
): RollingBallsVisualGroup {
  const group = new THREE.Group();
  group.name = 'RollingBallsAttractionsGroup';

  const bCfg = CONFIG.attractions.balls;
  const totalBalls = Math.max(
    1,
    groups.reduce((acc, g) => acc + g.balls.length, 0),
  );

  const ballGeo = new THREE.SphereGeometry(bCfg.ballRadius, 22, 16);
  const ballTex = createBallStripeTexture();

  let ballMat: SurfaceMaterial = createSurfaceMaterial(preset, {
    color: 0xffffff,
    map: ballTex,
    roughness: 0.22,
    metalness: 0.08,
    emissive: 0xffffff,
    emissiveMap: ballTex,
    emissiveIntensity: 0.34,
  });

  const mesh = new THREE.InstancedMesh(ballGeo, ballMat, totalBalls);
  mesh.name = 'RollingBallsInstancedMesh';
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const dummy = new THREE.Object3D();
  const basisMat = new THREE.Matrix4();
  const tmpBasisQuat = new THREE.Quaternion();
  const tmpSpinQuat = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);
  const tmpColor = new THREE.Color();
  const tmpWorld = new THREE.Vector3();
  const maxDistSq = CONFIG.attractions.updateDistance * CONFIG.attractions.updateDistance;

  let colorIdx = 0;
  for (let g = 0; g < groups.length; g++) {
    for (let b = 0; b < groups[g].balls.length; b++) {
      tmpColor.setHex(BALL_TINTS[colorIdx % BALL_TINTS.length]);
      mesh.setColorAt(colorIdx, tmpColor);
      colorIdx++;
    }
  }
  if (mesh.instanceColor) {
    mesh.instanceColor.needsUpdate = true;
  }

  group.add(mesh);

  const update = (liveGroups: readonly RollingBallGroupState[], playerPos: THREE.Vector3): void => {
    let idx = 0;
    for (let g = 0; g < liveGroups.length; g++) {
      const grp = liveGroups[g];
      const spec = grp.spec;
      for (let b = 0; b < grp.balls.length; b++) {
        if (idx >= totalBalls) break;
        const ball = grp.balls[b];
        const bSpec = spec.balls[b];
        const distSq = bSpec.worldPos.distanceToSquared(playerPos);
        if (distSq > maxDistSq) {
          dummy.position.set(0, -9999, 0);
          dummy.scale.setScalar(0.001);
          dummy.updateMatrix();
          mesh.setMatrixAt(idx, dummy.matrix);
          idx++;
          continue;
        }

        tmpWorld
          .copy(bSpec.worldPos)
          .addScaledVector(bSpec.worldRight, ball.lateral)
          .addScaledVector(bSpec.worldUp, bCfg.ballRadius + 0.03);

        basisMat.makeBasis(
          bSpec.worldRight,
          bSpec.worldUp,
          bSpec.worldTangent.clone().negate(),
        );
        tmpBasisQuat.setFromRotationMatrix(basisMat);
        tmpSpinQuat.setFromAxisAngle(zAxis, ball.spinAngleRad);

        dummy.position.copy(tmpWorld);
        dummy.quaternion.copy(tmpBasisQuat).multiply(tmpSpinQuat);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        mesh.setMatrixAt(idx, dummy.matrix);
        idx++;
      }
    }
    mesh.count = idx;
    mesh.instanceMatrix.needsUpdate = true;
  };

  const setQuality = (nextPreset: GraphicsPreset): void => {
    const prev = ballMat;
    ballMat = createSurfaceMaterial(nextPreset, {
      color: 0xffffff,
      map: ballTex,
      roughness: 0.22,
      metalness: 0.08,
      emissive: 0xffffff,
      emissiveMap: ballTex,
      emissiveIntensity: 0.34,
    });
    mesh.material = ballMat;
    prev.dispose();
  };

  const dispose = (): void => {
    ballGeo.dispose();
    ballTex.dispose();
    ballMat.dispose();
  };

  return { group, update, setQuality, dispose };
}
