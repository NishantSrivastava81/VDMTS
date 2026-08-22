import type {
  ConceptLearningRecord,
  HintDepth,
  QuestionAnalysis,
  SolutionMode,
  StudentIntent,
  Subject,
  TutorPhase,
  TutorResponse,
  TutorSessionState,
} from "@/types/tutor";

/** Section 10 — the diagram, encoded. The model may not invent a transition. */
const ALLOWED_TRANSITIONS: Record<TutorPhase, readonly TutorPhase[]> = {
  capture: ["capture", "confirm"],
  confirm: ["confirm", "orient"],
  // The first student message is itself an attempt, so a question solved in one
  // step must still be able to reach reflection.
  orient: ["orient", "attempt", "coach", "walkthrough", "reflect"],
  attempt: ["attempt", "coach", "walkthrough", "reflect"],
  coach: ["coach", "attempt", "walkthrough", "reflect"],
  walkthrough: ["walkthrough", "reflect"],
  reflect: ["reflect", "transfer", "complete"],
  transfer: ["transfer", "complete"],
  complete: ["complete", "capture"],
};

const MAX_HINT_DEPTH = 4;

export function createInitialState(analysis: QuestionAnalysis): TutorSessionState {
  return {
    phase: analysis.needsConfirmation ? "confirm" : "orient",
    checkpointIndex: 0,
    hintDepth: 0,
    attemptsAtCheckpoint: 0,
    solutionMode: "withheld",
    // A remembered cue does not count as recognised again; memory only fades support.
    conceptCueRecognised: false,
    demonstratedIdeas: [],
    activeMisconceptions: [],
    maxHelpUsed: 0,
  };
}

export function isTransitionAllowed(from: TutorPhase, to: TutorPhase): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * Section 10.2 — the *server* owns solution mode. An explicit request moves to a
 * guided walkthrough at once; a second request unlocks the complete solution.
 * There is no lock and no refusal loop, so this only ever relaxes.
 */
export function deriveSolutionMode(
  current: SolutionMode,
  intent: StudentIntent,
  explicitFullRequest: boolean,
): SolutionMode {
  if (intent !== "request_solution") {
    return current;
  }
  if (current === "withheld") {
    return explicitFullRequest ? "fullyRequested" : "guided";
  }
  if (current === "guided") {
    return "fullyRequested";
  }
  return current;
}

export function isRevealPermitted(
  solutionMode: SolutionMode,
  targetPhase: TutorPhase,
): boolean {
  if (solutionMode !== "withheld") {
    return true;
  }
  return targetPhase === "reflect" || targetPhase === "transfer" || targetPhase === "complete";
}

const clampHintDepth = (value: number): HintDepth => {
  const bounded = Math.min(MAX_HINT_DEPTH, Math.max(0, Math.round(value)));
  return bounded as HintDepth;
};

export interface StateTransitionResult {
  state: TutorSessionState;
  /** Non-content notes about what the server had to correct. */
  corrections: string[];
}

/**
 * Folds the model's proposed update into the current state under policy:
 * a checkpoint never moves backwards or jumps, help never deepens by more than
 * one level per turn, and the phase must follow an allowed edge.
 */
export function applyTutorUpdate(
  current: TutorSessionState,
  response: TutorResponse,
  checkpointCount: number,
): StateTransitionResult {
  const corrections: string[] = [];
  const proposed = response.stateUpdate;

  const solutionMode = deriveSolutionMode(
    current.solutionMode,
    response.assessment.intent,
    response.teacher.move === "guided_solution_step" && current.solutionMode === "guided",
  );

  let phase = proposed.phase;
  if (!isTransitionAllowed(current.phase, phase)) {
    corrections.push(`phase:${current.phase}->${phase}`);
    phase = solutionMode === "withheld" ? current.phase : "walkthrough";
    if (!isTransitionAllowed(current.phase, phase)) {
      phase = current.phase;
    }
  }

  if (solutionMode !== "withheld" && phase === "orient") {
    phase = "walkthrough";
  }

  const maxCheckpoint = Math.max(0, checkpointCount - 1);
  let checkpointIndex = Math.min(proposed.checkpointIndex, maxCheckpoint);
  if (checkpointIndex < current.checkpointIndex) {
    corrections.push("checkpoint:backwards");
    checkpointIndex = current.checkpointIndex;
  }
  if (checkpointIndex > current.checkpointIndex + 1) {
    corrections.push("checkpoint:jump");
    checkpointIndex = current.checkpointIndex + 1;
  }

  let hintDepth = clampHintDepth(proposed.hintDepth);
  if (hintDepth > current.hintDepth + 1) {
    corrections.push("hint:jump");
    hintDepth = clampHintDepth(current.hintDepth + 1);
  }

  const advanced = checkpointIndex > current.checkpointIndex;
  const attemptsAtCheckpoint = advanced
    ? 0
    : Math.min(50, Math.max(current.attemptsAtCheckpoint + 1, proposed.attemptsAtCheckpoint));

  const demonstratedIdeas = mergeCapped(
    current.demonstratedIdeas,
    proposed.demonstratedIdeasToAdd,
    24,
  );

  const activeMisconceptions = mergeCapped(
    current.activeMisconceptions,
    proposed.misconceptionsToAdd,
    24,
  );

  return {
    state: {
      phase,
      checkpointIndex,
      hintDepth,
      attemptsAtCheckpoint,
      solutionMode,
      conceptCueRecognised: current.conceptCueRecognised || proposed.conceptCueRecognised,
      demonstratedIdeas,
      activeMisconceptions,
      maxHelpUsed: Math.max(current.maxHelpUsed, hintDepth),
    },
    corrections,
  };
}

function mergeCapped(existing: string[], additions: string[], cap: number): string[] {
  const merged = [...existing];
  for (const addition of additions) {
    const trimmed = addition.trim();
    if (trimmed && !merged.includes(trimmed)) {
      merged.push(trimmed);
    }
  }
  return merged.slice(-cap);
}

/**
 * Section 17 — what the device remembers once a question is finished. It takes
 * the stored session fields so a restored session can still produce a record.
 */
export function buildLearningRecord(
  concept: { conceptId: string; conceptName: string; triggerCue: string; subject: Subject },
  state: TutorSessionState,
  transferOutcome: ConceptLearningRecord["transferOutcome"],
): ConceptLearningRecord {
  const reflectionQuality: ConceptLearningRecord["reflectionQuality"] = state.conceptCueRecognised
    ? "clear"
    : state.maxHelpUsed >= 3
      ? "unclear"
      : "partial";

  return {
    conceptId: concept.conceptId,
    conceptName: concept.conceptName,
    subject: concept.subject,
    triggerCue: concept.triggerCue,
    maxHintDepth: state.maxHelpUsed,
    reflectionQuality,
    transferOutcome,
    lastSeenAt: new Date().toISOString(),
  };
}
