// src/render/themes/toyroom.ts

import * as THREE from 'three';
import { CONFIG, VISUAL_PRESETS, type GraphicsPreset, type VisualPresetName } from '../../config';
import type { Course } from '../../core/course';
import type { ThemeDefinition, ThemeQualityTiers, ThemeSceneryContext, ThemeSceneryHandle } from '../../themes/types';
import { buildProps } from '../props';
import type { QualityLevel } from '../quality';
import type { ThemeInstance, ThemeLightingConfig, ThemeSkyColors, WorldTheme } from './index';

function buildToyroomQualityTiers(): ThemeQualityTiers {
  const levels = CONFIG.quality.levels;
  return {
    mobile: {
      propsDensityScale: levels.mobile.propsDensityScale,
      cloudDensityScale: levels.mobile.cloudDensityScale,
      shadowsEnabled: levels.mobile.shadowsEnabled,
      maxTextureSize: levels.mobile.maxTextureSize,
    },
    low: {
      propsDensityScale: levels.low.propsDensityScale,
      cloudDensityScale: levels.low.cloudDensityScale,
      shadowsEnabled: levels.low.shadowsEnabled,
      maxTextureSize: levels.low.maxTextureSize,
    },
    medium: {
      propsDensityScale: levels.medium.propsDensityScale,
      cloudDensityScale: levels.medium.cloudDensityScale,
      shadowsEnabled: levels.medium.shadowsEnabled,
      maxTextureSize: levels.medium.maxTextureSize,
    },
    high: {
      propsDensityScale: levels.high.propsDensityScale,
      cloudDensityScale: levels.high.cloudDensityScale,
      shadowsEnabled: levels.high.shadowsEnabled,
      maxTextureSize: levels.high.maxTextureSize,
    },
  };
}

function getToyroomSkyColors(presetName: VisualPresetName): ThemeSkyColors {
  const preset = VISUAL_PRESETS[presetName];
  return {
    skyTop: preset.skyTop,
    skyHorizon: preset.skyHorizon,
    groundBounce: preset.room.floorColor.dark,
    fogColor: preset.fogColor,
  };
}

function getToyroomLighting(presetName: VisualPresetName): ThemeLightingConfig {
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
}

export const toyroomThemeDefinition: ThemeDefinition = {
  id: 'toyroom',
  background: {
    type: 'room',
    params: {
      vivid: getToyroomSkyColors('vivid'),
      pastel: getToyroomSkyColors('pastel'),
    },
  },
  lightingProfile: {
    id: 'toyroom-daylight',
    vivid: getToyroomLighting('vivid'),
    pastel: getToyroomLighting('pastel'),
  },
  qualityTiers: buildToyroomQualityTiers(),
  buildScenery(context: ThemeSceneryContext): ThemeSceneryHandle {
    const graphicsPreset: GraphicsPreset = context.graphicsPreset ?? 'penuh';
    const propsVisual = buildProps(
      context.course,
      context.quality,
      context.maxAnisotropy,
      context.presetName,
      graphicsPreset === 'hemat',
      graphicsPreset,
    );
    const fallbackCamPos = new THREE.Vector3();
    return {
      id: 'toyroom',
      group: propsVisual.group,
      update(_dt: number, cameraPos?: THREE.Vector3): void {
        propsVisual.update(cameraPos ?? fallbackCamPos);
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

export const toyroomTheme: WorldTheme = {
  id: 'toyroom',
  definition: toyroomThemeDefinition,

  getSkyColors: getToyroomSkyColors,
  getLighting: getToyroomLighting,

  applyPalette(_name: VisualPresetName): void {
    // Managed by active instance via propsVisual.applyPalette and sceneCtx.applyPalette
  },

  build(
    course: Course,
    quality: QualityLevel,
    scene: THREE.Scene,
    maxAnisotropy: number,
    presetName: VisualPresetName,
    graphicsPreset: GraphicsPreset = 'penuh',
  ): ThemeInstance {
    const scenery = toyroomThemeDefinition.buildScenery({
      course,
      quality,
      scene,
      maxAnisotropy,
      presetName,
      graphicsPreset,
    });
    return {
      id: 'toyroom',
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
