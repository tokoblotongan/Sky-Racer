// src/render/themes/kitchen/textures.ts
// Procedural canvas texture generators for Arena 3 ("Dapur Raksasa") with shared disposal tracking.

import * as THREE from 'three';

export interface KitchenTexturePack {
  readonly counterChecker: THREE.CanvasTexture;
  readonly floorChecker: THREE.CanvasTexture;
  readonly backsplashTile: THREE.CanvasTexture;
  readonly windowSky: THREE.CanvasTexture;
  readonly polkaDotEnamel: THREE.CanvasTexture;
  readonly waterSurface: THREE.CanvasTexture;
  readonly steamPuff: THREE.CanvasTexture;
  readonly checkeredFlag: THREE.CanvasTexture;
  readonly spiceArrowSign: THREE.CanvasTexture;
  updateSkyColors: (skyTop: string, skyHorizon: string) => void;
  dispose: () => void;
}

function paintSkyCanvas(
  canvas: HTMLCanvasElement,
  skyTop: string,
  skyHorizon: string,
): void {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0.0, skyTop);
  grad.addColorStop(0.76, skyHorizon);
  grad.addColorStop(1.0, '#E0F4FF');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Simple fluffy stylized clouds
  const clouds = [
    { x: w * 0.22, y: h * 0.34, r: 22 },
    { x: w * 0.54, y: h * 0.26, r: 26 },
    { x: w * 0.8, y: h * 0.42, r: 20 },
  ];
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  for (const c of clouds) {
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.arc(c.x - c.r * 0.85, c.y + c.r * 0.22, c.r * 0.72, 0, Math.PI * 2);
    ctx.arc(c.x + c.r * 0.88, c.y + c.r * 0.24, c.r * 0.75, 0, Math.PI * 2);
    ctx.fill();
  }
}

function createCounterCheckerTexture(
  maxAnisotropy: number,
  repeatX: number,
  repeatZ: number,
): THREE.CanvasTexture {
  const size = 256;
  const half = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = '#14B8A6';
    ctx.fillRect(0, 0, half, half);
    ctx.fillRect(half, half, half, half);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.fillRect(4, 4, half - 8, 6);
    ctx.fillRect(half + 4, half + 4, half - 8, 6);

    ctx.fillStyle = 'rgba(15, 118, 110, 0.24)';
    ctx.fillRect(0, 0, size, 3);
    ctx.fillRect(0, half - 1, size, 3);
    ctx.fillRect(0, 0, 3, size);
    ctx.fillRect(half - 1, 0, 3, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatZ);
  tex.anisotropy = Math.min(4, maxAnisotropy);
  tex.needsUpdate = true;
  return tex;
}

function createFloorCheckerTexture(
  maxAnisotropy: number,
  repeatX: number,
  repeatZ: number,
): THREE.CanvasTexture {
  const size = 128;
  const half = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(0, 0, half, half);
    ctx.fillRect(half, half, half, half);
    ctx.fillStyle = 'rgba(14, 116, 144, 0.16)';
    ctx.fillRect(0, 0, size, 2);
    ctx.fillRect(0, half - 1, size, 2);
    ctx.fillRect(0, 0, 2, size);
    ctx.fillRect(half - 1, 0, 2, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatZ);
  tex.anisotropy = Math.min(2, maxAnisotropy);
  tex.needsUpdate = true;
  return tex;
}

function createBacksplashTileTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 128;
  const half = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#2DD4BF';
    ctx.fillRect(4, 4, half - 8, half - 8);
    ctx.fillRect(half + 4, half + 4, half - 8, half - 8);
    ctx.fillStyle = '#CCFBF1';
    ctx.fillRect(half + 4, 4, half - 8, half - 8);
    ctx.fillRect(4, half + 4, half - 8, half - 8);
    ctx.fillStyle = 'rgba(15, 118, 110, 0.25)';
    ctx.fillRect(0, 0, size, 3);
    ctx.fillRect(0, half - 1, size, 2);
    ctx.fillRect(0, 0, 3, size);
    ctx.fillRect(half - 1, 0, 2, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 2);
  tex.anisotropy = Math.min(4, maxAnisotropy);
  tex.needsUpdate = true;
  return tex;
}

function createPolkaDotEnamelTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#0A5CFF';
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = '#FFFFFF';
    const step = size / 4;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const offsetX = r % 2 === 0 ? step * 0.25 : step * 0.75;
        const cx = (c * step + offsetX) % size;
        const cy = r * step + step * 0.5;
        ctx.beginPath();
        ctx.arc(cx, cy, step * 0.21, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 3);
  tex.anisotropy = Math.min(4, maxAnisotropy);
  tex.needsUpdate = true;
  return tex;
}

function createWaterTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0.0, '#00B4FF');
    grad.addColorStop(0.5, '#00E5FF');
    grad.addColorStop(1.0, '#0284C7');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 3;
    for (let row = 0; row < 6; row++) {
      const y = (row + 0.5) * (size / 6);
      ctx.beginPath();
      for (let x = 0; x <= size; x += 16) {
        const wy = y + Math.sin((x / size) * Math.PI * 4 + row * 1.2) * 4;
        if (x === 0) ctx.moveTo(x, wy);
        else ctx.lineTo(x, wy);
      }
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 2);
  tex.anisotropy = Math.min(2, maxAnisotropy);
  tex.needsUpdate = true;
  return tex;
}

function createSteamSpriteTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const half = size * 0.5;
    const grad = ctx.createRadialGradient(half, half, 2, half, half, half);
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 0.9)');
    grad.addColorStop(0.55, 'rgba(224, 247, 255, 0.5)');
    grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createCheckeredFlagTexture(): THREE.CanvasTexture {
  const w = 128;
  const h = 64;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const cols = 8;
    const rows = 4;
    const cw = w / cols;
    const ch = h / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? '#FFFFFF' : '#0F172A';
        ctx.fillRect(c * cw, r * ch, cw + 0.5, ch + 0.5);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createSpiceArrowSignTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = '#00E5FF';
    ctx.lineWidth = 8;
    ctx.strokeRect(6, 6, w - 12, h - 12);

    // Glowing chevron arrow pointing right toward the shortcut
    ctx.fillStyle = '#00E5FF';
    ctx.beginPath();
    ctx.moveTo(w * 0.62, h * 0.24);
    ctx.lineTo(w * 0.88, h * 0.5);
    ctx.lineTo(w * 0.62, h * 0.76);
    ctx.lineTo(w * 0.62, h * 0.6);
    ctx.lineTo(w * 0.16, h * 0.6);
    ctx.lineTo(w * 0.16, h * 0.4);
    ctx.lineTo(w * 0.62, h * 0.4);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#FFD000';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('PINTAS', 20, h * 0.24);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createKitchenTextures(
  maxAnisotropy: number,
  counterRepeatX: number,
  counterRepeatZ: number,
  floorRepeatX: number,
  floorRepeatZ: number,
  skyTop: string,
  skyHorizon: string,
): KitchenTexturePack {
  const windowCanvas = document.createElement('canvas');
  windowCanvas.width = 256;
  windowCanvas.height = 128;
  paintSkyCanvas(windowCanvas, skyTop, skyHorizon);
  const windowSky = new THREE.CanvasTexture(windowCanvas);
  windowSky.colorSpace = THREE.SRGBColorSpace;
  windowSky.wrapS = THREE.ClampToEdgeWrapping;
  windowSky.wrapT = THREE.ClampToEdgeWrapping;
  windowSky.needsUpdate = true;

  const counterChecker = createCounterCheckerTexture(maxAnisotropy, counterRepeatX, counterRepeatZ);
  const floorChecker = createFloorCheckerTexture(maxAnisotropy, floorRepeatX, floorRepeatZ);
  const backsplashTile = createBacksplashTileTexture(maxAnisotropy);
  const polkaDotEnamel = createPolkaDotEnamelTexture(maxAnisotropy);
  const waterSurface = createWaterTexture(maxAnisotropy);
  const steamPuff = createSteamSpriteTexture();
  const checkeredFlag = createCheckeredFlagTexture();
  const spiceArrowSign = createSpiceArrowSignTexture();

  const all = [
    counterChecker,
    floorChecker,
    backsplashTile,
    windowSky,
    polkaDotEnamel,
    waterSurface,
    steamPuff,
    checkeredFlag,
    spiceArrowSign,
  ];

  return {
    counterChecker,
    floorChecker,
    backsplashTile,
    windowSky,
    polkaDotEnamel,
    waterSurface,
    steamPuff,
    checkeredFlag,
    spiceArrowSign,
    updateSkyColors(nextTop: string, nextHorizon: string): void {
      paintSkyCanvas(windowCanvas, nextTop, nextHorizon);
      windowSky.needsUpdate = true;
    },
    dispose(): void {
      for (const tex of all) tex.dispose();
    },
  };
}
