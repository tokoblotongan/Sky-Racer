// tools/validateCourse.ts

import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../src/config';
import { buildCourseConfigFromDefinition, Course } from '../src/core/course';
import { validateCourse } from '../src/core/courseValidation';
import { getCourse } from '../src/courses';

function main(): void {
  const courseDef = getCourse(CONFIG.activeCourseId);
  const t0 = performance.now();
  const course = new Course(buildCourseConfigFromDefinition(courseDef, false));
  const buildMs = performance.now() - t0;

  const report = validateCourse(course, CONFIG.physics);

  const gold = Number((report.referenceTime * 1.1).toFixed(2));
  const silver = Number((report.referenceTime * 1.3).toFixed(2));
  const bronze = Number((report.referenceTime * 1.6).toFixed(2));

  const loopsOk = report.loops.every((l) => l.completed);
  const jumpsOk = report.jumps.every((j) => j.landed);
  const cpCount = course.getCheckpoints().length;
  const boostCount = course.getBoostPads().length;
  const geomOk = !report.errors.some((e) => e.includes('Persilangan') || e.includes('bertabrakan'));

  const rows: Array<[string, string, string]> = [
    [
      'Geometri & Jarak',
      geomOk ? (report.warnings.some((w) => w.includes('Jarak non-bersebelahan')) ? 'WARN' : 'OK') : 'FAIL',
      `panjang=${report.lengthM.toFixed(2)} m, build=${buildMs.toFixed(1)} ms`,
    ],
    [
      'Loop',
      loopsOk ? 'OK' : 'FAIL',
      report.loops
        .map(
          (l) =>
            `#${l.segmentIndex} (masuk ${l.entrySpeed.toFixed(1)}, puncak ${l.topSpeed.toFixed(1)} m/s)`,
        )
        .join('; ') || 'tidak ada',
    ],
    [
      'Lompatan',
      jumpsOk ? 'OK' : 'FAIL',
      report.jumps
        .map(
          (j) =>
            `#${j.segmentIndex} (${j.gapLength.toFixed(0)}m, v=${j.takeoffSpeed.toFixed(1)} m/s, air=${j.airtime.toFixed(2)}s)`,
        )
        .join('; ') || 'tidak ada',
    ],
    [
      'Checkpoint & Boost',
      cpCount >= 8 && cpCount <= 11 ? 'OK' : 'WARN',
      `${cpCount} checkpoint, ${boostCount} boost pad`,
    ],
    [
      'Simulasi Autopilot',
      report.ok ? (report.railHits > 0 ? 'WARN' : 'OK') : 'FAIL',
      `waktu=${report.referenceTime.toFixed(2)} s, railHit=${report.railHits}, jatuh=${report.falls}, stuck=${report.stuckEvents}`,
    ],
  ];

  console.log('');
  console.log(`=== VALIDASI LINTASAN: ${courseDef.name} (${courseDef.id}) ===`);
  console.log('--------------------------------------------------------------------------');
  for (const [check, status, detail] of rows) {
    console.log(`${check.padEnd(20)} | ${status.padEnd(4)} | ${detail}`);
  }
  console.log('--------------------------------------------------------------------------');
  console.log(
    `Reference Time : ${report.referenceTime.toFixed(2)} s | Saran Medali -> Emas: ${gold.toFixed(2)} s (1.10x), Perak: ${silver.toFixed(2)} s (1.30x), Perunggu: ${bronze.toFixed(2)} s (1.60x)`,
  );

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
