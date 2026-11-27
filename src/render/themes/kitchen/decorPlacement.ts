// src/render/themes/kitchen/decorPlacement.ts
// Deterministic zone decor & seeded fill-prop placement with strict dual-route clearance validation.

import * as THREE from 'three';
import {
  KITCHEN_FILL_CONFIG,
  KITCHEN_PROP_BASE_RADIUS,
  KITCHEN_ZONE_ANCHORS,
  KITCHEN_ZONE_PROPS,
  type KitchenPropPlacement,
  type KitchenPropType,
  type KitchenZoneAnchor,
  type KitchenZoneId,
} from '../../../arenas/kitchen/decorData';
import { CONFIG, type GraphicsPreset } from '../../../config';
import type { Course, Route } from '../../../core/course';
import type { DecorFootprint } from '../../../themes/types';
import { createSurfaceMaterial } from '../../materialFactory';
import type { CounterLayoutMetrics } from './counter';
import { buildPanLoopFrame, buildPotLid, buildPotTunnelShell, buildKettle } from './props/cookware';
import {
  buildFruitBowl,
  buildShaker,
  createCounterApplianceFillGeometries,
} from './props/food';
import { buildDishRack, buildFaucetArch, buildSinkBasin, buildSinkWater } from './props/sink';
import {
  buildSpiceArrowSign,
  buildSpiceShelvesBatch,
  createSpiceJarFillGeometry,
  type SpiceShelfSpec,
} from './props/spiceRack';
import {
  buildStoveBurnersBatch,
  buildStoveKnobBar,
  type StoveBurnerSpec,
} from './props/stove';
import {
  buildCheckeredFlagsBatch,
  buildPlateTower,
  createTablewareFillGeometries,
  type CheckeredFlagSpec,
} from './props/tableware';
import { buildCuttingBoardRamp, buildSpatula, buildWhisk } from './props/utensils';
import type { KitchenTexturePack } from './textures';
import type { ZoneVisibilityController } from './zoneVisibility';

interface RouteSampleXZ {
  readonly x: number;
  readonly z: number;
  readonly halfWidth: number;
}

interface PlacedPropRecord {
  readonly footprint: DecorFootprint;
  readonly prop: KitchenPropPlacement;
  readonly worldPos: THREE.Vector3;
  readonly rightXZ: THREE.Vector3;
  readonly tangentXZ: THREE.Vector3;
  readonly yawRad: number;
}

export interface KitchenDecorPlacementHandle {
  readonly group: THREE.Group;
  readonly footprints: readonly DecorFootprint[];
  readonly kettleSpoutPos: THREE.Vector3 | null;
  dispose: () => void;
}

const PRESET_RANK: Record<GraphicsPreset, number> = {
  hemat: 0,
  seimbang: 1,
  penuh: 2,
};

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function collectAllRouteSamplesXZ(course: Course): RouteSampleXZ[] {
  const out: RouteSampleXZ[] = [];
  for (const route of course.getAllRoutes()) {
    const samples = route.getSamples();
    for (let i = 0; i < samples.length; i += 2) {
      const f = samples[i];
      out.push({
        x: f.position.x,
        z: f.position.z,
        halfWidth: f.width * 0.5,
      });
    }
  }
  return out;
}

function passesTrackClearance(
  x: number,
  z: number,
  radius: number,
  clearanceMeters: number,
  routeSamples: readonly RouteSampleXZ[],
): boolean {
  for (let i = 0; i < routeSamples.length; i++) {
    const s = routeSamples[i];
    const minDist = s.halfWidth + clearanceMeters + radius;
    const dx = x - s.x;
    const dz = z - s.z;
    if (dx * dx + dz * dz < minDist * minDist) {
      return false;
    }
  }
  return true;
}

function passesPropSeparation(
  x: number,
  z: number,
  radius: number,
  minSep: number,
  existing: readonly DecorFootprint[],
): boolean {
  for (let i = 0; i < existing.length; i++) {
    const e = existing[i];
    if (e.isTrackStructure) continue;
    const req = radius + e.radius + minSep;
    const dx = x - e.x;
    const dz = z - e.z;
    if (dx * dx + dz * dz < req * req) {
      return false;
    }
  }
  return true;
}

function resolveRouteAnchor(
  course: Course,
  anchor: KitchenZoneAnchor,
): Route {
  return course.getRoute(anchor.routeId);
}

