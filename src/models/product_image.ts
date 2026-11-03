export const maxImageBytes = 1024 * 1024;

export type ImageMimeType =
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp'
  | 'image/svg+xml';

/** Identifies an image from its content, never from a declared type. */
export function detectImageType(image: Uint8Array): ImageMimeType | null {
  const bytes = Buffer.from(image.buffer, image.byteOffset, image.byteLength);
  if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    return 'image/png';
  }
  if (bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))) {
    return 'image/jpeg';
  }
  if (
    bytes.subarray(0, 4).equals(Buffer.from('RIFF')) &&
    bytes.subarray(8, 12).equals(Buffer.from('WEBP'))
  ) {
    return 'image/webp';
  }
  if (
    /^(?:<\?xml\b[^?]*\?>\s*)?<svg(?:[\s/>])/i.test(
      bytes.toString('utf8').trimStart(),
    )
  ) {
    return 'image/svg+xml';
  }
  return null;
}

function hasPngStructure(bytes: Buffer): boolean {
  let offset = 8;
  let hasHeader = false;
  let hasImageData = false;

  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const chunkEnd = offset + 12 + length;
    if (chunkEnd > bytes.length) return false;

    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (!hasHeader && (type !== 'IHDR' || length !== 13)) return false;
    if (type === 'IHDR') {
      if (
        hasHeader ||
        bytes.readUInt32BE(offset + 8) === 0 ||
        bytes.readUInt32BE(offset + 12) === 0
      ) {
        return false;
      }
      hasHeader = true;
    } else if (type === 'IDAT') {
      if (!hasHeader) return false;
      hasImageData ||= length > 0;
    } else if (type === 'IEND') {
      return length === 0 && hasImageData;
    }

    offset = chunkEnd;
  }

  return false;
}

function hasJpegStructure(bytes: Buffer): boolean {
  let offset = 2;
  let hasFrame = false;
  let hasScan = false;

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return false;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === undefined) return false;
    if (marker === 0xd9) return hasFrame && hasScan;
    if (marker === 0xd8) return false;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return false;

    const segmentLength = bytes.readUInt16BE(offset);
    const segmentEnd = offset + segmentLength;
    if (segmentLength < 2 || segmentEnd > bytes.length) return false;

    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      if (segmentLength < 8) return false;
      const components = bytes[offset + 7];
      hasFrame =
        bytes.readUInt16BE(offset + 3) > 0 &&
        bytes.readUInt16BE(offset + 5) > 0 &&
        components !== undefined &&
        components > 0;
      if (!hasFrame) return false;
    }

    if (marker === 0xda) {
      if (!hasFrame || segmentLength < 6) return false;
      hasScan = true;
      offset = segmentEnd;
      let foundMarker = false;
      while (offset < bytes.length) {
        if (bytes[offset] !== 0xff) {
          offset++;
          continue;
        }
        const markerOffset = offset;
        while (bytes[offset] === 0xff) offset++;
        const scanMarker = bytes[offset++];
        if (scanMarker === undefined) return false;
        if (scanMarker === 0x00 || (scanMarker >= 0xd0 && scanMarker <= 0xd7)) {
          continue;
        }
        if (scanMarker === 0xd9) return hasFrame && hasScan;
        offset = markerOffset;
        foundMarker = true;
        break;
      }
      if (!foundMarker) return false;
      continue;
    }

    offset = segmentEnd;
  }

  return false;
}

function hasWebpStructure(bytes: Buffer): boolean {
  const riffEnd = bytes.readUInt32LE(4) + 8;
  if (riffEnd < 20 || riffEnd > bytes.length) return false;

  let offset = 12;
  while (offset + 8 <= riffEnd) {
    const type = bytes.toString('ascii', offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const chunkEnd = dataStart + length;
    if (chunkEnd + (length % 2) > riffEnd) return false;

    const frameTag = bytes[dataStart];
    const losslessVersion = bytes[dataStart + 4];
    if (
      type === 'VP8 ' &&
      length >= 10 &&
      bytes
        .subarray(dataStart + 3, dataStart + 6)
        .equals(Buffer.from('9d012a', 'hex')) &&
      frameTag !== undefined &&
      (frameTag & 1) === 0
    ) {
      return true;
    }
    if (
      type === 'VP8L' &&
      length >= 5 &&
      bytes[dataStart] === 0x2f &&
      losslessVersion !== undefined &&
      losslessVersion >> 5 === 0
    ) {
      return true;
    }

    offset = chunkEnd + (length % 2);
  }

  return false;
}

function hasImageStructure(bytes: Buffer, type: ImageMimeType): boolean {
  switch (type) {
    case 'image/png':
      return hasPngStructure(bytes);
    case 'image/jpeg':
      return hasJpegStructure(bytes);
    case 'image/webp':
      return hasWebpStructure(bytes);
    case 'image/svg+xml':
      return true;
  }
}

const dataUrlPattern =
  /^data:image\/(png|jpeg|webp|svg\+xml);base64,([A-Za-z0-9+/]+={0,2})$/;
// Checked before decoding so an oversized payload is never allocated.
const maxBase64Length = Math.ceil(maxImageBytes / 3) * 4;

export type ImageParseResult =
  | { ok: true; bytes: Buffer }
  | { ok: false; message: string };

export function parseImageDataUrl(value: string): ImageParseResult {
  const match = dataUrlPattern.exec(value);
  if (!match?.[2]) {
    return {
      ok: false,
      message:
        'Image must be a base64 data URL of a PNG, JPEG, WebP or SVG file.',
    };
  }
  const declared = `image/${match[1]}`;
  const encoded = match[2];
  if (encoded.length > maxBase64Length) {
    return { ok: false, message: 'Image must be 1 MB or smaller.' };
  }
  if (encoded.length % 4 !== 0) {
    return { ok: false, message: 'Image is not valid base64.' };
  }

  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length > maxImageBytes) {
    return { ok: false, message: 'Image must be 1 MB or smaller.' };
  }
  if (detectImageType(bytes) !== declared) {
    return {
      ok: false,
      message: 'Image content does not match its declared type.',
    };
  }
  if (!hasImageStructure(bytes, declared)) {
    return { ok: false, message: 'Image content is not a valid image.' };
  }
  if (declared === 'image/svg+xml') {
    return { ok: false, message: 'SVG uploads are not supported.' };
  }
  return { ok: true, bytes };
}
