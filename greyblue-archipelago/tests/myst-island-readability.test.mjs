import assert from 'node:assert/strict';
import {
  deriveMystIslandReadability,
  mystIslandReadabilityPublicState,
} from '../src/interface/myst-island-readability.js';

const base = Object.freeze({
  ready: true,
  isleLoaded: true,
  paused: false,
  flight: Object.freeze({ airborne: true, mode: 'cruise' }),
  collision: Object.freeze({ grounded: false, requiresRecovery: false }),
  surface: Object.freeze({ id: 'greyblue-isle', height: 18, surface: 'terrain' }),
});

assert.deepEqual(deriveMystIslandReadability({ ...base, ready: false }), { active: false, phase: null, text: '' });
assert.deepEqual(deriveMystIslandReadability({ ...base, isleLoaded: false }), { active: false, phase: null, text: '' });
assert.deepEqual(deriveMystIslandReadability({ ...base, surface: { id: 'generated-island-3' } }), { active: false, phase: null, text: '' });

const overflight = deriveMystIslandReadability(base);
assert.deepEqual(overflight, { active: true, phase: 'overflight', text: 'Island terrain below.' });
assert.deepEqual(mystIslandReadabilityPublicState(overflight), { active: true, phase: 'overflight' });

const ashore = deriveMystIslandReadability({
  ...base,
  flight: { airborne: false, mode: 'grounded' },
  collision: { grounded: true, requiresRecovery: false },
});
assert.deepEqual(ashore, { active: true, phase: 'ashore', text: 'Ashore on the island.' });

for (const state of [
  { ...base, paused: true },
  { ...base, flight: { airborne: true, mode: 'recovery' } },
  { ...base, collision: { grounded: false, requiresRecovery: true } },
  { ...base, restorePublishing: true },
  { ...base, explorationRestorePublishing: true },
]) {
  assert.equal(deriveMystIslandReadability(state).active, false);
}

assert.deepEqual(
  mystIslandReadabilityPublicState({ active: true, phase: 'secret-cove', coordinates: [1, 2, 3] }),
  { active: false, phase: null },
);
assert.deepEqual(Object.keys(mystIslandReadabilityPublicState(overflight)).sort(), ['active', 'phase']);

const caller = {
  ready: true,
  isleLoaded: true,
  flight: { airborne: true, mode: 'cruise' },
  collision: { grounded: false, requiresRecovery: false },
  surface: { id: 'greyblue-isle', hiddenGeometry: 'do-not-leak' },
};
const before = JSON.stringify(caller);
deriveMystIslandReadability(caller);
assert.equal(JSON.stringify(caller), before);

console.log('Myst Island readability tests passed');
