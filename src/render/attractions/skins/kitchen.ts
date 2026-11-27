// src/render/attractions/skins/kitchen.ts
// Giant kitchen attraction visuals ("Sendok Besar", "Kelereng", "Kipas Penyedot", "Genangan Sirup", "Cincin Donat")
// with vivid, fog-free materials and zero orange/brown tones near the track.

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

function createSpoonHandleStripeTexture(): THREE.CanvasTexture {
  const size = 128;
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

function createGlassMarbleTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Glassy translucent swirl pattern (tinted via InstancedMesh colors: cyan, magenta, lime, yellow)
    const grad = ctx.createRadialGradient(size * 0.35, size * 0.32, 6, size * 0.5, size * 0.5, size * 0.65);
    grad.addColorStop(0, '#FFFFFF');
    grad.addColorStop(0.45, '#E2F5FF');
    grad.addColorStop(1, '#BAE6FD');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 10;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      const yBase = (i + 0.5) * (size / 4);
      ctx.moveTo(0, yBase);
      ctx.bezierCurveTo(size * 0.35, yBase - 18, size * 0.65, yBase + 18, size, yBase);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.ellipse(size * 0.3, size * 0.28, 12, 7, -0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createSyrupGlossTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, '#9333EA');
    grad.addColorStop(0.5, '#EC4899');
    grad.addColorStop(1, '#D946EF');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.38)';
    ctx.lineWidth = 6;
    for (let i = 0; i < 3; i++) {
      const y = 24 + i * 38;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(size * 0.3, y - 14, size * 0.7, y + 14, size, y);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    for (const [bx, by, br] of [
      [28, 34, 7],
      [94, 52, 9],
      [56, 98, 8],
    ]) {
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 3);
  return tex;
}

function createDonutSprinkleTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, size, size);

    // Bright glaze band + colorful sugar sprinkles (no orange)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    const sprinkleColors = ['#FF2FD0', '#FFFDF7', '#84CC16', '#0A5CFF', '#FFD000'];
    for (let i = 0; i < 36; i++) {
      const sx = ((i * 37) % (size - 12)) + 6;
      const sy = ((i * 53) % (size - 12)) + 6;
      const ang = (i * 0.7) % Math.PI;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(ang);
      ctx.fillStyle = sprinkleColors[i % sprinkleColors.length];
      ctx.fillRect(-5, -1.8, 10, 3.6);
      ctx.restore();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 1);
  return tex;
}

function createKitchenTelegraphTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // High-contrast bright cyan & yellow diagonal stripes (no orange) to read against #FF5A00 track
    ctx.fillStyle = '#00E5FF';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#FFD000';
    const step = size / 4;
    for (let i = -4; i < 8; i++) {
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
  tex.repeat.set(6, 1);
  return tex;
}

