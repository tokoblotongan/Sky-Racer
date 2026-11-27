// src/render/attractions/jellyPuddle.ts

import * as THREE from 'three';
import { CONFIG, type GraphicsPreset } from '../../config';
import type { JellyPuddleState } from '../../core/attractions';
import type { Course } from '../../core/course';
import type { AttractionSkinId } from '../../courses/fantasyLandAttractions';
import { getAttractionSkin } from './skins';

export interface JellyPuddleVisualGroup {
  readonly group: THREE.Group;
  update: (states: readonly JellyPuddleState[], playerPos: THREE.Vector3) => void;
  setQuality: (preset: GraphicsPreset) => void;
  dispose: () => void;
}

function buildTrackConformGeometry(
  course: Course,
  routeId: string,
  sStart: number,
  sEnd: number,
  lateralCenter: number,
  halfWidth: number,
): THREE.BufferGeometry {
  const route = course.getRoute(routeId);
  const slices = 14;
  const cols = 6;
  const positions: number[] = [];
  const uvs: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= slices; i++) {
    const t = i / slices;
    const s = THREE.MathUtils.lerp(sStart, sEnd, t);
    const frame = route.getFrameAt(s);
    // Oval taper near entry and exit edges so it reads like a spilled puddle
    const edgeTaper = Math.sin(t * Math.PI);
    const wScale = 0.58 + 0.42 * Math.sqrt(Math.max(0.02, edgeTaper));

    for (let j = 0; j <= cols; j++) {
      const u = j / cols;
      const lat = lateralCenter + (u - 0.5) * 2 * halfWidth * wScale;
      const lift = 0.022 + 0.012 * Math.sin(u * Math.PI) * edgeTaper;
      const p = frame.position
        .clone()
        .addScaledVector(frame.right, lat)
        .addScaledVector(frame.up, lift);
      positions.push(p.x, p.y, p.z);
      normals.push(frame.up.x, frame.up.y, frame.up.z);
      uvs.push(u, t);
    }
  }

  for (let i = 0; i < slices; i++) {
    for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j;
      const b = a + 1;
      const c = a + (cols + 1);
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

export function createJellyPuddleVisuals(
  course: Course,
  states: readonly JellyPuddleState[],
  preset: GraphicsPreset,
  skinId: AttractionSkinId = 'default',
): JellyPuddleVisualGroup {
  const group = new THREE.Group();
  group.name = 'JellyPuddleAttractionsGroup';

  const skin = getAttractionSkin(skinId);
  let parts = skin.createJellyPuddleParts(preset);

  const geos: THREE.BufferGeometry[] = [];
  const meshes: Array<{ mesh: THREE.Mesh; worldPos: THREE.Vector3 }> = [];
  const maxDistSq = CONFIG.attractions.updateDistance * CONFIG.attractions.updateDistance;

  for (let i = 0; i < states.length; i++) {
    const spec = states[i].spec;
    const geo = buildTrackConformGeometry(
      course,
      spec.routeId,
      spec.sStart,
      spec.sEnd,
      spec.lateralCenter,
      spec.halfWidth,
    );
    geos.push(geo);
    const mesh = new THREE.Mesh(geo, parts.mat);
    mesh.name = `JellyPuddle_${spec.id}`;
    mesh.renderOrder = 3;
    group.add(mesh);
    meshes.push({ mesh, worldPos: spec.worldPos });
  }

  const update = (liveStates: readonly JellyPuddleState[], playerPos: THREE.Vector3): void => {
    if (liveStates.length > 0 && parts.animateUv) {
      parts.tex.offset.y = liveStates[0].uvOffset;
      parts.tex.offset.x = liveStates[0].uvOffset * 0.35;
    } else if (!parts.animateUv) {
      parts.tex.offset.set(0, 0);
    }
    for (let i = 0; i < meshes.length; i++) {
      const m = meshes[i];
      m.mesh.visible = m.worldPos.distanceToSquared(playerPos) <= maxDistSq;
    }
  };

  const setQuality = (nextPreset: GraphicsPreset): void => {
    const prev = parts;
    parts = skin.createJellyPuddleParts(nextPreset);
    for (const m of meshes) {
      m.mesh.material = parts.mat;
    }
    prev.dispose();
  };

  const dispose = (): void => {
    for (const g of geos) g.dispose();
    parts.dispose();
  };

  return { group, update, setQuality, dispose };
}
