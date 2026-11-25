// src/render/scene.ts

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CONFIG } from '../config';
import type { QualityLevel } from './quality';

export interface SceneContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  isSoftwareGl: boolean;
  maxAnisotropy: number;
  setOrbitTarget: (target: THREE.Vector3, radius: number, height: number) => void;
  setCameraOrbitAngle: (angleRad: number) => void;
  updateSunShadowTarget: (focusPos: THREE.Vector3) => void;
  setQuality: (level: QualityLevel) => void;
  getViewportSize: () => { width: number; height: number };
  dispose: () => void;
}

function detectSoftwareWebGL(): boolean {
  const probeCanvas = document.createElement('canvas');
  const gl = probeCanvas.getContext('webgl2');
  if (!gl) {
    return true;
  }
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

function createSkyGradientTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, CONFIG.colors.skyTop);
    gradient.addColorStop(0.62, CONFIG.colors.skyHorizon);
    gradient.addColorStop(1, CONFIG.colors.skyHorizon);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createWoodFloorTextures(maxAnisotropy: number): {
  colorMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const size = CONFIG.floor.textureSize;

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const cCtx = colorCanvas.getContext('2d');

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rCtx = roughCanvas.getContext('2d');

  const plankCount = 8;
  const plankHeight = size / plankCount;

  if (cCtx && rCtx) {
    for (let row = 0; row < plankCount; row++) {
      const y = row * plankHeight;
      const isAlt = row % 2 === 1;
      cCtx.fillStyle = isAlt ? CONFIG.colors.woodPlankAlt : CONFIG.colors.woodBase;
      cCtx.fillRect(0, y, size, plankHeight);

      const roughBase = isAlt ? 195 : 175;
      rCtx.fillStyle = `rgb(${roughBase},${roughBase},${roughBase})`;
      rCtx.fillRect(0, y, size, plankHeight);

      for (let g = 0; g < 26; g++) {
        const gy = y + 3 + ((g * 7 + row * 11) % (plankHeight - 6));
        cCtx.strokeStyle = CONFIG.colors.woodGrain;
        cCtx.globalAlpha = 0.14 + (g % 3) * 0.05;
        cCtx.lineWidth = 1 + (g % 2);
        cCtx.beginPath();
        cCtx.moveTo(0, gy);
        for (let x = 0; x <= size; x += 32) {
          const wave = Math.sin((x / size) * Math.PI * 4 + row * 1.3 + g * 0.7) * 2.2;
          cCtx.lineTo(x, gy + wave);
        }
        cCtx.stroke();

        rCtx.strokeStyle = `rgb(${roughBase + 25},${roughBase + 25},${roughBase + 25})`;
        rCtx.globalAlpha = 0.2;
        rCtx.lineWidth = 1;
        rCtx.beginPath();
        rCtx.moveTo(0, gy);
        rCtx.lineTo(size, gy);
        rCtx.stroke();
      }

      cCtx.globalAlpha = 1;
      rCtx.globalAlpha = 1;

      cCtx.fillStyle = CONFIG.colors.woodSeam;
      cCtx.globalAlpha = 0.55;
      cCtx.fillRect(0, y, size, 2);
      cCtx.globalAlpha = 1;

      rCtx.fillStyle = 'rgb(235,235,235)';
      rCtx.fillRect(0, y, size, 2);

      const jointX = ((row * 197 + 90) % (size - 40)) + 20;
      cCtx.fillStyle = CONFIG.colors.woodSeam;
      cCtx.globalAlpha = 0.45;
      cCtx.fillRect(jointX, y, 2, plankHeight);
      cCtx.globalAlpha = 1;
    }
  }

  const repeat = CONFIG.floor.textureRepeat;

  const colorMap = new THREE.CanvasTexture(colorCanvas);
  colorMap.colorSpace = THREE.SRGBColorSpace;
  colorMap.wrapS = THREE.RepeatWrapping;
  colorMap.wrapT = THREE.RepeatWrapping;
  colorMap.repeat.set(repeat, repeat);
  colorMap.anisotropy = maxAnisotropy;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(repeat, repeat);
  roughnessMap.anisotropy = maxAnisotropy;

  return { colorMap, roughnessMap };
}

