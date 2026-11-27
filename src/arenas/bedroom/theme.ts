// src/arenas/bedroom/theme.ts
// Stage K1 minimal base theme for Arena 4 ("Kamar Tidur Raksasa"):
// patchwork quilt bed surface, vivid sunset bedroom window, bright lilac/mint walls,
// track stanchions, and one removable placeholder marker per named zone (no fog, no shaders).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CONFIG, type GraphicsPreset, type VisualPresetName } from '../../config';
import type { Course } from '../../core/course';
import { createSurfaceMaterial } from '../../render/materialFactory';
import type {
  DecorFootprint,
  ThemeDefinition,
  ThemeQualityTiers,
  ThemeSceneryContext,
  ThemeSceneryHandle,
} from '../../themes/types';

function buildBedroomQualityTiers(): ThemeQualityTiers {
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

function createPatchworkQuiltTexture(
  maxAnisotropy: number,
  repeatX: number,
  repeatZ: number,
  size: number,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    // Patchwork quilt in vivid blue, purple, and teal so the orange track stands out cleanly
    const colors = [
      '#2563EB', // bright royal blue
      '#7C3AED', // vivid purple
      '#14B8A6', // vivid teal
      '#3B82F6', // sky blue
      '#9333EA', // orchid purple
      '#0D9488', // deep teal
      '#6366F1', // indigo-blue
      '#2DD4BF', // bright aqua teal
    ];
    const grid = 4;
    const cell = size / grid;

    for (let r = 0; r < grid; r++) {
      for (let c = 0; c < grid; c++) {
        const x = c * cell;
        const y = r * cell;
        const color = colors[(r * 3 + c * 5) % colors.length];
        ctx.fillStyle = color;
        ctx.fillRect(x, y, cell, cell);

        // Subtle geometric fabric pattern inside alternating quilt squares
        const patternKind = (r + c) % 3;
        if (patternKind === 0) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
          const dotStep = cell / 4;
          for (let dr = 0; dr < 4; dr++) {
            for (let dc = 0; dc < 4; dc++) {
              ctx.beginPath();
              ctx.arc(x + (dc + 0.5) * dotStep, y + (dr + 0.5) * dotStep, cell * 0.045, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        } else if (patternKind === 1) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
          ctx.lineWidth = Math.max(2, size / 128);
          ctx.beginPath();
          ctx.moveTo(x, y + cell * 0.5);
          ctx.lineTo(x + cell * 0.5, y);
          ctx.lineTo(x + cell, y + cell * 0.5);
          ctx.lineTo(x + cell * 0.5, y + cell);
          ctx.closePath();
          ctx.stroke();
        } else {
          ctx.fillStyle = 'rgba(224, 242, 254, 0.12)';
          ctx.fillRect(x + cell * 0.15, y + cell * 0.15, cell * 0.7, cell * 0.7);
        }
      }
    }

    // Crisp quilt seam lines & subtle dashed stitching between patches
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.16)';
    ctx.lineWidth = Math.max(2, size / 160);
    for (let i = 0; i <= grid; i++) {
      const p = i * cell;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, size);
      ctx.moveTo(0, p);
      ctx.lineTo(size, p);
      ctx.stroke();
    }

    ctx.save();
    ctx.strokeStyle = 'rgba(248, 250, 252, 0.52)';
    ctx.lineWidth = Math.max(1.5, size / 256);
    ctx.setLineDash([size / 32, size / 32]);
    for (let i = 0; i < grid; i++) {
      const p = i * cell + 4;
      ctx.strokeRect(p, 4, cell - 8, size - 8);
      ctx.strokeRect(4, p, size - 8, cell - 8);
    }
    ctx.restore();
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

function paintSunsetWindowCanvas(
  canvas: HTMLCanvasElement,
  skyTop: string,
  skyHorizon: string,
): void {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Vivid sunset sky gradient (indigo-blue #5B3DF5 -> magenta #FF4FD8)
  const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
  skyGrad.addColorStop(0.0, skyTop);
  skyGrad.addColorStop(0.55, '#9B4DFF');
  skyGrad.addColorStop(1.0, skyHorizon);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, h);

  // Soft warm glow halo behind the setting sun
  const sunX = w * 0.56;
  const sunY = h * 0.66;
  const glowGrad = ctx.createRadialGradient(sunX, sunY, h * 0.04, sunX, sunY, h * 0.52);
  glowGrad.addColorStop(0.0, 'rgba(255, 245, 175, 0.92)');
  glowGrad.addColorStop(0.32, 'rgba(255, 208, 0, 0.52)');
  glowGrad.addColorStop(0.68, 'rgba(255, 79, 216, 0.25)');
  glowGrad.addColorStop(1.0, 'rgba(255, 79, 216, 0.0)');
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, w, h);

  // Glowing sun disc
  ctx.fillStyle = '#FFF7B8';
  ctx.beginPath();
  ctx.arc(sunX, sunY, h * 0.16, 0, Math.PI * 2);
  ctx.fill();

  // Crisp bright stars scattered across the upper indigo-violet sunset sky
  const stars: Array<[number, number, number]> = [
    [0.12, 0.18, 3.2],
    [0.24, 0.28, 2.2],
    [0.34, 0.14, 3.8],
    [0.48, 0.22, 2.5],
    [0.68, 0.15, 3.6],
    [0.81, 0.24, 2.8],
    [0.9, 0.17, 2.4],
    [0.18, 0.42, 2.0],
    [0.77, 0.39, 2.2],
  ];
  ctx.fillStyle = '#FFFFFF';
  for (const [sxFrac, syFrac, r] of stars) {
    const sx = w * sxFrac;
    const sy = h * syFrac;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();

    // 4-point sparkle cross for larger stars
    if (r >= 3.0) {
      ctx.fillRect(sx - r * 2.1, sy - 0.8, r * 4.2, 1.6);
      ctx.fillRect(sx - 0.8, sy - r * 2.1, 1.6, r * 4.2);
    }
  }
}

