// src/audio/sfx.ts

import { CONFIG } from '../config';
import type { PhysicsEvent } from '../core/physics';
import type { RaceEvent } from '../core/state';
import type { MedalType } from '../services/records';
import type { AudioManager } from './audioManager';

export type SoundEffectEvent =
  | PhysicsEvent
  | RaceEvent
  | { type: 'uiConfirm' }
  | { type: 'uiMove' }
  | { type: 'overtake' }
  | { type: 'overtaken' };

export interface SfxAudio {
  play: (event: SoundEffectEvent) => void;
  reset: () => void;
  dispose: () => void;
}

type EffectKey = keyof typeof CONFIG.audio.sfx;

export function createSfx(manager: AudioManager): SfxAudio {
  const ctx = manager.getContext();
  const buses = manager.getBuses();
  const whiteBuffer = manager.getNoiseBuffer('white');
  const sfxCfg = CONFIG.audio.sfx;
  const maxVoices = CONFIG.audio.maxVoices;

  const lastPlayedAt: Partial<Record<EffectKey, number>> = {};
  let activeVoices = 0;
  let disposed = false;

  function canTrigger(key: EffectKey): boolean {
    if (
      disposed ||
      !ctx ||
      !buses ||
      ctx.state !== 'running' ||
      !manager.isUnlocked() ||
      document.hidden
    ) {
      return false;
    }
    const now = ctx.currentTime;
    const prev = lastPlayedAt[key];
    const cooldown = sfxCfg[key].cooldown;
    if (prev !== undefined && now - prev < cooldown) {
      return false;
    }
    if (activeVoices >= maxVoices) {
      return false;
    }
    lastPlayedAt[key] = now;
    return true;
  }

  function registerPrimaryVoice(node: AudioScheduledSourceNode, extraNodes: AudioNode[]): void {
    activeVoices++;
    let cleaned = false;
    node.onended = () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      activeVoices = Math.max(0, activeVoices - 1);
      node.disconnect();
      for (const extra of extraNodes) {
        extra.disconnect();
      }
    };
  }

  function registerSecondaryNode(node: AudioScheduledSourceNode, extraNodes: AudioNode[]): void {
    let cleaned = false;
    node.onended = () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      node.disconnect();
      for (const extra of extraNodes) {
        extra.disconnect();
      }
    };
  }

  function playCountdownTick(): void {
    if (!canTrigger('countdownTick') || !ctx || !buses) return;
    const cfg = sfxCfg.countdownTick;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(cfg.frequency, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(cfg.gain, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + cfg.duration);

    osc.connect(gain);
    gain.connect(buses.sfx);
    registerPrimaryVoice(osc, [gain]);

    osc.start(now);
    osc.stop(now + cfg.duration + 0.01);
  }

  function playGo(): void {
    if (!canTrigger('go') || !ctx || !buses) return;
    const cfg = sfxCfg.go;
    const now = ctx.currentTime;

    const oscLow = ctx.createOscillator();
    const oscHigh = ctx.createOscillator();
    const gain = ctx.createGain();

    oscLow.type = 'sine';
    oscLow.frequency.setValueAtTime(cfg.frequency, now);
    oscHigh.type = 'sine';
    oscHigh.frequency.setValueAtTime(cfg.frequencyHigh, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(cfg.gain, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + cfg.duration);

    oscLow.connect(gain);
    oscHigh.connect(gain);
    gain.connect(buses.sfx);

    registerPrimaryVoice(oscLow, [gain]);
    registerSecondaryNode(oscHigh, []);

    oscLow.start(now);
    oscHigh.start(now);
    oscLow.stop(now + cfg.duration + 0.015);
    oscHigh.stop(now + cfg.duration + 0.015);
  }

  function playCheckpoint(index: number): void {
    if (!canTrigger('checkpoint') || !ctx || !buses) return;
    const cfg = sfxCfg.checkpoint;
    const now = ctx.currentTime;
    // Ascend 1 semitone per subsequent checkpoint
    const semitoneRatio = Math.pow(2, Math.max(0, index) / 12);
    const freq1 = cfg.frequency * semitoneRatio;
    const freq2 = cfg.frequencyHigh * semitoneRatio;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(freq1, now);
    gain1.gain.setValueAtTime(0.0001, now);
    gain1.gain.linearRampToValueAtTime(cfg.gain, now + 0.008);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + cfg.noteDuration);
    osc1.connect(gain1);
    gain1.connect(buses.sfx);
    registerSecondaryNode(osc1, [gain1]);
    osc1.start(now);
    osc1.stop(now + cfg.noteDuration + 0.01);

    const t2 = now + cfg.noteGap;
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(freq2, t2);
    gain2.gain.setValueAtTime(0.0001, t2);
    gain2.gain.linearRampToValueAtTime(cfg.gain, t2 + 0.008);
    gain2.gain.exponentialRampToValueAtTime(0.0001, t2 + cfg.noteDuration * 1.35);
    osc2.connect(gain2);
    gain2.connect(buses.sfx);
    registerPrimaryVoice(osc2, [gain2]);
    osc2.start(t2);
    osc2.stop(t2 + cfg.noteDuration * 1.35 + 0.015);
  }

  function playFinish(medal: MedalType, newBest: boolean): void {
    if (!canTrigger('finish') || !ctx || !buses) return;
    const cfg = sfxCfg.finish;
    const now = ctx.currentTime;
    const notes = cfg.notes;

    const sparkleNotes: number[] = [];
    if (medal === 'silver') {
      sparkleNotes.push(cfg.bestPeakFreq);
    } else if (medal === 'gold') {
      sparkleNotes.push(cfg.bestPeakFreq, cfg.bestPeakFreq * 1.25);
    } else if (newBest) {
      sparkleNotes.push(cfg.bestPeakFreq);
    }

    for (let i = 0; i < notes.length; i++) {
      const start = now + i * cfg.noteStep;
      const isLast = i === notes.length - 1 && sparkleNotes.length === 0;
      const dur = isLast ? cfg.noteDuration * 1.6 : cfg.noteDuration;

      const osc = ctx.createOscillator();
      const shimmer = ctx.createOscillator();
      const gain = ctx.createGain();
      const shimmerGain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(notes[i], start);

      shimmer.type = 'sine';
      shimmer.frequency.setValueAtTime(notes[i] * 2, start);
      shimmerGain.gain.setValueAtTime(0.22, start);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(cfg.gain, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

      osc.connect(gain);
      shimmer.connect(shimmerGain);
      shimmerGain.connect(gain);
      gain.connect(buses.sfx);

      if (isLast) {
        registerPrimaryVoice(osc, [shimmerGain, gain]);
      } else {
        registerSecondaryNode(osc, [shimmerGain, gain]);
      }
      registerSecondaryNode(shimmer, []);

      osc.start(start);
      shimmer.start(start);
      osc.stop(start + dur + 0.02);
      shimmer.stop(start + dur + 0.02);
    }

    for (let j = 0; j < sparkleNotes.length; j++) {
      const sparkleStart = now + (notes.length + j) * cfg.noteStep;
      const isFinalSparkle = j === sparkleNotes.length - 1;
      const peakDur = isFinalSparkle ? cfg.noteDuration * 2.1 : cfg.noteDuration * 1.35;
      const freq = sparkleNotes[j];

      const peakOsc = ctx.createOscillator();
      const peakSparkle = ctx.createOscillator();
      const peakGain = ctx.createGain();
      const sparkleGain = ctx.createGain();

      peakOsc.type = 'triangle';
      peakOsc.frequency.setValueAtTime(freq, sparkleStart);

      peakSparkle.type = 'sine';
      peakSparkle.frequency.setValueAtTime(freq * 2, sparkleStart);
      sparkleGain.gain.setValueAtTime(newBest ? 0.36 : 0.3, sparkleStart);

      peakGain.gain.setValueAtTime(0.0001, sparkleStart);
      peakGain.gain.linearRampToValueAtTime(cfg.gain * (newBest ? 1.08 : 1.0), sparkleStart + 0.012);
      peakGain.gain.exponentialRampToValueAtTime(0.0001, sparkleStart + peakDur);

      peakOsc.connect(peakGain);
      peakSparkle.connect(sparkleGain);
      sparkleGain.connect(peakGain);
      peakGain.connect(buses.sfx);

      if (isFinalSparkle) {
        registerPrimaryVoice(peakOsc, [sparkleGain, peakGain]);
      } else {
        registerSecondaryNode(peakOsc, [sparkleGain, peakGain]);
      }
      registerSecondaryNode(peakSparkle, []);

      peakOsc.start(sparkleStart);
      peakSparkle.start(sparkleStart);
      peakOsc.stop(sparkleStart + peakDur + 0.02);
      peakSparkle.stop(sparkleStart + peakDur + 0.02);
    }
  }

  function playBoost(): void {
    if (!canTrigger('boost') || !ctx || !buses) return;
    const cfg = sfxCfg.boost;
    const now = ctx.currentTime;

    const saw = ctx.createOscillator();
    const sawFilter = ctx.createBiquadFilter();
    const sawGain = ctx.createGain();

    saw.type = 'sawtooth';
    saw.frequency.setValueAtTime(cfg.sawStart, now);
    saw.frequency.exponentialRampToValueAtTime(cfg.sawEnd, now + cfg.duration * 0.85);

    sawFilter.type = 'lowpass';
    sawFilter.frequency.setValueAtTime(900, now);
    sawFilter.frequency.exponentialRampToValueAtTime(2800, now + cfg.duration * 0.8);

    sawGain.gain.setValueAtTime(0.0001, now);
    sawGain.gain.linearRampToValueAtTime(cfg.gain * 0.36, now + 0.03);
    sawGain.gain.exponentialRampToValueAtTime(0.0001, now + cfg.duration);

    saw.connect(sawFilter);
    sawFilter.connect(sawGain);
    sawGain.connect(buses.sfx);

    if (whiteBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = whiteBuffer;
      noise.loop = true;

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(cfg.frequency, now);
      bp.frequency.exponentialRampToValueAtTime(cfg.filterEnd, now + cfg.duration);
      bp.Q.setValueAtTime(1.5, now);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.0001, now);
      noiseGain.gain.linearRampToValueAtTime(cfg.gain * 0.85, now + 0.045);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + cfg.duration);

      noise.connect(bp);
      bp.connect(noiseGain);
      noiseGain.connect(buses.sfx);

      registerPrimaryVoice(noise, [bp, noiseGain]);
      registerSecondaryNode(saw, [sawFilter, sawGain]);

      noise.start(now);
      noise.stop(now + cfg.duration + 0.02);
    } else {
      registerPrimaryVoice(saw, [sawFilter, sawGain]);
    }

    saw.start(now);
    saw.stop(now + cfg.duration + 0.02);
  }

  function playTakeoff(): void {
    if (!canTrigger('takeoff') || !ctx || !buses) return;
    const cfg = sfxCfg.takeoff;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(cfg.frequency, now);
    osc.frequency.exponentialRampToValueAtTime(cfg.endFrequency, now + cfg.duration);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(cfg.gain, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + cfg.duration);

    osc.connect(gain);
    gain.connect(buses.sfx);
    registerPrimaryVoice(osc, [gain]);

    osc.start(now);
    osc.stop(now + cfg.duration + 0.01);
  }

  function playLanded(impactSpeed: number): void {
    if (!canTrigger('landed') || !ctx || !buses) return;
    const cfg = sfxCfg.landed;
    const now = ctx.currentTime;
    const impactRatio = Math.max(0.25, Math.min(1, impactSpeed / 22));
    const thudGainVal = cfg.gain * impactRatio;
    const startFreq = cfg.frequency * (1.15 - impactRatio * 0.25);
    const endFreq = Math.max(38, cfg.endFrequency * (1.1 - impactRatio * 0.2));

    const thud = ctx.createOscillator();
    const thudGain = ctx.createGain();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(startFreq, now);
    thud.frequency.exponentialRampToValueAtTime(endFreq, now + cfg.duration * 0.85);

    thudGain.gain.setValueAtTime(0.0001, now);
    thudGain.gain.linearRampToValueAtTime(thudGainVal, now + 0.006);
    thudGain.gain.exponentialRampToValueAtTime(0.0001, now + cfg.duration);

    thud.connect(thudGain);
    thudGain.connect(buses.sfx);
    registerPrimaryVoice(thud, [thudGain]);

    thud.start(now);
    thud.stop(now + cfg.duration + 0.015);

    if (whiteBuffer) {
      const click = ctx.createBufferSource();
      click.buffer = whiteBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(cfg.clickFreq, now);
      filter.Q.setValueAtTime(1.4, now);

      const clickGain = ctx.createGain();
      clickGain.gain.setValueAtTime(0.0001, now);
      clickGain.gain.linearRampToValueAtTime(thudGainVal * 0.45, now + 0.003);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

      click.connect(filter);
      filter.connect(clickGain);
      clickGain.connect(buses.sfx);
      registerSecondaryNode(click, [filter, clickGain]);

      click.start(now);
      click.stop(now + 0.05);
    }
  }

  function playRailHit(intensity: number): void {
    if (!canTrigger('railHit') || !ctx || !buses) return;
    const cfg = sfxCfg.railHit;
    const now = ctx.currentTime;
    const clamped = Math.max(0.2, Math.min(1, intensity));
    const vol = cfg.gain * clamped;

    const sq = ctx.createOscillator();
    const sqFilter = ctx.createBiquadFilter();
    const sqGain = ctx.createGain();

    sq.type = 'square';
    sq.frequency.setValueAtTime(cfg.frequency * (0.95 + clamped * 0.12), now);
    sq.frequency.exponentialRampToValueAtTime(135, now + cfg.duration);

    sqFilter.type = 'lowpass';
    sqFilter.frequency.setValueAtTime(1400, now);

    sqGain.gain.setValueAtTime(0.0001, now);
    sqGain.gain.linearRampToValueAtTime(vol * 0.55, now + 0.004);
    sqGain.gain.exponentialRampToValueAtTime(0.0001, now + cfg.duration);

    sq.connect(sqFilter);
    sqFilter.connect(sqGain);
    sqGain.connect(buses.sfx);

    if (whiteBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = whiteBuffer;

      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(cfg.noiseFilterFreq, now);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.0001, now);
      noiseGain.gain.linearRampToValueAtTime(vol * 0.8, now + 0.003);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + cfg.duration * 0.65);

      noise.connect(hp);
      hp.connect(noiseGain);
      noiseGain.connect(buses.sfx);

      registerPrimaryVoice(sq, [sqFilter, sqGain]);
      registerSecondaryNode(noise, [hp, noiseGain]);

      noise.start(now);
      noise.stop(now + cfg.duration);
    } else {
      registerPrimaryVoice(sq, [sqFilter, sqGain]);
    }

    sq.start(now);
    sq.stop(now + cfg.duration + 0.01);
  }

  function playFell(): void {
    if (!canTrigger('fell') || !ctx || !buses) return;
    const cfg = sfxCfg.fell;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(cfg.frequency, now);
    osc.frequency.exponentialRampToValueAtTime(cfg.endFrequency, now + cfg.duration);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(cfg.gain, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + cfg.duration);

    osc.connect(gain);
    gain.connect(buses.sfx);
    registerPrimaryVoice(osc, [gain]);

    osc.start(now);
    osc.stop(now + cfg.duration + 0.015);
  }

  function playRespawn(): void {
    if (!canTrigger('respawn') || !ctx || !buses) return;
    const cfg = sfxCfg.respawn;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(cfg.frequency, now);
    osc.frequency.exponentialRampToValueAtTime(cfg.endFrequency, now + cfg.duration);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(cfg.gain, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + cfg.duration);

    osc.connect(gain);
    gain.connect(buses.sfx);
    registerPrimaryVoice(osc, [gain]);

    osc.start(now);
    osc.stop(now + cfg.duration + 0.015);
  }

  function playClick(key: 'restart' | 'uiConfirm' | 'uiMove'): void {
    if (!canTrigger(key) || !ctx || !buses) return;
    const cfg = sfxCfg[key];
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = key === 'uiMove' ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(cfg.frequency, now);
    osc.frequency.exponentialRampToValueAtTime(
      cfg.frequency * (key === 'uiMove' ? 1.15 : 1.25),
      now + cfg.duration,
    );

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(cfg.gain, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + cfg.duration);

    osc.connect(gain);
    gain.connect(buses.sfx);
    registerPrimaryVoice(osc, [gain]);

    osc.start(now);
    osc.stop(now + cfg.duration + 0.01);
  }

  function playOvertake(passed: boolean): void {
    const key: EffectKey = passed ? 'overtake' : 'overtaken';
    if (!canTrigger(key) || !ctx || !buses) return;
    const cfg = passed ? sfxCfg.overtake : sfxCfg.overtaken;
    const f1 = cfg.frequency;
    const f2 = passed ? sfxCfg.overtake.frequencyHigh : sfxCfg.overtaken.frequencyLow;
    const now = ctx.currentTime;
    const half = cfg.duration * 0.52;

    const osc1 = ctx.createOscillator();
    const g1 = ctx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(f1, now);
    g1.gain.setValueAtTime(0.0001, now);
    g1.gain.linearRampToValueAtTime(cfg.gain, now + 0.008);
    g1.gain.exponentialRampToValueAtTime(0.0001, now + half);
    osc1.connect(g1);
    g1.connect(buses.sfx);
    registerSecondaryNode(osc1, [g1]);
    osc1.start(now);
    osc1.stop(now + half + 0.01);

    const t2 = now + half * 0.65;
    const osc2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(f2, t2);
    g2.gain.setValueAtTime(0.0001, t2);
    g2.gain.linearRampToValueAtTime(cfg.gain, t2 + 0.008);
    g2.gain.exponentialRampToValueAtTime(0.0001, t2 + half * 1.3);
    osc2.connect(g2);
    g2.connect(buses.sfx);
    registerPrimaryVoice(osc2, [g2]);
    osc2.start(t2);
    osc2.stop(t2 + half * 1.3 + 0.015);
  }

  function play(event: SoundEffectEvent): void {
    if (disposed || !ctx || ctx.state !== 'running') {
      return;
    }
    try {
      switch (event.type) {
        case 'countdownTick':
          playCountdownTick();
          break;
        case 'go':
          playGo();
          break;
        case 'checkpoint':
          playCheckpoint(event.index);
          break;
        case 'finish':
          playFinish(event.medal, event.isNewBest);
          break;
        case 'boost':
          playBoost();
          break;
        case 'takeoff':
          playTakeoff();
          break;
        case 'landed':
          playLanded(event.impactSpeed);
          break;
        case 'railHit':
          playRailHit(event.intensity);
          break;
        case 'fell':
          playFell();
          break;
        case 'respawn':
          playRespawn();
          break;
        case 'restart':
          playClick('restart');
          break;
        case 'uiConfirm':
          playClick('uiConfirm');
          break;
        case 'uiMove':
          playClick('uiMove');
          break;
        case 'overtake':
          playOvertake(true);
          break;
        case 'overtaken':
          playOvertake(false);
          break;
      }
    } catch {
      // Skip SFX cleanly if WebAudio node creation or scheduling fails
    }
  }

  function reset(): void {
    for (const key of Object.keys(lastPlayedAt) as EffectKey[]) {
      delete lastPlayedAt[key];
    }
  }

  function dispose(): void {
    disposed = true;
    reset();
  }

  return {
    play,
    reset,
    dispose,
  };
}
