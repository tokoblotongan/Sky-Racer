// src/arenas/types.ts

import type {
  CourseDefinition,
  CourseMedals,
  CourseSegmentConfig,
  RouteDefinition,
} from '../courses/types';
import type { ThemeDefinition, ThemeId } from '../themes/types';

export type ArenaMode = 'timetrial' | 'race';

export interface ArenaCourseData {
  readonly closed: boolean;
  readonly trackWidth: number;
  readonly startPosition: { readonly x: number; readonly y: number; readonly z: number };
  readonly startHeadingDeg: number;
  readonly segments: readonly CourseSegmentConfig[];
  readonly referenceTime: number;
  readonly referenceLapTime?: number;
  readonly medals: CourseMedals;
}

export interface ArenaStartBannerZone {
  readonly title: string;
  readonly startS: number;
  readonly endS: number;
}

export interface ArenaNamedZone {
  readonly name: string;
  readonly s: number;
}

export interface ArenaZonesConfig {
  readonly startBanner?: ArenaStartBannerZone;
  readonly markers?: readonly ArenaNamedZone[];
}

export interface ArenaAttractionsConfig {
  readonly enabled: boolean;
  readonly style?: 'fantasyland' | string;
}

export interface ArenaBackgroundConfig {
  readonly type: string;
  readonly params: Readonly<Record<string, unknown>>;
}

export interface ArenaMusicConfig {
  readonly title?: string;
  readonly race?: string;
  readonly lastLap?: string;
  readonly win?: string;
  readonly lose?: string;
}

export interface ArenaMinimapConfig {
  readonly options?: {
    readonly showAttractions?: boolean;
    readonly defaultSize?: 'off' | 'small' | 'large';
  };
}

export type IntroCameraWaypointAnchor =
  | {
      readonly kind: 'namedSegment';
      readonly namePart: string;
      readonly fraction?: number;
      readonly offsetS?: number;
      readonly fallbackFraction: number;
    }
  | {
      readonly kind: 'segmentType';
      readonly segmentType: 'loop' | 'gap' | 'straight';
      readonly occurrenceIndex?: number;
      readonly minLength?: number;
      readonly fraction?: number;
      readonly fallbackType?: 'gap';
      readonly fallbackOccurrenceIndex?: number;
      readonly fallbackFraction: number;
    }
  | {
      readonly kind: 'gridStart';
      readonly offsetS: number;
    }
  | {
      readonly kind: 'courseEnd';
      readonly closedOffsetS: number;
      readonly openS: number;
    }
  | {
      readonly kind: 'fraction';
      readonly fraction: number;
    };

export interface IntroCameraWaypointConfig {
  readonly anchor: IntroCameraWaypointAnchor;
  readonly heightScale: number;
  readonly lateralScale?: number;
  readonly lateralFixed?: number;
  readonly lookDeltaMeters: number;
  readonly lookHeightOffset: number;
}

export interface ArenaIntroCameraConfig {
  readonly durationSeconds?: number;
  readonly highlightPoints?: readonly IntroCameraWaypointConfig[];
}

export interface ArenaCapabilities {
  readonly hasOpponents: boolean;
  readonly hasShortcut: boolean;
  readonly hasAttractions: boolean;
  readonly hasPodium: boolean;
}

export interface ArenaBudgets {
  readonly meshes: number;
  readonly triangles: number;
  readonly instances: number;
  readonly textureMB: number;
}

export interface ArenaDefinition {
  readonly id: string;
  readonly name: string;
  readonly arenaNumber?: number;
  readonly displayName?: string;
  readonly tagline: string;
  readonly description: string;
  readonly order: number;
  readonly mode: ArenaMode;
  readonly typeLabel?: string;
  readonly laps: number;
  readonly opponentCount: number;
  readonly course: ArenaCourseData | (() => ArenaCourseData);
  readonly routes?: readonly RouteDefinition[];
  readonly zones?: ArenaZonesConfig;
  readonly attractions?: ArenaAttractionsConfig;
  readonly theme: ThemeId;
  readonly themeDefinition?: ThemeDefinition;
  readonly background: ArenaBackgroundConfig;
  readonly lightingProfile: string;
  readonly carVisualScale: number;
  readonly music?: ArenaMusicConfig;
  readonly minimap?: ArenaMinimapConfig;
  readonly introCamera?: ArenaIntroCameraConfig;
  readonly capabilities: ArenaCapabilities;
  readonly budgets: ArenaBudgets;
  readonly comingSoon?: boolean;
}

export function resolveArenaCourseData(arena: ArenaDefinition): ArenaCourseData {
  return typeof arena.course === 'function' ? arena.course() : arena.course;
}

export function arenaToCourseDefinition(arena: ArenaDefinition): CourseDefinition {
  const courseData = resolveArenaCourseData(arena);
  const racers = Math.max(1, 1 + Math.max(0, Math.round(arena.opponentCount)));
  const typeLabel =
    arena.typeLabel ?? (arena.laps > 1 ? `${arena.laps} lap` : 'Satu arah');

  return {
    id: arena.id,
    name: arena.name,
    arenaNumber: arena.arenaNumber ?? arena.order,
    displayName: arena.displayName ?? arena.name,
    tagline: arena.tagline,
    themeId: arena.theme,
    typeLabel,
    closed: courseData.closed,
    laps: arena.laps,
    racers,
    hasAttractions: arena.capabilities.hasAttractions,
    trackWidth: courseData.trackWidth,
    startPosition: courseData.startPosition,
    startHeadingDeg: courseData.startHeadingDeg,
    segments: courseData.segments,
    routes: arena.routes,
    referenceTime: courseData.referenceTime,
    referenceLapTime: courseData.referenceLapTime,
    medals: courseData.medals,
  };
}
