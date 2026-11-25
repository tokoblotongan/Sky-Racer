// tools/findShortcutCandidates.ts

import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { CONFIG } from '../src/config';
import { Course, buildCourseConfigFromDefinition } from '../src/core/course';
import { createRoute } from '../src/core/routes';
import { getCourse } from '../src/courses';
import type { CourseSegmentConfig, RouteAnchor, RouteDefinition } from '../src/courses/types';

interface CandidatePairReport {
  fromAnchor: RouteAnchor;
  toAnchor: RouteAnchor;
  fromS: number;
  toS: number;
  mainArcM: number;
  chordDistM: number;
  chordRatio: number;
  shortcutLengthM: number | null;
  minCorridorDistM: number | null;
  solverErrorM: number | null;
  checkpointConflict: string | null;
  accepted: boolean;
  reasons: string[];
  score: number;
}

function getCourseIdFromArgs(): string {
  const arg = process.argv.find((item) => item.startsWith('--course='));
  return arg ? arg.slice('--course='.length) : CONFIG.activeCourseId;
}

function makeTestShortcutSegments(
  angle1Deg: number,
  angle2Deg: number,
  midStraight: number,
  postStraight: number,
  slopePitchDeg: number,
  curveRadius: number,
): CourseSegmentConfig[] {
  const entryLen = CONFIG.shortcut.entryGapLength;
  return [
    { type: 'straight', length: entryLen },
    { type: 'curve', radius: curveRadius, angleDeg: angle1Deg, bankDeg: -Math.sign(angle1Deg) * 8, adjust: true },
    { type: 'straight', length: midStraight, adjust: true, style: 'bridge', name: 'Jembatan Pintas' },
    { type: 'slope', length: 22, pitchDeg: slopePitchDeg, adjust: true, style: 'bridge', name: 'Jembatan Pintas' },
    {
      type: 'pitchTo',
      length: 10,
      pitchDeg: 10,
      boostPads: [
        { at: 0.2, lateral: 0, width: 3.4 },
        { at: 0.75, lateral: 0, width: 3.4 },
      ],
      name: 'Lompatan Pintas',
    },
    { type: 'gap', length: 22, exitPitchDeg: -10, name: 'Lompatan Pintas' },
    { type: 'pitchTo', length: 30, pitchDeg: 0, adjust: true, name: 'Lompatan Pintas' },
    { type: 'straight', length: postStraight, adjust: true },
    { type: 'curve', radius: curveRadius, angleDeg: angle2Deg, bankDeg: -Math.sign(angle2Deg) * 8, adjust: true },
    { type: 'straight', length: 28 },
  ];
}

function measureCorridorClearance(
  course: Course,
  branchDef: RouteDefinition,
): { minCorridorDistM: number; shortcutLengthM: number; solverErrorM: number } | null {
  try {
    const branch = createRoute(course, branchDef);
    const branchSamples = branch.getSamples();
    const mainSamples = course.getSamples();
    const entryEnd = branch.entryGapLength + 15;
    const mergeStart = branch.getLength() - branch.mergeGapLength - 15;
    let minDist = Infinity;

    const strideB = Math.max(1, Math.floor(branchSamples.length / 160));
    const strideM = Math.max(1, Math.floor(mainSamples.length / 260));

    for (let i = 0; i < branchSamples.length; i += strideB) {
      const bs = branchSamples[i];
      if (bs.isGap) continue;
      if (bs.s < entryEnd || bs.s > mergeStart) continue;

      for (let j = 0; j < mainSamples.length; j += strideM) {
        const ms = mainSamples[j];
        if (ms.isGap) continue;
        // Exclude the parallel entry/merge anchor neighborhoods cleanly
        const nearEntry = ms.s >= branch.fromS - 20 && ms.s <= branch.fromS + branch.entryGapLength + 25;
        const nearMerge = ms.s >= branch.toS - branch.mergeGapLength - 25 && ms.s <= branch.toS + 20;
        if (nearEntry || nearMerge) continue;

        const d = bs.position.distanceTo(ms.position);
        if (d < minDist) {
          minDist = d;
        }
      }
    }

    return {
      minCorridorDistM: minDist,
      shortcutLengthM: branch.getLength(),
      solverErrorM: branch.solveReport.posErrorM,
    };
  } catch {
    return null;
  }
}

