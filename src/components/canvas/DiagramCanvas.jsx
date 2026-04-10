import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Layer, Line, Rect, Stage } from 'react-konva';
import { v4 as uuid } from 'uuid';
import { pageColors } from '../../../colorThemes';
import { buildLinkRenderData, getLinkParallelOffset, getNodeAnchorPoint, resolveLinkJunctionPoint } from '../../links/linkGeometry';
import useStore from '../../store/useStore';
import LinkShape from './LinkShape';
import NodeShape from './NodeShape';

const MIN_SCALE = 0.15;
const MAX_SCALE = 4;
const TOP_BAR_H = 52;
const GRID_SPACING = 72;

const GRID_STYLE = {
  position: 'absolute',
  inset: 0,
  backgroundImage: [
    `linear-gradient(0deg, ${pageColors.canvasGridMajor} 0 1px, ${pageColors.transparent} 1px 100%)`,
    `linear-gradient(90deg, ${pageColors.canvasGridMajor} 0 1px, ${pageColors.transparent} 1px 100%)`,
  ].join(', '),
  pointerEvents: 'none',
  zIndex: 2,
};

const CANVAS_BASE = pageColors.canvasBackground;

const CANVAS_TEXTURE_STYLE = {
  position: 'absolute',
  inset: 0,
  backgroundImage: [
    `radial-gradient(circle at 18% 16%, ${pageColors.canvasTexturePrimarySoft}, ${pageColors.transparent} 0 26%)`,
    `radial-gradient(circle at 78% 22%, ${pageColors.canvasTextureSecondarySoft}, ${pageColors.transparent} 0 24%)`,
    `radial-gradient(circle at 52% 78%, ${pageColors.canvasTextureTertiarySoft}, ${pageColors.transparent} 0 28%)`,
    `linear-gradient(180deg, ${pageColors.whiteVeilSoft}, ${pageColors.transparent})`,
    `repeating-linear-gradient(135deg, ${pageColors.whiteVeilFaint} 0 2px, ${pageColors.transparent} 2px 18px)`,
  ].join(', '),
  backgroundColor: CANVAS_BASE,
  pointerEvents: 'none',
  zIndex: 0,
};

function isCanvasBackgroundShape(shape) {
  return !shape || shape.id?.() === 'background';
}

