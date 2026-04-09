import React, { useEffect, useRef } from 'react';
import TopBar          from './components/TopBar';
import DiagramCanvas   from './components/canvas/DiagramCanvas';
import PropertiesPanel from './components/PropertiesPanel';
import ContextMenu     from './components/ContextMenu';
import KeyframePanel   from './components/KeyframePanel';
import { usePlayback } from './hooks/usePlayback';

function App() {
  const stageRef = useRef(null);
  const layerRef = useRef(null);

  const playback = usePlayback({ layerRef });
  const { isPlaying, play, pause } = playback;

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code !== 'Space') return;

      const tag = document.activeElement?.tagName;
      const isTypingTarget =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        document.activeElement?.isContentEditable;

      if (isTypingTarget) return;

      e.preventDefault();
      if (isPlaying) pause();
      else play();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isPlaying, pause, play]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      overflow: 'hidden',
      background: 'var(--app-bg)',
    }}>
      <TopBar stageRef={stageRef} layerRef={layerRef} />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
        <DiagramCanvas stageRef={stageRef} layerRef={layerRef} />
        <PropertiesPanel />
      </div>

      <KeyframePanel playback={playback} />

      <ContextMenu />
    </div>
  );
}

export default App;
