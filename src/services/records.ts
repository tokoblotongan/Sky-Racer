// src/services/records.ts

import { CONFIG } from '../config';
import type { CourseMedals } from '../courses/types';

export type MedalType = 'gold' | 'silver' | 'bronze' | 'none';

export interface RaceStats {
  topSpeedKmh: number;
  totalAirtime: number;
  longestAirtime: number;
  boostCount: number;
  railHits: number;
  resets: number;
  falls: number;
  checkpointsHit: number;
}

export interface RunSubmission {
  time: number;
  splits: number[];
  lapTimes?: number[];
  bestLap?: number | null;
  date?: string;
  medal: MedalType;
  stats: RaceStats;
}

export interface BestRunEntry {
  time: number;
  splits: number[];
  lapTimes?: number[];
  date: string;
  medal: MedalType;
  stats: RaceStats | null;
}

export interface TopRunEntry {
  time: number;
  date: string;
  medal: MedalType;
  stats: RaceStats | null;
}

export interface CourseRecords {
  v: 1;
  courseId: string;
  best: BestRunEntry | null;
  top: TopRunEntry[];
  bestSplits: number[];
  bestLap?: number | null;
}

export interface SubmitRunResult {
  isNewBest: boolean;
  rank: number | null;
  deltaToBest: number | null;
  isNewSplitBest: boolean[];
  records: CourseRecords;
}

export interface SummaryCourseInfo {
  id: string;
  name: string;
  medals: CourseMedals;
}

export interface SummaryRunInfo {
  time: number;
  medal: MedalType;
  isNewBest: boolean;
  deltaToBest: number | null;
  rank: number | null;
  splits: number[];
  lapTimes?: number[];
  bestLap?: number | null;
  stats: RaceStats;
}

interface LegacyStage6Record {
  bestTime?: unknown;
  bestSplits?: unknown;
}

const VALID_MEDALS = new Set<MedalType>(['gold', 'silver', 'bronze', 'none']);
const memoryStore = new Map<string, string>();

function isPositiveFinite(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val) && val > 0;
}

function isNonNegativeFinite(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val) && val >= 0;
}

function sanitizeMedal(val: unknown): MedalType {
  return typeof val === 'string' && VALID_MEDALS.has(val as MedalType)
    ? (val as MedalType)
    : 'none';
}

function sanitizeSplits(raw: unknown): number[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    const v = raw[i];
    if (!isNonNegativeFinite(v)) {
      return [];
    }
    out.push(v);
  }
  return out;
}

function sanitizeStats(raw: unknown): RaceStats | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  if (
    !isNonNegativeFinite(obj.topSpeedKmh) ||
    !isNonNegativeFinite(obj.totalAirtime) ||
    !isNonNegativeFinite(obj.longestAirtime) ||
    !isNonNegativeFinite(obj.boostCount) ||
    !isNonNegativeFinite(obj.railHits) ||
    !isNonNegativeFinite(obj.resets) ||
    !isNonNegativeFinite(obj.falls) ||
    !isNonNegativeFinite(obj.checkpointsHit)
  ) {
    return null;
  }
  return {
    topSpeedKmh: obj.topSpeedKmh,
    totalAirtime: obj.totalAirtime,
    longestAirtime: obj.longestAirtime,
    boostCount: Math.round(obj.boostCount),
    railHits: Math.round(obj.railHits),
    resets: Math.round(obj.resets),
    falls: Math.round(obj.falls),
    checkpointsHit: Math.round(obj.checkpointsHit),
  };
}

function createEmptyRecords(courseId: string): CourseRecords {
  return {
    v: 1,
    courseId,
    best: null,
    top: [],
    bestSplits: [],
    bestLap: null,
  };
}

