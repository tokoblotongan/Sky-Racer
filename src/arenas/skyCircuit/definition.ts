// src/arenas/skyCircuit/definition.ts

import { CONFIG } from '../../config';
import { skyCircuitCourse } from '../../courses/skyCircuit';
import type { ArenaDefinition } from '../types';

export const skyCircuitArena: ArenaDefinition = {
  id: skyCircuitCourse.id,
  name: skyCircuitCourse.name,
  arenaNumber: skyCircuitCourse.arenaNumber,
  displayName: skyCircuitCourse.displayName,
  tagline: skyCircuitCourse.tagline,
  description:
    'Lintasan akrobatik satu arah melayang di ruang mainan dengan dua loop vertikal dan dua lompatan.',
  order: 1,
  mode: 'timetrial',
  typeLabel: skyCircuitCourse.typeLabel,
  laps: skyCircuitCourse.laps ?? 1,
  opponentCount: Math.max(0, (skyCircuitCourse.racers ?? 1) - 1),
  course: () => ({
    closed: Boolean(skyCircuitCourse.closed),
    trackWidth: skyCircuitCourse.trackWidth ?? CONFIG.course.trackWidth,
    startPosition: skyCircuitCourse.startPosition ?? CONFIG.course.startPosition,
    startHeadingDeg: skyCircuitCourse.startHeadingDeg ?? CONFIG.course.startHeadingDeg,
    segments: skyCircuitCourse.segments,
    referenceTime: skyCircuitCourse.referenceTime,
    referenceLapTime: skyCircuitCourse.referenceLapTime ?? skyCircuitCourse.referenceTime,
    medals: skyCircuitCourse.medals,
  }),
  routes: skyCircuitCourse.routes,
  theme: skyCircuitCourse.themeId,
  background: {
    type: 'room',
    params: {
      themeId: skyCircuitCourse.themeId,
    },
  },
  lightingProfile: 'toyroom-daylight',
  carVisualScale: CONFIG.car.visualScale,
  music: {
    title: CONFIG.audio.music.tracks.title,
    race: CONFIG.audio.music.tracks.skyCircuitRace,
    win: CONFIG.audio.music.tracks.fantasyWin,
    lose: CONFIG.audio.music.tracks.fantasyLose,
  },
  minimap: {
    options: {
      showAttractions: false,
    },
  },
  introCamera: {
    durationSeconds: CONFIG.intro.durationSeconds,
    highlightPoints: [...CONFIG.arenaKit.introCameraDefaults.highlightPoints],
  },
  capabilities: {
    hasOpponents: false,
    hasShortcut: false,
    hasAttractions: false,
    hasPodium: false,
  },
  budgets: {
    meshes: 140,
    triangles: 20000,
    instances: 220,
    textureMB: 4.0,
  },
};
