// src/render/attractions/telegraph.ts

import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { AttractionSystem } from '../../core/attractions';
import type { Course } from '../../core/course';
import type { AttractionSkinId } from '../../courses/fantasyLandAttractions';
import { getAttractionSkin } from './skins';

export interface TelegraphVisualGroup {
  readonly group: THREE.Group;
  update: (attractions: AttractionSystem, playerPos: THREE.Vector3) => void;
  dispose: () => void;
}

function isReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

interface StripPlacement {
  readonly worldPos: THREE.Vector3;
  readonly matrix: THREE.Matrix4;
  readonly hazardKind: 'pendulum' | 'balls' | 'wind' | 'jelly';
  readonly index: number;
}

export function createTelegraphVisuals(
  course: Course,
  skinId: AttractionSkinId = 'default',
): TelegraphVisualGroup {
  const group = new THREE.Group();
  group.name = 'HazardTelegraphGroup';

  const skin = getAttractionSkin(skinId);
  const parts = skin.createTelegraphParts();

  const stripGeo = new THREE.PlaneGeometry(1, 1);
  stripGeo.rotateX(-Math.PI * 0.5);

  const placements: StripPlacement[] = [];
  const dummy = new THREE.Object3D();
  const basisMat = new THREE.Matrix4();
  const tmpQuat = new THREE.Quaternion();

  const addStrip = (
    routeId: string,
    s: number,
    lateral: number,
    width: number,
    length: number,
    hazardKind: StripPlacement['hazardKind'],
    index: number,
  ): void => {
    const frame = course.getRoute(routeId).getFrameAt(s);
    const pos = frame.position
      .clone()
      .addScaledVector(frame.right, lateral)
      .addScaledVector(frame.up, 0.025);
    basisMat.makeBasis(frame.right, frame.up, frame.tangent.clone().negate());
    tmpQuat.setFromRotationMatrix(basisMat);

    dummy.position.copy(pos);
    dummy.quaternion.copy(tmpQuat);
    dummy.scale.set(width, 1, length);
    dummy.updateMatrix();
    placements.push({
      worldPos: pos,
      matrix: dummy.matrix.clone(),
      hazardKind,
      index,
    });
  };

  // Lazy-populated on first update from AttractionSystem specs so coordinates match 1:1
  let mesh: THREE.InstancedMesh | null = null;
  let built = false;
  const maxDistSq = CONFIG.attractions.updateDistance * CONFIG.attractions.updateDistance;
  const tmpColor = new THREE.Color();

  const buildFromSystem = (attractions: AttractionSystem): void => {
    built = true;
    const plan = attractions.plan;
    if (!plan.enabledForCourse) return;

    // 1. Pendulums: full lateral warning band across road + 12m advance warning strip
    for (let i = 0; i < plan.pendulums.length; i++) {
      const p = plan.pendulums[i];
      addStrip(p.routeId, p.s, 0, p.trackWidth * 0.62, 2.2, 'pendulum', i);
      addStrip(p.routeId, Math.max(0, p.s - 12), 0, p.trackWidth * 0.34, 1.3, 'pendulum', i);
    }

    // 2. Rolling balls: lane sweep warning grooves + 15m advance bar
    for (let g = 0; g < plan.ballGroups.length; g++) {
      const grp = plan.ballGroups[g];
      for (let b = 0; b < grp.balls.length; b++) {
        addStrip(
          grp.routeId,
          grp.balls[b].s,
          0,
          grp.amplitude * 2 + CONFIG.attractions.balls.ballRadius * 1.6,
          1.7,
          'balls',
          g,
        );
      }
      addStrip(
        grp.routeId,
        Math.max(0, grp.centerS - 15),
        0,
        grp.trackWidth * 0.36,
        1.2,
        'balls',
        g,
      );
    }

    // 3. Wind fan: warning edge strips at entry of crosswind zone
    for (let w = 0; w < plan.windFans.length; w++) {
      const wf = plan.windFans[w];
      addStrip(wf.routeId, wf.sStart, 0, wf.trackWidth * 0.9, 1.8, 'wind', w);
      addStrip(wf.routeId, Math.max(0, wf.sStart - 12), 0, wf.trackWidth * 0.45, 1.3, 'wind', w);
    }

    // 4. Jelly puddle: advance warning strip ahead of puddle entrance
    for (let j = 0; j < plan.jellyPuddles.length; j++) {
      const jp = plan.jellyPuddles[j];
      addStrip(
        jp.routeId,
        Math.max(0, jp.sStart - 7),
        jp.lateralCenter,
        jp.halfWidth * 1.85,
        1.6,
        'jelly',
        j,
      );
    }

    if (placements.length > 0) {
      mesh = new THREE.InstancedMesh(stripGeo, parts.mat, placements.length);
      mesh.name = 'HazardTelegraphInstancedMesh';
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      group.add(mesh);
    }
  };

  const update = (attractions: AttractionSystem, playerPos: THREE.Vector3): void => {
    if (!built) {
      buildFromSystem(attractions);
    }
    if (!mesh || !attractions.plan.enabledForCourse) {
      if (mesh) mesh.visible = false;
      return;
    }

    const reducedMotion = isReducedMotion();
    const pStates = attractions.getPendulums();
    const bStates = attractions.getBallGroups();
    const wStates = attractions.getWindFans();
    const jStates = attractions.getJellyPuddles();

    let count = 0;
    for (let i = 0; i < placements.length; i++) {
      const pl = placements[i];
      if (pl.worldPos.distanceToSquared(playerPos) > maxDistSq) {
        continue;
      }
      let warn = 0.7;
      if (pl.hazardKind === 'pendulum') {
        warn = pStates[pl.index]?.warningLevel ?? 0.7;
      } else if (pl.hazardKind === 'balls') {
        warn = bStates[pl.index]?.warningLevel ?? 0.7;
      } else if (pl.hazardKind === 'wind') {
        warn = wStates[pl.index]?.warningLevel ?? 0.7;
      } else if (pl.hazardKind === 'jelly') {
        warn = jStates[pl.index]?.warningLevel ?? 0.7;
      }

      if (reducedMotion) {
        warn = 0.82;
      }
      mesh.setMatrixAt(count, pl.matrix);
      tmpColor.setRGB(
        parts.baseRGB[0] + parts.pulseRGB[0] * warn,
        parts.baseRGB[1] + parts.pulseRGB[1] * warn,
        parts.baseRGB[2] + parts.pulseRGB[2] * warn,
      );
      mesh.setColorAt(count, tmpColor);
      count++;
    }

    mesh.count = count;
    mesh.visible = count > 0;
    if (count > 0) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  };

  const dispose = (): void => {
    stripGeo.dispose();
    parts.dispose();
  };

  return { group, update, dispose };
}
