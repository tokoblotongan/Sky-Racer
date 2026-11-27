// docs/SCHEMA.md — Sky Racer Internal Schemas & Audio Asset Mapping

# Skema Bus Kejadian Balapan (`src/core/raceEvents.ts`)

`createRaceEventBus()` dibuat dan di-dispose di dalam `bootstrap()` (`src/main.ts`) tanpa variabel global. Bus ini menjadi kontrak komunikasi terketik (`RaceEventMap`) antara alur balapan, UI/efek polish, dan pemutar musik pada tahap berikutnya.

## Daftar Kejadian

| Kejadian | Payload | Pemicu |
|---|---|---|
| `gameStateChanged` | `{ state: 'title' \| 'intro' \| 'countdown' \| 'racing' \| 'finished' \| 'podium', prevState, courseId }` | Setiap transisi fase alur game (Judul, Terbang Intro, Hitung Mundur, Balapan, Selesai/Orbits, Podium 3D). |
| `raceStart` | `{ courseId, totalLaps, totalRacers }` | Sesaat setelah sinyal `GO!` aktif dan fase masuk ke `racing`. |
| `lapChanged` | `{ lap, totalLaps, completedLap, lapTime, isBestLap }` | Pemain menyelesaikan satu lap valid dan masuk ke `lap` berikutnya pada sirkuit multi-lap. |
| `lastLapStarted` | `{ lap, totalLaps, courseId }` | Pemain memasuki lap terakhir (`completedLap === totalLaps - 1`). Dipakai UI untuk banner `"LAP TERAKHIR!"` dan musik lap akhir. |
| `playerFinished` | `{ position, totalRacers, time, medal, isNewBest }` | Pemain melintasi garis finis dan catatan waktu final direkam. |
| `resultWin` | `{ position, totalRacers, time, medal, courseId }` | Layar hasil/podium siap saat pemain menang (multi-pembalap: `position === 1`; tunggal: meraih medali `bronze`/`silver`/`gold`). |
| `resultLose` | `{ position, totalRacers, time, medal, courseId }` | Layar hasil/podium siap saat pemain kalah (multi-pembalap: `position > 1`; tunggal: `medal === 'none'`). |
| `hazardHit` | `{ carIndex, kind }` | Mobil mengenai atraksi bahaya (`pendulum`, `ball`, `jelly`). Untuk pemain (`carIndex === 0`) juga memicu guncangan kamera ringan. |
| `ringPass` | `{ carIndex, boostSeconds }` | Mobil melewati Cincin Boost dan menerima dorongan boost. |
| `boostStarted` | `{ carIndex, source: 'pad' \| 'ring' }` | Boost baru mulai aktif pada mobil (dari boost pad lintasan maupun cincin boost). |

---

# Pemetaan Aset Audio di `public/audio/`

Berkas musik berikut sudah tersedia di `public/audio/` dan **belum diputar di Tahap F7** (menunggu integrasi pemutar musik pada tahap berikutnya menggunakan langganan `raceEvents`):

| Berkas | Arena | Sinyal Bus Kejadian yang Disarankan |
|---|---|---|
| `public/audio/fantasyland-title.mp3` | `fantasy-land` | `gameStateChanged` saat `state === 'title'` |
| `public/audio/fantasyland-race.mp3` | `fantasy-land` | `gameStateChanged` saat `state === 'intro' \| 'countdown' \| 'racing'` (hingga sebelum lap terakhir) |
| `public/audio/fantasyland-lastlap.mp3` | `fantasy-land` | `lastLapStarted` (mempercepat tempo/intensitas di lap final) |
| `public/audio/fantasyland-win.mp3` | `fantasy-land` | `resultWin` (juara `P1` di podium) |
| `public/audio/fantasyland-lose.mp3` | `fantasy-land` | `resultLose` (finis `P2–P4` atau tidak juara) |
| `public/audio/skycircuit-race.mp3` | `sky-circuit` | `gameStateChanged` saat `courseId === 'sky-circuit'` (`intro` / `countdown` / `racing`) |
