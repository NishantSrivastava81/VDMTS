import type { SpeechTokenPayload, TutorLanguage } from "@/types/tutor";

/**
 * Voice is an enhancement layered over the same session. The subscription key
 * never reaches the browser: the app exchanges a short-lived STS token, keeps it
 * in memory only, and lets the SDK talk to Azure Speech directly.
 */
type SpeechSdk = typeof import("microsoft-cognitiveservices-speech-sdk");

let sdkPromise: Promise<SpeechSdk> | null = null;
let cachedToken: SpeechTokenPayload | null = null;

export class SpeechUnavailableError extends Error {
  override readonly name = "SpeechUnavailableError";
}

function loadSdk(): Promise<SpeechSdk> {
  // Deliberately dynamic so the SDK stays out of the initial bundle.
  sdkPromise ??= import("microsoft-cognitiveservices-speech-sdk");
  return sdkPromise;
}

async function currentToken(): Promise<SpeechTokenPayload> {
  if (cachedToken && Date.parse(cachedToken.expiresAt) > Date.now() + 15_000) {
    return cachedToken;
  }

  const response = await fetch("/api/speech/token", { cache: "no-store" });
  if (!response.ok) {
    throw new SpeechUnavailableError(`Speech token request failed (${response.status})`);
  }

  cachedToken = (await response.json()) as SpeechTokenPayload;
  return cachedToken;
}

export function forgetSpeechToken(): void {
  cachedToken = null;
}

async function speechConfig() {
  const sdk = await loadSdk();
  const token = await currentToken();

  const config = sdk.SpeechConfig.fromAuthorizationToken(token.token, token.region);
  config.speechRecognitionLanguage = token.recognitionLanguage;
  config.speechSynthesisLanguage = token.recognitionLanguage;
  config.speechSynthesisVoiceName = token.voiceName;

  return { sdk, config, token };
}

export interface RecognitionHandlers {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (error: Error) => void;
}

export interface RecognitionSession {
  stop: () => Promise<void>;
}

/** Tap to start, tap to stop. Nothing is sent until the student reviews it. */
export async function startRecognition(
  handlers: RecognitionHandlers,
  language: TutorLanguage = "english",
): Promise<RecognitionSession> {
  const { sdk, config, token } = await speechConfig();
  const audio = sdk.AudioConfig.fromDefaultMicrophoneInput();

  let recognizer: import("microsoft-cognitiveservices-speech-sdk").SpeechRecognizer;

  if (language === "hinglish") {
    // A student mid-sentence may switch language, so let Azure decide per utterance.
    const detect = sdk.AutoDetectSourceLanguageConfig.fromLanguages([
      token.recognitionLanguage,
      "hi-IN",
    ]);
    recognizer = sdk.SpeechRecognizer.FromConfig(config, detect, audio);
  } else {
    recognizer = new sdk.SpeechRecognizer(config, audio);
  }

  let finalText = "";

  recognizer.recognizing = (_sender, event) => {
    handlers.onPartial(`${finalText}${event.result.text}`.trim());
  };

  recognizer.recognized = (_sender, event) => {
    if (event.result.reason === sdk.ResultReason.RecognizedSpeech && event.result.text) {
      finalText = `${finalText} ${event.result.text}`.trim();
      handlers.onFinal(finalText);
    }
  };

  recognizer.canceled = (_sender, event) => {
    if (event.reason === sdk.CancellationReason.Error) {
      forgetSpeechToken();
      handlers.onError(new SpeechUnavailableError(event.errorDetails || "Recognition cancelled"));
    }
  };

  await new Promise<void>((resolve, reject) => {
    recognizer.startContinuousRecognitionAsync(
      () => resolve(),
      (error) => reject(new SpeechUnavailableError(String(error))),
    );
  });

  return {
    stop: () =>
      new Promise<void>((resolve) => {
        recognizer.stopContinuousRecognitionAsync(
          () => {
            recognizer.close();
            resolve();
          },
          () => {
            recognizer.close();
            resolve();
          },
        );
      }),
  };
}

let activeSynthesizer: import("microsoft-cognitiveservices-speech-sdk").SpeechSynthesizer | null =
  null;

/** Bumped whenever playback is superseded, so an old request cannot report failure. */
let speakGeneration = 0;

export type SpeakOutcome = "completed" | "interrupted";

async function closeActiveSynthesizer(): Promise<void> {
  const synthesizer = activeSynthesizer;
  activeSynthesizer = null;
  if (!synthesizer) {
    return;
  }
  // Closing the synthesizer is how this SDK version halts playback.
  await new Promise<void>((resolve) => {
    synthesizer.close(
      () => resolve(),
      () => resolve(),
    );
  });
}

/** Reads the tutor's plain `speechText`, never Markdown, LaTeX or DOM text. */
export async function speak(text: string): Promise<SpeakOutcome> {
  const generation = ++speakGeneration;
  await closeActiveSynthesizer();

  const { sdk, config } = await speechConfig();
  if (generation !== speakGeneration) {
    return "interrupted";
  }

  const synthesizer = new sdk.SpeechSynthesizer(config);
  activeSynthesizer = synthesizer;

  try {
    return await new Promise<SpeakOutcome>((resolve, reject) => {
      synthesizer.speakTextAsync(
        text,
        (result) => {
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            resolve("completed");
          } else if (generation !== speakGeneration) {
            resolve("interrupted");
          } else {
            reject(new SpeechUnavailableError(result.errorDetails || "Synthesis failed"));
          }
        },
        (error) => {
          // A newer request closed this one; being cut short is not a failure.
          if (generation !== speakGeneration) {
            resolve("interrupted");
          } else {
            reject(new SpeechUnavailableError(String(error)));
          }
        },
      );
    });
  } finally {
    if (activeSynthesizer === synthesizer) {
      activeSynthesizer = null;
      synthesizer.close();
    }
  }
}

export async function stopSpeaking(): Promise<void> {
  speakGeneration += 1;
  await closeActiveSynthesizer();
}

export async function microphonePermissionState(): Promise<PermissionState | "unsupported"> {
  if (typeof navigator === "undefined" || !navigator.permissions) {
    return "unsupported";
  }
  try {
    const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
    return status.state;
  } catch {
    return "unsupported";
  }
}
