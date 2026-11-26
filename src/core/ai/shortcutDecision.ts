// src/core/ai/shortcutDecision.ts

import * as THREE from 'three';
import { CONFIG, type AiRivalConfig } from '../../config';
import type { Course } from '../course';
import type { CarState } from '../physics';
import type { Route, TrackFrame } from '../routes';
import type { SeededRng } from './rng';

export interface ShortcutGuidance {
  overrideLateral: number | null;
  takingShortcut: boolean;
}

interface BranchDecisionState {
  lapKey: number;
  branchId: string;
  takeShortcut: boolean;
  countedAttempt: boolean;
}

const _frame: TrackFrame = {
  s: 0,
  position: new THREE.Vector3(),
  tangent: new THREE.Vector3(),
  up: new THREE.Vector3(),
  right: new THREE.Vector3(),
  width: CONFIG.course.trackWidth,
  bank: 0,
};

export interface ShortcutTracker {
  reset: () => void;
  evaluate: (
    car: CarState,
    route: Route,
    course: Course,
    rival: AiRivalConfig,
    difficultyFactor: number,
    rng: SeededRng,
    out: ShortcutGuidance,
    onShortcutAttempt?: () => void,
  ) => ShortcutGuidance;
}

export function createShortcutTracker(): ShortcutTracker {
  let state: BranchDecisionState | null = null;

  const reset = (): void => {
    state = null;
  };

  const evaluate = (
    car: CarState,
    route: Route,
    course: Course,
    rival: AiRivalConfig,
    difficultyFactor: number,
    rng: SeededRng,
    out: ShortcutGuidance,
    onShortcutAttempt?: () => void,
  ): ShortcutGuidance => {
    out.overrideLateral = null;
    out.takingShortcut = false;

    const branches = course.getBranchRoutes();
    if (branches.length === 0) {
      return out;
    }

    const lapLength = Math.max(1, course.getLength());
    const activeS = car.mode === 'grounded' ? car.s : car.sApprox;

    if (route.routeId !== 'main') {
      const branch = course.getBranchRoute(route.routeId);
      if (branch) {
        if (state && state.branchId === branch.routeId && !state.countedAttempt) {
          state.countedAttempt = true;
          onShortcutAttempt?.();
        }
        out.takingShortcut = true;
        // Center quickly inside entry collar, then let racing line guide through shortcut & merge
        if (activeS <= branch.entryGapLength + 4) {
          out.overrideLateral = 0;
        } else if (activeS >= branch.getLength() - branch.mergeGapLength) {
          // Gently steer back left toward main track inside merge window
          out.overrideLateral = -1.2;
        }
      }
      return out;
    }

    const lapIndex = course.isClosed() ? Math.max(0, Math.floor(Math.max(0, activeS) / lapLength)) : 0;
    const sInLap = course.isClosed() ? route.wrapDistance(activeS) : activeS;
    const approachWindow = CONFIG.ai.shortcut.approachWindowMeters;
    const minEntrySpeed = CONFIG.ai.shortcut.minEntrySpeed;

    for (let i = 0; i < branches.length; i++) {
      const branch = branches[i];
      const windowStart = branch.fromS - approachWindow;
      const inPreEntry = sInLap >= windowStart && sInLap < branch.fromS;
      const inEntryGap = sInLap >= branch.fromS && sInLap <= branch.fromS + branch.entryGapLength;

      if (!inPreEntry && !inEntryGap) {
        continue;
      }

      if (!state || state.lapKey !== lapIndex || state.branchId !== branch.routeId) {
        const fastEnough = car.vForward >= minEntrySpeed;
        const prob = THREE.MathUtils.clamp(rival.shortcutChance * (0.65 + 0.35 * difficultyFactor), 0, 0.95);
        const take = fastEnough && rng.chance(prob);
        state = {
          lapKey: lapIndex,
          branchId: branch.routeId,
          takeShortcut: take,
          countedAttempt: false,
        };
      }

      // If speed fell dramatically before entering, abort shortcut cleanly so AI never clips rail post
      if (state.takeShortcut && car.vForward < minEntrySpeed * 0.72) {
        state.takeShortcut = false;
      }

      route.getFrameAt(sInLap, _frame);
      const mainHalfW = _frame.width * 0.5;

      if (state.takeShortcut) {
        out.takingShortcut = true;
        if (inPreEntry) {
          out.overrideLateral = mainHalfW - 1.9;
        } else {
          // Cross right edge cleanly into branch entry corridor (which sits at main right + branch half width)
          out.overrideLateral = mainHalfW + 1.6;
        }
      } else {
        // Stay clear of right entry opening so AI stays smoothly on main track
        const safeMainRight = mainHalfW - 3.2;
        if (car.lateral > safeMainRight - 0.5) {
          out.overrideLateral = safeMainRight;
        }
      }
      break;
    }

    return out;
  };

  return {
    reset,
    evaluate,
  };
}