function run(): void {
  const courseId = getCourseIdFromArgs();
  const def = getCourse(courseId);
  const course = new Course(buildCourseConfigFromDefinition(def, false));
  const segments = course.getSegmentList();
  const checkpoints = course.getCheckpoints();
  const mainLen = course.getLength();
  const entryGap = CONFIG.shortcut.entryGapLength;
  const mergeGap = CONFIG.shortcut.mergeGapLength;
  const minCorridor = CONFIG.shortcut.corridorClearance;

  const straightSegs = segments.filter((s) => s.type === 'straight' && s.length >= 60);
  const candidates: CandidatePairReport[] = [];

  for (const fromSeg of straightSegs) {
    const usableFromLen = fromSeg.length - entryGap;
    if (usableFromLen < 0) continue;
    const fromSet = new Set<number>();
    const fromCount = Math.max(1, Math.floor(usableFromLen / 20) + 1);
    for (let k = 0; k < fromCount; k++) {
      const sOff = Math.min(usableFromLen, k * 20);
      fromSet.add(Number((sOff / fromSeg.length).toFixed(3)));
    }
    fromSet.add(Number((usableFromLen / fromSeg.length).toFixed(3)));
    const fromAts = [...fromSet];

    for (const toSeg of straightSegs) {
      const usableToLen = toSeg.length - mergeGap;
      if (usableToLen < 0) continue;
      const toSet = new Set<number>();
      const toCount = Math.max(1, Math.floor(usableToLen / 20) + 1);
      for (let k = 0; k < toCount; k++) {
        const sLocal = mergeGap + Math.min(usableToLen, k * 20);
        toSet.add(Number((sLocal / toSeg.length).toFixed(3)));
      }
      if (toSeg.length >= mergeGap + 5) {
        toSet.add(Number(((toSeg.length - 4) / toSeg.length).toFixed(3)));
      }
      const toAts = [...toSet];

      for (const fromAt of fromAts) {
        const fromS = THREE.MathUtils.lerp(fromSeg.startS, fromSeg.endS, fromAt);
        for (const toAt of toAts) {
          const toS = THREE.MathUtils.lerp(toSeg.startS, toSeg.endS, toAt);
          const reasons: string[] = [];

          if (fromS <= 1e-3 || toS >= mainLen - 1e-3 || fromS >= toS) {
            continue;
          }

          const mainArcM = toS - fromS;
          if (mainArcM < 450 || mainArcM > 800) {
            continue;
          }

          const hasCurveBetween = segments.some(
            (seg) =>
              seg.type === 'curve' &&
              seg.endS > fromS + entryGap * 0.5 &&
              seg.startS < toS - mergeGap * 0.5,
          );
          if (!hasCurveBetween) {
            reasons.push('no-curve-in-interval');
          }

          const fFrom = course.getFrameAt(fromS);
          const fTo = course.getFrameAt(toS);
          if (Math.abs(THREE.MathUtils.radToDeg(fFrom.bank)) >= 6 || Math.abs(THREE.MathUtils.radToDeg(fTo.bank)) >= 6) {
            reasons.push('bank>=6deg');
          }

          const pStart = fFrom.position.clone().addScaledVector(fFrom.right, CONFIG.shortcut.startOffset);
          const pEnd = fTo.position.clone().addScaledVector(fTo.right, CONFIG.shortcut.endOffset);
          const chordDistM = pStart.distanceTo(pEnd);
          const chordRatio = chordDistM / mainArcM;
          if (chordRatio > 0.55) {
            reasons.push(`chordRatio=${chordRatio.toFixed(2)}>0.55`);
          }

          let checkpointConflict: string | null = null;
          for (const cp of checkpoints) {
            if (cp.s >= fromS - 1 && cp.s <= fromS + entryGap + 1) {
              checkpointConflict = `CP#${cp.index + 1}@${cp.s.toFixed(1)}m in entryGap`;
            } else if (cp.s >= toS - mergeGap - 1 && cp.s <= toS + 1) {
              checkpointConflict = `CP#${cp.index + 1}@${cp.s.toFixed(1)}m in mergeGap`;
            }
          }
          if (checkpointConflict) {
            reasons.push(checkpointConflict);
          }

          const relTarget = pEnd.clone().sub(pStart);
          const rightComp = relTarget.dot(fFrom.right);
          const fwdComp = relTarget.dot(fFrom.tangent);
          const upComp = relTarget.dot(fFrom.up);
          const targetYawDeg = THREE.MathUtils.radToDeg(
            Math.atan2(fTo.tangent.dot(fFrom.right), fTo.tangent.dot(fFrom.tangent)),
          );
          const chordHeadingDeg = THREE.MathUtils.radToDeg(Math.atan2(rightComp, fwdComp));

          let shortcutLengthM: number | null = null;
          let minCorridorDistM: number | null = null;
          let solverErrorM: number | null = null;

          if (reasons.length === 0) {
            const rawA1 = Math.abs(chordHeadingDeg) < 8 ? 15 * (rightComp >= 0 ? 1 : -1) : chordHeadingDeg;
            const clampAng = (a: number): number => {
              const s = a >= 0 ? 1 : -1;
              return s * THREE.MathUtils.clamp(Math.abs(a), 12, 140);
            };
            const a1 = clampAng(rawA1);
            const rawA2 = targetYawDeg - a1;
            const a2 = clampAng(Math.abs(rawA2) < 10 ? -a1 : rawA2);
            const slopeGuess = THREE.MathUtils.clamp(
              THREE.MathUtils.radToDeg(Math.atan2(upComp, 22)),
              -12,
              12,
            );
            const approxArc = Math.max(40, chordDistM - entryGap - 28 - 84);
            const segGuess = THREE.MathUtils.clamp(approxArc * 0.35, 18, 120);

            const attempts: Array<[number, number, number]> = [
              [a1, a2, 28],
              [a1 * 0.85, a2 * 0.85, 32],
              [rightComp >= 0 ? 75 : -75, targetYawDeg - (rightComp >= 0 ? 75 : -75), 28],
              [rightComp >= 0 ? 45 : -45, targetYawDeg - (rightComp >= 0 ? 45 : -45), 35],
              [rightComp >= 0 ? 80 : -80, rightComp >= 0 ? 80 : -80, 36],
            ];
            let bestTry: { minCorridorDistM: number; shortcutLengthM: number; solverErrorM: number } | null =
              null;
            for (const [ang1, ang2, rad] of attempts) {
              const safeAng1 = clampAng(ang1);
              const safeAng2 = clampAng(ang2);
              const testDef: RouteDefinition = {
                id: 'shortcut',
                name: 'Rute Pintas',
                width: CONFIG.shortcut.branchWidth,
                startOffset: CONFIG.shortcut.startOffset,
                endOffset: CONFIG.shortcut.endOffset,
                entryGapLength: entryGap,
                mergeGapLength: mergeGap,
                fromAnchor: { segmentIndex: fromSeg.index, at: fromAt },
                toAnchor: { segmentIndex: toSeg.index, at: toAt },
                segments: makeTestShortcutSegments(
                  safeAng1,
                  safeAng2,
                  segGuess,
                  segGuess,
                  slopeGuess,
                  rad,
                ),
              };
              const res = measureCorridorClearance(course, testDef);
              if (res && (!bestTry || res.minCorridorDistM > bestTry.minCorridorDistM)) {
                bestTry = res;
              }
            }
            if (!bestTry) {
              reasons.push('solver-failed');
            } else {
              shortcutLengthM = bestTry.shortcutLengthM;
              minCorridorDistM = bestTry.minCorridorDistM;
              solverErrorM = bestTry.solverErrorM;
              if (minCorridorDistM < minCorridor) {
                reasons.push(`corridor=${minCorridorDistM.toFixed(1)}m<${minCorridor}m`);
              }
              if (shortcutLengthM >= mainArcM - 40) {
                reasons.push(`len=${shortcutLengthM.toFixed(0)}m not shorter`);
              }
            }
          }

          const accepted = reasons.length === 0;
          const timeGainProxy =
            shortcutLengthM !== null ? mainArcM - shortcutLengthM : mainArcM - chordDistM;
          const score = accepted
            ? (minCorridorDistM ?? 0) * 1.5 + timeGainProxy * 0.4 - chordRatio * 50 + (rightComp > 0 ? 25 : -10) + (fwdComp > -100 ? 10 : 0)
            : -1000 + timeGainProxy * 0.1 - reasons.length * 100;

          candidates.push({
            fromAnchor: { segmentIndex: fromSeg.index, at: fromAt },
            toAnchor: { segmentIndex: toSeg.index, at: toAt },
            fromS: Number(fromS.toFixed(2)),
            toS: Number(toS.toFixed(2)),
            mainArcM: Number(mainArcM.toFixed(2)),
            chordDistM: Number(chordDistM.toFixed(2)),
            chordRatio: Number(chordRatio.toFixed(3)),
            shortcutLengthM: shortcutLengthM !== null ? Number(shortcutLengthM.toFixed(2)) : null,
            minCorridorDistM: minCorridorDistM !== null ? Number(minCorridorDistM.toFixed(2)) : null,
            solverErrorM: solverErrorM !== null ? Number(solverErrorM.toFixed(4)) : null,
            checkpointConflict,
            accepted,
            reasons,
            score: Number(score.toFixed(2)),
          });
        }
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const valid = candidates.filter((c) => c.accepted);
  const rejected = candidates.filter((c) => !c.accepted);

  console.log(`\n=== SHORTCUT CANDIDATES FOR ${course.getName()} (${course.getId()}) ===`);
  console.log(`Main length: ${mainLen.toFixed(2)} m | Straight >=60m: ${straightSegs.map((s) => `#${s.index}(${s.length.toFixed(0)}m)`).join(', ')}`);
  console.log(`Total checked pairs (in 450..800m arc window): ${candidates.length} | Accepted: ${valid.length} | Rejected: ${rejected.length}\n`);

  console.log('TOP ACCEPTED CANDIDATES:');
  if (valid.length === 0) {
    console.log('  (none)');
  } else {
    console.table(
      valid.slice(0, 12).map((c) => ({
        from: `#${c.fromAnchor.segmentIndex}@${c.fromAnchor.at}`,
        to: `#${c.toAnchor.segmentIndex}@${c.toAnchor.at}`,
        fromS: c.fromS,
        toS: c.toS,
        mainArc: c.mainArcM,
        chord: c.chordDistM,
        ratio: c.chordRatio,
        shortLen: c.shortcutLengthM,
        clearance: c.minCorridorDistM,
        score: c.score,
      })),
    );
  }

  console.log('\nTOP REJECTED CANDIDATES (sample reasons):');
  console.table(
    rejected.slice(0, 12).map((c) => ({
      from: `#${c.fromAnchor.segmentIndex}@${c.fromAnchor.at}`,
      to: `#${c.toAnchor.segmentIndex}@${c.toAnchor.at}`,
      fromS: c.fromS,
      toS: c.toS,
      mainArc: c.mainArcM,
      ratio: c.chordRatio,
      reasons: c.reasons.join('; '),
    })),
  );

  const reportDir = path.resolve(process.cwd(), 'reports');
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, 'shortcutCandidates.json');
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        courseId: course.getId(),
        mainLengthM: Number(mainLen.toFixed(2)),
        generatedAt: new Date().toISOString(),
        acceptedCount: valid.length,
        rejectedCount: rejected.length,
        topAccepted: valid.slice(0, 20),
        sampleRejected: rejected.slice(0, 20),
      },
      null,
      2,
    ),
    'utf8',
  );
  console.log(`\nReport saved to ${path.relative(process.cwd(), reportPath)}`);
}

run();
