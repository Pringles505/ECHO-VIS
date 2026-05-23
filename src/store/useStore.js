import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import { pageColors, withAlpha } from '../../colorThemes';
import { normalizeTextMorphList } from '../text/textMorphs';
import { getMirrorSelectionPayload, isMirrorNode } from '../mirror/mirrorData';

export function isAreaNode(node) { return node?.type === 'area'; }
export function isSubdiagramNode(node) { return node?.type === 'subdiagram'; }
export function isMonitorNode(node) { return node?.type === 'monitor'; }

function snapshotMirrorOverrides(sourceNodes, sourceLinks, existingNodeOverrides = {}, existingLinkOverrides = {}) {
  const mirrorNodeOverrides = { ...existingNodeOverrides };
  for (const node of sourceNodes) {
    if (!mirrorNodeOverrides[node.id]) {
      mirrorNodeOverrides[node.id] = {
        label: node.label,
        fill: node.fill,
        stroke: node.stroke,
        textColor: node.textColor,
      };
    }
  }
  const mirrorLinkOverrides = { ...existingLinkOverrides };
  for (const link of sourceLinks) {
    if (!mirrorLinkOverrides[link.id]) {
      mirrorLinkOverrides[link.id] = { stroke: link.stroke };
    }
  }
  return { mirrorNodeOverrides, mirrorLinkOverrides };
}

export const NODE_SHAPE_PRESETS = {
  rectangle: { shape: 'rectangle', width: 150, height: 52, cornerRadius: 0 },
  rounded: { shape: 'rounded', width: 150, height: 52, cornerRadius: 10 },
  pill: { shape: 'pill', width: 176, height: 54, cornerRadius: 999 },
  cylinder: { shape: 'cylinder', width: 160, height: 58, cornerRadius: 12 },
  diamond: { shape: 'diamond', width: 154, height: 86, cornerRadius: 0 },
  hexagon: { shape: 'hexagon', width: 168, height: 92, cornerRadius: 0 },
  slanted: { shape: 'slanted', width: 168, height: 58, cornerRadius: 0 },
  circle: { shape: 'circle', width: 96, height: 96, cornerRadius: 999 },
};

function createTransformTarget(overrides = {}) {
  return {
    label: '',
    width: 150,
    height: 52,
    fill: pageColors.blueNodeFill,
    stroke: pageColors.blueNodeStroke,
    textColor: pageColors.white,
    strokeWidth: 2,
    shape: 'rounded',
    cornerRadius: 8,
    showSubBadge: false,
    ...overrides,
  };
}

function normalizeTransformTarget(target, fallback = {}) {
  return createTransformTarget({
    ...fallback,
    ...(target ?? {}),
  });
}

const NODE_DEFAULTS = {
  type: 'node',
  shape: 'rounded',
  width: 150,
  height: 52,
  fill: pageColors.blueNodeFill,
  stroke: pageColors.blueNodeStroke,
  strokeWidth: 2,
  cornerRadius: 8,
  fontSize: 13,
  textColor: pageColors.white,
  label: 'Node',
  textAnimMode: 'fade',
  textMorphs: [],
  failing: false,
  animStartTime: null,
  animDuration: null,
  triggerAfterLinkId: null,
  triggerMode: 'overlap',
  triggerDelay: 0,
  // Per-variable kill switch at this node: when true for a variable id,
  // that variable's token stops here and does not traverse any downstream links.
  tokenKillFor: {},
  transformMode: 'none',
  transformTargetNodeId: null,
  transformStartTime: null,
  transformDuration: 0.4,
  transformTarget: createTransformTarget({ label: 'Node' }),
  anchors: [],
};

const TEXT_NODE_DEFAULTS = {
  ...NODE_DEFAULTS,
  type: 'text',
  fill: pageColors.transparent,
  stroke: pageColors.transparent,
  strokeWidth: 0,
  cornerRadius: 0,
  label: 'Text',
  textPadX: 14,
  textPadY: 8,
};

