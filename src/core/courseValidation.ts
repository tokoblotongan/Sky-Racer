// src/core/courseValidation.ts

import { CONFIG } from '../config';
import { autopilotInput } from './autopilot';
import type { Course, CourseSegmentMeta, TrackFrame } from './course';
import { createCarState, stepCar } from './physics';
import { createRaceState, getRespawnTarget, updateRace } from './state';

export interface LoopValidationResult {
  segmentIndex: number;
  startS: number;
  endS: number;
  radius: number;
  entrySpeed: number;
  topSpeed: number;
  minApexSpeedRequired: number;
  completed: boolean;
}

export interface JumpValidationResult {
  segmentIndex: number;
  startS: number;
  endS: number;
  gapLength: number;
  takeoffSpeed: number;
  landed: boolean;
  airtime: number;
}

export interface CourseValidationReport {
  ok: boolean;
  lengthM: number;
  referenceTime: number;
  checkpointTimes: number[];
  loops: LoopValidationResult[];
  jumps: JumpValidationResult[];
  railHits: number;
  stuckEvents: number;
  falls: number;
  warnings: string[];
  errors: string[];
}

function getSegmentIndexForS(segments: readonly CourseSegmentMeta[], s: number): number {
  for (let i = 0; i < segments.length; i++) {
    if (s >= segments[i].startS && s < segments[i].endS) {
      return i;
    }
  }
  return Math.max(0, segments.length - 1);
}

