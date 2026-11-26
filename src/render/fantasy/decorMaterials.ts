// src/render/fantasy/decorMaterials.ts

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CONFIG } from '../../config';

export const SWATCH = {
  CASTLE_WALL: 0,
  CASTLE_TRIM: 1,
  ROOF_PURPLE: 2,
  ROOF_RED: 3,
  ROOF_BLUE: 4,
  GOLD: 5,
  ISLAND_ROCK: 6,
  ISLAND_GRASS: 7,
  ISLAND_TREE: 8,
  WHEEL_FRAME: 9,
  LAMP_POST: 10,
  BALLOON_BASKET: 11,
  CRYSTAL_PLINTH: 12,
  WINDOW_DARK: 13,
  CREAM_WHITE: 14,
  TREE_ALT: 15,
} as const;

const SWATCH_COUNT = 16;

export interface FantasyDecorModule {
  group: THREE.Group;
  update: (timeSec: number, dt: number) => void;
  dispose: () => void;
  getTriangleCount: () => number;
  getDrawCallCount: () => number;
}

export type FantasyLitMaterial = THREE.MeshStandardMaterial | THREE.MeshLambertMaterial;

export interface FantasyDecorMaterials {
  paletteMat: FantasyLitMaterial;
  instancedColorMat: FantasyLitMaterial;
  crystalCyanMat: FantasyLitMaterial;
  crystalMagentaMat: FantasyLitMaterial;
  crystalYellowMat: FantasyLitMaterial;
  rainbowMat: FantasyLitMaterial;
  waterfallMat: THREE.MeshBasicMaterial;
  glowAccentMat: FantasyLitMaterial;
  darkMetalMat: FantasyLitMaterial;
  waterfallTex: THREE.CanvasTexture;
  materialCount: number;
  dispose: () => void;
}

export function setGeometrySwatch(
  geom: THREE.BufferGeometry,
  swatchIndex: number,
): THREE.BufferGeometry {
  const nonIdx = geom.index ? geom.toNonIndexed() : geom;
  if (!nonIdx.getAttribute('normal')) {
    nonIdx.computeVertexNormals();
  }
  const pos = nonIdx.getAttribute('position');
  const u = (swatchIndex + 0.5) / SWATCH_COUNT;
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uvs[i * 2] = u;
    uvs[i * 2 + 1] = 0.5;
  }
  nonIdx.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  if (nonIdx !== geom) {
    geom.dispose();
  }
  return nonIdx;
}

export function mergeNormalizedGeometries(
  parts: THREE.BufferGeometry[],
): THREE.BufferGeometry {
  const normalized = parts.map((g) => {
    const out = g.index ? g.toNonIndexed() : g;
    if (!out.getAttribute('normal')) {
      out.computeVertexNormals();
    }
    if (!out.getAttribute('uv')) {
      const pos = out.getAttribute('position');
      out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
    }
    if (out !== g) g.dispose();
    return out;
  });

  const merged = mergeGeometries(normalized, false);
  for (const g of normalized) g.dispose();
  if (!merged) {
    return new THREE.BoxGeometry(1, 1, 1);
  }
  merged.computeBoundingSphere();
  return merged;
}

export function countGeometryTriangles(geom: THREE.BufferGeometry): number {
  if (geom.index) {
    return Math.round(geom.index.count / 3);
  }
  const pos = geom.getAttribute('position');
  return pos ? Math.round(pos.count / 3) : 0;
}

