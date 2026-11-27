// src/ui/courseCard.ts

import { createDefaultArenaRegistry } from '../arenas';
import type { ArenaDefinition } from '../arenas/types';
import { CONFIG } from '../config';
import type { CourseDefinition } from '../courses/types';
import { createArenaSelect, type ArenaSelectHandle } from './arenaSelect';

export type CourseSelectHandle = ArenaSelectHandle;

function toArenaDefinition(def: CourseDefinition, index: number): ArenaDefinition {
  const racers = Math.max(1, def.racers ?? 1);
  return {
    id: def.id,
    name: def.name,
    arenaNumber: def.arenaNumber ?? index + 1,
    displayName: def.displayName ?? def.name,
    tagline: def.tagline,
    description: def.tagline,
    order: def.arenaNumber ?? index + 1,
    mode: racers > 1 ? 'race' : 'timetrial',
    typeLabel: def.typeLabel,
    laps: def.laps ?? (def.closed ? 3 : 1),
    opponentCount: racers - 1,
    course: {
      closed: Boolean(def.closed),
      trackWidth: def.trackWidth ?? CONFIG.course.trackWidth,
      startPosition: def.startPosition ?? CONFIG.course.startPosition,
      startHeadingDeg: def.startHeadingDeg ?? CONFIG.course.startHeadingDeg,
      segments: def.segments,
      referenceTime: def.referenceTime,
      referenceLapTime: def.referenceLapTime,
      medals: def.medals,
    },
    routes: def.routes,
    theme: def.themeId,
    background: {
      type: def.themeId,
      params: {},
    },
    lightingProfile: def.themeId,
    carVisualScale: CONFIG.car.visualScale,
    capabilities: {
      hasOpponents: racers > 1,
      hasShortcut: Boolean(def.routes && def.routes.length > 0),
      hasAttractions: Boolean(def.hasAttractions),
      hasPodium: racers > 1,
    },
    budgets: CONFIG.arenaKit.defaultBudgets,
  };
}

export function createCourseSelect(
  container: HTMLElement,
  courses: readonly CourseDefinition[],
  selectedId: string,
  onSelect: (id: string) => void,
  onConfirm: () => void,
): CourseSelectHandle {
  const registry = createDefaultArenaRegistry();
  const arenas = courses.map((c, idx) => registry.getArena(c.id) ?? toArenaDefinition(c, idx));
  return createArenaSelect(container, arenas, selectedId, onSelect, onConfirm);
}

