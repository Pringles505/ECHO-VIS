// ---------------------------------------------------------------------------
// Alignment engine — Figma/draw.io-style snapping for the diagram canvas.
//
// Responsibilities:
//   • Object snapping: while dragging, snap the moving box's edges/centers to
//     the edges/centers of every other node, independently on both axes.
//   • Equal-spacing snapping: snap so the gap to a neighbour equals an
//     existing gap between other nodes on the same row/column (and "centered
//     between two neighbours").
//   • Grid snapping: hard-quantize position to the grid (draw.io behaviour).
//   • Orthogonal snapping for link joints (segments become exactly 90°).
//   • Guide generation: red alignment lines spanning every box that shares
//     the snapped coordinate, and spacing brackets with pixel labels.
//
// All thresholds are in *screen* pixels and divided by the stage zoom so the
// feel is constant at any zoom level. Snapping is stateless: Konva re-derives
// the drag position from the live pointer every move, so the raw position is
// always available and no sticky/unsnap bookkeeping is needed.
// ---------------------------------------------------------------------------

export const ALIGN_TOLERANCE = 8;    // screen px — edge/center alignment
export const SPACING_TOLERANCE = 8;  // screen px — equal-spacing match
export const ORTHO_TOLERANCE = 8;    // screen px — link joint 90° snap
const GUIDE_PAD = 14;                // canvas px — guide line overshoot
const MATCH_EPS = 0.5;               // coordinate equality slack for guides
const MAX_SPACING_TARGETS = 14;      // nearest-N cap keeps pair scan cheap

export const GUIDE_COLOR = '#ff4d8f';   // alignment + spacing (Figma red)
export const ORTHO_GUIDE_COLOR = '#22d3a6';

export const DEFAULT_ALIGNMENT_SETTINGS = {
  snapEnabled: true,     // master switch (Alt pauses it while dragging)
  snapToObjects: true,   // smart guides against other nodes
  snapSpacing: true,     // equal-gap snapping
  snapToGrid: false,     // quantize position to the grid
  gridSize: 24,          // canvas px
  snapOrthogonal: true,  // link joints snap segments to 90°
  showGuides: true,      // draw guide lines while snapped
  showGrid: false,       // visual grid backdrop
  showGhostNodes: false, // show nodes at low opacity when not yet visible in current frame
};

// Edge values of a box along one axis: [min, center, max].
function axisEdges(box, axis) {
  return axis === 'x'
    ? [box.x, box.x + box.width / 2, box.x + box.width]
    : [box.y, box.y + box.height / 2, box.y + box.height];
}

function toBox(node) {
  return {
    id: node.id,
    x: node.x,
    y: node.y,
    width: node.width ?? 0,
    height: node.height ?? 0,
  };
}

function isFiniteBox(node) {
  return Number.isFinite(node?.x) && Number.isFinite(node?.y);
}

// Best edge/center alignment for one axis. Returns { delta, value } where
// delta is what must be added to the moving box position to align, or null.
function findObjectSnap(movingBox, targets, axis, tolerance) {
  const movingEdges = axisEdges(movingBox, axis);
  let best = null;
  for (const target of targets) {
    const targetEdges = axisEdges(target, axis);
    for (const movingValue of movingEdges) {
      for (const targetValue of targetEdges) {
        const delta = targetValue - movingValue;
        const abs = Math.abs(delta);
        if (abs <= tolerance && (!best || abs < Math.abs(best.delta))) {
          best = { delta, value: targetValue };
        }
      }
    }
  }
  return best;
}

// Perpendicular overlap test: for x-axis spacing only consider boxes that
// share vertical range with the moving box (same "row"), and vice versa.
function overlapsPerpendicular(a, b, axis) {
  if (axis === 'x') return a.y < b.y + b.height && a.y + a.height > b.y;
  return a.x < b.x + b.width && a.x + a.width > b.x;
}

function axisSpan(box, axis) {
  return axis === 'x'
    ? { min: box.x, max: box.x + box.width }
    : { min: box.y, max: box.y + box.height };
}

