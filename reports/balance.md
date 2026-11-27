# Laporan Keseimbangan Balapan (Stage F7)

- **Arena**: FantasyLand (3 lap, 4 pembalap)
- **Simulasi**: N = 30 balapan per kesulitan dengan seed berbeda (total 90 balapan headless)
- **Pemain-Proksi (khusus tool)**: Pengemudi AI Sedang (`skillMultiplier = 0.892`) + jeda reaksi `0.2s` + derau kemudi acak terhalus
- **Lap Referensi**: `65.06 s`

## Ringkasan Hasil Simulasi

| Kesulitan | Peluang Menang Proksi | Target Menang | Selisih Finis Rata-rata (P1-P2 / P2-P3 / P3-P4) | Salip / Balapan | Kena Rintangan / Lap | Macet | Terguling / Balapan | Rasio Lap AI |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| **mudah** | 100.0% (PASS) | >= 70% | 10.07s / 3.31s / 4.14s | 1.10 | 0.38 | 0 | 0.27 | 1.127x (73.29s) |
| **sedang** | 40.0% (PASS) | 40–60% | 1.31s / 1.15s / 1.16s | 13.43 | 0.14 | 0 | 0.60 | 1.089x (70.82s) |
| **sulit** | 0.0% (PASS) | <= 25% | 3.05s / 2.89s / 12.88s | 4.03 | 0.03 | 0 | 0.20 | 0.986x (64.15s) |

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

Status target keseluruhan: **MEMENUHI SEMUA SASARAN**.
