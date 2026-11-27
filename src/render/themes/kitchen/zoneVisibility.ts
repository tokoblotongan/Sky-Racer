// src/render/themes/kitchen/zoneVisibility.ts
// Distance-based zone group visibility controller with hysteresis to eliminate pop flicker.

import * as THREE from 'three';
import { CONFIG } from '../../../config';

export interface ZoneVisibilityEntry {
  readonly id: string;
  readonly group: THREE.Group;
  readonly anchorPos: THREE.Vector3;
  readonly radius: number;
  visible: boolean;
}

export interface ZoneVisibilityController {
  registerZone: (id: string, group: THREE.Group, anchorPos: THREE.Vector3, radius: number) => void;
  update: (cameraPos?: THREE.Vector3) => void;
}

export function createZoneVisibilityController(): ZoneVisibilityController {
  const entries: ZoneVisibilityEntry[] = [];
  const baseRange = CONFIG.kitchenDecor.zoneVisibleMeters;
  const hysteresis = CONFIG.kitchenDecor.zoneVisibleHysteresisMeters;

  return {
    registerZone(id: string, group: THREE.Group, anchorPos: THREE.Vector3, radius: number): void {
      entries.push({
        id,
        group,
        anchorPos: anchorPos.clone(),
        radius: Math.max(0, radius),
        visible: true,
      });
    },
    update(cameraPos?: THREE.Vector3): void {
      if (!cameraPos) return;
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const dx = cameraPos.x - entry.anchorPos.x;
        const dy = cameraPos.y - entry.anchorPos.y;
        const dz = cameraPos.z - entry.anchorPos.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        const threshold = baseRange + entry.radius + (entry.visible ? hysteresis : -hysteresis);
        const nextVisible = distSq <= threshold * threshold;
        if (nextVisible !== entry.visible) {
          entry.visible = nextVisible;
          entry.group.visible = nextVisible;
        }
      }
    },
  };
}
