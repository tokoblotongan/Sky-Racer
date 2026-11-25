// src/render/themes/fantasyland.ts

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CONFIG, type VisualPresetName } from '../../config';
import type { Course } from '../../core/course';
import type { QualityLevel } from '../quality';
import type { ThemeInstance, ThemeLightingConfig, ThemeSkyColors, WorldTheme } from './index';

interface CloudDriftItem {
  mesh: THREE.Mesh;
  baseX: number;
  baseY: number;
  baseZ: number;
  speed: number;
  span: number;
  phase: number;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

function createGrassTexture(maxAnisotropy: number, repeatCount: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.fillStyle = '#2ED66B';
    ctx.fillRect(0, 0, size, size);

    // Soft alternating turf stripes
    const stripeCount = 8;
    const stripeW = size / stripeCount;
    ctx.fillStyle = '#25C25C';
    for (let i = 0; i < stripeCount; i += 2) {
      ctx.fillRect(i * stripeW, 0, stripeW, size);
    }

    // Gentle mottled meadow patches + wildflowers
    const rand = mulberry32(9183);
    for (let i = 0; i < 420; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const r = 4 + rand() * 14;
      ctx.fillStyle = rand() > 0.5 ? 'rgba(31, 168, 79, 0.28)' : 'rgba(134, 239, 172, 0.22)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const flowerPalette = ['#FFD000', '#FFF6E0', '#FF6BCE', '#7DD3FC'];
    for (let i = 0; i < 95; i++) {
      const x = rand() * size;
      const y = rand() * size;
      ctx.fillStyle = flowerPalette[i % flowerPalette.length];
      ctx.beginPath();
      ctx.arc(x, y, 1.8 + rand() * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatCount, repeatCount);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createWaterTexture(maxAnisotropy: number, repeatCount: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0.0, '#00B4FF');
    grad.addColorStop(0.5, '#0EA5E9');
    grad.addColorStop(1.0, '#0284C7');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = 'rgba(224, 247, 255, 0.34)';
    ctx.lineWidth = 3;
    for (let row = 0; row < 12; row++) {
      const y = (row + 0.5) * (size / 12);
      ctx.beginPath();
      for (let x = 0; x <= size; x += 16) {
        const wy = y + Math.sin((x / size) * Math.PI * 4 + row * 1.1) * 4.5;
        if (x === 0) ctx.moveTo(x, wy);
        else ctx.lineTo(x, wy);
      }
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatCount, repeatCount);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createCloudTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.clearRect(0, 0, w, h);
    const puffs = [
      { x: 64, y: 78, r: 34 },
      { x: 102, y: 58, r: 44 },
      { x: 152, y: 56, r: 46 },
      { x: 194, y: 76, r: 34 },
      { x: 128, y: 78, r: 38 },
    ];
    for (const p of puffs) {
      const g = ctx.createRadialGradient(p.x, p.y - 6, p.r * 0.15, p.x, p.y, p.r);
      g.addColorStop(0.0, 'rgba(255, 255, 255, 0.96)');
      g.addColorStop(0.7, 'rgba(248, 250, 255, 0.85)');
      g.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createSunGlowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
    g.addColorStop(0.0, 'rgba(255, 252, 232, 1.0)');
    g.addColorStop(0.28, 'rgba(255, 232, 165, 0.82)');
    g.addColorStop(0.65, 'rgba(255, 210, 140, 0.24)');
    g.addColorStop(1.0, 'rgba(255, 210, 140, 0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const fantasyLandTheme: WorldTheme = {
  id: 'fantasyland',

  getSkyColors(presetName: VisualPresetName): ThemeSkyColors {
    return {
      skyTop: presetName === 'pastel' ? '#5A96FF' : '#3A7BFF',
      skyHorizon: presetName === 'pastel' ? '#FFD6F4' : '#FFC8F0',
      groundBounce: '#1FA84F',
      fogColor: '#BEE3FF',
    };
  },

  getLighting(presetName: VisualPresetName): ThemeLightingConfig {
    return {
      hemisphereSkyColor: '#78B6FF',
      hemisphereGroundColor: '#2ED66B',
      hemisphereIntensity: 0.72,
      sunColor: '#FFE8B8',
      sunIntensity: 3.0,
      exposure: presetName === 'pastel' ? 0.92 : 0.96,
      envIntensity: 0.42,
      showRoomShell: false,
    };
  },

  applyPalette(_name: VisualPresetName): void {
    // Warna langit dan cahaya disinkronkan melalui getSkyColors/getLighting di scene.ts
  },

  build(
    course: Course,
    quality: QualityLevel,
    _scene: THREE.Scene,
    maxAnisotropy: number,
    _presetName: VisualPresetName,
  ): ThemeInstance {
    const group = new THREE.Group();
    group.name = 'FantasyLandThemeGroup';

    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    const textures: THREE.Texture[] = [];

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

    const bounds = course.getBounds();
    const cx = bounds.center.x;
    const cz = bounds.center.z;
    const qualityPreset = CONFIG.quality.levels[quality];
    const densityScale = qualityPreset.propsDensityScale;
    const cloudDensityScale = qualityPreset.cloudDensityScale;
    const shadowsEnabled = qualityPreset.shadowsEnabled;

    const spanX = bounds.max.x - bounds.min.x;
    const spanZ = bounds.max.z - bounds.min.z;
    const trackReach = Math.max(140, Math.hypot(spanX, spanZ) * 0.55);
    const islandRadius = trackReach + 125;
    const waterRadius = islandRadius + 240;

    // ---------------------------------------------------------------------
    // 1. Expansive Vibrant Grass Meadow + Beveled Island Rim
    // ---------------------------------------------------------------------
    const grassRepeat = Math.max(18, Math.round((islandRadius * 2) / 28));
    const grassTex = trackTex(createGrassTexture(maxAnisotropy, grassRepeat));
    const grassMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: grassTex,
        roughness: 0.84,
        metalness: 0.0,
      }),
    );

    const meadowGeom = trackGeom(new THREE.CircleGeometry(islandRadius, 72));
    meadowGeom.rotateX(-Math.PI / 2);
    const meadowMesh = new THREE.Mesh(meadowGeom, grassMat);
    meadowMesh.name = 'FantasyGrassMeadow';
    meadowMesh.position.set(cx, 0, cz);
    meadowMesh.receiveShadow = true;
    meadowMesh.castShadow = false;
    freezeStatic(meadowMesh);
    group.add(meadowMesh);

    const cliffGeom = trackGeom(
      new THREE.CylinderGeometry(islandRadius, islandRadius + 6, 4.2, 72, 1, true),
    );
    const cliffMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#168F42',
        roughness: 0.88,
        metalness: 0.0,
      }),
    );
    const cliffMesh = new THREE.Mesh(cliffGeom, cliffMat);
    cliffMesh.position.set(cx, -2.12, cz);
    cliffMesh.receiveShadow = true;
    freezeStatic(cliffMesh);
    group.add(cliffMesh);

