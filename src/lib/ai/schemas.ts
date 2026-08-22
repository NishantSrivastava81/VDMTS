import { z } from "zod";

/**
 * Zod is the runtime boundary for every value that crosses a trust edge.
 * The hand-written JSON Schemas below are the *wire* contract sent to Azure in
 * `text.format`; Azure's strict mode forbids the string/number constraints Zod
 * applies, so the two are deliberately kept separate and reconciled by tests.
 */

// ---------------------------------------------------------------------------
// Shared enums
// ---------------------------------------------------------------------------

export const TUTOR_PHASES = [
  "capture",
  "confirm",
  "orient",
  "attempt",
  "coach",
  "walkthrough",
  "reflect",
  "transfer",
  "complete",
] as const;

export const SOLUTION_MODES = ["withheld", "guided", "fullyRequested"] as const;

export const STUDENT_INTENTS = [
  "attempt",
  "question",
  "request_hint",
  "request_solution",
  "stuck",
  "reflection",
  "off_topic",
  "unclear",
] as const;

export const ASSESSMENT_STATUSES = [
  "sound",
  "partially_sound",
  "procedural_error",
  "inefficient",
  "misconception",
  "unclear",
  "not_applicable",
] as const;

/** Section 11.4 — the model picks exactly one primary move per turn. */
export const TUTOR_MOVES = [
  "focus_clue",
  "recall_property",
  "ask_prediction",
  "check_substitution",
  "contrast_cases",
  "simplify_example",
  "name_misconception",
  "confirm_and_advance",
  "reveal_partial_setup",
  "guided_solution_step",
  "request_clarification",
  "prompt_reflection",
  "offer_transfer",
] as const;

/** Quick actions the UI is allowed to render (at most two at a time). */
export const SUGGESTED_ACTIONS = [
  "Explain another way",
  "Explain in simpler words",
  "A smaller hint",
  "Show this step",
  "Walk me through it",
  "Show the full solution",
  "I am stuck",
  "Try one related question",
  "Done for now",
] as const;

/** English, or the Hindi-English code-mixing most Indian students think in. */
export const TUTOR_LANGUAGES = ["english", "hinglish"] as const;

export const REVIEW_ISSUE_AREAS = [
  "transcription",
  "concept",
  "trigger",
  "formula",
  "explanation",
  "solution",
  "leakage",
  "first_question",
] as const;

export const phaseSchema = z.enum(TUTOR_PHASES);
export const solutionModeSchema = z.enum(SOLUTION_MODES);
export const tutorMoveSchema = z.enum(TUTOR_MOVES);
export const suggestedActionSchema = z.enum(SUGGESTED_ACTIONS);
export const tutorLanguageSchema = z.enum(TUTOR_LANGUAGES);
export const hintDepthSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);

// ---------------------------------------------------------------------------
// Session state (section 10.1)
// ---------------------------------------------------------------------------

export const tutorSessionStateSchema = z.object({
  phase: phaseSchema,
  checkpointIndex: z.number().int().min(0).max(24),
  hintDepth: hintDepthSchema,
  attemptsAtCheckpoint: z.number().int().min(0).max(50),
  solutionMode: solutionModeSchema,
  conceptCueRecognised: z.boolean(),
  demonstratedIdeas: z.array(z.string().max(160)).max(24),
  activeMisconceptions: z.array(z.string().max(160)).max(24),
  maxHelpUsed: z.number().int().min(0).max(4),
});

// ---------------------------------------------------------------------------
// Question analysis (section 12.1)
// ---------------------------------------------------------------------------

const ambiguitySchema = z.object({
  about: z.string().min(1).max(160),
  question: z.string().min(1).max(240),
});

/** One candidate question found in the image, for the student to choose between. */
export const detectedQuestionSchema = z.object({
  label: z.string().max(16),
  previewText: z.string().min(1).max(240),
  isComplete: z.boolean(),
});

export type DetectedQuestion = z.infer<typeof detectedQuestionSchema>;

