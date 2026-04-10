import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { pageColors, withAlpha } from '../../colorThemes';
import useStore from '../store/useStore';
import { AnimationEngine } from '../animation/AnimationEngine';
import { buildLinkRenderData, getLinkJointProgress } from '../links/linkGeometry';

const LEFT_W     = 240;
const ROW_H      = 36;
const SEC_H      = 22;
const RULER_H    = 26;
const PANEL_MIN_H = 210;
const PANEL_DEFAULT_H = 320;
const PX_PER_SEC = 90;
const MIN_DUR    = 0.1;
const HANDLE_W   = 9;

const NODE_HUE  = { solid: pageColors.purpleAccent, bright: pageColors.purpleAccent };
const LINK_HUE  = { solid: pageColors.blueMain, bright: pageColors.blueLink };

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
  return `${trunc(from?.label, 9)} → ${trunc(to?.label, 9)}`;
}

function computeAutoTimes(nodes, links) {
  if (!nodes.length && !links.length) return { nodes: {}, links: {} };
  const tl = new AnimationEngine(nodes, links).getTimeline();
  const result = { nodes: {}, links: {} };
  for (const ev of tl) result[ev.type + 's'][ev.id] = { start: ev.start, duration: ev.duration };
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

function Ruler({ total }) {
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
  return (
    <div style={{ height: RULER_H, background: 'var(--panel-bg)', borderBottom: '1px solid var(--border-strong)', position: 'relative', flexShrink: 0 }}>
      {ticks}
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
  const { nodes, links, updateNode, updateLink, removeNode, selectedId } = useStore();
  const { isPlaying, currentTime, totalDuration, play, pause, stop, seek } = playback;

  const [collapsed,     setCollapsed]     = useState(false);
  const [panelHeight,   setPanelHeight]   = useState(PANEL_DEFAULT_H);
  const [selectedItem,  setSelectedItem]  = useState(null);

  const blockDragRef = useRef(null);
  const headDragRef  = useRef(false);
  const timelineRef  = useRef(null);
  const leftBodyRef  = useRef(null);
  const rightBodyRef = useRef(null);
  const resizeRef    = useRef(null);
  const panelRef     = useRef(null);
  const syncingScrollRef = useRef(false);

  const autoTimes = useMemo(() => computeAutoTimes(nodes, links), [nodes, links]);
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

  const effectiveTiming = useCallback((item, kind) => {
    const pool       = kind === 'node' ? autoTimes.nodes : autoTimes.links;
    const defaultDur = kind === 'node' ? 0.5 : 0.65;
    const syncKey = kind === 'link' ? syncedJunctionKeyByLinkId[item.id] : null;
    const sharedStart = syncKey ? syncedGroupStartByKey[syncKey] : null;
    return {
      start:    sharedStart ?? item.animStartTime ?? pool[item.id]?.start ?? 0,
      duration: item.animDuration  ?? pool[item.id]?.duration ?? defaultDur,
      isAuto:   item.animStartTime == null,
    };
  }, [autoTimes, syncedGroupStartByKey, syncedJunctionKeyByLinkId]);

  const selKind = selectedItem?.kind;
  const selData = !selectedItem ? null : selKind === 'node'
    ? nodes.find(n => n.id === selectedItem.id) ?? null
    : links.find(e => e.id === selectedItem.id) ?? null;
  const selTiming = selData ? effectiveTiming(selData, selKind) : null;
  const selLabel  = selKind === 'node'
    ? (selData?.label ?? '?')
    : selData ? linkLabel(selData, nodes) : null;
  const selectedBoundKey = selKind === 'link' ? boundKeyByLinkId[selectedItem?.id] : null;
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

    // Primary-link duration changes should control the speed of the portion of
    // the primary link after the junction, because that is the part that
    // visually overlaps with child links.
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
  const doUpdate  = (updates) => selKind === 'node'
    ? updateNode(selectedItem.id, updates)
    : (
        (() => {
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
    const list = selectedItem.kind === 'node' ? nodes : links;
    if (!list.find(x => x.id === selectedItem.id)) setSelectedItem(null);
  }, [nodes, links, selectedItem]);

  useEffect(() => {
    if (!selectedItem && nodes.length > 0) setSelectedItem({ kind: 'node', id: nodes[0].id });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length]);

  // Sync canvas selection → timeline selection + scroll into view
  useEffect(() => {
    if (!selectedId) return;
    const isNode = !!nodes.find(n => n.id === selectedId);
    const isLink = !isNode && !!links.find(l => l.id === selectedId);
    if (!isNode && !isLink) return;
    const kind = isNode ? 'node' : 'link';
    setSelectedItem({ kind, id: selectedId });

    // Scroll the left label panel so the selected row is visible
    requestAnimationFrame(() => {
      const el = leftBodyRef.current;
      if (!el) return;
      const row = el.querySelector(`[data-row-id="${kind}-${selectedId}"]`);
      if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const seekFromClientX = useCallback((clientX) => {
    const el = timelineRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const relX = clientX - rect.left + el.scrollLeft;
    seek(Math.max(0, relX / PX_PER_SEC));
  }, [seek]);

  useEffect(() => {
    const onMove = (e) => {
      const d = blockDragRef.current;
      if (!d) return;
      const dtSec  = (e.clientX - d.startX) / PX_PER_SEC;
      if (d.kind === 'node') {
        const update = d.dragType === 'move'
          ? { animStartTime: r2(Math.max(0, d.initStart + dtSec)), animDuration: d.initDur }
          : { animDuration: r2(Math.max(MIN_DUR, d.initDur + dtSec)) };
        updateNode(d.itemId, update);
        return;
      }

      if (d.linkGroup?.length) {
        const resizedDuration = r2(Math.max(MIN_DUR, d.initDur + dtSec));
        if (d.dragType === 'resize') {
          const updatesById = buildBoundDurationUpdates(d.itemId, resizedDuration);
          for (const [memberId, updates] of Object.entries(updatesById)) {
            updateLink(memberId, updates);
          }
          return;
        }
        for (const groupItem of d.linkGroup) {
          updateLink(groupItem.id, {
            animStartTime: r2(Math.max(0, groupItem.initStart + dtSec)),
            animDuration: groupItem.initDur,
          });
        }
        return;
      }

      const update = d.dragType === 'move'
        ? { animStartTime: r2(Math.max(0, d.initStart + dtSec)), animDuration: d.initDur }
        : { animDuration: r2(Math.max(MIN_DUR, d.initDur + dtSec)) };
      updateLink(d.itemId, update);
    };
    const onUp = () => {
      blockDragRef.current = null;
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    };
  }, [buildBoundDurationUpdates, updateNode, updateLink]);

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

  const startBlockDrag = useCallback((e, item, kind, dragType) => {
    e.preventDefault();
    e.stopPropagation();
    document.body.style.userSelect = 'none';
    setSelectedItem({ kind, id: item.id });
    const { start, duration } = effectiveTiming(item, kind);
    // Store the computed timing before the user starts dragging.
    if (kind === 'node') {
      const nextUpdates = {};
      if (dragType === 'move' && item.animStartTime == null) nextUpdates.animStartTime = start;
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
    const syncKey = kind === 'link' ? syncedJunctionKeyByLinkId[item.id] : null;
    const boundKey = kind === 'link' ? boundKeyByLinkId[item.id] : null;
    const groupLinkIds = dragType === 'move'
      ? (syncKey ? syncedLinkIdsByKey[syncKey] ?? [] : [])
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
    blockDragRef.current = { dragType, kind, itemId: item.id, startX: e.clientX, initStart: start, initDur: duration, linkGroup };
  }, [boundKeyByLinkId, boundLinkIdsByKey, effectiveTiming, links, syncedJunctionKeyByLinkId, syncedLinkIdsByKey, updateLinkStartGroup, updateLinkDurationGroup, updateNode, updateLink]);

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
      // Write directly to DOM — zero re-renders during drag
      if (panelRef.current) {
        panelRef.current.style.height = `${next}px`;
        panelRef.current.style.minHeight = `${next}px`;
      }
      resizeRef.current = next;
    };

    const onUp = () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      // Sync state once on release so React knows the final height
      if (resizeRef.current != null) setPanelHeight(resizeRef.current);
      resizeRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [collapsed, panelHeight]);

  const totalDur    = Math.max(totalDuration, 4);
  const timelineW   = totalDur * PX_PER_SEC + 40;
  const playheadPx  = currentTime * PX_PER_SEC;

  // Both panes use the same row list so labels and timing tracks stay aligned.
  const rows = [
    ...(nodes.length > 0 ? [{ type: 'section', label: 'NODES',       color: NODE_HUE.solid }] : []),
    ...nodes.map(n  => ({ type: 'node', item: n  })),
    ...(links.length > 0 ? [{ type: 'section', label: 'LINKS', color: LINK_HUE.solid }] : []),
    ...links.map(e  => ({ type: 'link', item: e  })),
  ];

  const isEmpty = nodes.length === 0 && links.length === 0;

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

            {selKind === 'node' && (() => {
              const isTrigger = !!(selData?.triggerAfterLinkId);
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
                      maxWidth: 130, fontWeight: isTrigger ? 600 : 400,
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
                </>
              );
            })()}

            {selKind === 'link' && (
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
                const { item, type: kind } = row;
                const { isAuto } = effectiveTiming(item, kind);
                const hue   = kind === 'node' ? NODE_HUE : LINK_HUE;
                const isSel = selectedItem?.kind === kind && selectedItem?.id === item.id;
                const label = kind === 'node' ? trunc(item.label) : linkLabel(item, nodes);
                const isTriggered = kind === 'node' && !!item.triggerAfterLinkId;
                const boundKey = kind === 'link' ? boundKeyByLinkId[item.id] : null;
                const isBound = !!boundKey;
                const boundCount = isBound ? (boundLinkIdsByKey[boundKey]?.length ?? 1) : 0;
                return (
                  <div
                    key={`${kind}-${item.id}`}
                    data-row-id={`${kind}-${item.id}`}
                    onClick={() => setSelectedItem({ kind, id: item.id })}
                    style={{
                      height: ROW_H, display: 'flex', alignItems: 'center',
                      padding: '0 10px', gap: 7, cursor: 'pointer',
                      borderBottom: `1px solid ${pageColors.timelineRowDivider}`,
                      borderLeft: `2px solid ${isSel ? hue.solid : pageColors.transparent}`,
                      background: isSel ? withAlpha(hue.solid, 0.06) : pageColors.transparent,
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
              <Ruler total={totalDur} />

              <div
                ref={rightBodyRef}
                onScroll={handleRightScroll}
                style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}
              >
                {rows.map((row, i) => {
                  if (row.type === 'section') {
                    return (
                      <div key={`sec-${i}`} style={{ height: SEC_H, background: pageColors.timelineSectionBackground, borderBottom: `1px solid ${withAlpha(row.color, 0.13)}`, flexShrink: 0 }} />
                    );
                  }

                  const { item, type: kind } = row;
                  const { start, duration, isAuto } = effectiveTiming(item, kind);
                  const hue        = kind === 'node' ? NODE_HUE : LINK_HUE;
                  const isSel      = selectedItem?.kind === kind && selectedItem?.id === item.id;
                  const isTriggered = kind === 'node' && !!item.triggerAfterLinkId;
                  const boundKey   = kind === 'link' ? boundKeyByLinkId[item.id] : null;
                  const isBound    = !!boundKey;
                  const boundCount = isBound ? (boundLinkIdsByKey[boundKey]?.length ?? 1) : 0;
                  const bLeft      = start * PX_PER_SEC;
                  const bWidth     = Math.max(duration * PX_PER_SEC, HANDLE_W + 6);

                  return (
                    <div
                      key={`${kind}-${item.id}`}
                      onClick={e => { e.stopPropagation(); setSelectedItem({ kind, id: item.id }); }}
                      style={{ height: ROW_H, borderBottom: `1px solid ${pageColors.timelineRowDivider}`, position: 'relative', flexShrink: 0, background: isSel ? withAlpha(hue.solid, 0.04) : pageColors.transparent, cursor: 'crosshair' }}
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
                        title={`${kind === 'node' ? 'Node' : 'Link'} · Start ${start.toFixed(2)}s · Duration ${duration.toFixed(2)}s${isTriggered ? ' · Triggered by link' : ''}${isBound ? ` · Synced with ${boundCount} links` : ''}`}
                        onMouseDown={e => !isTriggered && startBlockDrag(e, item, kind, 'move')}
                        style={{
                          position: 'absolute', top: 6, left: bLeft,
                          width: bWidth, height: ROW_H - 12,
                          borderRadius: 5, cursor: isTriggered ? 'pointer' : 'grab',
                          display: 'flex', alignItems: 'center', overflow: 'hidden',
                          userSelect: 'none',
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
                        {isBound && bWidth > 74 && (
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
                        {bWidth > (isTriggered || isBound ? 60 : 44) && (
                          <span style={{ color: isSel ? hue.bright : isTriggered || isBound ? pageColors.blueLink : hue.solid, fontSize: 10, paddingLeft: isTriggered ? 3 : 6, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                            {duration.toFixed(2)}s
                          </span>
                        )}

                        {!isTriggered && (
                          <div
                            onMouseDown={e => startBlockDrag(e, item, kind, 'resize')}
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
                            onMouseDown={e => startBlockDrag(e, item, kind, 'resize')}
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
                  );
                })}
              </div>

              <div style={{
                position: 'absolute', left: playheadPx, top: 0, bottom: 0,
                width: 1, background: pageColors.dangerLineSoft,
                pointerEvents: 'none', zIndex: 20,
              }}>
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
                <div style={{
                  position: 'absolute', top: 15, left: 5,
                  background: pageColors.dangerTooltip, color: pageColors.white,
                  fontSize: 9, padding: '1px 5px', borderRadius: 3,
                  whiteSpace: 'nowrap', pointerEvents: 'none',
                }}>
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
