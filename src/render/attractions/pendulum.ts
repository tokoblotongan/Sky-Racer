// src/render/attractions/pendulum.ts

import * as THREE from 'three';
import { CONFIG, type GraphicsPreset } from '../../config';
import type { PendulumState } from '../../core/attractions';
import { createSurfaceMaterial, type SurfaceMaterial } from '../materialFactory';

export interface PendulumVisualGroup {
  readonly group: THREE.Group;
  update: (states: readonly PendulumState[], playerPos: THREE.Vector3) => void;
  setQuality: (preset: GraphicsPreset) => void;
  dispose: () => void;
}

function createCandyStripeTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#FFFDF7';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#FF2D3D';
    const stripes = 6;
    const step = size / stripes;
    for (let i = -stripes; i < stripes * 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * step, 0);
      ctx.lineTo(i * step + step * 0.5, 0);
      ctx.lineTo((i + 1) * step + step * 0.5, size);
      ctx.lineTo((i + 1) * step, size);
      ctx.closePath();
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 3);
  return tex;
}

export function createPendulumVisuals(preset: GraphicsPreset): PendulumVisualGroup {
  const group = new THREE.Group();
  group.name = 'PendulumAttractionsGroup';

  const cfg = CONFIG.attractions.pendulum;
  const candyTex = createCandyStripeTexture();

  let candyMat: SurfaceMaterial = createSurfaceMaterial(preset, {
    color: 0xffffff,
    map: candyTex,
    roughness: 0.28,
    metalness: 0.08,
    emissive: 0xff2d3d,
    emissiveIntensity: 0.14,
  });
  let archMat: SurfaceMaterial = createSurfaceMaterial(preset, {
    color: 0xfef3c7,
    roughness: 0.35,
    metalness: 0.18,
  });
  let goldMat: SurfaceMaterial = createSurfaceMaterial(preset, {
    color: 0xffd000,
    roughness: 0.25,
    metalness: 0.65,
    emissive: 0xff9f1c,
    emissiveIntensity: 0.22,
  });

  const pillarGeo = new THREE.CylinderGeometry(0.45, 0.55, cfg.pivotHeight + 0.6, 12);
  const beamGeo = new THREE.BoxGeometry(1, 0.72, 0.78);
  const pivotHubGeo = new THREE.CylinderGeometry(0.7, 0.7, 1.1, 14);
  pivotHubGeo.rotateX(Math.PI * 0.5);

  const armGeo = new THREE.CylinderGeometry(cfg.poleRadius, cfg.poleRadius * 1.1, cfg.armLength, 12);
  armGeo.translate(0, -cfg.armLength * 0.5, 0);
  const bobGeo = new THREE.SphereGeometry(cfg.bobRadius, 22, 16);
  const ringBandGeo = new THREE.TorusGeometry(cfg.bobRadius * 0.96, 0.16, 10, 24);

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
      const leftPillar = new THREE.Mesh(pillarGeo, archMat);
      leftPillar.position.set(-postX, cfg.pivotHeight * 0.5, 0);
      leftPillar.castShadow = false;
      leftPillar.receiveShadow = true;

      const rightPillar = new THREE.Mesh(pillarGeo, archMat);
      rightPillar.position.set(postX, cfg.pivotHeight * 0.5, 0);
      rightPillar.castShadow = false;
      rightPillar.receiveShadow = true;

      const topBeam = new THREE.Mesh(beamGeo, candyMat);
      topBeam.scale.set(postX * 2 + 1.2, 1, 1);
      topBeam.position.set(0, cfg.pivotHeight + 0.15, 0);

      const hub = new THREE.Mesh(pivotHubGeo, goldMat);
      hub.position.set(0, cfg.pivotHeight, 0);

      const swingPivot = new THREE.Group();
      swingPivot.position.set(0, cfg.pivotHeight, 0);

      const arm = new THREE.Mesh(armGeo, candyMat);
      const bob = new THREE.Mesh(bobGeo, candyMat);
      bob.position.set(0, -cfg.armLength, 0);
      const band = new THREE.Mesh(ringBandGeo, goldMat);
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
    const prevCandy = candyMat;
    const prevArch = archMat;
    const prevGold = goldMat;
    candyMat = createSurfaceMaterial(nextPreset, {
      color: 0xffffff,
      map: candyTex,
      roughness: 0.28,
      metalness: 0.08,
      emissive: 0xff2d3d,
      emissiveIntensity: 0.14,
    });
    archMat = createSurfaceMaterial(nextPreset, {
      color: 0xfef3c7,
      roughness: 0.35,
      metalness: 0.18,
    });
    goldMat = createSurfaceMaterial(nextPreset, {
      color: 0xffd000,
      roughness: 0.25,
      metalness: 0.65,
      emissive: 0xff9f1c,
      emissiveIntensity: 0.22,
    });
    for (const e of entries) {
      e.leftPillar.material = archMat;
      e.rightPillar.material = archMat;
      e.topBeam.material = candyMat;
      e.arm.material = candyMat;
      e.bob.material = candyMat;
      e.hub.material = goldMat;
      e.band.material = goldMat;
    }
    prevCandy.dispose();
    prevArch.dispose();
    prevGold.dispose();
  };

  const dispose = (): void => {
    pillarGeo.dispose();
    beamGeo.dispose();
    pivotHubGeo.dispose();
    armGeo.dispose();
    bobGeo.dispose();
    ringBandGeo.dispose();
    candyTex.dispose();
    candyMat.dispose();
    archMat.dispose();
    goldMat.dispose();
  };

  return { group, update, setQuality, dispose };
}
