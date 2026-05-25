import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Layer, Line, Rect, Stage } from 'react-konva';
import { v4 as uuid } from 'uuid';
import { pageColors } from '../../../colorThemes';
import { AnimationEngine } from '../../animation/AnimationEngine';
import { buildLinkRenderData, getLinkParallelOffset, getNodeAnchorPoint, resolveLinkJunctionPoint } from '../../links/linkGeometry';
import { buildMirrorBindings, isMirrorNode, MIRROR_PADDING } from '../../mirror/mirrorData';
import { isAreaNode, isSubdiagramNode } from '../../store/useStore';
import { normalizeTextMorphList } from '../../text/textMorphs';
import useStore from '../../store/useStore';
import AreaShape from './AreaShape';
import LinkShape from './LinkShape';
import MirrorShape from './MirrorShape';
import NodeShape from './NodeShape';
import MonitorShape from './MonitorShape';
import SubdiagramShape from './SubdiagramShape';
import SubdiagramOverlay from '../SubdiagramOverlay';

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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function DiagramCanvas({ stageRef, layerRef, playback }) {
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
    updateMirrorNodeOverride,
    setContextMenu,
    deleteSelected,
    showGridLines,
    symmetryGuides,
    pendingMorphEdit,
    setPendingMorphEdit,
    expandedSubdiagramId,
    setExpandedSubdiagramId,
  } = useStore();
  const playbackTime = playback?.currentTime ?? 0;
  const playbackTimeline = playback?.timeline ?? [];
  // Ref-copy of expandedSubdiagramId so the frame callback doesn't capture a stale closure
  const expandedIdRef = useRef(null);
  // Keep expandedIdRef in sync so the frame callback never captures a stale value
  expandedIdRef.current = expandedSubdiagramId ?? null;

  const [scale, setScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [rubberEnd, setRubberEnd] = useState({ x: 0, y: 0 });
  const [editingNodeId, setEditingNodeId] = useState(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [editingMirror, setEditingMirror] = useState(null);
  const [editingMorph, setEditingMorph] = useState(null); // { nodeId, morphId }
  const [selectionBox, setSelectionBox] = useState(null);
  const [popupOverlayState, setPopupOverlayState] = useState(null);
  // Ref to the SubdiagramOverlay so we can drive its time imperatively at 60fps
  const subdiagramOverlayRef = useRef(null);
  // Tracks which popup window is currently active (without React state)
  const currentActivePopupRef = useRef(null);
  const containerRef = useRef(null);
  const renameInputRef = useRef(null);
  const lastPointerCanvasRef = useRef(null);
  const [dims, setDims] = useState({ w: 800, h: 600 });
  

  const getNodeScreenRect = useCallback((node) => {
    const width = (node.width ?? 150) * scale;
    const height = (node.height ?? 52) * scale;
    return {
      x: stagePos.x + node.x * scale,
      y: stagePos.y + node.y * scale,
      width,
      height,
    };
  }, [scale, stagePos]);

  const rbWasDragRef = useRef(false);

  const groupDragBaseRef  = useRef({});
  const selectedIdRef     = useRef(selectedId);
  const selectedIdsRef    = useRef(selectedIds);
  const nodesRef          = useRef(nodes);
  const dragNodesRef      = useRef(nodes);
  const linkNodesRef      = useRef([]);
  const linksRef          = useRef(links);
  const linkingFromRef    = useRef(linkingFrom);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { dragNodesRef.current = nodes; }, [nodes]);
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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let rb = null;
    let rbActive = false;
    let pan = null;

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
  }, []);

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
  const mirrorBindings = useMemo(() => buildMirrorBindings(nodes, links), [nodes, links]);
  const mirrorBindingById = useMemo(
    () => Object.fromEntries(mirrorBindings.bindings.map(binding => [binding.mirrorId, binding])),
    [mirrorBindings.bindings]
  );
  const playbackNodeEventsById = useMemo(
    () => Object.fromEntries(
      playbackTimeline
        .filter(event => event.type === 'node')
        .map(event => [event.id, event])
    ),
    [playbackTimeline]
  );
  const playbackLinkEventsById = useMemo(
    () => Object.fromEntries(
      playbackTimeline
        .filter(event => event.type === 'link')
        .map(event => [event.id, event])
    ),
    [playbackTimeline]
  );
  // Compute popup windows once per node/event change — NOT per frame.
  // Creating AnimationEngines here means we pay the cost only when the diagram changes,
  // not on every playback tick.
  const popupWindows = useMemo(() => {
    if (expandedSubdiagramId) return [];
    return nodes
      .filter(node =>
        isSubdiagramNode(node) &&
        ((node.showPopupInPlayback ?? node.showPreviewInPlayback) === true) &&
        (node.snapshotNodes?.length ?? 0) > 0
      )
      .map(node => {
        const event = playbackNodeEventsById[node.id];
        if (!event) return null;
        const triggerLinkEvent = node.triggerAfterLinkId
          ? playbackLinkEventsById[node.triggerAfterLinkId]
          : null;
        const nestedEngine = new AnimationEngine(node.snapshotNodes ?? [], node.snapshotLinks ?? [], {
          ancestorSubdiagramIds: [node.id],
        });
        const popupDelay = Math.max(0, node.popupDelay ?? 0);
        const popupPlaybackSpeed = Math.max(0.25, node.popupPlaybackSpeed ?? 1);
        const popupHold = Math.max(0, node.popupHold ?? 0);
        const popupStart = Math.max(
          event.start + popupDelay,
          triggerLinkEvent ? triggerLinkEvent.start + triggerLinkEvent.duration + popupDelay : -Infinity
        );
        const nestedContentDuration = nestedEngine.getContentDuration();
        const popupEnd = popupStart + nestedContentDuration / popupPlaybackSpeed + popupHold;
        return {
          node,
          event,
          popupStart,
          popupEnd,
          popupPlaybackSpeed,
          nestedContentDuration,
          sourceRect: getNodeScreenRect(node),
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.event.start - a.event.start || a.node.id.localeCompare(b.node.id));
  }, [expandedSubdiagramId, getNodeScreenRect, nodes, playbackLinkEventsById, playbackNodeEventsById]);

  // Determine which popup window (if any) is active at the current React-state time.
  // Only used for popup IDENTITY changes (show/hide); per-frame time updates go via ref.
  const activeSubdiagramPopup = useMemo(() => {
    return popupWindows.find(w => playbackTime >= w.popupStart && playbackTime <= w.popupEnd) ?? null;
  }, [popupWindows, playbackTime]);

  // Ref-copy of activeSubdiagramPopupTime — read inside the effect to get the initial
  // nested time when a popup first appears, without making it an effect dependency.
  const popupTimeRef = useRef(null);
  popupTimeRef.current = activeSubdiagramPopup
    ? clamp(
        (playbackTime - activeSubdiagramPopup.popupStart) * activeSubdiagramPopup.popupPlaybackSpeed,
        0,
        activeSubdiagramPopup.nestedContentDuration
      )
    : null;

  // React state is only updated when popup IDENTITY changes (a different popup appears or
  // disappears). Per-frame time changes are driven imperatively via frameCallbackRef → setTime().
  // This means setPopupOverlayState fires rarely, not every animation frame.
  useEffect(() => {
    if (expandedSubdiagramId) {
      currentActivePopupRef.current = null;
      setPopupOverlayState(null);
      return;
    }

    if (activeSubdiagramPopup) {
      if (currentActivePopupRef.current?.node.id !== activeSubdiagramPopup.node.id) {
        // New popup — show it with the current time as its initial controlled position
        currentActivePopupRef.current = activeSubdiagramPopup;
        setPopupOverlayState({
          node: activeSubdiagramPopup.node,
          controlledTime: popupTimeRef.current,
          visible: true,
          sourceRect: activeSubdiagramPopup.sourceRect ?? null,
        });
      }
      // Same popup still active — time updates handled imperatively via frameCallback
      return;
    }

    if (currentActivePopupRef.current) {
      currentActivePopupRef.current = null;
      setPopupOverlayState((current) => (current ? { ...current, visible: false } : null));
    }
  }, [activeSubdiagramPopup, expandedSubdiagramId]); // NOT time-dependent — fires only on identity changes

  // Wire up the per-frame callback so the overlay is driven at full 60fps without React re-renders.
  // Uses subdiagramFrameCallbackRef (not frameCallbackRef) to avoid clobbering the KeyframePanel
  // playhead callback which also registers on frameCallbackRef.
  useEffect(() => {
    const frameCallback = playback?.subdiagramFrameCallbackRef;
    if (!frameCallback) return undefined;

    frameCallback.current = (t) => {
      if (expandedIdRef.current) return;
      const popup = currentActivePopupRef.current;
      if (!popup) return;
      if (t < popup.popupStart || t > popup.popupEnd) return;
      const nestedT = clamp(
        (t - popup.popupStart) * popup.popupPlaybackSpeed,
        0,
        popup.nestedContentDuration
      );
      subdiagramOverlayRef.current?.setTime(nestedT);
    };

    return () => { frameCallback.current = null; };
  }, [playback?.subdiagramFrameCallbackRef]); // stable — all runtime values read from refs
  const allNodes = useMemo(
    () => [...nodes.filter(n => !isAreaNode(n)), ...mirrorBindings.bindings.flatMap(b => b.childNodes)],
    [nodes, mirrorBindings.bindings]
  );
  const dragNodes = useMemo(
    () => [...nodes, ...mirrorBindings.bindings.flatMap(b => b.childNodes)],
    [nodes, mirrorBindings.bindings]
  );
  useEffect(() => { dragNodesRef.current = dragNodes; }, [dragNodes]);
  useEffect(() => { linkNodesRef.current = allNodes; }, [allNodes]);
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
    if (!pendingMorphEdit) return;
    const { nodeId, morphId } = pendingMorphEdit;
    setPendingMorphEdit(null, null);
    setEditingMorph({ nodeId, morphId });
    setEditingLabel('');
  }, [pendingMorphEdit, setPendingMorphEdit]);

  useEffect(() => {
    if (!editingNode && !editingMirror && !editingMorph) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [editingNode, editingMirror, editingMorph]);

  useEffect(() => {
    for (const binding of mirrorBindings.bindings) {
      const mirrorNode = nodes.find(node => node.id === binding.mirrorId);
      if (!mirrorNode) continue;
      const widthDiff = Math.abs((mirrorNode.width ?? 0) - binding.frameWidth);
      const heightDiff = Math.abs((mirrorNode.height ?? 0) - binding.frameHeight);
      if (widthDiff > 0.5 || heightDiff > 0.5) {
        updateNode(binding.mirrorId, {
          width: binding.frameWidth,
          height: binding.frameHeight,
        });
      }
    }
  }, [mirrorBindings.bindings, nodes, updateNode]);

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
    setEditingMirror(null);
    setEditingMorph(null);
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
    setEditingMirror(null);
    setEditingMorph(null);
  }, []);

  const commitMirrorRename = useCallback(() => {
    if (!editingMirror) return;
    const nextLabel = editingLabel.trim();
    if (nextLabel !== editingMirror.initialLabel) {
      updateMirrorNodeOverride(editingMirror.mirrorId, editingMirror.sourceNodeId, { label: nextLabel });
    }
    setEditingMirror(null);
  }, [editingLabel, editingMirror, updateMirrorNodeOverride]);

  const commitMorphTextEdit = useCallback(() => {
    if (!editingMorph) return;
    const { nodeId, morphId } = editingMorph;
    const node = nodes.find(n => n.id === nodeId);
    if (node) {
      const nextMorphs = normalizeTextMorphList(
        (node.textMorphs ?? []).map(m => m.id === morphId ? { ...m, text: editingLabel } : m)
      );
      updateNode(nodeId, { textMorphs: nextMorphs });
    }
    setEditingMorph(null);
  }, [editingLabel, editingMorph, nodes, updateNode]);

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
    const sc = stageRef.current.getPointerPosition();
    const shape = stageRef.current.getIntersection(sc);
    if (!isCanvasBackgroundShape(shape)) return;
    openCanvasMenu(sc);
  }, [openCanvasMenu, stageRef]);

  const handleMouseMove = useCallback(() => {
    const pointer = stageRef.current.getPointerPosition();
    if (!pointer) return;
    const canvasPoint = toCanvas(pointer);
    lastPointerCanvasRef.current = canvasPoint;
    if (linkingFrom) setRubberEnd(canvasPoint);
  }, [linkingFrom, stageRef, toCanvas]);

  const handleMouseUp = useCallback((e) => {
    if (e.evt.button === 0 && linkingFrom) setLinkingFrom(null);
  }, [linkingFrom, setLinkingFrom]);

  const handleGroupDragStart = useCallback((draggedId) => {
    const nodeBase = {};
    const jointBase = {};
    const dragNodeList = dragNodesRef.current;
    const storeNodes = nodesRef.current;
    const selectedSourceIds = [...new Set([...selectedIdsRef.current, selectedIdRef.current].filter(Boolean))];
    const pointInArea = (point, area) => (
      point.x >= area.x &&
      point.x <= area.x + area.width &&
      point.y >= area.y &&
      point.y <= area.y + area.height
    );

    const selectedNodes = new Set();
    for (const id of selectedSourceIds) {
      if (dragNodeList.find(n => n.id === id)) selectedNodes.add(id);
    }

    for (const id of selectedNodes) {
      if (id !== draggedId) {
        const n = dragNodeList.find(node => node.id === id);
        if (n) nodeBase[id] = { x: n.x, y: n.y };
      }
    }

    const draggedNode = storeNodes.find(node => node.id === draggedId) ?? dragNodeList.find(node => node.id === draggedId);
    const selectedAreas = [...selectedNodes]
      .map(id => storeNodes.find(item => item.id === id))
      .filter(isAreaNode);
    const hasSelectedArea = selectedAreas.length > 0;

    // Collect joints for selected links.
    // If an area is involved, only move joints for links explicitly selected by the user.
    // Area selections also carry any joints spatially inside the selected area bounds.
    const selectedSet = new Set(selectedSourceIds);
    for (const link of linksRef.current) {
      const bothSelected = selectedNodes.has(link.fromId) && selectedNodes.has(link.toId);
      const linkSelected = selectedSet.has(link.id);
      const jointsInSelectedAreas = (link.joints ?? []).filter(joint =>
        selectedAreas.some(area => pointInArea(joint, area))
      );
      const shouldMoveAllJoints = linkSelected || ((!isAreaNode(draggedNode) && !hasSelectedArea) && bothSelected);
      const jointsToMove = shouldMoveAllJoints ? (link.joints ?? []) : jointsInSelectedAreas;
      if (jointsToMove.length) {
        jointBase[link.id] = {};
        for (const joint of jointsToMove) {
          jointBase[link.id][joint.id] = { x: joint.x, y: joint.y };
        }
      }
    }

    groupDragBaseRef.current = { nodes: nodeBase, joints: jointBase };
  }, []);

  const handleGroupDragMove = useCallback((draggedId, dx, dy) => {
    const base = groupDragBaseRef.current;
    for (const [id, pos] of Object.entries(base.nodes ?? {})) {
      updateNode(id, { x: pos.x + dx, y: pos.y + dy });
    }
    for (const [linkId, joints] of Object.entries(base.joints ?? {})) {
      for (const [jointId, pos] of Object.entries(joints)) {
        updateLinkJoint(linkId, jointId, { x: pos.x + dx, y: pos.y + dy });
      }
    }
  }, [updateNode, updateLinkJoint]);

  const addJointAtCanvasPoint = useCallback((linkId, canvasPoint) => {
    const link = linksRef.current.find(l => l.id === linkId);
    if (!link) return;
    const fromNode = linkNodesRef.current.find(n => n.id === link.fromId);
    const toNode   = linkNodesRef.current.find(n => n.id === link.toId);
    if (!fromNode || !toNode) return;
    const render = buildLinkRenderData(link, fromNode, toNode, linksRef.current, linkNodesRef.current);
    const parallelOffset = getLinkParallelOffset(link, fromNode, toNode, linksRef.current);
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
    const node = allNodes.find(item => item.id === nodeId);
    if (node) {
      const center = { x: node.x + node.width / 2, y: node.y + node.height / 2 };
      const anchor = side
        ? getNodeAnchorPoint(node, side)
        : center;
      setRubberEnd(anchor);
    }
    setLinkingFrom({ type: 'node', nodeId, ...(side ?? {}) });
  }, [allNodes, setLinkingFrom]);

  const handleEndLinkAtJunction = useCallback((junctionLinkId, junctionJointId) => {
    if (!linkingFrom) return;
    const parentLink = links.find(l => l.id === junctionLinkId);
    if (!parentLink) { setLinkingFrom(null); return; }

    const toId = parentLink.toId;
    const junctionOverrides = {
      toJunctionLinkId: junctionLinkId,
      toJunctionJointId: junctionJointId,
      toAnchorSide: null,
      toAnchorLockedCenter: false,
      toAlongPos: 0,
      toAnchorId: null,
    };

    if (linkingFrom.type === 'junction') {
      if (linkingFrom.fromNodeId) {
        const parentLinkOfFrom = links.find(l => l.id === linkingFrom.linkId);
        const parentJoint = parentLinkOfFrom?.joints?.find(j => j.id === linkingFrom.jointId) ?? null;
        addLink(linkingFrom.fromNodeId, toId, {
          fromJunctionLinkId: linkingFrom.linkId,
          fromJunctionJointId: linkingFrom.jointId,
          syncGroupKey: parentJoint?.syncBranches ? `${linkingFrom.linkId}::${linkingFrom.jointId}` : null,
          fromAnchorSide: null,
          fromAnchorLockedCenter: false,
          fromAlongPos: 0,
          fromAnchorId: null,
          ...junctionOverrides,
        });
      }
    } else if (linkingFrom.type === 'node') {
      addLink(linkingFrom.nodeId, toId, {
        fromAnchorSide: linkingFrom.side ?? null,
        fromAnchorLockedCenter: !!linkingFrom.centered,
        fromAlongPos: linkingFrom.along ?? 0,
        fromAnchorId: linkingFrom.anchorId ?? null,
        ...junctionOverrides,
      });
    }
    setLinkingFrom(null);
  }, [addLink, linkingFrom, links, setLinkingFrom]);

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

  const handleResizeMirror = useCallback((mirrorId, nextWidth, nextHeight, binding) => {
    const sourceWidth = Math.max(1, binding?.sourceWidth ?? 1);
    const sourceHeight = Math.max(1, binding?.sourceHeight ?? 1);

    if (!binding?.childNodes?.length) {
      updateNode(mirrorId, {
        width: nextWidth,
        height: nextHeight,
      });
      return;
    }

    const availableWidth = Math.max(24, nextWidth - MIRROR_PADDING * 2);
    const availableHeight = Math.max(24, nextHeight - MIRROR_PADDING * 2);
    const mirrorScale = Math.max(0.1, Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight));

    updateNode(mirrorId, {
      mirrorScale,
      width: Math.max(180, sourceWidth * mirrorScale + MIRROR_PADDING * 2),
      height: Math.max(120, sourceHeight * mirrorScale + MIRROR_PADDING * 2),
    });
  }, [updateNode]);

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
    ? allNodes.find(node => node.id === linkingFrom.nodeId)
    : null;
  const selectedLink = links.find(link => link.id === selectedId) ?? null;
  const selectedLinkFromNode = selectedLink ? allNodes.find(node => node.id === selectedLink.fromId) : null;
  const selectedLinkToNode = selectedLink ? allNodes.find(node => node.id === selectedLink.toId) : null;
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

          {nodes.filter(isAreaNode).map(area => (
            <AreaShape
              key={area.id}
              area={area}
              isSelected={selectedId === area.id}
              isInSelection={selectedIds.includes(area.id)}
              onSelect={(shiftHeld) => handleNodeSelect(area.id, shiftHeld)}
              onContextMenu={handleNodeContextMenu}
              onGroupDragStart={handleGroupDragStart}
              onGroupDragMove={handleGroupDragMove}
            />
          ))}

          {links.map((link) => {
            const fromNode = allNodes.find(node => node.id === link.fromId);
            const toNode = allNodes.find(node => node.id === link.toId);
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
                onEndLinkAtJunction={handleEndLinkAtJunction}
                isLinking={!!linkingFrom}
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

          {nodes.filter(isMirrorNode).map(node => {
            const binding = mirrorBindingById[node.id];
            if (!binding) return null;
            return (
              <MirrorShape
                key={node.id}
                mirror={node}
                binding={binding}
                isSelected={selectedId === node.id}
                isInSelection={selectedIds.includes(node.id)}
                onSelect={(shiftHeld) => handleNodeSelect(node.id, shiftHeld)}
                onContextMenu={handleNodeContextMenu}
                onGroupDragStart={handleGroupDragStart}
                onGroupDragMove={handleGroupDragMove}
                onSelectSourceNode={handleNodeSelect}
                onSelectSourceLink={handleLinkSelectWithShift}
                onSourceNodeContextMenu={handleNodeContextMenu}
                onSourceLinkContextMenu={handleLinkContextMenu}
                onMirrorNodeRename={(mirrorId, sourceNodeId, childNode) => {
                  const mirrorNode = nodes.find(n => n.id === mirrorId);
                  const override = mirrorNode?.mirrorNodeOverrides?.[sourceNodeId] ?? {};
                  const sourceNode = nodes.find(n => n.id === sourceNodeId);
                  const initialLabel = override.label ?? sourceNode?.label ?? '';
                  setEditingLabel(initialLabel);
                  setEditingMirror({ mirrorId, sourceNodeId, childNode, initialLabel });
                }}
                onStartSourceLink={handleStartLink}
                onEndSourceLink={handleEndLink}
                selectedSourceId={selectedId}
                selectedSourceIds={selectedIds}
                isLinking={!!linkingFrom}
                onResizeMirror={handleResizeMirror}
                onSourceGroupDragStart={handleGroupDragStart}
                onSourceGroupDragMove={handleGroupDragMove}
              />
            );
          })}

          {nodes.map(node => {
            if (isMirrorNode(node) || isAreaNode(node)) return null;
            if (isSubdiagramNode(node)) return (
              <SubdiagramShape
                key={node.id}
                node={node}
                isSelected={selectedId === node.id}
                isInSelection={selectedIds.includes(node.id)}
                onSelect={(shiftHeld) => handleNodeSelect(node.id, shiftHeld)}
                onStartLink={handleStartLink}
                onEndLink={handleEndLink}
                onContextMenu={handleNodeContextMenu}
                isLinking={!!linkingFrom}
                onGroupDragStart={handleGroupDragStart}
                onGroupDragMove={handleGroupDragMove}
                onExpand={() => setExpandedSubdiagramId(node.id)}
              />
            );
            if (node.type === 'monitor') return (
              <MonitorShape
                key={node.id}
                node={node}
                isSelected={selectedId === node.id}
                isInSelection={selectedIds.includes(node.id)}
                onSelect={(shiftHeld) => handleNodeSelect(node.id, shiftHeld)}
                onStartLink={handleStartLink}
                onEndLink={handleEndLink}
                onContextMenu={handleNodeContextMenu}
                isLinking={!!linkingFrom}
                onGroupDragStart={handleGroupDragStart}
                onGroupDragMove={handleGroupDragMove}
              />
            );
            return (
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
            );
          })}

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
              onEndLinkAtJunction={handleEndLinkAtJunction}
              isLinking={!!linkingFrom}
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
                toJunctionLinkId: null,
                toJunctionJointId: null,
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

      {(editingNode || editingMirror || editingMorph) && (() => {
        const morphTargetNode = editingMorph ? nodes.find(n => n.id === editingMorph.nodeId) ?? null : null;
        const activeNode = editingNode ?? editingMirror?.childNode ?? morphTargetNode;
        const commit = editingNode ? commitNodeRename : editingMirror ? commitMirrorRename : commitMorphTextEdit;
        if (!activeNode) return null;
        return (
          <input
            ref={renameInputRef}
            value={editingLabel}
            onChange={(e) => setEditingLabel(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commit(); }
              if (e.key === 'Escape') { e.preventDefault(); cancelNodeRename(); }
            }}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              left: stagePos.x + activeNode.x * scale + 10,
              top: stagePos.y + activeNode.y * scale + activeNode.height * scale / 2 - 16,
              width: Math.max(84, activeNode.width * scale - 20),
              height: 32,
              padding: '5px 10px',
              borderRadius: 8,
              border: '1px solid var(--purple-border-strong)',
              background: 'var(--panel-bg-3)',
              color: 'var(--text-main)',
              boxShadow: '0 0 0 1px var(--input-focus-ring)',
              fontSize: Math.max(12, Math.min(18, activeNode.fontSize * scale)),
              zIndex: 3,
            }}
          />
        );
      })()}

      {expandedSubdiagramId && (() => {
        const subNode = nodes.find(n => n.id === expandedSubdiagramId);
        if (!subNode) { setExpandedSubdiagramId(null); return null; }
        return (
          <SubdiagramOverlay
            node={subNode}
            onClose={() => setExpandedSubdiagramId(null)}
            showControls
            ancestryNodeIds={[subNode.id]}
            sourceRect={getNodeScreenRect(subNode)}
            viewportSize={dims}
          />
        );
      })()}

      {!expandedSubdiagramId && popupOverlayState && (
        <SubdiagramOverlay
          ref={subdiagramOverlayRef}
          node={popupOverlayState.node}
          controlledTime={popupOverlayState.controlledTime}
          dismissible={false}
          showControls={false}
          visible={popupOverlayState.visible}
          onExited={() => setPopupOverlayState(null)}
          ancestryNodeIds={[popupOverlayState.node.id]}
          sourceRect={popupOverlayState.sourceRect ?? null}
          viewportSize={dims}
        />
      )}

      {/* ECC demo removed */}

    </div>
  );
}

export default DiagramCanvas;
