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
  if (bytes.toString('utf8').trimStart().startsWith('<svg ')) {
    return 'image/svg+xml';
  }
  return null;
}

const dataUrlPattern =
  /^data:image\/(png|jpeg|webp|svg\+xml);base64,([A-Za-z0-9+/]+={0,2})$/;
// Checked before decoding so an oversized payload is never allocated.
const maxBase64Length = Math.ceil(maxImageBytes / 3) * 4;

const unsafeSvgPatterns: readonly RegExp[] = [
  /<script/i,
  /<foreignObject/i,
  /[\s"'/]on[a-z]+\s*=/i,
  /j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t\s*:/i,
  // Character references and DTD entities can hide the patterns above.
  /&#/,
  /<!ENTITY/i,
];

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
  if (declared === 'image/svg+xml') {
    const markup = bytes.toString('utf8');
    if (unsafeSvgPatterns.some((pattern) => pattern.test(markup))) {
      return {
        ok: false,
        message: 'SVG images must not contain scripts or event handlers.',
      };
    }
  }
  return { ok: true, bytes };
}