const VARIABLE_NODE_DEFAULTS = {
  ...NODE_DEFAULTS,
  type: 'variable',
  label: 'Variable',
  variableLabel: 'var',
  variableValue: '',
  // Token visibility along the variable's outgoing web:
  //   'visual' → token is drawn flowing through links
  //   'silent' → value still flows logically (monitors update) but no token sprite
  inputMode: 'visual',
  // Time the token spends on each link in the variable's web. Drives speed.
  tokenHopDuration: 0.6,
  // Extra delay applied AFTER the natural chain origin (variable draw end + link draw end).
  tokenStartOffset: 0,
  // Per-variable token appearance overrides. null → inherit the global
  // simulateOptions value, otherwise this variable's token uses these.
  tokenText: null,
  tokenShape: null,
  tokenSize: null,
  tokenFill: null,
  tokenStroke: null,
  tokenTextColor: null,
  tokenTextSize: null,
  width: 180,
  height: 60,
  fill: withAlpha(pageColors.purpleAccent, 0.12),
  stroke: pageColors.purpleAccent,
  textColor: pageColors.white,
  strokeWidth: 2,
  shape: 'rounded',
  cornerRadius: 10,
};

const MONITOR_NODE_DEFAULTS = {
  ...NODE_DEFAULTS,
  type: 'monitor',
  shape: 'rounded',
  width: 200,
  height: 72,
  cornerRadius: 10,
  strokeWidth: 2,
  fill: withAlpha(pageColors.purpleAccent, 0.10),
  stroke: pageColors.purpleAccent,
  textColor: pageColors.white,
  label: 'Monitor',
  monitorTitle: '',
  showMonitorTag: true,
  // The variable (by Variable-node id) this monitor tracks.
  variableNodeId: null,
  // Each watch: { id, nodeId, template }. nodeId must belong to the tracked
  // variable's web — the PropertiesPanel filters candidates accordingly.
  monitorWatches: [],
  // Text shown before the variable's token has reached any watched node.
  initialValue: '',
};

const MIRROR_NODE_DEFAULTS = {
  ...NODE_DEFAULTS,
  type: 'mirror',
  shape: 'rounded',
  width: 320,
  height: 220,
  fill: 'transparent',
  stroke: pageColors.purpleAccent,
  strokeWidth: 2,
  cornerRadius: 12,
  label: 'Mirror',
  sourceNodeIds: [],
  sourceLinkIds: [],
  mirrorMode: 'mirror',
  mirrorNodeOverrides: {},
  mirrorLinkOverrides: {},
  mirrorScale: 1,
};

const AREA_DEFAULTS = {
  type: 'area',
  width: 340,
  height: 240,
  fill: withAlpha(pageColors.purpleAccent, 0.07),
  stroke: pageColors.purpleAccent,
  strokeWidth: 1.5,
  cornerRadius: 12,
  label: 'Area',
  fontSize: 12,
  textColor: pageColors.purpleAccent,
  areaAnimMode: 'fade',  // 'fade' | 'draw'
  areaOpacity: 1,
  animStartTime: null,
  animDuration: null,
};

const SUBDIAGRAM_DEFAULTS = {
  type: 'subdiagram',
  shape: 'rounded',
  width: 150,
  height: 52,
  cornerRadius: 8,
  label: 'Sub-diagram',
  fontSize: 13,
  fill: pageColors.blueNodeFill,
  stroke: pageColors.blueNodeStroke,
  textColor: pageColors.textMain,
  variableLabel: '',
  snapshotNodes: [],
  snapshotLinks: [],
  sourceProjectId: null,
  popupTitle: '',
  showSubBadge: true,
  showPopupInPlayback: false,
  popupDelay: 0.4,
  popupPlaybackSpeed: 1,
  popupHold: 0.9,
  transformMode: 'none',
  transformTargetNodeId: null,
  transformStartTime: null,
  transformDuration: 0.4,
  transformTarget: createTransformTarget({
    label: 'Sub-diagram',
    textColor: pageColors.textMain,
    showSubBadge: true,
  }),
  animStartTime: null,
  animDuration: null,
  triggerAfterLinkId: null,
  triggerMode: 'overlap',
  triggerDelay: 0,
  anchors: [],
};

  const LINK_DEFAULTS = {
  stroke: pageColors.blueNodeStroke,
  strokeWidth: 2,
  showArrowTip: false,
  arrowTipMode: 'flow',
  failing: false,
  exemptFromSync: false,
  syncGroupKey: null,
  messageLabel: '',
  // Bind this link's animation to a variable token hop timing
  bindToTokenHop: false,
  // When set, bind specifically to this variable's hop on this link; otherwise first available
  bindVariableId: null,
  // Additive offset (seconds) relative to hop start when bound
  bindHopOffset: 0,
  // Scale factor applied to hop duration when bound (1 = same)
  bindHopScale: 1,
  // If true and binding is enabled, auto-trigger the target node to appear at hop end when toggled on via UI
  autoTriggerTarget: true,
  fromJunctionLinkId: null,
  fromJunctionJointId: null,
  toJunctionLinkId: null,
  toJunctionJointId: null,
  fromAnchorSide: null,
  toAnchorSide: null,
  fromAnchorLockedCenter: false,
  toAnchorLockedCenter: false,
  fromAnchorId: null,
  toAnchorId: null,
  fromAlongPos: 0,
  toAlongPos: 0,
  animStartTime: null,
  animDuration: null,
    // Per-hop override for variable token timing. null → use the variable's
    // tokenHopDuration default. Otherwise this link's hop takes exactly this many seconds.
    tokenHopDuration: null,
    // Extra delay inserted BEFORE this hop runs (clamped ≥ 0). 0 means the hop
    // starts at its natural chained time (max of upstream-end and link draw end).
    tokenHopDelay: 0,
    // When true, this link's hop is excluded from the variable's token animation.
    // Downstream hops chain normally; the token "jumps" across this link in zero time.
    tokenHopSkip: false,
    // Per-variable hop overrides: { [variableNodeId]: { skip?: boolean, delay?: number, duration?: number|null } }
    // If a property is present under the variable id, it takes precedence over the global tokenHop* above.
    tokenHopOverrides: {},
    joints: [],
  };

