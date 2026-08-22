"use client";

import { useState } from "react";
import { Mic } from "lucide-react";
import { MathContent } from "@/components/math-content";

interface ReflectionStepProps {
  prompt: string;
  carryForwardCue: string | null;
  busy: boolean;
  voiceEnabled: boolean;
  onSubmit: (text: string) => void;
  onStartVoice: () => void;
  onTryTransfer: () => void;
  onDone: () => void;
}

/**
 * Screen 7.7. The student retrieves the insight before the app summarises it,
 * and transfer practice is offered rather than forced.
 */
export function ReflectionStep({
  prompt,
  carryForwardCue,
  busy,
  voiceEnabled,
  onSubmit,
  onStartVoice,
  onTryTransfer,
  onDone,
}: ReflectionStepProps) {
  const [value, setValue] = useState("");

  if (carryForwardCue) {
    return (
      <section className="px-4 pt-5 pb-8 sm:px-6" aria-labelledby="cue-heading">
        <h2 id="cue-heading" className="text-sm font-medium tracking-wide text-ink-faint uppercase">
          Next-time cue
        </h2>
        <MathContent content={carryForwardCue} className="teacher-prose mt-2" />

        <div className="mt-6 grid gap-3">
          <button
            type="button"
            onClick={onTryTransfer}
            disabled={busy}
            className="min-h-11 rounded-md bg-action px-4 py-3 font-medium text-white disabled:opacity-50"
          >
            Try one related question
          </button>
          <button
            type="button"
            onClick={onDone}
            className="min-h-11 rounded-md border border-rule bg-surface px-4 py-3 font-medium text-ink"
          >
            Done for now
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="px-4 pt-5 pb-8 sm:px-6" aria-labelledby="reflect-heading">
      <h2 id="reflect-heading" className="font-serif text-xl text-ink">
        What should stay with you?
      </h2>
      <MathContent content={prompt} className="teacher-prose mt-3" />

      <label htmlFor="reflection" className="sr-only">
        Your answer
      </label>
      <textarea
        id="reflection"
        rows={3}
        value={value}
        disabled={busy}
        placeholder="Your answer, in your own words..."
        onChange={(event) => setValue(event.target.value)}
        className="mt-4 w-full rounded-md border border-rule bg-surface p-3 leading-relaxed text-ink placeholder:text-ink-faint"
      />

      <div className="mt-3 flex gap-3">
        {voiceEnabled ? (
          <button
            type="button"
            onClick={onStartVoice}
            disabled={busy}
            className="flex min-h-11 items-center gap-2 rounded-md border border-rule bg-surface px-4 py-3 font-medium text-ink disabled:opacity-50"
          >
            <Mic aria-hidden="true" className="h-5 w-5" />
            Speak
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy || value.trim().length === 0}
          onClick={() => onSubmit(value.trim())}
          className="min-h-11 flex-1 rounded-md bg-action px-4 py-3 font-medium text-white disabled:opacity-50"
        >
          Submit
        </button>
      </div>
    </section>
  );
}
