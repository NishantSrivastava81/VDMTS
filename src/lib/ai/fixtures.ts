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
const SOLVED = /k\s*=\s*2/i;
const WANTS_TRANSFER = /related question/i;
const WANTS_STRUCTURE = /fit together/i;

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
  const phase = payload.state.phase;

  if (WANTS_STRUCTURE.test(message)) {
    return {
      assessment: {
        intent: "question",
        status: "not_applicable",
        evidence: "The student can follow each step but not the whole argument.",
      },
      teacher: {
        move: "connect_steps",
        displayMarkdown:
          "The shape is three moves. First, turn the wording into a condition: “one real root” becomes $D=0$. Second, put that condition in terms of the unknown, by writing $D$ from the coefficients. Third, solve that condition for $k$. Each move exists to make the next one possible. Say those three back to me in your own words.",
        speechText:
          "The shape is three moves. First, turn the wording into a condition: one real root becomes the discriminant equals zero. Second, put that condition in terms of the unknown, by writing the discriminant from the coefficients. Third, solve that condition for k. Each move exists to make the next one possible. Say those three back to me in your own words.",
        carryForwardCue: null,
        revealsFinalAnswer: false,
        questionCount: 1,
      },
      suggestedActions: ["Explain in simpler words"],
      stateUpdate: {
        phase: phase === "orient" ? "coach" : phase,
        checkpointIndex: payload.state.checkpointIndex,
        hintDepth: payload.state.hintDepth,
        attemptsAtCheckpoint: payload.state.attemptsAtCheckpoint,
        conceptCueRecognised: payload.state.conceptCueRecognised,
        demonstratedIdeasToAdd: [],
        misconceptionsToAdd: [],
      },
    };
  }

  if (WANTS_TRANSFER.test(message)) {
    return {
      assessment: {
        intent: "request_hint",
        status: "not_applicable",
        evidence: "The student asked for a related question.",
      },
      teacher: {
        move: "offer_transfer",
        displayMarkdown:
          "Try this one: for which $m$ does $y^2+(m-1)y+4=0$ have exactly one real root? Use the same cue and set its discriminant to zero. What equation in $m$ do you get?",
        speechText:
          "Try this one. For which m does y squared plus m minus one, y, plus four equal zero have exactly one real root? Use the same cue and set its discriminant to zero. What equation in m do you get?",
        carryForwardCue: null,
        revealsFinalAnswer: false,
        questionCount: 1,
      },
      suggestedActions: ["A smaller hint"],
      stateUpdate: {
        phase: "transfer",
        checkpointIndex: payload.state.checkpointIndex,
        hintDepth: payload.state.hintDepth,
        attemptsAtCheckpoint: 0,
        conceptCueRecognised: true,
        demonstratedIdeasToAdd: [],
        misconceptionsToAdd: [],
      },
    };
  }

  if (phase === "transfer") {
    return {
      assessment: {
        intent: "attempt",
        status: "sound",
        evidence: "The student applied the same condition to a new equation.",
      },
      teacher: {
        move: "confirm_and_advance",
        displayMarkdown:
          "That is the same move as before, on a question that looks nothing like the first one. The cue carried across.",
        speechText:
          "That is the same move as before, on a question that looks nothing like the first one. The cue carried across.",
        carryForwardCue: null,
        revealsFinalAnswer: false,
        questionCount: 0,
      },
      suggestedActions: ["Done for now"],
      stateUpdate: {
        phase: "transfer",
        checkpointIndex: payload.state.checkpointIndex,
        hintDepth: payload.state.hintDepth,
        attemptsAtCheckpoint: payload.state.attemptsAtCheckpoint + 1,
        conceptCueRecognised: true,
        demonstratedIdeasToAdd: [],
        misconceptionsToAdd: [],
      },
    };
  }

  if (phase === "reflect") {
    return {
      assessment: {
        intent: "reflection",
        status: "sound",
        evidence: "The student named the trigger in their own words.",
      },
      teacher: {
        move: "prompt_reflection",
        displayMarkdown: "That is exactly the cue to keep.",
        speechText: "That is exactly the cue to keep.",
        carryForwardCue: "One real root means the roots coincide, so test $D=0$ before solving.",
        revealsFinalAnswer: false,
        questionCount: 0,
      },
      suggestedActions: ["Try one related question", "Done for now"],
      stateUpdate: {
        phase: "reflect",
        checkpointIndex: payload.state.checkpointIndex,
        hintDepth: payload.state.hintDepth,
        attemptsAtCheckpoint: payload.state.attemptsAtCheckpoint,
        conceptCueRecognised: true,
        demonstratedIdeasToAdd: [],
        misconceptionsToAdd: [],
      },
    };
  }

  if (SOLVED.test(message)) {
    return {
      assessment: {
        intent: "attempt",
        status: "sound",
        evidence: "The student reached the repeated-root value.",
      },
      teacher: {
        move: "prompt_reflection",
        displayMarkdown: "That is it. What clue in this question told you to use the discriminant?",
        speechText:
          "That is it. What clue in this question told you to use the discriminant?",
        carryForwardCue: null,
        revealsFinalAnswer: false,
        questionCount: 1,
      },
      suggestedActions: [],
      stateUpdate: {
        phase: "reflect",
        checkpointIndex: payload.privatePlan.checkpoints.length - 1,
        hintDepth: payload.state.hintDepth,
        attemptsAtCheckpoint: 0,
        conceptCueRecognised: false,
        demonstratedIdeasToAdd: ["Solved the repeated-root condition"],
        misconceptionsToAdd: [],
      },
    };
  }

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
          "Here is the whole thing. Comparing with $ax^2+bx+c=0$ gives $a=1$, $b=-(k+2)$ and $c=2k$. Exactly one real root means a repeated root, so\n\n$$[-(k+2)]^2-4(1)(2k)=0$$\n\n$$(k+2)^2-8k=0$$\n\n$$k^2-4k+4=0$$\n\n$$(k-2)^2=0$$\n\nso $k=2$. Check: $x^2-4x+4=(x-2)^2$, which touches the axis once.",
        speechText:
          "Here is the whole thing. Comparing with the standard form gives a equals one, b equals minus k plus two, and c equals two k. Exactly one real root means a repeated root, so the discriminant is zero. That simplifies to k minus two, all squared, equals zero, so k equals two.",
        carryForwardCue: null,
        revealsFinalAnswer: true,
        questionCount: 0,
      },
      suggestedActions: ["Done for now"],
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
