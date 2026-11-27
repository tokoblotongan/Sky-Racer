// src/arenas/kitchen/decorData.ts
// Data-driven zone prop placements, palette rules, and seeded fill config for Arena 3 ("Dapur Raksasa").

import type { GraphicsPreset } from '../../config';

export type KitchenZoneId =
  | 'meja-start'
  | 'lompatan-talenan'
  | 'terowongan-panci'
  | 'loop-wajan'
  | 'jembatan-wastafel'
  | 'tikungan-kompor'
  | 'rute-pintas-rak-bumbu';

export type KitchenPropType =
  | 'salt-shaker'
  | 'pepper-shaker'
  | 'checkered-flag'
  | 'fruit-bowl'
  | 'cutting-board-ramp'
  | 'spatula'
  | 'whisk'
  | 'pot-tunnel-shell'
  | 'pot-lid'
  | 'kettle'
  | 'pan-loop-frame'
  | 'plate-tower'
  | 'sink-basin'
  | 'sink-water'
  | 'faucet-arch'
  | 'dish-rack'
  | 'stove-burner'
  | 'stove-knob-bar'
  | 'spice-shelf'
  | 'spice-arrow-sign'
  | 'mug'
  | 'measuring-cup'
  | 'spice-jar'
  | 'toaster'
  | 'rolling-pin';

export interface KitchenPropPlacement {
  readonly id: string;
  readonly zone: KitchenZoneId;
  readonly type: KitchenPropType;
  readonly sOffset: number;
  readonly lateralOffset: number;
  readonly scale: number;
  readonly color: string;
  readonly secondaryColor?: string;
  readonly rotation: number;
  readonly yOffset?: number;
  readonly isTrackStructure?: boolean;
  readonly minPreset?: GraphicsPreset;
}

export interface KitchenZoneAnchor {
  readonly id: KitchenZoneId;
  readonly label: string;
  readonly routeId: 'main' | 'shortcut';
  readonly baseS: number;
  readonly centerS: number;
}

export interface KitchenFillConfig {
  readonly seed: number;
  readonly sStepMeters: number;
  readonly minLateralOffset: number;
  readonly maxLateralOffset: number;
  readonly minPropSeparationMeters: number;
  readonly allowedTypes: readonly (
    | 'mug'
    | 'measuring-cup'
    | 'spice-jar'
    | 'toaster'
    | 'rolling-pin'
  )[];
  readonly allowedColors: readonly string[];
  readonly secondaryColors: readonly string[];
}

export const KITCHEN_ZONE_ANCHORS: readonly KitchenZoneAnchor[] = [
  { id: 'meja-start', label: 'Meja Start', routeId: 'main', baseS: 0, centerS: 45 },
  { id: 'lompatan-talenan', label: 'Lompatan Talenan', routeId: 'main', baseS: 303.5, centerS: 372 },
  { id: 'terowongan-panci', label: 'Terowongan Panci', routeId: 'main', baseS: 575.0, centerS: 640 },
  { id: 'loop-wajan', label: 'Loop Wajan', routeId: 'main', baseS: 825.0, centerS: 894 },
  { id: 'jembatan-wastafel', label: 'Jembatan Wastafel', routeId: 'main', baseS: 1161.8, centerS: 1262 },
  { id: 'tikungan-kompor', label: 'Tikungan Kompor', routeId: 'main', baseS: 1456.8, centerS: 1612 },
  { id: 'rute-pintas-rak-bumbu', label: 'Rute Pintas Rak Bumbu', routeId: 'shortcut', baseS: 0, centerS: 145 },
];

// Footprint radii at scale = 1.0 used both during fill placement and Arena Kit clearance validation.
export const KITCHEN_PROP_BASE_RADIUS: Record<KitchenPropType, number> = {
  'salt-shaker': 4.0,
  'pepper-shaker': 4.0,
  'checkered-flag': 1.5,
  'fruit-bowl': 8.2,
  'cutting-board-ramp': 11.0,
  spatula: 4.0,
  whisk: 3.8,
  'pot-tunnel-shell': 13.5,
  'pot-lid': 7.5,
  kettle: 5.2,
  'pan-loop-frame': 24.0,
  'plate-tower': 7.2,
  'sink-basin': 32.0,
  'sink-water': 29.0,
  'faucet-arch': 5.5,
  'dish-rack': 8.5,
  'stove-burner': 11.0,
  'stove-knob-bar': 6.0,
  'spice-shelf': 5.2,
  'spice-arrow-sign': 1.8,
  mug: 3.8,
  'measuring-cup': 3.6,
  'spice-jar': 2.6,
  toaster: 5.2,
  'rolling-pin': 4.2,
};

