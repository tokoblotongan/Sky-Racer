// src/courses/skyCircuit.ts

import type { CourseDefinition } from './types';

export const skyCircuitCourse: CourseDefinition = {
  id: 'sky-circuit',
  name: 'Sky Circuit',
  closed: false,
  laps: 1,
  trackWidth: 7,
  startPosition: { x: 0, y: 10, z: 145 },
  startHeadingDeg: 0,
  segments: [
    // 1. Start lurus cepat + sedikit turun membangun momentum
    { type: 'straight', length: 32 },
    { type: 'slope', length: 34, pitchDeg: -7 },

    // 2. Tikungan S lebar berbanking lembut
    { type: 'curve', radius: 36, angleDeg: 90, bankDeg: -10, checkpoint: true },
    { type: 'straight', length: 12 },
    { type: 'curve', radius: 32, angleDeg: -90, bankDeg: 11 },

    // 3. Lurus dorong dengan boost pad menuju loop pertama (r = 12.5 m)
    {
      type: 'straight',
      length: 48,
      checkpoint: true,
      boostPads: [{ at: 0.45, lateral: 0 }],
    },
    { type: 'loop', radius: 12.5, lateralOffset: 9.5 },

    // 4. Keluar loop: tanjakan panjang lalu tikungan kanan berbanking
    { type: 'straight', length: 16 },
    { type: 'slope', length: 42, pitchDeg: 15 },
    { type: 'curve', radius: 28, angleDeg: 90, bankDeg: -12, checkpoint: true },

    // 5. Lurus tinggi menuju lompatan pertama (celah 16 m)
    {
      type: 'straight',
      length: 26,
      boostPads: [{ at: 0.45, lateral: 0 }],
    },
    { type: 'pitchTo', length: 8, pitchDeg: 14 },
    { type: 'gap', length: 16, exitPitchDeg: -12 },
    { type: 'pitchTo', length: 10, pitchDeg: 0 },
    { type: 'straight', length: 16 },

    // 6. Hairpin kanan berbanking besar + sedikit naik untuk persiapan flyover
    { type: 'curve', radius: 26, angleDeg: 90, bankDeg: -16, checkpoint: true },
    { type: 'slope', length: 70, pitchDeg: 8 },
    { type: 'curve', radius: 26, angleDeg: 90, bankDeg: -16 },

    // 7. Flyover lurus di atas seksi 3 (jarak vertikal >= 12 m) lalu turunan cepat
    {
      type: 'straight',
      length: 114,
      checkpoint: true,
      boostPads: [{ at: 0.35, lateral: 0 }],
    },
    { type: 'slope', length: 42, pitchDeg: -17 },

    // 8. Chicane kiri-kanan berirama
    { type: 'curve', radius: 26, angleDeg: -50, bankDeg: 12, checkpoint: true },
    { type: 'straight', length: 10 },
    { type: 'curve', radius: 26, angleDeg: 50, bankDeg: -12 },

    // 9. Lurus + loop kedua yang lebih kecil (r = 10.5 m)
    { type: 'curve', radius: 26, angleDeg: -90, bankDeg: 14 },
    {
      type: 'straight',
      length: 44,
      checkpoint: true,
      boostPads: [{ at: 0.48, lateral: 0 }],
    },
    { type: 'loop', radius: 10.5, lateralOffset: -9.5 },

    // 10. Lompatan kedua (celah 18 m) dengan pendekatan ber-boost
    {
      type: 'straight',
      length: 30,
      checkpoint: true,
      boostPads: [{ at: 0.45, lateral: 0 }],
    },
    { type: 'pitchTo', length: 8, pitchDeg: 14 },
    { type: 'gap', length: 18, exitPitchDeg: -12 },
    { type: 'pitchTo', length: 10, pitchDeg: 0 },

    // 11. Tikungan berbanking tinggi kembali menuju sisi finish
    { type: 'straight', length: 16, checkpoint: true },
    { type: 'curve', radius: 38, angleDeg: -90, bankDeg: 15 },

    // 12. Lurus akhir dengan boost pad sebelum gerbang finish
    {
      type: 'straight',
      length: 42,
      boostPads: [{ at: 0.38, lateral: 0 }],
    },
  ],
  referenceTime: 26.23,
  medals: {
    gold: 28.86,
    silver: 34.1,
    bronze: 41.97,
  },
};
