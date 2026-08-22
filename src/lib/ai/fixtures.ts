import { createInitialState } from "@/lib/session/machine";
import type {
  AnalyzeResult,
  QuestionAnalysis,
  TutorRequestPayload,
  TutorResponse,
  TutorTurnResult,
} from "@/types/tutor";
import { applyTutorUpdate } from "@/lib/session/machine";

/**
 * Phase 1 material: one fixed question and scripted replies, so the interaction,
 * layout and accessibility can be exercised without spending a paid model call.
 * Enabled only by NEXT_THOUGHT_USE_FIXTURES.
 */
const FIXTURE_ANALYSIS: QuestionAnalysis = {
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
    prerequisiteConceptIds: ["algebra.quadratic.discriminant"],
  },
  opening: {
    observation: "\u201cExactly one real root\u201d is the clue here.",
    intuition:
      "It means the parabola touches the $x$-axis at one point instead of crossing it twice, so the two roots have come together.",
    formulaMarkdown: "$$D=b^2-4ac=0$$",
    formulaExplanation: "Here $a$, $b$ and $c$ are the three coefficients of the quadratic.",
    whyItApplies: "One real root means the two roots coincide, which is exactly the $D=0$ case.",
    firstQuestion: "In this equation, which expressions are $a$, $b$ and $c$?",
    speechText:
      "Exactly one real root is the clue here. It means the parabola touches the x axis at one point instead of crossing it twice. That is the discriminant equal to zero case, where b squared minus four a c is zero. In this equation, which expressions are a, b and c?",
  },
  privatePlan: {
    finalAnswerMarkdown: "$k=2$",
    checkpoints: [
      "Identify $a=1$, $b=-(k+2)$ and $c=2k$.",
      "Impose $[-(k+2)]^2-4(1)(2k)=0$.",
      "Simplify to $(k-2)^2=0$ and interpret the repeated value.",
    ],
    likelyMisconceptions: [
      "Dropping the negative sign from $b$.",
      "Solving the quadratic in $x$ instead of imposing $D=0$.",
    ],
    transferCue: "Wording that fixes the number of real roots at one points to $D=0$.",
    transferQuestionMarkdown:
      "For which $m$ does the line $y=mx+1$ touch the parabola $y^2=8x$ at exactly one point?",
  },
  needsConfirmation: false,
};

export function fixtureAnalyze(): AnalyzeResult {
  return {
    kind: "analysis",
    analysis: FIXTURE_ANALYSIS,
    reviewVerdict: "approved",
    initialState: createInitialState(FIXTURE_ANALYSIS),
    usage: [],
  };
}

const SOLUTION_REQUEST = /(full|whole|complete)?\s*(solution|answer|walk me through|show me how)/i;
const STUCK = /(stuck|no idea|don't know|do not know|i dont know)/i;

export function fixtureTutorTurn(payload: TutorRequestPayload): TutorTurnResult {
  const message = payload.studentMessage;
  const response = scriptedResponse(message, payload);
  const transition = applyTutorUpdate(
    payload.state,
    response,
    payload.privatePlan.checkpoints.length,
  );

  return { response, state: transition.state, mathFallback: false, usage: [] };
}

function scriptedResponse(message: string, payload: TutorRequestPayload): TutorResponse {
  if (SOLUTION_REQUEST.test(message)) {
    return {
      assessment: {
        intent: "request_solution",
        status: "not_applicable",
        evidence: "The student asked to see the solution.",
      },
      teacher: {
        move: "guided_solution_step",
        displayMarkdown:
          "I will walk through it with you. \u201cOne real root\u201d gives $D=0$, so for this equation that is\n\n$$[-(k+2)]^2-4(1)(2k)=0$$\n\nNotice why the brackets matter: the whole coefficient $b$ is squared. Simplify the left side and send me what you get.",
        speechText:
          "I will walk through it with you. One real root gives the discriminant equal to zero, so for this equation that is minus k plus two, all squared, minus four times one times two k, equals zero. Notice why the brackets matter: the whole coefficient b is squared. Simplify the left side and send me what you get.",
        carryForwardCue: null,
        revealsFinalAnswer: false,
        questionCount: 0,
      },
      suggestedActions: ["Show this step"],
      stateUpdate: {
        phase: "walkthrough",
        checkpointIndex: Math.min(1, payload.privatePlan.checkpoints.length - 1),
        hintDepth: 4,
        attemptsAtCheckpoint: payload.state.attemptsAtCheckpoint + 1,
        conceptCueRecognised: payload.state.conceptCueRecognised,
        demonstratedIdeasToAdd: [],
        misconceptionsToAdd: [],
      },
    };
  }

  if (STUCK.test(message)) {
    return {
      assessment: {
        intent: "stuck",
        status: "unclear",
        evidence: "The student reported being stuck without an attempt.",
      },
      teacher: {
        move: "focus_clue",
        displayMarkdown:
          "Let us slow down and read only the wording. The question fixes how many real roots the equation has. Which phrase in the question controls the number of real roots?",
        speechText:
          "Let us slow down and read only the wording. The question fixes how many real roots the equation has. Which phrase in the question controls the number of real roots?",
        carryForwardCue: null,
        revealsFinalAnswer: false,
        questionCount: 1,
      },
      suggestedActions: ["A smaller hint", "Walk me through it"],
      stateUpdate: {
        phase: "coach",
        checkpointIndex: payload.state.checkpointIndex,
        hintDepth: Math.min(4, payload.state.hintDepth + 1) as 0 | 1 | 2 | 3 | 4,
        attemptsAtCheckpoint: payload.state.attemptsAtCheckpoint + 1,
        conceptCueRecognised: payload.state.conceptCueRecognised,
        demonstratedIdeasToAdd: [],
        misconceptionsToAdd: [],
      },
    };
  }

  return {
    assessment: {
      intent: "attempt",
      status: "procedural_error",
      evidence: "The coefficients were located but the sign of the middle term was dropped.",
    },
    teacher: {
      move: "check_substitution",
      displayMarkdown:
        "Setting up the three coefficients is the right move. Check the sign of the middle term, though: it is $-(k+2)x$, so $b$ must include that minus sign. What does $D=0$ look like after that correction?",
      speechText:
        "Setting up the three coefficients is the right move. Check the sign of the middle term, though. It is minus k plus two, all multiplied by x, so b must include that minus sign. What does the discriminant equal to zero look like after that correction?",
      carryForwardCue: null,
      revealsFinalAnswer: false,
      questionCount: 1,
    },
    suggestedActions: ["A smaller hint"],
    stateUpdate: {
      phase: "coach",
      checkpointIndex: payload.state.checkpointIndex,
      hintDepth: Math.min(4, payload.state.hintDepth + 1) as 0 | 1 | 2 | 3 | 4,
      attemptsAtCheckpoint: payload.state.attemptsAtCheckpoint + 1,
      conceptCueRecognised: payload.state.conceptCueRecognised,
      demonstratedIdeasToAdd: ["Located the quadratic coefficients"],
      misconceptionsToAdd: ["Sign of the middle coefficient"],
    },
  };
}