// Vivid non-orange, non-brown palette keeping the orange track (#FF5A00) dominant.
export const KITCHEN_VIVID_PROP_COLORS = [
  '#14B8A6', // teal
  '#00E5FF', // cyan
  '#0A5CFF', // royal blue
  '#7E22CE', // purple
  '#EC4899', // magenta
  '#FFD000', // yellow
  '#84CC16', // lime green
  '#F8FAFC', // white
  '#FF2D3D', // cherry red
] as const;

export const KITCHEN_ZONE_PROPS: readonly KitchenPropPlacement[] = [
  // 1. Meja Start
  {
    id: 'start-flag-left',
    zone: 'meja-start',
    type: 'checkered-flag',
    sOffset: 5,
    lateralOffset: -13.5,
    scale: 1.0,
    color: '#0A5CFF',
    secondaryColor: '#FFFFFF',
    rotation: 0.12,
  },
  {
    id: 'start-flag-right',
    zone: 'meja-start',
    type: 'checkered-flag',
    sOffset: 5,
    lateralOffset: 13.5,
    scale: 1.0,
    color: '#FF2D3D',
    secondaryColor: '#FFFFFF',
    rotation: -0.12,
  },
  {
    id: 'start-salt-shaker',
    zone: 'meja-start',
    type: 'salt-shaker',
    sOffset: 24,
    lateralOffset: -18.5,
    scale: 1.0,
    color: '#F8FAFC',
    secondaryColor: '#00E5FF',
    rotation: 0.3,
  },
  {
    id: 'start-pepper-shaker',
    zone: 'meja-start',
    type: 'pepper-shaker',
    sOffset: 24,
    lateralOffset: 18.5,
    scale: 1.0,
    color: '#1E293B',
    secondaryColor: '#7E22CE',
    rotation: -0.3,
  },
  {
    id: 'start-fruit-bowl',
    zone: 'meja-start',
    type: 'fruit-bowl',
    sOffset: 88,
    lateralOffset: -24.0,
    scale: 1.0,
    color: '#00E5FF',
    secondaryColor: '#7E22CE',
    rotation: 0.45,
  },

  // 2. Lompatan Talenan
  {
    id: 'talenan-board-ramp',
    zone: 'lompatan-talenan',
    type: 'cutting-board-ramp',
    sOffset: 68.5,
    lateralOffset: 0,
    scale: 1.0,
    color: '#84CC16',
    secondaryColor: '#22C55E',
    rotation: 0,
    isTrackStructure: true,
  },
  {
    id: 'talenan-spatula',
    zone: 'lompatan-talenan',
    type: 'spatula',
    sOffset: 64,
    lateralOffset: -19.0,
    scale: 1.0,
    color: '#0A5CFF',
    secondaryColor: '#F8FAFC',
    rotation: 0.4,
  },
  {
    id: 'talenan-whisk',
    zone: 'lompatan-talenan',
    type: 'whisk',
    sOffset: 76,
    lateralOffset: 19.0,
    scale: 1.0,
    color: '#EC4899',
    secondaryColor: '#E2E8F0',
    rotation: -0.35,
  },

  // 3. Terowongan Panci
  {
    id: 'panci-tunnel-shell',
    zone: 'terowongan-panci',
    type: 'pot-tunnel-shell',
    sOffset: 65,
    lateralOffset: 0,
    scale: 1.0,
    color: '#0A5CFF',
    secondaryColor: '#F8FAFC',
    rotation: 0,
    isTrackStructure: true,
  },
  {
    id: 'panci-kettle',
    zone: 'terowongan-panci',
    type: 'kettle',
    sOffset: -12,
    lateralOffset: -21.0,
    scale: 1.0,
    color: '#EC4899',
    secondaryColor: '#00E5FF',
    rotation: 0.65,
  },
  {
    id: 'panci-lid',
    zone: 'terowongan-panci',
    type: 'pot-lid',
    sOffset: 65,
    lateralOffset: -28.0,
    scale: 1.0,
    color: '#0A5CFF',
    secondaryColor: '#E2E8F0',
    rotation: 1.4,
  },

  // 4. Loop Wajan
  {
    id: 'wajan-loop-frame',
    zone: 'loop-wajan',
    type: 'pan-loop-frame',
    sOffset: 69.15,
    lateralOffset: 0,
    scale: 1.0,
    color: '#7E22CE',
    secondaryColor: '#14B8A6',
    rotation: 0,
    isTrackStructure: true,
  },
  {
    id: 'wajan-plate-tower',
    zone: 'loop-wajan',
    type: 'plate-tower',
    sOffset: 24,
    lateralOffset: -36.0,
    scale: 1.0,
    color: '#F8FAFC',
    secondaryColor: '#00E5FF',
    rotation: 0.2,
  },

  // 5. Jembatan Wastafel
  {
    id: 'wastafel-basin',
    zone: 'jembatan-wastafel',
    type: 'sink-basin',
    sOffset: 100,
    lateralOffset: 0,
    scale: 1.0,
    color: '#E2E8F0',
    secondaryColor: '#14B8A6',
    rotation: 0,
    isTrackStructure: true,
  },
  {
    id: 'wastafel-water',
    zone: 'jembatan-wastafel',
    type: 'sink-water',
    sOffset: 100,
    lateralOffset: 0,
    scale: 1.0,
    color: '#00B4FF',
    secondaryColor: '#00E5FF',
    rotation: 0,
    isTrackStructure: true,
  },
  {
    id: 'wastafel-faucet',
    zone: 'jembatan-wastafel',
    type: 'faucet-arch',
    sOffset: 106,
    lateralOffset: 0,
    scale: 1.0,
    color: '#E2E8F0',
    secondaryColor: '#00E5FF',
    rotation: 0,
    isTrackStructure: true,
  },
  {
    id: 'wastafel-dish-rack',
    zone: 'jembatan-wastafel',
    type: 'dish-rack',
    sOffset: 98,
    lateralOffset: 42.0,
    scale: 1.0,
    color: '#00E5FF',
    secondaryColor: '#FF2D3D',
    rotation: 0.1,
  },

  // 6. Tikungan Kompor (4 glowing magenta-red burners + front knob bar placed in clear pockets around the hairpin)
  {
    id: 'kompor-burner-1',
    zone: 'tikungan-kompor',
    type: 'stove-burner',
    sOffset: 62,
    lateralOffset: -42.0,
    scale: 1.0,
    color: '#1E293B',
    secondaryColor: '#FF1E5A',
    rotation: 0.2,
  },
  {
    id: 'kompor-burner-2',
    zone: 'tikungan-kompor',
    type: 'stove-burner',
    sOffset: 178,
    lateralOffset: -38.0,
    scale: 0.95,
    color: '#1E293B',
    secondaryColor: '#FF1E5A',
    rotation: 0.5,
  },
  {
    id: 'kompor-burner-3',
    zone: 'tikungan-kompor',
    type: 'stove-burner',
    sOffset: 186,
    lateralOffset: 54.0,
    scale: 1.05,
    color: '#1E293B',
    secondaryColor: '#FF1E5A',
    rotation: -0.3,
  },
  {
    id: 'kompor-burner-4',
    zone: 'tikungan-kompor',
    type: 'stove-burner',
    sOffset: 266,
    lateralOffset: -36.0,
    scale: 0.95,
    color: '#1E293B',
    secondaryColor: '#FF1E5A',
    rotation: 0.1,
  },
  {
    id: 'kompor-knob-bar',
    zone: 'tikungan-kompor',
    type: 'stove-knob-bar',
    sOffset: 266,
    lateralOffset: -21.0,
    scale: 1.0,
    color: '#1E293B',
    secondaryColor: '#FFD000',
    rotation: 0,
  },

  // 7. Rute Pintas Rak Bumbu
  {
    id: 'rak-bumbu-arrow',
    zone: 'rute-pintas-rak-bumbu',
    type: 'spice-arrow-sign',
    sOffset: 16,
    lateralOffset: 9.8,
    scale: 1.0,
    color: '#0F172A',
    secondaryColor: '#00E5FF',
    rotation: -0.35,
  },
  {
    id: 'rak-bumbu-shelf-1',
    zone: 'rute-pintas-rak-bumbu',
    type: 'spice-shelf',
    sOffset: 68,
    lateralOffset: -14.8,
    scale: 1.0,
    color: '#0A5CFF',
    secondaryColor: '#00E5FF',
    rotation: 0.05,
  },
  {
    id: 'rak-bumbu-shelf-2',
    zone: 'rute-pintas-rak-bumbu',
    type: 'spice-shelf',
    sOffset: 245,
    lateralOffset: -15.2,
    scale: 0.95,
    color: '#7E22CE',
    secondaryColor: '#FFD000',
    rotation: -0.05,
    minPreset: 'seimbang',
  },
];

export const KITCHEN_FILL_CONFIG: KitchenFillConfig = {
  seed: 3026,
  sStepMeters: 52,
  minLateralOffset: 17.5,
  maxLateralOffset: 38.0,
  minPropSeparationMeters: 16.0,
  allowedTypes: ['mug', 'measuring-cup', 'spice-jar', 'toaster', 'rolling-pin'],
  allowedColors: KITCHEN_VIVID_PROP_COLORS,
  secondaryColors: ['#F8FAFC', '#00E5FF', '#FFD000', '#EC4899', '#84CC16'],
};
