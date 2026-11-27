// src/render/attractions/rollingBalls.ts

import * as THREE from 'three';
import { CONFIG, type GraphicsPreset } from '../../config';
import type { RollingBallGroupState } from '../../core/attractions';
import type { AttractionSkinId } from '../../courses/fantasyLandAttractions';
import { getAttractionSkin } from './skins';

export interface RollingBallsVisualGroup {
  readonly group: THREE.Group;
  update: (groups: readonly RollingBallGroupState[], playerPos: THREE.Vector3) => void;
  setQuality: (preset: GraphicsPreset) => void;
  dispose: () => void;
}

export function createRollingBallsVisuals(
  groups: readonly RollingBallGroupState[],
  preset: GraphicsPreset,
  skinId: AttractionSkinId = 'default',
): RollingBallsVisualGroup {
  const group = new THREE.Group();
  group.name = 'RollingBallsAttractionsGroup';

  const bCfg = CONFIG.attractions.balls;
  const totalBalls = Math.max(
    1,
    groups.reduce((acc, g) => acc + g.balls.length, 0),
  );

  const skin = getAttractionSkin(skinId);
  let parts = skin.createRollingBallsParts(preset);

  const mesh = new THREE.InstancedMesh(parts.ballGeo, parts.ballMat, totalBalls);
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
      tmpColor.setHex(parts.tints[colorIdx % parts.tints.length]);
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
    const prev = parts;
    parts = skin.createRollingBallsParts(nextPreset);
    mesh.geometry = parts.ballGeo;
    mesh.material = parts.ballMat;
    prev.dispose();
  };

  const dispose = (): void => {
    parts.dispose();
  };

  return { group, update, setQuality, dispose };
}
