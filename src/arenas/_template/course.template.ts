// src/arenas/_template/course.template.ts
// Minimal valid closed-circuit starter course for a new arena.
// Replace geometry, medals, and zones to build your own layout.

import { CONFIG } from '../../config';
import type { ArenaCourseData } from '../types';

export const templateArenaCourse: ArenaCourseData = {
  closed: true,
  trackWidth: 16,
  startPosition: { x: 0, y: 8, z: 0 },
  startHeadingDeg: 0,
  referenceTime: 60,
  referenceLapTime: 20,
  medals: {
    gold: 66,
    silver: 78,
    bronze: 96,
  },
  segments: [
    {
      type: 'straight',
      name: 'Start Straight',
      length: 120,
      checkpoint: true,
      boostPads: [{ at: 0.35, lateral: 0 }],
    },
    {
      type: 'curve',
      name: 'Turn 1',
      radius: 45,
      angleDeg: 90,
      bankDeg: 10,
      adjust: true,
    },
    {
      type: 'straight',
      name: 'North Straight',
      length: 100,
      checkpoint: true,
      adjust: true,
    },
    {
      type: 'curve',
      name: 'Turn 2',
      radius: 45,
      angleDeg: 90,
      bankDeg: 10,
      adjust: true,
    },
    {
      type: 'straight',
      name: 'Back Straight',
      length: 120,
      checkpoint: true,
      boostPads: [{ at: 0.25, lateral: 0 }],
      adjust: true,
    },
    {
      type: 'curve',
      name: 'Turn 3',
      radius: 45,
      angleDeg: 90,
      bankDeg: 10,
      adjust: true,
    },
    {
      type: 'straight',
      name: 'South Straight',
      length: 100,
      checkpoint: true,
      adjust: true,
    },
    {
      type: 'curve',
      name: 'Final Turn',
      radius: 45,
      angleDeg: 90,
      bankDeg: 10,
      adjust: true,
    },
  ],
};

// Suppress unused config warning when copied verbatim as starter template
void CONFIG.course.trackWidth;
