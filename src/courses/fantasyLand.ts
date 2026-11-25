// src/courses/fantasyLand.ts

import type { CourseDefinition } from './types';

export const fantasyLandCourse: CourseDefinition = {
  id: 'fantasy-land',
  name: 'FantasyLand',
  arenaNumber: 2,
  displayName: 'FantasyLand',
  tagline: 'Sirkuit lebar di padang fantasi cerah',
  themeId: 'fantasyland',
  typeLabel: '3 lap',
  closed: true,
  laps: 3,
  trackWidth: 16,
  startPosition: { x: 0, y: 18, z: 120 },
  startHeadingDeg: 0,
  segments: [
    // 1. Garis start/finish di s = 0, 40 m pertama untuk area grid
    { type: 'straight', length: 160 },

    // 2. Tikungan kanan berbanking + checkpoint pertama
    { type: 'curve', radius: 90, angleDeg: 150, bankDeg: -16, checkpoint: true },

    // 3. Turunan cepat dengan dua boost pad sejajar (jalur kiri & kanan)
    {
      type: 'slope',
      length: 110,
      pitchDeg: -6,
      boostPads: [
        { at: 0.5, lateral: -4, width: 3.2 },
        { at: 0.5, lateral: 4, width: 3.2 },
      ],
    },

    // 4. Chicane kiri-kanan berirama
    { type: 'curve', radius: 70, angleDeg: -70, bankDeg: 14 },

    // 5. Lanjutan chicane kanan + checkpoint
    { type: 'curve', radius: 70, angleDeg: 70, bankDeg: -14, checkpoint: true },

    // 6. Tanjakan panjang menuju bagian atas sirkuit
    { type: 'slope', length: 130, pitchDeg: 7 },

    // 7. Lurus ber-boost ganda menuju hairpin
    {
      type: 'straight',
      length: 80,
      boostPads: [
        { at: 0.5, lateral: -4, width: 3.2 },
        { at: 0.5, lateral: 4, width: 3.2 },
      ],
    },

    // 8. Hairpin kanan tajam berbanking besar + checkpoint
    { type: 'curve', radius: 50, angleDeg: 110, bankDeg: -24, checkpoint: true },

    // 9. Perataan pitch sebelum back-straight
    { type: 'pitchTo', length: 60, pitchDeg: 0 },

    // 10. Lurus panjang (panjang disesuaikan solver penutup sirkuit)
    { type: 'straight', length: 220, adjust: true },

    // 11. Tikungan kanan sedang + checkpoint (sudut disesuaikan solver)
    { type: 'curve', radius: 100, angleDeg: 60, bankDeg: -12, adjust: true, checkpoint: true },

    // 12. Turunan penyesuaian elevasi (kemiringan disesuaikan solver)
    { type: 'slope', length: 80, pitchDeg: -4, adjust: true },

    // 13. Tikungan akhir menuju lurus utama + checkpoint
    { type: 'curve', radius: 120, angleDeg: 40, bankDeg: -8, checkpoint: true },

    // 14. Lurus akhir kembali ke garis start/finish (panjang disesuaikan solver)
    { type: 'straight', length: 120, adjust: true },
  ],
  // Dikalibrasi dari simulasi autopilot (npm run validate:fantasy)
  referenceLapTime: 38.27,
  referenceTime: 114.8,
  medals: {
    gold: 126.28,
    silver: 149.24,
    bronze: 183.68,
  },
};
