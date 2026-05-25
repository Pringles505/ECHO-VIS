import React, { useEffect, useMemo, useState } from 'react';
import { v4 as uuid } from 'uuid';
import useStore, { NODE_SHAPE_PRESETS, isSubdiagramNode } from '../store/useStore';
import { getMirrorOverlapPayload, getMirrorSourceItems, getMirrorSelectionPayload, isMirrorNode } from '../mirror/mirrorData';
import { getNextTextMorphStart, getNodeTextMorphs, normalizeTextMorphList } from '../text/textMorphs';
import { listProjects, readProject } from '../projects/projectStore';
import { computeVariableWebs } from '../variables/flow';

function Section({ title }) {
  return (
    <div style={{
      color: 'var(--purple-bright)',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      marginBottom: 14,
      marginTop: 6,
      paddingBottom: 6,
      borderBottom: '1px solid var(--border-strong)',
    }}>{title}</div>
  );
}

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <label style={{ color: 'var(--text-muted)', fontSize: 11, width: 72, flexShrink: 0 }}>{label}</label>
      {children}
    </div>
  );
}

function TextInput({ value, onChange }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        flex: 1,
        background: 'var(--panel-bg-3)',
        border: '1px solid var(--border-strong)',
        borderRadius: 5,
        color: 'var(--text-main)',
        padding: '5px 8px',
        fontSize: 12,
      }}
    />
  );
}

function NumberInput({ value, onChange, min, max, step = 1 }) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={e => onChange(Number(e.target.value))}
      style={{
        width: 62,
        background: 'var(--panel-bg-3)',
        border: '1px solid var(--border-strong)',
        borderRadius: 5,
        color: 'var(--text-main)',
        padding: '5px 8px',
        fontSize: 12,
      }}
    />
  );
}

function ColorInput({ value, onChange }) {
  const colorClipboard = useStore(state => state.colorClipboard);
  const setColorClipboard = useStore(state => state.setColorClipboard);

  const handleCopy = () => {
    setColorClipboard(value);
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(value).catch(() => {});
    }
  };

  const handlePaste = () => {
    if (!colorClipboard) return;
    onChange(colorClipboard);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <div style={{ position: 'relative', width: 28, height: 28, flexShrink: 0 }}>
          <input
            type="color"
            value={value}
            onChange={e => onChange(e.target.value)}
            style={{
              position: 'absolute', inset: 0,
              opacity: 0, cursor: 'pointer', width: '100%', height: '100%',
            }}
          />
          <div style={{
            width: 28, height: 28,
            borderRadius: 5,
            background: value,
            border: '2px solid var(--text-faint)',
            pointerEvents: 'none',
          }} />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
          <button
            type="button"
            onClick={handleCopy}
            title="Copy this color"
            style={{
              background: 'var(--panel-bg)',
              border: '1px solid var(--border-strong)',
              borderRadius: 5,
              color: 'var(--text-muted)',
              fontSize: 10,
              padding: '4px 7px',
              cursor: 'pointer',
            }}
          >
            Copy
          </button>
          <button
            type="button"
            onClick={handlePaste}
            title={colorClipboard ? `Paste ${colorClipboard}` : 'Copy a color first'}
            disabled={!colorClipboard}
            style={{
              background: colorClipboard ? 'var(--purple-surface-panel)' : 'var(--panel-bg)',
              border: `1px solid ${colorClipboard ? 'var(--purple-border-strong)' : 'var(--border-strong)'}`,
              borderRadius: 5,
              color: colorClipboard ? 'var(--text-main)' : 'var(--text-dim)',
              fontSize: 10,
              padding: '4px 7px',
              cursor: colorClipboard ? 'pointer' : 'not-allowed',
              opacity: colorClipboard ? 1 : 0.6,
            }}
          >
            Paste
          </button>
        </div>
      </div>
      <span style={{
        color: 'var(--text-muted)',
        fontSize: 11,
        fontFamily: 'monospace',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {value}
      </span>
    </div>
  );
}

function JointChip({ joint, isSelected, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: isSelected ? 'var(--purple-surface-panel)' : 'var(--panel-bg)',
        border: `1px solid ${isSelected ? 'var(--purple-border-strong)' : 'var(--border-strong)'}`,
        borderRadius: 999,
        color: isSelected ? 'var(--text-main)' : 'var(--text-muted)',
        fontSize: 11,
        padding: '4px 8px',
        cursor: 'pointer',
      }}
    >
      {joint}
    </button>
  );
}

function ModeChip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? 'var(--purple-surface-panel)' : 'var(--panel-bg)',
        border: `1px solid ${active ? 'var(--purple-border-strong)' : 'var(--border-strong)'}`,
        borderRadius: 999,
        color: active ? 'var(--text-main)' : 'var(--text-dim)',
        fontSize: 11,
        padding: '4px 9px',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

function PresetChip({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'var(--panel-bg)',
        border: '1px solid var(--border-strong)',
        borderRadius: 999,
        color: 'var(--text-muted)',
        fontSize: 11,
        padding: '4px 8px',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

function SliderControl({ label, value, min = 0, max = 120, step = 1, onChange }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{label}</span>
        <span style={{ color: 'var(--text-main)', fontSize: 11, fontFamily: 'monospace' }}>{Math.round(value)} px</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{
          width: '100%',
          accentColor: 'var(--purple-bright)',
          cursor: 'pointer',
        }}
      />
    </div>
  );
}

function ToggleInput({ checked, onChange, label = 'Enabled' }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-main)', fontSize: 12, cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        style={{ accentColor: 'var(--purple-bright)', cursor: 'pointer' }}
      />
      <span>{label}</span>
    </label>
  );
}

