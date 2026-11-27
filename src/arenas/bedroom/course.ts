// src/arenas/bedroom/course.ts
// Closed 3-lap circuit on a giant patchwork-quilt bed for Arena 4 ("Kamar Tidur Raksasa").

import type { RouteDefinition } from '../../courses/types';
import type { ArenaCourseData } from '../types';

export const bedroomShortcutRoutes: readonly RouteDefinition[] = [
  {
    id: 'shortcut',
    name: 'Rute Pintas Kolong Ranjang',
    width: 8,
    startOffset: 11,
    endOffset: 3,
    entryGapLength: 32,
    mergeGapLength: 50,
    // Leaves Tikungan Karpet exit straight (seg 21) to the right (-Z), swings east into open bed interior, then north
    fromAnchor: { segmentIndex: 21, at: 0.15 },
    toAnchor: { segmentIndex: 26, at: 0.9 },
    segments: [
      { type: 'straight', length: 32 },
      { type: 'curve', radius: 26, angleDeg: 155, bankDeg: -11, adjust: true },
      { type: 'straight', length: 145, style: 'bridge', name: 'Rute Pintas Kolong Ranjang' },
      { type: 'curve', radius: 34, angleDeg: -65, bankDeg: 10, adjust: true },
      {
        type: 'pitchTo',
        length: 10,
        pitchDeg: 9,
        boostPads: [{ at: 0.45, lateral: 0, width: 3.4 }],
        name: 'Rute Pintas Kolong Ranjang',
      },
      { type: 'gap', length: 16, exitPitchDeg: -9, name: 'Rute Pintas Kolong Ranjang' },
      { type: 'pitchTo', length: 28, pitchDeg: 0, adjust: true, name: 'Rute Pintas Kolong Ranjang' },
      { type: 'slope', length: 55, pitchDeg: 0, adjust: true, name: 'Rute Pintas Kolong Ranjang' },
      { type: 'straight', length: 65, adjust: true },
      { type: 'straight', length: 28 },
    ],
  },
];

export const bedroomCourse: ArenaCourseData = {
  closed: true,
  trackWidth: 14,
  startPosition: { x: 0, y: 18, z: -135 },
  startHeadingDeg: 0,
  segments: [
    // 0. Zone 1 — Kasur Start: 210 m start/finish straight with 4-car starting grid
    {
      type: 'straight',
      length: 210,
      checkpoint: true,
      name: 'Kasur Start',
    },

    // 1. Corner 1 -> sweeping +125 deg right turn toward SE
    {
      type: 'curve',
      radius: 85,
      angleDeg: 125,
      bankDeg: -13,
    },

    // 2..5. Zone 2 — Lompatan Bantal: boost run-in -> 13 deg ramp -> 24 m gap -> landing
    {
      type: 'straight',
      length: 85,
      checkpoint: true,
      boostPads: [{ at: 0.45, lateral: 0, width: 4.6 }],
      name: 'Lompatan Bantal',
    },
    {
      type: 'pitchTo',
      length: 12,
      pitchDeg: 13,
      name: 'Lompatan Bantal',
    },
    {
      type: 'gap',
      length: 24,
      exitPitchDeg: -11,
      name: 'Lompatan Bantal',
    },
    {
      type: 'pitchTo',
      length: 30,
      pitchDeg: 0,
      checkpoint: true,
      name: 'Lompatan Bantal',
    },

    // 6. Corner 2 -> +55 deg right turn aligning south (+Z)
    {
      type: 'curve',
      radius: 80,
      angleDeg: 55,
      bankDeg: -11,
    },

    // 7. Zone 3 — Terowongan Selimut: 195 m enclosed blanket tunnel
    {
      type: 'straight',
      length: 195,
      style: 'tunnel',
      checkpoint: true,
      name: 'Terowongan Selimut',
    },

    // 8..9. Loop approach (>= 100 m straight/downhill with wide boost pad)
    {
      type: 'straight',
      length: 65,
    },
    {
      type: 'slope',
      length: 65,
      pitchDeg: -4,
      checkpoint: true,
      boostPads: [{ at: 0.45, lateral: 0, width: 4.8 }],
    },

    // 10. Zone 4 — Loop Jam Weker: vertical alarm-clock loop (offset > trackWidth + 6 m = 20 m)
    {
      type: 'loop',
      radius: 22,
      lateralOffset: 22,
      name: 'Loop Jam Weker',
    },

    // 11. Loop exit straight (155 m)
    {
      type: 'straight',
      length: 155,
      checkpoint: true,
    },

    // 12. Corner 3 -> +90 deg right turn heading west (-X)
    {
      type: 'curve',
      radius: 85,
      angleDeg: 90,
      bankDeg: -12,
    },

    // 13..17. Zone 5 — Jembatan Rak Buku: 190 m gentle arched bridge span
    {
      type: 'straight',
      length: 45,
      style: 'bridge',
      name: 'Jembatan Rak Buku',
    },
    {
      type: 'pitchTo',
      length: 25,
      pitchDeg: 5,
      style: 'bridge',
      name: 'Jembatan Rak Buku',
    },
    {
      type: 'straight',
      length: 60,
      style: 'bridge',
      checkpoint: true,
      name: 'Jembatan Rak Buku',
    },
    {
      type: 'pitchTo',
      length: 25,
      pitchDeg: -5,
      style: 'bridge',
      name: 'Jembatan Rak Buku',
    },
    {
      type: 'pitchTo',
      length: 35,
      pitchDeg: 0,
      style: 'bridge',
      name: 'Jembatan Rak Buku',
    },

    // 18. Straight connector into Tikungan Karpet
    {
      type: 'straight',
      length: 45,
    },

    // 19..21. Zone 6 — Tikungan Karpet: hairpin pair (right then left) with exit boost pads
    {
      type: 'curve',
      radius: 45,
      angleDeg: 135,
      bankDeg: -14,
      checkpoint: true,
      name: 'Tikungan Karpet',
    },
    {
      type: 'curve',
      radius: 45,
      angleDeg: -135,
      bankDeg: 14,
      name: 'Tikungan Karpet',
    },
    {
      type: 'straight',
      length: 100,
      boostPads: [
        { at: 0.68, lateral: -3.2, width: 3.2 },
        { at: 0.68, lateral: 3.2, width: 3.2 },
      ],
      name: 'Tikungan Karpet',
    },

    // 22..26. Sweeping return arc back to Kasur Start axis (x = 0, y = 18, heading -Z)
    {
      type: 'curve',
      radius: 58,
      angleDeg: 155,
      bankDeg: -13,
      checkpoint: true,
      adjust: true,
    },
    {
      type: 'slope',
      length: 165,
      pitchDeg: 1.0,
      adjust: true,
    },
    {
      type: 'straight',
      length: 45,
      checkpoint: true,
      adjust: true,
    },
    {
      type: 'curve',
      radius: 65,
      angleDeg: -65,
      bankDeg: 11,
      adjust: true,
    },
    {
      type: 'straight',
      length: 85,
      adjust: true,
    },
  ],
  // Initial estimates — will be calibrated from validateCourse autopilot output
  referenceLapTime: 56.0,
  referenceTime: 168.0,
  medals: {
    gold: 184.8,
    silver: 218.4,
    bronze: 268.8,
  },
};
