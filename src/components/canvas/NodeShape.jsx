import React, { useRef, useState } from 'react';
import { Ellipse, Group, Line, Rect, Text, Circle, Path } from 'react-konva';
import { pageColors } from '../../../colorThemes';
import { getNodeLabelFrame } from '../../nodeLabelFrame';
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

function getVisualStroke(node, isSelected, isInSelection) {
  return isSelected
    ? pageColors.blueSelection
    : isInSelection
      ? pageColors.purpleAccent
      : node.failing
        ? pageColors.dangerBright
        : node.stroke;
}

function getNodeTransformStyle(node, resolvedTargetNode) {
  const mode = node.transformMode;
  if (!mode || mode === 'none') return null;
  if (mode === 'existing') {
    const targetNode = resolvedTargetNode;
    if (!targetNode) return null;
    return {
      width: targetNode.width ?? node.width,
      height: targetNode.height ?? node.height,
      shape: targetNode.shape ?? 'rounded',
      cornerRadius: targetNode.cornerRadius ?? 8,
      fill: targetNode.fill ?? node.fill,
      stroke: targetNode.stroke ?? node.stroke,
      strokeWidth: targetNode.strokeWidth ?? node.strokeWidth,
    };
  }
  if (!node.transformTarget) return null;
  return {
    width: node.transformTarget.width ?? node.width,
    height: node.transformTarget.height ?? node.height,
    shape: node.transformTarget.shape ?? node.shape ?? 'rounded',
    cornerRadius: node.transformTarget.cornerRadius ?? node.cornerRadius ?? 8,
    fill: node.transformTarget.fill ?? node.fill,
    stroke: node.transformTarget.stroke ?? node.stroke,
    strokeWidth: node.transformTarget.strokeWidth ?? node.strokeWidth,
  };
}

function renderNodeHighlight(node, extraProps = {}) {
  if (node.shape === 'diamond' || node.shape === 'hexagon' || node.shape === 'circle' || node.shape === 'pillar' || node.shape === 'cylinder' || node.shape === 'slanted') return null;
  return (
    <Rect
      x={node.shape === 'pill' ? node.height / 2 : node.cornerRadius}
      y={1}
      width={node.width - (node.shape === 'pill' ? node.height : node.cornerRadius * 2)}
      height={1}
      fill={pageColors.whiteInnerHighlight}
      listening={false}
      {...extraProps}
    />
  );
}

function renderNodeBody(node, stroke, strokeWidth, isInSelection, fill, shadow = false, extraProps = {}) {
  const dashProps = isInSelection ? { dash: [6, 3], dashEnabled: true } : {};
  const common = {
    stroke,
    strokeWidth,
    fill,
    ...dashProps,
    ...extraProps,
  };

  if (node.shape === 'diamond') {
    const points = [
      node.width / 2, 0,
      node.width, node.height / 2,
      node.width / 2, node.height,
      0, node.height / 2,
    ];
    return (
      <Line
        points={points}
        closed
        {...common}
        x={shadow ? 4 : 0}
        y={shadow ? 4 : 0}
      />
    );
  }

  if (node.shape === 'hexagon') {
    const inset = Math.min(node.width * 0.24, node.height * 0.5);
    const points = [
      inset, 0,
      node.width - inset, 0,
      node.width, node.height / 2,
      node.width - inset, node.height,
      inset, node.height,
      0, node.height / 2,
    ];
    return (
      <Line
        points={points}
        closed
        {...common}
        x={shadow ? 4 : 0}
        y={shadow ? 4 : 0}
      />
    );
  }

  if (node.shape === 'circle') {
    return (
      <Ellipse
        x={node.width / 2 + (shadow ? 4 : 0)}
        y={node.height / 2 + (shadow ? 4 : 0)}
        radiusX={node.width / 2}
        radiusY={node.height / 2}
        {...common}
      />
    );
  }

  if (node.shape === 'pillar' || node.shape === 'cylinder') {
    const w = node.width;
    const h = node.height;
    // Flat cylinder: slightly concave vertical sides.
    const curve = Math.min(w, h) * 0.12;
    const pathData = [
      `M ${curve},0`,
      `L ${w - curve},0`,
      `Q ${w - curve * 0.2},${h / 2} ${w - curve},${h}`,
      `L ${curve},${h}`,
      `Q ${curve * 0.2},${h / 2} ${curve},0`,
      'Z',
    ].join(' ');

    return (
      <Path
        data={pathData}
        {...common}
        x={shadow ? 4 : 0}
        y={shadow ? 4 : 0}
      />
    );
  }

  if (node.shape === 'slanted') {
    const inset = Math.min(node.width * 0.18, node.height * 0.42);
    const points = [
      inset, 0,
      node.width, 0,
      node.width - inset, node.height,
      0, node.height,
    ];
    return (
      <Line
        points={points}
        closed
        {...common}
        x={shadow ? 4 : 0}
        y={shadow ? 4 : 0}
      />
    );
  }

  const cornerRadius = node.shape === 'pill'
    ? Math.min(node.width, node.height) / 2
    : node.cornerRadius;

  return (
    <Rect
      x={shadow ? 4 : 0}
      y={shadow ? 4 : 0}
      width={node.width}
      height={node.height}
      cornerRadius={cornerRadius}
      {...common}
    />
  );
}

