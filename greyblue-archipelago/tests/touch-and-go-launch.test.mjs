import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTouchAndGoLaunchState,
  deriveTouchAndGoShelfTouchdown,
  stepTouchAndGoLaunch,
  touchAndGoLaunchPublicState,
} from '../src/core/touch-and-go-launch.js';

const islands = Object.freeze([
  Object.freeze({
    id: 'island-a',
    regionId: 'region-1',
    landingZones: Object.freeze([Object.freeze({ id: 'shelf-a', x: 0, y: 10, z: 0, radius: 18 })]),
  }),
  Object.freeze({
    id: 'island-b',
    regionId: 'region-1',
    landingZones: Object.freeze([Object.freeze({ id: 'shelf-b', x: 260, y: 12, z: 0, radius: 20 })]),
  }),
  Object.freeze({
    id: 'island-c',
    regionId: 'region-2',
    landingZones: Object.freeze([Object.freeze({ id: 'shelf-c', x: 520, y: 14, z: 0, radius: 20 })]),
  }),
]);

function frame({ x = 0, y = 10, z = 0, airborne = false, grounded = !airborne, speed = 0, ...patch } = {}) {
  return {
    ready: true,
    paused: false,
    airborne,
    grounded,
    recoveryActive: false,
    restorePublishing: false,
    crossingActive: false,
    position: { x, y, z },
    speed,
    ...patch,
  };
}

function landing(islandId = 'island-a', shelfId = 'shelf-a', regionId = 'region-1') {
  return Object.freeze({ islandId, shelfId, regionId });
}

function beginAttempt() {
  let state = stepTouchAndGoLaunch({
    state: createTouchAndGoLaunchState(),
    frame: frame({ x: 0, y: 10 }),
    touchdown: landing(),
  });
  state = stepTouchAndGoLaunch({ state, frame: frame({ x: 0, y: 10 }) });
  return state;
}

function travelAttempt() {
  let state = beginAttempt();
  state = stepTouchAndGoLaunch({ state, frame: frame({ x: 15, y: 14, airborne: true, grounded: false, speed: 16 }) });
  for (const x of [50, 85, 120, 155, 190, 225, 250]) {
    state = stepTouchAndGoLaunch({
      state,
      frame: frame({ x, y: 20, airborne: true, grounded: false, speed: 22 }),
    });
  }
  return state;
}

test('canonical shelf touchdown requires truthful collision, discovery, region, and authored shelf geometry', () => {
  const collision = { grounded: true, reason: 'touchdown', requiresRecovery: false };
  const result = deriveTouchAndGoShelfTouchdown({
    collision,
    position: { x: 4, y: 10, z: 3 },
    islands,
    discoveredIslandIds: ['island-a'],
    currentRegionId: 'region-1',
  });
  assert.deepEqual(result, { islandId: 'island-a', shelfId: 'shelf-a', regionId: 'region-1' });

  for (const patch of [
    { collision: { grounded: true, reason: 'grounded-contact', requiresRecovery: false } },
    { collision: { grounded: true, reason: 'touchdown', requiresRecovery: true } },
    { position: { x: 80, y: 10, z: 80 } },
    { discoveredIslandIds: [] },
    { currentRegionId: 'region-2' },
  ]) {
    assert.equal(deriveTouchAndGoShelfTouchdown({
      collision,
      position: { x: 4, y: 10, z: 3 },
      islands,
      discoveredIslandIds: ['island-a'],
      currentRegionId: 'region-1',
      ...patch,
    }), null);
  }
});

test('first qualifying shelf touchdown arms privately and needs a brief grounded interval before departure', () => {
  let state = stepTouchAndGoLaunch({
    state: createTouchAndGoLaunchState(),
    frame: frame(),
    touchdown: landing(),
  });
  assert.equal(state.active, true);
  assert.equal(state.phase, 'touchdown');
  assert.equal(state.firstIslandId, 'island-a');
  assert.deepEqual(touchAndGoLaunchPublicState(state), { active: true, phase: 'touchdown', completed: false });

  const tooFast = stepTouchAndGoLaunch({
    state,
    frame: frame({ x: 12, y: 13, airborne: true, grounded: false, speed: 18 }),
  });
  assert.deepEqual(touchAndGoLaunchPublicState(tooFast), { active: false, phase: null, completed: false });

  state = beginAttempt();
  state = stepTouchAndGoLaunch({
    state,
    frame: frame({ x: 15, y: 13, airborne: true, grounded: false, speed: 16 }),
  });
  assert.equal(state.active, true);
  assert.equal(state.departed, true);
  assert.equal(state.phase, 'travel');
});

