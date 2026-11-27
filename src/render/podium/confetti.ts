// src/render/podium/confetti.ts

import * as THREE from 'three';
import { CONFIG, type GraphicsPreset } from '../../config';

export interface PodiumConfetti {
  group: THREE.Group;
  update: (dt: number) => void;
  dispose: () => void;
}

interface ConfettiPiece {
  x: number;
  y: number;
  z: number;
  vy: number;
  swayFreq: number;
  swayAmp: number;
  phase: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  spinX: number;
  spinY: number;
  scale: number;
}

const CONFETTI_COLORS = [
  '#FF2D3D',
  '#0A5CFF',
  '#FFD000',
  '#22C55E',
  '#00E5FF',
] as const;

function nextRng(state: { seed: number }): number {
  state.seed = (state.seed * 1664525 + 1013904223) >>> 0;
  return state.seed / 4294967296;
}

export function createPodiumConfetti(
  graphicsPreset: GraphicsPreset,
  isMobile: boolean,
  reducedMotion: boolean,
): PodiumConfetti {
  const group = new THREE.Group();
  group.name = 'PodiumConfetti';

  const count = reducedMotion
    ? 0
    : graphicsPreset === 'hemat'
      ? CONFIG.podium.confettiCount.hemat
      : isMobile || graphicsPreset === 'seimbang'
        ? CONFIG.podium.confettiCount.seimbang
        : CONFIG.podium.confettiCount.penuh;

  if (count <= 0) {
    return {
      group,
      update: () => {},
      dispose: () => {},
    };
  }

  const geometry = new THREE.PlaneGeometry(0.18, 0.11);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.35,
    metalness: 0.12,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = 'ConfettiInstancedMesh';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;

  const pieces: ConfettiPiece[] = [];
  const rng = { seed: 731942 };
  const color = new THREE.Color();
  const dummy = new THREE.Object3D();

  const spreadXZ = 11.5;
  const maxHeight = 9.5;

  for (let i = 0; i < count; i++) {
    const piece: ConfettiPiece = {
      x: (nextRng(rng) * 2 - 1) * spreadXZ,
      y: 0.5 + nextRng(rng) * maxHeight,
      z: (nextRng(rng) * 2 - 1) * spreadXZ * 0.75,
      vy: 1.35 + nextRng(rng) * 1.65,
      swayFreq: 1.2 + nextRng(rng) * 2.2,
      swayAmp: 0.35 + nextRng(rng) * 0.65,
      phase: nextRng(rng) * Math.PI * 2,
      rotX: nextRng(rng) * Math.PI * 2,
      rotY: nextRng(rng) * Math.PI * 2,
      rotZ: nextRng(rng) * Math.PI * 2,
      spinX: (nextRng(rng) * 2 - 1) * 4.5,
      spinY: (nextRng(rng) * 2 - 1) * 4.5,
      scale: 0.75 + nextRng(rng) * 0.65,
    };
    pieces.push(piece);

    color.set(CONFETTI_COLORS[i % CONFETTI_COLORS.length]);
    mesh.setColorAt(i, color);

    dummy.position.set(piece.x, piece.y, piece.z);
    dummy.rotation.set(piece.rotX, piece.rotY, piece.rotZ);
    dummy.scale.setScalar(piece.scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) {
    mesh.instanceColor.needsUpdate = true;
  }
  group.add(mesh);

  let elapsed = 0;

  const update = (dt: number): void => {
    const safeDt = Math.min(0.05, Math.max(0, dt));
    if (safeDt <= 0) {
      return;
    }
    elapsed += safeDt;
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i];
      p.y -= p.vy * safeDt;
      if (p.y < 0.08) {
        p.y = maxHeight + (i % 7) * 0.25;
      }
      p.rotX += p.spinX * safeDt;
      p.rotY += p.spinY * safeDt;
      const swayX = Math.sin(elapsed * p.swayFreq + p.phase) * p.swayAmp;
      const swayZ = Math.cos(elapsed * p.swayFreq * 0.8 + p.phase) * p.swayAmp * 0.6;

      dummy.position.set(p.x + swayX, p.y, p.z + swayZ);
      dummy.rotation.set(p.rotX, p.rotY, p.rotZ);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };

  const dispose = (): void => {
    geometry.dispose();
    material.dispose();
    group.remove(mesh);
  };

  return {
    group,
    update,
    dispose,
  };
}
