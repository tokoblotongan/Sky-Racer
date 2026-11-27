// src/arenas/fantasyLand/definition.ts

import { CONFIG } from '../../config';
import { fantasyLandCourse } from '../../courses/fantasyLand';
import type { ArenaDefinition } from '../types';

export const fantasyLandArena: ArenaDefinition = {
  id: fantasyLandCourse.id,
  name: fantasyLandCourse.name,
  arenaNumber: fantasyLandCourse.arenaNumber,
  displayName: fantasyLandCourse.displayName,
  tagline: fantasyLandCourse.tagline,
  description:
    'Sirkuit tertutup 3 lap dengan Dragon Loop, Jembatan Pelangi, Terowongan Kristal, rute pintas, dan atraksi interaktif.',
  order: 2,
  mode: 'race',
  typeLabel: fantasyLandCourse.typeLabel,
  laps: fantasyLandCourse.laps ?? 3,
  opponentCount: Math.max(0, (fantasyLandCourse.racers ?? 4) - 1),
  course: () => ({
    closed: Boolean(fantasyLandCourse.closed),
    trackWidth: fantasyLandCourse.trackWidth ?? CONFIG.course.trackWidth,
    startPosition: fantasyLandCourse.startPosition ?? CONFIG.course.startPosition,
    startHeadingDeg: fantasyLandCourse.startHeadingDeg ?? CONFIG.course.startHeadingDeg,
    segments: fantasyLandCourse.segments,
    referenceTime: fantasyLandCourse.referenceTime,
    referenceLapTime: fantasyLandCourse.referenceLapTime,
    medals: fantasyLandCourse.medals,
  }),
  routes: fantasyLandCourse.routes,
  zones: {
    startBanner: CONFIG.fantasy.zoneStartBanner,
  },
  attractions: {
    enabled: true,
    style: 'fantasyland',
  },
  theme: fantasyLandCourse.themeId,
  background: {
    type: 'meadow-island',
    params: {
      themeId: fantasyLandCourse.themeId,
    },
  },
  lightingProfile: 'fantasyland-meadow',
  carVisualScale: CONFIG.car.visualScale,
  music: {
    title: CONFIG.audio.music.tracks.title,
    race: CONFIG.audio.music.tracks.fantasyRace,
    lastLap: CONFIG.audio.music.tracks.fantasyLastLap,
    win: CONFIG.audio.music.tracks.fantasyWin,
    lose: CONFIG.audio.music.tracks.fantasyLose,
  },
  minimap: {
    options: {
      showAttractions: true,
    },
  },
  introCamera: {
    durationSeconds: CONFIG.intro.durationSeconds,
    highlightPoints: [
      {
        anchor: {
          kind: 'namedSegment',
          namePart: 'Dragon Loop',
          fraction: 0.5,
          offsetS: -38,
          fallbackFraction: 0.24,
        },
        heightScale: 1.45,
        lateralScale: -1.5,
        lookDeltaMeters: 42,
        lookHeightOffset: 4.5,
      },
      {
        anchor: {
          kind: 'namedSegment',
          namePart: 'Dragon Loop',
          fraction: 0.5,
          fallbackFraction: 0.24,
        },
        heightScale: 1.25,
        lateralScale: 2.1,
        lookDeltaMeters: -6,
        lookHeightOffset: 6.0,
      },
      {
        anchor: {
          kind: 'namedSegment',
          namePart: 'Jembatan Pelangi',
          fraction: 0.5,
          fallbackFraction: 0.37,
        },
        heightScale: 1.15,
        lateralScale: -1.35,
        lookDeltaMeters: 34,
        lookHeightOffset: 2.2,
      },
      {
        anchor: {
          kind: 'namedSegment',
          namePart: 'Terowongan Kristal',
          fraction: 0.35,
          fallbackFraction: 0.44,
        },
        heightScale: 1.05,
        lateralScale: 1.25,
        lookDeltaMeters: -18,
        lookHeightOffset: 2.5,
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
    hasAttractions: true,
    hasPodium: true,
  },
  budgets: {
    meshes: 80,
    triangles: 75000,
    instances: 600,
    textureMB: 3.0,
  },
};
