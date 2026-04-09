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
};

const LINK_DEFAULTS = {
  stroke: pageColors.blueNodeStroke,
  strokeWidth: 2,
  showArrowTip: false,
  animStartTime: null,
  animDuration: null,
  joints: [],
};

const useStore = create((set, get) => ({
  nodes: [],
  links: [],
  nextLinkDefaults: { ...LINK_DEFAULTS },

  selectedId: null,
  selectedJointId: null,
  linkingFrom: null,
  contextMenu: null,
  isExporting: false,
  exportProgress: 0,
  exportStatus: '',
  showGridLines: true,
  showSymmetryLines: true,
  snapToSymmetryLines: true,
  symmetryGuides: [],

  addNode: (canvasX, canvasY) => {
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
    }));
    return id;
  },

  updateNode: (id, updates) =>
    set(state => ({
      nodes: state.nodes.map(node => (node.id === id ? { ...node, ...updates } : node)),
    })),

  removeNode: (id) =>
    set(state => ({
      nodes: state.nodes.filter(node => node.id !== id),
      links: state.links.filter(link => link.fromId !== id && link.toId !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
      selectedJointId: state.selectedId === id ? null : state.selectedJointId,
    })),

  addLink: (fromId, toId) => {
    if (fromId === toId) return null;

    const id = uuid();
    set(state => ({
      links: [...state.links, {
        id,
        fromId,
        toId,
        ...LINK_DEFAULTS,
        ...state.nextLinkDefaults,
        joints: [...(state.nextLinkDefaults.joints ?? [])],
      }],
      selectedId: id,
      selectedJointId: null,
    }));
    return id;
  },

  updateLink: (id, updates) =>
    set(state => ({
      links: state.links.map(link => (link.id === id ? { ...link, ...updates } : link)),
    })),

  removeLink: (id) =>
    set(state => ({
      links: state.links.filter(link => link.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
      selectedJointId: state.selectedId === id ? null : state.selectedJointId,
    })),

  addLinkJoint: (linkId, joint, insertIndex) =>
    set(state => ({
      links: state.links.map(link => {
        if (link.id !== linkId) return link;
        const joints = [...(link.joints ?? [])];
        joints.splice(insertIndex, 0, joint);
        return { ...link, joints };
      }),
      selectedId: linkId,
      selectedJointId: joint.id,
      contextMenu: null,
    })),

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

  removeLinkJoint: (linkId, jointId) =>
    set(state => ({
      links: state.links.map(link => (
        link.id !== linkId
          ? link
          : {
              ...link,
              joints: (link.joints ?? []).filter(joint => joint.id !== jointId),
            }
      )),
      selectedJointId: state.selectedJointId === jointId ? null : state.selectedJointId,
    })),

  setSelected: (id) => set({ selectedId: id, selectedJointId: null }),
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
    const { selectedId, selectedJointId, nodes, links } = get();
    if (!selectedId) return;

    const selectedNode = nodes.find(node => node.id === selectedId);
    if (selectedNode) {
      get().removeNode(selectedId);
      return;
    }

    const selectedLink = links.find(link => link.id === selectedId);
    if (!selectedLink) return;

    if (selectedJointId) {
      get().removeLinkJoint(selectedLink.id, selectedJointId);
      return;
    }

    get().removeLink(selectedLink.id);
  },
}));

export default useStore;
