// src/render/postfx.ts

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
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

const ColorGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSaturation: { value: CONFIG.visual.grade.saturation },
    uContrast: { value: CONFIG.visual.grade.contrast },
    uVignette: { value: CONFIG.visual.grade.vignette },
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
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uVignette;
    varying vec2 vUv;

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      vec3 rgb = max(base.rgb, vec3(0.0));

      // Saturation in linear space
      float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
      rgb = max(vec3(0.0), mix(vec3(luma), rgb, uSaturation));

      // Gentle contrast pivot around linear mid-gray (0.18) without crushing blacks or clipping HDR
      rgb = pow(max(rgb / 0.18, vec3(0.0)), vec3(uContrast)) * 0.18;

      // Subtle radial vignette
      vec2 centered = vUv - 0.5;
      float vigDist = dot(centered, centered) * 2.0;
      float vigFactor = 1.0 - clamp(vigDist * uVignette, 0.0, 0.45);
      rgb *= vigFactor;

      gl_FragColor = vec4(rgb, base.a);
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
  const isWebGL2 = renderer.capabilities.isWebGL2;
  let currentWidth = renderer.domElement.clientWidth || window.innerWidth || 1280;
  let currentHeight = renderer.domElement.clientHeight || window.innerHeight || 720;

  const getDesiredSamples = (level: QualityLevel): number => {
    if (isSoftwareGl || !isWebGL2) {
      return 0;
    }
    return CONFIG.render.antialias.composerSamples[level];
  };

  const getPixelRatioForLevel = (level: QualityLevel): number => {
    if (isSoftwareGl) {
      return 1;
    }
    return Math.min(window.devicePixelRatio || 1, CONFIG.quality.levels[level].pixelRatioMax);
  };

  let currentSamples = getDesiredSamples(quality);
  let currentPixelRatio = getPixelRatioForLevel(quality);

  const createComposerTarget = (w: number, h: number, pr: number, samples: number): THREE.WebGLRenderTarget =>
    new THREE.WebGLRenderTarget(Math.max(1, Math.round(w * pr)), Math.max(1, Math.round(h * pr)), {
      type: THREE.HalfFloatType,
      samples,
    });

  const initialTarget = createComposerTarget(currentWidth, currentHeight, currentPixelRatio, currentSamples);
  const composer = new EffectComposer(renderer, initialTarget);
  composer.setPixelRatio(currentPixelRatio);
  composer.setSize(currentWidth, currentHeight);

  // Pass chain order preserved identically so ACES + sRGB output color stays consistent
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(currentWidth, currentHeight),
    CONFIG.fx.bloom.strength,
    CONFIG.fx.bloom.radius,
    CONFIG.fx.bloom.threshold,
  );
  composer.addPass(bloomPass);

  const speedLinesPass = new ShaderPass(SpeedLinesShader);
  speedLinesPass.uniforms.uAspect.value = currentWidth / Math.max(1, currentHeight);
  composer.addPass(speedLinesPass);

  const colorGradePass = new ShaderPass(ColorGradeShader);
  composer.addPass(colorGradePass);

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  // Lightweight FXAA in sRGB space after OutputPass when composer runs without MSAA samples (e.g. WebGL1)
  const fxaaPass = new ShaderPass(FXAAShader);
  composer.addPass(fxaaPass);

  let bloomEnabled = false;
  let speedLinesEnabled = false;
  let colorGradeEnabled = false;
  let fxaaEnabled = false;
  let targetIntensity = 0;
  let currentIntensity = 0;
  let elapsed = 0;

  const updateFxaaResolution = (): void => {
    const res = fxaaPass.uniforms.resolution?.value as THREE.Vector2 | undefined;
    if (res) {
      res.set(
        1 / Math.max(1, currentWidth * currentPixelRatio),
        1 / Math.max(1, currentHeight * currentPixelRatio),
      );
    }
  };

  function setQuality(level: QualityLevel): void {
    const preset = CONFIG.quality.levels[level];
    const nextSamples = getDesiredSamples(level);
    currentPixelRatio = getPixelRatioForLevel(level);

    if (nextSamples !== currentSamples) {
      currentSamples = nextSamples;
      const nextTarget = createComposerTarget(
        currentWidth,
        currentHeight,
        currentPixelRatio,
        currentSamples,
      );
      composer.reset(nextTarget);
    }

    bloomEnabled = !isSoftwareGl && preset.bloomEnabled;
    speedLinesEnabled = !isSoftwareGl && preset.speedLinesEnabled;
    colorGradeEnabled = !isSoftwareGl && level !== 'low';
    fxaaEnabled = !isSoftwareGl && currentSamples === 0;

    bloomPass.enabled = bloomEnabled && scene.userData.visualDebugBloomEnabled !== false;
    speedLinesPass.enabled = speedLinesEnabled;
    colorGradePass.enabled = colorGradeEnabled;
    fxaaPass.enabled = fxaaEnabled;

    composer.setPixelRatio(currentPixelRatio);
    composer.setSize(currentWidth, currentHeight);
    updateFxaaResolution();
  }

  function setSpeedIntensity(intensity: number): void {
    targetIntensity = THREE.MathUtils.clamp(intensity, 0, 1);
  }

  function resize(width: number, height: number): void {
    currentWidth = Math.max(1, width);
    currentHeight = Math.max(1, height);
    composer.setSize(currentWidth, currentHeight);
    bloomPass.resolution.set(currentWidth, currentHeight);
    speedLinesPass.uniforms.uAspect.value = currentWidth / currentHeight;
    updateFxaaResolution();
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

    const effectiveBloom = bloomEnabled && scene.userData.visualDebugBloomEnabled !== false;
    bloomPass.enabled = effectiveBloom;

    const needsComposer = effectiveBloom || speedLinesEnabled || colorGradeEnabled || !isWebGL2;
    if (isSoftwareGl || !needsComposer) {
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
    colorGradePass.dispose();
    outputPass.dispose();
    fxaaPass.dispose();
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
