import "server-only";
import { ModelError, runStructuredResponse, type ImageInput } from "@/lib/ai/azure-client";
import {
  describeViolations,
  validateOpening,
  validateTutorResponse,
  type PolicyViolation,
} from "@/lib/ai/policy";
import {
  MATH_REPAIR_INSTRUCTIONS,
  buildAnalysisInput,
  buildPlanReviewInstructions,
  buildQuestionAnalysisInstructions,
  buildRepairInput,
  buildReviewInput,
  buildTutorInput,
  buildTutorInstructions,
} from "@/lib/ai/prompts";
import {
  mathRepairJsonSchema,
  mathRepairSchema,
  planReviewJsonSchema,
  planReviewSchema,
  questionAnalysisJsonSchema,
  questionAnalysisSchema,
  tutorResponseJsonSchema,
  tutorResponseSchema,
} from "@/lib/ai/schemas";
import { isWellFormedConceptId, type ConceptSummary } from "@/lib/concepts/registry";
import { validateMathMarkdown } from "@/lib/math/validate-math";
import { applyTutorUpdate, createInitialState, deriveSolutionMode, isTransitionAllowed } from "@/lib/session/machine";
import { diagnostic } from "@/lib/server/diagnostics";
import { serverEnv } from "@/lib/server/env";
import type {
  AnalyzeResponse,
  ModelUsage,
  PlanReview,
  QuestionAnalysis,
  QuestionSelection,
  TutorLanguage,
  TutorRequestPayload,
  TutorSessionState,
  TutorTurnResult,
} from "@/types/tutor";

export class TutoringError extends Error {
  constructor(
    message: string,
    readonly code: "not_mathematics" | "unusable_plan",
  ) {
    super(message);
    this.name = "TutoringError";
  }
}

/** Pass A then an independent pass B, as described in section 11.2. */
export async function analyseQuestion(
  image: ImageInput,
  knownConcepts: readonly ConceptSummary[],
  selection: QuestionSelection | null = null,
  language: TutorLanguage = "english",
): Promise<AnalyzeResponse> {
  const usage: ModelUsage[] = [];

  const analysisCall = await runStructuredResponse({
    operation: selection ? "question_analysis_selected" : "question_analysis",
    instructions: buildQuestionAnalysisInstructions(language),
    input: buildAnalysisInput(knownConcepts, selection),
    image,
    schemaName: "jee_question_analysis",
    jsonSchema: questionAnalysisJsonSchema,
    zodSchema: questionAnalysisSchema,
    effort: serverEnv().AZURE_OPENAI_EFFORT_ANALYSIS,
  });
  usage.push(analysisCall.usage);

  const candidate = analysisCall.data;

  if (!candidate.isMathematicsQuestion) {
    throw new TutoringError(
      candidate.rejectionReason ?? "Not a JEE Mathematics question",
      "not_mathematics",
    );
  }

  // Stop before the review pass: planning is expensive and the student has not
  // yet said which question they mean.
  if (candidate.containsMultipleQuestions) {
    const questions = candidate.detectedQuestions.filter((question) => question.isComplete);
    diagnostic("info", "question_choice_offered", { count: questions.length });
    return { kind: "choice", questions, usage };
  }

  const reviewCall = await runStructuredResponse({
    operation: "plan_review",
    instructions: buildPlanReviewInstructions(language),
    input: buildReviewInput(candidate),
    image,
    schemaName: "jee_plan_review",
    jsonSchema: planReviewJsonSchema,
    zodSchema: planReviewSchema,
    effort: serverEnv().AZURE_OPENAI_EFFORT_REVIEW,
  });
  usage.push(reviewCall.usage);

  const review = reviewCall.data;
  if (review.verdict === "rejected") {
    throw new TutoringError(review.rejectionReason ?? "Plan rejected on review", "unusable_plan");
  }

  let analysis = mergeReview(candidate, review);
  analysis = adoptConceptIdentity(analysis, knownConcepts);

  const policy = validateOpening(analysis);
  if (policy.violations.length > 0) {
    diagnostic("warn", "opening_policy_violations", {
      detail: describeViolations(policy.violations),
    });
  }

  if (policy.mathFields.length > 0) {
    analysis = await repairAnalysisMath(analysis, policy.violations, usage);
  }

  // Section 19.4: when the two passes disagree materially, ask before teaching.
  const majorIssue = review.issues.some((issue) => issue.severity === "major");
  const needsConfirmation =
    analysis.needsConfirmation ||
    review.needsStudentConfirmation ||
    majorIssue ||
    analysis.transcription.confidence < 0.85 ||
    analysis.transcription.ambiguities.length > 0;

  const confirmed: QuestionAnalysis = { ...analysis, needsConfirmation };

  return {
    kind: "analysis",
    analysis: confirmed,
    reviewVerdict: review.verdict,
    initialState: createInitialState(confirmed),
    usage,
  };
}

