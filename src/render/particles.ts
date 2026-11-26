// src/render/particles.ts

import * as THREE from 'three';
import { CONFIG } from '../config';
import type { CarPose, CarState } from '../core/physics';
import type { QualityLevel } from './quality';

export type ParticleEventSpec =
  | { type: 'railHit'; side: -1 | 1; intensity: number; worldPos: THREE.Vector3 }
  | { type: 'landed'; impactSpeed: number; position: THREE.Vector3 }
  | { type: 'boost'; position: THREE.Vector3; forward: THREE.Vector3; right: THREE.Vector3; up: THREE.Vector3 };

export interface ParticlesSystem {
  emit: (event: ParticleEventSpec) => void;
  update: (dt: number, carPose: CarPose, carState: CarState) => void;
  setQuality: (level: QualityLevel) => void;
  reset: () => void;
  dispose: () => void;
}

interface PoolBuffers {
  capacity: number;
  cursor: number;
  positions: Float32Array;
  velocities: Float32Array;
  ages: Float32Array;
  lifetimes: Float32Array;
  startSizes: Float32Array;
  endSizes: Float32Array;
  colors: Float32Array;
  alphas: Float32Array;
  geometry: THREE.BufferGeometry;
  posAttr: THREE.BufferAttribute;
  sizeAttr: THREE.BufferAttribute;
  colorAttr: THREE.BufferAttribute;
  alphaAttr: THREE.BufferAttribute;
  material: THREE.ShaderMaterial;
  points: THREE.Points;
}

function createRadialSpriteTexture(softness: number): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const c = size * 0.5;
    const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(softness, 'rgba(255, 255, 255, 0.72)');
    grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createPool(
  capacity: number,
  texture: THREE.Texture,
  blending: THREE.Blending,
  pixelRatio: number,
): PoolBuffers {
  const positions = new Float32Array(capacity * 3);
  const velocities = new Float32Array(capacity * 3);
  const ages = new Float32Array(capacity);
  const lifetimes = new Float32Array(capacity);
  const startSizes = new Float32Array(capacity);
  const endSizes = new Float32Array(capacity);
  const sizes = new Float32Array(capacity);
  const colors = new Float32Array(capacity * 3);
  const alphas = new Float32Array(capacity);

  ages.fill(1);
  lifetimes.fill(1);

  const geometry = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  const sizeAttr = new THREE.BufferAttribute(sizes, 1);
  const colorAttr = new THREE.BufferAttribute(colors, 3);
  const alphaAttr = new THREE.BufferAttribute(alphas, 1);

  posAttr.setUsage(THREE.DynamicDrawUsage);
  sizeAttr.setUsage(THREE.DynamicDrawUsage);
  colorAttr.setUsage(THREE.DynamicDrawUsage);
  alphaAttr.setUsage(THREE.DynamicDrawUsage);

  geometry.setAttribute('position', posAttr);
  geometry.setAttribute('aSize', sizeAttr);
  geometry.setAttribute('aColor', colorAttr);
  geometry.setAttribute('aAlpha', alphaAttr);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: texture },
      uPixelRatio: { value: pixelRatio },
    },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute vec3 aColor;
      attribute float aAlpha;
      uniform float uPixelRatio;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = aColor;
        vAlpha = aAlpha;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float dist = max(1.0, -mvPosition.z);
        gl_PointSize = aSize * uPixelRatio * (280.0 / dist);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        if (vAlpha <= 0.002) discard;
        vec4 texel = texture2D(uMap, gl_PointCoord);
        float alpha = texel.a * vAlpha;
        if (alpha <= 0.002) discard;
        gl_FragColor = vec4(vColor * texel.rgb, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 8;

  return {
    capacity,
    cursor: 0,
    positions,
    velocities,
    ages,
    lifetimes,
    startSizes,
    endSizes,
    colors,
    alphas,
    geometry,
    posAttr,
    sizeAttr,
    colorAttr,
    alphaAttr,
    material,
    points,
  };
}

function spawnParticle(
  pool: PoolBuffers,
  px: number,
  py: number,
  pz: number,
  vx: number,
  vy: number,
  vz: number,
  lifetime: number,
  startSize: number,
  endSize: number,
  r: number,
  g: number,
  b: number,
  alpha: number,
): void {
  const idx = pool.cursor;
  pool.cursor = (idx + 1) % pool.capacity;

  const i3 = idx * 3;
  pool.positions[i3] = px;
  pool.positions[i3 + 1] = py;
  pool.positions[i3 + 2] = pz;

  pool.velocities[i3] = vx;
  pool.velocities[i3 + 1] = vy;
  pool.velocities[i3 + 2] = vz;

  pool.ages[idx] = 0;
  pool.lifetimes[idx] = Math.max(0.05, lifetime);
  pool.startSizes[idx] = startSize;
  pool.endSizes[idx] = endSize;
  (pool.sizeAttr.array as Float32Array)[idx] = startSize;

  pool.colors[i3] = r;
  pool.colors[i3 + 1] = g;
  pool.colors[i3 + 2] = b;
  pool.alphas[idx] = alpha;
}

