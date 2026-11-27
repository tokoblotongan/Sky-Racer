// src/audio/music/musicDirector.ts

import { CONFIG } from '../../config';
import type { RaceEventBus } from '../../core/raceEvents';
import type { MusicPlayer, MusicTrackId } from './musicPlayer';

export interface MusicDirector {
  onArenaSelected: (courseId: string) => void;
  dispose: () => void;
}

function resolveRaceTrackForCourse(courseId: string): MusicTrackId {
  return courseId === 'sky-circuit' ? 'skyCircuitRace' : 'fantasyRace';
}

export function createMusicDirector(
  player: MusicPlayer,
  bus: RaceEventBus,
  initialCourseId: string,
): MusicDirector {
  const unsubscribers: Array<() => void> = [];
  let activeCourseId = initialCourseId;
  let lastFinishTrack: MusicTrackId | null = null;
  let disposed = false;

  // Boot strictly loads only the title track (lazy loading per stage)
  player.setIntroScale(1);
  player.setCountdownDuck(false);
  player.playTrack('title', {
    loop: true,
    fadeSeconds: 0,
    introVolumeScale: 1,
  });

  function onArenaSelected(courseId: string): void {
    if (disposed) {
      return;
    }
    activeCourseId = courseId;
    player.preloadTrack(resolveRaceTrackForCourse(courseId));
  }

  unsubscribers.push(
    bus.on('gameStateChanged', ({ state, prevState, courseId }) => {
      if (disposed) {
        return;
      }
      activeCourseId = courseId;

      if (state === 'title') {
        lastFinishTrack = null;
        player.setCountdownDuck(false);
        player.setIntroScale(1);
        player.playTrack('title', {
          loop: true,
          fadeSeconds: CONFIG.audio.music.fadeSeconds.crossfade,
          introVolumeScale: 1,
        });
        return;
      }

      if (state === 'intro') {
        lastFinishTrack = null;
        player.preloadTrack(resolveRaceTrackForCourse(courseId));
        player.setCountdownDuck(false);
        player.setIntroScale(CONFIG.audio.music.introVolume);
        player.playTrack('title', {
          loop: true,
          fadeSeconds: CONFIG.audio.music.fadeSeconds.crossfade,
          introVolumeScale: CONFIG.audio.music.introVolume,
        });
        return;
      }

      if (state === 'countdown') {
        lastFinishTrack = null;
        player.preloadTrack(resolveRaceTrackForCourse(courseId));
        player.setIntroScale(CONFIG.audio.music.introVolume);
        player.setCountdownDuck(true);
        player.playTrack('title', {
          loop: true,
          fadeSeconds: prevState === 'intro' ? 0 : 0.45,
          introVolumeScale: CONFIG.audio.music.introVolume,
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
      player.setCountdownDuck(false);
      player.setIntroScale(1);
      const raceTrack = resolveRaceTrackForCourse(courseId);
      player.playTrack(raceTrack, {
        loop: true,
        fadeSeconds: CONFIG.audio.music.fadeSeconds.crossfade,
        introVolumeScale: 1,
      });

      if (totalLaps <= 1) {
        player.preloadTrack('fantasyWin');
      }
    }),
  );

  unsubscribers.push(
    bus.on('lapChanged', ({ lap, totalLaps }) => {
      if (disposed) {
        return;
      }
      if (activeCourseId !== 'sky-circuit' && totalLaps >= 3 && lap === 2) {
        player.preloadTrack('fantasyLastLap');
      }
    }),
  );

  unsubscribers.push(
    bus.on('lastLapStarted', ({ courseId }) => {
      if (disposed) {
        return;
      }
      activeCourseId = courseId;
      player.setIntroScale(1);
      player.setCountdownDuck(false);
      player.playTrack('fantasyLastLap', {
        loop: true,
        fadeSeconds: CONFIG.audio.music.fadeSeconds.lastLap,
        forceRestart: true,
        introVolumeScale: 1,
      });
      player.preloadTrack('fantasyWin');
      player.preloadTrack('fantasyLose');
    }),
  );

  unsubscribers.push(
    bus.on('playerFinished', ({ position, totalRacers }) => {
      if (disposed) {
        return;
      }
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
