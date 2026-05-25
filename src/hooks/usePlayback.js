import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimationEngine } from '../animation/AnimationEngine';
import { applyAnimState, computeLinkRenders, resetAnimState } from '../animation/applyAnimState';
import { buildMirrorBindings } from '../mirror/mirrorData';
import useStore from '../store/useStore';
import { buildWebByLinkId, computeVariableWebs } from '../variables/flow';

export function usePlayback({ layerRef }) {
  const { nodes, links } = useStore();

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const isPlayingRef = useRef(false);
  const currentTimeRef = useRef(0);
  const clockStartRef = useRef(0);
  const timeStartRef = useRef(0);
  const rafRef = useRef(null);
  const lastUIUpdateRef = useRef(0);
  // Callers (e.g. KeyframePanel) can set this to receive every animation frame imperatively,
  // bypassing the 30fps React state throttle used for UI updates.
  const frameCallbackRef = useRef(null);
  // Separate slot for DiagramCanvas sub-diagram popup updates — avoids clobbering
  // the KeyframePanel playhead callback which also uses frameCallbackRef.
  const subdiagramFrameCallbackRef = useRef(null);

  const engine = useMemo(() => new AnimationEngine(nodes, links), [nodes, links]);
  const totalDuration   = engine.getTotalDuration();
  const contentDuration = engine.getContentDuration();
  const timeline = useMemo(() => engine.getTimeline(), [engine]);
  const linkRenders = useMemo(() => computeLinkRenders(nodes, links), [nodes, links]);
  const mirrorBindings = useMemo(() => buildMirrorBindings(nodes, links), [nodes, links]);
  const webs = useMemo(() => computeVariableWebs(nodes, links, { timeline }), [nodes, links, timeline]);
  const webByLinkId = useMemo(() => buildWebByLinkId(webs), [webs]);
  const monitors = useMemo(() => nodes.filter(n => n.type === 'monitor'), [nodes]);
  const allLinkRenders = useMemo(() => ({
    ...linkRenders,
    ...mirrorBindings.linkRenders,
  }), [linkRenders, mirrorBindings.linkRenders]);

  const engineRef = useRef(engine);
  const linkRendersRef = useRef(allLinkRenders);
  const mirrorBindingsRef = useRef(mirrorBindings);
  const totalDurationRef = useRef(totalDuration);
  const contentDurationRef = useRef(contentDuration);

  useEffect(() => { engineRef.current = engine; }, [engine]);
  useEffect(() => { linkRendersRef.current = allLinkRenders; }, [allLinkRenders]);
  useEffect(() => { mirrorBindingsRef.current = mirrorBindings; }, [mirrorBindings]);
  useEffect(() => { totalDurationRef.current = totalDuration; }, [totalDuration]);
  useEffect(() => { contentDurationRef.current = contentDuration; }, [contentDuration]);

  const timelineStart = useMemo(() => {
    const tl = engine.getTimeline();
    return tl && tl.length ? Math.min(...tl.map(ev => ev.start)) : 0;
  }, [engine]);

  const websRef = useRef(webs);
  const webByLinkIdRef = useRef(webByLinkId);
  const monitorsRef = useRef(monitors);
  useEffect(() => { websRef.current = webs; }, [webs]);
  useEffect(() => { webByLinkIdRef.current = webByLinkId; }, [webByLinkId]);
  useEffect(() => { monitorsRef.current = monitors; }, [monitors]);

  const bindToTokenHopById = useMemo(() => Object.fromEntries(links.map(l => [l.id, !!l.bindToTokenHop])), [links]);
  const bindMetaById = useMemo(() => Object.fromEntries(links.map(l => [l.id, { offset: Number.isFinite(l.bindHopOffset) ? l.bindHopOffset : 0, scale: Number.isFinite(l.bindHopScale) && l.bindHopScale > 0 ? l.bindHopScale : 1 }])), [links]);
  const linkStartOverrideById = useMemo(() => Object.fromEntries(links.map(l => [l.id, (l.bindToTokenHop && Number.isFinite(l.animStartTime)) ? l.animStartTime : null])), [links]);
  const linkDurationOverrideById = useMemo(() => Object.fromEntries(links.map(l => [l.id, (l.bindToTokenHop && Number.isFinite(l.animDuration)) ? l.animDuration : null])), [links]);

  const applyFrame = useCallback((t) => {
    const layer = layerRef.current;
    if (!layer) return;
    const state = engineRef.current.getStateAtTime(t);
    applyAnimState(layer, state, linkRendersRef.current, mirrorBindingsRef.current, {
      webs: websRef.current,
      webByLinkId: webByLinkIdRef.current,
      monitors: monitorsRef.current,
      currentTime: t,
      timelineStart,
      bindToTokenHopById,
      bindMetaById,
      linkStartOverrideById,
      linkDurationOverrideById,
    });
    layer.draw();
  }, [layerRef, bindToTokenHopById]);

  const stopLoop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    isPlayingRef.current = false;
    setIsPlaying(false);
  }, []);

  const play = useCallback(() => {
    if (isPlayingRef.current) return;

    if (currentTimeRef.current >= totalDurationRef.current - 0.05) {
      currentTimeRef.current = 0;
      setCurrentTime(0);
    }

    clockStartRef.current = performance.now();
    timeStartRef.current = currentTimeRef.current;
    isPlayingRef.current = true;
    setIsPlaying(true);

    function frame() {
      if (!isPlayingRef.current) return;

      const elapsed = (performance.now() - clockStartRef.current) / 1000;
      const t = Math.min(timeStartRef.current + elapsed, totalDurationRef.current);

      currentTimeRef.current = t;
      applyFrame(t);
      frameCallbackRef.current?.(t);
      subdiagramFrameCallbackRef.current?.(t);

      // Throttle React state updates to ~30fps — animation runs imperatively at full 60fps
      const now = performance.now();
      if (now - lastUIUpdateRef.current >= 33) {
        lastUIUpdateRef.current = now;
        setCurrentTime(t);
      }

      if (t < totalDurationRef.current) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        setCurrentTime(t);
        stopLoop();
      }
    }

    rafRef.current = requestAnimationFrame(frame);
  }, [applyFrame, stopLoop]);

  const pause = useCallback(() => {
    stopLoop();
  }, [stopLoop]);

  const stop = useCallback(() => {
    stopLoop();
    currentTimeRef.current = 0;
    setCurrentTime(0);
    const layer = layerRef.current;
    if (layer) resetAnimState(layer, nodes, links, mirrorBindingsRef.current);
  }, [layerRef, links, nodes, stopLoop]);

  const seek = useCallback((t) => {
    const clamped = Math.max(0, Math.min(totalDurationRef.current, t));
    currentTimeRef.current = clamped;

    if (isPlayingRef.current) {
      clockStartRef.current = performance.now();
      timeStartRef.current = clamped;
    }

    applyFrame(clamped);
    frameCallbackRef.current?.(clamped);
    subdiagramFrameCallbackRef.current?.(clamped);

    // Throttle React state updates — callers that need immediate visual feedback
    // (e.g. the timeline playhead) update the DOM directly via refs instead.
    const now = performance.now();
    if (now - lastUIUpdateRef.current >= 33) {
      lastUIUpdateRef.current = now;
      setCurrentTime(clamped);
    }
  }, [applyFrame]);

  const nodesLen = nodes.length;
  const linksLen = links.length;
  useEffect(() => {
    stopLoop();
    currentTimeRef.current = 0;
    setCurrentTime(0);
    const id = setTimeout(() => {
      const layer = layerRef.current;
      if (layer) resetAnimState(layer, nodes, links, mirrorBindingsRef.current);
    }, 60);
    return () => clearTimeout(id);
  }, [layerRef, linksLen, nodesLen, stopLoop]);

  useEffect(() => () => stopLoop(), [stopLoop]);

  return { isPlaying, currentTime, currentTimeRef, totalDuration, contentDuration, timeline, play, pause, stop, seek, frameCallbackRef, subdiagramFrameCallbackRef };
}
