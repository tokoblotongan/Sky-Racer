// src/render/tunnel.ts

import * as THREE from 'three';
import { CONFIG, VISUAL_PRESETS, type GraphicsPreset, type VisualPreset, type VisualPresetName } from '../config';
import type { Course, Route, StyleRun, TrackFrame } from '../core/course';
import { createSurfaceMaterial } from './materialFactory';
import type { QualityLevel } from './quality';

export interface TunnelVisual {
  group: THREE.Group;
  update: (dt: number) => void;
  applyPalette: (name: VisualPresetName) => void;
  dispose: () => void;
}

interface ArchPoint {
  x: number;
  y: number;
  u: number;
}

function createTunnelInteriorTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, size, 0);
    grad.addColorStop(0.0, '#2B146B');
    grad.addColorStop(0.22, '#3B1E8C');
    grad.addColorStop(0.5, '#4C28B0');
    grad.addColorStop(0.78, '#3B1E8C');
    grad.addColorStop(1.0, '#2B146B');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Subtle crystal facet triangles
    const cols = 6;
    const rows = 6;
    const cw = size / cols;
    const ch = size / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cw;
        const y = r * ch;
        ctx.fillStyle = (r + c) % 2 === 0 ? 'rgba(139, 92, 246, 0.16)' : 'rgba(30, 12, 74, 0.18)';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + cw, y);
        ctx.lineTo(x + cw * 0.5, y + ch);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Crisp violet panel seam lines
    ctx.strokeStyle = 'rgba(196, 181, 253, 0.24)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, size);
    ctx.moveTo(size * 0.5, 0);
    ctx.lineTo(size * 0.5, size);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createTunnelExteriorTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, size, 0);
    grad.addColorStop(0.0, '#4338CA');
    grad.addColorStop(0.5, '#6366F1');
    grad.addColorStop(1.0, '#4338CA');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.fillRect(0, size * 0.45, size, size * 0.08);
    ctx.fillStyle = 'rgba(0, 229, 255, 0.28)';
    ctx.fillRect(0, size * 0.48, size, size * 0.02);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createCeilingLightTexture(
  maxAnisotropy: number,
  preset: VisualPreset,
): THREE.CanvasTexture {
  const width = 64;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.fillStyle = '#1E1B4B';
    ctx.fillRect(0, 0, width, height);

    const bars = 4;
    const cellH = height / bars;
    for (let i = 0; i < bars; i++) {
      const y = i * cellH + cellH * 0.16;
      const barH = cellH * 0.56;
      const color = i % 2 === 0 ? preset.colors.boost : preset.colors.accent;
      ctx.fillStyle = color;
      ctx.fillRect(width * 0.12, y, width * 0.76, barH);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(width * 0.3, y + barH * 0.2, width * 0.4, barH * 0.6);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function buildArchProfile(
  radius: number,
  interiorHeight: number,
  arcSegments = 18,
): ArchPoint[] {
  const wallBaseY = -0.85;
  const springY = 2.4;
  const domeHeight = Math.max(3.5, interiorHeight - springY);
  const pts: ArchPoint[] = [];

  // Right wall base -> springing point -> dome -> left springing point -> left wall base
  pts.push({ x: radius, y: wallBaseY, u: 0.0 });
  for (let i = 0; i <= arcSegments; i++) {
    const t = i / arcSegments;
    const ang = t * Math.PI;
    pts.push({
      x: Math.cos(ang) * radius,
      y: springY + Math.sin(ang) * domeHeight,
      u: THREE.MathUtils.lerp(0.08, 0.92, t),
    });
  }
  pts.push({ x: -radius, y: wallBaseY, u: 1.0 });
  return pts;
}

function buildSweptVaultMesh(
  frames: readonly TrackFrame[],
  innerRadius: number,
  interiorHeight: number,
  wallThickness: number,
  interiorMaterial: THREE.Material,
  exteriorMaterial: THREE.Material,
  receiveShadows: boolean,
): { interiorMesh: THREE.Mesh; exteriorMesh: THREE.Mesh } {
  const innerProf = buildArchProfile(innerRadius, interiorHeight);
  const outerProf = buildArchProfile(innerRadius + wallThickness, interiorHeight + wallThickness);
  const ringCount = frames.length;

  const sweepShell = (
    prof: readonly ArchPoint[],
    flipWinding: boolean,
  ): THREE.BufferGeometry => {
    const stride = prof.length;
    const positions = new Float32Array(ringCount * stride * 3);
    const uvs = new Float32Array(ringCount * stride * 2);
    const indices: number[] = [];
    const pos = new THREE.Vector3();

    for (let r = 0; r < ringCount; r++) {
      const f = frames[r];
      const v = f.s / 12;
      for (let p = 0; p < stride; p++) {
        const pt = prof[p];
        pos.copy(f.position).addScaledVector(f.right, pt.x).addScaledVector(f.up, pt.y);
        const idx = r * stride + p;
        positions[idx * 3] = pos.x;
        positions[idx * 3 + 1] = pos.y;
        positions[idx * 3 + 2] = pos.z;
        uvs[idx * 2] = pt.u * 2;
        uvs[idx * 2 + 1] = v;
      }
    }

    for (let r = 0; r < ringCount - 1; r++) {
      const rowA = r * stride;
      const rowB = (r + 1) * stride;
      for (let p = 0; p < stride - 1; p++) {
        const a = rowA + p;
        const b = rowA + p + 1;
        const c = rowB + p;
        const d = rowB + p + 1;
        if (flipWinding) {
          indices.push(a, c, b);
          indices.push(b, c, d);
        } else {
          indices.push(a, b, c);
          indices.push(b, d, c);
        }
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    geom.computeBoundingSphere();
    return geom;
  };

  // Vault interior faces inward toward car; exterior faces outward
  const innerGeom = sweepShell(innerProf, false);
  const outerGeom = sweepShell(outerProf, true);

  const interiorMesh = new THREE.Mesh(innerGeom, interiorMaterial);
  interiorMesh.castShadow = false;
  interiorMesh.receiveShadow = receiveShadows;
  interiorMesh.updateMatrix();
  interiorMesh.matrixAutoUpdate = false;

  const exteriorMesh = new THREE.Mesh(outerGeom, exteriorMaterial);
  exteriorMesh.castShadow = false;
  exteriorMesh.receiveShadow = receiveShadows;
  exteriorMesh.updateMatrix();
  exteriorMesh.matrixAutoUpdate = false;

  return { interiorMesh, exteriorMesh };
}

function buildCeilingLightRibbon(
  frames: readonly TrackFrame[],
  latOffset: number,
  radius: number,
  interiorHeight: number,
  material: THREE.Material,
): THREE.Mesh {
  const springY = 2.4;
  const domeHeight = Math.max(3.5, interiorHeight - springY);
  const stripHalfW = 0.34;
  const ringCount = frames.length;
  const positions = new Float32Array(ringCount * 2 * 3);
  const uvs = new Float32Array(ringCount * 2 * 2);
  const indices: number[] = [];
  const pt = new THREE.Vector3();

  const evalArchY = (x: number): number => {
    const nx = THREE.MathUtils.clamp(x / radius, -0.95, 0.95);
    return springY + domeHeight * Math.sqrt(Math.max(0.05, 1 - nx * nx)) - 0.32;
  };

  for (let r = 0; r < ringCount; r++) {
    const f = frames[r];
    const v = f.s / 14;
    const xL = latOffset - stripHalfW;
    const xR = latOffset + stripHalfW;

    pt.copy(f.position).addScaledVector(f.right, xL).addScaledVector(f.up, evalArchY(xL));
    const idxL = r * 2;
    positions[idxL * 3] = pt.x;
    positions[idxL * 3 + 1] = pt.y;
    positions[idxL * 3 + 2] = pt.z;
    uvs[idxL * 2] = 0;
    uvs[idxL * 2 + 1] = v;

    pt.copy(f.position).addScaledVector(f.right, xR).addScaledVector(f.up, evalArchY(xR));
    const idxR = r * 2 + 1;
    positions[idxR * 3] = pt.x;
    positions[idxR * 3 + 1] = pt.y;
    positions[idxR * 3 + 2] = pt.z;
    uvs[idxR * 2] = 1;
    uvs[idxR * 2 + 1] = v;
  }

  for (let r = 0; r < ringCount - 1; r++) {
    const a = r * 2;
    const b = a + 1;
    const c = (r + 1) * 2;
    const d = c + 1;
    indices.push(a, b, c);
    indices.push(b, d, c);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  geom.computeBoundingSphere();

  const mesh = new THREE.Mesh(geom, material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.updateMatrix();
  mesh.matrixAutoUpdate = false;
  return mesh;
}

function buildWallTrimRibbon(
  frames: readonly TrackFrame[],
  latOffset: number,
  yHeight: number,
  material: THREE.Material,
): THREE.Mesh {
  const halfH = 0.22;
  const ringCount = frames.length;
  const positions = new Float32Array(ringCount * 2 * 3);
  const uvs = new Float32Array(ringCount * 2 * 2);
  const indices: number[] = [];
  const pt = new THREE.Vector3();

  for (let r = 0; r < ringCount; r++) {
    const f = frames[r];
    const v = f.s / 10;

    pt.copy(f.position).addScaledVector(f.right, latOffset).addScaledVector(f.up, yHeight - halfH);
    const idxA = r * 2;
    positions[idxA * 3] = pt.x;
    positions[idxA * 3 + 1] = pt.y;
    positions[idxA * 3 + 2] = pt.z;
    uvs[idxA * 2] = 0;
    uvs[idxA * 2 + 1] = v;

    pt.copy(f.position).addScaledVector(f.right, latOffset).addScaledVector(f.up, yHeight + halfH);
    const idxB = r * 2 + 1;
    positions[idxB * 3] = pt.x;
    positions[idxB * 3 + 1] = pt.y;
    positions[idxB * 3 + 2] = pt.z;
    uvs[idxB * 2] = 1;
    uvs[idxB * 2 + 1] = v;
  }

  for (let r = 0; r < ringCount - 1; r++) {
    const a = r * 2;
    const b = a + 1;
    const c = (r + 1) * 2;
    const d = c + 1;
    indices.push(a, b, c);
    indices.push(b, d, c);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  geom.computeBoundingSphere();

  const mesh = new THREE.Mesh(geom, material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.updateMatrix();
  mesh.matrixAutoUpdate = false;
  return mesh;
}

function buildRibGeometry(radius: number, interiorHeight: number): THREE.BufferGeometry {
  const springY = 2.4;
  const domeHeight = Math.max(3.5, interiorHeight - springY);
  const pts: THREE.Vector3[] = [];
  pts.push(new THREE.Vector3(radius - 0.15, -0.75, 0));
  const segs = 16;
  for (let i = 0; i <= segs; i++) {
    const ang = (i / segs) * Math.PI;
    pts.push(
      new THREE.Vector3(
        Math.cos(ang) * (radius - 0.15),
        springY + Math.sin(ang) * (domeHeight - 0.12),
        0,
      ),
    );
  }
  pts.push(new THREE.Vector3(-(radius - 0.15), -0.75, 0));

  const curve = new THREE.CatmullRomCurve3(pts);
  const geom = new THREE.TubeGeometry(curve, 24, 0.24, 6, false);
  geom.computeBoundingSphere();
  return geom;
}

function buildRainbowPortalGroup(
  frame: TrackFrame,
  portalWidth: number,
  interiorHeight: number,
  geomsToDispose: THREE.BufferGeometry[],
  matsToDispose: THREE.Material[],
  graphicsPreset: GraphicsPreset,
  receiveShadows: boolean,
): THREE.Group {
  const portalGroup = new THREE.Group();
  const negFwd = frame.tangent.clone().negate();
  const basis = new THREE.Matrix4().makeBasis(frame.right, frame.up, negFwd);
  portalGroup.position.copy(frame.position);
  portalGroup.quaternion.setFromRotationMatrix(basis);

  const rainbowColors = ['#FF2D3D', '#FF7A00', '#FFD000', '#22C55E', '#0A5CFF'];
  const baseRadius = portalWidth * 0.5;
  const springY = 2.4;
  const domeHeight = Math.max(4.5, interiorHeight - springY + 0.6);

  for (let i = 0; i < rainbowColors.length; i++) {
    const r = baseRadius - i * 0.42;
    const h = domeHeight - i * 0.42;
    const pts: THREE.Vector3[] = [];
    pts.push(new THREE.Vector3(r, -1.0, 0));
    const steps = 18;
    for (let k = 0; k <= steps; k++) {
      const ang = (k / steps) * Math.PI;
      pts.push(new THREE.Vector3(Math.cos(ang) * r, springY + Math.sin(ang) * h, 0));
    }
    pts.push(new THREE.Vector3(-r, -1.0, 0));

    const curve = new THREE.CatmullRomCurve3(pts);
    const bandGeom = new THREE.TubeGeometry(curve, 28, 0.24, 8, false);
    bandGeom.scale(1, 1, 2.2);
    geomsToDispose.push(bandGeom);

    const bandMat = createSurfaceMaterial(graphicsPreset, {
      color: rainbowColors[i],
      emissive: rainbowColors[i],
      emissiveIntensity: graphicsPreset !== 'penuh' ? 0.35 : 0.22,
      roughness: 0.22,
      metalness: 0.08,
      clearcoat: 0.85,
      clearcoatRoughness: 0.1,
      physical: true,
    });
    matsToDispose.push(bandMat);

    const bandMesh = new THREE.Mesh(bandGeom, bandMat);
    bandMesh.castShadow = false;
    bandMesh.receiveShadow = receiveShadows;
    portalGroup.add(bandMesh);
  }

  portalGroup.updateMatrix();
  portalGroup.matrixAutoUpdate = false;
  return portalGroup;
}

export function buildTunnelMesh(
  course: Course,
  maxAnisotropy = 8,
  initialPreset: VisualPresetName = CONFIG.visual.activePreset,
  quality: QualityLevel = 'high',
  graphicsPreset: GraphicsPreset = 'penuh',
): TunnelVisual {
  const group = new THREE.Group();
  group.name = 'TunnelGroup';

  const routeTunnelRuns: Array<{ route: Route; run: StyleRun }> = [];
  for (const route of course.getAllRoutes()) {
    for (const run of route.getStyleRuns()) {
      if (run.style === 'tunnel') {
        routeTunnelRuns.push({ route, run });
      }
    }
  }
  if (routeTunnelRuns.length === 0) {
    return {
      group,
      update: () => {},
      applyPalette: () => {},
      dispose: () => {},
    };
  }

  const tunnelCfg = CONFIG.styles.tunnel;
  const preset = VISUAL_PRESETS[initialPreset];
  const isSimple = graphicsPreset !== 'penuh';
  const receiveShadows = graphicsPreset !== 'hemat';

  const interiorTex = createTunnelInteriorTexture(maxAnisotropy);
  const exteriorTex = createTunnelExteriorTexture(maxAnisotropy);
  let lightTex = createCeilingLightTexture(maxAnisotropy, preset);

  const interiorMat = createSurfaceMaterial(graphicsPreset, {
    map: interiorTex,
    color: 0xffffff,
    emissive: isSimple ? '#3B1E8C' : '#2E1065',
    emissiveIntensity: isSimple ? 0.78 : 0.55,
    roughness: 0.34,
    metalness: 0.14,
    clearcoat: 0.5,
    side: THREE.FrontSide,
    physical: true,
  });
  if (isSimple) {
    interiorMat.color.setScalar(CONFIG.safeMode.wallLift);
  }

  const exteriorMat = createSurfaceMaterial(graphicsPreset, {
    map: exteriorTex,
    color: 0xffffff,
    roughness: 0.28,
    metalness: 0.16,
    clearcoat: 0.72,
    side: THREE.FrontSide,
    physical: true,
  });

  const ribMat = createSurfaceMaterial(graphicsPreset, {
    color: 0x6d28d9,
    emissive: '#3B1E8C',
    emissiveIntensity: isSimple ? 0.55 : 0.35,
    roughness: 0.25,
    metalness: 0.2,
    clearcoat: 0.65,
    physical: true,
  });

  const lightMat = createSurfaceMaterial(graphicsPreset, {
    map: lightTex,
    emissive: 0xffffff,
    emissiveMap: lightTex,
    emissiveIntensity: 1.85,
    roughness: 0.2,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });

  const wallTrimMat = isSimple
    ? createSurfaceMaterial(graphicsPreset, {
        color: '#C4B5FD',
        emissive: '#A78BFA',
        emissiveIntensity: CONFIG.safeMode.wallTrimEmissive,
        roughness: 0.3,
        side: THREE.DoubleSide,
      })
    : null;

  const geomsToDispose: THREE.BufferGeometry[] = [];
  const matsToDispose: THREE.Material[] = [interiorMat, exteriorMat, ribMat, lightMat];
  if (wallTrimMat) {
    matsToDispose.push(wallTrimMat);
  }
  const texsToDispose: THREE.Texture[] = [interiorTex, exteriorTex];

  const ribGeom = buildRibGeometry(tunnelCfg.radius, tunnelCfg.interiorHeight);
  geomsToDispose.push(ribGeom);

  const ribMatrices: THREE.Matrix4[] = [];
  const tmpFrame: TrackFrame = {
    s: 0,
    position: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
    up: new THREE.Vector3(),
    right: new THREE.Vector3(),
    width: course.getTrackWidth(),
    bank: 0,
  };
  const negFwd = new THREE.Vector3();

  for (const { route, run } of routeTunnelRuns) {
    const runLen = run.endS - run.startS;
    if (runLen < 2) {
      continue;
    }

    const step = 1.5;
    const count = Math.max(6, Math.ceil(runLen / step) + 1);
    const runFrames: TrackFrame[] = [];
    for (let i = 0; i < count; i++) {
      const s = THREE.MathUtils.lerp(run.startS, run.endS, i / (count - 1));
      runFrames.push(route.getFrameAt(s));
    }

    const { interiorMesh, exteriorMesh } = buildSweptVaultMesh(
      runFrames,
      tunnelCfg.radius,
      tunnelCfg.interiorHeight,
      tunnelCfg.wallThickness,
      interiorMat,
      exteriorMat,
      receiveShadows,
    );
    geomsToDispose.push(interiorMesh.geometry, exteriorMesh.geometry);
    group.add(interiorMesh, exteriorMesh);

    // Ceiling emissive chase light strips (reduced to 1 centered strip on mobile preset)
    const stripCount = CONFIG.quality.levels[quality].tunnelLightStrips;
    const stripOffsets = stripCount <= 1 ? [0] : [-3.1, 3.1];
    for (const latOff of stripOffsets) {
      const stripMesh = buildCeilingLightRibbon(
        runFrames,
        latOff,
        tunnelCfg.radius,
        tunnelCfg.interiorHeight,
        lightMat,
      );
      geomsToDispose.push(stripMesh.geometry);
      group.add(stripMesh);
    }

    if (wallTrimMat) {
      const wallOffset = tunnelCfg.radius - 0.35;
      for (const sideSign of [-1, 1]) {
        const trimRibbon = buildWallTrimRibbon(runFrames, sideSign * wallOffset, 1.65, wallTrimMat);
        geomsToDispose.push(trimRibbon.geometry);
        group.add(trimRibbon);
      }
    }

    // Structural ribs inside tunnel every ribSpacing meters
    const ribCount = Math.max(2, Math.floor(runLen / tunnelCfg.ribSpacing));
    for (let i = 1; i < ribCount; i++) {
      const s = THREE.MathUtils.lerp(run.startS, run.endS, i / ribCount);
      route.getFrameAt(s, tmpFrame);
      negFwd.copy(tmpFrame.tangent).negate();
      const mat = new THREE.Matrix4().makeBasis(tmpFrame.right, tmpFrame.up, negFwd);
      mat.setPosition(tmpFrame.position);
      ribMatrices.push(mat);
    }

    // Grand rainbow entry & exit portals
    const startPortal = buildRainbowPortalGroup(
      runFrames[0],
      tunnelCfg.portalWidth,
      tunnelCfg.interiorHeight,
      geomsToDispose,
      matsToDispose,
      graphicsPreset,
      receiveShadows,
    );
    const endPortal = buildRainbowPortalGroup(
      runFrames[runFrames.length - 1],
      tunnelCfg.portalWidth,
      tunnelCfg.interiorHeight,
      geomsToDispose,
      matsToDispose,
      graphicsPreset,
      receiveShadows,
    );
    group.add(startPortal, endPortal);
  }

  if (ribMatrices.length > 0) {
    const ribInst = new THREE.InstancedMesh(ribGeom, ribMat, ribMatrices.length);
    ribInst.castShadow = false;
    ribInst.receiveShadow = receiveShadows;
    for (let i = 0; i < ribMatrices.length; i++) {
      ribInst.setMatrixAt(i, ribMatrices[i]);
    }
    ribInst.instanceMatrix.needsUpdate = true;
    ribInst.computeBoundingSphere();
    group.add(ribInst);
  }

  function update(dt: number): void {
    lightTex.offset.y = (lightTex.offset.y - dt * tunnelCfg.lightSpeed) % 1;
  }

  function applyPalette(name: VisualPresetName): void {
    const nextPreset = VISUAL_PRESETS[name];
    const prevTex = lightTex;
    const prevOffset = prevTex.offset.y;
    lightTex = createCeilingLightTexture(maxAnisotropy, nextPreset);
    lightTex.offset.y = prevOffset;
    lightMat.map = lightTex;
    lightMat.emissiveMap = lightTex;
    lightMat.needsUpdate = true;
    prevTex.dispose();
  }

  function dispose(): void {
    for (const g of geomsToDispose) g.dispose();
    for (const m of matsToDispose) m.dispose();
    for (const t of texsToDispose) t.dispose();
    lightTex.dispose();
  }

  return {
    group,
    update,
    applyPalette,
    dispose,
  };
}
