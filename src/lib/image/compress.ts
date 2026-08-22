export interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
  bytes: number;
}

export interface CompressOptions {
  maxDimension?: number;
  maxBytes?: number;
  minQuality?: number;
}

const DEFAULTS = {
  maxDimension: 1600,
  // Comfortably inside the platform request limit, with room for the form fields.
  maxBytes: 1_200_000,
  minQuality: 0.55,
} as const;

export class ImageCompressionError extends Error {
  override readonly name = "ImageCompressionError";
}

/**
 * Runs on the device before upload: corrects EXIF orientation, bounds the long
 * edge, and steps the JPEG quality down until the byte budget is met. Anything
 * lower than `minQuality` would start to blur exponents, so it stops there.
 */
export async function compressQuestionImage(
  file: File,
  options: CompressOptions = {},
): Promise<CompressedImage> {
  const { maxDimension, maxBytes, minQuality } = { ...DEFAULTS, ...options };

  const source = await decode(file);
  const scale = Math.min(1, maxDimension / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));

  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new ImageCompressionError("Canvas is unavailable in this browser");
  }

  // Screenshots often carry an alpha channel, and JPEG has none. Without this
  // the encoder composites onto black and the question becomes unreadable.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(source.image, 0, 0, width, height);
  if ("close" in source.image) {
    source.image.close();
  }

  let quality = 0.82;
  let blob = await toBlob(canvas, quality);

  while (blob.size > maxBytes && quality > minQuality) {
    quality = Math.max(minQuality, quality - 0.1);
    blob = await toBlob(canvas, quality);
  }

  return { blob, width, height, bytes: blob.size };
}

interface DecodedImage {
  image: ImageBitmap | HTMLImageElement;
  width: number;
  height: number;
}

async function decode(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { image: bitmap, width: bitmap.width, height: bitmap.height };
    } catch {
      // Fall through to the element decoder.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await loadImageElement(url);
    return { image, width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new ImageCompressionError("The image could not be decoded"));
    image.src = url;
  });
}

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

function createCanvas(width: number, height: number): AnyCanvas {
  if (typeof OffscreenCanvas === "function") {
    return new OffscreenCanvas(width, height);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function toBlob(canvas: AnyCanvas, quality: number): Promise<Blob> {
  // Guarded by typeof: `instanceof` alone throws where OffscreenCanvas is absent.
  if (typeof OffscreenCanvas === "function" && canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: "image/jpeg", quality });
  }

  const element = canvas as HTMLCanvasElement;
  return new Promise((resolve, reject) => {
    element.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new ImageCompressionError("Encoding failed"))),
      "image/jpeg",
      quality,
    );
  });
}
