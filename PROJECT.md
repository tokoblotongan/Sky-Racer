# PROJECT.md: Sky Racer

## 1. Ringkasan
Sky Racer adalah game balap mobil mainan stunt 3D yang orisinal. Mobil melaju di lintasan plastik oranye mengkilap yang melayang di ruangan berskala raksasa, dengan loop, lompatan, tikungan miring, dan boost pad.
- Stack: Three.js + TypeScript + Vite
- Fisika: arcade track-space buatan sendiri, tanpa physics engine
- Deploy: GitHub -> Vercel
- Opsional: Supabase (leaderboard)
- Semua nama, desain, dan aset harus orisinal. Dilarang memakai merek, logo, atau nama dagang apa pun.

## 2. STYLE LOCK (tidak boleh diubah tanpa persetujuan saya)
- Gaya: mainan die-cast yang dipoles. Bentuk membulat, plastik glossy, clearcoat, pantulan halus.
- Dilarang: primitif datar tanpa tekstur. Gunakan tekstur kanvas prosedural, gradasi, dan environment map.

| Peran | Warna |
|---|---|
| Lintasan | #FF6A00 (tepi lebih terang) |
| Pagar | #1E6BFF |
| Boost strip | #35D4FF (emissive) |
| Langit | #BFE3FF |
| Aksen | #FFD23F |
| Mobil | krem / merah / kuning, velg chrome |
| Properti ruangan | kayu hangat dan pastel kalem, kurang jenuh dibanding lintasan dan mobil |

- Cahaya: sinar matahari hangat dari jendela (DirectionalLight, bayangan lembut) + HemisphereLight, FogExp2 tipis.
- Render: ACES tone mapping, output sRGB, MeshPhysicalMaterial untuk mobil dan lintasan.
- Post-processing: bloom ringan, hanya untuk elemen emissive.
- Kamera: third-person chase, spring-damped, FOV melebar saat boost, miring (bank) di tikungan tajam.

## 3. Kontrak Gameplay dan Fisika
- Simulasi memakai fixed timestep (1/60 s, dt dibatasi maksimal 0.1 s).
- Fisika terpisah total dari rendering.
- State mobil: jarak di spline, offset lateral, tinggi dari permukaan, kecepatan, yaw relatif lintasan, flag airborne.
- Gravitasi mengikuti normal lintasan. Di bawah kecepatan minimum, mobil meluncur turun dari loop dengan aman.
- Lompatan: busur gravitasi, mendarat dengan pantulan kecil dan percikan.
- Boost: lonjakan kecepatan, FOV melebar, trail, nada mesin naik.
- Pagar: penalti kecepatan, percikan, terpental.
- Jatuh: reset otomatis ke checkpoint terakhir setelah 1,5 detik, plus tombol reset manual (R). Pemain tidak boleh pernah terjebak.
- Checkpoint berurutan dengan penanda aktif, split time, dan best time di localStorage.

## 4. UI, Audio, Kontrol
- HUD mengikuti palet (font bulat tebal, tanpa kotak default browser): speedometer, gauge boost, penghitung checkpoint, timer, popup airtime.
- State machine: TITLE -> COUNTDOWN -> RACING -> FINISH. Restart satu tombol harus mereset semua dengan bersih.
- Audio: Web Audio sintetis (mesin, boost, pendaratan, chime checkpoint), aktif setelah interaksi pertama pengguna.
- Kontrol: WASD/panah, Space (rem tangan), R (reset), plus kontrol sentuh untuk mobile.

## 5. Arsitektur File
```
index.html, package.json, tsconfig.json, vite.config.ts
src/
  main.ts            entry, fixed-step loop, orkestrasi state
  config.ts          SEMUA angka tuning: fisika, palet, parameter lintasan
  core/physics.ts    fisika mobil track-space
  core/course.ts     spline, segmen (lurus, bank, loop, lompatan), checkpoint, boost pad
  core/state.ts      state balapan, timer, skor, ID pickup sekali pakai
  render/scene.ts    renderer, kamera, cahaya, fog, environment
  render/track.ts    mesh lintasan dari spline, pagar, boost strip
  render/car.ts      mesh mobil, putaran roda, roll dan pitch bodi
  render/props.ts    properti ruangan raksasa, lantai, latar
  render/fx.ts       bloom, percikan, trail boost, speed lines
  audio/sound.ts     synthesizer Web Audio
  ui/hud.ts          HUD, title, hasil
  services/net.ts    Supabase leaderboard (stub dulu)
```

## 6. Aturan Kerja untuk Gemini
1. Satu file, satu tanggung jawab.
2. Tanpa variabel global. Modul berkomunikasi lewat export/import yang eksplisit.
3. Semua angka yang bisa di-tuning wajib ada di `src/config.ts`.
4. Setiap file diberikan terpisah dan utuh, diawali komentar path (contoh: `// src/core/physics.ts`).
5. Kerjakan HANYA tahap yang saya minta. Berhenti setelah selesai dan jangan menambah fitur dari tahap lain.
6. Saat saya minta perbaikan, tampilkan HANYA file yang berubah, utuh, dengan alasan satu kalimat per file.
7. Jangan menulis ulang file yang tidak berubah.
8. Selalu akhiri dengan: perintah yang perlu dijalankan dan checklist singkat apa yang harus terlihat di layar.
9. Jika ada keputusan desain yang ambigu, tanyakan dulu, jangan menebak.

## 7. Pelacak Tahap
- [ ] 1. Fondasi: Vite, TS, config, scene, cahaya, loop
- [ ] 2. Lintasan spline (lurus + tikungan) + pagar
- [ ] 3. Mobil + fisika track-space + kontrol keyboard
- [ ] 4. Kamera pengikut + HUD dasar
- [ ] 5. Segmen loop, banking, lompatan
- [ ] 6. Boost pad, checkpoint, reset, state machine
- [ ] 7. Props ruangan + efek visual
- [ ] 8. Audio Web Audio
- [ ] 9. Kontrol sentuh mobile
- [ ] 10. Lintasan penuh + hasil + best time
- [ ] 11. Deploy GitHub + Vercel
- [ ] 12. Leaderboard Supabase (opsional)

## ARENA: FantasyLand (pilihan arena baru, 4 pemain: 1 manusia + 3 AI)
- Sirkuit tertutup, 3 lap, lebar lintasan 16 m (4 jalur), data di src/courses/fantasyLand.ts.
- Tema dunia fantasi orisinal (tanpa meniru taman hiburan, karakter, atau merek yang ada). Warna tajam dan cerah.
- Fisika multi-mobil: senggolan, tabrakan, terguling (tahap F4).
- Sky Circuit tetap tersedia sebagai arena satu arah.
Pelacak: [x] F1A  [x] F1B  [x] F2 sebagian (F2A)  [x] F3  [ ] F4  [ ] F5  [ ] F6  [ ] F7