function stepPool(
  pool: PoolBuffers,
  dt: number,
  gravityY: number,
  drag: number,
  baseAlpha: number,
): void {
  const sizes = pool.sizeAttr.array as Float32Array;
  const damp = Math.exp(-drag * dt);

  for (let i = 0; i < pool.capacity; i++) {
    const life = pool.lifetimes[i];
    const age = pool.ages[i];
    if (age >= life) {
      pool.alphas[i] = 0;
      sizes[i] = 0;
      continue;
    }

    const nextAge = age + dt;
    pool.ages[i] = nextAge;
    if (nextAge >= life) {
      pool.alphas[i] = 0;
      sizes[i] = 0;
      continue;
    }

    const i3 = i * 3;
    pool.velocities[i3 + 1] -= gravityY * dt;
    pool.velocities[i3] *= damp;
    pool.velocities[i3 + 1] *= damp;
    pool.velocities[i3 + 2] *= damp;

    pool.positions[i3] += pool.velocities[i3] * dt;
    pool.positions[i3 + 1] += pool.velocities[i3 + 1] * dt;
    pool.positions[i3 + 2] += pool.velocities[i3 + 2] * dt;

    const t = nextAge / life;
    sizes[i] = THREE.MathUtils.lerp(pool.startSizes[i], pool.endSizes[i], t);
    pool.alphas[i] = baseAlpha * (1 - t) * (1 - t * 0.35);
  }

  pool.posAttr.needsUpdate = true;
  pool.sizeAttr.needsUpdate = true;
  pool.colorAttr.needsUpdate = true;
  pool.alphaAttr.needsUpdate = true;
}

