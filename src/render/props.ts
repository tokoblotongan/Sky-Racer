// src/render/props.ts

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CONFIG, VISUAL_PRESETS, type VisualPreset, type VisualPresetName } from '../config';
import type { Course } from '../core/course';
import type { QualityLevel } from './quality';
import { computeRoomDimensions } from './scene';

export interface PropsVisual {
  group: THREE.Group;
  update: (cameraPos: THREE.Vector3) => void;
  applyPalette: (name: VisualPresetName) => void;
  dispose: () => void;
}

interface Placement {
  x: number;
  z: number;
  yaw: number;
  scale: number;
  colorIndex: number;
}

interface SupportSpot {
  x: number;
  z: number;
  topY: number;
  style: number;
  colorIndex: number;
}

interface CullablePropChunk {
  group: THREE.Group;
  cx: number;
  cz: number;
  radius: number;
  keepFar: boolean;
  currentScale: number;
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

function createRugTexture(maxAnisotropy: number, preset: VisualPreset): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const pal = preset.room;
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
  paperCreamHex: string,
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

    ctx.fillStyle = paperCreamHex;
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
  preset: VisualPreset,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = preset.room.woodLight;
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = preset.room.woodDark;
    ctx.lineWidth = 22;
    ctx.strokeRect(12, 12, size - 24, size - 24);

