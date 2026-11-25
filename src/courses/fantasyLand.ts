// src/courses/fantasyLand.ts

import type { CourseDefinition } from './types';

export const fantasyLandCourse: CourseDefinition = {
  id: 'fantasy-land',
  name: 'FantasyLand',
  arenaNumber: 2,
  displayName: 'FantasyLand',
  tagline: 'Sirkuit megah dengan loop naga, jembatan pelangi & terowongan kristal',
  themeId: 'fantasyland',
  typeLabel: '3 lap',
  closed: true,
  laps: 3,
  trackWidth: 16,
  startPosition: { x: 0, y: 34, z: 120 },
  startHeadingDeg: 0,
  segments: [
    // 1. Garis start/finish di s = 0, area grid start
    { type: 'straight', length: 180 },

    // 2. Tikungan pembuka lebar kanan + checkpoint
    { type: 'curve', radius: 100, angleDeg: 145, bankDeg: -14, checkpoint: true },

    // 3. Turunan cepat bertiga pad boost agar kecepatan masuk loop memadai
    {
      type: 'slope',
      length: 120,
      pitchDeg: -6,
      boostPads: [
        { at: 0.3, lateral: -5, width: 3.4 },
        { at: 0.3, lateral: 0, width: 3.4 },
        { at: 0.3, lateral: 5, width: 3.4 },
      ],
    },

    // 4. Lurus dorong dengan pad boost lebar di tengah + checkpoint sebelum Dragon Loop
    {
      type: 'straight',
      length: 60,
      checkpoint: true,
      boostPads: [{ at: 0.5, lateral: 0, width: 5.2 }],
    },

    // 5. Dragon Loop vertikal lebar (offset > lebar + 6 m)
    { type: 'loop', radius: 24, lateralOffset: 24, name: 'Dragon Loop' },

    // 6. Keluar Dragon Loop + checkpoint
    { type: 'straight', length: 60, checkpoint: true },

    // 7. Chicane lebar kiri-kanan berbanking
    { type: 'curve', radius: 80, angleDeg: -50, bankDeg: 12 },
    { type: 'curve', radius: 80, angleDeg: 50, bankDeg: -12 },

    // 8. Jembatan Pelangi (~200 m) naik anggun dengan turunan ringan di ujung
    { type: 'straight', length: 80, style: 'bridge', name: 'Jembatan Pelangi' },
    { type: 'pitchTo', length: 20, pitchDeg: 6, style: 'bridge', name: 'Jembatan Pelangi' },
    { type: 'straight', length: 70, style: 'bridge', name: 'Jembatan Pelangi' },
    { type: 'pitchTo', length: 30, pitchDeg: -2, style: 'bridge', name: 'Jembatan Pelangi' },

    // 9. Terowongan Kristal melengkung lalu lurus rata
    {
      type: 'curve',
      radius: 120,
      angleDeg: -40,
      bankDeg: 8,
      style: 'tunnel',
      name: 'Terowongan Kristal',
      checkpoint: true,
    },
    { type: 'pitchTo', length: 40, pitchDeg: 0, style: 'tunnel', name: 'Terowongan Kristal' },
    { type: 'straight', length: 80, style: 'tunnel', name: 'Terowongan Kristal' },

    // 10. Lompatan Naga: pacuan boost -> tanjakan 16° -> celah 30 m -> pendaratan 30 m
    {
      type: 'straight',
      length: 60,
      checkpoint: true,
      boostPads: [{ at: 0.55, lateral: 0, width: 4.8 }],
      name: 'Lompatan Naga',
    },
    { type: 'pitchTo', length: 10, pitchDeg: 16, name: 'Lompatan Naga' },
    { type: 'gap', length: 30, exitPitchDeg: -14, name: 'Lompatan Naga' },
    { type: 'pitchTo', length: 30, pitchDeg: 0, name: 'Lompatan Naga' },

    // 11. Hairpin lebar kembali berbanking + checkpoint
    { type: 'curve', radius: 90, angleDeg: 165, bankDeg: -16, checkpoint: true },

    // 12. Lurus persiapan menuju Lompatan Ganda
    { type: 'straight', length: 100 },

    // 13. Lompatan Ganda: 18 m + 20 m berturut-turut dengan pendaratan tengah aman
    { type: 'pitchTo', length: 8, pitchDeg: 8, checkpoint: true, name: 'Lompatan Ganda' },
    { type: 'gap', length: 18, exitPitchDeg: -10, name: 'Lompatan Ganda' },
    {
      type: 'pitchTo',
      length: 26,
      pitchDeg: 0,
      boostPads: [{ at: 0.65, lateral: 0, width: 4.6 }],
      name: 'Lompatan Ganda',
    },
    { type: 'pitchTo', length: 8, pitchDeg: 10, name: 'Lompatan Ganda' },
    { type: 'gap', length: 20, exitPitchDeg: -12, name: 'Lompatan Ganda' },
    { type: 'pitchTo', length: 40, pitchDeg: 0, name: 'Lompatan Ganda' },

    // 14. Tikungan balik penutup (disesuaikan solver)
    { type: 'curve', radius: 100, angleDeg: 45, bankDeg: -14, adjust: true },

    // 15. Lurus panjang kembali (disesuaikan solver)
    { type: 'straight', length: 350, adjust: true, checkpoint: true },

    // 16. Turunan penyesuaian elevasi kembali ke elevasi start (disesuaikan solver)
    { type: 'slope', length: 120, pitchDeg: -6, adjust: true },

    // 17. Tikungan akhir menuju lurus utama + checkpoint (disesuaikan solver)
    { type: 'curve', radius: 120, angleDeg: 45, bankDeg: -10, adjust: true, checkpoint: true },

    // 18. Lurus penutup menuju garis start/finish (disesuaikan solver)
    { type: 'straight', length: 140, adjust: true },
  ],
  routes: [
    {
      // Rute Pintas FantasyLand: bercabang di #15@0.333 (s=1387.25 m, 20 m setelah CP#5)
      // memotong hairpin 165 deg + Lompatan Naga, lalu menyatu bersih di #20@0.90 (s=1846.45 m, 10 m sebelum CP#7).
      id: 'shortcut',
      name: 'Rute Pintas',
      width: 8,
      startOffset: 12,
      endOffset: 4,
      entryGapLength: 40,
      mergeGapLength: 50,
      fromAnchor: { segmentIndex: 15, at: 0.333 },
      toAnchor: { segmentIndex: 20, at: 0.9 },
      segments: [
        { type: 'straight', length: 40 },
        { type: 'curve', radius: 30, angleDeg: 80, bankDeg: -8, adjust: true },
        { type: 'straight', length: 30, adjust: true, style: 'bridge', name: 'Jembatan Pintas' },
        { type: 'slope', length: 22, pitchDeg: 0, adjust: true, style: 'bridge', name: 'Jembatan Pintas' },
        {
          type: 'pitchTo',
          length: 10,
          pitchDeg: 10,
          boostPads: [
            { at: 0.25, lateral: 0, width: 3.4 },
            { at: 0.78, lateral: 0, width: 3.4 },
          ],
          name: 'Lompatan Pintas',
        },
        { type: 'gap', length: 22, exitPitchDeg: -10, name: 'Lompatan Pintas' },
        { type: 'pitchTo', length: 30, pitchDeg: 0, adjust: true, name: 'Lompatan Pintas' },
        { type: 'straight', length: 30, adjust: true },
        { type: 'curve', radius: 30, angleDeg: 85, bankDeg: -8, adjust: true },
        { type: 'straight', length: 28 },
      ],
    },
  ],
  // Dikalibrasi dari simulasi autopilot (npm run validate:fantasy)
  referenceLapTime: 65.06,
  referenceTime: 195.18,
  medals: {
    gold: 214.7,
    silver: 253.74,
    bronze: 312.29,
  },
};
