// src/config.ts

export interface BoostPadSegmentConfig {
  readonly at: number; // pecahan 0..1 di dalam segmen
  readonly lateral: number; // offset dari tengah lintasan (meter)
}

export type CourseSegmentConfig =
  | {
      readonly type: 'straight';
      readonly length: number;
      readonly width?: number;
      readonly checkpoint?: boolean;
      readonly boostPads?: readonly BoostPadSegmentConfig[];
    }
  | {
      readonly type: 'curve';
      readonly radius: number;
      readonly angleDeg: number; // + kanan, - kiri
      readonly bankDeg: number; // + miring ke kiri, - miring ke kanan
      readonly width?: number;
      readonly checkpoint?: boolean;
      readonly boostPads?: readonly BoostPadSegmentConfig[];
    }
  | {
      readonly type: 'slope';
      readonly length: number;
      readonly pitchDeg: number; // + menanjak, - menurun
      readonly width?: number;
      readonly checkpoint?: boolean;
      readonly boostPads?: readonly BoostPadSegmentConfig[];
    }
  | {
      readonly type: 'pitchTo';
      readonly length: number;
      readonly pitchDeg: number; // transisi halus ke pitchDeg lalu ditahan
      readonly width?: number;
      readonly checkpoint?: boolean;
      readonly boostPads?: readonly BoostPadSegmentConfig[];
    }
  | {
      readonly type: 'gap';
      readonly length: number;
      readonly exitPitchDeg: number; // garis tengah tetap ada tanpa permukaan
      readonly width?: number;
      readonly checkpoint?: boolean;
      readonly boostPads?: readonly BoostPadSegmentConfig[];
    }
  | {
      readonly type: 'loop';
      readonly radius: number;
      readonly lateralOffset: number;
      readonly width?: number;
      readonly checkpoint?: boolean;
      readonly boostPads?: readonly BoostPadSegmentConfig[];
    };

const CAR_BODY_LENGTH = 3.35;
const CAR_BODY_WIDTH = 1.7;

