// src/arenas/kitchen/theme.ts
// Minimal base theme for Arena 3 ("Dapur Raksasa"):
// bright teal-and-white checker kitchen counter, huge sunny kitchen window,
// plain bright walls, track stanchions, and removable zone placeholder markers.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CONFIG, type GraphicsPreset } from '../../config';
import { createSurfaceMaterial } from '../../render/materialFactory';
import type {
  ThemeDefinition,
  ThemeQualityTiers,
  ThemeSceneryContext,
  ThemeSceneryHandle,
} from '../../themes/types';

function makeNonIndexedNormalized(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  if (!nonIndexed.getAttribute('normal')) {
    nonIndexed.computeVertexNormals();
  }
  if (!nonIndexed.getAttribute('uv')) {
    const pos = nonIndexed.getAttribute('position');
    nonIndexed.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
  }
  return nonIndexed;
}

function mergeWithCleanup(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const prepared = geoms.map((g) => makeNonIndexedNormalized(g));
  const merged = mergeGeometries(prepared, false);
  for (const g of geoms) g.dispose();
  for (const g of prepared) g.dispose();
  if (!merged) {
    return new THREE.BoxGeometry(1, 1, 1);
  }
  merged.computeBoundingSphere();
  return merged;
}

function freezeStatic(obj: THREE.Object3D): void {
  obj.updateMatrix();
  obj.matrixAutoUpdate = false;
}

function createCounterCheckerTexture(
  maxAnisotropy: number,
  repeatX: number,
  repeatZ: number,
): THREE.CanvasTexture {
  const size = 256;
  const half = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Crisp bright teal & white kitchen counter checker
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = '#14B8A6';
    ctx.fillRect(0, 0, half, half);
    ctx.fillRect(half, half, half, half);

    // Subtle tile highlight & crisp grout seams so orange track pops cleanly
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.fillRect(4, 4, half - 8, 6);
    ctx.fillRect(half + 4, half + 4, half - 8, 6);

    ctx.fillStyle = 'rgba(15, 118, 110, 0.22)';
    ctx.fillRect(0, 0, size, 3);
    ctx.fillRect(0, half - 1, size, 3);
    ctx.fillRect(0, 0, 3, size);
    ctx.fillRect(half - 1, 0, 3, size);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatZ);
  tex.anisotropy = Math.min(4, maxAnisotropy);
  tex.needsUpdate = true;
  return tex;
}

