import React, { useRef, useState } from 'react';
import { Group, Rect, Text, Circle } from 'react-konva';
import { pageColors } from '../../../colorThemes';
import useStore from '../../store/useStore';
import { getClosestNodeOutlinePosition, getNodeAnchorPoint } from '../../links/linkGeometry';
import { collectGuideMatches, collectVisibleGuides, isSameGuideMatch, SNAP_DISTANCE, UNSNAP_DISTANCE } from './symmetryGuides';

const PORT_R = 7;

const PORT_POSITIONS = (w, h) => [
  { x: w / 2, y: 0,     side: 'top'    },
  { x: w,     y: h / 2, side: 'right'  },
  { x: w / 2, y: h,     side: 'bottom' },
  { x: 0,     y: h / 2, side: 'left'   },
  { x: w / 2, y: h / 2, side: 'center' },
];

function NodeShape({ node, isSelected, isInSelection, onSelect, onStartLink, onEndLink, onRenameStart, onContextMenu, isLinking, onGroupDragStart, onGroupDragMove }) {
  const {
    nodes,
    updateNode,
    updateNodeAnchor,
    showSymmetryLines,
    snapToSymmetryLines,
    setSymmetryGuides,
  } = useStore();
  const [hovered, setHovered] = useState(false);
  const dragSnapRef   = useRef(null);
  const dragStartPosRef = useRef(null); // {x,y} of this node at drag start

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
    onSelect(false);
    dragStartPosRef.current = { x: node.x, y: node.y };
    onGroupDragStart?.(node.id);
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
          isSameGuideMatch(match, activeSnap)
        ) ?? activeSnap;
        dragSnapRef.current = guideMatch;
      } else {
        dragSnapRef.current = null;
      }
    }

    if (canSnap && !dragSnapRef.current && guideMatch && guideMatch.delta <= SNAP_DISTANCE) {
      dragSnapRef.current = guideMatch;
      nextPos = { ...nextPos, [guideMatch.axis]: guideMatch.snapPos };
      guideMatches = collectGuideMatches(nextPos, nodes);
      guideMatch = guideMatches.find(match =>
        isSameGuideMatch(match, dragSnapRef.current)
      ) ?? dragSnapRef.current;
      dragSnapRef.current = guideMatch;
    }

    const visibleGuides = canShowGuides
      ? collectVisibleGuides(guideMatches, dragSnapRef.current)
      : [];

    setSymmetryGuides(visibleGuides);
    applyDraggedPosition(e.target, nextPos);
    updateNode(node.id, { x: nextPos.x, y: nextPos.y });

    // Move other selected nodes by the same delta
    if (dragStartPosRef.current && isInSelection) {
      const dx = nextPos.x - dragStartPosRef.current.x;
      const dy = nextPos.y - dragStartPosRef.current.y;
      onGroupDragMove?.(node.id, dx, dy);
    }
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
      onClick={(e)    => { e.cancelBubble = true; onSelect(e.evt?.shiftKey); }}
      onTap={(e)      => { e.cancelBubble = true; onSelect(false); }}
      onDblClick={(e) => {
        e.cancelBubble = true;
        onSelect(false);
        onRenameStart?.(node.id);
      }}
      onDblTap={(e) => {
        e.cancelBubble = true;
        onSelect(false);
        onRenameStart?.(node.id);
      }}
      onContextMenu={(e) => {
        e.cancelBubble = true;
        onSelect(false);
        onContextMenu?.(e, node.id);
      }}
      onMouseEnter={()=> setHovered(true)}
      onMouseLeave={()=> setHovered(false)}
      onMouseUp={(e)  => { if (isLinking) { e.cancelBubble = true; onEndLink(node.id, null); }}}
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
        stroke={isSelected ? pageColors.blueSelection : isInSelection ? pageColors.purpleAccent : node.stroke}
        strokeWidth={isSelected ? node.strokeWidth + 1 : isInSelection ? node.strokeWidth + 1 : node.strokeWidth}
        dash={isInSelection && !isSelected ? [6, 3] : undefined}
        dashEnabled={!!(isInSelection && !isSelected)}
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

      {showPorts && ports.map((p, i) => {
        const isCenter = p.side === 'center';
        return (
          <Circle
            key={i}
            x={p.x}
            y={p.y}
            radius={isCenter ? PORT_R - 2 : PORT_R}
            fill={isCenter ? pageColors.transparent : pageColors.blueMain}
            stroke={isCenter ? pageColors.blueSelection : pageColors.blueSelection}
            strokeWidth={isCenter ? 1.5 : 2}
            dash={isCenter ? [3, 2] : undefined}
            onMouseDown={(e) => {
              e.cancelBubble = true;
              onStartLink(node.id, { side: p.side, along: 0, anchorId: null, centered: p.side !== 'center' });
            }}
            onMouseUp={(e) => {
              e.cancelBubble = true;
              onEndLink(node.id, { side: p.side, along: 0, anchorId: null, centered: p.side !== 'center' });
            }}
            onMouseEnter={e => { e.target.getStage().container().style.cursor = 'crosshair'; }}
            onMouseLeave={e => { e.target.getStage().container().style.cursor = 'default'; }}
          />
        );
      })}

      {showPorts && (node.anchors ?? []).map((anchor) => {
        const point = getNodeAnchorPoint(node, anchor);
        return (
          <Circle
            key={anchor.id}
            x={point.x - node.x}
            y={point.y - node.y}
            radius={6}
            fill={pageColors.purpleAccent}
            stroke={pageColors.white}
            strokeWidth={1.5}
            draggable={isSelected && !isLinking}
            onDragStart={(e) => {
              e.cancelBubble = true;
            }}
            onDragMove={(e) => {
              e.cancelBubble = true;
              const next = getClosestNodeOutlinePosition(node, {
                x: node.x + e.target.x(),
                y: node.y + e.target.y(),
              });
              e.target.x(next.point.x - node.x);
              e.target.y(next.point.y - node.y);
              updateNodeAnchor(node.id, anchor.id, { side: next.side, along: next.along });
            }}
            onDragEnd={(e) => {
              e.cancelBubble = true;
            }}
            onMouseUp={(e) => {
              e.cancelBubble = true;
              if (!isLinking) return;
              onEndLink(node.id, { side: anchor.side, along: anchor.along ?? 0, anchorId: anchor.id });
            }}
          />
        );
      })}
    </Group>
  );
}

export default NodeShape;
