"use client";

import { useCallback, useEffect, useRef, useState } from "react";import { Loader2, Mic } from "lucide-react";
import { startRecognition, type RecognitionSession } from "@/lib/speech/client";
import type { TutorLanguage } from "@/types/tutor";

interface VoiceRecorderProps {
  language: TutorLanguage;
  onCancel: () => void;
  onAccept: (transcript: string) => void;
  onUnavailable: (message: string) => void;
}

type Stage = "starting" | "listening" | "review";

/**
 * Screen 7.5. Tap to start, tap to stop, never always listening. The transcript
 * is editable and is only sent when the student chooses to, so a recognition
 * slip is never judged as a mathematical misconception.
 *
 * Mounted fresh for each recording, so opening the sheet always starts clean.
 */
export function VoiceRecorder({ language, onCancel, onAccept, onUnavailable }: VoiceRecorderProps) {
  const [stage, setStage] = useState<Stage>("starting");
  const [transcript, setTranscript] = useState("");
  const [attempt, setAttempt] = useState(0);
  const sessionRef = useRef<RecognitionSession | null>(null);

  const stopSession = useCallback(async () => {
    const session = sessionRef.current;
    sessionRef.current = null;
    await session?.stop();
  }, []);

  useEffect(() => {
    let cancelled = false;

    startRecognition(
      {
        onPartial: (text) => {
          if (!cancelled) {
            setTranscript(text);
          }
        },
        onFinal: (text) => {
          if (!cancelled) {
            setTranscript(text);
          }
        },
        onError: (error) => {
          if (!cancelled) {
            onUnavailable(error.message);
          }
        },
      },
      language,
    )
      .then((session) => {
        if (cancelled) {
          void session.stop();
          return;
        }
        sessionRef.current = session;
        setStage("listening");
      })
      .catch(() => {
        if (!cancelled) {
          onUnavailable("Voice is unavailable right now. You can keep typing.");
        }
      });

    return () => {
      cancelled = true;
      void stopSession();
    };
  }, [attempt, onUnavailable, stopSession, language]);

  const handleStop = async () => {
    await stopSession();
    setStage("review");
  };

  const handleCancel = async () => {
    await stopSession();
    onCancel();
  };

  const handleRecordAgain = () => {
    setTranscript("");
    setStage("starting");
    setAttempt((value) => value + 1);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={stage === "review" ? "Review your transcript" : "Recording"}
      className="fixed inset-0 z-30 flex items-end bg-ink/60"
    >
      <div className="pb-composer w-full rounded-t-md bg-surface px-4 pt-5">
        {stage === "review" ? (
          <>
            <h2 className="text-sm font-medium tracking-wide text-ink-faint uppercase">
              Your transcript
            </h2>
            <label htmlFor="voice-transcript" className="sr-only">
              Edit your transcript before sending
            </label>
            <textarea
              id="voice-transcript"
              value={transcript}
              onChange={(event) => setTranscript(event.target.value)}
              rows={3}
              className="mt-2 w-full rounded-md border border-rule bg-canvas p-3 leading-relaxed text-ink"
            />
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={handleRecordAgain}
                className="min-h-11 flex-1 rounded-md border border-rule px-4 py-3 font-medium text-ink"
              >
                Record again
              </button>
              <button
                type="button"
                disabled={transcript.trim().length === 0}
                onClick={() => onAccept(transcript.trim())}
                className="min-h-11 flex-1 rounded-md bg-action px-4 py-3 font-medium text-white disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </>
        ) : (
          <>
            <p
              role="status"
              aria-live="assertive"
              className="flex items-center justify-center gap-2 text-center text-base font-medium text-ink"
            >
              {stage === "starting" ? (
                <>
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                  Getting ready
                </>
              ) : (
                <>
                  <Mic aria-hidden="true" className="h-4 w-4 text-action" />
                  Listening
                </>
              )}
            </p>

            <Waveform active={stage === "listening"} />

            <p className="min-h-16 text-center text-[0.98rem] leading-relaxed text-ink-soft">
              {transcript || "Say your next step in your own words."}
            </p>

            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={handleCancel}
                className="min-h-11 flex-1 rounded-md border border-rule px-4 py-3 font-medium text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={stage !== "listening"}
                onClick={handleStop}
                className="min-h-11 flex-1 rounded-md bg-action px-4 py-3 font-medium text-white disabled:opacity-50"
              >
                Stop
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const BAR_HEIGHTS = [14, 26, 18, 34, 22, 30, 16, 28, 20, 24];

function Waveform({ active }: { active: boolean }) {
  return (
    <div aria-hidden="true" className="my-5 flex h-10 items-end justify-center gap-1">
      {BAR_HEIGHTS.map((height, index) => (
        <span
          key={index}
          className={`w-1 rounded-full bg-action/70 ${active ? "animate-pulse" : ""}`}
          style={{ height: active ? `${height}px` : "6px", animationDelay: `${index * 90}ms` }}
        />
      ))}
    </div>
  );
}