test('prolonged grounding ends the attempt instead of turning an ordinary landing into a touch-and-go', () => {
  let state = beginAttempt();
  for (let i = 0; i < 40 && state.active; i += 1) {
    state = stepTouchAndGoLaunch({ state, frame: frame() });
  }
  assert.deepEqual(touchAndGoLaunchPublicState(state), { active: false, phase: null, completed: false });
});

test('meaningful spaced airborne travel followed by a different discovered shelf completes once', () => {
  let state = travelAttempt();
  assert.ok(state.travel >= 180);
  assert.ok(state.airSamples >= 6);
  state = stepTouchAndGoLaunch({
    state,
    frame: frame({ x: 260, y: 12, z: 0, airborne: false, grounded: true, speed: 7 }),
    touchdown: landing('island-b', 'shelf-b'),
  });
  assert.equal(state.completed, true);
  assert.deepEqual(touchAndGoLaunchPublicState(state), { active: false, phase: 'complete', completed: true });
  const latched = stepTouchAndGoLaunch({ state, frame: frame({ x: 300, airborne: true, grounded: false, speed: 20 }) });
  assert.strictEqual(latched, state);
});

test('same-island repeat and insufficient-travel second touchdown fail closed', () => {
  let same = travelAttempt();
  same = stepTouchAndGoLaunch({
    state: same,
    frame: frame({ x: 0, y: 10, airborne: false, grounded: true, speed: 6 }),
    touchdown: landing('island-a', 'shelf-a'),
  });
  assert.equal(same.completed, false);
  assert.equal(same.active, false);

  let short = beginAttempt();
  short = stepTouchAndGoLaunch({ state: short, frame: frame({ x: 15, airborne: true, grounded: false, speed: 16 }) });
  short = stepTouchAndGoLaunch({ state: short, frame: frame({ x: 35, airborne: true, grounded: false, speed: 20 }) });
  short = stepTouchAndGoLaunch({
    state: short,
    frame: frame({ x: 260, y: 12, airborne: false, grounded: true, speed: 6 }),
    touchdown: landing('island-b', 'shelf-b'),
  });
  assert.equal(short.completed, false);
  assert.equal(short.active, false);
});

test('ordinary ground contact and teleport-like airborne motion reset an incomplete traversal', () => {
  let ordinary = travelAttempt();
  ordinary = stepTouchAndGoLaunch({
    state: ordinary,
    frame: frame({ x: 252, y: 12, airborne: false, grounded: true, speed: 8 }),
  });
  assert.equal(ordinary.active, false);
  assert.equal(ordinary.completed, false);

  let teleport = beginAttempt();
  teleport = stepTouchAndGoLaunch({ state: teleport, frame: frame({ x: 15, airborne: true, grounded: false, speed: 18 }) });
  teleport = stepTouchAndGoLaunch({ state: teleport, frame: frame({ x: 500, airborne: true, grounded: false, speed: 20 }) });
  assert.equal(teleport.active, false);
  assert.equal(teleport.completed, false);
});

test('pause, recovery, restore, crossing, slow departure, and malformed telemetry reset active attempts', () => {
  for (const patch of [
    { paused: true },
    { recoveryActive: true },
    { restorePublishing: true },
    { crossingActive: true },
    { position: { x: Number.NaN, y: 10, z: 0 } },
  ]) {
    let state = beginAttempt();
    state = stepTouchAndGoLaunch({ state, frame: frame({ ...patch }) });
    assert.equal(state.active, false);
    assert.equal(state.completed, false);
  }

  const slow = stepTouchAndGoLaunch({
    state: beginAttempt(),
    frame: frame({ x: 6, airborne: true, grounded: false, speed: 4 }),
  });
  assert.equal(slow.active, false);
});

test('public projection contains no island, shelf, region, coordinates, thresholds, or counters', () => {
  const state = beginAttempt();
  const publicState = touchAndGoLaunchPublicState({ ...state, secret: 'nope' });
  assert.deepEqual(Object.keys(publicState), ['active', 'phase', 'completed']);
  assert.deepEqual(publicState, { active: true, phase: 'touchdown', completed: false });
  const text = JSON.stringify(publicState);
  assert.doesNotMatch(text, /island|shelf|region|travel|sample|position|180|30/i);
});