export function createParticles(scene: THREE.Scene, quality: QualityLevel): ParticlesSystem {
  const fx = CONFIG.fx;
  const group = new THREE.Group();
  group.name = 'ParticlesGroup';
  scene.add(group);

  const sparkTex = createRadialSpriteTexture(0.28);
  const dustTex = createRadialSpriteTexture(0.45);
  const trailTex = createRadialSpriteTexture(0.32);

  const carScale = CONFIG.car.visualScale;
  let particleScale: number = CONFIG.quality.levels[quality].particleScale;
  const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.quality.levels[quality].pixelRatioMax);

  const sparksPool = createPool(fx.sparks.poolSize, sparkTex, THREE.AdditiveBlending, dpr);
  const dustPool = createPool(fx.dust.poolSize, dustTex, THREE.NormalBlending, dpr);
  const boostPool = createPool(fx.boostTrail.poolSize, trailTex, THREE.AdditiveBlending, dpr);

  group.add(sparksPool.points, dustPool.points, boostPool.points);

  const boostStartColor = new THREE.Color(fx.boostTrail.color);
  const boostEndColor = new THREE.Color(fx.boostTrail.colorEnd);
  const tmpColor = new THREE.Color();
  const tmpPos = new THREE.Vector3();
  const tmpVel = new THREE.Vector3();

  let driftAccum = 0;
  let boostAccum = 0;

  function emitRailHit(
    side: -1 | 1,
    intensity: number,
    worldPos: THREE.Vector3,
    pose?: CarPose,
  ): void {
    const count = Math.max(4, Math.round((8 + intensity * 14) * particleScale));
    for (let i = 0; i < count; i++) {
      const awaySpeed = (3.5 + Math.random() * 8.5) * (0.6 + intensity * 0.7);
      const upSpeed = 2.5 + Math.random() * 6.5;
      const jitterX = (Math.random() - 0.5) * 4.5;
      const jitterZ = (Math.random() - 0.5) * 4.5;

      if (pose) {
        tmpVel
          .copy(pose.right)
          .multiplyScalar(-side * awaySpeed)
          .addScaledVector(pose.up, upSpeed)
          .addScaledVector(pose.tangent, -2.5 + (Math.random() - 0.5) * 3.0);
      } else {
        tmpVel.set(-side * awaySpeed + jitterX, upSpeed, jitterZ);
      }

      const warmMix = Math.random();
      spawnParticle(
        sparksPool,
        worldPos.x + (Math.random() - 0.5) * 0.25,
        worldPos.y + (Math.random() - 0.5) * 0.2,
        worldPos.z + (Math.random() - 0.5) * 0.25,
        tmpVel.x,
        tmpVel.y,
        tmpVel.z,
        fx.sparks.lifetime * (0.65 + Math.random() * 0.5),
        0.52 * carScale,
        0.1 * carScale,
        1.0,
        THREE.MathUtils.lerp(0.55, 0.96, warmMix),
        THREE.MathUtils.lerp(0.12, 0.78, warmMix),
        1.0,
      );
    }
  }

  function emitLanding(impactSpeed: number, position: THREE.Vector3, pose?: CarPose): void {
    const strength = THREE.MathUtils.clamp(impactSpeed / 16, 0.3, 1.3);
    const dustCount = Math.max(4, Math.round(12 * strength * particleScale));
    for (let i = 0; i < dustCount; i++) {
      const ang = (i / dustCount) * Math.PI * 2 + Math.random() * 0.4;
      const radialSpeed = (2.2 + Math.random() * 3.8) * strength;
      const upSpeed = 0.8 + Math.random() * 2.0;

      if (pose) {
        tmpPos
          .copy(position)
          .addScaledVector(pose.right, Math.cos(ang) * 0.85 * carScale)
          .addScaledVector(pose.tangent, Math.sin(ang) * 0.9 * carScale)
          .addScaledVector(pose.up, 0.18 * carScale);
        tmpVel
          .copy(pose.right)
          .multiplyScalar(Math.cos(ang) * radialSpeed)
          .addScaledVector(pose.tangent, Math.sin(ang) * radialSpeed)
          .addScaledVector(pose.up, upSpeed);
      } else {
        tmpPos.set(position.x, position.y + 0.18 * carScale, position.z);
        tmpVel.set(Math.cos(ang) * radialSpeed, upSpeed, Math.sin(ang) * radialSpeed);
      }

      spawnParticle(
        dustPool,
        tmpPos.x,
        tmpPos.y,
        tmpPos.z,
        tmpVel.x,
        tmpVel.y,
        tmpVel.z,
        fx.dust.lifetime * (0.75 + Math.random() * 0.45),
        0.7 * carScale,
        1.95 * carScale,
        0.96,
        0.93,
        0.86,
        0.42,
      );
    }

    if (impactSpeed > 7.5) {
      const sparkCount = Math.max(3, Math.round(7 * strength * particleScale));
      for (let i = 0; i < sparkCount; i++) {
        const ang = Math.random() * Math.PI * 2;
        spawnParticle(
          sparksPool,
          position.x + Math.cos(ang) * 0.6 * carScale,
          position.y + 0.18 * carScale,
          position.z + Math.sin(ang) * 0.6 * carScale,
          Math.cos(ang) * (3 + Math.random() * 4),
          2 + Math.random() * 4,
          Math.sin(ang) * (3 + Math.random() * 4),
          fx.sparks.lifetime * 0.75,
          0.42 * carScale,
          0.08 * carScale,
          1.0,
          0.86,
          0.4,
          0.95,
        );
      }
    }
  }

  function emitBoostBurst(
    position: THREE.Vector3,
    forward: THREE.Vector3,
    right: THREE.Vector3,
    up: THREE.Vector3,
  ): void {
    const count = Math.max(6, Math.round(18 * particleScale));
    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      tmpPos
        .copy(position)
        .addScaledVector(forward, -CONFIG.car.bodyLength * 0.52 * carScale)
        .addScaledVector(right, side * CONFIG.car.bodyWidth * 0.22 * carScale)
        .addScaledVector(up, (CONFIG.car.bodyClearance + 0.1) * carScale);
      tmpVel
        .copy(forward)
        .multiplyScalar(-(9 + Math.random() * 7))
        .addScaledVector(right, (Math.random() - 0.5) * 2.5)
        .addScaledVector(up, (Math.random() - 0.3) * 2.2);

      tmpColor.copy(boostStartColor).lerp(boostEndColor, Math.random() * 0.65);
      spawnParticle(
        boostPool,
        tmpPos.x,
        tmpPos.y,
        tmpPos.z,
        tmpVel.x,
        tmpVel.y,
        tmpVel.z,
        fx.boostTrail.length * (0.85 + Math.random() * 0.4),
        0.85 * carScale,
        0.15 * carScale,
        tmpColor.r,
        tmpColor.g,
        tmpColor.b,
        1.0,
      );
    }
  }

  let latestPose: CarPose | undefined;

  function emit(event: ParticleEventSpec): void {
    if (event.type === 'railHit') {
      emitRailHit(event.side, event.intensity, event.worldPos, latestPose);
    } else if (event.type === 'landed') {
      emitLanding(event.impactSpeed, event.position, latestPose);
    } else if (event.type === 'boost') {
      emitBoostBurst(event.position, event.forward, event.right, event.up);
    }
  }

  function update(dt: number, carPose: CarPose, carState: CarState): void {
    latestPose = carPose;
    if (dt <= 0) {
      return;
    }

    // Continuous drift smoke from rear tires on heavy lateral slip
    const isDrifting =
      carState.mode === 'grounded' &&
      carState.slip > fx.driftSmoke.slipThreshold &&
      Math.abs(carState.vForward) > 6.0;

    if (isDrifting) {
      const slipBoost = THREE.MathUtils.clamp(
        (carState.slip - fx.driftSmoke.slipThreshold) / 0.35,
        0.35,
        1.5,
      );
      driftAccum += dt * fx.driftSmoke.rate * slipBoost * particleScale;
      while (driftAccum >= 1) {
        driftAccum -= 1;
        for (const side of [-1, 1]) {
          tmpPos
            .copy(carPose.position)
            .addScaledVector(carPose.tangent, -CONFIG.car.wheelBaseHalfLength * carScale)
            .addScaledVector(carPose.right, side * CONFIG.car.wheelTrackHalfWidth * carScale)
            .addScaledVector(carPose.up, 0.14 * carScale);
          tmpVel
            .copy(carPose.tangent)
            .multiplyScalar(-1.8 + (Math.random() - 0.5) * 1.4)
            .addScaledVector(carPose.right, (Math.random() - 0.5) * 1.6)
            .addScaledVector(carPose.up, 0.65 + Math.random() * 0.9);

          spawnParticle(
            dustPool,
            tmpPos.x,
            tmpPos.y,
            tmpPos.z,
            tmpVel.x,
            tmpVel.y,
            tmpVel.z,
            fx.dust.lifetime * (0.7 + Math.random() * 0.4),
            0.55 * carScale,
            1.65 * carScale,
            0.96,
            0.94,
            0.88,
            0.34,
          );
        }
      }
    } else {
      driftAccum = 0;
    }

    // Continuous cyan exhaust trail while boost is active
    if (carState.boostTimeLeft > 0) {
      boostAccum += dt * 44 * particleScale;
      while (boostAccum >= 1) {
        boostAccum -= 1;
        for (const side of [-1, 1]) {
          tmpPos
            .copy(carPose.position)
            .addScaledVector(carPose.tangent, -(CONFIG.car.bodyLength * 0.5 + 0.18) * carScale)
            .addScaledVector(carPose.right, side * CONFIG.car.bodyWidth * 0.22 * carScale)
            .addScaledVector(carPose.up, (CONFIG.car.bodyClearance + 0.09) * carScale);
          tmpVel
            .copy(carPose.tangent)
            .multiplyScalar(-(6.5 + Math.random() * 4.5))
            .addScaledVector(carPose.right, (Math.random() - 0.5) * 1.1)
            .addScaledVector(carPose.up, (Math.random() - 0.5) * 0.9);

          tmpColor.copy(boostStartColor).lerp(boostEndColor, Math.random());
          spawnParticle(
            boostPool,
            tmpPos.x,
            tmpPos.y,
            tmpPos.z,
            tmpVel.x,
            tmpVel.y,
            tmpVel.z,
            fx.boostTrail.length * (0.75 + Math.random() * 0.35),
            0.72 * carScale,
            0.12 * carScale,
            tmpColor.r,
            tmpColor.g,
            tmpColor.b,
            0.9,
          );
        }
      }
    } else {
      boostAccum = 0;
    }

    stepPool(sparksPool, dt, fx.sparks.gravity, 1.8, 1.0);
    stepPool(dustPool, dt, -0.35, 2.6, 0.38);
    stepPool(boostPool, dt, 0, 2.2, 0.92);
  }

  function setQuality(level: QualityLevel): void {
    const preset = CONFIG.quality.levels[level];
    particleScale = preset.particleScale;
    const nextDpr = Math.min(window.devicePixelRatio || 1, preset.pixelRatioMax);
    sparksPool.material.uniforms.uPixelRatio.value = nextDpr;
    dustPool.material.uniforms.uPixelRatio.value = nextDpr;
    boostPool.material.uniforms.uPixelRatio.value = nextDpr;
  }

  function clearPool(pool: PoolBuffers): void {
    pool.ages.fill(0);
    pool.lifetimes.fill(0);
    pool.alphas.fill(0);
    pool.alphaAttr.needsUpdate = true;
    pool.cursor = 0;
  }

  function reset(): void {
    driftAccum = 0;
    boostAccum = 0;
    clearPool(sparksPool);
    clearPool(dustPool);
    clearPool(boostPool);
  }

  function dispose(): void {
    scene.remove(group);
    sparkTex.dispose();
    dustTex.dispose();
    trailTex.dispose();
    sparksPool.geometry.dispose();
    sparksPool.material.dispose();
    dustPool.geometry.dispose();
    dustPool.material.dispose();
    boostPool.geometry.dispose();
    boostPool.material.dispose();
  }

  return {
    emit,
    update,
    setQuality,
    reset,
    dispose,
  };
}
