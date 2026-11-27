// src/render/attractions/boostRings.ts

import * as THREE from 'three';
import { CONFIG, type GraphicsPreset } from '../../config';
import type { BoostRingState } from '../../core/attractions';
import type { BoostRingAttractionSpec } from '../../courses/fantasyLandAttractions';
import { createSurfaceMaterial, type SurfaceMaterial } from '../materialFactory';

export interface BoostRingsVisualGroup {
  readonly group: THREE.Group;
  update: (states: readonly BoostRingState[], playerPos: THREE.Vector3) => void;
  setQuality: (preset: GraphicsPreset) => void;
  dispose: () => void;
}

export function createBoostRingsVisuals(
  specs: readonly BoostRingAttractionSpec[],
  preset: GraphicsPreset,
): BoostRingsVisualGroup {
  const group = new THREE.Group();
  group.name = 'BoostRingsAttractionsGroup';

  const rCfg = CONFIG.attractions.ring;
  const ringGeo = new THREE.TorusGeometry(rCfg.radius, rCfg.tubeRadius, 12, 28);
  const innerAccentGeo = new THREE.TorusGeometry(rCfg.radius * 0.84, rCfg.tubeRadius * 0.42, 8, 6);

  const cyanSpecs: Array<{ index: number; spec: BoostRingAttractionSpec }> = [];
  const yellowSpecs: Array<{ index: number; spec: BoostRingAttractionSpec }> = [];
  for (let i = 0; i < specs.length; i++) {
    if (specs[i].variant === 'yellow') {
      yellowSpecs.push({ index: i, spec: specs[i] });
    } else {
      cyanSpecs.push({ index: i, spec: specs[i] });
    }
  }

  const makeMat = (p: GraphicsPreset, colorHex: number, emissiveHex: number): SurfaceMaterial =>
    createSurfaceMaterial(p, {
      color: colorHex,
      emissive: emissiveHex,
      emissiveIntensity: 1.25,
      roughness: 0.18,
      metalness: 0.25,
    });

  let cyanMat = makeMat(preset, 0x00e5ff, 0x00e5ff);
  let yellowMat = makeMat(preset, 0xffd000, 0xffb703);

  const cyanMesh = new THREE.InstancedMesh(ringGeo, cyanMat, Math.max(1, cyanSpecs.length));
  cyanMesh.name = 'BoostRingsCyanInstancedMesh';
  cyanMesh.frustumCulled = false;
  cyanMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const yellowMesh = new THREE.InstancedMesh(ringGeo, yellowMat, Math.max(1, yellowSpecs.length));
  yellowMesh.name = 'BoostRingsYellowInstancedMesh';
  yellowMesh.frustumCulled = false;
  yellowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  // Accent hex rim spins inside the main torus (yellow core in cyan ring, cyan core in yellow ring)
  const cyanInnerMesh = new THREE.InstancedMesh(
    innerAccentGeo,
    yellowMat,
    Math.max(1, cyanSpecs.length),
  );
  cyanInnerMesh.name = 'BoostRingsCyanInnerInstancedMesh';
  cyanInnerMesh.frustumCulled = false;
  cyanInnerMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const yellowInnerMesh = new THREE.InstancedMesh(
    innerAccentGeo,
    cyanMat,
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
  const maxDistSq = CONFIG.attractions.updateDistance * CONFIG.attractions.updateDistance;

  const updateSet = (
    list: readonly { index: number; spec: BoostRingAttractionSpec }[],
    outerMesh: THREE.InstancedMesh,
    innerMesh: THREE.InstancedMesh,
    states: readonly BoostRingState[],
    playerPos: THREE.Vector3,
  ): void => {
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

      spinQuat.setFromAxisAngle(zAxis, -st.spinAngleRad);
      dummy.quaternion.copy(baseQuat).multiply(spinQuat);
      dummy.scale.setScalar(st.pulseScale * 1.01);
      dummy.updateMatrix();
      innerMesh.setMatrixAt(count, dummy.matrix);
      count++;
    }
    outerMesh.count = count;
    innerMesh.count = count;
    outerMesh.visible = count > 0;
    innerMesh.visible = count > 0;
    if (count > 0) {
      outerMesh.instanceMatrix.needsUpdate = true;
      innerMesh.instanceMatrix.needsUpdate = true;
    }
  };

  const update = (states: readonly BoostRingState[], playerPos: THREE.Vector3): void => {
    if (cyanSpecs.length > 0) {
      updateSet(cyanSpecs, cyanMesh, cyanInnerMesh, states, playerPos);
    }
    if (yellowSpecs.length > 0) {
      updateSet(yellowSpecs, yellowMesh, yellowInnerMesh, states, playerPos);
    }
  };

  const setQuality = (nextPreset: GraphicsPreset): void => {
    const prevCyan = cyanMat;
    const prevYellow = yellowMat;
    cyanMat = makeMat(nextPreset, 0x00e5ff, 0x00e5ff);
    yellowMat = makeMat(nextPreset, 0xffd000, 0xffb703);
    cyanMesh.material = cyanMat;
    yellowInnerMesh.material = cyanMat;
    yellowMesh.material = yellowMat;
    cyanInnerMesh.material = yellowMat;
    prevCyan.dispose();
    prevYellow.dispose();
  };

  const dispose = (): void => {
    ringGeo.dispose();
    innerAccentGeo.dispose();
    cyanMat.dispose();
    yellowMat.dispose();
  };

  return { group, update, setQuality, dispose };
}