function resolvePlacementPlan(
  course: Course,
  metrics: CounterLayoutMetrics,
  graphicsPreset: GraphicsPreset,
): {
  zoneRecords: PlacedPropRecord[];
  fillItems: Array<{
    type: 'mug' | 'measuring-cup' | 'spice-jar' | 'toaster' | 'rolling-pin';
    pos: THREE.Vector3;
    rotation: number;
    scale: number;
    color: string;
    footprint: DecorFootprint;
  }>;
  allFootprints: DecorFootprint[];
} {
  const anchorMap = new Map<KitchenZoneId, KitchenZoneAnchor>();
  for (const a of KITCHEN_ZONE_ANCHORS) anchorMap.set(a.id, a);

  const routeSamples = collectAllRouteSamplesXZ(course);
  const clearanceMeters = CONFIG.kitchenDecor.clearanceMeters;
  const presetRank = PRESET_RANK[graphicsPreset];

  const zoneRecords: PlacedPropRecord[] = [];
  const allFootprints: DecorFootprint[] = [];

  for (const prop of KITCHEN_ZONE_PROPS) {
    if (prop.minPreset && PRESET_RANK[prop.minPreset] > presetRank) {
      continue;
    }
    const anchor = anchorMap.get(prop.zone);
    if (!anchor) continue;
    const route = resolveRouteAnchor(course, anchor);
    const frame = route.getFrameAt(anchor.baseS + prop.sOffset);

    const rightXZ = new THREE.Vector3(frame.right.x, 0, frame.right.z);
    if (rightXZ.lengthSq() < 1e-4) rightXZ.set(1, 0, 0);
    rightXZ.normalize();

    const tangentXZ = new THREE.Vector3(frame.tangent.x, 0, frame.tangent.z);
    if (tangentXZ.lengthSq() < 1e-4) tangentXZ.set(0, 0, -1);
    tangentXZ.normalize();

    const worldPos = new THREE.Vector3(
      frame.position.x + rightXZ.x * prop.lateralOffset,
      prop.yOffset ?? 0,
      frame.position.z + rightXZ.z * prop.lateralOffset,
    );
    const yawRad = Math.atan2(tangentXZ.x, tangentXZ.z) + prop.rotation;
    const radius = KITCHEN_PROP_BASE_RADIUS[prop.type] * prop.scale;

    const footprint: DecorFootprint = {
      id: prop.id,
      zone: prop.zone,
      x: worldPos.x,
      y: worldPos.y,
      z: worldPos.z,
      radius,
      isTrackStructure: Boolean(prop.isTrackStructure),
    };

    allFootprints.push(footprint);
    zoneRecords.push({
      footprint,
      prop,
      worldPos,
      rightXZ,
      tangentXZ,
      yawRad,
    });
  }

  // Deterministic seeded fill props between zones
  const targetFillCount = CONFIG.kitchenDecor.fillPropCounts[graphicsPreset];
  const fillItems: Array<{
    type: 'mug' | 'measuring-cup' | 'spice-jar' | 'toaster' | 'rolling-pin';
    pos: THREE.Vector3;
    rotation: number;
    scale: number;
    color: string;
    footprint: DecorFootprint;
  }> = [];

  const rand = mulberry32(KITCHEN_FILL_CONFIG.seed);
  const mainRoute = course.getRoute('main');
  const mainLen = mainRoute.getLength();
  const halfCounterW = metrics.counterW * 0.5 - 16;
  const halfCounterD = metrics.counterD * 0.5 - 16;

  // Candidate station indices along main route
  const candidateS: number[] = [];
  for (let s = 36; s < mainLen - 30; s += KITCHEN_FILL_CONFIG.sStepMeters) {
    candidateS.push(s);
  }

  let attempts = 0;
  const maxAttempts = candidateS.length * 6;
  let candidateIdx = 0;

  while (fillItems.length < targetFillCount && attempts < maxAttempts) {
    attempts++;
    const s = candidateS[candidateIdx % candidateS.length] + (rand() - 0.5) * 18;
    candidateIdx++;

    const frame = mainRoute.getFrameAt(s);
    const rightXZ = new THREE.Vector3(frame.right.x, 0, frame.right.z);
    if (rightXZ.lengthSq() < 1e-4) continue;
    rightXZ.normalize();

    const side = rand() > 0.5 ? 1 : -1;
    const lat = THREE.MathUtils.lerp(
      KITCHEN_FILL_CONFIG.minLateralOffset,
      KITCHEN_FILL_CONFIG.maxLateralOffset,
      rand(),
    );
    const x = frame.position.x + rightXZ.x * side * lat;
    const z = frame.position.z + rightXZ.z * side * lat;

    if (
      Math.abs(x - metrics.cx) > halfCounterW ||
      Math.abs(z - metrics.cz) > halfCounterD
    ) {
      continue;
    }

    const type =
      KITCHEN_FILL_CONFIG.allowedTypes[
        Math.floor(rand() * KITCHEN_FILL_CONFIG.allowedTypes.length)
      ];
    const scale = 0.88 + rand() * 0.42;
    const radius = KITCHEN_PROP_BASE_RADIUS[type] * scale;

    if (!passesTrackClearance(x, z, radius, clearanceMeters, routeSamples)) {
      continue;
    }
    if (
      !passesPropSeparation(
        x,
        z,
        radius,
        KITCHEN_FILL_CONFIG.minPropSeparationMeters,
        allFootprints,
      )
    ) {
      continue;
    }

    const color =
      KITCHEN_FILL_CONFIG.allowedColors[
        Math.floor(rand() * KITCHEN_FILL_CONFIG.allowedColors.length)
      ];
    const rotation = rand() * Math.PI * 2;
    const id = `fill-${type}-${fillItems.length}`;
    const footprint: DecorFootprint = {
      id,
      zone: 'fill',
      x,
      y: 0,
      z,
      radius,
      isTrackStructure: false,
    };
    allFootprints.push(footprint);
    fillItems.push({
      type,
      pos: new THREE.Vector3(x, 0, z),
      rotation,
      scale,
      color,
      footprint,
    });
  }

  return { zoneRecords, fillItems, allFootprints };
}