/** Applies only the fields the reviewer actually corrected. */
function mergeReview(analysis: QuestionAnalysis, review: PlanReview): QuestionAnalysis {
  if (review.verdict === "approved") {
    return analysis;
  }

  const c = review.correction;
  return {
    ...analysis,
    transcription: {
      ...analysis.transcription,
      displayMarkdown: c.transcriptionDisplayMarkdown ?? analysis.transcription.displayMarkdown,
    },
    classification: {
      ...analysis.classification,
      chapter: c.chapter ?? analysis.classification.chapter,
      primaryConceptId: c.primaryConceptId ?? analysis.classification.primaryConceptId,
      primaryConceptName: c.primaryConceptName ?? analysis.classification.primaryConceptName,
    },
    opening: {
      ...analysis.opening,
      observation: c.observation ?? analysis.opening.observation,
      intuition: c.intuition ?? analysis.opening.intuition,
      formulaMarkdown: c.formulaMarkdown ?? analysis.opening.formulaMarkdown,
      formulaExplanation: c.formulaExplanation ?? analysis.opening.formulaExplanation,
      whyItApplies: c.whyItApplies ?? analysis.opening.whyItApplies,
      firstQuestion: c.firstQuestion ?? analysis.opening.firstQuestion,
      speechText: c.openingSpeechText ?? analysis.opening.speechText,
    },
    privatePlan: {
      ...analysis.privatePlan,
      finalAnswerMarkdown: c.finalAnswerMarkdown ?? analysis.privatePlan.finalAnswerMarkdown,
      checkpoints:
        c.checkpoints && c.checkpoints.length > 0
          ? c.checkpoints
          : analysis.privatePlan.checkpoints,
      transferCue: c.transferCue ?? analysis.privatePlan.transferCue,
      transferQuestionMarkdown:
        c.transferQuestionMarkdown ?? analysis.privatePlan.transferQuestionMarkdown,
    },
  };
}

/**
 * The model decides whether this is a concept the student already has. The app
 * only checks that the claimed id is one we actually sent and is well formed —
 * it never renames the concept the model reasoned its way to.
 */
function adoptConceptIdentity(
  analysis: QuestionAnalysis,
  knownConcepts: readonly ConceptSummary[],
): QuestionAnalysis {
  const claimed = analysis.classification.matchesKnownConceptId;
  const matched = claimed ? knownConcepts.find((concept) => concept.id === claimed) : undefined;

  if (matched) {
    return {
      ...analysis,
      classification: {
        ...analysis.classification,
        primaryConceptId: matched.id,
        primaryConceptName: matched.name,
      },
    };
  }

  if (claimed) {
    diagnostic("warn", "concept_match_unknown_id", {});
  }

  if (!isWellFormedConceptId(analysis.classification.primaryConceptId)) {
    diagnostic("warn", "concept_id_malformed", {});
    return {
      ...analysis,
      classification: {
        ...analysis.classification,
        primaryConceptId: slugifyConceptId(analysis.classification),
      },
    };
  }

  return analysis;
}

