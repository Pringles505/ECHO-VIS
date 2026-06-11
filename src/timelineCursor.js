// Global timeline cursor shared across editor without triggering re-renders.
// KeyframePanel updates this; creation helpers read it to seed animStartTime.

let timelineCursorSec = 0;

export function setTimelineCursor(t) {
  const num = Number(t);
  if (!Number.isFinite(num)) return;
  timelineCursorSec = Math.max(0, num);
}

export function getTimelineCursor() {
  return timelineCursorSec;
}
