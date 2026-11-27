# Arena Validation Report: Dapur Raksasa (`kitchen`)

- **Status**: PASS
- **Mode**: `race` | **Laps**: 3 | **Opponents**: 3
- **Theme**: `kitchen` | **Coming Soon**: false

| Check | Status | Details |
|---|---|---|
| Field Completeness | PASS | All 15 required fields present (28 segments) |
| Course & Attractions | PASS | len=2486.2m, autopilot=174.50s, attractions=disabled |
| AI Smoke Test (1 Lap) | PASS | 0 stuck, 0 obstacle rollovers (mudah=66.7s, sedang=63.6s, sulit=59.3s) |
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
