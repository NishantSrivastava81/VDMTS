import { describe, expect, it } from "vitest";
import { buildPlanReviewInstructions, buildQuestionAnalysisInstructions, buildTutorInstructions } from "@/lib/ai/prompts";
import { SUBJECTS } from "@/lib/ai/schemas";
import { subjectProfile } from "@/lib/ai/subjects";
import { buildLearningRecord } from "@/lib/session/machine";
import { makeState } from "../helpers/factories";

describe("subject profiles", () => {
  it("covers every declared subject", () => {
    for (const subject of SUBJECTS) {
      expect(subjectProfile(subject).label).toBeTruthy();
    }
  });

  it("keeps Mathematics wording unchanged", () => {
    const instructions = buildQuestionAnalysisInstructions("english", "mathematics");

    expect(instructions).toMatch(/IIT-JEE Mathematics teacher/);
    expect(instructions).toMatch(/photograph of JEE Mathematics/);
    expect(instructions).not.toMatch(/Physics/);
  });

  it("switches the teacher identity for Physics", () => {
    const instructions = buildQuestionAnalysisInstructions("english", "physics");

    expect(instructions).toMatch(/IIT-JEE Physics teacher/);
    expect(instructions).toMatch(/photograph of JEE Physics/);
  });

  it("asks Physics for the principle and the modelling decision, not just the law", () => {
    const instructions = buildQuestionAnalysisInstructions("english", "physics");

    expect(instructions).toMatch(/modelling\s+decision/i);
    expect(instructions).toMatch(/system\s+boundary/i);
    expect(instructions).toMatch(/frame/i);
    // Naming only the law is the failure mode this guards against.
    expect(instructions).toMatch(/Naming only the law is not enough/i);
  });

  it("tells Physics to carry units and describe a diagram in words", () => {
    const instructions = buildQuestionAnalysisInstructions("english", "physics");

    expect(instructions).toMatch(/unit/i);
    expect(instructions).toMatch(/describe in one line what the student should draw/i);
    expect(instructions).toMatch(/Do not attempt to draw it/i);
  });

  it("rejects a question from another subject", () => {
    const instructions = buildQuestionAnalysisInstructions("english", "physics");

    expect(instructions).toMatch(/isExpectedSubject to false/);
    expect(instructions).toMatch(/another JEE subject counts as false/i);
  });

  it("carries the subject into the review and tutor instructions", () => {
    expect(buildPlanReviewInstructions("english", "physics")).toMatch(/IIT-JEE Physics teacher/);
    expect(buildTutorInstructions(makeState(), "english", "physics")).toMatch(
      /IIT-JEE Physics teacher/,
    );
  });

  it("still works with Hinglish", () => {
    const instructions = buildQuestionAnalysisInstructions("hinglish", "physics");

    expect(instructions).toMatch(/IIT-JEE Physics teacher/);
    expect(instructions).toMatch(/Hinglish/);
  });
});

describe("learning records", () => {
  it("records which subject a concept belongs to", () => {
    const record = buildLearningRecord(
      {
        conceptId: "physics.newton.second-law-in-a-frame",
        conceptName: "Newton's second law in a chosen frame",
        triggerCue: "A massless string over a frictionless pulley.",
        subject: "physics",
      },
      makeState(),
      "notTried",
    );

    // Physics and Maths concepts must never be offered to each other for matching.
    expect(record.subject).toBe("physics");
  });
});
