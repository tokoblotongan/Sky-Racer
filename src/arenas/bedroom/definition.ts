// src/arenas/bedroom/definition.ts
// Arena 4 ("Kamar Tidur Raksasa") definition using the Sky Racer Arena Kit (Stage K1).

import { CONFIG } from '../../config';
import type { ArenaDefinition } from '../types';
import { bedroomCourse, bedroomShortcutRoutes } from './course';
import { bedroomTheme } from './theme';

export const bedroomArena: ArenaDefinition = {
  id: 'bedroom',
  name: 'Kamar Tidur Raksasa',
  arenaNumber: 4,
  displayName: 'Kamar Tidur Raksasa',
  tagline: 'Balapan di atas kasur raksasa dengan loop jam weker dan terowongan selimut',
  description:
    'Sirkuit tertutup 3 lap di atas kasur raksasa dengan Lompatan Bantal, Terowongan Selimut, Loop Jam Weker, Jembatan Rak Buku, Tikungan Karpet, dan Rute Pintas Kolong Ranjang.',
  order: 4,
  mode: 'race',
  typeLabel: '3 lap',
  laps: 3,
  opponentCount: 3,
  course: () => bedroomCourse,
  routes: bedroomShortcutRoutes,
  zones: {
    startBanner: {
      title: 'KASUR START',
      startS: 10,
      endS: 50,
    },
    markers: [
      { name: 'Kasur Start', s: 0 },
      { name: 'Lompatan Bantal', s: 385 },
      { name: 'Terowongan Selimut', s: 613 },
      { name: 'Loop Jam Weker', s: 893 },
      { name: 'Jembatan Rak Buku', s: 1280 },
      { name: 'Tikungan Karpet', s: 1535 },
    ],
  },
  attractions: {
    enabled: false,
  },
  theme: bedroomTheme.id,
  themeDefinition: bedroomTheme,
  background: {
    type: bedroomTheme.background.type,
    params: {
      themeId: bedroomTheme.id,
    },
  },
  lightingProfile: bedroomTheme.lightingProfile.id,
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
          namePart: 'Lompatan Bantal',
          fraction: 0.45,
          fallbackFraction: 0.16,
        },
        heightScale: 1.2,
        lateralScale: -1.35,
        lookDeltaMeters: 36,
        lookHeightOffset: 2.5,
      },
      {
        anchor: {
          kind: 'namedSegment',
          namePart: 'Loop Jam Weker',
          fraction: 0.5,
          fallbackFraction: 0.39,
        },
        heightScale: 1.35,
        lateralScale: 1.9,
        lookDeltaMeters: -8,
        lookHeightOffset: 6.0,
      },
      {
        anchor: {
          kind: 'namedSegment',
          namePart: 'Jembatan Rak Buku',
          fraction: 0.5,
          fallbackFraction: 0.54,
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
  // Same budgets as kitchen arena
  budgets: {
    meshes: 64,
    triangles: 60000,
    instances: 480,
    textureMB: 2.4,
  },
  comingSoon: false,
};