// Equal-spacing snap for one axis. Candidates:
//   • after a pair (A,B): gap(B → moving) == gap(A → B)
//   • before a pair:      gap(moving → A) == gap(A → B)
//   • centered between two boxes with room for the moving box.
// Returns { delta, gap, pairs } or null. `pairs` carries the gap intervals
// needed to draw measurement brackets (each { from, to } in axis coords,
// plus the boxes that bound them for placing the bracket).
function findSpacingSnap(movingBox, targets, axis, tolerance) {
  const movingSpan = axisSpan(movingBox, axis);
  const movingSize = movingSpan.max - movingSpan.min;
  const movingCenter = (movingSpan.min + movingSpan.max) / 2;

  let row = targets.filter(t => overlapsPerpendicular(movingBox, t, axis));
  if (row.length < 2) return null;
  row = row
    .map(t => ({ box: t, span: axisSpan(t, axis) }))
    .sort((a, b) =>
      Math.abs((a.span.min + a.span.max) / 2 - movingCenter) -
      Math.abs((b.span.min + b.span.max) / 2 - movingCenter)
    )
    .slice(0, MAX_SPACING_TARGETS)
    .sort((a, b) => a.span.min - b.span.min);

  let best = null;
  const consider = (candidateMin, gap, pairs) => {
    const delta = candidateMin - movingSpan.min;
    const abs = Math.abs(delta);
    if (abs <= tolerance && gap >= 0 && (!best || abs < Math.abs(best.delta))) {
      best = { delta, gap, pairs };
    }
  };

  for (let i = 0; i < row.length; i += 1) {
    for (let j = i + 1; j < row.length; j += 1) {
      const a = row[i];
      const b = row[j];
      const gap = b.span.min - a.span.max;
      if (gap < 0) continue;

      // moving sits after B with the same gap
      consider(b.span.max + gap, gap, [
        { from: a.span.max, to: b.span.min, boxA: a.box, boxB: b.box },
        { from: b.span.max, to: b.span.max + gap, boxA: b.box, boxB: null },
      ]);
      // moving sits before A with the same gap
      consider(a.span.min - gap - movingSize, gap, [
        { from: a.span.min - gap, to: a.span.min, boxA: null, boxB: a.box },
        { from: a.span.max, to: b.span.min, boxA: a.box, boxB: b.box },
      ]);
      // moving centered in the space between A and B
      const space = gap;
      if (space >= movingSize) {
        const sideGap = (space - movingSize) / 2;
        consider(a.span.max + sideGap, sideGap, [
          { from: a.span.max, to: a.span.max + sideGap, boxA: a.box, boxB: null },
          { from: a.span.max + sideGap + movingSize, to: b.span.min, boxA: null, boxB: b.box },
        ]);
      }
    }
  }
  return best;
}

// After the final position is known, build full-span alignment lines for every
// moving edge that exactly matches a target edge — Figma shows all of them,
// not just the edge that triggered the snap.
function buildAlignmentGuides(finalBox, targets, axis) {
  const guides = [];
  const movingEdges = axisEdges(finalBox, axis);
  const seen = new Set();

  for (const movingValue of movingEdges) {
    const matched = targets.filter(t =>
      axisEdges(t, axis).some(v => Math.abs(v - movingValue) <= MATCH_EPS)
    );
    if (!matched.length) continue;
    const key = Math.round(movingValue * 2);
    if (seen.has(key)) continue;
    seen.add(key);

    const boxes = [finalBox, ...matched];
    if (axis === 'x') {
      const top = Math.min(...boxes.map(b => b.y)) - GUIDE_PAD;
      const bottom = Math.max(...boxes.map(b => b.y + b.height)) + GUIDE_PAD;
      guides.push({
        id: `align-x-${key}`,
        points: [movingValue, top, movingValue, bottom],
        stroke: GUIDE_COLOR,
        strokeWidth: 1,
        opacity: 0.95,
      });
    } else {
      const left = Math.min(...boxes.map(b => b.x)) - GUIDE_PAD;
      const right = Math.max(...boxes.map(b => b.x + b.width)) + GUIDE_PAD;
      guides.push({
        id: `align-y-${key}`,
        points: [left, movingValue, right, movingValue],
        stroke: GUIDE_COLOR,
        strokeWidth: 1,
        opacity: 0.95,
      });
    }
  }
  return guides;
}

// Measurement brackets for an equal-spacing snap: a line across each gap with
// end ticks and a centered pixel label.
function buildSpacingGuides(finalBox, axis, spacing) {
  const guides = [];
  const cross = axis === 'x'
    ? finalBox.y + finalBox.height / 2
    : finalBox.x + finalBox.width / 2;
  const TICK = 5;
  const label = `${Math.round(spacing.gap)}`;

  spacing.pairs.forEach((pair, idx) => {
    if (pair.to - pair.from < 1) return;
    const id = `spacing-${axis}-${idx}`;
    if (axis === 'x') {
      guides.push(
        { id, points: [pair.from, cross, pair.to, cross], stroke: GUIDE_COLOR, strokeWidth: 1, opacity: 0.95 },
        { id: `${id}-t1`, points: [pair.from, cross - TICK, pair.from, cross + TICK], stroke: GUIDE_COLOR, strokeWidth: 1, opacity: 0.95 },
        { id: `${id}-t2`, points: [pair.to, cross - TICK, pair.to, cross + TICK], stroke: GUIDE_COLOR, strokeWidth: 1, opacity: 0.95 },
      );
      guides[guides.length - 3].label = { text: label, x: (pair.from + pair.to) / 2, y: cross - 16 };
    } else {
      guides.push(
        { id, points: [cross, pair.from, cross, pair.to], stroke: GUIDE_COLOR, strokeWidth: 1, opacity: 0.95 },
        { id: `${id}-t1`, points: [cross - TICK, pair.from, cross + TICK, pair.from], stroke: GUIDE_COLOR, strokeWidth: 1, opacity: 0.95 },
        { id: `${id}-t2`, points: [cross - TICK, pair.to, cross + TICK, pair.to], stroke: GUIDE_COLOR, strokeWidth: 1, opacity: 0.95 },
      );
      guides[guides.length - 3].label = { text: label, x: cross + 8, y: (pair.from + pair.to) / 2 - 6 };
    }
  });
  return guides;
}

