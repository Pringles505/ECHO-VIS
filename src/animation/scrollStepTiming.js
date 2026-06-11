// Keyframed scroll steps for a scrolling Area in "stepped" mode.
//
// Each step is a timeline keyframe { id, time, duration }: at `time` the chain
// advances exactly one tile over `duration` seconds (eased). Steps accumulate, so
// after N steps the chain has moved N tiles. This lets the user place each ratchet
// click wherever they want on the timeline, like any other keyframe.

export const DEFAULT_SCROLL_STEP_DURATION = 0.4;

export function normalizeScrollSteps(steps = []) {
  if (!Array.isArray(steps)) return [];
  return steps
    .filter(Boolean)
    .map((step, index) => ({
      ...step,
      id: step.id ?? `scroll-step-${index}`,
      time: Number.isFinite(step.time) ? Math.max(0, step.time) : 0,
      duration: Number.isFinite(step.duration) && step.duration > 0
        ? step.duration
        : DEFAULT_SCROLL_STEP_DURATION,
    }))
    .sort((a, b) => a.time - b.time);
}

function easeInOut(p) {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

// Total tiles advanced by `time`, summing each step's eased progress. A completed
// step contributes 1 whole tile; the in-progress one contributes a fraction.
export function getScrollStepTiles(steps, time) {
  let tiles = 0;
  for (const step of steps) {
    if (time <= step.time) continue;
    const p = Math.max(0, Math.min(1, (time - step.time) / Math.max(0.0001, step.duration)));
    tiles += easeInOut(p);
  }
  return tiles;
}
