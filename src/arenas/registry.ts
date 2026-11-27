// src/arenas/registry.ts

import type { ArenaDefinition } from './types';

export interface ListArenasOptions {
  readonly includeComingSoon?: boolean;
}

export interface ArenaRegistry {
  registerArena: (arena: ArenaDefinition) => void;
  getArena: (id: string) => ArenaDefinition | undefined;
  listArenas: (options?: ListArenasOptions) => readonly ArenaDefinition[];
  hasArena: (id: string) => boolean;
}

export function createArenaRegistry(): ArenaRegistry {
  const arenasById = new Map<string, ArenaDefinition>();

  function registerArena(arena: ArenaDefinition): void {
    const id = arena.id.trim();
    if (!id) {
      throw new Error('ArenaDefinition requires a non-empty id.');
    }
    if (arenasById.has(id)) {
      throw new Error(`Duplicate arena id '${id}' in ArenaRegistry.`);
    }
    arenasById.set(id, arena);
  }

  function getArena(id: string): ArenaDefinition | undefined {
    return arenasById.get(id);
  }

  function hasArena(id: string): boolean {
    return arenasById.has(id);
  }

  function listArenas(options?: ListArenasOptions): readonly ArenaDefinition[] {
    const includeComingSoon = options?.includeComingSoon ?? true;
    const items: ArenaDefinition[] = [];
    arenasById.forEach((arena) => {
      if (includeComingSoon || !arena.comingSoon) {
        items.push(arena);
      }
    });
    items.sort((a, b) => {
      if (a.order !== b.order) {
        return a.order - b.order;
      }
      return a.id.localeCompare(b.id);
    });
    return items;
  }

  return {
    registerArena,
    getArena,
    listArenas,
    hasArena,
  };
}
