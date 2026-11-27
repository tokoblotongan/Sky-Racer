// src/themes/types.ts

import type * as THREE from 'three';
import type { GraphicsPreset, VisualPresetName } from '../config';
import type { Course } from '../core/course';
import type { QualityLevel } from '../render/quality';

export type ThemeId = string;

export interface ThemeSkyColors {
  readonly skyTop: string;
  readonly skyHorizon: string;
  readonly groundBounce: string;
  readonly fogColor: string;
}

export interface ThemeLightingConfig {
  readonly hemisphereSkyColor: string;
  readonly hemisphereGroundColor: string;
  readonly hemisphereIntensity: number;
  readonly sunColor: string;
  readonly sunIntensity: number;
  readonly exposure: number;
  readonly envIntensity: number;
  readonly showRoomShell: boolean;
}

export interface ThemeBackgroundConfig {
  readonly type: 'room' | 'skybox' | 'meadow-island' | string;
  readonly params: {
    readonly vivid: ThemeSkyColors;
    readonly pastel: ThemeSkyColors;
  };
}

export interface ThemeLightingProfile {
  readonly id: string;
  readonly vivid: ThemeLightingConfig;
  readonly pastel: ThemeLightingConfig;
}

export interface ThemeQualityTierConfig {
  readonly propsDensityScale: number;
  readonly cloudDensityScale: number;
  readonly shadowsEnabled: boolean;
  readonly maxTextureSize: number;
}

export type ThemeQualityTiers = Record<QualityLevel, ThemeQualityTierConfig>;

export interface ThemeSceneryContext {
  readonly course: Course;
  readonly quality: QualityLevel;
  readonly scene: THREE.Scene;
  readonly maxAnisotropy: number;
  readonly presetName: VisualPresetName;
  readonly graphicsPreset?: GraphicsPreset;
}

export interface ThemeSceneryHandle {
  readonly id: ThemeId;
  readonly group: THREE.Group;
  update: (dt: number, cameraPos?: THREE.Vector3) => void;
  applyPalette?: (name: VisualPresetName) => void;
  getGroundY?: (x: number, z: number) => number;
  dispose: () => void;
}

export interface ThemeDefinition {
  readonly id: ThemeId;
  readonly background: ThemeBackgroundConfig;
  readonly lightingProfile: ThemeLightingProfile;
  readonly qualityTiers: ThemeQualityTiers;
  buildScenery: (context: ThemeSceneryContext) => ThemeSceneryHandle;
}
