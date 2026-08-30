const DENSITIES = new Set(['focused', 'expanded']);
const INPUT_SOURCES = new Set(['keyboard', 'gamepad', 'mixed']);

export function normalizeHudDensity(value) {
  return DENSITIES.has(value) ? value : 'focused';
}

export function toggleHudDensity(value) {
  return normalizeHudDensity(value) === 'focused' ? 'expanded' : 'focused';
}

export function normalizeHudInputSource(value) {
  return INPUT_SOURCES.has(value) ? value : 'keyboard';
}

export function deriveHudPreferenceState({ settings, inputSource } = {}) {
  const density = normalizeHudDensity(settings?.hudDensity);
  const source = normalizeHudInputSource(inputSource);
  return Object.freeze({
    density,
    inputSource: source,
    telemetry: Object.freeze({ density, inputSource: source }),
  });
}

export function controlHintForSource(inputSource) {
  const source = normalizeHudInputSource(inputSource);
  if (source === 'gamepad') {
    return 'Gamepad: left stick steer/climb · triggers throttle · right stick look · face buttons fly, interact, and recover.';
  }
  if (source === 'mixed') {
    return 'Keyboard + gamepad active · H changes HUD density; the interface toggle works with either input.';
  }
  return 'Keyboard: W/S throttle · A/D steer · Space/Shift climb/dive · E fly/land · F interact · R recover · H HUD.';
}
