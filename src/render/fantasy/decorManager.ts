// src/render/fantasy/decorManager.ts

import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { Course } from '../../core/course';
import { buildFantasyLandDecorPlan, type ResolvedDecorPlacement } from '../../courses/fantasyLandDecor';
import type { QualityLevel } from '../quality';
import { buildBalloonsLandmark } from './balloons';
import { buildCastleLandmark } from './castle';
import { buildCrystalsLandmark } from './crystals';
import { createFantasyDecorMaterials, type FantasyDecorModule } from './decorMaterials';
import { buildFerrisWheelLandmark } from './ferrisWheel';
import { buildFloatingIslandsLandmark } from './floatingIslands';
import { buildParkPropsLandmark } from './parkProps';
import { buildRainbowLandmark } from './rainbow';

export interface FantasyDecorStats {
  qualityTier: 'high' | 'medium' | 'mobile';
  drawCalls: number;
  triangles: number;
  materialCount: number;
  placementCount: number;
}

export interface FantasyDecorManager {
  group: THREE.Group;
  update: (cameraPos: THREE.Vector3, dt: number) => void;
  getExclusionCircles: () => Array<{ x: number; z: number; r: number }>;
  getStats: () => FantasyDecorStats;
  dispose: () => void;
}

interface ManagedModule {
  module: FantasyDecorModule;
  anchorPos: THREE.Vector3 | null;
  updateDistSq: number;
}

export function createFantasyDecorManager(
  course: Course,
  quality: QualityLevel,
  maxAnisotropy: number,
  safeMode = false,
): FantasyDecorManager {
  const group = new THREE.Group();
  group.name = 'FantasyDecorManagerGroup';

  const effectiveQuality: QualityLevel = safeMode ? 'mobile' : quality;
  const plan = buildFantasyLandDecorPlan(course, effectiveQuality);
  const tier = plan.quality;
  const shadowsEnabled = !safeMode && CONFIG.quality.levels[effectiveQuality].shadowsEnabled;
  const mats = createFantasyDecorMaterials(maxAnisotropy, safeMode);
  const updateDistSq = CONFIG.fantasy.updateDistance * CONFIG.fantasy.updateDistance;

  const byType = <T extends ResolvedDecorPlacement['spec']['type']>(type: T) =>
    plan.placements.filter((p) => p.spec.type === type);

  const managed: ManagedModule[] = [];
  const register = (mod: FantasyDecorModule, anchor: THREE.Vector3 | null): void => {
    group.add(mod.group);
    managed.push({
      module: mod,
      anchorPos: anchor,
      updateDistSq,
    });
  };

  const castlePlacements = byType('castle');
  if (castlePlacements.length > 0) {
    const c = castlePlacements[0];
    register(
      buildCastleLandmark(c, mats, shadowsEnabled),
      new THREE.Vector3(c.position.x, c.position.y, c.position.z),
    );
  }

  const crystalPlacements = byType('crystals');
  if (crystalPlacements.length > 0) {
    register(buildCrystalsLandmark(crystalPlacements, mats, shadowsEnabled), null);
  }

  const islandPlacements = byType('floatingIslands');
  if (islandPlacements.length > 0) {
    register(buildFloatingIslandsLandmark(islandPlacements, mats, shadowsEnabled, tier, safeMode), null);
  }

  const rainbowPlacements = byType('rainbow');
  if (rainbowPlacements.length > 0) {
    const r = rainbowPlacements[0];
    register(
      buildRainbowLandmark(r, mats, tier),
      new THREE.Vector3(r.position.x, r.position.y, r.position.z),
    );
  }

  const ferrisPlacements = byType('ferrisWheel');
  if (ferrisPlacements.length > 0) {
    const fw = ferrisPlacements[0];
    register(
      buildFerrisWheelLandmark(fw, mats, shadowsEnabled, tier),
      new THREE.Vector3(fw.position.x, fw.position.y, fw.position.z),
    );
  }

  const balloonPlacements = byType('balloons');
  if (balloonPlacements.length > 0) {
    register(buildBalloonsLandmark(balloonPlacements, mats, shadowsEnabled, tier), null);
  }

  const parkPropPlacements = byType('parkProps');
  if (parkPropPlacements.length > 0) {
    register(buildParkPropsLandmark(parkPropPlacements, mats, shadowsEnabled), null);
  }

  let elapsedSec = 0;

  function update(cameraPos: THREE.Vector3, dt: number): void {
    elapsedSec += dt;
    for (let i = 0; i < managed.length; i++) {
      const entry = managed[i];
      if (
        entry.anchorPos &&
        cameraPos.distanceToSquared(entry.anchorPos) > entry.updateDistSq
      ) {
        continue;
      }
      entry.module.update(elapsedSec, dt);
    }
  }

  function getExclusionCircles(): Array<{ x: number; z: number; r: number }> {
    const circles: Array<{ x: number; z: number; r: number }> = [];
    for (const p of plan.placements) {
      if (!p.isOverhead) {
        circles.push({ x: p.position.x, z: p.position.z, r: p.footprintRadius });
      } else if (p.legs) {
        for (const leg of p.legs) {
          circles.push({ x: leg.x, z: leg.z, r: leg.radius });
        }
      }
    }
    return circles;
  }

  function getStats(): FantasyDecorStats {
    let drawCalls = 0;
    let triangles = 0;
    for (const entry of managed) {
      drawCalls += entry.module.getDrawCallCount();
      triangles += entry.module.getTriangleCount();
    }
    return {
      qualityTier: tier,
      drawCalls,
      triangles,
      materialCount: mats.materialCount,
      placementCount: plan.placements.length,
    };
  }

  function dispose(): void {
    for (const entry of managed) {
      entry.module.dispose();
    }
    mats.dispose();
  }

  return {
    group,
    update,
    getExclusionCircles,
    getStats,
    dispose,
  };
}
