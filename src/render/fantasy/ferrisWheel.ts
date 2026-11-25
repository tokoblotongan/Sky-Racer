// src/render/fantasy/ferrisWheel.ts

import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { ResolvedDecorPlacement } from '../../courses/fantasyLandDecor';
import {
  countGeometryTriangles,
  mergeNormalizedGeometries,
  setGeometrySwatch,
  SWATCH,
  type FantasyDecorMaterials,
  type FantasyDecorModule,
} from './decorMaterials';

export function buildFerrisWheelLandmark(
  placement: ResolvedDecorPlacement,
  mats: FantasyDecorMaterials,
  shadowsEnabled: boolean,
  quality: 'high' | 'medium' | 'mobile',
): FantasyDecorModule {
  const group = new THREE.Group();
  group.name = 'FantasyFerrisWheelGroup';

  const isMobile = quality === 'mobile';
  const wheelRadius = 35; // ~70 m diameter
  const hubHeight = 41;
  const rimWidth = 5.4;
  const gondolaCount = isMobile ? 12 : 16;

  // 1. Static A-frame support structure grounded cleanly at y = 0
  const supportParts: THREE.BufferGeometry[] = [];
  supportParts.push(setGeometrySwatch(new THREE.BoxGeometry(22, 2.5, 16), SWATCH.CASTLE_TRIM).translate(0, 1.25, 0));

  for (const zSide of [-1, 1]) {
    const zOff = zSide * 4.4;
    for (const xSide of [-1, 1]) {
      const legLen = Math.hypot(12, hubHeight);
      const leg = new THREE.CylinderGeometry(0.95, 1.35, legLen, 8);
      leg.rotateZ(xSide * Math.atan2(12, hubHeight));
      leg.translate(xSide * 6.0, hubHeight * 0.5, zOff);
      supportParts.push(setGeometrySwatch(leg, SWATCH.WHEEL_FRAME));
    }
    const hubCollar = new THREE.CylinderGeometry(2.8, 2.8, 1.4, 12);
    hubCollar.rotateX(Math.PI / 2);
    hubCollar.translate(0, hubHeight, zOff);
    supportParts.push(setGeometrySwatch(hubCollar, SWATCH.GOLD));
  }
  // Axle shaft
  const axle = new THREE.CylinderGeometry(1.4, 1.4, 10.5, 12);
  axle.rotateX(Math.PI / 2);
  axle.translate(0, hubHeight, 0);
  supportParts.push(setGeometrySwatch(axle, SWATCH.GOLD));

  const supportGeom = mergeNormalizedGeometries(supportParts);
  const supportMesh = new THREE.Mesh(supportGeom, mats.paletteMat);
  supportMesh.castShadow = shadowsEnabled;
  supportMesh.receiveShadow = shadowsEnabled;
  supportMesh.matrixAutoUpdate = false;
  supportMesh.updateMatrix();
  group.add(supportMesh);

  // 2. Rotating wheel frame (spokes, dual rims, hub, rim lights)
  const wheelRotor = new THREE.Group();
  wheelRotor.position.set(0, hubHeight, 0);
  group.add(wheelRotor);

  const rimParts: THREE.BufferGeometry[] = [];
  const spokeCount = gondolaCount;
  for (const zSide of [-1, 1]) {
    const zOff = zSide * (rimWidth * 0.5);
    const outerRing = new THREE.TorusGeometry(wheelRadius, 0.58, 6, isMobile ? 28 : 44);
    outerRing.translate(0, 0, zOff);
    rimParts.push(setGeometrySwatch(outerRing, SWATCH.WHEEL_FRAME));

    const innerRing = new THREE.TorusGeometry(wheelRadius * 0.62, 0.36, 6, isMobile ? 24 : 36);
    innerRing.translate(0, 0, zOff);
    rimParts.push(setGeometrySwatch(innerRing, SWATCH.WHEEL_FRAME));

    for (let i = 0; i < spokeCount; i++) {
      const ang = (i / spokeCount) * Math.PI * 2;
      const spoke = new THREE.CylinderGeometry(0.24, 0.24, wheelRadius, 6);
      spoke.translate(0, wheelRadius * 0.5, 0);
      spoke.rotateZ(ang);
      spoke.translate(0, 0, zOff);
      rimParts.push(setGeometrySwatch(spoke, SWATCH.WHEEL_FRAME));
    }
  }

  // Cross-braces at each gondola attachment point
  const gondolaLocalAngles: number[] = [];
  for (let i = 0; i < gondolaCount; i++) {
    const ang = (i / gondolaCount) * Math.PI * 2;
    gondolaLocalAngles.push(ang);
    const gx = -Math.sin(ang) * wheelRadius;
    const gy = Math.cos(ang) * wheelRadius;
    const bar = new THREE.CylinderGeometry(0.26, 0.26, rimWidth, 6);
    bar.rotateX(Math.PI / 2);
    bar.translate(gx, gy, 0);
    rimParts.push(setGeometrySwatch(bar, SWATCH.GOLD));
  }

  const hubDisc = new THREE.CylinderGeometry(3.8, 3.8, 1.8, 14);
  hubDisc.rotateX(Math.PI / 2);
  rimParts.push(setGeometrySwatch(hubDisc, SWATCH.GOLD));

  const gondolaColors = CONFIG.fantasy.palette.gondolaColors;
  const gondolaSwatches = [SWATCH.ROOF_RED, SWATCH.ROOF_BLUE, SWATCH.GOLD, SWATCH.ROOF_PURPLE];

  // On mobile: merge gondolas cleanly into rimParts (zero separate animated gondola transforms)
  if (isMobile) {
    for (let i = 0; i < gondolaCount; i++) {
      const ang = gondolaLocalAngles[i];
      const gx = -Math.sin(ang) * wheelRadius;
      const gy = Math.cos(ang) * wheelRadius;
      const pod = new THREE.BoxGeometry(3.4, 3.0, 3.2);
      pod.translate(gx, gy, 0);
      rimParts.push(setGeometrySwatch(pod, gondolaSwatches[i % gondolaSwatches.length]));
    }
  }

  const wheelGeom = mergeNormalizedGeometries(rimParts);
  const wheelMesh = new THREE.Mesh(wheelGeom, mats.paletteMat);
  wheelMesh.castShadow = shadowsEnabled;
  wheelRotor.add(wheelMesh);

  // Emissive hub & rim lights
  const lightParts: THREE.BufferGeometry[] = [];
  const hubRing = new THREE.TorusGeometry(2.6, 0.34, 6, 18);
  hubRing.translate(0, 0, 1.0);
  lightParts.push(hubRing);
  const hubRingBack = new THREE.TorusGeometry(2.6, 0.34, 6, 18);
  hubRingBack.translate(0, 0, -1.0);
  lightParts.push(hubRingBack);
  for (let i = 0; i < gondolaCount; i++) {
    const ang = gondolaLocalAngles[i];
    const lx = -Math.sin(ang) * (wheelRadius + 0.35);
    const ly = Math.cos(ang) * (wheelRadius + 0.35);
    const bulb = new THREE.OctahedronGeometry(0.65, 0);
    bulb.translate(lx, ly, 0);
    lightParts.push(bulb);
  }
  const lightsGeom = mergeNormalizedGeometries(lightParts);
  const lightsMesh = new THREE.Mesh(lightsGeom, mats.glowAccentMat);
  wheelRotor.add(lightsMesh);

  let gondolaInst: THREE.InstancedMesh | null = null;
  let gondolaGeom: THREE.BufferGeometry | null = null;
  const dummy = new THREE.Object3D();

  if (!isMobile) {
    const hanger = new THREE.CylinderGeometry(0.16, 0.16, 2.2, 6);
    hanger.translate(0, -1.1, 0);
    const cabin = new THREE.BoxGeometry(3.6, 2.9, 3.4);
    cabin.translate(0, -3.1, 0);
    const roof = new THREE.ConeGeometry(2.7, 1.2, 4);
    roof.rotateY(Math.PI / 4);
    roof.translate(0, -1.1, 0);
    gondolaGeom = mergeNormalizedGeometries([hanger, cabin, roof]);

    gondolaInst = new THREE.InstancedMesh(gondolaGeom, mats.instancedColorMat, gondolaCount);
    gondolaInst.castShadow = shadowsEnabled;
    const tmpColor = new THREE.Color();
    for (let i = 0; i < gondolaCount; i++) {
      tmpColor.set(gondolaColors[i % gondolaColors.length]);
      gondolaInst.setColorAt(i, tmpColor);
    }
    if (gondolaInst.instanceColor) gondolaInst.instanceColor.needsUpdate = true;
    wheelRotor.add(gondolaInst);
  }

  const syncGondolas = (wheelAngle: number): void => {
    if (!gondolaInst) return;
    for (let i = 0; i < gondolaCount; i++) {
      const ang = gondolaLocalAngles[i];
      const gx = -Math.sin(ang) * wheelRadius;
      const gy = Math.cos(ang) * wheelRadius;
      dummy.position.set(gx, gy, 0);
      dummy.rotation.set(0, 0, -wheelAngle);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      gondolaInst.setMatrixAt(i, dummy.matrix);
    }
    gondolaInst.instanceMatrix.needsUpdate = true;
  };

  syncGondolas(0);

  group.position.set(placement.position.x, placement.position.y, placement.position.z);
  group.rotation.y = placement.yaw;
  group.scale.setScalar(placement.spec.scale);

  const wheelSpeed = CONFIG.fantasy.animSpeeds.wheelRadPerSec;
  const totalTriangles =
    countGeometryTriangles(supportGeom) +
    countGeometryTriangles(wheelGeom) +
    countGeometryTriangles(lightsGeom) +
    (gondolaGeom ? countGeometryTriangles(gondolaGeom) * gondolaCount : 0);

  const drawCallCount = isMobile ? 3 : 4;

  return {
    group,
    update(timeSec: number): void {
      const angle = timeSec * wheelSpeed;
      wheelRotor.rotation.z = angle;
      if (!isMobile) {
        syncGondolas(angle);
      }
    },
    dispose(): void {
      supportGeom.dispose();
      wheelGeom.dispose();
      lightsGeom.dispose();
      gondolaGeom?.dispose();
    },
    getTriangleCount(): number {
      return totalTriangles;
    },
    getDrawCallCount(): number {
      return drawCallCount;
    },
  };
}
