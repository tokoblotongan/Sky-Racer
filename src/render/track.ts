// src/render/track.ts

import * as THREE from 'three';
import { CONFIG, VISUAL_PRESETS, type VisualPreset, type VisualPresetName } from '../config';
import type { Course, CourseChunkRange, Route, TrackFrame } from '../core/course';

interface ProfilePoint {
  xNorm: number;
  xOffset: number;
  yOffset: number;
  u: number;
}

interface SweptMeshResult {
  geometry: THREE.BufferGeometry;
}

interface RingSpec {
  frame: TrackFrame;
  profileScale: number;
  profileMidY: number;
  tangentShift: number;
  vCoord: number;
}

export interface TrackVisual {
  group: THREE.Group;
  update: (dt: number) => void;
  applyPalette: (name: VisualPresetName) => void;
  dispose: () => void;
}

function createTrackCanvasTexture(
  maxAnisotropy: number,
  preset: VisualPreset,
  isWideTrack = false,
): THREE.CanvasTexture {
  const size = CONFIG.course.trackTextureSize;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const c = preset.colors;
    const grad = ctx.createLinearGradient(0, 0, size, 0);
    grad.addColorStop(0.0, c.trackEdge);
    grad.addColorStop(0.085, c.trackEdge);
    grad.addColorStop(0.135, c.track);
    grad.addColorStop(0.865, c.track);
    grad.addColorStop(0.915, c.trackEdge);
    grad.addColorStop(1.0, c.trackEdge);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const groovePositions = isWideTrack
      ? [0.16, 0.39, 0.61, 0.84]
      : [0.22, 0.35, 0.65, 0.78];
    ctx.strokeStyle = c.trackGroove;
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.24;
    for (const normX of groovePositions) {
      const x = normX * size;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size);
      ctx.stroke();
    }

    ctx.fillStyle = c.trackCenterDash;
    ctx.globalAlpha = 0.92;
    const dashCount = 4;
    const cellHeight = size / dashCount;
    const dashLength = cellHeight * 0.52;
    const laneDividers = isWideTrack ? [0.28, 0.5, 0.72] : [0.5];
    const dashWidth = Math.max(5, size * (isWideTrack ? 0.011 : 0.016));
    for (const divider of laneDividers) {
      const dashX = divider * size - dashWidth * 0.5;
      for (let i = 0; i < dashCount; i++) {
        const y = i * cellHeight + (cellHeight - dashLength) * 0.5;
        ctx.fillRect(dashX, y, dashWidth, dashLength);
      }
    }

    ctx.strokeStyle = c.trackEdge;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.14;
    ctx.beginPath();
    ctx.moveTo(0, 1);
    ctx.lineTo(size, 1);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = maxAnisotropy;
  return texture;
}

