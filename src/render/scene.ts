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

function createSkyDome(): {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;
} {
  const geometry = new THREE.SphereGeometry(960, 32, 24);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uSkyTop: { value: new THREE.Color(CONFIG.visual.skyTop) },
      uSkyHorizon: { value: new THREE.Color(CONFIG.visual.skyHorizon) },
      uGroundBounce: { value: new THREE.Color(CONFIG.props.floorColor.dark) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vLocalDir;
      void main() {
        vLocalDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSkyTop;
      uniform vec3 uSkyHorizon;
      uniform vec3 uGroundBounce;
      varying vec3 vLocalDir;

      void main() {
        float h = vLocalDir.y;
        vec3 color;
        if (h >= 0.0) {
          float t = smoothstep(0.0, 0.55, h);
          color = mix(uSkyHorizon, uSkyTop, pow(t, 0.78));
        } else {
          float g = smoothstep(0.0, 0.28, -h);
          color = mix(uSkyHorizon, uGroundBounce * 0.85, g);
        }
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'SkyDome';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  return { mesh, geometry, material };
}

function createWoodFloorTextures(maxAnisotropy: number): {
  colorMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const size = CONFIG.floor.textureSize;
  const fc = CONFIG.props.floorColor;

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
  const plankShades = [fc.light, fc.mid, fc.dark, fc.mid];

  if (cCtx && rCtx) {
    for (let row = 0; row < plankCount; row++) {
      const y = row * plankHeight;
      const baseColor = plankShades[row % plankShades.length];
      cCtx.fillStyle = baseColor;
      cCtx.fillRect(0, y, size, plankHeight);

      // Subtle warm highlight band near top of each plank for board depth
      cCtx.fillStyle = 'rgba(255, 224, 180, 0.08)';
      cCtx.fillRect(0, y + 2, size, 4);

      const roughBase = 216 + (row % 3) * 12;
      rCtx.fillStyle = `rgb(${roughBase},${roughBase},${roughBase})`;
      rCtx.fillRect(0, y, size, plankHeight);

      // Rich wood grain fibers with higher contrast
      for (let g = 0; g < 32; g++) {
        const gy = y + 3 + ((g * 6 + row * 11) % (plankHeight - 6));
        cCtx.strokeStyle = g % 3 === 0 ? fc.light : CONFIG.colors.woodGrain;
        cCtx.globalAlpha = g % 3 === 0 ? 0.18 : 0.26 + (g % 3) * 0.08;
        cCtx.lineWidth = 1 + (g % 2) * 0.75;
        cCtx.beginPath();
        cCtx.moveTo(0, gy);
        for (let x = 0; x <= size; x += 32) {
          const wave = Math.sin((x / size) * Math.PI * 4 + row * 1.3 + g * 0.7) * 2.4;
          cCtx.lineTo(x, gy + wave);
        }
        cCtx.stroke();

        rCtx.strokeStyle = `rgb(${Math.min(255, roughBase + 22)},${Math.min(255, roughBase + 22)},${Math.min(255, roughBase + 22)})`;
        rCtx.globalAlpha = 0.24;
        rCtx.lineWidth = 1;
        rCtx.beginPath();
        rCtx.moveTo(0, gy);
        rCtx.lineTo(size, gy);
        rCtx.stroke();
      }

      cCtx.globalAlpha = 1;
      rCtx.globalAlpha = 1;

      // Crisp plank seam & end joint
      cCtx.fillStyle = CONFIG.colors.woodSeam;
      cCtx.globalAlpha = 0.85;
      cCtx.fillRect(0, y, size, 2.5);
      cCtx.globalAlpha = 1;

      rCtx.fillStyle = 'rgb(255,255,255)';
      rCtx.fillRect(0, y, size, 2.5);

      const jointX = ((row * 197 + 90) % (size - 40)) + 20;
      cCtx.fillStyle = CONFIG.colors.woodSeam;
      cCtx.globalAlpha = 0.75;
      cCtx.fillRect(jointX, y, 2.5, plankHeight);
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
  const vis = CONFIG.visual;

  const renderer = new THREE.WebGLRenderer({
    antialias: !isSoftwareGl,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = vis.exposure;
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
  scene.background = new THREE.Color(vis.skyHorizon);

  const skyDome = createSkyDome();
  scene.add(skyDome.mesh);

  const activeFog: THREE.Fog | THREE.FogExp2 =
    vis.fogType === 'linear'
      ? new THREE.Fog(vis.fogColor, vis.fogNear, vis.fogFar)
      : new THREE.FogExp2(vis.fogColor, CONFIG.lighting.fogDensity);
  scene.fog = activeFog;

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const roomEnvironment = new RoomEnvironment();
  const envRenderTarget = pmremGenerator.fromScene(roomEnvironment, CONFIG.renderer.envBlur);
  scene.environment = envRenderTarget.texture;
  scene.environmentIntensity = vis.envIntensity;
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

  const sunLight = new THREE.DirectionalLight(vis.sunColor, vis.sunIntensity);
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
    vis.hemisphereSkyColor,
    vis.hemisphereGroundColor,
    vis.hemisphereIntensity,
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

  // Visual debug keys (F3 fog, F4 bloom, [ / ] exposure) & compact bottom-center status badge
  let fogEnabled = true;
  let bloomDebugEnabled = true;
  let currentExposure: number = vis.exposure;
  scene.userData.visualDebugBloomEnabled = bloomDebugEnabled;

  let debugPanel: HTMLDivElement | null = null;
  const updateVisualDebugOverlay = (): void => {
    if (!debugPanel) return;
    const fogLabel = fogEnabled ? `ON (${vis.fogNear}-${vis.fogFar}m)` : 'OFF';
    const bloomLabel = bloomDebugEnabled ? 'ON' : 'OFF';
    debugPanel.textContent =
      `FOG [F3]: ${fogLabel} | BLOOM [F4]: ${bloomLabel} | EXP [[ / ]]: ${currentExposure.toFixed(2)}`;
  };

  const handleDebugKeyDown = (event: KeyboardEvent): void => {
    if (!vis.debugKeys) return;
    if (event.code === 'F3') {
      event.preventDefault();
      fogEnabled = !fogEnabled;
      scene.fog = fogEnabled ? activeFog : null;
      updateVisualDebugOverlay();
    } else if (event.code === 'F4') {
      event.preventDefault();
      bloomDebugEnabled = !bloomDebugEnabled;
      scene.userData.visualDebugBloomEnabled = bloomDebugEnabled;
      updateVisualDebugOverlay();
    } else if (event.code === 'BracketLeft') {
      currentExposure = THREE.MathUtils.clamp(
        Math.round((currentExposure - 0.05) * 100) / 100,
        0.2,
        2.5,
      );
      renderer.toneMappingExposure = currentExposure;
      updateVisualDebugOverlay();
    } else if (event.code === 'BracketRight') {
      currentExposure = THREE.MathUtils.clamp(
        Math.round((currentExposure + 0.05) * 100) / 100,
        0.2,
        2.5,
      );
      renderer.toneMappingExposure = currentExposure;
      updateVisualDebugOverlay();
    }
  };

  if (vis.debugKeys) {
    debugPanel = document.createElement('div');
    debugPanel.style.position = 'fixed';
    debugPanel.style.bottom = '12px';
    debugPanel.style.left = '50%';
    debugPanel.style.transform = 'translateX(-50%)';
    debugPanel.style.padding = '5px 10px';
    debugPanel.style.borderRadius = '6px';
    debugPanel.style.background = 'rgba(15, 23, 42, 0.78)';
    debugPanel.style.color = '#FFD23F';
    debugPanel.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace';
    debugPanel.style.fontSize = '11px';
    debugPanel.style.fontWeight = '700';
    debugPanel.style.letterSpacing = '0.03em';
    debugPanel.style.pointerEvents = 'none';
    debugPanel.style.userSelect = 'none';
    debugPanel.style.whiteSpace = 'nowrap';
    debugPanel.style.zIndex = '30';
    container.appendChild(debugPanel);
    updateVisualDebugOverlay();
    window.addEventListener('keydown', handleDebugKeyDown);
  }

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
    skyDome.mesh.position.set(target.x, 0, target.z);
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
    if (vis.debugKeys) {
      window.removeEventListener('keydown', handleDebugKeyDown);
    }
    if (debugPanel && debugPanel.parentElement === container) {
      container.removeChild(debugPanel);
    }
    disposeObjectResources(scene);
    skyDome.geometry.dispose();
    skyDome.material.dispose();
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
