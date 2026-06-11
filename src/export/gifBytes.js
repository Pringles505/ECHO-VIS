// Low-level GIF byte manipulation used by the exporters: frame/delay scanning,
// per-frame retiming to hit an exact wall-clock duration, and comment-block
// padding for importers that reject very small files. Pure functions over
// Uint8Array — no DOM or ffmpeg dependencies, so they are unit-testable.

export function inspectGif(bytes) {
  const empty = { frameCount: 0, delayOffsets: [], gcePackedOffsets: [] };
  if (!bytes || bytes.length < 13) return empty;
  const signature = String.fromCharCode(...bytes.subarray(0, 6));
  if (signature !== 'GIF87a' && signature !== 'GIF89a') return empty;

  let offset = 13;
  const packed = bytes[10];
  if (packed & 0x80) offset += 3 * (2 ** ((packed & 0x07) + 1));

  let frameCount = 0;
  const delayOffsets = [];
  const gcePackedOffsets = [];
  while (offset < bytes.length) {
    const marker = bytes[offset++];
    if (marker === 0x3b) break;
    if (marker === 0x21) {
      const label = bytes[offset++];
      if (label === 0xf9 && bytes[offset] === 0x04 && offset + 5 < bytes.length) {
        gcePackedOffsets.push(offset + 1);
        delayOffsets.push(offset + 2);
      }
      while (offset < bytes.length) {
        const blockSize = bytes[offset++];
        if (blockSize === 0) break;
        offset += blockSize;
      }
      continue;
    }
    if (marker !== 0x2c || offset + 9 > bytes.length) break;

    frameCount += 1;
    const imagePacked = bytes[offset + 8];
    offset += 9;
    if (imagePacked & 0x80) offset += 3 * (2 ** ((imagePacked & 0x07) + 1));
    offset += 1;
    while (offset < bytes.length) {
      const blockSize = bytes[offset++];
      if (blockSize === 0) break;
      offset += blockSize;
    }
  }
  return { frameCount, delayOffsets, gcePackedOffsets };
}

export function countGifFrames(bytes) {
  return inspectGif(bytes).frameCount;
}

export function retimeGif(bytes, fps, targetSeconds, opts = {}) {
  const loopable = !!opts.loopable;
  if (!bytes || bytes.length < 13) return bytes;
  const output = new Uint8Array(bytes);
  const { delayOffsets, gcePackedOffsets } = inspectGif(output);
  if (!delayOffsets.length) return output;

  // Force disposal method 2 ("restore to background") so decoders that expect
  // cleared areas between frames (common in importers) do not accumulate trails.
  // Always clear the first frame's transparency so importers that expect a
  // fully-opaque initial frame (e.g., slide tools) have a solid keyframe.
  gcePackedOffsets.forEach((packedOffset, index) => {
    const packed = output[packedOffset];
    const withRestoreBkg = (packed & 0xe3) | 0x08; // disposal=2
    if (index === 0) output[packedOffset] = withRestoreBkg & 0xfe; else output[packedOffset] = withRestoreBkg;
  });

  const frameRate = Math.max(1, Number(fps) || 60);
  // If targetSeconds is invalid/missing, infer from frame count and fps
  const totalSeconds = Number.isFinite(targetSeconds) && targetSeconds > 0
    ? targetSeconds
    : (delayOffsets.length / frameRate);
  const targetDelayCs = Math.max(delayOffsets.length, Math.ceil(totalSeconds * 100));
  let elapsedCs = 0;

  delayOffsets.forEach((delayOffset, index) => {
    const isLastFrame = index === delayOffsets.length - 1;
    const nextElapsedCs = isLastFrame
      ? targetDelayCs
      : Math.max(elapsedCs + 1, Math.round(((index + 1) * 100) / frameRate));
    const delayCs = Math.max(1, Math.min(0xffff, nextElapsedCs - elapsedCs));
    output[delayOffset] = delayCs & 0xff;
    output[delayOffset + 1] = (delayCs >> 8) & 0xff;
    elapsedCs += delayCs;
  });

  return output;
}

// Inject a Comment Extension block near the start of the GIF to avoid extremely
// tiny files that some importers treat as invalid. No-op if bytes look invalid.
export function injectGifComment(bytes, commentLen = 32) {
  if (!bytes || bytes.length < 13) return bytes;
  const commentText = ('ECHO-VIS export compatibility pad ').repeat(Math.ceil(commentLen / 30)).slice(0, Math.max(16, commentLen));
  const encoder = new TextEncoder();
  const textBytes = encoder.encode(commentText);
  // Build extension sub-blocks (1..255 bytes each) terminated by 0x00
  const parts = [];
  for (let i = 0; i < textBytes.length; i += 255) {
    const slice = textBytes.subarray(i, i + 255);
    const block = new Uint8Array(1 + slice.length);
    block[0] = slice.length;
    block.set(slice, 1);
    parts.push(block);
  }
  const term = new Uint8Array([0x00]);
  const header = new Uint8Array([0x21, 0xFE]); // Extension Introducer + Comment Label
  // Determine insert offset after LSD + optional GCT
  let insertOffset = 13;
  const packed = bytes[10];
  if (packed & 0x80) insertOffset += 3 * (2 ** ((packed & 0x07) + 1));
  const before = bytes.subarray(0, insertOffset);
  const after = bytes.subarray(insertOffset);
  // Concatenate
  let totalLen = before.length + header.length + parts.reduce((s, b) => s + b.length, 0) + term.length + after.length;
  const out = new Uint8Array(totalLen);
  let off = 0;
  out.set(before, off); off += before.length;
  out.set(header, off); off += header.length;
  for (const p of parts) { out.set(p, off); off += p.length; }
  out.set(term, off); off += term.length;
  out.set(after, off);
  return out;
}

export function padGifToMinBytes(bytes, minLen = 8192) {
  if (!bytes || bytes.length < 13) return bytes;
  if (bytes.length >= minLen) return bytes;
  // Estimate needed payload length minus header/terminator overhead (~2 + Nblocks).
  // Overshoot slightly to guarantee minLen after encapsulation.
  const needed = Math.max(0, minLen - bytes.length + 64);
  return injectGifComment(bytes, needed);
}
