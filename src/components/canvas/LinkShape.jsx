import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Group, Line, Path, Rect, Text } from 'react-konva';
import { pageColors } from '../../colorThemes';
import { buildLinkRenderData, getLinkParallelOffset, getNodeAnchorCandidates, JOINT_HIT_RADIUS } from '../../links/linkGeometry';
import useStore from '../../store/useStore';
import { buildWebByLinkId, computeVariableWebs } from '../../variables/flow';
import { getManualTokenBaseText, normalizeManualTokenTextKeyframes } from '../../animation/manualTokenTiming';
import { collectGuideMatches, collectVisibleGuides, isSameGuideMatch, resolveOrthogonalSnap, SNAP_DISTANCE, UNSNAP_DISTANCE } from './symmetryGuides';
import LinkFailureMark from './LinkFailureMark';

const END_HANDLE_RADIUS = 7;
const ANCHOR_PAD = 12;

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
    snapToOrthogonal,
    setSymmetryGuides,
  } = useStore();
  const render = buildLinkRenderData(link, fromNode, toNode, allLinks, nodes);
  const renderJointMap = Object.fromEntries(render.jointRenderPoints.map(joint => [joint.id, joint]));
  const parallelOffset = getLinkParallelOffset(link, fromNode, toNode, allLinks);
  const sourceAnchors = getNodeAnchorCandidates(fromNode, parallelOffset);
  const targetAnchors = getNodeAnchorCandidates(toNode, parallelOffset);
  const isFailing = !!link.failing;
  const showFailGroup = isFailing || !!link.failAtEnds || !!link.failOnTokenEnd;
  const color = isSelected ? pageColors.blueSelection
    : isInSelection ? pageColors.purpleAccent
    : isFailing ? pageColors.dangerBright
    : link.stroke;
  const hasJunctionSource = !!(link.fromJunctionLinkId && link.fromJunctionJointId);
  const [draggedStartPoint, setDraggedStartPoint] = useState(null);
  const [draggedEndPoint, setDraggedEndPoint] = useState(null);
  const startHandlePoint = draggedStartPoint ?? render.startPoint;
  const endHandlePoint = draggedEndPoint ?? render.endPoint;
  const jointSnapRef = useRef(null);
  const jointGridSnapRef = useRef(null);
  const jointOrthoSnapRef = useRef({ x: null, y: null });

  // Neighbour route points (in render space) on either side of a joint, used
  // for orthogonal/90° snapping while dragging.
  const getJointNeighbors = (jointId) => {
    const rp = render.routePoints;
    const idx = rp.findIndex(p => p.id === jointId);
    if (idx < 0) return [];
    return [rp[idx - 1]?.point ?? null, rp[idx + 1]?.point ?? null];
  };

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
  const inheritedTokenSize = pick('tokenSize', 7);
  const inheritedTokenFill = pick('tokenFill', '#ffffff');
  const tokenStroke = pick('tokenStroke', pageColors.blueLink);
  const tokenR = Math.max(2, Math.min(24,
    link.manualTokenEnabled && Number.isFinite(link.manualTokenSize)
      ? link.manualTokenSize
      : inheritedTokenSize
  ));
  const tokenFill = link.manualTokenEnabled && link.manualTokenColor
    ? link.manualTokenColor
    : inheritedTokenFill;
  const baseTokenText = simulateOptions?.tokenText ?? '';
  const varTextOverride = (ownerVariable?.tokenText ?? '').trim();
  const sourceVar = (fromNode?.variableLabel ?? '').trim();
  const inheritedText = varTextOverride || sourceVar || baseTokenText;
  const eff = link.manualTokenEnabled
    ? getManualTokenBaseText(link, inheritedText)
    : ((link.messageLabel && link.messageLabel.trim()) ? link.messageLabel : inheritedText);
  const messageOverlapsToken = !link.manualTokenEnabled || link.manualTokenMessageOverlap !== false;
  const manualTextKeyframes = normalizeManualTokenTextKeyframes(link.manualTokenTextKeyframes);
  const longestTokenText = [eff, ...manualTextKeyframes.map(keyframe => keyframe.text)]
    .reduce((longest, text) => text.length > longest.length ? text : longest, '');
  const effectiveTokenText = eff.slice(0, messageOverlapsToken ? 6 : 24);
  const longestVisibleTokenText = longestTokenText.slice(0, messageOverlapsToken ? 6 : 24);
  const inheritedTokenTextColor = pick('tokenTextColor', tokenStroke);
  const inheritedTokenTextSize = pick('tokenTextSize', 10);
  const tokenTextColor = link.manualTokenEnabled && link.manualTokenTextColor
    ? link.manualTokenTextColor
    : inheritedTokenTextColor;
  const tokenTextSize = Math.max(8, Math.min(24,
    link.manualTokenEnabled && Number.isFinite(link.manualTokenTextSize)
      ? link.manualTokenTextSize
      : inheritedTokenTextSize
  ));
  const tokenShape = pick('tokenShape', 'circle');
  const tokenLabelWidth = messageOverlapsToken
    ? tokenR * 2
    : Math.max(tokenR * 2, Math.min(160, longestVisibleTokenText.length * tokenTextSize * 0.65 + 8));
  const tokenLabelHeight = messageOverlapsToken ? tokenR * 2 : tokenTextSize * 1.4;
  const tokenLabelY = messageOverlapsToken ? 0 : -(tokenR + tokenLabelHeight + 4);

  return (
    <Group id={`link-wrap-${link.id}`}>
      {renderPaths && (
        <>
          <Path
            id={`link-shaft-${link.id}`}
            data={render.pathData}
            stroke={color}
            baseStroke={color}
            strokeWidth={isSelected ? link.strokeWidth + 1 : link.strokeWidth}
            lineCap="round"
            lineJoin="round"
            hitStrokeWidth={Math.max(14, link.strokeWidth + 12)}
            onClick={(e) => { e.cancelBubble = true; onSelect?.(e.evt?.shiftKey); }}
            onTap={(e) => { e.cancelBubble = true; onSelect?.(false); }}
            onContextMenu={(e) => { e.cancelBubble = true; onContextMenu(e); }}
          />

          {/* Fail tint overlay, controlled by applyAnimState (opacity only) */}
          <Path
            id={`link-shaft-fail-overlay-${link.id}`}
            data={render.pathData}
            stroke={pageColors.dangerBright}
            strokeWidth={isSelected ? link.strokeWidth + 1 : link.strokeWidth}
            lineCap="round"
            lineJoin="round"
            opacity={0}
            listening={false}
          />

          {/* Screen-centered fail X (opacity/scale controlled in applyAnimState) */}
          <Group id={`link-fail-screen-x-${link.id}`} opacity={0} listening={false}>
            <Line
              points={[-28, -28, 28, 28]}
              stroke={pageColors.dangerBright}
              strokeWidth={4}
              lineCap="round"
            />
            <Line
              points={[-28, 28, 28, -28]}
              stroke={pageColors.dangerBright}
              strokeWidth={4}
              lineCap="round"
            />
          </Group>

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
            {(!!effectiveTokenText || manualTextKeyframes.length > 0) && (
              <Text
                id={`link-token-label-${link.id}`}
                text={effectiveTokenText}
                align="center"
                verticalAlign="middle"
                x={0}
                y={tokenLabelY}
                offsetX={tokenLabelWidth / 2}
                offsetY={messageOverlapsToken ? tokenR : 0}
                width={tokenLabelWidth}
                height={tokenLabelHeight}
                fill={tokenTextColor}
                fontSize={tokenTextSize}
                fontFamily="Inter, system-ui, sans-serif"
                listening={false}
              />
            )}
          </Group>

      {showFailGroup && <LinkFailureMark link={link} render={render} />}
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
              jointOrthoSnapRef.current = { x: null, y: null };
              setSymmetryGuides([]);
              onJointDragStart(joint.id);
            }}
            onDragMove={(e) => {
              e.cancelBubble = true;
              let nextPoint = { x: e.target.x(), y: e.target.y(), width: 0, height: 0, id: `joint-${joint.id}` };
              const canShowGuides = showSymmetryLines;
              const canSnap = showSymmetryLines && snapToSymmetryLines;

              // --- Orthogonal (90°) snapping: highest priority, per axis ---
              let orthoGuides = [];
              const orthoPinned = { x: false, y: false };
              if (snapToOrthogonal) {
                const ortho = resolveOrthogonalSnap(nextPoint, getJointNeighbors(joint.id), jointOrthoSnapRef.current);
                jointOrthoSnapRef.current = ortho.state;
                nextPoint = { ...nextPoint, x: ortho.point.x, y: ortho.point.y };
                orthoGuides = ortho.guides;
                orthoPinned.x = ortho.state.x != null;
                orthoPinned.y = ortho.state.y != null;
              } else {
                jointOrthoSnapRef.current = { x: null, y: null };
              }

              let guideMatches = (canShowGuides || canSnap) ? collectGuideMatches(nextPoint, nodes) : [];
              let guideMatch = guideMatches[0] ?? null;
              // Don't let symmetry override an axis already pinned to 90°.
              if (guideMatch && orthoPinned[guideMatch.axis]) {
                guideMatch = guideMatches.find(match => !orthoPinned[match.axis]) ?? null;
              }

              // Release a symmetry snap whose axis is now pinned to 90°.
              if (jointSnapRef.current && orthoPinned[jointSnapRef.current.axis]) {
                jointSnapRef.current = null;
              }

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
                    // Never let the grid move an axis already pinned to 90°.
                    x: orthoPinned.x ? nextPoint.x : (jointGridSnapRef.current.x ?? nextPoint.x),
                    y: orthoPinned.y ? nextPoint.y : (jointGridSnapRef.current.y ?? nextPoint.y),
                  };
                } else {
                  const gridSnapped = getGridSnappedPoint(nextPoint);
                  nextPoint = {
                    ...nextPoint,
                    x: orthoPinned.x ? nextPoint.x : gridSnapped.x,
                    y: orthoPinned.y ? nextPoint.y : gridSnapped.y,
                  };
                }
              } else {
                jointGridSnapRef.current = null;
              }

              const visibleGuides = [
                ...orthoGuides,
                ...(canShowGuides ? collectVisibleGuides(guideMatches, jointSnapRef.current) : []),
              ];

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
              jointOrthoSnapRef.current = { x: null, y: null };
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
