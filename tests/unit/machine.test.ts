import { describe, expect, it } from "vitest";
import {
  applyTutorUpdate,
  buildLearningRecord,
  createInitialState,
  deriveSolutionMode,
  isRevealPermitted,
  isTransitionAllowed,
} from "@/lib/session/machine";
import { makeAnalysis, makeState, makeTutorResponse } from "../helpers/factories";

const CHECKPOINTS = 3;

describe("createInitialState", () => {
  it("starts at orientation when the transcription is trusted", () => {
    expect(createInitialState(makeAnalysis()).phase).toBe("orient");
  });

  it("stops for confirmation when the transcription is uncertain", () => {
    expect(createInitialState(makeAnalysis({ needsConfirmation: true })).phase).toBe("confirm");
  });

  it("withholds the solution until the student asks", () => {
    expect(createInitialState(makeAnalysis()).solutionMode).toBe("withheld");
  });
});

describe("isTransitionAllowed", () => {
  it.each([
    ["confirm", "orient"],
    ["orient", "attempt"],
    ["attempt", "coach"],
    ["coach", "walkthrough"],
    ["walkthrough", "reflect"],
    ["reflect", "transfer"],
    ["transfer", "complete"],
  ] as const)("allows %s -> %s", (from, to) => {
    expect(isTransitionAllowed(from, to)).toBe(true);
  });

  it.each([
    ["orient", "reflect"],
    ["orient", "complete"],
    ["walkthrough", "orient"],
    ["complete", "coach"],
  ] as const)("rejects %s -> %s", (from, to) => {
    expect(isTransitionAllowed(from, to)).toBe(false);
  });
});

describe("deriveSolutionMode", () => {
  it("leaves the mode alone for an ordinary attempt", () => {
    expect(deriveSolutionMode("withheld", "attempt", false)).toBe("withheld");
  });

  it("moves to guided the moment the student asks, with no waiting period", () => {
    expect(deriveSolutionMode("withheld", "request_solution", false)).toBe("guided");
  });

  it("honours an explicit request for the whole solution immediately", () => {
    expect(deriveSolutionMode("withheld", "request_solution", true)).toBe("fullyRequested");
  });

  it("escalates on a second request", () => {
    expect(deriveSolutionMode("guided", "request_solution", false)).toBe("fullyRequested");
  });

  it("never tightens back up", () => {
    expect(deriveSolutionMode("fullyRequested", "attempt", false)).toBe("fullyRequested");
    expect(deriveSolutionMode("guided", "stuck", false)).toBe("guided");
  });
});

describe("isRevealPermitted", () => {
  it("blocks a reveal while help is still being withheld", () => {
    expect(isRevealPermitted("withheld", "coach")).toBe(false);
  });

  it("allows a reveal once the student has asked", () => {
    expect(isRevealPermitted("guided", "walkthrough")).toBe(true);
  });

  it("allows a reveal after the student has reached the answer", () => {
    expect(isRevealPermitted("withheld", "reflect")).toBe(true);
  });
});

