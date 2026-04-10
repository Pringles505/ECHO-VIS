import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import { pageColors } from '../../colorThemes';

const NODE_DEFAULTS = {
  width: 150,
  height: 52,
  fill: pageColors.blueNodeFill,
  stroke: pageColors.blueNodeStroke,
  strokeWidth: 2,
  cornerRadius: 8,
  fontSize: 13,
  textColor: pageColors.white,
  label: 'Node',
  animStartTime: null,
  animDuration: null,
  triggerAfterLinkId: null,
  triggerMode: 'overlap',  // 'overlap' | 'on-end'
  triggerDelay: 0,
  anchors: [],
};

const LINK_DEFAULTS = {
  stroke: pageColors.blueNodeStroke,
  strokeWidth: 2,
  showArrowTip: false,
  arrowTipMode: 'flow',   // 'flow' | 'end'
  syncGroupKey: null,
  fromJunctionLinkId: null,
  fromJunctionJointId: null,
  fromAnchorSide: null,
  toAnchorSide: null,
  fromAnchorLockedCenter: false,
  toAnchorLockedCenter: false,
  fromAnchorId: null,
  toAnchorId: null,
  fromAlongPos: 0,        // position along chosen side: 0 = center, ±px from center
  toAlongPos: 0,
  animStartTime: null,
  animDuration: null,
  joints: [],
};

const MAX_HISTORY = 60;

function collectDescendantLinkIds(linkIds, links) {
  const queue = [...linkIds];
  const seen = new Set(queue);

  while (queue.length) {
    const currentId = queue.shift();
    for (const link of links) {
      if (link.fromJunctionLinkId !== currentId || seen.has(link.id)) continue;
      seen.add(link.id);
      queue.push(link.id);
    }
  }

  return seen;
}

function collectJunctionChildLinkIds(refs, links) {
  const directLinkIds = new Set();
  for (const link of links) {
    const refKey = `${link.fromJunctionLinkId ?? ''}::${link.fromJunctionJointId ?? ''}`;
    if (refs.has(refKey)) {
      directLinkIds.add(link.id);
    }
  }
  return collectDescendantLinkIds(directLinkIds, links);
}

function snapshot(state) {
  return {
    nodes: state.nodes.map(n => ({ ...n, anchors: [...(n.anchors ?? [])] })),
    links: state.links.map(l => ({ ...l, joints: [...(l.joints ?? [])] })),
  };
}