// ---------------------------------------------------------------------------
// resolveMoveSnap — main entry for dragging nodes/mirrors/subdiagrams.
//
//   box: { id, x, y, width, height } — raw (pointer-derived) position.
//   ctx: {
//     nodes,            // current store nodes (snap targets)
//     settings,         // alignment settings object
//     scale = 1,        // stage zoom, for screen-constant thresholds
//     disableSnap,      // Alt held — bypass all snapping
//     excludeIds,       // Set of node ids that move with the drag
//     axisLock,         // {x, y} drag origin — Shift held, constrain axis
//   }
// Returns { x, y, guides }.
// ---------------------------------------------------------------------------
export function resolveMoveSnap(box, ctx) {
  const settings = ctx.settings ?? DEFAULT_ALIGNMENT_SETTINGS;
  const scale = ctx.scale > 0 ? ctx.scale : 1;
  let x = box.x;
  let y = box.y;

  // Shift: constrain movement to the dominant axis relative to drag origin.
  let lockedAxis = null;
  if (ctx.axisLock) {
    const dx = Math.abs(x - ctx.axisLock.x);
    const dy = Math.abs(y - ctx.axisLock.y);
    if (dx >= dy) { y = ctx.axisLock.y; lockedAxis = 'y'; }
    else { x = ctx.axisLock.x; lockedAxis = 'x'; }
  }

  if (ctx.disableSnap || !settings.snapEnabled) {
    return { x, y, guides: [] };
  }

  const excludeIds = ctx.excludeIds ?? new Set();
  const targets = (ctx.nodes ?? [])
    .filter(n => n.id !== box.id && !excludeIds.has(n.id) && isFiniteBox(n))
    .map(toBox);

  const tolerance = ALIGN_TOLERANCE / scale;
  const spacingTolerance = SPACING_TOLERANCE / scale;
  const snapped = { x: null, y: null };

  // 1) Object (edge/center) alignment — both axes independently.
  if (settings.snapToObjects) {
    for (const axis of ['x', 'y']) {
      if (axis === lockedAxis) continue;
      const working = { ...box, x, y };
      const match = findObjectSnap(working, targets, axis, tolerance);
      if (match) {
        if (axis === 'x') x += match.delta; else y += match.delta;
        snapped[axis] = 'object';
      }
    }
  }

  // 2) Equal-spacing — only for axes that didn't edge-snap.
  const spacingResults = { x: null, y: null };
  if (settings.snapToObjects && settings.snapSpacing) {
    for (const axis of ['x', 'y']) {
      if (axis === lockedAxis || snapped[axis]) continue;
      const working = { ...box, x, y };
      const match = findSpacingSnap(working, targets, axis, spacingTolerance);
      if (match) {
        if (axis === 'x') x += match.delta; else y += match.delta;
        snapped[axis] = 'spacing';
        spacingResults[axis] = match;
      }
    }
  }

  // 3) Grid quantize — any axis still free (draw.io-style hard grid).
  if (settings.snapToGrid && settings.gridSize > 0) {
    const grid = settings.gridSize;
    if (!snapped.x && lockedAxis !== 'x') { x = Math.round(x / grid) * grid; snapped.x = 'grid'; }
    if (!snapped.y && lockedAxis !== 'y') { y = Math.round(y / grid) * grid; snapped.y = 'grid'; }
  }

  // 4) Guides for whatever ended up aligned.
  const guides = [];
  if (settings.showGuides) {
    const finalBox = { ...box, x, y };
    if (snapped.x === 'object') guides.push(...buildAlignmentGuides(finalBox, targets, 'x'));
    if (snapped.y === 'object') guides.push(...buildAlignmentGuides(finalBox, targets, 'y'));
    if (spacingResults.x) {
      const adjusted = {
        ...spacingResults.x,
        pairs: spacingResults.x.pairs.map(p => (
          p.boxB === null ? { ...p, to: finalBox.x } : p.boxA === null ? { ...p, from: finalBox.x + finalBox.width } : p
        )),
      };
      guides.push(...buildSpacingGuides(finalBox, 'x', adjusted));
    }
    if (spacingResults.y) {
      const adjusted = {
        ...spacingResults.y,
        pairs: spacingResults.y.pairs.map(p => (
          p.boxB === null ? { ...p, to: finalBox.y } : p.boxA === null ? { ...p, from: finalBox.y + finalBox.height } : p
        )),
      };
      guides.push(...buildSpacingGuides(finalBox, 'y', adjusted));
    }
  }

  return { x, y, guides };
}

