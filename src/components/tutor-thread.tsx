"use client";

import { useEffect, useRef } from "react";
import { MathContent } from "@/components/math-content";
import { SpeakButton } from "@/components/speak-button";
import type { SessionMessage, SuggestedAction } from "@/types/tutor";

interface TutorThreadProps {
  messages: SessionMessage[];
  thinking: boolean;
  speakingMessageId: string | null;
  speechState: "idle" | "loading" | "playing";
  onSpeak: (messageId: string, speechText: string) => void;
  onStopSpeaking: () => void;
  onSuggestedAction: (action: SuggestedAction) => void;
  actionsDisabled: boolean;
}

export function TutorThread({
  messages,
  thinking,
  speakingMessageId,
  speechState,
  onSpeak,
  onStopSpeaking,
  onSuggestedAction,
  actionsDisabled,
}: TutorThreadProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const lastId = messages.at(-1)?.id;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [lastId, thinking]);

  const lastTutorIndex = findLastTutorIndex(messages);

  return (
    <div className="px-4 sm:px-6">
      <ol className="space-y-5">
        {messages.map((message, index) =>
          message.role === "student" ? (
            <li key={message.id}>
              <p className="text-xs font-medium tracking-wide text-student-ink uppercase">You</p>
              {/* Student text is escaped, never parsed as Markdown or LaTeX. */}
              <p className="mt-1 rounded-md bg-student px-3 py-2 text-[0.98rem] leading-relaxed whitespace-pre-wrap text-ink">
                {message.text}
              </p>
            </li>
          ) : (
            <li key={message.id}>
              <div className="flex items-start gap-1">
                <MathContent
                  content={message.displayMarkdown}
                  fallback={message.mathFallback}
                  className="teacher-prose flex-1"
                />
                <SpeakButton
                  state={speakingMessageId === message.id ? speechState : "idle"}
                  onSpeak={() => onSpeak(message.id, message.speechText)}
                  onStop={onStopSpeaking}
                />
              </div>

              {index === lastTutorIndex && message.suggestedActions.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {message.suggestedActions.slice(0, 2).map((action) => (
                    <button
                      key={action}
                      type="button"
                      disabled={actionsDisabled}
                      onClick={() => onSuggestedAction(action)}
                      className="min-h-11 rounded-md border border-rule bg-surface px-3 py-2 text-sm font-medium text-ink disabled:opacity-50"
                    >
                      {action}
                    </button>
                  ))}
                </div>
              ) : null}
            </li>
          ),
        )}
      </ol>

      {/* Truthful staged status, not a simulated typing indicator. */}
      <p
        role="status"
        aria-live="polite"
        className={`mt-5 text-sm text-ink-faint ${thinking ? "" : "sr-only"}`}
      >
        {thinking ? "Reading your step" : ""}
      </p>

      <div ref={endRef} className="h-2" />
    </div>
  );
}

function findLastTutorIndex(messages: SessionMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "tutor") {
      return index;
    }
  }
  return -1;
}
