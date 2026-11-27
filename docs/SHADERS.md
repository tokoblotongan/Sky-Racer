# Sky Racer Shader Reference & Audit

- **Three.js version**: `0.187.0`
- **Pipeline**:
  - **Penuh (`penuh`)**: Renders linear HDR scene into `EffectComposer` (`HalfFloatType` target) -> `UnrealBloomPass` -> `SpeedLinesShader` -> `ColorGradeShader` -> `OutputPass` (ACES Filmic tone mapping + Linear-to-sRGB) -> optional `FXAAShader`. When all composer passes are off, renders directly to screen.
  - **Seimbang (`seimbang`) & Hemat (`hemat`)**: Bypasses `EffectComposer` completely and renders directly to screen (`LinearToneMapping`, `SRGBColorSpace`).

---

## 1. Shader Inventory

### A. `ShaderMaterial`

| Name | File | Function | Uniforms | Output Target & Color Chunks |
| --- | --- | --- | --- | --- |
| **SkyDome** (`createSkyDome`) | `src/render/scene.ts` | Procedural vertical sky dome gradient (`uSkyHorizon` -> `uSkyTop` above horizon, `uSkyHorizon` -> `uGroundBounce * 0.85` below horizon), pushed to far clip (`clipPos.z = clipPos.w * 0.9999`), `BackSide`, no depth/fog. | `uSkyTop`, `uSkyHorizon`, `uGroundBounce` | Screen or `EffectComposer` target. Ends with `#include <tonemapping_fragment>` + `#include <colorspace_fragment>` (no-op inside composer target; fixes dark linear sky in direct-render modes `hemat`/`seimbang`). |
| **Particle Pools** (`createPool`: `sparksPool`, `dustPool`, `boostPool`) | `src/render/particles.ts` | GPU point-sprite particles (`THREE.Points`) for rail-hit sparks (`AdditiveBlending`), landing/drift dust (`NormalBlending`), and boost trails (`AdditiveBlending`). | `uMap`, `uPixelRatio`, `uOpacity` (`1.0`) + per-vertex `aSize`, `aColor`, `aAlpha` | Screen or `EffectComposer` target. Transparent (`vAlpha * texel.a * uOpacity`). Ends with `#include <tonemapping_fragment>` + `#include <colorspace_fragment>`. |

### B. `RawShaderMaterial`

- **None (`0`)**: No `RawShaderMaterial` is used anywhere in the project.

### C. Post-Processing `ShaderPass` (`penuh` mode only)

| Name | File | Function | Uniforms | Render Target Exception |
| --- | --- | --- | --- | --- |
| **`SpeedLinesShader`** | `src/render/postfx.ts` | Radial angular speed streaks around the screen perimeter during boost/high speed. | `tDiffuse`, `uIntensity`, `uTime`, `uAspect` | Renders to `EffectComposer` intermediate render target before `OutputPass` — intentionally omits `tonemapping_fragment` and `colorspace_fragment`. |
| **`ColorGradeShader`** | `src/render/postfx.ts` | Highlight-safe saturation, linear mid-gray contrast pivot, and radial vignette. | `tDiffuse`, `uSaturation`, `uContrast`, `uVignette` | Renders to `EffectComposer` intermediate render target immediately before `OutputPass` — intentionally omits `tonemapping_fragment` and `colorspace_fragment`. |

*(Built-in Three.js passes also used in `penuh` mode: `UnrealBloomPass`, `OutputPass`, `FXAAShader`.)*

### D. `onBeforeCompile` Extensions

| Name | File | Function | Uniforms | Cache Key |
| --- | --- | --- | --- | --- |
| **`injectDistantTrackLift`** | `src/render/materialFactory.ts` | Applied only in `hemat` / `seimbang` on `mainTrackMaterial` and `branchTrackMaterial` (`src/render/track.ts`) to subtly lift distant track brightness. | `uTrackLiftAmount`, `uTrackLiftStart`, `uTrackLiftEnd` | `customProgramCacheKey`: `` `distant-track-lift-${preset}-${liftAmount}-${distStart}-${distEnd}` `` |

### E. Non-Shader Animated / Emissive Visuals (Lightweight Equivalency)

These effects do **not** use custom `ShaderMaterial` — they already run on standard materials with UV offset scrolling, emissive modulation, or `MeshBasicMaterial`:

