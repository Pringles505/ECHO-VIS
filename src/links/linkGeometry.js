export const LINK_POINTER_LENGTH = 11;
export const LINK_POINTER_WIDTH = 8;
export const JOINT_HIT_RADIUS = 12;

const LINK_LANE_GAP = 18;
const EPSILON = 0.0001;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function pointOnQuadratic(p0, p1, p2, t) {
  const inv = 1 - t;
  return {
    x: inv * inv * p0.x + 2 * inv * t * p1.x + t * t * p2.x,
    y: inv * inv * p0.y + 2 * inv * t * p1.y + t * t * p2.y,
  };
}

function tangentOnQuadratic(p0, p1, p2, t) {
  return {
    x: 2 * (1 - t) * (p1.x - p0.x) + 2 * t * (p2.x - p1.x),
    y: 2 * (1 - t) * (p1.y - p0.y) + 2 * t * (p2.y - p1.y),
  };
}

function pointAlong(point, target, distance) {
  const length = dist(point, target);
  if (length < EPSILON || distance <= 0) return { ...point };
  const ratio = distance / length;
  return {
    x: point.x + (target.x - point.x) * ratio,
    y: point.y + (target.y - point.y) * ratio,
  };
}

function normalize(dx, dy) {
  const length = Math.hypot(dx, dy) || 1;
  return { x: dx / length, y: dy / length };
}

function getNodeCenter(node) {
  return {
    x: node.x + node.width / 2,
    y: node.y + node.height / 2,
  };
}

function translatePoint(point, offset) {
  return {
    x: point.x + offset.x,
    y: point.y + offset.y,
  };
}

function getDirectionalBasis(fromNode, toNode) {
  const startCenter = getNodeCenter(fromNode);
  const endCenter = getNodeCenter(toNode);
  const direction = normalize(endCenter.x - startCenter.x, endCenter.y - startCenter.y);
  const normal = { x: -direction.y, y: direction.x };

  return { startCenter, endCenter, direction, normal };
}

function getNodeSupportAlongNormal(node, normal) {
  return (node.width / 2) * Math.abs(normal.x) + (node.height / 2) * Math.abs(normal.y);
}

function getRectRayBoundaryPoint(node, localStart, direction) {
  const center = getNodeCenter(node);
  const halfWidth = node.width / 2;
  const halfHeight = node.height / 2;
  let bestT = Infinity;

  if (Math.abs(direction.x) > EPSILON) {
    for (const edgeX of [-halfWidth, halfWidth]) {
      const t = (edgeX - localStart.x) / direction.x;
      if (t < 0) continue;
      const y = localStart.y + direction.y * t;
      if (y >= -halfHeight - EPSILON && y <= halfHeight + EPSILON) {
        bestT = Math.min(bestT, t);
      }
    }
  }

  if (Math.abs(direction.y) > EPSILON) {
    for (const edgeY of [-halfHeight, halfHeight]) {
      const t = (edgeY - localStart.y) / direction.y;
      if (t < 0) continue;
      const x = localStart.x + direction.x * t;
      if (x >= -halfWidth - EPSILON && x <= halfWidth + EPSILON) {
        bestT = Math.min(bestT, t);
      }
    }
  }

  if (!Number.isFinite(bestT)) {
    return translatePoint(center, localStart);
  }

  return {
    x: center.x + localStart.x + direction.x * bestT,
    y: center.y + localStart.y + direction.y * bestT,
  };
}

function getPairKey(link) {
  return [link.fromId, link.toId].sort().join('::');
}

function getPairLinks(link, allLinks) {
  if (!Array.isArray(allLinks)) return [link];
  const pairKey = getPairKey(link);
  const pairLinks = allLinks.filter(item => getPairKey(item) === pairKey);
  return pairLinks.length ? pairLinks : [link];
}

function getLaneOffsetScalar(link, allLinks, maxOffset) {
  const pairLinks = getPairLinks(link, allLinks);
  if (pairLinks.length <= 1 || maxOffset <= EPSILON) return 0;

  const laneIndex = pairLinks.findIndex(item => item.id === link.id);
  if (laneIndex < 0) return 0;

  const preferredSpan = LINK_LANE_GAP * (pairLinks.length - 1);
  const usableSpan = Math.min(preferredSpan, maxOffset * 2);
  const step = pairLinks.length > 1 ? usableSpan / (pairLinks.length - 1) : 0;
  return -usableSpan / 2 + laneIndex * step;
}

