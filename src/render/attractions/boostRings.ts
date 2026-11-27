// src/render/attractions/boostRings.ts

import * as THREE from 'three';
import { CONFIG, type GraphicsPreset } from '../../config';
import type { BoostRingState } from '../../core/attractions';
import type {
  AttractionSkinId,
  BoostRingAttractionSpec,
} from '../../courses/fantasyLandAttractions';
import { getAttractionSkin } from './skins';

export interface BoostRingsVisualGroup {
  readonly group: THREE.Group;
  update: (states: readonly BoostRingState[], playerPos: THREE.Vector3) => void;
  setQuality: (preset: GraphicsPreset) => void;
  dispose: () => void;
}

export function createBoostRingsVisuals(
  specs: readonly BoostRingAttractionSpec[],
  preset: GraphicsPreset,
  skinId: AttractionSkinId = 'default',
): BoostRingsVisualGroup {
  const group = new THREE.Group();
  group.name = 'BoostRingsAttractionsGroup';

  const skin = getAttractionSkin(skinId);
  let parts = skin.createBoostRingsParts(preset);
  const fallbackInnerGeo = new THREE.TorusGeometry(0.1, 0.02, 4, 4);

  const cyanSpecs: Array<{ index: number; spec: BoostRingAttractionSpec }> = [];
  const yellowSpecs: Array<{ index: number; spec: BoostRingAttractionSpec }> = [];
  for (let i = 0; i < specs.length; i++) {
    if (specs[i].variant === 'yellow') {
      yellowSpecs.push({ index: i, spec: specs[i] });
    } else {
      cyanSpecs.push({ index: i, spec: specs[i] });
    }
  }

  const cyanMesh = new THREE.InstancedMesh(parts.outerGeo, parts.cyanMat, Math.max(1, cyanSpecs.length));
  cyanMesh.name = 'BoostRingsCyanInstancedMesh';
  cyanMesh.frustumCulled = false;
  cyanMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const yellowMesh = new THREE.InstancedMesh(
    parts.outerGeo,
    parts.yellowMat,
    Math.max(1, yellowSpecs.length),
  );
  yellowMesh.name = 'BoostRingsYellowInstancedMesh';
  yellowMesh.frustumCulled = false;
  yellowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const innerGeoInit = parts.innerGeo ?? fallbackInnerGeo;
  const cyanInnerMesh = new THREE.InstancedMesh(
    innerGeoInit,
    parts.yellowMat,
    Math.max(1, cyanSpecs.length),
  );
  cyanInnerMesh.name = 'BoostRingsCyanInnerInstancedMesh';
  cyanInnerMesh.frustumCulled = false;
  cyanInnerMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const yellowInnerMesh = new THREE.InstancedMesh(
    innerGeoInit,
    parts.cyanMat,
    Math.max(1, yellowSpecs.length),
  );
  yellowInnerMesh.name = 'BoostRingsYellowInnerInstancedMesh';
  yellowInnerMesh.frustumCulled = false;
  yellowInnerMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  if (cyanSpecs.length > 0) {
    group.add(cyanMesh, cyanInnerMesh);
  }
  if (yellowSpecs.length > 0) {
    group.add(yellowMesh, yellowInnerMesh);
  }

  const dummy = new THREE.Object3D();
  const basisMat = new THREE.Matrix4();
  const baseQuat = new THREE.Quaternion();
  const spinQuat = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);

  const updateSet = (
    list: readonly { index: number; spec: BoostRingAttractionSpec }[],
    outerMesh: THREE.InstancedMesh,
    innerMesh: THREE.InstancedMesh,
    states: readonly BoostRingState[],
    playerPos: THREE.Vector3,
    maxDistSq: number,
  ): void => {
    const showInner = parts.innerGeo !== null;
    let count = 0;
    for (let i = 0; i < list.length; i++) {
      const { index, spec } = list[i];
      const st = states[index];
      if (!st) continue;
      if (spec.worldPos.distanceToSquared(playerPos) > maxDistSq) {
        continue;
      }

      // Torus faces along track tangent (-local Z aligns with tangent)
      basisMat.makeBasis(spec.worldRight, spec.worldUp, spec.worldTangent.clone().negate());
      baseQuat.setFromRotationMatrix(basisMat);

      spinQuat.setFromAxisAngle(zAxis, st.spinAngleRad * 0.55);
      dummy.position.copy(spec.worldPos);
      dummy.quaternion.copy(baseQuat).multiply(spinQuat);
      dummy.scale.setScalar(st.pulseScale);
      dummy.updateMatrix();
      outerMesh.setMatrixAt(count, dummy.matrix);

      if (showInner) {
        spinQuat.setFromAxisAngle(zAxis, -st.spinAngleRad);
        dummy.quaternion.copy(baseQuat).multiply(spinQuat);
        dummy.scale.setScalar(st.pulseScale * 1.01);
        dummy.updateMatrix();
        innerMesh.setMatrixAt(count, dummy.matrix);
      }
      count++;
    }
    outerMesh.count = count;
    outerMesh.visible = count > 0;
    innerMesh.count = showInner ? count : 0;
    innerMesh.visible = showInner && count > 0;
    if (count > 0) {
      outerMesh.instanceMatrix.needsUpdate = true;
      if (showInner) {
        innerMesh.instanceMatrix.needsUpdate = true;
      }
    }
  };

  const update = (states: readonly BoostRingState[], playerPos: THREE.Vector3): void => {
    const distLimit = CONFIG.attractions.updateDistance * parts.maxDistanceScale;
    const maxDistSq = distLimit * distLimit;
    if (cyanSpecs.length > 0) {
      updateSet(cyanSpecs, cyanMesh, cyanInnerMesh, states, playerPos, maxDistSq);
    }
    if (yellowSpecs.length > 0) {
      updateSet(yellowSpecs, yellowMesh, yellowInnerMesh, states, playerPos, maxDistSq);
    }
  };

  const setQuality = (nextPreset: GraphicsPreset): void => {
    const prev = parts;
    parts = skin.createBoostRingsParts(nextPreset);
    cyanMesh.geometry = parts.outerGeo;
    yellowMesh.geometry = parts.outerGeo;
    const nextInner = parts.innerGeo ?? fallbackInnerGeo;
    cyanInnerMesh.geometry = nextInner;
    yellowInnerMesh.geometry = nextInner;

    cyanMesh.material = parts.cyanMat;
    yellowInnerMesh.material = parts.cyanMat;
    yellowMesh.material = parts.yellowMat;
    cyanInnerMesh.material = parts.yellowMat;
    prev.dispose();
  };

  const dispose = (): void => {
    parts.dispose();
    fallbackInnerGeo.dispose();
  };

  return { group, update, setQuality, dispose };
}
