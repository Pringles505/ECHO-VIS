import React from 'react';
import { Group, Rect, Line, Text } from 'react-konva';
import { pageColors, withAlpha } from '../../colorThemes';
import useStore from '../../store/useStore';

// Ephemeral "ghost" alignment overlay (pasted with Ctrl+B). It is a viewport-only
// reference of a copied selection — never part of nodes/links, never saved or exported.
// Drag it to position; right-click to dismiss.
function GhostOverlay() {
  const ghost = useStore(state => state.ghost);
  const moveGhost = useStore(state => state.moveGhost);
  const clearGhost = useStore(state => state.clearGhost);

  if (!ghost) return null;
  const { nodes = [], links = [], offsetX = 0, offsetY = 0 } = ghost;
  if (!nodes.length && !links.length) return null;

  const accent = pageColors.purpleAccent;
  const nodeById = {};
  for (const n of nodes) nodeById[n.id] = n;

  // Bounding box (for the drag/right-click handle + a faint region tint).
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x + offsetX);
    minY = Math.min(minY, n.y + offsetY);
    maxX = Math.max(maxX, n.x + offsetX + (n.width ?? 0));
    maxY = Math.max(maxY, n.y + offsetY + (n.height ?? 0));
  }
  const hasBox = Number.isFinite(minX);
  const boxPad = 10;

  const dismiss = (e) => {
    e.evt?.preventDefault?.();
    e.cancelBubble = true;
    clearGhost();
  };

  return (
    <Group
      draggable
      onDragEnd={(e) => {
        const dx = e.target.x();
        const dy = e.target.y();
        e.target.position({ x: 0, y: 0 });
        if (dx || dy) moveGhost(dx, dy);
      }}
      onContextMenu={dismiss}
      onMouseDown={(e) => { e.cancelBubble = true; }}
      opacity={0.6}
    >
      {/* Drag + right-click handle (faint region tint). Listening surface for the group. */}
      {hasBox && (
        <Rect
          x={minX - boxPad}
          y={minY - boxPad}
          width={(maxX - minX) + boxPad * 2}
          height={(maxY - minY) + boxPad * 2}
          cornerRadius={8}
          fill={withAlpha(accent, 0.05)}
          stroke={withAlpha(accent, 0.4)}
          strokeWidth={1}
          dash={[3, 4]}
        />
      )}

      {/* Ghost links */}
      {links.map((l) => {
        const a = nodeById[l.fromId];
        const b = nodeById[l.toId];
        if (!a || !b) return null;
        const ax = a.x + offsetX + (a.width ?? 0) / 2;
        const ay = a.y + offsetY + (a.height ?? 0) / 2;
        const bx = b.x + offsetX + (b.width ?? 0) / 2;
        const by = b.y + offsetY + (b.height ?? 0) / 2;
        return (
          <Line
            key={`g-link-${l.id}`}
            points={[ax, ay, bx, by]}
            stroke={withAlpha(l.stroke || accent, 0.7)}
            strokeWidth={1.5}
            dash={[6, 4]}
            listening={false}
          />
        );
      })}

      {/* Ghost nodes */}
      {nodes.map((n) => {
        const x = n.x + offsetX;
        const y = n.y + offsetY;
        const w = n.width ?? 80;
        const h = n.height ?? 40;
        const fill = n.fill || accent;
        const stroke = n.stroke || accent;
        return (
          <React.Fragment key={`g-node-${n.id}`}>
            <Rect
              x={x}
              y={y}
              width={w}
              height={h}
              cornerRadius={n.shape === 'pill' ? Math.min(w, h) / 2 : (n.cornerRadius ?? 8)}
              fill={withAlpha(fill, 0.2)}
              stroke={withAlpha(stroke, 0.75)}
              strokeWidth={1.5}
              dash={[6, 4]}
              listening={false}
            />
            {n.label ? (
              <Text
                x={x}
                y={y + h / 2 - (n.fontSize ?? 12) / 2}
                width={w}
                text={n.label}
                align="center"
                fontSize={n.fontSize ?? 12}
                fontStyle="600"
                fill={withAlpha(n.textColor || pageColors.white, 0.85)}
                listening={false}
              />
            ) : null}
          </React.Fragment>
        );
      })}
    </Group>
  );
}

export default GhostOverlay;
