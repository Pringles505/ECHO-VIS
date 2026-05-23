import { buildLinkRenderData, getAnimatedArrowHead, getPointAtProgress } from '../links/linkGeometry';
import { pageColors } from '../../colorThemes';

export function computeLinkRenders(nodes, links) {
  const nodeMap = Object.fromEntries(nodes.map(node => [node.id, node]));
  const renders = {};

  for (const link of links) {
    const fromNode = nodeMap[link.fromId];
    const toNode = nodeMap[link.toId];
    if (!fromNode || !toNode) continue;
    renders[link.id] = buildLinkRenderData(link, fromNode, toNode, links, nodes);
  }

  return renders;
}

const easeOut3 = t => 1 - Math.pow(1 - t, 3);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hexToRgb(color) {
  if (!color || typeof color !== 'string' || !color.startsWith('#')) return null;
  const normalized = color.slice(1);
  const full = normalized.length === 3
    ? normalized.split('').map(char => char + char).join('')
    : normalized;
  const value = Number.parseInt(full, 16);
  if (Number.isNaN(value)) return null;
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function mixColor(from, to, progress) {
  if (!to) return from;
  if (!from) return to;
  const fromRgb = hexToRgb(from);
  const toRgb = hexToRgb(to);
  if (!fromRgb || !toRgb) return progress >= 1 ? to : from;
  const p = clamp(progress, 0, 1);
  const r = Math.round(fromRgb.r + (toRgb.r - fromRgb.r) * p);
  const g = Math.round(fromRgb.g + (toRgb.g - fromRgb.g) * p);
  const b = Math.round(fromRgb.b + (toRgb.b - fromRgb.b) * p);
  return `rgb(${r}, ${g}, ${b})`;
}

function ensureBaseAttr(node, attr, fallback) {
  const current = node.getAttr(attr);
  if (current != null) return current;
  node.setAttr(attr, fallback);
  return fallback;
}

const nodeCache = new WeakMap();

function getCachedNode(layer, selector) {
  let layerCache = nodeCache.get(layer);
  if (!layerCache) {
    layerCache = new Map();
    nodeCache.set(layer, layerCache);
  }
  if (layerCache.has(selector)) {
    return layerCache.get(selector);
  }
  const node = layer.findOne(selector);
  layerCache.set(selector, node);
  return node;
}

function applyNodeStateToId(layer, id, state) {
  const group = getCachedNode(layer, `#node-${id}`);
  const label = getCachedNode(layer, `#node-label-${id}`);
  const morphLabel = getCachedNode(layer, `#node-label-morph-${id}`);
  const body = getCachedNode(layer, `#node-body-${id}`);
  const badgeBg = getCachedNode(layer, `#node-sub-badge-bg-${id}`);
  const badgeText = getCachedNode(layer, `#node-sub-badge-text-${id}`);
  if (!group) return;

  // ── Area node handling ──────────────────────────────────────────────────────
  const areaRect = getCachedNode(layer, `#area-rect-${id}`);
  if (areaRect) {
    const baseW = areaRect.getAttr('baseWidth') ?? areaRect.width();
    const baseH = areaRect.getAttr('baseHeight') ?? areaRect.height();
    const animMode = areaRect.getAttr('areaAnimMode') ?? 'fade';

    if (animMode === 'draw') {
      // Grow from 0×0 at top-left, like a rubber-band selection being drawn
      const p = state.textProgress; // raw linear 0→1
      const eased = easeOut3(p);
      areaRect.width(Math.max(0, baseW * eased));
      areaRect.height(Math.max(0, baseH * eased));
      group.opacity(p > 0 ? 1 : 0);
      group.scaleX(1);
      group.scaleY(1);
      // Label fades in during the second half
      const areaLabel = getCachedNode(layer, `#area-label-${id}`);
      if (areaLabel) areaLabel.opacity(p < 0.5 ? 0 : Math.min(1, (p - 0.5) * 2));
      return;
    }

    // 'fade' mode — ensure the rect stays at its real dimensions and let
    // the group opacity/scale animation below handle the fade.
    areaRect.width(baseW);
    areaRect.height(baseH);
    const areaLabel = getCachedNode(layer, `#area-label-${id}`);
    if (areaLabel) areaLabel.opacity(1);
  }
  // ── end area handling ───────────────────────────────────────────────────────

  group.opacity(state.opacity);
  const scale = state.scale * (state.popupProgress > 0 ? 1.04 : 1);
  group.scaleX(scale);
  group.scaleY(scale);

  // If popup is active, ensure the node is on top of siblings (only once)
  if (state.popupProgress > 0) {
    if (!group.getAttr('isPopupActive')) {
      group.moveToTop();
      group.setAttr('isPopupActive', true);
    }
  } else if (group.getAttr('isPopupActive')) {
    group.setAttr('isPopupActive', false);
  }

  // Fail X: fades in during the last 30% of the node's entry animation
  const failMark = getCachedNode(layer, `#node-fail-${id}`);
  if (failMark) {
    const xOpacity = state.opacity < 0.55 ? 0 : Math.min(1, (state.opacity - 0.55) / 0.45);
    failMark.opacity(xOpacity);
  }

  if (label) {
    const baseText = label.getAttr('baseText') ?? label.text();
    const baseFill = ensureBaseAttr(label, 'baseFill', label.fill());
    if (label.getAttr('independentText')) {
      if (state.textMode === 'write') {
        const charCount = Math.max(0, Math.ceil(baseText.length * (state.textProgress ?? 1)));
        label.text(baseText.slice(0, charCount));
      } else {
        label.text(baseText);
      }
      label.opacity(1);
    } else {
      label.text(state.labelText ?? baseText);
      label.opacity(state.labelOpacity ?? 1);
    }
    label.fill(mixColor(baseFill, state.targetTextColor, state.transformProgress ?? 0));
  }

  if (morphLabel) {
    const morphBaseFill = ensureBaseAttr(morphLabel, 'baseFill', morphLabel.fill());
    if (morphLabel.getAttr('independentText')) {
      morphLabel.text('');
      morphLabel.opacity(0);
    } else {
      morphLabel.text(state.morphLabelText ?? '');
      morphLabel.opacity(state.morphLabelOpacity ?? 0);
    }
    morphLabel.fill(mixColor(morphBaseFill, state.targetTextColor, state.transformProgress ?? 0));
  }

  const transformBody = getCachedNode(layer, `#node-body-transform-${id}`);
  const shadow = getCachedNode(layer, `#node-shadow-${id}`);
  const highlight = getCachedNode(layer, `#node-highlight-${id}`);
  const transformHighlight = getCachedNode(layer, `#node-highlight-transform-${id}`);

  if (body) {
    const isPopupActive = state.popupProgress > 0;
    const progress = state.transformProgress ?? 0;

    if (transformBody) {
      // Cross-fade: original body fades out, transform body (with target shape + colors) fades in.
      body.opacity(1 - progress);
      transformBody.opacity(progress);
      if (shadow) shadow.opacity(1 - progress);
      if (highlight) highlight.opacity(1 - progress);
      if (transformHighlight) transformHighlight.opacity(progress);

      // If popup is active, highlight the original body (which is still visible as it fades out/in)
      if (isPopupActive) {
        const baseStroke = body.getAttr('baseStroke') ?? body.stroke();
        const baseStrokeWidth = body.getAttr('baseStrokeWidth') ?? body.strokeWidth();
        body.stroke(mixColor(baseStroke, pageColors.purpleAccent, 0.6)); // Purple highlight
        body.strokeWidth(baseStrokeWidth + 1.5);
      } else {
        const baseStroke = body.getAttr('baseStroke') ?? body.stroke();
        const baseStrokeWidth = body.getAttr('baseStrokeWidth') ?? body.strokeWidth();
        body.stroke(baseStroke);
        body.strokeWidth(baseStrokeWidth);
      }
    } else {
      // Legacy color-mix path
      const baseFill = ensureBaseAttr(body, 'baseFill', body.fill());
      const baseStroke = ensureBaseAttr(body, 'baseStroke', body.stroke());
      const baseStrokeWidth = ensureBaseAttr(body, 'baseStrokeWidth', body.strokeWidth());
      const baseCornerRadius = typeof body.cornerRadius === 'function'
        ? ensureBaseAttr(body, 'baseCornerRadius', body.cornerRadius())
        : null;

      if (isPopupActive) {
        body.fill(baseFill);
        body.stroke(mixColor(baseStroke, pageColors.purpleAccent, 0.6));
        body.strokeWidth(baseStrokeWidth + 1.5);
      } else {
        body.fill(mixColor(baseFill, state.targetFill, progress));
        body.stroke(mixColor(baseStroke, state.targetStroke, progress));
        if (state.targetStrokeWidth != null) {
          body.strokeWidth(lerp(baseStrokeWidth, state.targetStrokeWidth, progress));
        }
        if (baseCornerRadius != null && state.targetCornerRadius != null && typeof body.cornerRadius === 'function') {
          body.cornerRadius(lerp(baseCornerRadius, state.targetCornerRadius, progress));
        }
      }
    }
  }

  if (badgeBg) {
    const baseOpacity = ensureBaseAttr(badgeBg, 'baseOpacity', badgeBg.opacity());
    const targetOpacity = state.targetShowSubBadge == null || state.targetShowSubBadge ? 1 : 0;
    badgeBg.opacity(lerp(baseOpacity, targetOpacity, state.transformProgress ?? 0));
  }
  if (badgeText) {
    const baseOpacity = ensureBaseAttr(badgeText, 'baseOpacity', badgeText.opacity());
    const targetOpacity = state.targetShowSubBadge == null || state.targetShowSubBadge ? 1 : 0;
    badgeText.opacity(lerp(baseOpacity, targetOpacity, state.transformProgress ?? 0));
  }
}

function applyLinkStateToId(layer, id, state, linkRenders, opts = {}) {
  const shaft = getCachedNode(layer, `#link-shaft-${id}`);
  const head = getCachedNode(layer, `#link-head-${id}`);
  const token = getCachedNode(layer, `#link-token-${id}`);
  const tokenLabel = getCachedNode(layer, `#link-token-label-${id}`);
  if (!shaft) return;

  const renderData = linkRenders[id];
  const drawLength = renderData?.visibleLength ?? renderData?.length ?? 200;
  const totalLength = renderData?.length ?? drawLength;

  // If bound to token hop, override draw progress to match hop timing
  const tNowLink = opts.currentTime ?? 0;
  const isBoundDraw = !!opts.bindToTokenHopById?.[id];
  let drawProgress = state.progress;
  if (isBoundDraw) {
    const boundMeta = opts.bindMetaById?.[id] ?? { offset: 0, scale: 1 };
    let web = opts.webByLinkId?.[id] ?? null;
    let timing = web?.tokenTiming?.[id] ?? null;
    if (!timing) {
      for (const w of opts.webs ?? []) {
        const tt = w?.tokenTiming?.[id];
        if (tt) { web = w; timing = tt; break; }
      }
    }
    if (timing && !timing.skipped && web?.inputMode !== 'silent') {
      const manualStart = opts.linkStartOverrideById?.[id];
      const start = (manualStart ?? ((timing.start ?? 0) + (Number.isFinite(boundMeta.offset) ? boundMeta.offset : 0)));
      const manualDur = opts.linkDurationOverrideById?.[id];
      const dur = Math.max(0.0001, manualDur ?? ((timing.duration ?? 0.0001) * (Number.isFinite(boundMeta.scale) && boundMeta.scale > 0 ? boundMeta.scale : 1)));
      const raw = (tNowLink - start) / dur;
      drawProgress = easeOut3(Math.max(0, Math.min(1, raw)));
    }
  }

  shaft.opacity(drawProgress > 0.001 ? 1 : 0);

  if (drawProgress >= 1) {
    shaft.dashEnabled(false);
  } else {
    shaft.dashEnabled(true);
    shaft.dash([drawLength, totalLength + drawLength]);
    shaft.dashOffset(drawLength * (1 - drawProgress));
  }

  if (head && renderData) {
    const isBoundForHead = !!opts.bindToTokenHopById?.[id];
    if (isBoundForHead) {
      // Hide arrow head entirely when following token timing
      head.opacity(0);
    } else {
      const animatedHead = getAnimatedArrowHead(renderData, state.progress);
      head.points(animatedHead.points);
      head.opacity(head.getAttr('showTip') ? animatedHead.opacity : 0);
    }
  }

  // Token rendering:
  // - Normally driven by variable web hop timing (independent of draw progress)
  // - If a link is bound to a token hop, keep the token at the drawing tip using draw progress
  if (token && renderData) {
    const tNow = opts.currentTime ?? 0;
    const primaryWeb = opts.webByLinkId?.[id];
    const primaryTiming = primaryWeb?.tokenTiming?.[id];
    let web = primaryWeb;
    let timing = primaryTiming;
    const isBound = !!opts.bindToTokenHopById?.[id];

    const isActive = (w, tt) => (
      !!w && !!tt && !tt.skipped && w.inputMode !== 'silent' && tNow >= tt.start && tNow <= tt.start + tt.duration
    );

    if (!isActive(web, timing)) {
      // Fallback: find any active web for this link at the current time
      const webs = opts.webs ?? [];
      let found = null;
      for (const w of webs) {
        const tt = w?.tokenTiming?.[id];
        if (isActive(w, tt)) { found = [w, tt]; break; }
      }
      if (found) { web = found[0]; timing = found[1]; }
    }

    if (isBound) {
      // When bound, token rides the drawing tip based on draw progress
      if (drawProgress <= 0 || drawProgress > 1) {
        token.opacity(0);
      } else {
        const { point } = getPointAtProgress(renderData, drawProgress, true);
        token.x(point.x);
        token.y(point.y);
        token.opacity(1);
        if (tokenLabel) tokenLabel.text((web?.displayText ?? '') || '');
      }
    } else {
      if (!isActive(web, timing)) {
        token.opacity(0);
      } else {
        const tokenProgress = (tNow - timing.start) / timing.duration;
        const { point } = getPointAtProgress(renderData, tokenProgress, true);
        token.x(point.x);
        token.y(point.y);
        token.opacity(1);
        if (tokenLabel) tokenLabel.text(web.displayText ?? '');
      }
    }
  }

  // Fail X: fades in as the drawing front crosses the midpoint (~50% progress)
  const failMark = getCachedNode(layer, `#link-fail-${id}`);
  if (failMark) {
    const xOpacity = state.progress < 0.42 ? 0 : Math.min(1, (state.progress - 0.42) / 0.2);
    failMark.opacity(xOpacity);
  }
}

function formatMonitorTemplate(template, web) {
  const value = web?.variableValue || web?.variableName || '';
  const name = web?.variableName || '';
  if (!template) return value;
  return template.replace(/\{value\}/g, value).replace(/\{name\}/g, name);
}

function applyMonitorStates(layer, options, currentTime) {
  const monitors = options.monitors;
  if (!monitors || !monitors.length) return;
  const webs = options.webs ?? [];

  for (const monitor of monitors) {
    const valueNode = getCachedNode(layer, `#monitor-value-${monitor.id}`);
    const nextNode = getCachedNode(layer, `#monitor-value-next-${monitor.id}`);
    if (!valueNode) continue;
    const web = webs.find(w => w.sourceNodeId === monitor.variableNodeId);
    const watches = monitor.monitorWatches ?? [];
    const initialValue = monitor.initialValue ?? '';

    // Determine the latest arrived watch (<= currentTime) and the immediate previous one
    let best = null;
    let prev = null;
    if (web && watches.length) {
      const arrivals = watches
        .map(w => ({ w, at: web.arrivalAtNode?.[w.nodeId] }))
        .filter(item => item.at != null)
        .sort((a, b) => a.at - b.at);
      for (const item of arrivals) {
        if (item.at <= currentTime) {
          if (!best || item.at >= best.at) {
            prev = best;
            best = item;
          }
        } else {
          break;
        }
      }
    }

    const prevText = prev ? formatMonitorTemplate(prev.w.template, web) : initialValue;
    const targetText = best ? formatMonitorTemplate(best.w.template, web) : initialValue;

    const FADE_DUR = 0.25;
    if (!best) {
      // No value yet — show initial
      valueNode.text(initialValue);
      valueNode.opacity(1);
      if (nextNode) nextNode.opacity(0);
      continue;
    }

    const dt = currentTime - best.at;
    if (!nextNode) {
      // No overlay available — snap to current text
      valueNode.text(dt >= FADE_DUR ? targetText : prevText);
      valueNode.opacity(1);
      continue;
    }

    if (dt <= 0) {
      // Before change time — show previous fully
      valueNode.text(prevText);
      valueNode.opacity(1);
      nextNode.text('');
      nextNode.opacity(0);
      continue;
    }

    if (dt < FADE_DUR) {
      const p = Math.max(0, Math.min(1, dt / FADE_DUR));
      valueNode.text(prevText);
      valueNode.opacity(1 - p);
      nextNode.text(targetText);
      nextNode.opacity(p);
      continue;
    }

    // After fade — show target fully
    valueNode.text(targetText);
    valueNode.opacity(1);
    nextNode.text('');
    nextNode.opacity(0);
  }
}

export function applyAnimState(layer, animState, linkRenders, mirrorBindings = null, options = {}) {
  for (const [id, state] of Object.entries(animState.nodeStates)) {
    applyNodeStateToId(layer, id, state);
    for (const mirrorId of mirrorBindings?.nodeIdsBySourceId?.[id] ?? []) {
      applyNodeStateToId(layer, mirrorId, state);
    }
  }

  for (const [id, state] of Object.entries(animState.linkStates)) {
    applyLinkStateToId(layer, id, state, linkRenders, options);
    for (const mirrorId of mirrorBindings?.linkIdsBySourceId?.[id] ?? []) {
      applyLinkStateToId(layer, mirrorId, state, linkRenders, options);
    }
  }

  applyMonitorStates(layer, options, options.currentTime ?? 0);
}

function resetNodeById(layer, id) {
  const group = getCachedNode(layer, `#node-${id}`);
  const label = getCachedNode(layer, `#node-label-${id}`);
  const morphLabel = getCachedNode(layer, `#node-label-morph-${id}`);
  const body = getCachedNode(layer, `#node-body-${id}`);
  const highlight = getCachedNode(layer, `#node-highlight-${id}`);
  const badgeBg = getCachedNode(layer, `#node-sub-badge-bg-${id}`);
  const badgeText = getCachedNode(layer, `#node-sub-badge-text-${id}`);
  if (!group) return;
  group.opacity(1);
  group.scaleX(1);
  group.scaleY(1);
  group.setAttr('isPopupActive', false);
  if (label) label.text(label.getAttr('baseText') ?? label.text());
  if (label) label.opacity(1);
  if (label) label.fill(label.getAttr('baseFill') ?? label.fill());
  if (morphLabel) {
    morphLabel.text('');
    morphLabel.opacity(0);
    morphLabel.fill(morphLabel.getAttr('baseFill') ?? morphLabel.fill());
  }
  if (body) {
    body.opacity(1);
    body.fill(body.getAttr('baseFill') ?? body.fill());
    body.stroke(body.getAttr('baseStroke') ?? body.stroke());
    body.strokeWidth(body.getAttr('baseStrokeWidth') ?? body.strokeWidth());
  }
  if (highlight) highlight.opacity(1);
  const shadowReset = getCachedNode(layer, `#node-shadow-${id}`);
  if (shadowReset) shadowReset.opacity(1);
  const transformBodyReset = getCachedNode(layer, `#node-body-transform-${id}`);
  if (transformBodyReset) transformBodyReset.opacity(0);
  const transformHighlightReset = getCachedNode(layer, `#node-highlight-transform-${id}`);
  if (transformHighlightReset) transformHighlightReset.opacity(0);
  if (badgeBg) badgeBg.opacity(badgeBg.getAttr('baseOpacity') ?? 1);
  if (badgeText) badgeText.opacity(badgeText.getAttr('baseOpacity') ?? 1);

  const failMark = getCachedNode(layer, `#node-fail-${id}`);
  if (failMark) failMark.opacity(1);

  // Area reset — restore rect to full dimensions and label to full opacity
  const areaRect = getCachedNode(layer, `#area-rect-${id}`);
  if (areaRect) {
    areaRect.width(areaRect.getAttr('baseWidth') ?? areaRect.width());
    areaRect.height(areaRect.getAttr('baseHeight') ?? areaRect.height());
  }
  const areaLabel = getCachedNode(layer, `#area-label-${id}`);
  if (areaLabel) areaLabel.opacity(1);
}

function resetLinkById(layer, id) {
  const shaft = getCachedNode(layer, `#link-shaft-${id}`);
  const head = getCachedNode(layer, `#link-head-${id}`);
  const token = getCachedNode(layer, `#link-token-${id}`);
  if (!shaft) return;

  shaft.dashEnabled(false);
  shaft.opacity(1);
  if (head) {
    head.points(head.getAttr('basePoints') ?? head.points());
    head.opacity(head.getAttr('showTip') ? 1 : 0);
  }

  const failMark = getCachedNode(layer, `#link-fail-${id}`);
  if (failMark) failMark.opacity(1);
  if (token) token.opacity(0);
}

export function resetAnimState(layer, nodes, links, mirrorBindings = null) {
  for (const node of nodes) {
    resetNodeById(layer, node.id);
    for (const mirrorId of mirrorBindings?.nodeIdsBySourceId?.[node.id] ?? []) {
      resetNodeById(layer, mirrorId);
    }
    if (node.type === 'monitor') {
      const valueNode = getCachedNode(layer, `#monitor-value-${node.id}`);
      if (valueNode) valueNode.text(node.initialValue ?? '');
    }
  }

  for (const link of links) {
    resetLinkById(layer, link.id);
    for (const mirrorId of mirrorBindings?.linkIdsBySourceId?.[link.id] ?? []) {
      resetLinkById(layer, mirrorId);
    }
  }

  layer.draw();
}
