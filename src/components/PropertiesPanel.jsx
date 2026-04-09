import React, { useEffect, useMemo, useState } from 'react';
import useStore from '../store/useStore';

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
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ position: 'relative', width: 28, height: 28 }}>
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
      <span style={{ color: 'var(--text-muted)', fontSize: 11, fontFamily: 'monospace' }}>{value}</span>
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
    </>
  );
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
    removeNode,
    removeLink,
    removeLinkJoint,
  } = useStore();

  const selectedNode = nodes.find(node => node.id === selectedId);
  const selectedLink = links.find(link => link.id === selectedId);
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
      </div>
    );
  }

  if (selectedNode) {
    const up = (key, value) => updateNode(selectedNode.id, { [key]: value });

    return (
      <div style={wrap}>
        <Section title="Node" />

        <Row label="Label">
          <TextInput value={selectedNode.label} onChange={v => up('label', v)} />
        </Row>
        <Row label="Fill">
          <ColorInput value={selectedNode.fill} onChange={v => up('fill', v)} />
        </Row>
        <Row label="Border">
          <ColorInput value={selectedNode.stroke} onChange={v => up('stroke', v)} />
        </Row>
        <Row label="Text">
          <ColorInput value={selectedNode.textColor} onChange={v => up('textColor', v)} />
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
        <Row label="Font size">
          <NumberInput value={selectedNode.fontSize} min={8} max={36} onChange={v => up('fontSize', v)} />
        </Row>
        <Row label="Border W">
          <NumberInput value={selectedNode.strokeWidth} min={0} max={10} onChange={v => up('strokeWidth', v)} />
        </Row>

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
          Delete node
        </button>
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

  return (
    <div style={wrap}>
      <Section title="Link" />

      <LinkBasics linkLike={selectedLink} onUpdate={updates => updateLink(selectedLink.id, updates)} />

      <Section title="Joints" />
      {selectedLink.joints?.length ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {selectedLink.joints.map((joint, index) => (
            <JointChip
              key={joint.id}
              joint={`Joint ${index + 1}`}
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
          <Section title="Curvature" />
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <ModeChip label="Linked" active={curveMode === 'linked'} onClick={() => setCurveMode('linked')} />
            <ModeChip label="Split" active={curveMode === 'split'} onClick={() => setCurveMode('split')} />
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            <PresetChip label="Sharp" onClick={() => applyCurvePreset(0)} />
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