const MAX_HISTORY = 60;

function getTextNodeSize(label, fontSize, textPadX = TEXT_NODE_DEFAULTS.textPadX, textPadY = TEXT_NODE_DEFAULTS.textPadY) {
  const safeLabel = (label ?? '').trim() || 'Text';
  return {
    width: Math.max(44, Math.ceil(safeLabel.length * fontSize * 0.62 + textPadX * 2)),
    height: Math.max(26, Math.ceil(fontSize * 1.45 + textPadY * 2)),
  };
}

function normalizeNode(node, updates = {}) {
  const nextNode = {
    ...node,
    ...updates,
    textMorphs: normalizeTextMorphList(updates.textMorphs ?? node.textMorphs ?? []),
    transformTarget: normalizeTransformTarget(
      updates.transformTarget ?? node.transformTarget,
      {
        label: updates.label ?? node.label ?? '',
        width: updates.width ?? node.width ?? 150,
        height: updates.height ?? node.height ?? 52,
        fill: updates.fill ?? node.fill ?? pageColors.blueNodeFill,
        stroke: updates.stroke ?? node.stroke ?? pageColors.blueNodeStroke,
        textColor: updates.textColor ?? node.textColor ?? pageColors.white,
        strokeWidth: updates.strokeWidth ?? node.strokeWidth ?? 2,
        shape: updates.shape ?? node.shape ?? 'rounded',
        cornerRadius: updates.cornerRadius ?? node.cornerRadius ?? 8,
        showSubBadge: (updates.type ?? node.type) === 'subdiagram'
          ? (updates.showSubBadge ?? node.showSubBadge ?? true)
          : false,
      }
    ),
  };
  if (nextNode.type === 'mirror') {
    return {
      ...nextNode,
      sourceNodeIds: [...(nextNode.sourceNodeIds ?? [])],
      sourceLinkIds: [...(nextNode.sourceLinkIds ?? [])],
      mirrorNodeOverrides: { ...(nextNode.mirrorNodeOverrides ?? {}) },
      mirrorLinkOverrides: { ...(nextNode.mirrorLinkOverrides ?? {}) },
    };
  }
  if (nextNode.type !== 'text') return nextNode;

  const hasExplicitSize = Object.prototype.hasOwnProperty.call(updates, 'width') || Object.prototype.hasOwnProperty.call(updates, 'height');
  if (hasExplicitSize) return nextNode;

  return {
    ...nextNode,
    ...getTextNodeSize(nextNode.label, nextNode.fontSize, nextNode.textPadX, nextNode.textPadY),
  };
}