function NodeShape({ node, isSelected, isInSelection, onSelect, onStartLink, onEndLink, onRenameStart, onContextMenu, isLinking, onGroupDragStart, onGroupDragMove }) {
  // Use individual selectors so NodeShape only re-renders when the specific values it needs change,
  // not on every node array update (which would cause O(n) re-renders per drag frame).
  const updateNode        = useStore(state => state.updateNode);
  const updateNodeAnchor  = useStore(state => state.updateNodeAnchor);
  const showSymmetryLines = useStore(state => state.showSymmetryLines);
  const snapToSymmetryLines = useStore(state => state.snapToSymmetryLines);
  const setSymmetryGuides = useStore(state => state.setSymmetryGuides);

  // Targeted selector — only subscribes to the specific transform target node, not the whole array
  const transformTargetNodeId = node.transformMode === 'existing' ? node.transformTargetNodeId : null;
  const transformTargetNode = useStore(state =>
    transformTargetNodeId
      ? (state.nodes.find(n =>
          n.id === transformTargetNodeId &&
          n.id !== node.id &&
          n.type !== 'area' && n.type !== 'mirror' && n.type !== 'text'
        ) ?? null)
      : null
  );

  const [hovered, setHovered] = useState(false);
  const dragSnapRef   = useRef(null);
  const dragStartPosRef = useRef(null);
  const isTextNode = node.type === 'text';
  const transformStyle = (!isTextNode && node.transformMode && node.transformMode !== 'none')
    ? getNodeTransformStyle(node, transformTargetNode)
    : null;
  const stroke = getVisualStroke(node, isSelected, isInSelection);
  const strokeWidth = isSelected ? node.strokeWidth + 1 : isInSelection ? node.strokeWidth + 1 : node.strokeWidth;
  const labelFrame = getNodeLabelFrame(node);

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
    if (!isSelected && !isInSelection) {
      onSelect(false);
    }
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
    // Read nodes on-demand during drag — avoids subscribing to the nodes array in render
    const nodes = (canShowGuides || canSnap) ? useStore.getState().nodes : [];
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

    if (dragStartPosRef.current) {
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
        width={node.width}
        height={node.height}
        fill={pageColors.blackHitArea}
      />

      {!isTextNode && (
        renderNodeBody(node, pageColors.transparent, 0, false, pageColors.blackShadowNode, true, { id: `node-shadow-${node.id}` })
      )}

      {!isTextNode && (
        renderNodeBody(node, stroke, strokeWidth, isInSelection && !isSelected, node.fill, false, {
          id: `node-body-${node.id}`,
          baseFill: node.fill,
          baseStroke: node.stroke,
          baseStrokeWidth: node.strokeWidth,
        })
      )}

      {transformStyle && (() => {
        const pseudoNode = {
          ...node,
          width: transformStyle.width ?? node.width,
          height: transformStyle.height ?? node.height,
          shape: transformStyle.shape,
          cornerRadius: transformStyle.cornerRadius,
        };
        const dx = ((node.width ?? 0) - (pseudoNode.width ?? 0)) / 2;
        const dy = ((node.height ?? 0) - (pseudoNode.height ?? 0)) / 2;
        return (
          <Group x={dx} y={dy} listening={false}>
            {renderNodeBody(
              pseudoNode,
              transformStyle.stroke,
              transformStyle.strokeWidth ?? node.strokeWidth,
              false,
              transformStyle.fill,
              false,
              { id: `node-body-transform-${node.id}`, opacity: 0 }
            )}
            {renderNodeHighlight(pseudoNode, { id: `node-highlight-transform-${node.id}`, opacity: 0 })}
          </Group>
        );
      })()}

      {!isTextNode && renderNodeHighlight(node, { id: `node-highlight-${node.id}` })}

      {isTextNode && showPorts && (
        <Rect
          width={node.width}
          height={node.height}
          cornerRadius={6}
          stroke={isSelected ? pageColors.blueSelection : pageColors.purpleAccent}
          strokeWidth={1}
          dash={[5, 4]}
          opacity={0.35}
          listening={false}
        />
      )}

      <Text
        id={`node-label-${node.id}`}
        baseText={node.label}
        x={labelFrame.x}
        y={labelFrame.y}
        width={labelFrame.width}
        height={labelFrame.height}
        text={node.label}
        align="center"
        verticalAlign="middle"
        fontSize={node.fontSize}
        fill={node.textColor}
        baseFill={node.textColor}
        fontFamily="Inter, system-ui, sans-serif"
        fontStyle="500"
        listening={false}
      />

      <Text
        id={`node-label-morph-${node.id}`}
        x={labelFrame.x}
        y={labelFrame.y}
        width={labelFrame.width}
        height={labelFrame.height}
        text=""
        align="center"
        verticalAlign="middle"
        fontSize={node.fontSize}
        fill={node.textColor}
        baseFill={node.textColor}
        fontFamily="Inter, system-ui, sans-serif"
        fontStyle="500"
        opacity={0}
        listening={false}
      />

      {node.failing && (() => {
        const cx = node.width / 2;
        const cy = node.height / 2;
        const sz = Math.max(9, Math.min(node.width, node.height) * 0.28);
        const sw = Math.max(2.5, node.strokeWidth * 1.1);
        return (
          <Group id={`node-fail-${node.id}`} x={cx} y={cy} listening={false}>
            <Circle radius={sz + 7} fill={pageColors.dangerMain} opacity={0.18} />
            <Circle radius={sz + 3} stroke={pageColors.dangerBright} strokeWidth={1} opacity={0.35} />
            <Line points={[-sz, -sz, sz, sz]} stroke={pageColors.dangerBright} strokeWidth={sw} lineCap="round" />
            <Line points={[sz, -sz, -sz, sz]} stroke={pageColors.dangerBright} strokeWidth={sw} lineCap="round" />
          </Group>
        );
      })()}

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
