// src/render/themes/kitchen/index.ts
// Assembles the complete Stage K2 Kitchen theme: textures, counter, backdrop, zone decor,
// seeded fill props, kettle steam, zone visibility culling, and water UV scroll.

import * as THREE from 'three';
import { CONFIG, type GraphicsPreset, type VisualPresetName } from '../../../config';
import type {
  DecorFootprint,
  ThemeDefinition,
  ThemeSceneryContext,
  ThemeSceneryHandle,
} from '../../../themes/types';
import { buildKitchenBackdrop } from './backdrop';
import { buildKitchenCounter, computeKitchenLayoutMetrics } from './counter';
import { buildKitchenDecorPlacement, computeKitchenDecorFootprints } from './decorPlacement';
import { createKettleSteamSystem, type SteamSystemHandle } from './steam';
import { createKitchenTextures } from './textures';
import { createZoneVisibilityController } from './zoneVisibility';

export function buildKitchenScenery(
  themeDef: ThemeDefinition,
  context: ThemeSceneryContext,
): ThemeSceneryHandle {
  const group = new THREE.Group();
  group.name = 'KitchenScenery';

  const effectivePreset: GraphicsPreset = context.graphicsPreset ?? 'penuh';
  const isSafePreset = effectivePreset === 'hemat';
  const qualityPreset = CONFIG.quality.levels[isSafePreset ? 'mobile' : context.quality];
  const castShadows = effectivePreset === 'penuh' && qualityPreset.shadowsEnabled;
  const receiveShadows = effectivePreset === 'seimbang' || castShadows;
  const effectiveAnisotropy = isSafePreset
    ? Math.min(2, context.maxAnisotropy)
    : context.maxAnisotropy;

  const metrics = computeKitchenLayoutMetrics(context.course);
  const counterTileMeters = 28;
  const floorTileMeters = 26;
  const skyColors =
    context.presetName === 'pastel'
      ? themeDef.background.params.pastel
      : themeDef.background.params.vivid;

  const textures = createKitchenTextures(
    effectiveAnisotropy,
    Math.max(8, Math.round(metrics.counterW / counterTileMeters)),
    Math.max(8, Math.round(metrics.counterD / counterTileMeters)),
    Math.max(10, Math.round(metrics.roomW / floorTileMeters)),
    Math.max(10, Math.round(metrics.roomD / floorTileMeters)),
    skyColors.skyTop,
    skyColors.skyHorizon,
  );

  // 1. Always-visible counter tabletop, edge trim, lower floor & track stanchions
  const counter = buildKitchenCounter(
    context.course,
    textures,
    effectivePreset,
    receiveShadows,
    castShadows,
  );
  group.add(counter.group);

  // 2. Always-visible kitchen backdrop (walls, backsplash, blue/yellow cabinets, sunny window)
  const backdrop = buildKitchenBackdrop(metrics, textures, effectivePreset, receiveShadows);
  group.add(backdrop.group);

  // 3. Zone decor & deterministic seeded fill props + visibility controller
  const visibility = createZoneVisibilityController();
  const decor = buildKitchenDecorPlacement(
    context.course,
    metrics,
    textures,
    visibility,
    effectivePreset,
    receiveShadows,
    castShadows,
  );
  group.add(decor.group);

  // 4. Instanced kettle steam puffs near Terowongan Panci (0 on hemat, scaled on seimbang/penuh)
  let steam: SteamSystemHandle | null = null;
  if (decor.kettleSpoutPos) {
    steam = createKettleSteamSystem(decor.kettleSpoutPos, textures.steamPuff, effectivePreset);
    const panciZone = decor.group.getObjectByName('KitchenZone_terowongan-panci');
    if (panciZone) {
      panciZone.add(steam.group);
    } else {
      group.add(steam.group);
    }
  }

  const scrollWater = effectivePreset !== 'hemat';
  const waterSpeed = CONFIG.kitchenDecor.waterScrollSpeed;

  return {
    id: themeDef.id,
    group,
    update(dt: number, cameraPos?: THREE.Vector3): void {
      visibility.update(cameraPos);
      if (scrollWater) {
        textures.waterSurface.offset.x = (textures.waterSurface.offset.x + dt * waterSpeed) % 1;
      }
      if (steam) {
        steam.update(dt);
      }
    },
    applyPalette(name: VisualPresetName): void {
      const nextSky =
        name === 'pastel' ? themeDef.background.params.pastel : themeDef.background.params.vivid;
      textures.updateSkyColors(nextSky.skyTop, nextSky.skyHorizon);
    },
    getGroundY(x: number, z: number): number {
      return counter.getGroundY(x, z);
    },
    dispose(): void {
      steam?.dispose();
      decor.dispose();
      backdrop.dispose();
      counter.dispose();
      textures.dispose();
    },
  };
}

export function getKitchenDecorFootprints(context: ThemeSceneryContext): readonly DecorFootprint[] {
  const effectivePreset: GraphicsPreset = context.graphicsPreset ?? 'penuh';
  return computeKitchenDecorFootprints(context.course, effectivePreset);
}
