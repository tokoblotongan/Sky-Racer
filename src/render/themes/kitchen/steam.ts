// src/render/themes/kitchen/steam.ts
// Instanced soft steam puffs rising from the kettle near Terowongan Panci (no custom shader).

import * as THREE from 'three';
import { CONFIG, type GraphicsPreset } from '../../../config';

export interface SteamSystemHandle {
  readonly group: THREE.Group;
  update: (dt: number) => void;
  dispose: () => void;
}

interface PuffParticle {
  phase: number;
  speed: number;
  driftX: number;
  driftZ: number;
  baseScale: number;
}

export function createKettleSteamSystem(
  spoutPos: THREE.Vector3,
  steamTex: THREE.CanvasTexture,
  graphicsPreset: GraphicsPreset,
): SteamSystemHandle {
  const group = new THREE.Group();
  group.name = 'KitchenKettleSteam';
  group.position.copy(spoutPos);

  const count = CONFIG.kitchenDecor.steamCounts[graphicsPreset];
  if (count <= 0) {
    return {
      group,
      update: () => {},
      dispose: () => {},
    };
  }

  const geom = new THREE.PlaneGeometry(1.8, 1.8);
  const mat = new THREE.MeshBasicMaterial({
    map: steamTex,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });

  const mesh = new THREE.InstancedMesh(geom, mat, count);
  mesh.name = 'KettleSteamInstanced';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  group.add(mesh);

  const particles: PuffParticle[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / count;
    particles.push({
      phase: t,
      speed: 0.34 + (i % 5) * 0.04,
      driftX: Math.sin(i * 1.7) * 1.4,
      driftZ: Math.cos(i * 2.1) * 1.4,
      baseScale: 0.7 + (i % 4) * 0.25,
    });
  }

  const mtx = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const euler = new THREE.Euler();

  const applyFrame = (elapsedStep: number): void => {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.phase = (p.phase + elapsedStep * p.speed) % 1;
      const life = p.phase;
      const rise = life * 13.5;
      const sway = Math.sin(life * Math.PI * 2 + i) * 0.9;
      pos.set(p.driftX * life + sway, rise, p.driftZ * life);
      const envelope = Math.sin(life * Math.PI);
      const s = p.baseScale * (0.55 + life * 1.65) * Math.max(0.05, envelope);
      scl.set(s, s, s);
      euler.set(0, (i * 0.6 + life * 1.2) % (Math.PI * 2), 0);
      quat.setFromEuler(euler);
      mtx.compose(pos, quat, scl);
      mesh.setMatrixAt(i, mtx);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };

  applyFrame(0);

  return {
    group,
    update(dt: number): void {
      applyFrame(dt);
    },
    dispose(): void {
      mesh.dispose();
      geom.dispose();
      mat.dispose();
    },
  };
}