export function computeKitchenDecorFootprints(
  course: Course,
  graphicsPreset: GraphicsPreset = 'penuh',
): readonly DecorFootprint[] {
  const metrics = {
    cx: course.getBounds().center.x,
    cz: course.getBounds().center.z,
    counterW: Math.ceil((course.getBounds().max.x - course.getBounds().min.x + 124) / 20) * 20,
    counterD: Math.ceil((course.getBounds().max.z - course.getBounds().min.z + 124) / 20) * 20,
    roomW: 0,
    roomD: 0,
    floorY: -34,
  };
  return resolvePlacementPlan(course, metrics, graphicsPreset).allFootprints;
}

export function buildKitchenDecorPlacement(
  course: Course,
  metrics: CounterLayoutMetrics,
  textures: KitchenTexturePack,
  visibility: ZoneVisibilityController,
  graphicsPreset: GraphicsPreset,
  receiveShadows: boolean,
  castShadows: boolean,
): KitchenDecorPlacementHandle {
  const root = new THREE.Group();
  root.name = 'KitchenDecorGroup';

  const disposers: Array<() => void> = [];
  const plan = resolvePlacementPlan(course, metrics, graphicsPreset);

  // Create per-zone groups so ZoneVisibilityController can cull distant zones cleanly
  const zoneGroups = new Map<KitchenZoneId, THREE.Group>();
  for (const anchor of KITCHEN_ZONE_ANCHORS) {
    const zg = new THREE.Group();
    zg.name = `KitchenZone_${anchor.id}`;
    zoneGroups.set(anchor.id, zg);
    root.add(zg);

    const route = resolveRouteAnchor(course, anchor);
    const centerFrame = route.getFrameAt(anchor.centerS);
    visibility.registerZone(anchor.id, zg, centerFrame.position, 95);
  }

  let kettleSpoutPos: THREE.Vector3 | null = null;
  const mainRoute = course.getRoute('main');
  const checkeredFlags: CheckeredFlagSpec[] = [];
  const stoveBurners: StoveBurnerSpec[] = [];
  let stoveBurnerColors: { base: string; glow: string } | null = null;
  const spiceShelves: SpiceShelfSpec[] = [];

  for (const rec of plan.zoneRecords) {
    const { prop, worldPos, rightXZ, yawRad } = rec;
    const zg = zoneGroups.get(prop.zone);
    if (!zg) continue;
    const secondary = prop.secondaryColor ?? '#FFFFFF';

    switch (prop.type as KitchenPropType) {
      case 'checkered-flag': {
        checkeredFlags.push({
          pos: worldPos,
          rotation: yawRad,
          scale: prop.scale,
          poleColor: prop.color,
        });
        break;
      }
      case 'salt-shaker':
      case 'pepper-shaker': {
        const h = buildShaker(
          prop.id,
          worldPos,
          yawRad,
          prop.scale,
          prop.color,
          secondary,
          graphicsPreset,
          receiveShadows,
          castShadows,
        );
        zg.add(h.group);
        disposers.push(h.dispose);
        break;
      }
      case 'fruit-bowl': {
        const h = buildFruitBowl(
          worldPos,
          yawRad,
          prop.scale,
          prop.color,
          secondary,
          graphicsPreset,
          receiveShadows,
          castShadows,
        );
        zg.add(h.group);
        disposers.push(h.dispose);
        break;
      }
      case 'cutting-board-ramp': {
        const h = buildCuttingBoardRamp(
          mainRoute,
          357,
          385.5,
          prop.color,
          secondary,
          graphicsPreset,
          receiveShadows,
          castShadows,
        );
        zg.add(h.group);
        disposers.push(h.dispose);
        break;
      }
      case 'spatula': {
        const h = buildSpatula(
          worldPos,
          yawRad,
          prop.scale,
          prop.color,
          secondary,
          graphicsPreset,
          receiveShadows,
          castShadows,
        );
        zg.add(h.group);
        disposers.push(h.dispose);
        break;
      }
      case 'whisk': {
        const h = buildWhisk(
          worldPos,
          yawRad,
          prop.scale,
          prop.color,
          secondary,
          graphicsPreset,
          receiveShadows,
          castShadows,
        );
        zg.add(h.group);
        disposers.push(h.dispose);
        break;
      }
      case 'pot-tunnel-shell': {
        const h = buildPotTunnelShell(
          mainRoute,
          575.5,
          704.5,
          textures.polkaDotEnamel,
          graphicsPreset,
          receiveShadows,
          castShadows,
        );
        zg.add(h.group);
        disposers.push(h.dispose);
        break;
      }
      case 'kettle': {
        const h = buildKettle(
          worldPos,
          yawRad,
          prop.scale,
          prop.color,
          secondary,
          graphicsPreset,
          receiveShadows,
          castShadows,
        );
        kettleSpoutPos = h.spoutWorldPos;
        zg.add(h.group);
        disposers.push(h.dispose);
        break;
      }
      case 'pot-lid': {
        const h = buildPotLid(
          worldPos,
          yawRad,
          prop.scale,
          prop.color,
          secondary,
          graphicsPreset,
          receiveShadows,
          castShadows,
        );
        zg.add(h.group);
        disposers.push(h.dispose);
        break;
      }
      case 'pan-loop-frame': {
        const h = buildPanLoopFrame(
          mainRoute,
          825.0,
          963.3,
          prop.color,
          secondary,
          graphicsPreset,
          receiveShadows,
          castShadows,
        );
        zg.add(h.group);
        disposers.push(h.dispose);
        break;
      }
      case 'plate-tower': {
        const h = buildPlateTower(
          worldPos,
          yawRad,
          prop.scale,
          graphicsPreset,
          receiveShadows,
          castShadows,
        );
        zg.add(h.group);
        disposers.push(h.dispose);
        break;
      }
      case 'sink-basin': {
        const h = buildSinkBasin(
          worldPos,
          yawRad,
          prop.color,
          secondary,
          graphicsPreset,
          receiveShadows,
        );
        zg.add(h.group);
        disposers.push(h.dispose);
        break;
      }
      case 'sink-water': {
        const h = buildSinkWater(
          worldPos,
          yawRad,
          textures.waterSurface,
          graphicsPreset,
        );
        zg.add(h.group);
        disposers.push(h.dispose);
        break;
      }
      case 'faucet-arch': {
        const h = buildFaucetArch(
          worldPos,
          rightXZ,
          prop.color,
          secondary,
          graphicsPreset,
          receiveShadows,
          castShadows,
        );
        zg.add(h.group);
        disposers.push(h.dispose);
        break;
      }
      case 'dish-rack': {
        const h = buildDishRack(
          worldPos,
          yawRad,
          prop.scale,
          prop.color,
          graphicsPreset,
          receiveShadows,
          castShadows,
        );
        zg.add(h.group);
        disposers.push(h.dispose);
        break;
      }
      case 'stove-burner': {
        stoveBurners.push({
          pos: worldPos,
          rotation: yawRad,
          scale: prop.scale,
        });
        if (!stoveBurnerColors) {
          stoveBurnerColors = { base: prop.color, glow: secondary };
        }
        break;
      }
      case 'stove-knob-bar': {
        const h = buildStoveKnobBar(
          worldPos,
          yawRad,
          prop.scale,
          prop.color,
          graphicsPreset,
          receiveShadows,
        );
        zg.add(h.group);
        disposers.push(h.dispose);
        break;
      }
      case 'spice-shelf': {
        spiceShelves.push({
          pos: worldPos,
          rotation: yawRad,
          scale: prop.scale,
          shelfColor: prop.color,
          accentColor: secondary,
        });
        break;
      }
      case 'spice-arrow-sign': {
        const h = buildSpiceArrowSign(
          worldPos,
          yawRad,
          prop.scale,
          prop.color,
          secondary,
          textures.spiceArrowSign,
          graphicsPreset,
        );
        zg.add(h.group);
        disposers.push(h.dispose);
        break;
      }
      default:
        break;
    }
  }

  if (checkeredFlags.length > 0) {
    const startZg = zoneGroups.get('meja-start');
    if (startZg) {
      const h = buildCheckeredFlagsBatch(
        checkeredFlags,
        textures.checkeredFlag,
        graphicsPreset,
        castShadows,
      );
      startZg.add(h.group);
      disposers.push(h.dispose);
    }
  }

  if (stoveBurners.length > 0 && stoveBurnerColors) {
    const stoveZg = zoneGroups.get('tikungan-kompor');
    if (stoveZg) {
      const h = buildStoveBurnersBatch(
        stoveBurners,
        stoveBurnerColors.base,
        stoveBurnerColors.glow,
        graphicsPreset,
        receiveShadows,
      );
      stoveZg.add(h.group);
      disposers.push(h.dispose);
    }
  }

  if (spiceShelves.length > 0) {
    const spiceZg = zoneGroups.get('rute-pintas-rak-bumbu');
    if (spiceZg) {
      const h = buildSpiceShelvesBatch(
        spiceShelves,
        graphicsPreset,
        receiveShadows,
        castShadows,
      );
      spiceZg.add(h.group);
      disposers.push(h.dispose);
    }
  }

  // Batched InstancedMesh fill props (at most 5 draw calls for all 40 fill props)
  if (plan.fillItems.length > 0) {
    const fillGroup = new THREE.Group();
    fillGroup.name = 'KitchenFillPropsGroup';
    root.add(fillGroup);

    const tablewareGeoms = createTablewareFillGeometries();
    const applianceGeoms = createCounterApplianceFillGeometries();
    const spiceJarGeom = createSpiceJarFillGeometry();
    disposers.push(() => {
      tablewareGeoms.dispose();
      applianceGeoms.dispose();
      spiceJarGeom.dispose();
    });

    const fillMat = createSurfaceMaterial(graphicsPreset, {
      color: 0xffffff,
      roughness: 0.24,
      metalness: 0.08,
      clearcoat: 0.85,
      physical: true,
      fog: false,
    });
    disposers.push(() => fillMat.dispose());

    const geomByType: Record<
      'mug' | 'measuring-cup' | 'spice-jar' | 'toaster' | 'rolling-pin',
      THREE.BufferGeometry
    > = {
      mug: tablewareGeoms.mugGeom,
      'measuring-cup': tablewareGeoms.cupGeom,
      'spice-jar': spiceJarGeom,
      toaster: applianceGeoms.toasterGeom,
      'rolling-pin': applianceGeoms.rollingPinGeom,
    };

    const grouped = new Map<
      'mug' | 'measuring-cup' | 'spice-jar' | 'toaster' | 'rolling-pin',
      typeof plan.fillItems
    >();
    for (const item of plan.fillItems) {
      let arr = grouped.get(item.type);
      if (!arr) {
        arr = [];
        grouped.set(item.type, arr);
      }
      arr.push(item);
    }

    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const euler = new THREE.Euler();
    const col = new THREE.Color();

    grouped.forEach((items, type) => {
      const inst = new THREE.InstancedMesh(geomByType[type], fillMat, items.length);
      inst.name = `KitchenFill_${type}`;
      inst.castShadow = castShadows;
      inst.receiveShadow = receiveShadows;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        euler.set(0, it.rotation, 0);
        q.setFromEuler(euler);
        s.setScalar(it.scale);
        mtx.compose(it.pos, q, s);
        inst.setMatrixAt(i, mtx);
        col.set(it.color);
        inst.setColorAt(i, col);
      }
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.computeBoundingSphere();
      inst.updateMatrix();
      inst.matrixAutoUpdate = false;
      fillGroup.add(inst);
      disposers.push(() => inst.dispose());
    });
  }

  return {
    group: root,
    footprints: plan.allFootprints,
    kettleSpoutPos,
    dispose(): void {
      for (const fn of disposers) fn();
    },
  };
}
