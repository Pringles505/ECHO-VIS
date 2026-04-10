import React, { useEffect, useRef } from 'react';
import { v4 as uuid } from 'uuid';
import useStore from '../store/useStore';
import { createJointForLink, getClosestNodeOutlinePosition } from '../links/linkGeometry';

function ContextMenu() {
  const {
    contextMenu,
    setContextMenu,
    addNode,
    links,
    nodes,
    addLinkJoint,
    addNodeAnchor,
    setSelected,
    setSelectedJoint,
    updateLinkJoint,
  } = useStore();
  const menuRef = useRef(null);

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

  if (!contextMenu) return null;

  const { screenX, screenY } = contextMenu;
  const left = Math.min(screenX, window.innerWidth - 190);
  const top = Math.min(screenY, window.innerHeight - 140);

  const menuItems = [];
  if (contextMenu.type === 'canvas') {
    menuItems.push({
      icon: '⬡',
      label: 'Add Node',
      onClick: () => addNode(contextMenu.canvasX, contextMenu.canvasY),
    });
  }

  if (contextMenu.type === 'link') {
    menuItems.push({
      icon: '◆',
      label: 'Add Joint',
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
      label: 'Add Anchor',
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
  }

  if (contextMenu.type === 'joint') {
    menuItems.push({
      icon: '◎',
      label: 'Create Junction',
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
        animation: 'fadeInScale 0.08s ease-out',
      }}
    >
      <style>{`
        @keyframes fadeInScale {
          from { opacity:0; transform:scale(0.95); }
          to   { opacity:1; transform:scale(1); }
        }
      `}</style>

      <MenuLabel text="ADD" />
      {menuItems.map(item => (
        <MenuItem
          key={item.label}
          icon={item.icon}
          label={item.label}
          onClick={() => {
            item.onClick();
            setContextMenu(null);
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
      <span style={{ fontSize: 14, opacity: 0.7 }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
    </div>
  );
}

export default ContextMenu;
