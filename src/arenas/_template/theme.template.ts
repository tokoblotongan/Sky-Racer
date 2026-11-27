// src/arenas/_template/theme.template.ts
// Minimal valid ThemeDefinition template following docs/LIGHTING.md and docs/SHADERS.md.
// Uses procedural canvas textures and instancing (no custom shaders, no flat untextured primitives).

import * as THREE from 'three';
import type { ThemeDefinition, ThemeSceneryContext, ThemeSceneryHandle } from '../../themes/types';

function createGradientPillarTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#38BDF8');
    grad.addColorStop(0.5, '#0284C7');
    grad.addColorStop(1, '#1E293B');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#FFD23F';
    ctx.fillRect(0, 12, canvas.width, 8);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(4, maxAnisotropy);
  tex.needsUpdate = true;
  return tex;
}

export const templateArenaTheme: ThemeDefinition = {
  id: 'template-theme',
  background: {
    type: 'skybox',
    params: {
      vivid: {
        skyTop: '#56B4FF',
        skyHorizon: '#D4EEFF',
        groundBounce: '#64748B',
        fogColor: '#D4EEFF',
      },
      pastel: {
        skyTop: '#8BCBFF',
        skyHorizon: '#E8F6FF',
        groundBounce: '#94A3B8',
        fogColor: '#E8F6FF',
      },
    },
  },
  lightingProfile: {
    id: 'template-lighting',
    vivid: {
      hemisphereSkyColor: '#D8F1FF',
      hemisphereGroundColor: '#5B6472',
      hemisphereIntensity: 0.92,
      sunColor: '#FFF5E1',
      sunIntensity: 2.3,
      exposure: 1.0,
      envIntensity: 0.45,
      showRoomShell: false,
    },
    pastel: {
      hemisphereSkyColor: '#E8F7FF',
      hemisphereGroundColor: '#7A8596',
      hemisphereIntensity: 0.98,
      sunColor: '#FFF8ED',
      sunIntensity: 1.9,
      exposure: 0.98,
      envIntensity: 0.4,
      showRoomShell: false,
    },
  },
  qualityTiers: {
    mobile: {
      propsDensityScale: 0.5,
      cloudDensityScale: 0.5,
      shadowsEnabled: false,
      maxTextureSize: 1024,
    },
    low: {
      propsDensityScale: 0.45,
      cloudDensityScale: 0.45,
      shadowsEnabled: true,
      maxTextureSize: 2048,
    },
    medium: {
      propsDensityScale: 0.75,
      cloudDensityScale: 0.75,
      shadowsEnabled: true,
      maxTextureSize: 2048,
    },
    high: {
      propsDensityScale: 1.0,
      cloudDensityScale: 1.0,
      shadowsEnabled: true,
      maxTextureSize: 2048,
    },
  },
  buildScenery(context: ThemeSceneryContext): ThemeSceneryHandle {
    const group = new THREE.Group();
    group.name = 'TemplateArenaScenery';

    const bounds = context.course.getBounds();
    const density = context.quality === 'mobile' || context.quality === 'low' ? 6 : 12;

    const pillarTex = createGradientPillarTexture(context.maxAnisotropy);
    const pillarGeom = new THREE.CylinderGeometry(2.4, 3.2, 18, 12);
    const pillarMat = new THREE.MeshStandardMaterial({
      map: pillarTex,
      roughness: 0.45,
      metalness: 0.1,
    });

    const pillars = new THREE.InstancedMesh(pillarGeom, pillarMat, density);
    const dummy = new THREE.Object3D();
    const ringRadius = Math.max(45, bounds.radius + 26);

    for (let i = 0; i < density; i++) {
      const angle = (i / density) * Math.PI * 2;
      dummy.position.set(
        bounds.center.x + Math.cos(angle) * ringRadius,
        bounds.min.y - 6,
        bounds.center.z + Math.sin(angle) * ringRadius,
      );
      dummy.rotation.set(0, angle, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      pillars.setMatrixAt(i, dummy.matrix);
    }
    pillars.instanceMatrix.needsUpdate = true;
    group.add(pillars);

    return {
      id: templateArenaTheme.id,
      group,
      update(_dt: number, _cameraPos?: THREE.Vector3): void {
        // Animate ambient theme elements here (no per-frame allocations)
      },
      dispose(): void {
        pillarGeom.dispose();
        pillarMat.dispose();
        pillarTex.dispose();
      },
    };
  },
};
