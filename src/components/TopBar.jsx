import React, { useState, useRef } from 'react';
import useStore from '../store/useStore';
import { exportGifPackageZip } from '../export/GifPackageExporter';
import {
  writeProject, downloadProjectFile,
  parseProjectFile,
} from '../projects/projectStore';

function hexToRgb(hex) {
  const m = /^#?([a-f0-9]{6})$/i.exec(String(hex || '').trim());
  if (!m) return { r: 255, g: 0, b: 255 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// Bounding box of all pixels matching the placeholder marker colour (within
// tolerance) — that rectangle is where the animation gets composited.
function findPlaceholderRect(data, width, height, hex, tol = 48) {
  const { r: tr, g: tg, b: tb } = hexToRgb(hex);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 16) continue;
      if (
        Math.abs(data[i] - tr) <= tol
        && Math.abs(data[i + 1] - tg) <= tol
        && Math.abs(data[i + 2] - tb) <= tol
      ) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function TopBar({ stageRef, layerRef, onGoHome }) {
  const {
    nodes, links, slideBreaks, captureFrame,
    activeProject, renameActiveProject, setActiveProject, loadProjectData,
    isExporting, exportProgress, exportStatus,
    setExporting, setExportProgress, setExportStatus,
    showGridLines, setShowGridLines,
    showSymmetryLines, setShowSymmetryLines,
    snapToSymmetryLines, setSnapToSymmetryLines,
    snapToOrthogonal, setSnapToOrthogonal,
  } = useStore();

  const fileInputRef   = useRef(null);
  const slideTplInputRef = useRef(null);
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal]         = useState('');
  // Imported slide image + the colour marking where the animation should go.
  const [slideTpl, setSlideTpl] = useState(null); // { width, height, data, imageBytes, imageExt, bgColor, name }
  const [placeholderColor, setPlaceholderColor] = useState('#FF00FF');
  // Image keeps your original slide as the background with the diagram on top; Solid
  // colour is an alternative that stays crisp in Google Slides (which re-compresses
  // imported picture backgrounds).
  const [slideBgMode, setSlideBgMode] = useState('Image');

  const handleImportSlide = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);

      if (isSvg) {
        // Vector slide: rasterize at high resolution (no source-resolution ceiling) for
        // the PNG fallback, and keep the SVG itself so PowerPoint renders true vector.
        const svgBytes = new Uint8Array(await file.arrayBuffer());
        const svgText = new TextDecoder().decode(svgBytes);
        const blobUrl = URL.createObjectURL(new Blob([svgBytes], { type: 'image/svg+xml' }));
        const img = await new Promise((resolve, reject) => {
          const im = new Image();
          im.onload = () => resolve(im);
          im.onerror = () => reject(new Error('Could not load SVG'));
          im.src = blobUrl;
        });
        let natW = img.naturalWidth || 0;
        let natH = img.naturalHeight || 0;
        if (!natW || !natH) {
          const m = /viewBox\s*=\s*["']([\d.\-eE\s,]+)["']/i.exec(svgText);
          if (m) {
            const p = m[1].trim().split(/[\s,]+/).map(Number);
            if (p.length === 4 && p[2] > 0 && p[3] > 0) { natW = p[2]; natH = p[3]; }
          }
        }
        if (!natW || !natH) { natW = 1920; natH = 1080; }
        const renderW = Math.min(4096, Math.max(1920, Math.round(natW * 2)));
        const renderH = Math.max(1, Math.round(renderW * (natH / natW)));
        const canvas = document.createElement('canvas');
        canvas.width = renderW;
        canvas.height = renderH;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, renderW, renderH);
        URL.revokeObjectURL(blobUrl);
        const { data } = ctx.getImageData(0, 0, renderW, renderH);
        const bgColor = `#${[data[0], data[1], data[2]].map(v => v.toString(16).padStart(2, '0')).join('')}`;
        const url = canvas.toDataURL('image/png');
        const bin = atob(url.split(',')[1]);
        const pngBytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i += 1) pngBytes[i] = bin.charCodeAt(i);
        setSlideTpl({ width: renderW, height: renderH, data, imageBytes: pngBytes, imageExt: 'png', svgBytes, bgColor, name: file.name });
        return;
      }

      // Raster slide: embed the original encoded bytes verbatim (full resolution, no
      // quality-degrading canvas round-trip). The canvas is only for pixel detection.
      const originalBytes = new Uint8Array(await file.arrayBuffer());
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      // Sample the slide's background colour from a corner pixel (for solid-fill mode).
      const bgColor = `#${[data[0], data[1], data[2]].map(v => v.toString(16).padStart(2, '0')).join('')}`;

      const extByType = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/gif': 'gif' };
      let imageBytes = originalBytes;
      let imageExt = extByType[file.type];
      if (!imageExt) {
        // Uncommon container (webp/bmp/…) PowerPoint may not embed — fall back to a
        // lossless PNG re-encode at native resolution.
        const url = canvas.toDataURL('image/png');
        const bin = atob(url.split(',')[1]);
        imageBytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i += 1) imageBytes[i] = bin.charCodeAt(i);
        imageExt = 'png';
      }
      setSlideTpl({ width: bitmap.width, height: bitmap.height, data, imageBytes, imageExt, bgColor, name: file.name });
      bitmap.close?.();
    } catch (err) {
      alert(`Could not load slide image:\n${err.message}`);
    }
  };

  const [resolution, setResolution] = useState('1080p');
  const [gifLoopableMode, setGifLoopableMode] = useState('none'); // 'none' | 'all' | 'last' | 'custom'
  const [gifLoopableCustom, setGifLoopableCustom] = useState('');
  const [gifSpeed, setGifSpeed] = useState('1x');
  const [gifBorder, setGifBorder] = useState('No border'); // 'No border' | 'Teal frame' | 'Teal line'

  const parseSlideList = (text) => {
    return [...new Set(String(text || '')
      .split(/[^0-9]+/g)
      .map(s => parseInt(s, 10))
      .filter(n => Number.isFinite(n) && n > 0))];
  };

  const handleDownload = () => {
    if (!activeProject) return;
    downloadProjectFile({ version: 1, ...activeProject, nodes, links, slideBreaks, captureFrame });
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
        loadProjectData({ nodes: project.nodes, links: project.links, slideBreaks: project.slideBreaks ?? project.slides ?? [], captureFrame: project.captureFrame ?? null });
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
    if (activeProject) writeProject({ version: 1, ...activeProject, name, nodes, links, slideBreaks, captureFrame });
    setEditingName(false);
  };

  const resMap = {
    '720p':  { w: 1280,  h: 720  },
    '1080p': { w: 1920,  h: 1080 },
    '1440p': { w: 2560,  h: 1440 },
    '2160p': { w: 3840,  h: 2160 },
  };

  const handleExportGifPackage = async () => {
    if (!nodes.length) {
      alert('Add at least one node before exporting.');
      return;
    }

    // Resolve the slide template (find the placeholder rectangle) before we flip
    // into the exporting state, so a bad marker colour aborts cleanly.
    let slideTemplate = null;
    if (slideTpl) {
      const rect = findPlaceholderRect(slideTpl.data, slideTpl.width, slideTpl.height, placeholderColor);
      if (!rect) {
        alert(`No placeholder rectangle of colour ${placeholderColor} was found in the imported slide.\nCheck the placeholder colour matches the rectangle in your slide image.`);
        return;
      }
      slideTemplate = {
        imageBytes: slideTpl.imageBytes,
        imageExt: slideTpl.imageExt,
        svgBytes: slideTpl.svgBytes ?? null,
        width: slideTpl.width,
        height: slideTpl.height,
        rect,
        bgMode: slideBgMode === 'Image' ? 'image' : 'solid',
        bgColor: slideTpl.bgColor,
      };
    }

    setExporting(true);
    setExportProgress(0);
    setExportStatus('Preparing GIF/APNG package…');

    try {
      // Let React remove hover/selection chrome from the Konva scene before
      // the exporter reads its first frame.
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      layerRef.current?.draw();

      const { w, h } = resMap[resolution];
      const loopArgs = gifLoopableMode === 'custom'
        ? { gifLoopable: parseSlideList(gifLoopableCustom) }
        : { gifLoopableMode };

      await exportGifPackageZip({
        stageRef,
        layerRef,
        nodes,
        links,
        projectName: activeProject?.name ?? 'ECHO-VIS',
        exportWidth: w,
        exportHeight: h,
        viewport: useStore.getState().captureFrame,
        slideBreaks,
        gifScale: 1,
        gifSpeed: Math.max(0.25, parseFloat(String(gifSpeed).replace('x', '')) || 1),
        gifBorder: gifBorder === 'Teal frame' ? 'frame' : gifBorder === 'Teal line' ? 'line' : 'none',
        slideTemplate,
        ...loopArgs,
        onProgress: p => setExportProgress(p),
        onStatus: s => setExportStatus(s),
      });
    } catch (err) {
      console.error('GIF package export error:', err);
      alert(`GIF package export failed:\n${err.message}`);
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
          <ToggleChip
            label="Snap 90°"
            enabled={snapToOrthogonal}
            onToggle={() => setSnapToOrthogonal(!snapToOrthogonal)}
          />
        </>
      )}

      {!isExporting && (
        <>
          <Select
            value={resolution}
            onChange={setResolution}
            options={['720p', '1080p', '1440p', '2160p']}
          />
          {/* Only resolution applies. GIF exports use 1x scale for high-res. */}
          <Divider />
          <Select
            value={gifSpeed}
            onChange={setGifSpeed}
            options={['0.5x', '0.75x', '1x', '1.25x', '1.5x', '2x', '3x', '4x']}
            title="GIF playback speed multiplier"
          />
          <Divider />
          <Select
            value={gifBorder}
            onChange={setGifBorder}
            options={['No border', 'Teal frame', 'Teal line']}
            title="Add a clean teal border around exported GIFs for placing on slides"
          />
          <Divider />
          <button
            onClick={() => slideTplInputRef.current?.click()}
            title="Import a slide (SVG recommended for a crisp background, or PNG/JPEG) with a coloured placeholder rectangle. The PPTX uses it as the slide background with the diagram in the rectangle."
            style={{
              background: slideTpl ? 'var(--accent-surface, var(--panel-bg-3))' : 'var(--panel-bg-3)',
              border: `1px solid ${slideTpl ? 'var(--purple-border-soft)' : 'var(--border-strong)'}`,
              borderRadius: 5,
              color: 'var(--text-main)',
              fontSize: 12,
              padding: '3px 10px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {slideTpl
              ? `Slide: ${slideTpl.name.length > 12 ? `${slideTpl.name.slice(0, 11)}…` : slideTpl.name}`
              : 'Slide template…'}
          </button>
          {slideTpl && (
            <>
              <input
                type="color"
                value={placeholderColor}
                onChange={e => setPlaceholderColor(e.target.value)}
                title="Placeholder rectangle colour to replace with the animation"
                style={{
                  width: 26, height: 24, padding: 0, cursor: 'pointer',
                  background: 'transparent', border: '1px solid var(--border-strong)', borderRadius: 5,
                }}
              />
              <Select
                value={slideBgMode}
                onChange={setSlideBgMode}
                options={['Image', 'Solid color']}
                title="Slide background: Image keeps your original slide (best in PowerPoint); Solid color stays crisp in Google Slides but drops the original slide art"
              />
              <button
                onClick={() => setSlideTpl(null)}
                title="Remove slide template"
                style={{
                  background: 'none', border: '1px solid var(--border-strong)', borderRadius: 5,
                  color: 'var(--text-muted)', fontSize: 13, lineHeight: 1, padding: '3px 8px', cursor: 'pointer',
                }}
              >
                ×
              </button>
            </>
          )}
          <input
            ref={slideTplInputRef}
            type="file"
            accept=".svg,image/svg+xml,image/*"
            onChange={handleImportSlide}
            style={{ display: 'none' }}
          />
          <Divider />
          <Select
            value={gifLoopableMode}
            onChange={setGifLoopableMode}
            options={['none', 'last', 'all', 'custom']}
            title="GIF loop mode: none, last slide, all slides, or custom list"
          />
          {gifLoopableMode === 'custom' && (
            <input
              value={gifLoopableCustom}
              onChange={e => setGifLoopableCustom(e.target.value)}
              placeholder="Slides to loop (e.g. 1,3,5)"
              title="Comma- or space-separated slide numbers to loop"
              style={{
                background: 'var(--panel-bg-3)',
                border: '1px solid var(--purple-border-soft)',
                borderRadius: 5,
                color: 'var(--text-main)',
                fontSize: 12,
                padding: '3px 8px',
                width: 150,
              }}
            />
          )}
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

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleExportGifPackage}
          disabled={isExporting}
          style={{
            background: 'var(--panel-bg-3)',
            border: '1px solid var(--border-strong)',
            borderRadius: 8,
            color: 'var(--text-muted)',
            padding: '7px 13px',
            fontSize: 12,
            fontWeight: 600,
            cursor: isExporting ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Export GIF Package
        </button>
      </div>
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

function Select({ value, onChange, options, suffix = '', title = '' }) {
  return (
    <div style={{ position: 'relative' }}>
      <select
        title={title}
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