const useStore = create((set, get) => ({
  nodes: [],
  links: [],
  nextLinkDefaults: { ...LINK_DEFAULTS },

  selectedId: null,
  selectedJointId: null,
  selectedIds: [],        // multi-selection
  clipboard: null,        // { nodes, links }
  linkingFrom: null,
  contextMenu: null,
  isExporting: false,
  exportProgress: 0,
  exportStatus: '',
  showGridLines: true,
  showSymmetryLines: true,
  snapToSymmetryLines: true,
  symmetryGuides: [],

  // ── History ───────────────────────────────────────────────────────────────
  past: [],
  future: [],

  _pushHistory: () => {
    const state = get();
    const snap = snapshot(state);
    set(s => ({
      past: [...s.past.slice(-(MAX_HISTORY - 1)), snap],
      future: [],
    }));
  },

  undo: () => {
    const { past, future } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    const curr = snapshot(get());
    set({
      past: past.slice(0, -1),
      future: [curr, ...future.slice(0, MAX_HISTORY - 1)],
      nodes: prev.nodes,
      links: prev.links,
      selectedId: null,
      selectedJointId: null,
      selectedIds: [],
    });
  },

  redo: () => {
    const { past, future } = get();
    if (!future.length) return;
    const next = future[0];
    const curr = snapshot(get());
    set({
      past: [...past.slice(-(MAX_HISTORY - 1)), curr],
      future: future.slice(1),
      nodes: next.nodes,
      links: next.links,
      selectedId: null,
      selectedJointId: null,
      selectedIds: [],
    });
  },

  // ── Selection ─────────────────────────────────────────────────────────────
  setSelectedIds: (ids) => set({ selectedIds: ids }),

  addToSelection: (id) => set(state => ({
    selectedIds: state.selectedIds.includes(id)
      ? state.selectedIds
      : [...state.selectedIds, id],
    selectedId: id,
    selectedJointId: null,
  })),

  selectAll: () => set(state => ({
    selectedIds: [...state.nodes.map(n => n.id), ...state.links.map(l => l.id)],
    selectedId: state.nodes[0]?.id ?? state.links[0]?.id ?? null,
    selectedJointId: null,
  })),

  // ── Clipboard ─────────────────────────────────────────────────────────────
  copySelected: () => {
    const { nodes, links, selectedId, selectedIds } = get();
    const all = new Set([...selectedIds, selectedId].filter(Boolean));
    if (!all.size) return;
    const clipNodes = nodes.filter(n => all.has(n.id));
    const clipLinks = links.filter(l =>
      all.has(l.id) ||
      (all.has(l.fromId) && all.has(l.toId))
    );
    set({ clipboard: { nodes: clipNodes, links: clipLinks } });
  },

  pasteClipboard: (targetPoint = null) => {
    const { clipboard } = get();
    if (!clipboard || (!clipboard.nodes.length && !clipboard.links.length)) return;
    get()._pushHistory();
    const bounds = clipboard.nodes.length
      ? {
          minX: Math.min(...clipboard.nodes.map(n => n.x)),
          minY: Math.min(...clipboard.nodes.map(n => n.y)),
          maxX: Math.max(...clipboard.nodes.map(n => n.x + n.width)),
          maxY: Math.max(...clipboard.nodes.map(n => n.y + n.height)),
        }
      : null;
    const offset = targetPoint && bounds
      ? {
          x: targetPoint.x - (bounds.minX + bounds.maxX) / 2,
          y: targetPoint.y - (bounds.minY + bounds.maxY) / 2,
        }
      : { x: 40, y: 40 };
    const idMap = {};
    const jointIdMap = {};
    const newNodes = clipboard.nodes.map(n => {
      const id = uuid();
      idMap[n.id] = id;
      return {
        ...n,
        id,
        x: n.x + offset.x,
        y: n.y + offset.y,
        anchors: (n.anchors ?? []).map(anchor => {
          const nextId = uuid();
          idMap[anchor.id] = nextId;
          return { ...anchor, id: nextId };
        }),
        animStartTime: null,
        animDuration: null,
      };
    });
    const linkIdMap = {};
    for (const link of clipboard.links) {
      linkIdMap[link.id] = uuid();
    }
    for (const link of clipboard.links) {
      for (const joint of link.joints ?? []) {
        jointIdMap[joint.id] = uuid();
      }
    }
    const newLinks = clipboard.links
      .filter(l => idMap[l.fromId] && idMap[l.toId])
      .map(l => ({
        ...l,
        id: linkIdMap[l.id],
        fromId: idMap[l.fromId],
        toId: idMap[l.toId],
        fromJunctionLinkId: l.fromJunctionLinkId ? linkIdMap[l.fromJunctionLinkId] ?? null : null,
        fromJunctionJointId: l.fromJunctionJointId ? jointIdMap[l.fromJunctionJointId] ?? null : null,
        fromAnchorId: l.fromAnchorId ? idMap[l.fromAnchorId] ?? null : null,
        toAnchorId: l.toAnchorId ? idMap[l.toAnchorId] ?? null : null,
        animStartTime: null,
        animDuration: null,
        joints: (l.joints ?? []).map(j => ({
          ...j,
          id: jointIdMap[j.id],
          x: j.x + offset.x,
          y: j.y + offset.y,
        })),
      }));
    const newIds = [...newNodes.map(n => n.id), ...newLinks.map(l => l.id)];
    set(state => ({
      nodes: [...state.nodes, ...newNodes],
      links: [...state.links, ...newLinks],
      selectedIds: newIds,
      selectedId: newNodes[0]?.id ?? newLinks[0]?.id ?? null,
      selectedJointId: null,
    }));
  },

  // ── Nodes ─────────────────────────────────────────────────────────────────
  addNode: (canvasX, canvasY) => {
    get()._pushHistory();
    const id = uuid();
    const node = {
      id,
      x: canvasX - NODE_DEFAULTS.width / 2,
      y: canvasY - NODE_DEFAULTS.height / 2,
      ...NODE_DEFAULTS,
      label: `Node ${get().nodes.length + 1}`,
    };
    set(state => ({
      nodes: [...state.nodes, node],
      contextMenu: null,
      selectedId: id,
      selectedJointId: null,
      selectedIds: [],
    }));
    return id;
  },

  updateNode: (id, updates) =>
    set(state => ({
      nodes: state.nodes.map(node => (node.id === id ? { ...node, ...updates } : node)),
    })),

  addNodeAnchor: (nodeId, anchor) => {
    get()._pushHistory();
    set(state => ({
      nodes: state.nodes.map(node => (
        node.id !== nodeId
          ? node
          : { ...node, anchors: [...(node.anchors ?? []), anchor] }
      )),
      selectedId: nodeId,
      selectedJointId: null,
    }));
  },

  updateNodeAnchor: (nodeId, anchorId, updates) =>
    set(state => ({
      nodes: state.nodes.map(node => (
        node.id !== nodeId
          ? node
          : {
              ...node,
              anchors: (node.anchors ?? []).map(anchor => (
                anchor.id === anchorId ? { ...anchor, ...updates } : anchor
              )),
            }
      )),
    })),

  removeNode: (id) => {
    get()._pushHistory();
    const descendantLinkIds = collectDescendantLinkIds(
      new Set(get().links
        .filter(link => link.fromId === id || link.toId === id)
        .map(link => link.id)),
      get().links
    );
    set(state => ({
      nodes: state.nodes.filter(node => node.id !== id),
      links: state.links.filter(link =>
        link.fromId !== id &&
        link.toId !== id &&
        !descendantLinkIds.has(link.id)
      ),
      selectedId: state.selectedId === id ? null : state.selectedId,
      selectedJointId: state.selectedId === id ? null : state.selectedJointId,
      selectedIds: state.selectedIds.filter(sid => sid !== id),
    }));
  },

  // ── Links ─────────────────────────────────────────────────────────────────
  addLink: (fromId, toId, overrides = {}) => {
    if (fromId === toId) return null;
    get()._pushHistory();
    const id = uuid();
    set(state => ({
      links: [...state.links, {
        id,
        fromId,
        toId,
        ...LINK_DEFAULTS,
        ...state.nextLinkDefaults,
        ...overrides,
        joints: [...(state.nextLinkDefaults.joints ?? [])],
      }],
      selectedId: id,
      selectedJointId: null,
      selectedIds: [],
    }));
    return id;
  },

  updateLink: (id, updates) =>
    set(state => ({
      links: state.links.map(link => (link.id === id ? { ...link, ...updates } : link)),
    })),

  removeLink: (id) => {
    get()._pushHistory();
    const descendantLinkIds = collectDescendantLinkIds(new Set([id]), get().links);
    set(state => ({
      links: state.links.filter(link => !descendantLinkIds.has(link.id)),
      selectedId: descendantLinkIds.has(state.selectedId) ? null : state.selectedId,
      selectedJointId: descendantLinkIds.has(state.selectedId) ? null : state.selectedJointId,
      selectedIds: state.selectedIds.filter(sid => !descendantLinkIds.has(sid)),
    }));
  },

  addLinkJoint: (linkId, joint, insertIndex, options = {}) => {
    get()._pushHistory();
    set(state => ({
      links: state.links.map(link => {
        if (link.id !== linkId) return link;
        const joints = [...(link.joints ?? [])];
        joints.splice(insertIndex, 0, joint);
        return { ...link, joints };
      }),
      selectedId: linkId,
      selectedJointId: options.selectJoint === false ? state.selectedJointId : joint.id,
      contextMenu: null,
    }));
  },

  updateLinkJoint: (linkId, jointId, updates) =>
    set(state => ({
      links: state.links.map(link => (
        link.id !== linkId
          ? link
          : {
              ...link,
              joints: (link.joints ?? []).map(joint => (
                joint.id === jointId ? { ...joint, ...updates } : joint
              )),
            }
      )),
    })),

  removeLinkJoint: (linkId, jointId) => {
    get()._pushHistory();
    const childLinkIds = collectJunctionChildLinkIds(new Set([`${linkId}::${jointId}`]), get().links);
    set(state => ({
      links: state.links.map(link => (
        link.id !== linkId
          ? link
          : {
              ...link,
              joints: (link.joints ?? []).filter(joint => joint.id !== jointId),
            }
      )).filter(link => !childLinkIds.has(link.id)),
      selectedJointId: state.selectedJointId === jointId ? null : state.selectedJointId,
    }));
  },

  // ── Misc ──────────────────────────────────────────────────────────────────
  setSelected: (id) => set({ selectedId: id, selectedJointId: null, selectedIds: [] }),
  setSelectedJoint: (jointId) => set({ selectedJointId: jointId }),

  setLinkingFrom: (nodeId) => set({ linkingFrom: nodeId }),
  setContextMenu: (menu) => set({ contextMenu: menu }),

  setShowGridLines: (value) => set({ showGridLines: value }),
  setShowSymmetryLines: (value) => set({ showSymmetryLines: value }),
  setSnapToSymmetryLines: (value) => set({ snapToSymmetryLines: value }),
  setSymmetryGuides: (guides) => set({ symmetryGuides: guides }),
  updateNextLinkDefaults: (updates) =>
    set(state => ({
      nextLinkDefaults: { ...state.nextLinkDefaults, ...updates },
    })),

  setExporting: (value) => set({ isExporting: value }),
  setExportProgress: (value) => set({ exportProgress: value }),
  setExportStatus: (value) => set({ exportStatus: value }),

  deleteSelected: () => {
    const { selectedId, selectedJointId, selectedIds, nodes, links } = get();

    // Joint delete — single selection only
    if (selectedId && !selectedIds.length && selectedJointId) {
      const lnk = links.find(l => l.id === selectedId);
      if (lnk) { get().removeLinkJoint(lnk.id, selectedJointId); return; }
    }

    // Collect everything to delete
    const toDelete = new Set([...selectedIds, selectedId].filter(Boolean));
    if (!toDelete.size) return;

    const directLinkIds = new Set(links
      .filter(link =>
        toDelete.has(link.id) ||
        toDelete.has(link.fromId) ||
        toDelete.has(link.toId)
      )
      .map(link => link.id));
    const descendantLinkIds = collectDescendantLinkIds(directLinkIds, links);

    get()._pushHistory();
    set(state => ({
      nodes: state.nodes.filter(n => !toDelete.has(n.id)),
      links: state.links.filter(l =>
        !toDelete.has(l.id) &&
        !toDelete.has(l.fromId) &&
        !toDelete.has(l.toId) &&
        !descendantLinkIds.has(l.id)
      ),
      selectedId: null,
      selectedJointId: null,
      selectedIds: [],
    }));
  },
}));

export default useStore;
