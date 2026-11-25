// src/courses/index.ts

import { CONFIG } from '../config';
import { fantasyLandCourse } from './fantasyLand';
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

const COURSES: readonly CourseDefinition[] = [skyCircuitCourse, fantasyLandCourse];

const COURSE_BY_ID = new Map<string, CourseDefinition>(
  COURSES.map((course) => [course.id, course]),
);

let memoryLastCourseId: string | null = null;

export function getCourse(id: string): CourseDefinition {
  return COURSE_BY_ID.get(id) ?? COURSE_BY_ID.get(defaultCourseId) ?? skyCircuitCourse;
}

export function listCourses(): readonly CourseDefinition[] {
  return COURSES;
}

export function getLastCourseId(): string {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem(CONFIG.storage.lastCourseKey);
      if (saved && COURSE_BY_ID.has(saved)) {
        return saved;
      }
    }
  } catch {
    // Fallback ke memori sesi / defaultCourseId jika localStorage tidak tersedia
  }
  if (memoryLastCourseId && COURSE_BY_ID.has(memoryLastCourseId)) {
    return memoryLastCourseId;
  }
  return COURSE_BY_ID.has(defaultCourseId) ? defaultCourseId : skyCircuitCourse.id;
}

export function setLastCourseId(id: string): void {
  const validId = COURSE_BY_ID.has(id) ? id : getCourse(defaultCourseId).id;
  memoryLastCourseId = validId;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(CONFIG.storage.lastCourseKey, validId);
    }
  } catch {
    // Abaikan kegagalan penyimpanan jika mode privasi/terbatas
  }
}
