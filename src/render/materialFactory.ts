// src/render/materialFactory.ts

import * as THREE from 'three';
import { CONFIG, type GraphicsPreset } from '../config';

export interface SurfaceMaterialOptions {
  color?: THREE.ColorRepresentation;
  map?: THREE.Texture | null;
  roughnessMap?: THREE.Texture | null;
  emissive?: THREE.ColorRepresentation;
  emissiveMap?: THREE.Texture | null;
  emissiveIntensity?: number;
  roughness?: number;
  metalness?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  ior?: number;
  envMapIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  alphaTest?: number;
  side?: THREE.Side;
  polygonOffset?: boolean;
  polygonOffsetFactor?: number;
  polygonOffsetUnits?: number;
  fog?: boolean;
  depthWrite?: boolean;
  physical?: boolean;
  specularHighlight?: boolean;
  shininess?: number;
}

export type SurfaceMaterial =
  | THREE.MeshPhysicalMaterial
  | THREE.MeshStandardMaterial
  | THREE.MeshPhongMaterial
  | THREE.MeshLambertMaterial;

export function isSimpleMaterialPreset(preset: GraphicsPreset): boolean {
  return preset !== 'penuh';
}

export function createSurfaceMaterial(
  preset: GraphicsPreset,
  opts: SurfaceMaterialOptions,
): SurfaceMaterial {
  if (preset === 'penuh') {
    if (opts.physical) {
      return new THREE.MeshPhysicalMaterial({
        color: opts.color ?? 0xffffff,
        map: opts.map ?? null,
        roughnessMap: opts.roughnessMap ?? null,
        emissive: opts.emissive ?? 0x000000,
        emissiveMap: opts.emissiveMap ?? null,
        emissiveIntensity: opts.emissiveIntensity ?? 1.0,
        roughness: opts.roughness ?? 0.4,
        metalness: opts.metalness ?? 0.0,
        clearcoat: opts.clearcoat ?? 0.0,
        clearcoatRoughness: opts.clearcoatRoughness ?? 0.1,
        ior: opts.ior ?? 1.5,
        envMapIntensity: opts.envMapIntensity ?? 1.0,
        transparent: opts.transparent ?? false,
        opacity: opts.opacity ?? 1.0,
        alphaTest: opts.alphaTest ?? 0,
        side: opts.side ?? THREE.FrontSide,
        polygonOffset: opts.polygonOffset ?? false,
        polygonOffsetFactor: opts.polygonOffsetFactor ?? 0,
        polygonOffsetUnits: opts.polygonOffsetUnits ?? 0,
        fog: opts.fog ?? true,
        depthWrite: opts.depthWrite ?? true,
      });
    }

    return new THREE.MeshStandardMaterial({
      color: opts.color ?? 0xffffff,
      map: opts.map ?? null,
      roughnessMap: opts.roughnessMap ?? null,
      emissive: opts.emissive ?? 0x000000,
      emissiveMap: opts.emissiveMap ?? null,
      emissiveIntensity: opts.emissiveIntensity ?? 1.0,
      roughness: opts.roughness ?? 0.5,
      metalness: opts.metalness ?? 0.0,
      envMapIntensity: opts.envMapIntensity ?? 1.0,
      transparent: opts.transparent ?? false,
      opacity: opts.opacity ?? 1.0,
      alphaTest: opts.alphaTest ?? 0,
      side: opts.side ?? THREE.FrontSide,
      polygonOffset: opts.polygonOffset ?? false,
      polygonOffsetFactor: opts.polygonOffsetFactor ?? 0,
      polygonOffsetUnits: opts.polygonOffsetUnits ?? 0,
      fog: opts.fog ?? true,
      depthWrite: opts.depthWrite ?? true,
    });
  }

  const usePhong = Boolean(opts.specularHighlight || (opts.roughness !== undefined && opts.roughness < 0.35));
  if (usePhong) {
    return new THREE.MeshPhongMaterial({
      color: opts.color ?? 0xffffff,
      map: opts.map ?? null,
      emissive: opts.emissive ?? 0x000000,
      emissiveMap: opts.emissiveMap ?? null,
      emissiveIntensity: opts.emissiveIntensity ?? 1.0,
      specular: new THREE.Color(0x2a3342),
      shininess: opts.shininess ?? 24,
      transparent: opts.transparent ?? false,
      opacity: opts.opacity ?? 1.0,
      alphaTest: opts.alphaTest ?? 0,
      side: opts.side ?? THREE.FrontSide,
      polygonOffset: opts.polygonOffset ?? false,
      polygonOffsetFactor: opts.polygonOffsetFactor ?? 0,
      polygonOffsetUnits: opts.polygonOffsetUnits ?? 0,
      fog: opts.fog ?? true,
      depthWrite: opts.depthWrite ?? true,
    });
  }

  return new THREE.MeshLambertMaterial({
    color: opts.color ?? 0xffffff,
    map: opts.map ?? null,
    emissive: opts.emissive ?? 0x000000,
    emissiveMap: opts.emissiveMap ?? null,
    emissiveIntensity: opts.emissiveIntensity ?? 1.0,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1.0,
    alphaTest: opts.alphaTest ?? 0,
    side: opts.side ?? THREE.FrontSide,
    polygonOffset: opts.polygonOffset ?? false,
    polygonOffsetFactor: opts.polygonOffsetFactor ?? 0,
    polygonOffsetUnits: opts.polygonOffsetUnits ?? 0,
    fog: opts.fog ?? true,
    depthWrite: opts.depthWrite ?? true,
  });
}

export function updateSurfacePhysicalProps(
  mat: SurfaceMaterial,
  clearcoatRoughness: number,
  envMapIntensity: number,
): void {
  if (mat instanceof THREE.MeshPhysicalMaterial) {
    mat.clearcoatRoughness = clearcoatRoughness;
    mat.envMapIntensity = envMapIntensity;
  } else if (mat instanceof THREE.MeshStandardMaterial) {
    mat.envMapIntensity = envMapIntensity;
  }
}

export function injectDistantTrackLift(mat: THREE.Material, preset: GraphicsPreset): void {
  if (preset === 'penuh') {
    return;
  }
  const liftAmount = CONFIG.safeMode.distantTrackLift;
  const distStart = CONFIG.safeMode.distantTrackStartM;
  const distEnd = CONFIG.safeMode.distantTrackEndM;
  mat.customProgramCacheKey = () =>
    `distant-track-lift-${preset}-${liftAmount}-${distStart}-${distEnd}`;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTrackLiftAmount = { value: liftAmount };
    shader.uniforms.uTrackLiftStart = { value: distStart };
    shader.uniforms.uTrackLiftEnd = { value: distEnd };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying float vTrackViewDist;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
vTrackViewDist = -mvPosition.z;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uTrackLiftAmount;
uniform float uTrackLiftStart;
uniform float uTrackLiftEnd;
varying float vTrackViewDist;`,
      )
      .replace(
        '#include <dithering_fragment>',
        `float trackFarMask = smoothstep(uTrackLiftStart, uTrackLiftEnd, max(0.0, vTrackViewDist));
gl_FragColor.rgb += diffuseColor.rgb * (trackFarMask * uTrackLiftAmount);
#include <dithering_fragment>`,
      );
  };
}