    // ---------------------------------------------------------------------
    // 2. Bright Blue Water Ring Surrounding the Meadow Island
    // ---------------------------------------------------------------------
    const waterRepeat = Math.max(16, Math.round((waterRadius * 2) / 42));
    const waterTex = trackTex(createWaterTexture(maxAnisotropy, waterRepeat));
    const waterMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: waterTex,
        roughness: 0.22,
        metalness: 0.06,
      }),
    );

    const waterGeom = trackGeom(new THREE.RingGeometry(islandRadius - 1.5, waterRadius, 72, 1));
    waterGeom.rotateX(-Math.PI / 2);
    const waterMesh = new THREE.Mesh(waterGeom, waterMat);
    waterMesh.name = 'FantasyWaterRing';
    waterMesh.position.set(cx, -2.35, cz);
    waterMesh.receiveShadow = true;
    freezeStatic(waterMesh);
    group.add(waterMesh);

    // ---------------------------------------------------------------------
    // 3. Spatial Track Clearance Grid (avoid touching track, rails & start view)
    // ---------------------------------------------------------------------
    const allRoutes = course.getAllRoutes();
    const samples = course.getSamples();
    const clearanceCell = 12;
    const trackClearRadius = 18;
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

    const startSlot = course.getGridSlots(1)[0];
    const startFrame = course.getFrameAt(startSlot.s);
    const startCamAreaX = startFrame.position.x;
    const startCamAreaZ = startFrame.position.z;

    const placedCircles: Array<{ x: number; z: number; r: number }> = [];

    const isClearOfTrack = (x: number, z: number, radius: number): boolean => {
      if (Math.hypot(x - cx, z - cz) > islandRadius - radius - 8) {
        return false;
      }
      if (Math.hypot(x - startCamAreaX, z - startCamAreaZ) < radius + 24) {
        return false;
      }

      const spanCells = Math.ceil((radius + trackClearRadius + 10) / clearanceCell);
      const gx = Math.floor(x / clearanceCell);
      const gz = Math.floor(z / clearanceCell);
      for (let dx = -spanCells; dx <= spanCells; dx++) {
        for (let dz = -spanCells; dz <= spanCells; dz++) {
          const cell = trackGrid.get(`${gx + dx},${gz + dz}`);
          if (!cell) continue;
          for (const pt of cell) {
            const minClear = radius + pt.hw + 8.5;
            if (Math.hypot(x - pt.x, z - pt.z) < minClear) {
              return false;
            }
          }
        }
      }

      for (const c of placedCircles) {
        if (Math.hypot(x - c.x, z - c.z) < radius + c.r + 3.5) {
          return false;
        }
      }
      return true;
    };

    // ---------------------------------------------------------------------
    // 4. Rounded Track Support Stanchions (keep high fantasy spans grounded)
    // ---------------------------------------------------------------------
    const supportSpots: Array<{ x: number; z: number; topY: number }> = [];
    for (const route of allRoutes) {
      const routeLen = route.getLength();
      for (let s = 28; s < routeLen - 20; s += 38) {
        if (route.isGapAt(s) || route.getStyleAt(s) === 'bridge') continue;
        if (route.routeId !== 'main' && (route.isRailGapAt(s, -1) || route.isRailGapAt(s, 1))) {
          continue;
        }
        const frame = route.getFrameAt(s);
        if (frame.position.y < 3.5 || frame.up.y < 0.55) continue;

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
      const colGeom = trackGeom(new THREE.CylinderGeometry(1.15, 1.45, 1, 14));
      const plinthGeom = trackGeom(new THREE.CylinderGeometry(2.1, 2.5, 1.4, 16));
      const colMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: '#E2E8F0',
          roughness: 0.45,
          metalness: 0.08,
        }),
      );
      const plinthMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: '#0A5CFF',
          roughness: 0.4,
          metalness: 0.1,
        }),
      );

      const colInst = new THREE.InstancedMesh(colGeom, colMat, supportSpots.length);
      const plinthInst = new THREE.InstancedMesh(plinthGeom, plinthMat, supportSpots.length);
      colInst.castShadow = shadowsEnabled;
      colInst.receiveShadow = shadowsEnabled;
      plinthInst.castShadow = shadowsEnabled;
      plinthInst.receiveShadow = shadowsEnabled;

      const mtx = new THREE.Matrix4();
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const scl = new THREE.Vector3();

      supportSpots.forEach((spot, i) => {
        pos.set(spot.x, 0.7, spot.z);
        scl.set(1, 1, 1);
        mtx.compose(pos, quat, scl);
        plinthInst.setMatrixAt(i, mtx);

        const h = Math.max(1.2, spot.topY - 0.6);
        pos.set(spot.x, 0.6 + h * 0.5, spot.z);
        scl.set(1, h, 1);
        mtx.compose(pos, quat, scl);
        colInst.setMatrixAt(i, mtx);
      });

      colInst.instanceMatrix.needsUpdate = true;
      colInst.computeBoundingSphere();
      plinthInst.instanceMatrix.needsUpdate = true;
      plinthInst.computeBoundingSphere();
      freezeStatic(colInst);
      freezeStatic(plinthInst);
      group.add(plinthInst, colInst);
    }

    // ---------------------------------------------------------------------
    // 5. Distant Rounded Green Hills Along Outer Meadow Perimeter
    // ---------------------------------------------------------------------
    const rand = mulberry32(7331);
    const hillPlacements: Array<{ x: number; z: number; sx: number; sy: number; sz: number; yaw: number; color: string }> = [];
    const hillColors = ['#22C55E', '#16A34A', '#34D399', '#10B981'];
    const hillCount = Math.max(4, Math.round(16 * densityScale));

    for (let i = 0; i < hillCount; i++) {
      const baseAngle = (i / hillCount) * Math.PI * 2 + (rand() - 0.5) * 0.28;
      const dist = islandRadius - 22 - rand() * 34;
      const x = cx + Math.cos(baseAngle) * dist;
      const z = cz + Math.sin(baseAngle) * dist;
      const sx = 24 + rand() * 22;
      const sy = 14 + rand() * 18;
      const sz = 22 + rand() * 20;
      const footprint = Math.max(sx, sz) * 0.92;
      if (Math.hypot(x - cx, z - cz) <= trackReach + footprint * 0.4) {
        continue;
      }
      hillPlacements.push({
        x,
        z,
        sx,
        sy,
        sz,
        yaw: rand() * Math.PI * 2,
        color: hillColors[i % hillColors.length],
      });
    }

    if (hillPlacements.length > 0) {
      const hillGeom = trackGeom(
        new THREE.SphereGeometry(1, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.52),
      );
      const hillMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          roughness: 0.86,
          metalness: 0.0,
        }),
      );
      const hillInst = new THREE.InstancedMesh(hillGeom, hillMat, hillPlacements.length);
      hillInst.castShadow = false;
      hillInst.receiveShadow = true;

      const mtx = new THREE.Matrix4();
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const scl = new THREE.Vector3();
      const upAxis = new THREE.Vector3(0, 1, 0);
      const color = new THREE.Color();

      hillPlacements.forEach((h, i) => {
        pos.set(h.x, -0.45, h.z);
        quat.setFromAxisAngle(upAxis, h.yaw);
        scl.set(h.sx, h.sy, h.sz);
        mtx.compose(pos, quat, scl);
        hillInst.setMatrixAt(i, mtx);
        color.set(h.color);
        hillInst.setColorAt(i, color);
      });

      hillInst.instanceMatrix.needsUpdate = true;
      if (hillInst.instanceColor) hillInst.instanceColor.needsUpdate = true;
      hillInst.computeBoundingSphere();
      freezeStatic(hillInst);
      group.add(hillInst);
    }

    // ---------------------------------------------------------------------
    // 6. Simple Instanced Bright Trees & Colorful Flag Poles (Starter Set)
    // ---------------------------------------------------------------------
    const treeCount = Math.max(8, Math.round(34 * densityScale));
    const treeSpots: Array<{ x: number; z: number; scale: number; yaw: number; color: string }> = [];
    const canopyPalette = ['#22C55E', '#10B981', '#FF6BCE', '#FFD000', '#38BDF8'];

    for (let attempt = 0; attempt < treeCount * 35 && treeSpots.length < treeCount; attempt++) {
      const angle = rand() * Math.PI * 2;
      const dist = 24 + Math.sqrt(rand()) * (islandRadius - 42);
      const x = cx + Math.cos(angle) * dist;
      const z = cz + Math.sin(angle) * dist;
      const scale = 0.85 + rand() * 0.55;
      const r = 4.2 * scale;
      if (!isClearOfTrack(x, z, r)) continue;
      placedCircles.push({ x, z, r });
      treeSpots.push({
        x,
        z,
        scale,
        yaw: rand() * Math.PI * 2,
        color: canopyPalette[treeSpots.length % canopyPalette.length],
      });
    }

    if (treeSpots.length > 0) {
      const trunkGeom = trackGeom(new THREE.CylinderGeometry(0.55, 0.85, 5.2, 10));
      trunkGeom.translate(0, 2.6, 0);
      const trunkMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: '#7C4A26',
          roughness: 0.78,
          metalness: 0.02,
        }),
      );

      const puffA = new THREE.SphereGeometry(2.6, 14, 12);
      puffA.translate(0, 6.4, 0);
      const puffB = new THREE.SphereGeometry(2.0, 12, 10);
      puffB.translate(-1.3, 5.4, 0.6);
      const puffC = new THREE.SphereGeometry(1.9, 12, 10);
      puffC.translate(1.3, 5.5, -0.5);
      const canopyGeom = trackGeom(mergeWithCleanup([puffA, puffB, puffC]));
      const canopyMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          roughness: 0.52,
          metalness: 0.02,
        }),
      );

      const trunkInst = new THREE.InstancedMesh(trunkGeom, trunkMat, treeSpots.length);
      const canopyInst = new THREE.InstancedMesh(canopyGeom, canopyMat, treeSpots.length);
      trunkInst.castShadow = shadowsEnabled;
      trunkInst.receiveShadow = shadowsEnabled;
      canopyInst.castShadow = shadowsEnabled;
      canopyInst.receiveShadow = shadowsEnabled;

      const mtx = new THREE.Matrix4();
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const scl = new THREE.Vector3();
      const upAxis = new THREE.Vector3(0, 1, 0);
      const color = new THREE.Color();

      treeSpots.forEach((t, i) => {
        pos.set(t.x, 0, t.z);
        quat.setFromAxisAngle(upAxis, t.yaw);
        scl.set(t.scale, t.scale, t.scale);
        mtx.compose(pos, quat, scl);
        trunkInst.setMatrixAt(i, mtx);
        canopyInst.setMatrixAt(i, mtx);
        color.set(t.color);
        canopyInst.setColorAt(i, color);
      });

      trunkInst.instanceMatrix.needsUpdate = true;
      trunkInst.computeBoundingSphere();
      canopyInst.instanceMatrix.needsUpdate = true;
      if (canopyInst.instanceColor) canopyInst.instanceColor.needsUpdate = true;
      canopyInst.computeBoundingSphere();
      freezeStatic(trunkInst);
      freezeStatic(canopyInst);
      group.add(trunkInst, canopyInst);
    }

    const flagCount = Math.max(4, Math.round(18 * densityScale));
    const flagSpots: Array<{ x: number; z: number; scale: number; yaw: number; color: string }> = [];
    const flagPalette = ['#FF2D3D', '#FFD000', '#00E5FF', '#0A5CFF', '#FF5A00'];

    for (let attempt = 0; attempt < flagCount * 35 && flagSpots.length < flagCount; attempt++) {
      const sample = samples[Math.floor(rand() * samples.length)];
      if (sample.isGap) continue;
      const side = rand() > 0.5 ? 1 : -1;
      const lateralOffset = sample.width * 0.5 + 14 + rand() * 14;
      const x = sample.position.x + sample.right.x * side * lateralOffset;
      const z = sample.position.z + sample.right.z * side * lateralOffset;
      const scale = 0.9 + rand() * 0.35;
      if (!isClearOfTrack(x, z, 2.8 * scale)) continue;
      placedCircles.push({ x, z, r: 2.8 * scale });
      flagSpots.push({
        x,
        z,
        scale,
        yaw: rand() * Math.PI * 2,
        color: flagPalette[flagSpots.length % flagPalette.length],
      });
    }

    if (flagSpots.length > 0) {
      const poleCylinder = new THREE.CylinderGeometry(0.18, 0.24, 9.5, 10);
      poleCylinder.translate(0, 4.75, 0);
      const baseCone = new THREE.CylinderGeometry(0.55, 0.75, 0.7, 12);
      baseCone.translate(0, 0.35, 0);
      const finial = new THREE.SphereGeometry(0.32, 10, 8);
      finial.translate(0, 9.65, 0);
      const poleGeom = trackGeom(mergeWithCleanup([poleCylinder, baseCone, finial]));
      const poleMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: '#E2E8F0',
          roughness: 0.28,
          metalness: 0.72,
        }),
      );

      const bannerShape = new THREE.Shape();
      bannerShape.moveTo(0, 0);
      bannerShape.lineTo(3.4, -0.75);
      bannerShape.lineTo(0, -1.55);
      bannerShape.closePath();
      const bannerGeom = trackGeom(
        new THREE.ExtrudeGeometry(bannerShape, {
          depth: 0.08,
          bevelEnabled: false,
        }),
      );
      bannerGeom.translate(0.16, 9.2, -0.04);
      const bannerMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          roughness: 0.42,
          metalness: 0.05,
        }),
      );

      const poleInst = new THREE.InstancedMesh(poleGeom, poleMat, flagSpots.length);
      const bannerInst = new THREE.InstancedMesh(bannerGeom, bannerMat, flagSpots.length);
      poleInst.castShadow = shadowsEnabled;
      bannerInst.castShadow = shadowsEnabled;

      const mtx = new THREE.Matrix4();
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const scl = new THREE.Vector3();
      const upAxis = new THREE.Vector3(0, 1, 0);
      const color = new THREE.Color();

      flagSpots.forEach((f, i) => {
        pos.set(f.x, 0, f.z);
        quat.setFromAxisAngle(upAxis, f.yaw);
        scl.set(f.scale, f.scale, f.scale);
        mtx.compose(pos, quat, scl);
        poleInst.setMatrixAt(i, mtx);
        bannerInst.setMatrixAt(i, mtx);
        color.set(f.color);
        bannerInst.setColorAt(i, color);
      });

      poleInst.instanceMatrix.needsUpdate = true;
      poleInst.computeBoundingSphere();
      bannerInst.instanceMatrix.needsUpdate = true;
      if (bannerInst.instanceColor) bannerInst.instanceColor.needsUpdate = true;
      bannerInst.computeBoundingSphere();
      freezeStatic(poleInst);
      freezeStatic(bannerInst);
      group.add(poleInst, bannerInst);
    }

    // ---------------------------------------------------------------------
    // 7. Drifting Procedural Clouds + Warm Sun Orb
    // ---------------------------------------------------------------------
    const cloudTex = trackTex(createCloudTexture());
    const cloudMat = trackMat(
      new THREE.MeshBasicMaterial({
        map: cloudTex,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      }),
    );
    const cloudGeom = trackGeom(new THREE.PlaneGeometry(54, 27));
    const cloudCount = Math.max(4, Math.round(14 * cloudDensityScale));
    const clouds: CloudDriftItem[] = [];
    const cloudSpan = islandRadius * 1.45;

    for (let i = 0; i < cloudCount; i++) {
      const cloudMesh = new THREE.Mesh(cloudGeom, cloudMat);
      const baseX = cx + (rand() - 0.5) * cloudSpan * 2;
      const baseY = 108 + rand() * 58;
      const baseZ = cz + (rand() - 0.5) * cloudSpan * 2;
      const scale = 0.8 + rand() * 0.9;
      cloudMesh.position.set(baseX, baseY, baseZ);
      cloudMesh.scale.setScalar(scale);
      cloudMesh.renderOrder = -10;
      group.add(cloudMesh);
      clouds.push({
        mesh: cloudMesh,
        baseX,
        baseY,
        baseZ,
        speed: 2.2 + rand() * 2.4,
        span: cloudSpan,
        phase: rand() * Math.PI * 2,
      });
    }

    const sunDir = new THREE.Vector3(
      CONFIG.lighting.sunOffset.x,
      CONFIG.lighting.sunOffset.y,
      CONFIG.lighting.sunOffset.z,
    ).normalize();
    const sunDistance = Math.max(380, islandRadius * 1.18);
    const sunTex = trackTex(createSunGlowTexture());
    const sunGlowMat = trackMat(
      new THREE.MeshBasicMaterial({
        map: sunTex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    const sunGeom = trackGeom(new THREE.PlaneGeometry(92, 92));
    const sunMesh = new THREE.Mesh(sunGeom, sunGlowMat);
    sunMesh.name = 'FantasySunGlow';
    sunMesh.position.set(
      cx + sunDir.x * sunDistance,
      sunDir.y * sunDistance,
      cz + sunDir.z * sunDistance,
    );
    sunMesh.renderOrder = -20;
    group.add(sunMesh);

    let elapsed = 0;

    function update(cameraPos: THREE.Vector3, dt: number): void {
      elapsed += dt;
      waterTex.offset.x = (waterTex.offset.x + dt * 0.04) % 1;
      waterTex.offset.y = (waterTex.offset.y + dt * 0.025) % 1;

      sunMesh.lookAt(cameraPos);

      for (let i = 0; i < clouds.length; i++) {
        const c = clouds[i];
        c.baseX += c.speed * dt;
        if (c.baseX > cx + c.span) {
          c.baseX -= c.span * 2;
        }
        c.mesh.position.set(
          c.baseX,
          c.baseY + Math.sin(elapsed * 0.35 + c.phase) * 1.4,
          c.baseZ,
        );
        c.mesh.lookAt(cameraPos);
      }
    }

    function applyPalette(_name: VisualPresetName): void {
      // Warna langit dan cahaya ditangani oleh scene.ts menggunakan getSkyColors/getLighting
    }

    function dispose(): void {
      for (const g of geometries) g.dispose();
      for (const t of textures) t.dispose();
      for (const m of materials) m.dispose();
    }

    function getGroundY(x: number, z: number): number {
      return Math.hypot(x - cx, z - cz) <= islandRadius ? 0 : -2.35;
    }

    return {
      id: 'fantasyland',
      group,
      update,
      applyPalette,
      getGroundY,
      dispose,
    };
  },
};
