import { AnimationEngine } from '../animation/AnimationEngine';
import { applyAnimState, computeLinkRenders, resetAnimState } from '../animation/applyAnimState';
import { buildMirrorBindings } from '../mirror/mirrorData';

/**
 * Capture a JPEG thumbnail of the last animation frame, fitted to fill the stage.
 * Returns a data URL string, or null if the stage isn't ready or there are no nodes.
 */
export function capturePreview(stageRef, layerRef, nodes, links) {
  const stage = stageRef.current;
  const layer = layerRef.current;
  if (!stage || !layer || !nodes.length) return null;

  const engine = new AnimationEngine(nodes, links);
  const bb = engine.getBoundingBox();
  const linkRenders = computeLinkRenders(nodes, links);
  const mirrorBindings = buildMirrorBindings(nodes, links);
  const allLinkRenders = { ...linkRenders, ...mirrorBindings.linkRenders };

  // Save current stage transform
  const savedX = stage.x();
  const savedY = stage.y();
  const savedScale = stage.scaleX();

  // Fit all content into the stage with padding
  const stageW = stage.width();
  const stageH = stage.height();
  const pad = 48;
  const scale = Math.min(
    (stageW - pad * 2) / (bb.w || 1),
    (stageH - pad * 2) / (bb.h || 1)
  );
  stage.x(stageW / 2 - bb.cx * scale);
  stage.y(stageH / 2 - bb.cy * scale);
  stage.scaleX(scale);
  stage.scaleY(scale);

  // Hide mirror chrome decorations for a clean snapshot
  const mirrorChromeNodes = mirrorBindings.bindings
    .map(b => layer.findOne(`#mirror-chrome-${b.mirrorId}`))
    .filter(Boolean);
  mirrorChromeNodes.forEach(n => n.visible(false));

  // Apply the last frame of animation
  const animState = engine.getStateAtTime(engine.getTotalDuration());
  const timelineStart = (() => { const tl = engine.getTimeline(); return tl && tl.length ? Math.min(...tl.map(ev => ev.start)) : 0; })();
  applyAnimState(layer, animState, allLinkRenders, mirrorBindings, { currentTime: engine.getTotalDuration(), timelineStart });
  layer.draw();

  // Capture at ~480 px wide
  const dataUrl = stage.toDataURL({
    mimeType: 'image/jpeg',
    quality: 0.82,
    pixelRatio: 480 / stageW,
  });

  // Restore everything
  mirrorChromeNodes.forEach(n => n.visible(true));
  stage.x(savedX);
  stage.y(savedY);
  stage.scaleX(savedScale);
  stage.scaleY(savedScale);
  resetAnimState(layer, nodes, links, mirrorBindings);
  layer.draw();

  return dataUrl;
}
