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
      // Alpha (node opacity) lets a morph fade the node in/out — e.g. make it disappear.
      // null = leave opacity untouched (falls back to the node's default of fully visible).
      alpha: Number.isFinite(morph?.alpha) ? clamp(morph.alpha, 0, 1) : null,
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
//
// Each morph keyframe defines a *complete form*: the latest morph wins, and any
// property the morph leaves unset falls back to the node's own default — never to
// an earlier morph's value. While a morph is active we blend from the previously
// committed form to this morph's form, so chained morphs transition smoothly (e.g.
// red → blue, or red → back-to-default) without flashing through the base color.
// This mirrors resolveMonitorTextColor used for the monitor value text.
export function getStyleMorphRenderState(node, timing, time) {
  const morphs = getNodeTextMorphs(node, timing);
  const emptyStyle = { fill: null, stroke: null, textColor: null, strokeWidth: null, cornerRadius: null, alpha: null };
  if (!morphs.length) {
    return { baseStyle: { ...emptyStyle }, targetStyle: null, progress: 0, hasActive: false, activeMorphId: null };
  }

  // Node defaults — the value an unset morph property resolves to.
  const def = {
    fill: node?.fill ?? null,
    stroke: node?.stroke ?? null,
    textColor: node?.textColor ?? null,
    strokeWidth: Number.isFinite(node?.strokeWidth) ? node.strokeWidth : null,
    cornerRadius: Number.isFinite(node?.cornerRadius) ? node.cornerRadius : null,
    // A node's default opacity is fully visible; a morph that leaves alpha unset
    // resolves back to this, so an explicit "disappear" can later be undone.
    alpha: Number.isFinite(node?.alpha) ? node.alpha : 1,
  };
  // A morph's resolved form: its explicit values, with unset properties = node default.
  const formOf = (morph) => ({
    fill: morph.fill ?? def.fill,
    stroke: morph.stroke ?? def.stroke,
    textColor: morph.textColor ?? def.textColor,
    strokeWidth: morph.strokeWidth ?? def.strokeWidth,
    cornerRadius: morph.cornerRadius ?? def.cornerRadius,
    alpha: morph.alpha ?? def.alpha,
  });

  let committed = { ...def };   // form before the first morph = the node's default form

  for (const morph of morphs) {
    if (time < morph.startTime) break;     // future morph: list is sorted, stop here
    const form = formOf(morph);
    const end = morph.startTime + morph.duration;
    if (time >= end) {
      committed = form;                    // morph finished: its form is now in effect
      continue;
    }
    const progress = clamp((time - morph.startTime) / morph.duration, 0, 1);
    return {
      baseStyle: { ...committed },
      targetStyle: form,
      progress,
      hasActive: true,
      activeMorphId: morph.id,
    };
  }

  return {
    baseStyle: { ...committed },
    targetStyle: null,
    progress: 0,
    hasActive: false,
    activeMorphId: null,
  };
}
