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

const AUTOSAVE_DELAY = 1500;

function App() {
  const [page, setPage] = useState('loading');

  const {
    nodes, links,
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
        loadProjectData({ nodes: project.nodes, links: project.links });
        setPage('editor');
        return;
      }
    }
    setPage('projects');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (page !== 'editor') return;
    const ap = activeRef.current;
    if (!ap) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      writeProject({ version: 1, ...ap, nodes, links });
    }, AUTOSAVE_DELAY);
    return () => clearTimeout(saveTimer.current);
  }, [nodes, links, page]);

  const playback = usePlayback({ layerRef });
  const { isPlaying, play, pause } = playback;

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code !== 'Space') return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable) return;
      e.preventDefault();
      if (isPlaying) pause(); else play();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isPlaying, pause, play]);

  const handleOpen = (project) => {
    setActiveProject({ id: project.id, name: project.name, createdAt: project.createdAt });
    loadProjectData({ nodes: project.nodes, links: project.links });
    setLastOpen(project.id);
    setPage('editor');
  };

  const handleGoHome = () => {
    const ap = activeRef.current;
    if (ap) {
      clearTimeout(saveTimer.current);
      writeProject({ version: 1, ...ap, nodes, links });
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
