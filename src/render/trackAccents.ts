// src/render/trackAccents.ts

import * as THREE from 'three';
import { CONFIG, VISUAL_PRESETS, type VisualPreset, type VisualPresetName } from '../config';
import type { Course, TrackFrame } from '../core/course';

export interface TrackAccentsVisual {
  group: THREE.Group;
  update: (dt: number) => void;
  applyPalette: (name: VisualPresetName) => void;
  dispose: () => void;
}

function createPulseStripTexture(
  maxAnisotropy: number,
  preset: VisualPreset,
): THREE.CanvasTexture {
  const w = 64;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, w, h);

    const cells = 4;
    const cellH = h / cells;
    for (let i = 0; i < cells; i++) {
      const y = i * cellH;
      const color = i % 2 === 0 ? preset.colors.boost : preset.colors.accent;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(w * 0.1, y + cellH * 0.85);
      ctx.lineTo(w * 0.5, y + cellH * 0.18);
      ctx.lineTo(w * 0.9, y + cellH * 0.85);
      ctx.lineTo(w * 0.9, y + cellH * 0.55);
      ctx.lineTo(w * 0.5, y - cellH * 0.06);
      ctx.lineTo(w * 0.1, y + cellH * 0.55);
      ctx.closePath();
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createHazardBorderTexture(
  maxAnisotropy: number,
  preset: VisualPreset,
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.fillStyle = preset.colors.accent;
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = preset.colors.jumpStripeDark;
    const count = 4;
    const pitch = size / count;
    for (let i = -count; i <= count * 2; i++) {
      const y0 = i * pitch;
      ctx.beginPath();
      ctx.moveTo(0, y0);
      ctx.lineTo(size, y0 + size * 0.65);
      ctx.lineTo(size, y0 + size * 0.65 + pitch * 0.45);
      ctx.lineTo(0, y0 + pitch * 0.45);
      ctx.closePath();
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createLandingTargetTexture(
  maxAnisotropy: number,
  preset: VisualPreset,
): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.clearRect(0, 0, size, size);
    const cx = size * 0.5;
    const cy = size * 0.5;

    // Outer target rings (translucent background ring so orange deck peeks around corners)
    const rings: Array<{ r: number; color: string }> = [
      { r: size * 0.46, color: '#0F172A' },
      { r: size * 0.41, color: preset.colors.accent },
      { r: size * 0.31, color: '#FFFDF7' },
      { r: size * 0.21, color: preset.colors.boost },
      { r: size * 0.11, color: '#FF2D3D' },
    ];
    for (const ring of rings) {
      ctx.fillStyle = ring.color;
      ctx.beginPath();
      ctx.arc(cx, cy, ring.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Center white bullseye + forward pointer chevron
    ctx.fillStyle = '#FFFDF7';
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.045, 0, Math.PI * 2);
    ctx.fill();

    // Forward chevron markers top & bottom
    ctx.strokeStyle = preset.colors.accent;
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const cyOff of [-size * 0.45, size * 0.45]) {
      ctx.beginPath();
      ctx.moveTo(cx - 54, cy + cyOff + 20);
      ctx.lineTo(cx, cy + cyOff - 14);
      ctx.lineTo(cx + 54, cy + cyOff + 20);
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function buildSurfaceRibbonGeometry(
  course: Course,
  startS: number,
  endS: number,
  lateralCenter: number | ((frame: TrackFrame) => number),
  ribbonWidth: number,
  lift: number,
  uvRepeatY: number,
): THREE.BufferGeometry | null {
  const totalLen = course.getLength();
  const isClosed = course.isClosed();
  const clampedStart = isClosed ? startS : Math.max(0, startS);
  const clampedEnd = isClosed ? endS : Math.min(totalLen, endS);
  const spanLen = clampedEnd - clampedStart;
  if (spanLen < 0.4) {
    return null;
  }

  const latSubdivs = 4;
  const lengthSteps = Math.max(4, Math.ceil(spanLen / 1.0));
  const cols = latSubdivs + 1;
  const rows = lengthSteps + 1;
  const positions = new Float32Array(rows * cols * 3);
  const uvs = new Float32Array(rows * cols * 2);
  const indices: number[] = [];

  const frame: TrackFrame = {
    s: 0,
    position: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
    up: new THREE.Vector3(),
    right: new THREE.Vector3(),
    width: course.getTrackWidth(),
    bank: 0,
  };
  const vPos = new THREE.Vector3();
  const halfW = ribbonWidth * 0.5;

  for (let r = 0; r < rows; r++) {
    const vFrac = r / lengthSteps;
    const s = THREE.MathUtils.lerp(clampedStart, clampedEnd, vFrac);
    course.getFrameAt(s, frame);
    const centerLat = typeof lateralCenter === 'function' ? lateralCenter(frame) : lateralCenter;

    for (let c = 0; c < cols; c++) {
      const uFrac = c / latSubdivs;
      const lat = centerLat + THREE.MathUtils.lerp(-halfW, halfW, uFrac);
      vPos
        .copy(frame.position)
        .addScaledVector(frame.right, lat)
        .addScaledVector(frame.up, lift);

      const idx = r * cols + c;
      positions[idx * 3] = vPos.x;
      positions[idx * 3 + 1] = vPos.y;
      positions[idx * 3 + 2] = vPos.z;
      uvs[idx * 2] = uFrac;
      uvs[idx * 2 + 1] = vFrac * uvRepeatY;
    }
  }

  for (let r = 0; r < lengthSteps; r++) {
    for (let c = 0; c < latSubdivs; c++) {
      const a = r * cols + c;
      const b = a + 1;
      const cIdx = (r + 1) * cols + c;
      const d = cIdx + 1;
      indices.push(a, b, cIdx);
      indices.push(b, d, cIdx);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function buildTrackAccents(
  course: Course,
  maxAnisotropy = 8,
  initialPreset: VisualPresetName = CONFIG.visual.activePreset,
): TrackAccentsVisual {
  const group = new THREE.Group();
  group.name = 'TrackAccentsGroup';

  const cfg = CONFIG.styles.accents;
  const preset = VISUAL_PRESETS[initialPreset];

  let pulseTex = createPulseStripTexture(maxAnisotropy, preset);
  let hazardTex = createHazardBorderTexture(maxAnisotropy, preset);
  let targetTex = createLandingTargetTexture(maxAnisotropy, preset);

  const pulseMat = new THREE.MeshStandardMaterial({
    map: pulseTex,
    emissive: new THREE.Color(0xffffff),
    emissiveMap: pulseTex,
    emissiveIntensity: cfg.emissiveIntensity,
    roughness: 0.22,
    metalness: 0.06,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  const hazardMat = new THREE.MeshPhysicalMaterial({
    map: hazardTex,
    roughness: 0.24,
    metalness: 0.04,
    clearcoat: 0.75,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  const targetMat = new THREE.MeshPhysicalMaterial({
    map: targetTex,
    transparent: true,
    alphaTest: 0.15,
    roughness: 0.25,
    metalness: 0.05,
    clearcoat: 0.7,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  const geomsToDispose: THREE.BufferGeometry[] = [];
  const matsToDispose: THREE.Material[] = [pulseMat, hazardMat, targetMat];

  const segments = course.getSegmentList();
  const gaps = course.getGapRanges();

  // 1. Pulsing edge guide strips along every loop segment
  for (const seg of segments) {
    if (seg.type !== 'loop') continue;
    const repeatY = Math.max(4, Math.round(seg.length / 8));
    for (const side of [-1, 1] as const) {
      const geom = buildSurfaceRibbonGeometry(
        course,
        seg.startS,
        seg.endS,
        (frame) => side * (frame.width * 0.5 - 0.55),
        cfg.loopStripWidth,
        cfg.loopStripLift,
        repeatY,
      );
      if (geom) {
        geomsToDispose.push(geom);
        const mesh = new THREE.Mesh(geom, pulseMat);
        mesh.receiveShadow = true;
        mesh.updateMatrix();
        mesh.matrixAutoUpdate = false;
        group.add(mesh);
      }
    }
  }

  // 2. Jump ramp pulsing guide strips, diagonal hazard edge stripes, and landing zone target decals
  for (const gap of gaps) {
    // Pulsing guide strips over the 18m run-up before the jump threshold
    const pulseStart = Math.max(0, gap.startS - 18);
    const pulseEnd = Math.max(pulseStart, gap.startS - 2.9);
    if (pulseEnd - pulseStart > 1.0) {
      for (const side of [-1, 1] as const) {
        const geom = buildSurfaceRibbonGeometry(
          course,
          pulseStart,
          pulseEnd,
          (frame) => side * (frame.width * 0.5 - 0.55),
          cfg.loopStripWidth,
          cfg.loopStripLift,
          Math.max(2, Math.round((pulseEnd - pulseStart) / 4)),
        );
        if (geom) {
          geomsToDispose.push(geom);
          const mesh = new THREE.Mesh(geom, pulseMat);
          mesh.receiveShadow = true;
          mesh.updateMatrix();
          mesh.matrixAutoUpdate = false;
          group.add(mesh);
        }
      }
    }

    // Diagonal hazard ramp stripes along both edges of the takeoff ramp
    if (cfg.hazardStripe) {
      const hazStart = Math.max(0, gap.startS - 11);
      const hazEnd = Math.max(hazStart, gap.startS - 2.9);
      if (hazEnd - hazStart > 0.8) {
        for (const side of [-1, 1] as const) {
          const geom = buildSurfaceRibbonGeometry(
            course,
            hazStart,
            hazEnd,
            (frame) => side * (frame.width * 0.5 - 1.25),
            0.55,
            0.016,
            Math.max(2, Math.round((hazEnd - hazStart) / 2.2)),
          );
          if (geom) {
            geomsToDispose.push(geom);
            const mesh = new THREE.Mesh(geom, hazardMat);
            mesh.receiveShadow = true;
            mesh.updateMatrix();
            mesh.matrixAutoUpdate = false;
            group.add(mesh);
          }
        }
      }
    }

    // Landing target decal on landing deck shortly past the gap's yellow warning strip
    const landStart = gap.endS + 3.4;
    const landEnd = gap.endS + 17.4;
    const nextGap = gaps.find((g) => g.startS > gap.endS);
    const maxAllowedEnd = nextGap ? nextGap.startS - 4.0 : course.getLength();
    const clampedEnd = Math.min(landEnd, maxAllowedEnd);
    if (clampedEnd - landStart >= 6) {
      const midFrame = course.getFrameAt((landStart + clampedEnd) * 0.5);
      const targetSize = Math.min(clampedEnd - landStart, midFrame.width * 0.62, 10.5);
      const centerS = (landStart + clampedEnd) * 0.5;
      const geom = buildSurfaceRibbonGeometry(
        course,
        centerS - targetSize * 0.5,
        centerS + targetSize * 0.5,
        0,
        targetSize,
        0.014,
        1,
      );
      if (geom) {
        geomsToDispose.push(geom);
        const mesh = new THREE.Mesh(geom, targetMat);
        mesh.receiveShadow = true;
        mesh.updateMatrix();
        mesh.matrixAutoUpdate = false;
        group.add(mesh);
      }
    }
  }

  let pulseClock = 0;

  function update(dt: number): void {
    pulseClock += dt;
    pulseTex.offset.y = (pulseTex.offset.y - dt * 1.45) % 1;
    const wave = 0.8 + 0.25 * Math.sin(pulseClock * cfg.pulseSpeed * Math.PI * 2);
    pulseMat.emissiveIntensity = cfg.emissiveIntensity * wave;
  }

  function applyPalette(name: VisualPresetName): void {
    const nextPreset = VISUAL_PRESETS[name];

    const prevPulse = pulseTex;
    const prevOffset = prevPulse.offset.y;
    pulseTex = createPulseStripTexture(maxAnisotropy, nextPreset);
    pulseTex.offset.y = prevOffset;
    pulseMat.map = pulseTex;
    pulseMat.emissiveMap = pulseTex;
    pulseMat.needsUpdate = true;
    prevPulse.dispose();

    const prevHazard = hazardTex;
    hazardTex = createHazardBorderTexture(maxAnisotropy, nextPreset);
    hazardMat.map = hazardTex;
    hazardMat.needsUpdate = true;
    prevHazard.dispose();

    const prevTarget = targetTex;
    targetTex = createLandingTargetTexture(maxAnisotropy, nextPreset);
    targetMat.map = targetTex;
    targetMat.needsUpdate = true;
    prevTarget.dispose();
  }

  function dispose(): void {
    for (const g of geomsToDispose) g.dispose();
    for (const m of matsToDispose) m.dispose();
    pulseTex.dispose();
    hazardTex.dispose();
    targetTex.dispose();
  }

  return {
    group,
    update,
    applyPalette,
    dispose,
  };
}
