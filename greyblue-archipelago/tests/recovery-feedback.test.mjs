import assert from "node:assert/strict";
import test from "node:test";
import {
  createRecoveryFeedbackState,
  stepRecoveryFeedback,
} from "../src/core/recovery-feedback.js";
function step(state, overrides = {}) {
  return stepRecoveryFeedback(state, {
    explicitRecovery: false,
    requiresRecovery: false,
    reducedMotion: false,
    ...overrides,
  });
}

test("explicit recovery announces once and held truth cannot spam", () => {
  const initial = createRecoveryFeedbackState();
  const first = step(initial, { explicitRecovery: true });
  assert.deepEqual(first, {
    state: { latched: true },
    presentation: { announcement: "Recovery complete.", motion: "none" },
  });

  const held = step(first.state, { explicitRecovery: true });
  assert.deepEqual(held, {
    state: { latched: true },
    presentation: { announcement: null, motion: "none" },
  });
});

test("normal flight rearms feedback for a later explicit recovery", () => {
  const first = step(createRecoveryFeedbackState(), { explicitRecovery: true });
  const clear = step(first.state);
  assert.deepEqual(clear.state, { latched: false });
  assert.equal(clear.presentation.announcement, null);

  const later = step(clear.state, { explicitRecovery: true });
  assert.equal(later.presentation.announcement, "Recovery complete.");
});

test("collision requiresRecovery truth arms the same acknowledgement", () => {
  const result = step(createRecoveryFeedbackState(), { requiresRecovery: true });
  assert.deepEqual(result, {
    state: { latched: true },
    presentation: { announcement: "Recovery complete.", motion: "none" },
  });
});

test("ordinary flight and ground contact cannot synthesize recovery feedback", () => {
  const ordinaryFrames = [
    { airborne: true },
    { grounded: true, collisionReason: "grounded-contact" },
    { grounded: true, collisionReason: "touchdown" },
    { collided: true, collisionReason: "terrain-impact" },
  ];
  for (const frame of ordinaryFrames) {
    const result = step(createRecoveryFeedbackState(), frame);
    assert.deepEqual(result, {
      state: { latched: false },
      presentation: { announcement: null, motion: "none" },
    });
  }
});

test("reduced-motion preference preserves semantic acknowledgement without motion", () => {
  const standard = step(createRecoveryFeedbackState(), { explicitRecovery: true, reducedMotion: false });
  const reduced = step(createRecoveryFeedbackState(), { explicitRecovery: true, reducedMotion: true });
  assert.deepEqual(reduced.presentation, standard.presentation);
  assert.equal(reduced.presentation.motion, "none");
});

test("public result is bounded and ignores hidden-world detail", () => {
  const result = stepRecoveryFeedback(createRecoveryFeedbackState(), {
    explicitRecovery: true,
    requiresRecovery: false,
    position: { x: 123, y: 456, z: 789 },
    checkpointId: "secret-checkpoint",
    islandId: "hidden-island",
    regionId: "hidden-region",
    threshold: 42,
  });
  assert.deepEqual(Object.keys(result).sort(), ["presentation", "state"]);
  assert.deepEqual(Object.keys(result.state), ["latched"]);
  assert.deepEqual(Object.keys(result.presentation).sort(), ["announcement", "motion"]);
  assert.equal(JSON.stringify(result).includes("secret-checkpoint"), false);
  assert.equal(JSON.stringify(result).includes("hidden-island"), false);
  assert.equal(JSON.stringify(result).includes("hidden-region"), false);
  assert.equal(result.presentation.announcement, "Recovery complete.");
});

test("malformed prior state fails closed", () => {
  const result = stepRecoveryFeedback({ latched: "yes", position: { x: 1 } }, { explicitRecovery: true });
  assert.deepEqual(result.state, { latched: true });
  assert.equal(result.presentation.announcement, "Recovery complete.");
});
