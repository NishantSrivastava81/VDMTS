"use client";

import { ArrowLeft, Check } from "lucide-react";
import { MathContent } from "@/components/math-content";
import { QuestionPreview } from "@/components/question-preview";
import type { DetectedQuestion } from "@/types/tutor";

interface QuestionPickerProps {
  imageUrl: string;
  questions: DetectedQuestion[];
  completedLabels?: string[];
  busy: boolean;
  onChoose: (question: DetectedQuestion) => void;
  onRetake: () => void;
}

/**
 * Section 19.2 — a page photo usually catches its neighbours. Rather than a dead
 * end, the student picks one; only that question is then planned. The list stays
 * available afterwards so the rest of the page needs no second photograph.
 */
export function QuestionPicker({
  imageUrl,
  questions,
  completedLabels = [],
  busy,
  onChoose,
  onRetake,
}: QuestionPickerProps) {
  const remaining = questions.filter((question) => !completedLabels.includes(question.label));
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
        {completedLabels.length > 0
          ? `${remaining.length} left on this page.`
          : `I found ${questions.length} questions on this page.`}
      </p>

      <div className="mt-3">
        <QuestionPreview imageUrl={imageUrl} />
      </div>

      <ul className="mt-4 space-y-2">
        {questions.map((question) => {
          const done = completedLabels.includes(question.label);
          return (
            <li key={`${question.label}-${question.previewText}`}>
              <button
                type="button"
                disabled={busy}
                onClick={() => onChoose(question)}
                className={`flex w-full items-start gap-3 rounded-md border px-3 py-3 text-left transition-colors disabled:opacity-50 ${
                  done ? "border-rule bg-canvas" : "border-rule bg-surface hover:border-action"
                }`}
              >
                {question.label ? (
                  <span
                    className={`mt-0.5 shrink-0 rounded-sm px-2 py-0.5 text-sm font-semibold ${
                      done ? "bg-rule text-ink-faint" : "bg-action-soft text-action"
                    }`}
                  >
                    {question.label}
                  </span>
                ) : null}
                <MathContent
                  content={question.previewText}
                  className={`teacher-prose flex-1 text-[0.95rem] leading-snug ${
                    done ? "text-ink-faint" : ""
                  }`}
                />
                {done ? (
                  <Check aria-label="already worked on" className="mt-1 h-4 w-4 shrink-0 text-action" />
                ) : null}
              </button>
            </li>
          );
        })}
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
