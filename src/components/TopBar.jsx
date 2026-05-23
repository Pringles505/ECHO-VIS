import React, { useState, useRef } from 'react';
import useStore from '../store/useStore';
import { exportToMP4 } from '../export/VideoExporter';
import {
  writeProject, downloadProjectFile,
  parseProjectFile,
} from '../projects/projectStore';

function TopBar({ stageRef, layerRef, onGoHome }) {
  const {
    nodes, links,
    activeProject, renameActiveProject, setActiveProject, loadProjectData,
    isExporting, exportProgress, exportStatus,
    setExporting, setExportProgress, setExportStatus,
    showGridLines, setShowGridLines,
    showSymmetryLines, setShowSymmetryLines,
    snapToSymmetryLines, setSnapToSymmetryLines,
  } = useStore();

  const fileInputRef   = useRef(null);
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal]         = useState('');

  const [resolution, setResolution] = useState('1080p');
  const [fps,        setFps]        = useState(30);

  const handleDownload = () => {
    if (!activeProject) return;
    downloadProjectFile({ version: 1, ...activeProject, nodes, links });
  };

  const handleOpenFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const project = parseProjectFile(ev.target.result);
        writeProject(project);
        setActiveProject({ id: project.id, name: project.name, createdAt: project.createdAt });
        loadProjectData({ nodes: project.nodes, links: project.links });
      } catch (err) {
        alert(`Could not open file:\n${err.message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const startRenameName = () => {
    setNameVal(activeProject?.name ?? '');
    setEditingName(true);
  };

  const commitName = () => {
    const name = nameVal.trim() || 'Untitled';
    renameActiveProject(name);
    if (activeProject) writeProject({ version: 1, ...activeProject, name, nodes, links });
    setEditingName(false);
  };

  const resMap = {
    '720p':  { w: 1280,  h: 720  },
    '1080p': { w: 1920,  h: 1080 },
    '1440p': { w: 2560,  h: 1440 },
  };

  const handleGenerate = async () => {
    if (!nodes.length) {
      alert('Add at least one node before generating.');
      return;
    }
    setExporting(true);
    setExportProgress(0);
    setExportStatus('Starting…');

    try {
      const { w, h } = resMap[resolution];
      await exportToMP4({
        stageRef,
        layerRef,
        nodes,
        links,
        fps: Number(fps),
        exportWidth:  w,
        exportHeight: h,
        onProgress: p => setExportProgress(p),
        onStatus:   s => setExportStatus(s),
      });
    } catch (err) {
      console.error('Export error:', err);
      alert(`Export failed:\n${err.message}`);
    } finally {
      setExporting(false);
      setExportStatus('');
    }
  };

  return (
    <div style={{
      height: 52,
      background: 'linear-gradient(180deg, var(--panel-bg-2), var(--panel-bg))',
      borderBottom: '1px solid var(--border-strong)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 14px',
      gap: 12,
      flexShrink: 0,
      position: 'relative',
      zIndex: 200,
      userSelect: 'none',
    }}>
      <button
        onClick={onGoHome}
        title="Back to projects"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'baseline',
          gap: 1,
          padding: '2px 4px',
          borderRadius: 5,
          marginRight: 4,
        }}
      >
        <span style={{ color: 'var(--purple-bright)', fontSize: 16, fontWeight: 800, letterSpacing: '0.06em' }}>ECHO</span>
        <span style={{ color: 'var(--blue-bright)', fontSize: 16, fontWeight: 300, letterSpacing: '0.06em' }}>VIS</span>
      </button>

      <Divider />

      {editingName ? (
        <input
          autoFocus
          value={nameVal}
          onChange={e => setNameVal(e.target.value)}
          onBlur={commitName}
          onKeyDown={e => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') setEditingName(false); }}
          style={{
            background: 'var(--panel-bg-3)',
            border: '1px solid var(--purple-border-soft)',
            borderRadius: 5,
            color: 'var(--text-main)',
            fontSize: 13,
            fontWeight: 600,
            padding: '3px 8px',
            width: 160,
          }}
        />
      ) : (
        <span
          onClick={startRenameName}
          title="Click to rename"
          style={{
            color: 'var(--text-main)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'text',
            maxWidth: 200,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {activeProject?.name ?? 'Untitled'}
        </span>
      )}

      <Divider />

      <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>
        {nodes.length} node{nodes.length !== 1 ? 's' : ''}
        <span style={{ margin: '0 6px', opacity: 0.5 }}>·</span>
        {links.length} link{links.length !== 1 ? 's' : ''}
      </span>

      <div style={{ flex: 1 }} />

      {!isExporting && (
        <>
          <ToggleChip
            label="Grid lines"
            enabled={showGridLines}
            onToggle={() => setShowGridLines(!showGridLines)}
          />
          <ToggleChip
            label="Symmetry lines"
            enabled={showSymmetryLines}
            onToggle={() => setShowSymmetryLines(!showSymmetryLines)}
          />
          <ToggleChip
            label="Snap to symmetry"
            enabled={snapToSymmetryLines}
            disabled={!showSymmetryLines}
            onToggle={() => setSnapToSymmetryLines(!snapToSymmetryLines)}
          />
          <Divider />
        </>
      )}

      {!isExporting && (
        <>
          <Select
            value={resolution}
            onChange={setResolution}
            options={['720p', '1080p', '1440p']}
          />
          <Select
            value={String(fps)}
            onChange={v => setFps(Number(v))}
            options={['24', '30', '60']}
            suffix="fps"
          />
          <Divider />
        </>
      )}

      {isExporting && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 8 }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 12, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {exportStatus}
          </span>
          <ProgressBar value={exportProgress} />
          <span style={{ color: 'var(--success-main)', fontSize: 12, minWidth: 34, textAlign: 'right' }}>
            {Math.round(exportProgress * 100)}%
          </span>
        </div>
      )}

      {!isExporting && (
        <>
          <button onClick={() => fileInputRef.current?.click()} style={{
            background: 'var(--panel-bg-3)',
            border: '1px solid var(--border-strong)',
            borderRadius: 8,
            color: 'var(--text-muted)',
            padding: '7px 13px',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}>
            Open
          </button>
          <button onClick={handleDownload} style={{
            background: 'var(--panel-bg-3)',
            border: '1px solid var(--border-strong)',
            borderRadius: 8,
            color: 'var(--text-muted)',
            padding: '7px 13px',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}>
            Download
          </button>
          <Divider />
        </>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".echoproj,.json"
        style={{ display: 'none' }}
        onChange={handleOpenFile}
      />

      <button
        onClick={handleGenerate}
        disabled={isExporting}
        style={{
          background:     isExporting ? 'var(--success-dark)' : 'var(--success-main)',
          color:          'var(--white)',
          border:         'none',
          borderRadius:   8,
          padding:        '8px 18px',
          fontSize:       13,
          fontWeight:     600,
          cursor:         isExporting ? 'not-allowed' : 'pointer',
          opacity:        isExporting ? 0.75 : 1,
          letterSpacing:  '0.02em',
          whiteSpace:     'nowrap',
          transition:     'background 0.15s',
        }}
      >
        {isExporting ? 'Generating…' : '▶  Generate MP4'}
      </button>
    </div>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 22, background: 'var(--border-strong)' }} />;
}

function ProgressBar({ value }) {
  return (
    <div style={{
      width: 100,
      height: 4,
      background: 'var(--panel-bg-3)',
      borderRadius: 2,
      overflow: 'hidden',
    }}>
      <div style={{
        width: `${Math.round(value * 100)}%`,
        height: '100%',
        background: 'linear-gradient(90deg, var(--success-main), var(--success-bright))',
        borderRadius: 2,
        transition: 'width 0.15s',
      }} />
    </div>
  );
}

function Select({ value, onChange, options, suffix = '' }) {
  return (
    <div style={{ position: 'relative' }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          background: 'var(--panel-bg)',
          border: '1px solid var(--border-strong)',
          borderRadius: 6,
          color: 'var(--text-muted)',
          padding: '4px 28px 4px 10px',
          fontSize: 12,
          cursor: 'pointer',
          appearance: 'none',
        }}
      >
        {options.map(o => (
          <option key={o} value={o}>{o}{suffix ? ' ' + suffix : ''}</option>
        ))}
      </select>
      <span style={{
        position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
        color: 'var(--text-dim)', fontSize: 9, pointerEvents: 'none',
      }}>▼</span>
    </div>
  );
}

function ToggleChip({ label, enabled, onToggle, disabled = false }) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: enabled ? 'var(--purple-surface-soft)' : 'var(--panel-bg)',
        border: `1px solid ${enabled ? 'var(--purple-border-soft)' : 'var(--border-strong)'}`,
        borderRadius: 999,
        color: enabled ? 'var(--text-main)' : 'var(--text-muted)',
        padding: '5px 10px',
        fontSize: 12,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      <span>{label}</span>
      <span style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: enabled ? 'var(--purple-bright)' : 'var(--text-faint)',
        boxShadow: enabled ? '0 0 10px var(--purple-glow)' : 'none',
      }} />
    </button>
  );
}

export default TopBar;
