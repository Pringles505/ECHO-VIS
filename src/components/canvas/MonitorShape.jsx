import React, { useRef, useState } from 'react';
import { Circle, Group, Rect, Text } from 'react-konva';
import { pageColors } from '../../colorThemes';
import useStore from '../../store/useStore';
import NodeStatusMark, { getNodeStatusDash, getNodeStatusStroke, getNodeStatusTextColor } from './NodeStatusMark';

const PORT_R = 7;

// Measure rendered text width so the value border can hug the text tightly.
let _measureCtx = null;
function measureTextWidth(text, fontSize, fontFamily, fontWeight = '500') {
  if (typeof document === 'undefined') return (text?.length ?? 0) * fontSize * 0.6;
  if (!_measureCtx) _measureCtx = document.createElement('canvas').getContext('2d');
  _measureCtx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  return _measureCtx.measureText(text ?? '').width;
}

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
  renderEditorChrome = true,
}) {
  const updateNode = useStore(state => state.updateNode);

  const [hovered, setHovered] = useState(false);
  const dragStartPosRef = useRef(null);

  const stroke = isSelected
    ? pageColors.blueSelection
    : isInSelection
      ? pageColors.purpleAccent
      : getNodeStatusStroke(node, node.stroke);
  const strokeWidth = (isSelected || isInSelection) ? node.strokeWidth + 1 : node.strokeWidth;
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;

  const showPorts = renderEditorChrome && (isSelected || hovered || isLinking);
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
      {renderEditorChrome && (
        <Rect width={node.width} height={node.height} fill={pageColors.blackHitArea} />
      )}

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
        baseStroke={getNodeStatusStroke(node, node.stroke)}
        baseStrokeWidth={node.strokeWidth}
        dash={getNodeStatusDash(node)}
        dashEnabled={!!node.offline}
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
            fill={getNodeStatusTextColor(node, pageColors.white)}
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
        fill={getNodeStatusTextColor(node, node.textColor)}
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
        fill={getNodeStatusTextColor(node, node.textColor)}
        fontFamily="Inter, system-ui, sans-serif"
        fontStyle="500"
        listening={false}
      />

      {/* Border hugging the value text, so the node reads like a special
          monitor rather than a normal node. Sized to the text it displays. */}
      {node.showMonitorTag !== false && (() => {
        const fontSize = node.fontSize ?? 14;
        const fontFamily = 'Inter, system-ui, sans-serif';
        const padX = 10;
        const padY = 4;
        const measured = measureTextWidth(node.initialValue ?? '', fontSize, fontFamily, '500');
        const bw = Math.min(node.width - 8, Math.max(40, measured + padX * 2));
        const bh = Math.max(fontSize + padY * 2, 18);
        const cyValue = valueY + valueH / 2;
        const bx = (node.width - bw) / 2;
        const by = cyValue - bh / 2;
        const accent = getNodeStatusStroke(node, node.stroke || pageColors.purpleAccent);
        return (
          <Rect
            x={bx}
            y={by}
            width={bw}
            height={bh}
            cornerRadius={Math.min(bh / 2, 6)}
            stroke={accent}
            strokeWidth={2.5}
            fill={pageColors.transparent}
            opacity={0.95}
            listening={false}
          />
        );
      })()}

      <NodeStatusMark node={node} />

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
