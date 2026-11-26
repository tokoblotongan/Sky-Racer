// src/render/shortcutGate.ts

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CONFIG, type GraphicsPreset, type VisualPresetName } from '../config';
import type { Course, TrackFrame } from '../core/course';
import { createSurfaceMaterial, type SurfaceMaterial } from './materialFactory';

export interface ShortcutGateVisual {
  group: THREE.Group;
  update: (dt: number) => void;
  applyPalette: (name: VisualPresetName) => void;
  dispose: () => void;
}

interface AnimatedChevron {
  material: SurfaceMaterial;
  phaseIndex: number;
}

function orientGroupToFrame(target: THREE.Group, frame: TrackFrame): void {
  const negForward = frame.tangent.clone().negate();
  const basis = new THREE.Matrix4().makeBasis(frame.right, frame.up, negForward);
  target.position.copy(frame.position);
  target.quaternion.setFromRotationMatrix(basis);
}

function createShortcutSignTexture(
  label: string,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const width = 512;
  const height = 160;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const colors = CONFIG.shortcut.signColors;

  if (ctx) {
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, width, height);

    const pad = 10;
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 8;
    ctx.strokeRect(pad, pad, width - pad * 2, height - pad * 2);

    ctx.fillStyle = colors.arrowPrimary;
    ctx.fillRect(pad + 8, pad + 8, width - (pad + 8) * 2, 10);
    ctx.fillRect(pad + 8, height - pad - 18, width - (pad + 8) * 2, 10);

    ctx.fillStyle = colors.text;
    ctx.font = '900 58px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label.toUpperCase(), width * 0.5, height * 0.52);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createChevronShape(size: number, thickness: number): THREE.Shape {
  const shape = new THREE.Shape();
  const halfH = size * 0.5;
  shape.moveTo(-size * 0.35, halfH);
  shape.lineTo(0, halfH);
  shape.lineTo(size * 0.45, 0);
  shape.lineTo(0, -halfH);
  shape.lineTo(-size * 0.35, -halfH);
  shape.lineTo(size * 0.1, 0);
  shape.closePath();
  void thickness;
  return shape;
}

