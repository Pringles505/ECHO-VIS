const SNAP_DISTANCE = 10;
const UNSNAP_DISTANCE = 22;
const GUIDE_SHOW_DISTANCE = 56;
const GUIDE_PAD = 18;

function getRelativeSide(movingBox, stationaryNode) {
  const movingCx = movingBox.x + movingBox.width / 2;
  const movingCy = movingBox.y + movingBox.height / 2;
  const stationaryCx = stationaryNode.x + stationaryNode.width / 2;
  const stationaryCy = stationaryNode.y + stationaryNode.height / 2;
  const dx = movingCx - stationaryCx;
  const dy = movingCy - stationaryCy;

  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

function buildGuideMatch(movingBox, stationaryNode) {
  const side = getRelativeSide(movingBox, stationaryNode);
  const left = stationaryNode.x;
  const right = stationaryNode.x + stationaryNode.width;
  const top = stationaryNode.y;
  const bottom = stationaryNode.y + stationaryNode.height;
  const midX = stationaryNode.x + stationaryNode.width / 2;
  const midY = stationaryNode.y + stationaryNode.height / 2;
  const movingLeft = movingBox.x;
  const movingTop = movingBox.y;
  const movingRight = movingBox.x + movingBox.width;
  const movingBottom = movingBox.y + movingBox.height;
  const movingMidX = movingBox.x + movingBox.width / 2;
  const movingMidY = movingBox.y + movingBox.height / 2;

  if (side === 'right') {
    const farX = Math.max(right, movingRight) + GUIDE_PAD;
    return {
      guides: [
        { id: `${stationaryNode.id}-rt`, points: [right, top, farX, top] },
        { id: `${stationaryNode.id}-rm`, points: [right, midY, farX, midY] },
        { id: `${stationaryNode.id}-rb`, points: [right, bottom, farX, bottom] },
      ],
      candidates: [
        { axis: 'y', snapPos: top, delta: Math.abs(movingBox.y - top) },
        { axis: 'y', snapPos: midY - movingBox.height / 2, delta: Math.abs(movingMidY - midY) },
        { axis: 'y', snapPos: bottom - movingBox.height, delta: Math.abs(movingBox.y - (bottom - movingBox.height)) },
      ],
    };
  }

  if (side === 'left') {
    const farX = Math.min(left, movingLeft) - GUIDE_PAD;
    return {
      guides: [
        { id: `${stationaryNode.id}-lt`, points: [farX, top, left, top] },
        { id: `${stationaryNode.id}-lm`, points: [farX, midY, left, midY] },
        { id: `${stationaryNode.id}-lb`, points: [farX, bottom, left, bottom] },
      ],
      candidates: [
        { axis: 'y', snapPos: top, delta: Math.abs(movingBox.y - top) },
        { axis: 'y', snapPos: midY - movingBox.height / 2, delta: Math.abs(movingMidY - midY) },
        { axis: 'y', snapPos: bottom - movingBox.height, delta: Math.abs(movingBox.y - (bottom - movingBox.height)) },
      ],
    };
  }

  if (side === 'bottom') {
    const farY = Math.max(bottom, movingBottom) + GUIDE_PAD;
    return {
      guides: [
        { id: `${stationaryNode.id}-bl`, points: [left, bottom, left, farY] },
        { id: `${stationaryNode.id}-bm`, points: [midX, bottom, midX, farY] },
        { id: `${stationaryNode.id}-br`, points: [right, bottom, right, farY] },
      ],
      candidates: [
        { axis: 'x', snapPos: left, delta: Math.abs(movingBox.x - left) },
        { axis: 'x', snapPos: midX - movingBox.width / 2, delta: Math.abs(movingMidX - midX) },
        { axis: 'x', snapPos: right - movingBox.width, delta: Math.abs(movingBox.x - (right - movingBox.width)) },
      ],
    };
  }

  const farY = Math.min(top, movingTop) - GUIDE_PAD;
  return {
    guides: [
      { id: `${stationaryNode.id}-tl`, points: [left, farY, left, top] },
      { id: `${stationaryNode.id}-tm`, points: [midX, farY, midX, top] },
      { id: `${stationaryNode.id}-tr`, points: [right, farY, right, top] },
    ],
    candidates: [
      { axis: 'x', snapPos: left, delta: Math.abs(movingBox.x - left) },
      { axis: 'x', snapPos: midX - movingBox.width / 2, delta: Math.abs(movingMidX - midX) },
      { axis: 'x', snapPos: right - movingBox.width, delta: Math.abs(movingBox.x - (right - movingBox.width)) },
    ],
  };
}

export function collectGuideMatches(movingBox, allNodes) {
  const matches = [];
  for (const stationaryNode of allNodes) {
    if (stationaryNode.id === movingBox.id) continue;
    const match = buildGuideMatch(movingBox, stationaryNode);
    const bestCandidate = match.candidates.reduce((best, candidate) => (
      !best || candidate.delta < best.delta ? candidate : best
    ), null);

    if (!bestCandidate) continue;

    matches.push({
      stationaryId: stationaryNode.id,
      axis: bestCandidate.axis,
      delta: bestCandidate.delta,
      snapPos: bestCandidate.snapPos,
      guides: match.guides,
    });
  }

  return matches.sort((a, b) => a.delta - b.delta);
}

// ---------------------------------------------------------------------------
// Orthogonal ("90°") joint snapping — draw.io style.
//
// When a link bend point (joint) is dragged, we want it to easily snap so the
// segments connecting it to its immediate neighbours become exactly horizontal
// or vertical. `neighbors` are the route points on either side of the joint
// (already in the same render space as the dragged point).
// ---------------------------------------------------------------------------
const ORTHO_SNAP_DISTANCE = 8;
const ORTHO_UNSNAP_DISTANCE = 16;
const ORTHO_GUIDE_PAD = 24;

// For a dragged joint at `point`, collect the candidate axis snaps that make a
// segment to a neighbour orthogonal, plus the guide line to draw for each.
export function collectOrthogonalMatches(point, neighbors) {
  const matches = [];
  for (const neighbor of neighbors) {
    if (!neighbor) continue;
    // Snapping x to the neighbour's x makes that segment vertical.
    matches.push({
      kind: 'ortho',
      axis: 'x',
      snapPos: neighbor.x,
      delta: Math.abs(point.x - neighbor.x),
      neighbor,
    });
    // Snapping y to the neighbour's y makes that segment horizontal.
    matches.push({
      kind: 'ortho',
      axis: 'y',
      snapPos: neighbor.y,
      delta: Math.abs(point.y - neighbor.y),
      neighbor,
    });
  }
  return matches.sort((a, b) => a.delta - b.delta);
}

function buildOrthoGuide(point, match) {
  // After snapping, build the dashed alignment line between joint and neighbour.
  const style = { kind: 'ortho', stroke: '#22d3a6', strokeWidth: 1.25, dash: [4, 4], opacity: 0.95 };
  if (match.axis === 'x') {
    const x = match.snapPos;
    const y1 = Math.min(point.y, match.neighbor.y) - ORTHO_GUIDE_PAD;
    const y2 = Math.max(point.y, match.neighbor.y) + ORTHO_GUIDE_PAD;
    return { id: `ortho-x-${x}`, points: [x, y1, x, y2], ...style };
  }
  const y = match.snapPos;
  const x1 = Math.min(point.x, match.neighbor.x) - ORTHO_GUIDE_PAD;
  const x2 = Math.max(point.x, match.neighbor.x) + ORTHO_GUIDE_PAD;
  return { id: `ortho-y-${y}`, points: [x1, y, x2, y], ...style };
}

// Resolve orthogonal snapping for a dragged joint. Maintains its own sticky
// snap state per-axis (passed in/out via `state`) so a snapped axis stays
// snapped until dragged past the unsnap threshold — mirroring symmetry snap.
// Returns { point, guides, state }.
export function resolveOrthogonalSnap(rawPoint, neighbors, state) {
  const next = { x: rawPoint.x, y: rawPoint.y };
  const active = state ?? { x: null, y: null };
  const nextState = { x: null, y: null };
  const guides = [];

  for (const axis of ['x', 'y']) {
    const activeAxis = active[axis];
    // Sticky: keep the existing snap while within the unsnap distance.
    if (activeAxis != null && Math.abs(rawPoint[axis] - activeAxis.snapPos) <= ORTHO_UNSNAP_DISTANCE) {
      next[axis] = activeAxis.snapPos;
      nextState[axis] = activeAxis;
      continue;
    }
    // Otherwise look for the nearest neighbour alignment on this axis.
    let best = null;
    for (const neighbor of neighbors) {
      if (!neighbor) continue;
      const delta = Math.abs(rawPoint[axis] - neighbor[axis]);
      if (delta <= ORTHO_SNAP_DISTANCE && (!best || delta < best.delta)) {
        best = { axis, snapPos: neighbor[axis], delta, neighbor };
      }
    }
    if (best) {
      next[axis] = best.snapPos;
      nextState[axis] = best;
    }
  }

  for (const axis of ['x', 'y']) {
    if (nextState[axis]) guides.push(buildOrthoGuide(next, nextState[axis]));
  }

  return { point: next, guides, state: nextState };
}

// One-shot: snap a joint to the nearest orthogonal alignment with its
// neighbours regardless of distance (used by the "Make 90°" action).
export function orthogonalizeJointPoint(point, neighbors) {
  const next = { x: point.x, y: point.y };
  let bestX = null;
  let bestY = null;
  for (const neighbor of neighbors) {
    if (!neighbor) continue;
    const dx = Math.abs(point.x - neighbor.x);
    const dy = Math.abs(point.y - neighbor.y);
    if (bestX == null || dx < bestX.delta) bestX = { delta: dx, pos: neighbor.x };
    if (bestY == null || dy < bestY.delta) bestY = { delta: dy, pos: neighbor.y };
  }
  // Snap the axis whose neighbour alignment is closest, so we square up the
  // sharper corner first without collapsing both segments.
  if (bestX && bestY) {
    if (bestX.delta <= bestY.delta) next.x = bestX.pos;
    else next.y = bestY.pos;
  } else if (bestX) {
    next.x = bestX.pos;
  } else if (bestY) {
    next.y = bestY.pos;
  }
  return next;
}

export function isSameGuideMatch(a, b) {
  return !!a && !!b &&
    a.stationaryId === b.stationaryId &&
    a.axis === b.axis &&
    a.snapPos === b.snapPos;
}

export function collectVisibleGuides(guideMatches, activeSnap) {
  const visible = [];

  if (activeSnap) {
    visible.push(...activeSnap.guides);
  }

  for (const match of guideMatches) {
    if (activeSnap && isSameGuideMatch(match, activeSnap)) continue;
    if (match.delta <= GUIDE_SHOW_DISTANCE) {
      visible.push(...match.guides);
    }
  }

  return visible;
}

export {
  SNAP_DISTANCE,
  UNSNAP_DISTANCE,
  GUIDE_SHOW_DISTANCE,
  ORTHO_SNAP_DISTANCE,
  ORTHO_UNSNAP_DISTANCE,
};