function slugifyConceptId(classification: QuestionAnalysis["classification"]): string {
  const slug = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "concept";

  return `${slug(classification.chapter)}.${slug(classification.primaryConceptName)}`;
}

/**
 * A tapped button is an unambiguous request, so it takes effect on this turn
 * rather than the next one. Typed phrasing stays ambiguous and still escalates
 * gradually through the state machine.
 */
function escalateForExplicitRequest(payload: TutorRequestPayload): TutorSessionState {
  if (payload.inputMode !== "action") {
    return payload.state;
  }

  const requested =
    payload.studentMessage === "Show the full solution"
      ? "fullyRequested"
      : payload.studentMessage === "Walk me through it"
        ? "guided"
        : null;

  if (!requested || payload.state.solutionMode === "fullyRequested") {
    return payload.state;
  }

  const phase = isTransitionAllowed(payload.state.phase, "walkthrough")
    ? "walkthrough"
    : payload.state.phase;

  return { ...payload.state, solutionMode: requested, phase };
}

export async function respondToStudent(payload: TutorRequestPayload): Promise<TutorTurnResult> {
  const state = escalateForExplicitRequest(payload);
  const instructions = buildTutorInstructions(state, payload.language);
  const input = buildTutorInput({
    question: {
      displayMarkdown: payload.question.displayMarkdown,
      diagramDescription: payload.question.diagramDescription,
      chapter: payload.question.chapter,
      conceptName: payload.question.primaryConceptName,
    },
    privatePlan: payload.privatePlan,
    state,
    recentTurns: payload.recentTurns,
    learningNotes: payload.learningNotes,
    studentMessage: payload.studentMessage,
    inputMode: payload.inputMode,
  });

  const usage: ModelUsage[] = [];
  let attempt = 0;
  let corrective = "";

  while (attempt < 2) {
    const call = await runStructuredResponse({
      operation: attempt === 0 ? "tutor_turn" : "tutor_turn_repair",
      instructions: corrective ? `${instructions}\n\n${corrective}` : instructions,
      input,
      schemaName: "tutor_response",
      jsonSchema: tutorResponseJsonSchema,
      zodSchema: tutorResponseSchema,
      effort: serverEnv().AZURE_OPENAI_EFFORT_TUTOR,
    });
    usage.push(call.usage);

    const response = call.data;
    const effectiveSolutionMode = deriveSolutionMode(
      state.solutionMode,
      response.assessment.intent,
      response.teacher.move === "guided_solution_step" && state.solutionMode === "guided",
    );

    const policy = validateTutorResponse(response, state, effectiveSolutionMode);

    if (policy.mustRetry && attempt === 0) {
      diagnostic("warn", "tutor_policy_retry", { detail: describeViolations(policy.violations) });
      corrective = buildCorrectiveInstruction(policy.violations);
      attempt += 1;
      continue;
    }

    if (policy.mustRetry) {
      diagnostic("error", "tutor_policy_failed", {
        detail: describeViolations(policy.violations),
      });
      throw new ModelError("Tutor response violated policy twice", "malformed", true);
    }

    let displayMarkdown = response.teacher.displayMarkdown;
    let mathFallback = false;

    if (policy.mathFields.includes("teacher.displayMarkdown")) {
      const repaired = await repairMath("teacher.displayMarkdown", displayMarkdown, usage);
      if (repaired) {
        displayMarkdown = repaired;
      } else {
        mathFallback = true;
      }
    }

    const transition = applyTutorUpdate(state, response, payload.privatePlan.checkpoints.length);

    if (transition.corrections.length > 0) {
      diagnostic("warn", "state_corrected", { detail: transition.corrections.join(",") });
    }

    return {
      response: {
        ...response,
        teacher: { ...response.teacher, displayMarkdown },
      },
      state: transition.state,
      mathFallback,
      usage,
    };
  }

  throw new ModelError("Tutor response could not be produced", "malformed", true);
}

