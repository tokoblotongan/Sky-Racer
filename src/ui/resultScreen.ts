// src/ui/resultScreen.ts

import { CONFIG, type AiDifficulty } from '../config';
import type { FinishResultData } from '../core/state';
import {
  formatMedalLabel,
  type CourseRecords,
  type MedalType,
} from '../services/records';

export interface ResultScreenDomRefs {
  finishScreenEl: HTMLElement;
  finishCardEl: HTMLElement;
  finishCourseNameEl: HTMLElement;
  finishPosBannerEl: HTMLElement;
  finishBadgeEl: HTMLElement;
  finishMedalIconEl: HTMLElement;
  finishMedalLabelEl: HTMLElement;
  finishTimeEl: HTMLElement;
  finishDeltaEl: HTMLElement;
  finishStatsGridEl: HTMLElement;
  finishStandingsBoxEl: HTMLElement;
  finishStandingsEl: HTMLElement;
  finishDiffRowEl: HTMLElement;
  finishDiffBtns: Record<AiDifficulty, HTMLButtonElement>;
  finishLapsBoxEl: HTMLElement;
  finishLapsEl: HTMLElement;
  finishSplitsEl: HTMLElement;
  finishTopListEl: HTMLElement;
  finishCopyBtnEl: HTMLButtonElement;
}

export interface ResultScreenData {
  courseName: string;
  finish: FinishResultData;
  records: CourseRecords;
  aiDifficulty?: AiDifficulty;
  podiumActive?: boolean;
}

export function formatResultRaceTime(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = Math.floor(safe % 60);
  const centis = Math.floor((safe * 100) % 100);

  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  const cc = String(centis).padStart(2, '0');
  return `${mm}:${ss}.${cc}`;
}

function formatSplitSeconds(seconds: number): string {
  return `${Math.max(0, seconds).toFixed(2)} s`;
}

function formatDelta(delta: number): string {
  const sign = delta > 0 ? '+' : '-';
  return `${sign}${Math.abs(delta).toFixed(2)} s`;
}

function createMedalBadgeSvg(medal: MedalType): string {
  let fillMain = '#475569';
  let fillShade = '#334155';
  let strokeColor = '#94A3B8';
  let starColor = '#CBD5E1';
  let ribbonLeft = '#334155';
  let ribbonRight = '#475569';

  if (medal === 'gold') {
    fillMain = '#FFD23F';
    fillShade = '#E59500';
    strokeColor = '#FFFDF7';
    starColor = '#FFFDF7';
    ribbonLeft = '#1E6BFF';
    ribbonRight = '#35D4FF';
  } else if (medal === 'silver') {
    fillMain = '#E2E8F0';
    fillShade = '#94A3B8';
    strokeColor = '#FFFDF7';
    starColor = '#FFFDF7';
    ribbonLeft = '#1E6BFF';
    ribbonRight = '#64748B';
  } else if (medal === 'bronze') {
    fillMain = '#F4A261';
    fillShade = '#B45309';
    strokeColor = '#FFE8CC';
    starColor = '#FFFDF7';
    ribbonLeft = '#9A3412';
    ribbonRight = '#EA580C';
  }

  return `
    <svg class="sr-medal-svg" viewBox="0 0 64 64" aria-hidden="true">
      <polygon points="18,4 28,4 32,22 22,22" fill="${ribbonLeft}" />
      <polygon points="46,4 36,4 32,22 42,22" fill="${ribbonRight}" />
      <circle cx="32" cy="38" r="20" fill="${fillShade}" stroke="${strokeColor}" stroke-width="2.6" />
      <circle cx="32" cy="36" r="16" fill="${fillMain}" />
      <polygon
        points="32,24 35.4,31.2 43.3,32.2 37.5,37.7 39,45.5 32,41.6 25,45.5 26.5,37.7 20.7,32.2 28.6,31.2"
        fill="${starColor}"
      />
    </svg>
  `;
}

