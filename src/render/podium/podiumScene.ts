// src/render/podium/podiumScene.ts

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  CONFIG,
  VISUAL_PRESETS,
  type GraphicsPreset,
  type VisualPresetName,
} from '../../config';
import type { FinishClassificationEntry } from '../../core/state';
import { buildCarMesh, type CarVisual } from '../car';
import type { CarDesignId } from '../carDesigns';
import { createSurfaceMaterial } from '../materialFactory';
import { createPodiumConfetti, type PodiumConfetti } from './confetti';

export interface PodiumSceneOptions {
  classification: readonly FinishClassificationEntry[];
  playerDesignId: CarDesignId;
  presetName: VisualPresetName;
  graphicsPreset: GraphicsPreset;
  maxAnisotropy: number;
  isMobile: boolean;
  environment: THREE.Texture | null;
}

export interface PodiumSceneHandle {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  update: (dt: number) => void;
  resize: (width: number, height: number) => void;
  dispose: () => void;
}

function isReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function createPodiumFloorTexture(
  presetName: VisualPresetName,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const preset = VISUAL_PRESETS[presetName];
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const cx = size * 0.5;
    const cy = size * 0.5;
    const grad = ctx.createRadialGradient(cx, cy, size * 0.05, cx, cy, size * 0.5);
    grad.addColorStop(0, preset.room.floorColor.light);
    grad.addColorStop(0.6, preset.room.floorColor.mid);
    grad.addColorStop(1, preset.room.floorColor.dark);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Subtle concentric toy-arena showcase rings
    ctx.strokeStyle = 'rgba(255, 253, 247, 0.16)';
    ctx.lineWidth = 4;
    for (const ratio of [0.22, 0.36, 0.46]) {
      ctx.beginPath();
      ctx.arc(cx, cy, size * ratio, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  return texture;
}

function createPodiumBlockTexture(
  rankLabel: string,
  primaryColor: string,
  accentColor: string,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const width = 256;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#FFFDF7');
    grad.addColorStop(0.18, primaryColor);
    grad.addColorStop(1, '#0F172A');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = accentColor;
    ctx.fillRect(0, 0, width, 18);
    ctx.fillRect(0, height - 12, width, 12);

    // Metallic round badge with rank number
    const cx = width * 0.5;
    const cy = height * 0.54;
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.arc(cx, cy, 56, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.font = '900 58px "Exo 2", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFDF7';
    ctx.fillText(rankLabel, cx, cy + 3);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  return texture;
}

function createRankSprite(label: string, borderColor: string): {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  texture: THREE.CanvasTexture;
} {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 72;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 5;
    const r = 16;
    ctx.beginPath();
    ctx.moveTo(8 + r, 8);
    ctx.lineTo(152 - r, 8);
    ctx.quadraticCurveTo(152, 8, 152, 8 + r);
    ctx.lineTo(152, 64 - r);
    ctx.quadraticCurveTo(152, 64, 152 - r, 64);
    ctx.lineTo(8 + r, 64);
    ctx.quadraticCurveTo(8, 64, 8, 64 - r);
    ctx.lineTo(8, 8 + r);
    ctx.quadraticCurveTo(8, 8, 8 + r, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.font = '900 34px "Exo 2", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = borderColor;
    ctx.fillText(label, 80, 38);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.85, 0.84, 1);
  return { sprite, material, texture };
}

export function createPodiumScene(options: PodiumSceneOptions): PodiumSceneHandle {
  const {
    classification,
    playerDesignId,
    presetName,
    graphicsPreset,
    maxAnisotropy,
    isMobile,
    environment,
  } = options;
  const preset = VISUAL_PRESETS[presetName];
  const cfg = CONFIG.podium;
  const reducedMotion = isReducedMotion();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(preset.skyHorizon);
  scene.fog = new THREE.FogExp2(preset.fogColor, 0.012);
  if (environment && graphicsPreset !== 'hemat') {
    scene.environment = environment;
    scene.environmentIntensity =
      graphicsPreset === 'seimbang' ? CONFIG.safeMode.balancedEnvIntensity : preset.envIntensity;
  }

  const camera = new THREE.PerspectiveCamera(cfg.fov, 16 / 9, 0.25, 220);

  // Strict 2-light setup per docs/LIGHTING.md: HemisphereLight + single DirectionalLight
  const hemi = new THREE.HemisphereLight(
    preset.hemisphereSkyColor,
    preset.hemisphereGroundColor,
    Math.max(0.75, preset.hemisphereIntensity),
  );
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(preset.sunColor, preset.sunIntensity);
  sun.position.set(14, 22, 16);
  if (graphicsPreset !== 'hemat') {
    sun.castShadow = true;
    sun.shadow.mapSize.set(isMobile ? 512 : 1024, isMobile ? 512 : 1024);
    sun.shadow.camera.near = 2;
    sun.shadow.camera.far = 65;
    sun.shadow.camera.left = -14;
    sun.shadow.camera.right = 14;
    sun.shadow.camera.top = 14;
    sun.shadow.camera.bottom = -14;
    sun.shadow.bias = -0.0005;
  }
  scene.add(sun);

  const disposables: {
    geoms: THREE.BufferGeometry[];
    mats: THREE.Material[];
    texs: THREE.Texture[];
  } = {
    geoms: [],
    mats: [],
    texs: [],
  };

  // Floor stage
  const floorTex = createPodiumFloorTexture(presetName, maxAnisotropy);
  disposables.texs.push(floorTex);
  const floorGeom = new THREE.CylinderGeometry(18, 19, 0.5, 48);
  const floorMat = createSurfaceMaterial(graphicsPreset, {
    map: floorTex,
    roughness: 0.45,
    metalness: 0.05,
  });
  disposables.geoms.push(floorGeom);
  disposables.mats.push(floorMat);
  const floorMesh = new THREE.Mesh(floorGeom, floorMat);
  floorMesh.position.y = -0.25;
  floorMesh.receiveShadow = graphicsPreset !== 'hemat';
  scene.add(floorMesh);

  // 3 podium blocks (P1 center highest, P2 left, P3 right)
  const slotLayout = [
    { rank: 1, x: 0, z: 0, height: cfg.heights[0], rotY: Math.PI, color: '#FFD000', accent: '#FFF6E0' },
    { rank: 2, x: -cfg.blockSpacing, z: 0.65, height: cfg.heights[1], rotY: Math.PI - 0.14, color: '#CBD5E1', accent: '#00E5FF' },
    { rank: 3, x: cfg.blockSpacing, z: 0.95, height: cfg.heights[2], rotY: Math.PI + 0.14, color: '#D97706', accent: '#FFE0AD' },
  ] as const;

  for (const slot of slotLayout) {
    const tex = createPodiumBlockTexture(
      String(slot.rank),
      slot.color,
      slot.accent,
      maxAnisotropy,
    );
    disposables.texs.push(tex);
    const geom = new RoundedBoxGeometry(cfg.blockWidth, slot.height, cfg.blockDepth, 3, 0.14);
    const mat = createSurfaceMaterial(graphicsPreset, {
      map: tex,
      roughness: 0.25,
      metalness: 0.18,
      clearcoat: 0.9,
      clearcoatRoughness: 0.1,
      physical: true,
    });
    disposables.geoms.push(geom);
    disposables.mats.push(mat);

    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(slot.x, slot.height * 0.5, slot.z);
    mesh.castShadow = graphicsPreset === 'penuh';
    mesh.receiveShadow = graphicsPreset !== 'hemat';
    scene.add(mesh);
  }

  // Build car visuals for top 3 (+ beside-podium P4 car if player finished 4th)
  const carVisuals: CarVisual[] = [];
  const rivals = CONFIG.ai.rivals;
  const palettes = CONFIG.car.visual.multiplayerPalettes;
  let playerRingMat: THREE.MeshStandardMaterial | null = null;
  let hasPlayerHighlight = false;
  const playerHighlightPos = new THREE.Vector3();

  const spawnPodiumCar = (
    entry: FinishClassificationEntry,
    x: number,
    y: number,
    z: number,
    rotY: number,
  ): void => {
    const isPlayer = entry.isPlayer;
    const rival = !isPlayer ? rivals[(entry.carIndex - 1) % rivals.length] : null;
    const designId: CarDesignId = isPlayer ? playerDesignId : rival?.design ?? 'wedge';
    const colors = rival
      ? { body: rival.color, accent: rival.accent, stripe: rival.stripe }
      : palettes[0];
    const carVis = buildCarMesh({
      designId,
      colors,
      maxAnisotropy,
      presetName,
      graphicsPreset,
      isMobile,
      isOpponent: !isPlayer,
    });
    carVis.group.position.set(x, y + 0.01, z);
    carVis.group.rotation.y = rotY;
    scene.add(carVis.group);
    carVisuals.push(carVis);

    if (isPlayer) {
      hasPlayerHighlight = true;
      playerHighlightPos.set(x, y + 0.05, z);
    }
  };

  for (let i = 0; i < slotLayout.length; i++) {
    const slot = slotLayout[i];
    const entry = classification.find((c) => c.rank === slot.rank) ?? classification[i];
    if (entry) {
      spawnPodiumCar(entry, slot.x, slot.height, slot.z, slot.rotY);
    }
  }

  const playerEntry = classification.find((c) => c.isPlayer);
  if (playerEntry && playerEntry.rank >= 4) {
    const p4X = cfg.p4SideOffset;
    const p4Z = 1.65;
    spawnPodiumCar(playerEntry, p4X, 0, p4Z, Math.PI + 0.32);

    const p4Badge = createRankSprite('P4', cfg.playerHighlightColor);
    p4Badge.sprite.position.set(p4X, 2.3, p4Z);
    scene.add(p4Badge.sprite);
    disposables.mats.push(p4Badge.material);
    disposables.texs.push(p4Badge.texture);
  }

  if (hasPlayerHighlight) {
    const ringGeom = new THREE.TorusGeometry(
      2.12 * CONFIG.car.visualScale,
      0.085,
      12,
      48,
    );
    ringGeom.rotateX(Math.PI * 0.5);
    playerRingMat = new THREE.MeshStandardMaterial({
      color: cfg.playerHighlightColor,
      emissive: cfg.playerHighlightColor,
      emissiveIntensity: 1.75,
      roughness: 0.2,
      metalness: 0.1,
    });
    disposables.geoms.push(ringGeom);
    disposables.mats.push(playerRingMat);
    const ringMesh = new THREE.Mesh(ringGeom, playerRingMat);
    ringMesh.position.set(playerHighlightPos.x, playerHighlightPos.y, playerHighlightPos.z);
    scene.add(ringMesh);
  }

  const confetti: PodiumConfetti = createPodiumConfetti(
    graphicsPreset,
    isMobile,
    reducedMotion,
  );
  scene.add(confetti.group);

  let orbitAngle = 0.24;
  let elapsed = 0;

  const updateCameraPose = (): void => {
    const camX = Math.sin(orbitAngle) * cfg.orbitRadius;
    const camZ = Math.cos(orbitAngle) * cfg.orbitRadius;
    camera.position.set(camX, cfg.orbitHeight, camZ);
    camera.lookAt(0, cfg.lookHeight, 0);
  };
  updateCameraPose();

  const update = (dt: number): void => {
    const safeDt = Math.min(0.05, Math.max(0, dt));
    elapsed += safeDt;

    if (!reducedMotion) {
      orbitAngle = Math.sin(elapsed * cfg.orbitSpeed) * 0.42;
      updateCameraPose();
      confetti.update(safeDt);
    }

    if (playerRingMat) {
      playerRingMat.emissiveIntensity = reducedMotion
        ? 1.75
        : 1.45 + 0.55 * Math.sin(elapsed * 4.2);
    }
  };

  const resize = (width: number, height: number): void => {
    if (width <= 0 || height <= 0) {
      return;
    }
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  const dispose = (): void => {
    confetti.dispose();
    for (const carVis of carVisuals) {
      scene.remove(carVis.group);
      carVis.dispose();
    }
    carVisuals.length = 0;

    for (const g of disposables.geoms) {
      g.dispose();
    }
    for (const m of disposables.mats) {
      m.dispose();
    }
    for (const t of disposables.texs) {
      t.dispose();
    }
    scene.clear();
  };

  return {
    scene,
    camera,
    update,
    resize,
    dispose,
  };
}
