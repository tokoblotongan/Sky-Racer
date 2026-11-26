// src/render/fantasy/floatingIslands.ts

import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { ResolvedDecorPlacement } from '../../courses/fantasyLandDecor';
import {
  countGeometryTriangles,
  mergeNormalizedGeometries,
  setGeometrySwatch,
  SWATCH,
  type FantasyDecorMaterials,
  type FantasyDecorModule,
} from './decorMaterials';

interface IslandNode {
  container: THREE.Group;
  baseY: number;
  phase: number;
  bobAmp: number;
}

export function buildFloatingIslandsLandmark(
  placements: readonly ResolvedDecorPlacement[],
  mats: FantasyDecorMaterials,
  shadowsEnabled: boolean,
  quality: 'high' | 'medium' | 'mobile',
  safeMode = false,
): FantasyDecorModule {
  const group = new THREE.Group();
  group.name = 'FantasyFloatingIslandsGroup';

  const isMobile = quality === 'mobile' || safeMode;
  const parts: THREE.BufferGeometry[] = [];

  // Rocky tapered underside + lush grass cap + mini trees/crystal rock
  const rockCone = new THREE.ConeGeometry(9.6, 13.5, isMobile ? 7 : 11);
  rockCone.rotateX(Math.PI);
  rockCone.translate(0, -6.75, 0);
  parts.push(setGeometrySwatch(rockCone, SWATCH.ISLAND_ROCK));

  const rockSpur = new THREE.ConeGeometry(4.2, 8.0, 6);
  rockSpur.rotateX(Math.PI);
  rockSpur.translate(3.4, -7.2, -2.5);
  parts.push(setGeometrySwatch(rockSpur, SWATCH.ISLAND_ROCK));

  const grassCap = new THREE.CylinderGeometry(10.2, 9.6, 2.2, isMobile ? 8 : 14);
  grassCap.translate(0, 0.8, 0);
  parts.push(setGeometrySwatch(grassCap, SWATCH.ISLAND_GRASS));

  const treeOffsets = isMobile
    ? [{ x: -3.2, z: -1.8, h: 4.5 }]
    : [
        { x: -3.6, z: -2.0, h: 5.0 },
        { x: 2.8, z: -3.1, h: 4.2 },
        { x: -1.2, z: 3.4, h: 3.8 },
      ];
  for (let i = 0; i < treeOffsets.length; i++) {
    const t = treeOffsets[i];
    const trunk = new THREE.CylinderGeometry(0.35, 0.5, t.h * 0.55, 6);
    trunk.translate(t.x, 1.9 + t.h * 0.25, t.z);
    parts.push(setGeometrySwatch(trunk, SWATCH.ISLAND_ROCK));

    const canopy = new THREE.ConeGeometry(1.9, t.h * 0.9, 7);
    canopy.translate(t.x, 2.2 + t.h * 0.72, t.z);
    parts.push(setGeometrySwatch(canopy, i % 2 === 0 ? SWATCH.ISLAND_TREE : SWATCH.TREE_ALT));
  }

  const islandGeom = mergeNormalizedGeometries(parts);
  const islandTris = countGeometryTriangles(islandGeom);

  const waterfallGeom = new THREE.PlaneGeometry(3.6, 24, 1, 4);
  waterfallGeom.translate(0, -11.4, 9.8);
  const waterfallTris = countGeometryTriangles(waterfallGeom);

  const nodes: IslandNode[] = [];
  let drawCalls = 0;
  let totalTriangles = 0;

  placements.forEach((p, idx) => {
    const nodeGroup = new THREE.Group();
    nodeGroup.position.set(p.position.x, p.position.y, p.position.z);
    nodeGroup.rotation.y = p.yaw;
    nodeGroup.scale.setScalar(p.spec.scale);

    const mesh = new THREE.Mesh(islandGeom, mats.paletteMat);
    mesh.castShadow = shadowsEnabled;
    mesh.receiveShadow = shadowsEnabled;
    nodeGroup.add(mesh);
    drawCalls++;
    totalTriangles += islandTris;

    if (!isMobile && p.spec.variant !== 'no-waterfall') {
      const wfMesh = new THREE.Mesh(waterfallGeom, mats.waterfallMat);
      wfMesh.renderOrder = 2;
      nodeGroup.add(wfMesh);
      drawCalls++;
      totalTriangles += waterfallTris;
    }

    group.add(nodeGroup);
    nodes.push({
      container: nodeGroup,
      baseY: p.position.y,
      phase: idx * 1.45,
      bobAmp: 1.4 + (idx % 2) * 0.5,
    });
  });

  const bobSpeed = CONFIG.fantasy.animSpeeds.islandBobSpeed;
  const wfScroll = CONFIG.fantasy.animSpeeds.waterfallScrollSpeed;

  return {
    group,
    update(timeSec: number, dt: number): void {
      if (!isMobile) {
        mats.waterfallTex.offset.y = (mats.waterfallTex.offset.y - dt * wfScroll) % 1;
      }
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        n.container.position.y = n.baseY + Math.sin(timeSec * bobSpeed + n.phase) * n.bobAmp;
      }
    },
    dispose(): void {
      islandGeom.dispose();
      waterfallGeom.dispose();
    },
    getTriangleCount(): number {
      return totalTriangles;
    },
    getDrawCallCount(): number {
      return drawCalls;
    },
  };
}
