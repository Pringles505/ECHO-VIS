import React, { useRef, useState } from 'react';
import { Group, Rect, Text, Circle } from 'react-konva';
import { pageColors } from '../../../colorThemes';
import useStore from '../../store/useStore';

const PORT_R = 7;
const SNAP_DISTANCE = 10;
const UNSNAP_DISTANCE = 22;
const GUIDE_SHOW_DISTANCE = 56;
const GUIDE_PAD = 220;

const PORT_POSITIONS = (w, h) => [
  { x: w / 2, y: 0 },      // top
  { x: w,     y: h / 2 },  // right
  { x: w / 2, y: h },      // bottom
  { x: 0,     y: h / 2 },  // left
];

function getRelativeSide(movingNode, stationaryNode) {
  const movingCx = movingNode.x + movingNode.width / 2;
  const movingCy = movingNode.y + movingNode.height / 2;
  const stationaryCx = stationaryNode.x + stationaryNode.width / 2;
  const stationaryCy = stationaryNode.y + stationaryNode.height / 2;
  const dx = movingCx - stationaryCx;
  const dy = movingCy - stationaryCy;

  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

function buildGuideMatch(movingNode, stationaryNode) {
  const side = getRelativeSide(movingNode, stationaryNode);
  const left = stationaryNode.x;
  const right = stationaryNode.x + stationaryNode.width;
  const top = stationaryNode.y;
  const bottom = stationaryNode.y + stationaryNode.height;
  const movingRight = movingNode.x + movingNode.width;
  const movingBottom = movingNode.y + movingNode.height;

  if (side === 'right') {
    const farX = Math.max(right, movingRight) + GUIDE_PAD;
    return {
      axis: 'y',
      guides: [
        { id: `${stationaryNode.id}-rt`, points: [right, top, farX, top] },
        { id: `${stationaryNode.id}-rb`, points: [right, bottom, farX, bottom] },
      ],
      candidates: [
        { axis: 'y', snapPos: top, delta: Math.abs(movingNode.y - top) },
        { axis: 'y', snapPos: bottom - movingNode.height, delta: Math.abs(movingNode.y - (bottom - movingNode.height)) },
      ],
    };
  }

  if (side === 'left') {
    const farX = Math.min(left, movingNode.x) - GUIDE_PAD;
    return {
      axis: 'y',
      guides: [
        { id: `${stationaryNode.id}-lt`, points: [farX, top, left, top] },
        { id: `${stationaryNode.id}-lb`, points: [farX, bottom, left, bottom] },
      ],
      candidates: [
        { axis: 'y', snapPos: top, delta: Math.abs(movingNode.y - top) },
        { axis: 'y', snapPos: bottom - movingNode.height, delta: Math.abs(movingNode.y - (bottom - movingNode.height)) },
      ],
    };
  }

  if (side === 'bottom') {
    const farY = Math.max(bottom, movingBottom) + GUIDE_PAD;
    return {
      axis: 'x',
      guides: [
        { id: `${stationaryNode.id}-bl`, points: [left, bottom, left, farY] },
        { id: `${stationaryNode.id}-br`, points: [right, bottom, right, farY] },
      ],
      candidates: [
        { axis: 'x', snapPos: left, delta: Math.abs(movingNode.x - left) },
        { axis: 'x', snapPos: right - movingNode.width, delta: Math.abs(movingNode.x - (right - movingNode.width)) },
      ],
    };
  }

  const farY = Math.min(top, movingNode.y) - GUIDE_PAD;
  return {
    axis: 'x',
    guides: [
      { id: `${stationaryNode.id}-tl`, points: [left, farY, left, top] },
      { id: `${stationaryNode.id}-tr`, points: [right, farY, right, top] },
    ],
    candidates: [
      { axis: 'x', snapPos: left, delta: Math.abs(movingNode.x - left) },
      { axis: 'x', snapPos: right - movingNode.width, delta: Math.abs(movingNode.x - (right - movingNode.width)) },
    ],
  };
}

function collectGuideMatches(movingNode, allNodes) {
  const matches = [];
  for (const stationaryNode of allNodes) {
    if (stationaryNode.id === movingNode.id) continue;
    const match = buildGuideMatch(movingNode, stationaryNode);
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

function NodeShape({ node, isSelected, onSelect, onStartLink, onEndLink, isLinking }) {
  const {
    nodes,
    updateNode,
    showSymmetryLines,
    snapToSymmetryLines,
    setSymmetryGuides,
  } = useStore();
  const [hovered, setHovered] = useState(false);
  const dragSnapRef = useRef(null);

  const showPorts = isSelected || hovered || isLinking;

  const cx = node.x + node.width  / 2;
  const cy = node.y + node.height / 2;

  const applyDraggedPosition = (target, nextPos) => {
    target.x(nextPos.x + node.width / 2);
    target.y(nextPos.y + node.height / 2);
  };

  const handleDragStart = (e) => {
    dragSnapRef.current = null;
    setSymmetryGuides([]);
    e.cancelBubble = true;
    onSelect();
  };

  const handleDragMove = (e) => {
    let nextPos = {
      x: e.target.x() - node.width / 2,
      y: e.target.y() - node.height / 2,
      width: node.width,
      height: node.height,
      id: node.id,
    };

    const canShowGuides = showSymmetryLines;
    const canSnap = showSymmetryLines && snapToSymmetryLines;
    let guideMatches = (canShowGuides || canSnap) ? collectGuideMatches(nextPos, nodes) : [];
    let guideMatch = guideMatches[0] ?? null;

    if (canSnap && dragSnapRef.current) {
      const activeSnap = dragSnapRef.current;
      const rawAxisValue = nextPos[activeSnap.axis];
      if (Math.abs(rawAxisValue - activeSnap.snapPos) <= UNSNAP_DISTANCE) {
        nextPos = { ...nextPos, [activeSnap.axis]: activeSnap.snapPos };
        guideMatches = collectGuideMatches(nextPos, nodes);
        guideMatch = guideMatches.find(match =>
          match.stationaryId === activeSnap.stationaryId &&
          match.axis === activeSnap.axis &&
          match.snapPos === activeSnap.snapPos
        ) ?? activeSnap;
      } else {
        dragSnapRef.current = null;
      }
    }

    if (canSnap && !dragSnapRef.current && guideMatch && guideMatch.delta <= SNAP_DISTANCE) {
      dragSnapRef.current = guideMatch;
      nextPos = { ...nextPos, [guideMatch.axis]: guideMatch.snapPos };
      guideMatches = collectGuideMatches(nextPos, nodes);
      guideMatch = guideMatches.find(match =>
        match.stationaryId === dragSnapRef.current.stationaryId &&
        match.axis === dragSnapRef.current.axis &&
        match.snapPos === dragSnapRef.current.snapPos
      ) ?? dragSnapRef.current;
    }

    const visibleGuides = canShowGuides
      ? guideMatches
          .filter(match => (
            match.delta <= GUIDE_SHOW_DISTANCE ||
            (
              dragSnapRef.current &&
              match.stationaryId === dragSnapRef.current.stationaryId &&
              match.axis === dragSnapRef.current.axis &&
              match.snapPos === dragSnapRef.current.snapPos
            )
          ))
          .flatMap(match => match.guides)
      : [];

    setSymmetryGuides(visibleGuides);
    applyDraggedPosition(e.target, nextPos);
    updateNode(node.id, { x: nextPos.x, y: nextPos.y });
  };

  const handleDragEnd = (e) => {
    dragSnapRef.current = null;
    setSymmetryGuides([]);
    updateNode(node.id, {
      x: e.target.x() - node.width  / 2,
      y: e.target.y() - node.height / 2,
    });
  };

  const ports = PORT_POSITIONS(node.width, node.height);

  return (
    <Group
      id={`node-${node.id}`}
      x={cx}
      y={cy}
      offsetX={node.width  / 2}
      offsetY={node.height / 2}
      draggable={!isLinking}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onClick={(e)    => { e.cancelBubble = true; onSelect(); }}
      onTap={(e)      => { e.cancelBubble = true; onSelect(); }}
      onMouseEnter={()=> setHovered(true)}
      onMouseLeave={()=> setHovered(false)}
      onMouseUp={(e)  => { if (isLinking) { e.cancelBubble = true; onEndLink(node.id); }}}
    >
      <Rect
        x={4}  y={4}
        width={node.width}
        height={node.height}
        cornerRadius={node.cornerRadius}
        fill={pageColors.blackShadowNode}
      />

      <Rect
        width={node.width}
        height={node.height}
        cornerRadius={node.cornerRadius}
        fill={node.fill}
        stroke={isSelected ? pageColors.blueSelection : node.stroke}
        strokeWidth={isSelected ? node.strokeWidth + 1 : node.strokeWidth}
      />

      <Rect
        x={node.cornerRadius}
        y={1}
        width={node.width - node.cornerRadius * 2}
        height={1}
        fill={pageColors.whiteInnerHighlight}
        listening={false}
      />

      <Text
        x={0}
        y={0}
        width={node.width}
        height={node.height}
        text={node.label}
        align="center"
        verticalAlign="middle"
        fontSize={node.fontSize}
        fill={node.textColor}
        fontFamily="Inter, system-ui, sans-serif"
        fontStyle="500"
        listening={false}
      />

      {showPorts && ports.map((p, i) => (
        <Circle
          key={i}
          x={p.x}
          y={p.y}
          radius={PORT_R}
          fill={pageColors.blueMain}
          stroke={pageColors.blueSelection}
          strokeWidth={2}
          onMouseDown={(e) => {
            e.cancelBubble = true;
            onStartLink(node.id);
          }}
          onMouseUp={(e) => {
            e.cancelBubble = true;
            onEndLink(node.id);
          }}
          onMouseEnter={e => { e.target.getStage().container().style.cursor = 'crosshair'; }}
          onMouseLeave={e => { e.target.getStage().container().style.cursor = 'default'; }}
        />
      ))}
    </Group>
  );
}

export default NodeShape;
