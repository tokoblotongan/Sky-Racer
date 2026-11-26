// src/render/carFleet.ts

import * as THREE from 'three';
import { CONFIG, type GraphicsPreset, type VisualPresetName } from '../config';
import type { Course } from '../core/course';
import { getCarPose, type CarPose, type CarState } from '../core/physics';
import { buildCarMesh, type CarVisual } from './car';
import type { CarDesignId } from './carDesigns';

export interface CreateCarFleetOptions {
  course: Course;
  playerDesignId: CarDesignId;
  maxAnisotropy: number;
  presetName: VisualPresetName;
  graphicsPreset: GraphicsPreset;
  isMobile: boolean;
}

export interface CarFleetVisual {
  group: THREE.Group;
  getCount: () => number;
  getPlayerVisual: () => CarVisual;
  snapFromCars: (cars: readonly CarState[], course: Course, outPlayerPose?: CarPose) => void;
  updateFromCars: (
    cars: readonly CarState[],
    course: Course,
    dt: number,
    outPlayerPose?: CarPose,
  ) => void;
  applyPalette: (name: VisualPresetName) => void;
  swapPlayerDesign: (nextDesign: CarDesignId, playerState?: CarState, course?: Course) => void;
  dispose: () => void;
}

const _pose: CarPose = {
  position: new THREE.Vector3(),
  tangent: new THREE.Vector3(),
  up: new THREE.Vector3(),
  right: new THREE.Vector3(),
  quaternion: new THREE.Quaternion(),
};
const _crashEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const _crashQuat = new THREE.Quaternion();

export function createCarFleet(options: CreateCarFleetOptions): CarFleetVisual {
  const {
    course,
    maxAnisotropy,
    graphicsPreset,
    isMobile,
  } = options;
  let currentPreset = options.presetName;
  let currentPlayerDesign = options.playerDesignId;

  const count = Math.max(1, course.getRacers());
  const palettes = CONFIG.car.visual.multiplayerPalettes;
  const fleetGroup = new THREE.Group();
  fleetGroup.name = 'CarFleet';

  const visuals: CarVisual[] = [];

  function buildSlotVisual(slotIndex: number, designId: CarDesignId): CarVisual {
    const isOpponent = slotIndex > 0;
    const colors = count > 1 ? palettes[slotIndex % palettes.length] : undefined;
    const visual = buildCarMesh({
      designId,
      colors,
      maxAnisotropy,
      presetName: currentPreset,
      graphicsPreset,
      isMobile,
      isOpponent,
    });
    visual.group.name = isOpponent ? `OpponentCar_${slotIndex}_${designId}` : `PlayerCar_${designId}`;
    return visual;
  }

  for (let i = 0; i < count; i++) {
    const designId: CarDesignId = i === 0 ? currentPlayerDesign : i % 2 === 1 ? 'wedge' : 'gt';
    const visual = buildSlotVisual(i, designId);
    visuals.push(visual);
    fleetGroup.add(visual.group);
  }

  function syncCarAt(
    index: number,
    car: CarState,
    targetCourse: Course,
    dt: number,
    outPlayerPose?: CarPose,
  ): void {
    const visual = visuals[index];
    if (!visual) {
      return;
    }
    const route = targetCourse.getRoute(car.routeId);
    const poseTarget = index === 0 && outPlayerPose ? outPlayerPose : _pose;
    getCarPose(car, route, poseTarget);
    visual.group.position.copy(poseTarget.position);
    visual.group.quaternion.copy(poseTarget.quaternion);

    if (
      car.crashed ||
      Math.abs(car.crashSpinAngle) > 1e-4 ||
      Math.abs(car.crashRollAngle) > 1e-4
    ) {
      _crashEuler.set(0, car.crashSpinAngle, car.crashRollAngle, 'YXZ');
      _crashQuat.setFromEuler(_crashEuler);
      visual.group.quaternion.multiply(_crashQuat);
    }

    visual.update(car, dt);
  }

  function snapFromCars(
    cars: readonly CarState[],
    targetCourse: Course,
    outPlayerPose?: CarPose,
  ): void {
    const n = Math.min(visuals.length, cars.length);
    for (let i = 0; i < n; i++) {
      syncCarAt(i, cars[i], targetCourse, 0, outPlayerPose);
    }
  }

  function updateFromCars(
    cars: readonly CarState[],
    targetCourse: Course,
    dt: number,
    outPlayerPose?: CarPose,
  ): void {
    const n = Math.min(visuals.length, cars.length);
    for (let i = 0; i < n; i++) {
      syncCarAt(i, cars[i], targetCourse, dt, outPlayerPose);
    }
  }

  function applyPalette(name: VisualPresetName): void {
    currentPreset = name;
    for (let i = 0; i < visuals.length; i++) {
      visuals[i].applyPalette(name);
    }
  }

  function swapPlayerDesign(
    nextDesign: CarDesignId,
    playerState?: CarState,
    targetCourse?: Course,
  ): void {
    currentPlayerDesign = nextDesign;
    const oldPlayer = visuals[0];
    if (!oldPlayer) {
      return;
    }
    const prevPos = oldPlayer.group.position.clone();
    const prevQuat = oldPlayer.group.quaternion.clone();
    fleetGroup.remove(oldPlayer.group);
    oldPlayer.dispose();

    const nextPlayer = buildSlotVisual(0, nextDesign);
    visuals[0] = nextPlayer;
    fleetGroup.add(nextPlayer.group);

    if (playerState && targetCourse) {
      syncCarAt(0, playerState, targetCourse, 0);
    } else {
      nextPlayer.group.position.copy(prevPos);
      nextPlayer.group.quaternion.copy(prevQuat);
    }
  }

  function dispose(): void {
    for (let i = 0; i < visuals.length; i++) {
      fleetGroup.remove(visuals[i].group);
      visuals[i].dispose();
    }
    visuals.length = 0;
  }

  return {
    group: fleetGroup,
    getCount: () => visuals.length,
    getPlayerVisual: () => visuals[0],
    snapFromCars,
    updateFromCars,
    applyPalette,
    swapPlayerDesign,
    dispose,
  };
}