    ctx.fillStyle = preset.room.paperCream;
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

function createToyBallTexture(preset: VisualPreset, maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const pal = preset.room;
    const colors = pal.propColors;
    const bands = [
      colors[0 % colors.length],
      pal.paperCream,
      colors[3 % colors.length],
      colors[1 % colors.length],
    ];
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

function createPaperTexture(preset: VisualPreset, maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = preset.room.paperCream;
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

interface PropsAssembly {
  group: THREE.Group;
  update: (cameraPos: THREE.Vector3) => void;
  dispose: () => void;
}

function buildPropsAssembly(
  course: Course,
  qualityLevel: QualityLevel,
  maxAnisotropy: number,
  presetName: VisualPresetName,
  safeMode = false,
): PropsAssembly {
  const cfg = CONFIG.props;
  const preset = VISUAL_PRESETS[presetName];
  const pal = preset.room;
  const propColors = pal.propColors;
  const effectiveQuality: QualityLevel = safeMode ? 'mobile' : qualityLevel;
  const qualityPreset = CONFIG.quality.levels[effectiveQuality];
  const densityScale = cfg.density * qualityPreset.propsDensityScale;
  const propsChunkSize = Math.max(40, CONFIG.render.propsChunkLength);
  const viewDistance = qualityPreset.viewDistance;
  const shadowsEnabled = !safeMode && qualityPreset.shadowsEnabled;
  const fadeMargin = Math.max(1, CONFIG.render.cullFadeMargin);

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
  const roomDim = computeRoomDimensions(bounds);
  const roomCenterX = roomDim.centerX;
  const roomCenterZ = roomDim.centerZ;
  const roomW = roomDim.width;
  const roomD = roomDim.depth;
  const halfW = roomW * 0.5;
  const halfD = roomD * 0.5;

  // Spatial chunk registry for frustum + viewDistance culling with smooth fade margin
  const cullableChunks: CullablePropChunk[] = [];
  const chunkMap = new Map<string, CullablePropChunk>();
  const chunkRadius = propsChunkSize * 0.85;

  const getChunkGroup = (x: number, z: number, keepFar = false): THREE.Group => {
    const gx = Math.floor((x - roomCenterX) / propsChunkSize);
    const gz = Math.floor((z - roomCenterZ) / propsChunkSize);
    const key = `${keepFar ? 'far' : 'near'}:${gx},${gz}`;
    let entry = chunkMap.get(key);
    if (!entry) {
      const chunkGroup = new THREE.Group();
      chunkGroup.name = `PropsChunk_${keepFar ? 'Hero_' : ''}${gx}_${gz}`;
      freezeStatic(chunkGroup);
      group.add(chunkGroup);
      entry = {
        group: chunkGroup,
        cx: roomCenterX + (gx + 0.5) * propsChunkSize,
        cz: roomCenterZ + (gz + 0.5) * propsChunkSize,
        radius: chunkRadius,
        keepFar,
        currentScale: 1,
      };
      chunkMap.set(key, entry);
      cullableChunks.push(entry);
    }
    return entry.group;
  };

  function bucketByChunk<T extends { x: number; z: number }>(
    items: readonly T[],
  ): Map<string, { chunkGroup: THREE.Group; list: T[] }> {
    const map = new Map<string, { chunkGroup: THREE.Group; list: T[] }>();
    for (const item of items) {
      const gx = Math.floor((item.x - roomCenterX) / propsChunkSize);
      const gz = Math.floor((item.z - roomCenterZ) / propsChunkSize);
      const key = `${gx},${gz}`;
      let bucket = map.get(key);
      if (!bucket) {
        bucket = {
          chunkGroup: getChunkGroup(item.x, item.z),
          list: [],
        };
        map.set(key, bucket);
      }
      bucket.list.push(item);
    }
    return map;
  }

  // Dense horizontal clearance grid across the entire course + start camera zone
  const allSamples = course.getSamples();
  const clearancePoints: Array<{ x: number; z: number }> = [];
  const sampleStride = Math.max(1, Math.floor(2.0 / CONFIG.course.stepLength));
  for (let i = 0; i < allSamples.length; i += sampleStride) {
    clearancePoints.push({ x: allSamples[i].position.x, z: allSamples[i].position.z });
  }
  const startSlot = course.getGridSlots(1)[0];
  const startFrame = course.getFrameAt(startSlot.s);
  clearancePoints.push({
    x: startFrame.position.x - startFrame.tangent.x * 10,
    z: startFrame.position.z - startFrame.tangent.z * 10,
  });

  const clearanceCellSize = cfg.clearance + 16;
  const clearanceGrid = new Map<string, Array<{ x: number; z: number }>>();
  for (const pt of clearancePoints) {
    const gx = Math.floor(pt.x / clearanceCellSize);
    const gz = Math.floor(pt.z / clearanceCellSize);
    const key = `${gx},${gz}`;
    let cell = clearanceGrid.get(key);
    if (!cell) {
      cell = [];
      clearanceGrid.set(key, cell);
    }
    cell.push(pt);
  }

  const placedCircles: Array<{ x: number; z: number; r: number }> = [];

  const isClearOfTrack = (x: number, z: number, radius: number): boolean => {
    if (
      Math.abs(x - roomCenterX) > halfW - radius - 8 ||
      Math.abs(z - roomCenterZ) > halfD - radius - 8
    ) {
      return false;
    }
    const minCourseDistSq = (cfg.clearance + radius) * (cfg.clearance + radius);
    const gx = Math.floor(x / clearanceCellSize);
    const gz = Math.floor(z / clearanceCellSize);
    for (let dxCell = -1; dxCell <= 1; dxCell++) {
      for (let dzCell = -1; dzCell <= 1; dzCell++) {
        const cell = clearanceGrid.get(`${gx + dxCell},${gz + dzCell}`);
        if (!cell) continue;
        for (let i = 0; i < cell.length; i++) {
          const dx = x - cell[i].x;
          const dz = z - cell[i].z;
          if (dx * dx + dz * dz < minCourseDistSq) {
            return false;
          }
        }
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

  const beamUpRef = new THREE.Vector3(0, 1, 0);

  // =========================================================================
  // 1. Giant Sunlit Window + Sunbeams on +X Wall (walls & baseboards are in scene.ts)
  // =========================================================================
  const woodDarkMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: pal.woodDark,
      roughness: 0.68,
      metalness: 0.02,
      fog: false,
    }),
  );
  const woodLightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: pal.woodLight,
      roughness: 0.64,
      metalness: 0.02,
      fog: false,
    }),
  );

  // Sunlit multi-pane window on the +X wall
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
  freezeStatic(windowPane);
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
  const topBar = new THREE.BoxGeometry(barDepth, barThickness, windowW + 6);
  topBar.translate(windowX - 1.0, windowCenterY + windowH * 0.5, windowZ);
  frameGeoms.push(topBar);
  const botBar = new THREE.BoxGeometry(barDepth * 1.6, barThickness * 1.2, windowW + 10);
  botBar.translate(windowX - 1.5, windowCenterY - windowH * 0.5, windowZ);
  frameGeoms.push(botBar);
  for (const frac of [-0.5, -0.17, 0.17, 0.5]) {
    const vBar = new THREE.BoxGeometry(barDepth, windowH, barThickness * 0.85);
    vBar.translate(windowX - 1.0, windowCenterY, windowZ + frac * windowW);
    frameGeoms.push(vBar);
  }
  const midBar = new THREE.BoxGeometry(barDepth, barThickness * 0.75, windowW);
  midBar.translate(windowX - 1.0, windowCenterY + 6, windowZ);
  frameGeoms.push(midBar);

