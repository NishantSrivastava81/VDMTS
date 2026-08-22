import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The read-aloud lifecycle regressed once: interrupting playback rejected the
 * previous request, which the UI treated as a hard failure and used to disable
 * voice for the whole session. These pin the interruption contract.
 */

interface FakeSynthesizer {
  closed: boolean;
  speakTextAsync: (
    text: string,
    onResult: (result: { reason: string; errorDetails?: string }) => void,
    onError: (error: string) => void,
  ) => void;
  close: (done?: () => void, fail?: () => void) => void;
}

const created: FakeSynthesizer[] = [];
let nextBehaviour: "complete" | "hang" | "fail" = "complete";

vi.mock("microsoft-cognitiveservices-speech-sdk", () => {
  class SpeechSynthesizer implements FakeSynthesizer {
    closed = false;
    private pendingError: ((error: string) => void) | null = null;

    constructor() {
      created.push(this);
    }

    speakTextAsync(
      _text: string,
      onResult: (result: { reason: string; errorDetails?: string }) => void,
      onError: (error: string) => void,
    ) {
      if (nextBehaviour === "complete") {
        setTimeout(() => onResult({ reason: "SynthesizingAudioCompleted" }), 0);
      } else if (nextBehaviour === "fail") {
        setTimeout(() => onError("synthesis exploded"), 0);
      } else {
        // Stays silent until something closes it, like real playback.
        this.pendingError = onError;
      }
    }

    close(done?: () => void) {
      this.closed = true;
      this.pendingError?.("closed while speaking");
      done?.();
    }
  }

  return {
    SpeechSynthesizer,
    SpeechConfig: { fromAuthorizationToken: () => ({}) },
    AudioConfig: { fromDefaultMicrophoneInput: () => ({}) },
    SpeechRecognizer: class {},
    AutoDetectSourceLanguageConfig: { fromLanguages: () => ({}) },
    ResultReason: { SynthesizingAudioCompleted: "SynthesizingAudioCompleted" },
    CancellationReason: { Error: "Error" },
  };
});

const { forgetSpeechToken, speak, stopSpeaking } = await import("@/lib/speech/client");

beforeEach(() => {
  created.length = 0;
  nextBehaviour = "complete";
  forgetSpeechToken();

  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        token: "t",
        region: "eastus",
        recognitionLanguage: "en-IN",
        voiceName: "en-IN-Arjun:DragonHDLatestNeural",
        expiresAt: new Date(Date.now() + 9 * 60_000).toISOString(),
      }),
    })),
  );
});

describe("read aloud", () => {
  it("reports completion for an uninterrupted reading", async () => {
    await expect(speak("hello")).resolves.toBe("completed");
  });

  it("can be used more than once", async () => {
    await expect(speak("first")).resolves.toBe("completed");
    await expect(speak("second")).resolves.toBe("completed");
    expect(created).toHaveLength(2);
  });

  it("treats being superseded as an interruption, not a failure", async () => {
    nextBehaviour = "hang";
    const first = speak("long reply");
    await Promise.resolve();

    nextBehaviour = "complete";
    const second = speak("newer reply");

    // The first must not reject: the UI disabled voice entirely when it did.
    await expect(first).resolves.toBe("interrupted");
    await expect(second).resolves.toBe("completed");
  });

  it("treats an explicit stop as an interruption", async () => {
    nextBehaviour = "hang";
    const playing = speak("long reply");
    await Promise.resolve();

    await stopSpeaking();

    await expect(playing).resolves.toBe("interrupted");
  });

  it("still surfaces a genuine synthesis failure", async () => {
    nextBehaviour = "fail";
    await expect(speak("hello")).rejects.toThrow(/synthesis exploded/);
  });

  it("recovers on the next attempt after a failure", async () => {
    nextBehaviour = "fail";
    await expect(speak("hello")).rejects.toThrow();

    nextBehaviour = "complete";
    await expect(speak("hello again")).resolves.toBe("completed");
  });

  it("closes each synthesizer it opens", async () => {
    await speak("one");
    await speak("two");
    expect(created.every((synth) => synth.closed)).toBe(true);
  });
});