- **Tunnel Ceiling Light Strips** (`src/render/tunnel.ts`, `lightMat`): `createSurfaceMaterial` (`MeshStandardMaterial` in `penuh`, `MeshPhongMaterial` in `hemat`/`seimbang`) with `lightTex` (`map` + `emissiveMap`) scrolled via `lightTex.offset.y`.
- **Track Pulse Strips** (`src/render/trackAccents.ts`, `pulseMat`): `createSurfaceMaterial` with `pulseTex` (`map` + `emissiveMap`) scrolled via `pulseTex.offset.y` and sinusoidal `emissiveIntensity` modulation.
- **Rainbow Landmark** (`src/render/fantasy/decorMaterials.ts` + `rainbow.ts`, `rainbowMat`): `createSurfaceMaterial` with `rainbowTex` (`map` + `emissiveMap`) and sinusoidal `emissiveIntensity` pulse.
- **Floating Island Waterfalls** (`src/render/fantasy/decorMaterials.ts` + `floatingIslands.ts`, `waterfallMat`): `THREE.MeshBasicMaterial` with `waterfallTex.offset.y` scroll (`transparent: true, opacity: 0.8` in `penuh`/`seimbang`, disabled on `mobile`/`hemat` preset).

---

## 2. Shader Rules & Audit Checklist

1. **Fragment Output Tail (`#include <tonemapping_fragment>` + `#include <colorspace_fragment>`)**:
   - Every `ShaderMaterial` that outputs directly to the screen (or shares a scene render pass that may bypass `EffectComposer`) must end `fragmentShader` `main()` with:
     ```glsl
     #include <tonemapping_fragment>
     #include <colorspace_fragment>
     ```
   - Three.js automatically disables tone mapping (`NoToneMapping`) and keeps working linear space when rendering into an offscreen `WebGLRenderTarget` (`EffectComposer`), so including both chunks never double-tonemaps in `penuh` mode while keeping `hemat`/`seimbang` direct rendering accurate.
   - `ShaderPass` shaders (`SpeedLinesShader`, `ColorGradeShader`) render strictly to intermediate composer targets before `OutputPass` and therefore omit these two chunks.

2. **Transparency in `ShaderMaterial`**:
   - Built-in `material.opacity` is ignored by `ShaderMaterial`. Transparent `ShaderMaterial` instances must read a uniform (e.g., `uOpacity`) and/or vertex alpha (`vAlpha`) and write the result to `gl_FragColor.a` (or use `MeshBasicMaterial` / `createSurfaceMaterial`).
   - `particles.ts` multiplies `texel.a * vAlpha * uOpacity` into `gl_FragColor.a`.

3. **InstancedMesh & F3 Decor Verification**:
   - Any `InstancedMesh` using a custom `ShaderMaterial` must apply `instanceMatrix` in its vertex shader (`#ifdef USE_INSTANCING ... instanceMatrix * vec4(position, 1.0)`).
   - All `InstancedMesh` objects in the project — including FantasyLand F3 decor (`balloons.ts`, `crystals.ts`, `ferrisWheel.ts`, `parkProps.ts`, `castle.ts`) and terrain/props (`fantasyland.ts`, `props.ts`, `tunnel.ts`, `track.ts`, `bridge.ts`) — use `createSurfaceMaterial` (Three.js built-in PBR/Lambert/Phong materials), which natively multiplies `instanceMatrix` and reads `instanceColor`.

4. **Uniform Naming Discipline**:
   - Prefix custom uniforms with `u` (or `t` for postfx input textures like `tDiffuse`) and never name uniforms `position`, `normal`, `uv`, `modelViewMatrix`, `projectionMatrix`, `viewMatrix`, `normalMatrix`, `cameraPosition`, or `instanceMatrix`.

5. **`onBeforeCompile` Cache Keys**:
   - Every material customized via `onBeforeCompile` must define `material.customProgramCacheKey` incorporating all variant parameters (`preset`, constants/thresholds) so Three.js never shares compiled shader programs across differing variants.

6. **Mobile (`hemat` / `seimbang`) Cheap Equivalents vs PC (`penuh`)**:
   - Post-processing (`UnrealBloomPass`, `SpeedLinesShader`, `ColorGradeShader`, `FXAAShader`) is completely bypassed in `hemat` and `seimbang`.
   - Animated strips/waterfalls/rainbow rely on UV texture offsets and `emissiveIntensity` rather than heavy procedural fragment shaders; PC `penuh` rendering remains unchanged.

7. **Mobile GPU Precision & GLSL Safety**:
   - Never hardcode `precision highp` in fragment shaders unless required; rely on Three.js WebGL2/WebGL1 preamble.
   - Avoid legacy WebGL1 extensions (`derivatives`, `shaderTextureLOD`, `drawBuffers`, `fragDepth`) and avoid GLSL ES undefined domains such as `pow(0.0, y)` (guarded with `max(..., 0.0001)` in `SkyDome` and `vec3(0.00001)` in `ColorGradeShader`).

8. **Compile/Link Error Reporting (`renderer.debug.onShaderError`)**:
   - `src/render/scene.ts` sets `renderer.debug.checkShaderErrors = true` and registers `renderer.debug.onShaderError`, forwarding vertex/fragment/program logs to `logErrorOverlay` (`src/ui/errorOverlay.ts`) and `console.error`.
