import { PPTX_EXPORT_SIZE } from '../presentation/pptxFrame';
import { renderSegmentClips } from '../presentation/renderClips';
import { createZip } from './zip';

function safeFileName(value, fallback = 'echo-vis-mp4-clips') {
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

function howToText(projectName, clips) {
  const lines = [
    'ECHO-VIS MP4 clips package',
    '',
    'Each slide’s animation is exported as a 60 FPS H.264 MP4.',
    '',
    'Google Slides (with video controls hidden):',
    '1) Upload all slideN.mp4 files to your Google Drive.',
    '2) In Slides: Insert > Video > Google Drive, pick slide1.mp4 for slide 1, etc.',
    '3) Resize the video to fill the slide.',
    '4) With the video selected: Format options > Video playback > Play automatically (and Mute).',
    '',
    'Tip: This path preserves true 60 FPS timing.',
    '',
    'Generated media:',
    ...clips.map((clip, i) => {
      const dur = (clip.mediaDurationSec ?? clip.durationSec ?? 0).toFixed(2);
      return `${i + 1}. ${clip.title} (${dur}s) - slide${i + 1}.mp4`;
    }),
    '',
    `Project: ${projectName}`,
  ];
  return lines.join('\n');
}

export async function exportMp4PackageZip({
  stageRef,
  layerRef,
  nodes,
  links,
  projectName = 'ECHO-VIS',
  exportWidth = PPTX_EXPORT_SIZE.width,
  exportHeight = PPTX_EXPORT_SIZE.height,
  viewport = null,
  slideBreaks = [],
  onProgress,
  onStatus,
}) {
  if (!nodes.length) throw new Error('Nothing to export. Add some nodes first.');

  const { clips } = await renderSegmentClips({
    stageRef,
    layerRef,
    nodes,
    links,
    projectName,
    fps: 60,
    exportWidth,
    exportHeight,
    viewport,
    slideBreaks,
    produceGif: false,
    produceApng: false,
    produceVideo: true,
    onProgress: p => onProgress?.(0.02 + p * 0.88),
    onStatus,
  });

  onStatus?.('Packaging MP4 clips...');
  onProgress?.(0.92);
  const entries = [
    { path: 'HOW-TO.txt', data: howToText(projectName, clips) },
    ...clips.flatMap((clip, i) => {
      const list = [];
      if (clip.videoBytes) list.push({ path: `clips/slide${i + 1}.mp4`, data: clip.videoBytes });
      return list;
    }),
  ];
  const fileName = `${safeFileName(projectName)}-mp4-clips.zip`;
  downloadBytes(createZip(entries), fileName, 'application/zip');
  onProgress?.(1);
  onStatus?.('Done!');
  return { fileName, slideCount: clips.length };
}
