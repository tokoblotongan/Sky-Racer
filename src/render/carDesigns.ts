// src/render/carDesigns.ts

export type CarDesignId = 'gt' | 'wedge';

export interface CrossSectionStation {
  /** Normalized longitudinal coordinate 0 (nose tip) .. 1 (rear tail). */
  readonly z: number;
  readonly halfWidth: number;
  readonly bottomY: number;
  readonly shoulderY: number;
  readonly roofY: number;
  /** Superellipse exponent controlling shoulder crispness (2 = ellipse, 3-4 = sculpted). */
  readonly cornerRoundness: number;
  /** Lateral inset ratio of cabin edge relative to body shoulder width (0..1). */
  readonly cabinInset: number;
}

export interface WheelDesignSpec {
  readonly frontTrackHalfWidth: number;
  readonly rearTrackHalfWidth: number;
  readonly wheelbase: number;
  readonly frontOffsetZ: number;
  readonly rearOffsetZ: number;
  readonly frontRadius: number;
  readonly rearRadius: number;
  readonly frontWidth: number;
  readonly rearWidth: number;
  readonly frontCamberRad: number;
  readonly rearCamberRad: number;
}

export interface CarDesignSpec {
  readonly id: CarDesignId;
  readonly label: string;
  /** Total length along Z; fits strictly within CONFIG.car.carHalfLength * 2 (3.35 m). */
  readonly length: number;
  /** Longitudinal cross-section stations from nose (z=0) to tail (z=1). */
  readonly stations: readonly CrossSectionStation[];
  readonly deckCrown: number;
  readonly cabin: {
    readonly startZ: number;
    readonly endZ: number;
    readonly topStartZ: number;
    readonly topEndZ: number;
    readonly roofCrown: number;
    readonly pillarInset: number;
  };
  readonly wheels: WheelDesignSpec;
  readonly archFlare: {
    readonly thickness: number;
    readonly overhang: number;
    readonly radiusScale: number;
  };
  readonly headlights: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly width: number;
    readonly height: number;
    readonly depth: number;
    readonly sweepY: number;
    readonly tiltX: number;
  };
  readonly taillights: {
    readonly y: number;
    readonly z: number;
    readonly width: number;
    readonly height: number;
    readonly depth: number;
    readonly wrapDepth: number;
  };
  readonly spoiler: {
    readonly style: 'ducktail' | 'wedge';
    readonly z: number;
    readonly y: number;
    readonly width: number;
    readonly chord: number;
    readonly height: number;
    readonly tiltX: number;
  };
  readonly mirrors: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly width: number;
    readonly height: number;
    readonly depth: number;
  };
  readonly exhausts: {
    readonly xOffset: number;
    readonly y: number;
    readonly z: number;
    readonly radius: number;
    readonly length: number;
  };
  readonly diffuser: {
    readonly width: number;
    readonly height: number;
    readonly depth: number;
    readonly y: number;
    readonly z: number;
    readonly finCount: number;
  };
  readonly splitter: {
    readonly width: number;
    readonly height: number;
    readonly depth: number;
    readonly y: number;
    readonly z: number;
  };
  readonly grille: {
    readonly width: number;
    readonly height: number;
    readonly depth: number;
    readonly y: number;
    readonly z: number;
  };
  readonly underglow: {
    readonly width: number;
    readonly length: number;
    readonly y: number;
    readonly z: number;
  };
}

