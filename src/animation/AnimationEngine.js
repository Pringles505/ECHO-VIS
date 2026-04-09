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

    for (const node of this.nodes) {
      const start = node.animStartTime != null ? node.animStartTime : t;
      const duration = node.animDuration != null ? node.animDuration : nodeDuration;
      events.push({ type: 'node', id: node.id, start, duration });
      if (node.animStartTime == null) t = start + duration + nodeGap;
    }

    t += linkStartPause;

    for (const link of this.links) {
      const start = link.animStartTime != null ? link.animStartTime : t;
      const duration = link.animDuration != null ? link.animDuration : linkDuration;
      events.push({ type: 'link', id: link.id, start, duration });
      if (link.animStartTime == null) t = start + duration + linkGap;
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
          opacity: clamp(raw * 3, 0, 1),
          scale: lerp(0.7, 1, ease.easeOut(raw)),
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