// ---------------------------------------------------------------------------
// resolveJointSnap — entry for dragging link bend points (joints).
// Priority per axis: orthogonal (90° with neighbour route points) → node
// edge/center alignment → grid quantize.
//
//   point: { x, y } raw position.
//   ctx: { neighbors, nodes, settings, scale, disableSnap }
// Returns { x, y, guides }.
// ---------------------------------------------------------------------------
export function resolveJointSnap(point, ctx) {
  const settings = ctx.settings ?? DEFAULT_ALIGNMENT_SETTINGS;
  const scale = ctx.scale > 0 ? ctx.scale : 1;
  let { x, y } = point;

  if (ctx.disableSnap || !settings.snapEnabled) {
    return { x, y, guides: [] };
  }

  const guides = [];
  const orthoTolerance = ORTHO_TOLERANCE / scale;
  const tolerance = ALIGN_TOLERANCE / scale;
  const pinned = { x: false, y: false };

  // 1) Orthogonal: align with neighbour route points so segments become 90°.
  if (settings.snapOrthogonal) {
    for (const axis of ['x', 'y']) {
      let best = null;
      for (const neighbor of ctx.neighbors ?? []) {
        if (!neighbor) continue;
        const delta = Math.abs(point[axis] - neighbor[axis]);
        if (delta <= orthoTolerance && (!best || delta < best.delta)) {
          best = { delta, value: neighbor[axis], neighbor };
        }
      }
      if (best) {
        if (axis === 'x') x = best.value; else y = best.value;
        pinned[axis] = true;
        if (settings.showGuides) {
          const style = { stroke: ORTHO_GUIDE_COLOR, strokeWidth: 1.25, dash: [4, 4], opacity: 0.95 };
          if (axis === 'x') {
            const y1 = Math.min(y, best.neighbor.y) - GUIDE_PAD;
            const y2 = Math.max(y, best.neighbor.y) + GUIDE_PAD;
            guides.push({ id: `ortho-x-${Math.round(best.value)}`, points: [best.value, y1, best.value, y2], ...style });
          } else {
            const x1 = Math.min(x, best.neighbor.x) - GUIDE_PAD;
            const x2 = Math.max(x, best.neighbor.x) + GUIDE_PAD;
            guides.push({ id: `ortho-y-${Math.round(best.value)}`, points: [x1, best.value, x2, best.value], ...style });
          }
        }
      }
    }
  }

  // 2) Node edge/center alignment for free axes (point = zero-size box).
  const snapped = { x: false, y: false };
  if (settings.snapToObjects) {
    const targets = (ctx.nodes ?? []).filter(isFiniteBox).map(toBox);
    const pointBox = { id: '__joint__', x, y, width: 0, height: 0 };
    for (const axis of ['x', 'y']) {
      if (pinned[axis]) continue;
      const match = findObjectSnap(pointBox, targets, axis, tolerance);
      if (match) {
        if (axis === 'x') x += match.delta; else y += match.delta;
        snapped[axis] = true;
      }
    }
    if (settings.showGuides && (snapped.x || snapped.y)) {
      const finalBox = { id: '__joint__', x, y, width: 0, height: 0 };
      if (snapped.x) guides.push(...buildAlignmentGuides(finalBox, targets, 'x'));
      if (snapped.y) guides.push(...buildAlignmentGuides(finalBox, targets, 'y'));
    }
  }

  // 3) Grid quantize for anything still free.
  if (settings.snapToGrid && settings.gridSize > 0) {
    const grid = settings.gridSize;
    if (!pinned.x && !snapped.x) x = Math.round(x / grid) * grid;
    if (!pinned.y && !snapped.y) y = Math.round(y / grid) * grid;
  }

  return { x, y, guides };
}

// One-shot: snap a joint to the nearest orthogonal alignment with its
// neighbours regardless of distance (the "Make 90°" context-menu action).
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
