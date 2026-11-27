# Arena Validation Report: FantasyLand (`fantasy-land`)

- **Status**: PASS
- **Mode**: `race` | **Laps**: 3 | **Opponents**: 3
- **Theme**: `fantasyland` | **Coming Soon**: false

| Check | Status | Details |
|---|---|---|
| Field Completeness | PASS | All 15 required fields present (32 segments) |
| Course & Attractions | PASS | len=2805.9m, autopilot=195.18s, pendulums=2, balls=2, wind=1, jelly=1, rings=8+3 |
| AI Smoke Test (1 Lap) | PASS | 0 stuck, 0 obstacle rollovers (mudah=74.1s, sedang=70.3s, sulit=65.1s) |
| Scenery Budgets | PASS | meshes=60/80, tris=68302/75000, inst=541/600, tex=2.21/3.00MB |
| Music Assets | PASS | 5 files <= 6MB [fantasyland-title.mp3 (2.08MB), fantasyland-race.mp3 (3.72MB), fantasyland-lastlap.mp3 (2.43MB), fantasyland-win.mp3 (0.18MB), fantasyland-lose.mp3 (0.21MB)] |
| Unique Record Key | PASS | key='sky-racer-records-v1:fantasy-land' (unique across 3 arenas) |

## Scenery Stats by Quality Preset

| Preset | Meshes | Triangles | Instances | Est. Draw Calls | Texture MB |
|---|---|---|---|---|---|
| `hemat` | 39 | 35000 | 303 | 39 | 1.96 |
| `seimbang` | 51 | 53380 | 427 | 51 | 2.21 |
| `penuh` | 60 | 68302 | 541 | 60 | 2.21 |

## Attraction Stats & Counts

- **Counts**: pendulums=2, rollingBalls=2, windFans=1, jellyPuddles=1, boostRings=8 (main) + 3 (shortcut)

| Preset | Meshes | Triangles | Instances | Est. Draw Calls | Texture MB |
|---|---|---|---|---|---|
| `hemat` | 29 | 6348 | 10 | 24 | 1.33 |
| `seimbang` | 29 | 6348 | 10 | 24 | 1.33 |
| `penuh` | 29 | 6348 | 10 | 24 | 1.33 |
