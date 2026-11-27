// src/arenas/kitchen/theme.ts
// Theme definition for Arena 3 ("Dapur Raksasa"), wired to the modular Stage K2 kitchen scenery.

import { CONFIG } from '../../config';
import { buildKitchenScenery, getKitchenDecorFootprints } from '../../render/themes/kitchen';
import type {
  DecorFootprint,
  ThemeDefinition,
  ThemeQualityTiers,
  ThemeSceneryContext,
  ThemeSceneryHandle,
} from '../../themes/types';

function buildKitchenQualityTiers(): ThemeQualityTiers {
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

export const kitchenTheme: ThemeDefinition = {
  id: 'kitchen',
  background: {
    type: 'skybox',
    params: {
      vivid: {
        skyTop: '#1E90FF',
        skyHorizon: '#8FD3FF',
        groundBounce: '#14B8A6',
        fogColor: '#8FD3FF',
      },
      pastel: {
        skyTop: '#4DB3FF',
        skyHorizon: '#BFE3FF',
        groundBounce: '#7ADBD0',
        fogColor: '#BFE3FF',
      },
    },
  },
  lightingProfile: {
    id: 'kitchen-daylight',
    vivid: {
      hemisphereSkyColor: '#7EC8FF',
      hemisphereGroundColor: '#8ED8CF',
      hemisphereIntensity: 0.72,
      sunColor: '#FFF3DC',
      sunIntensity: 2.95,
      exposure: 0.96,
      envIntensity: 0.42,
      showRoomShell: false,
    },
    pastel: {
      hemisphereSkyColor: '#BFE3FF',
      hemisphereGroundColor: '#B5E6E0',
      hemisphereIntensity: 0.76,
      sunColor: '#FFF6E8',
      sunIntensity: 2.75,
      exposure: 0.92,
      envIntensity: 0.4,
      showRoomShell: false,
    },
  },
  qualityTiers: buildKitchenQualityTiers(),
  buildScenery(context: ThemeSceneryContext): ThemeSceneryHandle {
    return buildKitchenScenery(kitchenTheme, context);
  },
  getDecorFootprints(context: ThemeSceneryContext): readonly DecorFootprint[] {
    return getKitchenDecorFootprints(context);
  },
};
