// src/render/scene.ts

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CONFIG, type VisualPreset, type VisualPresetName } from '../config';
import type { CourseBounds } from '../core/course';
import type { QualityLevel } from './quality';

export interface RoomDimensions {
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
  height: number;
}

export interface SceneContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  isSoftwareGl: boolean;
  maxAnisotropy: number;
  setRoomBounds: (bounds: CourseBounds) => void;
  setOrbitTarget: (target: THREE.Vector3, radius: number, height: number) => void;
  setCameraOrbitAngle: (angleRad: number) => void;
  updateSunShadowTarget: (focusPos: THREE.Vector3) => void;
  setQuality: (level: QualityLevel) => void;
  applyPalette: (name: VisualPresetName) => void;
  getViewportSize: () => { width: number; height: number };
  dispose: () => void;
}

export function computeRoomDimensions(bounds: CourseBounds): RoomDimensions {
  const margin = CONFIG.props.roomMargin;
  const width = Math.max(
    CONFIG.props.roomSize.width,
    Math.ceil((bounds.max.x - bounds.min.x + margin * 2) / 20) * 20,
  );
  const depth = Math.max(
    CONFIG.props.roomSize.depth,
    Math.ceil((bounds.max.z - bounds.min.z + margin * 2) / 20) * 20,
  );
  const height = Math.max(CONFIG.props.roomSize.height, Math.ceil(bounds.max.y + 115));
  return {
    centerX: bounds.center.x,
    centerZ: bounds.center.z,
    width,
    depth,
    height,
  };
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

function makeNonIndexedNormalized(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  if (!nonIndexed.getAttribute('normal')) {
    nonIndexed.computeVertexNormals();
  }
  if (!nonIndexed.getAttribute('uv')) {
    const pos = nonIndexed.getAttribute('position');
    nonIndexed.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
  }
  return nonIndexed;
}

function mergeRoomGeoms(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const prepared = geoms.map((g) => makeNonIndexedNormalized(g));
  const merged = mergeGeometries(prepared, false);
  for (const g of geoms) g.dispose();
  for (const g of prepared) g.dispose();
  return merged ?? new THREE.BoxGeometry(1, 1, 1);
}

function createSkyDome(preset: VisualPreset): {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;
} {
  const radius = Math.min(580, CONFIG.render.viewDistance * 0.8);
  const geometry = new THREE.SphereGeometry(radius, 32, 24);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uSkyTop: { value: new THREE.Color(preset.skyTop) },
      uSkyHorizon: { value: new THREE.Color(preset.skyHorizon) },
      uGroundBounce: { value: new THREE.Color(preset.room.floorColor.dark) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vLocalDir;
      void main() {
        vLocalDir = normalize(position);
        vec4 clipPos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        clipPos.z = clipPos.w * 0.9999;
        gl_Position = clipPos;
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
    depthTest: false,
    fog: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'SkyDome';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  return { mesh, geometry, material };
}

function createWoodFloorTextures(
  maxAnisotropy: number,
  preset: VisualPreset,
  repeatX: number = CONFIG.floor.textureRepeat,
  repeatZ: number = CONFIG.floor.textureRepeat,
): {
  colorMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const size = CONFIG.floor.textureSize;
  const fc = preset.room.floorColor;

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

      cCtx.fillStyle = 'rgba(255, 214, 165, 0.06)';
      cCtx.fillRect(0, y + 2, size, 3);

      const roughBase = 212 + (row % 3) * 14;
      rCtx.fillStyle = `rgb(${roughBase},${roughBase},${roughBase})`;
      rCtx.fillRect(0, y, size, plankHeight);

      for (let g = 0; g < 36; g++) {
        const gy = y + 3 + ((g * 6 + row * 11) % (plankHeight - 6));
        cCtx.strokeStyle = g % 4 === 0 ? fc.light : preset.colors.woodGrain;
        cCtx.globalAlpha = g % 4 === 0 ? 0.24 : 0.36 + (g % 3) * 0.1;
        cCtx.lineWidth = 1.1 + (g % 2) * 0.85;
        cCtx.beginPath();
        cCtx.moveTo(0, gy);
        for (let x = 0; x <= size; x += 32) {
          const wave = Math.sin((x / size) * Math.PI * 4 + row * 1.3 + g * 0.7) * 2.6;
          cCtx.lineTo(x, gy + wave);
        }
        cCtx.stroke();

        rCtx.strokeStyle = `rgb(${Math.min(255, roughBase + 26)},${Math.min(255, roughBase + 26)},${Math.min(255, roughBase + 26)})`;
        rCtx.globalAlpha = 0.28;
        rCtx.lineWidth = 1;
        rCtx.beginPath();
        rCtx.moveTo(0, gy);
        rCtx.lineTo(size, gy);
        rCtx.stroke();
      }

      cCtx.globalAlpha = 1;
      rCtx.globalAlpha = 1;

      cCtx.fillStyle = preset.colors.woodSeam;
      cCtx.globalAlpha = 0.92;
      cCtx.fillRect(0, y, size, 3);
      cCtx.globalAlpha = 1;

      rCtx.fillStyle = 'rgb(255,255,255)';
      rCtx.fillRect(0, y, size, 3);

      const jointX = ((row * 197 + 90) % (size - 40)) + 20;
      cCtx.fillStyle = preset.colors.woodSeam;
      cCtx.globalAlpha = 0.85;
      cCtx.fillRect(jointX, y, 3, plankHeight);
      cCtx.globalAlpha = 1;
    }
  }

  const colorMap = new THREE.CanvasTexture(colorCanvas);
  colorMap.colorSpace = THREE.SRGBColorSpace;
  colorMap.wrapS = THREE.RepeatWrapping;
  colorMap.wrapT = THREE.RepeatWrapping;
  colorMap.repeat.set(repeatX, repeatZ);
  colorMap.anisotropy = maxAnisotropy;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(repeatX, repeatZ);
  roughnessMap.anisotropy = maxAnisotropy;

  return { colorMap, roughnessMap };
}

function createWallTexture(
  baseHex: string,
  stripeHex: string,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const width = 512;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = baseHex;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = stripeHex;
    ctx.globalAlpha = 0.36;
    const stripeCount = 24;
    const stripeW = width / (stripeCount * 2);
    for (let i = 0; i < stripeCount; i++) {
      ctx.fillRect(i * stripeW * 2, 0, stripeW, height);
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = 'rgba(15, 42, 58, 0.045)';
    for (let y = 0; y < height; y += 8) {
      ctx.fillRect(0, y, width, 1);
    }

    // Atmospheric wall gradient: darker near floor & corners for depth without white clipping
    const topGrad = ctx.createLinearGradient(0, 0, 0, height * 0.24);
    topGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.1)');
    topGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, width, height * 0.24);

    const bottomGrad = ctx.createLinearGradient(0, height * 0.48, 0, height);
    bottomGrad.addColorStop(0.0, 'rgba(8, 22, 36, 0.0)');
    bottomGrad.addColorStop(1.0, 'rgba(8, 22, 36, 0.34)');
    ctx.fillStyle = bottomGrad;
    ctx.fillRect(0, height * 0.48, width, height * 0.52);

    const leftGrad = ctx.createLinearGradient(0, 0, width * 0.16, 0);
    leftGrad.addColorStop(0.0, 'rgba(8, 22, 36, 0.32)');
    leftGrad.addColorStop(1.0, 'rgba(8, 22, 36, 0.0)');
    ctx.fillStyle = leftGrad;
    ctx.fillRect(0, 0, width * 0.16, height);

    const rightGrad = ctx.createLinearGradient(width * 0.84, 0, width, 0);
    rightGrad.addColorStop(0.0, 'rgba(8, 22, 36, 0.0)');
    rightGrad.addColorStop(1.0, 'rgba(8, 22, 36, 0.32)');
    ctx.fillStyle = rightGrad;
    ctx.fillRect(width * 0.84, 0, width * 0.16, height);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createCeilingTexture(
  maxAnisotropy: number,
  preset: VisualPreset,
  repeatX = 4,
  repeatZ = 4,
): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = preset.room.ceilingColor;
    ctx.fillRect(0, 0, size, size);

    // Subtle coffered ceiling grid & airy skylight panels
    ctx.strokeStyle = 'rgba(110, 148, 190, 0.36)';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, size - 10, size - 10);

    const inset = 54;
    ctx.fillStyle = preset.room.ceilingSkylightColor;
    ctx.globalAlpha = 0.45;
    ctx.fillRect(inset, inset, size - inset * 2, size - inset * 2);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
    ctx.lineWidth = 6;
    ctx.strokeRect(inset, inset, size - inset * 2, size - inset * 2);

    ctx.beginPath();
    ctx.moveTo(size * 0.5, inset);
    ctx.lineTo(size * 0.5, size - inset);
    ctx.moveTo(inset, size * 0.5);
    ctx.lineTo(size - inset, size * 0.5);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatZ);
  tex.anisotropy = maxAnisotropy;
  return tex;
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
  let activePresetName: VisualPresetName = vis.activePreset;
  let activePreset: VisualPreset = vis.presets[activePresetName];

  const renderer = new THREE.WebGLRenderer({
    antialias: !isSoftwareGl,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = activePreset.exposure;
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

  const maxAnisotropy = Math.min(
    renderer.capabilities.getMaxAnisotropy(),
    CONFIG.render.anisotropyMax,
  );

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(activePreset.skyHorizon);

  const skyDome = createSkyDome(activePreset);
  scene.add(skyDome.mesh);

  // Default path: scene.fog = null unless visual.fogEnabled === true (no FogExp2/Fog by default)
  let debugFog: THREE.Fog | null = null;
  const ensureDebugFog = (): THREE.Fog => {
    if (!debugFog) {
      debugFog = new THREE.Fog(activePreset.fogColor, vis.fogNear, vis.fogFar);
    }
    return debugFog;
  };
  let fogEnabled: boolean = vis.fogEnabled;
  scene.fog = fogEnabled ? ensureDebugFog() : null;

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const roomEnvironment = new RoomEnvironment();
  const envRenderTarget = pmremGenerator.fromScene(roomEnvironment, CONFIG.renderer.envBlur);
  scene.environment = envRenderTarget.texture;
  scene.environmentIntensity = activePreset.envIntensity;
  roomEnvironment.dispose();
  pmremGenerator.dispose();

  const aspect =
    (container.clientWidth || window.innerWidth) /
    (container.clientHeight || window.innerHeight);
  const camera = new THREE.PerspectiveCamera(
    CONFIG.camera.fovBase,
    aspect,
    CONFIG.camera.near,
    CONFIG.render.viewDistance * 1.2,
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

  const sunLight = new THREE.DirectionalLight(activePreset.sunColor, activePreset.sunIntensity);
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
    activePreset.hemisphereSkyColor,
    activePreset.hemisphereGroundColor,
    activePreset.hemisphereIntensity,
  );
  hemiLight.position.set(0, 120, 0);
  scene.add(hemiLight);

  // Room shell: seamless floor + 4 walls + baseboards + ceiling with full anisotropic textures
  let plankRepeatX: number = CONFIG.floor.textureRepeat;
  let plankRepeatZ: number = CONFIG.floor.textureRepeat;
  let ceilingRepeatX = 4;
  let ceilingRepeatZ = 4;

  let { colorMap: woodColorMap, roughnessMap: woodRoughnessMap } = createWoodFloorTextures(
    maxAnisotropy,
    activePreset,
    plankRepeatX,
    plankRepeatZ,
  );
  const floorMaterial = new THREE.MeshStandardMaterial({
    map: woodColorMap,
    roughnessMap: woodRoughnessMap,
    roughness: CONFIG.floor.roughness,
    metalness: CONFIG.floor.metalness,
  });

  let backWallTex = createWallTexture(
    activePreset.room.wallColor,
    activePreset.room.wallStripe,
    maxAnisotropy,
  );
  const backWallMat = new THREE.MeshStandardMaterial({
    map: backWallTex,
    roughness: 0.9,
    metalness: 0.0,
  });

  let sideWallTex = createWallTexture(
    activePreset.room.sideWallColor,
    activePreset.room.sideWallStripe,
    maxAnisotropy,
  );
  const sideWallMat = new THREE.MeshStandardMaterial({
    map: sideWallTex,
    roughness: 0.9,
    metalness: 0.0,
  });

  const baseboardMat = new THREE.MeshStandardMaterial({
    color: activePreset.room.baseboardColor,
    roughness: 0.66,
    metalness: 0.02,
  });

  let ceilingTex = createCeilingTexture(
    maxAnisotropy,
    activePreset,
    ceilingRepeatX,
    ceilingRepeatZ,
  );
  const ceilingMat = new THREE.MeshStandardMaterial({
    map: ceilingTex,
    roughness: 0.88,
    metalness: 0.0,
    emissive: new THREE.Color(activePreset.room.ceilingColor),
    emissiveIntensity: 0.18,
  });

  const roomShellGroup = new THREE.Group();
  roomShellGroup.name = 'RoomShellGroup';
  scene.add(roomShellGroup);
  const roomGeometries: THREE.BufferGeometry[] = [];

  function rebuildRoomShell(dim: RoomDimensions): void {
    while (roomShellGroup.children.length > 0) {
      roomShellGroup.remove(roomShellGroup.children[0]);
    }
    while (roomGeometries.length > 0) {
      roomGeometries.pop()?.dispose();
    }

    const wallThickness = 4;
    const floorW = dim.width + wallThickness * 4;
    const floorD = dim.depth + wallThickness * 4;
    plankRepeatX = Math.max(12, Math.round(floorW / 12.5));
    plankRepeatZ = Math.max(12, Math.round(floorD / 12.5));
    woodColorMap.repeat.set(plankRepeatX, plankRepeatZ);
    woodRoughnessMap.repeat.set(plankRepeatX, plankRepeatZ);

    const floorGeom = new THREE.PlaneGeometry(floorW, floorD);
    floorGeom.rotateX(-Math.PI / 2);
    roomGeometries.push(floorGeom);
    const floorMesh = new THREE.Mesh(floorGeom, floorMaterial);
    floorMesh.name = 'RoomFloor';
    floorMesh.position.set(dim.centerX, 0, dim.centerZ);
    floorMesh.receiveShadow = true;
    floorMesh.castShadow = false;
    floorMesh.updateMatrix();
    floorMesh.matrixAutoUpdate = false;
    roomShellGroup.add(floorMesh);

    const halfW = dim.width * 0.5;
    const halfD = dim.depth * 0.5;
    const wallH = dim.height + 4; // extend slightly past ceiling plane so zero seam gap

    const backFrontWallDefs = [
      { w: dim.width + wallThickness * 2, d: wallThickness, x: dim.centerX, z: dim.centerZ - halfD },
      { w: dim.width + wallThickness * 2, d: wallThickness, x: dim.centerX, z: dim.centerZ + halfD },
    ];
    const sideWallDefs = [
      { w: wallThickness, d: dim.depth + wallThickness * 2, x: dim.centerX - halfW, z: dim.centerZ },
      { w: wallThickness, d: dim.depth + wallThickness * 2, x: dim.centerX + halfW, z: dim.centerZ },
    ];

    const backWallGeoms: THREE.BufferGeometry[] = [];
    const sideWallGeoms: THREE.BufferGeometry[] = [];
    const trimGeoms: THREE.BufferGeometry[] = [];

    for (const wd of backFrontWallDefs) {
      const wg = new THREE.BoxGeometry(wd.w, wallH, wd.d);
      wg.translate(wd.x, wallH * 0.5 - 1, wd.z);
      backWallGeoms.push(wg);

      // Floor baseboard (plint bawah)
      const bb = new THREE.BoxGeometry(wd.w - 1, 4.5, wd.d + 1.2);
      bb.translate(wd.x, 2.25, wd.z);
      trimGeoms.push(bb);

      // Ceiling crown trim (plint atas)
      const cb = new THREE.BoxGeometry(wd.w - 1, 4.2, wd.d + 1.4);
      cb.translate(wd.x, dim.height - 2.1, wd.z);
      trimGeoms.push(cb);
    }

    for (const wd of sideWallDefs) {
      const wg = new THREE.BoxGeometry(wd.w, wallH, wd.d);
      wg.translate(wd.x, wallH * 0.5 - 1, wd.z);
      sideWallGeoms.push(wg);

      const bb = new THREE.BoxGeometry(wd.w + 1.2, 4.5, wd.d - 1);
      bb.translate(wd.x, 2.25, wd.z);
      trimGeoms.push(bb);

      const cb = new THREE.BoxGeometry(wd.w + 1.4, 4.2, wd.d - 1);
      cb.translate(wd.x, dim.height - 2.1, wd.z);
      trimGeoms.push(cb);
    }

    const backGeom = mergeRoomGeoms(backWallGeoms);
    roomGeometries.push(backGeom);
    const backWallsMesh = new THREE.Mesh(backGeom, backWallMat);
    backWallsMesh.name = 'RoomBackFrontWalls';
    backWallsMesh.castShadow = false;
    backWallsMesh.receiveShadow = true;
    backWallsMesh.updateMatrix();
    backWallsMesh.matrixAutoUpdate = false;
    roomShellGroup.add(backWallsMesh);

    const sideGeom = mergeRoomGeoms(sideWallGeoms);
    roomGeometries.push(sideGeom);
    const sideWallsMesh = new THREE.Mesh(sideGeom, sideWallMat);
    sideWallsMesh.name = 'RoomSideWalls';
    sideWallsMesh.castShadow = false;
    sideWallsMesh.receiveShadow = true;
    sideWallsMesh.updateMatrix();
    sideWallsMesh.matrixAutoUpdate = false;
    roomShellGroup.add(sideWallsMesh);

    const trimGeom = mergeRoomGeoms(trimGeoms);
    roomGeometries.push(trimGeom);
    const trimMesh = new THREE.Mesh(trimGeom, baseboardMat);
    trimMesh.name = 'RoomBaseboardsAndCrown';
    trimMesh.castShadow = false;
    trimMesh.receiveShadow = true;
    trimMesh.updateMatrix();
    trimMesh.matrixAutoUpdate = false;
    roomShellGroup.add(trimMesh);

    ceilingRepeatX = Math.max(4, Math.round(floorW / 95));
    ceilingRepeatZ = Math.max(4, Math.round(floorD / 95));
    ceilingTex.repeat.set(ceilingRepeatX, ceilingRepeatZ);
    const ceilingGeom = new THREE.PlaneGeometry(floorW, floorD);
    ceilingGeom.rotateX(Math.PI / 2);
    roomGeometries.push(ceilingGeom);
    const ceilingMesh = new THREE.Mesh(ceilingGeom, ceilingMat);
    ceilingMesh.name = 'RoomCeiling';
    ceilingMesh.position.set(dim.centerX, dim.height, dim.centerZ);
    ceilingMesh.castShadow = false;
    ceilingMesh.receiveShadow = false;
    ceilingMesh.updateMatrix();
    ceilingMesh.matrixAutoUpdate = false;
    roomShellGroup.add(ceilingMesh);
  }

  // Initial room shell before course bounds arrive
  rebuildRoomShell({
    centerX: 0,
    centerZ: 0,
    width: CONFIG.props.roomSize.width,
    depth: CONFIG.props.roomSize.depth,
    height: CONFIG.props.roomSize.height,
  });

  // Visual debug keys (F3 fog, F4 bloom, [ / ] exposure) & compact bottom-center status badge
  let bloomDebugEnabled = true;
  let currentExposure: number = activePreset.exposure;
  scene.userData.visualDebugBloomEnabled = bloomDebugEnabled;

  let debugPanel: HTMLDivElement | null = null;
  const updateVisualDebugOverlay = (): void => {
    if (!debugPanel) return;
    const fogLabel = fogEnabled ? `ON (${vis.fogNear}-${vis.fogFar}m)` : 'OFF';
    const bloomLabel = bloomDebugEnabled ? 'ON' : 'OFF';
    debugPanel.textContent =
      `PALET [F5]: ${activePresetName.toUpperCase()} | FOG [F3]: ${fogLabel} | BLOOM [F4]: ${bloomLabel} | EXP [[ / ]]: ${currentExposure.toFixed(2)}`;
  };

  const handleDebugKeyDown = (event: KeyboardEvent): void => {
    if (!vis.debugKeys) return;
    if (event.code === 'F3') {
      event.preventDefault();
      fogEnabled = !fogEnabled;
      scene.fog = fogEnabled ? ensureDebugFog() : null;
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

  function setRoomBounds(bounds: CourseBounds): void {
    const dim = computeRoomDimensions(bounds);
    rebuildRoomShell(dim);
    skyDome.mesh.position.set(dim.centerX, 0, dim.centerZ);
  }

  function setOrbitTarget(target: THREE.Vector3, radius: number, height: number): void {
    orbitTarget.copy(target);
    orbitRadius = radius;
    orbitHeight = height;

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

  function applyPalette(name: VisualPresetName): void {
    activePresetName = name;
    activePreset = vis.presets[name];

    currentExposure = activePreset.exposure;
    renderer.toneMappingExposure = currentExposure;

    scene.background = new THREE.Color(activePreset.skyHorizon);
    skyDome.material.uniforms.uSkyTop.value.set(activePreset.skyTop);
    skyDome.material.uniforms.uSkyHorizon.value.set(activePreset.skyHorizon);
    skyDome.material.uniforms.uGroundBounce.value.set(activePreset.room.floorColor.dark);

    if (debugFog) {
      debugFog.color.set(activePreset.fogColor);
    }

    scene.environmentIntensity = activePreset.envIntensity;

    sunLight.color.set(activePreset.sunColor);
    sunLight.intensity = activePreset.sunIntensity;

    hemiLight.color.set(activePreset.hemisphereSkyColor);
    hemiLight.groundColor.set(activePreset.hemisphereGroundColor);
    hemiLight.intensity = activePreset.hemisphereIntensity;

    const prevWoodColor = woodColorMap;
    const prevWoodRough = woodRoughnessMap;
    const nextWood = createWoodFloorTextures(
      maxAnisotropy,
      activePreset,
      plankRepeatX,
      plankRepeatZ,
    );
    woodColorMap = nextWood.colorMap;
    woodRoughnessMap = nextWood.roughnessMap;
    floorMaterial.map = woodColorMap;
    floorMaterial.roughnessMap = woodRoughnessMap;
    floorMaterial.needsUpdate = true;
    prevWoodColor.dispose();
    prevWoodRough.dispose();

    const prevBackTex = backWallTex;
    backWallTex = createWallTexture(
      activePreset.room.wallColor,
      activePreset.room.wallStripe,
      maxAnisotropy,
    );
    backWallMat.map = backWallTex;
    backWallMat.needsUpdate = true;
    prevBackTex.dispose();

    const prevSideTex = sideWallTex;
    sideWallTex = createWallTexture(
      activePreset.room.sideWallColor,
      activePreset.room.sideWallStripe,
      maxAnisotropy,
    );
    sideWallMat.map = sideWallTex;
    sideWallMat.needsUpdate = true;
    prevSideTex.dispose();

    baseboardMat.color.set(activePreset.room.baseboardColor);

    const prevCeilingTex = ceilingTex;
    ceilingTex = createCeilingTexture(
      maxAnisotropy,
      activePreset,
      ceilingRepeatX,
      ceilingRepeatZ,
    );
    ceilingMat.map = ceilingTex;
    ceilingMat.emissive.set(activePreset.room.ceilingColor);
    ceilingMat.needsUpdate = true;
    prevCeilingTex.dispose();

    updateVisualDebugOverlay();
  }

  return {
    renderer,
    scene,
    camera,
    isSoftwareGl,
    maxAnisotropy,
    setRoomBounds,
    setOrbitTarget,
    setCameraOrbitAngle,
    updateSunShadowTarget,
    setQuality,
    applyPalette,
    getViewportSize,
    dispose,
  };
}
