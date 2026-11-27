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

# Pemetaan Aset Audio & Musik (`src/audio/music/`)

Berkas musik di `public/audio/` terintegrasi penuh melalui `createMusicPlayer()` (dua `HTMLAudioElement` yang disambungkan ke Web Audio `GainNode` untuk crossfade dan hemat memori di perangkat mobile) dan `createMusicDirector()` (berlangganan `raceEvents`).

| Berkas | Arena | Sinyal & Perilaku Pemutaran |
|---|---|---|
| `public/audio/fantasyland-title.mp3` | Semua arena | `gameStateChanged` saat `state === 'title'` (loop). Saat `intro` & `countdown`, berlanjut pada volume 60% dengan ducking 15% saat hitung mundur. |
| `public/audio/fantasyland-race.mp3` | `fantasy-land` | `raceStart` (crossfade 1.2 dtk dari `title`, loop). Di-preload saat arena dipilih. |
| `public/audio/fantasyland-lastlap.mp3` | `fantasy-land` | `lastLapStarted` (crossfade 1.5 dtk dari awal trek, loop). Di-preload saat lap 2 dimulai. |
| `public/audio/fantasyland-win.mp3` | Semua arena | `playerFinished` untuk `P1–P3` pada `fantasy-land` dan semua finis `sky-circuit` (tanpa loop, fade-out di akhir). Di-preload saat lap terakhir. |
| `public/audio/fantasyland-lose.mp3` | `fantasy-land` | `playerFinished` untuk `P4` (tanpa loop). Di-preload saat lap terakhir. |
| `public/audio/skycircuit-race.mp3` | `sky-circuit` | `raceStart` (crossfade 1.2 dtk dari `title`, loop). Di-preload saat arena dipilih. |

- **Ducking**: Penurunan volume musik sementara sebesar 25% selama 400 ms pada kejadian pemain `hazardHit` dan `boostStarted`, serta 15% selama `countdown`.
- **Kontrol & Diagnostik**: Tombol `M` untuk mute total (`localStorage`), pengaturan `Musik: Nyala/Mati` dan slider `Volume Musik` (default `0.6`, tersimpan di `sky-racer-music-v1`), `?nomusic` untuk menonaktifkan musik, dan `?debug` untuk menampilkan trek aktif, volume, serta status pemutaran.

---

# Skema Arena Kit (`src/arenas/`, `src/themes/`)

- **Kontrak Arena (`ArenaDefinition`)**: Didefinisikan di `src/arenas/types.ts` dan dikumpulkan melalui `createDefaultArenaRegistry()` (`src/arenas/index.ts`, tanpa variabel global). Memuat `id`, `name`, `tagline`, `description`, `order`, `mode`, `laps`, `opponentCount`, pabrik `course`, `routes`, `zones`, `attractions`, `theme` (+ opsional `themeDefinition`), `background`, `lightingProfile`, `carVisualScale`, `music` (opsional, memakai trek bawaan `fantasyland-*` jika tidak ditimpa), `minimap`, `introCamera`, `capabilities`, `budgets`, dan opsional `comingSoon`.
- **Arena Terdaftar**: `sky-circuit` (order 1, 1 arah), `fantasy-land` (order 2, 3 lap, atraksi aktif), `kitchen` ("Dapur Raksasa", order 3, 3 lap, 4 pembalap, `src/arenas/kitchen/` — Tahap K1: definisi, lintasan, `Rute Pintas Rak Bumbu`, dan tema dasar meja dapur).
- **Kunci Rekor Unik**: Setiap arena menyimpan rekor lokal pada kunci terpisah `sky-racer-records-v1:<arenaId>` lewat `getRecordsStorageKey(arenaId)` di `src/services/records.ts`. Data lama tanpa akhiran arena dimigrasikan otomatis saat dibaca pertama kali.
- **Generator & Validator**: Gunakan `npm run new:arena -- <id> "<Nama>"` untuk membuat kerangka dari `src/arenas/_template/` dan `npm run validate:arenas` untuk validasi otomatis kelengkapan field, geometri/atraksi, uji AI 1 lap, anggaran scene, aset musik, dan keunikan kunci penyimpanan.

