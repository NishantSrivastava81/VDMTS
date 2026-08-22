import "server-only";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MIN_DIMENSION = 120;
const MAX_DIMENSION = 6000;

export type ImageMimeType = "image/jpeg" | "image/png" | "image/webp";

export interface ValidatedImage {
  mimeType: ImageMimeType;
  width: number;
  height: number;
}

export class ImageValidationError extends Error {
  constructor(
    message: string,
    readonly reason:
      | "too_large"
      | "unsupported_format"
      | "unreadable"
      | "dimensions_out_of_range",
  ) {
    super(message);
    this.name = "ImageValidationError";
  }
}

/**
 * Trusts the file signature rather than the declared MIME type, and reads the
 * dimensions from the header so a decode bomb is rejected before any model call.
 * PDF and TIFF are excluded by the signature allowlist, which also rules out
 * multi-page documents.
 */
export function validateImage(bytes: Uint8Array): ValidatedImage {
  if (bytes.byteLength === 0) {
    throw new ImageValidationError("Empty upload", "unreadable");
  }
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new ImageValidationError("Image exceeds the size limit", "too_large");
  }

  const mimeType = detectMimeType(bytes);
  if (!mimeType) {
    throw new ImageValidationError("Only JPEG, PNG and WebP are accepted", "unsupported_format");
  }

  const dimensions = readDimensions(bytes, mimeType);
  if (!dimensions) {
    throw new ImageValidationError("Image header could not be read", "unreadable");
  }

  const { width, height } = dimensions;
  if (
    width < MIN_DIMENSION ||
    height < MIN_DIMENSION ||
    width > MAX_DIMENSION ||
    height > MAX_DIMENSION
  ) {
    throw new ImageValidationError("Image dimensions are out of range", "dimensions_out_of_range");
  }

  return { mimeType, width, height };
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.byteLength < offset + signature.length) {
    return false;
  }
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

const JPEG = [0xff, 0xd8, 0xff] as const;
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const RIFF = [0x52, 0x49, 0x46, 0x46] as const;
const WEBP = [0x57, 0x45, 0x42, 0x50] as const;

function detectMimeType(bytes: Uint8Array): ImageMimeType | null {
  if (startsWith(bytes, JPEG)) {
    return "image/jpeg";
  }
  if (startsWith(bytes, PNG)) {
    return "image/png";
  }
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) {
    return "image/webp";
  }
  return null;
}

interface Dimensions {
  width: number;
  height: number;
}

function readDimensions(bytes: Uint8Array, mimeType: ImageMimeType): Dimensions | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (mimeType === "image/png") {
    if (bytes.byteLength < 24) {
      return null;
    }
    return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
  }

  if (mimeType === "image/jpeg") {
    return readJpegDimensions(view, bytes.byteLength);
  }

  return readWebpDimensions(view, bytes);
}

const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function readJpegDimensions(view: DataView, length: number): Dimensions | null {
  let offset = 2;

  while (offset + 9 < length) {
    if (view.getUint8(offset) !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = view.getUint8(offset + 1);
    if (JPEG_SOF_MARKERS.has(marker)) {
      return {
        height: view.getUint16(offset + 5, false),
        width: view.getUint16(offset + 7, false),
      };
    }

    const segmentLength = view.getUint16(offset + 2, false);
    if (segmentLength < 2) {
      return null;
    }
    offset += 2 + segmentLength;
  }

  return null;
}

function readWebpDimensions(view: DataView, bytes: Uint8Array): Dimensions | null {
  if (bytes.byteLength < 30) {
    return null;
  }

  const format = String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!);

  if (format === "VP8 ") {
    return {
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff,
    };
  }

  if (format === "VP8L") {
    const bits = view.getUint32(21, true);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }

  if (format === "VP8X") {
    const width = (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16)) + 1;
    const height = (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16)) + 1;
    return { width, height };
  }

  return null;
}
