// src/render/car.ts

import * as THREE from 'three';
import { CONFIG, VISUAL_PRESETS, type VisualPresetName } from '../config';
import type { CarState } from '../core/physics';
import type { CarDesignId } from './carDesigns';
import { getCachedCarGeometryBundle, type WheelGeomSet } from './carGeometry';

export interface CarColorPalette {
  body?: string;
  accent?: string;
  stripe?: string;
}

export interface BuildCarMeshOptions {
  designId?: CarDesignId;
  colors?: CarColorPalette;
  maxAnisotropy?: number;
  presetName?: VisualPresetName;
}

export interface CarVisual {
  group: THREE.Group;
  update: (state: CarState, dt: number) => void;
  applyPalette: (name: VisualPresetName) => void;
  getDesignId: () => CarDesignId;
  dispose: () => void;
}

function createBodyPaintTexture(
  maxAnisotropy: number,
  bodyColor: string,
  stripeColor: string,
  accentColor: string,
): THREE.CanvasTexture {
  const width = 512;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    // Base automotive clearcoat base paint
    ctx.fillStyle = bodyColor;
    ctx.fillRect(0, 0, width, height);

    // Subtle longitudinal clearcoat shading band along flanks for die-cast depth
    const flankGrad = ctx.createLinearGradient(0, 0, 0, height);
    flankGrad.addColorStop(0, 'rgba(0,0,0,0.22)');
    flankGrad.addColorStop(0.22, 'rgba(0,0,0,0.0)');
    flankGrad.addColorStop(0.5, 'rgba(255,255,255,0.06)');
    flankGrad.addColorStop(0.78, 'rgba(0,0,0,0.0)');
    flankGrad.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = flankGrad;
    ctx.fillRect(0, 0, width, height);

    // Twin central racing stripes along top hood, roof & rear deck (v around 0.5 -> canvasY around 0.5 * height)
    const stripeStartX = width * 0.02;
    const stripeLenX = width * 0.96;
    ctx.fillStyle = stripeColor;
    ctx.fillRect(stripeStartX, height * 0.442, stripeLenX, height * 0.044);
    ctx.fillRect(stripeStartX, height * 0.514, stripeLenX, height * 0.044);

    // Thin center accent pinstripe between racing stripes
    ctx.fillStyle = accentColor;
    ctx.fillRect(stripeStartX, height * 0.493, stripeLenX, height * 0.014);

    // Subtle flank rocker pinstripes (v ~ 0.16 right, v ~ 0.84 left)
    ctx.fillStyle = accentColor;
    ctx.fillRect(width * 0.24, height * 0.155, width * 0.52, height * 0.01);
    ctx.fillRect(width * 0.24, height * 0.835, width * 0.52, height * 0.01);

    // Generic racing door number "01" roundel on both doors (right: v~0.24 => y~0.76H; left: v~0.76 => y~0.24H)
    const drawDoorRoundel = (cx: number, cy: number, flip180: boolean): void => {
      ctx.save();
      ctx.translate(cx, cy);
      if (flip180) {
        ctx.rotate(Math.PI);
      }
      ctx.fillStyle = stripeColor;
      ctx.beginPath();
      ctx.arc(0, 0, 17, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, 15.2, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#111824';
      ctx.font = '900 16px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('01', 0, 1);
      ctx.restore();
    };

    // Right flank (v ~ 0.24 -> canvasY = 0.76 * height), upright normal text
    drawDoorRoundel(width * 0.52, height * 0.76, false);
    // Left flank (v ~ 0.76 -> canvasY = 0.24 * height), rotated 180° so u & v inversion aligns upright
    drawDoorRoundel(width * 0.52, height * 0.24, true);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  return texture;
}

interface WheelControl {
  steerPivot: THREE.Group;
  spinMesh: THREE.Group;
}

function createWheelInstance(
  geomSet: WheelGeomSet,
  materials: {
    tire: THREE.Material;
    rim: THREE.Material;
    hub: THREE.Material;
    disc: THREE.Material;
    caliper: THREE.Material;
  },
  side: -1 | 1,
  camberRad: number,
): WheelControl {
  const steerPivot = new THREE.Group();
  const camberGroup = new THREE.Group();
  // Negative camber: top of tire leans inward toward vehicle centerline
  camberGroup.rotation.z = side * camberRad;
  steerPivot.add(camberGroup);

  // Stationary brake caliper mounted inside camberGroup (does not spin with wheel)
  const caliperMesh = new THREE.Mesh(geomSet.caliperGeom, materials.caliper);
  if (side === -1) {
    caliperMesh.rotation.y = Math.PI;
  }
  camberGroup.add(caliperMesh);

  const spinMesh = new THREE.Group();
  camberGroup.add(spinMesh);

  // Inner holder flipped PI around Y for left wheels so outer spokes/hub face -X while spinMesh.rotation.x rolls forward
  const wheelFaceHolder = new THREE.Group();
  if (side === -1) {
    wheelFaceHolder.rotation.y = Math.PI;
  }
  spinMesh.add(wheelFaceHolder);

  const tireMesh = new THREE.Mesh(geomSet.tireGeom, materials.tire);
  tireMesh.castShadow = true;
  tireMesh.receiveShadow = true;
  wheelFaceHolder.add(tireMesh);

  const rimMesh = new THREE.Mesh(geomSet.rimGeom, materials.rim);
  rimMesh.castShadow = true;
  wheelFaceHolder.add(rimMesh);

  const spokeMesh = new THREE.Mesh(geomSet.spokeGeom, materials.rim);
  spokeMesh.castShadow = true;
  wheelFaceHolder.add(spokeMesh);

  const hubMesh = new THREE.Mesh(geomSet.hubGeom, materials.hub);
  wheelFaceHolder.add(hubMesh);

  const discMesh = new THREE.Mesh(geomSet.discGeom, materials.disc);
  wheelFaceHolder.add(discMesh);

  return { steerPivot, spinMesh };
}

export function buildCarMesh(options: BuildCarMeshOptions = {}): CarVisual {
  const cfg = CONFIG.car;
  const visualCfg = cfg.visual;
  const designId: CarDesignId = options.designId ?? visualCfg.designId;
  const initialPresetName: VisualPresetName = options.presetName ?? CONFIG.visual.activePreset;
  const maxAnisotropy = options.maxAnisotropy ?? 8;

  const activePreset = VISUAL_PRESETS[initialPresetName];
  const designDefaults = visualCfg.designs[designId];
  const hasCustomPalette = Boolean(options.colors?.body || options.colors?.accent || options.colors?.stripe);

  const resolveColors = (presetName: VisualPresetName): { body: string; accent: string; stripe: string } => {
    const presetCar = VISUAL_PRESETS[presetName].car;
    if (hasCustomPalette) {
      return {
        body: options.colors?.body ?? designDefaults.body,
        accent: options.colors?.accent ?? designDefaults.accent,
        stripe: options.colors?.stripe ?? designDefaults.stripe,
      };
    }
    if (designId === 'gt') {
      return {
        body: presetCar.bodyColor,
        accent: presetCar.accentColor,
        stripe: presetCar.stripeColor,
      };
    }
    return {
      body: designDefaults.body,
      accent: designDefaults.accent,
      stripe: designDefaults.stripe,
    };
  };

  const initialColors = resolveColors(initialPresetName);

  const bundle = getCachedCarGeometryBundle(designId, {
    spokeCount: visualCfg.wheelDetail.spokeCount,
    tireThicknessRatio: visualCfg.wheelDetail.tireThicknessRatio,
  });
  const design = bundle.design;

  const root = new THREE.Group();
  root.name = `PlayerCar_${designId}`;
  root.scale.setScalar(cfg.visualScale);

  const sprungBody = new THREE.Group();
  root.add(sprungBody);

  // Materials (owned by this car instance and disposed cleanly on dispose())
  const ownedMaterials: THREE.Material[] = [];
  let bodyTexture = createBodyPaintTexture(
    maxAnisotropy,
    initialColors.body,
    initialColors.stripe,
    initialColors.accent,
  );

  const bodyMaterial = new THREE.MeshPhysicalMaterial({
    map: bodyTexture,
    clearcoat: visualCfg.clearcoat,
    clearcoatRoughness: visualCfg.clearcoatRoughness,
    roughness: visualCfg.roughness,
    metalness: visualCfg.metalness,
    envMapIntensity: visualCfg.envMapIntensity,
  });
  ownedMaterials.push(bodyMaterial);

  const paintSolidMaterial = new THREE.MeshPhysicalMaterial({
    color: initialColors.body,
    clearcoat: visualCfg.clearcoat,
    clearcoatRoughness: visualCfg.clearcoatRoughness,
    roughness: visualCfg.roughness,
    metalness: visualCfg.metalness,
    envMapIntensity: visualCfg.envMapIntensity,
  });
  ownedMaterials.push(paintSolidMaterial);

  const accentMaterial = new THREE.MeshPhysicalMaterial({
    color: initialColors.accent,
    clearcoat: visualCfg.clearcoat,
    clearcoatRoughness: 0.08,
    roughness: 0.22,
    metalness: 0.14,
    envMapIntensity: visualCfg.envMapIntensity,
  });
  ownedMaterials.push(accentMaterial);

  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: activePreset.car.cabinColorHex,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    roughness: 0.06,
    metalness: 0.2,
    envMapIntensity: 1.35,
  });
  ownedMaterials.push(glassMaterial);

  const trimMaterial = new THREE.MeshStandardMaterial({
    color: activePreset.car.bumperColorHex,
    roughness: 0.48,
    metalness: 0.28,
    envMapIntensity: 0.65,
  });
  ownedMaterials.push(trimMaterial);

  const wellMaterial = new THREE.MeshStandardMaterial({
    color: 0x0b0e14,
    roughness: 0.94,
    metalness: 0.02,
    envMapIntensity: 0.15,
  });
  ownedMaterials.push(wellMaterial);

  const headlightMaterial = new THREE.MeshStandardMaterial({
    color: cfg.headlightColorHex,
    emissive: cfg.headlightColorHex,
    emissiveIntensity: cfg.headlightEmissiveIntensity,
    roughness: 0.14,
  });
  ownedMaterials.push(headlightMaterial);

  const taillightMaterial = new THREE.MeshStandardMaterial({
    color: cfg.taillightColorHex,
    emissive: cfg.taillightColorHex,
    emissiveIntensity: cfg.taillightEmissiveIntensity,
    roughness: 0.18,
  });
  ownedMaterials.push(taillightMaterial);

  const underglowMaterial = new THREE.MeshStandardMaterial({
    color: activePreset.car.exhaustGlowColorHex,
    emissive: activePreset.car.exhaustGlowColorHex,
    emissiveIntensity: 1.15,
    roughness: 0.2,
    transparent: true,
    opacity: 0.72,
  });
  ownedMaterials.push(underglowMaterial);

  const exhaustGlowMaterial = new THREE.MeshBasicMaterial({
    color: activePreset.car.exhaustGlowColorHex,
    transparent: true,
    opacity: 0.24,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  ownedMaterials.push(exhaustGlowMaterial);

  const exhaustCoreMaterial = new THREE.MeshStandardMaterial({
    color: activePreset.car.exhaustGlowColorHex,
    emissive: activePreset.car.exhaustGlowColorHex,
    emissiveIntensity: cfg.exhaustEmissiveIntensity,
    roughness: 0.2,
  });
  ownedMaterials.push(exhaustCoreMaterial);

  const tireMaterial = new THREE.MeshStandardMaterial({
    color: activePreset.car.tireColorHex,
    roughness: 0.86,
    metalness: 0.04,
    envMapIntensity: 0.22,
  });
  ownedMaterials.push(tireMaterial);

  const rimMaterial = new THREE.MeshPhysicalMaterial({
    color: activePreset.car.rimColorHex,
    metalness: cfg.rimMetalness,
    roughness: cfg.rimRoughness,
    clearcoat: 0.65,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.35,
  });
  ownedMaterials.push(rimMaterial);

  const discMaterial = new THREE.MeshStandardMaterial({
    color: 0x9aa4b2,
    metalness: 0.86,
    roughness: 0.34,
    envMapIntensity: 0.9,
  });
  ownedMaterials.push(discMaterial);

  const caliperMaterial = new THREE.MeshStandardMaterial({
    color: initialColors.accent,
    roughness: 0.32,
    metalness: 0.25,
    envMapIntensity: 0.85,
  });
  ownedMaterials.push(caliperMaterial);

  // 1. Sculpted superellipse loft body + painted roof cap + arch flares
  const bodyMesh = new THREE.Mesh(bundle.bodyGeom, bodyMaterial);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  sprungBody.add(bodyMesh);

  const roofMesh = new THREE.Mesh(bundle.cabin.roofGeom, bodyMaterial);
  roofMesh.castShadow = true;
  roofMesh.receiveShadow = true;
  sprungBody.add(roofMesh);

  const glassMesh = new THREE.Mesh(bundle.cabin.glassGeom, glassMaterial);
  glassMesh.castShadow = true;
  glassMesh.receiveShadow = true;
  sprungBody.add(glassMesh);

  const cabinTrimMesh = new THREE.Mesh(bundle.cabin.trimGeom, trimMaterial);
  cabinTrimMesh.castShadow = true;
  sprungBody.add(cabinTrimMesh);

  const archFlareMesh = new THREE.Mesh(bundle.arch.flareGeom, paintSolidMaterial);
  archFlareMesh.castShadow = true;
  archFlareMesh.receiveShadow = true;
  sprungBody.add(archFlareMesh);

  const wheelWellMesh = new THREE.Mesh(bundle.arch.wellGeom, wellMaterial);
  sprungBody.add(wheelWellMesh);

  // 2. Aerodynamic & lighting details
  const headlightMesh = new THREE.Mesh(bundle.details.headlightGeom, headlightMaterial);
  sprungBody.add(headlightMesh);

  const taillightMesh = new THREE.Mesh(bundle.details.taillightGeom, taillightMaterial);
  sprungBody.add(taillightMesh);

  const grilleMesh = new THREE.Mesh(bundle.details.grilleGeom, trimMaterial);
  sprungBody.add(grilleMesh);

  const splitterMesh = new THREE.Mesh(bundle.details.splitterGeom, trimMaterial);
  splitterMesh.castShadow = true;
  sprungBody.add(splitterMesh);

  const mirrorMesh = new THREE.Mesh(bundle.details.mirrorGeom, paintSolidMaterial);
  mirrorMesh.castShadow = true;
  sprungBody.add(mirrorMesh);

  const diffuserMesh = new THREE.Mesh(bundle.details.diffuserGeom, trimMaterial);
  diffuserMesh.castShadow = true;
  sprungBody.add(diffuserMesh);

  const spoilerBodyMesh = new THREE.Mesh(bundle.details.spoilerBodyGeom, paintSolidMaterial);
  spoilerBodyMesh.castShadow = true;
  spoilerBodyMesh.receiveShadow = true;
  sprungBody.add(spoilerBodyMesh);

  const spoilerAccentMesh = new THREE.Mesh(bundle.details.spoilerAccentGeom, accentMaterial);
  spoilerAccentMesh.castShadow = true;
  sprungBody.add(spoilerAccentMesh);

  const underglowMesh = new THREE.Mesh(bundle.details.underglowGeom, underglowMaterial);
  sprungBody.add(underglowMesh);

  // 3. Twin rear exhaust pipes + animated boost jet cores & halos
  const exhaustCores: THREE.Mesh[] = [];
  const exhaustHalos: THREE.Mesh[] = [];
  const ex = design.exhausts;

  for (const side of [-1, 1]) {
    const exX = side * ex.xOffset;
    const pipe = new THREE.Mesh(bundle.details.exhaustPipeGeom, rimMaterial);
    pipe.position.set(exX, ex.y, ex.z - ex.length * 0.22);
    pipe.castShadow = true;
    sprungBody.add(pipe);

    const core = new THREE.Mesh(bundle.details.exhaustCoreGeom, exhaustCoreMaterial);
    core.position.set(exX, ex.y, ex.z + 0.045);
    core.scale.set(0.65, 0.65, 1.0);
    sprungBody.add(core);
    exhaustCores.push(core);

    const halo = new THREE.Mesh(bundle.details.exhaustHaloGeom, exhaustGlowMaterial);
    halo.position.set(exX, ex.y, ex.z + 0.09);
    halo.scale.set(
      cfg.exhaustHaloBaseScale,
      cfg.exhaustHaloBaseScale,
      cfg.exhaustHaloBaseScale * 1.4,
    );
    sprungBody.add(halo);
    exhaustHalos.push(halo);
  }

  // 4. Staggered 4-wheel assemblies with camber, brake rotors/calipers & spinning multi-spoke rims
  const wheelMats = {
    tire: tireMaterial,
    rim: rimMaterial,
    hub: accentMaterial,
    disc: discMaterial,
    caliper: caliperMaterial,
  };

  const wSpec = design.wheels;
  const frontCamber = wSpec.frontCamberRad || visualCfg.wheelDetail.camberRad;
  const rearCamber = wSpec.rearCamberRad || visualCfg.wheelDetail.camberRad;

  const fl = createWheelInstance(bundle.wheels.front, wheelMats, -1, frontCamber);
  fl.steerPivot.position.set(-wSpec.frontTrackHalfWidth, wSpec.frontRadius, wSpec.frontOffsetZ);
  root.add(fl.steerPivot);

  const fr = createWheelInstance(bundle.wheels.front, wheelMats, 1, frontCamber);
  fr.steerPivot.position.set(wSpec.frontTrackHalfWidth, wSpec.frontRadius, wSpec.frontOffsetZ);
  root.add(fr.steerPivot);

  const rl = createWheelInstance(bundle.wheels.rear, wheelMats, -1, rearCamber);
  rl.steerPivot.position.set(-wSpec.rearTrackHalfWidth, wSpec.rearRadius, wSpec.rearOffsetZ);
  root.add(rl.steerPivot);

  const rr = createWheelInstance(bundle.wheels.rear, wheelMats, 1, rearCamber);
  rr.steerPivot.position.set(wSpec.rearTrackHalfWidth, wSpec.rearRadius, wSpec.rearOffsetZ);
  root.add(rr.steerPivot);

  let currentRoll = 0;
  let currentPitch = 0;

  function update(state: CarState, dt: number): void {
    const wheelAngle = -state.wheelSpin;
    fl.spinMesh.rotation.x = wheelAngle;
    fr.spinMesh.rotation.x = wheelAngle;
    rl.spinMesh.rotation.x = wheelAngle;
    rr.spinMesh.rotation.x = wheelAngle;

    const steerAngle = -state.steer * cfg.maxWheelSteerRad;
    fl.steerPivot.rotation.y = steerAngle;
    fr.steerPivot.rotation.y = steerAngle;

    let targetRoll = 0;
    let targetPitch = 0;
    if (state.mode === 'grounded') {
      targetRoll = THREE.MathUtils.clamp(
        state.latAccel * cfg.rollFactor,
        -cfg.maxRollRad,
        cfg.maxRollRad,
      );
      targetPitch = THREE.MathUtils.clamp(
        state.longAccel * cfg.pitchFactor,
        -cfg.maxPitchRad,
        cfg.maxPitchRad,
      );
    } else {
      const speed = Math.max(8, state.worldVel.length());
      targetPitch = THREE.MathUtils.clamp(
        (state.worldVel.y / speed) * 0.08,
        -cfg.maxPitchRad,
        cfg.maxPitchRad,
      );
    }

    const safeDt = Math.max(dt, 1e-4);
    currentRoll = THREE.MathUtils.damp(currentRoll, targetRoll, cfg.suspensionDamping, safeDt);
    currentPitch = THREE.MathUtils.damp(currentPitch, targetPitch, cfg.suspensionDamping, safeDt);

    sprungBody.rotation.z = currentRoll;
    sprungBody.rotation.x = currentPitch;

    const isBoosting = state.boostTimeLeft > 0;
    const boostFade = isBoosting
      ? Math.min(1, state.boostTimeLeft / Math.max(0.2, CONFIG.boost.duration * 0.25))
      : 0;
    const targetHaloScale = isBoosting
      ? THREE.MathUtils.lerp(cfg.exhaustHaloBaseScale, cfg.exhaustHaloBoostScale, boostFade)
      : cfg.exhaustHaloBaseScale;
    const coreScale = isBoosting ? 1.15 : 0.65;

    exhaustGlowMaterial.opacity = isBoosting ? 0.45 + 0.4 * boostFade : 0.14;
    exhaustCoreMaterial.emissiveIntensity = isBoosting
      ? cfg.exhaustEmissiveIntensity * (1.2 + 0.45 * boostFade)
      : 0.45;
    underglowMaterial.emissiveIntensity = isBoosting ? 1.85 + 0.65 * boostFade : 0.85;
    underglowMaterial.opacity = isBoosting ? 0.92 : 0.58;

    taillightMaterial.emissiveIntensity =
      state.mode === 'grounded' && state.longAccel < -8
        ? cfg.taillightEmissiveIntensity * 1.75
        : cfg.taillightEmissiveIntensity;

    for (let i = 0; i < exhaustHalos.length; i++) {
      exhaustHalos[i].scale.set(
        targetHaloScale,
        targetHaloScale,
        targetHaloScale * (isBoosting ? 2.6 : 1.3),
      );
      exhaustCores[i].scale.set(coreScale, coreScale, isBoosting ? 2.1 : 1.0);
    }
  }

  function applyPalette(name: VisualPresetName): void {
    const p = VISUAL_PRESETS[name].car;
    const resolved = resolveColors(name);

    const prevBodyTex = bodyTexture;
    bodyTexture = createBodyPaintTexture(
      maxAnisotropy,
      resolved.body,
      resolved.stripe,
      resolved.accent,
    );
    bodyMaterial.map = bodyTexture;
    bodyMaterial.needsUpdate = true;
    prevBodyTex.dispose();

    paintSolidMaterial.color.set(resolved.body);
    accentMaterial.color.set(resolved.accent);
    caliperMaterial.color.set(resolved.accent);

    glassMaterial.color.setHex(p.cabinColorHex);
    trimMaterial.color.setHex(p.bumperColorHex);
    tireMaterial.color.setHex(p.tireColorHex);
    rimMaterial.color.setHex(p.rimColorHex);
    underglowMaterial.color.setHex(p.exhaustGlowColorHex);
    underglowMaterial.emissive.setHex(p.exhaustGlowColorHex);
    exhaustGlowMaterial.color.setHex(p.exhaustGlowColorHex);
    exhaustCoreMaterial.color.setHex(p.exhaustGlowColorHex);
    exhaustCoreMaterial.emissive.setHex(p.exhaustGlowColorHex);
  }

  function getDesignId(): CarDesignId {
    return designId;
  }

  function dispose(): void {
    bodyTexture.dispose();
    for (const mat of ownedMaterials) {
      mat.dispose();
    }
  }

  return {
    group: root,
    update,
    applyPalette,
    getDesignId,
    dispose,
  };
}
