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
    cameraPos?: THREE.Vector3,
    showNametags?: boolean,
  ) => void;
  applyPalette: (name: VisualPresetName) => void;
  swapPlayerDesign: (nextDesign: CarDesignId, playerState?: CarState, course?: Course) => void;
  dispose: () => void;
}

interface NametagResources {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  texture: THREE.CanvasTexture;
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
const _worldPosTmp = new THREE.Vector3();

function createNametagSprite(name: string, accentColor: string): NametagResources | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Dark rounded badge with rival color stripe
  const padX = 18;
  const padY = 10;
  const boxW = canvas.width - padX * 2;
  const boxH = canvas.height - padY * 2;
  const r = 12;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
  ctx.beginPath();
  ctx.moveTo(padX + r, padY);
  ctx.lineTo(padX + boxW - r, padY);
  ctx.quadraticCurveTo(padX + boxW, padY, padX + boxW, padY + r);
  ctx.lineTo(padX + boxW, padY + boxH - r);
  ctx.quadraticCurveTo(padX + boxW, padY + boxH, padX + boxW - r, padY + boxH);
  ctx.lineTo(padX + r, padY + boxH);
  ctx.quadraticCurveTo(padX, padY + boxH, padX, padY + boxH - r);
  ctx.lineTo(padX, padY + r);
  ctx.quadraticCurveTo(padX, padY, padX + r, padY);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Left color dot
  ctx.fillStyle = accentColor;
  ctx.beginPath();
  ctx.arc(padX + 24, canvas.height * 0.5, 7, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = '700 28px "Exo 2", "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFFDF7';
  ctx.fillText(name, padX + 42, canvas.height * 0.52);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.35, 0.58, 1);
  sprite.position.set(0, CONFIG.ai.nametag.heightOffsetMeters, 0);
  sprite.renderOrder = 6;
  sprite.name = `Nametag_${name}`;

  return { sprite, material, texture };
}

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
  const rivals = CONFIG.ai.rivals;
  const fleetGroup = new THREE.Group();
  fleetGroup.name = 'CarFleet';

  const visuals: CarVisual[] = [];
  const nametags: Array<NametagResources | null> = [];
  const allowNametags = count > 1 && graphicsPreset === 'penuh' && !isMobile;
  const maxNametagDistSq =
    CONFIG.ai.nametag.maxDistanceMeters * CONFIG.ai.nametag.maxDistanceMeters;

  function buildSlotVisual(slotIndex: number, designId: CarDesignId): CarVisual {
    const isOpponent = slotIndex > 0;
    const rival = isOpponent ? rivals[(slotIndex - 1) % rivals.length] : null;
    const colors = rival
      ? { body: rival.color, accent: rival.accent, stripe: rival.stripe }
      : count > 1
        ? palettes[slotIndex % palettes.length]
        : undefined;
    const visual = buildCarMesh({
      designId,
      colors,
      maxAnisotropy,
      presetName: currentPreset,
      graphicsPreset,
      isMobile,
      isOpponent,
    });
    visual.group.name = isOpponent
      ? `OpponentCar_${slotIndex}_${rival?.name ?? designId}`
      : `PlayerCar_${designId}`;
    return visual;
  }

  for (let i = 0; i < count; i++) {
    const rival = i > 0 ? rivals[(i - 1) % rivals.length] : null;
    const designId: CarDesignId =
      i === 0 ? currentPlayerDesign : rival ? rival.design : i % 2 === 1 ? 'wedge' : 'gt';
    const visual = buildSlotVisual(i, designId);
    visuals.push(visual);
    fleetGroup.add(visual.group);

    if (i > 0 && allowNametags && rival) {
      const tag = createNametagSprite(rival.name, rival.color);
      if (tag) {
        visual.group.add(tag.sprite);
      }
      nametags.push(tag);
    } else {
      nametags.push(null);
    }
  }

  function syncCarAt(
    index: number,
    car: CarState,
    targetCourse: Course,
    dt: number,
    outPlayerPose?: CarPose,
    cameraPos?: THREE.Vector3,
    showNametags = true,
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

    const tag = nametags[index];
    if (tag) {
      if (!showNametags || !cameraPos) {
        tag.sprite.visible = false;
      } else {
        _worldPosTmp.copy(poseTarget.position);
        tag.sprite.visible =
          _worldPosTmp.distanceToSquared(cameraPos) <= maxNametagDistSq;
      }
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
      syncCarAt(i, cars[i], targetCourse, 0, outPlayerPose, undefined, false);
    }
  }

  function updateFromCars(
    cars: readonly CarState[],
    targetCourse: Course,
    dt: number,
    outPlayerPose?: CarPose,
    cameraPos?: THREE.Vector3,
    showNametags = true,
  ): void {
    const n = Math.min(visuals.length, cars.length);
    for (let i = 0; i < n; i++) {
      syncCarAt(i, cars[i], targetCourse, dt, outPlayerPose, cameraPos, showNametags);
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
      syncCarAt(0, playerState, targetCourse, 0, undefined, undefined, false);
    } else {
      nextPlayer.group.position.copy(prevPos);
      nextPlayer.group.quaternion.copy(prevQuat);
    }
  }

  function dispose(): void {
    for (let i = 0; i < nametags.length; i++) {
      const tag = nametags[i];
      if (tag) {
        tag.sprite.parent?.remove(tag.sprite);
        tag.material.dispose();
        tag.texture.dispose();
      }
    }
    nametags.length = 0;

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
