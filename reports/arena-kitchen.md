# Arena Validation Report: Dapur Raksasa (`kitchen`)

- **Status**: PASS
- **Mode**: `race` | **Laps**: 3 | **Opponents**: 3
- **Theme**: `kitchen` | **Coming Soon**: false

| Check | Status | Details |
|---|---|---|
| Field Completeness | PASS | All 15 required fields present (28 segments) |
| Course & Attractions | PASS | len=2486.2m, autopilot=174.50s, pendulums=2, balls=2, wind=1, jelly=1, rings=7+3 |
| AI Smoke Test (1 Lap) | PASS | 0 stuck, 0 obstacle rollovers (mudah=66.9s, sedang=63.4s, sulit=60.2s) |
| Scenery Budgets | PASS | meshes=61/64, tris=29820/60000, inst=241/480, tex=1.31/2.40MB |
| Decor Clearance | PASS | 59 props cleared >= 3m (min=4.00m, trackStructures=6) |
| Music Assets | PASS | Uses default fallback tracks (no custom music overrides) |
| Unique Record Key | PASS | key='sky-racer-records-v1:kitchen' (unique across 3 arenas) |

## Scenery Stats by Quality Preset

| Preset | Meshes | Triangles | Instances | Est. Draw Calls | Texture MB |
|---|---|---|---|---|---|
| `hemat` | 59 | 25216 | 176 | 59 | 1.29 |
| `seimbang` | 61 | 28240 | 213 | 61 | 1.31 |
| `penuh` | 61 | 29820 | 241 | 61 | 1.31 |

## Attraction Stats & Counts

- **Counts**: pendulums=2, rollingBalls=2, windFans=1, jellyPuddles=1, boostRings=7 (main) + 3 (shortcut)

| Preset | Meshes | Triangles | Instances | Est. Draw Calls | Texture MB |
|---|---|---|---|---|---|
| `hemat` | 29 | 5292 | 23 | 26 | 0.42 |
| `seimbang` | 29 | 18172 | 60 | 29 | 0.42 |
| `penuh` | 29 | 18316 | 72 | 29 | 0.42 |
