import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { AnimationEngine } from '../animation/AnimationEngine';
import { applyAnimState, computeLinkRenders, resetAnimState } from '../animation/applyAnimState';

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

  const stageW = stage.width();
  const stageH = stage.height();
  const rawRatio = Math.max(exportWidth / stageW, exportHeight / stageH);
  const rawW = Math.round(stageW * rawRatio);
  const evenW = Math.floor(rawW / 2) * 2;
  const pixelRatio = evenW / stageW;

  onStatus?.(`Capturing ${totalFrames} frames…`);
  const frameBytes = [];

  for (let frame = 0; frame < totalFrames; frame++) {
    const t = frame / fps;
    const animState = engine.getStateAtTime(t);
    applyAnimState(layer, animState, linkRenders);
    layer.draw();

    const dataUrl = stage.toDataURL({ mimeType: 'image/png', pixelRatio });
    const b64 = dataUrl.split(',')[1];
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    frameBytes.push(bytes);

    if (frame % 15 === 0) {
      onProgress?.((frame / totalFrames) * 0.65);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  resetAnimState(layer, nodes, links);

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
      '-preset', 'fast',
      '-crf', '18',
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
  const anchor = Object.assign(document.createElement('a'), {
    href: url,
    download: 'echo-vis-export.mp4',
  });
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
