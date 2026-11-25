// src/courses/index.ts

import { skyCircuitCourse } from './skyCircuit';
import type { CourseDefinition } from './types';

export type {
  BoostPadSegmentConfig,
  CourseDefinition,
  CourseMedals,
  CourseSegmentConfig,
} from './types';

export const defaultCourseId = skyCircuitCourse.id;

const COURSES: readonly CourseDefinition[] = [skyCircuitCourse];

const COURSE_BY_ID = new Map<string, CourseDefinition>(
  COURSES.map((course) => [course.id, course]),
);

export function getCourse(id: string): CourseDefinition {
  return COURSE_BY_ID.get(id) ?? skyCircuitCourse;
}

export function listCourses(): readonly CourseDefinition[] {
  return COURSES;
}
