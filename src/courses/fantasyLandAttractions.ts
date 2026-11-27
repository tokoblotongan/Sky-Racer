// src/courses/fantasyLandAttractions.ts

import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Course } from '../core/course';

export interface PendulumAttractionSpec {
  readonly id: string;
  readonly routeId: string;
  readonly s: number;
  readonly phaseRad: number;
  readonly trackWidth: number;
  readonly worldPos: THREE.Vector3;
  readonly worldTangent: THREE.Vector3;
  readonly worldUp: THREE.Vector3;
  readonly worldRight: THREE.Vector3;
}

export interface RollingBallEntry {
  readonly id: string;
  readonly s: number;
  readonly phaseOffset01: number;
  readonly worldPos: THREE.Vector3;
  readonly worldTangent: THREE.Vector3;
  readonly worldUp: THREE.Vector3;
  readonly worldRight: THREE.Vector3;
}

export interface RollingBallGroupSpec {
  readonly id: string;
  readonly routeId: string;
  readonly centerS: number;
  readonly trackWidth: number;
  readonly amplitude: number;
  readonly balls: readonly RollingBallEntry[];
}

export interface WindFanAttractionSpec {
  readonly id: string;
  readonly routeId: string;
  readonly sStart: number;
  readonly sEnd: number;
  readonly centerS: number;
  readonly trackWidth: number;
  /** +1 blows toward +right (from left tower), -1 blows toward -right (from right tower) */
  readonly direction: -1 | 1;
  readonly fanTowerPos: THREE.Vector3;
  readonly fanTowerForward: THREE.Vector3;
  readonly fanTowerUp: THREE.Vector3;
  readonly fanTowerRight: THREE.Vector3;
}

export interface JellyPuddleAttractionSpec {
  readonly id: string;
  readonly routeId: string;
  readonly sStart: number;
  readonly sEnd: number;
  readonly centerS: number;
  readonly lateralCenter: number;
  readonly halfWidth: number;
  readonly trackWidth: number;
  readonly worldPos: THREE.Vector3;
}

export interface BoostRingAttractionSpec {
  readonly id: string;
  readonly routeId: string;
  readonly s: number;
  readonly lateral: number;
  readonly yOffset: number;
  readonly variant: 'cyan' | 'yellow';
  readonly phaseRad: number;
  readonly worldPos: THREE.Vector3;
  readonly worldTangent: THREE.Vector3;
  readonly worldUp: THREE.Vector3;
  readonly worldRight: THREE.Vector3;
}

export interface HazardForbiddenZone {
  readonly kind: 'checkpoint' | 'jump' | 'loop' | 'tunnel' | 'shortcutGap';
  readonly label: string;
  readonly startS: number;
  readonly endS: number;
}

export interface FantasyLandAttractionsPlan {
  readonly courseId: string;
  readonly enabledForCourse: boolean;
  readonly pendulums: readonly PendulumAttractionSpec[];
  readonly ballGroups: readonly RollingBallGroupSpec[];
  readonly windFans: readonly WindFanAttractionSpec[];
  readonly jellyPuddles: readonly JellyPuddleAttractionSpec[];
  readonly boostRings: readonly BoostRingAttractionSpec[];
  readonly forbiddenZones: readonly HazardForbiddenZone[];
}

function clampSafeMainS(s: number, totalLength: number): number {
  const m = ((s % totalLength) + totalLength) % totalLength;
  return m;
}

