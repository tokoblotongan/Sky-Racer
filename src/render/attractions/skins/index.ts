// src/render/attractions/skins/index.ts
// Skin registry for dynamic attractions (visuals only: meshes, colors, textures, telegraph stripes).

import type * as THREE from 'three';
import type { GraphicsPreset } from '../../../config';
import type { AttractionSkinId } from '../../../courses/fantasyLandAttractions';
import type { SurfaceMaterial } from '../../materialFactory';
import type { QualityLevel } from '../../quality';
import { defaultAttractionSkin } from './default';
import { kitchenAttractionSkin } from './kitchen';

export interface PendulumSkinParts {
  readonly pillarGeo: THREE.BufferGeometry;
  readonly beamGeo: THREE.BufferGeometry;
  readonly pivotHubGeo: THREE.BufferGeometry;
  readonly armGeo: THREE.BufferGeometry;
  readonly bobGeo: THREE.BufferGeometry;
  readonly bandGeo: THREE.BufferGeometry;
  readonly handleMat: SurfaceMaterial;
  readonly archMat: SurfaceMaterial;
  readonly bobMat: SurfaceMaterial;
  readonly accentMat: SurfaceMaterial;
  readonly showArch: boolean;
  dispose: () => void;
}

export interface RollingBallsSkinParts {
  readonly ballGeo: THREE.BufferGeometry;
  readonly ballMat: SurfaceMaterial;
  readonly tints: readonly number[];
  dispose: () => void;
}

export interface WindFanSkinParts {
  readonly standGeo: THREE.BufferGeometry;
  readonly shroudGeo: THREE.BufferGeometry;
  readonly hubGeo: THREE.BufferGeometry;
  readonly bladeGeo: THREE.BufferGeometry;
  readonly streakGeo: THREE.BufferGeometry;
  readonly frameMat: SurfaceMaterial;
  readonly bladeMat: SurfaceMaterial;
  readonly hubMat: SurfaceMaterial;
  readonly streakMat: THREE.MeshBasicMaterial;
  readonly streakCount: number;
  dispose: () => void;
}

export interface JellyPuddleSkinParts {
  readonly tex: THREE.CanvasTexture;
  readonly mat: SurfaceMaterial;
  readonly animateUv: boolean;
  dispose: () => void;
}

export interface BoostRingsSkinParts {
  readonly outerGeo: THREE.BufferGeometry;
  readonly innerGeo: THREE.BufferGeometry | null;
  readonly cyanMat: SurfaceMaterial;
  readonly yellowMat: SurfaceMaterial;
  readonly maxDistanceScale: number;
  dispose: () => void;
}

export interface TelegraphSkinParts {
  readonly tex: THREE.CanvasTexture;
  readonly mat: THREE.MeshBasicMaterial;
  readonly baseRGB: readonly [number, number, number];
  readonly pulseRGB: readonly [number, number, number];
  dispose: () => void;
}

export interface AttractionSkin {
  readonly id: AttractionSkinId;
  createPendulumParts: (preset: GraphicsPreset) => PendulumSkinParts;
  createRollingBallsParts: (preset: GraphicsPreset) => RollingBallsSkinParts;
  createWindFanParts: (preset: GraphicsPreset, quality: QualityLevel) => WindFanSkinParts;
  createJellyPuddleParts: (preset: GraphicsPreset) => JellyPuddleSkinParts;
  createBoostRingsParts: (preset: GraphicsPreset) => BoostRingsSkinParts;
  createTelegraphParts: () => TelegraphSkinParts;
}

const SKIN_REGISTRY: Readonly<Record<AttractionSkinId, AttractionSkin>> = {
  default: defaultAttractionSkin,
  kitchen: kitchenAttractionSkin,
};

export function getAttractionSkin(skinId?: AttractionSkinId): AttractionSkin {
  if (skinId && skinId in SKIN_REGISTRY) {
    return SKIN_REGISTRY[skinId];
  }
  return defaultAttractionSkin;
}