  const windowFrameMesh = new THREE.Mesh(trackGeom(mergeWithCleanup(frameGeoms)), windowFrameMat);
  windowFrameMesh.castShadow = false;
  windowFrameMesh.receiveShadow = false;
  freezeStatic(windowFrameMesh);
  group.add(windowFrameMesh);

  if (!safeMode) {
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
      freezeStatic(beam);
      group.add(beam);
    }
  }

  // =========================================================================
  // 2. Woven Floor Rug
  // =========================================================================
  const rugTex = trackTex(createRugTexture(maxAnisotropy, preset));
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
  freezeStatic(mainRug);
  group.add(mainRug);

  // =========================================================================
  // 3. Decorative Support Pillars grouped per spatial chunk
  // =========================================================================
  const gaps = course.getGapRanges();
  const totalLength = course.getLength();
  const supportSpots: SupportSpot[] = [];

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

    let overlapsOtherSpan = false;
    const fx = frame.position.x;
    const fz = frame.position.z;
    for (let i = 0; i < allSamples.length; i += sampleStride) {
      const other = allSamples[i];
      if (Math.abs(other.s - s) < 18) {
        continue;
      }
      const dx = other.position.x - fx;
      const dz = other.position.z - fz;
      if (dx * dx + dz * dz < 64) {
        overlapsOtherSpan = true;
        break;
      }
    }
    if (overlapsOtherSpan) {
      continue;
    }

    supportSpots.push({
      x: fx,
      z: fz,
      topY,
      style: supportSpots.length % 2,
      colorIndex: supportSpots.length % propColors.length,
    });
  }

  if (supportSpots.length > 0) {
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

    const mtx = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    const tmpColor = new THREE.Color();

    const pillarChunks = bucketByChunk(supportSpots);
    for (const { chunkGroup, list } of pillarChunks.values()) {
      const baseInst = new THREE.InstancedMesh(baseGeom, woodLightMat, list.length);
      const colInst = new THREE.InstancedMesh(colGeom, pillarPastelMat, list.length);
      const capInst = new THREE.InstancedMesh(capGeom, woodDarkMat, list.length);

      baseInst.castShadow = shadowsEnabled;
      baseInst.receiveShadow = shadowsEnabled;
      colInst.castShadow = shadowsEnabled;
      colInst.receiveShadow = shadowsEnabled;
      capInst.castShadow = shadowsEnabled;
      capInst.receiveShadow = shadowsEnabled;

      list.forEach((spot, i) => {
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
        tmpColor.set(propColors[spot.colorIndex]);
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

      freezeStatic(baseInst);
      freezeStatic(colInst);
      freezeStatic(capInst);
      chunkGroup.add(baseInst, colInst, capInst);
    }
  }

  // =========================================================================
  // 4. Hero Assemblies (Giant Desk Lamp + Giant Wooden Bookshelf) in chunks
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
    lampGroup.rotation.y =
      Math.atan2(roomCenterX - lampSpot.x, roomCenterZ - lampSpot.z) - Math.PI * 0.5;

    const castLampShadow =
      shadowsEnabled &&
      Math.hypot(lampSpot.x - roomCenterX, lampSpot.z - roomCenterZ) <= cfg.shadowDistance + 30;
    lampMetalMesh.castShadow = castLampShadow;
    lampMetalMesh.receiveShadow = shadowsEnabled;
    shadeMesh.castShadow = castLampShadow;
    shadeMesh.receiveShadow = shadowsEnabled;
    freezeStatic(lampMetalMesh);
    freezeStatic(shadeMesh);
    freezeStatic(bulbMesh);
    lampGroup.add(lampMetalMesh, shadeMesh, bulbMesh);
    freezeStatic(lampGroup);
    getChunkGroup(lampSpot.x, lampSpot.z, true).add(lampGroup);
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
        color: propColors[3 % propColors.length],
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
    freezeStatic(shelfMesh);
    freezeStatic(shelfBooksMesh);
    shelfGroup.add(shelfMesh, shelfBooksMesh);
    freezeStatic(shelfGroup);
    getChunkGroup(shelfSpot.x, shelfSpot.z, true).add(shelfGroup);
  }

  // =========================================================================
  // 5. Scattered Giant Room Props grouped by spatial chunk (InstancedMesh)
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
        colorIndex: Math.floor(rand() * propColors.length),
      });
    }
    return list;
  }

  const instMtx = new THREE.Matrix4();
  const instPos = new THREE.Vector3();
  const instQuat = new THREE.Quaternion();
  const instScale = new THREE.Vector3();
  const instColor = new THREE.Color();

  // 5a. Giant Book Stacks
  const bookStackCount = Math.max(2, Math.round(14 * densityScale));
  const bookPlacements = generatePlacements(bookStackCount, 12);
  if (bookPlacements.length > 0) {
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

    const chunkBuckets = bucketByChunk(bookPlacements);
    for (const { chunkGroup, list } of chunkBuckets.values()) {
      const coverInst = new THREE.InstancedMesh(coverGeom, coverMat, list.length);
      const pageInst = new THREE.InstancedMesh(pageGeom, pageMat, list.length);
      coverInst.castShadow = shadowsEnabled;
      coverInst.receiveShadow = shadowsEnabled;
      pageInst.castShadow = false;
      pageInst.receiveShadow = shadowsEnabled;

      list.forEach((p, idx) => {
        instPos.set(p.x, 0, p.z);
        instQuat.setFromAxisAngle(beamUpRef, p.yaw);
        instScale.set(p.scale, p.scale, p.scale);
        instMtx.compose(instPos, instQuat, instScale);
        coverInst.setMatrixAt(idx, instMtx);
        pageInst.setMatrixAt(idx, instMtx);
        instColor.set(propColors[p.colorIndex]);
        coverInst.setColorAt(idx, instColor);
      });

      coverInst.instanceMatrix.needsUpdate = true;
      if (coverInst.instanceColor) coverInst.instanceColor.needsUpdate = true;
      coverInst.computeBoundingSphere();
      pageInst.instanceMatrix.needsUpdate = true;
      pageInst.computeBoundingSphere();
      freezeStatic(coverInst);
      freezeStatic(pageInst);
      chunkGroup.add(coverInst, pageInst);
    }
  }

  // 5b. Abstract Striped Cans
  const canCount = Math.max(2, Math.round(10 * densityScale));
  const canPlacements = generatePlacements(canCount, 7.5);
  if (canPlacements.length > 0) {
    const canTex = trackTex(
      createStripedCanTexture(
        propColors[3 % propColors.length],
        propColors[1 % propColors.length],
        pal.paperCream,
        maxAnisotropy,
      ),
    );
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

    const chunkBuckets = bucketByChunk(canPlacements);
    for (const { chunkGroup, list } of chunkBuckets.values()) {
      const bodyInst = new THREE.InstancedMesh(bodyGeom, canBodyMat, list.length);
      const rimInst = new THREE.InstancedMesh(rimGeom, canRimMat, list.length);
      bodyInst.castShadow = shadowsEnabled;
      bodyInst.receiveShadow = shadowsEnabled;
      rimInst.castShadow = false;
      rimInst.receiveShadow = shadowsEnabled;

      list.forEach((p, idx) => {
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
      freezeStatic(bodyInst);
      freezeStatic(rimInst);
      chunkGroup.add(bodyInst, rimInst);
    }
  }

  // 5c. Pencil Cups
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

    const pencilWoodGeom = trackGeom(mergeWithCleanup(pencilWoodParts));
    const pencilTipGeom = trackGeom(mergeWithCleanup(pencilTipParts));

    const cupMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.56,
        metalness: 0.04,
      }),
    );
    const tipMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: propColors[propColors.length - 1],
        roughness: 0.65,
      }),
    );

    const chunkBuckets = bucketByChunk(cupPlacements);
    for (const { chunkGroup, list } of chunkBuckets.values()) {
      const cupInst = new THREE.InstancedMesh(cupGeom, cupMat, list.length);
      const pencilInst = new THREE.InstancedMesh(pencilWoodGeom, woodLightMat, list.length);
      const tipInst = new THREE.InstancedMesh(pencilTipGeom, tipMat, list.length);

      cupInst.castShadow = shadowsEnabled;
      cupInst.receiveShadow = shadowsEnabled;
      pencilInst.castShadow = shadowsEnabled;
      pencilInst.receiveShadow = shadowsEnabled;
      tipInst.castShadow = false;

      list.forEach((p, idx) => {
        instPos.set(p.x, 0, p.z);
        instQuat.setFromAxisAngle(beamUpRef, p.yaw);
        instScale.set(p.scale, p.scale, p.scale);
        instMtx.compose(instPos, instQuat, instScale);
        cupInst.setMatrixAt(idx, instMtx);
        pencilInst.setMatrixAt(idx, instMtx);
        tipInst.setMatrixAt(idx, instMtx);
        instColor.set(propColors[(p.colorIndex + 1) % propColors.length]);
        cupInst.setColorAt(idx, instColor);
      });

      cupInst.instanceMatrix.needsUpdate = true;
      if (cupInst.instanceColor) cupInst.instanceColor.needsUpdate = true;
      cupInst.computeBoundingSphere();
      pencilInst.instanceMatrix.needsUpdate = true;
      pencilInst.computeBoundingSphere();
      tipInst.instanceMatrix.needsUpdate = true;
      tipInst.computeBoundingSphere();
      freezeStatic(cupInst);
      freezeStatic(pencilInst);
      freezeStatic(tipInst);
      chunkGroup.add(cupInst, pencilInst, tipInst);
    }
  }

  // 5d. Wooden Toy Letter Blocks
  const blockCount = Math.max(3, Math.round(12 * densityScale));
  const blockPlacements = generatePlacements(blockCount, 8);
  if (blockPlacements.length > 0) {
    const blockGeom = trackGeom(new THREE.BoxGeometry(10, 10, 10));
    blockGeom.translate(0, 5, 0);

    const blockSpecs = [
      { letter: 'A', ink: propColors[0 % propColors.length] },
      { letter: 'B', ink: propColors[3 % propColors.length] },
      { letter: 'C', ink: propColors[2 % propColors.length] },
    ];
    const blockMats = blockSpecs.map((spec) => {
      const tex = trackTex(
        createLetterBlockTexture(spec.letter, spec.ink, preset, maxAnisotropy),
      );
      return trackMat(
        new THREE.MeshStandardMaterial({
          map: tex,
          roughness: 0.65,
          metalness: 0.02,
        }),
      );
    });

    const buckets: Placement[][] = [[], [], []];
    blockPlacements.forEach((p, idx) => {
      buckets[idx % blockSpecs.length].push(p);
    });

    for (let b = 0; b < blockSpecs.length; b++) {
      const mat = blockMats[b];
      const chunkBuckets = bucketByChunk(buckets[b]);
      for (const { chunkGroup, list } of chunkBuckets.values()) {
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
        freezeStatic(inst);
        chunkGroup.add(inst);
      }
    }
  }

  // 5e. Toy Striped Balls
  const ballCount = Math.max(2, Math.round(8 * densityScale));
  const ballPlacements = generatePlacements(ballCount, 7.5);
  if (ballPlacements.length > 0) {
    const ballGeom = trackGeom(new THREE.SphereGeometry(6.2, 20, 16));
    ballGeom.translate(0, 6.2, 0);
    const ballTex = trackTex(createToyBallTexture(preset, maxAnisotropy));
    const ballMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: ballTex,
        roughness: 0.42,
        metalness: 0.04,
      }),
    );

    const chunkBuckets = bucketByChunk(ballPlacements);
    for (const { chunkGroup, list } of chunkBuckets.values()) {
      const ballInst = new THREE.InstancedMesh(ballGeom, ballMat, list.length);
      ballInst.castShadow = shadowsEnabled;
      ballInst.receiveShadow = shadowsEnabled;

      list.forEach((p, idx) => {
        instPos.set(p.x, 0, p.z);
        instQuat.setFromAxisAngle(beamUpRef, p.yaw);
        instScale.set(p.scale, p.scale, p.scale);
        instMtx.compose(instPos, instQuat, instScale);
        ballInst.setMatrixAt(idx, instMtx);
      });
      ballInst.instanceMatrix.needsUpdate = true;
      ballInst.computeBoundingSphere();
      freezeStatic(ballInst);
      chunkGroup.add(ballInst);
    }
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
    const paperTex = trackTex(createPaperTexture(preset, maxAnisotropy));
    const paperMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: paperTex,
        roughness: 0.86,
        metalness: 0.0,
      }),
    );

    const chunkBuckets = bucketByChunk(paperPlacements);
    for (const { chunkGroup, list } of chunkBuckets.values()) {
      const paperInst = new THREE.InstancedMesh(paperGeom, paperMat, list.length);
      paperInst.castShadow = false;
      paperInst.receiveShadow = true;

      list.forEach((p, idx) => {
        instPos.set(p.x, 0, p.z);
        instQuat.setFromAxisAngle(beamUpRef, p.yaw);
        instScale.set(p.scale, p.scale, p.scale);
        instMtx.compose(instPos, instQuat, instScale);
        paperInst.setMatrixAt(idx, instMtx);
      });
      paperInst.instanceMatrix.needsUpdate = true;
      paperInst.computeBoundingSphere();
      freezeStatic(paperInst);
      chunkGroup.add(paperInst);
    }
  }

  function update(cameraPos: THREE.Vector3): void {
    const camX = cameraPos.x;
    const camZ = cameraPos.z;
    for (let i = 0; i < cullableChunks.length; i++) {
      const chunk = cullableChunks[i];
      const dist = Math.hypot(chunk.cx - camX, chunk.cz - camZ);
      const edgeDist = Math.max(0, dist - chunk.radius);

      if (chunk.keepFar) {
        chunk.group.visible = edgeDist <= viewDistance + fadeMargin;
        continue;
      }

      if (edgeDist >= viewDistance) {
        chunk.group.visible = false;
        continue;
      }

      chunk.group.visible = true;
      const fadeStart = Math.max(0, viewDistance - fadeMargin);
      let targetScale = 1;
      if (edgeDist > fadeStart) {
        const t = (viewDistance - edgeDist) / fadeMargin;
        const smoothT = t * t * (3 - 2 * t);
        targetScale = Math.max(0.02, smoothT);
      }

      if (Math.abs(targetScale - chunk.currentScale) > 0.004) {
        chunk.currentScale = targetScale;
        chunk.group.scale.setScalar(targetScale);
        // Scale around chunk floor center (cx, 0, cz) so props shrink in place without sliding
        chunk.group.position.set(chunk.cx * (1 - targetScale), 0, chunk.cz * (1 - targetScale));
        chunk.group.updateMatrix();
      }
    }
  }

  function dispose(): void {
    for (const g of geometries) g.dispose();
    for (const t of textures) t.dispose();
    for (const m of materials) m.dispose();
  }

  return {
    group,
    update,
    dispose,
  };
}

export function buildProps(
  course: Course,
  qualityLevel: QualityLevel,
  maxAnisotropy = 8,
  initialPreset: VisualPresetName = CONFIG.visual.activePreset,
  safeMode = false,
): PropsVisual {
  const outerGroup = new THREE.Group();
  outerGroup.name = 'RoomPropsRoot';

  let currentPreset = initialPreset;
  let activeAssembly = buildPropsAssembly(course, qualityLevel, maxAnisotropy, currentPreset, safeMode);
  outerGroup.add(activeAssembly.group);

  function update(cameraPos: THREE.Vector3): void {
    activeAssembly.update(cameraPos);
  }

  function applyPalette(name: VisualPresetName): void {
    if (name === currentPreset) {
      return;
    }
    currentPreset = name;
    outerGroup.remove(activeAssembly.group);
    activeAssembly.dispose();
    activeAssembly = buildPropsAssembly(course, qualityLevel, maxAnisotropy, currentPreset, safeMode);
    outerGroup.add(activeAssembly.group);
  }

  function dispose(): void {
    outerGroup.remove(activeAssembly.group);
    activeAssembly.dispose();
  }

  return {
    group: outerGroup,
    update,
    applyPalette,
    dispose,
  };
}
