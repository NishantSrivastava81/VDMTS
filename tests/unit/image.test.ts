import { describe, expect, it } from "vitest";
import { ImageValidationError, MAX_IMAGE_BYTES, validateImage } from "@/lib/server/image";

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return bytes;
}

function jpeg(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(20);
  bytes.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08], 0);
  const view = new DataView(bytes.buffer);
  view.setUint16(7, height, false);
  view.setUint16(9, width, false);
  return bytes;
}

function webpVp8x(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30);
  const ascii = (text: string, offset: number) => {
    for (let index = 0; index < text.length; index += 1) {
      bytes[offset + index] = text.charCodeAt(index);
    }
  };
  ascii("RIFF", 0);
  ascii("WEBP", 8);
  ascii("VP8X", 12);

  const w = width - 1;
  const h = height - 1;
  bytes[24] = w & 0xff;
  bytes[25] = (w >> 8) & 0xff;
  bytes[26] = (w >> 16) & 0xff;
  bytes[27] = h & 0xff;
  bytes[28] = (h >> 8) & 0xff;
  bytes[29] = (h >> 16) & 0xff;
  return bytes;
}

describe("validateImage", () => {
  it("accepts a PNG and reads its dimensions", () => {
    expect(validateImage(png(1200, 900))).toEqual({
      mimeType: "image/png",
      width: 1200,
      height: 900,
    });
  });

  it("accepts a JPEG and reads its dimensions", () => {
    expect(validateImage(jpeg(800, 600))).toEqual({
      mimeType: "image/jpeg",
      width: 800,
      height: 600,
    });
  });

  it("accepts a WebP and reads its dimensions", () => {
    expect(validateImage(webpVp8x(640, 480))).toEqual({
      mimeType: "image/webp",
      width: 640,
      height: 480,
    });
  });

  it("rejects a PDF, which also rules out multi-page documents", () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
    expect(() => validateImage(pdf)).toThrowError(ImageValidationError);
  });

  it("rejects a file whose signature does not match its claimed type", () => {
    // A .jpg that is really an HTML document must not reach the model.
    const html = new TextEncoder().encode("<html><body>not an image</body></html>");
    expect(() => validateImage(html)).toThrowError(/JPEG, PNG and WebP/);
  });

  it("rejects an empty upload", () => {
    expect(() => validateImage(new Uint8Array(0))).toThrowError(/Empty upload/);
  });

  it("rejects an upload over the size limit", () => {
    const large = new Uint8Array(MAX_IMAGE_BYTES + 1);
    large.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    expect(() => validateImage(large)).toThrowError(/size limit/);
  });

  it("accepts a wide, short crop of a single question", () => {
    // A question cropped out of a textbook page looks like this.
    expect(validateImage(jpeg(546, 102))).toMatchObject({ width: 546, height: 102 });
  });

  it("rejects an image too small to read notation from", () => {
    expect(() => validateImage(png(160, 120))).toThrowError(/dimensions/);
  });

  it("rejects a strip too thin to hold a line of text", () => {
    expect(() => validateImage(png(900, 20))).toThrowError(/dimensions/);
  });

  it("rejects a decode bomb", () => {
    expect(() => validateImage(png(40000, 40000))).toThrowError(/dimensions/);
  });
});
