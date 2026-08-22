"use client";

import { MathContent } from "@/components/math-content";
import { SpeakButton } from "@/components/speak-button";
import type { QuestionOpening } from "@/types/tutor";

interface ConceptOpeningProps {
  opening: QuestionOpening;
  speechState: "idle" | "loading" | "playing";
  onSpeak: () => void;
  onStopSpeaking: () => void;
  onExplainAgain: () => void;
  canExplainAgain: boolean;
}

/**
 * Screen 7.3. Clue first, then the concept built around it, then at most one
 * formula, then one manageable question. No chapter label, no solution.
 */
export function ConceptOpening({
  opening,
  speechState,
  onSpeak,
  onStopSpeaking,
  onExplainAgain,
  canExplainAgain,
}: ConceptOpeningProps) {
  return (
    <article className="px-4 pt-5 sm:px-6" aria-label="Where to start">
      <p className="text-sm text-ink-faint">Let us spot the idea first.</p>

      <MathContent content={opening.observation} className="teacher-prose mt-3" />
      <MathContent content={opening.intuition} className="teacher-prose mt-2" />

      {opening.formulaMarkdown ? (
        <MathContent content={normaliseFormula(opening.formulaMarkdown)} className="mt-1" />
      ) : null}

      {opening.formulaExplanation ? (
        <MathContent content={opening.formulaExplanation} className="teacher-prose mt-1 text-[0.98rem]" />
      ) : null}

      <MathContent content={opening.whyItApplies} className="teacher-prose mt-3" />

      <div className="mt-3 flex items-start gap-1">
        <MathContent content={opening.firstQuestion} className="teacher-prose flex-1" />
        <SpeakButton
          state={speechState}
          onSpeak={onSpeak}
          onStop={onStopSpeaking}
          label="the opening"
        />
      </div>

      {canExplainAgain ? (
        <button
          type="button"
          onClick={onExplainAgain}
          className="mt-3 min-h-11 rounded-md border border-rule bg-surface px-4 py-2 text-sm font-medium text-ink"
        >
          Explain another way
        </button>
      ) : null}
    </article>
  );
}

/** The planner may send a bare formula; display it as its own block either way. */
function normaliseFormula(formula: string): string {
  const trimmed = formula.trim();
  if (trimmed.startsWith("$$") || trimmed.startsWith("$")) {
    return trimmed;
  }
  return `$$${trimmed}$$`;
}