export function buildShortcutGates(
  course: Course,
  maxAnisotropy = 8,
  graphicsPreset: GraphicsPreset = 'penuh',
): ShortcutGateVisual {
  const group = new THREE.Group();
  group.name = 'ShortcutGatesGroup';

  const branches = course.getBranchRoutes();
  if (branches.length === 0) {
    return {
      group,
      update: () => {},
      applyPalette: () => {},
      dispose: () => {},
    };
  }

  const cfg = CONFIG.course;
  const signColors = CONFIG.shortcut.signColors;
  const castShadows = graphicsPreset === 'penuh';
  const receiveShadows = graphicsPreset !== 'hemat';
  const geomsToDispose: THREE.BufferGeometry[] = [];
  const matsToDispose: THREE.Material[] = [];
  const texsToDispose: THREE.Texture[] = [];
  const animatedChevrons: AnimatedChevron[] = [];

  const frameMat = createSurfaceMaterial(graphicsPreset, {
    color: signColors.background,
    emissive: '#082F49',
    emissiveIntensity: 0.28,
    roughness: 0.28,
    metalness: 0.25,
    clearcoat: 0.85,
    physical: true,
  });
  const borderMat = createSurfaceMaterial(graphicsPreset, {
    color: signColors.border,
    emissive: signColors.border,
    emissiveIntensity: 1.25,
    roughness: 0.2,
    metalness: 0.15,
  });
  const beaconMat = createSurfaceMaterial(graphicsPreset, {
    color: signColors.arrowPrimary,
    emissive: signColors.arrowPrimary,
    emissiveIntensity: 1.4,
    roughness: 0.2,
    metalness: 0.1,
  });
  matsToDispose.push(frameMat, borderMat, beaconMat);

  const chevronShape = createChevronShape(1.15, 0.24);
  const chevronGeom = new THREE.ExtrudeGeometry(chevronShape, {
    depth: 0.24,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  chevronGeom.center();
  geomsToDispose.push(chevronGeom);

  for (const branch of branches) {
    // 1. Entry overhead gantry framing both main road and right shortcut branch without intruding on track surface
    const entryFrame = course.getFrameAt(branch.fromS);
    const entryGroup = new THREE.Group();
    entryGroup.name = `ShortcutEntryGate_${branch.routeId}`;
    orientGroupToFrame(entryGroup, entryFrame);

    const mainHalfW = entryFrame.width * 0.5;
    const branchHalfW = branch.getTrackWidth() * 0.5;
    const leftAnchorX = -(mainHalfW + cfg.railOffsetFromEdge + cfg.railWidth + 0.85);
    const rightAnchorX =
      branch.startOffset + branchHalfW + cfg.railOffsetFromEdge + cfg.railWidth + 0.85;
    const centerAnchorX = (leftAnchorX + rightAnchorX) * 0.5;
    const spanWidth = rightAnchorX - leftAnchorX;
    const gateHeight = 5.4;

    const pillarGeom = new RoundedBoxGeometry(0.55, gateHeight, 0.6, 3, 0.1);
    const plinthGeom = new THREE.CylinderGeometry(0.52, 0.65, 0.55, 14);
    const beamGeom = new RoundedBoxGeometry(spanWidth + 0.7, 0.5, 0.58, 3, 0.1);
    const trimBeamGeom = new RoundedBoxGeometry(spanWidth + 0.5, 0.16, 0.66, 2, 0.05);
    geomsToDispose.push(pillarGeom, plinthGeom, beamGeom, trimBeamGeom);

    for (const pillarX of [leftAnchorX, rightAnchorX]) {
      const pillar = new THREE.Mesh(pillarGeom, frameMat);
      pillar.position.set(pillarX, gateHeight * 0.5, 0);
      pillar.castShadow = castShadows;
      pillar.receiveShadow = receiveShadows;
      entryGroup.add(pillar);

      const plinth = new THREE.Mesh(plinthGeom, borderMat);
      plinth.position.set(pillarX, 0.15, 0);
      entryGroup.add(plinth);
    }

    const topBeam = new THREE.Mesh(beamGeom, frameMat);
    topBeam.position.set(centerAnchorX, gateHeight, 0);
    topBeam.castShadow = castShadows;
    entryGroup.add(topBeam);

    const topTrim = new THREE.Mesh(trimBeamGeom, borderMat);
    topTrim.position.set(centerAnchorX, gateHeight + 0.28, 0);
    entryGroup.add(topTrim);

    // Sign board centered above right lane & shortcut opening
    const signCenterX = mainHalfW + 1.2;
    const signW = 7.4;
    const signH = 2.15;
    const signTex = createShortcutSignTexture(branch.name, maxAnisotropy);
    texsToDispose.push(signTex);

    const signMat = createSurfaceMaterial(graphicsPreset, {
      map: signTex,
      emissive: 0xffffff,
      emissiveMap: signTex,
      emissiveIntensity: 0.75,
      roughness: 0.25,
      metalness: 0.08,
    });
    matsToDispose.push(signMat);

    const backingGeom = new RoundedBoxGeometry(signW + 0.36, signH + 0.36, 0.38, 3, 0.08);
    const plateGeom = new THREE.PlaneGeometry(signW, signH);
    geomsToDispose.push(backingGeom, plateGeom);

    const signBacking = new THREE.Mesh(backingGeom, frameMat);
    signBacking.position.set(signCenterX, gateHeight + 1.25, 0);
    signBacking.castShadow = castShadows;
    entryGroup.add(signBacking);

    const signFront = new THREE.Mesh(plateGeom, signMat);
    signFront.position.set(signCenterX, gateHeight + 1.25, 0.2);
    entryGroup.add(signFront);

    const signBack = new THREE.Mesh(plateGeom, signMat);
    signBack.position.set(signCenterX, gateHeight + 1.25, -0.2);
    signBack.rotation.y = Math.PI;
    entryGroup.add(signBack);

    // 3 animated right-pointing chevrons beside the sign directly pointing into the right branch
    const chevronBaseX = signCenterX + signW * 0.5 + 1.1;
    const chevronSpacing = 1.15;
    for (let c = 0; c < 3; c++) {
      const chevMat = createSurfaceMaterial(graphicsPreset, {
        color: signColors.arrowPrimary,
        emissive: signColors.arrowPrimary,
        emissiveIntensity: 1.8,
        roughness: 0.2,
        metalness: 0.1,
      });
      matsToDispose.push(chevMat);

      const chevMesh = new THREE.Mesh(chevronGeom, chevMat);
      chevMesh.position.set(chevronBaseX + c * chevronSpacing, gateHeight + 1.25, 0);
      entryGroup.add(chevMesh);
      animatedChevrons.push({ material: chevMat, phaseIndex: c });
    }

    // Subtle right-side guidance beacon pylon right before the branch opening ends
    const edgeBeaconGeom = new RoundedBoxGeometry(0.42, 2.2, 0.42, 2, 0.08);
    geomsToDispose.push(edgeBeaconGeom);
    const entryEdgePylon = new THREE.Mesh(edgeBeaconGeom, borderMat);
    entryEdgePylon.position.set(rightAnchorX, 1.1, 0);
    entryGroup.add(entryEdgePylon);

    group.add(entryGroup);

    // 2. Clean textless merge pylon near main toS outside right rail
    const mergeFrame = course.getFrameAt(branch.toS);
    const mergeGroup = new THREE.Group();
    mergeGroup.name = `ShortcutMergeMarker_${branch.routeId}`;
    orientGroupToFrame(mergeGroup, mergeFrame);

    const mergeMainHalfW = mergeFrame.width * 0.5;
    const mergePylonX = mergeMainHalfW + cfg.railOffsetFromEdge + cfg.railWidth + 0.85;
    const mergePylonGeom = new RoundedBoxGeometry(0.45, 3.4, 0.45, 3, 0.08);
    const mergeCapGeom = new THREE.OctahedronGeometry(0.42, 0);
    geomsToDispose.push(mergePylonGeom, mergeCapGeom);

    const mergePylon = new THREE.Mesh(mergePylonGeom, frameMat);
    mergePylon.position.set(mergePylonX, 1.7, 0);
    mergePylon.castShadow = castShadows;
    mergeGroup.add(mergePylon);

    const mergeCap = new THREE.Mesh(mergeCapGeom, beaconMat);
    mergeCap.position.set(mergePylonX, 3.85, 0);
    mergeGroup.add(mergeCap);

    // Textless merge chevron pointing left back onto main lane
    const mergeChevMat = createSurfaceMaterial(graphicsPreset, {
      color: signColors.arrowSecondary,
      emissive: signColors.arrowSecondary,
      emissiveIntensity: 1.5,
      roughness: 0.2,
      metalness: 0.1,
    });
    matsToDispose.push(mergeChevMat);
    const mergeChev = new THREE.Mesh(chevronGeom, mergeChevMat);
    mergeChev.position.set(mergePylonX - 0.55, 2.75, 0);
    mergeChev.rotation.z = Math.PI;
    mergeChev.scale.setScalar(0.72);
    mergeGroup.add(mergeChev);

    group.add(mergeGroup);
  }

  let animClock = 0;

  function update(dt: number): void {
    animClock += dt;
    const step = (animClock * 3.2) % 3;
    for (let i = 0; i < animatedChevrons.length; i++) {
      const item = animatedChevrons[i];
      const dist = Math.min(
        Math.abs(step - item.phaseIndex),
        Math.abs(step - item.phaseIndex - 3),
        Math.abs(step - item.phaseIndex + 3),
      );
      const glow = Math.max(0, 1 - dist / 1.1);
      const intensity = 0.45 + glow * glow * 2.15;
      item.material.emissiveIntensity = intensity;
    }
  }

  function applyPalette(_name: VisualPresetName): void {
    // Sign colors use fixed high-contrast shortcut palette from CONFIG.shortcut.signColors
  }

  function dispose(): void {
    for (const g of geomsToDispose) g.dispose();
    for (const m of matsToDispose) m.dispose();
    for (const t of texsToDispose) t.dispose();
  }

  return {
    group,
    update,
    applyPalette,
    dispose,
  };
}
