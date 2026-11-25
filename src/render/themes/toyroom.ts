// src/render/themes/toyroom.ts

import * as THREE from 'three';
import { VISUAL_PRESETS, type VisualPresetName } from '../../config';
import type { Course } from '../../core/course';
import { buildProps } from '../props';
import type { QualityLevel } from '../quality';
import type { ThemeInstance, ThemeLightingConfig, ThemeSkyColors, WorldTheme } from './index';

export const toyroomTheme: WorldTheme = {
  id: 'toyroom',

  getSkyColors(presetName: VisualPresetName): ThemeSkyColors {
    const preset = VISUAL_PRESETS[presetName];
    return {
      skyTop: preset.skyTop,
      skyHorizon: preset.skyHorizon,
      groundBounce: preset.room.floorColor.dark,
      fogColor: preset.fogColor,
    };
  },

  getLighting(presetName: VisualPresetName): ThemeLightingConfig {
    const preset = VISUAL_PRESETS[presetName];
    return {
      hemisphereSkyColor: preset.hemisphereSkyColor,
      hemisphereGroundColor: preset.hemisphereGroundColor,
      hemisphereIntensity: preset.hemisphereIntensity,
      sunColor: preset.sunColor,
      sunIntensity: preset.sunIntensity,
      exposure: preset.exposure,
      envIntensity: preset.envIntensity,
      showRoomShell: true,
    };
  },

  applyPalette(_name: VisualPresetName): void {
    // Dikelola oleh instans aktif melalui propsVisual.applyPalette dan sceneCtx.applyPalette
  },

  build(
    course: Course,
    quality: QualityLevel,
    _scene: THREE.Scene,
    maxAnisotropy: number,
    presetName: VisualPresetName,
  ): ThemeInstance {
    const propsVisual = buildProps(course, quality, maxAnisotropy, presetName);
    return {
      id: 'toyroom',
      group: propsVisual.group,
      update(cameraPos: THREE.Vector3, _dt: number): void {
        propsVisual.update(cameraPos);
      },
      applyPalette(name: VisualPresetName): void {
        propsVisual.applyPalette(name);
      },
      getGroundY(): number {
        return 0;
      },
      dispose(): void {
        propsVisual.dispose();
      },
    };
  },
};
