import {
  containsMarkupOrLatex,
  containsUnsafeMarkup,
  countProseWords,
  countQuestions,
  validateMathMarkdown,
} from "@/lib/math/validate-math";
import { isRevealPermitted, isTransitionAllowed } from "@/lib/session/machine";
import type {
  QuestionAnalysis,
  SolutionMode,
  TutorPhase,
  TutorResponse,
  TutorSessionState,
} from "@/types/tutor";

/** Section 4/5 — prose budgets, excluding displayed mathematics. */
export const WORD_BUDGETS: Record<TutorPhase, number> = {
  capture: 60,
  confirm: 60,
  orient: 110,
  attempt: 90,
  coach: 90,
  walkthrough: 120,
  reflect: 80,
  transfer: 90,
  complete: 60,
};

export type ViolationSeverity = "reject" | "repair_math" | "soft";

export interface PolicyViolation {
  field: string;
  code: string;
  severity: ViolationSeverity;
}

export interface PolicyResult {
  violations: PolicyViolation[];
  mustRetry: boolean;
  mathFields: string[];
}

function summarise(violations: PolicyViolation[], mathFields: string[]): PolicyResult {
  return {
    violations,
    mustRetry: violations.some((violation) => violation.severity === "reject"),
    mathFields,
  };
}

function checkDisplayField(
  field: string,
  value: string,
  violations: PolicyViolation[],
  mathFields: string[],
): void {
  if (containsUnsafeMarkup(value)) {
    violations.push({ field, code: "unsafe_markup", severity: "reject" });
  }
  if (!validateMathMarkdown(value).ok) {
    violations.push({ field, code: "invalid_math_syntax", severity: "repair_math" });
    mathFields.push(field);
  }
}

function checkSpeechField(field: string, value: string, violations: PolicyViolation[]): void {
  if (containsMarkupOrLatex(value)) {
    violations.push({ field, code: "speech_contains_markup", severity: "reject" });
  }
}

/** Section 12.3, applied to every tutor turn before anything reaches the student. */
export function validateTutorResponse(
  response: TutorResponse,
  current: TutorSessionState,
  effectiveSolutionMode: SolutionMode,
): PolicyResult {
  const violations: PolicyViolation[] = [];
  const mathFields: string[] = [];
  const { teacher, stateUpdate } = response;

  checkDisplayField("teacher.displayMarkdown", teacher.displayMarkdown, violations, mathFields);
  checkSpeechField("teacher.speechText", teacher.speechText, violations);

  const askedQuestions = countQuestions(teacher.displayMarkdown);
  if (askedQuestions > 1 || teacher.questionCount > 1) {
    violations.push({ field: "teacher.displayMarkdown", code: "multiple_questions", severity: "reject" });
  }

  if (teacher.revealsFinalAnswer && !isRevealPermitted(effectiveSolutionMode, stateUpdate.phase)) {
    violations.push({ field: "teacher.displayMarkdown", code: "premature_reveal", severity: "reject" });
  }

  if (!isTransitionAllowed(current.phase, stateUpdate.phase)) {
    violations.push({ field: "stateUpdate.phase", code: "illegal_transition", severity: "soft" });
  }

  const budget = WORD_BUDGETS[stateUpdate.phase];
  if (countProseWords(teacher.displayMarkdown) > budget) {
    violations.push({ field: "teacher.displayMarkdown", code: "over_word_budget", severity: "soft" });
  }

  if (teacher.carryForwardCue && stateUpdate.phase !== "reflect" && stateUpdate.phase !== "transfer") {
    violations.push({ field: "teacher.carryForwardCue", code: "cue_outside_reflection", severity: "soft" });
  }

  return summarise(violations, mathFields);
}

/** The opening carries the same guarantees as any later turn. */
export function validateOpening(analysis: QuestionAnalysis): PolicyResult {
  const violations: PolicyViolation[] = [];
  const mathFields: string[] = [];
  const { opening, transcription, privatePlan } = analysis;

  checkDisplayField("transcription.displayMarkdown", transcription.displayMarkdown, violations, mathFields);
  checkDisplayField("opening.observation", opening.observation, violations, mathFields);
  checkDisplayField("opening.intuition", opening.intuition, violations, mathFields);
  checkDisplayField("opening.whyItApplies", opening.whyItApplies, violations, mathFields);
  checkDisplayField("opening.firstQuestion", opening.firstQuestion, violations, mathFields);
  checkSpeechField("opening.speechText", opening.speechText, violations);

  if (opening.formulaMarkdown) {
    checkDisplayField("opening.formulaMarkdown", opening.formulaMarkdown, violations, mathFields);
  }
  if (opening.formulaExplanation) {
    checkDisplayField("opening.formulaExplanation", opening.formulaExplanation, violations, mathFields);
  }

  if (countQuestions(opening.firstQuestion) > 1) {
    violations.push({ field: "opening.firstQuestion", code: "multiple_questions", severity: "reject" });
  }

  const openingWords = countProseWords(
    [opening.observation, opening.intuition, opening.whyItApplies, opening.firstQuestion].join(" "),
  );
  if (openingWords > WORD_BUDGETS.orient) {
    violations.push({ field: "opening", code: "over_word_budget", severity: "soft" });
  }

  if (leaksFinalAnswer(opening, privatePlan.finalAnswerMarkdown)) {
    violations.push({ field: "opening", code: "premature_reveal", severity: "reject" });
  }

  return summarise(violations, mathFields);
}

const stripForComparison = (value: string) =>
  value.toLowerCase().replace(/\s+/g, "").replace(/[$\\{}]/g, "");

/**
 * A cheap containment check. It cannot catch every paraphrase, which is exactly
 * why the reviewer pass also inspects the opening for leakage.
 */
function leaksFinalAnswer(
  opening: QuestionAnalysis["opening"],
  finalAnswerMarkdown: string,
): boolean {
  const answer = stripForComparison(finalAnswerMarkdown);
  if (answer.length < 3) {
    return false;
  }

  const openingText = stripForComparison(
    [
      opening.observation,
      opening.intuition,
      opening.whyItApplies,
      opening.firstQuestion,
      opening.formulaExplanation ?? "",
    ].join(" "),
  );

  return openingText.includes(answer);
}

export function describeViolations(violations: PolicyViolation[]): string {
  return violations.map((violation) => `${violation.field}:${violation.code}`).join(", ");
}
