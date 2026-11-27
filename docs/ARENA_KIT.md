# Sky Racer Arena Kit Guide

This guide explains how Sky Racer arenas are structured, how to scaffold a new arena safely, and what design, technical, and budget rules must pass before enabling an arena for players.

## 1. Architecture Overview

Every playable arena is driven by an explicit `ArenaDefinition` registered inside `createArenaRegistry()` (`src/arenas/index.ts`). Core systems (`main.ts`, `courseValidation.ts`, `introCamera.ts`, `musicDirector.ts`, `arenaSelect.ts`, `records.ts`) read data and capabilities from the definition rather than branching on hard-coded arena IDs.

- **Contracts**: `src/arenas/types.ts`, `src/themes/types.ts`
- **Registry**: `src/arenas/registry.ts` and `src/arenas/index.ts` (explicit factory instance; no global singletons)
- **Built-in Arenas**: `src/arenas/skyCircuit/definition.ts`, `src/arenas/fantasyLand/definition.ts`
- **Starter Template**: `src/arenas/_template/`

## 2. Step-by-Step: Adding a New Arena

1. **Scaffold files** using the generator CLI:
   ```bash
   npm run new:arena -- <arena-id> "<Arena Display Name>"
   ```
   This copies `src/arenas/_template/` into `src/arenas/<arena-id>/` and registers it inside `src/arenas/index.ts` between `// ARENA-REGISTRY-START` and `// ARENA-REGISTRY-END` with `comingSoon: true`.

2. **Design the track (`src/arenas/<arena-id>/course.ts`)**:
   - Define `closed` (`true` for multi-lap circuits, `false` for one-way point-to-point tracks), `trackWidth`, `startPosition`, `startHeadingDeg`, `segments`, and optional `routes` (shortcuts).
   - Keep turn curvature smooth, include sequential checkpoints (`4..12` on closed loops, `8..11` on point-to-point), and add boost pads before large jumps or loops.
   - Do **not** modify core driving physics constants, `carHalfWidth`, `carHalfLength`, rollover triggers, or `collisions.ts`.

3. **Build the scenery theme (`src/arenas/<arena-id>/theme.ts`)**:
   - Export a `ThemeDefinition` with `background`, `lightingProfile`, `qualityTiers`, and `buildScenery(context)`.
   - Wire `theme: myTheme.id` and `themeDefinition: myTheme` in `definition.ts` (or register shared themes in `src/render/themes/index.ts`).

4. **Configure `src/arenas/<arena-id>/definition.ts`**:
   - Set `order`, `mode` (`'timetrial' | 'race'`), `laps`, `opponentCount`, `capabilities` (`hasOpponents`, `hasShortcut`, `hasAttractions`, `hasPodium`), `introCamera.highlightPoints`, `music` filenames under `public/audio/`, `zones`, and `budgets`.
   - Keep all **user-facing Indonesian text** (e.g., `typeLabel`, `tagline`, zone titles, `"Segera"`, `"LAP TERAKHIR"`) accurate and clear.

5. **Run automatic validation before flipping `comingSoon: false`**:
   ```bash
   npm run validate:arenas -- --arena <arena-id>
   ```
   Review the generated report at `reports/arena-<arena-id>.md`.

6. **Enable the arena**:
   - Once all checks pass, set `comingSoon: false` (or remove `comingSoon`) and calibrate `referenceTime`, `referenceLapTime`, and `medals` using `npm run validate:course -- --course=<arena-id>`.

## 3. Required Files Per Arena

Under `src/arenas/<id>/`:
- `definition.ts` — Exports `<camelId>Arena: ArenaDefinition` (all required fields checked by `CONFIG.arenaKit.requiredFields`).
- `course.ts` — Track segments, closure settings, checkpoints, boost pads, and medal targets (`ArenaCourseData`).
- `theme.ts` — Scenery builder (`ThemeDefinition`) implementing `buildScenery`, `update(dt)`, and complete `dispose()`.

## 4. Technical & Visual Rules

- **Vivid Toy-Diecast Palette**: Saturated, high-clarity track (`#FF6A00`), rails (`#1E6BFF`), boost strips (`#35D4FF`), and vibrant scenery readable at speed; avoid muddy grays or flat untextured primitives.
- **Lighting (`docs/LIGHTING.md`)**: Use `HemisphereLight` + one shadow-casting `DirectionalLight` and optional `FogExp2`; keep ACES tone mapping (`1.0` nominal) and clearcoat materials balanced.
- **Shaders & Materials (`docs/SHADERS.md`)**: Do **not** write custom GLSL shaders. Use standard/physical materials, canvas textures, emissive highlights, instancing (`InstancedMesh`), and CSS effects.
- **Modular Responsibilities**: One file = one responsibility. Do not introduce global mutable state.
- **Tuning Values**: Place shared tuning constants in `src/config.ts` and per-arena specs inside `src/arenas/<id>/`.
- **Performance Budgets**: Keep theme builds within `arena.budgets` (`meshes`, `triangles`, `instances`, `textureMB`) and ensure every music asset in `public/audio/` is `<= 6 MB`.

## 5. Launch Checklist

- [ ] `npm run build` passes with zero TypeScript errors.
- [ ] `npm run validate:arenas -- --arena <arena-id>` reports `PASS` across all 6 checks (completeness, course/attractions, AI smoke run, scenery budgets, music files, unique record storage key).
- [ ] `npm run test:ai` and `npm run test:attractions` pass with zero regressions.
- [ ] Arena card, minimap, intro flyby, racing flow, music transitions, and results/podium tested on desktop and mobile presets (`Hemat`, `Seimbang`, `Penuh`).
- [ ] `comingSoon` removed or set to `false`.
