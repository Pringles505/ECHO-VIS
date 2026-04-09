import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { pageColors, withAlpha } from '../../colorThemes';
import useStore from '../store/useStore';
import { AnimationEngine } from '../animation/AnimationEngine';

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
  const { nodes, links, updateNode, updateLink } = useStore();
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
  const syncingScrollRef = useRef(false);

  const autoTimes = useMemo(() => computeAutoTimes(nodes, links), [nodes, links]);

  const effectiveTiming = useCallback((item, kind) => {
    const pool       = kind === 'node' ? autoTimes.nodes : autoTimes.links;
    const defaultDur = kind === 'node' ? 0.5 : 0.65;
    return {
      start:    item.animStartTime ?? pool[item.id]?.start    ?? 0,
      duration: item.animDuration  ?? pool[item.id]?.duration ?? defaultDur,
      isAuto:   item.animStartTime == null,
    };
  }, [autoTimes]);

  const selKind = selectedItem?.kind;
  const selData = selKind === 'node'
    ? nodes.find(n => n.id === selectedItem.id) ?? null
    : links.find(e => e.id === selectedItem.id) ?? null;
  const selTiming = selData ? effectiveTiming(selData, selKind) : null;
  const selLabel  = selKind === 'node'
    ? (selData?.label ?? '?')
    : selData ? linkLabel(selData, nodes) : null;
  const doUpdate  = (updates) => selKind === 'node'
    ? updateNode(selectedItem.id, updates)
    : updateLink(selectedItem.id, updates);

  useEffect(() => {
    if (!selectedItem) return;
    const list = selectedItem.kind === 'node' ? nodes : links;
    if (!list.find(x => x.id === selectedItem.id)) setSelectedItem(null);
  }, [nodes, links, selectedItem]);

  useEffect(() => {
    if (!selectedItem && nodes.length > 0) setSelectedItem({ kind: 'node', id: nodes[0].id });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length]);

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
      const update = d.dragType === 'move'
        ? { animStartTime: r2(Math.max(0, d.initStart + dtSec)), animDuration: d.initDur }
        : { animDuration: r2(Math.max(MIN_DUR, d.initDur + dtSec)) };
      if (d.kind === 'node') updateNode(d.itemId, update);
      else                   updateLink(d.itemId, update);
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
  }, [updateNode, updateLink]);

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
    if (item.animStartTime == null) {
      if (kind === 'node') updateNode(item.id, { animStartTime: start, animDuration: duration });
      else                 updateLink(item.id, { animStartTime: start, animDuration: duration });
    }
    blockDragRef.current = { dragType, kind, itemId: item.id, startX: e.clientX, initStart: start, initDur: duration };
  }, [effectiveTiming, updateNode, updateLink]);

  const handleTimelineMouseDown = useCallback((e) => {
    e.preventDefault();
    document.body.style.userSelect = 'none';
    headDragRef.current = true;
    seekFromClientX(e.clientX);
  }, [seekFromClientX]);

  const handleResizeMouseDown = useCallback((e) => {
    if (collapsed) return;
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = panelHeight;
    const onMove = (moveEvent) => {
      const maxHeight = Math.floor(window.innerHeight * 0.76);
      const nextHeight = startHeight - (moveEvent.clientY - startY);
      setPanelHeight(Math.max(PANEL_MIN_H, Math.min(nextHeight, maxHeight)));
    };
    const onUp = () => {
      resizeRef.current = null;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    resizeRef.current = { startY, startHeight };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ns-resize';
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
    <div style={{
      height: collapsed ? 34 : panelHeight,
      minHeight: collapsed ? 34 : panelHeight,
      background: 'linear-gradient(180deg, var(--panel-bg), var(--panel-bg-2))',
      borderTop: '1px solid var(--border-strong)',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
      overflow: 'hidden', userSelect: 'none',
      transition: 'height 0.16s ease, min-height 0.16s ease',
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
            <span style={{ color: selKind === 'node' ? pageColors.purpleAccent : pageColors.blueLink, fontSize: 12, whiteSpace: 'nowrap', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {selLabel}
            </span>
            <VSep />

            <FieldLabel>Start</FieldLabel>
            <NumberField value={selTiming.start}    step={0.05} min={0}       onChange={v => doUpdate({ animStartTime: r2(Math.max(0, v)),      animDuration: selTiming.duration })} />
            <FieldLabel>s</FieldLabel>

            <div style={{ width: 8 }} />

            <FieldLabel>Duration</FieldLabel>
            <NumberField value={selTiming.duration} step={0.05} min={MIN_DUR} onChange={v => doUpdate({ animDuration: r2(Math.max(MIN_DUR, v)) })} />
            <FieldLabel>s</FieldLabel>

            <VSep />
            <FieldLabel>Speed</FieldLabel>
            <span style={{ color: speedColor(selTiming.duration), fontSize: 11, fontWeight: 600, minWidth: 55 }}>
              {speedLabel(selTiming.duration)}
            </span>

            {!selTiming.isAuto && (
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
                return (
                  <div
                    key={`${kind}-${item.id}`}
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
                    <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: isAuto ? pageColors.rulerMinorTick : hue.solid }} />
                    <span style={{ color: isSel ? hue.bright : pageColors.timelineTextMuted, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                      {label}
                    </span>
                    {isAuto && <span style={{ color: pageColors.rulerMinorTick, fontSize: 9, letterSpacing: '0.05em' }}>AUTO</span>}
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
                  const hue    = kind === 'node' ? NODE_HUE : LINK_HUE;
                  const isSel  = selectedItem?.kind === kind && selectedItem?.id === item.id;
                  const bLeft  = start * PX_PER_SEC;
                  const bWidth = Math.max(duration * PX_PER_SEC, HANDLE_W + 6);

                  return (
                    <div
                      key={`${kind}-${item.id}`}
                      onClick={e => { e.stopPropagation(); setSelectedItem({ kind, id: item.id }); }}
                      style={{ height: ROW_H, borderBottom: `1px solid ${pageColors.timelineRowDivider}`, position: 'relative', flexShrink: 0, background: isSel ? withAlpha(hue.solid, 0.04) : pageColors.transparent, cursor: 'crosshair' }}
                    >
                      <div
                        title={`${kind === 'node' ? 'Node' : 'Link'} · Start ${start.toFixed(2)}s · Duration ${duration.toFixed(2)}s`}
                        onMouseDown={e => startBlockDrag(e, item, kind, 'move')}
                        style={{
                          position: 'absolute', top: 6, left: bLeft,
                          width: bWidth, height: ROW_H - 12,
                          borderRadius: 5, cursor: 'grab',
                          display: 'flex', alignItems: 'center', overflow: 'hidden',
                          userSelect: 'none',
                          background: isSel
                            ? withAlpha(hue.solid, 0.35)
                            : isAuto
                              ? withAlpha(hue.solid, 0.12)
                              : withAlpha(hue.solid, 0.24),
                          border: `1px solid ${isSel ? hue.solid : withAlpha(hue.solid, 0.3)}`,
                        }}
                      >
                        {bWidth > 44 && (
                          <span style={{ color: isSel ? hue.bright : hue.solid, fontSize: 10, paddingLeft: 6, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                            {duration.toFixed(2)}s
                          </span>
                        )}

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

