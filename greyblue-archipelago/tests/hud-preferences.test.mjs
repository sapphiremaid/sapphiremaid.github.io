import assert from 'node:assert/strict';
import test from 'node:test';
import {
  controlHintForSource,
  deriveHudPreferenceState,
  normalizeHudDensity,
  normalizeHudInputSource,
  toggleHudDensity,
} from '../src/interface/hud-preferences.js';

test('HUD density defaults focused and accepts only bounded values', () => {
  assert.equal(normalizeHudDensity('expanded'), 'expanded');
  assert.equal(normalizeHudDensity('focused'), 'focused');
  assert.equal(normalizeHudDensity('secret-route'), 'focused');
  assert.equal(normalizeHudDensity(null), 'focused');
});

test('density toggle is deterministic', () => {
  assert.equal(toggleHudDensity('focused'), 'expanded');
  assert.equal(toggleHudDensity('expanded'), 'focused');
  assert.equal(toggleHudDensity('malformed'), 'expanded');
});

test('input source is coarse, preserves mixed input, and fails soft', () => {
  assert.equal(normalizeHudInputSource('gamepad'), 'gamepad');
  assert.equal(normalizeHudInputSource('keyboard'), 'keyboard');
  assert.equal(normalizeHudInputSource('mixed'), 'mixed');
  assert.equal(normalizeHudInputSource('DualSense Wireless Controller'), 'keyboard');
});

test('public preference state contains no caller settings or device detail', () => {
  const settings = { hudDensity: 'expanded', hiddenRoute: 'isle-secret' };
  const result = deriveHudPreferenceState({ settings, inputSource: 'mixed' });
  assert.deepEqual(result.telemetry, { density: 'expanded', inputSource: 'mixed' });
  assert.equal('hiddenRoute' in result, false);
  assert.equal('hiddenRoute' in result.telemetry, false);
  assert.deepEqual(settings, { hudDensity: 'expanded', hiddenRoute: 'isle-secret' });
});

test('control hints expose useful bounded controls without device identity', () => {
  assert.match(controlHintForSource('keyboard'), /W\/S throttle/i);
  assert.match(controlHintForSource('keyboard'), /E fly\/land/i);
  assert.match(controlHintForSource('keyboard'), /F interact/i);
  assert.match(controlHintForSource('keyboard'), /R recover/i);
  assert.match(controlHintForSource('keyboard'), /H HUD/i);

  assert.match(controlHintForSource('gamepad'), /left stick steer\/climb/i);
  assert.match(controlHintForSource('gamepad'), /triggers throttle/i);
  assert.match(controlHintForSource('gamepad'), /right stick look/i);
  assert.match(controlHintForSource('gamepad'), /face buttons fly, interact, and recover/i);

  assert.match(controlHintForSource('mixed'), /keyboard \+ gamepad active/i);
  assert.match(controlHintForSource('mixed'), /H changes HUD density/i);

  for (const source of ['keyboard', 'gamepad', 'mixed']) {
    assert.doesNotMatch(controlHintForSource(source), /DualSense|Xbox|button array|region|route|coordinate/i);
  }
});
