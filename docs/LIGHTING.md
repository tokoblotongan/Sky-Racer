# Sky Racer Lighting Reference

- **Three.js version**: `0.187.0` (`npm ls three`)
- **Intensity units (Three.js r155+/r187 physical units)**:
  - `PointLight` & `SpotLight`: **candela (cd)** with inverse-square decay (`decay = 2`).
  - `AmbientLight`, `HemisphereLight`, & `DirectionalLight`: **unitless multipliers**.
  - Decorative lights (tunnel strips, park lamps, boost pads, track accents) use emissive materials (`emissive` / `emissiveIntensity`), never `PointLight` or `SpotLight`.

---

## Lights Per Arena

Light count and types stay constant per arena. Lights are never added/removed and `castShadow` is never toggled while a race is active (`TITLE`-only for preset switches).

### 1. Sky Circuit (`sky-circuit` / `toyroom` theme)

| Light | Type | Preset: Vivid | Preset: Pastel | Notes |
| --- | --- | --- | --- | --- |
| `sunLight` | `DirectionalLight` | color `#FFE0AD`, intensity `2.9` | color `#FFE2B8`, intensity `2.8` | Offset `(95, 140, 80)`, `castShadow = true` (except `hemat`) |
| `hemiLight` | `HemisphereLight` | sky `#5CB8FF`, ground `#7A4622`, intensity `0.62` (`penuh`) / `max(0.62, 1.05)` (`hemat`/`seimbang`) | sky `#BFE3FF`, ground `#8B5A2B`, intensity `0.55` (`penuh`) / `1.05` (`hemat`/`seimbang`) | Position `(0, 120, 0)` |
| `ambientFallbackLight` *(non-Penuh)* | `AmbientLight` | color `#FFFFFF`, intensity `0.72` | color `#FFFFFF`, intensity `0.72` | Active in `seimbang` & `hemat` only |
| `fillDirLight` *(non-Penuh)* | `DirectionalLight` | color `#FFFFFF`, intensity `1.15` | color `#FFFFFF`, intensity `1.15` | Offset `(-45, 65, -55)`, `castShadow = false` |

- Base exposure (`penuh` ACES / `seimbang`/`hemat` Linear): `0.95` (`vivid`), `0.90` (`pastel`).
- Base `scene.environmentIntensity` (`penuh` RoomEnvironment PMREM): `0.45` (`vivid`), `0.50` (`pastel`).

### 2. FantasyLand (`fantasy-land` / `fantasyland` theme)

| Light | Type | Preset: Vivid | Preset: Pastel | Notes |
| --- | --- | --- | --- | --- |
| `sunLight` | `DirectionalLight` | color `#FFE8B8`, intensity `3.0` | color `#FFE8B8`, intensity `3.0` | Offset `(95, 140, 80)`, `castShadow = true` (except `hemat`) |
| `hemiLight` | `HemisphereLight` | sky `#78B6FF`, ground `#2ED66B`, intensity `0.72` (`penuh`) / `1.05` (`hemat`/`seimbang`) | sky `#78B6FF`, ground `#2ED66B`, intensity `0.72` (`penuh`) / `1.05` (`hemat`/`seimbang`) | Position `(0, 120, 0)` |
| `ambientFallbackLight` *(non-Penuh)* | `AmbientLight` | color `#FFFFFF`, intensity `0.72` | color `#FFFFFF`, intensity `0.72` | Active in `seimbang` & `hemat` only |
| `fillDirLight` *(non-Penuh)* | `DirectionalLight` | color `#FFFFFF`, intensity `1.15` | color `#FFFFFF`, intensity `1.15` | Offset `(-45, 65, -55)`, `castShadow = false` |

- Base exposure: `0.96` (`vivid`), `0.92` (`pastel`).
- Base `scene.environmentIntensity` (`penuh` RoomEnvironment PMREM): `0.42`.

---

## Graphics Presets & Environment Maps

| Preset | Tone Mapping | `scene.environment` | Base Env Intensity | Shadows |
| --- | --- | --- | --- | --- |
| **Penuh** (`penuh`) | `ACESFilmicToneMapping` | `RoomEnvironment` (PMREM) | `0.42`–`0.50` (per theme/palette) | `PCFShadowMap`, `sunLight` only (`1024` desktop, `512` mobile) |
| **Seimbang** (`seimbang`) | `LinearToneMapping` | Procedural `128x64` gradient `CanvasTexture` (`EquirectangularReflectionMapping`, `SRGBColorSpace`) **only if** `EXT_color_buffer_float` / `EXT_color_buffer_half_float` is supported **and** 10s first-render passes without error (`sky-racer-normal-ok-v1`); otherwise `null` + Hemi/Ambient/Fill fallback | `0.25` when active, `0` on fallback | `PCFShadowMap`, `512x512`, `±28m` follow radius |
| **Hemat** (`hemat`) | `LinearToneMapping` | `null` | `0` | Disabled; radial-gradient blob contact shadow (`y = +0.001`) |

---

## Shadow Rules

1. **Single shadow caster**: Only `sunLight` has `castShadow = true` (`fillDirLight.castShadow = false`).
2. **Tight car-following frustum**: `sunLight` tracks the player car snapped to texel increments:
   - Desktop (`high` / `medium`): `mapSize = 1024`, half-extent `±45 m`.
   - Mobile / `seimbang`: `mapSize = 512`, half-extent `±28 m` (`low`: `±32 m`).
   - `near = 40`, `far = 300`, `bias = -0.0001`, `normalBias = 0.02`, `intensity = 0.7`, `radius = 3`.
3. **Mobile contact blob shadow**: In `hemat` (player & opponents) and `seimbang` on mobile for opponent cars (`isOpponent && isMobile`), cars use a radial-gradient `CanvasTexture` plane (`transparent: true`, `depthWrite: false`, `y = +0.001`) instead of casting shadow maps.
4. **No mid-race changes**: `castShadow`, light counts, and graphics presets are locked during active racing; preset changes and shader recompiles happen only on the `TITLE` screen.

---

## Tuning Brightness

- **Centralized API**: `sceneCtx.applyBrightness(value)` in `src/render/scene.ts` is the single function controlling brightness:
  - Clamps `value` to `CONFIG.safeMode.brightnessMin` (`0.8`) .. `CONFIG.safeMode.brightnessMax` (`1.8`).
  - Sets `renderer.toneMappingExposure = currentExposure * value`.
  - Sets `scene.environmentIntensity = scene.environment ? baseEnvIntensity * value : 0`.
- **UI & Persistence**:
  - The Brightness slider (`Kecerahan`) and Reset button in Title/Gear menus call `applyBrightness(value)` and persist to `localStorage` (`sky-racer-brightness-v1`).
  - Defaults: `1.00` (`penuh`), `1.15` (`seimbang` and `hemat`).
  - Debug keys `[` / `]` (when `CONFIG.visual.debugKeys` is enabled) adjust base `currentExposure` and re-invoke `applyBrightness`.
