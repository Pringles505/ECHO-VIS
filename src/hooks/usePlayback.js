import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimationEngine } from '../animation/AnimationEngine';
import { applyAnimState, computeLinkRenders, resetAnimState } from '../animation/applyAnimState';
import useStore from '../store/useStore';

export function usePlayback({ layerRef }) {
  const { nodes, links } = useStore();

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const isPlayingRef = useRef(false);
  const currentTimeRef = useRef(0);
  const clockStartRef = useRef(0);
  const timeStartRef = useRef(0);
  const rafRef = useRef(null);

  const engine = useMemo(() => new AnimationEngine(nodes, links), [nodes, links]);
  const totalDuration = engine.getTotalDuration();
  const linkRenders = useMemo(() => computeLinkRenders(nodes, links), [nodes, links]);

  const engineRef = useRef(engine);
  const linkRendersRef = useRef(linkRenders);
  const totalDurationRef = useRef(totalDuration);

  useEffect(() => { engineRef.current = engine; }, [engine]);
  useEffect(() => { linkRendersRef.current = linkRenders; }, [linkRenders]);
  useEffect(() => { totalDurationRef.current = totalDuration; }, [totalDuration]);

  const applyFrame = useCallback((t) => {
    const layer = layerRef.current;
    if (!layer) return;
    const state = engineRef.current.getStateAtTime(t);
    applyAnimState(layer, state, linkRendersRef.current);
    layer.draw();
  }, [layerRef]);

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
      setCurrentTime(t);
      applyFrame(t);

      if (t < totalDurationRef.current) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
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
    if (layer) resetAnimState(layer, nodes, links);
  }, [layerRef, links, nodes, stopLoop]);

  const seek = useCallback((t) => {
    const clamped = Math.max(0, Math.min(totalDurationRef.current, t));
    currentTimeRef.current = clamped;
    setCurrentTime(clamped);

    if (isPlayingRef.current) {
      clockStartRef.current = performance.now();
      timeStartRef.current = clamped;
    }

    applyFrame(clamped);
  }, [applyFrame]);

  const nodesLen = nodes.length;
  const linksLen = links.length;
  useEffect(() => {
    stopLoop();
    currentTimeRef.current = 0;
    setCurrentTime(0);
    const id = setTimeout(() => {
      const layer = layerRef.current;
      if (layer) resetAnimState(layer, nodes, links);
    }, 60);
    return () => clearTimeout(id);
  }, [layerRef, linksLen, nodesLen, stopLoop]); // structural changes only

  useEffect(() => () => stopLoop(), [stopLoop]);

  return { isPlaying, currentTime, totalDuration, play, pause, stop, seek };
}
