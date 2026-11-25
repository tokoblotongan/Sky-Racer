// src/ui/courseCard.ts

import * as THREE from 'three';
import { CONFIG } from '../config';
import { buildCourseConfigFromDefinition, Course } from '../core/course';
import type { CourseDefinition } from '../courses/types';
import { formatMedalLabel, getRecords, type MedalType } from '../services/records';
import { formatRaceTime } from './hud';

export interface CourseSelectHandle {
  setSelected: (id: string) => void;
  refreshRecords: () => void;
  dispose: () => void;
}

interface CachedCourseMinimap {
  canvas: HTMLCanvasElement;
  totalLength: number;
  trackWidth: number;
}

const minimapCache = new Map<string, CachedCourseMinimap>();

function createSmallMedalSvg(medal: MedalType): string {
  if (medal === 'none') {
    return '';
  }
  let fillMain = '#F4A261';
  let fillShade = '#B45309';
  let strokeColor = '#FFE8CC';
  let starColor = '#FFFDF7';

  if (medal === 'gold') {
    fillMain = '#FFD000';
    fillShade = '#E59500';
    strokeColor = '#FFFDF7';
  } else if (medal === 'silver') {
    fillMain = '#E2E8F0';
    fillShade = '#94A3B8';
    strokeColor = '#FFFDF7';
  }

  return `
    <svg class="sr-arena-medal-svg" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="17" r="11" fill="${fillShade}" stroke="${strokeColor}" stroke-width="2" />
      <circle cx="16" cy="16" r="8.8" fill="${fillMain}" />
      <polygon
        points="16,9.5 17.8,13.4 22.1,14 19,17 19.8,21.3 16,19.2 12.2,21.3 13,17 9.9,14 14.2,13.4"
        fill="${starColor}"
      />
    </svg>
  `;
}