function DiagramCanvas({ stageRef, layerRef }) {
  const {
    nodes,
    links,
    selectedId,
    selectedJointId,
    selectedIds,
    setSelected,
    setSelectedJoint,
    addToSelection,
    setSelectedIds,
    selectAll,
    copySelected,
    pasteClipboard,
    undo,
    redo,
    linkingFrom,
    setLinkingFrom,
    addLink,
    addLinkJoint,
    addNodeAnchor,
    updateLink,
    updateLinkJoint,
    updateNode,
    setContextMenu,
    deleteSelected,
    showGridLines,
    symmetryGuides,
  } = useStore();

  const [scale, setScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [rubberEnd, setRubberEnd] = useState({ x: 0, y: 0 });
  const [editingNodeId, setEditingNodeId] = useState(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [selectionBox, setSelectionBox] = useState(null); // rubber-band rect in canvas coords
  const containerRef = useRef(null);
  const renameInputRef = useRef(null);
  const lastPointerCanvasRef = useRef(null);
  const [dims, setDims] = useState({ w: 800, h: 600 });

  // Consumed by handleStageClick to suppress clear-selection after a rubber-band drag
  const rbWasDragRef = useRef(false);

  // Group-drag refs
  const groupDragBaseRef  = useRef({});
  const selectedIdsRef    = useRef(selectedIds);
  const nodesRef          = useRef(nodes);
  const linksRef          = useRef(links);
  const linkingFromRef    = useRef(linkingFrom);
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { linksRef.current = links; }, [links]);
  useEffect(() => { linkingFromRef.current = linkingFrom; }, [linkingFrom]);

  useEffect(() => {
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setDims({ w: Math.floor(width), h: Math.floor(height) });
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Native rubber-band (left-drag on empty canvas) + middle-mouse pan
  // Uses native DOM events to avoid Konva event propagation issues entirely.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // All rubber-band + pan state is local — no stale closure risk
    let rb = null;       // { x1,y1,x2,y2 } in canvas coords while dragging
    let rbActive = false;
    let pan = null;      // { clientX, clientY, stageX, stageY }

    const stageXY = (clientX, clientY) => {
      const rect = container.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    };
    const toCanvas = (clientX, clientY) => {
      const stage = stageRef.current;
      const sc = stageXY(clientX, clientY);
      const canvasPoint = {
        x: (sc.x - stage.x()) / stage.scaleX(),
        y: (sc.y - stage.y()) / stage.scaleY(),
      };
      lastPointerCanvasRef.current = canvasPoint;
      return canvasPoint;
    };

    const onDown = (e) => {
      if (e.button === 1) {
        e.preventDefault();
        const stage = stageRef.current;
        pan = { clientX: e.clientX, clientY: e.clientY, stageX: stage.x(), stageY: stage.y() };
        container.style.cursor = 'grabbing';
        return;
      }
      if (e.button !== 0) return;
      if (linkingFromRef.current) return;
      // Start rubber band only if pointer is over empty canvas (no Konva shape)
      const sc = stageXY(e.clientX, e.clientY);
      const shape = stageRef.current.getIntersection(sc);
      if (!isCanvasBackgroundShape(shape)) return;
      const pt = toCanvas(e.clientX, e.clientY);
      rb = { x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y };
      rbActive = false;
    };

    const onMove = (e) => {
      if (pan) {
        const nx = pan.stageX + (e.clientX - pan.clientX);
        const ny = pan.stageY + (e.clientY - pan.clientY);
        setStagePos({ x: nx, y: ny });
        return;
      }
      if (!rb) return;
      const pt = toCanvas(e.clientX, e.clientY);
      const dx = pt.x - rb.x1, dy = pt.y - rb.y1;
      if (!rbActive && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        rbActive = true;
        container.style.cursor = 'crosshair';
      }
      rb = { ...rb, x2: pt.x, y2: pt.y };
      if (rbActive) setSelectionBox({ ...rb });
    };

    const onUp = (e) => {
      if (e.button === 1 && pan) {
        pan = null;
        container.style.cursor = '';
        return;
      }
      if (e.button === 0 && rb) {
        const box = { ...rb };
        const wasActive = rbActive;
        rb = null;
        rbActive = false;
        container.style.cursor = '';
        setSelectionBox(null);

        if (wasActive) {
          rbWasDragRef.current = true;
          const minX = Math.min(box.x1, box.x2);
          const maxX = Math.max(box.x1, box.x2);
          const minY = Math.min(box.y1, box.y2);
          const maxY = Math.max(box.y1, box.y2);
          const hitNodes = nodesRef.current.filter(n =>
            n.x < maxX && n.x + n.width > minX &&
            n.y < maxY && n.y + n.height > minY
          );
          const hitNodeIds = new Set(hitNodes.map(n => n.id));
          const hitLinks = linksRef.current.filter(l =>
            hitNodeIds.has(l.fromId) && hitNodeIds.has(l.toId)
          );
          const allIds = [...hitNodes.map(n => n.id), ...hitLinks.map(l => l.id)];
          if (allIds.length) {
            // Use getState() so we don't need these in deps
            useStore.getState().setSelectedIds(allIds);
            useStore.getState().addToSelection(hitNodes[0]?.id ?? hitLinks[0]?.id ?? null);
          } else {
            useStore.getState().setSelectedIds([]);
            useStore.getState().setSelected(null);
          }
        }
      }
    };

    container.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      container.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []); // empty deps — all live state read via refs or stageRef.current

  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (mod && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
      if (mod && e.key === 'c') { e.preventDefault(); copySelected(); return; }
      if (mod && e.key === 'v') { e.preventDefault(); pasteClipboard(lastPointerCanvasRef.current); return; }
      if (mod && e.key === 'a') { e.preventDefault(); selectAll(); return; }

      if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
      if (e.key === 'Escape') setLinkingFrom(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteSelected, setLinkingFrom, undo, redo, copySelected, pasteClipboard, selectAll]);

  const editingNode = useMemo(
    () => nodes.find(node => node.id === editingNodeId) ?? null,
    [editingNodeId, nodes]
  );
  const gridStyle = useMemo(() => {
    const gridPx = Math.max(12, Math.round(GRID_SPACING * scale));
    const offsetX = ((stagePos.x % gridPx) + gridPx) % gridPx;
    const offsetY = ((stagePos.y % gridPx) + gridPx) % gridPx;

    return {
      ...GRID_STYLE,
      backgroundSize: [
        `${gridPx}px ${gridPx}px`,
        `${gridPx}px ${gridPx}px`,
      ].join(', '),
      backgroundPosition: [
        `0 ${offsetY}px`,
        `${offsetX}px 0`,
      ].join(', '),
    };
  }, [scale, stagePos.x, stagePos.y]);

  useEffect(() => {
    if (!editingNode) return;
    setEditingLabel(editingNode.label ?? '');
  }, [editingNode]);

  useEffect(() => {
    if (!editingNode) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [editingNode]);

  const toCanvas = useCallback((screenPt) => ({
    x: (screenPt.x - stagePos.x) / scale,
    y: (screenPt.y - stagePos.y) / scale,
  }), [stagePos, scale]);

  const handleWheel = useCallback((e) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    const oldScale = stage.scaleX();
    const ptr = stage.getPointerPosition();
    const origin = {
      x: (ptr.x - stage.x()) / oldScale,
      y: (ptr.y - stage.y()) / oldScale,
    };
    const delta = e.evt.deltaY < 0 ? 1 : -1;
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, oldScale + delta * oldScale * 0.1));
    setScale(newScale);
    setStagePos({
      x: ptr.x - origin.x * newScale,
      y: ptr.y - origin.y * newScale,
    });
  }, [stageRef]);

  const clearSelection = useCallback(() => {
    setSelected(null);
    setSelectedJoint(null);
    setLinkingFrom(null);
    setContextMenu(null);
    setEditingNodeId(null);
  }, [setContextMenu, setLinkingFrom, setSelected, setSelectedJoint]);

  const handleNodeSelect = useCallback((nodeId, shiftHeld) => {
    if (shiftHeld) addToSelection(nodeId);
    else setSelected(nodeId);
  }, [addToSelection, setSelected]);

  const handleLinkSelectWithShift = useCallback((linkId, shiftHeld) => {
    if (shiftHeld) addToSelection(linkId);
    else setSelected(linkId);
  }, [addToSelection, setSelected]);

  const commitNodeRename = useCallback(() => {
    if (!editingNode) return;
    const nextLabel = editingLabel.trim();
    if (nextLabel && nextLabel !== editingNode.label) {
      updateNode(editingNode.id, { label: nextLabel });
    }
    setEditingNodeId(null);
  }, [editingLabel, editingNode, updateNode]);

  const cancelNodeRename = useCallback(() => {
    setEditingNodeId(null);
  }, []);

  const handleStageClick = useCallback((e) => {
    if (rbWasDragRef.current) { rbWasDragRef.current = false; return; }
    if (e.target !== e.target.getStage() && e.target.id() !== 'background') return;
    clearSelection();
  }, [clearSelection]);

  const openCanvasMenu = useCallback((pointer) => {
    const canvas = toCanvas(pointer);
    setContextMenu({
      type: 'canvas',
      screenX: pointer.x,
      screenY: pointer.y + TOP_BAR_H,
      canvasX: canvas.x,
      canvasY: canvas.y,
    });
  }, [setContextMenu, toCanvas]);

  const handleContextMenu = useCallback((e) => {
    e.evt.preventDefault();
    // Only open canvas menu on background right-click
    const sc = stageRef.current.getPointerPosition();
    const shape = stageRef.current.getIntersection(sc);
    if (!isCanvasBackgroundShape(shape)) return;
    openCanvasMenu(sc);
  }, [openCanvasMenu, stageRef]);

  // Only used for tracking the rubber-end line while drawing a link
  const handleMouseMove = useCallback(() => {
    const pointer = stageRef.current.getPointerPosition();
    if (!pointer) return;
    const canvasPoint = toCanvas(pointer);
    lastPointerCanvasRef.current = canvasPoint;
    if (linkingFrom) setRubberEnd(canvasPoint);
  }, [linkingFrom, stageRef, toCanvas]);

  // End link creation when mouse released over empty canvas
  const handleMouseUp = useCallback((e) => {
    if (e.evt.button === 0 && linkingFrom) setLinkingFrom(null);
  }, [linkingFrom, setLinkingFrom]);

  // Group-drag handlers — called by NodeShape when it moves while part of a multi-selection
  const handleGroupDragStart = useCallback((draggedId) => {
    const base = {};
    for (const id of selectedIdsRef.current) {
      if (id === draggedId) continue;
      const n = nodesRef.current.find(node => node.id === id);
      if (n) base[id] = { x: n.x, y: n.y };
    }
    groupDragBaseRef.current = base;
  }, []);

  const handleGroupDragMove = useCallback((draggedId, dx, dy) => {
    for (const [id, pos] of Object.entries(groupDragBaseRef.current)) {
      updateNode(id, { x: pos.x + dx, y: pos.y + dy });
    }
  }, [updateNode]);

  const addJointAtCanvasPoint = useCallback((linkId, canvasPoint) => {
    const link = linksRef.current.find(l => l.id === linkId);
    if (!link) return;
    const fromNode = nodesRef.current.find(n => n.id === link.fromId);
    const toNode   = nodesRef.current.find(n => n.id === link.toId);
    if (!fromNode || !toNode) return;
    const render = buildLinkRenderData(link, fromNode, toNode, linksRef.current, nodesRef.current);
    const parallelOffset = getLinkParallelOffset(link, fromNode, toNode, linksRef.current);
    // Ordered waypoints in rendered space: start, joint render points, end
    const waypoints = [render.startPoint, ...render.jointRenderPoints, render.endPoint];
    let bestDist = Infinity, bestIdx = 0;
    for (let i = 0; i < waypoints.length - 1; i++) {
      const a = waypoints[i], b = waypoints[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;
      let t = lenSq > 0 ? ((canvasPoint.x - a.x) * dx + (canvasPoint.y - a.y) * dy) / lenSq : 0;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(canvasPoint.x - (a.x + t * dx), canvasPoint.y - (a.y + t * dy));
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    addLinkJoint(linkId, {
      id: uuid(),
      x: canvasPoint.x - parallelOffset.x,
      y: canvasPoint.y - parallelOffset.y,
      size: 0,
      prevCurve: 0,
      nextCurve: 0,
    }, bestIdx, { selectJoint: true });
  }, [addLinkJoint]);

  const handleStartLink = useCallback((nodeId, side = null) => {
    const node = nodes.find(item => item.id === nodeId);
    if (node) {
      const center = { x: node.x + node.width / 2, y: node.y + node.height / 2 };
      const anchor = side
        ? getNodeAnchorPoint(node, side)
        : center;
      setRubberEnd(anchor);
    }
    setLinkingFrom({ type: 'node', nodeId, ...(side ?? {}) });
  }, [nodes, setLinkingFrom]);

  const handleStartJunctionLink = useCallback((linkId, jointId) => {
    const parentLink = links.find(item => item.id === linkId);
    const junctionPoint = resolveLinkJunctionPoint(linkId, jointId, links, nodes);
    if (junctionPoint) {
      setRubberEnd(junctionPoint);
    }
    setLinkingFrom({
      type: 'junction',
      linkId,
      jointId,
      fromNodeId: parentLink?.fromId ?? null,
    });
  }, [links, nodes, setLinkingFrom]);

  const handleEndLink = useCallback((toNodeId, toAnchor = null) => {
    if (linkingFrom?.type === 'junction') {
      if (linkingFrom.fromNodeId) {
        const parentLink = links.find(link => link.id === linkingFrom.linkId);
        const parentJoint = parentLink?.joints?.find(joint => joint.id === linkingFrom.jointId) ?? null;
        addLink(linkingFrom.fromNodeId, toNodeId, {
          fromJunctionLinkId: linkingFrom.linkId,
          fromJunctionJointId: linkingFrom.jointId,
          syncGroupKey: parentJoint?.syncBranches ? `${linkingFrom.linkId}::${linkingFrom.jointId}` : null,
          fromAnchorSide: null,
          fromAnchorLockedCenter: false,
          fromAlongPos: 0,
          fromAnchorId: null,
          toAnchorSide: toAnchor?.side ?? null,
          toAnchorLockedCenter: !!toAnchor?.centered,
          toAlongPos: toAnchor?.along ?? 0,
          toAnchorId: toAnchor?.anchorId ?? null,
        });
      }
    } else if (linkingFrom && linkingFrom.nodeId !== toNodeId) {
      addLink(linkingFrom.nodeId, toNodeId, {
        fromAnchorSide: linkingFrom.side ?? null,
        fromAnchorLockedCenter: !!linkingFrom.centered,
        fromAlongPos: linkingFrom.along ?? 0,
        fromAnchorId: linkingFrom.anchorId ?? null,
        toAnchorSide: toAnchor?.side ?? null,
        toAnchorLockedCenter: !!toAnchor?.centered,
        toAlongPos: toAnchor?.along ?? 0,
        toAnchorId: toAnchor?.anchorId ?? null,
      });
    }
    setLinkingFrom(null);
  }, [addLink, linkingFrom, links, setLinkingFrom]);

  const handleLinkSelect = useCallback((linkId) => {
    setSelected(linkId);
  }, [setSelected]);

  const handleLinkContextMenu = useCallback((e, linkId) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    const pointer = stage.getPointerPosition();
    const canvas = toCanvas(pointer);
    setSelected(linkId);
    setContextMenu({
      type: 'link',
      linkId,
      screenX: pointer.x,
      screenY: pointer.y + TOP_BAR_H,
      canvasX: canvas.x,
      canvasY: canvas.y,
    });
  }, [setContextMenu, setSelected, stageRef, toCanvas]);

  const handleNodeContextMenu = useCallback((e, nodeId) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const canvas = toCanvas(pointer);
    setSelected(nodeId);
    setContextMenu({
      type: 'node',
      nodeId,
      screenX: pointer.x,
      screenY: pointer.y + TOP_BAR_H,
      canvasX: canvas.x,
      canvasY: canvas.y,
    });
  }, [setContextMenu, setSelected, stageRef, toCanvas]);

  const handleJointContextMenu = useCallback((e, linkId, jointId) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const canvas = toCanvas(pointer);
    setSelected(linkId);
    setSelectedJoint(jointId);
    setContextMenu({
      type: 'joint',
      linkId,
      jointId,
      screenX: pointer.x,
      screenY: pointer.y + TOP_BAR_H,
      canvasX: canvas.x,
      canvasY: canvas.y,
    });
  }, [setContextMenu, setSelected, setSelectedJoint, stageRef, toCanvas]);

  const linkingNode = linkingFrom?.type === 'node'
    ? nodes.find(node => node.id === linkingFrom.nodeId)
    : null;
  const selectedLink = links.find(link => link.id === selectedId) ?? null;
  const selectedLinkFromNode = selectedLink ? nodes.find(node => node.id === selectedLink.fromId) : null;
  const selectedLinkToNode = selectedLink ? nodes.find(node => node.id === selectedLink.toId) : null;
  const linkingStart = linkingFrom?.type === 'junction'
    ? resolveLinkJunctionPoint(linkingFrom.linkId, linkingFrom.jointId, links, nodes)
    : linkingNode
      ? (
          linkingFrom?.side
            ? getNodeAnchorPoint(linkingNode, linkingFrom)
            : { x: linkingNode.x + linkingNode.width / 2, y: linkingNode.y + linkingNode.height / 2 }
        )
      : null;

  return (
    <div ref={containerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', background: CANVAS_BASE, cursor: linkingFrom ? 'crosshair' : 'default' }}>
      <div style={CANVAS_TEXTURE_STYLE} />
      {showGridLines && <div style={gridStyle} />}

      <Stage
        ref={stageRef}
        width={dims.w}
        height={dims.h}
        scaleX={scale}
        scaleY={scale}
        x={stagePos.x}
        y={stagePos.y}
        onWheel={handleWheel}
        onClick={handleStageClick}
        onContextMenu={handleContextMenu}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{ position: 'relative', zIndex: 1 }}
      >
        <Layer ref={layerRef}>
          <Rect
            id="background"
            x={-50000}
            y={-50000}
            width={100000}
            height={100000}
            fill={CANVAS_BASE}
            listening
          />

          {links.map((link) => {
            const fromNode = nodes.find(node => node.id === link.fromId);
            const toNode = nodes.find(node => node.id === link.toId);
            if (!fromNode || !toNode) return null;

            return (
              <LinkShape
                key={link.id}
                link={link}
                allLinks={links}
                fromNode={fromNode}
                toNode={toNode}
                isSelected={selectedId === link.id}
                selectedJointId={selectedId === link.id ? selectedJointId : null}
                isInSelection={selectedIds.includes(link.id)}
                onSelect={(shiftHeld) => handleLinkSelectWithShift(link.id, shiftHeld)}
                onContextMenu={(e) => handleLinkContextMenu(e, link.id)}
                onJointSelect={(jointId) => {
                  setSelected(link.id);
                  setSelectedJoint(jointId);
                }}
                onJointContextMenu={(e, jointId) => handleJointContextMenu(e, link.id, jointId)}
                onStartBranchFromJoint={(jointId) => handleStartJunctionLink(link.id, jointId)}
                onJointDragStart={(jointId) => {
                  setSelected(link.id);
                  setSelectedJoint(jointId);
                }}
                onJointDragMove={(jointId, point) => updateLinkJoint(link.id, jointId, point)}
                onJointDragEnd={(jointId, point) => updateLinkJoint(link.id, jointId, point)}
                onStartAnchorChange={({ side, along, centered }) => updateLink(link.id, {
                  fromAnchorSide: side,
                  fromAnchorLockedCenter: !!centered,
                  fromAlongPos: along,
                  fromAnchorId: null,
                  fromJunctionLinkId: null,
                  fromJunctionJointId: null,
                })}
                onEndAnchorChange={({ side, along, centered }) => updateLink(link.id, {
                  toAnchorSide: side,
                  toAnchorLockedCenter: !!centered,
                  toAlongPos: along,
                  toAnchorId: null,
                })}
                renderControls={false}
              />
            );
          })}

          {nodes.map(node => (
            <NodeShape
              key={node.id}
              node={node}
              isSelected={selectedId === node.id}
              isInSelection={selectedIds.includes(node.id)}
              onSelect={(shiftHeld) => handleNodeSelect(node.id, shiftHeld)}
              onStartLink={handleStartLink}
              onEndLink={handleEndLink}
              onRenameStart={(nodeId) => setEditingNodeId(nodeId)}
              onContextMenu={handleNodeContextMenu}
              isLinking={!!linkingFrom}
              onGroupDragStart={handleGroupDragStart}
              onGroupDragMove={handleGroupDragMove}
            />
          ))}

          {selectedLink && selectedLinkFromNode && selectedLinkToNode && (
            <LinkShape
              key={`overlay-${selectedLink.id}`}
              link={selectedLink}
              allLinks={links}
              fromNode={selectedLinkFromNode}
              toNode={selectedLinkToNode}
              isSelected
              selectedJointId={selectedJointId}
              onSelect={() => handleLinkSelect(selectedLink.id)}
              onContextMenu={(e) => handleLinkContextMenu(e, selectedLink.id)}
              onJointSelect={(jointId) => {
                setSelected(selectedLink.id);
                setSelectedJoint(jointId);
              }}
              onJointContextMenu={(e, jointId) => handleJointContextMenu(e, selectedLink.id, jointId)}
              onStartBranchFromJoint={(jointId) => handleStartJunctionLink(selectedLink.id, jointId)}
              onJointDragStart={(jointId) => {
                setSelected(selectedLink.id);
                setSelectedJoint(jointId);
              }}
              onJointDragMove={(jointId, point) => updateLinkJoint(selectedLink.id, jointId, point)}
              onJointDragEnd={(jointId, point) => updateLinkJoint(selectedLink.id, jointId, point)}
              onStartAnchorChange={({ side, along, centered }) => updateLink(selectedLink.id, {
                fromAnchorSide: side,
                fromAnchorLockedCenter: !!centered,
                fromAlongPos: along,
                fromAnchorId: null,
                fromJunctionLinkId: null,
                fromJunctionJointId: null,
              })}
              onEndAnchorChange={({ side, along, centered }) => updateLink(selectedLink.id, {
                toAnchorSide: side,
                toAnchorLockedCenter: !!centered,
                toAlongPos: along,
                toAnchorId: null,
              })}
              renderPaths={false}
            />
          )}

          {symmetryGuides.map((guide, idx) => (
            <Line
              key={guide.id ?? idx}
              points={guide.points}
              stroke={guide.stroke ?? pageColors.warningMain}
              strokeWidth={guide.strokeWidth ?? 1.5}
              dash={guide.dash ?? [6, 6]}
              opacity={guide.opacity ?? 0.95}
              listening={false}
            />
          ))}

          {selectionBox && (() => {
            const sx = Math.min(selectionBox.x1, selectionBox.x2);
            const sy = Math.min(selectionBox.y1, selectionBox.y2);
            const sw = Math.abs(selectionBox.x2 - selectionBox.x1);
            const sh = Math.abs(selectionBox.y2 - selectionBox.y1);
            return (
              <Rect
                x={sx} y={sy} width={sw} height={sh}
                fill={`${pageColors.purpleAccent}14`}
                stroke={pageColors.purpleAccent}
                strokeWidth={1 / scale}
                dash={[5 / scale, 4 / scale]}
                listening={false}
              />
            );
          })()}

          {linkingFrom && linkingStart && (
            <Line
              points={[
                linkingStart.x,
                linkingStart.y,
                rubberEnd.x,
                rubberEnd.y,
              ]}
              stroke={pageColors.blueLink}
              strokeWidth={2}
              dash={[8, 5]}
              opacity={0.75}
              listening={false}
            />
          )}
        </Layer>
      </Stage>

      {nodes.length === 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            gap: 10,
          }}
        >
          <div style={{ fontSize: 32, opacity: 0.12 }}>⬡</div>
          <p style={{ color: pageColors.whiteHintSoft, fontSize: 13, letterSpacing: '0.04em' }}>
            Right-click anywhere to add a node
          </p>
        </div>
      )}

      <div
        style={{
          position: 'absolute',
          bottom: 14,
          left: 14,
          color: pageColors.whiteHintDim,
          fontSize: 11,
          fontFamily: 'monospace',
          pointerEvents: 'none',
        }}
      >
        {Math.round(scale * 100)}%
      </div>

      {editingNode && (
        <input
          ref={renameInputRef}
          value={editingLabel}
          onChange={(e) => setEditingLabel(e.target.value)}
          onBlur={commitNodeRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitNodeRename();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              cancelNodeRename();
            }
          }}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            left: stagePos.x + editingNode.x * scale + 10,
            top: stagePos.y + editingNode.y * scale + editingNode.height * scale / 2 - 16,
            width: Math.max(84, editingNode.width * scale - 20),
            height: 32,
            padding: '5px 10px',
            borderRadius: 8,
            border: '1px solid var(--purple-border-strong)',
            background: 'var(--panel-bg-3)',
            color: 'var(--text-main)',
            boxShadow: '0 0 0 1px var(--input-focus-ring)',
            fontSize: Math.max(12, Math.min(18, editingNode.fontSize * scale)),
            zIndex: 3,
          }}
        />
      )}
    </div>
  );
}

export default DiagramCanvas;
