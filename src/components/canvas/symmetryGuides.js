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
};