function sanitizeRecords(raw: unknown, courseId: string): CourseRecords | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  if (obj.v !== 1 || (typeof obj.courseId === 'string' && obj.courseId !== courseId)) {
    return null;
  }

  let best: BestRunEntry | null = null;
  if (obj.best !== null && obj.best !== undefined) {
    if (typeof obj.best !== 'object') {
      return null;
    }
    const b = obj.best as Record<string, unknown>;
    if (!isPositiveFinite(b.time)) {
      return null;
    }
    const bestLapTimes = sanitizeSplits(b.lapTimes);
    best = {
      time: b.time,
      splits: sanitizeSplits(b.splits),
      ...(bestLapTimes.length > 0 ? { lapTimes: bestLapTimes } : {}),
      date: typeof b.date === 'string' ? b.date : new Date().toISOString(),
      medal: sanitizeMedal(b.medal),
      stats: sanitizeStats(b.stats),
    };
  }

  const maxTop = CONFIG.storage.topRecordsCount;
  const top: TopRunEntry[] = [];
  if (Array.isArray(obj.top)) {
    for (const entryRaw of obj.top) {
      if (!entryRaw || typeof entryRaw !== 'object') {
        continue;
      }
      const e = entryRaw as Record<string, unknown>;
      if (!isPositiveFinite(e.time)) {
        continue;
      }
      top.push({
        time: e.time,
        date: typeof e.date === 'string' ? e.date : new Date().toISOString(),
        medal: sanitizeMedal(e.medal),
        stats: sanitizeStats(e.stats),
      });
    }
    top.sort((a, b) => a.time - b.time);
    if (top.length > maxTop) {
      top.length = maxTop;
    }
  }

  const bestSplits = sanitizeSplits(obj.bestSplits);
  const bestLap = isPositiveFinite(obj.bestLap) ? obj.bestLap : null;

  if (best === null && top.length > 0) {
    best = {
      time: top[0].time,
      splits: [...bestSplits],
      date: top[0].date,
      medal: top[0].medal,
      stats: top[0].stats,
    };
  }

  return {
    v: 1,
    courseId,
    best,
    top,
    bestSplits,
    bestLap,
  };
}

const LEGACY_DEFAULT_COURSE_ID = 'sky-circuit';

function getStorageKey(courseId: string): string {
  return courseId === LEGACY_DEFAULT_COURSE_ID
    ? CONFIG.storage.recordsKey
    : `${CONFIG.storage.recordsKey}:${courseId}`;
}

function readStorageItem(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch {
    // Fallback to session memory store
  }
  return memoryStore.get(key) ?? null;
}

function writeStorageItem(key: string, value: string): void {
  memoryStore.set(key, value);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Session memory fallback already holds latest state
  }
}

function removeStorageItem(key: string): void {
  memoryStore.delete(key);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage removal failures
  }
}

export function determineMedal(timeSeconds: number, medals: CourseMedals): MedalType {
  if (!Number.isFinite(timeSeconds) || timeSeconds <= 0) {
    return 'none';
  }
  if (timeSeconds <= medals.gold) {
    return 'gold';
  }
  if (timeSeconds <= medals.silver) {
    return 'silver';
  }
  if (timeSeconds <= medals.bronze) {
    return 'bronze';
  }
  return 'none';
}

export function formatMedalLabel(medal: MedalType): string {
  switch (medal) {
    case 'gold':
      return 'Emas';
    case 'silver':
      return 'Perak';
    case 'bronze':
      return 'Perunggu';
    default:
      return 'Tanpa Medali';
  }
}

function saveRecords(courseId: string, records: CourseRecords): void {
  writeStorageItem(getStorageKey(courseId), JSON.stringify(records));
}

