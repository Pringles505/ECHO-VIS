const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const textEncoder = new TextEncoder();

let crcTable = null;

function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

function crc32(bytes) {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concatBytes(parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function makeChunk(type, data = new Uint8Array()) {
  const typeBytes = textEncoder.encode(type);
  const output = new Uint8Array(12 + data.length);
  const view = new DataView(output.buffer);
  view.setUint32(0, data.length);
  output.set(typeBytes, 4);
  output.set(data, 8);
  view.setUint32(8 + data.length, crc32(concatBytes([typeBytes, data])));
  return output;
}

function parsePng(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < PNG_SIGNATURE.length) {
    throw new Error('Invalid PNG frame.');
  }
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) throw new Error('Invalid PNG signature.');
  }

  const chunks = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = PNG_SIGNATURE.length;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) throw new Error('Truncated PNG frame.');
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    chunks.push({ type, data: bytes.subarray(offset + 8, offset + 8 + length) });
    offset = end;
    if (type === 'IEND') break;
  }

  const ihdr = chunks.find(chunk => chunk.type === 'IHDR');
  const idat = chunks.filter(chunk => chunk.type === 'IDAT');
  if (!ihdr || ihdr.data.length !== 13 || !idat.length) {
    throw new Error('PNG frame is missing IHDR or IDAT data.');
  }
  return { chunks, ihdr, idat };
}

function sameHeader(left, right) {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function makeAnimationControl(frameCount, plays) {
  const data = new Uint8Array(8);
  const view = new DataView(data.buffer);
  view.setUint32(0, frameCount);
  view.setUint32(4, plays);
  return makeChunk('acTL', data);
}

function makeFrameControl(sequence, width, height, fps) {
  const data = new Uint8Array(26);
  const view = new DataView(data.buffer);
  const numericFps = Number(fps);
  const frameRate = Number.isFinite(numericFps) && numericFps > 0 ? numericFps : 60;
  view.setUint32(0, sequence);
  view.setUint32(4, width);
  view.setUint32(8, height);
  view.setUint32(12, 0);
  view.setUint32(16, 0);
  view.setUint16(20, 1);
  view.setUint16(22, Math.max(1, Math.min(0xffff, Math.round(frameRate))));
  data[24] = 0; // APNG_DISPOSE_OP_NONE
  data[25] = 0; // APNG_BLEND_OP_SOURCE
  return makeChunk('fcTL', data);
}

function makeFrameData(sequence, idatData) {
  const data = new Uint8Array(4 + idatData.length);
  new DataView(data.buffer).setUint32(0, sequence);
  data.set(idatData, 4);
  return makeChunk('fdAT', data);
}

export function buildFullFrameApng(frameBytes, fps, plays = 1) {
  if (!Array.isArray(frameBytes) || !frameBytes.length) {
    throw new Error('Cannot build APNG without frames.');
  }

  const parsedFrames = frameBytes.map(parsePng);
  const header = parsedFrames[0].ihdr.data;
  for (let i = 1; i < parsedFrames.length; i++) {
    if (!sameHeader(header, parsedFrames[i].ihdr.data)) {
      throw new Error(`APNG frame ${i + 1} does not match the first frame dimensions or format.`);
    }
  }

  const headerView = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const width = headerView.getUint32(0);
  const height = headerView.getUint32(4);
  const firstDataIndex = parsedFrames[0].chunks.findIndex(chunk => chunk.type === 'IDAT');
  const preDataChunks = parsedFrames[0].chunks.slice(1, firstDataIndex).filter(chunk =>
    chunk.type !== 'IHDR' &&
    chunk.type !== 'IDAT' &&
    chunk.type !== 'IEND' &&
    chunk.type !== 'acTL' &&
    chunk.type !== 'fcTL' &&
    chunk.type !== 'fdAT'
  );

  const parts = [
    PNG_SIGNATURE,
    makeChunk('IHDR', header),
    ...preDataChunks.map(chunk => makeChunk(chunk.type, chunk.data)),
    makeAnimationControl(
      parsedFrames.length,
      Number.isFinite(Number(plays)) ? Math.max(0, Math.round(Number(plays))) : 1
    ),
  ];

  let sequence = 0;
  parsedFrames.forEach((frame, frameIndex) => {
    parts.push(makeFrameControl(sequence++, width, height, fps));
    for (const idat of frame.idat) {
      parts.push(frameIndex === 0
        ? makeChunk('IDAT', idat.data)
        : makeFrameData(sequence++, idat.data));
    }
  });
  parts.push(makeChunk('IEND'));

  return concatBytes(parts);
}
