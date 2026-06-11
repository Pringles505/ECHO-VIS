import { renderAnimationClipToMP4 } from '../export/VideoExporter';
import { PPTX_EXPORT_SIZE, getPptxFrame } from './pptxFrame';
import { collectPresentationSegments } from './segments';

function safePrefix(value) {
  return String(value ?? 'clip').replace(/[^a-z0-9_-]/gi, '_') || 'clip';
}

function collectPaletteSampleTimes(segments, maxSamples = 96) {
  const times = [...new Set(segments.flatMap(segment => [
    segment.start,
    (segment.start + segment.end) / 2,
    segment.end,
  ]).map(time => Math.round(time * 1000) / 1000))].sort((a, b) => a - b);
  if (times.length <= maxSamples) return times;
  return Array.from({ length: maxSamples }, (_, index) =>
    times[Math.round((index * (times.length - 1)) / (maxSamples - 1))]
  );
}

export async function renderSegmentClips({
  stageRef,
  layerRef,
  nodes,
  links,
  projectName = 'ECHO-VIS',
  fps = 60,
  exportWidth = PPTX_EXPORT_SIZE.width,
  exportHeight = PPTX_EXPORT_SIZE.height,
  viewport = getPptxFrame(),
  slideBreaks = [],
  produceGif = false,
  produceApng = false,
  produceVideo = true,
  // boolean | number[] (slide numbers 1-based or indices 0-based) |
  // (segment, slideNumber, segments) => boolean
  produceGifPlayOnce = true,
  produceGifScale = 1,
  // Playback rate multiplier for GIF/APNG captures; 2 = 2x speed, 0.5 = half-speed
  gifSpeed = 1,
  // boolean | number[] (slide numbers 1-based or indices 0-based) |
  // (segment, slideNumber, segments) => boolean
  produceGifLoopable = false,
  // number | (segment, slideNumber, segments) => number
  gifHoldSeconds = 0,
  // Clean teal frame border for exported GIF/APNG frames: 'none' | 'frame' | 'line'.
  border = 'none',
  // Imported slide template { bitmap, width, height, rect } — composite frames into it.
  slideTemplate = null,
  onProgress,
  onStatus,
}) {
  if (!nodes.length) throw new Error('Nothing to export. Add some nodes first.');

  const segments = collectPresentationSegments(nodes, links, { slideBreaks });
  if (!segments.length) throw new Error('No animation keyframes found for presentation export.');

  const clips = [];
  let sharedGifPaletteBytes = null;
  let boundaryFrameBytes = null;
  const gifPaletteSampleTimes = produceGif ? collectPaletteSampleTimes(segments) : [];
  const frameRate = Math.max(12, Math.min(60, Number(fps) || 60));

  onStatus?.(`Preparing ${segments.length} slide${segments.length === 1 ? '' : 's'}...`);
  onProgress?.(0);

  for (const segment of segments) {
    const slideNumber = segment.index + 1;
    onStatus?.(`Rendering slide animation ${slideNumber}/${segments.length} (${segment.start.toFixed(2)}s-${segment.end.toFixed(2)}s)...`);
    const isLoopable = typeof produceGifLoopable === 'function'
      ? !!produceGifLoopable(segment, slideNumber, segments)
      : Array.isArray(produceGifLoopable)
        ? (produceGifLoopable.includes(slideNumber) || produceGifLoopable.includes(segment.index))
        : !!produceGifLoopable;

    const playOnce = typeof produceGifPlayOnce === 'function'
      ? !!produceGifPlayOnce(segment, slideNumber, segments)
      : Array.isArray(produceGifPlayOnce)
        ? !(produceGifPlayOnce.includes(slideNumber) || produceGifPlayOnce.includes(segment.index))
        : !!produceGifPlayOnce;

    const holdSec = typeof gifHoldSeconds === 'function'
      ? Number(gifHoldSeconds(segment, slideNumber, segments) || 0)
      : Number(gifHoldSeconds || 0);

    const clip = await renderAnimationClipToMP4({
      stageRef,
      layerRef,
      nodes,
      links,
      startTime: segment.start,
      endTime: segment.end,
      fps: frameRate,
      exportWidth,
      exportHeight,
      viewport,
      alsoGif: produceGif,
      alsoApng: produceApng,
      produceVideo,
      gifPlayOnce: playOnce,
      gifPlaybackRate: Math.max(0.25, Number(gifSpeed) || 1),
      gifLoopable: isLoopable,
      gifScale: produceGifScale,
      captureScale: 1,
      gifHoldSeconds: holdSec,
      border,
      slideTemplate,
      gifPaletteBytes: sharedGifPaletteBytes,
      gifPaletteSampleTimes: sharedGifPaletteBytes ? [] : gifPaletteSampleTimes,
      initialFrameBytes: isLoopable ? null : boundaryFrameBytes,
      filePrefix: `${safePrefix(projectName)}_slide_${slideNumber}_${Date.now()}`,
      onProgress: p => onProgress?.((segment.index + p) / segments.length),
      onStatus,
    });

    if (clip.gifPaletteBytes) {
      sharedGifPaletteBytes = new Uint8Array(clip.gifPaletteBytes.byteLength);
      sharedGifPaletteBytes.set(clip.gifPaletteBytes);
    }
    if (clip.lastFrameBytes) {
      boundaryFrameBytes = new Uint8Array(clip.lastFrameBytes.byteLength);
      boundaryFrameBytes.set(clip.lastFrameBytes);
    }
    const {
      gifPaletteBytes: _gifPaletteBytes,
      lastFrameBytes: _lastFrameBytes,
      ...clipMedia
    } = clip;

    clips.push({
      ...segment,
      ...clipMedia,
      durationSec: segment.durationSec,
      mediaDurationSec: clip.mediaDuration ?? clip.duration ?? segment.durationSec,
    });
  }

  onProgress?.(1);
  return { segments, clips };
}