describe("applyTutorUpdate", () => {
  it("advances one checkpoint and resets the attempt counter", () => {
    const current = makeState({ phase: "attempt", attemptsAtCheckpoint: 3 });
    const response = makeTutorResponse({
      teacher: { move: "confirm_and_advance" },
      stateUpdate: { phase: "attempt", checkpointIndex: 1, hintDepth: 0 },
    });

    const { state } = applyTutorUpdate(current, response, CHECKPOINTS);

    expect(state.checkpointIndex).toBe(1);
    expect(state.attemptsAtCheckpoint).toBe(0);
  });

  it("refuses a backwards checkpoint", () => {
    const current = makeState({ checkpointIndex: 2 });
    const response = makeTutorResponse({ stateUpdate: { checkpointIndex: 0 } });

    const { state, corrections } = applyTutorUpdate(current, response, CHECKPOINTS);

    expect(state.checkpointIndex).toBe(2);
    expect(corrections).toContain("checkpoint:backwards");
  });

  it("refuses a checkpoint jump", () => {
    const current = makeState({ checkpointIndex: 0 });
    const response = makeTutorResponse({ stateUpdate: { checkpointIndex: 2 } });

    const { state, corrections } = applyTutorUpdate(current, response, CHECKPOINTS);

    expect(state.checkpointIndex).toBe(1);
    expect(corrections).toContain("checkpoint:jump");
  });

  it("deepens help by at most one level per turn", () => {
    const current = makeState({ hintDepth: 1 });
    const response = makeTutorResponse({ stateUpdate: { hintDepth: 4 } });

    const { state, corrections } = applyTutorUpdate(current, response, CHECKPOINTS);

    expect(state.hintDepth).toBe(2);
    expect(corrections).toContain("hint:jump");
  });

  it("lets help come back down when the student shows understanding", () => {
    const current = makeState({ hintDepth: 3, maxHelpUsed: 3 });
    const response = makeTutorResponse({ stateUpdate: { hintDepth: 1 } });

    const { state } = applyTutorUpdate(current, response, CHECKPOINTS);

    expect(state.hintDepth).toBe(1);
    // The high-water mark is what the learning record remembers.
    expect(state.maxHelpUsed).toBe(3);
  });

  it("rejects an illegal phase transition and stays put", () => {
    const current = makeState({ phase: "orient" });
    const response = makeTutorResponse({ stateUpdate: { phase: "complete" } });

    const { state, corrections } = applyTutorUpdate(current, response, CHECKPOINTS);

    expect(state.phase).toBe("orient");
    expect(corrections.some((entry) => entry.startsWith("phase:"))).toBe(true);
  });

  it("opens the walkthrough when the student asks for the solution", () => {
    const current = makeState({ phase: "coach" });
    const response = makeTutorResponse({
      assessment: { intent: "request_solution" },
      teacher: { move: "guided_solution_step" },
      stateUpdate: { phase: "walkthrough" },
    });

    const { state } = applyTutorUpdate(current, response, CHECKPOINTS);

    expect(state.solutionMode).toBe("guided");
    expect(state.phase).toBe("walkthrough");
  });

  it("keeps the checkpoint inside the plan", () => {
    const current = makeState({ checkpointIndex: 2 });
    const response = makeTutorResponse({ stateUpdate: { checkpointIndex: 9 } });

    const { state } = applyTutorUpdate(current, response, CHECKPOINTS);

    expect(state.checkpointIndex).toBe(CHECKPOINTS - 1);
  });

  it("accumulates demonstrated ideas without duplicating them", () => {
    const current = makeState({ demonstratedIdeas: ["Located the coefficients"] });
    const response = makeTutorResponse({
      stateUpdate: { demonstratedIdeasToAdd: ["Located the coefficients", "Applied D=0"] },
    });

    const { state } = applyTutorUpdate(current, response, CHECKPOINTS);

    expect(state.demonstratedIdeas).toEqual(["Located the coefficients", "Applied D=0"]);
  });
});

describe("buildLearningRecord", () => {
  const concept = {
    conceptId: "algebra.quadratic.repeated-root",
    conceptName: "Repeated-root condition",
    triggerCue: "One repeated real root activates D=0.",
  };

  it("records a clear reflection when the student stated the cue", () => {
    const record = buildLearningRecord(
      concept,
      makeState({ conceptCueRecognised: true, maxHelpUsed: 1 }),
      "independent",
    );

    expect(record.reflectionQuality).toBe("clear");
    expect(record.maxHintDepth).toBe(1);
    expect(record.transferOutcome).toBe("independent");
  });

  it("records an unclear reflection when heavy help was needed", () => {
    const record = buildLearningRecord(concept, makeState({ maxHelpUsed: 4 }), "notTried");
    expect(record.reflectionQuality).toBe("unclear");
  });
});
