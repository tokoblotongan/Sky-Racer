// src/render/car.ts

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CONFIG } from '../config';
import type { CarState } from '../core/physics';

export interface CarVisual {
  group: THREE.Group;
  update: (state: CarState, dt: number) => void;
}

function createBodyPaintTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    // Warm cream base
    ctx.fillStyle = CONFIG.car.bodyColor;
    ctx.fillRect(0, 0, size, size);

    // Twin red-and-yellow racing stripes down the center
    ctx.fillStyle = CONFIG.car.stripeColor;
    ctx.fillRect(size * 0.41, 0, size * 0.075, size);
    ctx.fillRect(size * 0.515, 0, size * 0.075, size);

    ctx.fillStyle = CONFIG.car.accentColor;
    ctx.fillRect(size * 0.488, 0, size * 0.024, size);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  return texture;
}

function createWheelAssembly(
  tireMaterial: THREE.Material,
  rimMaterial: THREE.Material,
  hubMaterial: THREE.Material,
  radius: number,
  width: number,
): { steerPivot: THREE.Group; spinMesh: THREE.Group } {
  const steerPivot = new THREE.Group();
  const spinMesh = new THREE.Group();

  const tireGeom = new THREE.CylinderGeometry(radius, radius, width, 24);
  tireGeom.rotateZ(Math.PI / 2);
  const tireMesh = new THREE.Mesh(tireGeom, tireMaterial);
  tireMesh.castShadow = true;
  tireMesh.receiveShadow = true;
  spinMesh.add(tireMesh);

  const rimGeom = new THREE.CylinderGeometry(radius * 0.62, radius * 0.62, width + 0.015, 20);
  rimGeom.rotateZ(Math.PI / 2);
  const rimMesh = new THREE.Mesh(rimGeom, rimMaterial);
  rimMesh.castShadow = true;
  spinMesh.add(rimMesh);

  // Subtle spoke bar across the chrome rim so wheel rotation is visibly crisp
  const spokeGeom = new THREE.BoxGeometry(width + 0.028, radius * 0.96, radius * 0.18);
  const spokeA = new THREE.Mesh(spokeGeom, rimMaterial);
  const spokeB = new THREE.Mesh(spokeGeom, rimMaterial);
  spokeB.rotation.x = Math.PI / 2;
  spinMesh.add(spokeA);
  spinMesh.add(spokeB);

  const hubGeom = new THREE.CylinderGeometry(radius * 0.22, radius * 0.22, width + 0.036, 14);
  hubGeom.rotateZ(Math.PI / 2);
  const hubMesh = new THREE.Mesh(hubGeom, hubMaterial);
  spinMesh.add(hubMesh);

  steerPivot.add(spinMesh);
  return { steerPivot, spinMesh };
}

