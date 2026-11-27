# Laporan Keseimbangan Balapan (Dapur Raksasa)

- **Arena**: Dapur Raksasa (`kitchen`, 3 lap, 4 pembalap)
- **Simulasi**: N = 30 balapan per kesulitan dengan seed berbeda (total 90 balapan headless)
- **Pemain-Proksi (khusus tool)**: Pengemudi AI Sedang (`skillMultiplier = 0.892`) + jeda reaksi `0.2s` + derau kemudi acak terhalus
- **Lap Referensi**: `58.17 s`

## Ringkasan Hasil Simulasi

| Kesulitan | Peluang Menang Proksi | Target Menang | Selisih Finis Rata-rata (P1-P2 / P2-P3 / P3-P4) | Salip / Balapan | Kena Rintangan / Lap | Macet | Terguling / Balapan | Rasio Lap AI |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| **mudah** | 100.0% (PASS) | >= 70% | 7.04s / 1.52s / 1.60s | 1.10 | 0.46 | 0 | 0.87 | 1.130x (65.71s) |
| **sedang** | 50.0% (PASS) | 40–60% | 0.20s / 0.19s / 0.30s | 13.63 | 0.42 | 0 | 0.00 | 1.089x (63.35s) |
| **sulit** | 0.0% (PASS) | <= 25% | 1.26s / 1.02s / 10.18s | 2.77 | 0.28 | 0 | 0.27 | 1.013x (58.91s) |

## Perubahan Nilai Tuning di `src/config.ts` (`CONFIG.kitchenAi`)

| Parameter | Nilai Lama | Nilai Baru |
|---|---:|---:|
| `kitchenAi.difficulties.mudah.skillMultiplier` | `0.825` | `0.812` |
| `kitchenAi.difficulties.sedang.skillMultiplier` | `0.902` | `0.891` |
| `kitchenAi.difficulties.sulit.skillMultiplier` | `1.0` | `1.0` |
| `kitchenAi.rubberBand.maxBoost` | `0.025` | `0.036` |
| `kitchenAi.rubberBand.maxSlow` | `0.075` | `0.118` |
| `kitchenAi.rubberBand.rangeMeters` | `75` (global `CONFIG.ai.rubberBand`) | `38` |

Status target keseluruhan: **MEMENUHI SEMUA SASARAN**.
