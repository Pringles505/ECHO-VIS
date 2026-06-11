export const DEFAULT_NODE_FAILURE_DURATION = 0.8;

export function normalizeNodeFailureKeyframes(keyframes = []) {
  if (!Array.isArray(keyframes)) return [];
  return keyframes
    .filter(Boolean)
    .map((keyframe, index) => ({
      ...keyframe,
      id: keyframe.id ?? `node-failure-${index}`,
      startTime: Number.isFinite(keyframe.startTime) ? Math.max(0, keyframe.startTime) : 0,
      duration: Number.isFinite(keyframe.duration) && keyframe.duration > 0
        ? keyframe.duration
        : DEFAULT_NODE_FAILURE_DURATION,
    }))
    .sort((a, b) => a.startTime - b.startTime);
}

export function getNodeFailureOpacity(node, time) {
  if (node?.failing) return 1;

  let opacity = 0;
  for (const keyframe of normalizeNodeFailureKeyframes(node?.failureKeyframes)) {
    const endTime = keyframe.startTime + keyframe.duration;
    if (time < keyframe.startTime || time > endTime) continue;

    const fadeDuration = Math.min(0.15, keyframe.duration / 3);
    if (fadeDuration <= 0) return 1;
    const fadeOut = Math.max(0, Math.min(1, (endTime - time) / fadeDuration));
    opacity = Math.max(opacity, 1 - Math.pow(1 - fadeOut, 3));
  }
  return opacity;
}
