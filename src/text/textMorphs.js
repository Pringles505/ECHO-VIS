export const DEFAULT_TEXT_MORPH_DURATION = 0.6;
export const DEFAULT_TEXT_MORPH_GAP = 0.35;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function normalizeTextMorphList(morphs = []) {
  return [...(morphs ?? [])]
    .map((morph, index) => ({
      id: morph?.id ?? `text-morph-${index}`,
      text: morph?.text ?? '',
      mode: morph?.mode === 'write' ? 'write' : 'fade',
      startTime: Number.isFinite(morph?.startTime) ? morph.startTime : 0,
      duration: Math.max(0.1, Number.isFinite(morph?.duration) ? morph.duration : DEFAULT_TEXT_MORPH_DURATION),
      // Optional appearance overrides for this morph window
      fill: morph?.fill ?? null,
      stroke: morph?.stroke ?? null,
      textColor: morph?.textColor ?? null,
      strokeWidth: Number.isFinite(morph?.strokeWidth) ? morph.strokeWidth : null,
      // Corner radius allows smooth rounded→pill transitions on rectangular shapes
      cornerRadius: Number.isFinite(morph?.cornerRadius) ? morph.cornerRadius : null,
    }))
    .sort((a, b) => a.startTime - b.startTime);
}

export function getNodeTextMorphs(node, timing = null) {
  const list = normalizeTextMorphList(node?.textMorphs ?? []);
  if (list.length) return list;
  if (!node?.morphText) return [];

  const start = node?.morphStartTime
    ?? (timing
      ? timing.start + (node?.morphStartDelay ?? timing.duration * 0.5)
      : 0);
  const duration = Math.max(0.1, node?.morphDuration ?? Math.max(0.4, timing?.duration ?? DEFAULT_TEXT_MORPH_DURATION));

  return [{
    id: 'legacy-text-morph',
    text: node.morphText,
    mode: node?.morphMode === 'write' ? 'write' : 'fade',
    startTime: start,
    duration,
  }];
}

export function getTextMorphById(node, morphId, timing = null) {
  return getNodeTextMorphs(node, timing).find(morph => morph.id === morphId) ?? null;
}

export function getNextTextMorphStart(node, timing = null) {
  const morphs = getNodeTextMorphs(node, timing);
  if (morphs.length) {
    const lastMorph = morphs[morphs.length - 1];
    return lastMorph.startTime + lastMorph.duration + DEFAULT_TEXT_MORPH_GAP;
  }

  if (timing) return timing.start + timing.duration + DEFAULT_TEXT_MORPH_GAP;
  return (node?.animStartTime ?? 0) + (node?.animDuration ?? 0.5) + DEFAULT_TEXT_MORPH_GAP;
}

export function getTextMorphRenderState(node, timing, time) {
  const morphs = getNodeTextMorphs(node, timing);
  let committedText = node?.label ?? '';

  for (const morph of morphs) {
    const progress = clamp((time - morph.startTime) / morph.duration, 0, 1);

    if (time < morph.startTime) {
      break;
    }
    if (progress >= 1) {
      committedText = morph.text;
      continue;
    }

    if (morph.mode === 'write') {
      const count = Math.max(0, Math.ceil(morph.text.length * progress));
      return {
        baseText: committedText,
        baseOpacity: progress > 0 ? 0 : 1,
        overlayText: morph.text.slice(0, count),
        overlayOpacity: progress > 0 ? 1 : 0,
        hasActiveMorph: true,
        activeMorphId: morph.id,
      };
    }

    return {
      baseText: committedText,
      baseOpacity: 1 - progress,
      overlayText: morph.text,
      overlayOpacity: progress,
      hasActiveMorph: true,
      activeMorphId: morph.id,
    };
  }

  return {
    baseText: committedText,
    baseOpacity: 1,
    overlayText: '',
    overlayOpacity: 0,
    hasActiveMorph: false,
    activeMorphId: null,
  };
}

// Compute appearance morphs (fill/stroke/textColor/strokeWidth/cornerRadius) over time.
// Similar to text morphs: properties commit once a morph completes; during an active
// morph we blend from committed base to this morph's target values.
export function getStyleMorphRenderState(node, timing, time) {
  const morphs = getNodeTextMorphs(node, timing);
  const committed = { fill: null, stroke: null, textColor: null, strokeWidth: null, cornerRadius: null };

  for (const morph of morphs) {
    const end = morph.startTime + morph.duration;
    if (time >= end) {
      if (morph.fill != null) committed.fill = morph.fill;
      if (morph.stroke != null) committed.stroke = morph.stroke;
      if (morph.textColor != null) committed.textColor = morph.textColor;
      if (morph.strokeWidth != null) committed.strokeWidth = morph.strokeWidth;
      if (morph.cornerRadius != null) committed.cornerRadius = morph.cornerRadius;
      continue;
    }
    if (time >= morph.startTime) {
      const progress = clamp((time - morph.startTime) / morph.duration, 0, 1);
      return {
        baseStyle: { ...committed },
        targetStyle: {
          fill: morph.fill,
          stroke: morph.stroke,
          textColor: morph.textColor,
          strokeWidth: morph.strokeWidth,
          cornerRadius: morph.cornerRadius,
        },
        progress,
        hasActive: true,
        activeMorphId: morph.id,
      };
    }
    // time < morph.startTime → break because list sorted by startTime
    break;
  }

  return {
    baseStyle: { ...committed },
    targetStyle: null,
    progress: 0,
    hasActive: false,
    activeMorphId: null,
  };
}
