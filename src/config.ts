// src/config.ts

import type { BoostPadSegmentConfig, CourseSegmentConfig } from './courses/types';

export type { BoostPadSegmentConfig, CourseSegmentConfig };

const CAR_BODY_LENGTH = 3.35;
const CAR_BODY_WIDTH = 1.7;

export type VisualPresetName = 'vivid' | 'pastel';
export type GraphicsPreset = 'hemat' | 'seimbang' | 'penuh';

export interface VisualPreset {
  name: VisualPresetName;
  exposure: number;
  skyTop: string;
  skyHorizon: string;
  fogColor: string;
  hemisphereIntensity: number;
  hemisphereSkyColor: string;
  hemisphereGroundColor: string;
  sunIntensity: number;
  sunColor: string;
  envIntensity: number;
  trackEnvIntensity: number;
  trackClearcoatRoughness: number;
  grade: {
    saturation: number;
    contrast: number;
    vignette: number;
  };
  colors: {
    track: string;
    trackEdge: string;
    trackGroove: string;
    trackCenterDash: string;
    rail: string;
    railHighlight: string;
    boost: string;
    boostBase: string;
    boostStripeLight: string;
    boostEmissiveIntensity: number;
    accent: string;
    jumpStripeDark: string;
    woodGrain: string;
    woodSeam: string;
  };
  room: {
    wallColor: string;
    wallStripe: string;
    sideWallColor: string;
    sideWallStripe: string;
    baseboardColor: string;
    ceilingColor: string;
    ceilingSkylightColor: string;
    floorColor: {
      light: string;
      mid: string;
      dark: string;
    };
    windowFrame: string;
    windowSky: string;
    sunbeamColor: string;
    rugBase: string;
    rugBorder: string;
    rugPattern: string;
    woodLight: string;
    woodDark: string;
    paperCream: string;
    lampMetal: string;
    lampShade: string;
    propColors: readonly string[];
  };
  car: {
    bodyColor: string;
    stripeColor: string;
    accentColor: string;
    cabinColorHex: number;
    bumperColorHex: number;
    tireColorHex: number;
    rimColorHex: number;
    exhaustGlowColorHex: number;
  };
  hud: {
    accentYellow: string;
    accentBlue: string;
    accentCyan: string;
    accentOrange: string;
  };
}

export const VISUAL_PRESETS: Record<VisualPresetName, VisualPreset> = {
  vivid: {
    name: 'vivid',
    exposure: 0.95,
    skyTop: '#1E90FF',
    skyHorizon: '#8FD3FF',
    fogColor: '#75C3FF',
    hemisphereIntensity: 0.62,
    hemisphereSkyColor: '#5CB8FF',
    hemisphereGroundColor: '#7A4622',
    sunIntensity: 2.9,
    sunColor: '#FFE0AD',
    envIntensity: 0.45,
    trackEnvIntensity: 0.35,
    trackClearcoatRoughness: 0.2,
    grade: {
      saturation: 1.25,
      contrast: 1.12,
      vignette: 0.15,
    },
    colors: {
      track: '#FF5A00',
      trackEdge: '#FF8A1F',
      trackGroove: '#CC4400',
      trackCenterDash: '#FFFFFF',
      rail: '#0A5CFF',
      railHighlight: '#4D8DFF',
      boost: '#00E5FF',
      boostBase: '#062D4D',
      boostStripeLight: '#E0FFFF',
      boostEmissiveIntensity: 2.8,
      accent: '#FFD000',
      jumpStripeDark: '#141C2B',
      woodGrain: '#4F2810',
      woodSeam: '#381B09',
    },
    room: {
      wallColor: '#14B8A6',
      wallStripe: '#0F9D8D',
      sideWallColor: '#2F9BFF',
      sideWallStripe: '#1F84E5',
      baseboardColor: '#1E293B',
      ceilingColor: '#DCEEFF',
      ceilingSkylightColor: '#7EC8FF',
      floorColor: {
        light: '#9A5A2E',
        mid: '#834A23',
        dark: '#6E3B1A',
      },
      windowFrame: '#334155',
      windowSky: '#5CB8FF',
      sunbeamColor: '#FFE6B0',
      rugBase: '#334155',
      rugBorder: '#0E7490',
      rugPattern: '#1E293B',
      woodLight: '#8D5229',
      woodDark: '#5C3114',
      paperCream: '#E8DFCC',
      lampMetal: '#475569',
      lampShade: '#334155',
      propColors: [
        '#C81E32', // merah
        '#C99E00', // kuning
        '#15803D', // hijau
        '#1D4ED8', // biru
        '#7E22CE', // ungu
        '#B84208', // oranye tua
        '#BE185D', // pink
        '#0E7490', // cyan
      ],
    },
    car: {
      bodyColor: '#FF2D3D',
      stripeColor: '#FFF6E0',
      accentColor: '#FFD000',
      cabinColorHex: 0x111824,
      bumperColorHex: 0x1b2432,
      tireColorHex: 0x14171d,
      rimColorHex: 0xeef4fc,
      exhaustGlowColorHex: 0x00e5ff,
    },
    hud: {
      accentYellow: '#FFD000',
      accentBlue: '#0A5CFF',
      accentCyan: '#00E5FF',
      accentOrange: '#FF5A00',
    },
  },
  pastel: {
    name: 'pastel',
    exposure: 0.9,
    skyTop: '#4DB3FF',
    skyHorizon: '#BFE3FF',
    fogColor: '#A9D8F5',
    hemisphereIntensity: 0.55,
    hemisphereSkyColor: '#BFE3FF',
    hemisphereGroundColor: '#8B5A2B',
    sunIntensity: 2.8,
    sunColor: '#FFE2B8',
    envIntensity: 0.5,
    trackEnvIntensity: 0.35,
    trackClearcoatRoughness: 0.2,
    grade: {
      saturation: 1.12,
      contrast: 1.08,
      vignette: 0.18,
    },
    colors: {
      track: '#FF6A00',
      trackEdge: '#FF963D',
      trackGroove: '#DE5400',
      trackCenterDash: '#FFE2B8',
      rail: '#1E6BFF',
      railHighlight: '#5594FF',
      boost: '#35D4FF',
      boostBase: '#093B5C',
      boostStripeLight: '#E0FAFF',
      boostEmissiveIntensity: 2.25,
      accent: '#FFD23F',
      jumpStripeDark: '#1E293B',
      woodGrain: '#7E471E',
      woodSeam: '#5D3112',
    },
    room: {
      wallColor: '#8FD8D0',
      wallStripe: '#7CC6BE',
      sideWallColor: '#7FC4F0',
      sideWallStripe: '#6FB4E0',
      baseboardColor: '#B59670',
      ceilingColor: '#E8F2FC',
      ceilingSkylightColor: '#A9DCFF',
      floorColor: {
        light: '#B9783A',
        mid: '#A36530',
        dark: '#8E5427',
      },
      windowFrame: '#C9C2B6',
      windowSky: '#7CC6F8',
      sunbeamColor: '#FFE8B8',
      rugBase: '#C2B39C',
      rugBorder: '#79A0BA',
      rugPattern: '#A18264',
      woodLight: '#C28A54',
      woodDark: '#8E582C',
      paperCream: '#CFC8BC',
      lampMetal: '#7E8A96',
      lampShade: '#C8BFA9',
      propColors: [
        '#6CA6CC',
        '#76B898',
        '#CC7F78',
        '#CEAC6B',
        '#9B8CC2',
        '#6C7F91',
      ],
    },
    car: {
      bodyColor: '#F6EFE0',
      stripeColor: '#E11D48',
      accentColor: '#FFD23F',
      cabinColorHex: 0x182232,
      bumperColorHex: 0x263040,
      tireColorHex: 0x171a21,
      rimColorHex: 0xe6edf5,
      exhaustGlowColorHex: 0x35d4ff,
    },
    hud: {
      accentYellow: '#FFD23F',
      accentBlue: '#1E6BFF',
      accentCyan: '#35D4FF',
      accentOrange: '#FF6A00',
    },
  },
};

