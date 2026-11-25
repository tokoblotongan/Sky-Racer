// src/render/track.ts

import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Course, TrackFrame } from '../core/course';

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
}

function createTrackCanvasTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = CONFIG.course.trackTextureSize;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    // Base glossy orange with brighter raised outer edges
    const grad = ctx.createLinearGradient(0, 0, size, 0);
    grad.addColorStop(0.0, CONFIG.colors.trackEdge);
    grad.addColorStop(0.085, CONFIG.colors.trackEdge);
    grad.addColorStop(0.135, CONFIG.colors.track);
    grad.addColorStop(0.865, CONFIG.colors.track);
    grad.addColorStop(0.915, CONFIG.colors.trackEdge);
    grad.addColorStop(1.0, CONFIG.colors.trackEdge);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Subtle longitudinal molded toy-track grooves
    const groovePositions = [0.22, 0.35, 0.65, 0.78];
    ctx.strokeStyle = CONFIG.colors.trackGroove;
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.22;
    for (const normX of groovePositions) {
      const x = normX * size;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size);
      ctx.stroke();
    }

    // Thin dashed center line (runs along V = track length)
    ctx.fillStyle = CONFIG.colors.trackCenterDash;
    ctx.globalAlpha = 0.85;
    const dashWidth = Math.max(6, size * 0.016);
    const dashX = (size - dashWidth) * 0.5;
    const dashCount = 4;
    const cellHeight = size / dashCount;
    const dashLength = cellHeight * 0.52;
    for (let i = 0; i < dashCount; i++) {
      const y = i * cellHeight + (cellHeight - dashLength) * 0.5;
      ctx.fillRect(dashX, y, dashWidth, dashLength);
    }

    // Subtle transverse plastic mold seams
    ctx.strokeStyle = CONFIG.colors.trackEdge;
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

function createRailCanvasTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = CONFIG.course.railTextureSize;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, size, 0);
    grad.addColorStop(0.0, CONFIG.colors.rail);
    grad.addColorStop(0.35, CONFIG.colors.railHighlight);
    grad.addColorStop(0.65, CONFIG.colors.railHighlight);
    grad.addColorStop(1.0, CONFIG.colors.rail);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Subtle molded rib bands along rail length
    ctx.strokeStyle = CONFIG.colors.railHighlight;
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

function createJumpStripCanvasTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = CONFIG.course.jumpStripTextureSize;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.fillStyle = CONFIG.colors.accent;
    ctx.fillRect(0, 0, size, size);

    // Bold diagonal hazard/chevron stripes in #FFD23F + dark contrast
    ctx.save();
    ctx.fillStyle = CONFIG.colors.jumpStripeDark;
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

    // Crisp yellow border bands along front and back edge of the strip
    ctx.fillStyle = CONFIG.colors.accent;
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

function createBoostPadCanvasTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = CONFIG.boost.textureSize;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    // Deep translucent cyan base so bright chevrons pop clearly
    ctx.fillStyle = '#093B5C';
    ctx.fillRect(0, 0, size, size);

    // Glowing side rails along boost strip edges
    const borderW = size * 0.08;
    ctx.fillStyle = CONFIG.colors.boost;
    ctx.fillRect(0, 0, borderW, size);
    ctx.fillRect(size - borderW, 0, borderW, size);

    // Forward-pointing glowing chevrons (UV v scrolls forward)
    const chevronCount = 3;
    const cellH = size / chevronCount;
    const midX = size * 0.5;
    const padX = size * 0.14;

    for (let i = -1; i <= chevronCount; i++) {
      const baseY = i * cellH;
      const tipY = baseY + cellH * 0.16;
      const wingY = baseY + cellH * 0.64;
      const thickness = cellH * 0.28;

      ctx.fillStyle = CONFIG.colors.boost;
      ctx.beginPath();
      ctx.moveTo(midX, tipY);
      ctx.lineTo(size - padX, wingY);
      ctx.lineTo(size - padX, wingY + thickness);
      ctx.lineTo(midX, tipY + thickness);
      ctx.lineTo(padX, wingY + thickness);
      ctx.lineTo(padX, wingY);
      ctx.closePath();
      ctx.fill();

      // Bright core highlight inside each chevron
      ctx.fillStyle = CONFIG.colors.boostStripeLight;
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

function buildTrackCrossSectionProfile(): ProfilePoint[] {
  const cfg = CONFIG.course;
  const thickness = cfg.trackThickness;
  const topR = Math.min(cfg.edgeRadius, thickness * 0.48);
  const botR = Math.min(cfg.bottomRadius, thickness * 0.45);
  const topSegs = cfg.edgeArcSegments;
  const botSegs = cfg.bottomArcSegments;

  const points: ProfilePoint[] = [];

  // Left-to-right across the top drivable deck (xNorm in [-1, 1], y = 0)
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

function buildRingSequence(
  frames: readonly TrackFrame[],
  tileMeters: number,
  bevelLength: number,
  bevelSegments: number,
  profileMidY: number,
): RingSpec[] {
  const rings: RingSpec[] = [];
  const firstFrame = frames[0];
  const lastFrame = frames[frames.length - 1];

  // Rounded start bevel nose extending slightly along -tangent
  if (bevelLength > 1e-4 && bevelSegments >= 1) {
    for (let k = bevelSegments; k >= 1; k--) {
      const t = k / bevelSegments;
      const angle = t * (Math.PI * 0.46);
      const shift = -bevelLength * Math.sin(angle);
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

  // Rounded end bevel nose extending slightly along +tangent
  if (bevelLength > 1e-4 && bevelSegments >= 1) {
    for (let k = 1; k <= bevelSegments; k++) {
      const t = k / bevelSegments;
      const angle = t * (Math.PI * 0.46);
      const shift = bevelLength * Math.sin(angle);
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
  bevelLength: number,
  bevelSegments: number,
  profileMidY: number,
): SweptMeshResult {
  const rings = buildRingSequence(frames, tileMeters, bevelLength, bevelSegments, profileMidY);
  const ringCount = rings.length;
  const profCount = profile.length;
  const ringStride = profCount + 1;

  const sideVertexCount = ringCount * ringStride;
  const capVertexCount = profCount * 2;
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

  // Cap the outermost bevel rings cleanly
  const startCapOffset = sideVertexCount;
  const endCapOffset = sideVertexCount + profCount;
  const startRing = rings[0];
  const endRing = rings[ringCount - 1];

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
    indices.push(startCapOffset, startCapOffset + p + 1, startCapOffset + p);
    indices.push(endCapOffset, endCapOffset + p, endCapOffset + p + 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  return { geometry };
}

function buildJumpEdgeStrips(
  course: Course,
  stripMaterial: THREE.Material,
): THREE.Group {
  const cfg = CONFIG.course;
  const stripsGroup = new THREE.Group();
  stripsGroup.name = 'JumpEdgeStrips';

  const gaps = course.getGapRanges();
  if (gaps.length === 0) {
    return stripsGroup;
  }

  const totalLen = course.getLength();
  const stripLen = cfg.jumpStripLength;
  const latSubdivs = 8;
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

  const createStripForRange = (startS: number, endS: number): THREE.Mesh | null => {
    const clampedStart = Math.max(0, startS);
    const clampedEnd = Math.min(totalLen, endS);
    const spanLen = clampedEnd - clampedStart;
    if (spanLen < 0.2) {
      return null;
    }

    const lengthSteps = Math.max(4, Math.ceil(spanLen / cfg.stepLength));
    const cols = latSubdivs + 1;
    const rows = lengthSteps + 1;
    const positions = new Float32Array(rows * cols * 3);
    const uvs = new Float32Array(rows * cols * 2);
    const indices: number[] = [];

    for (let r = 0; r < rows; r++) {
      const vFrac = r / lengthSteps;
      const s = THREE.MathUtils.lerp(clampedStart, clampedEnd, vFrac);
      course.getFrameAt(s, frame);
      const halfStripW = Math.max(0.5, frame.width * 0.5 - cfg.jumpStripInset);

      for (let c = 0; c < cols; c++) {
        const uFrac = c / latSubdivs;
        const lat = THREE.MathUtils.lerp(-halfStripW, halfStripW, uFrac);
        vPos
          .copy(frame.position)
          .addScaledVector(frame.right, lat)
          .addScaledVector(frame.up, cfg.jumpStripLift);

        const idx = r * cols + c;
        positions[idx * 3] = vPos.x;
        positions[idx * 3 + 1] = vPos.y;
        positions[idx * 3 + 2] = vPos.z;
        uvs[idx * 2] = uFrac * 2;
        uvs[idx * 2 + 1] = vFrac;
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

    const mesh = new THREE.Mesh(geometry, stripMaterial);
    mesh.receiveShadow = true;
    return mesh;
  };

  for (const gap of gaps) {
    const takeoffStrip = createStripForRange(gap.startS - stripLen, gap.startS);
    if (takeoffStrip) {
      stripsGroup.add(takeoffStrip);
    }
    const landingStrip = createStripForRange(gap.endS, gap.endS + stripLen);
    if (landingStrip) {
      stripsGroup.add(landingStrip);
    }
  }

  return stripsGroup;
}

function buildBoostPadStrips(
  course: Course,
  boostMaterial: THREE.Material,
): THREE.Group {
  const cfg = CONFIG.course;
  const boostCfg = CONFIG.boost;
  const boostGroup = new THREE.Group();
  boostGroup.name = 'BoostPadsGroup';

  const pads = course.getBoostPads();
  if (pads.length === 0) {
    return boostGroup;
  }

  const totalLen = course.getLength();
  const latSubdivs = 6;
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

  for (const pad of pads) {
    const startS = Math.max(0, pad.s - pad.length * 0.5);
    const endS = Math.min(totalLen, pad.s + pad.length * 0.5);
    const spanLen = endS - startS;
    if (spanLen < 0.5) {
      continue;
    }

    const lengthSteps = Math.max(6, Math.ceil(spanLen / cfg.stepLength));
    const cols = latSubdivs + 1;
    const rows = lengthSteps + 1;
    const positions = new Float32Array(rows * cols * 3);
    const uvs = new Float32Array(rows * cols * 2);
    const indices: number[] = [];
    const halfPadW = pad.width * 0.5;

    for (let r = 0; r < rows; r++) {
      const vFrac = r / lengthSteps;
      const s = THREE.MathUtils.lerp(startS, endS, vFrac);
      course.getFrameAt(s, frame);

      for (let c = 0; c < cols; c++) {
        const uFrac = c / latSubdivs;
        const lat = pad.lateral + THREE.MathUtils.lerp(-halfPadW, halfPadW, uFrac);
        vPos
          .copy(frame.position)
          .addScaledVector(frame.right, lat)
          .addScaledVector(frame.up, boostCfg.lift);

        const idx = r * cols + c;
        positions[idx * 3] = vPos.x;
        positions[idx * 3 + 1] = vPos.y;
        positions[idx * 3 + 2] = vPos.z;
        uvs[idx * 2] = uFrac;
        uvs[idx * 2 + 1] = (1 - vFrac) * 2;
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

    const mesh = new THREE.Mesh(geometry, boostMaterial);
    mesh.receiveShadow = true;
    boostGroup.add(mesh);
  }

  return boostGroup;
}

function buildRailPosts(
  course: Course,
  railMaterial: THREE.Material,
  spans: readonly TrackFrame[][],
): THREE.Group {
  const cfg = CONFIG.course;
  const postsGroup = new THREE.Group();
  postsGroup.name = 'RailPostsGroup';

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

  // 1. Intermediate posts along each solid track span
  const postLocations: number[] = [];
  for (const span of spans) {
    const spanStart = span[0].s;
    const spanEnd = span[span.length - 1].s;
    const margin = 1.25;
    const usableLen = spanEnd - spanStart - margin * 2;
    if (usableLen <= 0.5) {
      continue;
    }
    const count = Math.max(1, Math.floor(usableLen / cfg.railPostSpacingMeters) + 1);
    for (let i = 0; i < count; i++) {
      const frac = count === 1 ? 0.5 : i / (count - 1);
      postLocations.push(spanStart + margin + frac * usableLen);
    }
  }

  if (postLocations.length > 0) {
    const postGeometry = new THREE.CylinderGeometry(
      cfg.railPostRadius,
      cfg.railPostRadius,
      cfg.railPostHeight,
      10,
    );
    const instanced = new THREE.InstancedMesh(
      postGeometry,
      railMaterial,
      postLocations.length * 2,
    );
    instanced.castShadow = true;
    instanced.receiveShadow = true;

    let instanceIdx = 0;
    for (const s of postLocations) {
      course.getFrameAt(s, frame);
      const railEdgeOffset =
        frame.width * 0.5 + CONFIG.physics.railInnerOffset + cfg.railWidth * 0.5;
      negForward.copy(frame.tangent).negate();
      basisMatrix.makeBasis(frame.right, frame.up, negForward);

      for (const side of [-1, 1]) {
        pos
          .copy(frame.position)
          .addScaledVector(frame.right, side * railEdgeOffset)
          .addScaledVector(frame.up, cfg.railVerticalOffset * 0.35);
        basisMatrix.setPosition(pos);
        instanced.setMatrixAt(instanceIdx++, basisMatrix);
      }
    }

    instanced.instanceMatrix.needsUpdate = true;
    instanced.computeBoundingSphere();
    postsGroup.add(instanced);
  }

  // 2. Short rounded end posts capping the rails at each span start/end (including gap edges)
  const endLocations: number[] = [];
  for (const span of spans) {
    endLocations.push(span[0].s, span[span.length - 1].s);
  }

  if (endLocations.length > 0) {
    const endBodyGeom = new THREE.CylinderGeometry(
      cfg.railEndPostRadius,
      cfg.railEndPostRadius,
      cfg.railEndPostHeight,
      14,
    );
    const endDomeGeom = new THREE.SphereGeometry(cfg.railEndPostRadius, 14, 10);

    const totalEndPosts = endLocations.length * 2;
    const endBodies = new THREE.InstancedMesh(endBodyGeom, railMaterial, totalEndPosts);
    const endDomes = new THREE.InstancedMesh(endDomeGeom, railMaterial, totalEndPosts);
    endBodies.castShadow = true;
    endBodies.receiveShadow = true;
    endDomes.castShadow = true;
    endDomes.receiveShadow = true;

    let endIdx = 0;
    const postCenterHeight = cfg.railVerticalOffset * 0.5 + cfg.railEndPostHeight * 0.35;
    const domeHeight = postCenterHeight + cfg.railEndPostHeight * 0.5;

    for (const s of endLocations) {
      course.getFrameAt(s, frame);
      const railCenterOffset =
        frame.width * 0.5 + CONFIG.physics.railInnerOffset + cfg.railWidth * 0.5;
      negForward.copy(frame.tangent).negate();
      basisMatrix.makeBasis(frame.right, frame.up, negForward);

      for (const side of [-1, 1]) {
        pos
          .copy(frame.position)
          .addScaledVector(frame.right, side * railCenterOffset)
          .addScaledVector(frame.up, postCenterHeight);
        basisMatrix.setPosition(pos);
        endBodies.setMatrixAt(endIdx, basisMatrix);

        pos
          .copy(frame.position)
          .addScaledVector(frame.right, side * railCenterOffset)
          .addScaledVector(frame.up, domeHeight);
        basisMatrix.setPosition(pos);
        endDomes.setMatrixAt(endIdx, basisMatrix);

        endIdx++;
      }
    }

    endBodies.instanceMatrix.needsUpdate = true;
    endBodies.computeBoundingSphere();
    endDomes.instanceMatrix.needsUpdate = true;
    endDomes.computeBoundingSphere();
    postsGroup.add(endBodies);
    postsGroup.add(endDomes);
  }

  return postsGroup;
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

export function buildTrackMesh(course: Course, maxAnisotropy = 8): TrackVisual {
  const cfg = CONFIG.course;
  const spans = splitSolidSpans(course.getSamples());
  const group = new THREE.Group();
  group.name = 'TrackGroup';

  const trackProfile = buildTrackCrossSectionProfile();
  const trackTexture = createTrackCanvasTexture(maxAnisotropy);
  const trackMaterial = new THREE.MeshPhysicalMaterial({
    map: trackTexture,
    clearcoat: cfg.trackClearcoat,
    clearcoatRoughness: CONFIG.visual.trackClearcoatRoughness,
    envMapIntensity: CONFIG.visual.trackEnvIntensity,
    roughness: cfg.trackRoughness,
    metalness: cfg.trackMetalness,
    ior: cfg.trackIor,
  });

  const railProfile = buildRoundedRailProfile(
    cfg.railWidth,
    cfg.railHeight,
    cfg.railArcSegments,
  );
  const railTexture = createRailCanvasTexture(maxAnisotropy);
  const railMaterial = new THREE.MeshPhysicalMaterial({
    map: railTexture,
    clearcoat: cfg.railClearcoat,
    clearcoatRoughness: CONFIG.visual.trackClearcoatRoughness,
    envMapIntensity: CONFIG.visual.trackEnvIntensity,
    roughness: cfg.railRoughness,
    metalness: cfg.railMetalness,
    ior: cfg.trackIor,
  });

  // 1 & 2. Solid track deck spans and left/right guardrails (skipped inside gaps)
  for (const spanFrames of spans) {
    const { geometry: trackGeometry } = buildSweptGeometry(
      spanFrames,
      trackProfile,
      cfg.trackTileMeters,
      (frame, pt, scale) => {
        const halfLat = frame.width * 0.5;
        const innerTuck = (1 - scale) * 0.06;
        return pt.xNorm * (halfLat - innerTuck) + pt.xOffset * scale;
      },
      0,
      cfg.endCapBevelLength,
      cfg.endCapBevelSegments,
      -cfg.trackThickness * 0.5,
    );

    const trackMesh = new THREE.Mesh(trackGeometry, trackMaterial);
    trackMesh.castShadow = true;
    trackMesh.receiveShadow = true;
    group.add(trackMesh);

    for (const side of [-1, 1]) {
      const { geometry: railGeometry } = buildSweptGeometry(
        spanFrames,
        railProfile,
        cfg.railTileMeters,
        (frame, pt, scale) =>
          side * (frame.width * 0.5 + CONFIG.physics.railInnerOffset + cfg.railWidth * 0.5) +
          pt.xOffset * scale,
        cfg.railVerticalOffset,
        cfg.endCapBevelLength * 0.75,
        cfg.endCapBevelSegments,
        0,
      );

      const railMesh = new THREE.Mesh(railGeometry, railMaterial);
      railMesh.castShadow = true;
      railMesh.receiveShadow = true;
      group.add(railMesh);
    }
  }

  // 3. Yellow diagonal accent strips (#FFD23F) at takeoff & landing edges
  const jumpStripTexture = createJumpStripCanvasTexture(maxAnisotropy);
  const jumpStripMaterial = new THREE.MeshPhysicalMaterial({
    map: jumpStripTexture,
    clearcoat: cfg.trackClearcoat,
    clearcoatRoughness: CONFIG.visual.trackClearcoatRoughness,
    envMapIntensity: CONFIG.visual.trackEnvIntensity,
    roughness: 0.2,
    metalness: 0.04,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  group.add(buildJumpEdgeStrips(course, jumpStripMaterial));

  // 4. Boost pads (#35D4FF emissive with scrolling UV chevron pattern)
  const boostTexture = createBoostPadCanvasTexture(maxAnisotropy);
  const boostColor = new THREE.Color(CONFIG.colors.boost);
  const boostMaterial = new THREE.MeshPhysicalMaterial({
    map: boostTexture,
    emissive: boostColor,
    emissiveMap: boostTexture,
    emissiveIntensity: CONFIG.boost.emissiveIntensity,
    clearcoat: 0.9,
    clearcoatRoughness: 0.1,
    roughness: 0.2,
    metalness: 0.06,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  group.add(buildBoostPadStrips(course, boostMaterial));

  // 5. Support posts + short rounded end posts at gaps & ends
  group.add(buildRailPosts(course, railMaterial, spans));

  // 6. Optional debug centerline & frame arrows (still shows imaginary gap centerline)
  if (CONFIG.debug.showCourseFrames) {
    group.add(buildDebugCourseFrames(course));
  }

  function update(dt: number): void {
    boostTexture.offset.y = (boostTexture.offset.y - dt * CONFIG.boost.uvScrollSpeed) % 1;
  }

  return {
    group,
    update,
  };
}