function migrateLegacyStage6IfNeeded(
  courseId: string,
  medals?: CourseMedals,
): CourseRecords | null {
  if (courseId !== LEGACY_DEFAULT_COURSE_ID) {
    return null;
  }

  const migratedFlag = readStorageItem(CONFIG.storage.migratedKey);
  if (migratedFlag === '1') {
    return null;
  }

  let migratedRecord: CourseRecords | null = null;
  const legacyRaw = readStorageItem(CONFIG.storage.key);
  if (legacyRaw) {
    try {
      const parsed = JSON.parse(legacyRaw) as LegacyStage6Record;
      if (parsed && isPositiveFinite(parsed.bestTime)) {
        const legacySplits = sanitizeSplits(parsed.bestSplits);
        const nowIso = new Date().toISOString();
        const medal = medals ? determineMedal(parsed.bestTime, medals) : 'none';
        migratedRecord = {
          v: 1,
          courseId,
          best: {
            time: parsed.bestTime,
            splits: [...legacySplits],
            date: nowIso,
            medal,
            stats: null,
          },
          top: [
            {
              time: parsed.bestTime,
              date: nowIso,
              medal,
              stats: null,
            },
          ],
          bestSplits: [...legacySplits],
        };
      }
    } catch {
      migratedRecord = null;
    }
  }

  writeStorageItem(CONFIG.storage.migratedKey, '1');
  if (migratedRecord) {
    saveRecords(courseId, migratedRecord);
  }
  return migratedRecord;
}

export function getRecords(courseId: string, medals?: CourseMedals): CourseRecords {
  const key = getStorageKey(courseId);
  const raw = readStorageItem(key);

  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      const sanitized = sanitizeRecords(parsed, courseId);
      if (sanitized) {
        if (medals && sanitized.best && sanitized.best.medal === 'none') {
          const derived = determineMedal(sanitized.best.time, medals);
          if (derived !== 'none') {
            sanitized.best.medal = derived;
            if (sanitized.top.length > 0 && sanitized.top[0].time === sanitized.best.time) {
              sanitized.top[0].medal = derived;
            }
            saveRecords(courseId, sanitized);
          }
        }
        // Mark migration done if v1 records already exist
        if (courseId === LEGACY_DEFAULT_COURSE_ID && readStorageItem(CONFIG.storage.migratedKey) !== '1') {
          migrateLegacyStage6IfNeeded(courseId, medals);
          // Re-read only if v1 record didn't exist; existing v1 takes priority
        }
        return sanitized;
      }
    } catch {
      // Corrupt JSON -> rebuild cleanly below
    }

    const fresh = createEmptyRecords(courseId);
    saveRecords(courseId, fresh);
    return fresh;
  }

  const migrated = migrateLegacyStage6IfNeeded(courseId, medals);
  if (migrated) {
    return migrated;
  }

  return createEmptyRecords(courseId);
}

export function submitRun(courseId: string, run: RunSubmission): SubmitRunResult {
  const records = getRecords(courseId);
  const runDate = run.date ?? new Date().toISOString();
  const cleanSplits = run.splits.map((s) => (Number.isFinite(s) && s >= 0 ? s : run.time));
  const cleanStats: RaceStats = {
    topSpeedKmh: Math.max(0, run.stats.topSpeedKmh),
    totalAirtime: Math.max(0, run.stats.totalAirtime),
    longestAirtime: Math.max(0, run.stats.longestAirtime),
    boostCount: Math.max(0, Math.round(run.stats.boostCount)),
    railHits: Math.max(0, Math.round(run.stats.railHits)),
    resets: Math.max(0, Math.round(run.stats.resets)),
    falls: Math.max(0, Math.round(run.stats.falls)),
    checkpointsHit: Math.max(0, Math.round(run.stats.checkpointsHit)),
  };

  const prevBestTime = records.best ? records.best.time : null;
  const deltaToBest = prevBestTime !== null ? run.time - prevBestTime : null;
  const isNewBest = prevBestTime === null || run.time < prevBestTime;

  if (isNewBest) {
    const cleanLapTimes = (run.lapTimes ?? []).filter((lt) => isPositiveFinite(lt));
    records.best = {
      time: run.time,
      splits: [...cleanSplits],
      ...(cleanLapTimes.length > 0 ? { lapTimes: cleanLapTimes } : {}),
      date: runDate,
      medal: run.medal,
      stats: cleanStats,
    };
  }

  const candidateLaps = [...(run.lapTimes ?? []), ...(run.bestLap ? [run.bestLap] : [])].filter(
    (lt) => isPositiveFinite(lt),
  );
  if (candidateLaps.length > 0) {
    const runBestLap = Math.min(...candidateLaps);
    if (!isPositiveFinite(records.bestLap) || runBestLap < records.bestLap) {
      records.bestLap = runBestLap;
    }
  }

  const newTopEntry: TopRunEntry = {
    time: run.time,
    date: runDate,
    medal: run.medal,
    stats: cleanStats,
  };
  records.top.push(newTopEntry);
  records.top.sort((a, b) => a.time - b.time);
  const maxTop = CONFIG.storage.topRecordsCount;
  if (records.top.length > maxTop) {
    records.top.length = maxTop;
  }
  const idx = records.top.indexOf(newTopEntry);
  const rank = idx >= 0 ? idx + 1 : null;

  const isNewSplitBest: boolean[] = [];
  const nextBestSplits: number[] = [];
  for (let i = 0; i < cleanSplits.length; i++) {
    const cur = cleanSplits[i];
    const prev = i < records.bestSplits.length ? records.bestSplits[i] : undefined;
    if (prev === undefined || !Number.isFinite(prev) || cur < prev) {
      isNewSplitBest.push(true);
      nextBestSplits.push(cur);
    } else {
      isNewSplitBest.push(false);
      nextBestSplits.push(prev);
    }
  }
  records.bestSplits = nextBestSplits;

  saveRecords(courseId, records);

  return {
    isNewBest,
    rank,
    deltaToBest,
    isNewSplitBest,
    records,
  };
}