/** What the student picked, sent back so the second pass plans the right one. */
export const questionSelectionSchema = z.object({
  label: z.string().max(16),
  previewText: z.string().min(1).max(240),
});

/**
 * Azure strict mode requires every property, so an image that is rejected or
 * still awaiting a choice returns the teaching fields as empty strings.
 * Emptiness is therefore allowed here and required below only when the question
 * is actually tutorable — otherwise a correct refusal would look malformed.
 */
const questionAnalysisBaseSchema = z.object({
  isMathematicsQuestion: z.boolean(),
  containsMultipleQuestions: z.boolean(),
  detectedQuestions: z.array(detectedQuestionSchema).max(12),
  rejectionReason: z.string().max(240).nullable(),
  transcription: z.object({
    displayMarkdown: z.string().max(3000),
    diagramDescription: z.string().max(1200).nullable(),
    confidence: z.number().min(0).max(1),
    ambiguities: z.array(ambiguitySchema).max(5),
  }),
  classification: z.object({
    chapter: z.string().max(120),
    primaryConceptId: z.string().max(120),
    primaryConceptName: z.string().max(120),
    /** Non-null when the model recognises this as a concept the student already has. */
    matchesKnownConceptId: z.string().max(120).nullable(),
    prerequisiteConceptIds: z.array(z.string().max(120)).max(6),
  }),
  opening: z.object({
    observation: z.string().max(400),
    intuition: z.string().max(600),
    formulaMarkdown: z.string().max(400).nullable(),
    formulaExplanation: z.string().max(600).nullable(),
    whyItApplies: z.string().max(600),
    firstQuestion: z.string().max(320),
    speechText: z.string().max(1600),
  }),
  privatePlan: z.object({
    finalAnswerMarkdown: z.string().max(600),
    checkpoints: z.array(z.string().max(400)).max(8),
    likelyMisconceptions: z.array(z.string().max(240)).max(6),
    transferCue: z.string().max(320),
    transferQuestionMarkdown: z.string().max(800),
  }),
  needsConfirmation: z.boolean(),
});

/** Fields a usable teaching plan cannot leave blank. */
const REQUIRED_WHEN_TUTORABLE = [
  ["transcription", "displayMarkdown"],
  ["classification", "chapter"],
  ["classification", "primaryConceptId"],
  ["classification", "primaryConceptName"],
  ["opening", "observation"],
  ["opening", "intuition"],
  ["opening", "whyItApplies"],
  ["opening", "firstQuestion"],
  ["opening", "speechText"],
  ["privatePlan", "finalAnswerMarkdown"],
  ["privatePlan", "transferCue"],
  ["privatePlan", "transferQuestionMarkdown"],
] as const;

export const questionAnalysisSchema = questionAnalysisBaseSchema.superRefine((value, ctx) => {
  if (!value.isMathematicsQuestion) {
    if (!value.rejectionReason) {
      ctx.addIssue({
        code: "custom",
        path: ["rejectionReason"],
        message: "A rejected image must say why.",
      });
    }
    return;
  }

  // A pending choice is a valid outcome: the plan is built only after picking.
  if (value.containsMultipleQuestions) {
    if (value.detectedQuestions.filter((question) => question.isComplete).length < 2) {
      ctx.addIssue({
        code: "custom",
        path: ["detectedQuestions"],
        message: "Several questions were reported but fewer than two were listed.",
      });
    }
    return;
  }

  for (const path of REQUIRED_WHEN_TUTORABLE) {
    const section = value[path[0]] as Record<string, unknown>;
    if (typeof section[path[1]] === "string" && (section[path[1]] as string).trim() === "") {
      ctx.addIssue({ code: "custom", path: [...path], message: "Required for a teachable plan." });
    }
  }

  if (value.privatePlan.checkpoints.length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["privatePlan", "checkpoints"],
      message: "A teachable plan needs at least one checkpoint.",
    });
  }
});

export type QuestionAnalysis = z.infer<typeof questionAnalysisSchema>;

/** The unrefined shape, for reusing individual sections elsewhere. */
export const questionAnalysisShape = questionAnalysisBaseSchema.shape;