export function renderResultTopRecordsList(
  containerEl: HTMLElement,
  records: CourseRecords,
  highlightRank: number | null,
): void {
  containerEl.textContent = '';
  if (records.top.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'sr-top-empty';
    empty.textContent = 'Belum ada catatan waktu';
    containerEl.appendChild(empty);
    return;
  }

  for (let i = 0; i < records.top.length; i++) {
    const entry = records.top[i];
    const rankNum = i + 1;
    const isHighlighted = highlightRank !== null && rankNum === highlightRank;

    const row = document.createElement('div');
    row.className = isHighlighted ? 'sr-top-row sr-top-row--highlight' : 'sr-top-row';

    const rankEl = document.createElement('span');
    rankEl.className = 'sr-top-rank';
    rankEl.textContent = `#${rankNum}`;
    row.appendChild(rankEl);

    const timeEl = document.createElement('span');
    timeEl.textContent = formatResultRaceTime(entry.time);
    row.appendChild(timeEl);

    const medalEl = document.createElement('span');
    medalEl.className = 'sr-top-medal-tag';
    medalEl.textContent = isHighlighted
      ? `${formatMedalLabel(entry.medal)} • BARU`
      : formatMedalLabel(entry.medal);
    row.appendChild(medalEl);

    containerEl.appendChild(row);
  }
}

export function syncResultDifficultyUi(
  refs: Pick<ResultScreenDomRefs, 'finishDiffBtns'>,
  difficulty: AiDifficulty,
): void {
  const keys: AiDifficulty[] = ['mudah', 'sedang', 'sulit'];
  for (const dk of keys) {
    refs.finishDiffBtns[dk].classList.toggle('sr-preset-btn--active', dk === difficulty);
  }
}

