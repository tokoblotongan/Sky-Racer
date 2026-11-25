// src/courses/types.ts

export type TrackStyle = 'road' | 'bridge' | 'tunnel';

export interface BoostPadSegmentConfig {
  readonly at: number; // pecahan 0..1 di dalam segmen
  readonly lateral: number; // offset dari tengah lintasan (meter)
  readonly width?: number; // lebar pad opsional (default dari CONFIG.boost.padWidth)
}

export type CourseSegmentConfig =
  | {
      readonly type: 'straight';
      readonly length: number;
      readonly width?: number;
      readonly checkpoint?: boolean;
      readonly boostPads?: readonly BoostPadSegmentConfig[];
      readonly adjust?: boolean;
      readonly name?: string;
      readonly style?: TrackStyle;
    }
  | {
      readonly type: 'curve';
      readonly radius: number;
      readonly angleDeg: number; // + kanan, - kiri
      readonly bankDeg: number; // + miring ke kiri, - miring ke kanan
      readonly width?: number;
      readonly checkpoint?: boolean;
      readonly boostPads?: readonly BoostPadSegmentConfig[];
      readonly adjust?: boolean;
      readonly name?: string;
      readonly style?: TrackStyle;
    }
  | {
      readonly type: 'slope';
      readonly length: number;
      readonly pitchDeg: number; // + menanjak, - menurun
      readonly width?: number;
      readonly checkpoint?: boolean;
      readonly boostPads?: readonly BoostPadSegmentConfig[];
      readonly adjust?: boolean;
      readonly name?: string;
      readonly style?: TrackStyle;
    }
  | {
      readonly type: 'pitchTo';
      readonly length: number;
      readonly pitchDeg: number; // transisi halus ke pitchDeg lalu ditahan
      readonly width?: number;
      readonly checkpoint?: boolean;
      readonly boostPads?: readonly BoostPadSegmentConfig[];
      readonly name?: string;
      readonly style?: TrackStyle;
    }
  | {
      readonly type: 'gap';
      readonly length: number;
      readonly exitPitchDeg: number; // garis tengah tetap ada tanpa permukaan
      readonly width?: number;
      readonly checkpoint?: boolean;
      readonly boostPads?: readonly BoostPadSegmentConfig[];
      readonly name?: string;
      readonly style?: TrackStyle;
    }
  | {
      readonly type: 'loop';
      readonly radius: number;
      readonly lateralOffset: number;
      readonly width?: number;
      readonly checkpoint?: boolean;
      readonly boostPads?: readonly BoostPadSegmentConfig[];
      readonly name?: string;
      readonly style?: TrackStyle;
    };

export type ThemeId = 'toyroom' | 'fantasyland';

export interface CourseMedals {
  readonly gold: number;
  readonly silver: number;
  readonly bronze: number;
}

export interface CourseDefinition {
  readonly id: string;
  readonly name: string;
  readonly arenaNumber: number;
  readonly displayName: string;
  readonly tagline: string;
  readonly themeId: ThemeId;
  readonly typeLabel: string;
  readonly closed?: boolean;
  readonly laps?: number;
  readonly trackWidth?: number;
  readonly startPosition?: { readonly x: number; readonly y: number; readonly z: number };
  readonly startHeadingDeg?: number;
  readonly segments: readonly CourseSegmentConfig[];
  readonly referenceTime: number;
  readonly referenceLapTime?: number;
  readonly medals: CourseMedals;
}

