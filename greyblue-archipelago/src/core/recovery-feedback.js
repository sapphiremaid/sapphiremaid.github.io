const RECOVERY_ANNOUNCEMENT = "Recovery complete.";
const QUIET_PRESENTATION = Object.freeze({ announcement: null, motion: "none" });

export function createRecoveryFeedbackState() {
  return Object.freeze({ latched: false });
}

export function stepRecoveryFeedback(state = createRecoveryFeedbackState(), frame = {}) {
  const prior = normalizeState(state);
  const requested = frame?.explicitRecovery === true || frame?.requiresRecovery === true;
  const nextState = Object.freeze({ latched: requested });

  if (!requested || prior.latched) {
    return Object.freeze({ state: nextState, presentation: QUIET_PRESENTATION });
  }

  return Object.freeze({
    state: nextState,
    presentation: Object.freeze({
      announcement: RECOVERY_ANNOUNCEMENT,
      motion: "none",
    }),
  });
}

function normalizeState(state) {
  return Object.freeze({ latched: state?.latched === true });
}