function createPaletteAtlasTexture(): THREE.CanvasTexture {
  const p = CONFIG.fantasy.palette;
  const swatches: string[] = [
    p.castleWall,
    p.castleTrim,
    p.castleRoofPurple,
    p.castleRoofRed,
    p.castleRoofBlue,
    p.castleGold,
    p.islandRock,
    p.islandGrass,
    p.islandTree,
    p.wheelFrame,
    p.lampPost,
    p.balloonBasket,
    '#475569',
    '#1E293B',
    '#FFFDF7',
    '#10B981',
  ];

  const swatchW = 32;
  const width = swatchW * SWATCH_COUNT;
  const height = 32;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    for (let i = 0; i < SWATCH_COUNT; i++) {
      ctx.fillStyle = swatches[i] ?? '#FFFFFF';
      ctx.fillRect(i * swatchW, 0, swatchW, height);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

function createRainbowTexture(): THREE.CanvasTexture {
  const bands = CONFIG.fantasy.palette.rainbowBands;
  const width = 32;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const bandH = height / bands.length;
    for (let i = 0; i < bands.length; i++) {
      ctx.fillStyle = bands[i];
      ctx.fillRect(0, Math.floor(i * bandH), width, Math.ceil(bandH) + 1);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

function createWaterfallTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const width = 128;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, width, 0);
    grad.addColorStop(0.0, 'rgba(56, 189, 248, 0.35)');
    grad.addColorStop(0.2, 'rgba(125, 211, 252, 0.85)');
    grad.addColorStop(0.5, 'rgba(224, 247, 255, 0.92)');
    grad.addColorStop(0.8, 'rgba(125, 211, 252, 0.85)');
    grad.addColorStop(1.0, 'rgba(56, 189, 248, 0.35)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    for (let i = 0; i < 18; i++) {
      const sx = ((i * 29) % 108) + 10;
      const sy = (i * 41) % height;
      const sh = 24 + (i % 4) * 14;
      ctx.fillRect(sx, sy, 4 + (i % 3) * 2, sh);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 2.2);
  tex.anisotropy = Math.min(4, maxAnisotropy);
  return tex;
}

export function createFantasyDecorMaterials(
  maxAnisotropy: number,
  safeMode = false,
): FantasyDecorMaterials {
  const pal = CONFIG.fantasy.palette;
  const paletteTex = createPaletteAtlasTexture();
  const rainbowTex = createRainbowTexture();
  const waterfallTex = createWaterfallTexture(maxAnisotropy);

  const paletteMat: FantasyLitMaterial = safeMode
    ? new THREE.MeshLambertMaterial({ map: paletteTex })
    : new THREE.MeshStandardMaterial({
        map: paletteTex,
        roughness: 0.52,
        metalness: 0.06,
      });

  const instancedColorMat: FantasyLitMaterial = safeMode
    ? new THREE.MeshLambertMaterial({ color: 0xffffff })
    : new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.44,
        metalness: 0.06,
      });

  const crystalCyanMat: FantasyLitMaterial = safeMode
    ? new THREE.MeshLambertMaterial({
        color: pal.crystalCyan,
        emissive: pal.crystalCyan,
        emissiveIntensity: 0.9,
      })
    : new THREE.MeshStandardMaterial({
        color: pal.crystalCyan,
        emissive: pal.crystalCyan,
        emissiveIntensity: 0.9,
        roughness: 0.16,
        metalness: 0.2,
      });

  const crystalMagentaMat: FantasyLitMaterial = safeMode
    ? new THREE.MeshLambertMaterial({
        color: pal.crystalMagenta,
        emissive: pal.crystalMagenta,
        emissiveIntensity: 0.9,
      })
    : new THREE.MeshStandardMaterial({
        color: pal.crystalMagenta,
        emissive: pal.crystalMagenta,
        emissiveIntensity: 0.9,
        roughness: 0.16,
        metalness: 0.2,
      });

  const crystalYellowMat: FantasyLitMaterial = safeMode
    ? new THREE.MeshLambertMaterial({
        color: pal.crystalYellow,
        emissive: pal.crystalYellow,
        emissiveIntensity: 0.9,
      })
    : new THREE.MeshStandardMaterial({
        color: pal.crystalYellow,
        emissive: pal.crystalYellow,
        emissiveIntensity: 0.9,
        roughness: 0.16,
        metalness: 0.2,
      });

  const rainbowMat: FantasyLitMaterial = safeMode
    ? new THREE.MeshLambertMaterial({
        map: rainbowTex,
        emissive: '#FFFFFF',
        emissiveMap: rainbowTex,
        emissiveIntensity: 0.62,
        side: THREE.DoubleSide,
      })
    : new THREE.MeshStandardMaterial({
        map: rainbowTex,
        emissive: '#FFFFFF',
        emissiveMap: rainbowTex,
        emissiveIntensity: 0.62,
        roughness: 0.35,
        metalness: 0.0,
        side: THREE.DoubleSide,
      });

  const waterfallMat = new THREE.MeshBasicMaterial({
    map: waterfallTex,
    transparent: !safeMode,
    opacity: safeMode ? 1.0 : 0.8,
    depthWrite: safeMode,
    side: THREE.DoubleSide,
    fog: false,
  });

  const glowAccentMat: FantasyLitMaterial = safeMode
    ? new THREE.MeshLambertMaterial({
        color: pal.lampGlow,
        emissive: pal.lampGlow,
        emissiveIntensity: 1.45,
      })
    : new THREE.MeshStandardMaterial({
        color: pal.lampGlow,
        emissive: pal.lampGlow,
        emissiveIntensity: 1.45,
        roughness: 0.2,
      });

  const darkMetalMat: FantasyLitMaterial = safeMode
    ? new THREE.MeshLambertMaterial({ color: pal.lampPost })
    : new THREE.MeshStandardMaterial({
        color: pal.lampPost,
        roughness: 0.44,
        metalness: 0.62,
      });

  const allTextures: THREE.Texture[] = [paletteTex, rainbowTex, waterfallTex];
  const allMaterials: THREE.Material[] = [
    paletteMat,
    instancedColorMat,
    crystalCyanMat,
    crystalMagentaMat,
    crystalYellowMat,
    rainbowMat,
    waterfallMat,
    glowAccentMat,
    darkMetalMat,
  ];

  return {
    paletteMat,
    instancedColorMat,
    crystalCyanMat,
    crystalMagentaMat,
    crystalYellowMat,
    rainbowMat,
    waterfallMat,
    glowAccentMat,
    darkMetalMat,
    waterfallTex,
    materialCount: allMaterials.length,
    dispose(): void {
      for (const t of allTextures) t.dispose();
      for (const m of allMaterials) m.dispose();
    },
  };
}
