// src/render/themes/index.ts

import * as THREE from 'three';
import type { GraphicsPreset, VisualPresetName } from '../../config';
import type { Course } from '../../core/course';
import type { ThemeId } from '../../courses/types';
import type { QualityLevel } from '../quality';
import { fantasyLandTheme } from './fantasyland';
import { toyroomTheme } from './toyroom';

export interface ThemeSkyColors {
  skyTop: string;
  skyHorizon: string;
  groundBounce: string;
  fogColor: string;
}

export interface ThemeLightingConfig {
  hemisphereSkyColor: string;
  hemisphereGroundColor: string;
  hemisphereIntensity: number;
  sunColor: string;
  sunIntensity: number;
  exposure: number;
  envIntensity: number;
  showRoomShell: boolean;
}

export interface ThemeInstance {
  id: ThemeId;
  group: THREE.Group;
  update: (cameraPos: THREE.Vector3, dt: number) => void;
  applyPalette: (name: VisualPresetName) => void;
  getGroundY?: (x: number, z: number) => number;
  dispose: () => void;
}

export interface WorldTheme {
  id: ThemeId;
  build: (
    course: Course,
    quality: QualityLevel,
    scene: THREE.Scene,
    maxAnisotropy: number,
    presetName: VisualPresetName,
    graphicsPreset?: GraphicsPreset,
  ) => ThemeInstance;
  applyPalette: (name: VisualPresetName) => void;
  getSkyColors: (presetName: VisualPresetName) => ThemeSkyColors;
  getLighting: (presetName: VisualPresetName) => ThemeLightingConfig;
}

const THEMES: Record<ThemeId, WorldTheme> = {
  toyroom: toyroomTheme,
  fantasyland: fantasyLandTheme,
};

export function getTheme(id: ThemeId): WorldTheme {
  return THEMES[id] ?? toyroomTheme;
}
