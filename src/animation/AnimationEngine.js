import { getLinkJointProgress } from '../links/linkGeometry';
import { computeVariableWebs } from '../variables/flow';
import { getNodeTextMorphs, getTextMorphRenderState, getStyleMorphRenderState } from '../text/textMorphs';

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

function isResolvableTargetNode(node) {
  return !!node && node.type !== 'area' && node.type !== 'mirror' && node.type !== 'text';
}

function getTransformMode(node) {
  if (!node) return 'none';
  if (node.transformMode) return node.transformMode;
  return node.transformTargetNodeId ? 'existing' : 'none';
}

function buildExistingTransformStyle(sourceNode, fallbackNode, labelText = sourceNode?.label ?? '') {
  if (!isResolvableTargetNode(sourceNode)) return null;
  return {
    labelText,
    fill: sourceNode.fill ?? fallbackNode?.fill ?? null,
    stroke: sourceNode.stroke ?? fallbackNode?.stroke ?? null,
    textColor: sourceNode.textColor ?? fallbackNode?.textColor ?? null,
    strokeWidth: sourceNode.strokeWidth ?? fallbackNode?.strokeWidth ?? 2,
    shape: sourceNode.shape ?? fallbackNode?.shape ?? null,
    cornerRadius: sourceNode.cornerRadius ?? fallbackNode?.cornerRadius ?? 8,
    showSubBadge: sourceNode.type === 'subdiagram'
      ? (sourceNode.showSubBadge ?? true)
      : false,
  };
}