function collectDescendantLinkIds(linkIds, links) {
  const queue = [...linkIds];
  const seen = new Set(queue);

  while (queue.length) {
    const currentId = queue.shift();
    for (const link of links) {
      if (seen.has(link.id)) continue;
      if (link.fromJunctionLinkId === currentId || link.toJunctionLinkId === currentId) {
        seen.add(link.id);
        queue.push(link.id);
      }
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
    nodes: state.nodes.map(n => ({
      ...n,
      anchors: [...(n.anchors ?? [])],
      textMorphs: normalizeTextMorphList(n.textMorphs ?? []),
      transformTarget: { ...(n.transformTarget ?? {}) },
      sourceNodeIds: [...(n.sourceNodeIds ?? [])],
      sourceLinkIds: [...(n.sourceLinkIds ?? [])],
      mirrorNodeOverrides: { ...(n.mirrorNodeOverrides ?? {}) },
      mirrorLinkOverrides: { ...(n.mirrorLinkOverrides ?? {}) },
    })),
    links: state.links.map(l => ({ ...l, joints: [...(l.joints ?? [])] })),
  };
}

const useStore = create((set, get) => ({
  nodes: [],
  links: [],
  nextLinkDefaults: { ...LINK_DEFAULTS },

  selectedId: null,
  selectedJointId: null,
  selectedIds: [],
  clipboard: null,
  linkingFrom: null,
  contextMenu: null,
  pendingMorphEdit: null, // { nodeId, morphId } — consumed by DiagramCanvas to open inline editor
  setPendingMorphEdit: (nodeId, morphId) => set({ pendingMorphEdit: nodeId && morphId ? { nodeId, morphId } : null }),
  colorClipboard: null, // hex string — shared across all ColorInput instances
  setColorClipboard: (color) => set({ colorClipboard: color }),

  isExporting: false,
  exportProgress: 0,
  exportStatus: '',
  showGridLines: true,
  showSymmetryLines: true,
  snapToSymmetryLines: true,
  symmetryGuides: [],

  // Token appearance options (always-on; variables drive tokens automatically).
  simulateOptions: {
    tokenShape: 'circle', // circle | square | diamond
    tokenSize: 7,         // radius in px for circle; half-size for square/diamond
    tokenFill: '#ffffff',
    tokenStroke: pageColors.blueLink,
    tokenText: '',
    tokenTextColor: pageColors.blueLink,
    tokenTextSize: 10,
  },

  activeProject: null,
  expandedSubdiagramId: null,

  setActiveProject: (meta) => set({ activeProject: meta }),
  setExpandedSubdiagramId: (id) => set({ expandedSubdiagramId: id }),

  renameActiveProject: (name) =>
    set(s => s.activeProject ? { activeProject: { ...s.activeProject, name } } : {}),

  loadProjectData: ({ nodes, links }) =>
    set({
      nodes: nodes.map(node => normalizeNode(node)),
      links,
      past: [],
      future: [],
      selectedId: null,
      selectedJointId: null,
      selectedIds: [],
      nextLinkDefaults: { ...LINK_DEFAULTS },
    }),

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

  setSelectedIds: (ids) => set({ selectedIds: ids }),

  addToSelection: (id) => set(state => ({
    selectedIds: (() => {
      const base = new Set(state.selectedIds);
      if (state.selectedId) base.add(state.selectedId);
      base.add(id);
      return [...base];
    })(),
    selectedId: id,
    selectedJointId: null,
  })),

  selectAll: () => set(state => ({
    selectedIds: [...state.nodes.map(n => n.id), ...state.links.map(l => l.id)],
    selectedId: state.nodes[0]?.id ?? state.links[0]?.id ?? null,
    selectedJointId: null,
  })),

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
        textMorphs: normalizeTextMorphList(n.textMorphs ?? []).map(morph => ({
          ...morph,
          id: uuid(),
        })),
        sourceNodeIds: (n.sourceNodeIds ?? []).map(sourceId => idMap[sourceId] ?? sourceId),
        sourceLinkIds: [...(n.sourceLinkIds ?? [])],
        mirrorNodeOverrides: Object.fromEntries(
          Object.entries(n.mirrorNodeOverrides ?? {}).map(([sourceId, value]) => [idMap[sourceId] ?? sourceId, { ...value }])
        ),
        mirrorLinkOverrides: { ...(n.mirrorLinkOverrides ?? {}) },
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
        toJunctionLinkId: l.toJunctionLinkId ? linkIdMap[l.toJunctionLinkId] ?? null : null,
        toJunctionJointId: l.toJunctionJointId ? jointIdMap[l.toJunctionJointId] ?? null : null,
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
    for (const node of newNodes) {
      if (!isMirrorNode(node)) continue;
      node.sourceLinkIds = (node.sourceLinkIds ?? []).map(sourceId => linkIdMap[sourceId] ?? sourceId);
      node.mirrorLinkOverrides = Object.fromEntries(
        Object.entries(node.mirrorLinkOverrides ?? {}).map(([sourceId, value]) => [linkIdMap[sourceId] ?? sourceId, { ...value }])
      );
    }
    const newIds = [...newNodes.map(n => n.id), ...newLinks.map(l => l.id)];
    set(state => ({
      nodes: [...state.nodes, ...newNodes],
      links: [...state.links, ...newLinks],
      selectedIds: newIds,
      selectedId: newNodes[0]?.id ?? newLinks[0]?.id ?? null,
      selectedJointId: null,
    }));
  },

  addNode: (canvasX, canvasY, overrides = {}) => {
    get()._pushHistory();
    const id = uuid();
    const shape = overrides.shape ?? 'rounded';
    const preset = NODE_SHAPE_PRESETS[shape] ?? NODE_SHAPE_PRESETS.rounded;
    const node = normalizeNode({
      id,
      ...NODE_DEFAULTS,
      ...preset,
      ...overrides,
      label: overrides.label ?? `Node ${get().nodes.filter(node => node.type !== 'text').length + 1}`,
    });
    set(state => ({
      nodes: [...state.nodes, {
        ...node,
        x: canvasX - node.width / 2,
        y: canvasY - node.height / 2,
      }],
      contextMenu: null,
      selectedId: id,
      selectedJointId: null,
      selectedIds: [],
    }));
    return id;
  },

  addTextNode: (canvasX, canvasY) => {
    get()._pushHistory();
    const id = uuid();
    const textNode = {
      id,
      ...TEXT_NODE_DEFAULTS,
      label: `Text ${get().nodes.filter(node => node.type === 'text').length + 1}`,
      fontSize: 20,
      textColor: pageColors.white,
      textAnimMode: 'fade',
      anchors: [],
      animStartTime: null,
      animDuration: null,
      triggerAfterLinkId: null,
      triggerMode: 'overlap',
      triggerDelay: 0,
    };
    const sizedNode = normalizeNode(textNode);
    const node = {
      ...sizedNode,
      x: canvasX - sizedNode.width / 2,
      y: canvasY - sizedNode.height / 2,
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

  addVariableNode: (canvasX, canvasY) => {
    get()._pushHistory();
    const id = uuid();
    const node = normalizeNode({ id, ...VARIABLE_NODE_DEFAULTS });
    set(state => ({
      nodes: [...state.nodes, { ...node, x: canvasX - node.width / 2, y: canvasY - node.height / 2 }],
      contextMenu: null,
      selectedId: id,
      selectedJointId: null,
      selectedIds: [],
    }));
    return id;
  },

  addMonitorNode: (canvasX, canvasY) => {
    get()._pushHistory();
    const id = uuid();
    const node = {
      id,
      ...MONITOR_NODE_DEFAULTS,
      monitorWatches: [],
    };
    set(state => ({
      nodes: [...state.nodes, { ...node, x: canvasX - node.width / 2, y: canvasY - node.height / 2 }],
      contextMenu: null,
      selectedId: id,
      selectedJointId: null,
      selectedIds: [],
    }));
    return id;
  },

  setMonitorVariable: (monitorId, variableNodeId) => {
    if (!monitorId) return;
    get()._pushHistory();
    set(state => ({
      nodes: state.nodes.map(node => {
        if (node.id !== monitorId) return node;
        // Variable changed → drop stale watches that referenced the prior web.
        return { ...node, variableNodeId: variableNodeId || null, monitorWatches: [] };
      }),
    }));
  },

  addMonitorWatch: (monitorId, watchedNodeId) => {
    if (!monitorId || !watchedNodeId) return;
    get()._pushHistory();
    set(state => ({
      nodes: state.nodes.map(node => {
        if (node.id !== monitorId) return node;
        const watches = [...(node.monitorWatches ?? [])];
        if (watches.some(w => w.nodeId === watchedNodeId)) return node;
        watches.push({ id: uuid(), nodeId: watchedNodeId, template: '{value}' });
        return { ...node, monitorWatches: watches };
      }),
    }));
  },

  updateMonitorWatch: (monitorId, watchId, updates) =>
    set(state => ({
      nodes: state.nodes.map(node => {
        if (node.id !== monitorId) return node;
        return {
          ...node,
          monitorWatches: (node.monitorWatches ?? []).map(w =>
            w.id === watchId ? { ...w, ...updates } : w
          ),
        };
      }),
    })),

  removeMonitorWatch: (monitorId, watchId) => {
    get()._pushHistory();
    set(state => ({
      nodes: state.nodes.map(node => {
        if (node.id !== monitorId) return node;
        return {
          ...node,
          monitorWatches: (node.monitorWatches ?? []).filter(w => w.id !== watchId),
        };
      }),
    }));
  },

  addMirrorNode: (canvasX, canvasY, sourceSelectionIds = []) => {
    get()._pushHistory();
    const id = uuid();
    const mirrorNode = normalizeNode({
      id,
      ...MIRROR_NODE_DEFAULTS,
      ...getMirrorSelectionPayload(sourceSelectionIds, get().nodes, get().links, id),
    });
    const sourceNodes = get().nodes.filter(node => mirrorNode.sourceNodeIds.includes(node.id) && !isMirrorNode(node));
    const sourceLinks = get().links.filter(link => mirrorNode.sourceLinkIds.includes(link.id));
    const { mirrorNodeOverrides, mirrorLinkOverrides } = snapshotMirrorOverrides(sourceNodes, sourceLinks);
    mirrorNode.mirrorNodeOverrides = mirrorNodeOverrides;
    mirrorNode.mirrorLinkOverrides = mirrorLinkOverrides;
    const sourceWidth = sourceNodes.length
      ? Math.max(...sourceNodes.map(node => node.x + node.width)) - Math.min(...sourceNodes.map(node => node.x))
      : MIRROR_NODE_DEFAULTS.width - 36;
    const sourceHeight = sourceNodes.length
      ? Math.max(...sourceNodes.map(node => node.y + node.height)) - Math.min(...sourceNodes.map(node => node.y))
      : MIRROR_NODE_DEFAULTS.height - 36;
    mirrorNode.width = Math.max(180, sourceWidth + 36);
    mirrorNode.height = Math.max(120, sourceHeight + 36);
    mirrorNode.x = canvasX - mirrorNode.width / 2;
    mirrorNode.y = canvasY - mirrorNode.height / 2;
    set(state => ({
      nodes: [...state.nodes, mirrorNode],
      contextMenu: null,
      selectedId: id,
      selectedJointId: null,
      selectedIds: [],
    }));
    return id;
  },

  updateNode: (id, updates) =>
    set(state => ({
      nodes: state.nodes.map(node => (node.id === id ? normalizeNode(node, updates) : node)),
    })),

  captureMirrorSelection: (mirrorId, selectionIds = []) => {
    const state = get();
    const payload = getMirrorSelectionPayload(selectionIds, state.nodes, state.links, mirrorId);
    const currentMirror = state.nodes.find(n => n.id === mirrorId);
    const existingNodeOverrides = currentMirror?.mirrorNodeOverrides ?? {};
    const existingLinkOverrides = currentMirror?.mirrorLinkOverrides ?? {};
    const newSourceNodes = state.nodes.filter(n => payload.sourceNodeIds.includes(n.id) && !isMirrorNode(n));
    const newSourceLinks = state.links.filter(l => payload.sourceLinkIds.includes(l.id));
    const { mirrorNodeOverrides, mirrorLinkOverrides } = snapshotMirrorOverrides(
      newSourceNodes, newSourceLinks, existingNodeOverrides, existingLinkOverrides
    );
    set({
      nodes: state.nodes.map(node => (node.id === mirrorId
        ? normalizeNode(node, { ...payload, mirrorNodeOverrides, mirrorLinkOverrides })
        : node)),
    });
  },

  updateMirrorNodeOverride: (mirrorId, sourceNodeId, updates) =>
    set(state => ({
      nodes: state.nodes.map(node => {
        if (node.id !== mirrorId) return node;
        const current = node.mirrorNodeOverrides?.[sourceNodeId] ?? {};
        const next = { ...current, ...updates };
        return normalizeNode(node, {
          mirrorNodeOverrides: {
            ...(node.mirrorNodeOverrides ?? {}),
            [sourceNodeId]: next,
          },
        });
      }),
    })),

  updateMirrorLinkOverride: (mirrorId, sourceLinkId, updates) =>
    set(state => ({
      nodes: state.nodes.map(node => {
        if (node.id !== mirrorId) return node;
        const current = node.mirrorLinkOverrides?.[sourceLinkId] ?? {};
        const next = { ...current, ...updates };
        return normalizeNode(node, {
          mirrorLinkOverrides: {
            ...(node.mirrorLinkOverrides ?? {}),
            [sourceLinkId]: next,
          },
        });
      }),
    })),

  addSubdiagramNode: (canvasX, canvasY) => {
    get()._pushHistory();
    const id = uuid();
    const node = {
      id,
      ...SUBDIAGRAM_DEFAULTS,
      x: canvasX - SUBDIAGRAM_DEFAULTS.width / 2,
      y: canvasY - SUBDIAGRAM_DEFAULTS.height / 2,
    };
    set(state => ({
      nodes: [...state.nodes, node],
      selectedId: id,
      selectedJointId: null,
      selectedIds: [],
    }));
    return id;
  },

  addArea: (canvasX, canvasY) => {
    get()._pushHistory();
    const id = uuid();
    const area = {
      id,
      ...AREA_DEFAULTS,
      x: canvasX - AREA_DEFAULTS.width / 2,
      y: canvasY - AREA_DEFAULTS.height / 2,
    };
    set(state => ({
      nodes: [...state.nodes, area],
      selectedId: id,
      selectedJointId: null,
      selectedIds: [],
    }));
    return id;
  },

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

  addLink: (fromId, toId, overrides = {}) => {
    if (fromId === toId && !overrides.toJunctionLinkId) return null;
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

  reverseLink: (id) => {
    get()._pushHistory();
    set(state => ({
      links: state.links.map(link => link.id !== id ? link : {
        ...link,
        fromId: link.toId,
        toId: link.fromId,
        fromAnchorSide: link.toAnchorSide,
        toAnchorSide: link.fromAnchorSide,
        fromAnchorLockedCenter: link.toAnchorLockedCenter,
        toAnchorLockedCenter: link.fromAnchorLockedCenter,
        fromAlongPos: link.toAlongPos,
        toAlongPos: link.fromAlongPos,
        fromAnchorId: link.toAnchorId,
        toAnchorId: link.fromAnchorId,
        fromJunctionLinkId: link.toJunctionLinkId,
        fromJunctionJointId: link.toJunctionJointId,
        toJunctionLinkId: link.fromJunctionLinkId,
        toJunctionJointId: link.fromJunctionJointId,
      }),
    }));
  },

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

  setSelection: (id, ids = []) => set({
    selectedId: id,
    selectedJointId: null,
    selectedIds: ids,
  }),
  setSelected: (id) => set({ selectedId: id, selectedJointId: null, selectedIds: [] }),
  setSelectedJoint: (jointId) => set({ selectedJointId: jointId }),

  setLinkingFrom: (nodeId) => set({ linkingFrom: nodeId }),
  setContextMenu: (menu) => set({ contextMenu: menu }),

  setShowGridLines: (value) => set({ showGridLines: value }),
  setShowSymmetryLines: (value) => set({ showSymmetryLines: value }),
  setSnapToSymmetryLines: (value) => set({ snapToSymmetryLines: value }),
  setSymmetryGuides: (guides) => set({ symmetryGuides: guides }),
  setSimulateOptions: (updates) => set(state => ({ simulateOptions: { ...state.simulateOptions, ...(updates ?? {}) } })),
  updateNextLinkDefaults: (updates) =>
    set(state => ({
      nextLinkDefaults: { ...state.nextLinkDefaults, ...updates },
    })),

  setExporting: (value) => set({ isExporting: value }),
  setExportProgress: (value) => set({ exportProgress: value }),
  setExportStatus: (value) => set({ exportStatus: value }),

  deleteSelected: () => {
    const { selectedId, selectedJointId, selectedIds, nodes, links } = get();

    if (selectedId && !selectedIds.length && selectedJointId) {
      const lnk = links.find(l => l.id === selectedId);
      if (lnk) { get().removeLinkJoint(lnk.id, selectedJointId); return; }
    }

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
