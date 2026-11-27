// src/arenas/index.ts

import { createArenaRegistry, type ArenaRegistry } from './registry';

// ARENA-REGISTRY-START
import { skyCircuitArena } from './skyCircuit/definition';
import { fantasyLandArena } from './fantasyLand/definition';

import { kitchenArena } from './kitchen/definition';
import { bedroomArena } from './bedroom/definition';
export function registerDefaultArenas(registry: ArenaRegistry): ArenaRegistry {
  registry.registerArena(skyCircuitArena);
  registry.registerArena(fantasyLandArena);
  registry.registerArena(kitchenArena);
  registry.registerArena(bedroomArena);
  return registry;
}
// ARENA-REGISTRY-END

export function createDefaultArenaRegistry(): ArenaRegistry {
  return registerDefaultArenas(createArenaRegistry());
}

export { createArenaRegistry, type ArenaRegistry, type ListArenasOptions } from './registry';
export {
  arenaToCourseDefinition,
  resolveArenaCourseData,
  type ArenaAttractionsConfig,
  type ArenaBackgroundConfig,
  type ArenaBudgets,
  type ArenaCapabilities,
  type ArenaCourseData,
  type ArenaDefinition,
  type ArenaIntroCameraConfig,
  type ArenaMinimapConfig,
  type ArenaMode,
  type ArenaMusicConfig,
  type ArenaNamedZone,
  type ArenaStartBannerZone,
  type ArenaZonesConfig,
  type IntroCameraWaypointAnchor,
  type IntroCameraWaypointConfig,
} from './types';
