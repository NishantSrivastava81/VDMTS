import type { QuestionAnalysis, TutorResponse, TutorSessionState } from "@/types/tutor";

export function makeState(overrides: Partial<TutorSessionState> = {}): TutorSessionState {
  return {
    phase: "attempt",
    checkpointIndex: 0,
    hintDepth: 0,
    attemptsAtCheckpoint: 0,
    solutionMode: "withheld",
    conceptCueRecognised: false,
    demonstratedIdeas: [],
    activeMisconceptions: [],
    maxHelpUsed: 0,
    ...overrides,
  };
}

export function makeTutorResponse(overrides: {
  assessment?: Partial<TutorResponse["assessment"]>;
  teacher?: Partial<TutorResponse["teacher"]>;
  stateUpdate?: Partial<TutorResponse["stateUpdate"]>;
  suggestedActions?: TutorResponse["suggestedActions"];
} = {}): TutorResponse {
  return {
    assessment: {
      intent: "attempt",
      status: "procedural_error",
      evidence: "The student dropped the minus sign.",
      ...overrides.assessment,
    },
    teacher: {
      move: "check_substitution",
      displayMarkdown: "Check the sign of the middle term. What does $D=0$ become?",
      speechText: "Check the sign of the middle term. What does the discriminant become?",
      carryForwardCue: null,
      revealsFinalAnswer: false,
      questionCount: 1,
      ...overrides.teacher,
    },
    suggestedActions: overrides.suggestedActions ?? [],
    stateUpdate: {
      phase: "coach",
      checkpointIndex: 0,
      hintDepth: 1,
      attemptsAtCheckpoint: 1,
      conceptCueRecognised: false,
      demonstratedIdeasToAdd: [],
      misconceptionsToAdd: [],
      ...overrides.stateUpdate,
    },
  };
}

export function makeAnalysis(overrides: Partial<QuestionAnalysis> = {}): QuestionAnalysis {
  return {
    isMathematicsQuestion: true,
    containsMultipleQuestions: false,
    detectedQuestions: [],
    rejectionReason: null,
    transcription: {
      displayMarkdown: "If $x^2-(k+2)x+2k=0$ has exactly one real root, find $k$.",
      diagramDescription: null,
      confidence: 0.98,
      ambiguities: [],
    },
    classification: {
      chapter: "Quadratic Equations",
      primaryConceptId: "algebra.quadratic.repeated-root",
      primaryConceptName: "Repeated-root condition",
      matchesKnownConceptId: null,
      prerequisiteConceptIds: [],
    },
    opening: {
      observation: "The phrase exactly one real root is the clue.",
      intuition: "The parabola touches the axis instead of crossing it.",
      formulaMarkdown: "$$D=b^2-4ac=0$$",
      formulaExplanation: "Here $a$, $b$ and $c$ are the coefficients.",
      whyItApplies: "One real root means the two roots coincide.",
      firstQuestion: "Which expressions are $a$, $b$ and $c$?",
      speechText: "The phrase exactly one real root is the clue. Which expressions are a, b and c?",
    },
    privatePlan: {
      finalAnswerMarkdown: "$k=2$",
      checkpoints: ["Identify the coefficients.", "Impose D=0.", "Simplify."],
      likelyMisconceptions: ["Dropping the minus sign."],
      transferCue: "One repeated real root activates D=0.",
      transferQuestionMarkdown: "For which $m$ does $y=mx+1$ touch $y^2=8x$?",
    },
    needsConfirmation: false,
    ...overrides,
  };
}
