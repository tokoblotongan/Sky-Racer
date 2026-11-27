// tools/testAttractions.ts
// Deterministic unit & invariant tests for FantasyLand Stage F6 attractions and Sky Circuit isolation.

import assert from 'node:assert/strict';
import { CONFIG } from '../src/config';
import { createAttractionSystem, triangleWave01 } from '../src/core/attractions';
import { buildCourseConfigFromDefinition, Course } from '../src/core/course';
import {
  createHazardEffectsTracker,
  type AttractionEvent,
} from '../src/core/hazardEffects';
import { createCarState, stepCar } from '../src/core/physics';
import { distanceSInterval } from '../src/courses/fantasyLandAttractions';
import { fantasyLandCourse } from '../src/courses/fantasyLand';
import { skyCircuitCourse } from '../src/courses/skyCircuit';

function runTests(): void {
  const fantasyCourse = new Course(buildCourseConfigFromDefinition(fantasyLandCourse, false));
  const skyCourse = new Course(buildCourseConfigFromDefinition(skyCircuitCourse, false));
  const mainRoute = fantasyCourse.getRoute('main');

  // 1. Sky Circuit must NOT enable attractions
  const skyAttr = createAttractionSystem(skyCourse, true, 'sedang');
  assert.equal(skyAttr.plan.enabledForCourse, false, 'Sky Circuit must not have attractions');
  assert.equal(skyAttr.isActive(), false);
  assert.equal(skyAttr.getBoostRings().length, 0);

  // 2. Per-lap attraction limits on FantasyLand
  const attr = createAttractionSystem(fantasyCourse, true, 'sedang');
  const { plan } = attr;
  assert.equal(plan.enabledForCourse, true);
  assert.ok(plan.pendulums.length > 0 && plan.pendulums.length <= CONFIG.attractions.maxPerLap.pendulum);
  assert.ok(plan.ballGroups.length > 0 && plan.ballGroups.length <= CONFIG.attractions.maxPerLap.balls);
  assert.ok(plan.windFans.length > 0 && plan.windFans.length <= CONFIG.attractions.maxPerLap.wind);
  assert.ok(plan.jellyPuddles.length > 0 && plan.jellyPuddles.length <= CONFIG.attractions.maxPerLap.jelly);

  const mainRings = plan.boostRings.filter((r) => r.routeId === 'main');
  const shortcutRings = plan.boostRings.filter((r) => r.routeId !== 'main');
  assert.ok(mainRings.length > 0 && mainRings.length <= CONFIG.attractions.maxPerLap.rings);
  assert.ok(shortcutRings.length > 0);

  // 3. >= 40m clearance from checkpoints, jump takeoffs/landings, loop entry/exit, tunnel portals, shortcut gaps
  const mainLen = fantasyCourse.getLength();
  const minReqClear = CONFIG.attractions.clearanceMeters;
  for (const fz of plan.forbiddenZones) {
    for (const p of plan.pendulums) {
      const d = distanceSInterval(p.s, p.s, fz.startS, fz.endS, mainLen, true);
      assert.ok(d >= minReqClear - 1e-4, `${p.id} too close to ${fz.label}: ${d.toFixed(2)}m`);
    }
    for (const g of plan.ballGroups) {
      const s0 = Math.min(...g.balls.map((b) => b.s));
      const s1 = Math.max(...g.balls.map((b) => b.s));
      const d = distanceSInterval(s0, s1, fz.startS, fz.endS, mainLen, true);
      assert.ok(d >= minReqClear - 1e-4, `${g.id} too close to ${fz.label}: ${d.toFixed(2)}m`);
    }
    for (const w of plan.windFans) {
      const d = distanceSInterval(w.sStart, w.sEnd, fz.startS, fz.endS, mainLen, true);
      assert.ok(d >= minReqClear - 1e-4, `${w.id} too close to ${fz.label}: ${d.toFixed(2)}m`);
    }
    for (const j of plan.jellyPuddles) {
      const d = distanceSInterval(j.sStart, j.sEnd, fz.startS, fz.endS, mainLen, true);
      assert.ok(d >= minReqClear - 1e-4, `${j.id} too close to ${fz.label}: ${d.toFixed(2)}m`);
    }
  }

  // 4. >= 1.2s visible floor warning BEFORE hazards become active
  attr.evaluateAtTime(0);
  assert.equal(attr.getPendulums()[0].active, false);
  assert.ok(attr.getPendulums()[0].warningLevel > 0);
  attr.evaluateAtTime(1.15);
  assert.equal(attr.getPendulums()[0].active, false);
  assert.equal(attr.getBallGroups()[0].active, false);
  assert.equal(attr.getWindFans()[0].active, false);
  assert.equal(attr.getJellyPuddles()[0].active, false);

  attr.evaluateAtTime(1.25);
  assert.equal(attr.getPendulums()[0].active, true);
  assert.equal(attr.getBallGroups()[0].active, true);
  assert.equal(attr.getWindFans()[0].active, true);
  assert.equal(attr.getJellyPuddles()[0].active, true);

  // 5. Determinism & reset
  attr.evaluateAtTime(14.5);
  const snapA = attr.getPendulums().map((p) => p.angleRad);
  const ballsA = attr.getBallGroups()[0].balls.map((b) => b.lateral);
  attr.reset();
  assert.equal(attr.getPendulums()[0].angleRad, 0);
  attr.evaluateAtTime(14.5);
  const snapB = attr.getPendulums().map((p) => p.angleRad);
  const ballsB = attr.getBallGroups()[0].balls.map((b) => b.lateral);
  assert.deepEqual(snapA, snapB);
  assert.deepEqual(ballsA, ballsB);

  // 6. Triangle wave bounds & >= 40% safe lane invariant across entire oscillation cycles
  assert.equal(triangleWave01(0), 0);
  assert.equal(triangleWave01(0.25), 1);
  assert.equal(triangleWave01(0.5), 0);
  assert.equal(triangleWave01(0.75), -1);

  for (let i = 0; i <= 200; i++) {
    attr.evaluateAtTime(1.25 + i * 0.1);
    for (const p of attr.getPendulums()) {
      const safeFrac =
        Math.max(p.safeLaneLeftWidth, p.safeLaneRightWidth) / Math.max(1, p.spec.trackWidth);
      assert.ok(
        safeFrac >= CONFIG.attractions.safeLaneFraction - 1e-4,
        `Pendulum safe lane ${safeFrac.toFixed(3)} < 0.4`,
      );
    }
    for (const g of attr.getBallGroups()) {
      assert.ok(
        g.minSafeLaneFraction >= CONFIG.attractions.safeLaneFraction - 1e-4,
        `Balls safe lane ${g.minSafeLaneFraction.toFixed(3)} < 0.4`,
      );
    }
  }

  // 7. Wind ramp smooth edges and capped at maxAccel
  attr.evaluateAtTime(4.0);
  const wf = plan.windFans[0];
  assert.equal(attr.getWindAccelAt('main', wf.sStart - 1), 0);
  assert.equal(attr.getWindAccelAt('main', wf.sStart), 0);
  const midWind = Math.abs(attr.getWindAccelAt('main', wf.centerS));
  const edgeWind = Math.abs(attr.getWindAccelAt('main', wf.sStart + 2));
  assert.ok(edgeWind > 0 && edgeWind < midWind);
  assert.ok(midWind <= CONFIG.attractions.wind.maxAccel + 1e-6);
  assert.equal(attr.getWindAccelAt('main', wf.sEnd), 0);

  // 8. Pendulum impact -> speed * 0.75, spin-out without rollover, 1.5s post-hit immunity
  const tracker = createHazardEffectsTracker(1);
  const car = createCarState(0, 0, 'main', 0);
  const pSpec = plan.pendulums[0];
  // Find active time when bob passes near center so car at lateral=0 gets hit
  let hitTime = 1.25;
  for (let k = 0; k <= 200; k++) {
    const tt = 1.3 + k * 0.05;
    attr.evaluateAtTime(tt);
    if (Math.abs(attr.getPendulums()[0].bobLateral) < 0.4) {
      hitTime = tt;
      break;
    }
  }
  attr.evaluateAtTime(hitTime);
  car.s = pSpec.s;
  car.sApprox = pSpec.s;
  car.lateral = attr.getPendulums()[0].bobLateral;
  car.vForward = 40;
  const events: AttractionEvent[] = [];
  tracker.stepPrePhysics([car], attr, 1 / 60);
  tracker.stepPostPhysics([car], fantasyCourse, attr, 1 / 60, events);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'hazardHit');
  assert.ok(Math.abs(car.vForward - 40 * CONFIG.attractions.pendulum.speedMultiplier) < 1e-4);
  assert.equal(car.crashed, false, 'Hazards must NEVER trigger rollover');

  // Re-test 0.2s later while immune -> must NOT trigger hit again
  car.vForward = 40;
  events.length = 0;
  tracker.stepPrePhysics([car], attr, 0.2);
  tracker.stepPostPhysics([car], fantasyCourse, attr, 0.016, events);
  assert.equal(events.filter((e) => e.type === 'hazardHit').length, 0, '1.5s immunity must prevent repeat hit');

  // 9. Rolling balls impact -> speed * 0.8 & spin-out without rollover
  tracker.reset(1);
  const bGroup = plan.ballGroups[0];
  let ballHitTime = 1.3;
  for (let k = 0; k <= 200; k++) {
    const tt = 1.3 + k * 0.05;
    attr.evaluateAtTime(tt);
    if (Math.abs(attr.getBallGroups()[0].balls[0].lateral) < 0.5) {
      ballHitTime = tt;
      break;
    }
  }
  attr.evaluateAtTime(ballHitTime);
  car.s = bGroup.balls[0].s;
  car.sApprox = bGroup.balls[0].s;
  car.lateral = attr.getBallGroups()[0].balls[0].lateral;
  car.vForward = 50;
  events.length = 0;
  tracker.stepPrePhysics([car], attr, 1 / 60);
  tracker.stepPostPhysics([car], fantasyCourse, attr, 1 / 60, events);
  assert.equal(events.some((e) => e.type === 'hazardHit' && e.hazardKind === 'balls'), true);
  assert.ok(Math.abs(car.vForward - 50 * CONFIG.attractions.balls.speedMultiplier) < 1e-4);
  assert.equal(car.crashed, false);

  // 10. Jelly puddle -> gripMultiplier 0.5 + 0.4s tail after exiting
  tracker.reset(1);
  const jp = plan.jellyPuddles[0];
  const envOut = { gripMultiplier: 1, lateralAccel: 0 };
  attr.evaluateAtTime(3.0);
  car.s = jp.centerS;
  car.lateral = jp.lateralCenter;
  tracker.stepPrePhysics([car], attr, 1 / 60);
  tracker.getEnvModifiers(0, envOut);
  assert.equal(envOut.gripMultiplier, CONFIG.attractions.jelly.gripMultiplier);

  // Leave puddle: tail remains for ~0.4s
  car.s = jp.sEnd + 15;
  tracker.stepPrePhysics([car], attr, 0.25);
  tracker.getEnvModifiers(0, envOut);
  assert.equal(envOut.gripMultiplier, CONFIG.attractions.jelly.gripMultiplier);
  tracker.stepPrePhysics([car], attr, 0.25);
  tracker.getEnvModifiers(0, envOut);
  assert.equal(envOut.gripMultiplier, 1);

  // 11. Boost Ring pass -> activates boost cleanly via existing boost API
  tracker.reset(1);
  const ring = plan.boostRings[0];
  const car2 = createCarState(0, 0, ring.routeId, 0);
  car2.s = ring.s;
  car2.sApprox = ring.s;
  car2.worldPos.copy(ring.worldPos);
  car2.vForward = 45;
  car2.boostTimeLeft = 0;
  car2.boostCooldown = 0;
  events.length = 0;
  tracker.stepPrePhysics([car2], attr, 1 / 60);
  tracker.stepPostPhysics([car2], fantasyCourse, attr, 1 / 60, events);
  assert.equal(events.some((e) => e.type === 'ringPass'), true);
  assert.ok(car2.boostTimeLeft > 0, 'Passing boost ring must activate boost');

  // Verify stepCar accepts env cleanly without NaN
  stepCar(
    car2,
    { throttle: 1, brake: 0, steer: 0, handbrake: false, resetPressed: false, confirmPressed: false },
    mainRoute,
    1 / 60,
    { phase: 'RACING', respawnTarget: { s: 10, lateral: 0 }, env: { gripMultiplier: 0.5, lateralAccel: 11 } },
  );
  assert.ok(Number.isFinite(car2.vForward) && Number.isFinite(car2.vLateral));

  console.log('ALL ATTRACTION TESTS PASS (11/11 invariants verified)');
}

runTests();
