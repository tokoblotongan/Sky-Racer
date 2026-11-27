// src/render/attractions/jellyPuddle.ts

import * as THREE from 'three';
import { CONFIG, type GraphicsPreset } from '../../config';
import type { JellyPuddleState } from '../../core/attractions';
import type { Course } from '../../core/course';
import { createSurfaceMaterial, type SurfaceMaterial } from '../materialFactory';

export interface JellyPuddleVisualGroup {
  readonly group: THREE.Group;
  update: (states: readonly JellyPuddleState[], playerPos: THREE.Vector3) => void;
  setQuality: (preset: GraphicsPreset) => void;
  dispose: () => void;
}

function createJellyGlossTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Bright glossy magenta-berry base with soft translucent bubbles & specular highlights
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, '#FF4DFF');
    grad.addColorStop(0.5, '#FF2E93');
    grad.addColorStop(1, '#C026D3');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.34)';
    const bubbles = [
      [44, 52, 18],
      [130, 38, 12],
      [204, 86, 22],
      [78, 148, 24],
      [172, 178, 16],
      [224, 218, 14],
      [34, 218, 15],
    ];
    for (const [bx, by, br] of bubbles) {
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.beginPath();
      ctx.arc(bx - br * 0.3, by - br * 0.3, br * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.34)';
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 3);
  return tex;
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
    // Oval taper near entry and exit edges so it reads like a spilled jelly puddle
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
): JellyPuddleVisualGroup {
  const group = new THREE.Group();
  group.name = 'JellyPuddleAttractionsGroup';

  const jellyTex = createJellyGlossTexture();
  let jellyMat: SurfaceMaterial = createSurfaceMaterial(preset, {
    color: 0xffffff,
    map: jellyTex,
    emissive: 0xff2fd0,
    emissiveMap: jellyTex,
    emissiveIntensity: 0.72,
    roughness: 0.08,
    metalness: 0.05,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    physical: true,
    specularHighlight: true,
    shininess: 90,
    transparent: true,
    opacity: 0.88,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

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
    const mesh = new THREE.Mesh(geo, jellyMat);
    mesh.name = `JellyPuddle_${spec.id}`;
    mesh.renderOrder = 3;
    group.add(mesh);
    meshes.push({ mesh, worldPos: spec.worldPos });
  }

  const update = (liveStates: readonly JellyPuddleState[], playerPos: THREE.Vector3): void => {
    if (liveStates.length > 0) {
      jellyTex.offset.y = liveStates[0].uvOffset;
      jellyTex.offset.x = liveStates[0].uvOffset * 0.35;
    }
    for (let i = 0; i < meshes.length; i++) {
      const m = meshes[i];
      m.mesh.visible = m.worldPos.distanceToSquared(playerPos) <= maxDistSq;
    }
  };

  const setQuality = (nextPreset: GraphicsPreset): void => {
    const prev = jellyMat;
    jellyMat = createSurfaceMaterial(nextPreset, {
      color: 0xffffff,
      map: jellyTex,
      emissive: 0xff2fd0,
      emissiveMap: jellyTex,
      emissiveIntensity: 0.72,
      roughness: 0.08,
      metalness: 0.05,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      physical: true,
      specularHighlight: true,
      shininess: 90,
      transparent: true,
      opacity: 0.88,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    for (const m of meshes) {
      m.mesh.material = jellyMat;
    }
    prev.dispose();
  };

  const dispose = (): void => {
    for (const g of geos) g.dispose();
    jellyTex.dispose();
    jellyMat.dispose();
  };

  return { group, update, setQuality, dispose };
}
