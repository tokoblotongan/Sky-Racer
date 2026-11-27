// src/render/attractions/telegraph.ts

import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { AttractionSystem } from '../../core/attractions';
import type { Course } from '../../core/course';

export interface TelegraphVisualGroup {
  readonly group: THREE.Group;
  update: (attractions: AttractionSystem, playerPos: THREE.Vector3) => void;
  dispose: () => void;
}

function createHazardStripeTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#FFD000';
    const step = size / 4;
    for (let i = -4; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(i * step, 0);
      ctx.lineTo(i * step + step * 0.52, 0);
      ctx.lineTo((i + 1) * step + step * 0.52, size);
      ctx.lineTo((i + 1) * step, size);
      ctx.closePath();
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 1);
  return tex;
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

export function createTelegraphVisuals(course: Course): TelegraphVisualGroup {
  const group = new THREE.Group();
  group.name = 'HazardTelegraphGroup';

  const stripeTex = createHazardStripeTexture();
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    map: stripeTex,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });

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

  if (course.getId() === 'fantasy-land') {
    const planSystem = course.getSegmentList().length > 0;
    void planSystem;
  }

  // Lazy-populated on first update from AttractionSystem specs so coordinates match 1:1
  let mesh: THREE.InstancedMesh | null = null;
  let built = false;
  const maxDistSq = CONFIG.attractions.updateDistance * CONFIG.attractions.updateDistance;
  const tmpColor = new THREE.Color();

  const buildFromSystem = (attractions: AttractionSystem): void => {
    built = true;
    const plan = attractions.plan;
    if (!plan.enabledForCourse) return;

    // 1. Pendulums: full lateral warning band across road + 14m advance warning strip
    for (let i = 0; i < plan.pendulums.length; i++) {
      const p = plan.pendulums[i];
      addStrip(p.routeId, p.s, 0, p.trackWidth * 0.62, 2.2, 'pendulum', i);
      addStrip(p.routeId, Math.max(0, p.s - 12), 0, p.trackWidth * 0.34, 1.3, 'pendulum', i);
    }

    // 2. Rolling balls: lane sweep warning grooves + 12m advance bar
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

    // 3. Wind fan: warning edge strips at entry & exit of crosswind zone
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
      mesh = new THREE.InstancedMesh(stripGeo, mat, placements.length);
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
      tmpColor.setRGB(0.6 + 0.4 * warn, 0.55 + 0.45 * warn, 0.4 + 0.35 * warn);
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
    stripeTex.dispose();
    mat.dispose();
  };

  return { group, update, dispose };
}
