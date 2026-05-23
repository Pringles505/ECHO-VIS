import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { v4 as uuid } from 'uuid';
import { pageColors, withAlpha } from '../../colorThemes';
import useStore from '../store/useStore';
import { AnimationEngine } from '../animation/AnimationEngine';
import { buildLinkRenderData, getLinkJointProgress } from '../links/linkGeometry';
import { isMirrorNode } from '../mirror/mirrorData';
import { getNextTextMorphStart, getNodeTextMorphs, getTextMorphById, normalizeTextMorphList } from '../text/textMorphs';
import { computeVariableWebs } from '../variables/flow';

const LEFT_W     = 240;
const ROW_H      = 36;
const SEC_H      = 22;
const RULER_H    = 26;
const PANEL_MIN_H = 210;
const PANEL_DEFAULT_H = 320;
const PX_PER_SEC = 90;
const MIN_DUR    = 0.1;
const HANDLE_W   = 9;

const NODE_HUE      = { solid: pageColors.purpleAccent, bright: pageColors.purpleAccent };
const LINK_HUE      = { solid: pageColors.blueMain, bright: pageColors.blueLink };
const MORPH_HUE     = { solid: pageColors.white, bright: pageColors.white };
const TRANSFORM_HUE = { solid: pageColors.warningBright, bright: pageColors.warningBright };
const TOKEN_HUE     = { solid: pageColors.blueLink, bright: pageColors.blueLink };

const r2    = v => Math.round(v * 100) / 100;
const trunc = (s, n = 13) => (s ?? '?').length > n ? (s ?? '?').slice(0, n - 1) + '…' : (s ?? '?');

function inverseEaseOut(value) {
  const clamped = Math.max(0, Math.min(1, value));
  return 1 - Math.pow(1 - clamped, 1 / 3);
}

function fmtTime(s) {
  const m   = Math.floor(s / 60);
  const sec = (s % 60).toFixed(2).padStart(5, '0');
  return m > 0 ? `${m}:${sec}` : `${sec}s`;
}

function linkLabel(link, nodes) {
  const from = nodes.find(n => n.id === link.fromId);
  const to   = nodes.find(n => n.id === link.toId);
  return `${trunc(from?.label, 22)} → ${trunc(to?.label, 22)}`;
}

function computeAutoTimes(nodes, links) {
  if (!nodes.length && !links.length) return { nodes: {}, links: {} };
  const tl = new AnimationEngine(nodes, links).getTimeline();
  const result = { nodes: {}, links: {} };
  for (const ev of tl) {
    result[ev.type + 's'][ev.id] = {
      start: ev.start,
      duration: ev.duration,
      displayDuration: ev.displayDuration ?? ev.duration,
      popupStart: ev.popupStart ?? null,
      popupEnd: ev.popupEnd ?? null,
      transformStart: ev.transformStart ?? null,
      transformEnd: ev.transformEnd ?? null,
    };
  }
  return result;
}

function getSyncedJunctionKey(link, linkMap) {
  if (link?.syncGroupKey) return link.syncGroupKey;
  if (!link?.fromJunctionLinkId || !link?.fromJunctionJointId) return null;
  const parentLink = linkMap[link.fromJunctionLinkId];
  const joint = parentLink?.joints?.find(item => item.id === link.fromJunctionJointId);
  return joint?.syncBranches ? `${link.fromJunctionLinkId}::${link.fromJunctionJointId}` : null;
}

function speedLabel(dur) {
  if (dur <= 0.2) return 'Very fast';
  if (dur <= 0.4) return 'Fast';
  if (dur <= 0.8) return 'Normal';
  if (dur <= 1.5) return 'Slow';
  return 'Very slow';
}
function speedColor(dur) {
  if (dur <= 0.2) return pageColors.successBright;
  if (dur <= 0.4) return pageColors.blueLink;
  if (dur <= 0.8) return pageColors.purpleAccent;
  if (dur <= 1.5) return pageColors.warningBright;
  return pageColors.dangerBright;
}

function Ruler({ total, contentDur }) {
  const ticks = [];
  const step = total > 15 ? 2 : total > 8 ? 1 : 0.5;
  for (let t = 0; t <= total + 0.01; t = r2(t + step)) {
    const major = Number.isInteger(t) || step >= 1;
    ticks.push(
      <div key={t} style={{ position: 'absolute', left: t * PX_PER_SEC - 1, top: 0, pointerEvents: 'none' }}>
        {major && (
          <span style={{ color: pageColors.rulerText, fontSize: 10, position: 'absolute', top: 4, left: 3, whiteSpace: 'nowrap' }}>
            {t % 1 === 0 ? `${t}s` : `${t.toFixed(1)}`}
          </span>
        )}
        <div style={{ position: 'absolute', bottom: 0, width: 1, height: major ? 8 : 4, background: major ? pageColors.rulerMajorTick : pageColors.rulerMinorTick }} />
      </div>
    );
  }
  // End-of-content marker — a clear vertical line with "END" label so users
  // can see exactly where timeline content stops and the buffer zone starts.
  const endPx = contentDur * PX_PER_SEC;
  return (
    <div style={{ height: RULER_H, background: 'var(--panel-bg)', borderBottom: '1px solid var(--border-strong)', position: 'relative', flexShrink: 0 }}>
      {ticks}
      <div style={{
        position: 'absolute', left: endPx, top: 0, bottom: 0,
        width: 1, background: withAlpha(pageColors.purpleAccent, 0.35),
        pointerEvents: 'none',
      }} />
      <span style={{
        position: 'absolute', left: endPx + 4, top: 5,
        fontSize: 8, fontWeight: 700, letterSpacing: '0.1em',
        color: withAlpha(pageColors.purpleAccent, 0.5),
        pointerEvents: 'none', whiteSpace: 'nowrap',
      }}>
        END
      </span>
    </div>
  );
}

