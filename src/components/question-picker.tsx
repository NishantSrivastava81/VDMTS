"use client";

import { ArrowLeft } from "lucide-react";
import { MathContent } from "@/components/math-content";
import { QuestionPreview } from "@/components/question-preview";
import type { DetectedQuestion } from "@/types/tutor";

interface QuestionPickerProps {
  imageUrl: string;
  questions: DetectedQuestion[];
  busy: boolean;
  onChoose: (question: DetectedQuestion) => void;
  onRetake: () => void;
}

/**
 * Section 19.2 — a page photo usually catches its neighbours. Rather than a dead
 * end, the student picks one; only that question is then planned.
 */
export function QuestionPicker({
  imageUrl,
  questions,
  busy,
  onChoose,
  onRetake,
}: QuestionPickerProps) {
  return (
    <section className="px-4 pt-4 pb-8 sm:px-6" aria-labelledby="picker-heading">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRetake}
          aria-label="Choose a different image"
          className="flex h-11 w-11 items-center justify-center rounded-md text-ink"
        >
          <ArrowLeft aria-hidden="true" className="h-5 w-5" />
        </button>
        <h1 id="picker-heading" className="font-serif text-xl text-ink">
          Which one shall we work on?
        </h1>
      </div>

      <p className="mt-1 pl-13 text-sm text-ink-soft">
        I found {questions.length} questions on this page.
      </p>

      <div className="mt-3">
        <QuestionPreview imageUrl={imageUrl} />
      </div>

      <ul className="mt-4 space-y-2">
        {questions.map((question) => (
          <li key={`${question.label}-${question.previewText}`}>
            <button
              type="button"
              disabled={busy}
              onClick={() => onChoose(question)}
              className="flex w-full items-start gap-3 rounded-md border border-rule bg-surface px-3 py-3 text-left transition-colors hover:border-action disabled:opacity-50"
            >
              {question.label ? (
                <span className="mt-0.5 shrink-0 rounded-sm bg-action-soft px-2 py-0.5 text-sm font-semibold text-action">
                  {question.label}
                </span>
              ) : null}
              <MathContent
                content={question.previewText}
                className="teacher-prose flex-1 text-[0.95rem] leading-snug"
              />
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onRetake}
        className="mt-4 min-h-11 w-full rounded-md border border-rule bg-surface px-4 py-3 font-medium text-ink"
      >
        None of these — take another photo
      </button>
    </section>
  );
}