const DEFAULT_VISUAL_PRESET: VisualPresetName = 'vivid';
const ACTIVE_PRESET = VISUAL_PRESETS[DEFAULT_VISUAL_PRESET];

export const CONFIG = {
  activeCourseId: 'fantasy-land' as string,
  render: {
    trackChunkLength: 60,
    propsChunkLength: 100,
    chunkCullMargin: 60,
    viewDistance: 700, // jarak pandang culling chunk & acuan camera.far tanpa fog
    cullFadeMargin: 80, // jarak penyusutan skala halus chunk sebelum batas viewDistance
    anisotropyMax: 8, // batas atas anisotropic filtering tekstur lantai, lintasan, dan dinding
    shaderPrecompileTimeoutMs: 2000,
    antialias: {
      composerSamples: {
        mobile: 0,
        low: 0,
        medium: 4,
        high: 4,
      },
    },
  },
  safeMode: {
    normalOkStorageKey: 'sky-racer-normal-ok-v1',
    normalTrialStorageKey: 'sky-racer-normal-trial-v1',
    presetStorageKey: 'sky-racer-gfx-preset-v1',
    brightnessStorageKey: 'sky-racer-brightness-v1',
    normalTrialSec: 10,
    consecutiveErrorLimit: 5,
    renderWatchdogMs: 1500,
    maxTextureSize: 512,
    versionTapCount: 5,
    versionTapWindowMs: 2000,
    maxReportErrors: 5,
    statusBannerMs: 3200,
    ambientIntensity: 0.72,
    hemiIntensity: 1.05,
    dirIntensity: 1.15,
    dirOffset: { x: -45, y: 65, z: -55 },
    trackEmissive: 0.14,
    wallLift: 1.48,
    wallTrimEmissive: 0.75,
    distantTrackLift: 0.36,
    distantTrackStartM: 45,
    distantTrackEndM: 220,
    targetLuma: 0.42,
    brightnessMin: 0.8,
    brightnessMax: 1.8,
    brightnessDefaultSafe: 1.15,
    brightnessDefaultBalanced: 1.15,
    brightnessDefaultFull: 1.0,
    balancedEnvIntensity: 0.25,
  },
  autopilot: {
    kLateral: 0.35,
    kYaw: 1.55,
    padLookahead: 60,
  },
  shortcut: {
    branchWidth: 8,
    startOffset: 12,
    endOffset: 4,
    entryGapLength: 40,
    mergeGapLength: 50,
    switchEdgeMargin: 0.25,
    signColors: {
      background: '#0F172A',
      border: '#00E5FF',
      text: '#FFFDF7',
      arrowPrimary: '#FFD000',
      arrowSecondary: '#00E5FF',
    },
    edgeStrip: {
      color: '#00E5FF',
      width: 0.34,
      lift: 0.014,
      dashPeriodMeters: 6,
      pulseSpeed: 2.0,
      emissiveIntensity: 1.45,
    },
    minTimeSaving: 1.0,
    maxTimeSaving: 4.0,
    corridorClearance: 24,
  },
  loopRules: {
    minRadius: 20,
    offsetMargin: 6,
    minApproachLength: 100,
  },
  styles: {
    bridge: {
      railHeight: 0.72,
      postSpacing: 4,
      cableCount: 3,
      pylonSpacing: 28,
      archHeight: 10,
    },
    tunnel: {
      radius: 11.5,
      interiorHeight: 11.5,
      ribSpacing: 8,
      lightSpeed: 3.2,
      portalWidth: 24,
      wallThickness: 0.85,
    },
    accents: {
      pulseSpeed: 2.5,
      hazardStripe: true,
      loopStripWidth: 0.42,
      loopStripLift: 0.018,
      emissiveIntensity: 2.1,
    },
    zoneToast: {
      durationMs: 1400,
    },
  },
  sim: {
    fixedStep: 1 / 60,
    maxFrameDt: 1 / 20,
    maxSubSteps: 3,
  },
  debug: {
    showFps: false,
    logCourseValidation: true,
    fpsSampleIntervalSec: 0.25,
    showCourseFrames: false,
    courseFrameStepMeters: 8,
    courseFrameArrowLength: 2.6,
  },
  debugOverlay: {
    opacity: 0.6,
    sampleIntervalMs: 250,
  },
  errorOverlay: {
    maxLines: 3,
  },
  visual: {
    activePreset: DEFAULT_VISUAL_PRESET as VisualPresetName,
    presets: VISUAL_PRESETS,
    exposure: ACTIVE_PRESET.exposure, // eksposur ACES renderer (naik = adegan lebih terang, turun = warna lebih pekat & bayangan lebih dalam)
    fogEnabled: false, // nonaktifkan fog bawaan agar lintasan jernih; tekan F3 untuk toggle debug fog
    skyTop: ACTIVE_PRESET.skyTop, // warna biru puncak kubah langit (naik kecerahan = langit lebih pucat, turun = biru langit lebih pekat)
    skyHorizon: ACTIVE_PRESET.skyHorizon, // warna biru terang di garis horizon langit (naik = horizon lebih cerah, turun = transisi ke kabut lebih gelap)
    fogColor: ACTIVE_PRESET.fogColor, // warna kabut debug (hanya aktif bila fogEnabled / F3 dinyalakan)
    fogType: 'linear' as 'linear' | 'exp2', // mode kabut debug
    fogNear: 90, // jarak mulai kabut debug
    fogFar: 420, // jarak kabut penuh debug
    hemisphereIntensity: ACTIVE_PRESET.hemisphereIntensity, // intensitas cahaya pantulan langit-lantai (naik = sisi gelap objek lebih terang/datar, turun = kontras bayangan lebih kuat)
    hemisphereSkyColor: ACTIVE_PRESET.hemisphereSkyColor, // warna cahaya langit hemisphere biru sejuk dari atas
    hemisphereGroundColor: ACTIVE_PRESET.hemisphereGroundColor, // warna pantulan kayu hangat dari bawah (naik kecerahan = bagian bawah objek lebih terang)
    envIntensity: ACTIVE_PRESET.envIntensity, // intensitas environment map global pada material reflektif (naik = pantulan lingkungan lebih kuat, turun = warna asli material lebih dominan)
    sunIntensity: ACTIVE_PRESET.sunIntensity, // intensitas matahari utama (naik = sorotan & kontras cahaya-bayangan lebih kuat, turun = pencahayaan lebih redup)
    sunColor: ACTIVE_PRESET.sunColor, // warna cahaya matahari hangat
    trackEnvIntensity: ACTIVE_PRESET.trackEnvIntensity, // intensitas pantulan lingkungan pada aspal & pagar lintasan (naik = kilau lingkungan makin kuat/berisiko pucat, turun = warna oranye & biru makin jenuh)
    trackClearcoatRoughness: ACTIVE_PRESET.trackClearcoatRoughness, // kekasaran lapisan clearcoat lintasan & pagar (naik = pantulan lebih tersebar tanpa bercak susu, turun = kilau cermin makin tajam)
    grade: {
      saturation: ACTIVE_PRESET.grade.saturation, // pengali kejenuhan warna akhir (naik = warna makin menyala, turun = makin kalem)
      contrast: ACTIVE_PRESET.grade.contrast, // pengali kontras akhir di sekitar mid-gray (naik = gelap-terang makin tegas, turun = lebih lembut)
      vignette: ACTIVE_PRESET.grade.vignette, // penggelapan halus di tepi layar (naik = bingkai tepi makin gelap, turun = merata ke sudut)
    },
    debugKeys: true, // aktifkan tombol uji visual F3 (fog), F4 (bloom), F5 (preset palet), [ dan ] (exposure)
  },
  colors: {
    track: ACTIVE_PRESET.colors.track,
    trackEdge: ACTIVE_PRESET.colors.trackEdge,
    trackGroove: ACTIVE_PRESET.colors.trackGroove,
    trackCenterDash: ACTIVE_PRESET.colors.trackCenterDash,
    rail: ACTIVE_PRESET.colors.rail,
    railHighlight: ACTIVE_PRESET.colors.railHighlight,
    boost: ACTIVE_PRESET.colors.boost,
    boostStripeLight: ACTIVE_PRESET.colors.boostStripeLight,
    skyTop: ACTIVE_PRESET.skyTop,
    skyHorizon: ACTIVE_PRESET.skyHorizon,
    skyFogHex: 0x75c3ff,
    accent: ACTIVE_PRESET.colors.accent,
    jumpStripeDark: ACTIVE_PRESET.colors.jumpStripeDark,
    sunLightHex: 0xffe0ad,
    hemiSkyHex: 0x5cb8ff,
    hemiGroundHex: 0x7a4622,
    woodBase: ACTIVE_PRESET.room.floorColor.light,
    woodPlankAlt: ACTIVE_PRESET.room.floorColor.mid,
    woodGrain: ACTIVE_PRESET.colors.woodGrain,
    woodSeam: ACTIVE_PRESET.colors.woodSeam,
    debugCenterLineHex: 0xffd000,
    debugTangentHex: 0x00e5ff,
    debugUpHex: 0x22c55e,
    debugRightHex: 0xef4444,
  },
  renderer: {
    maxPixelRatio: 2,
    toneMappingExposure: ACTIVE_PRESET.exposure,
    envBlur: 0.04,
    envIntensity: ACTIVE_PRESET.envIntensity,
    shadowMapSize: 2048,
    softwareGlFramePauseMs: 80,
    softwareGlPollMs: 5,
  },
  lighting: {
    sunIntensity: ACTIVE_PRESET.sunIntensity,
    sunOffset: { x: 95, y: 140, z: 80 },
    sunShadowExtent: 45,
    sunShadowNear: 40,
    sunShadowFar: 300,
    sunShadowBias: -0.0001,
    sunShadowNormalBias: 0.02,
    sunShadowIntensity: 0.7,
    sunShadowRadius: 3,
    hemiIntensity: ACTIVE_PRESET.hemisphereIntensity,
    fogDensity: 0.0011,
  },
  camera: {
    near: 0.3,
    far: 840,
    distance: 8.6,
    height: 3.35,
    widthScale: 0.16,
    lateralFollowFactor: 0.65,
    airHeightFollowFactor: 0.35,
    lookAheadDistance: 7.5,
    lookHeightOffset: 1.05,
    positionSmoothTime: 0.14,
    titleToChaseSmoothTime: 0.34,
    titleToChaseBlendDuration: 1.15,
    lookSmoothTime: 0.1,
    fallingLookSmoothTime: 0.08,
    upBlendSpeed: 8.5,
    fovBase: 54,
    fovMaxExtra: 16,
    fovSmoothTime: 0.22,
    rollFromSteer: 5.5,
    rollYawWeight: 0.55,
    rollSmoothTime: 0.16,
    snapOnReset: true,
    finishOrbitSpeed: 0.42,
    finishOrbitRadius: 10.5,
    finishOrbitHeight: 3.6,
    finishOrbitSmoothTime: 0.45,
    debugOrbitMode: false,
    orbitRadiusScale: 1.32,
    orbitMinRadius: 95,
    orbitHeight: 75,
    orbitSpeed: 0.14,
    minHorizontalFovDeg: 70,
    maxPortraitVerticalFovDeg: 95,
    portraitDistanceScale: 1.2,
  },
  hud: {
    speedUnit: 'km/h',
    speedScale: 3.6,
    maxGaugeSpeedKmh: 250,
    moveThresholdSpeedMs: 0.35,
    showControlsHint: true,
    compactBreakpointPx: 900,
    mobileSpeedoOpacity: 0.45,
    mobilePanelOpacity: 0.68,
    mobileTopMaxHeightPct: 7,
    panelOpacity: 0.55,
    panelBorderOpacity: 0.35,
    toastBgOpacity: 0.45,
    toastBorderOpacity: 0.35,
    toastFadeInMs: 150,
    toastFadeOutMs: 400,
    toastMaxPendingAgeMs: 600,
    toastTopVh: 11.8,
    toastFontVh: 2.4,
    toastZoneFontVh: 2.7,
    toastWrongWayFontVh: 2.8,
    airtimeMinSeconds: 0.8,
    airtimePopupDurationMs: 900,
    splitPopupDurationMs: 1000,
    lapToastDurationMs: 1400,
    zoneToastDurationMs: 1400,
    toastPriorities: {
      wrongWay: 5,
      lap: 4,
      zone: 3,
      airtime: 2,
      split: 1,
    },
    progressBarHeightPx: 3,
    speedoScale: 0.8,
    speedoOpacity: 0.6,
    speedoEdgeRightPx: 44,
    speedoEdgeBottomPx: 28,
    controlsHintFullSeconds: 8,
    controlsHintCollapsedOpacity: 0.35,
    debugStripOpacity: 0.5,
    debugStripFontSizePx: 10,
    gaugeArcRadius: 54,
    gaugeArcCircumference: 2 * Math.PI * 54,
    gaugeArcSweepRatio: 240 / 360,
    colors: {
      textPrimary: '#FFFDF7',
      textMuted: '#CBD5E1',
      accentYellow: ACTIVE_PRESET.hud.accentYellow,
      accentBlue: ACTIVE_PRESET.hud.accentBlue,
      accentCyan: ACTIVE_PRESET.hud.accentCyan,
      accentOrange: ACTIVE_PRESET.hud.accentOrange,
      panelBg: 'rgba(15, 23, 42, 0.55)',
    },
  },
  floor: {
    size: 680,
    textureSize: 512,
    textureRepeat: 54,
    roughness: 0.5, // kekasaran lantai kayu agar ada kilau lembut (naik = makin matte, turun = makin mengilap)
    metalness: 0.02,
  },
  props: {
    seed: 4217,
    density: 1.0,
    clearance: 18,
    supportSpacing: 22,
    supportLandingExclusion: 22,
    shadowDistance: 145,
    roomMargin: 150, // margin minimum di setiap sisi bounding box lintasan untuk dinding, lantai, dan langit-langit
    wallColor: ACTIVE_PRESET.room.wallColor, // warna dinding depan & belakang
    sideWallColor: ACTIVE_PRESET.room.sideWallColor, // warna dinding samping
    baseboardColor: ACTIVE_PRESET.room.baseboardColor, // warna plint dinding agar memisah dari dinding & lantai
    ceilingColor: ACTIVE_PRESET.room.ceilingColor, // warna langit-langit ruangan terang agar tetap lapang tanpa celah kosong
    ceilingSkylightColor: ACTIVE_PRESET.room.ceilingSkylightColor, // warna panel skylight langit-langit
    floorColor: {
      light: ACTIVE_PRESET.room.floorColor.light, // warna papan kayu hangat terang (naik = lantai lebih cerah, turun = lebih gelap)
      mid: ACTIVE_PRESET.room.floorColor.mid, // warna papan kayu hangat sedang
      dark: ACTIVE_PRESET.room.floorColor.dark, // warna papan & serat kayu gelap (turun = kontras serat makin tajam)
    },
    roomSize: {
      width: 520,
      depth: 520,
      height: 175,
    },
    palette: {
      wallBase: ACTIVE_PRESET.room.wallColor,
      wallStripe: ACTIVE_PRESET.room.wallStripe,
      sideWallBase: ACTIVE_PRESET.room.sideWallColor,
      sideWallStripe: ACTIVE_PRESET.room.sideWallStripe,
      baseboard: ACTIVE_PRESET.room.baseboardColor,
      windowFrame: ACTIVE_PRESET.room.windowFrame,
      windowSky: ACTIVE_PRESET.room.windowSky,
      sunbeamColor: ACTIVE_PRESET.room.sunbeamColor,
      rugBase: ACTIVE_PRESET.room.rugBase,
      rugBorder: ACTIVE_PRESET.room.rugBorder,
      rugPattern: ACTIVE_PRESET.room.rugPattern,
      woodLight: ACTIVE_PRESET.room.woodLight,
      woodDark: ACTIVE_PRESET.room.woodDark,
      paperCream: ACTIVE_PRESET.room.paperCream,
      lampMetal: ACTIVE_PRESET.room.lampMetal,
      lampShade: ACTIVE_PRESET.room.lampShade,
    },
  },
  fx: {
    bloom: {
      strength: 0.3, // kekuatan pendar bloom hanya pada elemen emissive (naik = halo makin tebal, turun = makin tipis)
      radius: 0.4, // radius sebaran bloom (naik = sebaran lebih lebar, turun = lebih rapat)
      threshold: 1.0, // ambang kecerahan linear sebelum bloom aktif (naik = lebih selektif hanya emissive kuat, turun = permukaan terang ikut berpendar)
    },
    windowShaft: {
      opacity: 0.1, // kepekatan sinar jendela aditif di dekat kaca (naik = sinar makin terlihat, turun = lebih samar)
    },
    speedLines: {
      maxIntensity: 0.62,
      minSpeedFactor: 0.62,
      smoothTime: 0.14,
      boostBonus: 0.38,
    },
    sparks: {
      poolSize: 120,
      lifetime: 0.45,
      gravity: 22,
    },
    dust: {
      poolSize: 96,
      lifetime: 0.72,
    },
    boostTrail: {
      poolSize: 110,
      color: ACTIVE_PRESET.colors.boost,
      colorEnd: ACTIVE_PRESET.colors.rail,
      length: 0.38,
    },
    driftSmoke: {
      slipThreshold: 0.2,
      rate: 28,
    },
  },
  quality: {
    showQualityDebug: false,
    initialOverride: null as 'mobile' | 'low' | 'medium' | 'high' | null,
    fpsDowngradeThreshold: 45,
    frameTimeDowngradeMs: 33,
    fpsDowngradeWindowSec: 2.0,
    warmupSec: 2.0,
    initialProbeSec: 3.0,
    initialProbeBalancedMaxMs: 28,
    fullAutoDowngradeMs: 40,
    fullAutoDowngradeSec: 3.0,
    balancedShadowRadius: 28,
    balancedShadowMapSize: 512,
    mobileBloom: {
      resolutionScale: 0.5,
      strengthMultiplier: 0.6,
      threshold: 1.32,
      radius: 0.2,
    },
    mobileDetect: {
      maxDeviceMemoryGb: 4,
      maxHardwareConcurrency: 6,
    },
    levels: {
      mobile: {
        pixelRatioMax: 1.25,
        antialias: false,
        composerSamples: 0,
        bloomEnabled: false,
        colorGradeEnabled: false,
        fxaaEnabled: false,
        shadowsEnabled: false,
        shadowMapSize: 512,
        shadowFollowRadius: 28,
        maxTextureSize: 1024,
        anisotropy: 2,
        particleScale: 0.45,
        propsDensityScale: 0.5,
        cloudDensityScale: 0.5,
        tunnelLightStrips: 1,
        viewDistance: 420,
        speedLinesEnabled: false,
      },
      low: {
        pixelRatioMax: 1.0,
        antialias: true,
        composerSamples: 0,
        bloomEnabled: false,
        colorGradeEnabled: false,
        fxaaEnabled: true,
        shadowsEnabled: true,
        shadowMapSize: 512,
        shadowFollowRadius: 32,
        maxTextureSize: 2048,
        anisotropy: 4,
        particleScale: 0.45,
        propsDensityScale: 0.45,
        cloudDensityScale: 0.45,
        tunnelLightStrips: 2,
        viewDistance: 700,
        speedLinesEnabled: false,
      },
      medium: {
        pixelRatioMax: 1.5,
        antialias: true,
        composerSamples: 4,
        bloomEnabled: true,
        colorGradeEnabled: true,
        fxaaEnabled: true,
        shadowsEnabled: true,
        shadowMapSize: 1024,
        shadowFollowRadius: 45,
        maxTextureSize: 2048,
        anisotropy: 8,
        particleScale: 0.75,
        propsDensityScale: 0.75,
        cloudDensityScale: 0.75,
        tunnelLightStrips: 2,
        viewDistance: 700,
        speedLinesEnabled: true,
      },
      high: {
        pixelRatioMax: 2.0,
        antialias: true,
        composerSamples: 4,
        bloomEnabled: true,
        colorGradeEnabled: true,
        fxaaEnabled: true,
        shadowsEnabled: true,
        shadowMapSize: 1024,
        shadowFollowRadius: 45,
        maxTextureSize: 2048,
        anisotropy: 8,
        particleScale: 1.0,
        propsDensityScale: 1.0,
        cloudDensityScale: 1.0,
        tunnelLightStrips: 2,
        viewDistance: 700,
        speedLinesEnabled: true,
      },
    },
  },
  boost: {
    duration: 1.85,
    extraAccel: 22,
    maxSpeedMultiplier: 1.24,
    kickSpeed: 7.5,
    fovBonus: 11,
    padLength: 5.6,
    padWidth: 2.6,
    retriggerCooldown: 0.45,
    uvScrollSpeed: 2.4,
    lift: 0.012,
    textureSize: 256,
    emissiveIntensity: ACTIVE_PRESET.colors.boostEmissiveIntensity,
  },
  race: {
    countdownSeconds: 3,
    countdownStepMs: 1000,
    countdownWatchdogMs: 6000,
    goHoldSeconds: 0.85,
    finishMargin: 6,
    resultDelay: 1.2, // jeda kamera mengorbit mobil setelah finish sebelum panel hasil muncul
    resetPenaltySeconds: 0,
    resetSpeedFactor: 0.75,
    titleOrbitSpeed: 0.35,
    titleOrbitRadius: 11.5,
    titleOrbitHeight: 4.2,
  },
  courseSelect: {
    debounceMs: 250,
    minimapWidth: 180,
    minimapHeight: 108,
  },
  wrongWay: {
    dotThreshold: -0.3,
    minSpeed: 3,
    triggerSeconds: 1.5,
    clearSeconds: 0.5,
  },
  storage: {
    key: 'sky-racer-best-v1', // kunci lama Tahap 6 (hanya untuk migrasi satu kali)
    recordsKey: 'sky-racer-records-v1',
    migratedKey: 'sky-racer-records-migrated-v1',
    lastCourseKey: 'sky-racer-last-course-v1',
    topRecordsCount: 5,
  },
  audio: {
    masterVolume: 0.75, // volume utama seluruh game (naik = semua suara lebih keras, turun = lebih pelan)
    sfxVolume: 0.85, // volume efek suara & loop permukaan (naik = efek lebih menonjol, turun = lebih kalem)
    engineVolume: 0.42, // volume mesin mobil listrik (naik = mesin lebih dominan, turun = efek lebih mudah terdengar)
    ambienceVolume: 0.25, // volume ambience ruangan (naik = suara latar ruangan lebih terasa, turun = lebih sunyi)
    mutedByDefault: false, // status bisu awal sebelum pengguna mengubah dengan tombol M
    storageKey: 'sky-racer-audio-v1', // kunci localStorage khusus preferensi audio (terpisah dari best time)
    updateRateHz: 20, // frekuensi pembaruan parameter audio kontinu per detik (naik = respons lebih cepat/CPU sedikit naik, turun = lebih ringan)
    maxVoices: 16, // batas maksimum efek one-shot aktif bersamaan (naik = lebih banyak suara tumpuk, turun = lebih hemat CPU)
    limiter: {
      threshold: -6, // ambang dB limiter sebelum pemotongan (naik mendekati 0 = lebih keras/berisiko padat, turun = lebih aman dari clipping)
      ratio: 12, // rasio kompresi limiter (naik = pembatas puncak lebih keras, turun = kompresi lebih lembut)
      attack: 0.003, // waktu tangkap puncak dalam detik (turun = tangkap transien lebih cepat)
      release: 0.12, // waktu lepas kompresor dalam detik (naik = pemulihan volume lebih halus, turun = lebih cepat)
    },
    engine: {
      idleFreq: 68, // frekuensi dasar mesin saat diam Hz (naik = dengung idle lebih tinggi, turun = lebih rendah/dalam)
      maxFreq: 265, // frekuensi dasar mesin pada kecepatan puncak Hz (naik = lebih melengking, turun = lebih berat)
      boostPitchMult: 1.24, // pengali nada mesin saat boost aktif (naik = lonjakan nada boost makin tinggi, turun = lebih kalem)
      airRevMult: 1.18, // pengali nada mesin saat mobil melayang di udara (naik = suara ngegas udara lebih tinggi, turun = lebih datar)
      filterBase: 320, // cutoff lowpass mesin saat idle Hz (naik = suara idle lebih cempreng/terbuka, turun = lebih teredam)
      filterMax: 1650, // cutoff lowpass mesin pada gas penuh Hz (naik = lebih tajam/bising, turun = lebih hangat)
      tireNoiseLevel: 0.09, // level lapisan noise ban bergulir (naik = desis ban lebih jelas, turun = mesin lebih bersih)
      boostWhooshLevel: 0.14, // level lapisan angin boost pada mesin (naik = desis boost lebih kuat, turun = lebih tipis)
      detuneCents: 7, // perbedaan tala dua osilator mesin dalam cent (naik = tekstur lebih tebal/kasar, turun = lebih halus)
      idleGain: 0.08, // level gain mesin saat idle diam (naik = idle lebih terdengar, turun = hampir senyap)
      driveGain: 0.34, // level gain mesin saat melaju penuh (naik = mesin lebih kencang, turun = lebih lembut)
      fadeOutTime: 0.65, // durasi fade out mesin saat finish atau title dalam detik
      fadeInTime: 0.25, // durasi fade in mesin saat masuk countdown/racing dalam detik
    },
    sfx: {
      countdownTick: {
        frequency: 660, // frekuensi nada hitung mundur 3-2-1 Hz
        duration: 0.12, // durasi nada hitung mundur detik
        gain: 0.36, // volume hitung mundur (naik = lebih lantang, turun = lebih halus)
        cooldown: 0.08, // jeda minimum antar pemicu detik
      },
      go: {
        frequency: 660, // nada dasar akor GO! Hz
        frequencyHigh: 990, // nada harmonik atas akor GO! Hz
        duration: 0.35, // durasi akor GO! detik
        gain: 0.42, // volume akor GO!
        cooldown: 0.2, // jeda minimum detik
      },
      checkpoint: {
        frequency: 659.25, // nada awal E5 chime checkpoint Hz (naik 1 semitone tiap checkpoint)
        frequencyHigh: 987.77, // nada kedua B5 chime checkpoint Hz
        noteDuration: 0.14, // durasi tiap nada chime detik
        noteGap: 0.075, // jarak jeda antar dua nada chime detik
        duration: 0.28, // total durasi efek checkpoint detik
        gain: 0.4, // volume chime checkpoint
        cooldown: 0.12, // jeda minimum detik
      },
      finish: {
        frequency: 523.25, // nada awal pentatonik finish C5 Hz (arpeggio [C5, D5, G5, A5])
        notes: [523.25, 587.33, 783.99, 880.0], // tangga nada pentatonik naik orisinal (4 nada)
        bestPeakFreq: 1046.5, // nada puncak berkilau tambahan saat newBest (C6) Hz
        noteStep: 0.095, // jarak antar nada arpeggio finish detik
        noteDuration: 0.24, // durasi tiap nada arpeggio detik
        duration: 0.85, // total durasi arpeggio finish detik
        gain: 0.42, // volume arpeggio finish
        cooldown: 0.5, // jeda minimum detik
      },
      boost: {
        frequency: 400, // frekuensi awal sapuan bandpass whoosh boost Hz
        filterEnd: 2500, // frekuensi akhir sapuan bandpass whoosh boost Hz
        sawStart: 180, // frekuensi awal swoosh saw boost Hz
        sawEnd: 420, // frekuensi akhir swoosh saw boost Hz
        duration: 0.5, // durasi efek boost detik
        gain: 0.46, // volume efek boost
        cooldown: 0.25, // jeda minimum detik
      },
      takeoff: {
        frequency: 310, // frekuensi awal blip lepas landas Hz
        endFrequency: 540, // frekuensi akhir blip lepas landas Hz
        duration: 0.13, // durasi blip lepas landas detik
        gain: 0.28, // volume blip lepas landas
        cooldown: 0.18, // jeda minimum detik
      },
      landed: {
        frequency: 120, // frekuensi awal thud pendaratan Hz
        endFrequency: 50, // frekuensi akhir thud pendaratan Hz
        clickFreq: 950, // frekuensi filter klik benturan pendaratan Hz
        duration: 0.19, // durasi thud pendaratan detik
        gain: 0.48, // volume maksimum thud saat pendaratan keras
        cooldown: 0.12, // jeda minimum detik
      },
      railHit: {
        frequency: 220, // frekuensi dasar klak plastik pagar Hz
        noiseFilterFreq: 1900, // frekuensi highpass klik plastik pagar Hz
        duration: 0.085, // durasi klak pagar detik
        gain: 0.38, // volume maksimum klak pagar pada benturan penuh
        cooldown: 0.08, // jeda minimum detik
      },
      fell: {
        frequency: 600, // frekuensi awal slide jatuh Hz
        endFrequency: 120, // frekuensi akhir slide jatuh Hz
        duration: 0.8, // durasi slide jatuh detik
        gain: 0.36, // volume suara jatuh
        cooldown: 0.6, // jeda minimum detik
      },
      respawn: {
        frequency: 280, // frekuensi awal pop respawn Hz
        endFrequency: 560, // frekuensi akhir pop respawn Hz
        duration: 0.18, // durasi efek respawn detik
        gain: 0.32, // volume efek respawn
        cooldown: 0.25, // jeda minimum detik
      },
      restart: {
        frequency: 740, // frekuensi klik restart UI Hz
        duration: 0.055, // durasi klik restart detik
        gain: 0.24, // volume klik restart
        cooldown: 0.15, // jeda minimum detik
      },
      uiConfirm: {
        frequency: 820, // frekuensi klik konfirmasi UI Hz
        duration: 0.06, // durasi klik konfirmasi detik
        gain: 0.25, // volume klik konfirmasi
        cooldown: 0.1, // jeda minimum detik
      },
      uiMove: {
        frequency: 540, // frekuensi klik pindah pilihan arena Hz
        duration: 0.045, // durasi klik pindah pilihan detik
        gain: 0.16, // volume klik pindah pilihan
        cooldown: 0.06, // jeda minimum detik
      },
    },
    skid: {
      slipThreshold: 0.14, // ambang slip radian sebelum decit ban berbunyi (naik = lebih jarang berdecit, turun = mudah berdecit)
      gainMax: 0.28, // volume maksimum decit ban saat drift penuh (naik = decit lebih tajam, turun = lebih halus)
      filterFreq: 1350, // frekuensi pusat bandpass decit ban Hz
      filterQ: 3.8, // ketajaman resonansi decit ban (naik = lebih melengking, turun = lebih lebar seperti desis)
    },
    wind: {
      gainMax: 0.24, // volume maksimum suara angin di kecepatan puncak (naik = angin lebih kencang, turun = lebih samar)
      airBoost: 1.55, // pengali volume angin saat mobil melayang di udara (naik = efek melayang lebih dramatis)
      filterBase: 260, // cutoff lowpass angin saat pelan Hz
      filterMax: 1350, // cutoff lowpass angin saat ngebut Hz
    },
    railScrape: {
      gainMax: 0.24, // volume maksimum desis gesekan pagar (naik = gesekan lebih keras, turun = lebih lembut)
      filterFreq: 1650, // frekuensi pusat bandpass gesekan pagar Hz
      filterQ: 2.8, // ketajaman bandpass gesekan pagar
      decayRate: 6.0, // laju peluruhan fallback desis pagar per detik jika memakai event
    },
    ambience: {
      level: 0.14, // level brown noise ruangan tipis (naik = ruangan lebih bergema, turun = lebih hening)
      filterFreq: 220, // cutoff lowpass brown noise ambience Hz
    },
  },
  checkpointGate: {
    widthMargin: 0.85,
    height: 4.3,
    thickness: 0.32,
    arcSegments: 10,
    bannerHeight: 0.78,
    textureSize: 256,
  },
  course: {
    startPosition: { x: 0, y: 6, z: 120 },
    startHeadingDeg: 0, // 0 deg = menuju -Z
    trackWidth: 7,
    defaultWidth: 7,
    closure: {
      blendLength: 100,
      posToleranceM: 0.02,
      yawToleranceDeg: 0.05,
      maxIterations: 200,
      maxSlopeDeg: 22,
    },
    grid: {
      maxSlots: 8,
      firstRowOffset: 6,
      rowSpacing: 8,
      columnStagger: 2.5,
      lateralFactor: 0.22,
    },
    trackThickness: 0.52,
    edgeRadius: 0.22,
    edgeArcSegments: 5,
    bottomRadius: 0.12,
    bottomArcSegments: 3,
    endCapBevelLength: 0.24,
    endCapBevelSegments: 3,
    jumpStripLength: 1.65,
    jumpStripInset: 0.28,
    jumpStripLift: 0.008,
    jumpStripTextureSize: 256,
    stepLength: 0.25,
    bankBlendLength: 10,
    slopeBlendLength: 10,
    curvatureSmoothWindow: 2,
    railHeight: 0.62,
    railWidth: 0.3,
    railOffsetFromEdge: 0.14,
    railVerticalOffset: 0.24,
    railArcSegments: 6,
    railPostSpacingMeters: 6,
    railPostRadius: 0.09,
    railPostHeight: 0.44,
    railEndPostRadius: 0.16,
    railEndPostHeight: 0.56,
    trackClearcoat: 1.0,
    trackClearcoatRoughness: 0.08,
    trackRoughness: 0.22,
    trackMetalness: 0.04,
    trackIor: 1.5,
    trackTextureSize: 512,
    trackTileMeters: 8,
    railClearcoat: 1.0,
    railClearcoatRoughness: 0.1,
    railRoughness: 0.24,
    railMetalness: 0.05,
    railTextureSize: 256,
    railTileMeters: 6,
  },
  physics: {
    gravity: 28, // gravitasi skala mainan (naik = mobil menempel & jatuh lebih cepat, turun = lebih melayang)
    bankGravityFactor: 0.85, // pengaruh kemiringan tikungan ke geser samping (naik = lebih mudah melorot, turun = lebih stabil)
    contactMinNormal: 0.5, // batas gaya normal kontak lintasan (naik = lebih mudah lepas kontak, turun = lebih lengket)
    invertedStallSpeed: 2.0, // kecepatan minimum saat terbalik di puncak loop (naik = bantuan dorong aktif lebih cepat, turun = lebih mudah tertahan)
    invertedSlideAssist: 6.5, // dorongan bantu agar tidak diam terbalik di puncak loop (naik = meluncur turun lebih cepat, turun = lebih pelan)
    airDrag: 0.0014, // hambatan udara saat melayang (naik = jarak lompatan lebih pendek, turun = terbang lebih jauh)
    airYawControl: 0.45, // kendali putar yaw di udara (naik = arah lebih mudah dikoreksi di udara, turun = lebih kaku)
    airOrientSmoothTime: 0.18, // jeda perataan orientasi mobil di udara (naik = rotasi lebih lambat, turun = lebih responsif)
    airNearestWindow: 36, // jendela pencarian titik lintasan terdekat saat di udara (naik = toleransi meleset lebih lebar, turun = lebih sempit)
    landingAlignTime: 0.24, // waktu perataan suspensi saat mendarat (naik = perataan lebih lama, turun = lebih cepat rata)
    landingLateralTolerance: 0.35, // toleransi jarak lateral pendaratan di luar tepi lintasan (naik = lebih pemaaf, turun = lebih ketat)
    landingPenalty: 0.22, // penalti kecepatan saat mendarat miring/keras (naik = lebih pelan saat mendarat, turun = kecepatan lebih terjaga)
    impactRefSpeed: 18, // kecepatan benturan acuan untuk skala penalti pendaratan (naik = penalti lebih ringan, turun = penalti lebih berat)
    fallKillDepth: 4.5, // jarak jatuh di bawah lintasan sebelum respawn (naik = jatuh lebih dalam, turun = respawn lebih cepat)
    respawnDelay: 1.5, // jeda waktu sebelum kembali ke checkpoint saat jatuh (naik = jeda lebih lama, turun = lebih cepat kembali)
    respawnBackoff: 16, // jarak mundur aman saat respawn otomatis (naik = muncul lebih jauh di belakang, turun = lebih dekat ke tepi)
    respawnSpeedFactor: 0.75, // rasio kecepatan yang dipertahankan saat respawn (naik = muncul lebih cepat, turun = lebih pelan)
    minAirtimeForBonus: 0.4, // durasi melayang minimum untuk memicu popup airtime (naik = hanya lompatan tinggi yang dihitung, turun = lompatan kecil ikut muncul)
    maxSpeed: 54, // kecepatan puncak normal m/s (naik = mobil lebih kencang, turun = lebih pelan)
    accel: 36, // percepatan awal m/s^2 (naik = tarikan lebih responsif, turun = akselerasi lebih kalem)
    accelFalloffExponent: 1.35, // kurva penurunan akselerasi menuju maxSpeed (naik = tenaga penuh bertahan lebih lama, turun = melandai lebih awal)
    brakeDecel: 48, // perlambatan rem m/s^2 (naik = berhenti lebih cepat, turun = jarak pengereman lebih panjang)
    reverseAccel: 20, // percepatan mundur m/s^2 (naik = mundur lebih cepat, turun = mundur lebih pelan)
    reverseMaxSpeed: 16, // kecepatan maksimum mundur m/s (naik = mundur lebih kencang, turun = lebih pelan)
    maxReverseSlideSpeed: 34, // batas kecepatan mundur saat melorot di tanjakan/loop (naik = melorot lebih cepat, turun = tertahan)
    drag: 0.0055, // hambatan aerodinamika kuadratik (naik = top speed lebih tertahan, turun = meluncur lebih ringan)
    rollingResistance: 1.8, // gesekan gelinding saat lepas gas (naik = mobil cepat berhenti, turun = meluncur lebih jauh)
    handbrakeDrag: 5.5, // perlambatan memanjang saat rem tangan ditekan (naik = kecepatan cepat turun saat drift, turun = momentum lebih terjaga)
    steerRate: 1.35, // laju putar yaw utama ~60% dari sebelumnya (naik = belok lebih tajam/cepat, turun = belok lebih kalem & stabil)
    steerPeakSpeed: 16, // kecepatan puncak respons belok m/s (naik = puncak kelincahan bergeser ke kecepatan lebih tinggi, turun = lincah di kecepatan rendah)
    steerHighSpeedFactor: 0.55, // pengali speedFactor di maxSpeed (naik = belok kecepatan tinggi lebih tajam, turun = lebih stabil & tidak liar)
    handbrakeYawBoost: 1.22, // pengali putaran yaw saat rem tangan (naik = ekor lebih mudah membuang, turun = drift lebih terkendali)
    maxYaw: 0.55, // batas maksimum sudut yaw relatif lintasan dalam radian / ~31.5° (naik = sudut drift lebih lebar, turun = mobil lebih lurus mengikuti lintasan)
    yawSelfAlign: 7.2, // kekuatan pelurusan otomatis yaw saat tombol belok dilepas (naik = mobil cepat lurus, turun = cenderung menyamping lebih lama)
    grip: 18.0, // cengkeraman lateral dasar terhadap slip (naik = mobil lebih lengket & anti-licin, turun = lebih mudah selip/licin)
    handbrakeGrip: 3.2, // cengkeraman lateral saat rem tangan ditekan (naik = drift lebih sempit/terkendali, turun = selip lebih panjang)
    gripRecoverTime: 0.28, // waktu pemulihan grip dari handbrakeGrip ke grip penuh dalam detik (naik = transisi setelah drift lebih halus/lama, turun = langsung menggigit)
    maxSlipSpeed: 14, // batas maksimum kecepatan menyamping vLateral m/s (naik = selip samping bisa lebih besar, turun = selip tertahan)
    railInnerOffset: 0.08, // jarak sisi dalam pagar keluar dari tepi lintasan dalam meter; dipakai sinkron oleh fisika & mesh pagar (naik = pagar lebih jauh ke luar/lega, turun = pagar mendekati tepi aspal)
    railMargin: 1.02, // margin cadangan pendaratan udara (naik = pendaratan di udara lebih ke tengah, turun = lebih mendekati pagar)
    railRestitution: 0.15, // koefisien pantulan ringan saat menabrak pagar (naik = memantul lebih kuat, turun = lebih meredam benturan)
    railImpactPenalty: 0.22, // porsi pengurangan kecepatan satu kali saat benturan baru berkecepatan tinggi (naik = tabrakan lebih menghukum, turun = kecepatan lebih terjaga)
    railScrapeFriction: 0.55, // gesekan lembut berkelanjutan saat menggesek pagar per detik (naik = melambat lebih terasa saat menempel, turun = hampir tidak melambat)
    railPushOutSpeed: 6.5, // kecepatan dorongan halus mengeluarkan bodi yang melewati batas pagar m/s (naik = koreksi posisi lebih instan, turun = lebih lembut)
    railAlignRate: 2.6, // laju pelurusan yaw menjauhi dinding saat menyentuh pagar rad/s (naik = mobil cepat mengarah maju lagi, turun = lebih lama menyudut ke pagar)
    railHitCooldown: 0.25, // jeda waktu sebelum benturan pagar berikutnya memicu penalti & percikan lagi (naik = lebih jarang menghukum, turun = lebih sering)
    stuckTime: 0.5, // durasi kontak pagar pelan sebelum dorongan anti-macet aktif dalam detik (naik = menunggu lebih lama, turun = lepas lebih cepat)
    stuckSpeed: 4.5, // ambang kecepatan maju m/s untuk memicu anti-macet (naik = anti-macet lebih agresif, turun = hanya aktif saat hampir berhenti)
    endStopDamping: 8.0, // peredam berhenti di ujung paling akhir lintasan (naik = berhenti lebih mendadak, turun = melambat lebih halus)
    rideHeight: 0.01, // jarak angkat visual ban di atas permukaan lintasan (naik = mobil lebih tinggi, turun = lebih rapat ke aspal)
  },
  car: {
    startS: 8,
    startLateral: 0,
    visualScale: 1.10, // faktor skala visual mobil saja (tanpa mengubah footprint fisika)
    // Footprint fisika (carHalfWidth = 0.85 m, carHalfLength = 1.675 m) tidak diubah; seluruh desain model 3D prosedural harus muat di dalam kotak ini.
    bodyLength: CAR_BODY_LENGTH, // panjang bodi mobil (naik = bodi lebih panjang)
    bodyWidth: CAR_BODY_WIDTH, // lebar bodi mobil (naik = bodi lebih lebar)
    carHalfWidth: CAR_BODY_WIDTH * 0.5, // setengah lebar bodi dari bodyWidth untuk footprint pagar (naik = batas lateral lebih sempit, turun = lebih dekat ke pagar)
    carHalfLength: CAR_BODY_LENGTH * 0.5, // setengah panjang bodi dari bodyLength untuk footprint saat berputar (naik = batas saat yaw menyempit lebih besar, turun = lebih longgar)
    bodyHeight: 0.56,
    bodyCornerRadius: 0.16,
    bodyClearance: 0.24,
    cabinLength: 1.55,
    cabinWidth: 1.3,
    cabinHeight: 0.42,
    cabinOffsetZ: 0.18,
    bumperThickness: 0.22,
    spoilerWidth: 1.56,
    spoilerChord: 0.36,
    spoilerHeight: 0.28,
    wheelRadius: 0.34,
    wheelWidth: 0.28,
    wheelTrackHalfWidth: 0.82,
    wheelBaseHalfLength: 1.04,
    maxWheelSteerRad: 0.42,
    bodyColor: ACTIVE_PRESET.car.bodyColor,
    stripeColor: ACTIVE_PRESET.car.stripeColor,
    accentColor: ACTIVE_PRESET.car.accentColor,
    cabinColorHex: ACTIVE_PRESET.car.cabinColorHex,
    bumperColorHex: ACTIVE_PRESET.car.bumperColorHex,
    tireColorHex: ACTIVE_PRESET.car.tireColorHex,
    rimColorHex: ACTIVE_PRESET.car.rimColorHex,
    headlightColorHex: 0xfff5c0,
    headlightEmissiveIntensity: 2.2,
    taillightColorHex: 0xff1e2d,
    taillightEmissiveIntensity: 1.45,
    exhaustGlowColorHex: ACTIVE_PRESET.car.exhaustGlowColorHex,
    exhaustEmissiveIntensity: 2.6,
    exhaustPipeRadius: 0.085,
    exhaustPipeLength: 0.16,
    exhaustHaloBaseScale: 0.32,
    exhaustHaloBoostScale: 1.25,
    bodyClearcoat: 1.0,
    bodyClearcoatRoughness: 0.05,
    bodyRoughness: 0.24,
    bodyMetalness: 0.14,
    rimMetalness: 0.95,
    rimRoughness: 0.12,
    rollFactor: 0.006,
    maxRollRad: 0.13,
    pitchFactor: 0.0022,
    maxPitchRad: 0.075,
    suspensionDamping: 10,
    visual: {
      designId: 'gt' as 'gt' | 'wedge',
      designs: {
        gt: {
          body: '#FF2D3D',
          accent: '#FFD000',
          stripe: '#FFF6E0',
        },
        wedge: {
          body: '#0A5CFF',
          accent: '#00E5FF',
          stripe: '#FFF6E0',
        },
      },
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      roughness: 0.24,
      metalness: 0.14,
      envMapIntensity: 1.15,
      wheelDetail: {
        spokeCount: 6,
        tireThicknessRatio: 0.34,
        camberRad: 0.038,
      },
      multiplayerPalettes: [
        { body: '#FF2D3D', accent: '#FFD000', stripe: '#FFF6E0' }, // P1 Merah
        { body: '#0A5CFF', accent: '#00E5FF', stripe: '#FFF6E0' }, // P2 Biru
        { body: '#FFD000', accent: '#FF5A00', stripe: '#141C2B' }, // P3 Kuning
        { body: '#16A34A', accent: '#FFD000', stripe: '#FFF6E0' }, // P4 Hijau
      ],
    },
  },
  input: {
    steerAttackTime: 0.12, // waktu naik steer dari 0 ke penuh dalam detik (naik = tap singkat lebih lembut, turun = respons belok lebih instan)
    steerReleaseTime: 0.07, // waktu turun steer kembali ke 0 dalam detik (naik = kemudi lebih lambat kembali lurus, turun = cepat kembali ke tengah)
    highSpeedSteerLimit: 0.35, // batas maksimum steer saat di maxSpeed (naik = lebih lincah di kecepatan puncak, turun = lebih stabil & tidak mudah selip)
    throttleResponseRate: 12.0, // laju respons pedal gas per detik (naik = lebih instan, turun = lebih halus)
    brakeResponseRate: 14.0, // laju respons pedal rem per detik (naik = lebih instan, turun = lebih halus)
  },
  touch: {
    enableMode: 'auto' as 'auto' | 'always' | 'off', // tampil bila pointer: coarse atau setelah sentuhan pertama
    steerMode: 'stick' as 'stick' | 'buttons', // 'stick' (tongkat analog melayang) atau 'buttons' (kiri/kanan)
    stickMaxRadius: 68, // radius maksimum geser tongkat kemudi dalam px (naik = gerakan jempol lebih lebar, turun = lebih sensitif)
    stickDeadzone: 0.1, // deadzone 0..1 di tengah tongkat (naik = tengah lebih stabil, turun = lebih peka)
    stickResponseCurve: 1.45, // eksponen kurva respons analog (naik = halus di tengah, turun = lebih linear)
    autoThrottleDefault: true, // gas otomatis saat RACING (true = otomatis gas, false = tampilkan tombol GAS)
    buttonSize: 64, // ukuran tombol aksi utama dalam px (minimal 56 px)
    idleOpacity: 0.55, // opasitas kontrol sentuh saat diam
    pressedOpacity: 0.9, // opasitas kontrol sentuh saat ditekan
    safeMargin: 12, // jarak aman tepi dalam px selain env(safe-area-inset-*)
    restartHoldMs: 600, // durasi tahan tombol ulang balapan dalam ms
    resetTapMaxMs: 320, // durasi maksimum ketukan singkat tombol reset checkpoint dalam ms
    touchSteerSmoothTime: 0.04, // smoothing sangat ringan untuk kemudi sentuh analog dalam detik
    haptics: {
      enabled: true, // aktifkan getar navigator.vibrate bila tersedia
      boostMs: 28, // durasi getar saat menginjak boost pad dalam ms
      railMs: 20, // durasi getar saat membentur pagar dalam ms
      landMaxMs: 42, // durasi maksimum getar saat mendarat keras dalam ms
      minInterval: 80, // jeda minimum antar getaran haptik dalam ms agar tidak spam
    },
    orientationHint: true, // tampilkan overlay imbauan landscape saat perangkat sentuh berada dalam mode potret
    portraitToastDurationMs: 5000, // durasi tampil banner saran landscape satu kali
    gearAutoCloseMs: 3000, // jeda tutup otomatis menu gear setelah interaksi terakhir
    storageKey: 'sky-racer-touch-v1', // kunci localStorage khusus preferensi kontrol sentuh (terpisah dari best time dan audio)
  },
  fantasy: {
    minClearance: 12,
    overTrackClearance: 25,
    jumpExclusionMargin: 28,
    gateExclusionMargin: 24,
    updateDistance: 460,
    zoneStartBanner: {
      title: 'ISTANA PELANGI',
      startS: 10,
      endS: 45,
    },
    budgets: {
      high: { drawCalls: 220, triangles: 600000 },
      medium: { drawCalls: 160, triangles: 350000 },
      mobile: { drawCalls: 90, triangles: 160000 },
      low: { drawCalls: 90, triangles: 160000 },
    },
    counts: {
      floatingIslands: { high: 5, medium: 3, mobile: 3, low: 3 },
      balloons: { high: 20, medium: 12, mobile: 8, low: 8 },
      crystalDensity: { high: 1.0, medium: 0.6, mobile: 0.4, low: 0.4 },
      lampSpacing: { high: 48, medium: 68, mobile: 92, low: 92 },
      flagSpacing: { high: 64, medium: 90, mobile: 120, low: 120 },
      flowerPatches: { high: 28, medium: 16, mobile: 0, low: 0 },
    },
    palette: {
      castleWall: '#FFF6E0',
      castleTrim: '#E7D8BA',
      castleRoofPurple: '#7E22CE',
      castleRoofRed: '#E11D48',
      castleRoofBlue: '#0A5CFF',
      castleGold: '#FFD000',
      castleFlagColors: ['#FF2D3D', '#0A5CFF', '#FFD000', '#00E5FF'],
      crystalCyan: '#00E5FF',
      crystalMagenta: '#FF2FD0',
      crystalYellow: '#FFD000',
      islandRock: '#7C4A26',
      islandGrass: '#24B859',
      islandTree: '#15803D',
      waterfall: '#38BDF8',
      rainbowBands: ['#FF2D3D', '#FF7A00', '#FFD000', '#22C55E', '#00E5FF', '#0A5CFF', '#8B5CF6'],
      wheelFrame: '#F1F5F9',
      wheelHub: '#FFD000',
      gondolaColors: ['#FF2D3D', '#0A5CFF', '#FFD000', '#00E5FF', '#FF2FD0', '#22C55E'],
      balloonColors: ['#FF2D3D', '#0A5CFF', '#FFD000', '#00E5FF', '#FF2FD0', '#F97316', '#10B981', '#8B5CF6'],
      balloonBasket: '#7C4A26',
      lampPost: '#1E293B',
      lampGlow: '#FFE699',
      flowerColors: ['#FFD000', '#FF2FD0', '#00E5FF', '#FFF6E0', '#FB7185'],
      mountainColors: ['#4B7FD1', '#5D6FD9', '#3E8EC7', '#6E74D4'],
      cloudTint: '#FFFDF7',
    },
    animSpeeds: {
      wheelRadPerSec: 0.08,
      balloonBobSpeed: 0.72,
      balloonDriftSpeed: 0.24,
      islandBobSpeed: 0.52,
      waterfallScrollSpeed: 0.85,
      rainbowPulseSpeed: 1.35,
      crystalPulseSpeed: 1.85,
      flagWaveSpeed: 2.75,
    },
  },
} as const;