function createFloorPatternTexture(
  maxAnisotropy: number,
  repeatX: number,
  repeatZ: number,
): THREE.CanvasTexture {
  const size = 128;
  const half = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#F3E8FF';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#A7F3D0';
    ctx.fillRect(0, 0, half, half);
    ctx.fillRect(half, half, half, half);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatZ);
  tex.anisotropy = Math.min(2, maxAnisotropy);
  tex.needsUpdate = true;
  return tex;
}

interface ZoneMarkerSpot {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly colorHex: string;
}

function computeZoneMarkerSpots(course: Course): ZoneMarkerSpot[] {
  const zonePalette = ['#FF2D3D', '#FFD000', '#00E5FF', '#0A5CFF', '#22C55E', '#FF4FD8', '#A855F7'];
  const allRoutes = course.getAllRoutes();
  const routeSamples: Array<{ x: number; z: number; hw: number }> = [];
  for (const r of allRoutes) {
    const samples = r.getSamples();
    for (let i = 0; i < samples.length; i += 2) {
      const f = samples[i];
      routeSamples.push({ x: f.position.x, z: f.position.z, hw: f.width * 0.5 });
    }
  }

  const isClear = (x: number, z: number): boolean => {
    for (const s of routeSamples) {
      if (Math.hypot(x - s.x, z - s.z) < s.hw + 5.5) {
        return false;
      }
    }
    return true;
  };

  const spots: ZoneMarkerSpot[] = [];
  const mainZones = course.getZoneStarts();
  for (let i = 0; i < mainZones.length; i++) {
    const z = mainZones[i];
    const sampleS = Math.min(course.getLength() - 4, z.s + 12);
    const frame = course.getFrameAt(sampleS);
    const halfW = frame.width * 0.5;
    const baseOffset = halfW + 7.5;
    let mx = frame.position.x - frame.right.x * baseOffset;
    let mz = frame.position.z - frame.right.z * baseOffset;
    if (!isClear(mx, mz)) {
      mx = frame.position.x + frame.right.x * baseOffset;
      mz = frame.position.z + frame.right.z * baseOffset;
    }
    if (isClear(mx, mz)) {
      spots.push({
        name: z.name,
        x: mx,
        y: Math.max(0, frame.position.y - 1.5),
        z: mz,
        colorHex: zonePalette[i % zonePalette.length],
      });
    }
  }

  for (const branch of course.getBranchRoutes()) {
    const midS = branch.getLength() * 0.5;
    const frame = branch.getFrameAt(midS);
    const baseOffset = frame.width * 0.5 + 7.5;
    let mx = frame.position.x + frame.right.x * baseOffset;
    let mz = frame.position.z + frame.right.z * baseOffset;
    if (!isClear(mx, mz)) {
      mx = frame.position.x - frame.right.x * baseOffset;
      mz = frame.position.z - frame.right.z * baseOffset;
    }
    if (isClear(mx, mz)) {
      spots.push({
        name: branch.name,
        x: mx,
        y: Math.max(0, frame.position.y - 1.5),
        z: mz,
        colorHex: '#00E5FF',
      });
    }
  }

  return spots;
}

