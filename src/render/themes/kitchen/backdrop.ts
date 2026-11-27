// src/render/themes/kitchen/backdrop.ts
// Always-visible kitchen room shell: bright walls, tile backsplash, blue & yellow wall cabinets,
// and huge sunny kitchen window with sky gradient, clouds, and curtains (no fog).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GraphicsPreset } from '../../../config';
import { createSurfaceMaterial } from '../../materialFactory';
import type { CounterLayoutMetrics } from './counter';
import type { KitchenTexturePack } from './textures';

export interface KitchenBackdropHandle {
  readonly group: THREE.Group;
  dispose: () => void;
}

function mergeNormalized(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const prepared = geoms.map((g) => {
    const nonIdx = g.index ? g.toNonIndexed() : g.clone();
    if (!nonIdx.getAttribute('normal')) nonIdx.computeVertexNormals();
    if (!nonIdx.getAttribute('uv')) {
      const pos = nonIdx.getAttribute('position');
      nonIdx.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
    }
    return nonIdx;
  });
  const merged = mergeGeometries(prepared, false);
  for (const g of geoms) g.dispose();
  for (const g of prepared) g.dispose();
  if (!merged) return new THREE.BoxGeometry(1, 1, 1);
  merged.computeBoundingSphere();
  return merged;
}

function freezeStatic(obj: THREE.Object3D): void {
  obj.updateMatrix();
  obj.matrixAutoUpdate = false;
}

