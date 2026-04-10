import { getLinkJointProgress } from '../links/linkGeometry';

const ease = {
  linear: t => t,
  easeOut: t => 1 - Math.pow(1 - t, 3),
  easeInOut: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  spring: t => {
    if (t === 0 || t === 1) return t;
    const c4 = (2 * Math.PI) / 3;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function inverseEaseOut(value) {
  const clamped = clamp(value, 0, 1);
  return 1 - Math.pow(1 - clamped, 1 / 3);
}

function getJunctionKey(link) {
  if (link.syncGroupKey) return link.syncGroupKey;
  return link.fromJunctionLinkId && link.fromJunctionJointId
    ? `${link.fromJunctionLinkId}::${link.fromJunctionJointId}`
    : null;
}

export class AnimationEngine {
  constructor(nodes, links, options = {}) {
    this.nodes = nodes;
    this.links = links;
    this.opts = {
      initialDelay: options.initialDelay ?? 0.3,
      nodeDuration: options.nodeDuration ?? 0.5,
      nodeGap: options.nodeGap ?? 0.08,
      linkStartPause: options.linkStartPause ?? 0.2,
      linkDuration: options.linkDuration ?? 0.65,
      linkGap: options.linkGap ?? 0.06,
      holdAfter: options.holdAfter ?? 1.2,
    };

    this._timeline = this._buildTimeline();
  }

  _buildTimeline() {
    const {
      initialDelay,
      nodeDuration,
      nodeGap,
      linkStartPause,
      linkDuration,
      linkGap,
      holdAfter,
    } = this.opts;

    const events = [];
    let t = initialDelay;
    const linkMap = Object.fromEntries(this.links.map(link => [link.id, link]));
    const junctionStartCache = new Map();

    const getAutoJunctionStart = (link, fallbackStart) => {
      if (!(link.fromJunctionLinkId && link.fromJunctionJointId)) return fallbackStart;

      const cacheKey = `${link.fromJunctionLinkId}::${link.fromJunctionJointId}`;
      if (junctionStartCache.has(cacheKey)) {
        return junctionStartCache.get(cacheKey) ?? fallbackStart;
      }

      const parentInfo = linkInfoMap[link.fromJunctionLinkId];
      if (!parentInfo) {
        junctionStartCache.set(cacheKey, null);
        return fallbackStart;
      }

      const jointProgress = getLinkJointProgress(
        link.fromJunctionLinkId,
        link.fromJunctionJointId,
        this.links,
        this.nodes
      );
      const start = jointProgress == null
        ? parentInfo.start
        : parentInfo.start + parentInfo.duration * inverseEaseOut(jointProgress);

      junctionStartCache.set(cacheKey, start);
      return start;
    };

    // Free nodes (not triggered by a link) animate first.
    const freeNodes     = this.nodes.filter(n => !n.triggerAfterLinkId);
    const triggeredNodes = this.nodes.filter(n =>  n.triggerAfterLinkId);

    for (const node of freeNodes) {
      const start    = node.animStartTime != null ? node.animStartTime : t;
      const duration = node.animDuration  != null ? node.animDuration  : nodeDuration;
      events.push({ type: 'node', id: node.id, start, duration });
      t = Math.max(t, start + duration + nodeGap);
    }

    t += linkStartPause;

    // Links — build a map of id → { start, end, duration } so triggered nodes can reference it.
    const linkInfoMap = {};
    const processedSimultaneousJunctions = new Set();
    for (const link of this.links) {
      const junctionKey = getJunctionKey(link);
      if (junctionKey && processedSimultaneousJunctions.has(junctionKey)) {
        continue;
      }

      const sourceJoint = link.fromJunctionLinkId && link.fromJunctionJointId
        ? linkMap[link.fromJunctionLinkId]?.joints?.find(joint => joint.id === link.fromJunctionJointId) ?? null
        : null;
      const syncBranches = !!sourceJoint?.syncBranches;

      if (junctionKey && syncBranches) {
        const siblingLinks = this.links.filter(item =>
          getJunctionKey(item) === junctionKey
        );
        const autoStart = getAutoJunctionStart(link, t);
        const explicitStarts = siblingLinks
          .map(item => item.animStartTime)
          .filter(value => value != null);
        const start = explicitStarts.length
          ? Math.min(...explicitStarts)
          : autoStart;
        let groupEnd = start;
        for (const sibling of siblingLinks) {
          const duration = sibling.animDuration != null ? sibling.animDuration : linkDuration;
          events.push({ type: 'link', id: sibling.id, start, duration });
          linkInfoMap[sibling.id] = { start, end: start + duration, duration };
          groupEnd = Math.max(groupEnd, start + duration);
        }
        t = Math.max(t, groupEnd + linkGap);
        processedSimultaneousJunctions.add(junctionKey);
        continue;
      }

      const autoStart = getAutoJunctionStart(link, t);
      const start    = link.animStartTime != null ? link.animStartTime : autoStart;
      const duration = link.animDuration  != null ? link.animDuration  : linkDuration;
      events.push({ type: 'link', id: link.id, start, duration });
      linkInfoMap[link.id] = { start, end: start + duration, duration };
      t = Math.max(t, start + duration + linkGap);
    }

    // Triggered nodes.
    // 'overlap' mode: node fades in during the final 70% of its own duration
    //   so it is fully opaque exactly when the link tip stops — no gap.
    // 'on-end' mode: node starts the moment the link finishes (user choice,
    //   accepts the brief gap as a stylistic crisp beat).
    for (const node of triggeredNodes) {
      const info     = linkInfoMap[node.triggerAfterLinkId];
      const duration = node.animDuration != null ? node.animDuration : nodeDuration;
      const triggerEnd = info ? info.end : t;
      const earliest   = info ? info.start : 0;

      const lead  = node.triggerMode === 'on-end' ? 0 : duration * 0.7;
      const delay = node.triggerDelay ?? 0;
      const start = Math.max(earliest, triggerEnd - lead + delay);
      events.push({ type: 'node', id: node.id, start, duration });
    }

    this._totalDuration = t + holdAfter;
    for (const event of events) {
      this._totalDuration = Math.max(this._totalDuration, event.start + event.duration + holdAfter);
    }

    return events;
  }

  getTotalDuration() {
    return this._totalDuration;
  }

  getTimeline() {
    return this._timeline;
  }

  getStateAtTime(t) {
    const nodeStates = {};
    const linkStates = {};

    for (const event of this._timeline) {
      const raw = clamp((t - event.start) / event.duration, 0, 1);

      if (event.type === 'node') {
        nodeStates[event.id] = {
          opacity: ease.easeOut(clamp(raw * 1.6, 0, 1)),
          scale: lerp(0.82, 1, ease.easeOut(raw)),
        };
      } else {
        linkStates[event.id] = {
          progress: ease.easeOut(raw),
        };
      }
    }

    return { nodeStates, linkStates };
  }

  getBoundingBox() {
    if (!this.nodes.length) return { x: 0, y: 0, w: 800, h: 600, cx: 400, cy: 300 };
    const minX = Math.min(...this.nodes.map(node => node.x));
    const minY = Math.min(...this.nodes.map(node => node.y));
    const maxX = Math.max(...this.nodes.map(node => node.x + node.width));
    const maxY = Math.max(...this.nodes.map(node => node.y + node.height));
    return {
      x: minX,
      y: minY,
      w: maxX - minX,
      h: maxY - minY,
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
    };
  }
}