function createWallTexture(baseHex: string, wainscotHex: string, maxAnisotropy: number): THREE.CanvasTexture {
  const w = 256;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Soft vertical gradient so walls feel bright and dimensional without glare
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#FFFFFF');
    grad.addColorStop(0.55, baseHex);
    grad.addColorStop(1, wainscotHex);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Subtle horizontal backsplash seam lines near bottom third
    ctx.fillStyle = 'rgba(15, 23, 42, 0.06)';
    for (let y = Math.round(h * 0.65); y < h; y += 10) {
      ctx.fillRect(0, y, w, 1);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(4, 1);
  tex.anisotropy = Math.min(4, maxAnisotropy);
  tex.needsUpdate = true;
  return tex;
}

function createWindowSkyTexture(skyTop: string, skyHorizon: string): THREE.CanvasTexture {
  const w = 128;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0.0, skyTop);
    grad.addColorStop(0.75, skyHorizon);
    grad.addColorStop(1.0, '#D8F1FF');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function buildKitchenQualityTiers(): ThemeQualityTiers {
  const levels = CONFIG.quality.levels;
  return {
    mobile: {
      propsDensityScale: levels.mobile.propsDensityScale,
      cloudDensityScale: levels.mobile.cloudDensityScale,
      shadowsEnabled: levels.mobile.shadowsEnabled,
      maxTextureSize: levels.mobile.maxTextureSize,
    },
    low: {
      propsDensityScale: levels.low.propsDensityScale,
      cloudDensityScale: levels.low.cloudDensityScale,
      shadowsEnabled: levels.low.shadowsEnabled,
      maxTextureSize: levels.low.maxTextureSize,
    },
    medium: {
      propsDensityScale: levels.medium.propsDensityScale,
      cloudDensityScale: levels.medium.cloudDensityScale,
      shadowsEnabled: levels.medium.shadowsEnabled,
      maxTextureSize: levels.medium.maxTextureSize,
    },
    high: {
      propsDensityScale: levels.high.propsDensityScale,
      cloudDensityScale: levels.high.cloudDensityScale,
      shadowsEnabled: levels.high.shadowsEnabled,
      maxTextureSize: levels.high.maxTextureSize,
    },
  };
}

const ZONE_MARKER_PALETTE = [
  '#FF2D3D',
  '#FFD000',
  '#0A5CFF',
  '#00E5FF',
  '#16A34A',
  '#A855F7',
  '#FF5A00',
] as const;

export const kitchenTheme: ThemeDefinition = {
  id: 'kitchen',
  background: {
    type: 'skybox',
    params: {
      vivid: {
        skyTop: '#1E90FF',
        skyHorizon: '#8FD3FF',
        groundBounce: '#14B8A6',
        fogColor: '#8FD3FF',
      },
      pastel: {
        skyTop: '#4DB3FF',
        skyHorizon: '#BFE3FF',
        groundBounce: '#7ADBD0',
        fogColor: '#BFE3FF',
      },
    },
  },
  lightingProfile: {
    id: 'kitchen-daylight',
    vivid: {
      hemisphereSkyColor: '#7EC8FF',
      hemisphereGroundColor: '#8ED8CF',
      hemisphereIntensity: 0.72,
      sunColor: '#FFF3DC',
      sunIntensity: 2.95,
      exposure: 0.96,
      envIntensity: 0.42,
      showRoomShell: false,
    },
    pastel: {
      hemisphereSkyColor: '#BFE3FF',
      hemisphereGroundColor: '#B5E6E0',
      hemisphereIntensity: 0.76,
      sunColor: '#FFF6E8',
      sunIntensity: 2.75,
      exposure: 0.92,
      envIntensity: 0.4,
      showRoomShell: false,
    },
  },
  qualityTiers: buildKitchenQualityTiers(),
  buildScenery(context: ThemeSceneryContext): ThemeSceneryHandle {
    const group = new THREE.Group();
    group.name = 'KitchenScenery';

    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    const textures: THREE.Texture[] = [];
    const instancedMeshes: THREE.InstancedMesh[] = [];

    const trackGeom = <T extends THREE.BufferGeometry>(g: T): T => {
      geometries.push(g);
      return g;
    };
    const trackMat = <T extends THREE.Material>(m: T): T => {
      materials.push(m);
      return m;
    };
    const trackTex = <T extends THREE.Texture>(t: T): T => {
      textures.push(t);
      return t;
    };
    const trackInst = (m: THREE.InstancedMesh): THREE.InstancedMesh => {
      instancedMeshes.push(m);
      return m;
    };

    const effectivePreset: GraphicsPreset = context.graphicsPreset ?? 'penuh';
    const isSafePreset = effectivePreset === 'hemat';
    const qualityPreset = CONFIG.quality.levels[isSafePreset ? 'mobile' : context.quality];
    const shadowsEnabled = effectivePreset === 'penuh' && qualityPreset.shadowsEnabled;
    const receiveShadows = effectivePreset === 'seimbang' || shadowsEnabled;
    const effectiveAnisotropy = isSafePreset ? Math.min(2, context.maxAnisotropy) : context.maxAnisotropy;

    const bounds = context.course.getBounds();
    const cx = bounds.center.x;
    const cz = bounds.center.z;
    const margin = 150;
    const counterW = Math.max(560, Math.ceil((bounds.max.x - bounds.min.x + margin * 2) / 20) * 20);
    const counterD = Math.max(560, Math.ceil((bounds.max.z - bounds.min.z + margin * 2) / 20) * 20);
    const wallH = Math.max(190, Math.ceil(bounds.max.y + 110));
    const wallT = 6;
    const halfW = counterW * 0.5;
    const halfD = counterD * 0.5;

    // 1. Giant Teal & White Checker Kitchen Counter Floor (y = 0)
    const tileMeters = 28;
    const repeatX = Math.max(8, Math.round(counterW / tileMeters));
    const repeatZ = Math.max(8, Math.round(counterD / tileMeters));
    const counterTex = trackTex(createCounterCheckerTexture(effectiveAnisotropy, repeatX, repeatZ));
    const counterMat = trackMat(
      createSurfaceMaterial(effectivePreset, {
        map: counterTex,
        roughness: 0.42,
        metalness: 0.02,
      }),
    );
    const counterGeom = trackGeom(new THREE.PlaneGeometry(counterW + wallT * 2, counterD + wallT * 2));
    counterGeom.rotateX(-Math.PI / 2);
    const counterMesh = new THREE.Mesh(counterGeom, counterMat);
    counterMesh.name = 'KitchenCounterFloor';
    counterMesh.position.set(cx, 0, cz);
    counterMesh.receiveShadow = receiveShadows;
    counterMesh.castShadow = false;
    freezeStatic(counterMesh);
    group.add(counterMesh);

    // 2. Plain Bright Back & Side Kitchen Walls + Counter Backsplash Trim
    const wallTex = trackTex(createWallTexture('#F1F5F9', '#CBD5E1', effectiveAnisotropy));
    const wallMat = trackMat(
      createSurfaceMaterial(effectivePreset, {
        map: wallTex,
        roughness: 0.86,
        metalness: 0.0,
      }),
    );

    const backZ = cz - halfD;
    const frontZ = cz + halfD;
    const leftX = cx - halfW;
    const rightX = cx + halfW;

    const wallGeoms: THREE.BufferGeometry[] = [];
    // Back wall (-Z), Front wall (+Z), Left wall (-X), Right wall (+X)
    const backWall = new THREE.BoxGeometry(counterW + wallT * 2, wallH, wallT);
    backWall.translate(cx, wallH * 0.5 - 1, backZ);
    wallGeoms.push(backWall);

    const frontWall = new THREE.BoxGeometry(counterW + wallT * 2, wallH, wallT);
    frontWall.translate(cx, wallH * 0.5 - 1, frontZ);
    wallGeoms.push(frontWall);

    const leftWall = new THREE.BoxGeometry(wallT, wallH, counterD + wallT * 2);
    leftWall.translate(leftX, wallH * 0.5 - 1, cz);
    wallGeoms.push(leftWall);

    const rightWall = new THREE.BoxGeometry(wallT, wallH, counterD + wallT * 2);
    rightWall.translate(rightX, wallH * 0.5 - 1, cz);
    wallGeoms.push(rightWall);

    const wallsMesh = new THREE.Mesh(trackGeom(mergeWithCleanup(wallGeoms)), wallMat);
    wallsMesh.name = 'KitchenWalls';
    wallsMesh.receiveShadow = receiveShadows;
    wallsMesh.castShadow = false;
    freezeStatic(wallsMesh);
    group.add(wallsMesh);

    // Subtle crisp teal baseboard trim along counter-to-wall perimeter
    const trimGeoms: THREE.BufferGeometry[] = [];
    const trimH = 6.5;
    const trimBack = new THREE.BoxGeometry(counterW, trimH, wallT + 2);
    trimBack.translate(cx, trimH * 0.5, backZ);
    trimGeoms.push(trimBack);
    const trimFront = new THREE.BoxGeometry(counterW, trimH, wallT + 2);
    trimFront.translate(cx, trimH * 0.5, frontZ);
    trimGeoms.push(trimFront);
    const trimLeft = new THREE.BoxGeometry(wallT + 2, trimH, counterD);
    trimLeft.translate(leftX, trimH * 0.5, cz);
    trimGeoms.push(trimLeft);
    const trimRight = new THREE.BoxGeometry(wallT + 2, trimH, counterD);
    trimRight.translate(rightX, trimH * 0.5, cz);
    trimGeoms.push(trimRight);

    const trimMat = trackMat(
      createSurfaceMaterial(effectivePreset, {
        color: '#0F766E',
        roughness: 0.5,
        metalness: 0.04,
      }),
    );
    const trimMesh = new THREE.Mesh(trackGeom(mergeWithCleanup(trimGeoms)), trimMat);
    trimMesh.name = 'KitchenWallBaseboard';
    trimMesh.receiveShadow = receiveShadows;
    freezeStatic(trimMesh);
    group.add(trimMesh);

    // 3. Huge Kitchen Window on the Back Wall (-Z, directly ahead of Meja Start)
    const skyColors =
      context.presetName === 'pastel'
        ? kitchenTheme.background.params.pastel
        : kitchenTheme.background.params.vivid;
    const windowW = Math.min(counterW * 0.62, 460);
    const windowH = Math.min(wallH * 0.68, 138);
    const windowCenterY = Math.max(windowH * 0.5 + 22, wallH * 0.5);
    const windowZ = backZ + wallT * 0.5 + 0.6;

    const skyTex = trackTex(createWindowSkyTexture(skyColors.skyTop, skyColors.skyHorizon));
    const skyPaneMat = trackMat(
      new THREE.MeshBasicMaterial({
        map: skyTex,
        fog: false,
      }),
    );
    const skyPaneGeom = trackGeom(new THREE.PlaneGeometry(windowW, windowH));
    const skyPaneMesh = new THREE.Mesh(skyPaneGeom, skyPaneMat);
    skyPaneMesh.name = 'KitchenWindowSky';
    skyPaneMesh.position.set(cx, windowCenterY, windowZ);
    freezeStatic(skyPaneMesh);
    group.add(skyPaneMesh);

    // Window frame, deep sill, and clean center crossbars
    const frameThick = 5.5;
    const frameDepth = 4.2;
    const frameGeoms: THREE.BufferGeometry[] = [];

    const topBar = new THREE.BoxGeometry(windowW + frameThick * 2, frameThick, frameDepth);
    topBar.translate(cx, windowCenterY + windowH * 0.5 + frameThick * 0.5, windowZ + 1.0);
    frameGeoms.push(topBar);

    const sillBar = new THREE.BoxGeometry(windowW + frameThick * 2 + 8, frameThick * 1.4, frameDepth + 6);
    sillBar.translate(cx, windowCenterY - windowH * 0.5 - frameThick * 0.7, windowZ + 2.5);
    frameGeoms.push(sillBar);

    const leftBar = new THREE.BoxGeometry(frameThick, windowH, frameDepth);
    leftBar.translate(cx - windowW * 0.5 - frameThick * 0.5, windowCenterY, windowZ + 1.0);
    frameGeoms.push(leftBar);

    const rightBar = new THREE.BoxGeometry(frameThick, windowH, frameDepth);
    rightBar.translate(cx + windowW * 0.5 + frameThick * 0.5, windowCenterY, windowZ + 1.0);
    frameGeoms.push(rightBar);

    const midVert = new THREE.BoxGeometry(3.4, windowH, 2.4);
    midVert.translate(cx, windowCenterY, windowZ + 0.8);
    frameGeoms.push(midVert);

    const midHoriz = new THREE.BoxGeometry(windowW, 3.4, 2.4);
    midHoriz.translate(cx, windowCenterY, windowZ + 0.8);
    frameGeoms.push(midHoriz);

    const frameMat = trackMat(
      createSurfaceMaterial(effectivePreset, {
        color: '#FFFDF7',
        roughness: 0.42,
        metalness: 0.05,
      }),
    );
    const windowFrameMesh = new THREE.Mesh(trackGeom(mergeWithCleanup(frameGeoms)), frameMat);
    windowFrameMesh.name = 'KitchenWindowFrame';
    windowFrameMesh.receiveShadow = receiveShadows;
    freezeStatic(windowFrameMesh);
    group.add(windowFrameMesh);

    // 4. Clean Track Support Stanchions keeping elevated spans grounded on the counter
    const allRoutes = context.course.getAllRoutes();
    const clearanceCell = 12;
    const trackGrid = new Map<string, Array<{ x: number; y: number; z: number; hw: number }>>();
    for (const route of allRoutes) {
      const routeSamples = route.getSamples();
      for (let i = 0; i < routeSamples.length; i += 6) {
        const f = routeSamples[i];
        if (f.isGap) continue;
        const gx = Math.floor(f.position.x / clearanceCell);
        const gz = Math.floor(f.position.z / clearanceCell);
        const key = `${gx},${gz}`;
        let list = trackGrid.get(key);
        if (!list) {
          list = [];
          trackGrid.set(key, list);
        }
        list.push({
          x: f.position.x,
          y: f.position.y,
          z: f.position.z,
          hw: f.width * 0.5,
        });
      }
    }

    const supportSpots: Array<{ x: number; z: number; topY: number }> = [];
    for (const route of allRoutes) {
      const routeLen = route.getLength();
      for (let s = 30; s < routeLen - 22; s += 44) {
        if (route.isGapAt(s) || route.getStyleAt(s) === 'bridge') continue;
        if (route.routeId !== 'main' && (route.isRailGapAt(s, -1) || route.isRailGapAt(s, 1))) {
          continue;
        }
        const frame = route.getFrameAt(s);
        if (frame.position.y < 3.5 || frame.up.y < 0.6) continue;

        let blockedByLower = false;
        const gx = Math.floor(frame.position.x / clearanceCell);
        const gz = Math.floor(frame.position.z / clearanceCell);
        for (let dx = -2; dx <= 2 && !blockedByLower; dx++) {
          for (let dz = -2; dz <= 2; dz++) {
            const cell = trackGrid.get(`${gx + dx},${gz + dz}`);
            if (!cell) continue;
            for (const pt of cell) {
              if (
                pt.y < frame.position.y - 2 &&
                Math.hypot(frame.position.x - pt.x, frame.position.z - pt.z) < pt.hw + 3.6
              ) {
                blockedByLower = true;
                break;
              }
            }
          }
        }
        if (!blockedByLower) {
          supportSpots.push({
            x: frame.position.x,
            z: frame.position.z,
            topY: frame.position.y - 0.35,
          });
        }
      }
    }

    if (supportSpots.length > 0) {
      const colGeom = trackGeom(new THREE.CylinderGeometry(1.1, 1.35, 1, 12));
      const plinthGeom = trackGeom(new THREE.CylinderGeometry(2.0, 2.35, 1.3, 12));
      const colMat = trackMat(
        createSurfaceMaterial(effectivePreset, {
          color: '#E2E8F0',
          roughness: 0.42,
          metalness: 0.08,
        }),
      );
      const plinthMat = trackMat(
        createSurfaceMaterial(effectivePreset, {
          color: '#0A5CFF',
          roughness: 0.38,
          metalness: 0.1,
        }),
      );

      const colInst = trackInst(new THREE.InstancedMesh(colGeom, colMat, supportSpots.length));
      const plinthInst = trackInst(new THREE.InstancedMesh(plinthGeom, plinthMat, supportSpots.length));
      colInst.castShadow = shadowsEnabled;
      colInst.receiveShadow = receiveShadows;
      plinthInst.castShadow = shadowsEnabled;
      plinthInst.receiveShadow = receiveShadows;

      const mtx = new THREE.Matrix4();
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const scl = new THREE.Vector3();

      for (let i = 0; i < supportSpots.length; i++) {
        const spot = supportSpots[i];
        pos.set(spot.x, 0.65, spot.z);
        scl.set(1, 1, 1);
        mtx.compose(pos, quat, scl);
        plinthInst.setMatrixAt(i, mtx);

        const h = Math.max(1.2, spot.topY - 0.55);
        pos.set(spot.x, 0.55 + h * 0.5, spot.z);
        scl.set(1, h, 1);
        mtx.compose(pos, quat, scl);
        colInst.setMatrixAt(i, mtx);
      }

      colInst.instanceMatrix.needsUpdate = true;
      colInst.computeBoundingSphere();
      plinthInst.instanceMatrix.needsUpdate = true;
      plinthInst.computeBoundingSphere();
      freezeStatic(colInst);
      freezeStatic(plinthInst);
      group.add(plinthInst, colInst);
    }

    // 5. Removable Stage-K1 Zone Placeholder Markers (one small colored cone/flag per named zone)
    const markerSpots: Array<{ x: number; y: number; z: number; color: string }> = [];
    const seenZoneNames = new Set<string>();
    for (const route of allRoutes) {
      const segs = route.getSegmentList();
      for (const seg of segs) {
        const trimmed = seg.name?.trim();
        if (!trimmed || seenZoneNames.has(trimmed)) continue;
        seenZoneNames.add(trimmed);
        const midS = (seg.startS + seg.endS) * 0.5;
        const frame = route.getFrameAt(midS);
        const lat = frame.width * 0.5 + 4.5;
        markerSpots.push({
          x: frame.position.x + frame.right.x * lat,
          y: Math.max(0.1, frame.position.y),
          z: frame.position.z + frame.right.z * lat,
          color: ZONE_MARKER_PALETTE[markerSpots.length % ZONE_MARKER_PALETTE.length],
        });
      }
    }

    if (markerSpots.length > 0) {
      const zoneMarkersGroup = new THREE.Group();
      zoneMarkersGroup.name = 'KitchenZoneMarkers';

      const coneGeom = trackGeom(new THREE.ConeGeometry(1.15, 2.8, 12));
      coneGeom.translate(0, 1.4, 0);
      const coneMat = trackMat(
        createSurfaceMaterial(effectivePreset, {
          color: 0xffffff,
          roughness: 0.36,
          metalness: 0.08,
        }),
      );
      const coneInst = trackInst(new THREE.InstancedMesh(coneGeom, coneMat, markerSpots.length));
      coneInst.castShadow = shadowsEnabled;
      coneInst.receiveShadow = receiveShadows;

      const mtx = new THREE.Matrix4();
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const scl = new THREE.Vector3(1, 1, 1);
      const col = new THREE.Color();

      for (let i = 0; i < markerSpots.length; i++) {
        const m = markerSpots[i];
        pos.set(m.x, m.y, m.z);
        mtx.compose(pos, quat, scl);
        coneInst.setMatrixAt(i, mtx);
        col.set(m.color);
        coneInst.setColorAt(i, col);
      }

      coneInst.instanceMatrix.needsUpdate = true;
      if (coneInst.instanceColor) coneInst.instanceColor.needsUpdate = true;
      coneInst.computeBoundingSphere();
      freezeStatic(coneInst);
      zoneMarkersGroup.add(coneInst);
      group.add(zoneMarkersGroup);
    }

    return {
      id: kitchenTheme.id,
      group,
      update(_dt: number, _cameraPos?: THREE.Vector3): void {
        // Static base scenery in Stage K1 (no per-frame allocations)
      },
      dispose(): void {
        for (const im of instancedMeshes) im.dispose();
        for (const g of geometries) g.dispose();
        for (const t of textures) t.dispose();
        for (const m of materials) m.dispose();
      },
      getGroundY(): number {
        return 0;
      },
    };
  },
};
