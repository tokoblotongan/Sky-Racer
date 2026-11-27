// src/render/attractions/pendulum.ts

import * as THREE from 'three';
import { CONFIG, type GraphicsPreset } from '../../config';
import type { PendulumState } from '../../core/attractions';
import type { AttractionSkinId } from '../../courses/fantasyLandAttractions';
import { getAttractionSkin } from './skins';

export interface PendulumVisualGroup {
  readonly group: THREE.Group;
  update: (states: readonly PendulumState[], playerPos: THREE.Vector3) => void;
  setQuality: (preset: GraphicsPreset) => void;
  dispose: () => void;
}

export function createPendulumVisuals(
  preset: GraphicsPreset,
  skinId: AttractionSkinId = 'default',
): PendulumVisualGroup {
  const group = new THREE.Group();
  group.name = 'PendulumAttractionsGroup';

  const cfg = CONFIG.attractions.pendulum;
  const skin = getAttractionSkin(skinId);
  let parts = skin.createPendulumParts(preset);

  interface Entry {
    root: THREE.Group;
    swingPivot: THREE.Group;
    leftPillar: THREE.Mesh;
    rightPillar: THREE.Mesh;
    topBeam: THREE.Mesh;
    hub: THREE.Mesh;
    arm: THREE.Mesh;
    bob: THREE.Mesh;
    band: THREE.Mesh;
    worldPos: THREE.Vector3;
  }

  const entries: Entry[] = [];
  const basisMat = new THREE.Matrix4();
  const maxDistSq = CONFIG.attractions.updateDistance * CONFIG.attractions.updateDistance;

  const rebuildEntries = (states: readonly PendulumState[]): void => {
    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }
    entries.length = 0;

    for (let i = 0; i < states.length; i++) {
      const st = states[i];
      const spec = st.spec;
      const root = new THREE.Group();
      root.name = `Pendulum_${spec.id}`;

      basisMat.makeBasis(spec.worldRight, spec.worldUp, spec.worldTangent.clone().negate());
      root.position.copy(spec.worldPos);
      root.quaternion.setFromRotationMatrix(basisMat);

      const postX = spec.trackWidth * 0.5 + 1.05;
      const leftPillar = new THREE.Mesh(parts.pillarGeo, parts.archMat);
      leftPillar.position.set(-postX, cfg.pivotHeight * 0.5, 0);
      leftPillar.castShadow = false;
      leftPillar.receiveShadow = true;
      leftPillar.visible = parts.showArch;

      const rightPillar = new THREE.Mesh(parts.pillarGeo, parts.archMat);
      rightPillar.position.set(postX, cfg.pivotHeight * 0.5, 0);
      rightPillar.castShadow = false;
      rightPillar.receiveShadow = true;
      rightPillar.visible = parts.showArch;

      const topBeam = new THREE.Mesh(parts.beamGeo, parts.handleMat);
      topBeam.scale.set(postX * 2 + 1.2, 1, 1);
      topBeam.position.set(0, cfg.pivotHeight + 0.15, 0);
      topBeam.visible = parts.showArch;

      const hub = new THREE.Mesh(parts.pivotHubGeo, parts.accentMat);
      hub.position.set(0, cfg.pivotHeight, 0);

      const swingPivot = new THREE.Group();
      swingPivot.position.set(0, cfg.pivotHeight, 0);

      const arm = new THREE.Mesh(parts.armGeo, parts.handleMat);
      const bob = new THREE.Mesh(parts.bobGeo, parts.bobMat);
      bob.position.set(0, -cfg.armLength, 0);
      const band = new THREE.Mesh(parts.bandGeo, parts.accentMat);
      band.position.set(0, -cfg.armLength, 0);

      swingPivot.add(arm, bob, band);
      root.add(leftPillar, rightPillar, topBeam, hub, swingPivot);
      group.add(root);

      entries.push({
        root,
        swingPivot,
        leftPillar,
        rightPillar,
        topBeam,
        hub,
        arm,
        bob,
        band,
        worldPos: spec.worldPos,
      });
    }
  };

  const update = (states: readonly PendulumState[], playerPos: THREE.Vector3): void => {
    if (entries.length !== states.length) {
      rebuildEntries(states);
    }
    for (let i = 0; i < states.length; i++) {
      const st = states[i];
      const entry = entries[i];
      const distSq = entry.worldPos.distanceToSquared(playerPos);
      const visible = distSq <= maxDistSq;
      entry.root.visible = visible;
      if (!visible) continue;
      // Rotate around local Z axis so +angle swings toward +X (worldRight)
      entry.swingPivot.rotation.z = st.angleRad;
    }
  };

  const setQuality = (nextPreset: GraphicsPreset): void => {
    const prev = parts;
    parts = skin.createPendulumParts(nextPreset);
    for (const e of entries) {
      e.leftPillar.geometry = parts.pillarGeo;
      e.leftPillar.material = parts.archMat;
      e.leftPillar.visible = parts.showArch;

      e.rightPillar.geometry = parts.pillarGeo;
      e.rightPillar.material = parts.archMat;
      e.rightPillar.visible = parts.showArch;

      e.topBeam.geometry = parts.beamGeo;
      e.topBeam.material = parts.handleMat;
      e.topBeam.visible = parts.showArch;

      e.hub.geometry = parts.pivotHubGeo;
      e.hub.material = parts.accentMat;

      e.arm.geometry = parts.armGeo;
      e.arm.material = parts.handleMat;

      e.bob.geometry = parts.bobGeo;
      e.bob.material = parts.bobMat;

      e.band.geometry = parts.bandGeo;
      e.band.material = parts.accentMat;
    }
    prev.dispose();
  };

  const dispose = (): void => {
    parts.dispose();
  };

  return { group, update, setQuality, dispose };
}
