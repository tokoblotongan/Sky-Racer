// src/courses/fantasyLandDecor.ts

import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Course, Route, TrackFrame } from '../core/course';

export type FantasyDecorQuality = 'high' | 'medium' | 'mobile' | 'low';

export type FantasyDecorType =
  | 'castle'
  | 'crystals'
  | 'floatingIslands'
  | 'rainbow'
  | 'ferrisWheel'
  | 'balloons'
  | 'parkProps';

export type FantasyDecorSide = 'left' | 'right' | 'center' | 'over';

export interface FantasyDecorPlacementSpec {
  type: FantasyDecorType;
  s: number;
  side: FantasyDecorSide;
  distance: number;
  scale: number;
  variant: string;
  seed: number;
}

export interface DecorVec3 {
  x: number;
  y: number;
  z: number;
}

export interface DecorFootprintLeg {
  x: number;
  y: number;
  z: number;
  radius: number;
}

export interface ResolvedDecorPlacement {
  id: string;
  spec: FantasyDecorPlacementSpec;
  position: DecorVec3;
  tangent: DecorVec3;
  right: DecorVec3;
  yaw: number;
  footprintRadius: number;
  halfHeight: number;
  groundY: number;
  isOverhead: boolean;
  legs?: DecorFootprintLeg[];
  halfSpan?: number;
  apexHeightAboveTrack?: number;
}

export interface FantasyDecorPlan {
  quality: 'high' | 'medium' | 'mobile';
  placements: ResolvedDecorPlacement[];
  specs: FantasyDecorPlacementSpec[];
}

export interface DecorTierEstimate {
  tier: 'high' | 'medium' | 'mobile';
  drawCalls: number;
  triangles: number;
  budgetDrawCalls: number;
  budgetTriangles: number;
  withinBudget: boolean;
}

interface TrackClearanceSample {
  x: number;
  y: number;
  z: number;
  hw: number;
  s: number;
  routeId: string;
  isGap: boolean;
  isJumpZone: boolean;
  isGateZone: boolean;
}