export const CAR_DESIGNS: Record<CarDesignId, CarDesignSpec> = {
  gt: {
    id: 'gt',
    label: 'GT Coupe',
    // Length 3.22 m (with endcaps ~3.29 m <= 3.35 m), max width with flares <= 1.66 m (<= 1.70 m)
    length: 3.22,
    deckCrown: 0.04,
    stations: [
      { z: 0.0, halfWidth: 0.44, bottomY: 0.13, shoulderY: 0.26, roofY: 0.26, cornerRoundness: 2.5, cabinInset: 0.92 },
      { z: 0.06, halfWidth: 0.65, bottomY: 0.10, shoulderY: 0.42, roofY: 0.42, cornerRoundness: 2.8, cabinInset: 0.86 },
      { z: 0.14, halfWidth: 0.72, bottomY: 0.10, shoulderY: 0.58, roofY: 0.58, cornerRoundness: 3.0, cabinInset: 0.78 },
      { z: 0.21, halfWidth: 0.73, bottomY: 0.11, shoulderY: 0.64, roofY: 0.64, cornerRoundness: 3.1, cabinInset: 0.66 },
      { z: 0.34, halfWidth: 0.69, bottomY: 0.11, shoulderY: 0.59, roofY: 0.61, cornerRoundness: 3.2, cabinInset: 0.16 },
      { z: 0.48, halfWidth: 0.69, bottomY: 0.11, shoulderY: 0.61, roofY: 0.88, cornerRoundness: 3.3, cabinInset: 0.19 },
      { z: 0.63, halfWidth: 0.72, bottomY: 0.11, shoulderY: 0.64, roofY: 0.86, cornerRoundness: 3.3, cabinInset: 0.21 },
      { z: 0.80, halfWidth: 0.78, bottomY: 0.11, shoulderY: 0.69, roofY: 0.74, cornerRoundness: 3.1, cabinInset: 0.25 },
      { z: 0.90, halfWidth: 0.76, bottomY: 0.12, shoulderY: 0.67, roofY: 0.68, cornerRoundness: 3.0, cabinInset: 0.36 },
      { z: 0.96, halfWidth: 0.71, bottomY: 0.16, shoulderY: 0.62, roofY: 0.62, cornerRoundness: 2.9, cabinInset: 0.68 },
      { z: 1.0, halfWidth: 0.55, bottomY: 0.22, shoulderY: 0.56, roofY: 0.56, cornerRoundness: 2.5, cabinInset: 0.90 },
    ],
    cabin: {
      startZ: 0.34,
      endZ: 0.86,
      topStartZ: 0.47,
      topEndZ: 0.68,
      roofCrown: 0.032,
      pillarInset: 0.014,
    },
    wheels: {
      frontTrackHalfWidth: 0.655,
      rearTrackHalfWidth: 0.68,
      wheelbase: 1.96,
      frontOffsetZ: -0.95,
      rearOffsetZ: 1.01,
      frontRadius: 0.315,
      rearRadius: 0.335,
      frontWidth: 0.24,
      rearWidth: 0.26,
      frontCamberRad: 0.032,
      rearCamberRad: 0.042,
    },
    archFlare: {
      thickness: 0.044,
      overhang: 0.045,
      radiusScale: 1.11,
    },
    headlights: {
      x: 0.50,
      y: 0.46,
      z: -1.41,
      width: 0.30,
      height: 0.068,
      depth: 0.22,
      sweepY: 0.34,
      tiltX: 0.22,
    },
    taillights: {
      y: 0.55,
      z: 1.575,
      width: 1.20,
      height: 0.068,
      depth: 0.06,
      wrapDepth: 0.13,
    },
    spoiler: {
      style: 'ducktail',
      z: 1.50,
      y: 0.66,
      width: 1.42,
      chord: 0.23,
      height: 0.11,
      tiltX: 0.36,
    },
    mirrors: {
      x: 0.70,
      y: 0.64,
      z: -0.34,
      width: 0.14,
      height: 0.066,
      depth: 0.11,
    },
    exhausts: {
      xOffset: 0.32,
      y: 0.19,
      z: 1.57,
      radius: 0.066,
      length: 0.14,
    },
    diffuser: {
      width: 1.04,
      height: 0.14,
      depth: 0.22,
      y: 0.16,
      z: 1.50,
      finCount: 4,
    },
    splitter: {
      width: 1.36,
      height: 0.042,
      depth: 0.22,
      y: 0.095,
      z: -1.52,
    },
    grille: {
      width: 0.86,
      height: 0.13,
      depth: 0.08,
      y: 0.21,
      z: -1.57,
    },
    underglow: {
      width: 1.12,
      length: 2.38,
      y: 0.085,
      z: 0.02,
    },
  },
  wedge: {
    id: 'wedge',
    label: 'Aero Wedge',
    // Length 3.24 m (with endcaps ~3.31 m <= 3.35 m), max width with flares <= 1.66 m (<= 1.70 m)
    length: 3.24,
    deckCrown: 0.03,
    stations: [
      { z: 0.0, halfWidth: 0.40, bottomY: 0.09, shoulderY: 0.21, roofY: 0.21, cornerRoundness: 3.2, cabinInset: 0.92 },
      { z: 0.07, halfWidth: 0.64, bottomY: 0.09, shoulderY: 0.38, roofY: 0.38, cornerRoundness: 3.6, cabinInset: 0.82 },
      { z: 0.16, halfWidth: 0.72, bottomY: 0.09, shoulderY: 0.56, roofY: 0.56, cornerRoundness: 3.8, cabinInset: 0.54 },
      { z: 0.22, halfWidth: 0.73, bottomY: 0.10, shoulderY: 0.61, roofY: 0.61, cornerRoundness: 4.0, cabinInset: 0.28 },
      { z: 0.32, halfWidth: 0.70, bottomY: 0.10, shoulderY: 0.56, roofY: 0.66, cornerRoundness: 4.0, cabinInset: 0.16 },
      { z: 0.45, halfWidth: 0.70, bottomY: 0.10, shoulderY: 0.57, roofY: 0.82, cornerRoundness: 4.0, cabinInset: 0.18 },
      { z: 0.60, halfWidth: 0.73, bottomY: 0.10, shoulderY: 0.61, roofY: 0.79, cornerRoundness: 4.0, cabinInset: 0.22 },
      { z: 0.78, halfWidth: 0.78, bottomY: 0.10, shoulderY: 0.68, roofY: 0.72, cornerRoundness: 3.8, cabinInset: 0.28 },
      { z: 0.90, halfWidth: 0.76, bottomY: 0.11, shoulderY: 0.67, roofY: 0.68, cornerRoundness: 3.6, cabinInset: 0.44 },
      { z: 0.97, halfWidth: 0.72, bottomY: 0.15, shoulderY: 0.62, roofY: 0.62, cornerRoundness: 3.4, cabinInset: 0.72 },
      { z: 1.0, halfWidth: 0.57, bottomY: 0.20, shoulderY: 0.57, roofY: 0.57, cornerRoundness: 3.0, cabinInset: 0.90 },
    ],
    cabin: {
      startZ: 0.26,
      endZ: 0.82,
      topStartZ: 0.42,
      topEndZ: 0.61,
      roofCrown: 0.025,
      pillarInset: 0.012,
    },
    wheels: {
      frontTrackHalfWidth: 0.655,
      rearTrackHalfWidth: 0.68,
      wheelbase: 1.96,
      frontOffsetZ: -0.94,
      rearOffsetZ: 1.02,
      frontRadius: 0.305,
      rearRadius: 0.335,
      frontWidth: 0.24,
      rearWidth: 0.265,
      frontCamberRad: 0.036,
      rearCamberRad: 0.046,
    },
    archFlare: {
      thickness: 0.044,
      overhang: 0.045,
      radiusScale: 1.11,
    },
    headlights: {
      x: 0.49,
      y: 0.39,
      z: -1.42,
      width: 0.32,
      height: 0.052,
      depth: 0.24,
      sweepY: 0.40,
      tiltX: 0.18,
    },
    taillights: {
      y: 0.57,
      z: 1.585,
      width: 1.24,
      height: 0.06,
      depth: 0.055,
      wrapDepth: 0.11,
    },
    spoiler: {
      style: 'wedge',
      z: 1.52,
      y: 0.67,
      width: 1.48,
      chord: 0.26,
      height: 0.11,
      tiltX: 0.24,
    },
    mirrors: {
      x: 0.70,
      y: 0.60,
      z: -0.52,
      width: 0.14,
      height: 0.06,
      depth: 0.11,
    },
    exhausts: {
      xOffset: 0.28,
      y: 0.19,
      z: 1.58,
      radius: 0.07,
      length: 0.14,
    },
    diffuser: {
      width: 1.10,
      height: 0.15,
      depth: 0.24,
      y: 0.16,
      z: 1.51,
      finCount: 5,
    },
    splitter: {
      width: 1.40,
      height: 0.044,
      depth: 0.24,
      y: 0.085,
      z: -1.53,
    },
    grille: {
      width: 0.94,
      height: 0.11,
      depth: 0.09,
      y: 0.17,
      z: -1.58,
    },
    underglow: {
      width: 1.16,
      length: 2.42,
      y: 0.078,
      z: 0.02,
    },
  },
};
