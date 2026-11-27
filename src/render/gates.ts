// src/render/gates.ts

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CONFIG, type GraphicsPreset } from '../config';
import type { Course, TrackFrame } from '../core/course';
import { createSurfaceMaterial, type SurfaceMaterial } from './materialFactory';

export interface GatesVisual {
  group: THREE.Group;
  setActive: (index: number) => void;
  setPassed: (index: number) => void;
  triggerFinishFlash: () => void;
  update: (dt: number) => void;
  reset: () => void;
  dispose: () => void;
}

type GateStatus = 'active' | 'upcoming' | 'passed';

interface CheckpointGateEntry {
  material: SurfaceMaterial;
  beaconMaterial: SurfaceMaterial;
  status: GateStatus;
}

function createGateArcCurve(spanWidth: number, height: number): THREE.CatmullRomCurve3 {
  const halfW = spanWidth * 0.5;
  const shoulderY = height * 0.72;
  const crownY = height;
  const pts = [
    new THREE.Vector3(-halfW, 0, 0),
    new THREE.Vector3(-halfW, shoulderY * 0.75, 0),
    new THREE.Vector3(-halfW * 0.86, crownY * 0.94, 0),
    new THREE.Vector3(0, crownY, 0),
    new THREE.Vector3(halfW * 0.86, crownY * 0.94, 0),
    new THREE.Vector3(halfW, shoulderY * 0.75, 0),
    new THREE.Vector3(halfW, 0, 0),
  ];
  return new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
}

function createFinishCheckerTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = CONFIG.checkpointGate.textureSize;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const cols = 8;
    const rows = 4;
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
  texture.anisotropy = maxAnisotropy;
  return texture;
}

function orientGateToFrame(gateGroup: THREE.Group, frame: TrackFrame): void {
  const negForward = frame.tangent.clone().negate();
  const basis = new THREE.Matrix4().makeBasis(frame.right, frame.up, negForward);
  gateGroup.position.copy(frame.position);
  gateGroup.quaternion.setFromRotationMatrix(basis);
}

function applyCheckpointStatus(entry: CheckpointGateEntry, status: GateStatus): void {
  entry.status = status;
  if (status === 'active') {
    entry.material.color.set(CONFIG.colors.accent);
    entry.material.emissive.set(CONFIG.colors.accent);
    entry.material.emissiveIntensity = 1.35;
    entry.beaconMaterial.color.set(CONFIG.colors.boost);
    entry.beaconMaterial.emissive.set(CONFIG.colors.boost);
    entry.beaconMaterial.emissiveIntensity = 1.8;
  } else if (status === 'upcoming') {
    entry.material.color.set('#E2B62B');
    entry.material.emissive.set(CONFIG.colors.accent);
    entry.material.emissiveIntensity = 0.22;
    entry.beaconMaterial.color.set(CONFIG.colors.accent);
    entry.beaconMaterial.emissive.set(CONFIG.colors.accent);
    entry.beaconMaterial.emissiveIntensity = 0.25;
  } else {
    entry.material.color.set('#8D7428');
    entry.material.emissive.set('#665018');
    entry.material.emissiveIntensity = 0.04;
    entry.beaconMaterial.color.set('#64748B');
    entry.beaconMaterial.emissive.set('#334155');
    entry.beaconMaterial.emissiveIntensity = 0.05;
  }
}