function disposeObjectResources(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();

  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
      geometries.add(obj.geometry);
      const matList = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of matList) {
        materials.add(mat);
        if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
          if (mat.map) textures.add(mat.map);
          if (mat.roughnessMap) textures.add(mat.roughnessMap);
        }
      }
    }
  });

  geometries.forEach((g) => g.dispose());
  textures.forEach((t) => t.dispose());
  materials.forEach((m) => m.dispose());
}

export function createSceneContext(container: HTMLElement): SceneContext {
  const isSoftwareGl = detectSoftwareWebGL();

  const renderer = new THREE.WebGLRenderer({
    antialias: !isSoftwareGl,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = CONFIG.renderer.toneMappingExposure;
  renderer.setPixelRatio(
    isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, CONFIG.renderer.maxPixelRatio),
  );
  renderer.setSize(
    container.clientWidth || window.innerWidth,
    container.clientHeight || window.innerHeight,
  );
  renderer.shadowMap.enabled = !isSoftwareGl;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const skyTexture = createSkyGradientTexture();
  scene.background = skyTexture;
  scene.fog = new THREE.FogExp2(CONFIG.colors.skyFogHex, CONFIG.lighting.fogDensity);

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const roomEnvironment = new RoomEnvironment();
  const envRenderTarget = pmremGenerator.fromScene(roomEnvironment, CONFIG.renderer.envBlur);
  scene.environment = envRenderTarget.texture;
  scene.environmentIntensity = CONFIG.renderer.envIntensity;
  roomEnvironment.dispose();
  pmremGenerator.dispose();

  const aspect =
    (container.clientWidth || window.innerWidth) /
    (container.clientHeight || window.innerHeight);
  const camera = new THREE.PerspectiveCamera(
    CONFIG.camera.fovBase,
    aspect,
    CONFIG.camera.near,
    CONFIG.camera.far,
  );

  const sunOffsetVec = new THREE.Vector3(
    CONFIG.lighting.sunOffset.x,
    CONFIG.lighting.sunOffset.y,
    CONFIG.lighting.sunOffset.z,
  );
  const sunDir = sunOffsetVec.clone().normalize();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const sunRight = new THREE.Vector3().crossVectors(worldUp, sunDir).normalize();
  const sunUp = new THREE.Vector3().crossVectors(sunDir, sunRight).normalize();
  const snappedTarget = new THREE.Vector3();

  let currentPixelRatioMax: number = CONFIG.renderer.maxPixelRatio;
  let currentShadowMapSize: number = CONFIG.renderer.shadowMapSize;
  let currentShadowFollowRadius: number = CONFIG.lighting.sunShadowExtent;

  const sunLight = new THREE.DirectionalLight(
    CONFIG.colors.sunLightHex,
    CONFIG.lighting.sunIntensity,
  );
  sunLight.position.copy(sunOffsetVec);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(currentShadowMapSize, currentShadowMapSize);
  sunLight.shadow.camera.left = -currentShadowFollowRadius;
  sunLight.shadow.camera.right = currentShadowFollowRadius;
  sunLight.shadow.camera.top = currentShadowFollowRadius;
  sunLight.shadow.camera.bottom = -currentShadowFollowRadius;
  sunLight.shadow.camera.near = CONFIG.lighting.sunShadowNear;
  sunLight.shadow.camera.far = CONFIG.lighting.sunShadowFar;
  sunLight.shadow.bias = CONFIG.lighting.sunShadowBias;
  sunLight.shadow.normalBias = CONFIG.lighting.sunShadowNormalBias;
  sunLight.shadow.radius = CONFIG.lighting.sunShadowRadius;
  scene.add(sunLight);
  scene.add(sunLight.target);

  const hemiLight = new THREE.HemisphereLight(
    CONFIG.colors.hemiSkyHex,
    CONFIG.colors.hemiGroundHex,
    CONFIG.lighting.hemiIntensity,
  );
  hemiLight.position.set(0, 120, 0);
  scene.add(hemiLight);

  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

  const { colorMap: woodColorMap, roughnessMap: woodRoughnessMap } =
    createWoodFloorTextures(maxAnisotropy);
  const floorGeometry = new THREE.PlaneGeometry(CONFIG.floor.size, CONFIG.floor.size);
  floorGeometry.rotateX(-Math.PI / 2);
  const floorMaterial = new THREE.MeshStandardMaterial({
    map: woodColorMap,
    roughnessMap: woodRoughnessMap,
    roughness: CONFIG.floor.roughness,
    metalness: CONFIG.floor.metalness,
  });
  const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
  floorMesh.receiveShadow = true;
  scene.add(floorMesh);

  const orbitTarget = new THREE.Vector3(0, 6, 0);
  let orbitRadius: number = CONFIG.camera.orbitMinRadius;
  let orbitHeight: number = CONFIG.camera.orbitHeight;

  function updateSunShadowTarget(focusPos: THREE.Vector3): void {
    const texelSize = (currentShadowFollowRadius * 2) / Math.max(1, currentShadowMapSize);
    const projX = focusPos.dot(sunRight);
    const projY = focusPos.dot(sunUp);
    const projZ = focusPos.dot(sunDir);

    const snappedX = Math.round(projX / texelSize) * texelSize;
    const snappedY = Math.round(projY / texelSize) * texelSize;

    snappedTarget
      .set(0, 0, 0)
      .addScaledVector(sunRight, snappedX)
      .addScaledVector(sunUp, snappedY)
      .addScaledVector(sunDir, projZ);

    sunLight.target.position.copy(snappedTarget);
    sunLight.position.copy(snappedTarget).add(sunOffsetVec);
    sunLight.target.updateMatrixWorld();
  }

  function setOrbitTarget(target: THREE.Vector3, radius: number, height: number): void {
    orbitTarget.copy(target);
    orbitRadius = radius;
    orbitHeight = height;

    floorMesh.position.set(target.x, 0, target.z);
    updateSunShadowTarget(target);
  }

  function setCameraOrbitAngle(angleRad: number): void {
    camera.up.set(0, 1, 0);
    camera.position.set(
      orbitTarget.x + Math.cos(angleRad) * orbitRadius,
      orbitTarget.y + orbitHeight,
      orbitTarget.z + Math.sin(angleRad) * orbitRadius,
    );
    camera.lookAt(orbitTarget);
  }

  setCameraOrbitAngle(0);

  function setQuality(level: QualityLevel): void {
    const preset = CONFIG.quality.levels[level];
    currentPixelRatioMax = preset.pixelRatioMax;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, currentPixelRatioMax),
    );

    let frustumChanged = false;
    if (currentShadowFollowRadius !== preset.shadowFollowRadius) {
      currentShadowFollowRadius = preset.shadowFollowRadius;
      sunLight.shadow.camera.left = -currentShadowFollowRadius;
      sunLight.shadow.camera.right = currentShadowFollowRadius;
      sunLight.shadow.camera.top = currentShadowFollowRadius;
      sunLight.shadow.camera.bottom = -currentShadowFollowRadius;
      frustumChanged = true;
    }

    if (currentShadowMapSize !== preset.shadowMapSize) {
      currentShadowMapSize = preset.shadowMapSize;
      sunLight.shadow.mapSize.set(currentShadowMapSize, currentShadowMapSize);
      if (sunLight.shadow.map) {
        sunLight.shadow.map.dispose();
        sunLight.shadow.map = null;
      }
      frustumChanged = true;
    }

    if (frustumChanged) {
      sunLight.shadow.camera.updateProjectionMatrix();
    }
  }

  function getViewportSize(): { width: number; height: number } {
    return {
      width: container.clientWidth || window.innerWidth,
      height: container.clientHeight || window.innerHeight,
    };
  }

  function handleResize(): void {
    const { width, height } = getViewportSize();
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, currentPixelRatioMax),
    );
  }

  window.addEventListener('resize', handleResize);

  function dispose(): void {
    window.removeEventListener('resize', handleResize);
    disposeObjectResources(scene);
    skyTexture.dispose();
    envRenderTarget.dispose();
    renderer.dispose();

    if (renderer.domElement.parentElement === container) {
      container.removeChild(renderer.domElement);
    }
  }

  return {
    renderer,
    scene,
    camera,
    isSoftwareGl,
    maxAnisotropy,
    setOrbitTarget,
    setCameraOrbitAngle,
    updateSunShadowTarget,
    setQuality,
    getViewportSize,
    dispose,
  };
}
