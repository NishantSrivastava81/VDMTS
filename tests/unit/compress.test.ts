import { describe, expect, it, vi } from "vitest";
import { compressQuestionImage } from "@/lib/image/compress";

interface FakeContext {
  fillStyle: string;
  calls: string[];
  fillRect: (x: number, y: number, w: number, h: number) => void;
  drawImage: (...args: unknown[]) => void;
}

function stubCanvas() {
  const context: FakeContext = {
    fillStyle: "",
    calls: [],
    fillRect(x, y, w, h) {
      this.calls.push(`fillRect:${this.fillStyle}:${x},${y},${w},${h}`);
    },
    drawImage(..._args: unknown[]) {
      this.calls.push("drawImage");
    },
  };

  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toBlob: (callback: (blob: Blob | null) => void, type: string) => {
      callback(new Blob([new Uint8Array(1000)], { type }));
    },
  };

  vi.stubGlobal("OffscreenCanvas", undefined);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag === "canvas") {
      return canvas as unknown as HTMLCanvasElement;
    }
    return document.createElement(tag);
  });

  return { canvas, context };
}

function stubBitmap(width: number, height: number) {
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width, height, close: () => {} })),
  );
}

describe("compressQuestionImage", () => {
  it("paints a white background before drawing, so alpha never flattens to black", async () => {
    const { context } = stubCanvas();
    stubBitmap(800, 600);

    await compressQuestionImage(new File([new Uint8Array(10)], "q.png", { type: "image/png" }));

    // A screenshot with transparency would otherwise become black on black.
    expect(context.calls[0]).toBe("fillRect:#ffffff:0,0,800,600");
    expect(context.calls[1]).toBe("drawImage");
  });

  it("bounds the long edge while keeping the aspect ratio", async () => {
    const { canvas } = stubCanvas();
    stubBitmap(4000, 3000);

    const result = await compressQuestionImage(
      new File([new Uint8Array(10)], "q.jpg", { type: "image/jpeg" }),
    );

    expect(result.width).toBe(1600);
    expect(result.height).toBe(1200);
    expect(canvas.width).toBe(1600);
  });

  it("leaves a small image at its own size", async () => {
    stubCanvas();
    stubBitmap(900, 400);

    const result = await compressQuestionImage(
      new File([new Uint8Array(10)], "q.jpg", { type: "image/jpeg" }),
    );

    expect(result.width).toBe(900);
    expect(result.height).toBe(400);
  });

  it("reads the image with its EXIF orientation applied", async () => {
    stubCanvas();
    stubBitmap(800, 600);

    await compressQuestionImage(new File([new Uint8Array(10)], "q.jpg", { type: "image/jpeg" }));

    expect(createImageBitmap).toHaveBeenCalledWith(expect.anything(), {
      imageOrientation: "from-image",
    });
  });

  it("encodes as JPEG", async () => {
    stubCanvas();
    stubBitmap(800, 600);

    const result = await compressQuestionImage(
      new File([new Uint8Array(10)], "q.png", { type: "image/png" }),
    );

    expect(result.blob.type).toBe("image/jpeg");
  });
});