// ---------------------------------------------------------------------------
// Independent plan review (section 11.2, pass B)
// ---------------------------------------------------------------------------

export const planReviewSchema = z.object({
  verdict: z.enum(["approved", "corrected", "rejected"]),
  issues: z
    .array(
      z.object({
        area: z.enum(REVIEW_ISSUE_AREAS),
        severity: z.enum(["minor", "major"]),
        detail: z.string().min(1).max(320),
      }),
    )
    .max(8),
  /**
   * Flat corrections rather than a nested analysis: it keeps the schema inside
   * Azure's nesting limit and makes the merge auditable field by field.
   */
  correction: z.object({
    transcriptionDisplayMarkdown: z.string().max(3000).nullable(),
    chapter: z.string().max(120).nullable(),
    primaryConceptId: z.string().max(120).nullable(),
    primaryConceptName: z.string().max(120).nullable(),
    observation: z.string().max(400).nullable(),
    intuition: z.string().max(600).nullable(),
    formulaMarkdown: z.string().max(400).nullable(),
    formulaExplanation: z.string().max(600).nullable(),
    whyItApplies: z.string().max(600).nullable(),
    firstQuestion: z.string().max(320).nullable(),
    openingSpeechText: z.string().max(1600).nullable(),
    finalAnswerMarkdown: z.string().max(600).nullable(),
    checkpoints: z.array(z.string().max(400)).max(8).nullable(),
    transferCue: z.string().max(320).nullable(),
    transferQuestionMarkdown: z.string().max(800).nullable(),
  }),
  needsStudentConfirmation: z.boolean(),
  rejectionReason: z.string().max(240).nullable(),
});

export type PlanReview = z.infer<typeof planReviewSchema>;

// ---------------------------------------------------------------------------
// Tutor turn (section 12.2)
// ---------------------------------------------------------------------------

export const tutorResponseSchema = z.object({
  assessment: z.object({
    intent: z.enum(STUDENT_INTENTS),
    status: z.enum(ASSESSMENT_STATUSES),
    evidence: z.string().min(1).max(400),
  }),
  teacher: z.object({
    move: tutorMoveSchema,
    displayMarkdown: z.string().min(1).max(1600),
    speechText: z.string().min(1).max(1600),
    carryForwardCue: z.string().max(240).nullable(),
    revealsFinalAnswer: z.boolean(),
    questionCount: z.number().int().min(0).max(3),
  }),
  suggestedActions: z.array(suggestedActionSchema).max(2),
  stateUpdate: z.object({
    phase: phaseSchema,
    checkpointIndex: z.number().int().min(0).max(24),
    hintDepth: hintDepthSchema,
    attemptsAtCheckpoint: z.number().int().min(0).max(50),
    conceptCueRecognised: z.boolean(),
    demonstratedIdeasToAdd: z.array(z.string().max(160)).max(4),
    misconceptionsToAdd: z.array(z.string().max(160)).max(4),
  }),
});

export type TutorResponse = z.infer<typeof tutorResponseSchema>;

// ---------------------------------------------------------------------------
// Constrained maths repair (section 13.3, single retry)
// ---------------------------------------------------------------------------

export const mathRepairSchema = z.object({
  repairedMarkdown: z.string().min(1).max(1600),
  changeSummary: z.string().min(1).max(240),
});

// ---------------------------------------------------------------------------
// On-device learning memory (section 17)
// ---------------------------------------------------------------------------

export const conceptLearningRecordSchema = z.object({
  conceptId: z.string().min(1).max(120),
  conceptName: z.string().min(1).max(120),
  triggerCue: z.string().min(1).max(320),
  maxHintDepth: z.number().int().min(0).max(4),
  reflectionQuality: z.enum(["unclear", "partial", "clear"]),
  transferOutcome: z.enum(["notTried", "neededHelp", "independent"]),
  lastSeenAt: z.string().min(1).max(40),
});

export type ConceptLearningRecord = z.infer<typeof conceptLearningRecordSchema>;

