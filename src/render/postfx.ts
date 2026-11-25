// src/render/postfx.ts

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { CONFIG } from '../config';
import type { QualityLevel } from './quality';

export interface PostFxHandle {
  render: (dt: number) => void;
  resize: (width: number, height: number) => void;
  setQuality: (level: QualityLevel) => void;
  setSpeedIntensity: (intensity: number) => void;
  dispose: () => void;
}

const SpeedLinesShader = {
  uniforms: {
    tDiffuse: { value: null },
    uIntensity: { value: 0 },
    uTime: { value: 0 },
    uAspect: { value: 1.77 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uIntensity;
    uniform float uTime;
    uniform float uAspect;
    varying vec2 vUv;

    float hash11(float p) {
      p = fract(p * 0.1031);
      p *= p + 33.33;
      p *= p + p;
      return fract(p);
    }

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      if (uIntensity <= 0.004) {
        gl_FragColor = base;
        return;
      }

      vec2 centered = (vUv - 0.5) * vec2(uAspect, 1.0);
      float dist = length(centered);
      float angle = atan(centered.y, centered.x);

      // Angular sectors for crisp radial streaks at screen perimeter
      float sectorScale = 46.0;
      float sectorId = floor((angle + 3.14159265) * sectorScale);
      float sectorFrac = fract((angle + 3.14159265) * sectorScale);

      float randSeed = hash11(sectorId + floor(uTime * 16.0) * 19.37);
      float streakMask = step(0.62, randSeed);
      float lineWidth = smoothstep(0.16, 0.5, sectorFrac) * smoothstep(0.84, 0.5, sectorFrac);

      float radialStart = mix(0.42, 0.58, hash11(sectorId * 3.17));
      float radialFade = smoothstep(radialStart, 0.88, dist);

      float streak = streakMask * lineWidth * radialFade * uIntensity;
      vec3 streakTint = vec3(0.86, 0.96, 1.0);
      vec3 finalRgb = base.rgb + streakTint * streak * 0.55;

      gl_FragColor = vec4(finalRgb, base.a);
    }
  `,
};

export function createPostFx(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  quality: QualityLevel,
  isSoftwareGl = false,
): PostFxHandle {
  const initialW = renderer.domElement.clientWidth || window.innerWidth || 1280;
  const initialH = renderer.domElement.clientHeight || window.innerHeight || 720;

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(
    isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, CONFIG.quality.levels[quality].pixelRatioMax),
  );
  composer.setSize(initialW, initialH);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(initialW, initialH),
    CONFIG.fx.bloom.strength,
    CONFIG.fx.bloom.radius,
    CONFIG.fx.bloom.threshold,
  );
  composer.addPass(bloomPass);

  const speedLinesPass = new ShaderPass(SpeedLinesShader);
  speedLinesPass.uniforms.uAspect.value = initialW / Math.max(1, initialH);
  composer.addPass(speedLinesPass);

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  let bloomEnabled = false;
  let speedLinesEnabled = false;
  let targetIntensity = 0;
  let currentIntensity = 0;
  let elapsed = 0;

  function setQuality(level: QualityLevel): void {
    const preset = CONFIG.quality.levels[level];
    bloomEnabled = !isSoftwareGl && preset.bloomEnabled;
    speedLinesEnabled = !isSoftwareGl && preset.speedLinesEnabled;

    bloomPass.enabled = bloomEnabled;
    speedLinesPass.enabled = speedLinesEnabled;

    composer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, preset.pixelRatioMax),
    );
  }

  function setSpeedIntensity(intensity: number): void {
    targetIntensity = THREE.MathUtils.clamp(intensity, 0, 1);
  }

  function resize(width: number, height: number): void {
    const safeW = Math.max(1, width);
    const safeH = Math.max(1, height);
    composer.setSize(safeW, safeH);
    bloomPass.resolution.set(safeW, safeH);
    speedLinesPass.uniforms.uAspect.value = safeW / safeH;
  }

  function render(dt: number): void {
    elapsed += Math.max(0, dt);
    const smoothRate = 1 / Math.max(0.02, CONFIG.fx.speedLines.smoothTime);
    currentIntensity = THREE.MathUtils.damp(
      currentIntensity,
      targetIntensity,
      smoothRate,
      Math.max(dt, 1 / 120),
    );

    if (isSoftwareGl || (!bloomEnabled && !speedLinesEnabled)) {
      renderer.render(scene, camera);
      return;
    }

    speedLinesPass.uniforms.uIntensity.value = speedLinesEnabled ? currentIntensity : 0;
    speedLinesPass.uniforms.uTime.value = elapsed;
    composer.render();
  }

  function dispose(): void {
    bloomPass.dispose();
    speedLinesPass.dispose();
    outputPass.dispose();
    composer.dispose();
  }

  setQuality(quality);

  return {
    render,
    resize,
    setQuality,
    setSpeedIntensity,
    dispose,
  };
}
