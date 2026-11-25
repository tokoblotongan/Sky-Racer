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

function buildTrackCrossSectionProfile(): ProfilePoint[] {
  const cfg = CONFIG.course;
  const thickness = cfg.trackThickness;
  const topR = Math.min(cfg.edgeRadius, thickness * 0.48);
  const botR = Math.min(cfg.bottomRadius, thickness * 0.45);
  const topSegs = cfg.edgeArcSegments;
  const botSegs = cfg.bottomArcSegments;

  const points: ProfilePoint[] = [];

  // Left-to-right across the top drivable deck (xNorm in [-1, 1], y = 0)
  // Top-left shoulder arc: from outer left side (y = -topR) up to top deck (y = 0)
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

  // Intermediate top deck subdivisions for smooth lighting interpolation across width
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

  // Top-right shoulder arc: from top deck (y = 0) down to outer right side (y = -topR)
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

  // Bottom-right rounded corner
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

  // Underside right-to-left (mapped to pure orange core u = 0.2 so center dashes don't bleed under)
  points.push({ xNorm: 0.65, xOffset: 0, yOffset: -thickness, u: 0.2 });
  points.push({ xNorm: -0.65, xOffset: 0, yOffset: -thickness, u: 0.2 });

  // Bottom-left rounded corner
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

  // Clockwise in (right, up) plane to match track profile outward winding
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

function buildSweptGeometry(
  frames: readonly TrackFrame[],
  profile: readonly ProfilePoint[],
  tileMeters: number,
  computeLateralOffset: (frame: TrackFrame, pt: ProfilePoint) => number,
  verticalBias: number,
): SweptMeshResult {
  const frameCount = frames.length;
  const profCount = profile.length;
  const ringStride = profCount + 1; // +1 duplicate seam vertex for UV continuity

  // Side surface vertices + 2 endcap rings (start and end)
  const sideVertexCount = frameCount * ringStride;
  const capVertexCount = profCount * 2;
  const totalVertices = sideVertexCount + capVertexCount;

  const positions = new Float32Array(totalVertices * 3);
  const uvs = new Float32Array(totalVertices * 2);
  const indices: number[] = [];

  const vPos = new THREE.Vector3();

  for (let f = 0; f < frameCount; f++) {
    const frame = frames[f];
    const vCoord = frame.s / tileMeters;

    for (let p = 0; p < ringStride; p++) {
      const pt = profile[p % profCount];
      const lat = computeLateralOffset(frame, pt);
      const vert = pt.yOffset + verticalBias;

      vPos
        .copy(frame.position)
        .addScaledVector(frame.right, lat)
        .addScaledVector(frame.up, vert);

      const idx = f * ringStride + p;
      positions[idx * 3] = vPos.x;
      positions[idx * 3 + 1] = vPos.y;
      positions[idx * 3 + 2] = vPos.z;

      uvs[idx * 2] = p === profCount ? profile[0].u : pt.u;
      uvs[idx * 2 + 1] = vCoord;
    }
  }

  // Side quads (outward normals for CW profile in (right, up))
  for (let f = 0; f < frameCount - 1; f++) {
    const rowA = f * ringStride;
    const rowB = (f + 1) * ringStride;
    for (let p = 0; p < profCount; p++) {
      const a = rowA + p;
      const b = rowA + p + 1;
      const c = rowB + p;
      const d = rowB + p + 1;

      indices.push(a, b, c);
      indices.push(b, d, c);
    }
  }

  // Start and end caps so open ends are solid
  const startCapOffset = sideVertexCount;
  const endCapOffset = sideVertexCount + profCount;
  const firstFrame = frames[0];
  const lastFrame = frames[frameCount - 1];

  for (let p = 0; p < profCount; p++) {
    const pt = profile[p];

    vPos
      .copy(firstFrame.position)
      .addScaledVector(firstFrame.right, computeLateralOffset(firstFrame, pt))
      .addScaledVector(firstFrame.up, pt.yOffset + verticalBias);
    positions[(startCapOffset + p) * 3] = vPos.x;
    positions[(startCapOffset + p) * 3 + 1] = vPos.y;
    positions[(startCapOffset + p) * 3 + 2] = vPos.z;
    uvs[(startCapOffset + p) * 2] = pt.u;
    uvs[(startCapOffset + p) * 2 + 1] = 0;

    vPos
      .copy(lastFrame.position)
      .addScaledVector(lastFrame.right, computeLateralOffset(lastFrame, pt))
      .addScaledVector(lastFrame.up, pt.yOffset + verticalBias);
    positions[(endCapOffset + p) * 3] = vPos.x;
    positions[(endCapOffset + p) * 3 + 1] = vPos.y;
    positions[(endCapOffset + p) * 3 + 2] = vPos.z;
    uvs[(endCapOffset + p) * 2] = pt.u;
    uvs[(endCapOffset + p) * 2 + 1] = 0;
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

function buildRailPosts(course: Course, railMaterial: THREE.Material): THREE.InstancedMesh {
  const cfg = CONFIG.course;
  const totalLen = course.getLength();
  const postCountPerSide = Math.max(2, Math.floor(totalLen / cfg.railPostSpacingMeters) + 1);
  const totalInstances = postCountPerSide * 2;

  const postGeometry = new THREE.CylinderGeometry(
    cfg.railPostRadius,
    cfg.railPostRadius,
    cfg.railPostHeight,
    10,
  );
  const instanced = new THREE.InstancedMesh(postGeometry, railMaterial, totalInstances);
  instanced.castShadow = true;
  instanced.receiveShadow = true;

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

  let instanceIdx = 0;
  const startMargin = 1.0;
  const usableLen = Math.max(1, totalLen - startMargin * 2);

  for (let i = 0; i < postCountPerSide; i++) {
    const s = startMargin + (i / (postCountPerSide - 1)) * usableLen;
    course.getFrameAt(s, frame);

    const railEdgeOffset = frame.width * 0.5 + cfg.railOffsetFromEdge * 0.65;
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
  return instanced;
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

export function buildTrackMesh(course: Course, maxAnisotropy = 8): THREE.Group {
  const cfg = CONFIG.course;
  const frames = course.getSamples();
  const group = new THREE.Group();
  group.name = 'TrackGroup';

  // 1. Track deck mesh (#FF6A00, rounded top shoulders, glossy clearcoat)
  const trackProfile = buildTrackCrossSectionProfile();
  const { geometry: trackGeometry } = buildSweptGeometry(
    frames,
    trackProfile,
    cfg.trackTileMeters,
    (frame, pt) => pt.xNorm * (frame.width * 0.5) + pt.xOffset,
    0,
  );

  const trackTexture = createTrackCanvasTexture(maxAnisotropy);
  const trackMaterial = new THREE.MeshPhysicalMaterial({
    map: trackTexture,
    clearcoat: cfg.trackClearcoat,
    clearcoatRoughness: cfg.trackClearcoatRoughness,
    roughness: cfg.trackRoughness,
    metalness: cfg.trackMetalness,
    ior: cfg.trackIor,
  });

  const trackMesh = new THREE.Mesh(trackGeometry, trackMaterial);
  trackMesh.castShadow = true;
  trackMesh.receiveShadow = true;
  group.add(trackMesh);

  // 2. Left & right blue guardrails (#1E6BFF) following the spline
  const railProfile = buildRoundedRailProfile(
    cfg.railWidth,
    cfg.railHeight,
    cfg.railArcSegments,
  );
  const railTexture = createRailCanvasTexture(maxAnisotropy);
  const railMaterial = new THREE.MeshPhysicalMaterial({
    map: railTexture,
    clearcoat: cfg.railClearcoat,
    clearcoatRoughness: cfg.railClearcoatRoughness,
    roughness: cfg.railRoughness,
    metalness: cfg.railMetalness,
    ior: cfg.trackIor,
  });

  for (const side of [-1, 1]) {
    const { geometry: railGeometry } = buildSweptGeometry(
      frames,
      railProfile,
      cfg.railTileMeters,
      (frame, pt) =>
        side * (frame.width * 0.5 + cfg.railOffsetFromEdge + cfg.railWidth * 0.5) +
        pt.xOffset,
      cfg.railVerticalOffset,
    );

    const railMesh = new THREE.Mesh(railGeometry, railMaterial);
    railMesh.castShadow = true;
    railMesh.receiveShadow = true;
    group.add(railMesh);
  }

  // 3. Support posts connecting rails to the track deck
  group.add(buildRailPosts(course, railMaterial));

  // 4. Optional debug spline centerline and parallel-transport frame arrows
  if (CONFIG.debug.showCourseFrames) {
    group.add(buildDebugCourseFrames(course));
  }

  return group;
}
