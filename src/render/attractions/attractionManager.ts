// src/render/attractions/attractionManager.ts

import * as THREE from 'three';
import type { GraphicsPreset } from '../../config';
import type { AttractionSystem } from '../../core/attractions';
import type { Course } from '../../core/course';
import type { QualityLevel } from '../quality';
import { createBoostRingsVisuals, type BoostRingsVisualGroup } from './boostRings';
import { createJellyPuddleVisuals, type JellyPuddleVisualGroup } from './jellyPuddle';
import { createPendulumVisuals, type PendulumVisualGroup } from './pendulum';
import { createRollingBallsVisuals, type RollingBallsVisualGroup } from './rollingBalls';
import { createTelegraphVisuals, type TelegraphVisualGroup } from './telegraph';
import { createWindFanVisuals, type WindFanVisualGroup } from './windFan';

export interface AttractionManager {
  readonly group: THREE.Group;
  update: (attractions: AttractionSystem, playerPos: THREE.Vector3) => void;
  setQuality: (preset: GraphicsPreset, quality: QualityLevel) => void;
  setEnabled: (enabled: boolean) => void;
  dispose: () => void;
}

export function createAttractionManager(
  scene: THREE.Scene,
  course: Course,
  attractions: AttractionSystem,
  preset: GraphicsPreset,
  quality: QualityLevel,
): AttractionManager {
  const group = new THREE.Group();
  group.name = 'FantasyLandAttractionsRoot';
  scene.add(group);

  let pendulumVis: PendulumVisualGroup | null = null;
  let ballsVis: RollingBallsVisualGroup | null = null;
  let windVis: WindFanVisualGroup | null = null;
  let jellyVis: JellyPuddleVisualGroup | null = null;
  let ringVis: BoostRingsVisualGroup | null = null;
  let telegraphVis: TelegraphVisualGroup | null = null;

  if (attractions.plan.enabledForCourse) {
    const defaultSkin = attractions.plan.skin ?? 'default';
    const pendulumSkin = attractions.plan.pendulums[0]?.skin ?? defaultSkin;
    const ballsSkin = attractions.plan.ballGroups[0]?.skin ?? defaultSkin;
    const windSkin = attractions.plan.windFans[0]?.skin ?? defaultSkin;
    const jellySkin = attractions.plan.jellyPuddles[0]?.skin ?? defaultSkin;
    const ringSkin = attractions.plan.boostRings[0]?.skin ?? defaultSkin;

    pendulumVis = createPendulumVisuals(preset, pendulumSkin);
    ballsVis = createRollingBallsVisuals(attractions.getBallGroups(), preset, ballsSkin);
    windVis = createWindFanVisuals(attractions.getWindFans(), preset, quality, windSkin);
    jellyVis = createJellyPuddleVisuals(course, attractions.getJellyPuddles(), preset, jellySkin);
    ringVis = createBoostRingsVisuals(attractions.plan.boostRings, preset, ringSkin);
    telegraphVis = createTelegraphVisuals(course, defaultSkin);

    group.add(
      telegraphVis.group,
      pendulumVis.group,
      ballsVis.group,
      windVis.group,
      jellyVis.group,
      ringVis.group,
    );
  }

  let enabled = attractions.getEnabled();

  const update = (liveAttractions: AttractionSystem, playerPos: THREE.Vector3): void => {
    if (!liveAttractions.plan.enabledForCourse) {
      group.visible = false;
      return;
    }
    const active = liveAttractions.getEnabled();
    if (active !== enabled) {
      enabled = active;
    }
    group.visible = enabled;
    if (!enabled) {
      return;
    }

    telegraphVis?.update(liveAttractions, playerPos);
    pendulumVis?.update(liveAttractions.getPendulums(), playerPos);
    ballsVis?.update(liveAttractions.getBallGroups(), playerPos);
    windVis?.update(liveAttractions.getWindFans(), liveAttractions.getTimeSec(), playerPos);
    jellyVis?.update(liveAttractions.getJellyPuddles(), playerPos);
    ringVis?.update(liveAttractions.getBoostRings(), playerPos);
  };

  const setQuality = (nextPreset: GraphicsPreset, nextQuality: QualityLevel): void => {
    pendulumVis?.setQuality(nextPreset);
    ballsVis?.setQuality(nextPreset);
    windVis?.setQuality(nextPreset, nextQuality);
    jellyVis?.setQuality(nextPreset);
    ringVis?.setQuality(nextPreset);
  };

  const setEnabled = (nextEnabled: boolean): void => {
    enabled = nextEnabled;
    group.visible = nextEnabled && attractions.plan.enabledForCourse;
  };

  const dispose = (): void => {
    scene.remove(group);
    pendulumVis?.dispose();
    ballsVis?.dispose();
    windVis?.dispose();
    jellyVis?.dispose();
    ringVis?.dispose();
    telegraphVis?.dispose();
    pendulumVis = null;
    ballsVis = null;
    windVis = null;
    jellyVis = null;
    ringVis = null;
    telegraphVis = null;
  };

  return {
    group,
    update,
    setQuality,
    setEnabled,
    dispose,
  };
}
