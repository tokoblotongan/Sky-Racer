// src/core/routeTransitions.ts

import { CONFIG } from '../config';
import type { Course } from './course';
import type { CarState } from './physics';

export interface RouteTransitionEvent {
  readonly kind: 'enter' | 'exit' | 'merge';
  readonly fromRouteId: string;
  readonly toRouteId: string;
  readonly routeName: string;
}

export function updateRouteTransitions(
  state: CarState,
  course: Course,
): RouteTransitionEvent | null {
  const branches = course.getBranchRoutes();
  if (branches.length === 0 || state.mode === 'falling') {
    return null;
  }

  if (state.routeId === 'main') {
    if (state.mode !== 'grounded') {
      return null;
    }

    const isClosed = course.isClosed();
    const sInLap = isClosed ? course.wrapDistance(state.s) : state.s;
    const lapOffset = isClosed ? state.s - sInLap : 0;

    for (let i = 0; i < branches.length; i++) {
      const branch = branches[i];
      if (sInLap >= branch.fromS && sInLap <= branch.fromS + branch.entryGapLength) {
        const mainHalfWidth = course.getFrameAt(sInLap).width * 0.5;
        if (state.lateral >= mainHalfWidth) {
          const localS = sInLap - branch.fromS;
          state.routeId = branch.routeId;
          state.routeLapOffset = lapOffset;
          state.s = localS;
          state.sApprox = localS;
          state.lastSafeS = 0;
          state.lateral = state.lateral - branch.startOffset;
          return {
            kind: 'enter',
            fromRouteId: 'main',
            toRouteId: branch.routeId,
            routeName: branch.name,
          };
        }
      }
    }
    return null;
  }

  const branch = course.getBranchRoute(state.routeId);
  if (!branch) {
    state.routeId = 'main';
    state.routeLapOffset = 0;
    return null;
  }

  const branchLen = branch.getLength();
  const activeS = state.mode === 'grounded' ? state.s : state.sApprox;

  if (activeS >= branchLen) {
    const overshoot = activeS - branchLen;
    const nextMainS = state.routeLapOffset + branch.toS + overshoot;
    state.routeId = 'main';
    state.routeLapOffset = 0;
    state.s = nextMainS;
    state.sApprox = nextMainS;
    state.lastSafeS = nextMainS;
    state.lateral = state.lateral + branch.endOffset;
    return {
      kind: 'merge',
      fromRouteId: branch.routeId,
      toRouteId: 'main',
      routeName: branch.name,
    };
  }

  if (state.mode === 'grounded') {
    const branchHalfWidth = branch.getTrackWidth() * 0.5;
    const switchThreshold = -branchHalfWidth - CONFIG.shortcut.switchEdgeMargin;
    const crossedEntryMargin =
      activeS <= branch.entryGapLength && state.lateral <= switchThreshold;
    const pastDividerTip =
      activeS > branch.entryGapLength &&
      activeS <= branch.entryGapLength + 1.5 &&
      state.lateral < -branchHalfWidth;

    if (crossedEntryMargin || pastDividerTip) {
      const nextMainS = state.routeLapOffset + branch.fromS + state.s;
      state.routeId = 'main';
      state.routeLapOffset = 0;
      state.s = nextMainS;
      state.sApprox = nextMainS;
      state.lastSafeS = nextMainS;
      state.lateral = state.lateral + branch.startOffset;
      return {
        kind: 'exit',
        fromRouteId: branch.routeId,
        toRouteId: 'main',
        routeName: branch.name,
      };
    }
  }

  return null;
}
