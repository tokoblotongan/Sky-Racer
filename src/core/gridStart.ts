// src/core/gridStart.ts

import type { Course } from './course';
import { copyCarState, createCarState, respawnAt, type CarState } from './physics';

export function ensureCarsForCourse(cars: CarState[], course: Course): CarState[] {
  const targetCount = Math.max(1, course.getRacers());
  while (cars.length < targetCount) {
    cars.push(createCarState());
  }
  if (cars.length > targetCount) {
    cars.length = targetCount;
  }
  return cars;
}

export function applyGridStart(
  cars: CarState[],
  course: Course,
  prevCars?: CarState[],
): void {
  const count = Math.max(1, course.getRacers());
  ensureCarsForCourse(cars, course);
  const slots = course.getGridSlots(count);

  for (let i = 0; i < count; i++) {
    const slot = slots[i] ?? slots[slots.length - 1];
    const car = cars[i];
    respawnAt(car, course, slot.s, slot.lateral, 0, 0);
    car.wheelSpin = 0;
    car.worldVel.set(0, 0, 0);
    if (prevCars) {
      if (i >= prevCars.length) {
        prevCars.push(createCarState());
      }
      copyCarState(car, prevCars[i]);
    }
  }

  if (prevCars && prevCars.length > count) {
    prevCars.length = count;
  }
}

export function createGridCars(course: Course): CarState[] {
  const cars: CarState[] = [];
  applyGridStart(cars, course);
  return cars;
}