export const kitchenAttractionSkin: AttractionSkin = {
  id: 'kitchen',

  createPendulumParts(preset: GraphicsPreset): PendulumSkinParts {
    const cfg = CONFIG.attractions.pendulum;
    const stripeTex = createSpoonHandleStripeTexture();

    // Red-and-white striped spoon handle
    const handleMat: SurfaceMaterial = createSurfaceMaterial(preset, {
      color: 0xffffff,
      map: stripeTex,
      roughness: 0.24,
      metalness: 0.06,
      clearcoat: 0.85,
      physical: true,
      emissive: 0xff2d3d,
      emissiveIntensity: 0.12,
      fog: false,
    });
    // Bright teal kitchen support arch (hidden on 'hemat')
    const archMat: SurfaceMaterial = createSurfaceMaterial(preset, {
      color: 0x14b8a6,
      roughness: 0.28,
      metalness: 0.15,
      fog: false,
    });
    // Bright blue spoon bowl
    const bobMat: SurfaceMaterial = createSurfaceMaterial(preset, {
      color: 0x0a5cff,
      roughness: 0.16,
      metalness: 0.12,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
      physical: true,
      emissive: 0x0284c7,
      emissiveIntensity: 0.2,
      fog: false,
    });
    const accentMat: SurfaceMaterial = createSurfaceMaterial(preset, {
      color: 0xffd000,
      roughness: 0.22,
      metalness: 0.35,
      emissive: 0xffd000,
      emissiveIntensity: 0.18,
      fog: false,
    });

    const pillarGeo = new THREE.CylinderGeometry(0.42, 0.55, cfg.pivotHeight + 0.6, 10);
    const beamGeo = new THREE.BoxGeometry(1, 0.68, 0.72);
    const pivotHubGeo = new THREE.CylinderGeometry(0.68, 0.68, 1.05, 12);
    pivotHubGeo.rotateX(Math.PI * 0.5);

    // Tapered spoon handle extending down from pivot to spoon bowl neck
    const handleLen = cfg.armLength - cfg.bobRadius * 0.55;
    const armGeo = new THREE.BoxGeometry(0.76, handleLen, 0.3);
    armGeo.translate(0, -handleLen * 0.5, 0);

    // Giant oval spoon bowl matching bobRadius collision envelope
    const segs = preset === 'hemat' ? 12 : 20;
    const bobGeo = new THREE.SphereGeometry(cfg.bobRadius, segs, Math.max(8, segs - 4));
    bobGeo.scale(1.06, 1.15, 0.56);
    bobGeo.computeVertexNormals();

    // Rim collar around spoon bowl
    const bandGeo = new THREE.TorusGeometry(cfg.bobRadius * 0.94, 0.14, 8, segs);
    bandGeo.scale(1.06, 1.15, 0.56);

    return {
      pillarGeo,
      beamGeo,
      pivotHubGeo,
      armGeo,
      bobGeo,
      bandGeo,
      handleMat,
      archMat,
      bobMat,
      accentMat,
      showArch: preset !== 'hemat',
      dispose(): void {
        pillarGeo.dispose();
        beamGeo.dispose();
        pivotHubGeo.dispose();
        armGeo.dispose();
        bobGeo.dispose();
        bandGeo.dispose();
        stripeTex.dispose();
        handleMat.dispose();
        archMat.dispose();
        bobMat.dispose();
        accentMat.dispose();
      },
    };
  },

  createRollingBallsParts(preset: GraphicsPreset): RollingBallsSkinParts {
    const bCfg = CONFIG.attractions.balls;
    const segW = preset === 'hemat' ? 14 : 22;
    const segH = preset === 'hemat' ? 10 : 16;
    const ballGeo = new THREE.SphereGeometry(bCfg.ballRadius, segW, segH);
    const marbleTex = createGlassMarbleTexture();

    const ballMat = createSurfaceMaterial(preset, {
      color: 0xffffff,
      map: marbleTex,
      roughness: 0.12,
      metalness: 0.06,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      physical: true,
      specularHighlight: true,
      shininess: 95,
      emissive: 0xffffff,
      emissiveMap: marbleTex,
      emissiveIntensity: 0.42,
      fog: false,
    });

    return {
      ballGeo,
      ballMat,
      // Vivid glass marble colors (cyan, magenta, lime green, yellow — NO orange)
      tints: [0x00e5ff, 0xff2fd0, 0x22c55e, 0xffd000],
      dispose(): void {
        ballGeo.dispose();
        marbleTex.dispose();
        ballMat.dispose();
      },
    };
  },

  createWindFanParts(preset: GraphicsPreset, quality: QualityLevel): WindFanSkinParts {
    // Bright teal exhaust fan housing
    const frameMat = createSurfaceMaterial(preset, {
      color: 0x14b8a6,
      roughness: 0.24,
      metalness: 0.18,
      clearcoat: 0.85,
      physical: true,
      fog: false,
    });
    const bladeMat = createSurfaceMaterial(preset, {
      color: 0x00e5ff,
      roughness: 0.2,
      metalness: 0.14,
      emissive: 0x00b4d8,
      emissiveIntensity: 0.5,
      fog: false,
    });
    const hubMat = createSurfaceMaterial(preset, {
      color: 0xffd000,
      roughness: 0.22,
      metalness: 0.35,
      emissive: 0xffd000,
      emissiveIntensity: 0.24,
      fog: false,
    });
    const streakMat = new THREE.MeshBasicMaterial({
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0.64,
      depthWrite: false,
      fog: false,
    });

    const standGeo = new THREE.BoxGeometry(1.15, 4.2, 1.35);
    const shroudGeo = new THREE.TorusGeometry(3.85, 0.48, 10, 8);
    shroudGeo.rotateY(Math.PI * 0.5);
    const hubGeo = new THREE.CylinderGeometry(0.82, 0.82, 0.95, 12);
    hubGeo.rotateZ(Math.PI * 0.5);
    const bladeGeo = new THREE.BoxGeometry(0.14, 3.15, 0.92);
    bladeGeo.translate(0, 1.55, 0);
    const streakGeo = new THREE.BoxGeometry(2.6, 0.09, 0.09);

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
      // Hemat preset omits wind particles for mobile budget
      streakCount: preset === 'hemat' ? 0 : CONFIG.attractions.wind.streakCount[quality],
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
    const tex = createSyrupGlossTexture();
    const mat = createSurfaceMaterial(preset, {
      color: 0xffffff,
      map: tex,
      emissive: 0xd946ef,
      emissiveMap: tex,
      emissiveIntensity: 0.68,
      roughness: 0.08,
      metalness: 0.04,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      physical: true,
      specularHighlight: true,
      shininess: 92,
      transparent: true,
      opacity: 0.88,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      fog: false,
    });
    return {
      tex,
      mat,
      // Hemat preset keeps syrup static
      animateUv: preset !== 'hemat',
      dispose(): void {
        tex.dispose();
        mat.dispose();
      },
    };
  },

  createBoostRingsParts(preset: GraphicsPreset): BoostRingsSkinParts {
    const rCfg = CONFIG.attractions.ring;
    const isHemat = preset === 'hemat';
    const sprinkleTex = createDonutSprinkleTexture();

    // Plump donut-shaped rings in cyan and yellow
    const outerGeo = new THREE.TorusGeometry(
      rCfg.radius,
      rCfg.tubeRadius * (isHemat ? 1.35 : 1.55),
      isHemat ? 10 : 14,
      isHemat ? 20 : 28,
    );
    const innerGeo = isHemat
      ? null
      : new THREE.TorusGeometry(rCfg.radius * 0.84, rCfg.tubeRadius * 0.56, 10, 24);

    const makeDonutMat = (colorHex: number, emissiveHex: number): SurfaceMaterial =>
      createSurfaceMaterial(preset, {
        color: colorHex,
        map: sprinkleTex,
        emissive: emissiveHex,
        emissiveIntensity: 1.15,
        roughness: 0.16,
        metalness: 0.12,
        clearcoat: 0.9,
        physical: true,
        fog: false,
      });

    const cyanMat = makeDonutMat(0x00e5ff, 0x00d4ff);
    const yellowMat = makeDonutMat(0xffd000, 0xfacc15);

    return {
      outerGeo,
      innerGeo,
      cyanMat,
      yellowMat,
      // Hemat culls distant rings slightly closer for fewer active ring draws
      maxDistanceScale: isHemat ? 0.72 : 1.0,
      dispose(): void {
        outerGeo.dispose();
        innerGeo?.dispose();
        sprinkleTex.dispose();
        cyanMat.dispose();
        yellowMat.dispose();
      },
    };
  },

  createTelegraphParts(): TelegraphSkinParts {
    const tex = createKitchenTelegraphTexture();
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: tex,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
      fog: false,
    });
    return {
      tex,
      mat,
      baseRGB: [0.76, 0.76, 0.76],
      pulseRGB: [0.24, 0.24, 0.24],
      dispose(): void {
        tex.dispose();
        mat.dispose();
      },
    };
  },
};
