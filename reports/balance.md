# Laporan Keseimbangan Balapan (Dapur Raksasa)

- **Arena**: Dapur Raksasa (`kitchen`, 3 lap, 4 pembalap)
- **Simulasi**: N = 30 balapan per kesulitan dengan seed berbeda (total 90 balapan headless)
- **Pemain-Proksi (khusus tool)**: Pengemudi AI Sedang (`skillMultiplier = 0.892`) + jeda reaksi `0.2s` + derau kemudi acak terhalus
- **Lap Referensi**: `58.17 s`

## Ringkasan Hasil Simulasi

| Kesulitan | Peluang Menang Proksi | Target Menang | Selisih Finis Rata-rata (P1-P2 / P2-P3 / P3-P4) | Salip / Balapan | Kena Rintangan / Lap | Macet | Terguling / Balapan | Rasio Lap AI |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| **mudah** | 100.0% (PASS) | >= 70% | 7.58s / 1.85s / 1.40s | 0.87 | 0.45 | 0 | 0.67 | 1.133x (65.90s) |
| **sedang** | 40.0% (PASS) | 40–60% | 0.54s / 0.31s / 0.37s | 12.77 | 0.42 | 0 | 0.17 | 1.091x (63.43s) |
| **sulit** | 0.0% (PASS) | <= 25% | 1.06s / 0.97s / 10.48s | 2.70 | 0.29 | 0 | 0.33 | 1.011x (58.80s) |

## Perubahan Nilai Tuning di `src/config.ts` (`CONFIG.ai`)

| Parameter | Nilai Lama | Nilai Baru |
|---|---|---|
| `ai.difficulties.mudah.skillMultiplier` | `0.82` | `0.82` |
| `ai.difficulties.sedang.skillMultiplier` | `0.92` | `0.892` |
| `ai.difficulties.sulit.skillMultiplier` | `1.0` | `1` |
| `ai.cruiseReferenceSpeed` | `43.5` | `44.6` |
| `ai.rubberBand.maxBoost` | `0.05` | `0.02` |
| `ai.rubberBand.maxSlow` | `0.06` | `0.115` |
| `ai.startReactionMaxSec` | `0.24` | `0.28` |
| `ai.rivals[0..2].skill` | `0.90 / 0.95 / 0.98` | `0.8 / 0.84 / 0.87` |

Status target keseluruhan: **BELUM MEMENUHI SEMUA SASARAN**.
