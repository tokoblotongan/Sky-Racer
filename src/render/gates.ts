// src/render/gates.ts

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CONFIG } from '../config';
import type { Course, TrackFrame } from '../core/course';

export interface GatesVisual {
  group: THREE.Group;
  setActive: (index: number) => void;
  setPassed: (index: number) => void;
  reset: () => void;
}

type GateStatus = 'active' | 'upcoming' | 'passed';

interface CheckpointGateEntry {
  material: THREE.MeshPhysicalMaterial;
  beaconMaterial: THREE.MeshStandardMaterial;
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

export function buildGates(course: Course, maxAnisotropy = 8): GatesVisual {
  const cfg = CONFIG.course;
  const gateCfg = CONFIG.checkpointGate;
  const group = new THREE.Group();
  group.name = 'GatesGroup';

  const entries: CheckpointGateEntry[] = [];
  const checkpoints = course.getCheckpoints();

  for (const cp of checkpoints) {
    const gateGroup = new THREE.Group();
    gateGroup.name = `CheckpointGate_${cp.index}`;
    orientGateToFrame(gateGroup, cp.frame);

    const spanWidth =
      cp.frame.width + (cfg.railOffsetFromEdge + cfg.railWidth + gateCfg.widthMargin) * 2;
    const tubeRadius = gateCfg.thickness * 0.5;
    const archCurve = createGateArcCurve(spanWidth, gateCfg.height);
    const archGeometry = new THREE.TubeGeometry(
      archCurve,
      gateCfg.arcSegments * 3,
      tubeRadius,
      12,
      false,
    );

    const material = new THREE.MeshPhysicalMaterial({
      color: CONFIG.colors.accent,
      emissive: CONFIG.colors.accent,
      emissiveIntensity: 0.22,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      roughness: 0.22,
      metalness: 0.06,
    });

    const archMesh = new THREE.Mesh(archGeometry, material);
    archMesh.castShadow = true;
    archMesh.receiveShadow = true;
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
      plinth.castShadow = true;
      gateGroup.add(plinth);
    }

    // Small rounded top chevron beacon so active gate stands out clearly from afar
    const beaconMaterial = new THREE.MeshStandardMaterial({
      color: CONFIG.colors.accent,
      emissive: CONFIG.colors.accent,
      emissiveIntensity: 0.3,
      roughness: 0.25,
    });
    const beaconGeom = new RoundedBoxGeometry(1.5, 0.38, gateCfg.thickness * 1.15, 3, 0.12);
    const beacon = new THREE.Mesh(beaconGeom, beaconMaterial);
    beacon.position.set(0, gateCfg.height, 0);
    gateGroup.add(beacon);

    const entry: CheckpointGateEntry = {
      material,
      beaconMaterial,
      status: 'upcoming',
    };
    entries.push(entry);
    group.add(gateGroup);
  }

  // Finish Gate with procedural checkered banner
  const finishFrame = course.getFrameAt(course.getFinishS());
  const finishGroup = new THREE.Group();
  finishGroup.name = 'FinishGate';
  orientGateToFrame(finishGroup, finishFrame);

  const finishSpanW =
    finishFrame.width + (cfg.railOffsetFromEdge + cfg.railWidth + gateCfg.widthMargin) * 2;
  const finishTubeR = gateCfg.thickness * 0.54;
  const finishArchCurve = createGateArcCurve(finishSpanW, gateCfg.height + 0.35);
  const finishArchGeom = new THREE.TubeGeometry(
    finishArchCurve,
    gateCfg.arcSegments * 3,
    finishTubeR,
    12,
    false,
  );
  const finishTrimMat = new THREE.MeshPhysicalMaterial({
    color: CONFIG.colors.accent,
    emissive: CONFIG.colors.accent,
    emissiveIntensity: 0.45,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
    roughness: 0.2,
    metalness: 0.08,
  });
  const finishArch = new THREE.Mesh(finishArchGeom, finishTrimMat);
  finishArch.castShadow = true;
  finishGroup.add(finishArch);

  const checkerTexture = createFinishCheckerTexture(maxAnisotropy);
  const bannerMaterial = new THREE.MeshPhysicalMaterial({
    map: checkerTexture,
    emissive: 0xffffff,
    emissiveMap: checkerTexture,
    emissiveIntensity: 0.28,
    clearcoat: 0.9,
    clearcoatRoughness: 0.1,
    roughness: 0.22,
  });
  const bannerWidth = finishFrame.width + 0.9;
  const bannerGeom = new RoundedBoxGeometry(
    bannerWidth,
    gateCfg.bannerHeight,
    gateCfg.thickness * 0.92,
    3,
    0.1,
  );
  const bannerMesh = new THREE.Mesh(bannerGeom, bannerMaterial);
  bannerMesh.position.set(0, gateCfg.height - 0.18, 0);
  bannerMesh.castShadow = true;
  finishGroup.add(bannerMesh);

  // Checkered finish line strip directly across the deck at finishS
  const stripGeom = new THREE.PlaneGeometry(finishFrame.width - 0.4, 1.35);
  const stripMesh = new THREE.Mesh(stripGeom, bannerMaterial);
  stripMesh.rotation.x = -Math.PI / 2;
  stripMesh.position.set(0, 0.015, 0);
  stripMesh.receiveShadow = true;
  finishGroup.add(stripMesh);

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

  function reset(): void {
    for (let i = 0; i < entries.length; i++) {
      applyCheckpointStatus(entries[i], i === 0 ? 'active' : 'upcoming');
    }
  }

  reset();

  return {
    group,
    setActive,
    setPassed,
    reset,
  };
}