export function getLinkParallelOffset(link, fromNode, toNode, allLinks = []) {
  const { normal } = getDirectionalBasis(fromNode, toNode);
  const maxOffset = Math.max(
    0,
    Math.min(
      getNodeSupportAlongNormal(fromNode, normal),
      getNodeSupportAlongNormal(toNode, normal)
    ) - 2
  );
  const pairLinks = getPairLinks(link, allLinks);
  const laneScalar = getLaneOffsetScalar(link, pairLinks, maxOffset);
  const parallelOffset = laneScalar;

  return {
    x: normal.x * parallelOffset,
    y: normal.y * parallelOffset,
  };
}

export function getLinkAnchorPoints(link, fromNode, toNode, allLinks = []) {
  const { startCenter, endCenter, direction } = getDirectionalBasis(fromNode, toNode);
  const offset = getLinkParallelOffset(link, fromNode, toNode, allLinks);

  return {
    start: getRectRayBoundaryPoint(fromNode, offset, direction),
    end: link.showArrowTip
      ? getRectRayBoundaryPoint(toNode, offset, { x: -direction.x, y: -direction.y })
      : translatePoint(endCenter, offset),
    startCenter,
    endCenter,
    offset,
  };
}

function getRoutePoints(link, fromNode, toNode, allLinks = []) {
  const anchors = getLinkAnchorPoints(link, fromNode, toNode, allLinks);
  const { offset } = anchors;
  const joints = (link.joints ?? []).map(joint => ({
    ...joint,
    point: translatePoint({ x: joint.x, y: joint.y }, offset),
  }));

  return [
    { type: 'endpoint', point: anchors.start },
    ...joints,
    { type: 'endpoint', point: anchors.end },
  ];
}

function buildSegments(routePoints) {
  const segments = [];
  let current = routePoints[0].point;

  for (let i = 1; i < routePoints.length - 1; i++) {
    const prev = routePoints[i - 1].point;
    const joint = routePoints[i];
    const next = routePoints[i + 1].point;

    const prevLimit = dist(prev, joint.point) / 2;
    const nextLimit = dist(next, joint.point) / 2;
    const curveIn = clamp(joint.prevCurve ?? 0, 0, prevLimit);
    const curveOut = clamp(joint.nextCurve ?? 0, 0, nextLimit);
    const before = curveIn > EPSILON ? pointAlong(joint.point, prev, curveIn) : { ...joint.point };
    const after = curveOut > EPSILON ? pointAlong(joint.point, next, curveOut) : { ...joint.point };

    if (dist(current, before) > EPSILON) {
      segments.push({ type: 'line', start: current, end: before });
    }

    if (curveIn > EPSILON || curveOut > EPSILON) {
      segments.push({ type: 'quadratic', start: before, control: joint.point, end: after });
      current = after;
    } else {
      current = joint.point;
    }
  }

  const end = routePoints[routePoints.length - 1].point;
  if (dist(current, end) > EPSILON) {
    segments.push({ type: 'line', start: current, end });
  }

  return segments;
}

function segmentLength(segment) {
  if (segment.type === 'line') return dist(segment.start, segment.end);

  let length = 0;
  let prev = segment.start;
  for (let i = 1; i <= 14; i++) {
    const point = pointOnQuadratic(segment.start, segment.control, segment.end, i / 14);
    length += dist(prev, point);
    prev = point;
  }
  return length;
}

function buildPathData(segments) {
  if (!segments.length) return '';

  const commands = [`M ${segments[0].start.x} ${segments[0].start.y}`];
  for (const segment of segments) {
    if (segment.type === 'line') {
      commands.push(`L ${segment.end.x} ${segment.end.y}`);
    } else {
      commands.push(`Q ${segment.control.x} ${segment.control.y} ${segment.end.x} ${segment.end.y}`);
    }
  }
  return commands.join(' ');
}

function getPointAndTangentAtLength(segments, targetLength) {
  if (!segments.length) {
    return {
      point: { x: 0, y: 0 },
      tangent: { x: 1, y: 0 },
    };
  }

  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0);
  let remaining = clamp(targetLength, 0, totalLength);

  for (const segment of segments) {
    if (remaining <= segment.length || segment === segments[segments.length - 1]) {
      const t = segment.length < EPSILON ? 1 : clamp(remaining / segment.length, 0, 1);
      if (segment.type === 'line') {
        return {
          point: {
            x: lerp(segment.start.x, segment.end.x, t),
            y: lerp(segment.start.y, segment.end.y, t),
          },
          tangent: {
            x: segment.end.x - segment.start.x,
            y: segment.end.y - segment.start.y,
          },
        };
      }

      return {
        point: pointOnQuadratic(segment.start, segment.control, segment.end, t),
        tangent: tangentOnQuadratic(segment.start, segment.control, segment.end, t),
      };
    }

    remaining -= segment.length;
  }

  const last = segments[segments.length - 1];
  return {
    point: last.end,
    tangent: last.type === 'line'
      ? { x: last.end.x - last.start.x, y: last.end.y - last.start.y }
      : { x: last.end.x - last.control.x, y: last.end.y - last.control.y },
  };
}

