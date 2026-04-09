import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Layer, Line, Rect, Stage } from 'react-konva';
import { pageColors } from '../../../colorThemes';
import useStore from '../../store/useStore';
import LinkShape from './LinkShape';
import NodeShape from './NodeShape';

const MIN_SCALE = 0.15;
const MAX_SCALE = 4;
const TOP_BAR_H = 52;

const GRID_STYLE = {
  position: 'absolute',
  inset: 0,
  backgroundImage: `radial-gradient(circle, ${pageColors.canvasGridDot} 1.2px, ${pageColors.transparent} 1.2px)`,
  backgroundSize: '28px 28px',
  pointerEvents: 'none',
  zIndex: 0,
};

const CANVAS_BASE = pageColors.canvasBackground;

const CANVAS_TEXTURE_STYLE = {
  position: 'absolute',
  inset: 0,
  backgroundImage: [
    `radial-gradient(circle at 18% 16%, ${pageColors.canvasTexturePrimarySoft}, ${pageColors.transparent} 0 26%)`,
    `radial-gradient(circle at 78% 22%, ${pageColors.canvasTextureSecondarySoft}, ${pageColors.transparent} 0 24%)`,
    `radial-gradient(circle at 52% 78%, ${pageColors.canvasTextureTertiarySoft}, ${pageColors.transparent} 0 28%)`,
    `linear-gradient(180deg, ${pageColors.whiteVeilSoft}, ${pageColors.transparent})`,
    `repeating-linear-gradient(135deg, ${pageColors.whiteVeilFaint} 0 2px, ${pageColors.transparent} 2px 18px)`,
  ].join(', '),
  backgroundColor: CANVAS_BASE,
  pointerEvents: 'none',
  zIndex: 0,
};

