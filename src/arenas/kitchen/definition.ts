// src/arenas/kitchen/definition.ts
// Arena 3 ("Dapur Raksasa") definition using the Sky Racer Arena Kit.

import { CONFIG } from '../../config';
import type { ArenaDefinition } from '../types';
import { kitchenCourse, kitchenShortcutRoutes } from './course';
import { kitchenTheme } from './theme';

export const kitchenArena: ArenaDefinition = {
  id: 'kitchen',
  name: 'Dapur Raksasa',
  arenaNumber: 3,
  displayName: 'Dapur Raksasa',
  tagline: 'Balapan di atas meja dapur raksasa dengan loop wajan dan terowongan panci',
  description:
    'Sirkuit tertutup 3 lap di atas meja dapur raksasa dengan Lompatan Talenan, Terowongan Panci, Loop Wajan, Jembatan Wastafel, Tikungan Kompor, dan Rute Pintas Rak Bumbu.',
  order: 3,
  mode: 'race',
  typeLabel: '3 lap',
  laps: 3,
  opponentCount: 3,
  course: () => kitchenCourse,
  routes: kitchenShortcutRoutes,
  zones: {
    startBanner: {
      title: 'MEJA START',
      startS: 10,
      endS: 50,
    },
    markers: [
      { name: 'Meja Start', s: 0 },
      { name: 'Lompatan Talenan', s: 304 },
      { name: 'Terowongan Panci', s: 575 },
      { name: 'Loop Wajan', s: 825 },
      { name: 'Jembatan Wastafel', s: 1162 },
      { name: 'Tikungan Kompor', s: 1457 },
    ],
  },
  theme: kitchenTheme.id,
  themeDefinition: kitchenTheme,
  background: {
    type: kitchenTheme.background.type,
    params: {
      themeId: kitchenTheme.id,
    },
  },
  lightingProfile: kitchenTheme.lightingProfile.id,
  carVisualScale: CONFIG.car.visualScale,
  minimap: {
    options: {
      showAttractions: false,
    },
  },
  introCamera: {
    durationSeconds: CONFIG.intro.durationSeconds,
    highlightPoints: [
      {
        anchor: {
          kind: 'namedSegment',
          namePart: 'Lompatan Talenan',
          fraction: 0.45,
          fallbackFraction: 0.18,
        },
        heightScale: 1.2,
        lateralScale: -1.35,
        lookDeltaMeters: 36,
        lookHeightOffset: 2.5,
      },
      {
        anchor: {
          kind: 'namedSegment',
          namePart: 'Loop Wajan',
          fraction: 0.5,
          fallbackFraction: 0.4,
        },
        heightScale: 1.35,
        lateralScale: 1.9,
        lookDeltaMeters: -8,
        lookHeightOffset: 6.0,
      },
      {
        anchor: {
          kind: 'namedSegment',
          namePart: 'Jembatan Wastafel',
          fraction: 0.5,
          fallbackFraction: 0.58,
        },
        heightScale: 1.15,
        lateralScale: -1.3,
        lookDeltaMeters: 34,
        lookHeightOffset: 2.2,
      },
      {
        anchor: {
          kind: 'courseEnd',
          closedOffsetS: 34,
          openS: 0,
        },
        heightScale: 0.72,
        lateralFixed: 2.5,
        lookDeltaMeters: 42,
        lookHeightOffset: 1.4,
      },
    ],
  },
  capabilities: {
    hasOpponents: true,
    hasShortcut: true,
    hasAttractions: false,
    hasPodium: true,
  },
  // 80% of FantasyLand baseline budgets ({ meshes: 80, triangles: 75000, instances: 600, textureMB: 3.0 })
  budgets: {
    meshes: 64,
    triangles: 60000,
    instances: 480,
    textureMB: 2.4,
  },
  comingSoon: false,
};
