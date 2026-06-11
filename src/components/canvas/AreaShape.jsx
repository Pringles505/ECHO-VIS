import React, { useRef, useState } from 'react';
import { Circle, Group, Rect, Text } from 'react-konva';
import { pageColors } from '../../colorThemes';
import useStore from '../../store/useStore';

const MIN_W = 120;
const MIN_H = 80;
const HANDLE_R = 5;

function AreaShape({ area, isSelected, isInSelection, onSelect, onContextMenu, onGroupDragStart, onGroupDragMove, renderEditorChrome = true }) {
  const { updateNode } = useStore();
  const [hovered, setHovered] = useState(false);
  const resizeRef = useRef(null);
  const dragStartPosRef = useRef(null);

  const borderColor = isSelected
    ? pageColors.blueSelection
    : isInSelection
      ? pageColors.purpleAccent
      : area.stroke;
  const borderWidth = isSelected ? (area.strokeWidth ?? 1.5) + 1 : (area.strokeWidth ?? 1.5);

  const startResize = (e, handle) => {
    e.cancelBubble = true;
    const absPos = e.target.getAbsolutePosition();
    resizeRef.current = {
      handle,
      initAbsX: absPos.x,
      initAbsY: absPos.y,
      initArea: { x: area.x, y: area.y, width: area.width, height: area.height },
      stageScale: e.target.getStage().scaleX(),
    };
  };

  const doResize = (e) => {
    e.cancelBubble = true;
    if (!resizeRef.current) return;
    const { handle, initAbsX, initAbsY, initArea, stageScale } = resizeRef.current;
    const absPos = e.target.getAbsolutePosition();
    const dx = (absPos.x - initAbsX) / stageScale;
    const dy = (absPos.y - initAbsY) / stageScale;

    let { x, y, width, height } = initArea;
    if (handle === 'tl') {
      const newW = Math.max(MIN_W, width - dx);
      const newH = Math.max(MIN_H, height - dy);
      x = x + width - newW;
      y = y + height - newH;
      width = newW;
      height = newH;
    } else if (handle === 'tr') {
      width = Math.max(MIN_W, width + dx);
      const newH = Math.max(MIN_H, height - dy);
      y = y + height - newH;
      height = newH;
    } else if (handle === 'bl') {
      const newW = Math.max(MIN_W, width - dx);
      x = x + width - newW;
      width = newW;
      height = Math.max(MIN_H, height + dy);
    } else {
      // br
      width = Math.max(MIN_W, width + dx);
      height = Math.max(MIN_H, height + dy);
    }
    updateNode(area.id, { x, y, width, height });
  };

  const endResize = (e) => {
    e.cancelBubble = true;
    doResize(e);
    resizeRef.current = null;
  };

  const corners = [
    { id: 'tl', lx: 0,          ly: 0,           cursor: 'nwse-resize' },
    { id: 'tr', lx: area.width, ly: 0,           cursor: 'nesw-resize' },
    { id: 'bl', lx: 0,          ly: area.height, cursor: 'nesw-resize' },
    { id: 'br', lx: area.width, ly: area.height, cursor: 'nwse-resize' },
  ];

  return (
    <Group
      id={`node-${area.id}`}
      x={area.x}
      y={area.y}
      draggable
      onDragStart={(e) => {
        e.cancelBubble = true;
        if (!isSelected && !isInSelection) {
          onSelect(false);
        }
        dragStartPosRef.current = { x: area.x, y: area.y };
        onGroupDragStart?.(area.id);
      }}
      onDragMove={(e) => {
        updateNode(area.id, { x: e.target.x(), y: e.target.y() });
        if (dragStartPosRef.current) {
          onGroupDragMove?.(
            area.id,
            e.target.x() - dragStartPosRef.current.x,
            e.target.y() - dragStartPosRef.current.y
          );
        }
      }}
      onDragEnd={(e) => {
        dragStartPosRef.current = null;
        updateNode(area.id, { x: e.target.x(), y: e.target.y() });
      }}
      onClick={(e) => { e.cancelBubble = true; onSelect(e.evt?.shiftKey); }}
      onTap={(e) => { e.cancelBubble = true; onSelect(false); }}
      onContextMenu={(e) => { e.cancelBubble = true; onContextMenu?.(e, area.id); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Transparent hit-zone so clicking inside selects the area */}
      {renderEditorChrome && (
        <Rect
          width={area.width}
          height={area.height}
          fill={pageColors.blackHitArea}
        />
      )}

      {/* Main area fill + dashed border — ID'd so applyAnimState can animate it */}
      <Rect
        id={`area-rect-${area.id}`}
        baseWidth={area.width}
        baseHeight={area.height}
        areaAnimMode={area.areaAnimMode ?? 'fade'}
        width={area.width}
        height={area.height}
        fill={area.fill}
        stroke={borderColor}
        strokeWidth={borderWidth}
        cornerRadius={area.cornerRadius ?? 12}
        dash={[10, 6]}
        dashEnabled
        opacity={area.areaInvisible ? 0 : (area.areaOpacity ?? 1)}
        visible={!area.areaInvisible}
        perfectDrawEnabled={false}
        listening={false}
      />

      {/* Label at top-left inside the area */}
      <Text
        id={`area-label-${area.id}`}
        x={16}
        y={14}
        text={area.label}
        fontSize={area.fontSize ?? 12}
        fill={isSelected ? pageColors.blueSelection : area.textColor ?? area.stroke}
        fontFamily="Inter, system-ui, sans-serif"
        fontStyle={area.bold ? '700' : '600'}
        letterSpacing={0.5}
        listening={false}
        visible={!area.areaInvisible}
      />

      {/* Corner resize handles — only when selected */}
      {isSelected && corners.map(c => (
        <Group
          key={c.id}
          x={c.lx}
          y={c.ly}
          draggable
          onMouseDown={(e) => { e.cancelBubble = true; }}
          onTouchStart={(e) => { e.cancelBubble = true; }}
          onDragStart={(e) => startResize(e, c.id)}
          onDragMove={doResize}
          onDragEnd={endResize}
          onMouseEnter={(e) => { e.target.getStage().container().style.cursor = c.cursor; }}
          onMouseLeave={(e) => { e.target.getStage().container().style.cursor = 'default'; }}
        >
          <Rect x={-8} y={-8} width={16} height={16} fill={pageColors.blackHitArea} />
          <Circle
            radius={HANDLE_R}
            fill={pageColors.blueBright}
            stroke={pageColors.blueSelection}
            strokeWidth={1.5}
            listening={false}
          />
        </Group>
      ))}
    </Group>
  );
}

export default AreaShape;
