import React, { useRef, useState } from 'react';
import { Circle, Group, Rect, Text } from 'react-konva';
import { pageColors } from '../../../colorThemes';
import useStore from '../../store/useStore';

const PORT_R = 7;

const PORT_POSITIONS = (w, h) => [
  { x: w / 2, y: 0,     side: 'top'    },
  { x: w,     y: h / 2, side: 'right'  },
  { x: w / 2, y: h,     side: 'bottom' },
  { x: 0,     y: h / 2, side: 'left'   },
  { x: w / 2, y: h / 2, side: 'center' },
];

function MonitorShape({
  node,
  isSelected,
  isInSelection,
  onSelect,
  onStartLink,
  onEndLink,
  onContextMenu,
  isLinking,
  onGroupDragStart,
  onGroupDragMove,
}) {
  const updateNode = useStore(state => state.updateNode);

  const [hovered, setHovered] = useState(false);
  const dragStartPosRef = useRef(null);

  const stroke = isSelected
    ? pageColors.blueSelection
    : isInSelection
      ? pageColors.purpleAccent
      : node.stroke;
  const strokeWidth = (isSelected || isInSelection) ? node.strokeWidth + 1 : node.strokeWidth;
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;

  const showPorts = isSelected || hovered || isLinking;
  // Monitors don't participate in flow; we only show a dashed center port as a visual affordance
  const ports = [{ x: node.width / 2, y: node.height / 2, side: 'center' }];

  const handleDragStart = (e) => {
    e.cancelBubble = true;
    if (!isSelected && !isInSelection) onSelect(false);
    dragStartPosRef.current = { x: node.x, y: node.y };
    onGroupDragStart?.(node.id);
  };

  const handleDragMove = (e) => {
    const nx = e.target.x() - node.width / 2;
    const ny = e.target.y() - node.height / 2;
    updateNode(node.id, { x: nx, y: ny });
    if (dragStartPosRef.current) {
      onGroupDragMove?.(node.id, nx - dragStartPosRef.current.x, ny - dragStartPosRef.current.y);
    }
  };

  const handleDragEnd = (e) => {
    updateNode(node.id, {
      x: e.target.x() - node.width / 2,
      y: e.target.y() - node.height / 2,
    });
  };

  const titleText = (node.monitorTitle ?? '').trim();
  const showTitle = titleText.length > 0;
  const titleH = showTitle ? 24 : 0;
  const valueY = showTitle ? titleH + 6 : 6;
  const valueH = Math.max(20, node.height - valueY - 6);

  return (
    <Group
      id={`node-${node.id}`}
      x={cx}
      y={cy}
      offsetX={node.width / 2}
      offsetY={node.height / 2}
      draggable={!isLinking}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onClick={(e) => { e.cancelBubble = true; onSelect(e.evt?.shiftKey); }}
      onTap={(e) => { e.cancelBubble = true; onSelect(false); }}
      onContextMenu={(e) => { e.cancelBubble = true; onSelect(false); onContextMenu?.(e, node.id); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseUp={(e) => { if (isLinking) { e.cancelBubble = true; onEndLink(node.id, null); } }}
    >
      <Rect width={node.width} height={node.height} fill={pageColors.blackHitArea} />

      {/* shadow */}
      <Rect
        x={4}
        y={4}
        width={node.width}
        height={node.height}
        cornerRadius={node.cornerRadius}
        fill={pageColors.blackShadowNode}
        listening={false}
      />

      {/* body */}
      <Rect
        id={`node-body-${node.id}`}
        width={node.width}
        height={node.height}
        cornerRadius={node.cornerRadius}
        fill={node.fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        baseFill={node.fill}
        baseStroke={node.stroke}
        baseStrokeWidth={node.strokeWidth}
      />


      {showTitle && (
        <Group listening={false}>
          <Rect
            x={0}
            y={0}
            width={node.width}
            height={titleH}
            fill={pageColors.purpleSurfacePanel}
            stroke={pageColors.purpleBorderSoft}
            strokeWidth={1}
          />
          <Text
            x={0}
            y={0}
            width={node.width}
            height={titleH}
            text={titleText}
            align="center"
            verticalAlign="middle"
            fontSize={12}
            fill={pageColors.white}
            fontFamily="Inter, system-ui, sans-serif"
            fontStyle="700"
          />
        </Group>
      )}

      {/* Value (driven by applyAnimState via id; initial shown before playback) */}
      <Text
        id={`monitor-value-${node.id}`}
        baseText={node.initialValue ?? ''}
        x={0}
        y={valueY}
        width={node.width}
        height={valueH}
        text={node.initialValue ?? ''}
        align="center"
        verticalAlign="middle"
        fontSize={node.fontSize ?? 14}
        fill={node.textColor}
        fontFamily="Inter, system-ui, sans-serif"
        fontStyle="500"
        listening={false}
      />

      {/* Next value for smooth crossfade; opacity controlled by applyAnimState */}
      <Text
        id={`monitor-value-next-${node.id}`}
        x={0}
        y={valueY}
        width={node.width}
        height={valueH}
        text=""
        opacity={0}
        align="center"
        verticalAlign="middle"
        fontSize={node.fontSize ?? 14}
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
            stroke={pageColors.blueSelection}
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
    </Group>
  );
}

export default MonitorShape;
