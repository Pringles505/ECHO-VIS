import React, { useEffect, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';
import useStore, { NODE_SHAPE_PRESETS } from '../store/useStore';
import { createJointForLink, getClosestNodeOutlinePosition } from '../links/linkGeometry';

const NODE_SHAPE_MENU = [
  { key: 'rectangle', icon: '▭', label: 'Rectangle' },
  { key: 'pill', icon: '⬭', label: 'Pill' },
  { key: 'database', icon: '⌭', label: 'Database' },
  { key: 'cylinder', icon: '⌭', label: 'Cylinder' },
  { key: 'diamond', icon: '◇', label: 'Diamond' },
  { key: 'hexagon', icon: '⬢', label: 'Hexagon' },
  { key: 'slanted', icon: '▱', label: 'Slanted' },
  { key: 'circle', icon: '◯', label: 'Circle' },
  { key: 'protocol', icon: '▦', label: 'Protocol' },
];

function ContextMenu() {
  const {
    contextMenu,
    setContextMenu,
    addNode,
    addVariableNode,
    addMonitorNode,
    addGraphNode,
    addMirrorNode,
    addTextNode,
    addArea,
    addSubdiagramNode,
    links,
    nodes,
    selectedId,
    selectedIds,
    addLinkJoint,
    addNodeAnchor,
    setSelected,
    setSelectedJoint,
    updateLink,
    updateLinkJoint,
    orthogonalizeJoint,
    alignNodes,
    distributeNodes,
    reverseLink,
    stripAnimation,
  } = useStore();
  const menuRef = useRef(null);
  const [canvasMenuView, setCanvasMenuView] = useState('root');

  useEffect(() => {
    if (!contextMenu) return;
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setContextMenu(null);
    };
    const closeKey = (e) => { if (e.key === 'Escape') setContextMenu(null); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', closeKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', closeKey);
    };
  }, [contextMenu, setContextMenu]);

  useEffect(() => {
    setCanvasMenuView('root');
  }, [contextMenu]);

  if (!contextMenu) return null;

  const { screenX, screenY } = contextMenu;
  const left = Math.min(screenX, window.innerWidth - 190);
  const top = Math.min(screenY, window.innerHeight - 280);

  const menuItems = [];
  if (contextMenu.type === 'canvas') {
    if (canvasMenuView === 'add-node') {
      menuItems.push({
        icon: '←',
        label: 'Back',
        onClick: () => setCanvasMenuView('root'),
        keepOpen: true,
      });
      for (const shapeItem of NODE_SHAPE_MENU) {
        menuItems.push({
          icon: shapeItem.icon,
          label: shapeItem.label,
          onClick: () => addNode(contextMenu.canvasX, contextMenu.canvasY, NODE_SHAPE_PRESETS[shapeItem.key]),
        });
      }
    } else {
      menuItems.push({
        icon: '⬡',
        label: 'Add node',
        onClick: () => addNode(contextMenu.canvasX, contextMenu.canvasY),
      });
      menuItems.push({
        icon: '𝑽',
        label: 'Add variable',
        onClick: () => addVariableNode(contextMenu.canvasX, contextMenu.canvasY),
      });
      menuItems.push({
        icon: '⊡',
        label: 'Add monitor',
        onClick: () => addMonitorNode(contextMenu.canvasX, contextMenu.canvasY),
      });
      menuItems.push({
        icon: 'ƒ',
        label: 'Add graph',
        onClick: () => addGraphNode(contextMenu.canvasX, contextMenu.canvasY),
      });
      menuItems.push({
        icon: '◇',
        label: 'Add shape',
        onClick: () => setCanvasMenuView('add-node'),
        keepOpen: true,
      });
      menuItems.push({
        icon: '▣',
        label: 'Add mirror',
        onClick: () => addMirrorNode(
          contextMenu.canvasX,
          contextMenu.canvasY,
          [...new Set([...(selectedIds ?? []), selectedId].filter(Boolean))]
        ),
      });
      menuItems.push({
        icon: 'T',
        label: 'Add text',
        onClick: () => addTextNode(contextMenu.canvasX, contextMenu.canvasY),
      });
      menuItems.push({
        icon: '⬚',
        label: 'Add area',
        onClick: () => addArea(contextMenu.canvasX, contextMenu.canvasY),
      });
      menuItems.push({
        icon: '▶',
        label: 'Add sub-diagram',
        onClick: () => addSubdiagramNode(contextMenu.canvasX, contextMenu.canvasY),
      });
    }
  }

  if (contextMenu.type === 'link') {
    const ctxLink = links.find(item => item.id === contextMenu.linkId);
    const isOrthogonal = ctxLink?.routeStyle === 'orthogonal';
    menuItems.push({
      icon: isOrthogonal ? '╱' : '⌐',
      label: isOrthogonal ? 'Straight route' : 'Right-angle route',
      onClick: () => updateLink(contextMenu.linkId, { routeStyle: isOrthogonal ? null : 'orthogonal' }),
    });
    menuItems.push({
      icon: '⇄',
      label: 'Reverse direction',
      onClick: () => reverseLink(contextMenu.linkId),
    });
    menuItems.push({
      icon: '◆',
      label: 'Add joint',
      onClick: () => {
        const link = links.find(item => item.id === contextMenu.linkId);
        if (!link) return;
        const fromNode = nodes.find(node => node.id === link.fromId);
        const toNode = nodes.find(node => node.id === link.toId);
        if (!fromNode || !toNode) return;

        const { insertIndex, joint } = createJointForLink(
          link,
          fromNode,
          toNode,
          { x: contextMenu.canvasX, y: contextMenu.canvasY },
          uuid,
          links,
          nodes
        );
        setSelected(link.id);
        addLinkJoint(link.id, joint, insertIndex);
      },
    });
  }

  if (contextMenu.type === 'node') {
    menuItems.push({
      icon: '◉',
      label: 'Add anchor',
      onClick: () => {
        const node = nodes.find(item => item.id === contextMenu.nodeId);
        if (!node) return;
        const next = getClosestNodeOutlinePosition(node, {
          x: contextMenu.canvasX,
          y: contextMenu.canvasY,
        });
        addNodeAnchor(node.id, {
          id: uuid(),
          side: next.side,
          along: next.along,
        });
        setSelected(node.id);
      },
    });

    const stripIds = [...new Set([
      ...(selectedIds ?? []),
      selectedId,
      contextMenu.nodeId,
    ].filter(Boolean))];
    const nodeSelectionIds = stripIds.filter(id => nodes.some(node => node.id === id));
    const stripCount = nodeSelectionIds.length;

    if (stripCount >= 2) {
      menuItems.push({ icon: '⊢', label: 'Align left', onClick: () => alignNodes(nodeSelectionIds, 'left') });
      menuItems.push({ icon: '↔', label: 'Align center', onClick: () => alignNodes(nodeSelectionIds, 'hcenter') });
      menuItems.push({ icon: '⊣', label: 'Align right', onClick: () => alignNodes(nodeSelectionIds, 'right') });
      menuItems.push({ icon: '⊤', label: 'Align top', onClick: () => alignNodes(nodeSelectionIds, 'top') });
      menuItems.push({ icon: '↕', label: 'Align middle', onClick: () => alignNodes(nodeSelectionIds, 'vcenter') });
      menuItems.push({ icon: '⊥', label: 'Align bottom', onClick: () => alignNodes(nodeSelectionIds, 'bottom') });
    }
    if (stripCount >= 3) {
      menuItems.push({ icon: '☰', label: 'Distribute horizontally', onClick: () => distributeNodes(nodeSelectionIds, 'horizontal') });
      menuItems.push({ icon: '|||', label: 'Distribute vertically', onClick: () => distributeNodes(nodeSelectionIds, 'vertical') });
    }

    menuItems.push({
      icon: '✂',
      label: stripCount > 1 ? `Remove animation (${stripCount})` : 'Remove animation',
      onClick: () => stripAnimation(stripIds),
    });
  }

  if (contextMenu.type === 'joint') {
    menuItems.push({
      icon: '⌐',
      label: 'Make 90°',
      onClick: () => {
        orthogonalizeJoint(contextMenu.linkId, contextMenu.jointId);
        setSelected(contextMenu.linkId);
        setSelectedJoint(contextMenu.jointId);
      },
    });
    menuItems.push({
      icon: '◎',
      label: 'Create junction',
      onClick: () => {
        updateLinkJoint(contextMenu.linkId, contextMenu.jointId, { isJunction: true });
        setSelected(contextMenu.linkId);
        setSelectedJoint(contextMenu.jointId);
      },
    });
  }

  if (!menuItems.length) return null;

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left,
        top,
        background: 'linear-gradient(180deg, var(--panel-bg-2), var(--panel-bg))',
        border: '1px solid var(--border-strong)',
        borderRadius: 10,
        padding: '5px 0',
        zIndex: 9999,
        minWidth: 176,
        boxShadow: '0 12px 40px var(--menu-shadow)',
        transformOrigin: 'top left',
        animation: 'popFromNode 0.18s cubic-bezier(0.34, 1.3, 0.64, 1)',
      }}
    >
      <style>{`
        @keyframes popFromNode {
          0%   { opacity: 0; transform: scale(0.5) translate(-6px, -6px); }
          60%  { opacity: 1; transform: scale(1.04) translate(0, 0); }
          100% { opacity: 1; transform: scale(1)    translate(0, 0); }
        }
      `}</style>

      <MenuLabel text={
        contextMenu.type === 'canvas'
          ? (canvasMenuView === 'add-node' ? 'Shapes' : 'Insert')
          : contextMenu.type === 'link'
            ? 'Link'
            : contextMenu.type === 'joint'
              ? 'Joint'
              : 'Node'
      } />
      {menuItems.map(item => (
        <MenuItem
          key={item.label}
          icon={item.icon}
          label={item.label}
          onClick={() => {
            item.onClick();
            if (!item.keepOpen) setContextMenu(null);
          }}
        />
      ))}
    </div>
  );
}

function MenuLabel({ text }) {
  return (
    <div style={{
      color: 'var(--text-dim)',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.1em',
      padding: '4px 14px 2px',
      textTransform: 'uppercase',
    }}>{text}</div>
  );
}

function MenuItem({ icon, label, onClick }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '7px 14px',
        cursor: 'pointer',
        background: hovered ? 'var(--purple-hover)' : 'var(--transparent)',
        color: hovered ? 'var(--text-main)' : 'var(--text-muted)',
        fontSize: 13,
        userSelect: 'none',
        transition: 'background 0.08s',
      }}
    >
      <span
        style={{
          width: 16,
          textAlign: 'center',
          fontSize: 14,
          opacity: 0.7,
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <span style={{ flex: 1 }}>{label}</span>
    </div>
  );
}

export default ContextMenu;
