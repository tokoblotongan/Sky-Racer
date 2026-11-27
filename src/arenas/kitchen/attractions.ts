// src/arenas/kitchen/attractions.ts
// Stage K3 dynamic attraction placements for Arena 3 ("Dapur Raksasa"), reusing F6 types with the 'kitchen' skin.

import { CONFIG } from '../../config';
import type { Course } from '../../core/course';
import {
  buildForbiddenHazardZones,
  type BoostRingAttractionSpec,
  type FantasyLandAttractionsPlan,
  type JellyPuddleAttractionSpec,
  type PendulumAttractionSpec,
  type RollingBallEntry,
  type RollingBallGroupSpec,
  type WindFanAttractionSpec,
} from '../../courses/fantasyLandAttractions';

function clampSafeMainS(s: number, totalLength: number): number {
  return ((s % totalLength) + totalLength) % totalLength;
}

export function createKitchenAttractionsPlan(
  course: Course,
  enabledOverride?: boolean,
): FantasyLandAttractionsPlan {
  const isEnabled = enabledOverride ?? course.hasAttractions();
  if (!isEnabled) {
    return {
      courseId: course.getId(),
      enabledForCourse: false,
      skin: 'kitchen',
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

  // Locate structural landmarks dynamically so placements remain exact if closed solver runs
  const startStraightSeg = segs.find((s) => s.name === 'Meja Start' && s.type === 'straight');
  const bridgeEndSeg = segs.filter((s) => s.style === 'bridge').pop();
  const loopSeg = segs.find((s) => s.type === 'loop');
  const bridgeStartSeg = segs.find((s) => s.style === 'bridge');
  const tunnelStraightSeg = segs.find((s) => s.style === 'tunnel' && s.type === 'straight');
  const komporExitStraight = segs.find((s) => s.name === 'Tikungan Kompor' && s.type === 'straight');

  // 1. Pendulum (skin "Sendok Besar", max 2 per lap):
  // - Straight after Meja Start grid (s ~ 142)
  // - Section between Jembatan Wastafel exit and Tikungan Kompor / shortcut split (s ~ 1378, >= 46m before split)
  const pendulumSList = [
    startStraightSeg ? startStraightSeg.startS + 142 : 142,
    bridgeEndSeg ? bridgeEndSeg.endS + 16 : 1378,
  ];
  const pendulums: PendulumAttractionSpec[] = pendulumSList.map((rawS, idx) => {
    const s = clampSafeMainS(rawS, mainLen);
    const fv = makeFrameVecs('main', s);
    return {
      id: `kitchen-pendulum-${idx + 1}`,
      routeId: 'main',
      s,
      phaseRad: idx === 0 ? 0.15 : Math.PI * 0.72,
      trackWidth: fv.width || trackWidth,
      worldPos: fv.pos,
      worldTangent: fv.tangent,
      worldUp: fv.up,
      worldRight: fv.right,
      skin: 'kitchen',
    };
  });

  // 2. Rolling Balls (skin "Kelereng", max 2 groups per lap, >= 40% continuous safe lane):
  // - After Terowongan Panci + Loop Wajan exit straight (first >= 40m clear zone after tunnel/loop: s ~ 1012)
  // - On the main straight (Meja Start straight ahead of grid: s ~ 72)
  const ballGroupSList = [
    loopSeg ? loopSeg.endS + 48.7 : 1012,
    startStraightSeg ? startStraightSeg.startS + 72 : 72,
  ];
  const ballCfg = CONFIG.attractions.balls;
  const ballGroups: RollingBallGroupSpec[] = ballGroupSList.map((rawCenterS, gIdx) => {
    const centerS = clampSafeMainS(rawCenterS, mainLen);
    const halfSep = ballCfg.pairSeparationS * 0.5;
    const fCenter = mainRoute.getFrameAt(centerS);
    const w = fCenter.width || trackWidth;
    // Sweep cleanly while guaranteeing >= 40% continuous safe lane on one side at every phase
    const maxSafeSweep = Math.max(0.5, w * 0.5 - ballCfg.ballRadius - 2.0);
    const amplitude = Math.min(w * ballCfg.laneAmplitudeRatio, maxSafeSweep);

    const balls: RollingBallEntry[] = [];
    for (let b = 0; b < ballCfg.countPerGroup; b++) {
      const s = clampSafeMainS(centerS + (b === 0 ? -halfSep : halfSep), mainLen);
      const fv = makeFrameVecs('main', s);
      balls.push({
        id: `kitchen-ball-${gIdx + 1}-${b + 1}`,
        s,
        phaseOffset01: gIdx * 0.25 + b * 0.5,
        worldPos: fv.pos,
        worldTangent: fv.tangent,
        worldUp: fv.up,
        worldRight: fv.right,
      });
    }

    return {
      id: `kitchen-balls-${gIdx + 1}`,
      routeId: 'main',
      centerS,
      trackWidth: w,
      amplitude,
      balls,
      skin: 'kitchen',
    };
  });

  // 3. Wind Fan (skin "Kipas Penyedot", max 1 per lap):
  // Approach to Jembatan Wastafel, ending >= 44m before bridge entrance (bridgeStartSeg.startS = 1161.8)
  const windEnd = bridgeStartSeg ? bridgeStartSeg.startS - 44.8 : 1117;
  const windStart = windEnd - 55;
  const windCenter = (windStart + windEnd) * 0.5;
  const wfFrame = makeFrameVecs('main', windCenter);
  const windDirection: -1 | 1 = 1;
  const towerOffset = -(wfFrame.width * 0.5 + 4.4) * windDirection;
  const fanTowerPos = wfFrame.pos
    .clone()
    .addScaledVector(wfFrame.right, towerOffset)
    .addScaledVector(wfFrame.up, 3.6);
  const windFans: WindFanAttractionSpec[] = [
    {
      id: 'kitchen-wind-1',
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
      skin: 'kitchen',
    },
  ];

  // 4. Jelly Puddle (skin "Genangan Sirup", max 1 per lap):
  // Exit straight of Tikungan Kompor, >= 43m ahead of CP#8 (komporExitStraight.endS = 1767.4)
  const komporEnd = komporExitStraight ? komporExitStraight.endS : 1767.4;
  const jellyEnd = komporEnd - 43.4;
  const jellyStart = jellyEnd - 16.0;
  const jellyCenter = (jellyStart + jellyEnd) * 0.5;
  const jf = makeFrameVecs('main', jellyCenter);
  const jWidth = jf.width || trackWidth;
  // Keep ~47.5% of the right lane completely dry
  const puddleFullWidth = jWidth * 0.5;
  const puddleHalfWidth = puddleFullWidth * 0.5;
  const puddleLateralCenter = -(jWidth * 0.5 - puddleHalfWidth - 0.35);
  const jellyPuddles: JellyPuddleAttractionSpec[] = [
    {
      id: 'kitchen-syrup-1',
      routeId: 'main',
      sStart: jellyStart,
      sEnd: jellyEnd,
      centerS: jellyCenter,
      lateralCenter: puddleLateralCenter,
      halfWidth: puddleHalfWidth,
      trackWidth: jWidth,
      worldPos: jf.pos.clone().addScaledVector(jf.right, puddleLateralCenter),
      skin: 'kitchen',
    },
  ];

  // 5. Boost Rings (skin "Cincin Donat", max 8 on main + small chain on shortcut):
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
      skin: 'kitchen',
    });
  };

  // Chain A: 3 rings along Lompatan Talenan gap arc
  const talenanGap = segs.find((s) => s.type === 'gap' && s.name === 'Lompatan Talenan');
  if (talenanGap) {
    pushRing(
      'kitchen-ring-talenan-1',
      'main',
      talenanGap.startS + talenanGap.length * 0.28,
      0,
      1.65,
      'cyan',
      0.4,
    );
    pushRing(
      'kitchen-ring-talenan-2',
      'main',
      talenanGap.startS + talenanGap.length * 0.56,
      0,
      2.1,
      'yellow',
      1.2,
    );
    pushRing(
      'kitchen-ring-talenan-3',
      'main',
      talenanGap.startS + talenanGap.length * 0.84,
      0,
      1.65,
      'cyan',
      2.0,
    );
  }

  // Chain B: 4 rings along Terowongan Panci straight
  const tunStart = tunnelStraightSeg ? tunnelStraightSeg.startS + 27 : 602;
  for (let i = 0; i < 4; i++) {
    pushRing(
      `kitchen-ring-panci-${i + 1}`,
      'main',
      tunStart + i * 24,
      0,
      1.65,
      i % 2 === 0 ? 'yellow' : 'cyan',
      i * 0.8,
    );
  }

  // Chain C: 3 rings along shortcut jump (Rute Pintas Rak Bumbu)
  const shortcutBranch = course.getBranchRoute('shortcut');
  if (shortcutBranch) {
    const scGaps = shortcutBranch.getSegmentList().filter((s) => s.type === 'gap');
    if (scGaps[0]) {
      const sg = scGaps[0];
      pushRing('kitchen-ring-sc-1', 'shortcut', sg.startS + sg.length * 0.25, 0, 1.5, 'cyan', 0.5);
      pushRing('kitchen-ring-sc-2', 'shortcut', sg.startS + sg.length * 0.55, 0, 1.8, 'yellow', 1.3);
      pushRing('kitchen-ring-sc-3', 'shortcut', sg.startS + sg.length * 0.85, 0, 1.55, 'cyan', 2.1);
    }
  }

  return {
    courseId: course.getId(),
    enabledForCourse: true,
    skin: 'kitchen',
    pendulums,
    ballGroups,
    windFans,
    jellyPuddles,
    boostRings,
    forbiddenZones,
  };
}