function getOrBuildMinimap(def: CourseDefinition): CachedCourseMinimap {
  const existing = minimapCache.get(def.id);
  if (existing) {
    return existing;
  }

  const course = new Course(buildCourseConfigFromDefinition(def, false));
  const totalLength = course.getLength();
  const trackWidth = def.trackWidth ?? CONFIG.course.trackWidth;

  const cssW = CONFIG.courseSelect.minimapWidth;
  const cssH = CONFIG.courseSelect.minimapHeight;
  const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);

  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.scale(dpr, dpr);

    // Background plate
    ctx.fillStyle = '#0B1324';
    ctx.fillRect(0, 0, cssW, cssH);

    // Subtle blueprint grid
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 18; x < cssW; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, cssH);
      ctx.stroke();
    }
    for (let y = 18; y < cssH; y += 24) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(cssW, y);
      ctx.stroke();
    }

    const sampleCount = 160;
    const pts: Array<{ x: number; z: number; isGap: boolean }> = [];
    const frame = {
      s: 0,
      position: new THREE.Vector3(),
      tangent: new THREE.Vector3(),
      up: new THREE.Vector3(),
      right: new THREE.Vector3(),
      width: trackWidth,
      bank: 0,
      isGap: false,
    };

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    const branches = course.getBranchRoutes();
    const branchPointLists: Array<Array<{ x: number; z: number; isGap: boolean }>> = [];

    for (let i = 0; i <= sampleCount; i++) {
      const s = (i / sampleCount) * totalLength;
      course.getFrameAt(s, frame);
      const px = frame.position.x;
      const pz = frame.position.z;
      pts.push({ x: px, z: pz, isGap: frame.isGap });
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (pz < minZ) minZ = pz;
      if (pz > maxZ) maxZ = pz;
    }

    for (const branch of branches) {
      const bLen = branch.getLength();
      const bCount = Math.max(24, Math.round((bLen / Math.max(1, totalLength)) * sampleCount));
      const bPts: Array<{ x: number; z: number; isGap: boolean }> = [];
      for (let i = 0; i <= bCount; i++) {
        const s = (i / bCount) * bLen;
        branch.getFrameAt(s, frame);
        const px = frame.position.x;
        const pz = frame.position.z;
        bPts.push({ x: px, z: pz, isGap: frame.isGap });
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (pz < minZ) minZ = pz;
        if (pz > maxZ) maxZ = pz;
      }
      branchPointLists.push(bPts);
    }

    const spanX = Math.max(10, maxX - minX);
    const spanZ = Math.max(10, maxZ - minZ);
    const pad = Math.min(cssW, cssH) * 0.14;
    const drawW = cssW - pad * 2;
    const drawH = cssH - pad * 2;
    const scale = Math.min(drawW / spanX, drawH / spanZ);
    const offsetX = (cssW - spanX * scale) * 0.5 - minX * scale;
    const offsetY = (cssH - spanZ * scale) * 0.5 - minZ * scale;

    const toCanvasX = (wx: number): number => wx * scale + offsetX;
    const toCanvasY = (wz: number): number => wz * scale + offsetY;

    const tracePath = (): void => {
      ctx.beginPath();
      let penDown = false;
      for (let i = 0; i < pts.length; i++) {
        const pt = pts[i];
        const cx = toCanvasX(pt.x);
        const cy = toCanvasY(pt.z);
        if (pt.isGap) {
          penDown = false;
          continue;
        }
        if (!penDown) {
          ctx.moveTo(cx, cy);
          penDown = true;
        } else {
          ctx.lineTo(cx, cy);
        }
      }
      if (def.closed && !pts[0].isGap && !pts[pts.length - 1].isGap) {
        ctx.closePath();
      }
    };

    // Dark outline casing
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.lineWidth = 7;
    tracePath();
    ctx.stroke();

    // Dashed indicator on gap jumps if present
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < pts.length - 1; i++) {
      if (pts[i].isGap || pts[i + 1].isGap) {
        ctx.moveTo(toCanvasX(pts[i].x), toCanvasY(pts[i].z));
        ctx.lineTo(toCanvasX(pts[i + 1].x), toCanvasY(pts[i + 1].z));
      }
    }
    ctx.stroke();
    ctx.restore();

    // Main orange track line
    ctx.strokeStyle = CONFIG.visual.presets.vivid.colors.track;
    ctx.lineWidth = 4;
    tracePath();
    ctx.stroke();

    // Bright center highlight
    ctx.strokeStyle = CONFIG.visual.presets.vivid.colors.trackEdge;
    ctx.lineWidth = 1.4;
    tracePath();
    ctx.stroke();

    // Branch shortcut dashed #00E5FF path(s)
    if (branchPointLists.length > 0) {
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = '#00E5FF';
      ctx.lineWidth = 2.2;
      for (const bPts of branchPointLists) {
        ctx.beginPath();
        let penDown = false;
        for (let i = 0; i < bPts.length; i++) {
          const pt = bPts[i];
          const cx = toCanvasX(pt.x);
          const cy = toCanvasY(pt.z);
          if (pt.isGap) {
            penDown = false;
            continue;
          }
          if (!penDown) {
            ctx.moveTo(cx, cy);
            penDown = true;
          } else {
            ctx.lineTo(cx, cy);
          }
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    // Checkpoints
    const checkpoints = course.getCheckpoints();
    for (const cp of checkpoints) {
      course.getFrameAt(cp.s, frame);
      const cx = toCanvasX(frame.position.x);
      const cy = toCanvasY(frame.position.z);
      ctx.fillStyle = CONFIG.visual.presets.vivid.colors.accent;
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, 3.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Start point + forward direction chevron
    const startSlot = course.getGridSlots(1)[0];
    course.getFrameAt(startSlot.s, frame);
    const sx = toCanvasX(frame.position.x);
    const sy = toCanvasY(frame.position.z);

    course.getFrameAt(startSlot.s + Math.min(28, totalLength * 0.05), frame);
    const ax = toCanvasX(frame.position.x);
    const ay = toCanvasY(frame.position.z);
    const dirAngle = Math.atan2(ay - sy, ax - sx);

    // Direction arrow ahead of start
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(dirAngle);
    ctx.fillStyle = '#00E5FF';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(6.5, 0);
    ctx.lineTo(-4, -4.4);
    ctx.lineTo(-1.8, 0);
    ctx.lineTo(-4, 4.4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Green start marker
    ctx.fillStyle = '#22C55E';
    ctx.strokeStyle = '#FFFDF7';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(sx, sy, 4.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  const cached: CachedCourseMinimap = {
    canvas,
    totalLength,
    trackWidth,
  };
  minimapCache.set(def.id, cached);
  return cached;
}

export function createCourseSelect(
  container: HTMLElement,
  courses: readonly CourseDefinition[],
  selectedId: string,
  onSelect: (id: string) => void,
  onConfirm: () => void,
): CourseSelectHandle {
  let currentSelectedId = selectedId;
  let disposed = false;

  const gridEl = document.createElement('div');
  gridEl.className = 'sr-arena-grid';
  gridEl.setAttribute('role', 'listbox');
  gridEl.setAttribute('aria-label', 'Pilih Arena Balapan');

  const cardById = new Map<string, HTMLButtonElement>();
  const recordElById = new Map<string, HTMLElement>();
  const cleanups: Array<() => void> = [];

  for (const def of courses) {
    const minimap = getOrBuildMinimap(def);

    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'sr-arena-card';
    card.dataset.courseId = def.id;
    card.setAttribute('role', 'option');
    card.setAttribute('aria-selected', def.id === currentSelectedId ? 'true' : 'false');

    const topRow = document.createElement('div');
    topRow.className = 'sr-arena-top';

    const numBadge = document.createElement('span');
    numBadge.className = 'sr-arena-num';
    numBadge.textContent = `ARENA ${def.arenaNumber}`;
    topRow.appendChild(numBadge);

    const typeBadge = document.createElement('span');
    typeBadge.className = 'sr-arena-type';
    typeBadge.textContent = def.typeLabel;
    topRow.appendChild(typeBadge);
    card.appendChild(topRow);

    const mapWrap = document.createElement('div');
    mapWrap.className = 'sr-arena-map-wrap';
    const displayCanvas = document.createElement('canvas');
    displayCanvas.className = 'sr-arena-map';
    displayCanvas.width = minimap.canvas.width;
    displayCanvas.height = minimap.canvas.height;
    displayCanvas.setAttribute('aria-hidden', 'true');
    const displayCtx = displayCanvas.getContext('2d');
    if (displayCtx) {
      displayCtx.drawImage(minimap.canvas, 0, 0);
    }
    mapWrap.appendChild(displayCanvas);
    card.appendChild(mapWrap);

    const titleEl = document.createElement('div');
    titleEl.className = 'sr-arena-name';
    titleEl.textContent = def.displayName;
    card.appendChild(titleEl);

    const taglineEl = document.createElement('div');
    taglineEl.className = 'sr-arena-tagline';
    taglineEl.textContent = def.tagline;
    card.appendChild(taglineEl);

    const specsEl = document.createElement('div');
    specsEl.className = 'sr-arena-specs';
    specsEl.textContent = `Lebar ${minimap.trackWidth} m • ${Math.round(minimap.totalLength)} m`;
    card.appendChild(specsEl);

    const recordEl = document.createElement('div');
    recordEl.className = 'sr-arena-record';
    card.appendChild(recordEl);

    const onCardClick = (e: MouseEvent): void => {
      e.stopPropagation();
      card.blur();
      if (def.id !== currentSelectedId) {
        setSelected(def.id);
        onSelect(def.id);
      }
    };

    const onCardDblClick = (e: MouseEvent): void => {
      e.stopPropagation();
      const isTouchDevice =
        (typeof window !== 'undefined' && Boolean(window.matchMedia?.('(pointer: coarse)').matches)) ||
        (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
      if (isTouchDevice) {
        return;
      }
      if (def.id !== currentSelectedId) {
        setSelected(def.id);
        onSelect(def.id);
      }
      onConfirm();
    };

    card.addEventListener('click', onCardClick);
    card.addEventListener('dblclick', onCardDblClick);
    cleanups.push(() => {
      card.removeEventListener('click', onCardClick);
      card.removeEventListener('dblclick', onCardDblClick);
    });

    cardById.set(def.id, card);
    recordElById.set(def.id, recordEl);
    gridEl.appendChild(card);
  }

  container.textContent = '';
  container.appendChild(gridEl);

  function setSelected(id: string): void {
    currentSelectedId = id;
    for (const [courseId, card] of cardById) {
      const selected = courseId === currentSelectedId;
      card.classList.toggle('sr-arena-card--selected', selected);
      card.setAttribute('aria-selected', selected ? 'true' : 'false');
    }
  }

  function refreshRecords(): void {
    for (const def of courses) {
      const recordEl = recordElById.get(def.id);
      if (!recordEl) continue;
      const records = getRecords(def.id, def.medals);
      const best = records.best;
      recordEl.textContent = '';

      if (best) {
        const medalHtml = createSmallMedalSvg(best.medal);
        if (medalHtml) {
          recordEl.insertAdjacentHTML('beforeend', medalHtml);
        }
        const label = document.createElement('span');
        label.className = 'sr-arena-record-time';
        label.textContent =
          best.medal !== 'none'
            ? `${formatMedalLabel(best.medal)} • ${formatRaceTime(best.time)}`
            : `Rekor ${formatRaceTime(best.time)}`;
        recordEl.appendChild(label);
      } else {
        const empty = document.createElement('span');
        empty.className = 'sr-arena-record-empty';
        empty.textContent = 'Belum ada rekor';
        recordEl.appendChild(empty);
      }
    }
  }

  function dispose(): void {
    if (disposed) {
      return;
    }
    disposed = true;
    for (const fn of cleanups) {
      fn();
    }
    cleanups.length = 0;
    cardById.clear();
    recordElById.clear();
    if (gridEl.parentElement === container) {
      container.removeChild(gridEl);
    }
  }

  setSelected(currentSelectedId);
  refreshRecords();

  return {
    setSelected,
    refreshRecords,
    dispose,
  };
}
