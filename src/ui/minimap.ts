// src/ui/minimap.ts

import * as THREE from 'three';
import { CONFIG } from '../config';
import type { AttractionSystem } from '../core/attractions';
import type { Course } from '../core/course';
import type { CarState } from '../core/physics';

export type MinimapSizeMode = 'off' | 'small' | 'large';

export interface MinimapController {
  readonly element: HTMLElement;
  setCourse: (course: Course, attractions: AttractionSystem | null) => void;
  setAttractionsVisible: (visible: boolean) => void;
  getSizeMode: () => MinimapSizeMode;
  setSizeMode: (mode: MinimapSizeMode) => void;
  cycleSizeMode: () => MinimapSizeMode;
  setVisible: (visible: boolean) => void;
  update: (
    cars: readonly CarState[],
    course: Course,
    progress01: number,
    isTouchOrMobile: boolean,
    nowMs: number,
    force?: boolean,
  ) => void;
  dispose: () => void;
}

interface ProjectedPoint {
  x: number;
  y: number;
}

interface Bounds2D {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const SIZE_CYCLE: readonly MinimapSizeMode[] = ['off', 'small', 'large'];

export function loadStoredMinimapMode(): MinimapSizeMode {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return CONFIG.minimap.defaultSize;
    }
    const raw = window.localStorage.getItem(CONFIG.minimap.storageKey);
    if (raw === 'off' || raw === 'small' || raw === 'large') {
      return raw;
    }
  } catch {
    // Ignore storage read errors
  }
  return CONFIG.minimap.defaultSize;
}

function saveStoredMinimapMode(mode: MinimapSizeMode): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    window.localStorage.setItem(CONFIG.minimap.storageKey, mode);
  } catch {
    // Ignore storage quota errors
  }
}

export function getMinimapModeLabel(mode: MinimapSizeMode): string {
  if (mode === 'off') return 'MATI';
  if (mode === 'large') return 'BESAR';
  return 'KECIL';
}

