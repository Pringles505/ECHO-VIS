import { describe, expect, it } from 'vitest';
import { countGifFrames, inspectGif, injectGifComment, padGifToMinBytes, retimeGif } from './gifBytes';

// Build a minimal valid GIF89a with `frameCount` frames, each preceded by a
// Graphic Control Extension carrying `delayCs` centiseconds.
function buildGif(frameCount, delayCs = 4) {
  const bytes = [];
  // Header + Logical Screen Descriptor (no global color table)
  bytes.push(...'GIF89a'.split('').map(c => c.charCodeAt(0)));
  bytes.push(1, 0, 1, 0, 0x00, 0, 0); // 1×1, packed=0, bg, aspect
  for (let i = 0; i < frameCount; i += 1) {
    // GCE: introducer, label, size, packed (disposal=1, transparency on), delay, transparent idx, terminator
    bytes.push(0x21, 0xf9, 0x04, 0x05, delayCs & 0xff, (delayCs >> 8) & 0xff, 0x00, 0x00);
    // Image descriptor: separator, left/top/w/h (le16), packed (no local color table)
    bytes.push(0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0x00);
    // LZW min code size + one data sub-block + block terminator
    bytes.push(0x02, 0x01, 0x44, 0x00);
  }
  bytes.push(0x3b); // trailer
  return new Uint8Array(bytes);
}

describe('inspectGif', () => {
  it('counts frames and locates delay/GCE offsets', () => {
    const gif = buildGif(3);
    const info = inspectGif(gif);
    expect(info.frameCount).toBe(3);
    expect(info.delayOffsets).toHaveLength(3);
    expect(info.gcePackedOffsets).toHaveLength(3);
    expect(countGifFrames(gif)).toBe(3);
  });

  it('rejects non-GIF bytes', () => {
    expect(inspectGif(new Uint8Array([1, 2, 3]))).toEqual({
      frameCount: 0, delayOffsets: [], gcePackedOffsets: [],
    });
    expect(inspectGif(null).frameCount).toBe(0);
  });
});

describe('retimeGif', () => {
  it('rewrites per-frame delays so the total matches the target duration', () => {
    const gif = buildGif(10);
    const out = retimeGif(gif, 10, 2); // 10 frames at 10fps stretched to 2s
    const { delayOffsets } = inspectGif(out);
    const totalCs = delayOffsets.reduce(
      (sum, off) => sum + (out[off] | (out[off + 1] << 8)), 0
    );
    expect(totalCs).toBe(200);
  });

  it('forces disposal=2 and clears transparency on the first frame only', () => {
    const out = retimeGif(buildGif(2), 30, 1);
    const { gcePackedOffsets } = inspectGif(out);
    const first = out[gcePackedOffsets[0]];
    const second = out[gcePackedOffsets[1]];
    expect((first >> 2) & 0x07).toBe(2);  // disposal method
    expect(first & 0x01).toBe(0);         // transparency flag cleared
    expect((second >> 2) & 0x07).toBe(2);
    expect(second & 0x01).toBe(1);        // later frames keep transparency
  });

  it('does not mutate its input', () => {
    const gif = buildGif(2);
    const copy = new Uint8Array(gif);
    retimeGif(gif, 30, 1);
    expect(gif).toEqual(copy);
  });
});

describe('padGifToMinBytes / injectGifComment', () => {
  it('pads small GIFs past the minimum size while keeping them parseable', () => {
    const gif = buildGif(2);
    const padded = padGifToMinBytes(gif, 4096);
    expect(padded.length).toBeGreaterThanOrEqual(4096);
    expect(countGifFrames(padded)).toBe(2);
  });

  it('leaves GIFs already at the minimum size untouched', () => {
    const gif = buildGif(2);
    expect(padGifToMinBytes(gif, 10)).toBe(gif);
  });

  it('injects a comment without changing frame count', () => {
    const out = injectGifComment(buildGif(1), 64);
    expect(countGifFrames(out)).toBe(1);
    expect(out.length).toBeGreaterThan(buildGif(1).length);
  });
});
