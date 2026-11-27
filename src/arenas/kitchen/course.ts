// src/arenas/kitchen/course.ts
// Closed 3-lap circuit on a giant kitchen counter for Arena 3 ("Dapur Raksasa").

import type { RouteDefinition } from '../../courses/types';
import type { ArenaCourseData } from '../types';

export const kitchenShortcutRoutes: readonly RouteDefinition[] = [
  {
    id: 'shortcut',
    name: 'Rute Pintas Rak Bumbu',
    width: 8,
    startOffset: 11,
    endOffset: 3,
    entryGapLength: 32,
    mergeGapLength: 50,
    fromAnchor: { segmentIndex: 18, at: 0.655 },
    toAnchor: { segmentIndex: 23, at: 0.45 },
    segments: [
      { type: 'straight', length: 32 },
      { type: 'curve', radius: 22, angleDeg: 65, bankDeg: -10 },
      { type: 'straight', length: 24, style: 'bridge', name: 'Rute Pintas Rak Bumbu' },
      { type: 'curve', radius: 36, angleDeg: -100, bankDeg: 10, adjust: true },
      {
        type: 'pitchTo',
        length: 10,
        pitchDeg: 10,
        boostPads: [{ at: 0.45, lateral: 0, width: 3.4 }],
        name: 'Rute Pintas Rak Bumbu',
      },
      { type: 'gap', length: 20, exitPitchDeg: -10, name: 'Rute Pintas Rak Bumbu' },
      { type: 'pitchTo', length: 28, pitchDeg: 0, adjust: true, name: 'Rute Pintas Rak Bumbu' },
      { type: 'slope', length: 65, pitchDeg: 0, adjust: true, name: 'Rute Pintas Rak Bumbu' },
      { type: 'straight', length: 30, adjust: true },
      { type: 'curve', radius: 30, angleDeg: 135, bankDeg: -10, adjust: true },
      { type: 'straight', length: 28 },
    ],
  },
];

export const kitchenCourse: ArenaCourseData = {
  closed: true,
  trackWidth: 14,
  startPosition: { x: 0, y: 20, z: 120 },
  startHeadingDeg: 0,
  segments: [
    // 1. Meja Start: straight with 4-car starting grid
    {
      type: 'straight',
      length: 170,
      name: 'Meja Start',
    },

    // 2. Corner 1 -> +X
    {
      type: 'curve',
      radius: 85,
      angleDeg: 90,
      bankDeg: -12,
    },

    // 3. Lompatan Talenan: boost approach -> 14 deg ramp -> 26 m gap -> smooth landing
    {
      type: 'straight',
      length: 70,
      checkpoint: true,
      boostPads: [{ at: 0.45, lateral: 0, width: 4.5 }],
      name: 'Lompatan Talenan',
    },
    {
      type: 'pitchTo',
      length: 12,
      pitchDeg: 14,
      name: 'Lompatan Talenan',
    },
    {
      type: 'gap',
      length: 26,
      exitPitchDeg: -12,
      name: 'Lompatan Talenan',
    },
    {
      type: 'pitchTo',
      length: 30,
      pitchDeg: 0,
      checkpoint: true,
      name: 'Lompatan Talenan',
    },

    // 4. Corner 2 -> +Z
    {
      type: 'curve',
      radius: 85,
      angleDeg: 90,
      bankDeg: -12,
    },

    // 5. Terowongan Panci: enclosed tunnel section
    {
      type: 'straight',
      length: 130,
      style: 'tunnel',
      checkpoint: true,
      name: 'Terowongan Panci',
    },

    // 6. Straight + gentle downhill with boost pads feeding Loop Wajan (>= 100 m run-in)
    {
      type: 'straight',
      length: 60,
    },
    {
      type: 'slope',
      length: 60,
      pitchDeg: -4,
      checkpoint: true,
      boostPads: [{ at: 0.45, lateral: 0, width: 4.8 }],
    },

    // 7. Loop Wajan: vertical loop (offset > trackWidth + 6 m = 20 m)
    {
      type: 'loop',
      radius: 22,
      lateralOffset: 22,
      name: 'Loop Wajan',
    },

    // 8. Loop exit + Corner 3 -> -X
    {
      type: 'straight',
      length: 65,
      checkpoint: true,
    },
    {
      type: 'curve',
      radius: 85,
      angleDeg: 90,
      bankDeg: -12,
    },

    // 9. Jembatan Wastafel: gentle bridge arc over the sink span
    {
      type: 'straight',
      length: 50,
      style: 'bridge',
      name: 'Jembatan Wastafel',
    },
    {
      type: 'pitchTo',
      length: 25,
      pitchDeg: 6,
      style: 'bridge',
      name: 'Jembatan Wastafel',
    },
    {
      type: 'straight',
      length: 60,
      style: 'bridge',
      checkpoint: true,
      name: 'Jembatan Wastafel',
    },
    {
      type: 'pitchTo',
      length: 30,
      pitchDeg: -5,
      style: 'bridge',
      name: 'Jembatan Wastafel',
    },
    {
      type: 'pitchTo',
      length: 35,
      pitchDeg: 0,
      style: 'bridge',
      name: 'Jembatan Wastafel',
    },

    // 10. Straight run leading into Tikungan Kompor (potential shortcut entry anchor)
    {
      type: 'straight',
      length: 95,
    },

    // 11. Tikungan Kompor: left hairpin then right hairpin with exit boost pads
    {
      type: 'curve',
      radius: 50,
      angleDeg: -135,
      bankDeg: 14,
      checkpoint: true,
      name: 'Tikungan Kompor',
    },
    {
      type: 'curve',
      radius: 50,
      angleDeg: 135,
      bankDeg: -14,
      name: 'Tikungan Kompor',
    },
    {
      type: 'straight',
      length: 75,
      boostPads: [
        { at: 0.45, lateral: -3.2, width: 3.2 },
        { at: 0.45, lateral: 3.2, width: 3.2 },
      ],
      name: 'Tikungan Kompor',
    },

    // 12. Corner 4 -> -Z
    {
      type: 'curve',
      radius: 85,
      angleDeg: 90,
      bankDeg: -12,
      checkpoint: true,
      adjust: true,
    },

    // 13. Back straight heading north (potential shortcut merge anchor)
    {
      type: 'straight',
      length: 115,
      adjust: true,
    },

    // 14. Return S-bend back to main straight axis (x = 0, heading -Z)
    {
      type: 'curve',
      radius: 85,
      angleDeg: 90,
      bankDeg: -12,
      adjust: true,
    },
    {
      type: 'slope',
      length: 130,
      pitchDeg: -1.2,
      checkpoint: true,
      adjust: true,
    },
    {
      type: 'curve',
      radius: 85,
      angleDeg: -90,
      bankDeg: 12,
      adjust: true,
    },
    {
      type: 'straight',
      length: 65,
      adjust: true,
    },
  ],
  // Calibrated from autopilot simulation (npm run validate:course -- --course=kitchen)
  referenceLapTime: 58.17,
  referenceTime: 174.5,
  medals: {
    gold: 191.95,
    silver: 226.85,
    bronze: 279.2,
  },
};