export function buildForbiddenHazardZones(course: Course): HazardForbiddenZone[] {
  const zones: HazardForbiddenZone[] = [];
  const mainLen = course.getLength();

  for (const cp of course.getCheckpoints()) {
    zones.push({
      kind: 'checkpoint',
      label: `CP#${cp.index + 1}`,
      startS: cp.s,
      endS: cp.s,
    });
  }

  const segs = course.getSegmentList();
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    if (seg.type === 'gap') {
      const takeoffStart = i > 0 ? segs[i - 1].startS : seg.startS;
      const landingEnd = i + 1 < segs.length ? segs[i + 1].endS : seg.endS;
      zones.push({
        kind: 'jump',
        label: seg.name ?? `Jump#${seg.index}`,
        startS: takeoffStart,
        endS: landingEnd,
      });
    } else if (seg.type === 'loop') {
      zones.push({
        kind: 'loop',
        label: seg.name ?? `Loop#${seg.index}`,
        startS: seg.startS,
        endS: seg.endS,
      });
    }
  }

  // Tunnel portals (entrance & exit of contiguous tunnel runs)
  let inTunnel = false;
  let tunnelStart = 0;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    if (seg.style === 'tunnel' && !inTunnel) {
      inTunnel = true;
      tunnelStart = seg.startS;
    } else if (seg.style !== 'tunnel' && inTunnel) {
      inTunnel = false;
      const tunnelEnd = segs[i - 1].endS;
      zones.push({
        kind: 'tunnel',
        label: 'Portal Terowongan Masuk',
        startS: tunnelStart,
        endS: tunnelStart,
      });
      zones.push({
        kind: 'tunnel',
        label: 'Portal Terowongan Keluar',
        startS: tunnelEnd,
        endS: tunnelEnd,
      });
      // Keep tunnel interior clear of physical obstacles as well
      zones.push({
        kind: 'tunnel',
        label: 'Interior Terowongan',
        startS: tunnelStart,
        endS: tunnelEnd,
      });
    }
  }
  if (inTunnel && segs.length > 0) {
    const tunnelEnd = segs[segs.length - 1].endS;
    zones.push({
      kind: 'tunnel',
      label: 'Terowongan',
      startS: tunnelStart,
      endS: Math.min(mainLen, tunnelEnd),
    });
  }

  // Shortcut entry and merge gaps on main
  for (const br of course.getBranchRoutes()) {
    zones.push({
      kind: 'shortcutGap',
      label: `Celah Masuk ${br.routeId}`,
      startS: br.fromS,
      endS: Math.min(mainLen, br.fromS + br.entryGapLength),
    });
    zones.push({
      kind: 'shortcutGap',
      label: `Celah Gabung ${br.routeId}`,
      startS: Math.max(0, br.toS - br.mergeGapLength),
      endS: br.toS,
    });
  }

  return zones;
}

export function distanceSInterval(
  a0: number,
  a1: number,
  b0: number,
  b1: number,
  totalLength: number,
  closed: boolean,
): number {
  const step = 1.0;
  let minD = Infinity;
  const aSpan = Math.max(0, a1 - a0);
  const aSteps = Math.max(1, Math.ceil(aSpan / step));
  const bSpan = Math.max(0, b1 - b0);
  const bSteps = Math.max(1, Math.ceil(bSpan / step));

  for (let i = 0; i <= aSteps; i++) {
    const sa = a0 + (aSpan * i) / aSteps;
    for (let j = 0; j <= bSteps; j++) {
      const sb = b0 + (bSpan * j) / bSteps;
      let d = Math.abs(sa - sb);
      if (closed && totalLength > 0) {
        d = Math.min(d, totalLength - d);
      }
      if (d < minD) {
        minD = d;
      }
    }
  }
  return minD;
}

