// src/render/themes/index.ts

import * as THREE from 'three';
import type { GraphicsPreset, VisualPresetName } from '../../config';
import type { Course } from '../../core/course';
import type {
  ThemeDefinition,
  ThemeId,
  ThemeLightingConfig,
  ThemeSceneryHandle,
  ThemeSkyColors,
} from '../../themes/types';
import type { QualityLevel } from '../quality';
import { fantasyLandThemeDefinition } from './fantasyland';
import { toyroomThemeDefinition } from './toyroom';

export type { ThemeLightingConfig, ThemeSkyColors } from '../../themes/types';

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
  definition: ThemeDefinition;
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

export function createWorldThemeAdapter(definition: ThemeDefinition): WorldTheme {
  return {
    id: definition.id,
    definition,
    getSkyColors(presetName: VisualPresetName): ThemeSkyColors {
      return presetName === 'pastel'
        ? definition.background.params.pastel
        : definition.background.params.vivid;
    },
    getLighting(presetName: VisualPresetName): ThemeLightingConfig {
      return presetName === 'pastel'
        ? definition.lightingProfile.pastel
        : definition.lightingProfile.vivid;
    },
    applyPalette(_name: VisualPresetName): void {
      // Managed per active instance through ThemeSceneryHandle.applyPalette and scene.ts
    },
    build(
      course: Course,
      quality: QualityLevel,
      scene: THREE.Scene,
      maxAnisotropy: number,
      presetName: VisualPresetName,
      graphicsPreset: GraphicsPreset = 'penuh',
    ): ThemeInstance {
      const scenery: ThemeSceneryHandle = definition.buildScenery({
        course,
        quality,
        scene,
        maxAnisotropy,
        presetName,
        graphicsPreset,
      });
      return {
        id: definition.id,
        group: scenery.group,
        update(cameraPos: THREE.Vector3, dt: number): void {
          scenery.update(dt, cameraPos);
        },
        applyPalette(name: VisualPresetName): void {
          scenery.applyPalette?.(name);
        },
        getGroundY: scenery.getGroundY,
        dispose(): void {
          scenery.dispose();
        },
      };
    },
  };
}

const THEME_DEFINITIONS = new Map<ThemeId, ThemeDefinition>([
  [toyroomThemeDefinition.id, toyroomThemeDefinition],
  [fantasyLandThemeDefinition.id, fantasyLandThemeDefinition],
]);

export function registerThemeDefinition(definition: ThemeDefinition): void {
  THEME_DEFINITIONS.set(definition.id, definition);
}

export function getThemeDefinition(id: ThemeId): ThemeDefinition {
  return THEME_DEFINITIONS.get(id) ?? toyroomThemeDefinition;
}

export function getTheme(id: ThemeId): WorldTheme {
  return createWorldThemeAdapter(getThemeDefinition(id));
}
