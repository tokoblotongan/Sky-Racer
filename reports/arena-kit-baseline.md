# Arena Kit Refactor — Baseline Report

Generated before any Arena Kit code changes to verify 100% behavioral parity (tolerance <= 0.5%) after refactoring.

## Test & Validator Results (Pre-Refactor)

| Command | Status | Details |
|---|---|---|
| `npm run test:ai` | PASS | All 9/9 checks passed across 5 seeds x 3 difficulties (15 races) |
| `npm run test:collisions` | N/A (not in `package.json`) | No separate `test:collisions` script exists; collision physics invariants are checked inside `test:ai` (`collisions=62`, `tunneling=0`, `chainedRollovers=0`) |
| `npm run test:attractions` | PASS | 11/11 invariants verified (including Sky Circuit attraction isolation) |
| `npm run validate:course` (FantasyLand default) | PASS | All geometry, closure, bridge/tunnel, loop, jump, autopilot, shortcut, decor, and attraction checks passed |
| `npm run validate:course -- --course=sky-circuit` | PASS | All geometry, loop, jump, checkpoint, and autopilot checks passed |
| `npm run validate:fantasy` | PASS | Identical to `validate:course -- --course=fantasy-land` |

## Arena Key Metrics (Pre-Refactor)

### Arena 1: Sky Circuit (`sky-circuit`)
- **Mode**: Time Trial (`closed: false`, 1 lap, 1 racer)
- **Track Width**: 7 m
- **Track Length**: `1186.90 m`
- **Autopilot Total / Lap Time**: `26.23 s` (`railHit=0`, `falls=0`, `stuck=0`)
- **Attractions**: `0` (disabled for this arena)
- **Checkpoints / Boost Pads**: `9` checkpoints, `6` boost pads
- **Loops / Jumps**: `2` loops (`#6 r=12.5m`, `#25 r=10.5m`), `2` jumps (`#12 16m`, `#28 18m`)
- **Theme (`toyroom`, high/penuh headless build)**: `126` meshes, `13972` triangles, `194` instances, `3.50 MB` textures (8 textures)

### Arena 2: FantasyLand (`fantasy-land`)
- **Mode**: Race (`closed: true`, 3 laps, 4 racers)
- **Track Width**: 16 m (shortcut 8 m)
- **Track Length**: `2805.89 m` (min non-adjacent `47.53 m`, closure `posErr=0.0000 m`, `dYaw=-0.0153 deg`)
- **Autopilot Total Time (3 laps)**: `195.18 s` (Lap Avg: `65.06 s`; Lap 1: `65.82 s`, Lap 2: `64.68 s`, Lap 3: `64.68 s`, `railHit=0`, `falls=0`, `stuck=0`)
- **Shortcut Route (`shortcut`)**: `275.3 m` (main arc `459.2 m`), corridor `31.4 m`, 3-lap time `183.23 s` (saves `11.95 s` total / `3.98 s` per lap, `falls=0`)
- **AI Lap-Time Ratios vs Reference (`65.06 s`)**:
  - `mudah`: `73.02 s` (`1.122x` vs target `1.12x`, err `0.21%`, `aiHazardHits=0.40/car-lap`)
  - `sedang`: `68.83 s` (`1.058x` vs target `1.06x`, err `0.19%`, `aiHazardHits=0.27/car-lap`)
  - `sulit`: `63.85 s` (`0.981x` vs target `1.00x`, err `1.87%`, `aiHazardHits=0.00/car-lap`)
- **Attractions Count**:
  - Pendulums: `2`
  - Rolling Ball Groups: `2`
  - Wind Fans: `1`
  - Jelly Puddles: `1`
  - Boost Rings: `8` main + `3` shortcut (`11` total)
  - Min clearance from forbidden zones: `43.4 m`, min safe lane: `41.3%`
- **Decor (`fantasyland`)**: `129` objects, min lateral clearance `12.1 m`, min overhead `43.2 m`, rainbow `48.0 m`
- **Theme (`fantasyland`, high/penuh headless build)**: `60` meshes, `68302` triangles, `541` instances, `2.21 MB` textures (7 textures)