function DiagramCanvas({ stageRef, layerRef }) {
  const {
    nodes,
    links,
    selectedId,
    selectedJointId,
    setSelected,
    setSelectedJoint,
    linkingFrom,
    setLinkingFrom,
    addLink,
    updateLinkJoint,
    setContextMenu,
    deleteSelected,
    showGridLines,
    symmetryGuides,
  } = useStore();

  const [scale, setScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [rubberEnd, setRubberEnd] = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ w: 800, h: 600 });

  useEffect(() => {
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setDims({ w: Math.floor(width), h: Math.floor(height) });
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
      if (e.key === 'Escape') setLinkingFrom(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteSelected, setLinkingFrom]);

  const toCanvas = useCallback((screenPt) => ({
    x: (screenPt.x - stagePos.x) / scale,
    y: (screenPt.y - stagePos.y) / scale,
  }), [stagePos, scale]);

  const handleWheel = useCallback((e) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    const oldScale = stage.scaleX();
    const ptr = stage.getPointerPosition();
    const origin = {
      x: (ptr.x - stage.x()) / oldScale,
      y: (ptr.y - stage.y()) / oldScale,
    };
    const delta = e.evt.deltaY < 0 ? 1 : -1;
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, oldScale + delta * oldScale * 0.1));
    setScale(newScale);
    setStagePos({
      x: ptr.x - origin.x * newScale,
      y: ptr.y - origin.y * newScale,
    });
  }, [stageRef]);

  const handleStageDragEnd = useCallback((e) => {
    if (e.target === stageRef.current) {
      setStagePos({ x: e.target.x(), y: e.target.y() });
    }
  }, [stageRef]);

  const clearSelection = useCallback(() => {
    setSelected(null);
    setSelectedJoint(null);
    setLinkingFrom(null);
    setContextMenu(null);
  }, [setContextMenu, setLinkingFrom, setSelected, setSelectedJoint]);

  const handleStageClick = useCallback((e) => {
    if (e.target !== e.target.getStage() && e.target.id() !== 'background') return;
    clearSelection();
  }, [clearSelection]);

  const openCanvasMenu = useCallback((pointer) => {
    const canvas = toCanvas(pointer);
    setContextMenu({
      type: 'canvas',
      screenX: pointer.x,
      screenY: pointer.y + TOP_BAR_H,
      canvasX: canvas.x,
      canvasY: canvas.y,
    });
  }, [setContextMenu, toCanvas]);

  const handleContextMenu = useCallback((e) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    const pointer = stage.getPointerPosition();
    openCanvasMenu(pointer);
  }, [openCanvasMenu, stageRef]);

  const handleMouseMove = useCallback(() => {
    if (!linkingFrom) return;
    const stage = stageRef.current;
    const pointer = stage.getPointerPosition();
    setRubberEnd(toCanvas(pointer));
  }, [linkingFrom, stageRef, toCanvas]);

  const handleMouseUp = useCallback(() => {
    if (linkingFrom) setLinkingFrom(null);
  }, [linkingFrom, setLinkingFrom]);

  const handleStartLink = useCallback((nodeId) => {
    const node = nodes.find(item => item.id === nodeId);
    if (node) {
      setRubberEnd({ x: node.x + node.width / 2, y: node.y + node.height / 2 });
    }
    setLinkingFrom(nodeId);
  }, [nodes, setLinkingFrom]);

  const handleEndLink = useCallback((toNodeId) => {
    if (linkingFrom && linkingFrom !== toNodeId) addLink(linkingFrom, toNodeId);
    setLinkingFrom(null);
  }, [addLink, linkingFrom, setLinkingFrom]);

  const handleLinkSelect = useCallback((linkId) => {
    setSelected(linkId);
  }, [setSelected]);

  const handleLinkContextMenu = useCallback((e, linkId) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    const pointer = stage.getPointerPosition();
    const canvas = toCanvas(pointer);
    setSelected(linkId);
    setContextMenu({
      type: 'link',
      linkId,
      screenX: pointer.x,
      screenY: pointer.y + TOP_BAR_H,
      canvasX: canvas.x,
      canvasY: canvas.y,
    });
  }, [setContextMenu, setSelected, stageRef, toCanvas]);

  const linkingNode = linkingFrom ? nodes.find(node => node.id === linkingFrom) : null;

  return (
    <div ref={containerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', background: CANVAS_BASE }}>
      <div style={CANVAS_TEXTURE_STYLE} />
      {showGridLines && <div style={GRID_STYLE} />}

      <Stage
        ref={stageRef}
        width={dims.w}
        height={dims.h}
        scaleX={scale}
        scaleY={scale}
        x={stagePos.x}
        y={stagePos.y}
        draggable={!linkingFrom}
        onDragEnd={handleStageDragEnd}
        onWheel={handleWheel}
        onClick={handleStageClick}
        onContextMenu={handleContextMenu}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{ cursor: linkingFrom ? 'crosshair' : 'default', position: 'relative', zIndex: 1 }}
      >
        <Layer ref={layerRef}>
          <Rect
            id="background"
            x={-50000}
            y={-50000}
            width={100000}
            height={100000}
            fill={CANVAS_BASE}
            listening={false}
          />

          {links.map((link) => {
            const fromNode = nodes.find(node => node.id === link.fromId);
            const toNode = nodes.find(node => node.id === link.toId);
            if (!fromNode || !toNode) return null;

            return (
              <LinkShape
                key={link.id}
                link={link}
                allLinks={links}
                fromNode={fromNode}
                toNode={toNode}
                isSelected={selectedId === link.id}
                selectedJointId={selectedId === link.id ? selectedJointId : null}
                onSelect={() => handleLinkSelect(link.id)}
                onContextMenu={(e) => handleLinkContextMenu(e, link.id)}
                onJointSelect={(jointId) => {
                  setSelected(link.id);
                  setSelectedJoint(jointId);
                }}
                onJointDragStart={(jointId) => {
                  setSelected(link.id);
                  setSelectedJoint(jointId);
                }}
                onJointDragMove={(jointId, point) => updateLinkJoint(link.id, jointId, point)}
                onJointDragEnd={(jointId, point) => updateLinkJoint(link.id, jointId, point)}
              />
            );
          })}

          {nodes.map(node => (
            <NodeShape
              key={node.id}
              node={node}
              isSelected={selectedId === node.id}
              onSelect={() => setSelected(node.id)}
              onStartLink={handleStartLink}
              onEndLink={handleEndLink}
              isLinking={!!linkingFrom}
            />
          ))}

          {symmetryGuides.map((guide, idx) => (
            <Line
              key={guide.id ?? idx}
              points={guide.points}
              stroke={guide.stroke ?? pageColors.warningMain}
              strokeWidth={guide.strokeWidth ?? 1.5}
              dash={guide.dash ?? [6, 6]}
              opacity={guide.opacity ?? 0.95}
              listening={false}
            />
          ))}

          {linkingFrom && linkingNode && (
            <Line
              points={[
                linkingNode.x + linkingNode.width / 2,
                linkingNode.y + linkingNode.height / 2,
                rubberEnd.x,
                rubberEnd.y,
              ]}
              stroke={pageColors.blueLink}
              strokeWidth={2}
              dash={[8, 5]}
              opacity={0.75}
              listening={false}
            />
          )}
        </Layer>
      </Stage>

      {nodes.length === 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            gap: 10,
          }}
        >
          <div style={{ fontSize: 32, opacity: 0.12 }}>⬡</div>
          <p style={{ color: pageColors.whiteHintSoft, fontSize: 13, letterSpacing: '0.04em' }}>
            Right-click anywhere to add a node
          </p>
        </div>
      )}

      <div
        style={{
          position: 'absolute',
          bottom: 14,
          left: 14,
          color: pageColors.whiteHintDim,
          fontSize: 11,
          fontFamily: 'monospace',
          pointerEvents: 'none',
        }}
      >
        {Math.round(scale * 100)}%
      </div>
    </div>
  );
}

export default DiagramCanvas;