export function clearRecords(courseId: string): CourseRecords {
  const fresh = createEmptyRecords(courseId);
  if (courseId === LEGACY_DEFAULT_COURSE_ID) {
    writeStorageItem(CONFIG.storage.migratedKey, '1');
    removeStorageItem(CONFIG.storage.key);
  }
  saveRecords(courseId, fresh);
  return fresh;
}

function formatSummaryTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const cs = Math.floor((safe * 100) % 100);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export function exportSummaryText(run: SummaryRunInfo, course: SummaryCourseInfo): string {
  const lines: string[] = [];
  lines.push(`SKY RACER — ${course.name}`);
  lines.push(`Waktu Akhir: ${formatSummaryTime(run.time)}${run.isNewBest ? ' (REKOR BARU!)' : ''}`);
  lines.push(`Medali: ${formatMedalLabel(run.medal)}`);
  if (run.lapTimes && run.lapTimes.length > 1) {
    const lapStr = run.lapTimes.map((t, i) => `Lap ${i + 1}: ${formatSummaryTime(t)}`).join(' | ');
    lines.push(`Lap: ${lapStr}`);
    if (run.bestLap && isPositiveFinite(run.bestLap)) {
      lines.push(`Best Lap: ${formatSummaryTime(run.bestLap)}`);
    }
  }
  if (run.deltaToBest !== null) {
    const sign = run.deltaToBest > 0 ? '+' : '-';
    lines.push(`Selisih dari Rekor Sebelumnya: ${sign}${Math.abs(run.deltaToBest).toFixed(2)} dtk`);
  }
  if (run.rank !== null) {
    lines.push(`Peringkat Top ${CONFIG.storage.topRecordsCount}: #${run.rank}`);
  }
  lines.push(
    `Statistik: Top Speed ${Math.round(run.stats.topSpeedKmh)} km/h | Udara ${run.stats.totalAirtime.toFixed(2)}s (maks ${run.stats.longestAirtime.toFixed(2)}s) | Boost ${run.stats.boostCount} | Pagar ${run.stats.railHits} | Reset ${run.stats.resets} | Jatuh ${run.stats.falls}`,
  );
  if (run.splits.length > 0) {
    const splitStr = run.splits.map((s, i) => `CP${i + 1}: ${s.toFixed(2)}s`).join(', ');
    lines.push(`Split: ${splitStr}`);
  }
  return lines.join('\n');
}