export function validateCourse(
  course: Course,
  physicsConfig: typeof CONFIG.physics = CONFIG.physics,
): CourseValidationReport {
  const warnings: string[] = [];
  const errors: string[] = [];

  const lengthM = course.getLength();
  const segments = course.getSegmentList();
  const checkpoints = course.getCheckpoints();
  const boostPads = course.getBoostPads();
  const gaps = course.getGapRanges();
  const trackWidth = CONFIG.course.trackWidth;

  if (lengthM < 900 || lengthM > 1200) {
    warnings.push(
      `Panjang lintasan ${lengthM.toFixed(1)} m di luar kisaran target 900-1200 m.`,
    );
  }

  // (a) Self-intersection, horizontal/3D clearance, crossing height difference, and ground clearance
  const sampleStep = 1.0;
  const sampledFrames: Array<{ frame: TrackFrame; segIndex: number }> = [];
  for (let s = 0; s <= lengthM; s += sampleStep) {
    const f = course.getFrameAt(s);
    if (!f.isGap) {
      sampledFrames.push({ frame: f, segIndex: getSegmentIndexForS(segments, s) });
    }
  }

  const minFloorY = 1.5;
  let lowestFloorY = Infinity;
  for (const item of sampledFrames) {
    if (item.frame.position.y < lowestFloorY) {
      lowestFloorY = item.frame.position.y;
    }
  }
  if (lowestFloorY < minFloorY) {
    warnings.push(
      `Ketinggian minimum lintasan ${lowestFloorY.toFixed(2)} m terlalu dekat dengan lantai (< ${minFloorY} m).`,
    );
  }

  const min3DClearance = 2.5 * trackWidth; // 17.5 m
  const minArcSeparation = Math.max(24, trackWidth * 3.2);
  const cellSize = min3DClearance;
  const grid = new Map<string, number[]>();

  for (let i = 0; i < sampledFrames.length; i++) {
    const p = sampledFrames[i].frame.position;
    const gx = Math.floor(p.x / cellSize);
    const gz = Math.floor(p.z / cellSize);
    const key = `${gx},${gz}`;
    let bucket = grid.get(key);
    if (!bucket) {
      bucket = [];
      grid.set(key, bucket);
    }
    bucket.push(i);
  }

  let worstNonAdjacentClearance = Infinity;
  let worstCrossingVertDiff = Infinity;
  const reportedPairs = new Set<string>();
  const loopSegs = segments.filter((seg) => seg.type === 'loop');

  for (let i = 0; i < sampledFrames.length; i++) {
    const a = sampledFrames[i];
    const pa = a.frame.position;
    const gx = Math.floor(pa.x / cellSize);
    const gz = Math.floor(pa.z / cellSize);

    for (let dxCell = -1; dxCell <= 1; dxCell++) {
      for (let dzCell = -1; dzCell <= 1; dzCell++) {
        const bucket = grid.get(`${gx + dxCell},${gz + dzCell}`);
        if (!bucket) continue;

        for (const j of bucket) {
          if (j <= i) continue;
          const b = sampledFrames[j];
          const ds = b.frame.s - a.frame.s;
          if (ds < minArcSeparation) continue;

          // Ignore intentional helical separation across a single loop and its immediate entry/exit
          const sameLoopNeighborhood = loopSegs.some(
            (lp) =>
              a.frame.s >= lp.startS - 22 &&
              b.frame.s <= lp.endS + 22,
          );
          if (sameLoopNeighborhood) {
            continue;
          }

          const pb = b.frame.position;
          const dx = pb.x - pa.x;
          const dy = pb.y - pa.y;
          const dz = pb.z - pa.z;
          const horizDist = Math.hypot(dx, dz);
          const vertDist = Math.abs(dy);
          const dist3D = Math.hypot(dx, dy, dz);

          const segPairKey = `${a.segIndex}-${b.segIndex}`;

          if (horizDist < trackWidth) {
            if (vertDist < worstCrossingVertDiff) {
              worstCrossingVertDiff = vertDist;
            }
            if (vertDist < 12 && !reportedPairs.has(`cross:${segPairKey}`)) {
              reportedPairs.add(`cross:${segPairKey}`);
              errors.push(
                `Persilangan segmen #${a.segIndex} (s=${a.frame.s.toFixed(0)}m) dan #${b.segIndex} (s=${b.frame.s.toFixed(0)}m) selisih tinggi hanya ${vertDist.toFixed(1)} m (< 12 m).`,
              );
            }
          } else {
            if (dist3D < worstNonAdjacentClearance) {
              worstNonAdjacentClearance = dist3D;
            }
            if (dist3D < trackWidth * 1.35 && !reportedPairs.has(`col:${segPairKey}`)) {
              reportedPairs.add(`col:${segPairKey}`);
              errors.push(
                `Lintasan bertabrakan antara segmen #${a.segIndex} (s=${a.frame.s.toFixed(0)}m) dan #${b.segIndex} (s=${b.frame.s.toFixed(0)}m): jarak 3D ${dist3D.toFixed(1)} m.`,
              );
            } else if (dist3D < min3DClearance && !reportedPairs.has(`near:${segPairKey}`)) {
              reportedPairs.add(`near:${segPairKey}`);
              warnings.push(
                `Jarak non-bersebelahan segmen #${a.segIndex} dan #${b.segIndex} hanya ${dist3D.toFixed(1)} m (< ${min3DClearance.toFixed(1)} m).`,
              );
            }
          }
        }
      }
    }
  }

  // (b) Geometric ballistic feasibility check per gap
  const maxPossibleSpeed = physicsConfig.maxSpeed * CONFIG.boost.maxSpeedMultiplier;
  for (const seg of segments) {
    if (seg.type !== 'gap' || seg.config.type !== 'gap') continue;
    const fStart = course.getFrameAt(seg.startS);
    const fEnd = course.getFrameAt(seg.endS);
    const dx = fEnd.position.x - fStart.position.x;
    const dz = fEnd.position.z - fStart.position.z;
    const horizSpan = Math.hypot(dx, dz);
    const tanHoriz = Math.max(0.15, Math.hypot(fStart.tangent.x, fStart.tangent.z));
    const slopeTan = fStart.tangent.y / tanHoriz;
    const dyTarget = fEnd.position.y - fStart.position.y;
    const neededDrop = horizSpan * slopeTan - dyTarget;
    if (neededDrop <= 0.1) {
      errors.push(
        `Lompatan segmen #${seg.index} (s=${seg.startS.toFixed(1)}m) tidak realistis secara balistik (sudut ramp tidak cukup menanjak).`,
      );
    } else {
      const vHorizMin = horizSpan * Math.sqrt(physicsConfig.gravity / (2 * neededDrop));
      const vMinRequired = vHorizMin / tanHoriz;
      if (vMinRequired > maxPossibleSpeed) {
        errors.push(
          `Lompatan segmen #${seg.index} butuh kecepatan minimal ${vMinRequired.toFixed(1)} m/s (> kecepatan maksimal ${maxPossibleSpeed.toFixed(1)} m/s).`,
        );
      }
    }
  }

  // (c) Geometric loop check: lateral offset & straight run-in >= 40 m
  const loopResults: LoopValidationResult[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.type !== 'loop' || seg.config.type !== 'loop') continue;
    const minApexSpeedRequired = Math.sqrt(physicsConfig.gravity * seg.config.radius);
    if (Math.abs(seg.config.lateralOffset) < trackWidth + 1.0) {
      errors.push(
        `Loop segmen #${seg.index} lateralOffset=${seg.config.lateralOffset}m terlalu sempit (< lebar lintasan + 1 m).`,
      );
    }

    // Measure straight run-in ahead of loop
    let runInStraight = 0;
    for (let k = i - 1; k >= 0; k--) {
      if (segments[k].type === 'straight') {
        runInStraight += segments[k].length;
      } else {
        break;
      }
    }
    if (runInStraight < 40) {
      warnings.push(
        `Lurus sebelum loop segmen #${seg.index} hanya ${runInStraight.toFixed(1)} m (< 40 m).`,
      );
    }

    loopResults.push({
      segmentIndex: seg.index,
      startS: seg.startS,
      endS: seg.endS,
      radius: seg.config.radius,
      entrySpeed: 0,
      topSpeed: 0,
      minApexSpeedRequired,
      completed: false,
    });
  }

  // (d) Checkpoints & boost pads inside gaps/loops and before hazards
  for (const cp of checkpoints) {
    const segIdx = getSegmentIndexForS(segments, cp.s);
    const seg = segments[segIdx];
    if (course.isGapAt(cp.s) || seg?.type === 'gap') {
      errors.push(`Checkpoint #${cp.index + 1} berada di dalam celah (gap) pada s=${cp.s.toFixed(1)} m.`);
    }
    if (seg?.type === 'loop') {
      errors.push(`Checkpoint #${cp.index + 1} berada di dalam loop pada s=${cp.s.toFixed(1)} m.`);
    }
  }

  for (const pad of boostPads) {
    const halfLen = pad.length * 0.5;
    const padInGap = gaps.some((g) => pad.s + halfLen > g.startS && pad.s - halfLen < g.endS);
    if (padInGap) {
      errors.push(`Boost pad #${pad.id + 1} pada s=${pad.s.toFixed(1)} m bertumpuk dengan celah.`);
    }
    const padFrame = course.getFrameAt(pad.s);
    const maxLat = padFrame.width * 0.5 - pad.width * 0.5;
    if (Math.abs(pad.lateral) > maxLat + 0.05) {
      errors.push(`Boost pad #${pad.id + 1} keluar dari batas lebar lintasan.`);
    }
  }

  for (const seg of segments) {
    if (seg.type !== 'gap' && seg.type !== 'loop') continue;
    const hasCpBefore = checkpoints.some(
      (cp) => cp.s <= seg.startS + 0.5 && seg.startS - cp.s <= 130,
    );
    if (!hasCpBefore) {
      warnings.push(
        `Tidak ada checkpoint dalam 130 m sebelum ${seg.type} (segmen #${seg.index}, s=${seg.startS.toFixed(1)} m).`,
      );
    }
  }

  // (e) Checkpoint count & spacing
  if (checkpoints.length < 8 || checkpoints.length > 11) {
    warnings.push(
      `Jumlah checkpoint ${checkpoints.length} (target 8-11 checkpoint).`,
    );
  }
  const finishS = course.getFinishS();
  const cpBounds = [CONFIG.car.startS, ...checkpoints.map((c) => c.s), finishS];
  for (let i = 1; i < cpBounds.length; i++) {
    const spacing = cpBounds[i] - cpBounds[i - 1];
    if (spacing > 220) {
      warnings.push(
        `Jarak antar titik aman terlalu panjang (${spacing.toFixed(1)} m > 220 m).`,
      );
    } else if (i > 1 && i < cpBounds.length - 1 && spacing < 35) {
      warnings.push(
        `Jarak antar checkpoint #${i - 1} dan #${i} terlalu rapat (${spacing.toFixed(1)} m < 35 m).`,
      );
    }
  }

  // (f) Full headless autopilot simulation (dt = 1/60, timeout 300s)
  const dt = 1 / 60;
  const maxSteps = Math.round(300 / dt);

  const carState = createCarState();
  const raceState = createRaceState(course, { persistRecords: false });
  raceState.phase = 'RACING';

  const jumpResults: JumpValidationResult[] = segments
    .filter((s) => s.type === 'gap')
    .map((s) => ({
      segmentIndex: s.index,
      startS: s.startS,
      endS: s.endS,
      gapLength: s.length,
      takeoffSpeed: 0,
      landed: false,
      airtime: 0,
    }));

  const loopEntered = new Set<number>();
  let activeJumpIdx = -1;
  let railHits = 0;
  let falls = 0;
  let stuckEvents = 0;
  let lowSpeedTimer = 0;
  let simElapsed = 0;
  let finished = false;

  for (let step = 0; step < maxSteps; step++) {
    const input = autopilotInput(carState, course);
    const respawnTarget = getRespawnTarget(raceState, course);
    const events = stepCar(carState, input, course, dt, {
      phase: raceState.phase,
      respawnTarget,
    });
    simElapsed += dt;

    const activeS = carState.mode === 'grounded' ? carState.s : carState.sApprox;

    for (const lr of loopResults) {
      if (!loopEntered.has(lr.segmentIndex) && activeS >= lr.startS && activeS <= lr.endS) {
        loopEntered.add(lr.segmentIndex);
        lr.entrySpeed = Math.abs(carState.vForward);
      }
      if (activeS >= lr.startS && activeS <= lr.endS) {
        const segMid = (lr.startS + lr.endS) * 0.5;
        if (Math.abs(activeS - segMid) < lr.radius * 0.7) {
          const speedNow = Math.abs(carState.vForward);
          if (lr.topSpeed === 0 || speedNow < lr.topSpeed) {
            lr.topSpeed = speedNow;
          }
        }
      }
      if (!lr.completed && loopEntered.has(lr.segmentIndex) && activeS > lr.endS) {
        lr.completed = true;
      }
    }

    for (const ev of events) {
      if (ev.type === 'railHit') {
        railHits++;
      } else if (ev.type === 'fell') {
        falls++;
      } else if (ev.type === 'takeoff') {
        let bestIdx = -1;
        let bestDist = Infinity;
        for (let ji = 0; ji < jumpResults.length; ji++) {
          const jr = jumpResults[ji];
          const d = Math.abs(carState.sApprox - jr.startS);
          if (d < bestDist) {
            bestDist = d;
            bestIdx = ji;
          }
        }
        if (bestIdx >= 0 && bestDist < 12) {
          activeJumpIdx = bestIdx;
          jumpResults[bestIdx].takeoffSpeed = carState.worldVel.length();
        }
      } else if (ev.type === 'landed') {
        if (activeJumpIdx >= 0) {
          const jr = jumpResults[activeJumpIdx];
          if (carState.s >= jr.endS - 1.5) {
            jr.landed = true;
            jr.airtime = ev.airtime;
          }
          activeJumpIdx = -1;
        }
      }
    }

    if (simElapsed > 2.0 && carState.mode === 'grounded' && Math.abs(carState.vForward) < 2.0) {
      lowSpeedTimer += dt;
      if (lowSpeedTimer >= 1.5) {
        stuckEvents++;
        lowSpeedTimer = 0;
      }
    } else {
      lowSpeedTimer = 0;
    }

    const raceEvents = updateRace(
      raceState,
      { s: carState.s, sApprox: carState.sApprox, mode: carState.mode },
      course,
      dt,
    );

    if (raceEvents.some((ev) => ev.type === 'finish')) {
      finished = true;
      break;
    }
  }

  const referenceTime = finished ? raceState.timer : simElapsed;
  const checkpointTimes = raceState.splits.map((s) => (s !== null ? Number(s.toFixed(3)) : -1));

  // (g) Fail/warn rules
  if (!finished) {
    errors.push(`Autopilot tidak mencapai finish dalam batas waktu 300 detik.`);
  }
  if (falls > 0) {
    errors.push(`Autopilot terjatuh dari lintasan sebanyak ${falls} kali.`);
  }
  if (stuckEvents > 0) {
    errors.push(`Autopilot terdeteksi macet sebanyak ${stuckEvents} kali.`);
  }
  for (const jr of jumpResults) {
    if (!jr.landed) {
      errors.push(
        `Lompatan segmen #${jr.segmentIndex} (celah ${jr.gapLength.toFixed(1)} m) gagal mendarat oleh autopilot.`,
      );
    }
  }
  for (const lr of loopResults) {
    if (!lr.completed) {
      errors.push(`Loop segmen #${lr.segmentIndex} gagal diselesaikan autopilot.`);
    } else if (lr.topSpeed < lr.minApexSpeedRequired) {
      warnings.push(
        `Kecepatan puncak loop segmen #${lr.segmentIndex} (${lr.topSpeed.toFixed(1)} m/s) mendekati atau di bawah batas ${lr.minApexSpeedRequired.toFixed(1)} m/s.`,
      );
    }
  }

  if (railHits > 10) {
    errors.push(`Terjadi terlalu banyak benturan pagar oleh autopilot (${railHits} kali).`);
  } else if (railHits > 0) {
    warnings.push(`Autopilot menyentuh pagar sebanyak ${railHits} kali.`);
  }

  if (referenceTime > 120) {
    warnings.push(`Waktu referensi autopilot ${referenceTime.toFixed(2)} s melampaui 120 s.`);
  }

  return {
    ok: errors.length === 0,
    lengthM: Number(lengthM.toFixed(2)),
    referenceTime: Number(referenceTime.toFixed(3)),
    checkpointTimes,
    loops: loopResults.map((l) => ({
      ...l,
      startS: Number(l.startS.toFixed(2)),
      endS: Number(l.endS.toFixed(2)),
      entrySpeed: Number(l.entrySpeed.toFixed(2)),
      topSpeed: Number(l.topSpeed.toFixed(2)),
      minApexSpeedRequired: Number(l.minApexSpeedRequired.toFixed(2)),
    })),
    jumps: jumpResults.map((j) => ({
      ...j,
      startS: Number(j.startS.toFixed(2)),
      endS: Number(j.endS.toFixed(2)),
      gapLength: Number(j.gapLength.toFixed(2)),
      takeoffSpeed: Number(j.takeoffSpeed.toFixed(2)),
      airtime: Number(j.airtime.toFixed(3)),
    })),
    railHits,
    stuckEvents,
    falls,
    warnings,
    errors,
  };
}