export function createFantasyLandAttractionsPlan(
  course: Course,
  enabledOverride?: boolean,
): FantasyLandAttractionsPlan {
  const isEnabled = enabledOverride ?? course.hasAttractions();
  if (!isEnabled) {
    return {
      courseId: course.getId(),
      enabledForCourse: false,
      pendulums: [],
      ballGroups: [],
      windFans: [],
      jellyPuddles: [],
      boostRings: [],
      forbiddenZones: [],
    };
  }

  const mainRoute = course.getRoute('main');
  const mainLen = mainRoute.getLength();
  const trackWidth = course.getTrackWidth();
  const segs = course.getSegmentList();
  const forbiddenZones = buildForbiddenHazardZones(course);

  // Locate structural landmarks dynamically so solver adjustments stay consistent
  const bridgeStartSeg = segs.find((s) => s.style === 'bridge');
  const tunnelStraightSeg = segs.find((s) => s.style === 'tunnel' && s.type === 'straight');
  const hairpinSeg = segs.find((s) => s.type === 'curve' && s.length > 255 && s.startS > 1400);
  const longBackStraightSeg = segs.find((s) => s.type === 'straight' && s.length > 260);
  const openingCurveSeg = segs[1];

  const makeFrameVecs = (routeId: string, s: number) => {
    const r = course.getRoute(routeId);
    const f = r.getFrameAt(s);
    return {
      width: f.width,
      pos: f.position.clone(),
      tangent: f.tangent.clone(),
      up: f.up.clone(),
      right: f.right.clone(),
    };
  };

  // 1. Candy Pendulums (max 2 per lap)
  const pendulumSList = [
    bridgeStartSeg ? bridgeStartSeg.startS + 40 : 1004,
    longBackStraightSeg ? longBackStraightSeg.startS + 102 : 2135,
  ];
  const pendulums: PendulumAttractionSpec[] = pendulumSList.map((rawS, idx) => {
    const s = clampSafeMainS(rawS, mainLen);
    const fv = makeFrameVecs('main', s);
    return {
      id: `pendulum-${idx + 1}`,
      routeId: 'main',
      s,
      phaseRad: idx === 0 ? 0 : Math.PI * 0.65,
      trackWidth: fv.width || trackWidth,
      worldPos: fv.pos,
      worldTangent: fv.tangent,
      worldUp: fv.up,
      worldRight: fv.right,
    };
  });

  // 2. Rolling Balls (max 2 groups per lap, >= 40% safe lane guaranteed)
  const ballGroupSList = [
    openingCurveSeg ? openingCurveSeg.startS + 140 : 320,
    longBackStraightSeg ? longBackStraightSeg.startS + 402 : 2435,
  ];
  const ballCfg = CONFIG.attractions.balls;
  const ballGroups: RollingBallGroupSpec[] = ballGroupSList.map((rawCenterS, gIdx) => {
    const centerS = clampSafeMainS(rawCenterS, mainLen);
    const halfSep = ballCfg.pairSeparationS * 0.5;
    const fCenter = mainRoute.getFrameAt(centerS);
    const w = fCenter.width || trackWidth;
    const maxAllowedCenterAmp = Math.max(
      0.5,
      w * (0.5 - CONFIG.attractions.safeLaneFraction) - ballCfg.ballRadius,
    );
    const amplitude = Math.min(w * ballCfg.laneAmplitudeRatio, maxAllowedCenterAmp);

    const balls: RollingBallEntry[] = [];
    for (let b = 0; b < ballCfg.countPerGroup; b++) {
      const s = clampSafeMainS(centerS + (b === 0 ? -halfSep : halfSep), mainLen);
      const fv = makeFrameVecs('main', s);
      balls.push({
        id: `ball-${gIdx + 1}-${b + 1}`,
        s,
        phaseOffset01: gIdx * 0.25 + b * 0.5,
        worldPos: fv.pos,
        worldTangent: fv.tangent,
        worldUp: fv.up,
        worldRight: fv.right,
      });
    }

    return {
      id: `balls-${gIdx + 1}`,
      routeId: 'main',
      centerS,
      trackWidth: w,
      amplitude,
      balls,
    };
  });

  // 3. Giant Wind Fan (max 1 per lap)
  const windStart = longBackStraightSeg ? longBackStraightSeg.startS + 232 : 2265;
  const windEnd = windStart + 55;
  const windCenter = (windStart + windEnd) * 0.5;
  const wfFrame = makeFrameVecs('main', windCenter);
  const windDirection: -1 | 1 = 1; // blows +right from left side tower
  const towerOffset = -(wfFrame.width * 0.5 + 4.4) * windDirection;
  const fanTowerPos = wfFrame.pos
    .clone()
    .addScaledVector(wfFrame.right, towerOffset)
    .addScaledVector(wfFrame.up, 3.6);
  const windFans: WindFanAttractionSpec[] = [
    {
      id: 'wind-1',
      routeId: 'main',
      sStart: windStart,
      sEnd: windEnd,
      centerS: windCenter,
      trackWidth: wfFrame.width || trackWidth,
      direction: windDirection,
      fanTowerPos,
      fanTowerForward: wfFrame.tangent,
      fanTowerUp: wfFrame.up,
      fanTowerRight: wfFrame.right,
    },
  ];

  // 4. Jelly Puddle (max 1 per lap, at hairpin exit, >= 40m before shortcut merge gap!)
  // Hairpin ends around s=1756.45; shortcut merge gap begins around s=1796.45.
  // Placing [endS - 19.5, endS - 3.5] sits cleanly at the hairpin exit AND > 43m ahead of merge gap!
  const hairpinEndS = hairpinSeg ? hairpinSeg.endS : 1756.45;
  const jellyEnd = hairpinEndS - 3.4;
  const jellyStart = jellyEnd - 16.0;
  const jellyCenter = (jellyStart + jellyEnd) * 0.5;
  const jf = makeFrameVecs('main', jellyCenter);
  const jWidth = jf.width || trackWidth;
  // Leave at least 44% of road width completely dry on the right lane
  const puddleFullWidth = jWidth * 0.52;
  const puddleHalfWidth = puddleFullWidth * 0.5;
  const puddleLateralCenter = -(jWidth * 0.5 - puddleHalfWidth - 0.35);
  const jellyPuddles: JellyPuddleAttractionSpec[] = [
    {
      id: 'jelly-1',
      routeId: 'main',
      sStart: jellyStart,
      sEnd: jellyEnd,
      centerS: jellyCenter,
      lateralCenter: puddleLateralCenter,
      halfWidth: puddleHalfWidth,
      trackWidth: jWidth,
      worldPos: jf.pos.clone().addScaledVector(jf.right, puddleLateralCenter),
    },
  ];

  // 5. Boost Rings (reward): max 8 on main (tunnel straight + jump arcs) + 1 small chain on shortcut
  const boostRings: BoostRingAttractionSpec[] = [];
  const pushRing = (
    id: string,
    routeId: string,
    s: number,
    lateral: number,
    yOffset: number,
    variant: 'cyan' | 'yellow',
    phaseRad: number,
  ): void => {
    const fv = makeFrameVecs(routeId, s);
    const worldPos = fv.pos
      .clone()
      .addScaledVector(fv.right, lateral)
      .addScaledVector(fv.up, yOffset);
    boostRings.push({
      id,
      routeId,
      s,
      lateral,
      yOffset,
      variant,
      phaseRad,
      worldPos,
      worldTangent: fv.tangent,
      worldUp: fv.up,
      worldRight: fv.right,
    });
  };

  // Chain A: 4 rings in straight section of Terowongan Kristal
  const tunStart = tunnelStraightSeg ? tunnelStraightSeg.startS + 14 : 1301;
  for (let i = 0; i < 4; i++) {
    pushRing(
      `ring-tunnel-${i + 1}`,
      'main',
      tunStart + i * 17,
      0,
      1.65,
      i % 2 === 0 ? 'cyan' : 'yellow',
      i * 0.7,
    );
  }

  // Chain B: 2 rings along Lompatan Naga gap arc + 2 rings along Lompatan Ganda jump arcs
  const gapSegs = segs.filter((s) => s.type === 'gap');
  if (gapSegs[0]) {
    const g0 = gapSegs[0];
    pushRing('ring-naga-1', 'main', g0.startS + g0.length * 0.34, 0, 1.65, 'yellow', 1.2);
    pushRing('ring-naga-2', 'main', g0.startS + g0.length * 0.72, 0, 2.35, 'cyan', 2.0);
  }
  if (gapSegs[1]) {
    const g1 = gapSegs[1];
    pushRing('ring-ganda-1', 'main', g1.startS + g1.length * 0.5, 0, 1.45, 'cyan', 2.8);
  }
  if (gapSegs[2]) {
    const g2 = gapSegs[2];
    pushRing('ring-ganda-2', 'main', g2.startS + g2.length * 0.52, 0, 1.85, 'yellow', 3.5);
  }

  // Chain C: 3 rings along shortcut jump (Lompatan Pintas)
  const shortcutBranch = course.getBranchRoute('shortcut');
  if (shortcutBranch) {
    const scGaps = shortcutBranch.getSegmentList().filter((s) => s.type === 'gap');
    if (scGaps[0]) {
      const sg = scGaps[0];
      pushRing('ring-sc-1', 'shortcut', sg.startS + sg.length * 0.25, 0, 1.5, 'cyan', 0.5);
      pushRing('ring-sc-2', 'shortcut', sg.startS + sg.length * 0.55, 0, 1.8, 'yellow', 1.3);
      pushRing('ring-sc-3', 'shortcut', sg.startS + sg.length * 0.85, 0, 1.55, 'cyan', 2.1);
    }
  }

  return {
    courseId: course.getId(),
    enabledForCourse: true,
    pendulums,
    ballGroups,
    windFans,
    jellyPuddles,
    boostRings,
    forbiddenZones,
  };
}