function normalizeDecorQuality(quality: FantasyDecorQuality): 'high' | 'medium' | 'mobile' {
  if (quality === 'high') return 'high';
  if (quality === 'medium') return 'medium';
  return 'mobile';
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function collectTrackClearanceSamples(course: Course): TrackClearanceSample[] {
  const result: TrackClearanceSample[] = [];
  const routes: readonly Route[] = course.getAllRoutes();
  const branchRoutes = course.getBranchRoutes();
  const jumpMargin = CONFIG.fantasy.jumpExclusionMargin;
  const gateMargin = CONFIG.fantasy.gateExclusionMargin;
  const tmpFrame: TrackFrame = {
    s: 0,
    position: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
    up: new THREE.Vector3(),
    right: new THREE.Vector3(),
    width: course.getTrackWidth(),
    bank: 0,
  };

  for (const route of routes) {
    const len = route.getLength();
    const segs = route.getSegmentList();
    const jumpRanges: Array<{ startS: number; endS: number }> = [];
    for (const seg of segs) {
      if (seg.type === 'gap') {
        jumpRanges.push({
          startS: seg.startS - jumpMargin,
          endS: seg.endS + 32 + jumpMargin,
        });
      }
    }

    const gateRanges: Array<{ startS: number; endS: number }> = [];
    if (route.routeId === 'main') {
      for (const br of branchRoutes) {
        gateRanges.push({
          startS: br.fromS - gateMargin,
          endS: br.fromS + br.entryGapLength + gateMargin,
        });
        gateRanges.push({
          startS: br.toS - br.mergeGapLength - gateMargin,
          endS: br.toS + gateMargin,
        });
      }
    } else {
      const br = branchRoutes.find((b) => b.routeId === route.routeId);
      if (br) {
        gateRanges.push({ startS: 0, endS: br.entryGapLength + gateMargin });
        gateRanges.push({ startS: len - br.mergeGapLength - gateMargin, endS: len });
      }
    }

    for (let s = 0; s <= len; s += 2.0) {
      route.getFrameAt(s, tmpFrame);
      const isJumpZone = jumpRanges.some((r) => s >= r.startS && s <= r.endS);
      const isGateZone = gateRanges.some((r) => s >= r.startS && s <= r.endS);
      result.push({
        x: tmpFrame.position.x,
        y: tmpFrame.position.y,
        z: tmpFrame.position.z,
        hw: tmpFrame.width * 0.5,
        s,
        routeId: route.routeId,
        isGap: Boolean(tmpFrame.isGap),
        isJumpZone,
        isGateZone,
      });
    }
  }

  return result;
}

function isCircleClearOfRoutes(
  x: number,
  y: number,
  z: number,
  radius: number,
  halfHeight: number,
  samples: readonly TrackClearanceSample[],
  minClearance: number,
  overTrackClearance: number,
  forbidOverJumpOrGate: boolean,
  allowVerticalBypass = false,
): boolean {
  for (let i = 0; i < samples.length; i++) {
    const pt = samples[i];
    const distXZ = Math.hypot(x - pt.x, z - pt.z);
    const reqDist = pt.hw + radius + minClearance;
    if (distXZ < reqDist) {
      if (forbidOverJumpOrGate && (pt.isJumpZone || pt.isGateZone)) {
        return false;
      }
      if (!allowVerticalBypass) {
        return false;
      }
      const vertGap = Math.abs(y - pt.y) - halfHeight;
      if (vertGap < overTrackClearance) {
        return false;
      }
    } else if (forbidOverJumpOrGate && (pt.isJumpZone || pt.isGateZone) && distXZ < reqDist + 5) {
      return false;
    }
  }
  return true;
}

function resolveCandidatePosition(
  frame: TrackFrame,
  side: FantasyDecorSide,
  distance: number,
  y: number,
): DecorVec3 {
  const sign = side === 'left' ? -1 : side === 'right' ? 1 : 0;
  return {
    x: frame.position.x + frame.right.x * sign * distance,
    y,
    z: frame.position.z + frame.right.z * sign * distance,
  };
}

function findSafeDistance(
  frame: TrackFrame,
  side: 'left' | 'right',
  startDist: number,
  y: number,
  radius: number,
  halfHeight: number,
  samples: readonly TrackClearanceSample[],
  minClearance: number,
  overTrackClearance: number,
  maxExpandSteps = 18,
  stepMeters = 4,
): number | null {
  for (let step = 0; step <= maxExpandSteps; step++) {
    const dist = startDist + step * stepMeters;
    const pos = resolveCandidatePosition(frame, side, dist, y);
    if (
      isCircleClearOfRoutes(
        pos.x,
        pos.y,
        pos.z,
        radius,
        halfHeight,
        samples,
        minClearance,
        overTrackClearance,
        true,
      )
    ) {
      return dist;
    }
  }
  return null;
}

function findZoneSpan(
  course: Course,
  zoneName: string,
): { startS: number; endS: number; midS: number } | null {
  const segs = course.getSegmentList().filter((seg) => seg.name === zoneName);
  if (segs.length === 0) return null;
  const startS = segs[0].startS;
  const endS = segs[segs.length - 1].endS;
  return { startS, endS, midS: (startS + endS) * 0.5 };
}

export function buildFantasyLandDecorPlan(
  course: Course,
  quality: FantasyDecorQuality = 'high',
): FantasyDecorPlan {
  const tier = normalizeDecorQuality(quality);
  const fCfg = CONFIG.fantasy;
  const minClear = fCfg.minClearance;
  const overClear = fCfg.overTrackClearance;
  const samples = collectTrackClearanceSamples(course);
  const totalLen = course.getLength();
  const bounds = course.getBounds();
  const zoneStarts = course.getZoneStarts();
  const segs = course.getSegmentList();
  const styleRuns = course.getStyleRuns();

  const placements: ResolvedDecorPlacement[] = [];
  const specs: FantasyDecorPlacementSpec[] = [];
  const landmarkOccupied: Array<{ x: number; z: number; r: number }> = [];

  const isFreeOfLandmarks = (x: number, z: number, r: number): boolean => {
    for (const o of landmarkOccupied) {
      if (Math.hypot(x - o.x, z - o.z) < r + o.r + 3) {
        return false;
      }
    }
    return true;
  };

  const pushPlacement = (
    id: string,
    spec: FantasyDecorPlacementSpec,
    frame: TrackFrame,
    pos: DecorVec3,
    yaw: number,
    footprintRadius: number,
    halfHeight: number,
    groundY: number,
    isOverhead = false,
    extras?: {
      legs?: DecorFootprintLeg[];
      halfSpan?: number;
      apexHeightAboveTrack?: number;
    },
  ): void => {
    specs.push(spec);
    placements.push({
      id,
      spec,
      position: pos,
      tangent: { x: frame.tangent.x, y: frame.tangent.y, z: frame.tangent.z },
      right: { x: frame.right.x, y: frame.right.y, z: frame.right.z },
      yaw,
      footprintRadius,
      halfHeight,
      groundY,
      isOverhead,
      legs: extras?.legs,
      halfSpan: extras?.halfSpan,
      apexHeightAboveTrack: extras?.apexHeightAboveTrack,
    });
    if (!isOverhead) {
      landmarkOccupied.push({ x: pos.x, z: pos.z, r: footprintRadius });
    } else if (extras?.legs) {
      for (const leg of extras.legs) {
        landmarkOccupied.push({ x: leg.x, z: leg.z, r: leg.radius });
      }
    }
  };

  // -------------------------------------------------------------------------
  // 1. KASTIL (inside circuit, visible from start straight & grid)
  // -------------------------------------------------------------------------
  {
    const anchorS = 88;
    const f = course.getFrameAt(anchorS);
    const side: 'left' | 'right' = 'right';
    const footprint = tier === 'mobile' ? 25 : 29;
    const castleHalfH = 34;
    const safeDist =
      findSafeDistance(f, side, 108, castleHalfH, footprint, castleHalfH, samples, minClear, overClear, 20, 4) ??
      112;
    const pos = resolveCandidatePosition(f, side, safeDist, 0);
    const startFrame = course.getFrameAt(CONFIG.car.startS);
    const faceYaw = Math.atan2(startFrame.position.x - pos.x, startFrame.position.z - pos.z);
    const spec: FantasyDecorPlacementSpec = {
      type: 'castle',
      s: anchorS,
      side,
      distance: Number(safeDist.toFixed(2)),
      scale: 1.0,
      variant: tier === 'mobile' ? 'simple' : 'palace',
      seed: 1001,
    };
    pushPlacement('castle_main', spec, f, pos, faceYaw, footprint, castleHalfH, 0);
  }

  // -------------------------------------------------------------------------
  // 2. CINCIN KRISTAL DRAGON LOOP
  // -------------------------------------------------------------------------
  {
    const loopZone =
      zoneStarts.find((z) => z.name === 'Dragon Loop')?.s ??
      segs.find((s) => s.type === 'loop')?.startS ??
      613;
    const loopSeg = segs.find((s) => s.type === 'loop');
    const loopStartS = loopSeg?.startS ?? loopZone;
    const loopEndS = loopSeg?.endS ?? loopZone + 150;
    const loopMidS = (loopStartS + loopEndS) * 0.5;
    const loopCenterFrame = course.getFrameAt(loopMidS);
    const loopBaseFrame = course.getFrameAt(loopStartS);

    const densityFactor = fCfg.counts.crystalDensity[tier];
    const totalRingClusters = Math.max(6, Math.round(16 * densityFactor));
    const rand = mulberry32(2049);

    for (let i = 0; i < totalRingClusters; i++) {
      const angle = (i / totalRingClusters) * Math.PI * 2;
      const ringDist = 42 + (i % 2) * 9;
      const cx = loopCenterFrame.position.x + Math.cos(angle) * ringDist;
      const cz = loopCenterFrame.position.z + Math.sin(angle) * ringDist;
      const scale = 0.85 + (i % 3) * 0.25;
      const rad = 4.2 * scale;
      const halfH = 7.5 * scale;
      const cy = Math.max(0, loopBaseFrame.position.y - 16 + (i % 3) * 8);

      // Push outward along radial if needed so crystal ring clears loop & adjacent straights
      let finalX = cx;
      let finalZ = cz;
      let clear = false;
      for (let push = 0; push < 14; push++) {
        const tryR = ringDist + push * 3.5;
        finalX = loopCenterFrame.position.x + Math.cos(angle) * tryR;
        finalZ = loopCenterFrame.position.z + Math.sin(angle) * tryR;
        if (
          isCircleClearOfRoutes(finalX, cy, finalZ, rad, halfH, samples, minClear, overClear, true) &&
          isFreeOfLandmarks(finalX, finalZ, rad)
        ) {
          clear = true;
          break;
        }
      }
      if (!clear) continue;

      const side: FantasyDecorSide = Math.sin(angle) >= 0 ? 'right' : 'left';
      const variantColor = i % 3 === 0 ? 'cyan' : i % 3 === 1 ? 'magenta' : 'yellow';
      const spec: FantasyDecorPlacementSpec = {
        type: 'crystals',
        s: Number(loopMidS.toFixed(2)),
        side,
        distance: Number(Math.hypot(finalX - loopBaseFrame.position.x, finalZ - loopBaseFrame.position.z).toFixed(2)),
        scale: Number(scale.toFixed(2)),
        variant: `ring-${variantColor}`,
        seed: 2100 + i * 17,
      };
      pushPlacement(
        `crystal_ring_${i}`,
        spec,
        loopBaseFrame,
        { x: finalX, y: cy, z: finalZ },
        angle + rand() * 0.5,
        rad,
        halfH,
        0,
      );
    }
  }

  // -------------------------------------------------------------------------
  // 3. KRISTAL PORTAL TEROWONGAN KRISTAL (Entry & Exit)
  // -------------------------------------------------------------------------
  {
    const tunnelRun =
      styleRuns.find((r) => r.name === 'Terowongan Kristal' || r.style === 'tunnel') ?? null;
    if (tunnelRun) {
      const portalOffsets = [
        { s: Math.max(0, tunnelRun.startS - 4), tag: 'entry' },
        { s: Math.min(totalLen - 1, tunnelRun.endS + 4), tag: 'exit' },
      ];
      const colors = ['cyan', 'magenta', 'yellow'] as const;
      let pIdx = 0;
      for (const po of portalOffsets) {
        const pf = course.getFrameAt(po.s);
        for (const side of ['left', 'right'] as const) {
          const scale = tier === 'mobile' ? 0.95 : 1.12;
          const rad = 3.8 * scale;
          const halfH = 7.2 * scale;
          const y = pf.position.y - 1.2;
          const safeDist = findSafeDistance(
            pf,
            side,
            24.5,
            y,
            rad,
            halfH,
            samples,
            minClear,
            overClear,
            10,
            2.5,
          );
          if (safeDist === null) continue;
          const pos = resolveCandidatePosition(pf, side, safeDist, y);
          const yaw = Math.atan2(pf.tangent.x, pf.tangent.z);
          const colorTag = colors[pIdx % colors.length];
          const spec: FantasyDecorPlacementSpec = {
            type: 'crystals',
            s: Number(po.s.toFixed(2)),
            side,
            distance: Number(safeDist.toFixed(2)),
            scale: Number(scale.toFixed(2)),
            variant: `portal-${po.tag}-${colorTag}`,
            seed: 2600 + pIdx * 31,
          };
          pushPlacement(`crystal_portal_${po.tag}_${side}`, spec, pf, pos, yaw, rad, halfH, 0);
          pIdx++;
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // 4. PULAU MELAYANG DI SEPANJANG JEMBATAN PELANGI
  // -------------------------------------------------------------------------
  {
    const bridgeSpan = findZoneSpan(course, 'Jembatan Pelangi');
    const bridgeStart = bridgeSpan?.startS ?? 964;
    const bridgeEnd = bridgeSpan?.endS ?? 1164;
    const islandCount: number = fCfg.counts.floatingIslands[tier];
    const rand = mulberry32(3301);

    for (let i = 0; i < islandCount; i++) {
      const t = islandCount <= 1 ? 0.5 : i / (islandCount - 1);
      const s = THREE.MathUtils.lerp(bridgeStart + 16, bridgeEnd - 16, t);
      const f = course.getFrameAt(s);
      const side: 'left' | 'right' = 'left';
      const scale = 0.88 + (i % 3) * 0.16;
      const rad = 11.5 * scale;
      const halfH = 11 * scale;
      const y = f.position.y + 7 + (i % 3) * 7.5;
      const startDist = 48 + (i % 2) * 14;
      const safeDist = findSafeDistance(
        f,
        side,
        startDist,
        y,
        rad,
        halfH,
        samples,
        minClear + 6,
        overClear,
        14,
        4,
      );
      if (safeDist === null) continue;
      const pos = resolveCandidatePosition(f, side, safeDist, y);
      if (!isFreeOfLandmarks(pos.x, pos.z, rad)) continue;

      const yaw = Math.atan2(f.tangent.x, f.tangent.z) + (rand() - 0.5) * 0.7;
      const spec: FantasyDecorPlacementSpec = {
        type: 'floatingIslands',
        s: Number(s.toFixed(2)),
        side,
        distance: Number(safeDist.toFixed(2)),
        scale: Number(scale.toFixed(2)),
        variant: tier === 'mobile' ? 'no-waterfall' : i % 2 === 0 ? 'waterfall-tall' : 'waterfall-wide',
        seed: 3400 + i * 29,
      };
      pushPlacement(`floating_island_${i}`, spec, f, pos, yaw, rad, halfH, y - 9 * scale);
    }
  }

  // -------------------------------------------------------------------------
  // 5. PELANGI RAKSASA MELINTANG DI ATAS LOMPATAN NAGA
  // -------------------------------------------------------------------------
  {
    const nagaGap =
      segs.find((s) => s.name === 'Lompatan Naga' && s.type === 'gap') ??
      segs.find((s) => s.type === 'gap');
    const archS = nagaGap ? (nagaGap.startS + nagaGap.endS) * 0.5 : 1452;
    const f = course.getFrameAt(archS);
    const legRadius = 4.2;
    const legHalfH = 12;
    const bandHalfW = 4.8;
    const apexHeightAboveTrack = 48; // >= 35 m above track and >= 25 m overTrackClearance
    const apexWorldY = f.position.y + apexHeightAboveTrack;

    const rightHoriz = new THREE.Vector3(f.right.x, 0, f.right.z).normalize();
    const fwdHoriz = new THREE.Vector3(-rightHoriz.z, 0, rightHoriz.x).normalize();

    const isArchCurveClear = (candidateHalfSpan: number): boolean => {
      const innerR = Math.max(10, candidateHalfSpan - bandHalfW);
      const innerH = Math.max(10, apexWorldY - bandHalfW);
      for (let i = 0; i < samples.length; i++) {
        const pt = samples[i];
        const dx = pt.x - f.position.x;
        const dz = pt.z - f.position.z;
        const alongFwd = Math.abs(dx * fwdHoriz.x + dz * fwdHoriz.z);
        if (alongFwd > pt.hw + 3.0 + minClear * 0.5) continue;
        const alongRight = Math.abs(dx * rightHoriz.x + dz * rightHoriz.z);
        if (alongRight > candidateHalfSpan + bandHalfW + pt.hw + minClear) continue;

        if (alongRight >= innerR - pt.hw - minClear) {
          // Near leg touchdown zone: require full lateral clearance at ground if below arch height
          const u = Math.min(1, alongRight / innerR);
          const archBottomY = innerH * Math.sqrt(Math.max(0, 1 - u * u));
          if (archBottomY - pt.y < overClear) {
            return false;
          }
        } else {
          const u = Math.min(1, alongRight / innerR);
          const archBottomY = innerH * Math.sqrt(Math.max(0, 1 - u * u));
          if (archBottomY - pt.y < overClear) {
            return false;
          }
        }
      }
      return true;
    };

    // Expand halfSpan symmetrically so BOTH legs & entire arch curve clear main track + shortcut branch
    let halfSpan = 88;
    for (let trySpan = 58; trySpan <= 136; trySpan += 3) {
      const leftPos = resolveCandidatePosition(f, 'left', trySpan, 0);
      const rightPos = resolveCandidatePosition(f, 'right', trySpan, 0);
      const leftOk = isCircleClearOfRoutes(
        leftPos.x,
        legHalfH,
        leftPos.z,
        legRadius,
        legHalfH,
        samples,
        minClear,
        overClear,
        true,
      );
      const rightOk = isCircleClearOfRoutes(
        rightPos.x,
        legHalfH,
        rightPos.z,
        legRadius,
        legHalfH,
        samples,
        minClear,
        overClear,
        true,
      );
      if (leftOk && rightOk && isArchCurveClear(trySpan)) {
        halfSpan = trySpan;
        break;
      }
    }

    const leftLegPos = resolveCandidatePosition(f, 'left', halfSpan, 0);
    const rightLegPos = resolveCandidatePosition(f, 'right', halfSpan, 0);
    const legs: DecorFootprintLeg[] = [
      { x: leftLegPos.x, y: 0, z: leftLegPos.z, radius: legRadius },
      { x: rightLegPos.x, y: 0, z: rightLegPos.z, radius: legRadius },
    ];

    const archYaw = Math.atan2(f.tangent.x, f.tangent.z);
    const spec: FantasyDecorPlacementSpec = {
      type: 'rainbow',
      s: Number(archS.toFixed(2)),
      side: 'over',
      distance: halfSpan,
      scale: 1.0,
      variant: 'seven-band',
      seed: 4001,
    };

    pushPlacement(
      'rainbow_naga',
      spec,
      f,
      { x: f.position.x, y: apexWorldY, z: f.position.z },
      archYaw,
      halfSpan,
      4,
      0,
      true,
      { legs, halfSpan, apexHeightAboveTrack },
    );
  }

  // -------------------------------------------------------------------------
  // 6. KINCIR RAKSASA (FERRIS WHEEL) DEKAT HAIRPIN
  // -------------------------------------------------------------------------
  {
    const hairpinSeg =
      segs.find((s) => s.type === 'curve' && s.config.type === 'curve' && Math.abs(s.config.angleDeg) >= 120) ??
      segs[19];
    const hairpinMidS = hairpinSeg ? (hairpinSeg.startS + hairpinSeg.endS) * 0.5 : 1620;
    const f = course.getFrameAt(hairpinMidS);
    const side: 'left' | 'right' = 'left'; // outer side of right-turn hairpin
    const baseRadius = 15;
    const halfH = 39;
    const safeDist =
      findSafeDistance(f, side, 62, halfH, baseRadius, halfH, samples, minClear + 4, overClear, 16, 4) ??
      66;
    const pos = resolveCandidatePosition(f, side, safeDist, 0);
    const yaw = Math.atan2(f.tangent.x, f.tangent.z) + Math.PI * 0.15;

    const spec: FantasyDecorPlacementSpec = {
      type: 'ferrisWheel',
      s: Number(hairpinMidS.toFixed(2)),
      side,
      distance: Number(safeDist.toFixed(2)),
      scale: 1.0,
      variant: tier === 'mobile' ? 'static-gondolas' : 'animated-gondolas',
      seed: 5001,
    };
    pushPlacement('ferris_wheel_hairpin', spec, f, pos, yaw, baseRadius, halfH, 0);
  }

  // -------------------------------------------------------------------------
  // 7. BALON UDARA BERWARNA-WARNI (12-24 high, 12 medium, 8 mobile)
  // -------------------------------------------------------------------------
  {
    const balloonCount = fCfg.counts.balloons[tier];
    const rand = mulberry32(6007);
    for (let i = 0; i < balloonCount; i++) {
      const s = ((i + 0.35) / balloonCount) * totalLen;
      const f = course.getFrameAt(s);
      const side: 'left' | 'right' = i % 2 === 0 ? 'left' : 'right';
      const dist = 42 + rand() * 52;
      const scale = 0.85 + rand() * 0.45;
      const rad = 5.5 * scale;
      const halfH = 9.0 * scale;
      const y = Math.max(58, f.position.y + 32) + (i % 4) * 14;
      const pos = resolveCandidatePosition(f, side, dist, y);

      if (
        !isCircleClearOfRoutes(pos.x, pos.y, pos.z, rad, halfH, samples, minClear, overClear, false, true)
      ) {
        // Lift safely above overTrackClearance if passing over a corridor
        pos.y = f.position.y + overClear + halfH + 14;
      }

      const spec: FantasyDecorPlacementSpec = {
        type: 'balloons',
        s: Number(s.toFixed(2)),
        side,
        distance: Number(dist.toFixed(2)),
        scale: Number(scale.toFixed(2)),
        variant: `balloon-${i % fCfg.palette.balloonColors.length}`,
        seed: 6100 + i * 23,
      };
      pushPlacement(`balloon_${i}`, spec, f, pos, rand() * Math.PI * 2, rad, halfH, pos.y - halfH, true);
    }
  }

  // -------------------------------------------------------------------------
  // 8. PARK PROPS: LAMPU TAMAN, TIANG BENDERA & TAMAN BUNGA
  // -------------------------------------------------------------------------
  {
    const lampStep = fCfg.counts.lampSpacing[tier];
    const flagStep = fCfg.counts.flagSpacing[tier];
    const flowerCount = fCfg.counts.flowerPatches[tier];

    const isEligibleRoadS = (s: number): boolean => {
      const segInfo = course.getSegmentAt(s);
      if (segInfo.type === 'gap' || segInfo.type === 'loop') return false;
      const style = course.getStyleAt(s);
      if (style !== 'road') return false;
      if (course.isRailGapAt(s, -1) || course.isRailGapAt(s, 1)) return false;
      return true;
    };

    // Garden Lamps
    let lampIdx = 0;
    for (let s = 26; s < totalLen - 18; s += lampStep) {
      if (!isEligibleRoadS(s)) continue;
      const f = course.getFrameAt(s);
      const side: 'left' | 'right' = lampIdx % 2 === 0 ? 'left' : 'right';
      const dist = f.width * 0.5 + minClear + 2.2;
      const pos = resolveCandidatePosition(f, side, dist, f.position.y);
      const rad = 1.4;
      if (
        !isCircleClearOfRoutes(pos.x, pos.y, pos.z, rad, 4.5, samples, minClear, overClear, true) ||
        !isFreeOfLandmarks(pos.x, pos.z, rad)
      ) {
        lampIdx++;
        continue;
      }
      const yaw = Math.atan2(f.tangent.x, f.tangent.z);
      const spec: FantasyDecorPlacementSpec = {
        type: 'parkProps',
        s: Number(s.toFixed(2)),
        side,
        distance: Number(dist.toFixed(2)),
        scale: 1.0,
        variant: 'lamp',
        seed: 7100 + lampIdx,
      };
      pushPlacement(`prop_lamp_${lampIdx}`, spec, f, pos, yaw, rad, 4.5, 0);
      lampIdx++;
    }

    // Waving Flag Poles
    let flagIdx = 0;
    for (let s = 42; s < totalLen - 24; s += flagStep) {
      if (!isEligibleRoadS(s)) continue;
      const f = course.getFrameAt(s);
      const side: 'left' | 'right' = flagIdx % 2 === 0 ? 'right' : 'left';
      const dist = f.width * 0.5 + minClear + 3.8;
      const pos = resolveCandidatePosition(f, side, dist, f.position.y);
      const rad = 1.5;
      if (
        !isCircleClearOfRoutes(pos.x, pos.y, pos.z, rad, 5.5, samples, minClear, overClear, true) ||
        !isFreeOfLandmarks(pos.x, pos.z, rad)
      ) {
        flagIdx++;
        continue;
      }
      const yaw = Math.atan2(f.tangent.x, f.tangent.z);
      const spec: FantasyDecorPlacementSpec = {
        type: 'parkProps',
        s: Number(s.toFixed(2)),
        side,
        distance: Number(dist.toFixed(2)),
        scale: 1.0,
        variant: 'flag',
        seed: 7400 + flagIdx,
      };
      pushPlacement(`prop_flag_${flagIdx}`, spec, f, pos, yaw, rad, 5.5, 0);
      flagIdx++;
    }

    // Crisp Flower Patches along outer meadow border & inner lawns (omitted on mobile/low)
    if (flowerCount > 0) {
      const rand = mulberry32(7803);
      const spanX = bounds.max.x - bounds.min.x;
      const spanZ = bounds.max.z - bounds.min.z;
      const trackReach = Math.max(140, Math.hypot(spanX, spanZ) * 0.55);
      const islandRadius = trackReach + 125;

      let placedFlowers = 0;
      for (let attempt = 0; attempt < flowerCount * 24 && placedFlowers < flowerCount; attempt++) {
        const angle = (attempt / (flowerCount * 1.1)) * Math.PI * 2 + rand() * 0.4;
        const rDist = 35 + rand() * (islandRadius - 56);
        const fx = bounds.center.x + Math.cos(angle) * rDist;
        const fz = bounds.center.z + Math.sin(angle) * rDist;
        const scale = 0.85 + rand() * 0.6;
        const rad = 4.5 * scale;
        if (
          !isCircleClearOfRoutes(fx, 0, fz, rad, 1.0, samples, minClear + 2, overClear, true) ||
          !isFreeOfLandmarks(fx, fz, rad)
        ) {
          continue;
        }
        const nearFrame = course.getFrameAt(0);
        const spec: FantasyDecorPlacementSpec = {
          type: 'parkProps',
          s: 0,
          side: 'center',
          distance: Number(rDist.toFixed(2)),
          scale: Number(scale.toFixed(2)),
          variant: 'flowers',
          seed: 7900 + placedFlowers,
        };
        pushPlacement(
          `prop_flowers_${placedFlowers}`,
          spec,
          nearFrame,
          { x: fx, y: 0.08, z: fz },
          rand() * Math.PI * 2,
          rad,
          1.0,
          0,
        );
        placedFlowers++;
      }
    }
  }

  return {
    quality: tier,
    placements,
    specs,
  };
}

export function estimateFantasyDecorBudgets(course: Course): DecorTierEstimate[] {
  const tiers: Array<'high' | 'medium' | 'mobile'> = ['high', 'medium', 'mobile'];
  return tiers.map((tier) => {
    const plan = buildFantasyLandDecorPlan(course, tier);
    const counts = {
      castle: 0,
      crystals: 0,
      floatingIslands: 0,
      rainbow: 0,
      ferrisWheel: 0,
      balloons: 0,
      lamps: 0,
      flags: 0,
      flowers: 0,
    };
    for (const p of plan.placements) {
      if (p.spec.type === 'castle') counts.castle++;
      else if (p.spec.type === 'crystals') counts.crystals++;
      else if (p.spec.type === 'floatingIslands') counts.floatingIslands++;
      else if (p.spec.type === 'rainbow') counts.rainbow++;
      else if (p.spec.type === 'ferrisWheel') counts.ferrisWheel++;
      else if (p.spec.type === 'balloons') counts.balloons++;
      else if (p.spec.type === 'parkProps') {
        if (p.spec.variant === 'lamp') counts.lamps++;
        else if (p.spec.variant === 'flag') counts.flags++;
        else if (p.spec.variant === 'flowers') counts.flowers++;
      }
    }

    // Analytical draw calls and triangles matching the modular InstancedMesh + merged generators
    let drawCalls = 0;
    let triangles = 0;

    if (counts.castle > 0) {
      drawCalls += tier === 'mobile' ? 2 : 3;
      triangles += tier === 'mobile' ? 1850 : 4600;
    }
    if (counts.crystals > 0) {
      drawCalls += 4; // 3 emissive colors + 1 ground plinth instanced mesh
      triangles += counts.crystals * (tier === 'mobile' ? 88 : 132);
    }
    if (counts.floatingIslands > 0) {
      drawCalls += tier === 'mobile' ? counts.floatingIslands : counts.floatingIslands * 2;
      triangles += counts.floatingIslands * (tier === 'mobile' ? 320 : 620);
    }
    if (counts.rainbow > 0) {
      drawCalls += 1;
      triangles += tier === 'mobile' ? 480 : 960;
    }
    if (counts.ferrisWheel > 0) {
      drawCalls += tier === 'mobile' ? 2 : 4;
      triangles += tier === 'mobile' ? 2600 : 5200;
    }
    if (counts.balloons > 0) {
      drawCalls += 2;
      triangles += counts.balloons * (tier === 'mobile' ? 240 : 420);
    }
    if (counts.lamps > 0) {
      drawCalls += 2;
      triangles += counts.lamps * 120;
    }
    if (counts.flags > 0) {
      drawCalls += 2;
      triangles += counts.flags * 76;
    }
    if (counts.flowers > 0) {
      drawCalls += 1;
      triangles += counts.flowers * 64;
    }

    const budget = CONFIG.fantasy.budgets[tier];
    return {
      tier,
      drawCalls,
      triangles,
      budgetDrawCalls: budget.drawCalls,
      budgetTriangles: budget.triangles,
      withinBudget: drawCalls <= budget.drawCalls && triangles <= budget.triangles,
    };
  });
}