/** The compact concept vocabulary this student has built up, sent for matching. */
export const conceptSummarySchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  lastHintDepth: z.number().int().min(0).max(4),
});

export const conceptSummaryListSchema = z.array(conceptSummarySchema).max(50);

// ---------------------------------------------------------------------------
// API request contracts
// ---------------------------------------------------------------------------

export const sessionIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,64}$/, "sessionId must be an opaque url-safe id");

export const conversationTurnSchema = z.object({
  role: z.enum(["student", "tutor"]),
  text: z.string().min(1).max(2000),
});

export const tutorRequestSchema = z.object({
  sessionId: sessionIdSchema,
  question: z.object({
    displayMarkdown: z.string().min(1).max(3000),
    diagramDescription: z.string().max(1200).nullable(),
    chapter: z.string().min(1).max(120),
    primaryConceptId: z.string().min(1).max(120),
    primaryConceptName: z.string().min(1).max(120),
  }),
  privatePlan: questionAnalysisBaseSchema.shape.privatePlan,
  state: tutorSessionStateSchema,
  recentTurns: z.array(conversationTurnSchema).max(12),
  learningNotes: conceptLearningRecordSchema.nullable(),
  studentMessage: z.string().min(1).max(2000),
  inputMode: z.enum(["text", "voice", "action"]),
  language: tutorLanguageSchema.default("english"),
});

export type TutorRequest = z.infer<typeof tutorRequestSchema>;

export const accessRequestSchema = z.object({
  accessCode: z.string().min(1).max(200),
});

// ---------------------------------------------------------------------------
// Azure strict JSON Schemas
// ---------------------------------------------------------------------------

type JsonSchema = Record<string, unknown>;

const str = (description?: string): JsonSchema =>
  description ? { type: "string", description } : { type: "string" };

const nullableStr = (description?: string): JsonSchema => ({
  anyOf: [{ type: "string" }, { type: "null" }],
  ...(description ? { description } : {}),
});

const bool = (description?: string): JsonSchema =>
  description ? { type: "boolean", description } : { type: "boolean" };

const num = (description?: string): JsonSchema =>
  description ? { type: "number", description } : { type: "number" };

const int = (description?: string): JsonSchema =>
  description ? { type: "integer", description } : { type: "integer" };

const arrayOf = (items: JsonSchema, description?: string): JsonSchema => ({
  type: "array",
  items,
  ...(description ? { description } : {}),
});

const nullableArrayOfStr = (description?: string): JsonSchema => ({
  anyOf: [{ type: "array", items: { type: "string" } }, { type: "null" }],
  ...(description ? { description } : {}),
});

const enumOf = (values: readonly string[], description?: string): JsonSchema => ({
  type: "string",
  enum: [...values],
  ...(description ? { description } : {}),
});