export function buildCarMesh(maxAnisotropy = 8): CarVisual {
  const cfg = CONFIG.car;
  const root = new THREE.Group();
  root.name = 'PlayerCar';

  // Sprung body group (rolls and pitches independently of wheels touching the deck)
  const sprungBody = new THREE.Group();
  root.add(sprungBody);

  const bodyTexture = createBodyPaintTexture(maxAnisotropy);
  const bodyMaterial = new THREE.MeshPhysicalMaterial({
    map: bodyTexture,
    clearcoat: cfg.bodyClearcoat,
    clearcoatRoughness: cfg.bodyClearcoatRoughness,
    roughness: cfg.bodyRoughness,
    metalness: cfg.bodyMetalness,
  });

  const stripeMaterial = new THREE.MeshPhysicalMaterial({
    color: cfg.stripeColor,
    clearcoat: cfg.bodyClearcoat,
    clearcoatRoughness: cfg.bodyClearcoatRoughness,
    roughness: cfg.bodyRoughness,
    metalness: 0.08,
  });

  const accentMaterial = new THREE.MeshPhysicalMaterial({
    color: cfg.accentColor,
    clearcoat: cfg.bodyClearcoat,
    clearcoatRoughness: 0.1,
    roughness: 0.2,
    metalness: 0.1,
  });

  const cabinMaterial = new THREE.MeshPhysicalMaterial({
    color: cfg.cabinColorHex,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    roughness: 0.08,
    metalness: 0.15,
  });

  const trimMaterial = new THREE.MeshStandardMaterial({
    color: cfg.bumperColorHex,
    roughness: 0.52,
    metalness: 0.25,
  });

  const headlightMaterial = new THREE.MeshStandardMaterial({
    color: cfg.headlightColorHex,
    emissive: cfg.headlightColorHex,
    emissiveIntensity: cfg.headlightEmissiveIntensity,
    roughness: 0.15,
  });

  const taillightMaterial = new THREE.MeshStandardMaterial({
    color: cfg.taillightColorHex,
    emissive: cfg.taillightColorHex,
    emissiveIntensity: cfg.taillightEmissiveIntensity,
    roughness: 0.2,
  });

  const exhaustGlowMaterial = new THREE.MeshBasicMaterial({
    color: cfg.exhaustGlowColorHex,
    transparent: true,
    opacity: 0.25,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const exhaustCoreMaterial = new THREE.MeshStandardMaterial({
    color: cfg.exhaustGlowColorHex,
    emissive: cfg.exhaustGlowColorHex,
    emissiveIntensity: cfg.exhaustEmissiveIntensity,
    roughness: 0.2,
  });

  const tireMaterial = new THREE.MeshStandardMaterial({
    color: cfg.tireColorHex,
    roughness: 0.84,
    metalness: 0.05,
  });

  const rimMaterial = new THREE.MeshPhysicalMaterial({
    color: cfg.rimColorHex,
    metalness: cfg.rimMetalness,
    roughness: cfg.rimRoughness,
    clearcoat: 0.6,
    clearcoatRoughness: 0.08,
  });

  // 1. Main sculpted die-cast body shell (forward = -Z)
  const bodyCenterY = cfg.bodyClearance + cfg.bodyHeight * 0.5;
  const mainBodyGeom = new RoundedBoxGeometry(
    cfg.bodyWidth,
    cfg.bodyHeight,
    cfg.bodyLength,
    4,
    cfg.bodyCornerRadius,
  );
  const mainBody = new THREE.Mesh(mainBodyGeom, bodyMaterial);
  mainBody.position.set(0, bodyCenterY, 0);
  mainBody.castShadow = true;
  mainBody.receiveShadow = true;
  sprungBody.add(mainBody);

  // 2. Dark glass cabin canopy
  const cabinGeom = new RoundedBoxGeometry(
    cfg.cabinWidth,
    cfg.cabinHeight,
    cfg.cabinLength,
    4,
    0.14,
  );
  const cabin = new THREE.Mesh(cabinGeom, cabinMaterial);
  cabin.position.set(
    0,
    cfg.bodyClearance + cfg.bodyHeight + cfg.cabinHeight * 0.36,
    cfg.cabinOffsetZ,
  );
  cabin.castShadow = true;
  cabin.receiveShadow = true;
  sprungBody.add(cabin);

  // 3. Front and rear bumpers
  const frontBumperGeom = new RoundedBoxGeometry(
    cfg.bodyWidth * 0.96,
    cfg.bumperThickness,
    0.26,
    3,
    0.06,
  );
  const frontBumper = new THREE.Mesh(frontBumperGeom, trimMaterial);
  frontBumper.position.set(0, cfg.bodyClearance + 0.1, -cfg.bodyLength * 0.5 - 0.03);
  frontBumper.castShadow = true;
  sprungBody.add(frontBumper);

  const rearBumper = new THREE.Mesh(frontBumperGeom, trimMaterial);
  rearBumper.position.set(0, cfg.bodyClearance + 0.1, cfg.bodyLength * 0.5 + 0.03);
  rearBumper.castShadow = true;
  sprungBody.add(rearBumper);

  // 4. Two small emissive headlights & taillights
  const lampGeom = new RoundedBoxGeometry(0.28, 0.12, 0.08, 2, 0.03);
  for (const side of [-1, 1]) {
    const headlight = new THREE.Mesh(lampGeom, headlightMaterial);
    headlight.position.set(
      side * (cfg.bodyWidth * 0.32),
      bodyCenterY + 0.05,
      -cfg.bodyLength * 0.5 - 0.01,
    );
    sprungBody.add(headlight);

    const taillight = new THREE.Mesh(lampGeom, taillightMaterial);
    taillight.position.set(
      side * (cfg.bodyWidth * 0.32),
      bodyCenterY + 0.06,
      cfg.bodyLength * 0.5 + 0.01,
    );
    sprungBody.add(taillight);
  }

  // 4b. Twin rear exhaust pipes + emissive boost halo
  const exhaustPipeGeom = new THREE.CylinderGeometry(
    cfg.exhaustPipeRadius,
    cfg.exhaustPipeRadius * 1.12,
    cfg.exhaustPipeLength,
    12,
  );
  exhaustPipeGeom.rotateX(Math.PI / 2);
  const exhaustCoreGeom = new THREE.SphereGeometry(cfg.exhaustPipeRadius * 0.85, 10, 8);
  const exhaustHaloGeom = new THREE.SphereGeometry(cfg.exhaustPipeRadius * 2.1, 12, 10);
  const exhaustHalos: THREE.Mesh[] = [];
  const exhaustCores: THREE.Mesh[] = [];

  for (const side of [-1, 1]) {
    const exX = side * (cfg.bodyWidth * 0.22);
    const exY = cfg.bodyClearance + 0.09;
    const exZ = cfg.bodyLength * 0.5 + 0.12;

    const pipe = new THREE.Mesh(exhaustPipeGeom, rimMaterial);
    pipe.position.set(exX, exY, exZ - 0.04);
    pipe.castShadow = true;
    sprungBody.add(pipe);

    const core = new THREE.Mesh(exhaustCoreGeom, exhaustCoreMaterial);
    core.position.set(exX, exY, exZ + 0.03);
    core.scale.set(0.7, 0.7, 1.1);
    sprungBody.add(core);
    exhaustCores.push(core);

    const halo = new THREE.Mesh(exhaustHaloGeom, exhaustGlowMaterial);
    halo.position.set(exX, exY, exZ + 0.09);
    halo.scale.set(cfg.exhaustHaloBaseScale, cfg.exhaustHaloBaseScale, cfg.exhaustHaloBaseScale * 1.5);
    sprungBody.add(halo);
    exhaustHalos.push(halo);
  }

  // 5. Rear stunt spoiler (pylons + wing + endplates)
  const wingZ = cfg.bodyLength * 0.5 - 0.25;
  const wingY = cfg.bodyClearance + cfg.bodyHeight + cfg.spoilerHeight;

  const pylonGeom = new THREE.BoxGeometry(0.08, cfg.spoilerHeight, 0.22);
  for (const side of [-1, 1]) {
    const pylon = new THREE.Mesh(pylonGeom, trimMaterial);
    pylon.position.set(
      side * (cfg.spoilerWidth * 0.28),
      cfg.bodyClearance + cfg.bodyHeight + cfg.spoilerHeight * 0.45,
      wingZ,
    );
    pylon.castShadow = true;
    sprungBody.add(pylon);
  }

  const wingGeom = new RoundedBoxGeometry(cfg.spoilerWidth, 0.09, cfg.spoilerChord, 2, 0.03);
  const wing = new THREE.Mesh(wingGeom, stripeMaterial);
  wing.position.set(0, wingY, wingZ);
  wing.rotation.x = -0.14;
  wing.castShadow = true;
  sprungBody.add(wing);

  const endplateGeom = new RoundedBoxGeometry(0.06, 0.2, cfg.spoilerChord + 0.06, 2, 0.02);
  for (const side of [-1, 1]) {
    const endplate = new THREE.Mesh(endplateGeom, accentMaterial);
    endplate.position.set(side * (cfg.spoilerWidth * 0.5), wingY, wingZ);
    endplate.castShadow = true;
    sprungBody.add(endplate);
  }

  // 6. Four wheels (bottom of tire rests at y = 0)
  const fl = createWheelAssembly(
    tireMaterial,
    rimMaterial,
    accentMaterial,
    cfg.wheelRadius,
    cfg.wheelWidth,
  );
  fl.steerPivot.position.set(-cfg.wheelTrackHalfWidth, cfg.wheelRadius, -cfg.wheelBaseHalfLength);
  root.add(fl.steerPivot);

  const fr = createWheelAssembly(
    tireMaterial,
    rimMaterial,
    accentMaterial,
    cfg.wheelRadius,
    cfg.wheelWidth,
  );
  fr.steerPivot.position.set(cfg.wheelTrackHalfWidth, cfg.wheelRadius, -cfg.wheelBaseHalfLength);
  root.add(fr.steerPivot);

  const rl = createWheelAssembly(
    tireMaterial,
    rimMaterial,
    accentMaterial,
    cfg.wheelRadius,
    cfg.wheelWidth,
  );
  rl.steerPivot.position.set(-cfg.wheelTrackHalfWidth, cfg.wheelRadius, cfg.wheelBaseHalfLength);
  root.add(rl.steerPivot);

  const rr = createWheelAssembly(
    tireMaterial,
    rimMaterial,
    accentMaterial,
    cfg.wheelRadius,
    cfg.wheelWidth,
  );
  rr.steerPivot.position.set(cfg.wheelTrackHalfWidth, cfg.wheelRadius, cfg.wheelBaseHalfLength);
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
    taillightMaterial.emissiveIntensity =
      state.mode === 'grounded' && state.longAccel < -8
        ? cfg.taillightEmissiveIntensity * 1.55
        : cfg.taillightEmissiveIntensity;

    for (let i = 0; i < exhaustHalos.length; i++) {
      exhaustHalos[i].scale.set(targetHaloScale, targetHaloScale, targetHaloScale * (isBoosting ? 2.6 : 1.3));
      exhaustCores[i].scale.set(coreScale, coreScale, isBoosting ? 2.1 : 1.0);
    }
  }

  return {
    group: root,
    update,
  };
}