export function showResultScreen(
  refs: ResultScreenDomRefs,
  data: ResultScreenData,
): void {
  const { finish, records, courseName } = data;

  refs.finishCourseNameEl.textContent = courseName;
  refs.finishBadgeEl.classList.toggle('sr-hud-hidden', !finish.isNewBest);

  const isMultiRacer =
    (finish.totalRacers ?? 1) > 1 && typeof finish.playerPosition === 'number';
  const usePodiumLayout = isMultiRacer && (data.podiumActive ?? true);

  refs.finishScreenEl.classList.toggle('sr-finish-screen--podium', usePodiumLayout);
  refs.finishCardEl.classList.toggle('sr-finish-card--podium', usePodiumLayout);

  refs.finishPosBannerEl.classList.toggle('sr-hud-hidden', !isMultiRacer);
  if (isMultiRacer && finish.playerPosition) {
    const pos = finish.playerPosition;
    refs.finishPosBannerEl.textContent =
      pos === 1 ? 'JUARA P1!' : pos <= 3 ? `PODIUM P${pos}` : `POSISI P${pos}`;
    refs.finishPosBannerEl.classList.toggle('sr-finish-pos-banner--win', pos === 1);
  }

  refs.finishDiffRowEl.classList.toggle('sr-hud-hidden', !isMultiRacer);
  if (isMultiRacer) {
    syncResultDifficultyUi(refs, data.aiDifficulty ?? CONFIG.ai.defaultDifficulty);
  }

  refs.finishMedalIconEl.innerHTML = createMedalBadgeSvg(finish.medal);
  refs.finishMedalLabelEl.textContent = formatMedalLabel(finish.medal);
  refs.finishTimeEl.textContent = formatResultRaceTime(finish.time);
  refs.finishCopyBtnEl.textContent = 'Salin hasil';

  refs.finishDeltaEl.className = 'sr-finish-delta';
  if (finish.deltaToBest === null) {
    refs.finishDeltaEl.classList.add('sr-split-delta-neutral');
    refs.finishDeltaEl.textContent = 'Catatan Waktu Pertama';
  } else if (finish.deltaToBest <= 0) {
    refs.finishDeltaEl.classList.add('sr-split-delta-fast');
    refs.finishDeltaEl.textContent = `${formatDelta(finish.deltaToBest)} lebih cepat`;
  } else {
    refs.finishDeltaEl.classList.add('sr-split-delta-slow');
    refs.finishDeltaEl.textContent = `${formatDelta(finish.deltaToBest)} dari rekor`;
  }

  const stats = finish.stats;
  const statItems: Array<{ label: string; value: string }> = [
    ...(isMultiRacer
      ? [{ label: 'Posisi Akhir', value: `P${finish.playerPosition} / ${finish.totalRacers}` }]
      : []),
    { label: 'Top Speed', value: `${Math.round(stats.topSpeedKmh)} km/h` },
    { label: 'Total Udara', value: `${stats.totalAirtime.toFixed(2)} s` },
    { label: 'Lompatan Terlama', value: `${stats.longestAirtime.toFixed(2)} s` },
    { label: 'Boost', value: String(stats.boostCount) },
    { label: 'Bentur Pagar', value: String(stats.railHits) },
    { label: 'Reset', value: String(stats.resets) },
    { label: 'Jatuh', value: String(stats.falls) },
  ];
  refs.finishStatsGridEl.textContent = '';
  for (const item of statItems) {
    const tile = document.createElement('div');
    tile.className = 'sr-stat-tile';
    const labelEl = document.createElement('span');
    labelEl.className = 'sr-stat-label';
    labelEl.textContent = item.label;
    const valEl = document.createElement('span');
    valEl.className = 'sr-stat-value';
    valEl.textContent = item.value;
    tile.appendChild(labelEl);
    tile.appendChild(valEl);
    refs.finishStatsGridEl.appendChild(tile);
  }

  const classification = finish.classification ?? [];
  const showStandingsBox = isMultiRacer && classification.length > 1;
  refs.finishStandingsBoxEl.classList.toggle('sr-hud-hidden', !showStandingsBox);
  refs.finishStandingsEl.textContent = '';
  if (showStandingsBox) {
    for (const rowItem of classification) {
      const row = document.createElement('div');
      row.className = rowItem.isPlayer
        ? 'sr-finish-standing-row sr-finish-standing-row--player'
        : 'sr-finish-standing-row';

      const rankEl = document.createElement('span');
      rankEl.className = 'sr-finish-standing-rank';
      rankEl.textContent = `P${rowItem.rank}`;
      row.appendChild(rankEl);

      const nameWrap = document.createElement('span');
      nameWrap.className = 'sr-finish-standing-name';
      const dot = document.createElement('span');
      dot.className = 'sr-racer-dot';
      dot.style.backgroundColor = rowItem.color;
      nameWrap.appendChild(dot);
      const nameText = document.createElement('span');
      nameText.textContent = rowItem.name;
      nameWrap.appendChild(nameText);
      row.appendChild(nameWrap);

      const totalEl = document.createElement('span');
      totalEl.className = 'sr-finish-standing-time';
      totalEl.textContent =
        rowItem.dnf || rowItem.totalTime === null
          ? 'DNF'
          : formatResultRaceTime(rowItem.totalTime);
      row.appendChild(totalEl);

      const bestLapEl = document.createElement('span');
      bestLapEl.className = 'sr-finish-standing-bl';
      bestLapEl.textContent =
        rowItem.bestLap !== null && Number.isFinite(rowItem.bestLap)
          ? `BL ${formatResultRaceTime(rowItem.bestLap)}`
          : '--';
      row.appendChild(bestLapEl);

      refs.finishStandingsEl.appendChild(row);
    }
  }

  const hasMultipleLaps = finish.lapTimes.length > 1;
  refs.finishLapsBoxEl.classList.toggle('sr-hud-hidden', !hasMultipleLaps);
  refs.finishLapsEl.textContent = '';
  if (hasMultipleLaps) {
    const runMinLap = Math.min(...finish.lapTimes);
    for (let i = 0; i < finish.lapTimes.length; i++) {
      const lapVal = finish.lapTimes[i];
      const isRunBest = Math.abs(lapVal - runMinLap) <= 1e-4;
      const isRecordBest = finish.bestLap !== null && lapVal <= finish.bestLap + 1e-4;

      const row = document.createElement('div');
      row.className = isRunBest ? 'sr-finish-lap-row sr-finish-lap-row--best' : 'sr-finish-lap-row';

      const labelEl = document.createElement('span');
      labelEl.className = 'sr-finish-lap-label';
      labelEl.textContent = `Lap ${i + 1}`;
      row.appendChild(labelEl);

      const valEl = document.createElement('span');
      valEl.className = 'sr-finish-lap-val';
      valEl.textContent = formatResultRaceTime(lapVal);
      row.appendChild(valEl);

      if (isRecordBest || isRunBest) {
        const tagEl = document.createElement('span');
        tagEl.className = 'sr-finish-split-best-tag';
        tagEl.textContent = isRecordBest ? 'TERBAIK' : 'TERCEPAT';
        row.appendChild(tagEl);
      }

      refs.finishLapsEl.appendChild(row);
    }
  }

  const cpPerLap =
    hasMultipleLaps && finish.splits.length % finish.lapTimes.length === 0
      ? finish.splits.length / finish.lapTimes.length
      : 0;
  refs.finishSplitsEl.textContent = '';
  for (let i = 0; i < finish.splits.length; i++) {
    const splitVal = finish.splits[i];
    const delta = i < finish.splitDeltas.length ? finish.splitDeltas[i] : null;
    const isSplitBest = i < finish.isNewSplitBest.length ? finish.isNewSplitBest[i] : false;

    const row = document.createElement('div');
    row.className = 'sr-finish-split-row';

    const labelEl = document.createElement('span');
    labelEl.className = 'sr-finish-split-label';
    if (cpPerLap > 0) {
      const lapNum = Math.floor(i / cpPerLap) + 1;
      const cpNum = (i % cpPerLap) + 1;
      labelEl.textContent = `L${lapNum}·CP${cpNum}`;
    } else {
      labelEl.textContent = `CP ${i + 1}`;
    }
    row.appendChild(labelEl);

    const valEl = document.createElement('span');
    valEl.className = 'sr-finish-split-val';
    valEl.textContent = formatSplitSeconds(splitVal);
    row.appendChild(valEl);

    const deltaEl = document.createElement('span');
    if (delta === null) {
      deltaEl.className = 'sr-finish-split-delta sr-split-delta-neutral';
      deltaEl.textContent = '--';
    } else if (delta <= 0) {
      deltaEl.className = 'sr-finish-split-delta sr-split-delta-fast';
      deltaEl.textContent = formatDelta(delta);
    } else {
      deltaEl.className = 'sr-finish-split-delta sr-split-delta-slow';
      deltaEl.textContent = formatDelta(delta);
    }
    row.appendChild(deltaEl);

    if (isSplitBest) {
      const bestTag = document.createElement('span');
      bestTag.className = 'sr-finish-split-best-tag';
      bestTag.textContent = 'TERBAIK';
      row.appendChild(bestTag);
    }

    refs.finishSplitsEl.appendChild(row);
  }

  renderResultTopRecordsList(refs.finishTopListEl, records, finish.rank);

  refs.finishCardEl.classList.remove('sr-finish-enter');
  void refs.finishCardEl.offsetWidth;
  refs.finishCardEl.classList.add('sr-finish-enter');
  refs.finishScreenEl.style.pointerEvents = '';
  refs.finishScreenEl.classList.remove('sr-hud-hidden');
}

export function hideResultScreen(
  refs: Pick<ResultScreenDomRefs, 'finishScreenEl' | 'finishCardEl'>,
): void {
  refs.finishScreenEl.classList.add('sr-hud-hidden');
  refs.finishScreenEl.classList.remove('sr-finish-screen--podium');
  refs.finishScreenEl.style.pointerEvents = 'none';
  refs.finishCardEl.classList.remove('sr-finish-enter', 'sr-finish-card--podium');
}
