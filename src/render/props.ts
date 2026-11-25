// src/render/props.ts

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import type { Course } from '../core/course';
import type { QualityLevel } from './quality';

export interface PropsVisual {
  group: THREE.Group;
  dispose: () => void;
}

interface Placement {
  x: number;
  z: number;
  yaw: number;
  scale: number;
  colorIndex: number;
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

function createWallTexture(
  baseHex: string,
  stripeHex: string,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const width = 512;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = baseHex;
    ctx.fillRect(0, 0, width, height);

    // Subtle vertical wallpaper stripes
    ctx.fillStyle = stripeHex;
    ctx.globalAlpha = 0.38;
    const stripeCount = 24;
    const stripeW = width / (stripeCount * 2);
    for (let i = 0; i < stripeCount; i++) {
      ctx.fillRect(i * stripeW * 2, 0, stripeW, height);
    }
    ctx.globalAlpha = 1;

    // Subtle horizontal plaster lines (capped low-contrast, no pure white)
    ctx.fillStyle = 'rgba(15, 42, 58, 0.045)';
    for (let y = 0; y < height; y += 8) {
      ctx.fillRect(0, y, width, 1);
    }

    // Bottom darkening gradient for depth above the baseboard & floor
    const bottomGrad = ctx.createLinearGradient(0, height * 0.56, 0, height);
    bottomGrad.addColorStop(0.0, 'rgba(12, 34, 48, 0.0)');
    bottomGrad.addColorStop(1.0, 'rgba(12, 34, 48, 0.25)');
    ctx.fillStyle = bottomGrad;
    ctx.fillRect(0, height * 0.56, width, height * 0.44);

    // Corner ambient darkening on left & right wall edges
    const leftGrad = ctx.createLinearGradient(0, 0, width * 0.14, 0);
    leftGrad.addColorStop(0.0, 'rgba(10, 28, 42, 0.24)');
    leftGrad.addColorStop(1.0, 'rgba(10, 28, 42, 0.0)');
    ctx.fillStyle = leftGrad;
    ctx.fillRect(0, 0, width * 0.14, height);

    const rightGrad = ctx.createLinearGradient(width * 0.86, 0, width, 0);
    rightGrad.addColorStop(0.0, 'rgba(10, 28, 42, 0.0)');
    rightGrad.addColorStop(1.0, 'rgba(10, 28, 42, 0.24)');
    ctx.fillStyle = rightGrad;
    ctx.fillRect(width * 0.86, 0, width * 0.14, height);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createRugTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const pal = CONFIG.props.palette;
    ctx.fillStyle = pal.rugBase;
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = pal.rugBorder;
    ctx.lineWidth = 28;
    ctx.strokeRect(22, 22, size - 44, size - 44);

    ctx.strokeStyle = pal.rugPattern;
    ctx.lineWidth = 6;
    ctx.strokeRect(52, 52, size - 104, size - 104);

    ctx.fillStyle = pal.rugPattern;
    ctx.globalAlpha = 0.35;
    const step = 48;
    for (let y = 80; y < size - 80; y += step) {
      for (let x = 80; x < size - 80; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, y - 10);
        ctx.lineTo(x + 10, y);
        ctx.lineTo(x, y + 10);
        ctx.lineTo(x - 10, y);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let y = 0; y < size; y += 4) {
      ctx.fillRect(0, y, size, 1);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createSunbeamTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradY = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradY.addColorStop(0.0, 'rgba(255, 240, 200, 0.72)');
    gradY.addColorStop(0.45, 'rgba(255, 240, 200, 0.28)');
    gradY.addColorStop(1.0, 'rgba(255, 240, 200, 0.0)');
    ctx.fillStyle = gradY;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.globalCompositeOperation = 'destination-in';
    const gradX = ctx.createLinearGradient(0, 0, canvas.width, 0);
    gradX.addColorStop(0.0, 'rgba(255,255,255,0)');
    gradX.addColorStop(0.25, 'rgba(255,255,255,1)');
    gradX.addColorStop(0.75, 'rgba(255,255,255,1)');
    gradX.addColorStop(1.0, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradX;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createStripedCanTexture(
  baseHex: string,
  bandHex: string,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = baseHex;
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = bandHex;
    ctx.fillRect(0, size * 0.24, size, size * 0.16);
    ctx.fillRect(0, size * 0.62, size, size * 0.12);

    ctx.fillStyle = CONFIG.props.palette.paperCream;
    ctx.fillRect(0, size * 0.43, size, size * 0.15);

    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.fillRect(0, 0, size, 10);
    ctx.fillRect(0, size - 10, size, 10);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createLetterBlockTexture(
  letter: string,
  inkHex: string,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = CONFIG.props.palette.woodLight;
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = CONFIG.props.palette.woodDark;
    ctx.lineWidth = 22;
    ctx.strokeRect(12, 12, size - 24, size - 24);

    ctx.fillStyle = CONFIG.props.palette.paperCream;
    ctx.fillRect(30, 30, size - 60, size - 60);

    ctx.fillStyle = inkHex;
    ctx.font = '900 132px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, size * 0.5, size * 0.53);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createToyBallTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const pal = CONFIG.props.palette;
    const bands = [pal.pastelBlue, pal.paperCream, pal.pastelRose, pal.pastelSand];
    const bandW = size / bands.length;
    for (let i = 0; i < bands.length; i++) {
      ctx.fillStyle = bands[i];
      ctx.fillRect(i * bandW, 0, bandW + 1, size);
    }
    ctx.fillStyle = pal.paperCream;
    ctx.fillRect(0, 0, size, size * 0.14);
    ctx.fillRect(0, size * 0.86, size, size * 0.14);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createPaperTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = CONFIG.props.palette.paperCream;
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = 'rgba(155, 181, 201, 0.45)';
    ctx.lineWidth = 2;
    for (let y = 32; y < size - 16; y += 22) {
      ctx.beginPath();
      ctx.moveTo(22, y);
      ctx.lineTo(size - 22, y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(207, 163, 157, 0.5)';
    ctx.beginPath();
    ctx.moveTo(46, 0);
    ctx.lineTo(46, size);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function buildProps(
  course: Course,
  qualityLevel: QualityLevel,
  maxAnisotropy = 8,
): PropsVisual {
  const cfg = CONFIG.props;
  const pal = cfg.palette;
  const qualityPreset = CONFIG.quality.levels[qualityLevel];
  const densityScale = cfg.density * qualityPreset.propsDensityScale;

  const group = new THREE.Group();
  group.name = 'RoomPropsGroup';

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

  const rand = mulberry32(cfg.seed);
  const bounds = course.getBounds();
  const roomCenterX = bounds.center.x;
  const roomCenterZ = bounds.center.z;
  const halfW = cfg.roomSize.width * 0.5;
  const halfD = cfg.roomSize.depth * 0.5;
  const roomH = cfg.roomSize.height;

  // Dense horizontal clearance sample list across the entire course + start camera zone
  const allSamples = course.getSamples();
  const clearancePoints: Array<{ x: number; z: number }> = [];
  const sampleStride = Math.max(1, Math.floor(2.0 / CONFIG.course.stepLength));
  for (let i = 0; i < allSamples.length; i += sampleStride) {
    clearancePoints.push({ x: allSamples[i].position.x, z: allSamples[i].position.z });
  }
  const startFrame = course.getFrameAt(CONFIG.car.startS);
  clearancePoints.push({
    x: startFrame.position.x - startFrame.tangent.x * 10,
    z: startFrame.position.z - startFrame.tangent.z * 10,
  });

  const placedCircles: Array<{ x: number; z: number; r: number }> = [];

  const isClearOfTrack = (x: number, z: number, radius: number): boolean => {
    if (
      Math.abs(x - roomCenterX) > halfW - radius - 8 ||
      Math.abs(z - roomCenterZ) > halfD - radius - 8
    ) {
      return false;
    }
    const minCourseDistSq = (cfg.clearance + radius) * (cfg.clearance + radius);
    for (let i = 0; i < clearancePoints.length; i++) {
      const dx = x - clearancePoints[i].x;
      const dz = z - clearancePoints[i].z;
      if (dx * dx + dz * dz < minCourseDistSq) {
        return false;
      }
    }
    for (let i = 0; i < placedCircles.length; i++) {
      const other = placedCircles[i];
      const minSep = radius + other.r + 3.0;
      const dx = x - other.x;
      const dz = z - other.z;
      if (dx * dx + dz * dz < minSep * minSep) {
        return false;
      }
    }
    return true;
  };

  const pastelColors = [
    pal.pastelBlue,
    pal.pastelMint,
    pal.pastelRose,
    pal.pastelSand,
    pal.pastelLavender,
    pal.pastelSlate,
  ];

  // =========================================================================
  // 1. Giant Room Walls + Baseboards + Sunlit Window + Sunbeams
  // =========================================================================
  const backWallTex = trackTex(
    createWallTexture(cfg.wallColor, pal.wallStripe, maxAnisotropy),
  );
  const backWallMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: backWallTex,
      roughness: 0.9,
      metalness: 0.0,
    }),
  );

  const sideWallTex = trackTex(
    createWallTexture(cfg.sideWallColor, pal.sideWallStripe, maxAnisotropy),
  );
  const sideWallMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: sideWallTex,
      roughness: 0.9,
      metalness: 0.0,
    }),
  );

  const wallThickness = 4;
  const backFrontWallDefs = [
    { w: cfg.roomSize.width + wallThickness * 2, d: wallThickness, x: roomCenterX, z: roomCenterZ - halfD },
    { w: cfg.roomSize.width + wallThickness * 2, d: wallThickness, x: roomCenterX, z: roomCenterZ + halfD },
  ];
  const sideWallDefs = [
    { w: wallThickness, d: cfg.roomSize.depth, x: roomCenterX - halfW, z: roomCenterZ },
    { w: wallThickness, d: cfg.roomSize.depth, x: roomCenterX + halfW, z: roomCenterZ },
  ];

  const backWallGeoms: THREE.BufferGeometry[] = [];
  const sideWallGeoms: THREE.BufferGeometry[] = [];
  const baseboardGeomsToMerge: THREE.BufferGeometry[] = [];

  for (const wd of backFrontWallDefs) {
    const wg = new THREE.BoxGeometry(wd.w, roomH, wd.d);
    wg.translate(wd.x, roomH * 0.5, wd.z);
    backWallGeoms.push(wg);

    const bb = new THREE.BoxGeometry(wd.w - 1, 4.5, wd.d + 1.2);
    bb.translate(wd.x, 2.25, wd.z);
    baseboardGeomsToMerge.push(bb);
  }

  for (const wd of sideWallDefs) {
    const wg = new THREE.BoxGeometry(wd.w, roomH, wd.d);
    wg.translate(wd.x, roomH * 0.5, wd.z);
    sideWallGeoms.push(wg);

    const bb = new THREE.BoxGeometry(wd.w + 1.2, 4.5, wd.d - 1);
    bb.translate(wd.x, 2.25, wd.z);
    baseboardGeomsToMerge.push(bb);
  }

  const backWallsMesh = new THREE.Mesh(trackGeom(mergeWithCleanup(backWallGeoms)), backWallMat);
  backWallsMesh.castShadow = false;
  backWallsMesh.receiveShadow = true;
  group.add(backWallsMesh);

  const sideWallsMesh = new THREE.Mesh(trackGeom(mergeWithCleanup(sideWallGeoms)), sideWallMat);
  sideWallsMesh.castShadow = false;
  sideWallsMesh.receiveShadow = true;
  group.add(sideWallsMesh);

  const woodDarkMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: pal.woodDark,
      roughness: 0.68,
      metalness: 0.02,
    }),
  );
  const woodLightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: pal.woodLight,
      roughness: 0.64,
      metalness: 0.02,
    }),
  );
  const baseboardMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: cfg.baseboardColor,
      roughness: 0.66,
      metalness: 0.02,
    }),
  );

  const baseboardsMesh = new THREE.Mesh(
    trackGeom(mergeWithCleanup(baseboardGeomsToMerge)),
    baseboardMat,
  );
  baseboardsMesh.castShadow = false;
  baseboardsMesh.receiveShadow = true;
  group.add(baseboardsMesh);

  // Sunlit multi-pane window on the +X wall (aligned with CONFIG.lighting.sunOffset)
  const windowX = roomCenterX + halfW - 2.3;
  const windowCenterY = 88;
  const windowZ = roomCenterZ + 18;
  const windowW = 148;
  const windowH = 86;

  const windowSkyMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: pal.windowSky,
      fog: false,
    }),
  );
  const windowPaneGeom = trackGeom(new THREE.PlaneGeometry(windowW - 6, windowH - 6));
  windowPaneGeom.rotateY(-Math.PI / 2);
  const windowPane = new THREE.Mesh(windowPaneGeom, windowSkyMat);
  windowPane.position.set(windowX - 0.3, windowCenterY, windowZ);
  windowPane.castShadow = false;
  group.add(windowPane);

  const windowFrameMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: pal.windowFrame,
      roughness: 0.55,
      metalness: 0.04,
    }),
  );

  const frameGeoms: THREE.BufferGeometry[] = [];
  const barThickness = 3.6;
  const barDepth = 3.2;
  // Top & bottom sills
  const topBar = new THREE.BoxGeometry(barDepth, barThickness, windowW + 6);
  topBar.translate(windowX - 1.0, windowCenterY + windowH * 0.5, windowZ);
  frameGeoms.push(topBar);
  const botBar = new THREE.BoxGeometry(barDepth * 1.6, barThickness * 1.2, windowW + 10);
  botBar.translate(windowX - 1.5, windowCenterY - windowH * 0.5, windowZ);
  frameGeoms.push(botBar);
  // Vertical jambs & mullions
  for (const frac of [-0.5, -0.17, 0.17, 0.5]) {
    const vBar = new THREE.BoxGeometry(barDepth, windowH, barThickness * 0.85);
    vBar.translate(windowX - 1.0, windowCenterY, windowZ + frac * windowW);
    frameGeoms.push(vBar);
  }
  // Horizontal mullion
  const midBar = new THREE.BoxGeometry(barDepth, barThickness * 0.75, windowW);
  midBar.translate(windowX - 1.0, windowCenterY + 6, windowZ);
  frameGeoms.push(midBar);

  const windowFrameMesh = new THREE.Mesh(trackGeom(mergeWithCleanup(frameGeoms)), windowFrameMat);
  windowFrameMesh.castShadow = false;
  windowFrameMesh.receiveShadow = false;
  group.add(windowFrameMesh);

  // Diagonal additive sunbeam planes kept strictly near the sunlit window
  const sunbeamTex = trackTex(createSunbeamTexture());
  const sunbeamMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: sunbeamTex,
      color: pal.sunbeamColor,
      transparent: true,
      opacity: CONFIG.fx.windowShaft.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
    }),
  );

  const sunOffset = CONFIG.lighting.sunOffset;
  const beamDir = new THREE.Vector3(-sunOffset.x, -sunOffset.y, -sunOffset.z).normalize();
  const beamUpRef = new THREE.Vector3(0, 1, 0);
  const beamSide = new THREE.Vector3().crossVectors(beamDir, beamUpRef).normalize();
  const beamPlaneNormal = new THREE.Vector3().crossVectors(beamSide, beamDir).normalize();
  const beamBasis = new THREE.Matrix4().makeBasis(
    beamSide,
    beamDir.clone().negate(),
    beamPlaneNormal,
  );
  const beamGeom = trackGeom(new THREE.PlaneGeometry(46, 110));
  const beamOffsets = [-40, -14, 14, 40];
  for (const dz of beamOffsets) {
    const beam = new THREE.Mesh(beamGeom, sunbeamMat);
    beam.setRotationFromMatrix(beamBasis);
    beam.position
      .set(windowX - 5, windowCenterY - 2, windowZ + dz)
      .addScaledVector(beamDir, 52);
    beam.castShadow = false;
    beam.receiveShadow = false;
    group.add(beam);
  }

  // =========================================================================
  // 2. Woven Pastel Floor Rugs (prevent Z-fighting with wood floor via polygonOffset)
  // =========================================================================
  const rugTex = trackTex(createRugTexture(maxAnisotropy));
  const rugMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: rugTex,
      roughness: 0.94,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );

  const mainRugGeom = trackGeom(new THREE.PlaneGeometry(240, 185));
  mainRugGeom.rotateX(-Math.PI / 2);
  const mainRug = new THREE.Mesh(mainRugGeom, rugMat);
  mainRug.position.set(roomCenterX + 8, 0.025, roomCenterZ - 12);
  mainRug.castShadow = false;
  mainRug.receiveShadow = true;
  group.add(mainRug);

  // =========================================================================
  // 3. Decorative Support Pillars under Straight & Curve Track Spans
  // =========================================================================
  const gaps = course.getGapRanges();
  const totalLength = course.getLength();
  const supportSpots: Array<{ x: number; z: number; topY: number; style: number }> = [];

  for (let s = 14; s <= totalLength - 10; s += cfg.supportSpacing) {
    const seg = course.getSegmentAt(s);
    if (seg.type !== 'straight' && seg.type !== 'curve') {
      continue;
    }

    let nearGapOrLanding = false;
    for (const g of gaps) {
      if (s >= g.startS - 8 && s <= g.endS + cfg.supportLandingExclusion) {
        nearGapOrLanding = true;
        break;
      }
    }
    if (nearGapOrLanding) {
      continue;
    }

    const frame = course.getFrameAt(s);
    if (frame.up.y < 0.85) {
      continue;
    }
    const topY = frame.position.y - CONFIG.course.trackThickness - 0.14;
    if (topY <= 1.8) {
      continue;
    }

    // Skip if another distant span of the course overlaps nearby in XZ
    let overlapsOtherSpan = false;
    for (let i = 0; i < allSamples.length; i += sampleStride) {
      const other = allSamples[i];
      if (Math.abs(other.s - s) < 18) {
        continue;
      }
      const dx = other.position.x - frame.position.x;
      const dz = other.position.z - frame.position.z;
      if (dx * dx + dz * dz < 64) {
        overlapsOtherSpan = true;
        break;
      }
    }
    if (overlapsOtherSpan) {
      continue;
    }

    supportSpots.push({
      x: frame.position.x,
      z: frame.position.z,
      topY,
      style: supportSpots.length % 2,
    });
  }

  if (supportSpots.length > 0) {
    // Each pillar uses a lower wood block + upper pastel toy column + crisp cap
    const baseGeom = trackGeom(new THREE.BoxGeometry(3.2, 1, 3.2));
    const colGeom = trackGeom(new THREE.CylinderGeometry(1.15, 1.35, 1, 16));
    const capGeom = trackGeom(new THREE.BoxGeometry(3.6, 0.45, 3.6));

    const pillarPastelMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.58,
        metalness: 0.04,
      }),
    );

    const baseInst = new THREE.InstancedMesh(baseGeom, woodLightMat, supportSpots.length);
    const colInst = new THREE.InstancedMesh(colGeom, pillarPastelMat, supportSpots.length);
    const capInst = new THREE.InstancedMesh(capGeom, woodDarkMat, supportSpots.length);

    baseInst.castShadow = true;
    baseInst.receiveShadow = true;
    colInst.castShadow = true;
    colInst.receiveShadow = true;
    capInst.castShadow = true;
    capInst.receiveShadow = true;

    const mtx = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    const tmpColor = new THREE.Color();

    supportSpots.forEach((spot, i) => {
      const capH = 0.45;
      const usableH = Math.max(1.2, spot.topY - capH);
      const baseH = Math.min(2.2, usableH * 0.35);
      const colH = Math.max(0.5, usableH - baseH);

      quat.setFromAxisAngle(beamUpRef, (i * 0.47) % (Math.PI * 0.5));

      pos.set(spot.x, baseH * 0.5, spot.z);
      scl.set(1, baseH, 1);
      mtx.compose(pos, quat, scl);
      baseInst.setMatrixAt(i, mtx);

      pos.set(spot.x, baseH + colH * 0.5, spot.z);
      scl.set(1, colH, 1);
      mtx.compose(pos, quat, scl);
      colInst.setMatrixAt(i, mtx);
      tmpColor.set(pastelColors[i % pastelColors.length]);
      colInst.setColorAt(i, tmpColor);

      pos.set(spot.x, spot.topY - capH * 0.5, spot.z);
      scl.set(1, 1, 1);
      mtx.compose(pos, quat, scl);
      capInst.setMatrixAt(i, mtx);
    });

    baseInst.instanceMatrix.needsUpdate = true;
    baseInst.computeBoundingSphere();
    colInst.instanceMatrix.needsUpdate = true;
    if (colInst.instanceColor) colInst.instanceColor.needsUpdate = true;
    colInst.computeBoundingSphere();
    capInst.instanceMatrix.needsUpdate = true;
    capInst.computeBoundingSphere();

    group.add(baseInst, colInst, capInst);
  }

  // =========================================================================
  // 4. Hero Assemblies (Giant Desk Lamp + Giant Wooden Bookshelf)
  // =========================================================================
  const tryPickHeroSpot = (
    targetX: number,
    targetZ: number,
    radius: number,
  ): { x: number; z: number } => {
    for (let attempt = 0; attempt < 40; attempt++) {
      const spread = attempt * 6;
      const x = targetX + (attempt === 0 ? 0 : (rand() - 0.5) * spread * 2);
      const z = targetZ + (attempt === 0 ? 0 : (rand() - 0.5) * spread * 2);
      if (isClearOfTrack(x, z, radius)) {
        placedCircles.push({ x, z, r: radius });
        return { x, z };
      }
    }
    const fallbackX = roomCenterX - halfW + radius + 14;
    const fallbackZ = roomCenterZ - halfD + radius + 14;
    placedCircles.push({ x: fallbackX, z: fallbackZ, r: radius });
    return { x: fallbackX, z: fallbackZ };
  };

  // Hero 1: Giant Desk Lamp near far perimeter
  const lampSpot = tryPickHeroSpot(roomCenterX + 148, roomCenterZ - 148, 20);
  {
    const lampMetalMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: pal.lampMetal,
        roughness: 0.35,
        metalness: 0.65,
      }),
    );
    const lampShadeMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: pal.lampShade,
        roughness: 0.55,
        metalness: 0.08,
      }),
    );
    const lampBulbMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: pal.sunbeamColor,
        emissive: pal.sunbeamColor,
        emissiveIntensity: 1.4,
        roughness: 0.25,
      }),
    );

    const metalParts: THREE.BufferGeometry[] = [];
    const baseDisc = new THREE.CylinderGeometry(13, 15, 3.2, 24);
    baseDisc.translate(0, 1.6, 0);
    metalParts.push(baseDisc);

    const lowerArm = new THREE.CylinderGeometry(1.4, 1.7, 46, 12);
    lowerArm.rotateZ(0.28);
    lowerArm.translate(-6, 23, 0);
    metalParts.push(lowerArm);

    const joint = new THREE.SphereGeometry(2.6, 12, 10);
    joint.translate(-12.5, 44.5, 0);
    metalParts.push(joint);

    const upperArm = new THREE.CylinderGeometry(1.2, 1.4, 42, 12);
    upperArm.rotateZ(-0.68);
    upperArm.translate(1.5, 59, 0);
    metalParts.push(upperArm);

    const lampMetalMesh = new THREE.Mesh(trackGeom(mergeWithCleanup(metalParts)), lampMetalMat);
    const shadeGeom = trackGeom(new THREE.ConeGeometry(13.5, 18, 24, 1, true));
    shadeGeom.rotateZ(-0.55);
    shadeGeom.translate(18, 69, 0);
    const shadeMesh = new THREE.Mesh(shadeGeom, lampShadeMat);

    const bulbGeom = trackGeom(new THREE.SphereGeometry(4.2, 14, 12));
    bulbGeom.translate(20, 64, 0);
    const bulbMesh = new THREE.Mesh(bulbGeom, lampBulbMat);

    const lampGroup = new THREE.Group();
    lampGroup.position.set(lampSpot.x, 0, lampSpot.z);
    lampGroup.rotation.y = Math.atan2(roomCenterX - lampSpot.x, roomCenterZ - lampSpot.z) - Math.PI * 0.5;

    const castLampShadow =
      Math.hypot(lampSpot.x - roomCenterX, lampSpot.z - roomCenterZ) <= cfg.shadowDistance + 30;
    lampMetalMesh.castShadow = castLampShadow;
    lampMetalMesh.receiveShadow = true;
    shadeMesh.castShadow = castLampShadow;
    shadeMesh.receiveShadow = true;
    lampGroup.add(lampMetalMesh, shadeMesh, bulbMesh);
    group.add(lampGroup);
  }

  // Hero 2: Giant Wooden Bookshelf against back-left wall area
  const shelfSpot = tryPickHeroSpot(roomCenterX - 155, roomCenterZ - 155, 22);
  {
    const shelfParts: THREE.BufferGeometry[] = [];
    const shelfW = 68;
    const shelfH = 92;
    const shelfD = 22;

    const back = new THREE.BoxGeometry(shelfW, shelfH, 2.2);
    back.translate(0, shelfH * 0.5, -shelfD * 0.5 + 1.1);
    shelfParts.push(back);

    for (const side of [-1, 1]) {
      const sidePanel = new THREE.BoxGeometry(2.8, shelfH, shelfD);
      sidePanel.translate(side * (shelfW * 0.5 - 1.4), shelfH * 0.5, 0);
      shelfParts.push(sidePanel);
    }

    const shelfHeights = [2, 24, 48, 72, shelfH - 1.5];
    for (const sy of shelfHeights) {
      const plank = new THREE.BoxGeometry(shelfW, 2.6, shelfD);
      plank.translate(0, sy, 0);
      shelfParts.push(plank);
    }

    const shelfMesh = new THREE.Mesh(trackGeom(mergeWithCleanup(shelfParts)), woodDarkMat);

    // Merged shelf books
    const shelfBookGeoms: THREE.BufferGeometry[] = [];
    for (let row = 0; row < 3; row++) {
      const baseY = shelfHeights[row] + 1.3;
      let cursorX = -shelfW * 0.5 + 6;
      while (cursorX < shelfW * 0.5 - 8) {
        const bw = 3.2 + rand() * 3.4;
        const bh = 14 + rand() * 6.5;
        const bd = 14 + rand() * 3.5;
        const book = new THREE.BoxGeometry(bw, bh, bd);
        book.translate(cursorX + bw * 0.5, baseY + bh * 0.5, 1.5);
        shelfBookGeoms.push(book);
        cursorX += bw + 0.6;
      }
    }

    const shelfBooksMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: pal.pastelBlue,
        roughness: 0.72,
        metalness: 0.02,
      }),
    );
    const shelfBooksMesh = new THREE.Mesh(
      trackGeom(mergeWithCleanup(shelfBookGeoms)),
      shelfBooksMat,
    );

    const shelfGroup = new THREE.Group();
    shelfGroup.position.set(shelfSpot.x, 0, shelfSpot.z);
    shelfGroup.rotation.y = Math.PI * 0.25;
    shelfMesh.castShadow = false;
    shelfMesh.receiveShadow = true;
    shelfBooksMesh.castShadow = false;
    shelfBooksMesh.receiveShadow = true;
    shelfGroup.add(shelfMesh, shelfBooksMesh);
    group.add(shelfGroup);
  }

  // =========================================================================
  // 5. Scattered Giant Room Props (InstancedMesh, strictly outside clearance)
  // =========================================================================
  function generatePlacements(targetCount: number, baseRadius: number): Placement[] {
    const list: Placement[] = [];
    const maxAttempts = targetCount * 40;
    for (let a = 0; a < maxAttempts && list.length < targetCount; a++) {
      const angle = rand() * Math.PI * 2;
      const dist = 28 + Math.sqrt(rand()) * (Math.min(halfW, halfD) - 34);
      const x = roomCenterX + Math.cos(angle) * dist;
      const z = roomCenterZ + Math.sin(angle) * dist;
      const scale = 0.84 + rand() * 0.36;
      const r = baseRadius * scale;
      if (!isClearOfTrack(x, z, r)) {
        continue;
      }
      placedCircles.push({ x, z, r });
      list.push({
        x,
        z,
        yaw: rand() * Math.PI * 2,
        scale,
        colorIndex: Math.floor(rand() * pastelColors.length),
      });
    }
    return list;
  }

  const instMtx = new THREE.Matrix4();
  const instPos = new THREE.Vector3();
  const instQuat = new THREE.Quaternion();
  const instScale = new THREE.Vector3();
  const instColor = new THREE.Color();

  // 5a. Giant Book Stacks (near + far split for shadow optimization)
  const bookStackCount = Math.max(2, Math.round(14 * densityScale));
  const bookPlacements = generatePlacements(bookStackCount, 12);
  if (bookPlacements.length > 0) {
    // 2 stacked books per prop
    const coverParts: THREE.BufferGeometry[] = [];
    const pageParts: THREE.BufferGeometry[] = [];

    const b1Cover = new THREE.BoxGeometry(15, 3.2, 20);
    b1Cover.translate(0, 1.6, 0);
    coverParts.push(b1Cover);
    const b1Pages = new THREE.BoxGeometry(14.1, 2.5, 19.2);
    b1Pages.translate(0.55, 1.6, 0);
    pageParts.push(b1Pages);

    const b2Cover = new THREE.BoxGeometry(13.2, 2.8, 18);
    b2Cover.rotateY(0.28);
    b2Cover.translate(0.4, 4.6, -0.3);
    coverParts.push(b2Cover);
    const b2Pages = new THREE.BoxGeometry(12.3, 2.2, 17.2);
    b2Pages.rotateY(0.28);
    b2Pages.translate(0.9, 4.6, -0.3);
    pageParts.push(b2Pages);

    const coverGeom = trackGeom(mergeWithCleanup(coverParts));
    const pageGeom = trackGeom(mergeWithCleanup(pageParts));

    const coverMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.7,
        metalness: 0.02,
      }),
    );
    const pageMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: pal.paperCream,
        roughness: 0.85,
        metalness: 0.0,
      }),
    );

    const coverInst = new THREE.InstancedMesh(coverGeom, coverMat, bookPlacements.length);
    const pageInst = new THREE.InstancedMesh(pageGeom, pageMat, bookPlacements.length);
    coverInst.castShadow = true;
    coverInst.receiveShadow = true;
    pageInst.castShadow = false;
    pageInst.receiveShadow = true;

    bookPlacements.forEach((p, idx) => {
      instPos.set(p.x, 0, p.z);
      instQuat.setFromAxisAngle(beamUpRef, p.yaw);
      instScale.set(p.scale, p.scale, p.scale);
      instMtx.compose(instPos, instQuat, instScale);
      coverInst.setMatrixAt(idx, instMtx);
      pageInst.setMatrixAt(idx, instMtx);
      instColor.set(pastelColors[p.colorIndex]);
      coverInst.setColorAt(idx, instColor);
    });

    coverInst.instanceMatrix.needsUpdate = true;
    if (coverInst.instanceColor) coverInst.instanceColor.needsUpdate = true;
    coverInst.computeBoundingSphere();
    pageInst.instanceMatrix.needsUpdate = true;
    pageInst.computeBoundingSphere();
    group.add(coverInst, pageInst);
  }

  // 5b. Abstract Striped Cans (procedural stripes, zero brand logos)
  const canCount = Math.max(2, Math.round(10 * densityScale));
  const canPlacements = generatePlacements(canCount, 7.5);
  if (canPlacements.length > 0) {
    const canTex = trackTex(createStripedCanTexture(pal.pastelBlue, pal.pastelSand, maxAnisotropy));
    const canBodyMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: canTex,
        roughness: 0.44,
        metalness: 0.14,
      }),
    );
    const canRimMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: pal.lampMetal,
        roughness: 0.32,
        metalness: 0.72,
      }),
    );

    const bodyGeom = trackGeom(new THREE.CylinderGeometry(5.6, 5.6, 17, 20));
    bodyGeom.translate(0, 8.5, 0);

    const rimParts: THREE.BufferGeometry[] = [];
    const topRim = new THREE.CylinderGeometry(5.85, 5.85, 0.9, 20);
    topRim.translate(0, 17.2, 0);
    rimParts.push(topRim);
    const botRim = new THREE.CylinderGeometry(5.85, 5.85, 0.8, 20);
    botRim.translate(0, 0.4, 0);
    rimParts.push(botRim);
    const rimGeom = trackGeom(mergeWithCleanup(rimParts));

    const bodyInst = new THREE.InstancedMesh(bodyGeom, canBodyMat, canPlacements.length);
    const rimInst = new THREE.InstancedMesh(rimGeom, canRimMat, canPlacements.length);
    bodyInst.castShadow = true;
    bodyInst.receiveShadow = true;
    rimInst.castShadow = false;
    rimInst.receiveShadow = true;

    canPlacements.forEach((p, idx) => {
      instPos.set(p.x, 0, p.z);
      instQuat.setFromAxisAngle(beamUpRef, p.yaw);
      instScale.set(p.scale, p.scale, p.scale);
      instMtx.compose(instPos, instQuat, instScale);
      bodyInst.setMatrixAt(idx, instMtx);
      rimInst.setMatrixAt(idx, instMtx);
    });

    bodyInst.instanceMatrix.needsUpdate = true;
    bodyInst.computeBoundingSphere();
    rimInst.instanceMatrix.needsUpdate = true;
    rimInst.computeBoundingSphere();
    group.add(bodyInst, rimInst);
  }

  // 5c. Pencil Cups (pastel cup + 3 angled wooden pencils)
  const cupCount = Math.max(1, Math.round(7 * densityScale));
  const cupPlacements = generatePlacements(cupCount, 7.5);
  if (cupPlacements.length > 0) {
    const cupGeom = trackGeom(new THREE.CylinderGeometry(5.2, 4.6, 13.5, 18));
    cupGeom.translate(0, 6.75, 0);

    const pencilWoodParts: THREE.BufferGeometry[] = [];
    const pencilTipParts: THREE.BufferGeometry[] = [];
    const pencilAngles = [
      { rx: 0.16, rz: 0.14, x: -1.6, z: 0.8 },
      { rx: -0.18, rz: 0.1, x: 1.5, z: -1.1 },
      { rx: 0.08, rz: -0.2, x: 0.2, z: 1.7 },
    ];
    for (const pa of pencilAngles) {
      const shaft = new THREE.CylinderGeometry(0.65, 0.65, 19, 8);
      shaft.translate(0, 9.5, 0);
      shaft.rotateX(pa.rx);
      shaft.rotateZ(pa.rz);
      shaft.translate(pa.x, 2.5, pa.z);
      pencilWoodParts.push(shaft);

      const cone = new THREE.ConeGeometry(0.65, 2.4, 8);
      cone.translate(0, 20.2, 0);
      cone.rotateX(pa.rx);
      cone.rotateZ(pa.rz);
      cone.translate(pa.x, 2.5, pa.z);
      pencilTipParts.push(cone);
    }

    const cupMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.56,
        metalness: 0.04,
      }),
    );
    const tipMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: pal.pastelSlate,
        roughness: 0.65,
      }),
    );

    const cupInst = new THREE.InstancedMesh(cupGeom, cupMat, cupPlacements.length);
    const pencilInst = new THREE.InstancedMesh(
      trackGeom(mergeWithCleanup(pencilWoodParts)),
      woodLightMat,
      cupPlacements.length,
    );
    const tipInst = new THREE.InstancedMesh(
      trackGeom(mergeWithCleanup(pencilTipParts)),
      tipMat,
      cupPlacements.length,
    );

    cupInst.castShadow = true;
    cupInst.receiveShadow = true;
    pencilInst.castShadow = true;
    pencilInst.receiveShadow = true;
    tipInst.castShadow = false;

    cupPlacements.forEach((p, idx) => {
      instPos.set(p.x, 0, p.z);
      instQuat.setFromAxisAngle(beamUpRef, p.yaw);
      instScale.set(p.scale, p.scale, p.scale);
      instMtx.compose(instPos, instQuat, instScale);
      cupInst.setMatrixAt(idx, instMtx);
      pencilInst.setMatrixAt(idx, instMtx);
      tipInst.setMatrixAt(idx, instMtx);
      instColor.set(pastelColors[(p.colorIndex + 1) % pastelColors.length]);
      cupInst.setColorAt(idx, instColor);
    });

    cupInst.instanceMatrix.needsUpdate = true;
    if (cupInst.instanceColor) cupInst.instanceColor.needsUpdate = true;
    cupInst.computeBoundingSphere();
    pencilInst.instanceMatrix.needsUpdate = true;
    pencilInst.computeBoundingSphere();
    tipInst.instanceMatrix.needsUpdate = true;
    tipInst.computeBoundingSphere();
    group.add(cupInst, pencilInst, tipInst);
  }

  // 5d. Wooden Toy Letter Blocks (split across 3 letter textures)
  const blockCount = Math.max(3, Math.round(12 * densityScale));
  const blockPlacements = generatePlacements(blockCount, 8);
  if (blockPlacements.length > 0) {
    const blockGeom = trackGeom(new THREE.BoxGeometry(10, 10, 10));
    blockGeom.translate(0, 5, 0);

    const blockSpecs = [
      { letter: 'A', ink: pal.pastelRose },
      { letter: 'B', ink: pal.pastelBlue },
      { letter: 'C', ink: pal.pastelMint },
    ];
    const buckets: Placement[][] = [[], [], []];
    blockPlacements.forEach((p, idx) => {
      buckets[idx % blockSpecs.length].push(p);
    });

    for (let b = 0; b < blockSpecs.length; b++) {
      const list = buckets[b];
      if (list.length === 0) continue;
      const tex = trackTex(
        createLetterBlockTexture(blockSpecs[b].letter, blockSpecs[b].ink, maxAnisotropy),
      );
      const mat = trackMat(
        new THREE.MeshStandardMaterial({
          map: tex,
          roughness: 0.65,
          metalness: 0.02,
        }),
      );
      const inst = new THREE.InstancedMesh(blockGeom, mat, list.length);
      inst.castShadow = true;
      inst.receiveShadow = true;
      list.forEach((p, idx) => {
        instPos.set(p.x, 0, p.z);
        instQuat.setFromAxisAngle(beamUpRef, p.yaw);
        instScale.set(p.scale, p.scale, p.scale);
        instMtx.compose(instPos, instQuat, instScale);
        inst.setMatrixAt(idx, instMtx);
      });
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere();
      group.add(inst);
    }
  }

  // 5e. Toy Striped Balls
  const ballCount = Math.max(2, Math.round(8 * densityScale));
  const ballPlacements = generatePlacements(ballCount, 7.5);
  if (ballPlacements.length > 0) {
    const ballGeom = trackGeom(new THREE.SphereGeometry(6.2, 20, 16));
    ballGeom.translate(0, 6.2, 0);
    const ballTex = trackTex(createToyBallTexture(maxAnisotropy));
    const ballMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: ballTex,
        roughness: 0.42,
        metalness: 0.04,
      }),
    );
    const ballInst = new THREE.InstancedMesh(ballGeom, ballMat, ballPlacements.length);
    ballInst.castShadow = true;
    ballInst.receiveShadow = true;

    ballPlacements.forEach((p, idx) => {
      instPos.set(p.x, 0, p.z);
      instQuat.setFromAxisAngle(beamUpRef, p.yaw);
      instScale.set(p.scale, p.scale, p.scale);
      instMtx.compose(instPos, instQuat, instScale);
      ballInst.setMatrixAt(idx, instMtx);
    });
    ballInst.instanceMatrix.needsUpdate = true;
    ballInst.computeBoundingSphere();
    group.add(ballInst);
  }

  // 5f. Skewed Paper Stacks
  const paperCount = Math.max(2, Math.round(9 * densityScale));
  const paperPlacements = generatePlacements(paperCount, 10);
  if (paperPlacements.length > 0) {
    const sheetParts: THREE.BufferGeometry[] = [];
    for (let s = 0; s < 3; s++) {
      const sheet = new THREE.BoxGeometry(13.5, 1.4, 17.5);
      sheet.rotateY((s - 1) * 0.12);
      sheet.translate(0, 0.7 + s * 1.4, 0);
      sheetParts.push(sheet);
    }
    const paperGeom = trackGeom(mergeWithCleanup(sheetParts));
    const paperTex = trackTex(createPaperTexture(maxAnisotropy));
    const paperMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: paperTex,
        roughness: 0.86,
        metalness: 0.0,
      }),
    );
    const paperInst = new THREE.InstancedMesh(paperGeom, paperMat, paperPlacements.length);
    paperInst.castShadow = false;
    paperInst.receiveShadow = true;

    paperPlacements.forEach((p, idx) => {
      instPos.set(p.x, 0, p.z);
      instQuat.setFromAxisAngle(beamUpRef, p.yaw);
      instScale.set(p.scale, p.scale, p.scale);
      instMtx.compose(instPos, instQuat, instScale);
      paperInst.setMatrixAt(idx, instMtx);
    });
    paperInst.instanceMatrix.needsUpdate = true;
    paperInst.computeBoundingSphere();
    group.add(paperInst);
  }

  function dispose(): void {
    for (const g of geometries) g.dispose();
    for (const t of textures) t.dispose();
    for (const m of materials) m.dispose();
  }

  return {
    group,
    dispose,
  };
}
