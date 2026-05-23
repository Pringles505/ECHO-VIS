import Konva from 'konva';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { AnimationEngine } from '../animation/AnimationEngine';
import { applyAnimState, computeLinkRenders, resetAnimState } from '../animation/applyAnimState';
import { buildMirrorBindings } from '../mirror/mirrorData';
import { buildLinkRenderData } from '../links/linkGeometry';
import { buildWebByLinkId, computeVariableWebs } from '../variables/flow';
import { getNodeLabelFrame } from '../nodeLabelFrame';
import { pageColors, withAlpha } from '../../colorThemes';

let ffmpegInstance = null;
let ffmpegReady = false;

async function getFFmpeg() {
  if (ffmpegReady) return ffmpegInstance;

  ffmpegInstance = new FFmpeg();
  const base = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  await ffmpegInstance.load({
    coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  ffmpegReady = true;
  return ffmpegInstance;
}

// ── Off-screen overlay rendering ────────────────────────────────────────────

const OVERLAY_W = 820;   // matches SubdiagramOverlay STAGE_W
const OVERLAY_H = 430;   // matches SubdiagramOverlay STAGE_H
const OVERLAY_PAD = 48;  // matches SubdiagramOverlay PAD
const MAX_POPUP_DEPTH = 4;

function overlayRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function makeEven(value) {
  return Math.max(2, Math.floor(value / 2) * 2);
}

function getOverlayCardMetrics(frameW, frameH) {
  const cardW = Math.round(Math.min(frameW * 0.82, OVERLAY_W * (frameH / OVERLAY_H) * 0.82));
  const cardH = Math.round(cardW * OVERLAY_H / OVERLAY_W);
  const cardX = (frameW - cardW) >> 1;
  const cardY = (frameH - cardH) >> 1;
  const cardRadius = Math.round(18 * cardW / OVERLAY_W);
  return { cardW, cardH, cardX, cardY, cardRadius };
}

function normalizePopupSnapshotNodes(snapshotNodes = []) {
  return snapshotNodes.map(node =>
    node.type === 'subdiagram' ? { ...node, animStartTime: null, animDuration: null } : node
  );
}

function makeBodyShape(shapeKind, w, h, cornerRadius, fill, stroke, strokeWidth, id) {
  const common = { fill, stroke, strokeWidth };
  if (id) common.id = id;

  if (shapeKind === 'diamond') {
    return new Konva.Line({ points: [w / 2, 0, w, h / 2, w / 2, h, 0, h / 2], closed: true, ...common });
  }
  if (shapeKind === 'hexagon') {
    const inset = Math.min(w * 0.24, h * 0.5);
    return new Konva.Line({ points: [inset, 0, w - inset, 0, w, h / 2, w - inset, h, inset, h, 0, h / 2], closed: true, ...common });
  }
  if (shapeKind === 'circle') {
    return new Konva.Ellipse({ x: w / 2, y: h / 2, radiusX: w / 2, radiusY: h / 2, ...common });
  }
  if (shapeKind === 'pillar' || shapeKind === 'cylinder') {
    const curve = Math.min(w, h) * 0.12;
    const data = [
      `M ${curve},0`,
      `L ${w - curve},0`,
      `Q ${w - curve * 0.2},${h / 2} ${w - curve},${h}`,
      `L ${curve},${h}`,
      `Q ${curve * 0.2},${h / 2} ${curve},0`,
      'Z',
    ].join(' ');
    return new Konva.Path({ data, ...common });
  }
  if (shapeKind === 'slanted') {
    const inset = Math.min(w * 0.18, h * 0.42);
    return new Konva.Line({ points: [inset, 0, w, 0, w - inset, h, 0, h], closed: true, ...common });
  }
  const cr = shapeKind === 'pill' ? Math.min(w, h) / 2 : (cornerRadius ?? 8);
  return new Konva.Rect({ width: w, height: h, cornerRadius: cr, ...common });
}

function addSnapshotNode(layer, node) {
  const w = node.width ?? 150;
  const h = node.height ?? 52;
  const isArea = node.type === 'area';
  const isText = node.type === 'text';

  if (isArea) {
    const group = new Konva.Group({ id: `node-${node.id}`, x: node.x, y: node.y });
    const fill = node.fill ?? withAlpha(pageColors.purpleAccent, 0.07);
    const stroke = node.stroke ?? pageColors.purpleAccent;
    const rect = new Konva.Rect({
      id: `area-rect-${node.id}`,
      width: w, height: h,
      fill, stroke, strokeWidth: node.strokeWidth ?? 1.5,
      cornerRadius: node.cornerRadius ?? 12,
      dash: [10, 6], dashEnabled: true,
    });
    rect.setAttr('baseWidth', w);
    rect.setAttr('baseHeight', h);
    rect.setAttr('areaAnimMode', node.areaAnimMode ?? 'fade');
    const label = new Konva.Text({
      id: `area-label-${node.id}`,
      x: 16, y: 14,
      text: node.label ?? '',
      fontSize: node.fontSize ?? 12,
      fill: node.textColor ?? stroke,
      fontFamily: 'Inter, system-ui, sans-serif',
      fontStyle: '600',
    });
    group.add(rect, label);
    layer.add(group);
    return;
  }

  const cx = node.x + w / 2;
  const cy = node.y + h / 2;
  const group = new Konva.Group({ id: `node-${node.id}`, x: cx, y: cy, offsetX: w / 2, offsetY: h / 2 });

  if (!isText) {
    const fill = node.fill ?? pageColors.blueNodeFill;
    const stroke = node.stroke ?? pageColors.blueNodeStroke;
    const strokeWidth = node.strokeWidth ?? 2;
    const body = makeBodyShape(node.shape ?? 'rounded', w, h, node.cornerRadius, fill, stroke, strokeWidth, `node-body-${node.id}`);
    body.setAttr('baseFill', fill);
    body.setAttr('baseStroke', stroke);
    body.setAttr('baseStrokeWidth', strokeWidth);
    group.add(body);
  }

  const textFill = node.textColor ?? pageColors.white;
  const labelFrame = getNodeLabelFrame(node, {
    reserveBottomRightBadge: node.type === 'subdiagram' && (node.showSubBadge ?? true),
  });
  const lbl = new Konva.Text({
    id: `node-label-${node.id}`,
    x: labelFrame.x, y: labelFrame.y, width: labelFrame.width, height: labelFrame.height,
    text: node.label ?? '',
    align: 'center', verticalAlign: 'middle',
    fontSize: node.fontSize ?? 13,
    fill: textFill,
    fontFamily: 'Inter, system-ui, sans-serif',
    fontStyle: '500',
  });
  lbl.setAttr('baseText', node.label ?? '');
  lbl.setAttr('baseFill', textFill);

  const morphLbl = new Konva.Text({
    id: `node-label-morph-${node.id}`,
    x: labelFrame.x, y: labelFrame.y, width: labelFrame.width, height: labelFrame.height,
    text: '', opacity: 0,
    align: 'center', verticalAlign: 'middle',
    fontSize: node.fontSize ?? 13,
    fill: textFill,
    fontFamily: 'Inter, system-ui, sans-serif',
  });
  morphLbl.setAttr('baseFill', textFill);

  group.add(lbl, morphLbl);
  layer.add(group);
}

function addSnapshotLink(layer, link, fromNode, toNode, allLinks, allNodes) {
  const render = buildLinkRenderData(link, fromNode, toNode, allLinks, allNodes);
  if (!render) return;
  const color = link.stroke ?? pageColors.blueNodeStroke;
  const sw = link.strokeWidth ?? 2;

  const shaft = new Konva.Path({
    id: `link-shaft-${link.id}`,
    data: render.pathData,
    stroke: color, strokeWidth: sw,
    lineCap: 'round', lineJoin: 'round',
  });
  const head = new Konva.Line({
    id: `link-head-${link.id}`,
    points: render.arrowHeadPoints,
    closed: true, fill: color, stroke: color, strokeWidth: 1,
    opacity: render.showArrowTip ? 1 : 0,
  });
  head.setAttr('basePoints', render.arrowHeadPoints);
  head.setAttr('showTip', render.showArrowTip);

  layer.add(shaft, head);
}

function buildPopupOverlay(snapshotNodes, snapshotLinks, nestedEngine) {
  const bb = nestedEngine.getBoundingBox();
  const contentScale = Math.min(
    (OVERLAY_W - OVERLAY_PAD * 2) / Math.max(bb.w, 1),
    (OVERLAY_H - OVERLAY_PAD * 2) / Math.max(bb.h, 1),
    2.5
  );
  const contentX = OVERLAY_W / 2 - bb.cx * contentScale;
  const contentY = OVERLAY_H / 2 - bb.cy * contentScale;

  const container = document.createElement('div');
  container.style.cssText = 'position:absolute;left:-99999px;top:-99999px;visibility:hidden;';
  document.body.appendChild(container);

  const offStage = new Konva.Stage({ container, width: OVERLAY_W, height: OVERLAY_H });

  // Static background layer
  const bgLayer = new Konva.Layer();
  bgLayer.add(new Konva.Rect({ width: OVERLAY_W, height: OVERLAY_H, fill: pageColors.canvasBackground }));
  offStage.add(bgLayer);
  bgLayer.draw();

  // Animated content layer
  const contentLayer = new Konva.Layer();
  contentLayer.scaleX(contentScale);
  contentLayer.scaleY(contentScale);
  contentLayer.x(contentX);
  contentLayer.y(contentY);

  const nodeMap = Object.fromEntries(snapshotNodes.map(n => [n.id, n]));

  // Area nodes behind everything
  snapshotNodes.filter(n => n.type === 'area').forEach(n => addSnapshotNode(contentLayer, n));
  // Links
  snapshotLinks.forEach(link => {
    const fromNode = nodeMap[link.fromId];
    const toNode = nodeMap[link.toId];
    if (fromNode && toNode) addSnapshotLink(contentLayer, link, fromNode, toNode, snapshotLinks, snapshotNodes);
  });
  // Content nodes on top
  snapshotNodes.filter(n => n.type !== 'area').forEach(n => addSnapshotNode(contentLayer, n));

  offStage.add(contentLayer);

  const nestedLinkRenders = computeLinkRenders(snapshotNodes, snapshotLinks);
  const nestedWebs = computeVariableWebs(snapshotNodes, snapshotLinks, { timeline: nestedEngine.getTimeline() });
  const nestedWebByLinkId = buildWebByLinkId(nestedWebs);
  const nestedMonitors = snapshotNodes.filter(n => n.type === 'monitor');

  return {
    offStage, bgLayer, contentLayer, container,
    nestedLinkRenders, nestedWebs, nestedWebByLinkId, nestedMonitors,
  };
}

function findActivePopupWindow(popupWindows, time) {
  return popupWindows.find(pw => time >= pw.popupStart && time <= pw.popupEnd) ?? null;
}

function buildPopupRenderTree({
  nodes,
  links,
  engine,
  ancestorSubdiagramIds = [],
  depth = 0,
  includePreviewPopups = false,
}) {
  if (depth >= MAX_POPUP_DEPTH) return [];

  const timeline = engine.getTimeline();
  const nodeEventsById = Object.fromEntries(
    timeline.filter(event => event.type === 'node').map(event => [event.id, event])
  );
  const linkEventsById = Object.fromEntries(
    timeline.filter(event => event.type === 'link').map(event => [event.id, event])
  );

  return nodes
    .filter(node => (
      node.type === 'subdiagram' &&
      !ancestorSubdiagramIds.includes(node.id) &&
      (node.showPopupInPlayback === true || (includePreviewPopups && node.showPreviewInPlayback === true)) &&
      (node.snapshotNodes?.length ?? 0) > 0
    ))
    .map(node => {
      const event = nodeEventsById[node.id];
      if (!event) return null;

      const triggerLinkEvent = node.triggerAfterLinkId
        ? linkEventsById[node.triggerAfterLinkId]
        : null;
      const snapshotNodes = normalizePopupSnapshotNodes(node.snapshotNodes ?? []);
      const snapshotLinks = node.snapshotLinks ?? [];
      const nextAncestry = [...ancestorSubdiagramIds, node.id];
      const nestedEngine = new AnimationEngine(snapshotNodes, snapshotLinks, {
        holdAfter: 0,
        ancestorSubdiagramIds: nextAncestry,
      });
      const popupDelay = Math.max(0, node.popupDelay ?? 0);
      const popupPlaybackSpeed = Math.max(0.25, node.popupPlaybackSpeed ?? 1);
      const popupHold = Math.max(0, node.popupHold ?? 0);
      const popupStart = Math.max(
        event.start + popupDelay,
        triggerLinkEvent ? triggerLinkEvent.start + triggerLinkEvent.duration + popupDelay : -Infinity
      );
      const nestedContentDuration = nestedEngine.getContentDuration();
      const popupEnd = popupStart + nestedContentDuration / popupPlaybackSpeed + popupHold;
      const children = buildPopupRenderTree({
        nodes: snapshotNodes,
        links: snapshotLinks,
        engine: nestedEngine,
        ancestorSubdiagramIds: nextAncestry,
        depth: depth + 1,
      });

      return {
        node,
        eventStart: event.start,
        popupStart,
        popupEnd,
        popupPlaybackSpeed,
        nestedContentDuration,
        nestedEngine,
        snapshotNodes,
        snapshotLinks,
        children,
        overlayInfo: null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.eventStart - a.eventStart || a.node.id.localeCompare(b.node.id));
}

function attachPopupOverlays(popupWindows) {
  popupWindows.forEach((popupWindow) => {
    popupWindow.overlayInfo = buildPopupOverlay(
      popupWindow.snapshotNodes,
      popupWindow.snapshotLinks,
      popupWindow.nestedEngine
    );
    attachPopupOverlays(popupWindow.children);
  });
}

function destroyPopupOverlays(popupWindows) {
  popupWindows.forEach((popupWindow) => {
    destroyPopupOverlays(popupWindow.children);
    if (popupWindow.overlayInfo) {
      popupWindow.overlayInfo.offStage.destroy();
      document.body.removeChild(popupWindow.overlayInfo.container);
      popupWindow.overlayInfo = null;
    }
  });
}

function dataUrlToBytes(dataUrl) {
  const b64 = dataUrl.split(',')[1];
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function dataUrlToBlob(dataUrl) {
  const bytes = dataUrlToBytes(dataUrl);
  return new Blob([bytes], { type: 'image/png' });
}

async function compositeFrame(mainDataUrl, overlayDataUrl, mainW, mainH) {
  // Load both images in parallel for speed
  const [mainBmp, overlayBmp] = await Promise.all([
    createImageBitmap(dataUrlToBlob(mainDataUrl)),
    createImageBitmap(dataUrlToBlob(overlayDataUrl)),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = mainW;
  canvas.height = mainH;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Main diagram frame
  ctx.drawImage(mainBmp, 0, 0, mainW, mainH);
  mainBmp.close();

  // Dark backdrop matching SubdiagramOverlay's background
  ctx.fillStyle = 'rgba(12, 13, 22, 0.86)';
  ctx.fillRect(0, 0, mainW, mainH);

  // Scale overlay card to fit frame (max 82% of frame, maintain aspect ratio)
  const { cardW, cardH, cardX, cardY, cardRadius } = getOverlayCardMetrics(mainW, mainH);

  // Clip to rounded card and draw overlay content
  ctx.save();
  overlayRoundRect(ctx, cardX, cardY, cardW, cardH, cardRadius);
  ctx.clip();
  ctx.drawImage(overlayBmp, cardX, cardY, cardW, cardH);
  overlayBmp.close();
  ctx.restore();

  // Subtle card border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1;
  overlayRoundRect(ctx, cardX, cardY, cardW, cardH, cardRadius);
  ctx.stroke();

  return canvas.toDataURL('image/png');
}

async function compositeFrameBytes(mainDataUrl, overlayDataUrl, mainW, mainH) {
  const dataUrl = await compositeFrame(mainDataUrl, overlayDataUrl, mainW, mainH);
  return dataUrlToBytes(dataUrl);
}

async function compositeFrameDataUrl(mainDataUrl, overlayDataUrl, mainW, mainH) {
  return compositeFrame(mainDataUrl, overlayDataUrl, mainW, mainH);
}

async function renderPopupFrameDataUrl(popupWindow, localTime, overlayPixelRatio) {
  const overlayInfo = popupWindow.overlayInfo;
  if (!overlayInfo) return null;

  const nestedState = popupWindow.nestedEngine.getStateAtTime(localTime);
  applyAnimState(overlayInfo.contentLayer, nestedState, overlayInfo.nestedLinkRenders, null, {
    webs: overlayInfo.nestedWebs,
    webByLinkId: overlayInfo.nestedWebByLinkId,
    monitors: overlayInfo.nestedMonitors,
    currentTime: localTime,
  });
  overlayInfo.contentLayer.draw();

  let composedDataUrl = overlayInfo.offStage.toDataURL({
    mimeType: 'image/png',
    pixelRatio: overlayPixelRatio,
  });

  const activeChild = findActivePopupWindow(popupWindow.children, localTime);
  if (!activeChild) return composedDataUrl;

  const childTime = clamp(
    (localTime - activeChild.popupStart) * activeChild.popupPlaybackSpeed,
    0,
    activeChild.nestedContentDuration
  );
  const childDataUrl = await renderPopupFrameDataUrl(activeChild, childTime, overlayPixelRatio);
  if (!childDataUrl) return composedDataUrl;

  return compositeFrameDataUrl(
    composedDataUrl,
    childDataUrl,
    makeEven(Math.round(OVERLAY_W * overlayPixelRatio)),
    makeEven(Math.round(OVERLAY_H * overlayPixelRatio))
  );
}

// ── Main export function ─────────────────────────────────────────────────────

export async function exportToMP4({
  stageRef,
  layerRef,
  nodes,
  links,
  fps = 30,
  exportWidth = 1920,
  exportHeight = 1080,
  onProgress,
  onStatus,
}) {
  const stage = stageRef.current;
  const layer = layerRef.current;
  if (!stage || !layer) throw new Error('Canvas not ready');
  if (!nodes.length) throw new Error('Nothing to export. Add some nodes first.');

  onStatus?.('Loading FFmpeg WASM (~32 MB, cached after first use)…');
  const ffmpeg = await getFFmpeg();

  const engine = new AnimationEngine(nodes, links);
  const totalTime = engine.getTotalDuration();
  const totalFrames = Math.ceil(totalTime * fps);
  const linkRenders = computeLinkRenders(nodes, links);
  const mirrorBindings = buildMirrorBindings(nodes, links);
  const allLinkRenders = { ...linkRenders, ...mirrorBindings.linkRenders };
  const exportWebs = computeVariableWebs(nodes, links, { timeline: engine.getTimeline() });
  const exportWebByLinkId = buildWebByLinkId(exportWebs);
  const exportMonitors = nodes.filter(n => n.type === 'monitor');
  const bindToTokenHopById = Object.fromEntries(links.map(l => [l.id, !!l.bindToTokenHop]));
  const bindMetaById = Object.fromEntries(links.map(l => [l.id, { offset: Number.isFinite(l.bindHopOffset) ? l.bindHopOffset : 0, scale: Number.isFinite(l.bindHopScale) && l.bindHopScale > 0 ? l.bindHopScale : 1 }]));
  const linkStartOverrideById = Object.fromEntries(links.map(l => [l.id, (l.bindToTokenHop && Number.isFinite(l.animStartTime)) ? l.animStartTime : null]));
  const linkDurationOverrideById = Object.fromEntries(links.map(l => [l.id, (l.bindToTokenHop && Number.isFinite(l.animDuration)) ? l.animDuration : null]));

  const stageW = stage.width();
  const stageH = stage.height();
  const rawRatio = Math.max(exportWidth / stageW, exportHeight / stageH);
  const rawW = Math.round(stageW * rawRatio);
  const evenW = Math.floor(rawW / 2) * 2;
  const pixelRatio = evenW / stageW;
  const exportH = Math.round(stageH * pixelRatio);
  const { cardW } = getOverlayCardMetrics(evenW, exportH);
  const overlayPixelRatio = Math.max(1, Math.min(4, cardW / OVERLAY_W));

  const popupWindows = buildPopupRenderTree({
    nodes,
    links,
    engine,
    includePreviewPopups: true,
  });
  attachPopupOverlays(popupWindows);

  // Hide mirror chrome for clean export
  const mirrorChromeNodes = mirrorBindings.bindings
    .map(b => layer.findOne(`#mirror-chrome-${b.mirrorId}`))
    .filter(Boolean);
  mirrorChromeNodes.forEach(n => n.visible(false));

  onStatus?.(`Capturing ${totalFrames} frames…`);
  const frameBytes = [];

  for (let frame = 0; frame < totalFrames; frame++) {
    const t = frame / fps;
    const animState = engine.getStateAtTime(t);
    applyAnimState(layer, animState, allLinkRenders, mirrorBindings, {
      webs: exportWebs,
      webByLinkId: exportWebByLinkId,
      monitors: exportMonitors,
      currentTime: t,
      bindToTokenHopById,
      bindMetaById,
      linkStartOverrideById,
      linkDurationOverrideById,
    });
    layer.draw();

    const mainDataUrl = stage.toDataURL({ mimeType: 'image/png', pixelRatio });

    const activePopup = findActivePopupWindow(popupWindows, t);

    if (activePopup) {
      const nestedT = clamp(
        (t - activePopup.popupStart) * activePopup.popupPlaybackSpeed,
        0,
        activePopup.nestedContentDuration
      );
      const overlayDataUrl = await renderPopupFrameDataUrl(activePopup, nestedT, overlayPixelRatio);

      const bytes = await compositeFrameBytes(mainDataUrl, overlayDataUrl, evenW, exportH);
      frameBytes.push(bytes);
    } else {
      frameBytes.push(dataUrlToBytes(mainDataUrl));
    }

    if (frame % 15 === 0) {
      onProgress?.((frame / totalFrames) * 0.65);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  // Restore mirror chrome and animation state
  mirrorChromeNodes.forEach(n => n.visible(true));
  resetAnimState(layer, nodes, links, mirrorBindings);

  // Clean up overlay stages
  destroyPopupOverlays(popupWindows);

  onStatus?.('Writing frames to encoder…');
  for (let i = 0; i < frameBytes.length; i++) {
    await ffmpeg.writeFile(`f${String(i).padStart(5, '0')}.png`, frameBytes[i]);
    if (i % 30 === 0) {
      onProgress?.(0.65 + (i / frameBytes.length) * 0.15);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  onStatus?.('Encoding H.264 MP4…');
  onProgress?.(0.8);

  const ffmpegLogs = [];
  const logHandler = ({ message }) => ffmpegLogs.push(message);
  ffmpeg.on('log', logHandler);

  try {
    await ffmpeg.exec([
      '-r', String(fps),
      '-i', 'f%05d.png',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-preset', 'medium',
      '-crf', '14',
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      '-movflags', '+faststart',
      'out.mp4',
    ]);
  } catch (err) {
    ffmpeg.off('log', logHandler);
    throw new Error(`FFmpeg encode failed:\n${ffmpegLogs.slice(-20).join('\n')}\n\nOriginal: ${err.message}`);
  }
  ffmpeg.off('log', logHandler);

  onProgress?.(0.95);
  onStatus?.('Preparing download…');

  const data = await ffmpeg.readFile('out.mp4');
  if (!data || data.byteLength < 1000) {
    throw new Error(`FFmpeg produced an invalid file (${data?.byteLength ?? 0} bytes).`);
  }

  const blob = new Blob([data.buffer], { type: 'video/mp4' });
  const url = URL.createObjectURL(blob);
  const anchor = Object.assign(document.createElement('a'), { href: url, download: 'echo-vis-export.mp4' });
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 5000);

  for (let i = 0; i < frameBytes.length; i++) {
    try { await ffmpeg.deleteFile(`f${String(i).padStart(5, '0')}.png`); } catch {}
  }
  try { await ffmpeg.deleteFile('out.mp4'); } catch {}

  onProgress?.(1);
  onStatus?.('Done!');
}