export const bedroomTheme: ThemeDefinition = {
  id: 'bedroom',
  background: {
    type: 'skybox',
    params: {
      vivid: {
        skyTop: '#5B3DF5',
        skyHorizon: '#FF4FD8',
        groundBounce: '#6EE7B7',
        fogColor: '#E9D5FF',
      },
      pastel: {
        skyTop: '#7C65F7',
        skyHorizon: '#FF85E4',
        groundBounce: '#A7F3D0',
        fogColor: '#F3E8FF',
      },
    },
  },
  lightingProfile: {
    id: 'bedroom-sunset-bright',
    vivid: {
      hemisphereSkyColor: '#F3E8FF',
      hemisphereGroundColor: '#A7F3D0',
      hemisphereIntensity: 1.05,
      sunColor: '#FFF5EB',
      sunIntensity: 2.75,
      exposure: 1.02,
      envIntensity: 0.45,
      showRoomShell: false,
    },
    pastel: {
      hemisphereSkyColor: '#FAF5FF',
      hemisphereGroundColor: '#CCFBF1',
      hemisphereIntensity: 1.1,
      sunColor: '#FFF8F0',
      sunIntensity: 2.55,
      exposure: 1.0,
      envIntensity: 0.42,
      showRoomShell: false,
    },
  },
  qualityTiers: buildBedroomQualityTiers(),
  buildScenery(context: ThemeSceneryContext): ThemeSceneryHandle {
    const group = new THREE.Group();
    group.name = 'BedroomBaseScenery';

    const effectivePreset: GraphicsPreset = context.graphicsPreset ?? 'penuh';
    const isSafePreset = effectivePreset === 'hemat';
    const qualityPreset = CONFIG.quality.levels[isSafePreset ? 'mobile' : context.quality];
    const castShadows = effectivePreset === 'penuh' && qualityPreset.shadowsEnabled;
    const receiveShadows = effectivePreset === 'seimbang' || castShadows;
    const effectiveAnisotropy = isSafePreset
      ? Math.min(2, context.maxAnisotropy)
      : context.maxAnisotropy;

    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    const textures: THREE.Texture[] = [];
    const instanced: THREE.InstancedMesh[] = [];

    const bounds = context.course.getBounds();
    const cx = bounds.center.x;
    const cz = bounds.center.z;
    const spanX = bounds.max.x - bounds.min.x;
    const spanZ = bounds.max.z - bounds.min.z;

    const bedW = Math.ceil((spanX + 128) / 20) * 20;
    const bedD = Math.ceil((spanZ + 128) / 20) * 20;
    const halfBedW = bedW * 0.5;
    const halfBedD = bedD * 0.5;

    const roomW = bedW + 150;
    const roomD = bedD + 150;
    const halfRoomW = roomW * 0.5;
    const halfRoomD = roomD * 0.5;
    const floorY = -30;

    // 1. Giant Patchwork Quilt Bed Surface (y = 0) + Mattress Side Skirt + Simple Bed Frame Rim
    const quiltTexSize = isSafePreset ? 256 : 512;
    const quiltTex = createPatchworkQuiltTexture(
      effectiveAnisotropy,
      Math.max(8, Math.round(bedW / 32)),
      Math.max(8, Math.round(bedD / 32)),
      quiltTexSize,
    );
    textures.push(quiltTex);

    const quiltMat = createSurfaceMaterial(effectivePreset, {
      map: quiltTex,
      roughness: 0.72,
      metalness: 0.0,
      fog: false,
    });
    materials.push(quiltMat);

    const bedTopGeom = new THREE.PlaneGeometry(bedW, bedD);
    bedTopGeom.rotateX(-Math.PI / 2);
    geometries.push(bedTopGeom);

    const bedTopMesh = new THREE.Mesh(bedTopGeom, quiltMat);
    bedTopMesh.name = 'BedroomQuiltSurface';
    bedTopMesh.position.set(cx, 0, cz);
    bedTopMesh.receiveShadow = receiveShadows;
    freezeStatic(bedTopMesh);
    group.add(bedTopMesh);

    // Soft lavender mattress skirt + bright cream/mint bed frame trim below y = 0
    const mattressH = 12;
    const mattressGeom = new THREE.BoxGeometry(bedW - 1, mattressH, bedD - 1);
    mattressGeom.translate(cx, -mattressH * 0.5 - 0.1, cz);
    geometries.push(mattressGeom);

    const mattressMat = createSurfaceMaterial(effectivePreset, {
      color: '#EDE9FE',
      roughness: 0.65,
      metalness: 0.0,
      fog: false,
    });
    materials.push(mattressMat);

    const mattressMesh = new THREE.Mesh(mattressGeom, mattressMat);
    mattressMesh.name = 'BedroomMattressBase';
    mattressMesh.receiveShadow = receiveShadows;
    freezeStatic(mattressMesh);
    group.add(mattressMesh);

    const frameH = Math.abs(floorY) - mattressH;
    const frameGeom = new THREE.BoxGeometry(bedW + 10, frameH, bedD + 10);
    frameGeom.translate(cx, -mattressH - frameH * 0.5, cz);
    geometries.push(frameGeom);

    const frameMat = createSurfaceMaterial(effectivePreset, {
      color: '#C4B5FD',
      roughness: 0.52,
      metalness: 0.04,
      fog: false,
    });
    materials.push(frameMat);

    const frameMesh = new THREE.Mesh(frameGeom, frameMat);
    frameMesh.name = 'BedroomBedFrame';
    frameMesh.receiveShadow = receiveShadows;
    freezeStatic(frameMesh);
    group.add(frameMesh);

    // 2. Bright Lower Bedroom Floor (y = -30)
    const floorTex = createFloorPatternTexture(
      effectiveAnisotropy,
      Math.max(10, Math.round(roomW / 32)),
      Math.max(10, Math.round(roomD / 32)),
    );
    textures.push(floorTex);

    const floorMat = createSurfaceMaterial(effectivePreset, {
      map: floorTex,
      roughness: 0.6,
      metalness: 0.0,
      fog: false,
    });
    materials.push(floorMat);

    const floorGeom = new THREE.PlaneGeometry(roomW, roomD);
    floorGeom.rotateX(-Math.PI / 2);
    geometries.push(floorGeom);

    const floorMesh = new THREE.Mesh(floorGeom, floorMat);
    floorMesh.name = 'BedroomLowerFloor';
    floorMesh.position.set(cx, floorY, cz);
    floorMesh.receiveShadow = receiveShadows;
    freezeStatic(floorMesh);
    group.add(floorMesh);

    // 3. Bright Flat Walls in Lilac (back/front) and Mint (left/right), NO fog
    const wallT = 6;
    const wallTopY = 185;
    const wallTotalH = wallTopY - floorY;
    const wallCenterY = floorY + wallTotalH * 0.5;
    const backZ = cz - halfRoomD;
    const frontZ = cz + halfRoomD;
    const leftX = cx - halfRoomW;
    const rightX = cx + halfRoomW;

    const lilacGeoms: THREE.BufferGeometry[] = [];
    const backWall = new THREE.BoxGeometry(roomW + wallT * 2, wallTotalH, wallT);
    backWall.translate(cx, wallCenterY, backZ);
    lilacGeoms.push(backWall);

    const frontWall = new THREE.BoxGeometry(roomW + wallT * 2, wallTotalH, wallT);
    frontWall.translate(cx, wallCenterY, frontZ);
    lilacGeoms.push(frontWall);

    const lilacGeom = mergeNormalized(lilacGeoms);
    geometries.push(lilacGeom);
    const lilacMat = createSurfaceMaterial(effectivePreset, {
      color: '#D8B4FE',
      roughness: 0.78,
      metalness: 0.0,
      fog: false,
    });
    materials.push(lilacMat);

    const lilacMesh = new THREE.Mesh(lilacGeom, lilacMat);
    lilacMesh.name = 'BedroomLilacWalls';
    lilacMesh.receiveShadow = receiveShadows;
    freezeStatic(lilacMesh);
    group.add(lilacMesh);

    const mintGeoms: THREE.BufferGeometry[] = [];
    const leftWall = new THREE.BoxGeometry(wallT, wallTotalH, roomD + wallT * 2);
    leftWall.translate(leftX, wallCenterY, cz);
    mintGeoms.push(leftWall);

    const rightWall = new THREE.BoxGeometry(wallT, wallTotalH, roomD + wallT * 2);
    rightWall.translate(rightX, wallCenterY, cz);
    mintGeoms.push(rightWall);

    const mintGeom = mergeNormalized(mintGeoms);
    geometries.push(mintGeom);
    const mintMat = createSurfaceMaterial(effectivePreset, {
      color: '#6EE7B7',
      roughness: 0.78,
      metalness: 0.0,
      fog: false,
    });
    materials.push(mintMat);

    const mintMesh = new THREE.Mesh(mintGeom, mintMat);
    mintMesh.name = 'BedroomMintWalls';
    mintMesh.receiveShadow = receiveShadows;
    freezeStatic(mintMesh);
    group.add(mintMesh);

    // 4. Huge Bedroom Window on Back Wall (-Z) with Vivid Sunset Sky (magenta #FF4FD8 -> indigo #5B3DF5), Sun & Stars
    const windowCanvas = document.createElement('canvas');
    windowCanvas.width = isSafePreset ? 256 : 512;
    windowCanvas.height = isSafePreset ? 128 : 256;
    const initSky =
      context.presetName === 'pastel'
        ? bedroomTheme.background.params.pastel
        : bedroomTheme.background.params.vivid;
    paintSunsetWindowCanvas(windowCanvas, initSky.skyTop, initSky.skyHorizon);

    const windowSkyTex = new THREE.CanvasTexture(windowCanvas);
    windowSkyTex.colorSpace = THREE.SRGBColorSpace;
    windowSkyTex.wrapS = THREE.ClampToEdgeWrapping;
    windowSkyTex.wrapT = THREE.ClampToEdgeWrapping;
    windowSkyTex.needsUpdate = true;
    textures.push(windowSkyTex);

    const windowW = 360;
    const windowH = 132;
    const windowCenterY = 104;
    const windowZ = backZ + wallT * 0.5 + 1.2;

    const skyPaneGeom = new THREE.PlaneGeometry(windowW, windowH);
    geometries.push(skyPaneGeom);
    const skyPaneMat = new THREE.MeshBasicMaterial({
      map: windowSkyTex,
      fog: false,
    });
    materials.push(skyPaneMat);

    const skyPaneMesh = new THREE.Mesh(skyPaneGeom, skyPaneMat);
    skyPaneMesh.name = 'BedroomSunsetWindowSky';
    skyPaneMesh.position.set(cx, windowCenterY, windowZ);
    freezeStatic(skyPaneMesh);
    group.add(skyPaneMesh);

    const frameThick = 6;
    const frameDepth = 4.5;
    const winFrameGeoms: THREE.BufferGeometry[] = [];
    const topBar = new THREE.BoxGeometry(windowW + frameThick * 2, frameThick, frameDepth);
    topBar.translate(cx, windowCenterY + windowH * 0.5 + frameThick * 0.5, windowZ + 1.4);
    winFrameGeoms.push(topBar);
    const sillBar = new THREE.BoxGeometry(windowW + frameThick * 2 + 12, frameThick * 1.4, frameDepth + 6);
    sillBar.translate(cx, windowCenterY - windowH * 0.5 - frameThick * 0.7, windowZ + 2.4);
    winFrameGeoms.push(sillBar);
    const leftBar = new THREE.BoxGeometry(frameThick, windowH, frameDepth);
    leftBar.translate(cx - windowW * 0.5 - frameThick * 0.5, windowCenterY, windowZ + 1.4);
    winFrameGeoms.push(leftBar);
    const rightBar = new THREE.BoxGeometry(frameThick, windowH, frameDepth);
    rightBar.translate(cx + windowW * 0.5 + frameThick * 0.5, windowCenterY, windowZ + 1.4);
    winFrameGeoms.push(rightBar);
    const midVert = new THREE.BoxGeometry(3.6, windowH, 2.5);
    midVert.translate(cx, windowCenterY, windowZ + 1.0);
    winFrameGeoms.push(midVert);
    const midHoriz = new THREE.BoxGeometry(windowW, 3.6, 2.5);
    midHoriz.translate(cx, windowCenterY, windowZ + 1.0);
    winFrameGeoms.push(midHoriz);

    const winFrameGeom = mergeNormalized(winFrameGeoms);
    geometries.push(winFrameGeom);
    const winFrameMat = createSurfaceMaterial(effectivePreset, {
      color: '#FFFFFF',
      roughness: 0.36,
      metalness: 0.04,
      fog: false,
    });
    materials.push(winFrameMat);
    const winFrameMesh = new THREE.Mesh(winFrameGeom, winFrameMat);
    winFrameMesh.name = 'BedroomWindowFrame';
    freezeStatic(winFrameMesh);
    group.add(winFrameMesh);

    // 5. Simple Track Support Stanchions grounding elevated spans cleanly to the bed
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
        list.push({ x: f.position.x, y: f.position.y, z: f.position.z, hw: f.width * 0.5 });
      }
    }

    const supportSpots: Array<{ x: number; z: number; topY: number }> = [];
    for (const route of allRoutes) {
      const routeLen = route.getLength();
      for (let s = 30; s < routeLen - 22; s += 46) {
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
      const colGeom = new THREE.CylinderGeometry(1.05, 1.3, 1, 10);
      const plinthGeom = new THREE.CylinderGeometry(1.9, 2.25, 1.2, 10);
      geometries.push(colGeom, plinthGeom);

      const colMat = createSurfaceMaterial(effectivePreset, {
        color: '#F8FAFC',
        roughness: 0.42,
        metalness: 0.06,
        fog: false,
      });
      const plinthMat = createSurfaceMaterial(effectivePreset, {
        color: '#0A5CFF',
        roughness: 0.36,
        metalness: 0.1,
        fog: false,
      });
      materials.push(colMat, plinthMat);

      const colInst = new THREE.InstancedMesh(colGeom, colMat, supportSpots.length);
      const plinthInst = new THREE.InstancedMesh(plinthGeom, plinthMat, supportSpots.length);
      colInst.castShadow = castShadows;
      colInst.receiveShadow = receiveShadows;
      plinthInst.castShadow = castShadows;
      plinthInst.receiveShadow = receiveShadows;
      instanced.push(colInst, plinthInst);

      const mtx = new THREE.Matrix4();
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const scl = new THREE.Vector3();

      for (let i = 0; i < supportSpots.length; i++) {
        const spot = supportSpots[i];
        pos.set(spot.x, 0.6, spot.z);
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

    // 6. Plain Removable Placeholder Marker per Named Zone (safely off track edge; Stage K2 replaces these)
    const markerSpots = computeZoneMarkerSpots(context.course);
    if (markerSpots.length > 0) {
      const poleGeom = new THREE.CylinderGeometry(0.28, 0.36, 7.2, 8);
      const coneGeom = new THREE.ConeGeometry(1.45, 2.8, 10);
      geometries.push(poleGeom, coneGeom);

      const poleMat = createSurfaceMaterial(effectivePreset, {
        color: '#FFFFFF',
        roughness: 0.35,
        metalness: 0.08,
        fog: false,
      });
      const coneMat = createSurfaceMaterial(effectivePreset, {
        color: '#FFFFFF',
        roughness: 0.3,
        metalness: 0.05,
        fog: false,
      });
      materials.push(poleMat, coneMat);

      const poles = new THREE.InstancedMesh(poleGeom, poleMat, markerSpots.length);
      const cones = new THREE.InstancedMesh(coneGeom, coneMat, markerSpots.length);
      poles.name = 'BedroomZonePlaceholderPoles';
      cones.name = 'BedroomZonePlaceholderCones';
      instanced.push(poles, cones);

      const mtx = new THREE.Matrix4();
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const scl = new THREE.Vector3(1, 1, 1);
      const color = new THREE.Color();

      for (let i = 0; i < markerSpots.length; i++) {
        const spot = markerSpots[i];
        pos.set(spot.x, spot.y + 3.6, spot.z);
        mtx.compose(pos, quat, scl);
        poles.setMatrixAt(i, mtx);

        pos.set(spot.x, spot.y + 8.4, spot.z);
        mtx.compose(pos, quat, scl);
        cones.setMatrixAt(i, mtx);

        color.set(spot.colorHex);
        cones.setColorAt(i, color);
      }
      poles.instanceMatrix.needsUpdate = true;
      poles.computeBoundingSphere();
      cones.instanceMatrix.needsUpdate = true;
      if (cones.instanceColor) cones.instanceColor.needsUpdate = true;
      cones.computeBoundingSphere();
      freezeStatic(poles);
      freezeStatic(cones);
      group.add(poles, cones);
    }

    return {
      id: bedroomTheme.id,
      group,
      update(_dt: number, _cameraPos?: THREE.Vector3): void {
        // Static base scenery in Stage K1 (no per-frame allocations)
      },
      applyPalette(name: VisualPresetName): void {
        const nextSky =
          name === 'pastel'
            ? bedroomTheme.background.params.pastel
            : bedroomTheme.background.params.vivid;
        paintSunsetWindowCanvas(windowCanvas, nextSky.skyTop, nextSky.skyHorizon);
        windowSkyTex.needsUpdate = true;
      },
      getGroundY(x: number, z: number): number {
        const insideX = Math.abs(x - cx) <= halfBedW;
        const insideZ = Math.abs(z - cz) <= halfBedD;
        return insideX && insideZ ? 0 : floorY;
      },
      dispose(): void {
        for (const im of instanced) im.dispose();
        for (const g of geometries) g.dispose();
        for (const m of materials) m.dispose();
        for (const t of textures) t.dispose();
      },
    };
  },
  getDecorFootprints(context: ThemeSceneryContext): readonly DecorFootprint[] {
    return computeZoneMarkerSpots(context.course).map((spot, idx) => ({
      id: `bedroom-zone-marker-${idx}`,
      zone: spot.name,
      x: spot.x,
      y: spot.y,
      z: spot.z,
      radius: 1.5,
      isTrackStructure: false,
    }));
  },
};
