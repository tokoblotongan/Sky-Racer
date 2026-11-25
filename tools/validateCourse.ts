// tools/validateCourse.ts

import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../src/config';
import { buildCourseConfigFromDefinition, Course } from '../src/core/course';
import { validateCourse } from '../src/core/courseValidation';
import { getCourse } from '../src/courses';

function parseCourseIdArg(argv: readonly string[]): string {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--course=')) {
      const value = arg.slice('--course='.length).trim();
      if (value) return value;
    } else if (arg === '--course' && i + 1 < argv.length) {
      const value = argv[i + 1].trim();
      if (value) return value;
    }
  }
  return CONFIG.activeCourseId;
}

function main(): void {
  const requestedId = parseCourseIdArg(process.argv.slice(2));
  const courseDef = getCourse(requestedId);
  const t0 = performance.now();
  const course = new Course(buildCourseConfigFromDefinition(courseDef, false));
  const buildMs = performance.now() - t0;

  const report = validateCourse(course, CONFIG.physics);

  const gold = Number((report.referenceTime * 1.1).toFixed(2));
  const silver = Number((report.referenceTime * 1.3).toFixed(2));
  const bronze = Number((report.referenceTime * 1.6).toFixed(2));

  const loopsOk =
    report.loops.every((l) => l.completed && l.topSpeed > l.minApexSpeedRequired) &&
    !report.errors.some((e) => e.includes('Loop') || e.includes('loop'));
  const jumpsOk = report.jumps.every((j) => j.landed);
  const cpCount = course.getCheckpoints().length;
  const boostCount = course.getBoostPads().length;
  const geomOk = !report.errors.some(
    (e) => e.includes('Persilangan') || e.includes('bertabrakan') || e.includes('menutup'),
  );
  const styleOk =
    report.tunnelClearance.ok &&
    !report.errors.some((e) => e.includes('jembatan/terowongan') || e.includes('terowongan'));
  const cpTargetOk = report.closed
    ? cpCount >= 4 && cpCount <= 12
    : cpCount >= 8 && cpCount <= 11;

  const rows: Array<[string, string, string]> = [
    [
      'Geometri & Jarak',
      geomOk ? (report.warnings.some((w) => w.includes('Jarak non-bersebelahan')) ? 'WARN' : 'OK') : 'FAIL',
      `panjang=${report.lengthM.toFixed(2)} m, lebar=${report.trackWidth} m, minNonAdj=${report.minNonAdjacentClearanceM !== null ? `${report.minNonAdjacentClearanceM.toFixed(2)} m` : 'n/a'}, build=${buildMs.toFixed(1)} ms`,
    ],
  ];

  if (report.closure) {
    const adjSummary =
      report.closure.adjustments
        .map((a) => `#${a.segmentIndex + 1}:${a.field}=${a.solvedValue.toFixed(2)}`)
        .join(', ') || 'none';
    rows.push([
      'Penutupan Sirkuit',
      report.closure.converged &&
      report.closure.posErrorM <= CONFIG.course.closure.posToleranceM &&
      Math.abs(report.closure.dYawDeg) <= CONFIG.course.closure.yawToleranceDeg
        ? 'OK'
        : 'FAIL',
      `posErr=${report.closure.posErrorM.toFixed(4)} m, dYaw=${report.closure.dYawDeg.toFixed(4)}°, iter=${report.closure.iterations}, adj=[${adjSummary}]`,
    ]);
  }

  rows.push(
    [
      'Jembatan & Terowongan',
      styleOk ? 'OK' : 'FAIL',
      `headroom=${report.tunnelClearance.hasTunnel ? `${report.tunnelClearance.interiorHeightM.toFixed(1)}m (min ${report.tunnelClearance.requiredHeightM.toFixed(1)}m)` : 'n/a'}, minStyleDist=${report.minStyleClearanceM !== null ? `${report.minStyleClearanceM.toFixed(1)}m` : 'n/a'}`,
    ],
    [
      'Loop',
      loopsOk ? 'OK' : 'FAIL',
      report.loops
        .map(
          (l) =>
            `#${l.segmentIndex} (r=${l.radius}m, masuk=${l.entrySpeed.toFixed(1)}, puncak=${l.topSpeed.toFixed(1)}>${l.minApexSpeedRequired.toFixed(1)} m/s)`,
        )
        .join('; ') || 'tidak ada',
    ],
    [
      'Lompatan',
      jumpsOk ? 'OK' : 'FAIL',
      report.jumps
        .map(
          (j) =>
            `#${j.segmentIndex} (${j.gapLength.toFixed(0)}m, v=${j.takeoffSpeed.toFixed(1)}/${j.minSpeedRequired.toFixed(1)} m/s, air=${j.airtime.toFixed(2)}s)`,
        )
        .join('; ') || 'tidak ada',
    ],
    [
      'Checkpoint & Boost',
      cpTargetOk ? 'OK' : 'WARN',
      `${cpCount} checkpoint/lap (${report.laps} lap), ${boostCount} boost pad`,
    ],
    [
      'Simulasi Autopilot',
      report.ok ? (report.railHits > 0 ? 'WARN' : 'OK') : 'FAIL',
      `waktu=${report.referenceTime.toFixed(2)} s (lapAvg=${report.referenceLapTime.toFixed(2)} s), railHit=${report.railHits}, jatuh=${report.falls}, stuck=${report.stuckEvents}`,
    ],
  );

  for (const br of report.branches) {
    const inRange =
      br.perLapSavingSec >= CONFIG.shortcut.minTimeSaving &&
      br.perLapSavingSec <= CONFIG.shortcut.maxTimeSaving;
    rows.push([
      `Rute Pintas (${br.routeId})`,
      br.ok ? (inRange ? 'OK' : 'WARN') : 'FAIL',
      `len=${br.branchLengthM.toFixed(1)}m (utama=${br.mainArcM.toFixed(1)}m), koridor=${br.minCorridorClearanceM !== null ? `${br.minCorridorClearanceM.toFixed(1)}m` : 'n/a'}, utama=${br.mainTimeSec.toFixed(2)}s vs pintas=${br.shortcutTimeSec.toFixed(2)}s (hemat ${br.timeSavingSec.toFixed(2)}s total / ${br.perLapSavingSec.toFixed(2)}s per lap), jatuh=${br.shortcutFalls}`,
    ]);
  }

  console.log('');
  console.log(
    `=== VALIDASI LINTASAN: ${courseDef.name} (${courseDef.id}) [${report.closed ? `TERTUTUP ${report.laps} LAP` : 'SATU ARAH'}] ===`,
  );
  console.log('----------------------------------------------------------------------------------');
  for (const [check, status, detail] of rows) {
    console.log(`${check.padEnd(22)} | ${status.padEnd(4)} | ${detail}`);
  }
  console.log('----------------------------------------------------------------------------------');
  console.log(
    `Reference Time : ${report.referenceTime.toFixed(2)} s | Reference Lap: ${report.referenceLapTime.toFixed(2)} s | Saran Medali -> Emas: ${gold.toFixed(2)} s (1.10x), Perak: ${silver.toFixed(2)} s (1.30x), Perunggu: ${bronze.toFixed(2)} s (1.60x)`,
  );
  if (report.lapTimes.length > 0) {
    console.log(
      `Waktu Per Lap  : ${report.lapTimes.map((t, idx) => `Lap ${idx + 1}: ${t.toFixed(2)}s`).join(' | ')}${report.bestLap !== null ? ` (Best: ${report.bestLap.toFixed(2)}s)` : ''}`,
    );
  }

  if (report.branches.length > 0) {
    console.log('');
    console.log('Detail Rute Pintas:');
    for (const br of report.branches) {
      console.log(
        `  - ${br.name} (${br.routeId}) | fromS=${br.fromS.toFixed(1)}m -> toS=${br.toS.toFixed(1)}m | errEntry=${br.entryWorldErrorM.toFixed(4)}m, errMerge=${br.mergeWorldErrorM.toFixed(4)}m | masuk=${br.shortcutEntries}, gabung=${br.shortcutMerges}, railHit=${br.shortcutRailHits}`,
      );
      for (const j of br.jumps) {
        console.log(
          `    * Lompatan #${j.segmentIndex} (${j.gapLength.toFixed(1)}m): vTakeoff=${j.takeoffSpeed.toFixed(1)} m/s (min ${j.minSpeedRequired.toFixed(1)} m/s), air=${j.airtime.toFixed(2)}s, landed=${j.landed}`,
        );
      }
    }
  }

  if (report.zones.length > 0) {
    console.log('');
    console.log('Ringkasan Zona:');
    for (const z of report.zones) {
      console.log(
        `  - ${z.name.padEnd(20)} [${z.style.padEnd(6)}] | s=${z.startS.toFixed(0).padStart(4)}-${z.endS.toFixed(0).padStart(4)}m (${z.lengthM.toFixed(0).padStart(3)}m) | t=${z.passTimeSec.toFixed(2)}s | masuk=${z.entrySpeedMs.toFixed(1)} m/s -> keluar=${z.exitSpeedMs.toFixed(1)} m/s`,
      );
    }
  }

  if (report.warnings.length > 0) {
    console.log('');
    console.log('Peringatan:');
    for (const w of report.warnings) {
      console.log(`  - [WARN] ${w}`);
    }
  }

  if (report.errors.length > 0) {
    console.log('');
    console.log('Galat:');
    for (const e of report.errors) {
      console.log(`  - [FAIL] ${e}`);
    }
  }

  const outDir = path.resolve(process.cwd(), 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'course-report.json');
  const fullReport = {
    courseId: courseDef.id,
    courseName: courseDef.name,
    buildMs: Number(buildMs.toFixed(2)),
    recommendedMedals: { gold, silver, bronze },
    ...report,
  };
  fs.writeFileSync(outPath, JSON.stringify(fullReport, null, 2), 'utf8');
  console.log(`\nLaporan tersimpan di: reports/course-report.json`);

  process.exit(report.errors.length > 0 ? 1 : 0);
}

main();