export function createMinimap(
  onCycleCallback?: (mode: MinimapSizeMode) => void,
): MinimapController {
  const cfg = CONFIG.minimap;
  let sizeMode: MinimapSizeMode = loadStoredMinimapMode();
  let hudVisible = false;
  let showAttractions: boolean = cfg.showAttractions;

  const wrap = document.createElement('button');
  wrap.type = 'button';
  wrap.className = 'sr-minimap-wrap sr-hud-hidden';
  wrap.setAttribute('aria-label', 'Denah sirkuit (ketuk atau tekan N)');
  wrap.title = 'Denah sirkuit (N)';

  const staticCanvas = document.createElement('canvas');
  staticCanvas.className = 'sr-minimap-canvas sr-minimap-static';

  const dynamicCanvas = document.createElement('canvas');
  dynamicCanvas.className = 'sr-minimap-canvas sr-minimap-dynamic';

  wrap.appendChild(staticCanvas);
  wrap.appendChild(dynamicCanvas);

  let activeCourse: Course | null = null;
  let activeAttractions: AttractionSystem | null = null;
  let cachedCourseKey = '';
  let cachedCssSizePx = 0;
  let cachedDpr = 1;
  let bounds: Bounds2D = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let lastDynamicUpdateMs = -Infinity;

  const tmpFrame = {
    s: 0,
    position: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
    up: new THREE.Vector3(),
    right: new THREE.Vector3(),
    width: 10,
    bank: 0,
  };
  const tmpWorld = new THREE.Vector3();
  const tmpForward = new THREE.Vector3();

  const projectXZ = (wx: number, wz: number, out: ProjectedPoint): void => {
    out.x = offsetX + (wx - bounds.minX) * scale;
    out.y = offsetY + (wz - bounds.minZ) * scale;
  };

  const computeCanvasSizePx = (): number => {
    const vh = Math.max(320, window.visualViewport?.height ?? window.innerHeight ?? 720);
    const vw = Math.max(320, window.visualViewport?.width ?? window.innerWidth ?? 1280);
    const ratio = sizeMode === 'large' ? cfg.sizes.large : cfg.sizes.small;
    const raw = Math.round(vh * ratio);
    const maxByWidth = vh > vw ? Math.round(vw * 0.34) : Math.round(vw * 0.24);
    return Math.max(76, Math.min(raw, maxByWidth));
  };

  const renderStaticLayer = (cssSize: number): void => {
    if (!activeCourse) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const px = Math.max(1, Math.round(cssSize * dpr));
    staticCanvas.width = px;
    staticCanvas.height = px;
    dynamicCanvas.width = px;
    dynamicCanvas.height = px;
    wrap.style.width = `${cssSize}px`;
    wrap.style.height = `${cssSize}px`;
    cachedCssSizePx = cssSize;
    cachedDpr = dpr;

    const ctx = staticCanvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssSize, cssSize);

    // Compute world XZ bounding box across main + branch routes (north-up: +X right, +Z down)
    const mainRoute = activeCourse.getRoute('main');
    const mainLen = mainRoute.getLength();
    const step = 6;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    const expandBounds = (wx: number, wz: number): void => {
      if (wx < minX) minX = wx;
      if (wx > maxX) maxX = wx;
      if (wz < minZ) minZ = wz;
      if (wz > maxZ) maxZ = wz;
    };

    for (let s = 0; s <= mainLen; s += step) {
      mainRoute.getFrameAt(s, tmpFrame);
      expandBounds(tmpFrame.position.x, tmpFrame.position.z);
    }
    for (const br of activeCourse.getBranchRoutes()) {
      const bLen = br.getLength();
      for (let s = 0; s <= bLen; s += step) {
        br.getFrameAt(s, tmpFrame);
        expandBounds(tmpFrame.position.x, tmpFrame.position.z);
      }
    }

    const spanX = Math.max(20, maxX - minX);
    const spanZ = Math.max(20, maxZ - minZ);
    const pad = Math.max(8, Math.max(spanX, spanZ) * cfg.marginRatio);
    bounds = {
      minX: minX - pad,
      maxX: maxX + pad,
      minZ: minZ - pad,
      maxZ: maxZ + pad,
    };

    const drawSpanX = bounds.maxX - bounds.minX;
    const drawSpanZ = bounds.maxZ - bounds.minZ;
    const inner = cssSize * (1 - cfg.marginRatio * 1.4);
    scale = Math.min(inner / drawSpanX, inner / drawSpanZ);
    offsetX = (cssSize - drawSpanX * scale) * 0.5;
    offsetY = (cssSize - drawSpanZ * scale) * 0.5;

    const pt: ProjectedPoint = { x: 0, y: 0 };

    // 1. Shortcut branch dashed cyan lines (drawn underneath main outline cleanly)
    const branches = activeCourse.getBranchRoutes();
    if (branches.length > 0) {
      ctx.save();
      ctx.strokeStyle = cfg.colors.shortcut;
      ctx.lineWidth = Math.max(2.2, cssSize * 0.022);
      ctx.setLineDash([Math.max(3, cssSize * 0.036), Math.max(2, cssSize * 0.024)]);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const br of branches) {
        const bLen = br.getLength();
        ctx.beginPath();
        for (let s = 0; s <= bLen; s += 4) {
          br.getFrameAt(s, tmpFrame);
          projectXZ(tmpFrame.position.x, tmpFrame.position.z, pt);
          if (s === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        }
        br.getFrameAt(bLen, tmpFrame);
        projectXZ(tmpFrame.position.x, tmpFrame.position.z, pt);
        ctx.lineTo(pt.x, pt.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 2. Main track outline & thick orange centerline (bridges/tunnels stay normal lines)
    const drawMainPolyline = (strokeStyle: string, lineWidth: number): void => {
      ctx.save();
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let s = 0; s <= mainLen; s += 4) {
        mainRoute.getFrameAt(s, tmpFrame);
        projectXZ(tmpFrame.position.x, tmpFrame.position.z, pt);
        if (s === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      if (activeCourse!.isClosed()) {
        ctx.closePath();
      } else {
        mainRoute.getFrameAt(mainLen, tmpFrame);
        projectXZ(tmpFrame.position.x, tmpFrame.position.z, pt);
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
      ctx.restore();
    };

    const mainWidth = Math.max(3.6, cssSize * 0.038);
    drawMainPolyline(cfg.colors.trackOutline, mainWidth + 2.2);
    drawMainPolyline(cfg.colors.track, mainWidth);

    // 3. Draw vertical loops as small circles alongside their track location
    const segs = activeCourse.getSegmentList();
    for (const seg of segs) {
      if (seg.type !== 'loop') continue;
      const midS = (seg.startS + seg.endS) * 0.5;
      mainRoute.getFrameAt(midS, tmpFrame);
      projectXZ(tmpFrame.position.x, tmpFrame.position.z, pt);
      const loopR = Math.max(4.5, cssSize * 0.044);
      ctx.save();
      ctx.strokeStyle = cfg.colors.trackOutline;
      ctx.lineWidth = mainWidth * 0.95;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, loopR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = cfg.colors.track;
      ctx.lineWidth = mainWidth * 0.58;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, loopR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 4. Boost pads as small cyan dots (main + branches)
    const padRadius = Math.max(2.0, cssSize * 0.017);
    const drawBoostPads = (route: typeof mainRoute) => {
      for (const pad of route.getBoostPads()) {
        route.getFrameAt(pad.s, tmpFrame);
        tmpWorld.copy(tmpFrame.position).addScaledVector(tmpFrame.right, pad.lateral);
        projectXZ(tmpWorld.x, tmpWorld.z, pt);
        ctx.fillStyle = cfg.colors.boost;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, padRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    drawBoostPads(mainRoute);
    for (const br of branches) {
      drawBoostPads(br);
    }

    // 5. Thin checkpoint ticks
    const tickHalf = mainWidth * 1.15;
    ctx.save();
    ctx.strokeStyle = cfg.colors.checkpoint;
    ctx.lineWidth = 1.4;
    for (const cp of activeCourse.getCheckpoints()) {
      const f = cp.frame;
      projectXZ(f.position.x, f.position.z, pt);
      const len = Math.hypot(f.tangent.x, f.tangent.z) || 1;
      const nx = -f.tangent.z / len;
      const nz = f.tangent.x / len;
      ctx.beginPath();
      ctx.moveTo(pt.x - nx * tickHalf, pt.y - nz * tickHalf);
      ctx.lineTo(pt.x + nx * tickHalf, pt.y + nz * tickHalf);
      ctx.stroke();
    }
    ctx.restore();

    // 6. Race direction arrows (3 evenly spaced chevrons along main route)
    const arrowCount = 3;
    const arrowSize = Math.max(3.4, cssSize * 0.032);
    ctx.save();
    ctx.fillStyle = cfg.colors.arrow;
    for (let i = 0; i < arrowCount; i++) {
      const s = mainLen * ((i + 0.35) / arrowCount);
      mainRoute.getFrameAt(s, tmpFrame);
      projectXZ(tmpFrame.position.x, tmpFrame.position.z, pt);
      const ang = Math.atan2(tmpFrame.tangent.z, tmpFrame.tangent.x);
      ctx.save();
      ctx.translate(pt.x, pt.y);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(arrowSize, 0);
      ctx.lineTo(-arrowSize * 0.65, -arrowSize * 0.62);
      ctx.lineTo(-arrowSize * 0.3, 0);
      ctx.lineTo(-arrowSize * 0.65, arrowSize * 0.62);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    // 7. Small checkered Start/Finish marker at s=0
    mainRoute.getFrameAt(0, tmpFrame);
    projectXZ(tmpFrame.position.x, tmpFrame.position.z, pt);
    const startAng = Math.atan2(tmpFrame.tangent.z, tmpFrame.tangent.x);
    const cell = Math.max(2.2, cssSize * 0.018);
    ctx.save();
    ctx.translate(pt.x, pt.y);
    ctx.rotate(startAng);
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 4; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? cfg.colors.startCheckA : cfg.colors.startCheckB;
        ctx.fillRect((r - 1) * cell, (c - 2) * cell, cell, cell);
      }
    }
    ctx.restore();

    // 8. Optional FantasyLand attraction icons (yellow hazards, cyan boost rings)
    if (cfg.showAttractions && showAttractions && activeAttractions?.plan.enabledForCourse) {
      const markers = activeAttractions.getMinimapMarkers();
      const iconR = Math.max(2.4, cssSize * 0.02);
      for (let i = 0; i < markers.length; i++) {
        const m = markers[i];
        const route = activeCourse.getRoute(m.routeId);
        route.getFrameAt(m.s, tmpFrame);
        tmpWorld.copy(tmpFrame.position).addScaledVector(tmpFrame.right, m.lateral);
        projectXZ(tmpWorld.x, tmpWorld.z, pt);

        ctx.save();
        if (m.kind === 'hazard') {
          ctx.fillStyle = cfg.colors.hazardIcon;
          ctx.strokeStyle = cfg.colors.trackOutline;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(pt.x, pt.y - iconR * 1.15);
          ctx.lineTo(pt.x + iconR * 1.1, pt.y + iconR * 0.9);
          ctx.lineTo(pt.x - iconR * 1.1, pt.y + iconR * 0.9);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.strokeStyle = cfg.colors.ringIcon;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, iconR, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  };

  const renderDynamicLayer = (
    cars: readonly CarState[],
    course: Course,
    progress01: number,
  ): void => {
    if (cachedCssSizePx <= 0) return;
    const ctx = dynamicCanvas.getContext('2d');
    if (!ctx) return;

    const cssSize = cachedCssSizePx;
    ctx.setTransform(cachedDpr, 0, 0, cachedDpr, 0, 0);
    ctx.clearRect(0, 0, cssSize, cssSize);

    // Subtle lap progress arc in top-right corner of minimap
    const arcR = Math.max(8, cssSize * 0.085);
    const arcCx = cssSize - arcR - 6;
    const arcCy = arcR + 6;
    const progClamped = Math.max(0, Math.min(1, progress01));
    ctx.save();
    ctx.lineWidth = Math.max(2, cssSize * 0.018);
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.beginPath();
    ctx.arc(arcCx, arcCy, arcR, 0, Math.PI * 2);
    ctx.stroke();
    if (progClamped > 0.005) {
      ctx.strokeStyle = CONFIG.colors.boost;
      ctx.beginPath();
      ctx.arc(arcCx, arcCy, arcR, -Math.PI * 0.5, -Math.PI * 0.5 + progClamped * Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    const palettes = CONFIG.car.visual.multiplayerPalettes;
    const isSingleCar = cars.length <= 1;
    const pt: ProjectedPoint = { x: 0, y: 0 };
    const dotR = Math.max(3.0, cssSize * 0.028);

    // Draw rivals first so player dot & heading arrow stay clearly on top
    for (let i = cars.length - 1; i >= 0; i--) {
      if (isSingleCar && i > 0) continue;
      const car = cars[i];
      if (!car) continue;

      if (car.mode === 'grounded') {
        const route = course.getRoute(car.routeId);
        route.getFrameAt(car.s, tmpFrame);
        tmpWorld.copy(tmpFrame.position).addScaledVector(tmpFrame.right, car.lateral);
      } else {
        tmpWorld.copy(car.worldPos);
      }
      projectXZ(tmpWorld.x, tmpWorld.z, pt);

      const palette = palettes[i % palettes.length];
      const isPlayer = i === 0;

      ctx.save();
      if (isPlayer) {
        // Heading arrow pointing along player's worldXZ direction
        tmpForward.set(0, 0, -1).applyQuaternion(car.worldQuat);
        const hLen = Math.hypot(tmpForward.x, tmpForward.z);
        const ang = hLen > 1e-4 ? Math.atan2(tmpForward.z, tmpForward.x) : -Math.PI * 0.5;

        ctx.translate(pt.x, pt.y);
        ctx.rotate(ang);

        ctx.fillStyle = cfg.colors.playerRing;
        ctx.beginPath();
        ctx.moveTo(dotR * 2.15, 0);
        ctx.lineTo(dotR * 0.75, -dotR * 0.85);
        ctx.lineTo(dotR * 0.75, dotR * 0.85);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = palette.body;
        ctx.strokeStyle = cfg.colors.playerRing;
        ctx.lineWidth = Math.max(1.6, dotR * 0.48);
        ctx.beginPath();
        ctx.arc(0, 0, dotR * 1.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillStyle = palette.body;
        ctx.strokeStyle = cfg.colors.trackOutline;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, dotR * 0.92, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
  };

  const syncDomClasses = (): void => {
    const show = hudVisible && sizeMode !== 'off';
    wrap.classList.toggle('sr-hud-hidden', !show);
    wrap.classList.toggle('sr-minimap--large', sizeMode === 'large');
    wrap.setAttribute('data-size', sizeMode);
  };

  const handleClick = (e: MouseEvent): void => {
    e.stopPropagation();
    wrap.blur();
    const next = cycleSizeMode();
    onCycleCallback?.(next);
  };
  const handlePointerDown = (e: PointerEvent): void => {
    e.stopPropagation();
  };

  wrap.addEventListener('click', handleClick);
  wrap.addEventListener('pointerdown', handlePointerDown);
  syncDomClasses();

  const setCourse = (course: Course, attractions: AttractionSystem | null): void => {
    activeCourse = course;
    activeAttractions = attractions;
    cachedCourseKey = '';
    lastDynamicUpdateMs = -Infinity;
    if (sizeMode !== 'off') {
      const cssSize = computeCanvasSizePx();
      renderStaticLayer(cssSize);
      cachedCourseKey = `${course.getId()}:${showAttractions ? 1 : 0}:${cssSize}`;
    }
  };

  const setAttractionsVisible = (visible: boolean): void => {
    if (showAttractions === visible) return;
    showAttractions = visible;
    cachedCourseKey = '';
    if (activeCourse && sizeMode !== 'off') {
      const cssSize = computeCanvasSizePx();
      renderStaticLayer(cssSize);
      cachedCourseKey = `${activeCourse.getId()}:${showAttractions ? 1 : 0}:${cssSize}`;
    }
  };

  const setSizeMode = (mode: MinimapSizeMode): void => {
    if (sizeMode === mode) return;
    sizeMode = mode;
    saveStoredMinimapMode(mode);
    syncDomClasses();
    if (mode !== 'off' && activeCourse) {
      const cssSize = computeCanvasSizePx();
      renderStaticLayer(cssSize);
      cachedCourseKey = `${activeCourse.getId()}:${showAttractions ? 1 : 0}:${cssSize}`;
      lastDynamicUpdateMs = -Infinity;
    }
  };

  const cycleSizeMode = (): MinimapSizeMode => {
    const idx = SIZE_CYCLE.indexOf(sizeMode);
    const next = SIZE_CYCLE[(idx + 1) % SIZE_CYCLE.length];
    setSizeMode(next);
    return next;
  };

  const setVisible = (visible: boolean): void => {
    hudVisible = visible;
    syncDomClasses();
  };

  const update = (
    cars: readonly CarState[],
    course: Course,
    progress01: number,
    isTouchOrMobile: boolean,
    nowMs: number,
    force = false,
  ): void => {
    if (sizeMode === 'off' || !hudVisible) {
      return;
    }
    if (activeCourse !== course) {
      activeCourse = course;
    }
    const cssSize = computeCanvasSizePx();
    const wantKey = `${course.getId()}:${showAttractions ? 1 : 0}:${cssSize}`;
    if (wantKey !== cachedCourseKey) {
      renderStaticLayer(cssSize);
      cachedCourseKey = wantKey;
      force = true;
    }

    const hz = isTouchOrMobile ? cfg.updateHz.mobile : cfg.updateHz.desktop;
    const minIntervalMs = 1000 / Math.max(1, hz);
    if (!force && nowMs - lastDynamicUpdateMs < minIntervalMs) {
      return;
    }
    lastDynamicUpdateMs = nowMs;
    renderDynamicLayer(cars, course, progress01);
  };

  const dispose = (): void => {
    wrap.removeEventListener('click', handleClick);
    wrap.removeEventListener('pointerdown', handlePointerDown);
    wrap.remove();
  };

  return {
    element: wrap,
    setCourse,
    setAttractionsVisible,
    getSizeMode: () => sizeMode,
    setSizeMode,
    cycleSizeMode,
    setVisible,
    update,
    dispose,
  };
}
