// src/render/attractions/skins/default.ts
// Default F6 FantasyLand attraction visuals (preserved 1:1 with pre-skin implementation).

import * as THREE from 'three';
import { CONFIG, type GraphicsPreset } from '../../../config';
import { createSurfaceMaterial, type SurfaceMaterial } from '../../materialFactory';
import type { QualityLevel } from '../../quality';
import type {
  AttractionSkin,
  BoostRingsSkinParts,
  JellyPuddleSkinParts,
  PendulumSkinParts,
  RollingBallsSkinParts,
  TelegraphSkinParts,
  WindFanSkinParts,
} from './index';

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

function createBallStripeTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#FFFDF7';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#0A5CFF';
    ctx.fillRect(0, size * 0.22, size, size * 0.16);
    ctx.fillStyle = '#FF2FD0';
    ctx.fillRect(0, size * 0.62, size, size * 0.16);
    ctx.fillStyle = '#FFD000';
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.arc((i + 0.5) * (size / 8), size * 0.5, 9, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createJellyGlossTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
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

export const defaultAttractionSkin: AttractionSkin = {
  id: 'default',

  createPendulumParts(preset: GraphicsPreset): PendulumSkinParts {
    const cfg = CONFIG.attractions.pendulum;
    const candyTex = createCandyStripeTexture();

    const handleMat: SurfaceMaterial = createSurfaceMaterial(preset, {
      color: 0xffffff,
      map: candyTex,
      roughness: 0.28,
      metalness: 0.08,
      emissive: 0xff2d3d,
      emissiveIntensity: 0.14,
    });
    const archMat: SurfaceMaterial = createSurfaceMaterial(preset, {
      color: 0xfef3c7,
      roughness: 0.35,
      metalness: 0.18,
    });
    const accentMat: SurfaceMaterial = createSurfaceMaterial(preset, {
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

    const armGeo = new THREE.CylinderGeometry(
      cfg.poleRadius,
      cfg.poleRadius * 1.1,
      cfg.armLength,
      12,
    );
    armGeo.translate(0, -cfg.armLength * 0.5, 0);
    const bobGeo = new THREE.SphereGeometry(cfg.bobRadius, 22, 16);
    const bandGeo = new THREE.TorusGeometry(cfg.bobRadius * 0.96, 0.16, 10, 24);

    return {
      pillarGeo,
      beamGeo,
      pivotHubGeo,
      armGeo,
      bobGeo,
      bandGeo,
      handleMat,
      archMat,
      bobMat: handleMat,
      accentMat,
      showArch: true,
      dispose(): void {
        pillarGeo.dispose();
        beamGeo.dispose();
        pivotHubGeo.dispose();
        armGeo.dispose();
        bobGeo.dispose();
        bandGeo.dispose();
        candyTex.dispose();
        handleMat.dispose();
        archMat.dispose();
        accentMat.dispose();
      },
    };
  },

  createRollingBallsParts(preset: GraphicsPreset): RollingBallsSkinParts {
    const bCfg = CONFIG.attractions.balls;
    const ballGeo = new THREE.SphereGeometry(bCfg.ballRadius, 22, 16);
    const ballTex = createBallStripeTexture();
    const ballMat = createSurfaceMaterial(preset, {
      color: 0xffffff,
      map: ballTex,
      roughness: 0.22,
      metalness: 0.08,
      emissive: 0xffffff,
      emissiveMap: ballTex,
      emissiveIntensity: 0.34,
    });
    return {
      ballGeo,
      ballMat,
      tints: [0xff477e, 0x38bdf8, 0xffd000, 0x22c55e],
      dispose(): void {
        ballGeo.dispose();
        ballTex.dispose();
        ballMat.dispose();
      },
    };
  },

  createWindFanParts(preset: GraphicsPreset, quality: QualityLevel): WindFanSkinParts {
    const frameMat = createSurfaceMaterial(preset, {
      color: 0xe2e8f0,
      roughness: 0.32,
      metalness: 0.4,
    });
    const bladeMat = createSurfaceMaterial(preset, {
      color: 0x00e5ff,
      roughness: 0.22,
      metalness: 0.15,
      emissive: 0x00b4d8,
      emissiveIntensity: 0.45,
    });
    const hubMat = createSurfaceMaterial(preset, {
      color: 0xffd000,
      roughness: 0.25,
      metalness: 0.55,
      emissive: 0xffa200,
      emissiveIntensity: 0.25,
    });
    const streakMat = new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
    });

    const standGeo = new THREE.CylinderGeometry(0.55, 0.9, 4.2, 12);
    const shroudGeo = new THREE.TorusGeometry(3.7, 0.42, 12, 28);
    shroudGeo.rotateY(Math.PI * 0.5);
    const hubGeo = new THREE.CylinderGeometry(0.75, 0.75, 0.9, 14);
    hubGeo.rotateZ(Math.PI * 0.5);
    const bladeGeo = new THREE.BoxGeometry(0.14, 3.1, 0.85);
    bladeGeo.translate(0, 1.55, 0);
    const streakGeo = new THREE.BoxGeometry(2.6, 0.08, 0.08);

    return {
      standGeo,
      shroudGeo,
      hubGeo,
      bladeGeo,
      streakGeo,
      frameMat,
      bladeMat,
      hubMat,
      streakMat,
      streakCount: CONFIG.attractions.wind.streakCount[quality],
      dispose(): void {
        standGeo.dispose();
        shroudGeo.dispose();
        hubGeo.dispose();
        bladeGeo.dispose();
        streakGeo.dispose();
        frameMat.dispose();
        bladeMat.dispose();
        hubMat.dispose();
        streakMat.dispose();
      },
    };
  },

  createJellyPuddleParts(preset: GraphicsPreset): JellyPuddleSkinParts {
    const tex = createJellyGlossTexture();
    const mat = createSurfaceMaterial(preset, {
      color: 0xffffff,
      map: tex,
      emissive: 0xff2fd0,
      emissiveMap: tex,
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
    return {
      tex,
      mat,
      animateUv: true,
      dispose(): void {
        tex.dispose();
        mat.dispose();
      },
    };
  },

  createBoostRingsParts(preset: GraphicsPreset): BoostRingsSkinParts {
    const rCfg = CONFIG.attractions.ring;
    const outerGeo = new THREE.TorusGeometry(rCfg.radius, rCfg.tubeRadius, 12, 28);
    const innerGeo = new THREE.TorusGeometry(rCfg.radius * 0.84, rCfg.tubeRadius * 0.42, 8, 6);

    const makeMat = (colorHex: number, emissiveHex: number): SurfaceMaterial =>
      createSurfaceMaterial(preset, {
        color: colorHex,
        emissive: emissiveHex,
        emissiveIntensity: 1.25,
        roughness: 0.18,
        metalness: 0.25,
      });

    const cyanMat = makeMat(0x00e5ff, 0x00e5ff);
    const yellowMat = makeMat(0xffd000, 0xffb703);

    return {
      outerGeo,
      innerGeo,
      cyanMat,
      yellowMat,
      maxDistanceScale: 1.0,
      dispose(): void {
        outerGeo.dispose();
        innerGeo.dispose();
        cyanMat.dispose();
        yellowMat.dispose();
      },
    };
  },

  createTelegraphParts(): TelegraphSkinParts {
    const tex = createHazardStripeTexture();
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: tex,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    return {
      tex,
      mat,
      baseRGB: [0.6, 0.55, 0.4],
      pulseRGB: [0.4, 0.45, 0.35],
      dispose(): void {
        tex.dispose();
        mat.dispose();
      },
    };
  },
};