function SectionRow({ label, color }) {
  return (
    <div style={{
      height: SEC_H, display: 'flex', alignItems: 'center',
      padding: '0 10px', flexShrink: 0,
      background: 'var(--panel-bg)',
      borderBottom: `1px solid ${withAlpha(color, 0.13)}`,
    }}>
      <div style={{ width: 3, height: 10, borderRadius: 2, background: color, marginRight: 7, flexShrink: 0 }} />
      <span style={{ color, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
        {label}
      </span>
    </div>
  );
}

function KeyframePanel({ playback }) {
  const {
    nodes,
    links,
    updateNode,
    updateLink,
    _pushHistory,
    removeNode,
    selectedId,
    selectedIds,
    setSelection,
    setSelected,
    addToSelection,
    setPendingMorphEdit,
  } = useStore();
  const { isPlaying, currentTime, totalDuration, contentDuration, play, pause, stop, seek, frameCallbackRef } = playback;

  useEffect(() => {
    // Register high-frequency update callback to bypass React throttle
    frameCallbackRef.current = (t) => {
      if (!playheadRef.current) return;
      const cDur = Math.max(contentDuration ?? totalDuration, 4);
      const tW = cDur * PX_PER_SEC + 160;
      const px = Math.min(t * PX_PER_SEC, tW - 2);
      playheadRef.current.style.left = `${px}px`;
      const label = playheadRef.current.querySelector('[data-time-label]');
      if (label) label.textContent = `${t.toFixed(2)}s`;
    };
    return () => {
      if (frameCallbackRef.current) frameCallbackRef.current = null;
    };
  }, [contentDuration, totalDuration, frameCallbackRef]);

  const [collapsed,     setCollapsed]     = useState(false);
  const [panelHeight,   setPanelHeight]   = useState(PANEL_DEFAULT_H);
  const [selectedItem,  setSelectedItem]  = useState(null);

  const blockDragRef  = useRef(null);
  const headDragRef   = useRef(false);
  const timelineRef   = useRef(null);
  const leftBodyRef   = useRef(null);
  const rightBodyRef  = useRef(null);
  const resizeRef     = useRef(null);
  const panelRef      = useRef(null);
  const playheadRef   = useRef(null);  // Direct DOM ref for zero-re-render scrubbing
  const syncingScrollRef = useRef(false);

  const timelineNodes = useMemo(() => nodes.filter(node => !isMirrorNode(node)), [nodes]);
  const autoTimes = useMemo(() => computeAutoTimes(timelineNodes, links), [links, timelineNodes]);
  const variableWebs = useMemo(() => {
    // Build a one-shot engine timeline so the token chain origin reflects each
    // link's actual draw end — matches the playback timing exactly.
    const tl = new AnimationEngine(timelineNodes, links).getTimeline();
    return computeVariableWebs(timelineNodes, links, { timeline: tl });
  }, [timelineNodes, links]);
  const webByVariableId = useMemo(() => {
    const m = {};
    for (const w of variableWebs) m[w.sourceNodeId] = w;
    return m;
  }, [variableWebs]);
  const linkMap = useMemo(() => Object.fromEntries(links.map(link => [link.id, link])), [links]);
  const nodeMap = useMemo(() => Object.fromEntries(nodes.map(node => [node.id, node])), [nodes]);
  const linkLengthById = useMemo(() => Object.fromEntries(
    links.map(link => {
      const fromNode = nodeMap[link.fromId];
      const toNode = nodeMap[link.toId];
      if (!fromNode || !toNode) return [link.id, 0];
      return [link.id, buildLinkRenderData(link, fromNode, toNode, links, nodes).length ?? 0];
    })
  ), [linkMap, links, nodeMap, nodes]);
  const syncedJunctionKeyByLinkId = useMemo(() => Object.fromEntries(
    links.map(link => [link.id, getSyncedJunctionKey(link, linkMap)])
  ), [linkMap, links]);
  const syncedLinkIdsByKey = useMemo(() => {
    const groups = {};
    for (const link of links) {
      const key = syncedJunctionKeyByLinkId[link.id];
      if (!key) continue;
      if (!groups[key]) groups[key] = [];
      groups[key].push(link.id);
    }
    return groups;
  }, [links, syncedJunctionKeyByLinkId]);
  const boundLinkIdsByKey = useMemo(() => {
    const groups = {};
    for (const link of links) {
      for (const joint of link.joints ?? []) {
        if (!joint?.syncBranches) continue;
        const key = `${link.id}::${joint.id}`;
        const childIds = links
          .filter(item => item.fromJunctionLinkId === link.id && item.fromJunctionJointId === joint.id)
          .map(item => item.id);
        if (!childIds.length) continue;
        groups[key] = [link.id, ...childIds];
      }
    }
    return groups;
  }, [links]);
  const boundKeyByLinkId = useMemo(() => {
    const entries = [];
    for (const [key, linkIds] of Object.entries(boundLinkIdsByKey)) {
      for (const linkId of linkIds) {
        entries.push([linkId, key]);
      }
    }
    return Object.fromEntries(entries);
  }, [boundLinkIdsByKey]);
  const boundGroupStartByKey = useMemo(() => {
    const result = {};
    for (const [key, linkIds] of Object.entries(boundLinkIdsByKey)) {
      const [parentId, jointId] = key.split('::');
      const parentLink = linkMap[parentId];
      if (!parentLink || linkIds.length <= 1) continue;
      const parentStart = parentLink.animStartTime ?? autoTimes.links[parentId]?.start ?? 0;
      const parentDuration = parentLink.animDuration ?? autoTimes.links[parentId]?.duration ?? 0.65;
      const jointProgress = getLinkJointProgress(parentId, jointId, links, nodes);
      result[key] = jointProgress == null
        ? parentStart
        : parentStart + parentDuration * inverseEaseOut(jointProgress);
    }
    return result;
  }, [autoTimes.links, boundLinkIdsByKey, linkMap, links, nodes]);
  const syncedGroupStartByKey = useMemo(() => {
    const result = {};
    for (const [key, linkIds] of Object.entries(syncedLinkIdsByKey)) {
      result[key] = Math.min(...linkIds.map(linkId => {
        const link = linkMap[linkId];
        return link?.animStartTime ?? autoTimes.links[linkId]?.start ?? 0;
      }));
    }
    return result;
  }, [autoTimes.links, linkMap, syncedLinkIdsByKey]);
  const selectionOrder = useMemo(() => ([
    ...timelineNodes.map(node => ({ kind: 'node', id: node.id, key: `node:${node.id}` })),
    ...links.map(link => ({ kind: 'link', id: link.id, key: `link:${link.id}` })),
  ]), [links, timelineNodes]);
  const selectionIndexByKey = useMemo(
    () => Object.fromEntries(selectionOrder.map((item, index) => [item.key, index])),
    [selectionOrder]
  );

  useEffect(() => {
    for (const [key, linkIds] of Object.entries(boundLinkIdsByKey)) {
      const [parentId] = key.split('::');
      const branchStart = boundGroupStartByKey[key];
      if (branchStart == null) continue;
      for (const linkId of linkIds) {
        if (linkId === parentId) continue;
        const link = linkMap[linkId];
        const currentStart = link?.animStartTime;
        if (currentStart == null || Math.abs(currentStart - branchStart) > 0.001) {
          updateLink(linkId, { animStartTime: branchStart, syncGroupKey: key });
        }
      }
    }
  }, [boundGroupStartByKey, boundLinkIdsByKey, linkMap, updateLink]);

  const effectiveTiming = useCallback((item, kind) => {
    const pool       = kind === 'node' ? autoTimes.nodes : autoTimes.links;
    const defaultDur = kind === 'node' ? 0.5 : 0.65;
    const syncKey = kind === 'link' ? syncedJunctionKeyByLinkId[item.id] : null;
    const sharedStart = syncKey ? syncedGroupStartByKey[syncKey] : null;
    const boundKey = kind === 'link' ? boundKeyByLinkId[item.id] : null;
    const branchSharedStart = boundKey && !item.fromJunctionLinkId
      ? null
      : boundKey
        ? boundGroupStartByKey[boundKey]
        : null;
    const visualStart = branchSharedStart ?? sharedStart ?? item.animStartTime ?? pool[item.id]?.start ?? 0;
    const baseDuration = item.animDuration ?? pool[item.id]?.duration ?? defaultDur;
    return {
      start: visualStart,
      duration: baseDuration,
      displayDuration: pool[item.id]?.displayDuration ?? baseDuration,
      isAuto:   item.animStartTime == null,
    };
  }, [autoTimes, boundGroupStartByKey, boundKeyByLinkId, syncedGroupStartByKey, syncedJunctionKeyByLinkId]);
  const previewBlockedRanges = useMemo(() => (
    timelineNodes
      .map(node => {
        const timing = autoTimes.nodes[node.id];
        if (timing?.popupStart == null || timing?.popupEnd == null || timing.popupEnd <= timing.popupStart) return null;
        return {
          ownerId: node.id,
          start: timing.popupStart,
          end: timing.popupEnd,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.start - b.start || a.ownerId.localeCompare(b.ownerId))
  ), [autoTimes.nodes, timelineNodes]);

  const clampMoveStartAgainstPreviewRanges = useCallback((nextStart, duration, excludeIds, direction, dragState = null) => {
    const excluded = new Set(excludeIds ?? []);
    let clampedStart = Math.max(0, nextStart);
    const ranges = previewBlockedRanges.filter(range => !excluded.has(range.ownerId));
    const activeCrossing = dragState?.previewCrossing ?? null;
    const setActiveCrossing = (nextCrossing) => {
      if (dragState) dragState.previewCrossing = nextCrossing;
    };
    if (direction < 0) {
      for (let i = ranges.length - 1; i >= 0; i -= 1) {
        const range = ranges[i];
        const farEdge = Math.max(0, range.start - duration);
        const nearEdge = range.end;
        const isActiveRange = activeCrossing?.ownerId === range.ownerId && activeCrossing?.side === 'left';
        if (isActiveRange && activeCrossing?.crossed) {
          if (clampedStart > nearEdge) {
            setActiveCrossing(null);
            continue;
          }
          if (clampedStart > farEdge) return farEdge;
          setActiveCrossing(null);
          return clampedStart;
        }
        if (clampedStart < nearEdge && clampedStart > farEdge) {
          if (!isActiveRange) {
            setActiveCrossing({ ownerId: range.ownerId, side: 'left', crossed: false });
          }
          clampedStart = nearEdge;
          return clampedStart;
        }
        if (isActiveRange && clampedStart <= farEdge) {
          setActiveCrossing({ ownerId: range.ownerId, side: 'left', crossed: true });
          return farEdge;
        }
      }
      setActiveCrossing(null);
      return clampedStart;
    }
    for (const range of ranges) {
      const nearEdge = Math.max(0, range.start - duration);
      const farEdge = range.end;
      const isActiveRange = activeCrossing?.ownerId === range.ownerId && activeCrossing?.side === 'right';
      if (isActiveRange && activeCrossing?.crossed) {
        if (clampedStart < nearEdge) {
          setActiveCrossing(null);
          continue;
        }
        if (clampedStart < farEdge) return farEdge;
        setActiveCrossing(null);
        return clampedStart;
      }
      if (clampedStart >= nearEdge && clampedStart < farEdge) {
        if (!isActiveRange) {
          setActiveCrossing({ ownerId: range.ownerId, side: 'right', crossed: false });
        }
        clampedStart = nearEdge;
        return clampedStart;
      }
      if (isActiveRange && clampedStart >= farEdge) {
        setActiveCrossing({ ownerId: range.ownerId, side: 'right', crossed: true });
        return farEdge;
      }
    }
    setActiveCrossing(null);
    return clampedStart;
  }, [previewBlockedRanges]);

  const clampResizeDurationAgainstPreviewRanges = useCallback((start, nextDuration, excludeIds) => {
    const excluded = new Set(excludeIds ?? []);
    const ranges = previewBlockedRanges.filter(range => !excluded.has(range.ownerId));
    let end = Math.max(start + MIN_DUR, start + nextDuration);
    for (const range of ranges) {
      if (range.start <= start) continue;
      if (end > range.start) {
        end = Math.min(end, range.start);
      }
    }
    return r2(Math.max(MIN_DUR, end - start));
  }, [previewBlockedRanges]);

  const setNodeTextMorphs = useCallback((nodeId, nextMorphs) => {
    updateNode(nodeId, {
      textMorphs: normalizeTextMorphList(nextMorphs),
      morphText: '',
      morphMode: 'fade',
      morphStartDelay: null,
      morphStartTime: null,
      morphDuration: null,
    });
  }, [updateNode]);

  const updateTextMorph = useCallback((nodeId, morphId, updates, pushHistory = true) => {
    const node = nodeMap[nodeId];
    if (!node) return;
    if (pushHistory) _pushHistory();
    const timing = effectiveTiming(node, 'node');
    const morphs = getNodeTextMorphs(node, timing).map(morph => (
      morph.id === morphId ? { ...morph, ...updates } : morph
    ));
    setNodeTextMorphs(nodeId, morphs);
  }, [_pushHistory, effectiveTiming, nodeMap, setNodeTextMorphs]);

  const addTextMorph = useCallback((nodeId) => {
    const node = nodeMap[nodeId];
    if (!node) return;
    _pushHistory();
    const timing = effectiveTiming(node, 'node');
    const morphs = getNodeTextMorphs(node, timing);
    const newMorph = {
      id: uuid(),
      text: '',
      mode: 'fade',
      startTime: r2(getNextTextMorphStart(node, timing)),
      duration: r2(Math.max(0.4, timing.duration)),
    };
    setNodeTextMorphs(nodeId, [...morphs, newMorph]);
    setSelected(nodeId);
    setSelectedItem({ kind: 'text-morph', id: nodeId, morphId: newMorph.id });
    setPendingMorphEdit(nodeId, newMorph.id);
  }, [_pushHistory, effectiveTiming, nodeMap, setNodeTextMorphs, setSelected, setPendingMorphEdit]);

  const startTransformBlockDrag = useCallback((e, item, dragType) => {
    e.preventDefault();
    e.stopPropagation();
    document.body.style.userSelect = 'none';
    _pushHistory();
    const tAutoStart = autoTimes.nodes[item.id]?.transformStart ?? null;
    const tStart = item.transformStartTime ?? tAutoStart ?? 0;
    const tDur = item.transformDuration ?? 0.4;
    if (item.transformStartTime == null) {
      updateNode(item.id, { transformStartTime: r2(tStart) });
    }
    blockDragRef.current = {
      dragType,
      kind: 'node',
      itemId: item.id,
      morphId: null,
      startX: e.clientX,
      initStart: tStart,
      initDur: tDur,
      initTransformStart: tStart,
      initTransformDur: tDur,
      linkGroup: null,
      multiGroup: null,
      previewCrossing: null,
    };
  }, [_pushHistory, autoTimes.nodes, updateNode]);

  const removeTextMorph = useCallback((nodeId, morphId) => {
    const node = nodeMap[nodeId];
    if (!node) return;
    _pushHistory();
    const timing = effectiveTiming(node, 'node');
    const morphs = getNodeTextMorphs(node, timing).filter(morph => morph.id !== morphId);
    setNodeTextMorphs(nodeId, morphs);
    setSelected(nodeId);
    setSelectedItem({ kind: 'node', id: nodeId });
  }, [_pushHistory, effectiveTiming, nodeMap, setNodeTextMorphs, setSelected]);

  const selKind = selectedItem?.kind;
  const selBaseKind = (selKind === 'text-morph' || selKind === 'variable-token') ? 'node' : selKind;
  const selData = !selectedItem ? null : selBaseKind === 'node'
    ? nodes.find(n => n.id === selectedItem.id) ?? null
    : links.find(e => e.id === selectedItem.id) ?? null;
  const selTiming = selData ? effectiveTiming(selData, selBaseKind) : null;
  const selMorph = selKind === 'text-morph' && selData && selTiming
    ? getTextMorphById(selData, selectedItem.morphId, selTiming)
    : null;
  const selWeb = selKind === 'variable-token' && selData ? webByVariableId[selData.id] : null;
  const selLabel  = selKind === 'text-morph'
    ? `${selData?.label ?? '?'} morph`
    : selKind === 'variable-token'
      ? `${selData?.variableLabel || selData?.label || '?'} token`
    : selBaseKind === 'node'
      ? (selData?.label ?? '?')
    : selData ? linkLabel(selData, nodes) : null;
  const selectedBoundKey = selBaseKind === 'link' ? boundKeyByLinkId[selectedItem?.id] : null;
  const selectedBoundLinkIds = selectedBoundKey ? boundLinkIdsByKey[selectedBoundKey] ?? [] : [];
  const buildBoundDurationUpdates = useCallback((sourceLinkId, nextDuration) => {
    const key = boundKeyByLinkId[sourceLinkId];
    const normalizedDuration = nextDuration == null ? null : r2(Math.max(MIN_DUR, nextDuration));
    if (!key) {
      return {
        [sourceLinkId]: { animDuration: normalizedDuration },
      };
    }

    const [parentId, jointId] = key.split('::');
    const memberIds = boundLinkIdsByKey[key] ?? [sourceLinkId];

    if (sourceLinkId === parentId) {
      const updates = {
        [parentId]: { animDuration: normalizedDuration },
      };
      const parentLength = linkLengthById[parentId] ?? 0;
      const junctionProgress = getLinkJointProgress(parentId, jointId, links, nodes);
      const junctionTimeFraction = junctionProgress == null ? 0 : inverseEaseOut(junctionProgress);
      const remainingParentDistance = parentLength > 0 && junctionProgress != null
        ? Math.max(0, parentLength * (1 - junctionProgress))
        : 0;
      const remainingParentDuration = normalizedDuration != null
        ? Math.max(MIN_DUR, normalizedDuration * (1 - junctionTimeFraction))
        : null;
      const postJunctionSpeed = normalizedDuration != null && remainingParentDistance > 0
        ? remainingParentDistance / Math.max(remainingParentDuration, MIN_DUR)
        : null;

      for (const memberId of memberIds) {
        if (memberId === parentId) continue;
        const member = linkMap[memberId];
        updates[memberId] = {
          animDuration: postJunctionSpeed == null
            ? normalizedDuration
            : r2(Math.max(MIN_DUR, (linkLengthById[memberId] ?? 0) / postJunctionSpeed)),
          ...(member?.fromJunctionLinkId && member?.fromJunctionJointId ? { animStartTime: null } : {}),
        };
      }
      return updates;
    }

    const sourceLength = linkLengthById[sourceLinkId] ?? 0;
    if (normalizedDuration == null || sourceLength <= 0) {
      return Object.fromEntries(memberIds.map(memberId => [memberId, {
        animDuration: normalizedDuration,
        ...(linkMap[memberId]?.fromJunctionLinkId && linkMap[memberId]?.fromJunctionJointId ? { animStartTime: null } : {}),
      }]));
    }
    const durationPerUnit = normalizedDuration / sourceLength;
    return Object.fromEntries(memberIds.map(memberId => {
      const memberLength = linkLengthById[memberId] ?? 0;
      return [memberId, {
        animDuration: memberLength > 0
          ? r2(Math.max(MIN_DUR, memberLength * durationPerUnit))
          : normalizedDuration,
        ...(linkMap[memberId]?.fromJunctionLinkId && linkMap[memberId]?.fromJunctionJointId ? { animStartTime: null } : {}),
      }];
    }));
  }, [boundKeyByLinkId, boundLinkIdsByKey, effectiveTiming, linkLengthById, linkMap, links, nodes]);
  const updateLinkStartGroup = useCallback((linkId, nextStart) => {
    const key = syncedJunctionKeyByLinkId[linkId];
    if (!key) {
      updateLink(linkId, {
        animStartTime: nextStart == null ? null : r2(Math.max(0, nextStart)),
      });
      return;
    }
    for (const siblingId of syncedLinkIdsByKey[key] ?? [linkId]) {
      updateLink(siblingId, {
        animStartTime: nextStart == null ? null : r2(Math.max(0, nextStart)),
      });
    }
  }, [syncedJunctionKeyByLinkId, syncedLinkIdsByKey, updateLink]);
  const updateLinkDurationGroup = useCallback((linkId, nextDuration) => {
    const updatesById = buildBoundDurationUpdates(linkId, nextDuration);
    for (const [memberId, updates] of Object.entries(updatesById)) {
      updateLink(memberId, updates);
    }
  }, [buildBoundDurationUpdates, updateLink]);
  const freezeIndependentTimelineItems = useCallback((excludeKind = null, excludeId = null) => {
    for (const node of nodes) {
      if (node.triggerAfterLinkId) continue;
      if (excludeKind === 'node' && excludeId === node.id) continue;
      const timing = effectiveTiming(node, 'node');
      const updates = {};
      if (node.animStartTime == null) updates.animStartTime = timing.start;
      if (node.animDuration == null) updates.animDuration = timing.duration;
      if (Object.keys(updates).length) updateNode(node.id, updates);
    }

    for (const link of links) {
      if (link.fromJunctionLinkId || syncedJunctionKeyByLinkId[link.id] || boundKeyByLinkId[link.id]) continue;
      if (excludeKind === 'link' && excludeId === link.id) continue;
      const timing = effectiveTiming(link, 'link');
      const updates = {};
      if (link.animStartTime == null) updates.animStartTime = timing.start;
      if (link.animDuration == null) updates.animDuration = timing.duration;
      if (Object.keys(updates).length) updateLink(link.id, updates);
    }
  }, [boundKeyByLinkId, effectiveTiming, links, nodes, syncedJunctionKeyByLinkId, updateLink, updateNode]);
  const doUpdate  = (updates) => selKind === 'node'
    ? (
        (() => {
          _pushHistory();
          if (Object.prototype.hasOwnProperty.call(updates, 'animStartTime') || Object.prototype.hasOwnProperty.call(updates, 'animDuration')) {
            freezeIndependentTimelineItems('node', selectedItem.id);
          }
          updateNode(selectedItem.id, updates);
        })()
      )
    : (
        (() => {
          _pushHistory();
          if (Object.prototype.hasOwnProperty.call(updates, 'animStartTime') || Object.prototype.hasOwnProperty.call(updates, 'animDuration')) {
            freezeIndependentTimelineItems('link', selectedItem.id);
          }
          const rest = { ...updates };
          if (Object.prototype.hasOwnProperty.call(updates, 'animStartTime')) {
            updateLinkStartGroup(selectedItem.id, updates.animStartTime);
            delete rest.animStartTime;
          }
          if (Object.prototype.hasOwnProperty.call(updates, 'animDuration')) {
            updateLinkDurationGroup(selectedItem.id, updates.animDuration);
            delete rest.animDuration;
          }
          if (Object.keys(rest).length) {
            updateLink(selectedItem.id, rest);
            return;
          }
          if (Object.prototype.hasOwnProperty.call(updates, 'animStartTime') || Object.prototype.hasOwnProperty.call(updates, 'animDuration')) return;
          updateLink(selectedItem.id, updates);
        })()
      );

  useEffect(() => {
    if (!selectedItem) return;
    if (selectedItem.kind === 'link') {
      if (!links.find(link => link.id === selectedItem.id)) setSelectedItem(null);
      return;
    }
    const node = nodes.find(item => item.id === selectedItem.id);
    if (!node) {
      setSelectedItem(null);
      return;
    }
    if (selectedItem.kind === 'text-morph') {
      const timing = effectiveTiming(node, 'node');
      if (!getTextMorphById(node, selectedItem.morphId, timing)) {
        setSelectedItem({ kind: 'node', id: selectedItem.id });
      }
    }
    if (selectedItem.kind === 'variable-token' && node.type !== 'variable') {
      setSelectedItem({ kind: 'node', id: selectedItem.id });
    }
  }, [effectiveTiming, links, nodes, selectedItem]);

  useEffect(() => {
    if (!selectedItem && timelineNodes.length > 0) setSelectedItem({ kind: 'node', id: timelineNodes[0].id });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timelineNodes.length]);

  useEffect(() => {
    if (!selectedId) return;
    const isNode = !!nodes.find(n => n.id === selectedId);
    const isLink = !isNode && !!links.find(l => l.id === selectedId);
    if (!isNode && !isLink) return;
    if (isNode && isMirrorNode(nodes.find(node => node.id === selectedId))) {
      setSelectedItem(null);
      return;
    }
    if (selectedItem?.id === selectedId) {
      if ((selectedItem.kind === 'text-morph' || selectedItem.kind === 'node') && isNode) return;
      if (selectedItem.kind === 'link' && isLink) return;
    }
    const kind = isNode ? 'node' : 'link';
    setSelectedItem({ kind, id: selectedId });

    requestAnimationFrame(() => {
      const el = leftBodyRef.current;
      if (!el) return;
      const row = el.querySelector(`[data-row-id="${kind}-${selectedId}"]`);
      if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }, [links, nodes, selectedId, selectedItem]); // eslint-disable-line react-hooks/exhaustive-deps

  const seekFromClientX = useCallback((clientX) => {
    const el = timelineRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const relX = clientX - rect.left + el.scrollLeft;
    const t = Math.max(0, relX / PX_PER_SEC);

    // Update the playhead DOM position immediately without a React re-render.
    // The throttled `seek` call will eventually sync React state, but the visual
    // feedback needs to be instant so the scrubber doesn't feel laggy.
    if (playheadRef.current) {
      const cDur = Math.max(contentDuration ?? totalDuration, 4);
      const tW = cDur * PX_PER_SEC + 40;
      const px = Math.min(t * PX_PER_SEC, tW - 2);
      playheadRef.current.style.left = px + 'px';
      const label = playheadRef.current.querySelector('[data-time-label]');
      if (label) label.textContent = t.toFixed(2) + 's';
    }

    seek(t);
  }, [seek, contentDuration, totalDuration]);

  useEffect(() => {
    // ── Edge auto-scroll ──────────────────────────────────────────────────────
    // Runs as a RAF loop so scrolling continues even when the cursor is held still.
    const cursorXRef = { current: 0 };
    let autoScrollRAF = null;

    const runAutoScroll = () => {
      if (!blockDragRef.current) { autoScrollRAF = null; return; }
      const tl = timelineRef.current;
      if (!tl) { autoScrollRAF = null; return; }
      const rect = tl.getBoundingClientRect();
      const cx = cursorXRef.current;
      const ZONE = 72;        // px from edge where scroll kicks in
      const MAX_SPEED = 14;   // px per frame at full intensity
      let delta = 0;
      if (cx > rect.right - ZONE)  delta =  MAX_SPEED * Math.min(1, (cx - (rect.right - ZONE))  / ZONE);
      if (cx < rect.left  + ZONE)  delta = -MAX_SPEED * Math.min(1, ((rect.left + ZONE) - cx)   / ZONE);
      if (Math.abs(delta) > 0.3) tl.scrollLeft += delta;
      autoScrollRAF = requestAnimationFrame(runAutoScroll);
    };
    // ─────────────────────────────────────────────────────────────────────────

    const onMove = (e) => {
      const d = blockDragRef.current;
      if (!d) return;
      cursorXRef.current = e.clientX;
      if (!autoScrollRAF) autoScrollRAF = requestAnimationFrame(runAutoScroll);
      const dtSec  = (e.clientX - d.startX) / PX_PER_SEC;
      if (d.dragType === 'transform-move' || d.dragType === 'transform-resize') {
        const nextStart = d.dragType === 'transform-move'
          ? r2(Math.max(0, d.initTransformStart + dtSec))
          : d.initTransformStart;
        const nextDuration = d.dragType === 'transform-resize'
          ? r2(Math.max(0.1, d.initTransformDur + dtSec))
          : d.initTransformDur;
        updateNode(d.itemId, { transformStartTime: nextStart, transformDuration: nextDuration });
        return;
      }
      if ((d.dragType === 'morph-move' || d.dragType === 'morph-resize') && d.morphId) {
        const node = nodeMap[d.itemId];
        if (!node) return;
        const timing = effectiveTiming(node, 'node');
        const morphs = getNodeTextMorphs(node, timing).map(morph => {
          if (morph.id !== d.morphId) return morph;
          return d.dragType === 'morph-move'
            ? { ...morph, startTime: r2(Math.max(0, d.initMorphStart + dtSec)), duration: d.initMorphDur }
            : { ...morph, startTime: d.initMorphStart, duration: r2(Math.max(0.1, d.initMorphDur + dtSec)) };
        });
        setNodeTextMorphs(d.itemId, morphs);
        return;
      }
      if (d.multiGroup?.length) {
        const groupMinStart = Math.min(...d.multiGroup.map(groupItem => groupItem.initStart));
        const groupMaxEnd = Math.max(...d.multiGroup.map(groupItem => groupItem.initStart + groupItem.initDur));
        const clampedGroupStart = clampMoveStartAgainstPreviewRanges(
          groupMinStart + dtSec,
          groupMaxEnd - groupMinStart,
          d.multiGroup.map(groupItem => groupItem.id),
          dtSec,
          d
        );
        const groupDtSec = clampedGroupStart - groupMinStart;
        for (const groupItem of d.multiGroup) {
          if (groupItem.kind === 'node') {
            updateNode(groupItem.id, {
              animStartTime: r2(Math.max(0, groupItem.initStart + groupDtSec)),
              animDuration: groupItem.initDur,
            });
            continue;
          }
          updateLink(groupItem.id, {
            animStartTime: r2(Math.max(0, groupItem.initStart + groupDtSec)),
            animDuration: groupItem.initDur,
          });
        }
        return;
      }
      if (d.kind === 'node') {
        const clampedStart = d.dragType === 'move'
          ? clampMoveStartAgainstPreviewRanges(
              d.initStart + dtSec,
              d.initDur,
              [d.itemId],
              dtSec,
              d
            )
          : d.initStart;
        const update = d.dragType === 'move'
          ? { animStartTime: r2(clampedStart), animDuration: d.initDur }
          : { animDuration: clampResizeDurationAgainstPreviewRanges(d.initStart, d.initDur + dtSec, [d.itemId]) };
        updateNode(d.itemId, update);
        return;
      }

      if (d.linkGroup?.length) {
        const groupMinStart = Math.min(...d.linkGroup.map(groupItem => groupItem.initStart));
        const groupMaxEnd = Math.max(...d.linkGroup.map(groupItem => groupItem.initStart + groupItem.initDur));
        const clampedGroupStart = clampMoveStartAgainstPreviewRanges(
          groupMinStart + dtSec,
          groupMaxEnd - groupMinStart,
          d.linkGroup.map(groupItem => groupItem.id),
          dtSec,
          d
        );
        const groupDtSec = clampedGroupStart - groupMinStart;
        const resizedDuration = clampResizeDurationAgainstPreviewRanges(d.initStart, d.initDur + dtSec, d.linkGroup.map(groupItem => groupItem.id));
        if (d.dragType === 'resize') {
          const updatesById = buildBoundDurationUpdates(d.itemId, resizedDuration);
          for (const [memberId, updates] of Object.entries(updatesById)) {
            updateLink(memberId, updates);
          }
          return;
        }
        for (const groupItem of d.linkGroup) {
          updateLink(groupItem.id, {
            animStartTime: r2(Math.max(0, groupItem.initStart + groupDtSec)),
            animDuration: groupItem.initDur,
          });
        }
        return;
      }

      const clampedStart = d.dragType === 'move'
        ? clampMoveStartAgainstPreviewRanges(
            d.initStart + dtSec,
            d.initDur,
            [d.itemId],
            dtSec,
            d
          )
        : d.initStart;
      const update = d.dragType === 'move'
        ? { animStartTime: r2(clampedStart), animDuration: d.initDur }
        : { animDuration: clampResizeDurationAgainstPreviewRanges(d.initStart, d.initDur + dtSec, [d.itemId]) };
      updateLink(d.itemId, update);
    };
    const onUp = () => {
      blockDragRef.current = null;
      if (autoScrollRAF) { cancelAnimationFrame(autoScrollRAF); autoScrollRAF = null; }
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      if (autoScrollRAF) cancelAnimationFrame(autoScrollRAF);
    };
  }, [buildBoundDurationUpdates, clampMoveStartAgainstPreviewRanges, clampResizeDurationAgainstPreviewRanges, effectiveTiming, nodeMap, setNodeTextMorphs, updateNode, updateLink]);

  useEffect(() => {
    const onMove = (e) => { if (headDragRef.current) seekFromClientX(e.clientX); };
    const onUp   = ()  => {
      headDragRef.current = false;
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    };
  }, [seekFromClientX]);

  useEffect(() => {
    const clampHeight = () => {
      const maxHeight = Math.floor(window.innerHeight * 0.76);
      setPanelHeight(h => Math.max(PANEL_MIN_H, Math.min(h, maxHeight)));
    };

    clampHeight();
    window.addEventListener('resize', clampHeight);
    return () => window.removeEventListener('resize', clampHeight);
  }, []);

  const syncScroll = useCallback((source, target) => {
    if (!target || syncingScrollRef.current) return;
    syncingScrollRef.current = true;
    target.scrollTop = source.scrollTop;
    requestAnimationFrame(() => { syncingScrollRef.current = false; });
  }, []);

  const handleLeftScroll = useCallback((e) => {
    syncScroll(e.currentTarget, rightBodyRef.current);
  }, [syncScroll]);

  const handleRightScroll = useCallback((e) => {
    syncScroll(e.currentTarget, leftBodyRef.current);
  }, [syncScroll]);

  const handleTimelineSelect = useCallback((e, kind, id, options = {}) => {
    e.stopPropagation();
    const nextItem = options.morphId
      ? { kind: 'text-morph', id, morphId: options.morphId }
      : { kind, id };
    setSelectedItem(nextItem);
    if (e.shiftKey) {
      const anchorKind = selectedItem?.kind === 'text-morph'
        ? 'node'
        : selectedItem?.kind ?? kind;
      const anchorId = selectedItem?.id ?? selectedId ?? id;
      const startIndex = selectionIndexByKey[`${anchorKind}:${anchorId}`];
      const endIndex = selectionIndexByKey[`${kind}:${id}`];
      if (startIndex == null || endIndex == null) {
        setSelection(id, [id]);
        return;
      }
      const [fromIndex, toIndex] = startIndex <= endIndex
        ? [startIndex, endIndex]
        : [endIndex, startIndex];
      const rangeIds = selectionOrder.slice(fromIndex, toIndex + 1).map(item => item.id);
      setSelection(id, rangeIds);
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      addToSelection(id);
      return;
    }
    setSelected(id);
  }, [addToSelection, selectedId, selectedItem, selectionIndexByKey, selectionOrder, setSelected, setSelection]);

  const startBlockDrag = useCallback((e, item, kind, dragType, options = {}) => {
    e.preventDefault();
    e.stopPropagation();
    document.body.style.userSelect = 'none';
    _pushHistory();
    setSelectedItem(options.morphId
      ? { kind: 'text-morph', id: item.id, morphId: options.morphId }
      : { kind, id: item.id });
    freezeIndependentTimelineItems(kind, item.id);
    const { start, duration } = effectiveTiming(item, kind);
    const morphTiming = kind === 'node' && options.morphId
      ? getTextMorphById(item, options.morphId, { start, duration })
      : null;
    if (kind === 'node') {
      const nextUpdates = {};
      if ((dragType === 'move' || dragType === 'morph-move' || dragType === 'morph-resize') && item.animStartTime == null) nextUpdates.animStartTime = start;
      if (item.animDuration == null) nextUpdates.animDuration = duration;
      if (Object.keys(nextUpdates).length) updateNode(item.id, nextUpdates);
    } else {
      const nextUpdates = {};
      if (dragType === 'move' && item.animStartTime == null) nextUpdates.animStartTime = start;
      if (item.animDuration == null) nextUpdates.animDuration = duration;
      if (Object.keys(nextUpdates).length) {
        if (Object.prototype.hasOwnProperty.call(nextUpdates, 'animStartTime')) {
          updateLinkStartGroup(item.id, nextUpdates.animStartTime);
        }
        if (Object.prototype.hasOwnProperty.call(nextUpdates, 'animDuration')) {
          updateLinkDurationGroup(item.id, nextUpdates.animDuration);
        }
      }
    }
    const explicitSelectionIds = new Set(selectedIds);
    if (!explicitSelectionIds.size && selectedId) explicitSelectionIds.add(selectedId);
    const hasExplicitGroup = dragType === 'move' && explicitSelectionIds.has(item.id) && explicitSelectionIds.size > 1;

    let multiGroup = null;
    if (hasExplicitGroup) {
      multiGroup = [...explicitSelectionIds]
        .map(selectedItemId => {
          const selectedNode = nodes.find(node => node.id === selectedItemId);
          if (selectedNode) {
            const selectedTiming = effectiveTiming(selectedNode, 'node');
            if (selectedNode.animStartTime == null) {
              updateNode(selectedNode.id, { animStartTime: selectedTiming.start, animDuration: selectedTiming.duration });
            } else if (selectedNode.animDuration == null) {
              updateNode(selectedNode.id, { animDuration: selectedTiming.duration });
            }
            return { id: selectedItemId, kind: 'node', initStart: selectedTiming.start, initDur: selectedTiming.duration };
          }

          const selectedLink = links.find(link => link.id === selectedItemId);
          if (!selectedLink) return null;
          const selectedTiming = effectiveTiming(selectedLink, 'link');
          const selectedUpdates = {};
          if (selectedLink.animStartTime == null) selectedUpdates.animStartTime = selectedTiming.start;
          if (selectedLink.animDuration == null) selectedUpdates.animDuration = selectedTiming.duration;
          if (Object.keys(selectedUpdates).length) updateLink(selectedLink.id, selectedUpdates);
          return { id: selectedItemId, kind: 'link', initStart: selectedTiming.start, initDur: selectedTiming.duration };
        })
        .filter(Boolean);
    }

    const syncKey = kind === 'link' ? syncedJunctionKeyByLinkId[item.id] : null;
    const boundKey = kind === 'link' ? boundKeyByLinkId[item.id] : null;
    const groupLinkIds = hasExplicitGroup
      ? []
      : dragType === 'move'
        ? (boundKey ? boundLinkIdsByKey[boundKey] ?? [] : syncKey ? syncedLinkIdsByKey[syncKey] ?? [] : [])
        : (boundKey ? boundLinkIdsByKey[boundKey] ?? [] : []);
    const linkGroup = groupLinkIds.length
      ? groupLinkIds.map(linkId => {
          const sibling = links.find(link => link.id === linkId);
          const siblingTiming = sibling ? effectiveTiming(sibling, 'link') : { start: 0, duration: 0.65 };
          if (sibling) {
            const siblingUpdates = {};
            if (dragType === 'move' && sibling.animStartTime == null) siblingUpdates.animStartTime = siblingTiming.start;
            if (sibling.animDuration == null) siblingUpdates.animDuration = siblingTiming.duration;
            if (Object.keys(siblingUpdates).length) updateLink(sibling.id, siblingUpdates);
          }
          return { id: linkId, initStart: siblingTiming.start, initDur: siblingTiming.duration };
        })
      : null;
    blockDragRef.current = {
      dragType,
      kind,
      itemId: item.id,
      morphId: options.morphId ?? null,
      startX: e.clientX,
      initStart: start,
      initDur: duration,
      initMorphStart: morphTiming?.startTime ?? null,
      initMorphDur: morphTiming?.duration ?? null,
      linkGroup,
      multiGroup,
      previewCrossing: null,
    };
  }, [_pushHistory, boundKeyByLinkId, boundLinkIdsByKey, effectiveTiming, freezeIndependentTimelineItems, links, nodes, selectedId, selectedIds, syncedJunctionKeyByLinkId, syncedLinkIdsByKey, updateLinkStartGroup, updateLinkDurationGroup, updateNode, updateLink]);

  const handleTimelineMouseDown = useCallback((e) => {
    e.preventDefault();
    document.body.style.userSelect = 'none';
    headDragRef.current = true;
    seekFromClientX(e.clientX);
  }, [seekFromClientX]);

  const handleResizeMouseDown = useCallback((e) => {
    if (collapsed) return;
    e.preventDefault();
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ns-resize';

    const startY = e.clientY;
    const startHeight = panelHeight;

    const onMove = (moveEvent) => {
      const maxHeight = Math.floor(window.innerHeight * 0.76);
      const next = Math.max(PANEL_MIN_H, Math.min(startHeight - (moveEvent.clientY - startY), maxHeight));
      if (panelRef.current) {
        panelRef.current.style.height = `${next}px`;
        panelRef.current.style.minHeight = `${next}px`;
      }
      resizeRef.current = next;
    };

    const onUp = () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      if (resizeRef.current != null) setPanelHeight(resizeRef.current);
      resizeRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [collapsed, panelHeight]);

  const totalDur    = Math.max(totalDuration, 4);
  const contentDur  = Math.max(contentDuration ?? totalDuration, 4);
  // Extra 160 px of "breathing room" past the last block so dragging near the edge feels open.
  const timelineW   = contentDur * PX_PER_SEC + 160;

  // Keep the row lists aligned.
  const rows = [
    ...(timelineNodes.length > 0 ? [{ type: 'section', label: 'NODES', color: NODE_HUE.solid }] : []),
    ...timelineNodes.flatMap(n => {
      const timing = effectiveTiming(n, 'node');
      const morphs = getNodeTextMorphs(n, timing);
      const web = n.type === 'variable' ? webByVariableId[n.id] : null;
      const tokenRow = web && web.tokenPath.length > 0
        ? [{ type: 'token', item: n, web }]
        : [];
      return [
        { type: 'node', item: n },
        ...morphs.map(morph => ({ type: 'morph', item: n, morph })),
        ...tokenRow,
      ];
    }),
    ...(links.length > 0 ? [{ type: 'section', label: 'LINKS', color: LINK_HUE.solid }] : []),
    ...links.map(e => ({ type: 'link', item: e })),
  ];

  const isEmpty = timelineNodes.length === 0 && links.length === 0;

  return (
    <div ref={panelRef} style={{
      height: collapsed ? 34 : panelHeight,
      minHeight: collapsed ? 34 : panelHeight,
      background: 'linear-gradient(180deg, var(--panel-bg), var(--panel-bg-2))',
      borderTop: '1px solid var(--border-strong)',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
      overflow: 'hidden', userSelect: 'none',
      position: 'relative',
    }}>
      {!collapsed && (
        <div
          onMouseDown={handleResizeMouseDown}
          style={{
            height: 8,
            flexShrink: 0,
            cursor: 'ns-resize',
            background: `linear-gradient(180deg, ${pageColors.timelineHeaderGlow}, ${pageColors.transparent})`,
            borderBottom: `1px solid ${pageColors.timelineHeaderBorder}`,
          }}
        />
      )}

      <div style={{
        height: 34, flexShrink: 0,
        display: 'flex', alignItems: 'center',
        padding: '0 12px', gap: 9,
        borderBottom: collapsed ? 'none' : '1px solid var(--border-strong)',
      }}>
        <span style={{ color: 'var(--purple-bright)', fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
          Timeline
        </span>

        <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>
          {nodes.length}n · {links.length}l
        </span>

        <VSep />

        <PlayBtn active={isPlaying} onClick={() => isPlaying ? pause() : play()} />
        <StopBtn onClick={stop} />

        <span style={{ color: 'var(--text-dim)', fontSize: 12, fontFamily: 'monospace', minWidth: 90 }}>
          <span style={{ color: isPlaying ? 'var(--blue-bright)' : 'var(--text-muted)' }}>{fmtTime(currentTime)}</span>
          <span style={{ color: 'var(--text-faint)' }}> / </span>
          <span style={{ color: 'var(--text-dim)' }}>{fmtTime(totalDur)}</span>
        </span>

        <VSep />

        {!collapsed && selData && selTiming && (
          <>
            <span style={{ color: selKind === 'node' ? pageColors.purpleAccent : pageColors.blueLink, fontSize: 12, whiteSpace: 'nowrap', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {selLabel}
            </span>
            <VSep />

            {selBaseKind === 'node' && selKind !== 'text-morph' && selKind !== 'variable-token' && (() => {
              const isTrigger = !!(selData?.triggerAfterLinkId);
              const isTextNode = selData?.type === 'text';
              return (
                <>
                  <FieldLabel>Triggered by</FieldLabel>
                  <select
                    value={selData?.triggerAfterLinkId ?? ''}
                    onChange={e => {
                      const val = e.target.value || null;
                      doUpdate({ triggerAfterLinkId: val, animStartTime: null });
                    }}
                    onMouseDown={e => e.stopPropagation()}
                    style={{
                      background: 'var(--panel-bg)', border: '1px solid var(--border-strong)',
                      borderRadius: 4, color: isTrigger ? pageColors.blueLink : 'var(--text-dim)',
                      padding: '3px 6px', fontSize: 11, cursor: 'pointer',
                      minWidth: 325, fontWeight: isTrigger ? 600 : 400,
                    }}
                  >
                    <option value="">None</option>
                    {links.map(link => (
                      <option key={link.id} value={link.id}>{linkLabel(link, nodes)}</option>
                    ))}
                  </select>
                  <VSep />
                  {!isTrigger && (
                    <>
                      <FieldLabel>Start</FieldLabel>
                      <NumberField value={selTiming.start} step={0.05} min={0} onChange={v => doUpdate({ animStartTime: r2(Math.max(0, v)), animDuration: selTiming.duration })} />
                      <FieldLabel>s</FieldLabel>
                      <div style={{ width: 6 }} />
                    </>
                  )}
                  <>
                    <FieldLabel>Morphs</FieldLabel>
                    <span style={{ color: 'var(--text-dim)', fontSize: 11, minWidth: 22 }}>
                      {getNodeTextMorphs(selData, selTiming).length}
                    </span>
                    <button
                      onClick={() => addTextMorph(selData.id)}
                      style={{ background: 'none', border: '1px solid var(--border-strong)', borderRadius: 4, color: 'var(--text-main)', fontSize: 10, padding: '2px 8px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      add morph
                    </button>
                    <div style={{ width: 6 }} />
                  </>
                </>
              );
            })()}

            {selKind === 'text-morph' && selMorph && (
              <>
                <FieldLabel>Morph to</FieldLabel>
                <InlineTextField value={selMorph.text} onChange={v => updateTextMorph(selData.id, selMorph.id, { text: v })} width={120} />
                <FieldLabel>Mode</FieldLabel>
                <select
                  value={selMorph.mode}
                  onChange={e => updateTextMorph(selData.id, selMorph.id, { mode: e.target.value })}
                  onMouseDown={e => e.stopPropagation()}
                  style={{
                    background: 'var(--panel-bg)', border: '1px solid var(--border-strong)',
                    borderRadius: 4, color: 'var(--text-main)',
                    padding: '3px 6px', fontSize: 11, cursor: 'pointer',
                  }}
                >
                  <option value="fade">Fade</option>
                  <option value="write">Write</option>
                </select>
                <FieldLabel>Start</FieldLabel>
                <NumberField value={selMorph.startTime} step={0.05} min={0} onChange={v => updateTextMorph(selData.id, selMorph.id, { startTime: r2(Math.max(0, v)) })} />
                <FieldLabel>s</FieldLabel>
                <div style={{ width: 6 }} />
                <FieldLabel>Dur</FieldLabel>
                <NumberField value={selMorph.duration} step={0.05} min={0.1} onChange={v => updateTextMorph(selData.id, selMorph.id, { duration: r2(Math.max(0.1, v)) })} />
                <FieldLabel>s</FieldLabel>
                <VSep />
                <FieldLabel>Fill</FieldLabel>
                <input
                  type="color"
                  value={selMorph.fill ?? selData.fill ?? '#ffffff'}
                  onChange={e => updateTextMorph(selData.id, selMorph.id, { fill: e.target.value })}
                  onMouseDown={e => e.stopPropagation()}
                  style={{ width: 28, height: 20, padding: 0, border: '1px solid var(--border-strong)', borderRadius: 4, background: 'transparent', cursor: 'pointer' }}
                />
                <div style={{ width: 6 }} />
                <FieldLabel>Radius</FieldLabel>
                <NumberField
                  value={selMorph.cornerRadius ?? selData.cornerRadius ?? 8}
                  step={1}
                  min={0}
                  onChange={v => updateTextMorph(selData.id, selMorph.id, { cornerRadius: Math.max(0, Math.round(v)) })}
                />
                <button
                  onClick={() => removeTextMorph(selData.id, selMorph.id)}
                  style={{ background: 'none', border: '1px solid var(--border-strong)', borderRadius: 4, color: 'var(--danger-bright)', fontSize: 10, padding: '2px 8px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  remove
                </button>
              </>
            )}

            {selBaseKind === 'link' && (
              <>
                <FieldLabel>Start</FieldLabel>
                <NumberField value={selTiming.start} step={0.05} min={0} onChange={v => doUpdate({ animStartTime: r2(Math.max(0, v)), animDuration: selTiming.duration })} />
                <FieldLabel>s</FieldLabel>
                <div style={{ width: 6 }} />
                {selectedBoundKey && (
                  <>
                    <FieldLabel>Bound</FieldLabel>
                    <span style={{ color: pageColors.blueLink, fontSize: 11, fontWeight: 600, minWidth: 30 }}>
                      ×{selectedBoundLinkIds.length}
                    </span>
                    <div style={{ width: 6 }} />
                  </>
                )}
              </>
            )}

            {selKind !== 'text-morph' && selKind !== 'variable-token' && (
              <>
                <FieldLabel>Duration</FieldLabel>
                <NumberField value={selTiming.duration} step={0.05} min={MIN_DUR} onChange={v => doUpdate({ animDuration: r2(Math.max(MIN_DUR, v)) })} />
                <FieldLabel>s</FieldLabel>

                <VSep />
                <FieldLabel>Speed</FieldLabel>
                <span style={{ color: speedColor(selTiming.duration), fontSize: 11, fontWeight: 600, minWidth: 55 }}>
                  {speedLabel(selTiming.duration)}
                </span>

                {!selTiming.isAuto && !selData?.triggerAfterLinkId && (
                  <button
                    onClick={() => doUpdate({ animStartTime: null, animDuration: null })}
                    style={{ background: 'none', border: '1px solid var(--border-strong)', borderRadius: 4, color: 'var(--text-dim)', fontSize: 10, padding: '2px 8px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    reset auto
                  </button>
                )}
              </>
            )}

            {selKind === 'variable-token' && selData && selWeb && !selectedItem?.hopLinkId && (
              <>
                <FieldLabel>Default hop</FieldLabel>
                <NumberField
                  value={selWeb.hopDuration}
                  step={0.05}
                  min={0.05}
                  onChange={v => updateNode(selData.id, { tokenHopDuration: r2(Math.max(0.05, v)) })}
                />
                <FieldLabel>s</FieldLabel>
                <div style={{ width: 6 }} />
                <FieldLabel>Start +</FieldLabel>
                <NumberField
                  value={selWeb.startOffset}
                  step={0.05}
                  min={0}
                  onChange={v => updateNode(selData.id, { tokenStartOffset: r2(Math.max(0, v)) })}
                />
                <FieldLabel>s</FieldLabel>
                <div style={{ width: 6 }} />
                <FieldLabel>Hops</FieldLabel>
                <span style={{ color: TOKEN_HUE.bright, fontSize: 11, fontWeight: 600, minWidth: 20 }}>
                  {selWeb.tokenPath.length}
                </span>
                <VSep />
                <FieldLabel>Total</FieldLabel>
                <span style={{ color: 'var(--text-dim)', fontSize: 11, minWidth: 50 }}>
                  {(selWeb.chainEnd - selWeb.chainOrigin).toFixed(2)}s
                </span>
              </>
            )}

            {selKind === 'variable-token' && selData && selWeb && selectedItem?.hopLinkId && (() => {
              const hopLinkId = selectedItem.hopLinkId;
              const hopIndex = selWeb.tokenPath.indexOf(hopLinkId);
              const timing = selWeb.tokenTiming[hopLinkId];
              const link = links.find(l => l.id === hopLinkId);
              const fromNode = link ? nodes.find(n => n.id === link.fromId) : null;
              const toNode = link ? nodes.find(n => n.id === link.toId) : null;
              if (!timing || hopIndex < 0) return null;
              return (
                <>
                  <FieldLabel>Hop {hopIndex + 1}</FieldLabel>
                  <span style={{ color: TOKEN_HUE.bright, fontSize: 11, fontWeight: 600, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {trunc(fromNode?.label, 12)} → {trunc(toNode?.label, 12)}
                  </span>
                  <VSep />
                  {!timing.skipped && (
                    <>
                      <FieldLabel>Dur</FieldLabel>
                      <NumberField
                        value={timing.duration}
                        step={0.05}
                        min={0.05}
                        onChange={v => {
                          const link = links.find(l => l.id === hopLinkId);
                          if (!link) return;
                          const cur = { ...(link.tokenHopOverrides ?? {}) };
                          const base = { ...(cur[selData.id] ?? {}) };
                          base.duration = r2(Math.max(0.05, v));
                          cur[selData.id] = base;
                          updateLink(hopLinkId, { tokenHopOverrides: cur });
                        }}
                      />
                      <FieldLabel>s</FieldLabel>
                      <div style={{ width: 6 }} />
                      <FieldLabel>Delay</FieldLabel>
                      <NumberField
                        value={timing.delay ?? 0}
                        step={0.05}
                        min={-10}
                        onChange={v => {
                          const link = links.find(l => l.id === hopLinkId);
                          if (!link) return;
                          const cur = { ...(link.tokenHopOverrides ?? {}) };
                          const base = { ...(cur[selData.id] ?? {}) };
                          base.delay = r2(v);
                          cur[selData.id] = base;
                          updateLink(hopLinkId, { tokenHopOverrides: cur });
                        }}
                      />
                      <FieldLabel>s</FieldLabel>
                      <div style={{ width: 6 }} />
                      <FieldLabel>Speed</FieldLabel>
                      <span style={{ color: speedColor(timing.duration), fontSize: 11, fontWeight: 600, minWidth: 55 }}>
                        {speedLabel(timing.duration)}
                      </span>
                      {timing.hasOverride && (
                        <button
                          onClick={() => {
                            const link = links.find(l => l.id === hopLinkId);
                            if (!link) return;
                            const cur = { ...(link.tokenHopOverrides ?? {}) };
                            const base = { ...(cur[selData.id] ?? {}) };
                            delete base.duration;
                            if (Object.keys(base).length) cur[selData.id] = base; else delete cur[selData.id];
                            updateLink(hopLinkId, { tokenHopOverrides: cur });
                          }}
                          style={{ background: 'none', border: '1px solid var(--border-strong)', borderRadius: 4, color: 'var(--text-dim)', fontSize: 10, padding: '2px 8px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >
                          reset dur
                        </button>
                      )}
                      {timing.hasDelay && (
                        <button
                          onClick={() => {
                            const link = links.find(l => l.id === hopLinkId);
                            if (!link) return;
                            const cur = { ...(link.tokenHopOverrides ?? {}) };
                            const base = { ...(cur[selData.id] ?? {}) };
                            delete base.delay;
                            if (Object.keys(base).length) cur[selData.id] = base; else delete cur[selData.id];
                            updateLink(hopLinkId, { tokenHopOverrides: cur });
                          }}
                          style={{ background: 'none', border: '1px solid var(--border-strong)', borderRadius: 4, color: 'var(--text-dim)', fontSize: 10, padding: '2px 8px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >
                          reset delay
                        </button>
                      )}
                    </>
                  )}
                  {timing.skipped && (
                    <span style={{ color: 'var(--text-dim)', fontSize: 11, fontStyle: 'italic' }}>
                      Removed — token skips this link
                    </span>
                  )}
                  <button
                    onClick={() => {
                      const link = links.find(l => l.id === hopLinkId);
                      if (!link) return;
                      const cur = { ...(link.tokenHopOverrides ?? {}) };
                      const base = { ...(cur[selData.id] ?? {}) };
                      base.skip = !timing.skipped;
                      cur[selData.id] = base;
                      updateLink(hopLinkId, { tokenHopOverrides: cur });
                    }}
                    style={{
                      background: timing.skipped ? 'var(--panel-bg)' : 'var(--danger-surface-soft)',
                      border: `1px solid ${timing.skipped ? 'var(--border-strong)' : 'var(--danger-border-soft)'}`,
                      borderRadius: 4,
                      color: timing.skipped ? 'var(--text-main)' : 'var(--danger-bright)',
                      fontSize: 10,
                      padding: '2px 8px',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {timing.skipped ? 'restore hop' : 'remove hop'}
                  </button>
                </>
              );
            })()}
          </>
        )}

        {!collapsed && isEmpty && (
          <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>Add nodes to see timeline</span>
        )}

        <div style={{ flex: 1 }} />
        <button onClick={() => setCollapsed(c => !c)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 13, padding: '2px 6px' }}>
          {collapsed ? '▲' : '▼'}
        </button>
      </div>

      {!collapsed && (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
          <div style={{ width: LEFT_W, flexShrink: 0, borderRight: '1px solid var(--border-strong)', display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
            <div style={{ height: RULER_H, background: 'var(--panel-bg)', borderBottom: '1px solid var(--border-strong)', flexShrink: 0 }} />
            <div
              ref={leftBodyRef}
              onScroll={handleLeftScroll}
              style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}
            >
              {rows.map((row, i) => {
                if (row.type === 'section') {
                  return <SectionRow key={`sec-${i}`} label={row.label} color={row.color} />;
                }
                if (row.type === 'morph') {
                  const { item: morphNode, morph } = row;
                  const isMorphSel = selectedItem?.kind === 'text-morph' && selectedItem?.id === morphNode.id && selectedItem?.morphId === morph.id;
                  return (
                    <div
                      key={`morph-${morphNode.id}-${morph.id}`}
                      onClick={(e) => handleTimelineSelect(e, 'node', morphNode.id, { morphId: morph.id })}
                      style={{
                        height: ROW_H, display: 'flex', alignItems: 'center',
                        padding: '0 10px 0 22px', gap: 7, cursor: 'pointer',
                        borderBottom: `1px solid ${pageColors.timelineRowDivider}`,
                        borderLeft: `2px solid ${isMorphSel ? MORPH_HUE.solid : pageColors.transparent}`,
                        background: isMorphSel ? withAlpha(MORPH_HUE.solid, 0.06) : pageColors.transparent,
                        flexShrink: 0,
                      }}
                    >
                      <div style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0, background: MORPH_HUE.solid, opacity: 0.55 }} />
                      <span style={{ color: isMorphSel ? MORPH_HUE.bright : pageColors.timelineTextMuted, fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {morph.text || '(blank)'}
                      </span>
                      <span style={{ color: pageColors.rulerMinorTick, fontSize: 9, letterSpacing: '0.05em', flexShrink: 0 }}>MORPH</span>
                    </div>
                  );
                }
                if (row.type === 'token') {
                  const { item: varNode, web } = row;
                  const isTokenSel = selectedItem?.kind === 'variable-token' && selectedItem?.id === varNode.id;
                  return (
                    <div
                      key={`token-${varNode.id}`}
                      onClick={(e) => { e.stopPropagation(); setSelectedItem({ kind: 'variable-token', id: varNode.id }); }}
                      style={{
                        height: ROW_H, display: 'flex', alignItems: 'center',
                        padding: '0 10px 0 22px', gap: 7, cursor: 'pointer',
                        borderBottom: `1px solid ${pageColors.timelineRowDivider}`,
                        borderLeft: `2px solid ${isTokenSel ? TOKEN_HUE.solid : pageColors.transparent}`,
                        background: isTokenSel ? withAlpha(TOKEN_HUE.solid, 0.06) : pageColors.transparent,
                        flexShrink: 0,
                      }}
                    >
                      <div style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0, background: TOKEN_HUE.solid, opacity: 0.75 }} />
                      <span style={{ color: isTokenSel ? TOKEN_HUE.bright : pageColors.timelineTextMuted, fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        token · {web.tokenPath.length} hop{web.tokenPath.length === 1 ? '' : 's'}
                      </span>
                      <span style={{ color: pageColors.rulerMinorTick, fontSize: 9, letterSpacing: '0.05em', flexShrink: 0 }}>TOKEN</span>
                    </div>
                  );
                }
                const { item, type: kind } = row;
                const { isAuto } = effectiveTiming(item, kind);
                const hue   = kind === 'node' ? NODE_HUE : LINK_HUE;
                const isSel = selectedItem?.id === item.id && (
                  selectedItem?.kind === kind ||
                  (kind === 'node' && selectedItem?.kind === 'text-morph')
                );
                const isInSelection = selectedIds.includes(item.id);
                const label = kind === 'node' ? trunc(item.label) : linkLabel(item, nodes);
                const isTriggered = kind === 'node' && !!item.triggerAfterLinkId;
                const boundKey = kind === 'link' ? boundKeyByLinkId[item.id] : null;
                const isBound = !!boundKey;
                const boundCount = isBound ? (boundLinkIdsByKey[boundKey]?.length ?? 1) : 0;
                return (
                  <div
                    key={`${kind}-${item.id}`}
                    data-row-id={`${kind}-${item.id}`}
                    onClick={(e) => handleTimelineSelect(e, kind, item.id)}
                    style={{
                      height: ROW_H, display: 'flex', alignItems: 'center',
                      padding: '0 10px', gap: 7, cursor: 'pointer',
                      borderBottom: `1px solid ${pageColors.timelineRowDivider}`,
                      borderLeft: `2px solid ${isSel ? hue.solid : isInSelection ? withAlpha(hue.solid, 0.7) : pageColors.transparent}`,
                      background: isSel ? withAlpha(hue.solid, 0.06) : isInSelection ? withAlpha(hue.solid, 0.035) : pageColors.transparent,
                      flexShrink: 0,
                    }}
                  >
                    {isTriggered
                      ? <span style={{ fontSize: 11, flexShrink: 0, opacity: 0.8 }} title="Triggered by link">⛓</span>
                      : <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: isAuto ? pageColors.rulerMinorTick : hue.solid }} />
                    }
                    <span style={{ color: isSel ? hue.bright : pageColors.timelineTextMuted, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                      {label}
                    </span>
                    {isBound && (
                      <span style={{
                        color: pageColors.blueLink,
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: '0.05em',
                        padding: '2px 5px',
                        borderRadius: 999,
                        background: withAlpha(pageColors.blueLink, 0.12),
                        border: `1px solid ${withAlpha(pageColors.blueLink, 0.28)}`,
                        flexShrink: 0,
                      }}>
                        SYNC ×{boundCount}
                      </span>
                    )}
                    {isAuto && !isTriggered && <span style={{ color: pageColors.rulerMinorTick, fontSize: 9, letterSpacing: '0.05em' }}>AUTO</span>}
                    {isTriggered && <span style={{ color: pageColors.blueLink, fontSize: 9, letterSpacing: '0.05em' }}>TRIGGER</span>}
                  </div>
                );
              })}
            </div>
          </div>

          <div
            ref={timelineRef}
            onMouseDown={handleTimelineMouseDown}
            style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', position: 'relative', cursor: 'crosshair', minWidth: 0 }}
          >
            <div style={{ minWidth: timelineW, width: '100%', display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
              <Ruler total={totalDur} contentDur={contentDur} />

              {/* Buffer-zone overlay — the 160 px of breathing room past content end */}
              <div style={{
                position: 'absolute',
                top: RULER_H,
                left: contentDur * PX_PER_SEC,
                right: 0,
                bottom: 0,
                background: withAlpha(pageColors.purpleAccent, 0.028),
                borderLeft: `1px solid ${withAlpha(pageColors.purpleAccent, 0.18)}`,
                pointerEvents: 'none',
                zIndex: 0,
              }} />

              <div
                ref={rightBodyRef}
                onScroll={handleRightScroll}
                style={{ flex: 1, overflowY: 'auto', minHeight: 0, position: 'relative', zIndex: 1 }}
              >
                {rows.map((row, i) => {
                  if (row.type === 'section') {
                    return (
                      <div key={`sec-${i}`} style={{ height: SEC_H, background: pageColors.timelineSectionBackground, borderBottom: `1px solid ${withAlpha(row.color, 0.13)}`, flexShrink: 0 }} />
                    );
                  }

                  if (row.type === 'token') {
                    const { item: varNode, web } = row;
                    const isTokenRowSel = selectedItem?.kind === 'variable-token' && selectedItem?.id === varNode.id;
                    const hopCount = web.tokenPath.length;

                    const DRAG_THRESHOLD_PX = 3;
                    const startHopMove = (e, linkId, baseDelay, varId) => {
                      if (e.shiftKey || e.ctrlKey || e.metaKey) return;
                      e.preventDefault();
                      e.stopPropagation();
                      document.body.style.userSelect = 'none';
                      setSelectedItem({ kind: 'variable-token', id: varNode.id, hopLinkId: linkId });
                      const startX = e.clientX;
                      const onMove = (me) => {
                        const deltaPx = me.clientX - startX;
                        if (Math.abs(deltaPx) < DRAG_THRESHOLD_PX) return;
                        const dx = deltaPx / PX_PER_SEC;
                        const next = r2(baseDelay + dx);
                        const link = links.find(l => l.id === linkId);
                        if (!link) return;
                        const cur = { ...(link.tokenHopOverrides ?? {}) };
                        const base = { ...(cur[varId] ?? {}) };
                        base.delay = next;
                        cur[varId] = base;
                        updateLink(linkId, { tokenHopOverrides: cur });
                      };
                      const onUp = () => {
                        document.body.style.userSelect = '';
                        document.removeEventListener('mousemove', onMove);
                        document.removeEventListener('mouseup', onUp);
                      };
                      document.addEventListener('mousemove', onMove);
                      document.addEventListener('mouseup', onUp);
                    };

                    const startHopResize = (e, linkId, baseDur, varId) => {
                      if (e.shiftKey || e.ctrlKey || e.metaKey) return;
                      e.preventDefault();
                      e.stopPropagation();
                      document.body.style.userSelect = 'none';
                      setSelectedItem({ kind: 'variable-token', id: varNode.id, hopLinkId: linkId });
                      const startX = e.clientX;
                      const onMove = (me) => {
                        const deltaPx = me.clientX - startX;
                        if (Math.abs(deltaPx) < DRAG_THRESHOLD_PX) return;
                        const dx = deltaPx / PX_PER_SEC;
                        const next = Math.max(0.05, r2(baseDur + dx));
                        const link = links.find(l => l.id === linkId);
                        if (!link) return;
                        const cur = { ...(link.tokenHopOverrides ?? {}) };
                        const base = { ...(cur[varId] ?? {}) };
                        base.duration = next;
                        cur[varId] = base;
                        updateLink(linkId, { tokenHopOverrides: cur });
                      };
                      const onUp = () => {
                        document.body.style.userSelect = '';
                        document.removeEventListener('mousemove', onMove);
                        document.removeEventListener('mouseup', onUp);
                      };
                      document.addEventListener('mousemove', onMove);
                      document.addEventListener('mouseup', onUp);
                    };

                    return (
                      <div
                        key={`token-${varNode.id}`}
                        onClick={() => setSelectedItem({ kind: 'variable-token', id: varNode.id })}
                        style={{ height: ROW_H, borderBottom: `1px solid ${pageColors.timelineRowDivider}`, position: 'relative', flexShrink: 0, background: isTokenRowSel ? withAlpha(TOKEN_HUE.solid, 0.04) : pageColors.transparent, cursor: 'crosshair' }}
                      >
                        {web.tokenPath.map((linkId, hopIndex) => {
                          const timing = web.tokenTiming[linkId];
                          if (!timing) return null;
                          const left = timing.start * PX_PER_SEC;
                          const width = timing.skipped
                            ? 14
                            : Math.max(timing.duration * PX_PER_SEC, HANDLE_W + 4);
                          const isHopSel = selectedItem?.kind === 'variable-token'
                            && selectedItem?.id === varNode.id
                            && selectedItem?.hopLinkId === linkId;
                          const link = links.find(l => l.id === linkId);
                          const fromNode = link ? nodes.find(n => n.id === link.fromId) : null;
                          const toNode = link ? nodes.find(n => n.id === link.toId) : null;
                          const delayWidth = (timing.delay ?? 0) * PX_PER_SEC;
                          const delayLeft = (timing.naturalStart ?? timing.start) * PX_PER_SEC;
                          return (
                            <React.Fragment key={`hop-frag-${linkId}`}>
                              {timing.hasDelay && delayWidth > 1 && (
                                <div
                                  title={`Hop ${hopIndex + 1} delay · +${timing.delay.toFixed(2)}s`}
                                  style={{
                                    position: 'absolute', top: ROW_H / 2 - 1,
                                    left: delayLeft, width: delayWidth, height: 2,
                                    background: `repeating-linear-gradient(90deg, ${withAlpha(TOKEN_HUE.solid, 0.55)} 0 4px, transparent 4px 8px)`,
                                    pointerEvents: 'none',
                                  }}
                                />
                              )}
                            <div
                              key={`hop-${linkId}`}
                              title={timing.skipped
                                ? `Hop ${hopIndex + 1} · ${fromNode?.label ?? '?'} → ${toNode?.label ?? '?'} · (removed, double-click to restore)`
                                : `Hop ${hopIndex + 1} · ${fromNode?.label ?? '?'} → ${toNode?.label ?? '?'} · ${timing.duration.toFixed(2)}s${timing.hasOverride ? ' (override)' : ' (default)'}${timing.hasDelay ? ` · +${timing.delay.toFixed(2)}s delay` : ''} · double-click to remove`}
                              onClick={(ev) => {
                                ev.stopPropagation();
                                setSelectedItem({ kind: 'variable-token', id: varNode.id, hopLinkId: linkId });
                              }}
                              onDoubleClick={(ev) => {
                                // Fast toggle remove/restore on double-click without extra UI
                                ev.stopPropagation();
                                const link = links.find(l => l.id === linkId);
                                if (!link) return;
                                const cur = { ...(link.tokenHopOverrides ?? {}) };
                                const base = { ...(cur[varNode.id] ?? {}) };
                                base.skip = !timing.skipped;
                                cur[varNode.id] = base;
                                updateLink(linkId, { tokenHopOverrides: cur });
                              }}
                              onMouseDown={(ev) => {
                                // Prevent outer timeline from scrubbing on hop interactions
                                ev.stopPropagation();
                                if (ev.detail >= 2) return; // don't start drag on double-click
                                if (ev.target.dataset?.role === 'hop-resize') return; // child handler will manage resize
                                if (timing.skipped) return; // allow click select without drag
                                startHopMove(ev, linkId, timing.delay ?? 0, varNode.id);
                              }}
                              style={{
                                position: 'absolute', top: 6, left, width, height: ROW_H - 12,
                                borderRadius: 4, cursor: timing.skipped ? 'pointer' : 'grab',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                                background: timing.skipped
                                  ? withAlpha(TOKEN_HUE.solid, 0.06)
                                  : isHopSel
                                    ? withAlpha(TOKEN_HUE.solid, 0.42)
                                    : isTokenRowSel
                                      ? withAlpha(TOKEN_HUE.solid, 0.26)
                                      : withAlpha(TOKEN_HUE.solid, 0.18),
                                border: timing.skipped
                                  ? `1px dashed ${withAlpha(TOKEN_HUE.solid, 0.5)}`
                                  : `1px solid ${isHopSel ? TOKEN_HUE.solid : withAlpha(TOKEN_HUE.solid, 0.55)}`,
                                boxShadow: !timing.skipped && timing.hasOverride ? `inset 0 0 0 1px ${withAlpha(pageColors.warningBright, 0.55)}` : 'none',
                                opacity: timing.skipped ? 0.65 : 1,
                              }}
                            >
                              {timing.skipped && (
                                <span style={{ color: withAlpha(TOKEN_HUE.solid, 0.8), fontSize: 11, pointerEvents: 'none' }}>×</span>
                              )}
                              {!timing.skipped && width > 38 && (
                                <span style={{
                                  color: isHopSel ? TOKEN_HUE.bright : withAlpha(TOKEN_HUE.solid, 0.85),
                                  fontSize: 10, paddingLeft: 5, whiteSpace: 'nowrap', pointerEvents: 'none',
                                  marginRight: 'auto',
                                }}>
                                  {hopIndex + 1} · {timing.duration.toFixed(2)}s
                                </span>
                              )}
                              {!timing.skipped && (
                                <div
                                  data-role="hop-resize"
                                  onMouseDown={(ev) => { ev.stopPropagation(); startHopResize(ev, linkId, timing.duration, varNode.id); }}
                                  style={{
                                    position: 'absolute', right: 0, top: 0, bottom: 0,
                                    width: HANDLE_W, cursor: 'ew-resize',
                                    background: isHopSel ? withAlpha(TOKEN_HUE.solid, 0.35) : pageColors.transparent,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  }}
                                >
                                  {isHopSel && <div style={{ width: 2, height: 10, borderRadius: 1, background: TOKEN_HUE.solid }} />}
                                </div>
                              )}
                            </div>
                            </React.Fragment>
                          );
                        })}
                      </div>
                    );
                  }

                  if (row.type === 'morph') {
                    const { item: morphNode, morph } = row;
                    const isMorphSel = selectedItem?.kind === 'text-morph' && selectedItem?.id === morphNode.id && selectedItem?.morphId === morph.id;
                    const morphLeft = morph.startTime * PX_PER_SEC;
                    const morphWidth = Math.max(morph.duration * PX_PER_SEC, HANDLE_W + 6);
                    return (
                      <div
                        key={`morph-${morphNode.id}-${morph.id}`}
                        onClick={(e) => handleTimelineSelect(e, 'node', morphNode.id, { morphId: morph.id })}
                        style={{ height: ROW_H, borderBottom: `1px solid ${pageColors.timelineRowDivider}`, position: 'relative', flexShrink: 0, background: isMorphSel ? withAlpha(MORPH_HUE.solid, 0.04) : pageColors.transparent, cursor: 'crosshair' }}
                      >
                        <div
                          onMouseDown={e => {
                            if (e.shiftKey || e.ctrlKey || e.metaKey) { handleTimelineSelect(e, 'node', morphNode.id, { morphId: morph.id }); return; }
                            startBlockDrag(e, morphNode, 'node', 'morph-move', { morphId: morph.id });
                          }}
                          style={{
                            position: 'absolute', top: 6, left: morphLeft,
                            width: morphWidth, height: ROW_H - 12,
                            borderRadius: 5, cursor: 'grab',
                            display: 'flex', alignItems: 'center', overflow: 'hidden',
                            background: isMorphSel ? withAlpha(MORPH_HUE.solid, 0.32) : withAlpha(MORPH_HUE.solid, 0.18),
                            border: `1px solid ${isMorphSel ? MORPH_HUE.solid : withAlpha(MORPH_HUE.solid, 0.5)}`,
                          }}
                        >
                          {morphWidth > 44 && (
                            <span style={{ color: isMorphSel ? MORPH_HUE.bright : withAlpha(MORPH_HUE.solid, 0.7), fontSize: 10, paddingLeft: 6, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
                              {morph.duration.toFixed(2)}s
                            </span>
                          )}
                          <div
                            onMouseDown={e => {
                              if (e.shiftKey || e.ctrlKey || e.metaKey) { handleTimelineSelect(e, 'node', morphNode.id, { morphId: morph.id }); return; }
                              e.stopPropagation();
                              startBlockDrag(e, morphNode, 'node', 'morph-resize', { morphId: morph.id });
                            }}
                            style={{
                              position: 'absolute', right: 0, top: 0, bottom: 0,
                              width: HANDLE_W, cursor: 'ew-resize',
                              background: isMorphSel ? withAlpha(MORPH_HUE.solid, 0.3) : pageColors.transparent,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            {isMorphSel && <div style={{ width: 2, height: 10, borderRadius: 1, background: MORPH_HUE.solid }} />}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  const { item, type: kind } = row;
                  const { start, duration, displayDuration, isAuto } = effectiveTiming(item, kind);
                  const hue        = kind === 'node' ? NODE_HUE : LINK_HUE;
                  const isSel      = selectedItem?.id === item.id && (
                    selectedItem?.kind === kind ||
                    (kind === 'node' && selectedItem?.kind === 'text-morph')
                  );
                  const isTriggered = kind === 'node' && !!item.triggerAfterLinkId;
                  const boundKey   = kind === 'link' ? boundKeyByLinkId[item.id] : null;
                  const isBound    = !!boundKey;
                  const boundCount = isBound ? (boundLinkIdsByKey[boundKey]?.length ?? 1) : 0;
                  const bLeft      = start * PX_PER_SEC;
                  const baseWidth  = Math.max(duration * PX_PER_SEC, HANDLE_W + 6);
                  const displayWidthPx = Math.max(displayDuration * PX_PER_SEC, baseWidth);
                  const extensionWidth = Math.max(0, displayWidthPx - baseWidth);

                  return (
                    <div
                      key={`${kind}-${item.id}`}
                      onClick={e => handleTimelineSelect(e, kind, item.id)}
                      style={{ height: ROW_H, borderBottom: `1px solid ${pageColors.timelineRowDivider}`, position: 'relative', flexShrink: 0, background: isSel ? withAlpha(hue.solid, 0.04) : selectedIds.includes(item.id) ? withAlpha(hue.solid, 0.025) : pageColors.transparent, cursor: 'crosshair' }}
                    >
                      {isTriggered && (
                        <div style={{
                          position: 'absolute', left: 0, top: ROW_H / 2 - 0.5,
                          width: bLeft, height: 1,
                          background: `repeating-linear-gradient(90deg, ${withAlpha(pageColors.blueLink, 0.5)} 0 4px, transparent 4px 8px)`,
                          pointerEvents: 'none',
                        }} />
                      )}
                      <div
                        title={`${kind === 'node' ? 'Node' : 'Link'} · Start ${start.toFixed(2)}s · Duration ${duration.toFixed(2)}s${displayDuration !== duration ? ` · Timeline ${displayDuration.toFixed(2)}s` : ''}${isTriggered ? ' · Triggered by link' : ''}${isBound ? ` · Synced with ${boundCount} links` : ''}`}
                        onMouseDown={e => {
                          if (e.shiftKey || e.ctrlKey || e.metaKey) {
                            handleTimelineSelect(e, kind, item.id);
                            return;
                          }
                          if (!isTriggered) startBlockDrag(e, item, kind, 'move');
                        }}
                        style={{
                          position: 'absolute', top: 6, left: bLeft,
                          width: displayWidthPx, height: ROW_H - 12,
                          borderRadius: 5, cursor: isTriggered ? 'pointer' : 'grab',
                          display: 'flex', alignItems: 'center', overflow: 'visible',
                          userSelect: 'none',
                        }}
                      >
                        {extensionWidth > 0 && (
                          <div style={{
                            position: 'absolute',
                            left: baseWidth - 1,
                            top: 0,
                            width: extensionWidth + 1,
                            height: '100%',
                            borderRadius: '0 5px 5px 0',
                            background: isSel
                              ? withAlpha(pageColors.blueLink, 0.26)
                              : withAlpha(pageColors.blueLink, 0.12),
                            border: `1px dashed ${withAlpha(pageColors.blueLink, isSel ? 0.65 : 0.42)}`,
                            boxSizing: 'border-box',
                            pointerEvents: 'none',
                          }} />
                        )}

                      {/* Transform block — amber pill showing when the shape/color/label change fires */}
                      {kind === 'node' && (() => {
                        const tMode = item.transformMode;
                        if (!tMode || tMode === 'none') return null;
                        const tAutoInfo = autoTimes.nodes[item.id];
                        const tStart = item.transformStartTime ?? tAutoInfo?.transformStart ?? null;
                        if (tStart == null) return null;
                        const tDur = item.transformDuration ?? 0.4;
                        const tLeft = tStart * PX_PER_SEC - bLeft; // relative to the outer div left=bLeft
                        const tWidth = Math.max(tDur * PX_PER_SEC, HANDLE_W + 6);
                        const isManual = item.transformStartTime != null;
                        return (
                          <div
                            key="transform-block"
                            onMouseDown={e => {
                              if (e.shiftKey || e.ctrlKey || e.metaKey) return;
                              e.stopPropagation();
                              startTransformBlockDrag(e, item, 'transform-move');
                            }}
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: tLeft,
                              width: tWidth,
                              height: '100%',
                              borderRadius: 5,
                              cursor: 'grab',
                              display: 'flex',
                              alignItems: 'center',
                              overflow: 'hidden',
                              background: isSel
                                ? withAlpha(TRANSFORM_HUE.solid, 0.42)
                                : withAlpha(TRANSFORM_HUE.solid, 0.22),
                              border: `1px solid ${withAlpha(TRANSFORM_HUE.solid, isSel ? 0.9 : 0.55)}`,
                              boxSizing: 'border-box',
                            }}
                          >
                            {tWidth > 30 && (
                              <span style={{ color: TRANSFORM_HUE.solid, fontSize: 9, paddingLeft: 5, whiteSpace: 'nowrap', pointerEvents: 'none', fontWeight: 700, letterSpacing: '0.04em', opacity: isSel ? 1 : 0.8 }}>
                                ↪ {isManual ? `${tDur.toFixed(2)}s` : 'auto'}
                              </span>
                            )}
                            <div
                              onMouseDown={e => {
                                e.stopPropagation();
                                if (e.shiftKey || e.ctrlKey || e.metaKey) return;
                                startTransformBlockDrag(e, item, 'transform-resize');
                              }}
                              style={{
                                position: 'absolute', right: 0, top: 0, bottom: 0,
                                width: HANDLE_W, cursor: 'ew-resize',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                borderRadius: '0 5px 5px 0',
                              }}
                            >
                              {isSel && <div style={{ width: 2, height: 10, borderRadius: 1, background: TRANSFORM_HUE.bright }} />}
                            </div>
                          </div>
                        );
                      })()}
                        <div
                          style={{
                            position: 'relative',
                            width: baseWidth,
                            height: '100%',
                            borderRadius: 5,
                            display: 'flex',
                            alignItems: 'center',
                            overflow: 'hidden',
                            background: isSel
                              ? withAlpha(hue.solid, 0.35)
                              : isTriggered
                                ? withAlpha(pageColors.blueLink, 0.18)
                                : isBound
                                  ? `linear-gradient(135deg, ${withAlpha(pageColors.blueLink, 0.18)}, ${withAlpha(hue.solid, isAuto ? 0.18 : 0.28)})`
                                  : isAuto
                                    ? withAlpha(hue.solid, 0.12)
                                    : withAlpha(hue.solid, 0.24),
                            border: `1px solid ${isSel ? hue.solid : isTriggered || isBound ? withAlpha(pageColors.blueLink, 0.5) : withAlpha(hue.solid, 0.3)}`,
                            boxShadow: isTriggered || isBound ? `0 0 0 1px ${withAlpha(pageColors.blueLink, 0.15)} inset` : 'none',
                            boxSizing: 'border-box',
                          }}
                        >
                        {isBound && (
                          <div style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            top: 0,
                            height: 2,
                            background: pageColors.blueLink,
                            opacity: 0.85,
                            pointerEvents: 'none',
                          }} />
                        )}
                        {isTriggered && (
                          <span style={{ fontSize: 10, paddingLeft: 5, opacity: 0.8, flexShrink: 0, pointerEvents: 'none' }}>⛓</span>
                        )}
                        {isBound && baseWidth > 74 && (
                          <span style={{
                            color: pageColors.blueLink,
                            fontSize: 8,
                            fontWeight: 700,
                            letterSpacing: '0.06em',
                            paddingLeft: isTriggered ? 3 : 6,
                            pointerEvents: 'none',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}>
                            SYNC
                          </span>
                        )}
                        {baseWidth > (isTriggered || isBound ? 60 : 44) && (
                          <span style={{ color: isSel ? hue.bright : isTriggered || isBound ? pageColors.blueLink : hue.solid, fontSize: 10, paddingLeft: isTriggered ? 3 : 6, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                            {duration.toFixed(2)}s
                          </span>
                        )}

                        {!isTriggered && (
                          <div
                            onMouseDown={e => {
                              if (e.shiftKey || e.ctrlKey || e.metaKey) {
                                handleTimelineSelect(e, kind, item.id);
                                return;
                              }
                              startBlockDrag(e, item, kind, 'resize');
                            }}
                            style={{
                              position: 'absolute', right: 0, top: 0, bottom: 0,
                              width: HANDLE_W, cursor: 'ew-resize',
                              background: isSel ? withAlpha(hue.solid, 0.3) : pageColors.transparent,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              borderRadius: '0 5px 5px 0',
                            }}
                          >
                            {isSel && <div style={{ width: 2, height: 12, background: hue.bright, borderRadius: 1 }} />}
                          </div>
                        )}
                        {isTriggered && (
                          <div
                            onMouseDown={e => {
                              if (e.shiftKey || e.ctrlKey || e.metaKey) {
                                handleTimelineSelect(e, kind, item.id);
                                return;
                              }
                              startBlockDrag(e, item, kind, 'resize');
                            }}
                            style={{
                              position: 'absolute', right: 0, top: 0, bottom: 0,
                              width: HANDLE_W, cursor: 'ew-resize',
                              background: isSel ? withAlpha(pageColors.blueLink, 0.3) : pageColors.transparent,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              borderRadius: '0 5px 5px 0',
                            }}
                          >
                            {isSel && <div style={{ width: 2, height: 12, background: pageColors.blueLink, borderRadius: 1 }} />}
                          </div>
                        )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div
                ref={playheadRef}
                style={{
                  position: 'absolute', left: currentTime * PX_PER_SEC, top: 0, bottom: 0,
                  width: 1, background: pageColors.dangerLineSoft,
                  pointerEvents: 'none', zIndex: 20,
                }}
              >
                <div
                  onMouseDown={e => {
                    e.preventDefault(); e.stopPropagation();
                    document.body.style.userSelect = 'none';
                    headDragRef.current = true;
                  }}
                  style={{
                    position: 'absolute', top: -1, left: -6,
                    width: 13, height: 13, borderRadius: '50%',
                    background: pageColors.dangerMain, border: `2px solid ${pageColors.dangerSoft}`,
                    cursor: 'ew-resize', pointerEvents: 'all',
                    boxShadow: `0 0 8px ${pageColors.dangerGlow}`,
                  }}
                />
                <div
                  data-time-label
                  style={{
                    position: 'absolute', top: 15, left: 5,
                    background: pageColors.dangerTooltip, color: pageColors.white,
                    fontSize: 9, padding: '1px 5px', borderRadius: 3,
                    whiteSpace: 'nowrap', pointerEvents: 'none',
                  }}
                >
                  {currentTime.toFixed(2)}s
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VSep() {
  return <div style={{ width: 1, height: 16, background: 'var(--border-strong)', margin: '0 1px', flexShrink: 0 }} />;
}
function FieldLabel({ children }) {
  return <span style={{ color: 'var(--text-dim)', fontSize: 12, whiteSpace: 'nowrap' }}>{children}</span>;
}
function NumberField({ value, step, min, onChange }) {
  return (
    <input
      type="number" value={value} step={step} min={min}
      onChange={e => onChange(Number(e.target.value))}
      style={{ width: 58, background: 'var(--panel-bg)', border: '1px solid var(--border-strong)', borderRadius: 4, color: 'var(--text-main)', padding: '3px 7px', fontSize: 12, textAlign: 'center' }}
    />
  );
}
function InlineTextField({ value, onChange, width = 120 }) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      onMouseDown={e => e.stopPropagation()}
      style={{ width, background: 'var(--panel-bg)', border: '1px solid var(--border-strong)', borderRadius: 4, color: 'var(--text-main)', padding: '3px 7px', fontSize: 12 }}
    />
  );
}
function PlayBtn({ active, onClick }) {
  return (
    <button onClick={onClick} title={active ? 'Pause' : 'Play preview'} style={{
      background: active ? 'var(--blue-main)' : 'var(--panel-blue)', border: '1px solid var(--border-strong)',
      borderRadius: 6, color: 'var(--blue-bright)', fontSize: 13, padding: '4px 12px',
      cursor: 'pointer', lineHeight: 1, flexShrink: 0, minWidth: 36,
    }}>
      {active ? '⏸' : '▶'}
    </button>
  );
}
function StopBtn({ onClick }) {
  return (
    <button onClick={onClick} title="Stop and rewind" style={{
      background: 'var(--panel-bg)', border: '1px solid var(--border-strong)',
      borderRadius: 6, color: 'var(--text-muted)', fontSize: 13, padding: '4px 10px',
      cursor: 'pointer', lineHeight: 1, flexShrink: 0,
    }}>
      ■
    </button>
  );
}

export default KeyframePanel;