function createRailCanvasTexture(
  maxAnisotropy: number,
  preset: VisualPreset,
): THREE.CanvasTexture {
  const size = CONFIG.course.railTextureSize;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const c = preset.colors;
    const grad = ctx.createLinearGradient(0, 0, size, 0);
    grad.addColorStop(0.0, c.rail);
    grad.addColorStop(0.35, c.railHighlight);
    grad.addColorStop(0.65, c.railHighlight);
    grad.addColorStop(1.0, c.rail);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = c.railHighlight;
    ctx.globalAlpha = 0.24;
    ctx.lineWidth = 3;
    const steps = 4;
    for (let i = 0; i < steps; i++) {
      const y = (i + 0.5) * (size / steps);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = maxAnisotropy;
  return texture;
}

function createJumpStripCanvasTexture(
  maxAnisotropy: number,
  preset: VisualPreset,
): THREE.CanvasTexture {
  const size = CONFIG.course.jumpStripTextureSize;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const c = preset.colors;
    ctx.fillStyle = c.accent;
    ctx.fillRect(0, 0, size, size);

    ctx.save();
    ctx.fillStyle = c.jumpStripeDark;
    const stripeCount = 6;
    const stripePitch = size / stripeCount;
    const stripeWidth = stripePitch * 0.44;
    for (let i = -stripeCount; i <= stripeCount * 2; i++) {
      const x0 = i * stripePitch;
      ctx.beginPath();
      ctx.moveTo(x0, 0);
      ctx.lineTo(x0 + stripeWidth, 0);
      ctx.lineTo(x0 + stripeWidth + size * 0.55, size);
      ctx.lineTo(x0 + size * 0.55, size);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    ctx.fillStyle = c.accent;
    const borderH = Math.max(8, size * 0.11);
    ctx.fillRect(0, 0, size, borderH);
    ctx.fillRect(0, size - borderH, size, borderH);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = maxAnisotropy;
  return texture;
}

function createBoostPadCanvasTexture(
  maxAnisotropy: number,
  preset: VisualPreset,
): THREE.CanvasTexture {
  const size = CONFIG.boost.textureSize;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const c = preset.colors;
    ctx.fillStyle = c.boostBase;
    ctx.fillRect(0, 0, size, size);

    const borderW = size * 0.08;
    ctx.fillStyle = c.boost;
    ctx.fillRect(0, 0, borderW, size);
    ctx.fillRect(size - borderW, 0, borderW, size);

    const chevronCount = 3;
    const cellH = size / chevronCount;
    const midX = size * 0.5;
    const padX = size * 0.14;

    for (let i = -1; i <= chevronCount; i++) {
      const baseY = i * cellH;
      const tipY = baseY + cellH * 0.16;
      const wingY = baseY + cellH * 0.64;
      const thickness = cellH * 0.28;

      ctx.fillStyle = c.boost;
      ctx.beginPath();
      ctx.moveTo(midX, tipY);
      ctx.lineTo(size - padX, wingY);
      ctx.lineTo(size - padX, wingY + thickness);
      ctx.lineTo(midX, tipY + thickness);
      ctx.lineTo(padX, wingY + thickness);
      ctx.lineTo(padX, wingY);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = c.boostStripeLight;
      ctx.beginPath();
      ctx.moveTo(midX, tipY + thickness * 0.22);
      ctx.lineTo(size - padX * 1.35, wingY + thickness * 0.16);
      ctx.lineTo(size - padX * 1.35, wingY + thickness * 0.62);
      ctx.lineTo(midX, tipY + thickness * 0.68);
      ctx.lineTo(padX * 1.35, wingY + thickness * 0.62);
      ctx.lineTo(padX * 1.35, wingY + thickness * 0.16);
      ctx.closePath();
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = maxAnisotropy;
  return texture;
}

function createStartGridCanvasTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const cols = 12;
    const rows = 3;
    const cellW = size / cols;
    const cellH = size / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? '#FFFDF7' : '#111827';
        ctx.fillRect(c * cellW, r * cellH, cellW + 0.5, cellH + 0.5);
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = maxAnisotropy;
  return texture;
}

function createShortcutEdgeStripTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const w = 64;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = CONFIG.shortcut.edgeStrip.color;
    ctx.fillRect(w * 0.14, h * 0.08, w * 0.72, h * 0.54);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = maxAnisotropy;
  return texture;
}

function buildTrackCrossSectionProfile(): ProfilePoint[] {
  const cfg = CONFIG.course;
  const thickness = cfg.trackThickness;
  const topR = Math.min(cfg.edgeRadius, thickness * 0.48);
  const botR = Math.min(cfg.bottomRadius, thickness * 0.45);
  const topSegs = cfg.edgeArcSegments;
  const botSegs = cfg.bottomArcSegments;

  const points: ProfilePoint[] = [];

  for (let i = 0; i <= topSegs; i++) {
    const angle = Math.PI - (i / topSegs) * (Math.PI * 0.5);
    const dx = Math.cos(angle) * topR;
    const dy = Math.sin(angle) * topR;
    const u = THREE.MathUtils.lerp(0.03, 0.08, i / topSegs);
    points.push({
      xNorm: -1,
      xOffset: topR + dx,
      yOffset: -topR + dy,
      u,
    });
  }

  const deckDivisions = 6;
  for (let d = 1; d < deckDivisions; d++) {
    const t = d / deckDivisions;
    points.push({
      xNorm: THREE.MathUtils.lerp(-1, 1, t),
      xOffset: THREE.MathUtils.lerp(topR, -topR, t),
      yOffset: 0,
      u: THREE.MathUtils.lerp(0.08, 0.92, t),
    });
  }

  for (let i = 0; i <= topSegs; i++) {
    const angle = Math.PI * 0.5 - (i / topSegs) * (Math.PI * 0.5);
    const dx = Math.cos(angle) * topR;
    const dy = Math.sin(angle) * topR;
    const u = THREE.MathUtils.lerp(0.92, 0.97, i / topSegs);
    points.push({
      xNorm: 1,
      xOffset: -topR + dx,
      yOffset: -topR + dy,
      u,
    });
  }

  for (let i = 0; i <= botSegs; i++) {
    const angle = -(i / botSegs) * (Math.PI * 0.5);
    const dx = Math.cos(angle) * botR;
    const dy = Math.sin(angle) * botR;
    points.push({
      xNorm: 1,
      xOffset: -botR + dx,
      yOffset: -thickness + botR + dy,
      u: 0.96,
    });
  }

  points.push({ xNorm: 0.65, xOffset: 0, yOffset: -thickness, u: 0.2 });
  points.push({ xNorm: -0.65, xOffset: 0, yOffset: -thickness, u: 0.2 });

  for (let i = 0; i <= botSegs; i++) {
    const angle = -Math.PI * 0.5 - (i / botSegs) * (Math.PI * 0.5);
    const dx = Math.cos(angle) * botR;
    const dy = Math.sin(angle) * botR;
    points.push({
      xNorm: -1,
      xOffset: botR + dx,
      yOffset: -thickness + botR + dy,
      u: 0.04,
    });
  }

  return points;
}

function buildRoundedRailProfile(width: number, height: number, arcSegments: number): ProfilePoint[] {
  const halfW = width * 0.5;
  const halfH = height * 0.5;
  const r = Math.min(halfW, halfH) * 0.85;
  const points: ProfilePoint[] = [];

  const corners = [
    { cx: -halfW + r, cy: halfH - r, start: Math.PI, uStart: 0.05, uEnd: 0.25 },
    { cx: halfW - r, cy: halfH - r, start: Math.PI * 0.5, uStart: 0.25, uEnd: 0.5 },
    { cx: halfW - r, cy: -halfH + r, start: 0, uStart: 0.5, uEnd: 0.75 },
    { cx: -halfW + r, cy: -halfH + r, start: -Math.PI * 0.5, uStart: 0.75, uEnd: 0.95 },
  ];

  for (const c of corners) {
    for (let i = 0; i <= arcSegments; i++) {
      const t = i / arcSegments;
      const angle = c.start - t * (Math.PI * 0.5);
      points.push({
        xNorm: 0,
        xOffset: c.cx + Math.cos(angle) * r,
        yOffset: c.cy + Math.sin(angle) * r,
        u: THREE.MathUtils.lerp(c.uStart, c.uEnd, t),
      });
    }
  }

  return points;
}

function splitSolidSpans(samples: readonly TrackFrame[]): TrackFrame[][] {
  const spans: TrackFrame[][] = [];
  let current: TrackFrame[] = [];

  for (const sample of samples) {
    if (sample.isGap) {
      if (current.length >= 2) {
        spans.push(current);
      }
      current = [];
    } else {
      current.push(sample);
    }
  }

  if (current.length >= 2) {
    spans.push(current);
  }
  return spans;
}

function splitRailSideSpans(
  route: Route,
  solidSpans: readonly TrackFrame[][],
  side: -1 | 1,
): TrackFrame[][] {
  const railSpans: TrackFrame[][] = [];
  for (const span of solidSpans) {
    let current: TrackFrame[] = [];
    for (const sample of span) {
      if (route.getStyleAt(sample.s) === 'bridge' || route.isRailGapAt(sample.s, side)) {
        if (current.length >= 2) {
          railSpans.push(current);
        }
        current = [];
      } else {
        current.push(sample);
      }
    }
    if (current.length >= 2) {
      railSpans.push(current);
    }
  }
  return railSpans;
}

function sliceSpanFramesForRange(
  route: Route,
  spanFrames: readonly TrackFrame[],
  startS: number,
  endS: number,
): TrackFrame[] {
  const out: TrackFrame[] = [];
  out.push(route.getFrameAt(startS));
  for (let i = 0; i < spanFrames.length; i++) {
    const f = spanFrames[i];
    if (f.s > startS + 1e-4 && f.s < endS - 1e-4) {
      out.push(f);
    }
  }
  out.push(route.getFrameAt(endS));
  return out;
}

function buildRingSequence(
  frames: readonly TrackFrame[],
  tileMeters: number,
  startBevelLength: number,
  endBevelLength: number,
  bevelSegments: number,
  profileMidY: number,
): RingSpec[] {
  const rings: RingSpec[] = [];
  const firstFrame = frames[0];
  const lastFrame = frames[frames.length - 1];

  if (startBevelLength > 1e-4 && bevelSegments >= 1) {
    for (let k = bevelSegments; k >= 1; k--) {
      const t = k / bevelSegments;
      const angle = t * (Math.PI * 0.46);
      const shift = -startBevelLength * Math.sin(angle);
      rings.push({
        frame: firstFrame,
        profileScale: Math.max(0.14, Math.cos(angle)),
        profileMidY,
        tangentShift: shift,
        vCoord: (firstFrame.s + shift) / tileMeters,
      });
    }
  }

  for (const frame of frames) {
    rings.push({
      frame,
      profileScale: 1,
      profileMidY,
      tangentShift: 0,
      vCoord: frame.s / tileMeters,
    });
  }

  if (endBevelLength > 1e-4 && bevelSegments >= 1) {
    for (let k = 1; k <= bevelSegments; k++) {
      const t = k / bevelSegments;
      const angle = t * (Math.PI * 0.46);
      const shift = endBevelLength * Math.sin(angle);
      rings.push({
        frame: lastFrame,
        profileScale: Math.max(0.14, Math.cos(angle)),
        profileMidY,
        tangentShift: shift,
        vCoord: (lastFrame.s + shift) / tileMeters,
      });
    }
  }

  return rings;
}

function buildSweptGeometry(
  frames: readonly TrackFrame[],
  profile: readonly ProfilePoint[],
  tileMeters: number,
  computeLateralOffset: (frame: TrackFrame, pt: ProfilePoint, profileScale: number) => number,
  verticalBias: number,
  startBevelLength: number,
  endBevelLength: number,
  bevelSegments: number,
  profileMidY: number,
): SweptMeshResult {
  const rings = buildRingSequence(
    frames,
    tileMeters,
    startBevelLength,
    endBevelLength,
    bevelSegments,
    profileMidY,
  );
  const ringCount = rings.length;
  const profCount = profile.length;
  const ringStride = profCount + 1;

  const hasStartCap = startBevelLength > 1e-4;
  const hasEndCap = endBevelLength > 1e-4;
  const sideVertexCount = ringCount * ringStride;
  const capVertexCount = (hasStartCap ? profCount : 0) + (hasEndCap ? profCount : 0);
  const totalVertices = sideVertexCount + capVertexCount;

  const positions = new Float32Array(totalVertices * 3);
  const uvs = new Float32Array(totalVertices * 2);
  const indices: number[] = [];

  const vPos = new THREE.Vector3();

  for (let r = 0; r < ringCount; r++) {
    const ring = rings[r];
    const frame = ring.frame;

    for (let p = 0; p < ringStride; p++) {
      const pt = profile[p % profCount];
      const lat = computeLateralOffset(frame, pt, ring.profileScale);
      const scaledY = ring.profileMidY + (pt.yOffset - ring.profileMidY) * ring.profileScale;
      const vert = scaledY + verticalBias;

      vPos
        .copy(frame.position)
        .addScaledVector(frame.tangent, ring.tangentShift)
        .addScaledVector(frame.right, lat)
        .addScaledVector(frame.up, vert);

      const idx = r * ringStride + p;
      positions[idx * 3] = vPos.x;
      positions[idx * 3 + 1] = vPos.y;
      positions[idx * 3 + 2] = vPos.z;

      uvs[idx * 2] = p === profCount ? profile[0].u : pt.u;
      uvs[idx * 2 + 1] = ring.vCoord;
    }
  }

  for (let r = 0; r < ringCount - 1; r++) {
    const rowA = r * ringStride;
    const rowB = (r + 1) * ringStride;
    for (let p = 0; p < profCount; p++) {
      const a = rowA + p;
      const b = rowA + p + 1;
      const c = rowB + p;
      const d = rowB + p + 1;

      indices.push(a, b, c);
      indices.push(b, d, c);
    }
  }

  let capCursor = sideVertexCount;

  if (hasStartCap) {
    const startRing = rings[0];
    const startCapOffset = capCursor;
    capCursor += profCount;
    for (let p = 0; p < profCount; p++) {
      const pt = profile[p];
      const startScaledY =
        startRing.profileMidY + (pt.yOffset - startRing.profileMidY) * startRing.profileScale;
      vPos
        .copy(startRing.frame.position)
        .addScaledVector(startRing.frame.tangent, startRing.tangentShift)
        .addScaledVector(
          startRing.frame.right,
          computeLateralOffset(startRing.frame, pt, startRing.profileScale),
        )
        .addScaledVector(startRing.frame.up, startScaledY + verticalBias);
      positions[(startCapOffset + p) * 3] = vPos.x;
      positions[(startCapOffset + p) * 3 + 1] = vPos.y;
      positions[(startCapOffset + p) * 3 + 2] = vPos.z;
      uvs[(startCapOffset + p) * 2] = pt.u;
      uvs[(startCapOffset + p) * 2 + 1] = startRing.vCoord;
    }
    for (let p = 1; p < profCount - 1; p++) {
      indices.push(startCapOffset, startCapOffset + p + 1, startCapOffset + p);
    }
  }

  if (hasEndCap) {
    const endRing = rings[ringCount - 1];
    const endCapOffset = capCursor;
    for (let p = 0; p < profCount; p++) {
      const pt = profile[p];
      const endScaledY =
        endRing.profileMidY + (pt.yOffset - endRing.profileMidY) * endRing.profileScale;
      vPos
        .copy(endRing.frame.position)
        .addScaledVector(endRing.frame.tangent, endRing.tangentShift)
        .addScaledVector(
          endRing.frame.right,
          computeLateralOffset(endRing.frame, pt, endRing.profileScale),
        )
        .addScaledVector(endRing.frame.up, endScaledY + verticalBias);
      positions[(endCapOffset + p) * 3] = vPos.x;
      positions[(endCapOffset + p) * 3 + 1] = vPos.y;
      positions[(endCapOffset + p) * 3 + 2] = vPos.z;
      uvs[(endCapOffset + p) * 2] = pt.u;
      uvs[(endCapOffset + p) * 2 + 1] = endRing.vCoord;
    }
    for (let p = 1; p < profCount - 1; p++) {
      indices.push(endCapOffset, endCapOffset + p, endCapOffset + p + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  return { geometry };
}

function createSurfaceRibbonMesh(
  route: Route,
  startS: number,
  endS: number,
  lateralCenter: number,
  ribbonWidth: number,
  lift: number,
  uScale: number,
  flipV: boolean,
  material: THREE.Material,
  vTileMeters?: number,
): THREE.Mesh | null {
  const cfg = CONFIG.course;
  const totalLen = route.getLength();
  const isClosed = route.isClosed();
  const clampedStart = isClosed ? startS : Math.max(0, startS);
  const clampedEnd = isClosed ? endS : Math.min(totalLen, endS);
  const spanLen = clampedEnd - clampedStart;
  if (spanLen < 0.2) {
    return null;
  }

  const latSubdivs = 8;
  const lengthSteps = Math.max(4, Math.ceil(spanLen / cfg.stepLength));
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
    width: cfg.trackWidth,
    bank: 0,
  };
  const vPos = new THREE.Vector3();
  const halfW = ribbonWidth * 0.5;

  for (let r = 0; r < rows; r++) {
    const vFrac = r / lengthSteps;
    const s = THREE.MathUtils.lerp(clampedStart, clampedEnd, vFrac);
    route.getFrameAt(s, frame);

    for (let c = 0; c < cols; c++) {
      const uFrac = c / latSubdivs;
      const lat = lateralCenter + THREE.MathUtils.lerp(-halfW, halfW, uFrac);
      vPos
        .copy(frame.position)
        .addScaledVector(frame.right, lat)
        .addScaledVector(frame.up, lift);

      const idx = r * cols + c;
      positions[idx * 3] = vPos.x;
      positions[idx * 3 + 1] = vPos.y;
      positions[idx * 3 + 2] = vPos.z;
      uvs[idx * 2] = uFrac * uScale;
      const vRepeat = vTileMeters ? spanLen / Math.max(0.2, vTileMeters) : 1;
      uvs[idx * 2 + 1] = flipV ? (1 - vFrac) * 2 : vFrac * vRepeat;
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

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.frustumCulled = true;
  return mesh;
}

interface RailPostEntry {
  s: number;
  side: -1 | 1;
}

function addChunkRailPosts(
  chunkGroup: THREE.Group,
  route: Route,
  railMaterial: THREE.Material,
  postGeometry: THREE.BufferGeometry,
  endBodyGeom: THREE.BufferGeometry,
  endDomeGeom: THREE.BufferGeometry,
  postEntries: readonly RailPostEntry[],
  endEntries: readonly RailPostEntry[],
): void {
  const cfg = CONFIG.course;
  const frame: TrackFrame = {
    s: 0,
    position: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
    up: new THREE.Vector3(),
    right: new THREE.Vector3(),
    width: cfg.trackWidth,
    bank: 0,
  };
  const basisMatrix = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const negForward = new THREE.Vector3();

  if (postEntries.length > 0) {
    const instanced = new THREE.InstancedMesh(postGeometry, railMaterial, postEntries.length);
    instanced.castShadow = true;
    instanced.receiveShadow = true;
    instanced.frustumCulled = true;

    for (let idx = 0; idx < postEntries.length; idx++) {
      const entry = postEntries[idx];
      route.getFrameAt(entry.s, frame);
      const railEdgeOffset =
        frame.width * 0.5 + CONFIG.physics.railInnerOffset + cfg.railWidth * 0.5;
      negForward.copy(frame.tangent).negate();
      basisMatrix.makeBasis(frame.right, frame.up, negForward);

      pos
        .copy(frame.position)
        .addScaledVector(frame.right, entry.side * railEdgeOffset)
        .addScaledVector(frame.up, cfg.railVerticalOffset * 0.35);
      basisMatrix.setPosition(pos);
      instanced.setMatrixAt(idx, basisMatrix);
    }

    instanced.instanceMatrix.needsUpdate = true;
    instanced.computeBoundingSphere();
    chunkGroup.add(instanced);
  }

  if (endEntries.length > 0) {
    const totalEndPosts = endEntries.length;
    const endBodies = new THREE.InstancedMesh(endBodyGeom, railMaterial, totalEndPosts);
    const endDomes = new THREE.InstancedMesh(endDomeGeom, railMaterial, totalEndPosts);
    endBodies.castShadow = true;
    endBodies.receiveShadow = true;
    endBodies.frustumCulled = true;
    endDomes.castShadow = true;
    endDomes.receiveShadow = true;
    endDomes.frustumCulled = true;

    const postCenterHeight = cfg.railVerticalOffset * 0.5 + cfg.railEndPostHeight * 0.35;
    const domeHeight = postCenterHeight + cfg.railEndPostHeight * 0.5;

    for (let endIdx = 0; endIdx < endEntries.length; endIdx++) {
      const entry = endEntries[endIdx];
      route.getFrameAt(entry.s, frame);
      const railCenterOffset =
        frame.width * 0.5 + CONFIG.physics.railInnerOffset + cfg.railWidth * 0.5;
      negForward.copy(frame.tangent).negate();
      basisMatrix.makeBasis(frame.right, frame.up, negForward);

      pos
        .copy(frame.position)
        .addScaledVector(frame.right, entry.side * railCenterOffset)
        .addScaledVector(frame.up, postCenterHeight);
      basisMatrix.setPosition(pos);
      endBodies.setMatrixAt(endIdx, basisMatrix);

      pos
        .copy(frame.position)
        .addScaledVector(frame.right, entry.side * railCenterOffset)
        .addScaledVector(frame.up, domeHeight);
      basisMatrix.setPosition(pos);
      endDomes.setMatrixAt(endIdx, basisMatrix);
    }

    endBodies.instanceMatrix.needsUpdate = true;
    endBodies.computeBoundingSphere();
    endDomes.instanceMatrix.needsUpdate = true;
    endDomes.computeBoundingSphere();
    chunkGroup.add(endBodies, endDomes);
  }
}

function buildDebugCourseFrames(course: Course): THREE.Group {
  const debugGroup = new THREE.Group();
  debugGroup.name = 'CourseDebugFrames';

  const samples = course.getSamples();
  const centerPoints: THREE.Vector3[] = samples.map((f) =>
    f.position.clone().addScaledVector(f.up, 0.06),
  );
  const lineGeometry = new THREE.BufferGeometry().setFromPoints(centerPoints);
  const lineMaterial = new THREE.LineBasicMaterial({
    color: CONFIG.colors.debugCenterLineHex,
  });
  debugGroup.add(new THREE.Line(lineGeometry, lineMaterial));

  const totalLen = course.getLength();
  const step = CONFIG.debug.courseFrameStepMeters;
  const arrowLen = CONFIG.debug.courseFrameArrowLength;
  const origin = new THREE.Vector3();

  for (let s = 0; s <= totalLen; s += step) {
    const frame = course.getFrameAt(s);
    origin.copy(frame.position).addScaledVector(frame.up, 0.08);

    debugGroup.add(
      new THREE.ArrowHelper(
        frame.tangent,
        origin,
        arrowLen,
        CONFIG.colors.debugTangentHex,
        arrowLen * 0.22,
        arrowLen * 0.12,
      ),
    );
    debugGroup.add(
      new THREE.ArrowHelper(
        frame.up,
        origin,
        arrowLen,
        CONFIG.colors.debugUpHex,
        arrowLen * 0.22,
        arrowLen * 0.12,
      ),
    );
    debugGroup.add(
      new THREE.ArrowHelper(
        frame.right,
        origin,
        arrowLen,
        CONFIG.colors.debugRightHex,
        arrowLen * 0.22,
        arrowLen * 0.12,
      ),
    );
  }

  return debugGroup;
}

export function buildTrackMesh(
  course: Course,
  maxAnisotropy = 8,
  initialPreset: VisualPresetName = CONFIG.visual.activePreset,
): TrackVisual {
  const cfg = CONFIG.course;
  const activePreset = VISUAL_PRESETS[initialPreset];
  const mainIsWideTrack = course.getTrackWidth() >= 12;
  const group = new THREE.Group();
  group.name = 'TrackGroup';

  const trackProfile = buildTrackCrossSectionProfile();
  let mainTrackTexture = createTrackCanvasTexture(maxAnisotropy, activePreset, mainIsWideTrack);
  const mainTrackMaterial = new THREE.MeshPhysicalMaterial({
    map: mainTrackTexture,
    clearcoat: cfg.trackClearcoat,
    clearcoatRoughness: activePreset.trackClearcoatRoughness,
    envMapIntensity: activePreset.trackEnvIntensity,
    roughness: cfg.trackRoughness,
    metalness: cfg.trackMetalness,
    ior: cfg.trackIor,
  });

  const branches = course.getBranchRoutes();
  const hasBranches = branches.length > 0;
  let branchTrackTexture: THREE.CanvasTexture | null = null;
  let branchTrackMaterial: THREE.MeshPhysicalMaterial | null = null;
  if (hasBranches) {
    const branchIsWide = branches[0].getTrackWidth() >= 12;
    branchTrackTexture = createTrackCanvasTexture(maxAnisotropy, activePreset, branchIsWide);
    branchTrackMaterial = new THREE.MeshPhysicalMaterial({
      map: branchTrackTexture,
      clearcoat: cfg.trackClearcoat,
      clearcoatRoughness: activePreset.trackClearcoatRoughness,
      envMapIntensity: activePreset.trackEnvIntensity,
      roughness: cfg.trackRoughness,
      metalness: cfg.trackMetalness,
      ior: cfg.trackIor,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
  }

  const railProfile = buildRoundedRailProfile(
    cfg.railWidth,
    cfg.railHeight,
    cfg.railArcSegments,
  );
  let railTexture = createRailCanvasTexture(maxAnisotropy, activePreset);
  const railMaterial = new THREE.MeshPhysicalMaterial({
    map: railTexture,
    clearcoat: cfg.railClearcoat,
    clearcoatRoughness: activePreset.trackClearcoatRoughness,
    envMapIntensity: activePreset.trackEnvIntensity,
    roughness: cfg.railRoughness,
    metalness: cfg.railMetalness,
    ior: cfg.trackIor,
  });

  let jumpStripTexture = createJumpStripCanvasTexture(maxAnisotropy, activePreset);
  const jumpStripMaterial = new THREE.MeshPhysicalMaterial({
    map: jumpStripTexture,
    clearcoat: cfg.trackClearcoat,
    clearcoatRoughness: activePreset.trackClearcoatRoughness,
    envMapIntensity: activePreset.trackEnvIntensity,
    roughness: 0.2,
    metalness: 0.04,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  let boostTexture = createBoostPadCanvasTexture(maxAnisotropy, activePreset);
  const boostColor = new THREE.Color(activePreset.colors.boost);
  const boostMaterial = new THREE.MeshPhysicalMaterial({
    map: boostTexture,
    emissive: boostColor,
    emissiveMap: boostTexture,
    emissiveIntensity: activePreset.colors.boostEmissiveIntensity,
    clearcoat: 0.9,
    clearcoatRoughness: 0.1,
    roughness: 0.2,
    metalness: 0.06,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });

  const startGridTexture = createStartGridCanvasTexture(maxAnisotropy);
  const startGridMaterial = new THREE.MeshPhysicalMaterial({
    map: startGridTexture,
    clearcoat: 0.85,
    clearcoatRoughness: 0.12,
    roughness: 0.24,
    metalness: 0.04,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  let edgeStripTexture: THREE.CanvasTexture | null = null;
  let edgeStripMaterial: THREE.MeshStandardMaterial | null = null;
  if (hasBranches) {
    const stripCfg = CONFIG.shortcut.edgeStrip;
    edgeStripTexture = createShortcutEdgeStripTexture(maxAnisotropy);
    edgeStripMaterial = new THREE.MeshStandardMaterial({
      map: edgeStripTexture,
      color: new THREE.Color(stripCfg.color),
      emissive: new THREE.Color(stripCfg.color),
      emissiveMap: edgeStripTexture,
      emissiveIntensity: stripCfg.emissiveIntensity,
      transparent: true,
      alphaTest: 0.1,
      roughness: 0.22,
      metalness: 0.05,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
  }

  const postGeometry = new THREE.CylinderGeometry(
    cfg.railPostRadius,
    cfg.railPostRadius,
    cfg.railPostHeight,
    10,
  );
  const endBodyGeom = new THREE.CylinderGeometry(
    cfg.railEndPostRadius,
    cfg.railEndPostRadius,
    cfg.railEndPostHeight,
    14,
  );
  const endDomeGeom = new THREE.SphereGeometry(cfg.railEndPostRadius, 14, 10);

  for (const route of course.getAllRoutes()) {
    const isMainRoute = route.routeId === 'main';
    const isClosed = route.isClosed();
    const totalLen = route.getLength();
    const isWideTrack = route.getTrackWidth() >= 12;
    const trackTileMeters = isClosed
      ? totalLen / Math.max(1, Math.round(totalLen / cfg.trackTileMeters))
      : cfg.trackTileMeters;
    const railTileMeters = isClosed
      ? totalLen / Math.max(1, Math.round(totalLen / cfg.railTileMeters))
      : cfg.railTileMeters;

    const spans = splitSolidSpans(route.getSamples());
    const railSpansLeft = splitRailSideSpans(route, spans, -1);
    const railSpansRight = splitRailSideSpans(route, spans, 1);
    const chunks: CourseChunkRange[] = route.getChunks(CONFIG.render.trackChunkLength);
    const activeTrackMaterial =
      isMainRoute || !branchTrackMaterial ? mainTrackMaterial : branchTrackMaterial;

    // Collect per-side rail post & end-post S coordinates once (skipping bridge & railGap spans)
    const allPostEntries: RailPostEntry[] = [];
    const allEndPostEntries: RailPostEntry[] = [];

    for (const [side, sideRailSpans] of [
      [-1, railSpansLeft],
      [1, railSpansRight],
    ] as const) {
      for (const span of sideRailSpans) {
        const spanStart = span[0].s;
        const spanEnd = span[span.length - 1].s;
        if (!isClosed || spanStart > 1e-4) {
          allEndPostEntries.push({ s: spanStart, side });
        }
        if (!isClosed || spanEnd < totalLen - 1e-4) {
          allEndPostEntries.push({ s: spanEnd, side });
        }

        const margin = isClosed && spanStart <= 1e-4 && spanEnd >= totalLen - 1e-4 ? 0 : 1.25;
        const usableLen = spanEnd - spanStart - margin * 2;
        if (usableLen > 0.5) {
          const count = Math.max(1, Math.floor(usableLen / cfg.railPostSpacingMeters) + 1);
          for (let i = 0; i < count; i++) {
            if (isClosed && margin === 0 && i === count - 1) {
              continue;
            }
            const frac = count === 1 ? 0.5 : i / (count - 1);
            allPostEntries.push({ s: spanStart + margin + frac * usableLen, side });
          }
        }
      }
    }

    const gaps = route.getGapRanges();
    const boostPads = route.getBoostPads();
    const lastChunkIdx = chunks.length - 1;
    const startStripS = isClosed ? 0 : CONFIG.car.startS;

    for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
      const chunk = chunks[cIdx];
      const chunkGroup = new THREE.Group();
      chunkGroup.name = isMainRoute
        ? `TrackChunk_${chunk.index}`
        : `TrackChunk_${route.routeId}_${chunk.index}`;

      const isLastChunk = cIdx === lastChunkIdx;
      const inChunk = (s: number): boolean =>
        s >= chunk.startS && (isLastChunk ? s <= chunk.endS + 1e-4 : s < chunk.endS);

      // 1. Track deck sliced cleanly across chunk boundaries without inner bevels/gaps
      for (const spanFrames of spans) {
        const spanStart = spanFrames[0].s;
        const spanEnd = spanFrames[spanFrames.length - 1].s;
        const subStart = Math.max(spanStart, chunk.startS);
        const subEnd = Math.min(spanEnd, chunk.endS);
        if (subEnd - subStart < 0.05) {
          continue;
        }

        const chunkFrames = sliceSpanFramesForRange(route, spanFrames, subStart, subEnd);
        const closedSeamStart = isClosed && subStart <= 1e-4;
        const closedSeamEnd = isClosed && subEnd >= totalLen - 1e-4;
        const startBevel =
          closedSeamStart || subStart > spanStart + 1e-4 ? 0 : cfg.endCapBevelLength;
        const endBevel = closedSeamEnd || subEnd < spanEnd - 1e-4 ? 0 : cfg.endCapBevelLength;

        const { geometry: trackGeometry } = buildSweptGeometry(
          chunkFrames,
          trackProfile,
          trackTileMeters,
          (frame, pt, scale) => {
            const halfLat = frame.width * 0.5;
            const innerTuck = (1 - scale) * 0.06;
            return pt.xNorm * (halfLat - innerTuck) + pt.xOffset * scale;
          },
          0,
          startBevel,
          endBevel,
          cfg.endCapBevelSegments,
          -cfg.trackThickness * 0.5,
        );

        const trackMesh = new THREE.Mesh(trackGeometry, activeTrackMaterial);
        trackMesh.castShadow = true;
        trackMesh.receiveShadow = true;
        trackMesh.frustumCulled = true;
        chunkGroup.add(trackMesh);
      }

      // 2. Solid blue guardrails per side (honoring bridge & route rail gaps)
      for (const [side, sideRailSpans] of [
        [-1, railSpansLeft],
        [1, railSpansRight],
      ] as const) {
        for (const railSpanFrames of sideRailSpans) {
          const spanStart = railSpanFrames[0].s;
          const spanEnd = railSpanFrames[railSpanFrames.length - 1].s;
          const subStart = Math.max(spanStart, chunk.startS);
          const subEnd = Math.min(spanEnd, chunk.endS);
          if (subEnd - subStart < 0.05) {
            continue;
          }

          const chunkFrames = sliceSpanFramesForRange(route, railSpanFrames, subStart, subEnd);
          const closedSeamStart = isClosed && subStart <= 1e-4;
          const closedSeamEnd = isClosed && subEnd >= totalLen - 1e-4;
          const startBevel =
            closedSeamStart || subStart > spanStart + 1e-4 ? 0 : cfg.endCapBevelLength;
          const endBevel = closedSeamEnd || subEnd < spanEnd - 1e-4 ? 0 : cfg.endCapBevelLength;
          const railStartBevel = startBevel > 0 ? startBevel * 0.75 : 0;
          const railEndBevel = endBevel > 0 ? endBevel * 0.75 : 0;

          const { geometry: railGeometry } = buildSweptGeometry(
            chunkFrames,
            railProfile,
            railTileMeters,
            (frame, pt, scale) =>
              side * (frame.width * 0.5 + CONFIG.physics.railInnerOffset + cfg.railWidth * 0.5) +
              pt.xOffset * scale,
            cfg.railVerticalOffset,
            railStartBevel,
            railEndBevel,
            cfg.endCapBevelSegments,
            0,
          );

          const railMesh = new THREE.Mesh(railGeometry, railMaterial);
          railMesh.castShadow = true;
          railMesh.receiveShadow = true;
          railMesh.frustumCulled = true;
          chunkGroup.add(railMesh);
        }
      }

      // 2b. Dashed cyan shortcut edge strips along non-gap branch borders
      if (!isMainRoute && edgeStripMaterial) {
        const stripCfg = CONFIG.shortcut.edgeStrip;
        const sideLeftSpans = splitRailSideSpans(route, spans, -1);
        const sideRightSpans = splitRailSideSpans(route, spans, 1);
        for (const [side, sideSpans] of [
          [-1, sideLeftSpans],
          [1, sideRightSpans],
        ] as const) {
          for (const edgeSpan of sideSpans) {
            const spanStart = edgeSpan[0].s;
            const spanEnd = edgeSpan[edgeSpan.length - 1].s;
            const subStart = Math.max(spanStart, chunk.startS);
            const subEnd = Math.min(spanEnd, chunk.endS);
            if (subEnd - subStart < 0.25) continue;
            const stripMesh = createSurfaceRibbonMesh(
              route,
              subStart,
              subEnd,
              side * (route.getTrackWidth() * 0.5 - 0.36),
              stripCfg.width,
              stripCfg.lift,
              1,
              false,
              edgeStripMaterial,
              stripCfg.dashPeriodMeters,
            );
            if (stripMesh) {
              chunkGroup.add(stripMesh);
            }
          }
        }
      }

      // 3. Yellow diagonal jump strips (#FFD23F) placed into matching chunk
      for (const gap of gaps) {
        const takeoffMid = gap.startS - cfg.jumpStripLength * 0.5;
        if (inChunk(takeoffMid)) {
          const takeoffFrame = route.getFrameAt(takeoffMid);
          const stripW = Math.max(1.0, takeoffFrame.width - cfg.jumpStripInset * 2);
          const m = createSurfaceRibbonMesh(
            route,
            gap.startS - cfg.jumpStripLength,
            gap.startS,
            0,
            stripW,
            cfg.jumpStripLift,
            2,
            false,
            jumpStripMaterial,
          );
          if (m) chunkGroup.add(m);
        }

        const landingMid = gap.endS + cfg.jumpStripLength * 0.5;
        if (inChunk(landingMid)) {
          const landingFrame = route.getFrameAt(landingMid);
          const stripW = Math.max(1.0, landingFrame.width - cfg.jumpStripInset * 2);
          const m = createSurfaceRibbonMesh(
            route,
            gap.endS,
            gap.endS + cfg.jumpStripLength,
            0,
            stripW,
            cfg.jumpStripLift,
            2,
            false,
            jumpStripMaterial,
          );
          if (m) chunkGroup.add(m);
        }
      }

      // 4. Boost pads placed into matching chunk
      for (const pad of boostPads) {
        if (!inChunk(pad.s)) continue;
        const m = createSurfaceRibbonMesh(
          route,
          pad.s - pad.length * 0.5,
          pad.s + pad.length * 0.5,
          pad.lateral,
          pad.width,
          CONFIG.boost.lift,
          1,
          true,
          boostMaterial,
        );
        if (m) chunkGroup.add(m);
      }

      // 5. Thin checkered start/finish strip across deck (main route only)
      if (isMainRoute && inChunk(startStripS)) {
        const startFrame = route.getFrameAt(startStripS);
        const startStripW = Math.max(1.2, startFrame.width - 0.55);
        const halfStripLen = isClosed ? 0.9 : 0.65;
        const startStrip = createSurfaceRibbonMesh(
          route,
          startStripS - halfStripLen,
          startStripS + halfStripLen,
          0,
          startStripW,
          0.012,
          isWideTrack ? 2 : 1,
          false,
          startGridMaterial,
        );
        if (startStrip) {
          startStrip.name = 'StartGridStrip';
          chunkGroup.add(startStrip);
        }
      }

      // 6. Support posts & end posts inside this chunk
      const chunkPosts = allPostEntries.filter((entry) => inChunk(entry.s));
      const chunkEndPosts = allEndPostEntries.filter((entry) => inChunk(entry.s));
      addChunkRailPosts(
        chunkGroup,
        route,
        railMaterial,
        postGeometry,
        endBodyGeom,
        endDomeGeom,
        chunkPosts,
        chunkEndPosts,
      );

      group.add(chunkGroup);
    }
  }

  if (CONFIG.debug.showCourseFrames) {
    group.add(buildDebugCourseFrames(course));
  }

  let pulseClock = 0;

  function update(dt: number): void {
    boostTexture.offset.y = (boostTexture.offset.y - dt * CONFIG.boost.uvScrollSpeed) % 1;
    if (edgeStripMaterial && edgeStripTexture) {
      pulseClock += dt;
      edgeStripTexture.offset.y = (edgeStripTexture.offset.y - dt * 0.9) % 1;
      const pulse =
        0.85 + 0.25 * Math.sin(pulseClock * CONFIG.shortcut.edgeStrip.pulseSpeed * Math.PI * 2);
      edgeStripMaterial.emissiveIntensity = CONFIG.shortcut.edgeStrip.emissiveIntensity * pulse;
    }
  }

  function applyPalette(name: VisualPresetName): void {
    const preset = VISUAL_PRESETS[name];

    const prevMainTex = mainTrackTexture;
    mainTrackTexture = createTrackCanvasTexture(maxAnisotropy, preset, mainIsWideTrack);
    mainTrackMaterial.map = mainTrackTexture;
    mainTrackMaterial.clearcoatRoughness = preset.trackClearcoatRoughness;
    mainTrackMaterial.envMapIntensity = preset.trackEnvIntensity;
    mainTrackMaterial.needsUpdate = true;
    prevMainTex.dispose();

    if (branchTrackMaterial && branchTrackTexture && branches.length > 0) {
      const prevBranchTex = branchTrackTexture;
      const branchIsWide = branches[0].getTrackWidth() >= 12;
      branchTrackTexture = createTrackCanvasTexture(maxAnisotropy, preset, branchIsWide);
      branchTrackMaterial.map = branchTrackTexture;
      branchTrackMaterial.clearcoatRoughness = preset.trackClearcoatRoughness;
      branchTrackMaterial.envMapIntensity = preset.trackEnvIntensity;
      branchTrackMaterial.needsUpdate = true;
      prevBranchTex.dispose();
    }

    const prevRailTex = railTexture;
    railTexture = createRailCanvasTexture(maxAnisotropy, preset);
    railMaterial.map = railTexture;
    railMaterial.clearcoatRoughness = preset.trackClearcoatRoughness;
    railMaterial.envMapIntensity = preset.trackEnvIntensity;
    railMaterial.needsUpdate = true;
    prevRailTex.dispose();

    const prevJumpTex = jumpStripTexture;
    jumpStripTexture = createJumpStripCanvasTexture(maxAnisotropy, preset);
    jumpStripMaterial.map = jumpStripTexture;
    jumpStripMaterial.clearcoatRoughness = preset.trackClearcoatRoughness;
    jumpStripMaterial.envMapIntensity = preset.trackEnvIntensity;
    jumpStripMaterial.needsUpdate = true;
    prevJumpTex.dispose();

    const prevBoostTex = boostTexture;
    const prevOffsetY = prevBoostTex.offset.y;
    boostTexture = createBoostPadCanvasTexture(maxAnisotropy, preset);
    boostTexture.offset.y = prevOffsetY;
    boostMaterial.map = boostTexture;
    boostMaterial.emissiveMap = boostTexture;
    boostMaterial.emissive.set(preset.colors.boost);
    boostMaterial.emissiveIntensity = preset.colors.boostEmissiveIntensity;
    boostMaterial.needsUpdate = true;
    prevBoostTex.dispose();
  }

  function dispose(): void {
    const geoms = new Set<THREE.BufferGeometry>([postGeometry, endBodyGeom, endDomeGeom]);
    const mats = new Set<THREE.Material>([
      mainTrackMaterial,
      railMaterial,
      jumpStripMaterial,
      boostMaterial,
      startGridMaterial,
    ]);
    if (branchTrackMaterial) mats.add(branchTrackMaterial);
    if (edgeStripMaterial) mats.add(edgeStripMaterial);

    const texs = new Set<THREE.Texture>([
      mainTrackTexture,
      railTexture,
      jumpStripTexture,
      boostTexture,
      startGridTexture,
    ]);
    if (branchTrackTexture) texs.add(branchTrackTexture);
    if (edgeStripTexture) texs.add(edgeStripTexture);

    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
        geoms.add(obj.geometry);
        const list = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of list) {
          mats.add(m);
        }
      }
    });

    geoms.forEach((g) => g.dispose());
    texs.forEach((t) => t.dispose());
    mats.forEach((m) => m.dispose());
  }

  return {
    group,
    update,
    applyPalette,
    dispose,
  };
}