function buildCustomTransformStyle(node) {
  if (!node?.transformTarget) return null;
  return {
    labelText: node.transformTarget.label ?? '',
    fill: node.transformTarget.fill ?? node.fill ?? null,
    stroke: node.transformTarget.stroke ?? node.stroke ?? null,
    textColor: node.transformTarget.textColor ?? node.textColor ?? null,
    strokeWidth: node.transformTarget.strokeWidth ?? node.strokeWidth ?? 2,
    shape: node.transformTarget.shape ?? node.shape ?? null,
    cornerRadius: node.transformTarget.cornerRadius ?? node.cornerRadius ?? 8,
    showSubBadge: node.transformTarget.showSubBadge
      ?? (node.type === 'subdiagram' ? (node.showSubBadge ?? true) : false),
  };
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
      ancestorSubdiagramIds: options.ancestorSubdiagramIds ?? [],
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
      ancestorSubdiagramIds,
    } = this.opts;

    const events = [];
    let t = initialDelay;
    const linkMap = Object.fromEntries(this.links.map(link => [link.id, link]));
    const junctionStartCache = new Map();
    const getSubdiagramPopupMetrics = (node, start, duration, triggerLinkInfo = null) => {
      if (
        node?.type !== 'subdiagram' ||
        ancestorSubdiagramIds.includes(node.id) ||
        (node.snapshotNodes?.length ?? 0) === 0
      ) {
        return null;
      }

      const cleanedSnapshot = (node.snapshotNodes ?? []).map(n =>
        n.type === 'subdiagram' ? { ...n, animStartTime: null, animDuration: null } : n
      );
      const nestedEngine = new AnimationEngine(cleanedSnapshot, node.snapshotLinks ?? [], {
        holdAfter: 0,
        ancestorSubdiagramIds: [...ancestorSubdiagramIds, node.id],
      });
      const nestedTimeline = nestedEngine.getTimeline();
      const nestedContentDuration = nestedEngine.getContentDuration();
      const popupDelay = Math.max(0, node.popupDelay ?? 0);
      const popupPlaybackSpeed = Math.max(0.25, node.popupPlaybackSpeed ?? 1);
      const popupHold = Math.max(0, node.popupHold ?? 0);
      const popupEnabled = !!node.showPopupInPlayback;
      const popupStart = popupEnabled
        ? Math.max(
          start + popupDelay,
          triggerLinkInfo ? triggerLinkInfo.start + triggerLinkInfo.duration + popupDelay : -Infinity
        )
        : null;
      const popupEnd = popupEnabled
        ? popupStart + nestedContentDuration / popupPlaybackSpeed + popupHold
        : null;
      const transformMode = getTransformMode(node);
      const transformTargetNode = transformMode === 'existing'
        ? cleanedSnapshot.find(item => item.id === node.transformTargetNodeId) ?? null
        : null;
      const transformTargetTiming = transformTargetNode
        ? nestedTimeline.find(event => event.type === 'node' && event.id === transformTargetNode.id) ?? null
        : null;
      const transformTargetText = transformTargetNode
        ? getTextMorphRenderState(
          transformTargetNode,
          {
            start: transformTargetTiming?.start ?? 0,
            duration: transformTargetTiming?.duration ?? (transformTargetNode.animDuration ?? nodeDuration),
          },
          nestedContentDuration
        )
        : null;
      const transformDuration = Math.max(0.1, node.transformDuration ?? 0.4);
      const minTransformStart = popupEnabled ? popupEnd : start + duration;
      const transformTargetStyle = transformMode === 'custom'
        ? buildCustomTransformStyle(node)
        : buildExistingTransformStyle(
          transformTargetNode,
          node,
          transformTargetText?.baseText ?? transformTargetNode?.label ?? ''
        );
      const transformStart = transformTargetStyle
        ? Math.max(minTransformStart ?? 0, node.transformStartTime ?? (minTransformStart ?? 0))
        : null;
      const transformEnd = transformStart != null ? transformStart + transformDuration : null;
      const blockStart = start + duration;
      return {
        popupStart,
        popupEnd,
        blockStart,
        ownerEnd: start + duration,
        pauseLength: popupEnabled ? Math.max(0, popupEnd - blockStart) : 0,
        transformStart,
        transformEnd,
        transformTargetStyle,
      };
    };

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

    const timelineNodes = this.nodes.filter(node => node.type !== 'mirror');
    const freeNodes     = timelineNodes.filter(n => !n.triggerAfterLinkId);
    const triggeredNodes = timelineNodes.filter(n =>  n.triggerAfterLinkId);

    for (const node of freeNodes) {
      const start    = node.animStartTime != null ? node.animStartTime : t;
      const duration = node.animDuration  != null ? node.animDuration  : nodeDuration;
      events.push({
        type: 'node',
        id: node.id,
        start,
        duration,
        displayDuration: duration,
      });
      t = Math.max(t, start + duration + nodeGap);
    }

    t += linkStartPause;

    const linkInfoMap = {};
    const processedSimultaneousJunctions = new Set();
    // Precompute variable token timing (binding) using current node-only timeline
    const nodeOnlyTimeline = events.filter(ev => ev.type === 'node');
    const websForBinding = computeVariableWebs(this.nodes, this.links, { timeline: nodeOnlyTimeline });
    const timingByLinkId = new Map();
    for (const web of websForBinding) {
      for (const [lId, timing] of Object.entries(web.tokenTiming)) {
        if (!timingByLinkId.has(lId)) timingByLinkId.set(lId, []);
        timingByLinkId.get(lId).push({ web, timing });
      }
    }

    for (const link of this.links) {
      // A link marked exemptFromSync is always treated as standalone, even if it
      // shares a junction with synced siblings.
      const junctionKey = link.exemptFromSync ? null : getJunctionKey(link);
      if (junctionKey && processedSimultaneousJunctions.has(junctionKey)) {
        continue;
      }

      const sourceJoint = link.fromJunctionLinkId && link.fromJunctionJointId
        ? linkMap[link.fromJunctionLinkId]?.joints?.find(joint => joint.id === link.fromJunctionJointId) ?? null
        : null;
      const syncBranches = !!sourceJoint?.syncBranches;

      if (junctionKey && syncBranches) {
        // Exclude any sibling that has opted out of sync.
        const siblingLinks = this.links.filter(item =>
          !item.exemptFromSync && getJunctionKey(item) === junctionKey
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

      // Exempt links ignore junction timing and animate sequentially like normal links.
      const autoStart = link.exemptFromSync
        ? t
        : getAutoJunctionStart(link, t);
      let start    = link.animStartTime != null ? link.animStartTime : autoStart;
      let duration = link.animDuration  != null ? link.animDuration  : linkDuration;

      // If binding to token hop is enabled, override start/duration from tokenTiming
      if (link.bindToTokenHop) {
        const candidates = timingByLinkId.get(link.id) ?? [];
        let chosen = null;
        if (link.bindVariableId) {
          chosen = candidates.find(c => c.web.sourceNodeId === link.bindVariableId) ?? null;
        }
        if (!chosen && candidates.length) {
          // pick earliest start among variables
          chosen = candidates.slice().sort((a, b) => a.timing.start - b.timing.start)[0];
        }
        if (chosen) {
          const offset = Number.isFinite(link.bindHopOffset) ? link.bindHopOffset : 0;
          const scale = Number.isFinite(link.bindHopScale) && link.bindHopScale > 0 ? link.bindHopScale : 1;
          const hopStart = chosen.timing.start + offset;
          start = link.animStartTime != null ? link.animStartTime : hopStart;
          duration = link.animDuration != null
            ? Math.max(0.05, link.animDuration)
            : Math.max(0.05, chosen.timing.duration * scale);
        }
      }
      events.push({ type: 'link', id: link.id, start, duration });
      linkInfoMap[link.id] = { start, end: start + duration, duration };
      t = Math.max(t, start + duration + linkGap);
    }

    // Expose hop timing map for bound-link rendering in getStateAtTime
    this._hopTimingByLinkId = timingByLinkId;

    for (const node of triggeredNodes) {
      const info     = linkInfoMap[node.triggerAfterLinkId];
      const duration = node.animDuration != null ? node.animDuration : nodeDuration;
      const triggerEnd = info ? info.end : t;
      const earliest   = info ? info.start : 0;

      const lead  = node.triggerMode === 'on-end' ? 0 : duration * 0.7;
      const delay = node.triggerDelay ?? 0;
      const start = Math.max(earliest, triggerEnd - lead + delay);
      events.push({
        type: 'node',
        id: node.id,
        start,
        duration,
        displayDuration: duration,
      });
    }

    const scheduledPauses = [];
    const scheduledLinkInfoMap = {};
    const pendingEvents = events.map((event, index) => ({ ...event, order: index }));
    const scheduledEvents = [];
    const getCandidateStart = (event) => {
      if (event.type !== 'node') return event.start;
      const node = this.nodes.find(item => item.id === event.id);
      if (!node?.triggerAfterLinkId) return event.start;
      const triggerLinkInfo = scheduledLinkInfoMap[node.triggerAfterLinkId];
      if (!triggerLinkInfo) return null;
      const lead = node.triggerMode === 'on-end' ? 0 : event.duration * 0.7;
      const delay = node.triggerDelay ?? 0;
      return Math.max(triggerLinkInfo.start, triggerLinkInfo.end - lead + delay);
    };

    while (pendingEvents.length) {
      let nextIndex = -1;
      let nextStart = Infinity;
      let nextOrder = Infinity;

      for (let i = 0; i < pendingEvents.length; i += 1) {
        const candidateStart = getCandidateStart(pendingEvents[i]);
        if (candidateStart == null) continue;
        if (candidateStart < nextStart || (Math.abs(candidateStart - nextStart) < 0.0001 && pendingEvents[i].order < nextOrder)) {
          nextIndex = i;
          nextStart = candidateStart;
          nextOrder = pendingEvents[i].order;
        }
      }

      if (nextIndex === -1) {
        pendingEvents.sort((a, b) => a.start - b.start || a.order - b.order);
        nextIndex = 0;
        nextStart = pendingEvents[0].start;
      }

      const event = pendingEvents.splice(nextIndex, 1)[0];
      event.start = nextStart;
      let shiftedStart = event.start;
      for (const pause of scheduledPauses) {
        if (pause.ownerId === event.id) continue;
        const shiftedEnd = shiftedStart + event.duration;
        if (shiftedEnd <= pause.ownerEnd) continue;
        if (shiftedStart >= pause.ownerEnd) {
          // Only push forward if still inside the popup window — avoids
          // double-shifting events whose trigger link was already shifted past
          // this pause, and avoids stacking pauseLengths across multiple subnodes.
          if (shiftedStart < pause.popupEnd) {
            shiftedStart = pause.popupEnd;
          }
          continue;
        }
        if (shiftedStart < pause.popupEnd) {
          shiftedStart = pause.popupEnd;
        }
      }

      event.start = shiftedStart;
      scheduledEvents.push(event);

      if (event.type === 'link') {
        scheduledLinkInfoMap[event.id] = {
          start: event.start,
          end: event.start + event.duration,
          duration: event.duration,
        };
        continue;
      }

      const node = this.nodes.find(item => item.id === event.id);
      const triggerLinkInfo = node?.triggerAfterLinkId ? scheduledLinkInfoMap[node.triggerAfterLinkId] : null;
      const popup = getSubdiagramPopupMetrics(node, event.start, event.duration, triggerLinkInfo);
      if (!popup) continue;

      event.displayDuration = Math.max(
        event.duration,
        popup.popupEnd != null ? popup.popupEnd - event.start : 0,
        popup.transformEnd != null ? popup.transformEnd - event.start : 0
      );
      event.popupStart = popup.popupStart;
      event.popupEnd = popup.popupEnd;
      event.transformStart = popup.transformStart;
      event.transformEnd = popup.transformEnd;
      event.transformTargetStyle = popup.transformTargetStyle;
      if (popup.popupStart != null && popup.popupEnd != null) {
        scheduledPauses.push({
          ownerId: event.id,
          popupStart: popup.popupStart,
          popupEnd: popup.popupEnd,
          ownerEnd: popup.ownerEnd,
          pauseLength: popup.pauseLength,
        });
        scheduledPauses.sort((a, b) => a.ownerEnd - b.ownerEnd || a.ownerId.localeCompare(b.ownerId));
      }
    }

    const finalEvents = scheduledEvents
      .sort((a, b) => a.order - b.order)
      .map(({ order, ...event }) => event);

    for (const event of finalEvents) {
      if (event.type !== 'node') continue;
      const node = this.nodes.find(item => item.id === event.id);
      if (!node || node.type === 'subdiagram') continue;

      const transformMode = getTransformMode(node);
      if (transformMode === 'none') continue;

      const targetNode = transformMode === 'existing'
        ? this.nodes.find(item => (
          item.id === node.transformTargetNodeId &&
          item.id !== node.id &&
          isResolvableTargetNode(item)
        ))
        : null;
      const transformTargetStyle = transformMode === 'custom'
        ? buildCustomTransformStyle(node)
        : buildExistingTransformStyle(targetNode, node);
      if (!transformTargetStyle) continue;

      const transformDuration = Math.max(0.1, node.transformDuration ?? 0.4);
      const minTransformStart = event.start + event.duration;
      event.transformStart = Math.max(minTransformStart, node.transformStartTime ?? minTransformStart);
      event.transformEnd = event.transformStart + transformDuration;
      event.transformTargetStyle = transformTargetStyle;
      event.displayDuration = Math.max(
        event.displayDuration ?? event.duration,
        event.transformEnd - event.start
      );
    }

    // Compute simple popup window for non-subdiagram nodes that opt in.
    for (const event of finalEvents) {
      if (event.type !== 'node') continue;
      const node = this.nodes.find(item => item.id === event.id);
      if (!node) continue;
      if (node.type === 'subdiagram') continue; // subdiagrams use nested popup windows

      const enabled = !!node.showSimplePopupInPlayback;
      if (!enabled) continue;

      const delay = Math.max(0, node.simplePopupDelay ?? 0.2);
      const dur   = Math.max(0.1, node.simplePopupDuration ?? 0.7);

      // If this node is triggered by a link, align popup start to the later of
      // node end + delay and trigger link end + delay (matches subdiagram logic).
      const triggerLinkInfo = node.triggerAfterLinkId
        ? scheduledLinkInfoMap[node.triggerAfterLinkId] ?? null
        : null;
      const candidateA = event.start + event.duration + delay;
      const candidateB = triggerLinkInfo ? (triggerLinkInfo.start + triggerLinkInfo.duration + delay) : -Infinity;
      const popupStart = Math.max(candidateA, candidateB);
      const popupEnd = popupStart + dur;

      event.popupStart = popupStart;
      event.popupEnd = popupEnd;
      event.popupStay = !!node.popupStayOpen;
      event.displayDuration = Math.max(event.displayDuration ?? event.duration, popupEnd - event.start);
    }

    this._contentDuration = 0;
    for (const event of finalEvents) {
      this._contentDuration = Math.max(
        this._contentDuration,
        event.start + (event.displayDuration ?? event.duration)
      );
    }

    // Extend to cover text morph end times, which are not represented as timeline events
    for (const event of finalEvents) {
      if (event.type !== 'node') continue;
      const node = this.nodes.find(n => n.id === event.id);
      if (!node) continue;
      for (const morph of getNodeTextMorphs(node, { start: event.start, duration: event.duration })) {
        this._contentDuration = Math.max(this._contentDuration, morph.startTime + morph.duration);
      }
    }

    // Extend to cover graph point keyframes and chain playback within graph nodes
    const eventByNodeId = Object.fromEntries(finalEvents.filter(ev => ev.type === 'node').map(ev => [ev.id, ev]));
    for (const node of this.nodes) {
      if (node.type !== 'graph') continue;
      const ev = eventByNodeId[node.id];
      if (!ev) continue;
      const baseStart = ev.start;
      const chain = !!node.graphChainPlayback;
      const vectors = node.graphVectors ?? [];
      const points = node.graphPoints ?? [];
      const speed = (Number.isFinite(node.vectorSpeed) && node.vectorSpeed > 0) ? node.vectorSpeed : 0.2;
      const defaultPointDur = 0.35;
      let maxLocalEnd = 0;  // seconds relative to chain anchor (for chain)
      let maxGlobalEnd = 0; // absolute seconds (for non-chain)

      if (chain) {
        // Chain mode: join all points, alternate P(k) then V(k)
        const n = points.length;
        if (n > 0) {
          // Last event could be point(n-1) fade if no trailing vector
          const lastPointEnd = (2 * (n - 1) + 1) * speed; // start=2*(n-1)*S, end at +S
          maxLocalEnd = Math.max(maxLocalEnd, lastPointEnd);
        }
        if (n > 1) {
          // Final vector index = n-2, ends at (2*(n-2)+2)*S = (2n-2)*S
          const lastVectorEnd = (2 * (n - 2) + 2) * speed;
          maxLocalEnd = Math.max(maxLocalEnd, lastVectorEnd);
        }
      } else {
        // Non-sequential: points follow their own keyframes (absolute within node window)
        for (const p of points) {
          const st = Number.isFinite(p.startTime) ? p.startTime : 0;
          const dur = (Number.isFinite(p.duration) && p.duration > 0) ? p.duration : defaultPointDur;
          const endP = st + dur;
          if (endP > maxGlobalEnd) maxGlobalEnd = endP;
        }
        // Consider at least one vector draw when vectors exist
        if (vectors.length) maxGlobalEnd = Math.max(maxGlobalEnd, speed);
      }

      if (chain) {
        // Chain playback starts after the graph node finishes its own entry draw.
        this._contentDuration = Math.max(this._contentDuration, baseStart + ev.duration + maxLocalEnd);
      } else {
        // Absolute keyframes extend the global timeline directly
        this._contentDuration = Math.max(this._contentDuration, maxGlobalEnd);
      }
    }

    this._totalDuration = Math.max(t, this._contentDuration) + holdAfter;

    return finalEvents;
  }

  getTotalDuration() {
    return this._totalDuration;
  }

  getContentDuration() {
    return this._contentDuration;
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
        const node = this.nodes.find(item => item.id === event.id);
        const isWriteText = node?.type === 'text' && node?.textAnimMode === 'write';
        const duration = Math.max(event.duration, 0.0001);
        const entryProgress = raw;
        const transformProgress = event.transformStart != null && event.transformEnd != null
          ? ease.easeInOut(clamp((t - event.transformStart) / Math.max(0.0001, event.transformEnd - event.transformStart), 0, 1))
          : 0;
        let popupProgress = 0;
        if (event.popupStart != null && t >= event.popupStart) {
          const end = event.popupEnd != null ? event.popupEnd : (event.popupStart + 0.6);
          if (t <= end) {
            popupProgress = (t - event.popupStart) / Math.max(0.0001, end - event.popupStart);
          } else if (event.popupStay) {
            popupProgress = 1; // hold open after the initial slide-in finishes
          } else {
            popupProgress = 0;
          }
        }
        const textState = node ? getTextMorphRenderState(node, { start: event.start, duration: event.duration }, t) : null;
        const styleState = node ? getStyleMorphRenderState(node, { start: event.start, duration: event.duration }, t) : null;
        const entryText = textState?.baseText ?? node?.label ?? '';
        const entryCharCount = Math.max(0, Math.ceil(entryText.length * entryProgress));
        const baseState = {
          opacity: isWriteText ? 1 : ease.easeOut(clamp(entryProgress * 1.6, 0, 1)),
          scale: isWriteText ? 1 : lerp(0.82, 1, ease.easeOut(entryProgress)),
          textMode: isWriteText ? 'write' : 'fade',
          textProgress: entryProgress,
          labelText: isWriteText ? entryText.slice(0, entryCharCount) : entryText,
          labelOpacity: transformProgress > 0
            ? 1 - transformProgress
            : (textState?.baseOpacity ?? 1),
          morphLabelText: transformProgress > 0
            ? (event.transformTargetStyle?.labelText ?? '')
            : (textState?.overlayText ?? ''),
          morphLabelOpacity: transformProgress > 0
            ? transformProgress
            : (textState?.overlayOpacity ?? 0),
          transformProgress,
          popupProgress,
          targetFill: event.transformTargetStyle?.fill ?? null,
          targetStroke: event.transformTargetStyle?.stroke ?? null,
          targetTextColor: event.transformTargetStyle?.textColor ?? null,
          targetStrokeWidth: event.transformTargetStyle?.strokeWidth ?? null,
          targetShape: event.transformTargetStyle?.shape ?? null,
          targetCornerRadius: event.transformTargetStyle?.cornerRadius ?? null,
          targetShowSubBadge: event.transformTargetStyle?.showSubBadge ?? null,
          // Expose timing so renderer can align graph-local animations
          eventStart: event.start,
          eventDuration: event.duration,
        };

        // Apply morph-driven appearance (color/corner radius) when no explicit transform target
        // is active. If a morph is actively transitioning, blend from committed base to target.
        // If past a morph, hold its style by setting progress to 1.
        if (!event.transformTargetStyle && styleState) {
          const hasBaseStyle = !!(styleState.baseStyle.fill || styleState.baseStyle.stroke || styleState.baseStyle.textColor || styleState.baseStyle.strokeWidth != null || styleState.baseStyle.cornerRadius != null);
          const hasTarget = !!(styleState.targetStyle && (styleState.targetStyle.fill != null || styleState.targetStyle.stroke != null || styleState.targetStyle.textColor != null || styleState.targetStyle.strokeWidth != null || styleState.targetStyle.cornerRadius != null));
          if (hasTarget || hasBaseStyle) {
            const morphP = styleState.hasActive ? ease.easeInOut(styleState.progress) : (hasBaseStyle ? 1 : 0);
            baseState.transformProgress = Math.max(baseState.transformProgress, morphP);
            const chosen = styleState.hasActive ? styleState.targetStyle : styleState.baseStyle;
            baseState.targetFill = chosen.fill ?? null;
            baseState.targetStroke = chosen.stroke ?? null;
            baseState.targetTextColor = chosen.textColor ?? null;
            baseState.targetStrokeWidth = chosen.strokeWidth ?? null;
            baseState.targetCornerRadius = chosen.cornerRadius ?? null;
          }
        }

        nodeStates[event.id] = baseState;
      } else {
        // Default link progress from scheduled event
        let progress = ease.easeOut(raw);
        // If this link is bound to a token hop, override using hop timing
        const link = this.links.find(l => l.id === event.id);
        if (link && link.bindToTokenHop && this._hopTimingByLinkId) {
          const candidates = this._hopTimingByLinkId.get(link.id) ?? [];
          let chosen = null;
          if (link.bindVariableId) {
            chosen = candidates.find(c => c.web.sourceNodeId === link.bindVariableId) ?? null;
          }
          if (!chosen && candidates.length) {
            chosen = candidates.slice().sort((a, b) => a.timing.start - b.timing.start)[0];
          }
          if (chosen) {
            const offset = Number.isFinite(link.bindHopOffset) ? link.bindHopOffset : 0;
            const scale = Number.isFinite(link.bindHopScale) && link.bindHopScale > 0 ? link.bindHopScale : 1;
            const hopStart = chosen.timing.start + offset;
            const hopDur = link.animDuration != null
              ? Math.max(0.0001, link.animDuration)
              : Math.max(0.0001, chosen.timing.duration * scale);
            const hopRaw = clamp((t - hopStart) / hopDur, 0, 1);
            progress = ease.easeOut(hopRaw);
          }
        }
        linkStates[event.id] = { progress };
      }
    }

    return { nodeStates, linkStates };
  }

  getBoundingBox() {
    const contentNodes = this.nodes.filter(n => n.type !== 'area' && n.type !== 'mirror');
    const nodes = contentNodes.length ? contentNodes : this.nodes;
    if (!nodes.length) return { x: 0, y: 0, w: 800, h: 600, cx: 400, cy: 300 };
    const minX = Math.min(...nodes.map(node => node.x));
    const minY = Math.min(...nodes.map(node => node.y));
    const maxX = Math.max(...nodes.map(node => node.x + node.width));
    const maxY = Math.max(...nodes.map(node => node.y + node.height));
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