/** Azure strict mode: every property required, no extra properties. */
const obj = (properties: Record<string, JsonSchema>): JsonSchema => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const questionAnalysisJsonSchema = obj({
  isMathematicsQuestion: bool("False for any image that is not JEE Mathematics."),
  containsMultipleQuestions: bool(
    "True only when the image holds two or more complete, separate questions.",
  ),
  detectedQuestions: arrayOf(
    obj({
      label: str("The printed question number, e.g. 132. Empty string when unnumbered."),
      previewText: str("The opening of the question, enough for the student to recognise it."),
      isComplete: bool("False for a partly cropped question from an adjacent column or page."),
    }),
    "Every question visible in the image. Empty when only one question is present.",
  ),
  rejectionReason: nullableStr("One short sentence, only when the image cannot be tutored."),
  transcription: obj({
    displayMarkdown: str("Exact question text. Inline maths in $...$, display maths in $$...$$."),
    diagramDescription: nullableStr("Plain description of any figure, else null."),
    confidence: num("0 to 1 confidence in the transcription."),
    ambiguities: arrayOf(
      obj({
        about: str("Which symbol, exponent, limit, option or label is uncertain."),
        question: str("One precise question asking the student to confirm it."),
      }),
      "Empty when nothing is uncertain. Never invent missing notation.",
    ),
  }),
  classification: obj({
    chapter: str(),
    primaryConceptId: str(
      "Stable lowercase dotted id you choose, e.g. algebra.quadratic.repeated-root.",
    ),
    primaryConceptName: str("More specific than the chapter name."),
    matchesKnownConceptId: nullableStr(
      "An id copied exactly from the student's known concepts when this is the same idea, else null.",
    ),
    prerequisiteConceptIds: arrayOf(str()),
  }),
  opening: obj({
    observation: str("The one visible trigger clue in this question."),
    intuition: str("Two or three plain sentences of intuition."),
    formulaMarkdown: nullableStr("One immediately useful formula, or null."),
    formulaExplanation: nullableStr("What each symbol means, or null."),
    whyItApplies: str("Why the concept applies, without substituting or solving."),
    firstQuestion: str("One manageable question answerable in a single step."),
    speechText: str("Plain spoken English of the opening. No Markdown and no LaTeX."),
  }),
  privatePlan: obj({
    finalAnswerMarkdown: str("Never shown automatically."),
    checkpoints: arrayOf(str(), "Ordered reasoning checkpoints, smallest useful steps."),
    likelyMisconceptions: arrayOf(str()),
    transferCue: str("One line the student should carry to the next question."),
    transferQuestionMarkdown: str("A surface-different question using the same concept."),
  }),
  needsConfirmation: bool("True when the student must confirm the transcription first."),
});

export const planReviewJsonSchema = obj({
  verdict: enumOf(["approved", "corrected", "rejected"]),
  issues: arrayOf(
    obj({
      area: enumOf(REVIEW_ISSUE_AREAS),
      severity: enumOf(["minor", "major"]),
      detail: str(),
    }),
  ),
  correction: obj({
    transcriptionDisplayMarkdown: nullableStr("Null when the field needs no change."),
    chapter: nullableStr(),
    primaryConceptId: nullableStr(),
    primaryConceptName: nullableStr(),
    observation: nullableStr(),
    intuition: nullableStr(),
    formulaMarkdown: nullableStr(),
    formulaExplanation: nullableStr(),
    whyItApplies: nullableStr(),
    firstQuestion: nullableStr(),
    openingSpeechText: nullableStr(),
    finalAnswerMarkdown: nullableStr(),
    checkpoints: nullableArrayOfStr(),
    transferCue: nullableStr(),
    transferQuestionMarkdown: nullableStr(),
  }),
  needsStudentConfirmation: bool(),
  rejectionReason: nullableStr(),
});

export const tutorResponseJsonSchema = obj({
  assessment: obj({
    intent: enumOf(STUDENT_INTENTS),
    status: enumOf(ASSESSMENT_STATUSES),
    evidence: str("What in the student's own words led to this assessment."),
  }),
  teacher: obj({
    move: enumOf(TUTOR_MOVES, "Exactly one primary teaching move."),
    displayMarkdown: str("The reply. Inline maths in $...$, display maths in $$...$$."),
    speechText: str("The same reply as plain spoken English. No Markdown and no LaTeX."),
    carryForwardCue: nullableStr("Only during reflection, else null."),
    revealsFinalAnswer: bool(),
    questionCount: int("Number of substantive questions asked. Keep this at most 1."),
  }),
  suggestedActions: arrayOf(enumOf(SUGGESTED_ACTIONS), "At most two."),
  stateUpdate: obj({
    phase: enumOf(TUTOR_PHASES),
    checkpointIndex: int(),
    hintDepth: int("0 to 4."),
    attemptsAtCheckpoint: int(),
    conceptCueRecognised: bool(),
    demonstratedIdeasToAdd: arrayOf(str()),
    misconceptionsToAdd: arrayOf(str()),
  }),
});

export const mathRepairJsonSchema = obj({
  repairedMarkdown: str("The same content with only the LaTeX syntax corrected."),
  changeSummary: str("One short sentence describing the syntax fix."),
});
