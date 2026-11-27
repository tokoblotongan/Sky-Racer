// src/render/attractions/windFan.ts

import * as THREE from 'three';
import { CONFIG, type GraphicsPreset } from '../../config';
import type { WindFanState } from '../../core/attractions';
import type { AttractionSkinId } from '../../courses/fantasyLandAttractions';
import type { QualityLevel } from '../quality';
import { getAttractionSkin } from './skins';

export interface WindFanVisualGroup {
  readonly group: THREE.Group;
  update: (states: readonly WindFanState[], timeSec: number, playerPos: THREE.Vector3) => void;
  setQuality: (preset: GraphicsPreset, quality: QualityLevel) => void;
  dispose: () => void;
}

export function createWindFanVisuals(
  states: readonly WindFanState[],
  preset: GraphicsPreset,
  quality: QualityLevel,
  skinId: AttractionSkinId = 'default',
): WindFanVisualGroup {
  const group = new THREE.Group();
  group.name = 'WindFanAttractionsGroup';

  const skin = getAttractionSkin(skinId);
  let parts = skin.createWindFanParts(preset, quality);

  const maxStreaks = CONFIG.attractions.wind.streakCount.high;
  const streakMesh = new THREE.InstancedMesh(parts.streakGeo, parts.streakMat, maxStreaks);
  streakMesh.name = 'WindStreaksInstancedMesh';
  streakMesh.frustumCulled = false;
  streakMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  interface FanEntry {
    root: THREE.Group;
    rotor: THREE.Group;
    blades: THREE.Mesh[];
    shroud: THREE.Mesh;
    stand: THREE.Mesh;
    hub: THREE.Mesh;
    worldPos: THREE.Vector3;
    forward: THREE.Vector3;
    up: THREE.Vector3;
    right: THREE.Vector3;
    sStart: number;
    sEnd: number;
    trackWidth: number;
    direction: -1 | 1;
  }

  const entries: FanEntry[] = [];
  const basisMat = new THREE.Matrix4();
  const dummy = new THREE.Object3D();
  const tmpPos = new THREE.Vector3();
  const tmpBasisQuat = new THREE.Quaternion();
  const maxDistSq = CONFIG.attractions.updateDistance * CONFIG.attractions.updateDistance;
  let activeStreaksPerZone = parts.streakCount;

  for (let i = 0; i < states.length; i++) {
    const spec = states[i].spec;
    const root = new THREE.Group();
    root.name = `WindFan_${spec.id}`;
    basisMat.makeBasis(spec.fanTowerRight, spec.fanTowerUp, spec.fanTowerForward.clone().negate());
    root.position.copy(spec.fanTowerPos);
    root.quaternion.setFromRotationMatrix(basisMat);

    const stand = new THREE.Mesh(parts.standGeo, parts.frameMat);
    stand.position.set(0, -2.0, 0);

    const shroud = new THREE.Mesh(parts.shroudGeo, parts.frameMat);
    const hub = new THREE.Mesh(parts.hubGeo, parts.hubMat);
    const rotor = new THREE.Group();
    const blades: THREE.Mesh[] = [];
    for (let b = 0; b < 4; b++) {
      const blade = new THREE.Mesh(parts.bladeGeo, parts.bladeMat);
      blade.rotation.x = b * Math.PI * 0.5;
      blade.rotation.y = 0.25 * spec.direction;
      rotor.add(blade);
      blades.push(blade);
    }

    root.add(stand, shroud, hub, rotor);
    group.add(root);

    entries.push({
      root,
      rotor,
      blades,
      shroud,
      stand,
      hub,
      worldPos: spec.fanTowerPos,
      forward: spec.fanTowerForward,
      up: spec.fanTowerUp,
      right: spec.fanTowerRight,
      sStart: spec.sStart,
      sEnd: spec.sEnd,
      trackWidth: spec.trackWidth,
      direction: spec.direction,
    });
  }

  group.add(streakMesh);

  const update = (liveStates: readonly WindFanState[], timeSec: number, playerPos: THREE.Vector3): void => {
    let streakIdx = 0;
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const st = liveStates[i];
      if (!st) continue;
      const distSq = entry.worldPos.distanceToSquared(playerPos);
      const visible = distSq <= maxDistSq;
      entry.root.visible = visible;
      if (!visible) continue;

      entry.rotor.rotation.x = st.fanAngleRad * entry.direction;

      if (st.active && activeStreaksPerZone > 0) {
        basisMat.makeBasis(entry.right, entry.up, entry.forward.clone().negate());
        tmpBasisQuat.setFromRotationMatrix(basisMat);
        const spanZ = Math.max(10, entry.sEnd - entry.sStart);
        const halfW = entry.trackWidth * 0.5 + 1.5;

        for (let k = 0; k < activeStreaksPerZone && streakIdx < maxStreaks; k++) {
          const seed = (k * 0.6180339887) % 1;
          const travel = (timeSec * 1.45 + seed * 3.7) % 1;
          const lat = THREE.MathUtils.lerp(-halfW, halfW, entry.direction > 0 ? travel : 1 - travel);
          const along = (k / activeStreaksPerZone - 0.5) * spanZ * 0.86;
          const height = 0.6 + ((k * 0.37) % 1) * 3.4;

          tmpPos
            .copy(entry.worldPos)
            .addScaledVector(entry.right, (entry.trackWidth * 0.5 + 4.4) * entry.direction + lat)
            .addScaledVector(entry.forward, along)
            .addScaledVector(entry.up, height - 3.6);

          dummy.position.copy(tmpPos);
          dummy.quaternion.copy(tmpBasisQuat);
          const edgeFade = Math.sin(travel * Math.PI);
          dummy.scale.set(0.7 + edgeFade * 0.8, 1, 1);
          dummy.updateMatrix();
          streakMesh.setMatrixAt(streakIdx, dummy.matrix);
          streakIdx++;
        }
      }
    }
    streakMesh.count = streakIdx;
    streakMesh.visible = streakIdx > 0;
    if (streakIdx > 0) {
      streakMesh.instanceMatrix.needsUpdate = true;
    }
  };

  const setQuality = (nextPreset: GraphicsPreset, nextQuality: QualityLevel): void => {
    const prev = parts;
    parts = skin.createWindFanParts(nextPreset, nextQuality);
    activeStreaksPerZone = parts.streakCount;
    for (const e of entries) {
      e.stand.geometry = parts.standGeo;
      e.stand.material = parts.frameMat;
      e.shroud.geometry = parts.shroudGeo;
      e.shroud.material = parts.frameMat;
      e.hub.geometry = parts.hubGeo;
      e.hub.material = parts.hubMat;
      for (const b of e.blades) {
        b.geometry = parts.bladeGeo;
        b.material = parts.bladeMat;
      }
    }
    streakMesh.geometry = parts.streakGeo;
    streakMesh.material = parts.streakMat;
    prev.dispose();
  };

  const dispose = (): void => {
    parts.dispose();
  };

  return { group, update, setQuality, dispose };
}
