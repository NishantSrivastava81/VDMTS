"use client";

import { useState } from "react";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { MathContent } from "@/components/math-content";
import { QuestionPreview } from "@/components/question-preview";
import type { QuestionAnalysis } from "@/types/tutor";

interface TranscriptionCheckProps {
  imageUrl: string;
  analysis: QuestionAnalysis;
  onConfirm: (correctedMarkdown: string) => void;
  onBack: () => void;
}

/**
 * Screen 7.2. Confirmation is asked for precisely, never as a generic
 * low-confidence warning, and the original image stays in reach because
 * mathematical OCR errors are consequential.
 */
export function TranscriptionCheck({
  imageUrl,
  analysis,
  onConfirm,
  onBack,
}: TranscriptionCheckProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(analysis.transcription.displayMarkdown);

  const ambiguities = analysis.transcription.ambiguities;

  return (
    <section className="px-4 pt-4 pb-8 sm:px-6" aria-labelledby="check-heading">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Choose a different image"
          className="flex h-11 w-11 items-center justify-center rounded-md text-ink"
        >
          <ArrowLeft aria-hidden="true" className="h-5 w-5" />
        </button>
        <h1 id="check-heading" className="font-serif text-xl text-ink">
          Check the question
        </h1>
      </div>

      <div className="mt-3">
        <QuestionPreview imageUrl={imageUrl} />
      </div>

      <h2 className="mt-6 text-sm font-medium tracking-wide text-ink-faint uppercase">
        I read it as
      </h2>

      {editing ? (
        <>
          <label htmlFor="transcription" className="sr-only">
            Correct the question text
          </label>
          <textarea
            id="transcription"
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={5}
            className="mt-2 w-full rounded-md border border-rule bg-surface p-3 leading-relaxed text-ink"
          />
          <p className="mt-1 text-xs text-ink-faint">
            Write it in plain text. Maths between dollar signs is rendered, for example $x^2$.
          </p>
        </>
      ) : (
        <MathContent content={text} className="teacher-prose mt-2" />
      )}

      {ambiguities.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {ambiguities.map((ambiguity) => (
            <li
              key={ambiguity.question}
              className="flex gap-2 rounded-sm bg-clue-soft px-3 py-2 text-sm text-ink"
            >
              <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{ambiguity.question}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={() => setEditing((value) => !value)}
          className="min-h-11 flex-1 rounded-md border border-rule bg-surface px-4 py-3 font-medium text-ink"
        >
          {editing ? "Done editing" : "Edit text"}
        </button>
        <button
          type="button"
          onClick={() => onConfirm(text.trim())}
          disabled={text.trim().length === 0}
          className="min-h-11 flex-1 rounded-md bg-action px-4 py-3 font-medium text-white disabled:opacity-50"
        >
          Yes, continue
        </button>
      </div>
    </section>
  );
}