export const CONFIG = {
  sim: {
    fixedStep: 1 / 60,
    maxFrameDt: 0.1,
  },
  debug: {
    showFps: false,
    logCourseValidation: true,
    fpsSampleIntervalSec: 0.25,
    showCourseFrames: false,
    courseFrameStepMeters: 8,
    courseFrameArrowLength: 2.6,
  },
  colors: {
    track: '#FF6A00',
    trackEdge: '#FF963D',
    trackGroove: '#DE5400',
    trackCenterDash: '#FFE2B8',
    rail: '#1E6BFF',
    railHighlight: '#5594FF',
    boost: '#35D4FF',
    boostStripeLight: '#E0FAFF',
    skyTop: '#89C7FF',
    skyHorizon: '#BFE3FF',
    skyFogHex: 0xbfe3ff,
    accent: '#FFD23F',
    jumpStripeDark: '#1E293B',
    sunLightHex: 0xfff0d4,
    hemiSkyHex: 0xbfe3ff,
    hemiGroundHex: 0xd9b892,
    woodBase: '#D9B384',
    woodPlankAlt: '#CFA675',
    woodGrain: '#BC8E5B',
    woodSeam: '#9E7344',
    debugCenterLineHex: 0xffd23f,
    debugTangentHex: 0x35d4ff,
    debugUpHex: 0x22c55e,
    debugRightHex: 0xef4444,
  },
  renderer: {
    maxPixelRatio: 2,
    toneMappingExposure: 1.04,
    envBlur: 0.04,
    envIntensity: 0.78,
    shadowMapSize: 2048,
    softwareGlFramePauseMs: 80,
    softwareGlPollMs: 5,
  },
  lighting: {
    sunIntensity: 2.5,
    sunOffset: { x: 95, y: 140, z: 80 },
    sunShadowExtent: 90,
    sunShadowNear: 10,
    sunShadowFar: 360,
    sunShadowBias: -0.0004,
    sunShadowNormalBias: 0.04,
    sunShadowRadius: 3,
    hemiIntensity: 0.85,
    fogDensity: 0.0011,
  },
  camera: {
    near: 0.3,
    far: 1400,
    distance: 8.6,
    height: 3.35,
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
    debugOrbitMode: false,
    orbitRadiusScale: 1.32,
    orbitMinRadius: 95,
    orbitHeight: 75,
    orbitSpeed: 0.14,
  },
  hud: {
    speedUnit: 'km/h',
    speedScale: 3.6,
    maxGaugeSpeedKmh: 250,
    moveThresholdSpeedMs: 0.35,
    showControlsHint: true,
    airtimePopupDurationMs: 1500,
    splitPopupDurationMs: 1900,
    gaugeArcRadius: 54,
    gaugeArcCircumference: 2 * Math.PI * 54,
    gaugeArcSweepRatio: 240 / 360,
    colors: {
      textPrimary: '#FFFDF7',
      textMuted: '#CBD5E1',
      accentYellow: '#FFD23F',
      accentBlue: '#1E6BFF',
      accentCyan: '#35D4FF',
      accentOrange: '#FF6A00',
      panelBg: 'rgba(15, 23, 42, 0.82)',
    },
  },
  floor: {
    size: 680,
    textureSize: 512,
    textureRepeat: 54,
    roughness: 0.72,
    metalness: 0.02,
  },
  props: {
    seed: 4217,
    density: 1.0,
    clearance: 18,
    supportSpacing: 22,
    supportLandingExclusion: 22,
    shadowDistance: 145,
    roomSize: {
      width: 520,
      depth: 520,
      height: 175,
    },
    palette: {
      wallBase: '#EBE3D5',
      wallStripe: '#E2D8C5',
      baseboard: '#C7A67E',
      windowFrame: '#F4EFE6',
      windowSky: '#E6F2FF',
      sunbeamColor: '#FFF0C8',
      rugBase: '#D9CFC1',
      rugBorder: '#A9BAC6',
      rugPattern: '#C8B29B',
      woodLight: '#D4B288',
      woodDark: '#B99164',
      pastelBlue: '#9BB5C9',
      pastelMint: '#A7C2B1',
      pastelRose: '#CFA39D',
      pastelSand: '#DCC79E',
      pastelLavender: '#B9AECB',
      pastelSlate: '#8D9AA6',
      paperCream: '#F4EFE4',
      lampMetal: '#9BA4AD',
      lampShade: '#E8DEC8',
    },
  },
  fx: {
    bloom: {
      strength: 0.36,
      radius: 0.4,
      threshold: 1.08,
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
      color: '#35D4FF',
      colorEnd: '#1E6BFF',
      length: 0.38,
    },
    driftSmoke: {
      slipThreshold: 0.2,
      rate: 28,
    },
  },
  quality: {
    showQualityDebug: false,
    initialOverride: null as 'low' | 'medium' | 'high' | null,
    fpsDowngradeThreshold: 45,
    fpsDowngradeWindowSec: 2.0,
    warmupSec: 2.0,
    levels: {
      low: {
        pixelRatioMax: 1.0,
        bloomEnabled: false,
        shadowMapSize: 512,
        shadowFollowRadius: 48,
        particleScale: 0.45,
        propsDensityScale: 0.45,
        speedLinesEnabled: false,
      },
      medium: {
        pixelRatioMax: 1.5,
        bloomEnabled: true,
        shadowMapSize: 1024,
        shadowFollowRadius: 68,
        particleScale: 0.75,
        propsDensityScale: 0.75,
        speedLinesEnabled: true,
      },
      high: {
        pixelRatioMax: 2.0,
        bloomEnabled: true,
        shadowMapSize: 2048,
        shadowFollowRadius: 90,
        particleScale: 1.0,
        propsDensityScale: 1.0,
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
    emissiveIntensity: 2.25,
  },
  race: {
    countdownSeconds: 3,
    goHoldSeconds: 0.85,
    finishMargin: 6,
    resetPenaltySeconds: 0,
    resetSpeedFactor: 0.75,
    titleOrbitSpeed: 0.35,
    titleOrbitRadius: 11.5,
    titleOrbitHeight: 4.2,
  },
  storage: {
    key: 'sky-racer-best-v1',
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
    segments: [
      { type: 'straight', length: 50 },
      { type: 'curve', radius: 42, angleDeg: 90, bankDeg: -10, checkpoint: true },
      {
        type: 'straight',
        length: 30,
        checkpoint: true,
        boostPads: [{ at: 0.45, lateral: 0 }],
      },
      { type: 'loop', radius: 12, lateralOffset: 9 },
      {
        type: 'straight',
        length: 20,
        checkpoint: true,
        boostPads: [{ at: 0.4, lateral: 0 }],
      },
      { type: 'pitchTo', length: 8, pitchDeg: 14 },
      { type: 'gap', length: 16, exitPitchDeg: -12 },
      { type: 'pitchTo', length: 10, pitchDeg: 0, checkpoint: true },
      { type: 'straight', length: 20 },
      { type: 'curve', radius: 34, angleDeg: -90, bankDeg: 14, checkpoint: true },
      { type: 'slope', length: 36, pitchDeg: 14 },
      { type: 'slope', length: 36, pitchDeg: -14 },
      {
        type: 'straight',
        length: 50,
        boostPads: [{ at: 0.35, lateral: 0 }],
      },
    ] as readonly CourseSegmentConfig[],
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
    bodyColor: '#F6EFE0',
    stripeColor: '#E11D48',
    accentColor: '#FFD23F',
    cabinColorHex: 0x182232,
    bumperColorHex: 0x263040,
    tireColorHex: 0x171a21,
    rimColorHex: 0xe6edf5,
    headlightColorHex: 0xfff5c0,
    headlightEmissiveIntensity: 2.2,
    taillightColorHex: 0xef4444,
    taillightEmissiveIntensity: 1.35,
    exhaustGlowColorHex: 0x35d4ff,
    exhaustEmissiveIntensity: 2.6,
    exhaustPipeRadius: 0.085,
    exhaustPipeLength: 0.16,
    exhaustHaloBaseScale: 0.32,
    exhaustHaloBoostScale: 1.25,
    bodyClearcoat: 1.0,
    bodyClearcoatRoughness: 0.07,
    bodyRoughness: 0.18,
    bodyMetalness: 0.1,
    rimMetalness: 0.95,
    rimRoughness: 0.12,
    rollFactor: 0.006,
    maxRollRad: 0.13,
    pitchFactor: 0.0022,
    maxPitchRad: 0.075,
    suspensionDamping: 10,
  },
  input: {
    steerAttackTime: 0.12, // waktu naik steer dari 0 ke penuh dalam detik (naik = tap singkat lebih lembut, turun = respons belok lebih instan)
    steerReleaseTime: 0.07, // waktu turun steer kembali ke 0 dalam detik (naik = kemudi lebih lambat kembali lurus, turun = cepat kembali ke tengah)
    highSpeedSteerLimit: 0.35, // batas maksimum steer saat di maxSpeed (naik = lebih lincah di kecepatan puncak, turun = lebih stabil & tidak mudah selip)
    throttleResponseRate: 12.0, // laju respons pedal gas per detik (naik = lebih instan, turun = lebih halus)
    brakeResponseRate: 14.0, // laju respons pedal rem per detik (naik = lebih instan, turun = lebih halus)
  },
} as const;
