import React, { useEffect, useRef, useState } from 'react';
import TopBar          from './components/TopBar';
import DiagramCanvas   from './components/canvas/DiagramCanvas';
import PropertiesPanel from './components/PropertiesPanel';
import ContextMenu     from './components/ContextMenu';
import KeyframePanel   from './components/KeyframePanel';
import ProjectsPage    from './components/ProjectsPage';
import { usePlayback } from './hooks/usePlayback';
import useStore        from './store/useStore';
import {
  getLastOpen, setLastOpen, readProject,
  writeProject, createBlankProject,
} from './projects/projectStore';
import { capturePreview } from './projects/capturePreview';

const AUTOSAVE_DELAY = 1500;

function App() {
  const [page, setPage] = useState('loading');

  const {
    nodes, links, slideBreaks, captureFrame,
    activeProject, setActiveProject,
    loadProjectData,
  } = useStore();

  const stageRef      = useRef(null);
  const layerRef      = useRef(null);
  const saveTimer     = useRef(null);
  const activeRef     = useRef(activeProject);

  useEffect(() => { activeRef.current = activeProject; }, [activeProject]);

  useEffect(() => {
    const lastId = getLastOpen();
    if (lastId) {
      const project = readProject(lastId);
      if (project) {
        setActiveProject({ id: project.id, name: project.name, createdAt: project.createdAt });
        loadProjectData({ nodes: project.nodes, links: project.links, slideBreaks: project.slideBreaks ?? project.slides ?? [], captureFrame: project.captureFrame ?? null });
        setPage('editor');
        return;
      }
    }
    setPage('projects');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Warn once per session if autosave starts failing (storage quota), so edits
  // aren't silently lost.
  const saveFailureWarnedRef = useRef(false);
  const reportSaveResult = (saved) => {
    if (saved || saveFailureWarnedRef.current) return;
    saveFailureWarnedRef.current = true;
    alert('Saving failed — browser storage is full. Download the project (Download button) to avoid losing work.');
  };

  useEffect(() => {
    if (page !== 'editor') return;
    const ap = activeRef.current;
    if (!ap) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      reportSaveResult(writeProject({ version: 1, ...ap, nodes, links, slideBreaks, captureFrame }));
    }, AUTOSAVE_DELAY);
    return () => clearTimeout(saveTimer.current);
  }, [nodes, links, page, slideBreaks, captureFrame]);

  const playback = usePlayback({ layerRef });
  const { isPlaying, play, pause } = playback;

  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (isPlaying) pause(); else play();
      }
      if (e.code === 'KeyB' && (e.ctrlKey || e.metaKey)) {
        // Ghost alignment clipboard: copy the current selection (cross-tab), or — with
        // nothing selected — paste a ghost of the last copied selection at the viewport
        // centre. The ghost is overlay-only; it is never added to the document.
        const stage = stageRef.current;
        if (!stage) return; // only meaningful in the editor
        e.preventDefault();
        const st = useStore.getState();
        const hasSelection = !!st.selectedId || (st.selectedIds && st.selectedIds.length > 0);
        if (hasSelection) {
          st.copyGhostSelection();
        } else {
          const sx = stage.scaleX() || 1;
          const sy = stage.scaleY() || 1;
          const target = {
            x: (stage.width() / 2 - stage.x()) / sx,
            y: (stage.height() / 2 - stage.y()) / sy,
          };
          st.pasteGhostFromClipboard(target);
        }
        return;
      }
      if (e.code === 'KeyF' && (e.ctrlKey || e.metaKey)) {
        // Center capture frame to stage
        const { captureFrame } = useStore.getState();
        if (captureFrame) {
          const stage = stageRef.current;
          if (stage) {
            const dims = { w: stage.width(), h: stage.height() };
            const x = Math.round((dims.w - captureFrame.width) / 2);
            const y = Math.round((dims.h - captureFrame.height) / 2);
            useStore.getState().setCaptureFrame({ x, y });
          }
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isPlaying, pause, play, stageRef]);

  const handleOpen = (project) => {
    setActiveProject({ id: project.id, name: project.name, createdAt: project.createdAt });
    loadProjectData({ nodes: project.nodes, links: project.links, slideBreaks: project.slideBreaks ?? project.slides ?? [], captureFrame: project.captureFrame ?? null });
    setLastOpen(project.id);
    setPage('editor');
  };

  const handleGoHome = () => {
    const ap = activeRef.current;
    if (ap) {
      clearTimeout(saveTimer.current);
      // Snapshot a thumbnail for the projects page; null leaves any previous one intact.
      let preview;
      try { preview = capturePreview(stageRef, layerRef, nodes, links) ?? undefined; }
      catch (err) { console.error('[App] preview capture failed:', err); }
      reportSaveResult(writeProject({ version: 1, ...ap, nodes, links, slideBreaks, captureFrame, preview }));
    }
    setLastOpen(null);
    setPage('projects');
  };

  if (page === 'loading') return null;

  if (page === 'projects') {
    return (
      <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
        <ProjectsPage onOpen={handleOpen} />
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      overflow: 'hidden',
      background: 'var(--app-bg)',
    }}>
      <TopBar stageRef={stageRef} layerRef={layerRef} onGoHome={handleGoHome} />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
        <DiagramCanvas stageRef={stageRef} layerRef={layerRef} playback={playback} />
        <PropertiesPanel />
      </div>

      <KeyframePanel playback={playback} />

      <ContextMenu />
    </div>
  );
}

export default App;
