import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Group, Line, Path, Rect, Text } from 'react-konva';
import { pageColors } from '../../../colorThemes';
import { buildLinkRenderData, getLinkParallelOffset, getNodeAnchorCandidates, JOINT_HIT_RADIUS } from '../../links/linkGeometry';
import useStore from '../../store/useStore';
import { buildWebByLinkId, computeVariableWebs } from '../../variables/flow';
import { collectGuideMatches, collectVisibleGuides, isSameGuideMatch, SNAP_DISTANCE, UNSNAP_DISTANCE } from './symmetryGuides';

const END_HANDLE_RADIUS = 7;
const ANCHOR_PAD = 12;

function getLinkMidpoint(startPoint, jointRenderPoints, endPoint) {
  const pts = [startPoint, ...jointRenderPoints, endPoint];
  let totalLen = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    totalLen += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
  }
  if (totalLen === 0) return { x: (startPoint.x + endPoint.x) / 2, y: (startPoint.y + endPoint.y) / 2 };
  const half = totalLen / 2;
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const segLen = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    if (acc + segLen >= half) {
      const t = (half - acc) / segLen;
      return { x: pts[i].x + t * (pts[i + 1].x - pts[i].x), y: pts[i].y + t * (pts[i + 1].y - pts[i].y) };
    }
    acc += segLen;
  }
  return endPoint;
}
const SIDE_CENTER_SNAP = 10;
const GRID_SPACING = 72;
const GRID_SNAP_DISTANCE = 10;
const GRID_UNSNAP_DISTANCE = 18;

function resolveAnchor(cursor, anchors, node) {
  let best = null;
  for (const [side, anchor] of Object.entries(anchors)) {
    const d = Math.hypot(cursor.x - anchor.x, cursor.y - anchor.y);
    if (!best || d < best.d) best = { side, d };
  }
  const side = best?.side ?? 'right';
  if (side === 'center') return { side, along: 0, point: anchors.center };

  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  const hw = node.width / 2 - ANCHOR_PAD;
  const hh = node.height / 2 - ANCHOR_PAD;

  let along, point;
  if (side === 'top' || side === 'bottom') {
    along = Math.max(-hw, Math.min(hw, cursor.x - cx));
    if (Math.abs(along) <= SIDE_CENTER_SNAP) along = 0;
    point = { x: cx + along, y: side === 'top' ? node.y : node.y + node.height };
  } else {
    along = Math.max(-hh, Math.min(hh, cursor.y - cy));
    if (Math.abs(along) <= SIDE_CENTER_SNAP) along = 0;
    point = { x: side === 'left' ? node.x : node.x + node.width, y: cy + along };
  }
  return { side, along, point, centered: along === 0 };
}

function getGridSnappedPoint(point) {
  const snapX = Math.round(point.x / GRID_SPACING) * GRID_SPACING;
  const snapY = Math.round(point.y / GRID_SPACING) * GRID_SPACING;
  return {
    x: Math.abs(point.x - snapX) <= GRID_SNAP_DISTANCE ? snapX : point.x,
    y: Math.abs(point.y - snapY) <= GRID_SNAP_DISTANCE ? snapY : point.y,
  };
}

