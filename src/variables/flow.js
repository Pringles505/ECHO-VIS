// A "variable web" is everything reachable downstream from a Variable node.
// Each web carries a single token along an ordered hop path; each hop is
// chained so a downstream link's token only starts once the upstream hop has
// finished — that way tokens don't appear at a node before they arrive.
const DEFAULT_HOP_DURATION = 0.6;

// `timeline` (optional) is the AnimationEngine timeline — used to look up each
// link's actual draw window so the token only starts a hop after the link is
// fully drawn AND the upstream hop has landed.
export function computeVariableWebs(nodes, links, options = {}) {
  const fallbackHopDuration = Math.max(0.05, options.hopDuration ?? DEFAULT_HOP_DURATION);
  const timeline = options.timeline ?? [];

  const linkDrawEndById = {};
  const nodeDrawEndById = {};
  for (const ev of timeline) {
    if (ev.type === 'link') linkDrawEndById[ev.id] = ev.start + ev.duration;
    else if (ev.type === 'node') nodeDrawEndById[ev.id] = ev.start + ev.duration;
  }

  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const linkById = new Map(links.map(l => [l.id, l]));
  const outgoing = new Map();
  for (const link of links) {
    if (!outgoing.has(link.fromId)) outgoing.set(link.fromId, []);
    outgoing.get(link.fromId).push(link);
  }

  const webs = [];
  for (const src of nodes) {
    if (src.type !== 'variable') continue;
    const variableName = (src.variableLabel ?? '').trim();
    const variableValue = (src.variableValue ?? '').trim();
    const variableTokenText = (src.tokenText ?? '').trim();
    if (!variableName && !variableValue && !variableTokenText) continue;

    const inputMode = src.inputMode ?? 'visual';
    const displayText = variableTokenText || variableValue || variableName;
    const hopDuration = Math.max(0.05, src.tokenHopDuration ?? fallbackHopDuration);
    const startOffset = Math.max(0, src.tokenStartOffset ?? 0);

    const nodeIds = new Set([src.id]);
    const linkIds = new Set();
    const tokenPath = []; // ordered list of link ids (BFS order)

    const queue = [src.id];
    const seenNodes = new Set([src.id]);
    while (queue.length) {
      const nid = queue.shift();
      // If this node kills the token for this variable, do not traverse further.
      const killer = nodeById.get(nid)?.tokenKillFor?.[src.id] ?? false;
      if (killer) continue;
      const outs = outgoing.get(nid) ?? [];
      for (const link of outs) {
        if (linkIds.has(link.id)) continue;
        linkIds.add(link.id);
        tokenPath.push(link.id);
        nodeIds.add(link.toId);
        if (!seenNodes.has(link.toId)) {
          seenNodes.add(link.toId);
          queue.push(link.toId);
        }
      }
    }

    // Chain origin: the variable node must be fully drawn before its token can leave.
    const variableDrawEnd =
      nodeDrawEndById[src.id] ??
      ((src.animStartTime ?? 0) + (src.animDuration ?? 0));
    const chainOrigin = variableDrawEnd + startOffset;

    const tokenTiming = {};
    const arrivalAtNode = { [src.id]: chainOrigin };
    let lastHopEnd = chainOrigin;
    for (const linkId of tokenPath) {
      const link = linkById.get(linkId);
      // Each hop has to wait for BOTH: the upstream hop to land, AND its own
      // link to finish drawing — otherwise the token flies along an invisible line.
      // When a link is explicitly bound to the token hop, do not wait for link draw end.
      const linkReady = link?.bindToTokenHop ? lastHopEnd : (linkDrawEndById[linkId] ?? lastHopEnd);
      const naturalStart = Math.max(lastHopEnd, linkReady);
      const varOverride = link?.tokenHopOverrides?.[src.id] ?? null;
      const hasVarSkip = varOverride ? Object.prototype.hasOwnProperty.call(varOverride, 'skip') : false;
      const hasVarDelay = varOverride ? Object.prototype.hasOwnProperty.call(varOverride, 'delay') : false;
      const hasVarDur = varOverride ? Object.prototype.hasOwnProperty.call(varOverride, 'duration') : false;
      const skipped = hasVarSkip ? !!varOverride.skip : !!link?.tokenHopSkip;
      const rawDelay = hasVarDelay ? varOverride.delay : (link?.tokenHopDelay ?? 0);
      // Allow negative delay for per-variable overrides to pull hop earlier than natural chain
      const delay = skipped ? 0 : (hasVarDelay ? (Number.isFinite(rawDelay) ? rawDelay : 0) : Math.max(0, rawDelay));
      const start = naturalStart + delay;
      // Per-link override beats the variable's default. null/undefined → fall back.
      const hopOverride = hasVarDur ? varOverride.duration : link?.tokenHopDuration;
      const effectiveHop = skipped
        ? 0
        : (hopOverride != null ? Math.max(0.05, hopOverride) : hopDuration);
      tokenTiming[linkId] = {
        start,
        duration: effectiveHop,
        delay,
        naturalStart,
        hasOverride: hopOverride != null,
        hasDelay: delay > 0,
        skipped,
      };
      lastHopEnd = start + effectiveHop;
      if (link && arrivalAtNode[link.toId] == null) {
        arrivalAtNode[link.toId] = lastHopEnd;
      }
    }

    webs.push({
      sourceNodeId: src.id,
      variableName,
      variableValue,
      displayText,
      inputMode,
      hopDuration,
      startOffset,
      chainOrigin,
      chainEnd: lastHopEnd,
      nodeIds,
      linkIds,
      tokenPath,
      tokenTiming,
      arrivalAtNode,
    });
  }
  return webs;
}

// Map link id → the web that owns it (first source wins on overlap).
export function buildWebByLinkId(webs) {
  const out = {};
  for (const web of webs) {
    for (const linkId of web.linkIds) {
      if (!out[linkId]) out[linkId] = web;
    }
  }
  return out;
}

// Back-compat: callers that only need the link → variable display text.
export function computeVariableFlowTextByLinkId(nodes, links) {
  const webs = computeVariableWebs(nodes, links);
  const out = {};
  for (const web of webs) {
    for (const linkId of web.linkIds) {
      if (out[linkId] == null) out[linkId] = web.displayText;
    }
  }
  return out;
}
