// Continuous "scrolling grid" support for Area nodes.
//
// When an Area has `scrollEnabled`, the nodes whose centers fall inside its bounds
// are treated as a looping band: during playback they translate along the chosen
// axis at `scrollSpeed` px/s and wrap by the grid's own extent. The area rectangle
// is a hard clip window — objects are cut at the EXACT edge as they exit and re-enter
// at the opposite edge — and the wrap seam is kept off-screen so the loop is seamless.
// This makes a static double-ratchet grid read as an endless stream of fresh messages.

import { normalizeScrollSteps, getScrollStepTiles } from './scrollStepTiming';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Smooth ease for the per-step shift in stepped mode.
function easeInOut(p) {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

// Nodes that ride inside a scrolling area. Membership is determined once from the
// stored layout: only nodes whose center is inside the area are moved. This prevents
// another row or column outside the viewport from being captured just because it
// shares the same cross-axis lane. Areas and mirrors are skipped.
export function getAreaScrollMembers(area, nodes) {
  if (!area) return [];
  const left = area.x;
  const top = area.y;
  const right = area.x + area.width;
  const bottom = area.y + area.height;

  return nodes.filter((node) => {
    if (node.id === area.id || node.type === 'area' || node.type === 'mirror') return false;
    const w = node.width ?? 0;
    const h = node.height ?? 0;
    const centerX = node.x + w / 2;
    const centerY = node.y + h / 2;
    return centerX >= left && centerX <= right && centerY >= top && centerY <= bottom;
  });
}

// Per-member translation + clip rect for a scrolling area at time `t`.
// `loopDuration` is the full animation length; when seamless looping is on the
// scroll is snapped to complete a whole number of cycles over it, so the position
// at the end equals the position at the start (no jump when the GIF/clip repeats).
// Returns a map keyed by node id: { scrollDX, scrollDY, clipX, clipY, clipW, clipH }.
export function computeAreaScrollState(area, nodes, t, loopDuration = 0, links = []) {
  const result = {};
  if (!area || !area.scrollEnabled) return result;
  const members = getAreaScrollMembers(area, nodes);
  if (!members.length) return result;

  const axis = area.scrollAxis ?? 'up';
  const vertical = axis === 'up' || axis === 'down';
  const dir = (axis === 'up' || axis === 'left') ? -1 : 1;
  const speed = Number.isFinite(area.scrollSpeed) ? area.scrollSpeed : 40;
  const gap = Number.isFinite(area.scrollGap) ? Math.max(0, area.scrollGap) : 0;
  // Seamless loops keep the wrap seam off-screen, so the re-entry fade is unnecessary
  // and only adds a visible blink at the loop boundary — flag it so applyAnimState skips it.
  const seamless = area.scrollSeamless !== false;

  // Group members into bands (rows for vertical scroll, columns for horizontal) and
  // measure the grid's extent + natural pitch so the loop tiles with no gap.
  let minA = Infinity;
  let maxA = -Infinity;
  const bands = members
    .map(node => ({
      memberIds: [node.id],
      start: vertical ? node.y : node.x,
      end: vertical ? node.y + (node.height ?? 0) : node.x + (node.width ?? 0),
    }))
    .sort((a, b) => a.start - b.start)
    .reduce((acc, item) => {
      const last = acc[acc.length - 1];
      if (last && item.start <= last.end - 0.5) {
        last.start = Math.min(last.start, item.start);
        last.end = Math.max(last.end, item.end);
        last.memberIds.push(...item.memberIds);
      } else {
        acc.push({ ...item, memberIds: [...item.memberIds] });
      }
      return acc;
    }, []);
  const bandByMemberId = {};
  for (const band of bands) {
    if (band.start < minA) minA = band.start;
    if (band.end > maxA) maxA = band.end;
    for (const id of band.memberIds) bandByMemberId[id] = band;
  }
  const extent = maxA - minA;

  // Tile pitch (band-to-band distance) and band count drive both the loop period
  // and the per-step jump in stepped mode.
  const numBands = bands.length;
  let pitch;
  if (numBands >= 2) {
    const pitches = [];
    for (let i = 1; i < bands.length; i += 1) pitches.push(bands[i].start - bands[i - 1].start);
    pitches.sort((a, b) => a - b);
    pitch = pitches[Math.floor(pitches.length / 2)];
  } else {
    pitch = extent;
  }

  // Explicit overrides for when auto-detection is fooled by multi-node "tiles" (e.g.
  // message groups). Tile size controls one step's distance; scrollTiles can extend
  // the cycle beyond the detected count without dropping detected bands.
  const tilesOverride = Number.isFinite(area.scrollTiles) && area.scrollTiles > 0
    ? Math.round(area.scrollTiles)
    : 0;
  // A loop period smaller than the detected band count folds several bands onto
  // the same position. Visually that looks as if only one item survived the wrap.
  // Treat the override as a minimum cycle size so every detected tile remains in
  // the rotation.
  const cycleTiles = Math.max(1, numBands, tilesOverride);
  const autoPitch = (Number.isFinite(area.scrollTileSize) && area.scrollTileSize > 0)
    ? area.scrollTileSize
    : pitch;
  // Never let the tile pitch be 0 — otherwise stepped mode would skip its branches
  // and silently fall through to the continuous (Start-at-driven) path, making the
  // step keyframes do nothing. Fall back to the grid extent, then the area size.
  const effPitch = autoPitch > 0
    ? autoPitch
    : Math.max(1, extent > 0 ? extent : (vertical ? area.height : area.width) || 1);

  const stepped = area.scrollMode === 'stepped';
  const viewportStart = vertical ? area.y : area.x;
  const viewportSpan = vertical ? area.height : area.width;
  // Wrap against the viewport itself, not the first/last object's bounds. Anchoring
  // the modulo window to minA made the leading object jump to a position that could
  // still be outside the area. The area span guarantees that leaving one edge places
  // the object at the opposite edge. Continuous mode may add an intentional gap.
  let period = viewportSpan + (stepped ? 0 : gap);
  period = Math.max(1, period);
  const windowStart = viewportStart;

  // Optional start delay: hold the chain still until `scrollStartTime` so the first
  // run can play out in place; the scroll (and loop) only begin afterwards.
  const startTime = Number.isFinite(area.scrollStartTime) ? Math.max(0, area.scrollStartTime) : 0;
  const scrollT = Math.max(0, t - startTime);
  const scrollSpan = Math.max(0, loopDuration - startTime);

  let offset;
  // Un-modded cumulative advance (px). Monotonic in time across every mode, so it
  // drives a deterministic per-band wrap cycle index below (see cycleIndex). The
  // modded `offset` alone can't tell wraps apart; the raw advance can.
  let advancedRaw = 0;
  // Seconds for a band to advance one TILE — the ratchet cadence. Used below to derive
  // the per-VIEWPORT-WRAP period, which is what sizes a carried manual token's single
  // pass (the token replays once each time its tile wraps the area edge, i.e. when it
  // re-enters as the freshest message — see the snapping below and getManualDuration in
  // applyAnimState). Computed from the scroll math, not measured frame-to-frame, so the
  // token is sized correctly from the very first wrap. 0 = unknown.
  let tilePeriodSeconds = 0;
  const keyframeSteps = stepped ? normalizeScrollSteps(area.scrollSteps) : [];
  if (stepped && keyframeSteps.length) {
    // Keyframed steps fully control the motion: each placed step advances exactly one
    // tile starting at its own `time`, eased over its own `duration`. Uses absolute
    // timeline time, so it's driven purely by the keyframes — never by Start at.
    const advanced = getScrollStepTiles(keyframeSteps, t) * effPitch;
    advancedRaw = advanced;
    offset = ((advanced % period) + period) % period;
    // One tile per placed step; the spawn cadence is the gap between steps. Use the
    // median gap so an irregular outlier doesn't skew the token's pass length.
    if (keyframeSteps.length >= 2) {
      const gaps = [];
      for (let i = 1; i < keyframeSteps.length; i += 1) {
        gaps.push(keyframeSteps[i].time - keyframeSteps[i - 1].time);
      }
      gaps.sort((a, b) => a - b);
      tilePeriodSeconds = gaps[Math.floor(gaps.length / 2)];
    }
  } else if (stepped) {
    // Stepped mode (no keyframes): hold for one "run", then ease exactly one tile
    // over, repeat — one ratchet click per message. Seamless snaps the step count to
    // a whole number of cycles (a multiple of the band count) across the window.
    const stepInterval = Math.max(0.1, Number.isFinite(area.scrollStepInterval) ? area.scrollStepInterval : 1);
    let effInterval = stepInterval;
    if (area.scrollSeamless !== false && scrollSpan > 0 && cycleTiles >= 1) {
      let nSteps = Math.max(cycleTiles, Math.round(scrollSpan / stepInterval));
      nSteps = Math.max(cycleTiles, Math.round(nSteps / cycleTiles) * cycleTiles);
      effInterval = scrollSpan / nSteps;
    }
    const stepDur = clamp(
      Number.isFinite(area.scrollStepDuration) ? area.scrollStepDuration : 0.4,
      0.05,
      Math.max(0.05, effInterval * 0.9),
    );
    const stepIndex = Math.floor(scrollT / effInterval);
    const within = scrollT - stepIndex * effInterval;
    const holdTime = Math.max(0, effInterval - stepDur);
    const tp = within <= holdTime ? 0 : clamp((within - holdTime) / Math.max(0.0001, effInterval - holdTime), 0, 1);
    const advanced = (stepIndex + easeInOut(tp)) * effPitch;
    advancedRaw = advanced;
    offset = ((advanced % period) + period) % period;
    // One ratchet click per interval, each advancing exactly one tile.
    tilePeriodSeconds = effInterval;
  } else {
    // Continuous mode: constant glide, snapped to whole cycles for a seamless loop.
    let effSpeed = speed;
    if (area.scrollSeamless !== false && scrollSpan > 0) {
      const cycles = Math.max(1, Math.round((speed * scrollSpan) / period));
      effSpeed = (cycles * period) / scrollSpan;
    }
    advancedRaw = scrollT * effSpeed;
    offset = (((scrollT * effSpeed) % period) + period) % period;
    // A fresh tile clears the leading edge every effPitch px of glide.
    if (effSpeed > 0) tilePeriodSeconds = effPitch / effSpeed;
  }

  // Real seconds between two consecutive wraps of one band (a full viewport's worth
  // of tiles). A manual token replays per wrap, so this is the gap its pass must fit in.
  // 0 = unknown. Derived from the per-tile cadence multiplied by tiles-per-viewport.
  const tilesPerPeriod = effPitch > 0 ? period / effPitch : 1;
  const cyclePeriodSeconds = tilePeriodSeconds > 0 ? tilePeriodSeconds * tilesPerPeriod : 0;

  // The area is the exact viewport on both axes. A member may be partially clipped
  // while crossing an edge, but no scrolling content is rendered outside the area.
  const clip = {
    clipX: area.x,
    clipY: area.y,
    clipW: area.width,
    clipH: area.height,
  };

  for (const node of members) {
    const band = bandByMemberId[node.id];
    const base = band?.start ?? (vertical ? node.y : node.x);

    // Wrap the whole row/column from its shared band origin. Every node belonging
    // to the same visual tile receives the same delta, so the leading tile cannot
    // split or appear to advance twice when one child reaches the boundary first.
    const rel = ((((base - windowStart) + dir * offset) % period) + period) % period;
    const pos = windowStart + rel;
    const delta = pos - base;

    // Deterministic wrap counter for this band. The un-modded position crosses a
    // whole `period` each time the band wraps around the area edge, so flooring it
    // gives an integer that ticks by one per wrap. Drives the node/link re-entry fade
    // (which happens once per viewport wrap). Consumers detect a wrap purely from this
    // value changing — no fragile position-jump threshold needed.
    const rawCycle = ((base - windowStart) + dir * advancedRaw) / period;
    const cycleIndex = Math.floor(rawCycle);
    // Deterministic seconds since THIS band's last wrap (its fractional progress through
    // the current cycle × the per-wrap period). Replaces the frame-to-frame wrap event
    // for driving manual tokens — it is per-band (so only the tile that just wrapped
    // launches its token) and reproducible in exports. `elapsedFrac` must increase
    // monotonically from the wrap: for dir<0 the raw fraction counts down, so invert it,
    // otherwise the token would glide backwards and teleport at the wrap.
    const phaseFrac = rawCycle - cycleIndex; // [0,1)
    const elapsedFrac = dir >= 0 ? phaseFrac : (1 - phaseFrac);
    const cycleElapsed = cyclePeriodSeconds > 0 ? elapsedFrac * cyclePeriodSeconds : 0;

    result[node.id] = vertical
      ? { scrollDX: 0, scrollDY: delta, cycleIndex, seamless, cycleElapsed, ...clip }
      : { scrollDX: delta, scrollDY: 0, cycleIndex, seamless, cycleElapsed, ...clip };
  }

  // Keep a manual-token message rigid. Both endpoints of a manual-token link must
  // scroll in exact lockstep, otherwise they fall into different bands, wrap at
  // slightly different times, and the carried link (with its token) blinks in and
  // out during the brief windows their phases disagree. Snap the destination
  // endpoint onto the origin's delta + cycle so the pair moves and wraps as one
  // tile — no phase mismatch, and a single clean token reset per wrap.
  for (const link of links) {
    if (!link?.manualTokenEnabled) continue;
    const anchorId = link.manualTokenInvert ? link.toId : link.fromId;
    const otherId = link.manualTokenInvert ? link.fromId : link.toId;
    const anchor = result[anchorId];
    const other = result[otherId];
    if (!anchor || !other) continue;
    other.scrollDX = anchor.scrollDX;
    other.scrollDY = anchor.scrollDY;
    other.cycleIndex = anchor.cycleIndex;
    // Both endpoints share the anchor tile's wrap phase, so the token's launch timing
    // comes from the one band the message rides.
    other.cycleElapsed = anchor.cycleElapsed;
    // Carry the deterministic per-wrap period so the token's pass can be sized to the
    // gap between this band's wraps from the very first wrap (no reliance on measured
    // frame intervals).
    anchor.cyclePeriodSeconds = cyclePeriodSeconds;
    other.cyclePeriodSeconds = cyclePeriodSeconds;
  }

  return result;
}