function LinkShape({
  link,
  allLinks,
  fromNode,
  toNode,
  isSelected,
  isInSelection,
  selectedJointId,
  onSelect,
  onContextMenu,
  onJointSelect,
  onJointContextMenu,
  onJointDragStart,
  onJointDragMove,
  onJointDragEnd,
  onStartBranchFromJoint,
  onStartAnchorChange,
  onEndAnchorChange,
  onEndLinkAtJunction,
  isLinking = false,
  renderPaths = true,
  renderControls = true,
}) {
  const {
    nodes,
    showGridLines,
    showSymmetryLines,
    snapToSymmetryLines,
    setSymmetryGuides,
  } = useStore();
  const render = buildLinkRenderData(link, fromNode, toNode, allLinks, nodes);
  const renderJointMap = Object.fromEntries(render.jointRenderPoints.map(joint => [joint.id, joint]));
  const parallelOffset = getLinkParallelOffset(link, fromNode, toNode, allLinks);
  const sourceAnchors = getNodeAnchorCandidates(fromNode, parallelOffset);
  const targetAnchors = getNodeAnchorCandidates(toNode, parallelOffset);
  const isFailing = !!link.failing;
  const color = isSelected ? pageColors.blueSelection
    : isInSelection ? pageColors.purpleAccent
    : isFailing ? pageColors.dangerBright
    : link.stroke;
  const failSize = Math.max(7, 4 + (link.strokeWidth ?? 2) * 1.4);
  const failStrokeWidth = Math.max(2, (link.strokeWidth ?? 2) * 0.85);
  const failMidpoint = isFailing
    ? getLinkMidpoint(render.startPoint, render.jointRenderPoints, render.endPoint)
    : null;
  const hasJunctionSource = !!(link.fromJunctionLinkId && link.fromJunctionJointId);
  const [draggedStartPoint, setDraggedStartPoint] = useState(null);
  const [draggedEndPoint, setDraggedEndPoint] = useState(null);
  const startHandlePoint = draggedStartPoint ?? render.startPoint;
  const endHandlePoint = draggedEndPoint ?? render.endPoint;
  const jointSnapRef = useRef(null);
  const jointGridSnapRef = useRef(null);

  useEffect(() => {
    setDraggedStartPoint(null);
    setDraggedEndPoint(null);
  }, [link.id]);

  // Token appearance: per-variable overrides win, then global simulateOptions,
  // then hard-coded defaults.
  const simulateOptions = useStore(state => state.simulateOptions);
  const ownerVariable = useMemo(() => {
    const webs = computeVariableWebs(nodes, allLinks);
    const webByLink = buildWebByLinkId(webs);
    const web = webByLink[link.id];
    if (!web) return null;
    return nodes.find(n => n.id === web.sourceNodeId) ?? null;
  }, [nodes, allLinks, link.id]);
  const pick = (key, fallback) => (
    ownerVariable && ownerVariable[key] != null
      ? ownerVariable[key]
      : (simulateOptions?.[key] ?? fallback)
  );
  const tokenR = Math.max(2, Math.min(24, pick('tokenSize', 7)));
  const tokenFill = pick('tokenFill', '#ffffff');
  const tokenStroke = pick('tokenStroke', pageColors.blueLink);
  const baseTokenText = simulateOptions?.tokenText ?? '';
  const varTextOverride = (ownerVariable?.tokenText ?? '').trim();
  const sourceVar = (fromNode?.variableLabel ?? '').trim();
  const eff = (link.messageLabel && link.messageLabel.trim())
    ? link.messageLabel
    : (varTextOverride || sourceVar || baseTokenText);
  const effectiveTokenText = eff.slice(0, 6);
  const tokenTextColor = pick('tokenTextColor', tokenStroke);
  const tokenTextSize = Math.max(8, Math.min(24, pick('tokenTextSize', 10)));
  const tokenShape = pick('tokenShape', 'circle');

  return (
    <Group>
      {renderPaths && (
        <>
          <Path
            data={render.pathData}
            stroke={pageColors.blackHitArea}
            strokeWidth={Math.max(14, link.strokeWidth + 12)}
            lineCap="round"
            lineJoin="round"
            onClick={(e) => { e.cancelBubble = true; onSelect?.(e.evt?.shiftKey); }}
            onTap={(e) => { e.cancelBubble = true; onSelect?.(false); }}
            onContextMenu={(e) => { e.cancelBubble = true; onContextMenu(e); }}
          />

          <Path
            id={`link-shaft-${link.id}`}
            data={render.pathData}
            stroke={color}
            strokeWidth={isSelected ? link.strokeWidth + 1 : link.strokeWidth}
            lineCap="round"
            lineJoin="round"
            listening={false}
          />

          <Line
            id={`link-head-${link.id}`}
            points={render.arrowHeadPoints}
            basePoints={render.arrowHeadPoints}
            showTip={render.showArrowTip && !isFailing}
            closed
            fill={color}
            stroke={color}
            strokeWidth={1}
            opacity={render.showArrowTip && !isFailing ? 1 : 0}
            listening={false}
          />

          {/* Message token (simulation) — moved by applyAnimState when enabled */}
          <Group id={`link-token-${link.id}`} opacity={0} listening={false}>
            {tokenShape === 'square' ? (
              <Rect width={tokenR * 2} height={tokenR * 2} offsetX={tokenR} offsetY={tokenR} fill={tokenFill} stroke={tokenStroke} strokeWidth={2} cornerRadius={3} />
            ) : tokenShape === 'diamond' ? (
              <Line points={[0, -tokenR, tokenR, 0, 0, tokenR, -tokenR, 0]} closed fill={tokenFill} stroke={tokenStroke} strokeWidth={2} />
            ) : (
              <Circle radius={tokenR} fill={tokenFill} stroke={tokenStroke} strokeWidth={2} />
            )}
            {!!effectiveTokenText && (
              <Text
                id={`link-token-label-${link.id}`}
                text={effectiveTokenText}
                align="center"
                verticalAlign="middle"
                offsetX={tokenR}
                offsetY={tokenR}
                width={tokenR * 2}
                height={tokenR * 2}
                fill={tokenTextColor}
                fontSize={tokenTextSize}
                fontFamily="Inter, system-ui, sans-serif"
                listening={false}
              />
            )}
          </Group>

          {isFailing && failMidpoint && (
            <Group
              id={`link-fail-${link.id}`}
              x={failMidpoint.x}
              y={failMidpoint.y}
              listening={false}
            >
              <Circle
                radius={failSize + 6}
                fill={pageColors.dangerMain}
                opacity={0.18}
              />
              <Circle
                radius={failSize + 2}
                stroke={pageColors.dangerBright}
                strokeWidth={1}
                opacity={0.35}
              />
              <Line
                points={[-failSize, -failSize, failSize, failSize]}
                stroke={pageColors.dangerBright}
                strokeWidth={failStrokeWidth}
                lineCap="round"
              />
              <Line
                points={[failSize, -failSize, -failSize, failSize]}
                stroke={pageColors.dangerBright}
                strokeWidth={failStrokeWidth}
                lineCap="round"
              />
            </Group>
          )}
        </>
      )}

      {renderControls && isSelected && !hasJunctionSource && Object.entries(sourceAnchors).map(([side, anchor]) => (
        <Circle
          key={`src-anchor-${link.id}-${side}`}
          x={anchor.x}
          y={anchor.y}
          radius={4}
          fill={link.fromAnchorSide === side ? pageColors.purpleAccent : pageColors.blueSurfaceSoft}
          stroke={link.fromAnchorSide === side ? pageColors.purpleBorderStrong : pageColors.blueLink}
          strokeWidth={1.5}
          listening={false}
        />
      ))}

      {renderControls && isSelected && !link.toJunctionLinkId && Object.entries(targetAnchors).map(([side, anchor]) => (
        <Circle
          key={`anchor-${link.id}-${side}`}
          x={anchor.x}
          y={anchor.y}
          radius={4}
          fill={link.toAnchorSide === side ? pageColors.warningMain : pageColors.blueSurfaceSoft}
          stroke={link.toAnchorSide === side ? pageColors.warningSoft : pageColors.blueLink}
          strokeWidth={1.5}
          listening={false}
        />
      ))}

      {renderControls && isSelected && !hasJunctionSource && (
        <Group
          x={startHandlePoint.x}
          y={startHandlePoint.y}
          draggable
          onDragStart={(e) => {
            e.cancelBubble = true;
            onSelect();
            setDraggedStartPoint({ x: e.target.x(), y: e.target.y() });
          }}
          onDragMove={(e) => {
            e.cancelBubble = true;
            const { side, along, point, centered } = resolveAnchor({ x: e.target.x(), y: e.target.y() }, sourceAnchors, fromNode);
            setDraggedStartPoint(point);
            onStartAnchorChange?.({ side, along, centered });
          }}
          onDragEnd={(e) => {
            e.cancelBubble = true;
            const { side, along, centered } = resolveAnchor({ x: e.target.x(), y: e.target.y() }, sourceAnchors, fromNode);
            setDraggedStartPoint(null);
            onStartAnchorChange?.({ side, along, centered });
          }}
          onClick={(e) => { e.cancelBubble = true; onSelect(); }}
          onTap={(e) => { e.cancelBubble = true; onSelect(); }}
        >
          <Circle radius={END_HANDLE_RADIUS + 4} fill={pageColors.blackHitArea} strokeEnabled={false} />
          <Circle
            radius={END_HANDLE_RADIUS}
            fill={pageColors.purpleAccent}
            stroke={pageColors.purpleBorderStrong}
            strokeWidth={2}
            opacity={0.95}
            listening={false}
          />
        </Group>
      )}

      {renderControls && isSelected && (
        <Group
          x={endHandlePoint.x}
          y={endHandlePoint.y}
          draggable
          onDragStart={(e) => {
            e.cancelBubble = true;
            onSelect();
            setDraggedEndPoint({ x: e.target.x(), y: e.target.y() });
          }}
          onDragMove={(e) => {
            e.cancelBubble = true;
            const { side, along, point, centered } = resolveAnchor({ x: e.target.x(), y: e.target.y() }, targetAnchors, toNode);
            setDraggedEndPoint(point);
            onEndAnchorChange?.({ side, along, centered });
          }}
          onDragEnd={(e) => {
            e.cancelBubble = true;
            const { side, along, centered } = resolveAnchor({ x: e.target.x(), y: e.target.y() }, targetAnchors, toNode);
            setDraggedEndPoint(null);
            onEndAnchorChange?.({ side, along, centered });
          }}
          onClick={(e) => { e.cancelBubble = true; onSelect(); }}
          onTap={(e) => { e.cancelBubble = true; onSelect(); }}
        >
          <Circle
            radius={END_HANDLE_RADIUS + 4}
            fill={pageColors.blackHitArea}
            strokeEnabled={false}
          />
          <Circle
            radius={END_HANDLE_RADIUS}
            fill={pageColors.warningMain}
            stroke={pageColors.warningSoft}
            strokeWidth={2}
            opacity={0.95}
            listening={false}
          />
        </Group>
      )}

      {isLinking && !isSelected && (link.joints ?? []).filter(j => j.isJunction).map((joint) => {
        const renderJoint = renderJointMap[joint.id] ?? joint;
        const visibleRadius = Math.max(4, joint.size ?? 4);
        return (
          <Group key={`jt-drop-${joint.id}`} x={renderJoint.x} y={renderJoint.y}>
            <Circle
              radius={JOINT_HIT_RADIUS + 4}
              fill={pageColors.blackHitArea}
              strokeEnabled={false}
              onMouseUp={(e) => {
                e.cancelBubble = true;
                onEndLinkAtJunction?.(link.id, joint.id);
              }}
            />
            <Circle
              radius={visibleRadius}
              fill={pageColors.purpleAccent}
              stroke={pageColors.purpleBorderStrong}
              strokeWidth={2}
              opacity={0.55}
              listening={false}
            />
          </Group>
        );
      })}

      {renderControls && isSelected && (link.joints ?? []).map((joint) => {
        const isJointSelected = selectedJointId === joint.id;
        const visibleRadius = Math.max(0, joint.size ?? 0);
        const renderJoint = renderJointMap[joint.id] ?? joint;
        return (
          <Group
            key={joint.id}
            x={renderJoint.x}
            y={renderJoint.y}
            draggable
            onDragStart={(e) => {
              e.cancelBubble = true;
              jointSnapRef.current = null;
              jointGridSnapRef.current = null;
              setSymmetryGuides([]);
              onJointDragStart(joint.id);
            }}
            onDragMove={(e) => {
              e.cancelBubble = true;
              let nextPoint = { x: e.target.x(), y: e.target.y(), width: 0, height: 0, id: `joint-${joint.id}` };
              const canShowGuides = showSymmetryLines;
              const canSnap = showSymmetryLines && snapToSymmetryLines;
              let guideMatches = (canShowGuides || canSnap) ? collectGuideMatches(nextPoint, nodes) : [];
              let guideMatch = guideMatches[0] ?? null;

              if (canSnap && jointSnapRef.current) {
                const activeSnap = jointSnapRef.current;
                const rawAxisValue = nextPoint[activeSnap.axis];
                if (Math.abs(rawAxisValue - activeSnap.snapPos) <= UNSNAP_DISTANCE) {
                  nextPoint = { ...nextPoint, [activeSnap.axis]: activeSnap.snapPos };
                  guideMatches = collectGuideMatches(nextPoint, nodes);
                  guideMatch = guideMatches.find(match =>
                    isSameGuideMatch(match, activeSnap)
                  ) ?? activeSnap;
                  jointSnapRef.current = guideMatch;
                } else {
                  jointSnapRef.current = null;
                }
              }

              if (canSnap && !jointSnapRef.current && guideMatch && guideMatch.delta <= SNAP_DISTANCE) {
                jointSnapRef.current = guideMatch;
                nextPoint = { ...nextPoint, [guideMatch.axis]: guideMatch.snapPos };
                guideMatches = collectGuideMatches(nextPoint, nodes);
                guideMatch = guideMatches.find(match =>
                  isSameGuideMatch(match, jointSnapRef.current)
                ) ?? jointSnapRef.current;
                jointSnapRef.current = guideMatch;
              }

              if (!jointSnapRef.current && showGridLines) {
                const rawGridX = Math.round(nextPoint.x / GRID_SPACING) * GRID_SPACING;
                const rawGridY = Math.round(nextPoint.y / GRID_SPACING) * GRID_SPACING;

                if (jointGridSnapRef.current) {
                  const activeGridSnap = jointGridSnapRef.current;
                  const keepX = activeGridSnap.x != null && Math.abs(nextPoint.x - activeGridSnap.x) <= GRID_UNSNAP_DISTANCE;
                  const keepY = activeGridSnap.y != null && Math.abs(nextPoint.y - activeGridSnap.y) <= GRID_UNSNAP_DISTANCE;
                  jointGridSnapRef.current = {
                    x: keepX ? activeGridSnap.x : null,
                    y: keepY ? activeGridSnap.y : null,
                  };
                  if (!keepX && !keepY) {
                    jointGridSnapRef.current = null;
                  }
                }

                if (!jointGridSnapRef.current) {
                  jointGridSnapRef.current = {
                    x: Math.abs(nextPoint.x - rawGridX) <= GRID_SNAP_DISTANCE ? rawGridX : null,
                    y: Math.abs(nextPoint.y - rawGridY) <= GRID_SNAP_DISTANCE ? rawGridY : null,
                  };
                  if (jointGridSnapRef.current.x == null && jointGridSnapRef.current.y == null) {
                    jointGridSnapRef.current = null;
                  }
                }

                if (jointGridSnapRef.current) {
                  nextPoint = {
                    ...nextPoint,
                    x: jointGridSnapRef.current.x ?? nextPoint.x,
                    y: jointGridSnapRef.current.y ?? nextPoint.y,
                  };
                } else {
                  nextPoint = { ...nextPoint, ...getGridSnappedPoint(nextPoint) };
                }
              } else {
                jointGridSnapRef.current = null;
              }

              const visibleGuides = canShowGuides
                ? collectVisibleGuides(guideMatches, jointSnapRef.current)
                : [];

              setSymmetryGuides(visibleGuides);
              e.target.x(nextPoint.x);
              e.target.y(nextPoint.y);
              onJointDragMove(joint.id, {
                x: nextPoint.x - parallelOffset.x,
                y: nextPoint.y - parallelOffset.y,
              });
            }}
            onDragEnd={(e) => {
              e.cancelBubble = true;
              jointSnapRef.current = null;
              jointGridSnapRef.current = null;
              setSymmetryGuides([]);
              onJointDragEnd(joint.id, {
                x: e.target.x() - parallelOffset.x,
                y: e.target.y() - parallelOffset.y,
              });
            }}
            onClick={(e) => {
              e.cancelBubble = true;
              onJointSelect(joint.id);
            }}
            onTap={(e) => {
              e.cancelBubble = true;
              onJointSelect(joint.id);
            }}
            onContextMenu={(e) => {
              e.cancelBubble = true;
              onJointContextMenu?.(e, joint.id);
            }}
          >
            <Circle
              radius={JOINT_HIT_RADIUS}
              fill={pageColors.blackHitArea}
              strokeEnabled={false}
            />
            <Circle
              radius={visibleRadius}
              fill={joint.isJunction ? pageColors.purpleAccent : isJointSelected ? pageColors.warningMain : pageColors.blueSurfaceSoft}
              stroke={joint.isJunction ? pageColors.purpleBorderStrong : isJointSelected ? pageColors.warningSoft : pageColors.blueLink}
              strokeWidth={visibleRadius > 0 ? 2 : 0}
              opacity={visibleRadius > 0 ? 1 : 0}
              listening={false}
            />
            {joint.isJunction && (
              <Circle
                radius={Math.max(visibleRadius + 4, 8)}
                stroke={pageColors.blueSelection}
                strokeWidth={1.5}
                dash={[4, 3]}
                listening={false}
              />
            )}
            {visibleRadius <= 0 && isJointSelected && (
              <Circle
                radius={5}
                stroke={pageColors.warningSoft}
                strokeWidth={1.5}
                dash={[3, 3]}
                listening={false}
              />
            )}
            {joint.isJunction && (
              <Group
                x={16}
                y={-16}
                onMouseDown={(e) => {
                  e.cancelBubble = true;
                  onJointSelect(joint.id);
                  onStartBranchFromJoint?.(joint.id);
                }}
                onTouchStart={(e) => {
                  e.cancelBubble = true;
                  onJointSelect(joint.id);
                  onStartBranchFromJoint?.(joint.id);
                }}
              >
                <Circle
                  radius={8}
                  fill={pageColors.blueMain}
                  stroke={pageColors.blueSelection}
                  strokeWidth={2}
                />
                <Line
                  points={[-3, 0, 3, 0, 0, 0, 0, -3, 0, 3]}
                  stroke={pageColors.white}
                  strokeWidth={1.8}
                  lineCap="round"
                  listening={false}
                />
              </Group>
            )}
          </Group>
        );
      })}
    </Group>
  );
}

export default LinkShape;