export function buildGates(
  course: Course,
  maxAnisotropy = 8,
  graphicsPreset: GraphicsPreset = 'penuh',
): GatesVisual {
  const cfg = CONFIG.course;
  const gateCfg = CONFIG.checkpointGate;
  const castShadows = graphicsPreset === 'penuh';
  const receiveShadows = graphicsPreset !== 'hemat';
  const group = new THREE.Group();
  group.name = 'GatesGroup';

  const entries: CheckpointGateEntry[] = [];
  const checkpoints = course.getCheckpoints();

  for (const cp of checkpoints) {
    const gateGroup = new THREE.Group();
    gateGroup.name = `CheckpointGate_${cp.index}`;
    orientGateToFrame(gateGroup, cp.frame);

    const widthRatio = cp.frame.width / CONFIG.course.defaultWidth;
    const gateHeight = gateCfg.height * THREE.MathUtils.lerp(1, widthRatio, 0.35);
    const spanWidth =
      cp.frame.width + (cfg.railOffsetFromEdge + cfg.railWidth + gateCfg.widthMargin) * 2;
    const tubeRadius = gateCfg.thickness * 0.5 * THREE.MathUtils.lerp(1, widthRatio, 0.25);
    const archCurve = createGateArcCurve(spanWidth, gateHeight);
    const archGeometry = new THREE.TubeGeometry(
      archCurve,
      gateCfg.arcSegments * 3,
      tubeRadius,
      12,
      false,
    );

    const material = createSurfaceMaterial(graphicsPreset, {
      color: CONFIG.colors.accent,
      emissive: CONFIG.colors.accent,
      emissiveIntensity: 0.22,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      roughness: 0.22,
      metalness: 0.06,
      physical: true,
      specularHighlight: true,
    });

    const archMesh = new THREE.Mesh(archGeometry, material);
    archMesh.castShadow = castShadows;
    archMesh.receiveShadow = receiveShadows;
    gateGroup.add(archMesh);

    // Rounded base plinths anchoring the arch sides outside the guardrails
    const plinthGeom = new THREE.CylinderGeometry(
      tubeRadius * 1.45,
      tubeRadius * 1.65,
      0.55,
      14,
    );
    for (const side of [-1, 1]) {
      const plinth = new THREE.Mesh(plinthGeom, material);
      plinth.position.set(side * spanWidth * 0.5, 0.1, 0);
      plinth.castShadow = castShadows;
      gateGroup.add(plinth);
    }

    // Small rounded top chevron beacon so active gate stands out clearly from afar
    const beaconMaterial = createSurfaceMaterial(graphicsPreset, {
      color: CONFIG.colors.accent,
      emissive: CONFIG.colors.accent,
      emissiveIntensity: 0.3,
      roughness: 0.25,
    });
    const beaconGeom = new RoundedBoxGeometry(
      1.5 * THREE.MathUtils.lerp(1, widthRatio, 0.3),
      0.38,
      tubeRadius * 2.3,
      3,
      0.12,
    );
    const beacon = new THREE.Mesh(beaconGeom, beaconMaterial);
    beacon.position.set(0, gateHeight, 0);
    gateGroup.add(beacon);

    const entry: CheckpointGateEntry = {
      material,
      beaconMaterial,
      status: 'upcoming',
    };
    entries.push(entry);
    group.add(gateGroup);
  }

  // Finish Gate (or grand Start/Finish gantry on closed courses) with procedural checkered banner
  const isClosed = course.isClosed();
  const finishFrame = course.getFrameAt(course.getFinishS());
  const finishGroup = new THREE.Group();
  finishGroup.name = 'FinishGate';
  orientGateToFrame(finishGroup, finishFrame);

  const finishWidthRatio = finishFrame.width / CONFIG.course.defaultWidth;
  const finishHeight =
    (gateCfg.height + (isClosed ? 0.75 : 0.35)) *
    THREE.MathUtils.lerp(1, finishWidthRatio, 0.35);
  const finishSpanW =
    finishFrame.width + (cfg.railOffsetFromEdge + cfg.railWidth + gateCfg.widthMargin) * 2;
  const finishTubeR =
    gateCfg.thickness * (isClosed ? 0.62 : 0.54) * THREE.MathUtils.lerp(1, finishWidthRatio, 0.25);
  const finishArchCurve = createGateArcCurve(finishSpanW, finishHeight);
  const finishArchGeom = new THREE.TubeGeometry(
    finishArchCurve,
    gateCfg.arcSegments * 3,
    finishTubeR,
    12,
    false,
  );
  const finishTrimMat = createSurfaceMaterial(graphicsPreset, {
    color: CONFIG.colors.accent,
    emissive: CONFIG.colors.accent,
    emissiveIntensity: 0.45,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
    roughness: 0.2,
    metalness: 0.08,
    physical: true,
  });
  const finishArch = new THREE.Mesh(finishArchGeom, finishTrimMat);
  finishArch.castShadow = castShadows;
  finishGroup.add(finishArch);

  if (isClosed) {
    const towerGeom = new RoundedBoxGeometry(
      finishTubeR * 2.5,
      finishHeight * 0.74,
      finishTubeR * 2.8,
      3,
      0.1,
    );
    const towerCapMat = createSurfaceMaterial(graphicsPreset, {
      color: CONFIG.colors.rail,
      emissive: CONFIG.colors.rail,
      emissiveIntensity: 0.22,
      roughness: 0.25,
      metalness: 0.1,
    });
    for (const side of [-1, 1]) {
      const tower = new THREE.Mesh(towerGeom, towerCapMat);
      tower.position.set(side * finishSpanW * 0.5, finishHeight * 0.37, 0);
      tower.castShadow = castShadows;
      finishGroup.add(tower);
    }
  }

  const checkerTexture = createFinishCheckerTexture(maxAnisotropy);
  if (isClosed) {
    checkerTexture.wrapS = THREE.RepeatWrapping;
    checkerTexture.repeat.set(2, 1);
  }
  const bannerMaterial = createSurfaceMaterial(graphicsPreset, {
    map: checkerTexture,
    emissive: 0xffffff,
    emissiveMap: checkerTexture,
    emissiveIntensity: 0.28,
    clearcoat: 0.9,
    clearcoatRoughness: 0.1,
    roughness: 0.22,
    physical: true,
  });
  const bannerWidth = finishFrame.width + (isClosed ? 1.4 : 0.9);
  const bannerHeight = gateCfg.bannerHeight * (isClosed ? 1.25 : 1);
  const bannerGeom = new RoundedBoxGeometry(
    bannerWidth,
    bannerHeight,
    finishTubeR * 1.85,
    3,
    0.1,
  );
  const bannerMesh = new THREE.Mesh(bannerGeom, bannerMaterial);
  bannerMesh.position.set(0, finishHeight - (isClosed ? 0.42 : 0.53), 0);
  bannerMesh.castShadow = castShadows;
  finishGroup.add(bannerMesh);

  if (!isClosed) {
    // Checkered finish line strip directly across the deck at finishS (closed courses use StartGridStrip at s=0)
    const stripGeom = new THREE.PlaneGeometry(finishFrame.width - 0.4, 1.35);
    const stripMesh = new THREE.Mesh(stripGeom, bannerMaterial);
    stripMesh.rotation.x = -Math.PI / 2;
    stripMesh.position.set(0, 0.015, 0);
    stripMesh.receiveShadow = receiveShadows;
    finishGroup.add(stripMesh);
  }

  group.add(finishGroup);

  function setActive(index: number): void {
    for (let i = 0; i < entries.length; i++) {
      if (i === index) {
        applyCheckpointStatus(entries[i], 'active');
      } else if (i < index && entries[i].status !== 'passed') {
        applyCheckpointStatus(entries[i], 'passed');
      } else if (i > index && entries[i].status !== 'upcoming') {
        applyCheckpointStatus(entries[i], 'upcoming');
      }
    }
  }

  function setPassed(index: number): void {
    if (index >= 0 && index < entries.length) {
      applyCheckpointStatus(entries[index], 'passed');
    }
  }

  const baseFinishTrimEmissive = 0.45;
  const baseBannerEmissive = 0.28;
  let finishFlashTimer = 0;

  function triggerFinishFlash(): void {
    finishFlashTimer = CONFIG.polish.finishFlash.durationSeconds;
  }

  function update(dt: number): void {
    if (finishFlashTimer <= 0) {
      return;
    }
    finishFlashTimer = Math.max(0, finishFlashTimer - Math.max(0, dt));
    const norm =
      finishFlashTimer / Math.max(0.01, CONFIG.polish.finishFlash.durationSeconds);
    const pulse = norm * (0.55 + 0.45 * Math.abs(Math.sin(norm * Math.PI * 3.5)));
    finishTrimMat.emissiveIntensity = THREE.MathUtils.lerp(
      baseFinishTrimEmissive,
      CONFIG.polish.finishFlash.trimPeakEmissive,
      pulse,
    );
    bannerMaterial.emissiveIntensity = THREE.MathUtils.lerp(
      baseBannerEmissive,
      CONFIG.polish.finishFlash.bannerPeakEmissive,
      pulse,
    );
    if (finishFlashTimer <= 0) {
      finishTrimMat.emissiveIntensity = baseFinishTrimEmissive;
      bannerMaterial.emissiveIntensity = baseBannerEmissive;
    }
  }

  function reset(): void {
    finishFlashTimer = 0;
    finishTrimMat.emissiveIntensity = baseFinishTrimEmissive;
    bannerMaterial.emissiveIntensity = baseBannerEmissive;
    for (let i = 0; i < entries.length; i++) {
      applyCheckpointStatus(entries[i], i === 0 ? 'active' : 'upcoming');
    }
  }

  reset();

  function dispose(): void {
    const geoms = new Set<THREE.BufferGeometry>();
    const mats = new Set<THREE.Material>();
    const texs = new Set<THREE.Texture>([checkerTexture]);

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
    setActive,
    setPassed,
    triggerFinishFlash,
    update,
    reset,
    dispose,
  };
}
