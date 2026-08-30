const MIN_GROUND_SAMPLES = 2;
const MAX_GROUND_SAMPLES = 30;
const MIN_DEPARTURE_SPEED = 10;
const MIN_TRAVEL = 180;
const MIN_AIR_SAMPLES = 6;
const MIN_SPACED_SEGMENT = 2;
const MAX_STEP_DISTANCE = 220;
const PHASES = new Set(['touchdown', 'travel', 'complete']);

function finitePosition(position) {
  return position && [position.x, position.y, position.z].every(Number.isFinite);
}

function cleanId(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : '';
}

function cleanFrame(frame) {
  const position = frame?.position;
  const speed = Number(frame?.speed);
  if (!finitePosition(position) || !Number.isFinite(speed) || speed < 0) return null;
  const grounded = frame?.grounded === true;
  return Object.freeze({
    ready: frame?.ready === true,
    paused: frame?.paused === true,
    airborne: frame?.airborne === true && !grounded,
    grounded,
    recoveryActive: frame?.recoveryActive === true,
    restorePublishing: frame?.restorePublishing === true,
    crossingActive: frame?.crossingActive === true,
    position: Object.freeze({ x: position.x, y: position.y, z: position.z }),
    speed,
  });
}

function cleanTouchdown(touchdown) {
  const islandId = cleanId(touchdown?.islandId);
  const shelfId = cleanId(touchdown?.shelfId);
  const regionId = cleanId(touchdown?.regionId);
  if (!islandId || !shelfId || !regionId) return null;
  return Object.freeze({ islandId, shelfId, regionId });
}

function truthfulTouchdown(collision) {
  return collision?.grounded === true
    && collision?.reason === 'touchdown'
    && collision?.requiresRecovery === false;
}

export function deriveTouchAndGoShelfTouchdown({
  collision = null,
  position = null,
  islands = [],
  discoveredIslandIds = [],
  currentRegionId = null,
} = {}) {
  const regionId = cleanId(currentRegionId);
  if (!truthfulTouchdown(collision) || !finitePosition(position) || !regionId || !Array.isArray(islands)) return null;
  const discovered = discoveredIslandIds instanceof Set
    ? discoveredIslandIds
    : new Set(Array.isArray(discoveredIslandIds) ? discoveredIslandIds : []);
  let match = null;

  for (const island of islands) {
    const islandId = cleanId(island?.id);
    if (!islandId || cleanId(island?.regionId) !== regionId || !discovered.has(islandId) || !Array.isArray(island?.landingZones)) continue;
    for (const zone of island.landingZones) {
      const shelfId = cleanId(zone?.id);
      const x = Number(zone?.x);
      const z = Number(zone?.z);
      const radius = Number(zone?.radius);
      if (!shelfId || ![x, z, radius].every(Number.isFinite) || radius <= 0) continue;
      const distance = Math.hypot(position.x - x, position.z - z);
      if (!Number.isFinite(distance) || distance > radius) continue;
      if (!match || distance < match.distance) match = { islandId, shelfId, regionId, distance };
    }
  }

  if (!match) return null;
  return Object.freeze({ islandId: match.islandId, shelfId: match.shelfId, regionId: match.regionId });
}

export function createTouchAndGoLaunchState() {
  return Object.freeze({
    active: false,
    phase: null,
    completed: false,
    firstIslandId: null,
    firstShelfId: null,
    firstRegionId: null,
    groundSamples: 0,
    departed: false,
    lastPosition: null,
    travel: 0,
    airSamples: 0,
  });
}

function resetIncomplete() {
  return createTouchAndGoLaunchState();
}

function startAttempt(touchdown, frame) {
  return Object.freeze({
    ...createTouchAndGoLaunchState(),
    active: true,
    phase: 'touchdown',
    firstIslandId: touchdown.islandId,
    firstShelfId: touchdown.shelfId,
    firstRegionId: touchdown.regionId,
    groundSamples: 1,
    lastPosition: frame.position,
  });
}

export function stepTouchAndGoLaunch({ state, frame, touchdown = null } = {}) {
  const current = state && typeof state === 'object' ? state : createTouchAndGoLaunchState();
  if (current.completed === true) return current;

  const nextFrame = cleanFrame(frame);
  if (!nextFrame
    || !nextFrame.ready
    || nextFrame.paused
    || nextFrame.recoveryActive
    || nextFrame.restorePublishing
    || nextFrame.crossingActive) return current.active ? resetIncomplete() : current;

  const cleanLanding = cleanTouchdown(touchdown);
  if (!current.active) {
    return cleanLanding && nextFrame.grounded ? startAttempt(cleanLanding, nextFrame) : current;
  }

  if (current.departed && cleanLanding && nextFrame.grounded) {
    const distinctIsland = cleanLanding.islandId !== current.firstIslandId;
    const enoughTravel = current.travel >= MIN_TRAVEL && current.airSamples >= MIN_AIR_SAMPLES;
    if (!distinctIsland || !enoughTravel) return resetIncomplete();
    return Object.freeze({
      ...current,
      active: false,
      phase: 'complete',
      completed: true,
      lastPosition: nextFrame.position,
    });
  }

  if (!current.departed) {
    if (nextFrame.airborne) {
      if (current.groundSamples < MIN_GROUND_SAMPLES
        || current.groundSamples > MAX_GROUND_SAMPLES
        || nextFrame.speed < MIN_DEPARTURE_SPEED) return resetIncomplete();
      return Object.freeze({
        ...current,
        active: true,
        phase: 'travel',
        departed: true,
        lastPosition: nextFrame.position,
        airSamples: 1,
      });
    }

    if (!nextFrame.grounded) return resetIncomplete();
    if (cleanLanding && cleanLanding.islandId !== current.firstIslandId) return resetIncomplete();
    const groundSamples = current.groundSamples + 1;
    if (groundSamples > MAX_GROUND_SAMPLES) return resetIncomplete();
    return Object.freeze({ ...current, groundSamples, lastPosition: nextFrame.position });
  }

  if (!nextFrame.airborne) return resetIncomplete();
  const prior = finitePosition(current.lastPosition) ? current.lastPosition : nextFrame.position;
  const segment = Math.hypot(nextFrame.position.x - prior.x, nextFrame.position.z - prior.z);
  if (!Number.isFinite(segment) || segment > MAX_STEP_DISTANCE) return resetIncomplete();
  const spaced = segment >= MIN_SPACED_SEGMENT;
  return Object.freeze({
    ...current,
    active: true,
    phase: 'travel',
    lastPosition: nextFrame.position,
    travel: current.travel + (spaced ? segment : 0),
    airSamples: current.airSamples + (spaced ? 1 : 0),
  });
}

export function touchAndGoLaunchPublicState(state) {
  const completed = state?.completed === true;
  const phase = PHASES.has(state?.phase) ? state.phase : null;
  return Object.freeze({
    active: state?.active === true && !completed,
    phase,
    completed,
  });
}