function buildCorrectiveInstruction(violations: PolicyViolation[]): string {
  const codes = new Set(violations.filter((v) => v.severity === "reject").map((v) => v.code));
  const notes: string[] = [];

  if (codes.has("multiple_questions")) {
    notes.push("Your previous attempt asked more than one question. Ask exactly one.");
  }
  if (codes.has("premature_reveal")) {
    notes.push(
      "Your previous attempt revealed the final answer, which the current solution policy does not allow. Reduce the step size instead.",
    );
  }
  if (codes.has("speech_contains_markup")) {
    notes.push(
      "Your previous speechText contained Markdown or LaTeX. Write it as plain spoken English.",
    );
  }
  if (codes.has("unsafe_markup")) {
    notes.push("Your previous attempt contained HTML, a link or a URL. Write plain text and maths only.");
  }

  return `Correction required. ${notes.join(" ")}`;
}

async function repairAnalysisMath(
  analysis: QuestionAnalysis,
  violations: PolicyViolation[],
  usage: ModelUsage[],
): Promise<QuestionAnalysis> {
  const fields = violations
    .filter((violation) => violation.severity === "repair_math")
    .map((violation) => violation.field);

  let next = analysis;

  for (const field of fields) {
    const value = readAnalysisField(next, field);
    if (!value) {
      continue;
    }
    const repaired = await repairMath(field, value, usage);
    if (repaired) {
      next = writeAnalysisField(next, field, repaired);
    }
  }

  return next;
}

function readAnalysisField(analysis: QuestionAnalysis, field: string): string | null {
  switch (field) {
    case "transcription.displayMarkdown":
      return analysis.transcription.displayMarkdown;
    case "opening.observation":
      return analysis.opening.observation;
    case "opening.intuition":
      return analysis.opening.intuition;
    case "opening.whyItApplies":
      return analysis.opening.whyItApplies;
    case "opening.firstQuestion":
      return analysis.opening.firstQuestion;
    case "opening.formulaMarkdown":
      return analysis.opening.formulaMarkdown;
    case "opening.formulaExplanation":
      return analysis.opening.formulaExplanation;
    default:
      return null;
  }
}

function writeAnalysisField(
  analysis: QuestionAnalysis,
  field: string,
  value: string,
): QuestionAnalysis {
  if (field === "transcription.displayMarkdown") {
    return {
      ...analysis,
      transcription: { ...analysis.transcription, displayMarkdown: value },
    };
  }

  const key = field.replace("opening.", "") as keyof QuestionAnalysis["opening"];
  return { ...analysis, opening: { ...analysis.opening, [key]: value } };
}

/** One constrained repair attempt; never a broad string replacement. */
async function repairMath(
  field: string,
  value: string,
  usage: ModelUsage[],
): Promise<string | null> {
  const validation = validateMathMarkdown(value);
  if (validation.ok) {
    return value;
  }

  try {
    const call = await runStructuredResponse({
      operation: "math_repair",
      instructions: MATH_REPAIR_INSTRUCTIONS,
      input: buildRepairInput(
        field,
        value,
        validation.errors.map((error) => error.reason),
      ),
      schemaName: "math_repair",
      jsonSchema: mathRepairJsonSchema,
      zodSchema: mathRepairSchema,
      maxOutputTokens: 8000,
      // Fixing a delimiter is not a reasoning task.
      effort: "low",
    });
    usage.push(call.usage);

    if (validateMathMarkdown(call.data.repairedMarkdown).ok) {
      return call.data.repairedMarkdown;
    }
  } catch {
    // Fall through to the escaped plain-text fallback.
  }

  diagnostic("warn", "math_repair_failed", { field });
  return null;
}
