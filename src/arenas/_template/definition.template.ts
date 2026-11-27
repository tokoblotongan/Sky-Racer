// src/arenas/_template/definition.template.ts
// ArenaDefinition template. Scaffold a new arena via: npm run new:arena -- <id> "<Name>"

import { CONFIG } from '../../config';
import type { ArenaDefinition } from '../types';
import { templateArenaCourse } from './course.template';
import { templateArenaTheme } from './theme.template';

export const templateArena: ArenaDefinition = {
  id: 'template-arena',
  name: 'Template Arena',
  arenaNumber: 99,
  displayName: 'Template Arena',
  tagline: 'Deskripsi singkat arena baru di layar pilihan',
  description: 'Deskripsi lengkap arena baru untuk dokumentasi dan metadata.',
  order: 99,
  mode: 'race',
  typeLabel: '3 lap',
  laps: 3,
  opponentCount: 3,
  course: () => templateArenaCourse,
  theme: templateArenaTheme.id,
  themeDefinition: templateArenaTheme,
  background: {
    type: templateArenaTheme.background.type,
    params: {
      themeId: templateArenaTheme.id,
    },
  },
  lightingProfile: templateArenaTheme.lightingProfile.id,
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
      showAttractions: false,
    },
  },
  introCamera: {
    durationSeconds: CONFIG.intro.durationSeconds,
    highlightPoints: [...CONFIG.arenaKit.introCameraDefaults.highlightPoints],
  },
  capabilities: {
    hasOpponents: true,
    hasShortcut: false,
    hasAttractions: false,
    hasPodium: true,
  },
  budgets: {
    ...CONFIG.arenaKit.defaultBudgets,
  },
  comingSoon: true,
};
