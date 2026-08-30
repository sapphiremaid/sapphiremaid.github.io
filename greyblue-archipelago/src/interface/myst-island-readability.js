const HERO_ISLE_SURFACE = 'greyblue-isle';
const PHASES = new Set(['overflight', 'ashore']);
const INACTIVE = Object.freeze({ active: false, phase: null, text: '' });

function interrupted(state) {
  return state?.paused === true
    || state?.collision?.requiresRecovery === true
    || state?.flight?.mode === 'recovery'
    || Boolean(state?.restorePublishing || state?.explorationRestorePublishing);
}

export function deriveMystIslandReadability(state = {}) {
  if (state?.ready !== true || state?.isleLoaded !== true || interrupted(state)) return INACTIVE;
  if (state?.surface?.id !== HERO_ISLE_SURFACE) return INACTIVE;

  const grounded = state?.collision?.grounded === true || state?.flight?.airborne === false;
  const phase = grounded ? 'ashore' : 'overflight';
  return Object.freeze({
    active: true,
    phase,
    text: grounded ? 'Ashore on the island.' : 'Island terrain below.',
  });
}

export function mystIslandReadabilityPublicState(view) {
  const phase = PHASES.has(view?.phase) ? view.phase : null;
  return Object.freeze({ active: Boolean(view?.active && phase), phase });
}
