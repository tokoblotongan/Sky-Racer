// src/audio/music/musicDirector.ts

import type { ArenaMusicConfig } from '../../arenas/types';
import { CONFIG } from '../../config';
import type { RaceEventBus } from '../../core/raceEvents';
import type { MusicPlayer, MusicTrackId } from './musicPlayer';

export interface MusicDirector {
  onArenaSelected: (courseId: string) => void;
  dispose: () => void;
}

interface ResolvedArenaMusic {
  title: string;
  race: string;
  raceTrackId: MusicTrackId;
  lastLap?: string;
  win: string;
  lose: string;
}

function resolveTracksForCourse(
  courseId: string,
  getArenaMusic?: (courseId: string) => ArenaMusicConfig | undefined,
): ResolvedArenaMusic {
  const custom = getArenaMusic?.(courseId);
  const defaults = CONFIG.audio.music.tracks;
  const raceFile = custom?.race ?? defaults.fantasyRace;
  const raceTrackId: MusicTrackId =
    raceFile === defaults.skyCircuitRace ? 'skyCircuitRace' : 'fantasyRace';
  return {
    title: custom?.title ?? defaults.title,
    race: raceFile,
    raceTrackId,
    lastLap: custom?.lastLap,
    win: custom?.win ?? defaults.fantasyWin,
    lose: custom?.lose ?? defaults.fantasyLose,
  };
}

export function createMusicDirector(
  player: MusicPlayer,
  bus: RaceEventBus,
  initialCourseId: string,
  getArenaMusic?: (courseId: string) => ArenaMusicConfig | undefined,
): MusicDirector {
  const unsubscribers: Array<() => void> = [];
  let activeCourseId = initialCourseId;
  let lastFinishTrack: MusicTrackId | null = null;
  let disposed = false;

  const initialTracks = resolveTracksForCourse(initialCourseId, getArenaMusic);

  // Boot strictly loads only the title track (lazy loading per stage)
  player.setIntroScale(1);
  player.setCountdownDuck(false);
  player.playTrack('title', {
    loop: true,
    fadeSeconds: 0,
    introVolumeScale: 1,
    filename: initialTracks.title,
  });

  function onArenaSelected(courseId: string): void {
    if (disposed) {
      return;
    }
    activeCourseId = courseId;
    const tracks = resolveTracksForCourse(courseId, getArenaMusic);
    player.preloadTrack(tracks.raceTrackId, tracks.race);
  }

  unsubscribers.push(
    bus.on('gameStateChanged', ({ state, prevState, courseId }) => {
      if (disposed) {
        return;
      }
      activeCourseId = courseId;
      const tracks = resolveTracksForCourse(courseId, getArenaMusic);

      if (state === 'title') {
        lastFinishTrack = null;
        player.setCountdownDuck(false);
        player.setIntroScale(1);
        player.playTrack('title', {
          loop: true,
          fadeSeconds: CONFIG.audio.music.fadeSeconds.crossfade,
          introVolumeScale: 1,
          filename: tracks.title,
        });
        return;
      }

      if (state === 'intro') {
        lastFinishTrack = null;
        player.preloadTrack(tracks.raceTrackId, tracks.race);
        player.setCountdownDuck(false);
        player.setIntroScale(CONFIG.audio.music.introVolume);
        player.playTrack('title', {
          loop: true,
          fadeSeconds: CONFIG.audio.music.fadeSeconds.crossfade,
          introVolumeScale: CONFIG.audio.music.introVolume,
          filename: tracks.title,
        });
        return;
      }

      if (state === 'countdown') {
        lastFinishTrack = null;
        player.preloadTrack(tracks.raceTrackId, tracks.race);
        player.setIntroScale(CONFIG.audio.music.introVolume);
        player.setCountdownDuck(true);
        player.playTrack('title', {
          loop: true,
          fadeSeconds: prevState === 'intro' ? 0 : 0.45,
          introVolumeScale: CONFIG.audio.music.introVolume,
          filename: tracks.title,
        });
        return;
      }

      if (state === 'podium' && lastFinishTrack === null) {
        player.setCountdownDuck(false);
        player.setIntroScale(1);
        player.playTrack('fantasyWin', {
          loop: false,
          fadeSeconds: 0.45,
          fadeOutAtEnd: true,
          introVolumeScale: 1,
          filename: tracks.win,
        });
        lastFinishTrack = 'fantasyWin';
      }
    }),
  );

  unsubscribers.push(
    bus.on('raceStart', ({ courseId, totalLaps }) => {
      if (disposed) {
        return;
      }
      activeCourseId = courseId;
      lastFinishTrack = null;
      const tracks = resolveTracksForCourse(courseId, getArenaMusic);
      player.setCountdownDuck(false);
      player.setIntroScale(1);
      player.playTrack(tracks.raceTrackId, {
        loop: true,
        fadeSeconds: CONFIG.audio.music.fadeSeconds.crossfade,
        introVolumeScale: 1,
        filename: tracks.race,
      });

      if (totalLaps <= 1) {
        player.preloadTrack('fantasyWin', tracks.win);
      }
    }),
  );

  unsubscribers.push(
    bus.on('lapChanged', ({ lap, totalLaps }) => {
      if (disposed) {
        return;
      }
      const tracks = resolveTracksForCourse(activeCourseId, getArenaMusic);
      if (tracks.lastLap && totalLaps >= 3 && lap === 2) {
        player.preloadTrack('fantasyLastLap', tracks.lastLap);
      }
    }),
  );

  unsubscribers.push(
    bus.on('lastLapStarted', ({ courseId }) => {
      if (disposed) {
        return;
      }
      activeCourseId = courseId;
      const tracks = resolveTracksForCourse(courseId, getArenaMusic);
      player.setIntroScale(1);
      player.setCountdownDuck(false);
      if (tracks.lastLap) {
        player.playTrack('fantasyLastLap', {
          loop: true,
          fadeSeconds: CONFIG.audio.music.fadeSeconds.lastLap,
          forceRestart: true,
          introVolumeScale: 1,
          filename: tracks.lastLap,
        });
      }
      player.preloadTrack('fantasyWin', tracks.win);
      player.preloadTrack('fantasyLose', tracks.lose);
    }),
  );

  unsubscribers.push(
    bus.on('playerFinished', ({ position, totalRacers }) => {
      if (disposed) {
        return;
      }
      const tracks = resolveTracksForCourse(activeCourseId, getArenaMusic);
      const isWin = totalRacers <= 1 || position <= 3;
      const track: MusicTrackId = isWin ? 'fantasyWin' : 'fantasyLose';
      lastFinishTrack = track;
      player.setCountdownDuck(false);
      player.setIntroScale(1);
      player.playTrack(track, {
        loop: false,
        fadeSeconds: 0.4,
        forceRestart: true,
        fadeOutAtEnd: isWin,
        introVolumeScale: 1,
        filename: isWin ? tracks.win : tracks.lose,
      });
    }),
  );

  unsubscribers.push(
    bus.on('hazardHit', ({ carIndex }) => {
      if (!disposed && carIndex === 0) {
        player.triggerEventDuck();
      }
    }),
  );

  unsubscribers.push(
    bus.on('boostStarted', ({ carIndex }) => {
      if (!disposed && carIndex === 0) {
        player.triggerEventDuck();
      }
    }),
  );

  function dispose(): void {
    if (disposed) {
      return;
    }
    disposed = true;
    for (let i = 0; i < unsubscribers.length; i++) {
      unsubscribers[i]();
    }
    unsubscribers.length = 0;
  }

  return {
    onArenaSelected,
    dispose,
  };
}