function getArrowHead(endPoint, tangent, length = LINK_POINTER_LENGTH, width = LINK_POINTER_WIDTH) {
  const direction = normalize(tangent.x, tangent.y);
  const normal = { x: -direction.y, y: direction.x };
  const base = {
    x: endPoint.x - direction.x * length,
    y: endPoint.y - direction.y * length,
  };

  return [
    endPoint.x,
    endPoint.y,
    base.x + normal.x * (width / 2),
    base.y + normal.y * (width / 2),
    base.x - normal.x * (width / 2),
    base.y - normal.y * (width / 2),
  ];
}

function getFinalTangent(segments, routePoints) {
  if (segments.length) {
    const last = segments[segments.length - 1];
    if (last.type === 'line') {
      return {
        x: last.end.x - last.start.x,
        y: last.end.y - last.start.y,
      };
    }

    return {
      x: last.end.x - last.control.x,
      y: last.end.y - last.control.y,
    };
  }

  const start = routePoints[0].point;
  const end = routePoints[routePoints.length - 1].point;
  return { x: end.x - start.x, y: end.y - start.y };
}

export function buildLinkRenderData(link, fromNode, toNode, allLinks = []) {
  const routePoints = getRoutePoints(link, fromNode, toNode, allLinks);
  const segments = buildSegments(routePoints).map(segment => ({
    ...segment,
    length: segmentLength(segment),
  }));
  const pathData = buildPathData(segments);
  const tangent = getFinalTangent(segments, routePoints);
  const endPoint = routePoints[routePoints.length - 1].point;
  const jointRenderPoints = routePoints
    .filter(point => point.type !== 'endpoint')
    .map(point => ({
      id: point.id,
      x: point.point.x,
      y: point.point.y,
    }));

  return {
    pathData,
    routePoints,
    segments,
    jointRenderPoints,
    arrowHeadPoints: link.showArrowTip ? getArrowHead(endPoint, tangent) : [endPoint.x, endPoint.y, endPoint.x, endPoint.y, endPoint.x, endPoint.y],
    showArrowTip: !!link.showArrowTip,
    length: segments.reduce((sum, segment) => sum + segment.length, 0),
  };
}

export function getAnimatedArrowHead(renderData, progress) {
  if (!renderData?.showArrowTip) {
    return { points: [0, 0, 0, 0, 0, 0], opacity: 0 };
  }

  const emergenceWindow = LINK_POINTER_LENGTH;
  const traveledLength = renderData.length * clamp(progress, 0, 1);
  const emergenceStart = Math.max(0, renderData.length - emergenceWindow);
  const visibleLength = clamp(traveledLength - emergenceStart, 0, emergenceWindow);
  const scale = emergenceWindow < EPSILON ? 1 : visibleLength / emergenceWindow;

  if (scale <= EPSILON) {
    return {
      points: renderData.arrowHeadPoints,
      opacity: 0,
    };
  }

  const { point, tangent } = getPointAndTangentAtLength(renderData.segments, traveledLength);
  return {
    points: getArrowHead(point, tangent, LINK_POINTER_LENGTH * scale, LINK_POINTER_WIDTH * scale),
    opacity: 1,
  };
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < EPSILON) {
    return { distance: dist(point, start), projected: { ...start } };
  }

  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lenSq, 0, 1);
  const projected = {
    x: lerp(start.x, end.x, t),
    y: lerp(start.y, end.y, t),
  };

  return {
    distance: dist(point, projected),
    projected,
  };
}

export function createJointForLink(link, fromNode, toNode, canvasPoint, createId, allLinks = []) {
  const routePoints = getRoutePoints(link, fromNode, toNode, allLinks);
  const offset = getLinkParallelOffset(link, fromNode, toNode, allLinks);
  let best = null;

  for (let i = 0; i < routePoints.length - 1; i++) {
    const result = distanceToSegment(canvasPoint, routePoints[i].point, routePoints[i + 1].point);
    if (!best || result.distance < best.distance) {
      best = { ...result, insertAt: i };
    }
  }

  const projected = best?.projected ?? canvasPoint;
  return {
    insertIndex: Math.max(0, best?.insertAt ?? link.joints?.length ?? 0),
    joint: {
      id: createId(),
      x: projected.x - offset.x,
      y: projected.y - offset.y,
      size: 6,
      prevCurve: 0,
      nextCurve: 0,
    },
  };
}
