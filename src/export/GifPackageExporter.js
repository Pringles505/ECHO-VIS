import { PPTX_EXPORT_SIZE } from '../presentation/pptxFrame';
import { renderSegmentClips } from '../presentation/renderClips';
import { GIF_EXPORT_FPS, GIF_EXPORT_HOLD_SEC } from './gifTiming';
import { createZip } from './zip';
import { buildTemplatedPptx, buildGoogleFriendlyPptx } from './pptx';
import topRightLogoUrl from '../assets/top-right-pptx.png';

function safeFileName(value, fallback = 'echo-vis-gif-package') {
  const clean = String(value ?? '')
    .trim()
    .replace(/[^a-z0-9_-]+/gi, '_')
    .replace(/^_+|_+$/g, '');
  return clean || fallback;
}

function downloadBytes(bytes, fileName, mimeType) {
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = Object.assign(document.createElement('a'), { href: url, download: fileName });
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function howToText(projectName, clips, { gifSpeed, pptxFileName, gslidesPptxFileName } = { gifSpeed: 1 }) {
  const hasVideo = clips.some(c => !!c.videoBytes);
  const lines = [
    'ECHO-VIS GIF/APNG package',
    '',
    ...(pptxFileName ? [
      'Ready-made slide deck:',
      `${pptxFileName} — open in PowerPoint. Each slide plays the diagram GIF; if you imported a`,
      'slide template, the GIF sits in place of its placeholder rectangle (otherwise it is centred',
      'on a dark slide). Animated GIFs play in Slide Show (F5).',
      '',
    ] : []),
    ...(gslidesPptxFileName ? [
      'Google Slides-friendly deck (static posters):',
      `${gslidesPptxFileName} — imports reliably in Google Slides (uses PNG posters per slide).`,
      'Animations will not play inside Slides from this PPTX; use the Google Slides exporters',
      'from the app to insert real GIFs or MP4s directly into a Slides deck.',
      '',
    ] : []),
    'Preferred (no video UI):',
    '1) Create a new Google Slides presentation.',
    '2) Insert slideN-poster.png first and resize it to fill the slide.',
    '3) Insert slideN.apng (or slideN.gif) on top and give it exactly the same bounds.',
    '4) Set the slide background color to #101118.',
    '5) Present the deck. The poster remains visible while the animation initializes.',
    '',
    'Frame rate:',
    `GIF is exported at a constant ${GIF_EXPORT_FPS} FPS (20 ms per frame) for smooth playback in browsers and Google Slides.`,
    `Playback speed: ${Number(gifSpeed || 1)}x`,
    'APNG includes the same frames and timing at full color.',
    ...(hasVideo ? [
      '',
      'Video alternative:',
      '1) Upload every slideN.mp4 file in this ZIP to Google Drive.',
      '2) Insert > Video > Google Drive and select the matching slideN.mp4.',
      '3) Resize to fill the slide. In Format options > Video playback, choose Play automatically (and Mute).',
    ] : []),
    '',
    'Generated media:',
    ...clips.map((clip, i) => {
      const dur = (clip.mediaDurationSec ?? clip.durationSec ?? 0).toFixed(2);
      const items = [];
      if (clip.apngBytes) items.push(`slide${i + 1}.apng`);
      if (clip.gifBytes) items.push(`slide${i + 1}.gif`);
      if (clip.videoBytes) items.push(`slide${i + 1}.mp4`);
      if (clip.posterBytes) items.push(`slide${i + 1}-poster.png`);
      return `${i + 1}. ${clip.title} (${dur}s) - ${items.join(' · ')}`;
    }),
    '',
    `Project: ${projectName}`,
  ];
  return lines.join('\n');
}

export async function exportGifPackageZip({
  stageRef,
  layerRef,
  nodes,
  links,
  projectName = 'ECHO-VIS',
  exportWidth = PPTX_EXPORT_SIZE.width,
  exportHeight = PPTX_EXPORT_SIZE.height,
  viewport = null, // { x, y, width, height } — if null, full stage
  slideBreaks = [],
  gifScale = 1,
  gifSpeed = 1,
  // Loop control:
  // - gifLoopable: boolean or slide numbers (1-based) to loop
  // - gifLoopableMode: 'none' | 'all' | 'last' (overrides gifLoopable when provided)
  gifLoopable = false,
  gifLoopableMode = 'none',
  // Clean teal border drawn around the exported GIFs: 'none' | 'frame' | 'line'.
  gifBorder = 'none',
  // Slide template { bitmap, width, height, rect } — when set, each GIF is the full
  // slide with the animation composited in place of the placeholder rectangle.
  slideTemplate = null,
  onProgress,
  onStatus,
}) {
  if (!nodes.length) throw new Error('Nothing to export. Add some nodes first.');

  // Resolve per-slide loopability
  const loopParam = (() => {
    if (gifLoopableMode === 'all') return true;
    if (gifLoopableMode === 'none') return false;
    if (gifLoopableMode === 'last') {
      return (_segment, slideNumber, segments) => slideNumber === segments.length;
    }
    if (Array.isArray(gifLoopable)) return gifLoopable;
    return !!gifLoopable;
  })();

  const playOnceParam = (segment, slideNumber, segments) => {
    if (typeof loopParam === 'function') return !loopParam(segment, slideNumber, segments);
    if (Array.isArray(loopParam)) return !(loopParam.includes(slideNumber) || loopParam.includes(segment.index));
    return !loopParam; // boolean: loop all => playOnce false; loop none => true
  };

  const holdFn = (segment, slideNumber, segments) => {
    const isLoop = typeof loopParam === 'function'
      ? !!loopParam(segment, slideNumber, segments)
      : Array.isArray(loopParam)
        ? (loopParam.includes(slideNumber) || loopParam.includes(segment.index))
        : !!loopParam;
    return isLoop ? 0 : GIF_EXPORT_HOLD_SEC;
  };

  const { clips } = await renderSegmentClips({
    stageRef,
    layerRef,
    nodes,
    links,
    projectName,
    fps: GIF_EXPORT_FPS,
    exportWidth,
    exportHeight,
    viewport,
    slideBreaks,
    produceGif: true,
    produceGifPlayOnce: playOnceParam,
    produceApng: true,
    produceVideo: false,
    produceGifScale: gifScale,
    gifSpeed,
    produceGifLoopable: loopParam,
    gifHoldSeconds: holdFn,
    border: gifBorder,
    onProgress: p => onProgress?.(0.02 + p * 0.88),
    onStatus,
  });

  // Always bundle a PPTX deck. With an imported slide template each slide uses it as
  // the background with the (diagram-only) GIF dropped into the placeholder rectangle;
  // without one, each GIF is centred on a dark slide. Failures surface as PPTX-ERROR.txt
  // rather than silently omitting the deck.
  let pptxFileName = null;
  let pptxBytes = null;
  let pptxError = null;
  let gslidesPptxFileName = null;
  let gslidesPptxBytes = null;
  let gslidesPptxError = null;
  {
    onStatus?.('Building PowerPoint (.pptx)…');
    onProgress?.(0.93);
    try {
      const gifAspect = exportWidth > 0 && exportHeight > 0 ? exportWidth / exportHeight : 16 / 9;
      let cornerImageBytes = null;
      try {
        cornerImageBytes = new Uint8Array(await (await fetch(topRightLogoUrl)).arrayBuffer());
      } catch (e) {
        console.warn('Could not load top-right corner logo:', e);
      }
      pptxBytes = buildTemplatedPptx({ slideTemplate, clips, gifAspect, cornerImageBytes });
      pptxFileName = `${safeFileName(projectName)}-slides.pptx`;
    } catch (err) {
      console.error('PPTX build failed:', err);
      pptxError = err.message || String(err);
      onStatus?.(`PPTX build failed: ${pptxError}`);
    }
    // Also build a Google Slides-friendly PPTX that uses static PNG posters
    try {
      const gifAspect = exportWidth > 0 && exportHeight > 0 ? exportWidth / exportHeight : 16 / 9;
      let cornerImageBytes = null;
      try {
        cornerImageBytes = new Uint8Array(await (await fetch(topRightLogoUrl)).arrayBuffer());
      } catch (e) {
        // Non-fatal
      }
      gslidesPptxBytes = buildGoogleFriendlyPptx({ slideTemplate, clips, gifAspect, cornerImageBytes });
      gslidesPptxFileName = `${safeFileName(projectName)}-slides-google.pptx`;
    } catch (err) {
      console.warn('Google-friendly PPTX build failed:', err);
      gslidesPptxError = err.message || String(err);
    }
  }

  onStatus?.('Packaging GIF/APNG slides...');
  onProgress?.(0.95);
  const entries = [
    { path: 'HOW-TO.txt', data: howToText(projectName, clips, { gifSpeed, pptxFileName, gslidesPptxFileName }) },
    ...clips.flatMap((clip, i) => {
      const list = [];
      if (clip.apngBytes) list.push({ path: `clips/slide${i + 1}.apng`, data: clip.apngBytes });
      if (clip.gifBytes) list.push({ path: `clips/slide${i + 1}.gif`, data: clip.gifBytes });
      if (clip.videoBytes) list.push({ path: `clips/slide${i + 1}.mp4`, data: clip.videoBytes });
      if (clip.posterBytes) list.push({ path: `clips/slide${i + 1}-poster.png`, data: clip.posterBytes });
      return list;
    }),
  ];
  if (pptxBytes && pptxFileName) entries.push({ path: pptxFileName, data: pptxBytes });
  if (gslidesPptxBytes && gslidesPptxFileName) entries.push({ path: gslidesPptxFileName, data: gslidesPptxBytes });
  if (pptxError && !pptxBytes) entries.push({ path: 'PPTX-ERROR.txt', data: `The PowerPoint deck could not be built.\n\nReason: ${pptxError}\n` });
  if (gslidesPptxError && !gslidesPptxBytes) entries.push({ path: 'PPTX-GOOGLE-ERROR.txt', data: `The Google Slides-friendly PPTX could not be built.\n\nReason: ${gslidesPptxError}\n` });

  const fileName = `${safeFileName(projectName)}-gif-package.zip`;
  downloadBytes(createZip(entries), fileName, 'application/zip');
  onProgress?.(1);
  onStatus?.('Done!');
  return { fileName, pptxFileName, slideCount: clips.length };
}