export function buildKitchenBackdrop(
  metrics: CounterLayoutMetrics,
  textures: KitchenTexturePack,
  graphicsPreset: GraphicsPreset,
  receiveShadows: boolean,
): KitchenBackdropHandle {
  const group = new THREE.Group();
  group.name = 'KitchenBackdrop';

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const { cx, cz, roomW, roomD, floorY } = metrics;
  const halfRoomW = roomW * 0.5;
  const halfRoomD = roomD * 0.5;
  const wallT = 6;
  const wallTopY = 178;
  const wallTotalH = wallTopY - floorY;
  const wallCenterY = floorY + wallTotalH * 0.5;

  const backZ = cz - halfRoomD;
  const frontZ = cz + halfRoomD;
  const leftX = cx - halfRoomW;
  const rightX = cx + halfRoomW;

  // 1. Bright Kitchen Perimeter Walls
  const wallGeoms: THREE.BufferGeometry[] = [];
  const backWall = new THREE.BoxGeometry(roomW + wallT * 2, wallTotalH, wallT);
  backWall.translate(cx, wallCenterY, backZ);
  wallGeoms.push(backWall);

  const frontWall = new THREE.BoxGeometry(roomW + wallT * 2, wallTotalH, wallT);
  frontWall.translate(cx, wallCenterY, frontZ);
  wallGeoms.push(frontWall);

  const leftWall = new THREE.BoxGeometry(wallT, wallTotalH, roomD + wallT * 2);
  leftWall.translate(leftX, wallCenterY, cz);
  wallGeoms.push(leftWall);

  const rightWall = new THREE.BoxGeometry(wallT, wallTotalH, roomD + wallT * 2);
  rightWall.translate(rightX, wallCenterY, cz);
  wallGeoms.push(rightWall);

  const wallsGeom = mergeNormalized(wallGeoms);
  geometries.push(wallsGeom);
  const wallMat = createSurfaceMaterial(graphicsPreset, {
    color: '#F8FAFC',
    roughness: 0.8,
    metalness: 0.0,
    fog: false,
  });
  materials.push(wallMat);
  const wallsMesh = new THREE.Mesh(wallsGeom, wallMat);
  wallsMesh.name = 'KitchenWalls';
  wallsMesh.receiveShadow = receiveShadows;
  freezeStatic(wallsMesh);
  group.add(wallsMesh);

  // 2. White-and-Teal Tile Backsplash Band along all four walls above counter level
  const tileH = 54;
  const tileY = tileH * 0.5;
  const tileGeoms: THREE.BufferGeometry[] = [];
  const tileBack = new THREE.PlaneGeometry(roomW, tileH);
  tileBack.translate(cx, tileY, backZ + wallT * 0.5 + 0.5);
  tileGeoms.push(tileBack);

  const tileFront = new THREE.PlaneGeometry(roomW, tileH);
  tileFront.rotateY(Math.PI);
  tileFront.translate(cx, tileY, frontZ - wallT * 0.5 - 0.5);
  tileGeoms.push(tileFront);

  const tileLeft = new THREE.PlaneGeometry(roomD, tileH);
  tileLeft.rotateY(Math.PI * 0.5);
  tileLeft.translate(leftX + wallT * 0.5 + 0.5, tileY, cz);
  tileGeoms.push(tileLeft);

  const tileRight = new THREE.PlaneGeometry(roomD, tileH);
  tileRight.rotateY(-Math.PI * 0.5);
  tileRight.translate(rightX - wallT * 0.5 - 0.5, tileY, cz);
  tileGeoms.push(tileRight);

  const tileGeom = mergeNormalized(tileGeoms);
  geometries.push(tileGeom);
  const tileMat = createSurfaceMaterial(graphicsPreset, {
    map: textures.backsplashTile,
    roughness: 0.35,
    metalness: 0.04,
    fog: false,
  });
  materials.push(tileMat);
  const tileMesh = new THREE.Mesh(tileGeom, tileMat);
  tileMesh.name = 'KitchenBacksplash';
  tileMesh.receiveShadow = receiveShadows;
  freezeStatic(tileMesh);
  group.add(tileMesh);

  // 3. Huge Kitchen Window on the Back Wall (-Z) with Sky, Clouds, Frame & Bright Curtains
  const windowW = 340;
  const windowH = 122;
  const windowCenterY = 98;
  const windowZ = backZ + wallT * 0.5 + 1.2;

  const skyPaneGeom = new THREE.PlaneGeometry(windowW, windowH);
  geometries.push(skyPaneGeom);
  const skyPaneMat = new THREE.MeshBasicMaterial({
    map: textures.windowSky,
    fog: false,
  });
  materials.push(skyPaneMat);
  const skyPaneMesh = new THREE.Mesh(skyPaneGeom, skyPaneMat);
  skyPaneMesh.name = 'KitchenWindowSky';
  skyPaneMesh.position.set(cx, windowCenterY, windowZ);
  freezeStatic(skyPaneMesh);
  group.add(skyPaneMesh);

  const frameThick = 6;
  const frameDepth = 4.5;
  const frameGeoms: THREE.BufferGeometry[] = [];
  const topBar = new THREE.BoxGeometry(windowW + frameThick * 2, frameThick, frameDepth);
  topBar.translate(cx, windowCenterY + windowH * 0.5 + frameThick * 0.5, windowZ + 1.4);
  frameGeoms.push(topBar);
  const sillBar = new THREE.BoxGeometry(windowW + frameThick * 2 + 12, frameThick * 1.4, frameDepth + 6);
  sillBar.translate(cx, windowCenterY - windowH * 0.5 - frameThick * 0.7, windowZ + 2.5);
  frameGeoms.push(sillBar);
  const leftBar = new THREE.BoxGeometry(frameThick, windowH, frameDepth);
  leftBar.translate(cx - windowW * 0.5 - frameThick * 0.5, windowCenterY, windowZ + 1.4);
  frameGeoms.push(leftBar);
  const rightBar = new THREE.BoxGeometry(frameThick, windowH, frameDepth);
  rightBar.translate(cx + windowW * 0.5 + frameThick * 0.5, windowCenterY, windowZ + 1.4);
  frameGeoms.push(rightBar);
  const midVert = new THREE.BoxGeometry(3.4, windowH, 2.5);
  midVert.translate(cx, windowCenterY, windowZ + 1.0);
  frameGeoms.push(midVert);
  const midHoriz = new THREE.BoxGeometry(windowW, 3.4, 2.5);
  midHoriz.translate(cx, windowCenterY, windowZ + 1.0);
  frameGeoms.push(midHoriz);

  const frameMat = createSurfaceMaterial(graphicsPreset, {
    color: '#FFFFFF',
    roughness: 0.38,
    metalness: 0.04,
    fog: false,
  });
  materials.push(frameMat);

  // Bright Magenta Curtains flanking the window
  const curtainGeoms: THREE.BufferGeometry[] = [];
  const curtainW = 36;
  const curtainH = windowH + 14;
  for (const side of [-1, 1] as const) {
    const baseX = cx + side * (windowW * 0.5 - curtainW * 0.28);
    for (let fold = -1; fold <= 1; fold++) {
      const pleat = new THREE.CylinderGeometry(5.5, 7.2, curtainH, 8);
      pleat.translate(baseX + fold * 9, windowCenterY - 2, windowZ + 5.5);
      curtainGeoms.push(pleat);
    }
  }
  const curtainGeom = mergeNormalized(curtainGeoms);
  geometries.push(curtainGeom);
  const curtainMat = createSurfaceMaterial(graphicsPreset, {
    color: '#EC4899',
    roughness: 0.65,
    metalness: 0.0,
    fog: false,
  });
  materials.push(curtainMat);
  const curtainMesh = new THREE.Mesh(curtainGeom, curtainMat);
  curtainMesh.name = 'KitchenWindowCurtains';
  freezeStatic(curtainMesh);
  group.add(curtainMesh);

  // 4. Flat Bright Wall Cabinets (Blue and Yellow) with Crisp White Handles
  const blueCabGeoms: THREE.BufferGeometry[] = [];
  const yellowCabGeoms: THREE.BufferGeometry[] = [];

  const addCabinetRow = (
    count: number,
    wallAxis: 'back' | 'left' | 'right',
    startCoord: number,
    step: number,
    cabW: number,
    cabH: number,
    cabD: number,
    yCenter: number,
  ): void => {
    for (let i = 0; i < count; i++) {
      const along = startCoord + i * step;
      const isBlue = i % 2 === 0;
      const targetList = isBlue ? blueCabGeoms : yellowCabGeoms;

      if (wallAxis === 'back') {
        const box = new THREE.BoxGeometry(cabW, cabH, cabD);
        box.translate(along, yCenter, backZ + wallT * 0.5 + cabD * 0.5);
        targetList.push(box);
        const hdl = new THREE.BoxGeometry(3.2, 12, 2.2);
        hdl.translate(along - cabW * 0.25, yCenter - cabH * 0.18, backZ + wallT * 0.5 + cabD + 1.1);
        frameGeoms.push(hdl);
      } else if (wallAxis === 'left') {
        const box = new THREE.BoxGeometry(cabD, cabH, cabW);
        box.translate(leftX + wallT * 0.5 + cabD * 0.5, yCenter, along);
        targetList.push(box);
        const hdl = new THREE.BoxGeometry(2.2, 12, 3.2);
        hdl.translate(leftX + wallT * 0.5 + cabD + 1.1, yCenter - cabH * 0.18, along - cabW * 0.25);
        frameGeoms.push(hdl);
      } else {
        const box = new THREE.BoxGeometry(cabD, cabH, cabW);
        box.translate(rightX - wallT * 0.5 - cabD * 0.5, yCenter, along);
        targetList.push(box);
        const hdl = new THREE.BoxGeometry(2.2, 12, 3.2);
        hdl.translate(rightX - wallT * 0.5 - cabD - 1.1, yCenter - cabH * 0.18, along + cabW * 0.25);
        frameGeoms.push(hdl);
      }
    }
  };

  // Cabinets flanking back window, and running along left/right kitchen walls
  addCabinetRow(3, 'back', cx - windowW * 0.5 - 165, 62, 54, 72, 16, 112);
  addCabinetRow(3, 'back', cx + windowW * 0.5 + 42, 62, 54, 72, 16, 112);
  addCabinetRow(7, 'left', cz - 240, 82, 70, 74, 18, 112);
  addCabinetRow(7, 'right', cz - 240, 82, 70, 74, 18, 112);

  const frameGeom = mergeNormalized(frameGeoms);
  geometries.push(frameGeom);
  const windowFrameMesh = new THREE.Mesh(frameGeom, frameMat);
  windowFrameMesh.name = 'KitchenWindowFrameAndHandles';
  freezeStatic(windowFrameMesh);
  group.add(windowFrameMesh);

  const blueCabMat = createSurfaceMaterial(graphicsPreset, {
    color: '#0A5CFF',
    roughness: 0.36,
    metalness: 0.06,
    fog: false,
  });
  const yellowCabMat = createSurfaceMaterial(graphicsPreset, {
    color: '#FFD000',
    roughness: 0.38,
    metalness: 0.04,
    fog: false,
  });
  materials.push(blueCabMat, yellowCabMat);

  if (blueCabGeoms.length > 0) {
    const geom = mergeNormalized(blueCabGeoms);
    geometries.push(geom);
    const mesh = new THREE.Mesh(geom, blueCabMat);
    mesh.name = 'KitchenBlueCabinets';
    freezeStatic(mesh);
    group.add(mesh);
  }
  if (yellowCabGeoms.length > 0) {
    const geom = mergeNormalized(yellowCabGeoms);
    geometries.push(geom);
    const mesh = new THREE.Mesh(geom, yellowCabMat);
    mesh.name = 'KitchenYellowCabinets';
    freezeStatic(mesh);
    group.add(mesh);
  }

  return {
    group,
    dispose(): void {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
