// src/courses/index.ts

import { arenaToCourseDefinition, createDefaultArenaRegistry } from '../arenas';
import { CONFIG } from '../config';
import { skyCircuitCourse } from './skyCircuit';
import type { CourseDefinition } from './types';

export type {
  BoostPadSegmentConfig,
  CourseDefinition,
  CourseMedals,
  CourseSegmentConfig,
  ThemeId,
} from './types';

export const defaultCourseId = CONFIG.activeCourseId;

let memoryLastCourseId: string | null = null;

function buildCourseList(): readonly CourseDefinition[] {
  const registry = createDefaultArenaRegistry();
  return registry
    .listArenas({ includeComingSoon: false })
    .map((arena) => arenaToCourseDefinition(arena));
}

export function getCourse(id: string): CourseDefinition {
  const courses = buildCourseList();
  return (
    courses.find((course) => course.id === id) ??
    courses.find((course) => course.id === defaultCourseId) ??
    courses[0] ??
    skyCircuitCourse
  );
}

export function listCourses(): readonly CourseDefinition[] {
  return buildCourseList();
}

export function getLastCourseId(): string {
  const courses = buildCourseList();
  const hasId = (candidate: string): boolean => courses.some((c) => c.id === candidate);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem(CONFIG.storage.lastCourseKey);
      if (saved && hasId(saved)) {
        return saved;
      }
    }
  } catch {
    // Fallback to session memory / defaultCourseId when localStorage is unavailable
  }
  if (memoryLastCourseId && hasId(memoryLastCourseId)) {
    return memoryLastCourseId;
  }
  return hasId(defaultCourseId) ? defaultCourseId : (courses[0]?.id ?? skyCircuitCourse.id);
}

export function setLastCourseId(id: string): void {
  const courses = buildCourseList();
  const validId = courses.some((c) => c.id === id) ? id : getCourse(defaultCourseId).id;
  memoryLastCourseId = validId;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(CONFIG.storage.lastCourseKey, validId);
    }
  } catch {
    // Ignore storage write failure in restricted/private environments
  }
}