function ActionButton({ label, active = false, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? 'var(--purple-surface-panel)' : 'var(--panel-bg)',
        border: `1px solid ${active ? 'var(--purple-border-strong)' : 'var(--border-strong)'}`,
        borderRadius: 6,
        color: active ? 'var(--text-main)' : 'var(--text-muted)',
        fontSize: 11,
        padding: '5px 8px',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

const NODE_SHAPE_OPTIONS = [
  { key: 'rectangle', label: 'Rectangle' },
  { key: 'rounded', label: 'Rounded' },
  { key: 'pill', label: 'Pill' },
  { key: 'cylinder', label: 'Cylinder' },
  { key: 'diamond', label: 'Diamond' },
  { key: 'hexagon', label: 'Hexagon' },
  { key: 'slanted', label: 'Slanted' },
  { key: 'circle', label: 'Circle' },
];

const SELECT_INPUT_STYLE = {
  flex: 1,
  minWidth: 0,
  background: 'var(--panel-bg-3)',
  border: '1px solid var(--border-strong)',
  borderRadius: 5,
  color: 'var(--text-main)',
  padding: '5px 8px',
  fontSize: 12,
};

function getResolveMode(node) {
  if (!node) return 'none';
  if (node.transformMode) return node.transformMode;
  return node.transformTargetNodeId ? 'existing' : 'none';
}

function buildResolveTargetFromNode(sourceNode, fallbackNode) {
  const source = sourceNode ?? fallbackNode ?? {};
  const fallback = fallbackNode ?? {};
  return {
    label: source.label ?? '',
    width: source.width ?? fallback.width ?? 150,
    height: source.height ?? fallback.height ?? 52,
    shape: source.shape ?? fallback.shape ?? 'rounded',
    cornerRadius: source.cornerRadius ?? fallback.cornerRadius ?? 8,
    fill: source.fill ?? fallback.fill ?? '#000000',
    stroke: source.stroke ?? fallback.stroke ?? '#000000',
    textColor: source.textColor ?? fallback.textColor ?? '#ffffff',
    strokeWidth: source.strokeWidth ?? fallback.strokeWidth ?? 2,
    showSubBadge: source.type === 'subdiagram'
      ? (source.showSubBadge ?? true)
      : (source.showSubBadge ?? false),
  };
}

function getDefaultResolveStart(node) {
  return Math.round((((node?.animStartTime ?? 0) + (node?.animDuration ?? 0.5)) * 100)) / 100;
}

function LinkBasics({ linkLike, onUpdate }) {
  return (
    <>
      <Row label="Color">
        <ColorInput value={linkLike.stroke} onChange={v => onUpdate({ stroke: v })} />
      </Row>
      <Row label="Width">
        <NumberInput value={linkLike.strokeWidth} min={1} max={10} onChange={v => onUpdate({ strokeWidth: v })} />
      </Row>
      <Row label="Arrow tip">
        <ToggleInput checked={!!linkLike.showArrowTip} onChange={value => onUpdate({ showArrowTip: value })} />
      </Row>
      {linkLike.showArrowTip && (
        <Row label="Tip style">
          <div style={{ display: 'flex', gap: 6 }}>
            <ModeChip
              label="Flows"
              active={!linkLike.arrowTipMode || linkLike.arrowTipMode === 'flow'}
              onClick={() => onUpdate({ arrowTipMode: 'flow' })}
            />
            <ModeChip
              label="At end"
              active={linkLike.arrowTipMode === 'end'}
              onClick={() => onUpdate({ arrowTipMode: 'end' })}
            />
          </div>
        </Row>
      )}
      <Row label="Failing">
        <ToggleInput checked={!!linkLike.failing} onChange={value => onUpdate({ failing: value })} />
      </Row>
      <Row label="Bind hop">
        <ToggleInput
          checked={!!linkLike.bindToTokenHop}
          onChange={value => onUpdate({ bindToTokenHop: value })}
          label="Follow token timing"
        />
      </Row>
      {linkLike.bindToTokenHop && (
        <>
          <Row label="Auto trig">
            <ToggleInput
              checked={!!linkLike.autoTriggerTarget}
              onChange={v => onUpdate({ autoTriggerTarget: v })}
              label="Trigger target on hop end"
            />
          </Row>
          <Row label="Hop offs">
            <NumberInput value={Number.isFinite(linkLike.bindHopOffset) ? linkLike.bindHopOffset : 0} min={-10} max={10} step={0.05} onChange={v => onUpdate({ bindHopOffset: v })} />
          </Row>
          <Row label="Speed x">
            <NumberInput value={Number.isFinite(linkLike.bindHopScale) ? linkLike.bindHopScale : 1} min={0.1} max={5} step={0.05} onChange={v => onUpdate({ bindHopScale: v })} />
          </Row>
        </>
      )}
    </>
  );
}

function getAnchorLimit(node, side) {
  if (!node || !side || side === 'center') return 0;
  return side === 'top' || side === 'bottom'
    ? Math.max(0, node.width / 2 - 12)
    : Math.max(0, node.height / 2 - 12);
}

function PropertiesPanel() {
  const {
    nodes,
    links,
    nextLinkDefaults,
    selectedId,
    selectedJointId,
    setSelectedJoint,
    updateNode,
    updateLink,
    updateLinkJoint,
    updateNextLinkDefaults,
    captureMirrorSelection,
    updateMirrorNodeOverride,
    updateMirrorLinkOverride,
    removeNode,
    removeLink,
    removeLinkJoint,
  } = useStore();
  // Simulation hooks
  const simOpt = useStore(state => state.simulateOptions);
  const setSimulateOptions = useStore(state => state.setSimulateOptions);
  const addMonitorWatch = useStore(state => state.addMonitorWatch);
  const updateMonitorWatch = useStore(state => state.updateMonitorWatch);
  const removeMonitorWatch = useStore(state => state.removeMonitorWatch);
  const setMonitorVariable = useStore(state => state.setMonitorVariable);

  const selectedNode = nodes.find(node => node.id === selectedId);
  const selectedLink = links.find(link => link.id === selectedId);
  const selectedFromNode = selectedLink ? nodes.find(node => node.id === selectedLink.fromId) : null;
  const selectedToNode = selectedLink ? nodes.find(node => node.id === selectedLink.toId) : null;
  const selectedJoint = selectedLink?.joints?.find(joint => joint.id === selectedJointId) ?? null;
  const [curveMode, setCurveMode] = useState('linked');
  const jointCurve = useMemo(() => {
    if (!selectedJoint) return 0;
    return Math.round(((selectedJoint.prevCurve ?? 0) + (selectedJoint.nextCurve ?? 0)) / 2);
  }, [selectedJoint]);

  const wrap = {
    width: 244,
    minWidth: 244,
    background: 'linear-gradient(180deg, var(--panel-bg), var(--panel-bg-2))',
    borderLeft: '1px solid var(--border-strong)',
    padding: 16,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
  };

  useEffect(() => {
    if (!selectedJoint) return;
    const balanced = Math.abs((selectedJoint.prevCurve ?? 0) - (selectedJoint.nextCurve ?? 0)) < 1;
    setCurveMode(balanced ? 'linked' : 'split');
  }, [selectedJoint]);

  if (!selectedNode && !selectedLink) {
    return (
      <div style={wrap}>
        <Section title="Next Link" />
        <LinkBasics linkLike={nextLinkDefaults} onUpdate={updateNextLinkDefaults} />
        <p style={{ color: 'var(--text-dim)', fontSize: 11, lineHeight: 1.6, marginTop: 4 }}>
          These settings apply to the next link you draw.
        </p>

        <Section title="Token Appearance" />
        <p style={{ color: 'var(--text-dim)', fontSize: 11, lineHeight: 1.5, marginBottom: 10 }}>
          Tokens flow automatically along the web of every Variable node. These options control how that token looks.
        </p>
        <Row label="Shape">
          <select
            value={simOpt.tokenShape}
            onChange={e => setSimulateOptions({ tokenShape: e.target.value })}
            style={SELECT_INPUT_STYLE}
          >
            <option value="circle">Circle</option>
            <option value="square">Square</option>
            <option value="diamond">Diamond</option>
          </select>
        </Row>
        <Row label="Size">
          <NumberInput value={simOpt.tokenSize} min={2} max={24} onChange={v => setSimulateOptions({ tokenSize: v })} />
        </Row>
        <Row label="Fill">
          <ColorInput value={simOpt.tokenFill} onChange={v => setSimulateOptions({ tokenFill: v })} />
        </Row>
        <Row label="Border">
          <ColorInput value={simOpt.tokenStroke} onChange={v => setSimulateOptions({ tokenStroke: v })} />
        </Row>
        <Row label="Label">
          <TextInput value={simOpt.tokenText} onChange={v => setSimulateOptions({ tokenText: v })} />
        </Row>
        <Row label="Lbl clr">
          <ColorInput value={simOpt.tokenTextColor} onChange={v => setSimulateOptions({ tokenTextColor: v })} />
        </Row>
        <Row label="Lbl size">
          <NumberInput value={simOpt.tokenTextSize} min={8} max={24} onChange={v => setSimulateOptions({ tokenTextSize: v })} />
        </Row>
        <p style={{ color: 'var(--text-dim)', fontSize: 11, lineHeight: 1.5 }}>
          Add a Monitor node from the canvas right-click menu to display variable values where tokens pass through watched nodes.
        </p>
      </div>
    );
  }

  if (selectedNode && isSubdiagramNode(selectedNode)) {
    const up = (key, value) => updateNode(selectedNode.id, { [key]: value });
    const projects = listProjects();
    const transformTargets = (selectedNode.snapshotNodes ?? []).filter(node => (
      node.type !== 'area' &&
      node.type !== 'mirror' &&
      node.type !== 'text'
    ));
    const resolveMode = getResolveMode(selectedNode);
    const activeTransformTarget = transformTargets.find(node => node.id === selectedNode.transformTargetNodeId) ?? null;
    const updateResolveTarget = (updates) => updateNode(selectedNode.id, {
      transformTarget: {
        ...buildResolveTargetFromNode(activeTransformTarget, selectedNode),
        ...(selectedNode.transformTarget ?? {}),
        ...updates,
      },
    });
    const setResolveMode = (mode) => {
      if (mode === 'custom') {
        updateNode(selectedNode.id, {
          transformMode: 'custom',
          transformTarget: {
            ...buildResolveTargetFromNode(activeTransformTarget, selectedNode),
            ...(selectedNode.transformTarget ?? {}),
          },
        });
        return;
      }
      updateNode(selectedNode.id, { transformMode: mode });
    };

    return (
      <div style={wrap}>
        <Section title="Sub-diagram" />

        <Row label="Label">
          <TextInput value={selectedNode.label ?? ''} onChange={v => up('label', v)} />
        </Row>

        <Row label="Title">
          <TextInput value={selectedNode.popupTitle ?? ''} onChange={v => up('popupTitle', v)} />
        </Row>

        <Row label="Shape">
          <select
            value={selectedNode.shape ?? 'rounded'}
            onChange={(e) => updateNode(selectedNode.id, {
              ...NODE_SHAPE_PRESETS[e.target.value],
              type: selectedNode.type,
            })}
            style={{
              flex: 1,
              minWidth: 0,
              background: 'var(--panel-bg-3)',
              border: '1px solid var(--border-strong)',
              borderRadius: 5,
              color: 'var(--text-main)',
              padding: '5px 8px',
              fontSize: 12,
            }}
          >
            {NODE_SHAPE_OPTIONS.map((shape) => (
              <option key={shape.key} value={shape.key}>{shape.label}</option>
            ))}
          </select>
        </Row>

        <Row label="Source">
          <select
            value={selectedNode.sourceProjectId ?? ''}
            onChange={(e) => {
              const id = e.target.value;
              if (!id) {
                updateNode(selectedNode.id, {
                  sourceProjectId: null,
                  snapshotNodes: [],
                  snapshotLinks: [],
                });
                return;
              }
              const project = readProject(id);
              if (project) {
                updateNode(selectedNode.id, {
                  sourceProjectId: id,
                  snapshotNodes: project.nodes ?? [],
                  snapshotLinks: project.links ?? [],
                });
              }
            }}
            style={{
              flex: 1,
              minWidth: 0,
              background: 'var(--panel-bg-3)',
              border: '1px solid var(--border-strong)',
              borderRadius: 5,
              color: 'var(--text-main)',
              padding: '5px 8px',
              fontSize: 12,
            }}
          >
            <option value="">Choose project…</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
        </Row>

        {(selectedNode.snapshotNodes?.length ?? 0) > 0 && (
          <div style={{
            fontSize: 11,
            color: 'var(--text-dim)',
            marginBottom: 10,
            lineHeight: 1.5,
          }}>
            {(selectedNode.snapshotNodes?.length ?? 0)}n · {(selectedNode.snapshotLinks?.length ?? 0)}l loaded
          </div>
        )}

        <Section title="Resolve" />

        <Row label="Mode">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <ModeChip label="Off" active={resolveMode === 'none'} onClick={() => setResolveMode('none')} />
            <ModeChip label="Existing" active={resolveMode === 'existing'} onClick={() => setResolveMode('existing')} />
            <ModeChip label="Custom" active={resolveMode === 'custom'} onClick={() => setResolveMode('custom')} />
          </div>
        </Row>

        {resolveMode === 'existing' && (
          <Row label="Into">
            <select
              value={selectedNode.transformTargetNodeId ?? ''}
              onChange={(e) => updateNode(selectedNode.id, {
                transformMode: 'existing',
                transformTargetNodeId: e.target.value || null,
              })}
              disabled={!transformTargets.length}
              style={{
                ...SELECT_INPUT_STYLE,
                color: transformTargets.length ? 'var(--text-main)' : 'var(--text-dim)',
              }}
            >
              <option value="">Choose snapshot node…</option>
              {transformTargets.map((targetNode) => (
                <option key={targetNode.id} value={targetNode.id}>{targetNode.label ?? 'Untitled node'}</option>
              ))}
            </select>
          </Row>
        )}

        {resolveMode === 'custom' && (
          <>
            <Row label="Label">
              <TextInput
                value={selectedNode.transformTarget?.label ?? ''}
                onChange={value => updateResolveTarget({ label: value })}
              />
            </Row>
            <Row label="Shape">
              <select
                value={selectedNode.transformTarget?.shape ?? selectedNode.shape ?? 'rounded'}
                onChange={e => updateResolveTarget({
                  width: NODE_SHAPE_PRESETS[e.target.value]?.width ?? selectedNode.width ?? 150,
                  height: NODE_SHAPE_PRESETS[e.target.value]?.height ?? selectedNode.height ?? 52,
                  shape: e.target.value,
                  cornerRadius: NODE_SHAPE_PRESETS[e.target.value]?.cornerRadius ?? (e.target.value === 'pill' ? 999 : e.target.value === 'rectangle' ? 0 : 8),
                })}
                style={SELECT_INPUT_STYLE}
              >
                {NODE_SHAPE_OPTIONS.map((shape) => (
                  <option key={shape.key} value={shape.key}>{shape.label}</option>
                ))}
              </select>
            </Row>
            <Row label="Fill">
              <ColorInput
                value={selectedNode.transformTarget?.fill ?? selectedNode.fill}
                onChange={value => updateResolveTarget({ fill: value })}
              />
            </Row>
            <Row label="Border">
              <ColorInput
                value={selectedNode.transformTarget?.stroke ?? selectedNode.stroke}
                onChange={value => updateResolveTarget({ stroke: value })}
              />
            </Row>
            <Row label="Text">
              <ColorInput
                value={selectedNode.transformTarget?.textColor ?? selectedNode.textColor}
                onChange={value => updateResolveTarget({ textColor: value })}
              />
            </Row>
            <Row label="Border W">
              <NumberInput
                value={selectedNode.transformTarget?.strokeWidth ?? selectedNode.strokeWidth ?? 2}
                min={0}
                max={10}
                step={0.5}
                onChange={value => updateResolveTarget({ strokeWidth: value })}
              />
            </Row>
            <Row label="Badge">
              <ToggleInput
                checked={selectedNode.transformTarget?.showSubBadge ?? selectedNode.showSubBadge ?? true}
                onChange={value => updateResolveTarget({ showSubBadge: value })}
                label="Show sub badge"
              />
            </Row>
          </>
        )}

        {resolveMode !== 'none' && (
          <Row label="Timing">
            <div style={{ display: 'flex', gap: 6 }}>
              <ModeChip
                label="After spawn"
                active={selectedNode.transformStartTime == null}
                onClick={() => up('transformStartTime', null)}
              />
              <ModeChip
                label="Manual"
                active={selectedNode.transformStartTime != null}
                onClick={() => up('transformStartTime', getDefaultResolveStart(selectedNode))}
              />
            </div>
          </Row>
        )}

        {resolveMode !== 'none' && selectedNode.transformStartTime != null && (
          <Row label="Start">
            <NumberInput
              value={selectedNode.transformStartTime ?? getDefaultResolveStart(selectedNode)}
              min={0}
              max={120}
              step={0.05}
              onChange={value => up('transformStartTime', Math.max(0, Math.round(value * 100) / 100))}
            />
          </Row>
        )}

        {resolveMode !== 'none' && (
          <Row label="Duration">
            <NumberInput
              value={selectedNode.transformDuration ?? 0.4}
              min={0.1}
              max={5}
              step={0.05}
              onChange={value => up('transformDuration', value)}
            />
          </Row>
        )}

        {resolveMode === 'existing' && selectedNode.transformTargetNodeId && (
          <p style={{ color: 'var(--text-dim)', fontSize: 11, lineHeight: 1.5, marginBottom: 10 }}>
            This sub-diagram resolves into the selected snapshot node after its nested playback has completed.
          </p>
        )}

        {resolveMode === 'custom' && (
          <p style={{ color: 'var(--text-dim)', fontSize: 11, lineHeight: 1.5, marginBottom: 10 }}>
            Custom resolve changes the label and styling only. Shape and size do not morph yet.
          </p>
        )}

        <Section title="Playback" />

        <Row label="Badge">
          <ToggleInput
            checked={selectedNode.showSubBadge ?? true}
            onChange={value => up('showSubBadge', value)}
            label="Show sub badge"
          />
        </Row>

        <Row label="Popup">
          <ToggleInput
            checked={selectedNode.showPopupInPlayback ?? false}
            onChange={value => up('showPopupInPlayback', value)}
            label="Open nested view"
          />
        </Row>

        {selectedNode.showPopupInPlayback && (
          <>
            <Row label="Delay">
              <NumberInput
                value={selectedNode.popupDelay ?? 0.4}
                min={0}
                max={10}
                step={0.1}
                onChange={value => up('popupDelay', value)}
              />
            </Row>

            <Row label="Speed">
              <NumberInput
                value={selectedNode.popupPlaybackSpeed ?? 1}
                min={0.25}
                max={4}
                step={0.25}
                onChange={value => up('popupPlaybackSpeed', value)}
              />
            </Row>

            <Row label="Hold">
              <NumberInput
                value={selectedNode.popupHold ?? 0.9}
                min={0}
                max={10}
                step={0.1}
                onChange={value => up('popupHold', value)}
              />
            </Row>
          </>
        )}

        <div style={{ flex: 1 }} />
        <button
          onClick={() => removeNode(selectedNode.id)}
          style={{
            marginTop: 20,
            background: 'var(--danger-surface-soft)',
            border: '1px solid var(--danger-border-soft)',
            borderRadius: 6,
            color: 'var(--danger-bright)',
            padding: '6px 12px',
            fontSize: 12,
            cursor: 'pointer',
            width: '100%',
          }}
        >
          Delete sub-diagram
        </button>
      </div>
    );
  }

  if (selectedNode && selectedNode.type === 'monitor') {
    const up = (key, value) => updateNode(selectedNode.id, { [key]: value });

    // Available variables = all Variable nodes that declare a name.
    const variableNodes = nodes.filter(n => n.type === 'variable' && (n.variableLabel ?? '').trim());

    // The web of the chosen variable = nodes reachable downstream via outgoing links.
    const trackedVariable = variableNodes.find(n => n.id === selectedNode.variableNodeId) ?? null;
    const webNodeIds = new Set();
    if (trackedVariable) {
      const outgoing = new Map();
      for (const l of links) {
        if (!outgoing.has(l.fromId)) outgoing.set(l.fromId, []);
        outgoing.get(l.fromId).push(l);
      }
      const queue = [trackedVariable.id];
      const seen = new Set([trackedVariable.id]);
      while (queue.length) {
        const nid = queue.shift();
        for (const l of (outgoing.get(nid) ?? [])) {
          if (!seen.has(l.toId)) {
            seen.add(l.toId);
            webNodeIds.add(l.toId);
            queue.push(l.toId);
          }
        }
      }
    }

    // Watch candidates = nodes in the web that aren't already watched and aren't the variable itself.
    const watchedIds = new Set((selectedNode.monitorWatches ?? []).map(w => w.nodeId));
    const candidates = nodes.filter(n =>
      webNodeIds.has(n.id) &&
      !watchedIds.has(n.id) &&
      n.type !== 'monitor' &&
      n.type !== 'area' &&
      n.type !== 'mirror' &&
      n.type !== 'text'
    );

    return (
      <div style={wrap}>
        <Section title="Monitor" />
        <Row label="Title">
          <TextInput value={selectedNode.monitorTitle ?? ''} onChange={v => up('monitorTitle', v)} />
        </Row>
        <Row label="Initial">
          <TextInput value={selectedNode.initialValue ?? ''} onChange={v => up('initialValue', v)} />
        </Row>
        <Row label="Width">
          <NumberInput value={selectedNode.width} min={120} max={600} onChange={v => up('width', v)} />
        </Row>
        <Row label="Height">
          <NumberInput value={selectedNode.height} min={48} max={400} onChange={v => up('height', v)} />
        </Row>
        <Row label="Fill">
          <ColorInput value={selectedNode.fill} onChange={v => up('fill', v)} />
        </Row>
        <Row label="Border">
          <ColorInput value={selectedNode.stroke} onChange={v => up('stroke', v)} />
        </Row>
        <Row label="Text clr">
          <ColorInput value={selectedNode.textColor} onChange={v => up('textColor', v)} />
        </Row>
        <Row label="Font px">
          <NumberInput value={selectedNode.fontSize ?? 14} min={9} max={36} onChange={v => up('fontSize', v)} />
        </Row>

        <Section title="Variable" />
        <Row label="Track">
          <select
            value={selectedNode.variableNodeId ?? ''}
            onChange={(e) => setMonitorVariable(selectedNode.id, e.target.value || null)}
            style={SELECT_INPUT_STYLE}
          >
            <option value="">— pick variable —</option>
            {variableNodes.map(v => (
              <option key={v.id} value={v.id}>
                {(v.variableLabel || '').trim() || v.label}
              </option>
            ))}
          </select>
        </Row>
        {!trackedVariable && (
          <p style={{ color: 'var(--text-dim)', fontSize: 11, lineHeight: 1.5, marginBottom: 10 }}>
            Pick a variable to track. Watch candidates appear once a variable is chosen and connected to nodes downstream.
          </p>
        )}

        {trackedVariable && (
          <>
            <Section title="Watched Nodes" />
            <p style={{ color: 'var(--text-dim)', fontSize: 11, lineHeight: 1.5, marginBottom: 10 }}>
              The monitor updates as the variable's token passes each watched node. Templates use <code>{'{value}'}</code> and <code>{'{name}'}</code>.
            </p>
            {webNodeIds.size === 0 && (
              <p style={{ color: 'var(--text-dim)', fontSize: 11, marginBottom: 10 }}>
                The variable has no web yet — connect <strong>{(trackedVariable.variableLabel || trackedVariable.label || '').trim()}</strong> to another node with a link to build one.
              </p>
            )}
            {webNodeIds.size > 0 && (selectedNode.monitorWatches ?? []).length === 0 && (
              <p style={{ color: 'var(--text-dim)', fontSize: 11, marginBottom: 10 }}>
                No watched nodes yet — pick from the variable's web below.
              </p>
            )}
          </>
        )}
        {trackedVariable && (selectedNode.monitorWatches ?? []).map(watch => {
          const watchedNode = nodes.find(n => n.id === watch.nodeId);
          return (
            <div
              key={watch.id}
              style={{
                marginBottom: 10,
                padding: 10,
                borderRadius: 8,
                background: 'var(--panel-bg)',
                border: '1px solid var(--border-strong)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: 'var(--text-main)', fontSize: 11, fontWeight: 600 }}>
                  {watchedNode?.label ?? '(deleted)'}
                </span>
                <button
                  onClick={() => removeMonitorWatch(selectedNode.id, watch.id)}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border-strong)',
                    borderRadius: 4,
                    color: 'var(--text-muted)',
                    fontSize: 11,
                    cursor: 'pointer',
                    padding: '2px 8px',
                  }}
                >
                  Remove
                </button>
              </div>
              <Row label="Template">
                <TextInput
                  value={watch.template ?? '{value}'}
                  onChange={v => updateMonitorWatch(selectedNode.id, watch.id, { template: v })}
                />
              </Row>
            </div>
          );
        })}
        {trackedVariable && candidates.length > 0 && (
          <Row label="Add">
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) addMonitorWatch(selectedNode.id, e.target.value);
              }}
              style={SELECT_INPUT_STYLE}
            >
              <option value="">— pick node —</option>
              {candidates.map(n => (
                <option key={n.id} value={n.id}>{n.label || '(unnamed)'}</option>
              ))}
            </select>
          </Row>
        )}
        <button
          onClick={() => removeNode(selectedNode.id)}
          style={{
            marginTop: 14,
            background: 'var(--danger-surface-soft)',
            border: '1px solid var(--danger-border-soft)',
            borderRadius: 6,
            color: 'var(--danger-bright)',
            padding: '6px 12px',
            fontSize: 12,
            cursor: 'pointer',
            width: '100%',
          }}
        >
          Delete monitor
        </button>
      </div>
    );
  }

  if (selectedNode) {
    const up = (key, value) => updateNode(selectedNode.id, { [key]: value });
    const isMirror = isMirrorNode(selectedNode);
    const isTextNode = selectedNode.type === 'text';
    const transformTargets = nodes.filter(node => (
      node.id !== selectedNode.id &&
      node.type !== 'area' &&
      node.type !== 'mirror' &&
      node.type !== 'text'
    ));
    const resolveMode = getResolveMode(selectedNode);
    const activeTransformTarget = transformTargets.find(node => node.id === selectedNode.transformTargetNodeId) ?? null;
    const updateResolveTarget = (updates) => updateNode(selectedNode.id, {
      transformTarget: {
        ...buildResolveTargetFromNode(activeTransformTarget, selectedNode),
        ...(selectedNode.transformTarget ?? {}),
        ...updates,
      },
    });
    const setResolveMode = (mode) => {
      if (mode === 'custom') {
        updateNode(selectedNode.id, {
          transformMode: 'custom',
          transformTarget: {
            ...buildResolveTargetFromNode(activeTransformTarget, selectedNode),
            ...(selectedNode.transformTarget ?? {}),
          },
        });
        return;
      }
      updateNode(selectedNode.id, { transformMode: mode });
    };
    const mirrorSources = isMirror ? getMirrorSourceItems(selectedNode, nodes, links) : { sourceNodes: [], sourceLinks: [] };
    const textMorphs = isTextNode
      ? getNodeTextMorphs(selectedNode, {
          start: selectedNode.animStartTime ?? 0,
          duration: selectedNode.animDuration ?? 0.5,
        })
      : [];
    const updateTextMorphs = (nextMorphs) => updateNode(selectedNode.id, {
      textMorphs: normalizeTextMorphList(nextMorphs),
      morphText: '',
      morphMode: 'fade',
      morphStartDelay: null,
      morphStartTime: null,
      morphDuration: null,
    });
    const captureMirrorSources = () => {
      const state = useStore.getState();
      const selectionIds = [...new Set([...(state.selectedIds ?? []), state.selectedId].filter(Boolean))];
      const selectionPayload = getMirrorSelectionPayload(selectionIds, nodes, links, selectedNode.id);
      const hasSelectionSources = selectionPayload.sourceNodeIds.length > 0 || selectionPayload.sourceLinkIds.length > 0;
      const payload = hasSelectionSources
        ? selectionPayload
        : getMirrorOverlapPayload(selectedNode, nodes, links);
      captureMirrorSelection(selectedNode.id, [...payload.sourceNodeIds, ...payload.sourceLinkIds]);
    };

    return (
      <div style={wrap}>
        <Section title={isMirror ? 'Mirror' : isTextNode ? 'Text' : 'Node'} />

        {isMirror ? (
          <>
            <Row label="Mode">
              <div style={{ display: 'flex', gap: 6 }}>
                <ModeChip
                  label="Mirror"
                  active={(selectedNode.mirrorMode ?? 'mirror') === 'mirror'}
                  onClick={() => up('mirrorMode', 'mirror')}
                />
                <ModeChip
                  label="Exact"
                  active={selectedNode.mirrorMode === 'exact'}
                  onClick={() => up('mirrorMode', 'exact')}
                />
              </div>
            </Row>
            <Row label="Width">
              <NumberInput value={selectedNode.width} min={180} max={900} onChange={v => up('width', v)} />
            </Row>
            <Row label="Height">
              <NumberInput value={selectedNode.height} min={120} max={700} onChange={v => up('height', v)} />
            </Row>
            <Row label="Frame">
              <ColorInput value={selectedNode.stroke} onChange={v => up('stroke', v)} />
            </Row>
            <Row label="Selection">
              <button
                onClick={captureMirrorSources}
                style={{
                  background: 'var(--panel-bg)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 6,
                  color: 'var(--text-main)',
                  padding: '6px 10px',
                  fontSize: 11,
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                Use current selection
              </button>
            </Row>
            <p style={{ color: 'var(--text-dim)', fontSize: 11, lineHeight: 1.5, marginBottom: 10 }}>
              Geometry and timing follow the captured source objects. Text and color below can diverge inside this mirror.
            </p>
            <Section title="Source" />
            <p style={{ color: 'var(--text-dim)', fontSize: 11, lineHeight: 1.5, marginBottom: 10 }}>
              {mirrorSources.sourceNodes.length} node{mirrorSources.sourceNodes.length !== 1 ? 's' : ''} · {mirrorSources.sourceLinks.length} link{mirrorSources.sourceLinks.length !== 1 ? 's' : ''}
            </p>
            {mirrorSources.sourceNodes.map((sourceNode) => {
              const override = selectedNode.mirrorNodeOverrides?.[sourceNode.id] ?? {};
              return (
                <div
                  key={sourceNode.id}
                  style={{
                    marginBottom: 10,
                    padding: 10,
                    borderRadius: 8,
                    background: 'var(--panel-bg)',
                    border: '1px solid var(--border-strong)',
                  }}
                >
                  <div style={{ color: 'var(--text-main)', fontSize: 11, fontWeight: 600, marginBottom: 8 }}>
                    {sourceNode.label}
                  </div>
                  <Row label="Text">
                    <TextInput
                      value={override.label ?? sourceNode.label}
                      onChange={value => updateMirrorNodeOverride(selectedNode.id, sourceNode.id, { label: value })}
                    />
                  </Row>
                  <Row label="Text clr">
                    <ColorInput
                      value={override.textColor ?? sourceNode.textColor}
                      onChange={value => updateMirrorNodeOverride(selectedNode.id, sourceNode.id, { textColor: value })}
                    />
                  </Row>
                  {sourceNode.type !== 'text' && (
                    <>
                      <Row label="Fill">
                        <ColorInput
                          value={override.fill ?? sourceNode.fill}
                          onChange={value => updateMirrorNodeOverride(selectedNode.id, sourceNode.id, { fill: value })}
                        />
                      </Row>
                      <Row label="Border">
                        <ColorInput
                          value={override.stroke ?? sourceNode.stroke}
                          onChange={value => updateMirrorNodeOverride(selectedNode.id, sourceNode.id, { stroke: value })}
                        />
                      </Row>
                    </>
                  )}
                </div>
              );
            })}
            {mirrorSources.sourceLinks.length > 0 && <Section title="Link Colors" />}
            {mirrorSources.sourceLinks.map((sourceLink, index) => {
              const override = selectedNode.mirrorLinkOverrides?.[sourceLink.id] ?? {};
              const fromNode = nodes.find(node => node.id === sourceLink.fromId);
              const toNode = nodes.find(node => node.id === sourceLink.toId);
              return (
                <div
                  key={sourceLink.id}
                  style={{
                    marginBottom: 10,
                    padding: 10,
                    borderRadius: 8,
                    background: 'var(--panel-bg)',
                    border: '1px solid var(--border-strong)',
                  }}
                >
                  <div style={{ color: 'var(--text-main)', fontSize: 11, fontWeight: 600, marginBottom: 8 }}>
                    {fromNode?.label ?? `Link ${index + 1}`} → {toNode?.label ?? ''}
                  </div>
                  <Row label="Color">
                    <ColorInput
                      value={override.stroke ?? sourceLink.stroke}
                      onChange={value => updateMirrorLinkOverride(selectedNode.id, sourceLink.id, { stroke: value })}
                    />
                  </Row>
                </div>
              );
            })}

            <div style={{ flex: 1 }} />
            <button
              onClick={() => removeNode(selectedNode.id)}
              style={{
                marginTop: 20,
                background: 'var(--danger-surface-soft)',
                border: '1px solid var(--danger-border-soft)',
                borderRadius: 6,
                color: 'var(--danger-bright)',
                padding: '6px 12px',
                fontSize: 12,
                cursor: 'pointer',
                width: '100%',
              }}
            >
              Delete mirror
            </button>
          </>
        ) : (
          <>

        <Row label="Label">
          <TextInput value={selectedNode.label} onChange={v => up('label', v)} />
        </Row>
        {selectedNode.type === 'graph' && (
          <>
            <Row label="Formula">
              <TextInput value={selectedNode.formula ?? ''} onChange={v => up('formula', v)} />
            </Row>
            <p style={{ color: 'var(--text-dim)', fontSize: 11, lineHeight: 1.5, marginTop: -4, marginBottom: 8 }}>
              Enter either "y = …" or "y^2 = …". For elliptic curves use "y^2 = x^3 + a*x + b".
            </p>
            <Row label="Params">
              <TextInput value={selectedNode.graphParams ?? ''} onChange={v => up('graphParams', v)} />
            </Row>
            <Row label="X min">
              <NumberInput value={Number.isFinite(selectedNode.xMin) ? selectedNode.xMin : -10} min={-1000} max={1000} step={0.5} onChange={v => up('xMin', v)} />
            </Row>
            <Row label="X max">
              <NumberInput value={Number.isFinite(selectedNode.xMax) ? selectedNode.xMax : 10} min={-1000} max={1000} step={0.5} onChange={v => up('xMax', v)} />
            </Row>
            <Row label="Center X">
              <input
                type="text"
                value={Number.isFinite(selectedNode.centerX) ? String(selectedNode.centerX) : ''}
                placeholder="auto (0)"
                onChange={e => {
                  const s = e.target.value.trim();
                  if (s === '') up('centerX', null);
                  else {
                    const n = Number(s);
                    if (Number.isFinite(n)) up('centerX', n);
                  }
                }}
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: 'var(--panel-bg-3)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 5,
                  color: 'var(--text-main)',
                  padding: '5px 8px',
                  fontSize: 12,
                }}
              />
            </Row>
            <Row label="Y min">
              <input
                type="text"
                value={Number.isFinite(selectedNode.yMin) ? String(selectedNode.yMin) : ''}
                placeholder="auto"
                onChange={e => {
                  const s = e.target.value.trim();
                  if (s === '') up('yMin', null);
                  else {
                    const n = Number(s);
                    if (Number.isFinite(n)) up('yMin', n);
                  }
                }}
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: 'var(--panel-bg-3)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 5,
                  color: 'var(--text-main)',
                  padding: '5px 8px',
                  fontSize: 12,
                }}
              />
            </Row>
            <Row label="Y max">
              <input
                type="text"
                value={Number.isFinite(selectedNode.yMax) ? String(selectedNode.yMax) : ''}
                placeholder="auto"
                onChange={e => {
                  const s = e.target.value.trim();
                  if (s === '') up('yMax', null);
                  else {
                    const n = Number(s);
                    if (Number.isFinite(n)) up('yMax', n);
                  }
                }}
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: 'var(--panel-bg-3)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 5,
                  color: 'var(--text-main)',
                  padding: '5px 8px',
                  fontSize: 12,
                }}
              />
            </Row>
            <Row label="Center Y">
              <input
                type="text"
                value={Number.isFinite(selectedNode.centerY) ? String(selectedNode.centerY) : ''}
                placeholder="auto (0)"
                onChange={e => {
                  const s = e.target.value.trim();
                  if (s === '') up('centerY', null);
                  else {
                    const n = Number(s);
                    if (Number.isFinite(n)) up('centerY', n);
                  }
                }}
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: 'var(--panel-bg-3)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 5,
                  color: 'var(--text-main)',
                  padding: '5px 8px',
                  fontSize: 12,
                }}
              />
            </Row>
            <Row label="Samples">
              <NumberInput value={Number.isFinite(selectedNode.samples) ? selectedNode.samples : 400} min={50} max={2000} step={10} onChange={v => up('samples', v)} />
            </Row>
            <Row label="Axes">
              <ToggleInput checked={selectedNode.showAxes ?? true} onChange={v => up('showAxes', v)} label="Show axes" />
            </Row>
            <Row label="Coords">
              <ToggleInput checked={!!selectedNode.showCoords} onChange={v => up('showCoords', v)} label="Show coordinates (hover)" />
            </Row>
            {/* Points now appear at runtime based on vector playback when Sequential is enabled */}

            <Section title="Vectors" />
            <Row label="Color">
              <ColorInput value={selectedNode.vectorColorDefault ?? '#FFFFFF'} onChange={v => up('vectorColorDefault', v)} />
            </Row>
            <Row label="Width">
              <NumberInput value={Number.isFinite(selectedNode.vectorWidthDefault) ? selectedNode.vectorWidthDefault : 1.5} min={0.5} max={10} step={0.1} onChange={v => up('vectorWidthDefault', Math.max(0.5, v))} />
            </Row>
            <Row label="Head L">
              <NumberInput value={Number.isFinite(selectedNode.vectorHeadLengthDefault) ? selectedNode.vectorHeadLengthDefault : 8} min={1} max={40} step={1} onChange={v => up('vectorHeadLengthDefault', Math.max(1, v))} />
            </Row>
            <Row label="Head W">
              <NumberInput value={Number.isFinite(selectedNode.vectorHeadWidthDefault) ? selectedNode.vectorHeadWidthDefault : 8} min={1} max={40} step={1} onChange={v => up('vectorHeadWidthDefault', Math.max(1, v))} />
            </Row>
            <Row label="Speed">
              <NumberInput
                value={Number.isFinite(selectedNode.vectorSpeed) ? selectedNode.vectorSpeed : 0.2}
                min={0.01}
                max={10}
                step={0.01}
                onChange={v => up('vectorSpeed', Math.max(0.01, v))}
              />
              <span style={{ color: 'var(--text-dim)', fontSize: 11, marginLeft: 4 }}>s</span>
            </Row>
            <Row label="Chain">
              <ToggleInput checked={!!selectedNode.graphChainPlayback} onChange={v => up('graphChainPlayback', v)} label="Chain points & vectors (join all points)" />
            </Row>

            <Section title="Point Defaults" />
            <Row label="Size">
              <NumberInput value={Number.isFinite(selectedNode.graphPointSizeDefault) ? selectedNode.graphPointSizeDefault : 4} min={1} max={24} step={1} onChange={v => up('graphPointSizeDefault', Math.max(1, v))} />
            </Row>
            <Row label="Fill">
              <ColorInput value={selectedNode.graphPointFillDefault ?? '#A66BFF'} onChange={v => up('graphPointFillDefault', v)} />
            </Row>
            <Row label="Stroke">
              <ColorInput value={selectedNode.graphPointStrokeDefault ?? '#FFFFFF'} onChange={v => up('graphPointStrokeDefault', v)} />
            </Row>

            <Section title="Points" />
            {(selectedNode.graphPoints ?? []).length === 0 && (
              <p style={{ color: 'var(--text-dim)', fontSize: 11, marginBottom: 8 }}>Shift+click on the graph to add a point. Alt+click a point to remove it.</p>
            )}
            {(selectedNode.graphPoints ?? []).map((pt, idx) => (
              <div key={pt.id} style={{
                marginBottom: 8,
                padding: 8,
                borderRadius: 8,
                background: 'var(--panel-bg)',
                border: '1px solid var(--border-strong)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: 'var(--text-main)', fontSize: 11, fontWeight: 600 }}>Point {idx + 1}</span>
                  <button
                    onClick={() => updateNode(selectedNode.id, { graphPoints: (selectedNode.graphPoints ?? []).filter(p => p.id !== pt.id) })}
                    style={{ background: 'none', border: '1px solid var(--border-strong)', borderRadius: 4, color: 'var(--danger-bright)', fontSize: 10, padding: '2px 8px', cursor: 'pointer' }}
                  >
                    Remove
                  </button>
                </div>
                <Row label="X">
                  <NumberInput value={pt.x} min={-1e6} max={1e6} step={0.05} onChange={v => {
                    const next = (selectedNode.graphPoints ?? []).map(p => p.id === pt.id ? { ...p, x: v } : p);
                    updateNode(selectedNode.id, { graphPoints: next });
                  }} />
                </Row>
                <Row label="Y">
                  <NumberInput value={pt.y} min={-1e6} max={1e6} step={0.05} onChange={v => {
                    const next = (selectedNode.graphPoints ?? []).map(p => p.id === pt.id ? { ...p, y: v } : p);
                    updateNode(selectedNode.id, { graphPoints: next });
                  }} />
                </Row>
                {/* In chain mode, point timing is derived from vectorSpeed; otherwise, per-point keyframes apply. */}
                <Row label="Size">
                  <NumberInput value={Number.isFinite(pt.size) ? pt.size : (selectedNode.graphPointSizeDefault ?? 4)} min={1} max={24} step={1} onChange={v => {
                    const next = (selectedNode.graphPoints ?? []).map(p => p.id === pt.id ? { ...p, size: Math.max(1, v) } : p);
                    updateNode(selectedNode.id, { graphPoints: next });
                  }} />
                </Row>
                <Row label="Fill">
                  <ColorInput value={pt.fill ?? (selectedNode.graphPointFillDefault ?? '#A66BFF')} onChange={v => {
                    const next = (selectedNode.graphPoints ?? []).map(p => p.id === pt.id ? { ...p, fill: v } : p);
                    updateNode(selectedNode.id, { graphPoints: next });
                  }} />
                </Row>
                <Row label="Stroke">
                  <ColorInput value={pt.stroke ?? (selectedNode.graphPointStrokeDefault ?? '#FFFFFF')} onChange={v => {
                    const next = (selectedNode.graphPoints ?? []).map(p => p.id === pt.id ? { ...p, stroke: v } : p);
                    updateNode(selectedNode.id, { graphPoints: next });
                  }} />
                </Row>

                {/* Per-point vectors */}
                {(() => {
                  const pts = selectedNode.graphPoints ?? [];
                  const others = pts.filter(p => p.id !== pt.id);
                  const outgoing = (selectedNode.graphVectors ?? []).filter(v => v.fromId === pt.id);
                  return (
                    <div style={{ marginTop: 6 }}>
                      <Row label="Vector to">
                        <select
                          value={''}
                          disabled={others.length === 0}
                          onChange={(e) => {
                            const toId = e.target.value || null;
                            if (!toId) return;
                            const cur = selectedNode.graphVectors ?? [];
                            if (cur.some(v => v.fromId === pt.id && v.toId === toId)) return; // avoid duplicates
                            const next = [ ...cur, { id: uuid(), fromId: pt.id, toId } ];
                            updateNode(selectedNode.id, { graphVectors: next });
                          }}
                          style={SELECT_INPUT_STYLE}
                        >
                          <option value="">{others.length ? 'Add vector…' : 'No other points'}</option>
                          {others.map((p, i) => (
                            <option key={p.id} value={p.id}>Point {pts.findIndex(x => x.id === p.id) + 1} ({(p.x ?? 0).toFixed(2)}, {(p.y ?? 0).toFixed(2)})</option>
                          ))}
                        </select>
                      </Row>
                      {outgoing.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {outgoing.map(v => {
                            const toIdx = pts.findIndex(p => p.id === v.toId);
                            return (
                              <div key={v.id} style={{ display: 'grid', gridTemplateColumns: '1fr 72px 86px 86px 86px auto', alignItems: 'center', gap: 6, marginLeft: 72 }}>
                                <span style={{ color: 'var(--text-main)', fontSize: 11 }}>
                                  → Point {toIdx >= 0 ? toIdx + 1 : '?'}
                                </span>
                                <input
                                  type="color"
                                  value={v.color ?? (selectedNode.vectorColorDefault ?? '#FFFFFF')}
                                  onChange={e => {
                                    const next = (selectedNode.graphVectors ?? []).map(x => x.id === v.id ? { ...x, color: e.target.value } : x);
                                    updateNode(selectedNode.id, { graphVectors: next });
                                  }}
                                  style={{ width: 28, height: 20, padding: 0, border: '1px solid var(--border-strong)', borderRadius: 4, background: 'transparent', cursor: 'pointer' }}
                                />
                                <input
                                  type="number"
                                  value={Number.isFinite(v.width) ? v.width : (selectedNode.vectorWidthDefault ?? 1.5)}
                                  min={0.5}
                                  max={10}
                                  step={0.1}
                                  onChange={e => {
                                    const n = Number(e.target.value);
                                    const next = (selectedNode.graphVectors ?? []).map(x => x.id === v.id ? { ...x, width: Math.max(0.5, n) } : x);
                                    updateNode(selectedNode.id, { graphVectors: next });
                                  }}
                                  style={{ width: 86, background: 'var(--panel-bg)', border: '1px solid var(--border-strong)', borderRadius: 4, color: 'var(--text-main)', padding: '3px 7px', fontSize: 12 }}
                                />
                                <input
                                  type="number"
                                  value={Number.isFinite(v.headLength) ? v.headLength : (selectedNode.vectorHeadLengthDefault ?? 8)}
                                  min={1}
                                  max={40}
                                  step={1}
                                  onChange={e => {
                                    const n = Number(e.target.value);
                                    const next = (selectedNode.graphVectors ?? []).map(x => x.id === v.id ? { ...x, headLength: Math.max(1, n) } : x);
                                    updateNode(selectedNode.id, { graphVectors: next });
                                  }}
                                  style={{ width: 86, background: 'var(--panel-bg)', border: '1px solid var(--border-strong)', borderRadius: 4, color: 'var(--text-main)', padding: '3px 7px', fontSize: 12 }}
                                />
                                <input
                                  type="number"
                                  value={Number.isFinite(v.headWidth) ? v.headWidth : (selectedNode.vectorHeadWidthDefault ?? 8)}
                                  min={1}
                                  max={40}
                                  step={1}
                                  onChange={e => {
                                    const n = Number(e.target.value);
                                    const next = (selectedNode.graphVectors ?? []).map(x => x.id === v.id ? { ...x, headWidth: Math.max(1, n) } : x);
                                    updateNode(selectedNode.id, { graphVectors: next });
                                  }}
                                  style={{ width: 86, background: 'var(--panel-bg)', border: '1px solid var(--border-strong)', borderRadius: 4, color: 'var(--text-main)', padding: '3px 7px', fontSize: 12 }}
                                />
                                <button
                                  onClick={() => updateNode(selectedNode.id, { graphVectors: (selectedNode.graphVectors ?? []).filter(x => x.id !== v.id) })}
                                  style={{ background: 'none', border: '1px solid var(--border-strong)', borderRadius: 4, color: 'var(--danger-bright)', fontSize: 10, padding: '2px 8px', cursor: 'pointer', justifySelf: 'end' }}
                                >
                                  Remove
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            ))}
          </>
        )}
        {!isTextNode && (
          <Row label="Shape">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {NODE_SHAPE_OPTIONS.map((shape) => (
                <ModeChip
                  key={shape.key}
                  label={shape.label}
                  active={(selectedNode.shape ?? 'rounded') === shape.key}
                  onClick={() => updateNode(selectedNode.id, NODE_SHAPE_PRESETS[shape.key])}
                />
              ))}
            </div>
          </Row>
        )}
        <Row label="Text">
          <ColorInput value={selectedNode.textColor} onChange={v => up('textColor', v)} />
        </Row>
        {isTextNode && (
          <Row label="Animate">
            <div style={{ display: 'flex', gap: 6 }}>
              <ModeChip
                label="Fade in"
                active={(selectedNode.textAnimMode ?? 'fade') === 'fade'}
                onClick={() => up('textAnimMode', 'fade')}
              />
              <ModeChip
                label="Write out"
                active={selectedNode.textAnimMode === 'write'}
                onClick={() => up('textAnimMode', 'write')}
              />
            </div>
          </Row>
        )}
        <Row label="Font size">
          <NumberInput value={selectedNode.fontSize} min={8} max={36} onChange={v => up('fontSize', v)} />
        </Row>
        {isTextNode ? (
          <>
            <Row label="Area X">
              <NumberInput value={selectedNode.textPadX ?? 14} min={6} max={80} onChange={v => up('textPadX', v)} />
            </Row>
            <Row label="Area Y">
              <NumberInput value={selectedNode.textPadY ?? 8} min={4} max={60} onChange={v => up('textPadY', v)} />
            </Row>
            <p style={{ color: 'var(--text-dim)', fontSize: 11, lineHeight: 1.5, marginBottom: 10 }}>
              Area controls the invisible zone around the text where links can attach.
            </p>
            <Section title="Morphs" />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>
                Each morph gets its own block in the timeline on this text row.
              </span>
              <button
                onClick={() => updateTextMorphs([
                  ...textMorphs,
                  {
                    id: uuid(),
                    text: '',
                    mode: 'fade',
                    startTime: Math.round(getNextTextMorphStart(selectedNode, {
                      start: selectedNode.animStartTime ?? 0,
                      duration: selectedNode.animDuration ?? 0.5,
                    }) * 100) / 100,
                    duration: Math.max(0.4, selectedNode.animDuration ?? 0.5),
                  },
                ])}
                style={{
                  background: 'var(--panel-bg)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 6,
                  color: 'var(--text-main)',
                  padding: '5px 8px',
                  fontSize: 11,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                Add morph
              </button>
            </div>
            {!textMorphs.length && (
              <p style={{ color: 'var(--text-dim)', fontSize: 11, lineHeight: 1.5, marginBottom: 10 }}>
                Add a morph here, then drag its block in the timeline to place it exactly when you want it to happen.
              </p>
            )}
            {textMorphs.map((morph, index) => (
              <div
                key={morph.id}
                style={{
                  marginBottom: 10,
                  padding: 10,
                  borderRadius: 8,
                  background: 'var(--panel-bg)',
                  border: '1px solid var(--border-strong)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ color: 'var(--text-main)', fontSize: 11, fontWeight: 600 }}>
                    Morph {index + 1}
                  </span>
                  <button
                    onClick={() => updateTextMorphs(textMorphs.filter(item => item.id !== morph.id))}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--danger-bright)',
                      cursor: 'pointer',
                      fontSize: 11,
                      padding: 0,
                    }}
                  >
                    Remove
                  </button>
                </div>
                <Row label="To">
                  <TextInput
                    value={morph.text}
                    onChange={value => updateTextMorphs(textMorphs.map(item => (
                      item.id === morph.id ? { ...item, text: value } : item
                    )))}
                  />
                </Row>
                <Row label="Mode">
                  <div style={{ display: 'flex', gap: 6 }}>
                    <ModeChip
                      label="Fade"
                      active={morph.mode === 'fade'}
                      onClick={() => updateTextMorphs(textMorphs.map(item => (
                        item.id === morph.id ? { ...item, mode: 'fade' } : item
                      )))}
                    />
                    <ModeChip
                      label="Write"
                      active={morph.mode === 'write'}
                      onClick={() => updateTextMorphs(textMorphs.map(item => (
                        item.id === morph.id ? { ...item, mode: 'write' } : item
                      )))}
                    />
                  </div>
                </Row>
                <div style={{ color: 'var(--text-dim)', fontSize: 10, lineHeight: 1.4 }}>
                  Timeline: {morph.startTime.toFixed(2)}s for {morph.duration.toFixed(2)}s
                </div>
              </div>
            ))}
          </>
        ) : (
          <>
            <Row label="Fill">
              <ColorInput value={selectedNode.fill} onChange={v => up('fill', v)} />
            </Row>
            <Row label="Border">
              <ColorInput value={selectedNode.stroke} onChange={v => up('stroke', v)} />
            </Row>
            <Row label="Width">
              <NumberInput value={selectedNode.width} min={60} max={500} onChange={v => up('width', v)} />
            </Row>
            <Row label="Height">
              <NumberInput value={selectedNode.height} min={28} max={300} onChange={v => up('height', v)} />
            </Row>
            <Row label="Radius">
              <NumberInput value={selectedNode.cornerRadius} min={0} max={60} onChange={v => up('cornerRadius', v)} />
            </Row>
            <Row label="Border W">
              <NumberInput value={selectedNode.strokeWidth} min={0} max={10} onChange={v => up('strokeWidth', v)} />
            </Row>

            {/* Tokens passing through this node — quick access to per-variable token appearance and flow control */}
            {(() => {
              const webs = computeVariableWebs(nodes, links);
              const passing = webs.filter(w => w.arrivalAtNode && w.arrivalAtNode[selectedNode.id] != null);
              if (passing.length === 0) return null;
              return (
                <>
                  <Section title="Tokens Through Node" />
                  <p style={{ color: 'var(--text-dim)', fontSize: 11, lineHeight: 1.5, marginBottom: 10 }}>
                    Edit each variable’s token appearance without leaving this node. You can also stop a token here so it doesn’t continue downstream.
                  </p>
                  {passing
                    .sort((a, b) => (a.variableLabel || a.displayText || '').localeCompare(b.variableLabel || b.displayText || ''))
                    .map(web => {
                      const v = nodes.find(n => n.id === web.sourceNodeId);
                      if (!v) return null;
                      const eff = (key) => v[key] != null ? v[key] : simOpt[key];
                      const hasAny = ['tokenShape','tokenSize','tokenFill','tokenStroke','tokenTextColor','tokenTextSize'].some(k => v[k] != null);
                      const killMap = selectedNode.tokenKillFor ?? {};
                      const isKilledHere = !!killMap[v.id];
                      return (
                        <div
                          key={`token-overrides-${web.sourceNodeId}`}
                          style={{
                            marginBottom: 10,
                            padding: 10,
                            borderRadius: 8,
                            background: 'var(--panel-bg)',
                            border: '1px solid var(--border-strong)',
                          }}
                        >
                          <div style={{ color: 'var(--text-main)', fontSize: 11, fontWeight: 600, marginBottom: 8 }}>
                            {(v.variableLabel || v.label || '').trim() || 'Variable'} token
                          </div>
                          <Row label="Flow">
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              <button
                                onClick={() => {
                                  const cur = { ...(selectedNode.tokenKillFor ?? {}) };
                                  if (isKilledHere) delete cur[v.id]; else cur[v.id] = true;
                                  updateNode(selectedNode.id, { tokenKillFor: cur });
                                }}
                                style={{
                                  background: isKilledHere ? 'var(--danger-surface-soft)' : 'var(--panel-bg)',
                                  border: `1px solid ${isKilledHere ? 'var(--danger-border-soft)' : 'var(--border-strong)'}`,
                                  borderRadius: 6,
                                  color: isKilledHere ? 'var(--danger-bright)' : 'var(--text-muted)',
                                  fontSize: 11,
                                  padding: '5px 8px',
                                  cursor: 'pointer',
                                }}
                              >
                                {isKilledHere ? 'Allow through' : 'Kill token here'}
                              </button>
                              {isKilledHere && (
                                <span style={{ color: 'var(--danger-bright)', fontSize: 11 }}>
                                  Token stops at this node
                                </span>
                              )}
                            </div>
                          </Row>
                          <Row label="Lbl text">
                            <TextInput value={v.tokenText ?? ''} onChange={val => updateNode(v.id, { tokenText: val })} />
                          </Row>
                          <Row label="Shape">
                            <select
                              value={eff('tokenShape')}
                              onChange={e => updateNode(v.id, { tokenShape: e.target.value })}
                              style={SELECT_INPUT_STYLE}
                            >
                              <option value="circle">Circle</option>
                              <option value="square">Square</option>
                              <option value="diamond">Diamond</option>
                            </select>
                          </Row>
                          <Row label="Size">
                            <NumberInput value={eff('tokenSize')} min={2} max={24} onChange={val => updateNode(v.id, { tokenSize: val })} />
                          </Row>
                          <Row label="Fill">
                            <ColorInput value={eff('tokenFill')} onChange={val => updateNode(v.id, { tokenFill: val })} />
                          </Row>
                          <Row label="Border">
                            <ColorInput value={eff('tokenStroke')} onChange={val => updateNode(v.id, { tokenStroke: val })} />
                          </Row>
                          <Row label="Lbl clr">
                            <ColorInput value={eff('tokenTextColor')} onChange={val => updateNode(v.id, { tokenTextColor: val })} />
                          </Row>
                          <Row label="Lbl size">
                            <NumberInput value={eff('tokenTextSize')} min={8} max={24} onChange={val => updateNode(v.id, { tokenTextSize: val })} />
                          </Row>
                          {hasAny && (
                            <button
                              onClick={() => updateNode(v.id, {
                                tokenText: null, tokenShape: null, tokenSize: null, tokenFill: null,
                                tokenStroke: null, tokenTextColor: null, tokenTextSize: null,
                              })}
                              style={{
                                background: 'var(--panel-bg)', border: '1px solid var(--border-strong)',
                                borderRadius: 6, color: 'var(--text-muted)', padding: '5px 8px',
                                fontSize: 11, cursor: 'pointer', width: '100%', marginTop: 6,
                              }}
                            >
                              Reset to global default
                            </button>
                          )}
                        </div>
                      );
                    })}
                </>
              );
            })()}
            {!isTextNode && (
              <>
                <Section title="Popup" />
                <Row label="Popup">
                  <ToggleInput
                    checked={selectedNode.showSimplePopupInPlayback ?? false}
                    onChange={value => up('showSimplePopupInPlayback', value)}
                    label="Show simple popup"
                  />
                </Row>
                <Row label="Value">
                  <TextInput
                    value={selectedNode.popupValue ?? ''}
                    onChange={v => up('popupValue', v)}
                  />
                </Row>
                <Row label="Tab color">
                  <ColorInput
                    value={selectedNode.popupFill ?? selectedNode.fill}
                    onChange={v => up('popupFill', v)}
                  />
                </Row>
                <Row label="Width">
                  <NumberInput
                    value={Number.isFinite(selectedNode.popupWidth) ? selectedNode.popupWidth : selectedNode.width}
                    min={24}
                    max={800}
                    step={1}
                    onChange={value => up('popupWidth', Math.max(24, value))}
                  />
                </Row>
                <Row label="Height">
                  <NumberInput
                    value={Number.isFinite(selectedNode.popupHeight) ? selectedNode.popupHeight : 48}
                    min={18}
                    max={400}
                    step={1}
                    onChange={value => up('popupHeight', Math.max(18, value))}
                  />
                </Row>
                {selectedNode.showSimplePopupInPlayback && (
                  <>
                    <Row label="Delay">
                      <NumberInput
                        value={selectedNode.simplePopupDelay ?? 0.2}
                        min={0}
                        max={10}
                        step={0.05}
                        onChange={value => up('simplePopupDelay', value)}
                      />
                    </Row>
                    <Row label="Length">
                      <NumberInput
                        value={selectedNode.simplePopupDuration ?? 0.7}
                        min={0.1}
                        max={10}
                        step={0.05}
                        onChange={value => up('simplePopupDuration', value)}
                      />
                    </Row>
                    <Row label="Stay popped up?">
                      <ToggleInput
                        checked={selectedNode.popupStayOpen ?? false}
                        onChange={value => up('popupStayOpen', value)}
                        label="Keep open after it appears"
                      />
                    </Row>
                  </>
                )}
              </>
            )}
          </>
        )}

        {selectedNode.type === 'variable' && (
          <>
            <Section title="Variable" />
            <Row label="Name">
              <TextInput value={selectedNode.variableLabel ?? ''} onChange={v => up('variableLabel', v)} />
            </Row>
            <Row label="Value">
              <TextInput value={selectedNode.variableValue ?? ''} onChange={v => up('variableValue', v)} />
            </Row>
            <Row label="Input">
              <div style={{ display: 'flex', gap: 6 }}>
                <ModeChip
                  label="Visual"
                  active={(selectedNode.inputMode ?? 'visual') === 'visual'}
                  onClick={() => up('inputMode', 'visual')}
                />
                <ModeChip
                  label="Silent"
                  active={selectedNode.inputMode === 'silent'}
                  onClick={() => up('inputMode', 'silent')}
                />
              </div>
            </Row>
            <p style={{ color: 'var(--text-dim)', fontSize: 11, lineHeight: 1.5, marginBottom: 10 }}>
              The variable's web is every node reachable through outgoing links. Visual draws a token along that web; Silent propagates the value to monitors without a visible token.
            </p>

            <Section title="Token Appearance" />
            <p style={{ color: 'var(--text-dim)', fontSize: 11, lineHeight: 1.5, marginBottom: 10 }}>
              These overrides apply only to <strong>this variable's</strong> token. Cleared fields fall back to the global default (empty-selection panel).
            </p>
            {(() => {
              const eff = (key) => selectedNode[key] != null ? selectedNode[key] : simOpt[key];
              const has = (key) => selectedNode[key] != null;
              return (
                <>
                  <Row label="Lbl text">
                    <TextInput value={selectedNode.tokenText ?? ''} onChange={v => up('tokenText', v)} />
                  </Row>
                  <Row label="Shape">
                    <select
                      value={eff('tokenShape')}
                      onChange={e => up('tokenShape', e.target.value)}
                      style={SELECT_INPUT_STYLE}
                    >
                      <option value="circle">Circle</option>
                      <option value="square">Square</option>
                      <option value="diamond">Diamond</option>
                    </select>
                  </Row>
                  <Row label="Size">
                    <NumberInput value={eff('tokenSize')} min={2} max={24} onChange={v => up('tokenSize', v)} />
                  </Row>
                  <Row label="Fill">
                    <ColorInput value={eff('tokenFill')} onChange={v => up('tokenFill', v)} />
                  </Row>
                  <Row label="Border">
                    <ColorInput value={eff('tokenStroke')} onChange={v => up('tokenStroke', v)} />
                  </Row>
                  <Row label="Lbl clr">
                    <ColorInput value={eff('tokenTextColor')} onChange={v => up('tokenTextColor', v)} />
                  </Row>
                  <Row label="Lbl size">
                    <NumberInput value={eff('tokenTextSize')} min={8} max={24} onChange={v => up('tokenTextSize', v)} />
                  </Row>
                  {(has('tokenText') || has('tokenShape') || has('tokenSize') || has('tokenFill') || has('tokenStroke') || has('tokenTextColor') || has('tokenTextSize')) && (
                    <button
                      onClick={() => updateNode(selectedNode.id, {
                        tokenText: null, tokenShape: null, tokenSize: null, tokenFill: null,
                        tokenStroke: null, tokenTextColor: null, tokenTextSize: null,
                      })}
                      style={{
                        background: 'var(--panel-bg)', border: '1px solid var(--border-strong)',
                        borderRadius: 6, color: 'var(--text-muted)', padding: '5px 8px',
                        fontSize: 11, cursor: 'pointer', width: '100%', marginBottom: 8,
                      }}
                    >
                      Reset to global default
                    </button>
                  )}
                </>
              );
            })()}
          </>
        )}

        {!isMirror && !isTextNode && (
          <>
            <Section title="Resolve" />
            <Row label="Mode">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <ModeChip label="Off" active={resolveMode === 'none'} onClick={() => setResolveMode('none')} />
                <ModeChip label="Existing" active={resolveMode === 'existing'} onClick={() => setResolveMode('existing')} />
                <ModeChip label="Custom" active={resolveMode === 'custom'} onClick={() => setResolveMode('custom')} />
              </div>
            </Row>

            {resolveMode === 'existing' && (
              <Row label="Into">
                <select
                  value={selectedNode.transformTargetNodeId ?? ''}
                  onChange={(e) => updateNode(selectedNode.id, {
                    transformMode: 'existing',
                    transformTargetNodeId: e.target.value || null,
                  })}
                  disabled={!transformTargets.length}
                  style={{
                    ...SELECT_INPUT_STYLE,
                    color: transformTargets.length ? 'var(--text-main)' : 'var(--text-dim)',
                  }}
                >
                  <option value="">Choose target node…</option>
                  {transformTargets.map((targetNode) => (
                    <option key={targetNode.id} value={targetNode.id}>{targetNode.label ?? 'Untitled node'}</option>
                  ))}
                </select>
              </Row>
            )}

            {resolveMode === 'custom' && (
              <>
                <Row label="Label">
                  <TextInput
                    value={selectedNode.transformTarget?.label ?? ''}
                    onChange={value => updateResolveTarget({ label: value })}
                  />
                </Row>
                <Row label="Shape">
                  <select
                    value={selectedNode.transformTarget?.shape ?? selectedNode.shape ?? 'rounded'}
                    onChange={e => updateResolveTarget({
                      width: NODE_SHAPE_PRESETS[e.target.value]?.width ?? selectedNode.width ?? 150,
                      height: NODE_SHAPE_PRESETS[e.target.value]?.height ?? selectedNode.height ?? 52,
                      shape: e.target.value,
                      cornerRadius: NODE_SHAPE_PRESETS[e.target.value]?.cornerRadius ?? (e.target.value === 'pill' ? 999 : e.target.value === 'rectangle' ? 0 : 8),
                    })}
                    style={SELECT_INPUT_STYLE}
                  >
                    {NODE_SHAPE_OPTIONS.map(s => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                </Row>
                <Row label="Fill">
                  <ColorInput
                    value={selectedNode.transformTarget?.fill ?? selectedNode.fill}
                    onChange={value => updateResolveTarget({ fill: value })}
                  />
                </Row>
                <Row label="Border">
                  <ColorInput
                    value={selectedNode.transformTarget?.stroke ?? selectedNode.stroke}
                    onChange={value => updateResolveTarget({ stroke: value })}
                  />
                </Row>
                <Row label="Text">
                  <ColorInput
                    value={selectedNode.transformTarget?.textColor ?? selectedNode.textColor}
                    onChange={value => updateResolveTarget({ textColor: value })}
                  />
                </Row>
                <Row label="Border W">
                  <NumberInput
                    value={selectedNode.transformTarget?.strokeWidth ?? selectedNode.strokeWidth ?? 2}
                    min={0}
                    max={10}
                    step={0.5}
                    onChange={value => updateResolveTarget({ strokeWidth: value })}
                  />
                </Row>
              </>
            )}

            {resolveMode !== 'none' && (
              <Row label="Timing">
                <div style={{ display: 'flex', gap: 6 }}>
                  <ModeChip
                    label="After spawn"
                    active={selectedNode.transformStartTime == null}
                    onClick={() => up('transformStartTime', null)}
                  />
                  <ModeChip
                    label="Manual"
                    active={selectedNode.transformStartTime != null}
                    onClick={() => up('transformStartTime', getDefaultResolveStart(selectedNode))}
                  />
                </div>
              </Row>
            )}

            {resolveMode !== 'none' && selectedNode.transformStartTime != null && (
              <Row label="Start">
                <NumberInput
                  value={selectedNode.transformStartTime ?? getDefaultResolveStart(selectedNode)}
                  min={0}
                  max={120}
                  step={0.05}
                  onChange={value => up('transformStartTime', Math.max(0, Math.round(value * 100) / 100))}
                />
              </Row>
            )}

            {resolveMode !== 'none' && (
              <Row label="Duration">
                <NumberInput
                  value={selectedNode.transformDuration ?? 0.4}
                  min={0.1}
                  max={5}
                  step={0.05}
                  onChange={value => up('transformDuration', value)}
                />
              </Row>
            )}

            {resolveMode === 'existing' && selectedNode.transformTargetNodeId && (
              <p style={{ color: 'var(--text-dim)', fontSize: 11, lineHeight: 1.5, marginBottom: 10 }}>
                This node transforms into the selected target node's shape, color, and label. Drag the amber block in the timeline to set when it happens.
              </p>
            )}

            {resolveMode === 'custom' && (
              <p style={{ color: 'var(--text-dim)', fontSize: 11, lineHeight: 1.5, marginBottom: 10 }}>
                Cross-fades to the target shape, fill, and label. Drag the amber block in the timeline to set the moment.
              </p>
            )}
          </>
        )}

        {selectedNode.triggerAfterLinkId && (
          <>
            <Section title="Spawn Timing" />
            <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
              <ModeChip
                label="While drawing"
                active={!selectedNode.triggerMode || selectedNode.triggerMode === 'overlap'}
                onClick={() => up('triggerMode', 'overlap')}
              />
              <ModeChip
                label="At completion"
                active={selectedNode.triggerMode === 'on-end'}
                onClick={() => up('triggerMode', 'on-end')}
              />
            </div>
            <p style={{ color: 'var(--text-dim)', fontSize: 10, lineHeight: 1.5, marginBottom: 8 }}>
              {(!selectedNode.triggerMode || selectedNode.triggerMode === 'overlap')
                ? 'Node fades in during the final portion of the link draw.'
                : 'Node starts appearing exactly when the link finishes.'}
            </p>
            <Row label="Delay">
              <NumberInput
                value={selectedNode.triggerDelay ?? 0}
                step={0.05}
                min={-2}
                max={5}
                onChange={v => up('triggerDelay', Math.round(v * 100) / 100)}
              />
              <span style={{ color: 'var(--text-dim)', fontSize: 11, marginLeft: 4 }}>s</span>
            </Row>
          </>
        )}

        <div style={{ flex: 1 }} />
        <button
          onClick={() => removeNode(selectedNode.id)}
          style={{
            marginTop: 20,
            background: 'var(--danger-surface-soft)',
            border: '1px solid var(--danger-border-soft)',
            borderRadius: 6,
            color: 'var(--danger-bright)',
            padding: '6px 12px',
            fontSize: 12,
            cursor: 'pointer',
            width: '100%',
          }}
        >
          Delete {isTextNode ? 'text' : 'node'}
        </button>
          </>
        )}
      </div>
    );
  }

  const updateSelectedJoint = (key, value) => {
    if (!selectedLink || !selectedJoint) return;
    updateLinkJoint(selectedLink.id, selectedJoint.id, { [key]: value });
  };

  const applyCurvePreset = (value) => {
    if (!selectedJoint || !selectedLink) return;
    updateLinkJoint(selectedLink.id, selectedJoint.id, {
      prevCurve: value,
      nextCurve: value,
    });
  };

  const handleJunctionSyncBranches = (value) => {
    if (!selectedJoint || !selectedLink) return;
    const syncGroupKey = `${selectedLink.id}::${selectedJoint.id}`;
    updateLinkJoint(selectedLink.id, selectedJoint.id, { syncBranches: value });
    const branchLinks = links.filter(link =>
      link.fromJunctionLinkId === selectedLink.id &&
      link.fromJunctionJointId === selectedJoint.id
    );
    if (!branchLinks.length) return;

    if (!value) {
      for (const branchLink of branchLinks) {
        updateLink(branchLink.id, { syncGroupKey: null });
      }
      return;
    }
    for (const branchLink of branchLinks) {
      updateLink(branchLink.id, { syncGroupKey, animStartTime: null });
    }
  };

  return (
    <div style={wrap}>
      <Section title="Link" />

      <LinkBasics
        linkLike={selectedLink}
        onUpdate={updates => {
          updateLink(selectedLink.id, updates);
          if (updates && Object.prototype.hasOwnProperty.call(updates, 'bindToTokenHop')) {
            if (updates.bindToTokenHop && (updates.autoTriggerTarget ?? selectedLink.autoTriggerTarget)) {
              // Auto-trigger target node on hop end if not already triggered
              const toNode = nodes.find(n => n.id === selectedLink.toId);
              if (toNode && !toNode.triggerAfterLinkId) {
                updateNode(toNode.id, { triggerAfterLinkId: selectedLink.id, triggerMode: 'on-end', animStartTime: null });
              }
            }
          }
          if (updates && Object.prototype.hasOwnProperty.call(updates, 'autoTriggerTarget')) {
            if (!updates.autoTriggerTarget) {
              const toNode = nodes.find(n => n.id === selectedLink.toId);
              if (toNode && toNode.triggerAfterLinkId === selectedLink.id) {
                updateNode(toNode.id, { triggerAfterLinkId: null });
              }
            } else {
              const toNode = nodes.find(n => n.id === selectedLink.toId);
              if (toNode && !toNode.triggerAfterLinkId) {
                updateNode(toNode.id, { triggerAfterLinkId: selectedLink.id, triggerMode: 'on-end', animStartTime: null });
              }
            }
          }
        }}
      />

      <Row label="Message">
        <TextInput value={selectedLink.messageLabel ?? ''} onChange={v => updateLink(selectedLink.id, { messageLabel: v })} />
      </Row>

      {(selectedLink.fromAnchorSide || selectedLink.toAnchorSide) && (
        <>
          <Section title="Anchors" />
          {selectedLink.fromAnchorSide && selectedLink.fromAnchorSide !== 'center' && (
            <>
              <SliderControl
                label={`Start ${selectedLink.fromAnchorSide}`}
                value={selectedLink.fromAlongPos ?? 0}
                min={-getAnchorLimit(selectedFromNode, selectedLink.fromAnchorSide)}
                max={getAnchorLimit(selectedFromNode, selectedLink.fromAnchorSide)}
                onChange={(value) => updateLink(selectedLink.id, {
                  fromAlongPos: value,
                  fromAnchorLockedCenter: Math.abs(value) < 0.5,
                })}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -4, marginBottom: 12 }}>
                <ActionButton
                  label="Center Start"
                  active={!!selectedLink.fromAnchorLockedCenter}
                  onClick={() => updateLink(selectedLink.id, {
                    fromAlongPos: 0,
                    fromAnchorLockedCenter: true,
                  })}
                />
              </div>
            </>
          )}
          {selectedLink.toAnchorSide && selectedLink.toAnchorSide !== 'center' && (
            <>
              <SliderControl
                label={`End ${selectedLink.toAnchorSide}`}
                value={selectedLink.toAlongPos ?? 0}
                min={-getAnchorLimit(selectedToNode, selectedLink.toAnchorSide)}
                max={getAnchorLimit(selectedToNode, selectedLink.toAnchorSide)}
                onChange={(value) => updateLink(selectedLink.id, {
                  toAlongPos: value,
                  toAnchorLockedCenter: Math.abs(value) < 0.5,
                })}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -4, marginBottom: 12 }}>
                <ActionButton
                  label="Center End"
                  active={!!selectedLink.toAnchorLockedCenter}
                  onClick={() => updateLink(selectedLink.id, {
                    toAlongPos: 0,
                    toAnchorLockedCenter: true,
                  })}
                />
              </div>
            </>
          )}
          <p style={{ color: 'var(--text-dim)', fontSize: 11, lineHeight: 1.5, marginBottom: 10 }}>
            Drag the link endpoints on canvas or use these sliders to place the anchor more precisely along the chosen side.
          </p>
        </>
      )}

      <Section title="Joints" />
      {selectedLink.joints?.length ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {selectedLink.joints.map((joint, index) => (
            <JointChip
              key={joint.id}
              joint={joint.isJunction ? `Junction ${index + 1}` : `Joint ${index + 1}`}
              isSelected={selectedJointId === joint.id}
              onClick={() => setSelectedJoint(joint.id)}
            />
          ))}
        </div>
      ) : (
        <p style={{ color: 'var(--text-dim)', fontSize: 11, lineHeight: 1.6, marginBottom: 12 }}>
          Right-click a link to add a joint. Joints reroute the link without creating new timeline items.
        </p>
      )}

      {selectedJoint && (
        <>
          <Row label="Size">
            <NumberInput value={selectedJoint.size ?? 0} min={0} max={18} step={1} onChange={v => updateSelectedJoint('size', Math.max(0, v))} />
          </Row>
          {selectedJoint.isJunction && (
            <Row label="Branches">
              <ToggleInput
                checked={!!selectedJoint.syncBranches}
                label="Start together"
                onChange={handleJunctionSyncBranches}
              />
            </Row>
          )}
          <Section title="Curvature" />
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <ModeChip label="Linked" active={curveMode === 'linked'} onClick={() => setCurveMode('linked')} />
            <ModeChip label="Split" active={curveMode === 'split'} onClick={() => setCurveMode('split')} />
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            <PresetChip label="Pipe" onClick={() => applyCurvePreset(0)} />
            <PresetChip label="Soft" onClick={() => applyCurvePreset(18)} />
            <PresetChip label="Round" onClick={() => applyCurvePreset(36)} />
          </div>

          {curveMode === 'linked' ? (
            <SliderControl
              label="Curve"
              value={jointCurve}
              onChange={(value) => {
                if (!selectedLink || !selectedJoint) return;
                updateLinkJoint(selectedLink.id, selectedJoint.id, {
                  prevCurve: value,
                  nextCurve: value,
                });
              }}
            />
          ) : (
            <>
              <SliderControl
                label="Into joint"
                value={selectedJoint.prevCurve ?? 0}
                onChange={value => updateSelectedJoint('prevCurve', value)}
              />
              <SliderControl
                label="Out of joint"
                value={selectedJoint.nextCurve ?? 0}
                onChange={value => updateSelectedJoint('nextCurve', value)}
              />
            </>
          )}
          <p style={{ color: 'var(--text-dim)', fontSize: 11, lineHeight: 1.5, marginBottom: 8 }}>
            Double-click a link to add a joint. Drag joints directly to route the link cleanly.
          </p>
          {selectedJoint.isJunction && (
            <p style={{ color: 'var(--text-dim)', fontSize: 11, lineHeight: 1.5, marginBottom: 8 }}>
              Junctions can branch new links. Drag the small + handle next to the junction to start a new link from it.
            </p>
          )}
          {selectedJoint.isJunction && (
            <p style={{ color: 'var(--text-dim)', fontSize: 11, lineHeight: 1.5, marginBottom: 8 }}>
              Turn on Start together if all auto-timed branch links from this junction should emerge at the same moment.
            </p>
          )}
          <p style={{ color: 'var(--text-dim)', fontSize: 11, lineHeight: 1.5, marginBottom: 8 }}>
            Linked keeps both sides matched. Switch to Split only when you want the curve to lean more into one side.
          </p>

          <button
            onClick={() => removeLinkJoint(selectedLink.id, selectedJoint.id)}
            style={{
              marginTop: 8,
              background: 'var(--warning-surface-soft)',
              border: '1px solid var(--warning-border-soft)',
              borderRadius: 6,
              color: 'var(--warning-bright)',
              padding: '6px 12px',
              fontSize: 12,
              cursor: 'pointer',
              width: '100%',
            }}
          >
            Remove joint
          </button>
        </>
      )}

      <div style={{ flex: 1 }} />
      <button
        onClick={() => removeLink(selectedLink.id)}
        style={{
          marginTop: 20,
          background: 'var(--danger-surface-soft)',
          border: '1px solid var(--danger-border-soft)',
          borderRadius: 6,
          color: 'var(--danger-bright)',
          padding: '6px 12px',
          fontSize: 12,
          cursor: 'pointer',
          width: '100%',
        }}
      >
        Delete link
      </button>
    </div>
  );
}

export default PropertiesPanel;
